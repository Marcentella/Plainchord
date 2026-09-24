import { test } from "node:test";
import assert from "node:assert/strict";
import { importer, midi, model, Settings } from "@coderline/alphatab";
import { scoreToTab } from "./importGuitarPro.ts";
import { parseTab } from "./parseTab.ts";
import { tabToScore, createPlaybackSettings, playbackProgramFor } from "./tabToScore.ts";
import type { Tab } from "./tab.ts";

// alphaTex scores are the reference here for the same reason importGuitarPro's
// tests use them: alphaTab builds them itself, so a Score converted back from
// our Tab must generate the same MIDI as the original for tabToScore to be
// faithful (see the round-trip tests below).
function scoreFromTex(tex: string): model.Score {
  return importer.ScoreLoader.loadAlphaTex(tex, new Settings());
}

function generateMidi(score: model.Score): midi.MidiFile {
  const file = new midi.MidiFile();
  new midi.MidiFileGenerator(score, createPlaybackSettings(), new midi.AlphaSynthMidiFileHandler(file)).generate();
  return file;
}

type Summary = { tick: number; type: number; channel?: number; noteKey?: number; noteVelocity?: number; value?: number };

/** Every event that decides what is heard and when, as plain comparable data. Program changes are left out — the source of the program differs by design (see the program test). */
function summarize(score: model.Score): Summary[] {
  return generateMidi(score)
    .events.filter((e) => e.type !== midi.MidiEventType.ProgramChange)
    .map((e) => {
      const f = e as unknown as Record<string, number | undefined>;
      return JSON.parse(
        JSON.stringify({ tick: f.tick, type: f.type, channel: f.channel, noteKey: f.noteKey, noteVelocity: f.noteVelocity, value: f.value }),
      ) as Summary;
    });
}

function noteOns(score: model.Score): { tick: number; key: number }[] {
  return generateMidi(score)
    .events.filter((e) => e.type === midi.MidiEventType.NoteOn)
    .map((e) => ({ tick: e.tick, key: (e as unknown as { noteKey: number }).noteKey }));
}

/** alphaTex -> Tab (the Guitar Pro import path) -> Score, compared as MIDI against the alphaTex Score itself. */
function assertRoundTrips(tex: string) {
  const original = scoreFromTex(tex);
  const result = scoreToTab(original);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const rebuilt = tabToScore(result.tab);
  assert.deepEqual(summarize(rebuilt), summarize(original));
}

const isBend = (e: Summary) => e.type === midi.MidiEventType.PerNotePitchBend;

/** Final bend value per note, in event order: where each bend ends up, whatever its shape. */
function bendTargets(events: Summary[]): number[] {
  const last = new Map<string, number>();
  for (const e of events.filter(isBend)) last.set(`${e.channel}:${e.noteKey}`, e.value!);
  return [...last.values()];
}

/**
 * Like assertRoundTrips, but for bends: tabToScore deliberately reshapes them
 * (a quick rise, then hold — see BEND_RISE_SECONDS), so only everything else
 * and each bend's destination must match alphaTab's straight-line original.
 */
function assertRoundTripsExceptBendShape(tex: string) {
  const original = scoreFromTex(tex);
  const result = scoreToTab(original);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const rebuilt = summarize(tabToScore(result.tab));
  const expected = summarize(original);
  assert.deepEqual(
    rebuilt.filter((e) => !isBend(e)),
    expected.filter((e) => !isBend(e)),
  );
  assert.deepEqual(bendTargets(rebuilt), bendTargets(expected));
}

test("open strings in standard tuning play E2 A2 D3 G3 B3 E4", () => {
  const tab: Tab = {
    beats: [0, 1, 2, 3, 4, 5].map((string, position) => ({ position, bar: 0, notes: [{ string, fret: 0, techniques: [] }] })),
  };
  assert.deepEqual(
    noteOns(tabToScore(tab)).map((n) => n.key),
    [40, 45, 50, 55, 59, 64],
  );
});

test("tuningMidi sets the pitch of every string (drop D)", () => {
  const tab: Tab = {
    tuningMidi: [38, 45, 50, 55, 59, 64],
    beats: [0, 1].map((string, position) => ({ position, bar: 0, notes: [{ string, fret: 2, techniques: [] }] })),
  };
  assert.deepEqual(
    noteOns(tabToScore(tab)).map((n) => n.key),
    [40, 47],
  );
});

test("a plain-text tab (no durations, no tempo) plays as evenly spaced quarters at 120 BPM", () => {
  const parsed = parseTab(["e|-----0--0--|", "B|-----------|", "G|-----------|", "D|-----------|", "A|-----------|", "E|--0--------|"].join("\n"));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const ticks = noteOns(tabToScore(parsed.tab)).map((n) => n.tick);
  assert.equal(ticks.length, parsed.tab.beats.length);
  ticks.forEach((tick, i) => assert.equal(tick, i * 960));
});

test("tempo option and tab.tempo both set the tempo, the option winning", () => {
  const tempoOf = (score: model.Score) => score.tempo;
  const tab: Tab = { tempo: 90, beats: [{ position: 0, bar: 0, notes: [{ string: 0, fret: 0, techniques: [] }] }] };
  assert.equal(tempoOf(tabToScore(tab)), 90);
  assert.equal(tempoOf(tabToScore(tab, { tempo: 140 })), 140);
  assert.equal(tempoOf(tabToScore({ beats: tab.beats })), 120);
});

test("the tab's program is the only program the score plays", () => {
  const tab: Tab = { beats: [{ position: 0, bar: 0, notes: [{ string: 0, fret: 0, techniques: [] }] }] };
  const programs = (score: model.Score) =>
    generateMidi(score)
      .events.filter((e) => e.type === midi.MidiEventType.ProgramChange)
      .map((e) => (e as unknown as { program: number }).program);
  assert.deepEqual([...new Set(programs(tabToScore(tab)))], [27]);
  assert.deepEqual([...new Set(programs(tabToScore({ ...tab, program: 30 })))], [30]);
});

test("vibrato uses the tuned 360 tick / 0.5 semitone constants", () => {
  const settings = createPlaybackSettings();
  assert.equal(settings.player.vibrato.noteSlightLength, 360);
  assert.equal(settings.player.vibrato.noteSlightAmplitude, 0.5);
});

test("bars line up: a bar's length follows its beats, not a fixed 4/4", () => {
  // 3 quarters in bar 0, then 2 quarters in bar 1 (both plain-text style).
  const note = { string: 0, fret: 0, techniques: [] };
  const tab: Tab = {
    beats: [
      { position: 0, bar: 0, notes: [note] },
      { position: 1, bar: 0, notes: [note] },
      { position: 2, bar: 0, notes: [note] },
      { position: 3, bar: 1, notes: [note] },
      { position: 4, bar: 1, notes: [note] },
    ],
  };
  assert.deepEqual(
    noteOns(tabToScore(tab)).map((n) => n.tick),
    [0, 960, 1920, 2880, 3840],
  );
});

test("a dotted quarter becomes a dotted quarter beat, not a rounded-off one", () => {
  const tab: Tab = { beats: [{ position: 0, bar: 0, duration: 1.5, notes: [{ string: 0, fret: 0, techniques: [] }] }] };
  const beat = tabToScore(tab).tracks[0].staves[0].bars[0].voices[0].beats[0];
  assert.equal(beat.duration, 4);
  assert.equal(beat.dots, 1);
});

test("an empty tab still builds a score instead of throwing", () => {
  assert.doesNotThrow(() => tabToScore({ beats: [] }));
});

test("round trip: plain notes across bars", () => assertRoundTrips("3.1 5.1 r r | 3.1 5.1 r r"));
test("round trip: a chord", () => assertRoundTrips("(3.1 3.2 3.3) 5.1 r r"));
test("round trip: rests", () => assertRoundTrips("3.1 r 5.1 r"));
test("round trip: slight vibrato", () => assertRoundTrips(":2 3.6 { v } 5.6"));
test("round trip: palm mute", () => assertRoundTrips("3.6 { pm } 3.6 { pm } r r"));
// Not a round trip: Tab keeps no fret for a dead note (it draws a bare "x"), so
// the muted click's pitch comes back as the open string, not the original fret.
test("a dead note still plays, as a dead note", () => {
  const tab: Tab = { beats: [{ position: 0, bar: 0, notes: [{ string: 0, fret: null, techniques: ["x"] }] }] };
  const score = tabToScore(tab);
  assert.equal(score.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0].isDead, true);
  assert.equal(noteOns(score).length, 1);
});
test("round trip: accent", () => assertRoundTrips("3.1 { ac } 5.1 r r"));
test("round trip: hammer-on", () => assertRoundTrips("3.1 { h } 5.1 7.1 r"));
test("round trip: pull-off", () => assertRoundTrips("5.1 { h } 3.1 7.1 r"));
test("round trip: shift slide", () => assertRoundTrips("3.1 { ss } 7.1 r r"));
test("round trip: bend", () => assertRoundTripsExceptBendShape("7.1 { b (0 4) } 5.1 r r"));
test("round trip: half-step bend", () => assertRoundTripsExceptBendShape("7.1 { b (0 2) } 5.1 r r"));
test("round trip: bend then release on the next note", () =>
  assertRoundTripsExceptBendShape("7.1 { b (0 4) } r r r | 5.1 { b release (4 0) } r r r"));
test("round trip: bend then hold", () => assertRoundTripsExceptBendShape("7.1 { b (0 4) } 7.1 { b hold (4 4) } r r"));

test("a bend reaches its target within 0.12 s and holds, however long the note", () => {
  // A half note at 120 BPM (1 s): a straight-line bend would still be climbing until the end.
  const tab: Tab = {
    beats: [{ position: 0, bar: 0, duration: 2, notes: [{ string: 4, fret: 8, techniques: ["b"], bendTo: 10, bendAmount: 4 }] }],
  };
  const bends = summarize(tabToScore(tab, { tempo: 120 })).filter(isBend);
  const target = bends[bends.length - 1].value!;
  const riseTicks = 0.12 * 2 * 960; // 0.12 s at 2 quarters per second
  const firstAtTarget = bends.find((e) => e.value === target)!.tick;
  assert.ok(firstAtTarget <= Math.ceil(riseTicks), `target reached at tick ${firstAtTarget}, expected by ${riseTicks}`);
  assert.ok(bends.filter((e) => e.tick > firstAtTarget).every((e) => e.value === target), "holds at the target");
});
test("round trip: natural harmonic", () => assertRoundTrips("12.1 { nh } 5.1 r r"));
test("round trip: pinch harmonic", () => assertRoundTrips("3.1 { ph } 5.1 r r"));
test("round trip: tap harmonic", () => assertRoundTrips("3.1 { th } 5.1 r r"));
test("round trip: durations (quarters, eighths, triplet)", () => assertRoundTrips(":4 3.1 :8 5.1 5.1 :8 { tu 3 } 3.1 4.1 5.1 :4 7.1"));
test("round trip: a non-4/4 bar", () => assertRoundTrips("\\ts 3 4\n.\n3.1 5.1 7.1 | 3.1 5.1 7.1"));
test("round trip: drop D tuning", () => assertRoundTrips("\\tuning E4 B3 G3 D3 A2 D2\n.\n0.6 2.5 3.4 r"));

test("playbackProgramFor keeps a program the soundfont has and falls back to clean guitar otherwise", () => {
  assert.equal(playbackProgramFor({}), 27); // plain text: no program
  for (const program of [25, 26, 27, 28, 29, 30, 31]) assert.equal(playbackProgramFor({ program }), program);
  // Outside the trimmed soundfont these would play silence.
  for (const program of [0, 24, 32, 33, 127]) assert.equal(playbackProgramFor({ program }), 27);
});

test("a program outside the soundfont never reaches the score", () => {
  const tab: Tab = { program: 33, beats: [{ position: 0, bar: 0, notes: [{ string: 0, fret: 0, techniques: [] }] }] };
  assert.equal(tabToScore(tab).tracks[0].playbackInfo.program, 27);
});
