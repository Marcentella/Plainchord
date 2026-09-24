import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { importer, midi, Settings } from "@coderline/alphatab";
import { scoreToTab, importGuitarProFile } from "./importGuitarPro.ts";
import { parseTab } from "./parseTab.ts";
import { groupIntoBars } from "./groupIntoBars.ts";
import { buildTimeline, totalDurationSeconds } from "./playhead.ts";
import { tabToScore, createPlaybackSettings } from "./tabToScore.ts";
import type { Tab } from "./tab.ts";

// The assumption Step 2 of plans/synth_blueprint.md rests on: the playhead's
// timeline (lib/playhead.ts, built from Tab durations) and the audio
// (tabToScore -> MIDI) agree on when every beat starts, so the playhead can be
// driven by the synth's currentTick. If these drift, the pill and the sound
// drift with them.

const TICKS_PER_QUARTER = 960;
// Float noise only: the audio is built from the Tab's own ticks, so any real
// difference is a whole tick (0.5 ms at 120 BPM) and must fail.
const TOLERANCE_SECONDS = 1e-6;

function assertInSync(tab: Tab, bpm: number) {
  const score = tabToScore(tab, { tempo: bpm });
  const file = new midi.MidiFile();
  const generator = new midi.MidiFileGenerator(score, createPlaybackSettings(), new midi.AlphaSynthMidiFileHandler(file));
  generator.generate();

  // The synth clock only equals tick / 960 * 60 / bpm if this is the one tempo.
  const tempos = file.events.filter((e) => e.type === midi.MidiEventType.TempoChange) as unknown as midi.TempoChangeEvent[];
  assert.deepEqual(
    tempos.map((e) => [e.tick, e.beatsPerMinute]),
    [[0, bpm]],
  );
  const toSeconds = (tick: number) => (tick / TICKS_PER_QUARTER) * (60 / bpm);

  const timeline = buildTimeline(groupIntoBars(tab.beats), bpm);
  // Beats with notes are the ones that emit a NoteOn; rests are covered by the
  // total-length check (a rest that drifted would shift every later beat).
  const beats = groupIntoBars(tab.beats).flat();
  // Deduped like the NoteOn ticks: a Guitar Pro grace note can come through as
  // a 0-length beat sharing its start with the next one.
  const expected = [...new Set(timeline.filter((_, i) => beats[i].notes.length > 0).map((e) => e.startSeconds))];
  const noteOnTicks = [
    ...new Set(file.events.filter((e) => e.type === midi.MidiEventType.NoteOn).map((e) => e.tick)),
  ].sort((a, b) => a - b);
  const actual = noteOnTicks.map(toSeconds);

  assert.equal(actual.length, expected.length, "one NoteOn start per sounding beat start");
  const firstDrift = expected.findIndex((s, i) => Math.abs(s - actual[i]) > TOLERANCE_SECONDS);
  assert.equal(
    firstDrift,
    -1,
    firstDrift === -1 ? "" : `sounding beat #${firstDrift}: playhead ${expected[firstDrift]}s, audio ${actual[firstDrift]}s`,
  );

  const masterBars = generator.tickLookup.masterBars;
  const songEnd = toSeconds(masterBars[masterBars.length - 1].end);
  assert.ok(
    Math.abs(songEnd - totalDurationSeconds(timeline)) <= TOLERANCE_SECONDS,
    `length: playhead ${totalDurationSeconds(timeline)}s, audio ${songEnd}s`,
  );
}

function tabFromTex(tex: string): Tab {
  const result = scoreToTab(importer.ScoreLoader.loadAlphaTex(tex, new Settings()));
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  return result.tab;
}

test("plain-text tab (implicit quarters, several bars, a chord) at 97 BPM", () => {
  const parsed = parseTab(
    [
      "e|--0-----3--|--------0--|",
      "B|--1--------|--3--------|",
      "G|--0--------|-----------|",
      "D|--2--------|-----------|",
      "A|--3--------|-----5-----|",
      "E|-----------|-----------|",
    ].join("\n"),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assertInSync(parsed.tab, 97);
});

test("Guitar Pro path: mixed durations and rests", () => assertInSync(tabFromTex(":4 3.1 :8 5.1 r :2 7.1 | :16 3.1 5.1 r 7.1 :4 r 5.1 :2 3.1"), 120));
test("Guitar Pro path: dotted notes", () => assertInSync(tabFromTex(":4 3.1 { d } :8 5.1 :2 7.1 { d } | :8 3.1 { dd } :32 5.1 :2 r :4 7.1"), 133));
test("Guitar Pro path: triplets", () => assertInSync(tabFromTex(":8 { tu 3 } 3.1 4.1 5.1 :4 7.1 :8 { tu 3 } 3.1 r 5.1 :4 7.1"), 90));
test("Guitar Pro path: quintuplets and sextuplets", () =>
  assertInSync(tabFromTex(":16 { tu 5 } 3.1 4.1 5.1 6.1 7.1 :4 3.1 :2 5.1 | :16 { tu 6 } 3.1 4.1 5.1 6.1 7.1 8.1 :4 3.1 :2 5.1"), 110));
test("Guitar Pro path: a 7/8 bar then a 3/4 bar", () => assertInSync(tabFromTex("\\ts 7 8\n.\n:8 3.1 5.1 7.1 3.1 5.1 7.1 3.1 | \\ts 3 4 :4 3.1 5.1 7.1"), 140));
test("Guitar Pro path: grace notes", () => assertInSync(tabFromTex(":4 3.1 { gr } 5.1 7.1 r r | 3.1 { gr ob } 5.1 7.1 r r"), 100));
test("Guitar Pro path: bars whose tick count no power-of-2 time signature spells", () => {
  // A 16th septuplet is 960/7 ticks, truncated to 137, so each of these bars
  // is 3839 ticks, not 3840. Rounding a bar to its nearest meter would start
  // every following bar one tick later than the playhead expects.
  const tab = tabFromTex(":16 { tu 7 } 3.1 4.1 5.1 6.1 7.1 8.1 9.1 :4 3.1 :2 5.1 | ".repeat(3) + ":4 3.1");
  const barTicks = tab.beats.filter((b) => b.bar === 0).reduce((sum, b) => sum + (b.duration ?? 1) * TICKS_PER_QUARTER, 0);
  assert.equal(Math.round(barTicks), 3839);
  assertInSync(tab, 120);
});

const RATA_BLANCA = "public/Rata Blanca - Porque Es Tan Dificil Amar.gp4";
test("a real full song: Rata Blanca .gp4", { skip: !existsSync(RATA_BLANCA) && "fixture not present" }, async () => {
  const result = await importGuitarProFile(new Uint8Array(readFileSync(RATA_BLANCA)));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assertInSync(result.tab, result.tab.tempo ?? 120);
});
