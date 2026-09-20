import { test } from "node:test";
import assert from "node:assert/strict";
import { importer, Settings } from "@coderline/alphatab";
import { scoreToTab, importGuitarProFile } from "./importGuitarPro.ts";

// Built via alphaTab's own alphaTex import format rather than a hand-crafted
// binary .gp3/4/5/x fixture — it produces the exact same Score/Staff/Bar/
// Voice/Beat/Note shape loadScoreFromBytes would, and is far easier to get
// right (and to read) than raw Guitar Pro bytes. See lib/importGuitarPro.ts's
// own note on why scoreToTab is split out to make this possible.
function scoreFromTex(tex: string) {
  return importer.ScoreLoader.loadAlphaTex(tex, new Settings());
}

test("plain notes across two bars", () => {
  const result = scoreToTab(scoreFromTex("3.1 5.1 | 3.1 5.1"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.tab.beats.length, 4);
  assert.deepEqual(
    result.tab.beats.map((b) => [b.bar, b.notes[0].string, b.notes[0].fret]),
    [
      [0, 5, 3],
      [0, 5, 5],
      [1, 5, 3],
      [1, 5, 5],
    ],
  );
  assert.equal(result.unmappedTechniques, 0);
});

test("a hammer-on tags the arriving (higher-fret) note", () => {
  const result = scoreToTab(scoreFromTex("3.1 { h } 5.1"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.beats[0].notes[0].techniques, []);
  assert.deepEqual(result.tab.beats[1].notes[0].techniques, ["h"]);
});

test("a pull-off (descending) tags the arriving note as 'p', not 'h'", () => {
  const result = scoreToTab(scoreFromTex("5.1 { h } 3.1"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.beats[1].notes[0].techniques, ["p"]);
});

test("a legato slide tags the target note", () => {
  const result = scoreToTab(scoreFromTex("3.1 { sl } 5.1"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.beats[0].notes[0].techniques, []);
  assert.deepEqual(result.tab.beats[1].notes[0].techniques, ["/"]);
});

test("a full-step bend computes bendAmount 4 and lands bendTo on the real target fret", () => {
  // bendPoints (0, 4): 4 quarter-tones above fret 7's own pitch -> a whole
  // step -> 2 semitones -> fret 9. See lib/importGuitarPro.ts's
  // bendAmountFor, verified against a real 4,398-bend corpus.
  const result = scoreToTab(scoreFromTex("7.1 { b (0 4) }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const note = result.tab.beats[0].notes[0];
  assert.deepEqual(note.techniques, ["b"]);
  assert.equal(note.bendAmount, 4);
  assert.equal(note.bendTo, 9);
});

test("a quarter-tone bend computes bendAmount but leaves bendTo unset -- no whole fret to land on", () => {
  // bendPoints (0, 1): a quarter step, half a semitone -- real, not rare
  // (206 of 4,398 real bends in the corpus), but there's no fractional fret.
  const result = scoreToTab(scoreFromTex("7.1 { b (0 1) }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const note = result.tab.beats[0].notes[0];
  assert.equal(note.bendAmount, 1);
  assert.equal(note.bendTo, undefined);
});

test("a release (arrives already bent, releases down) gets bendAmount + bendReleasing, not bendTo", () => {
  // Real shape: [4, 0] -- starts at the previous note's peak, releases to 0.
  // No bendTo: the note's own written fret already IS the landing pitch,
  // there's no separate "target" to point at the way a rising bend has.
  const result = scoreToTab(scoreFromTex("7.1 { b (0 4) } | 5.1 { b release (4 0) }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const releaseNote = result.tab.beats[1].notes[0];
  assert.deepEqual(releaseNote.techniques, ["b"]);
  assert.equal(releaseNote.bendAmount, 4);
  assert.equal(releaseNote.bendReleasing, true);
  assert.equal(releaseNote.bendTo, undefined);
});

test("a prebend-release (arrives at a peak matching prior context, releases to its own new fret) is treated the same as a plain release", () => {
  // Real shape: [4, 0] on a DIFFERENT fret than the previous note (10, not
  // 12) -- the peak still matches whatever the previous note left off at in
  // absolute pitch, this note just happens to be written on a new fret.
  const result = scoreToTab(scoreFromTex("12.1 { b (0 4) } | 10.1 { b prebendrelease (4 0) }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const note = result.tab.beats[1].notes[0];
  assert.equal(note.fret, 10);
  assert.equal(note.bendAmount, 4);
  assert.equal(note.bendReleasing, true);
  assert.equal(note.bendTo, undefined);
});

test("a bend-release (rises then releases within the SAME note) is treated as a plain rising bend to its peak", () => {
  // Real shape: [0, 4, 4, 0] -- self-contained, no cross-note context
  // needed. Doesn't capture the "then releases" part, but the peak it
  // reaches is still accurate, and it's the biggest of the four previously-
  // unhandled types (59 of 4,398 real bends) -- strictly better than the
  // plain "b" tag with nothing.
  const result = scoreToTab(scoreFromTex("7.1 { b bendrelease (0 4 4 0) }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const note = result.tab.beats[0].notes[0];
  assert.equal(note.bendAmount, 4);
  assert.equal(note.bendTo, 9);
  assert.equal(note.bendReleasing, undefined);
});

test("a hold (continues the previous note's bend, nothing changes) gets bendHold, not an amount", () => {
  // Real shape: [4, 4] -- constant, matching wherever the previous note
  // left off. No arrow to draw (nothing moves during this note), so
  // TabRenderer parenthesizes the fret digit instead -- see bendHold.
  const result = scoreToTab(scoreFromTex("7.1 { b (0 4) } | 7.1 { b hold (4 4) }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const holdNote = result.tab.beats[1].notes[0];
  assert.deepEqual(holdNote.techniques, ["b"]);
  assert.equal(holdNote.bendHold, true);
  assert.equal(holdNote.bendAmount, undefined);
  assert.equal(holdNote.bendTo, undefined);
});

test("palm mute maps to PM", () => {
  const result = scoreToTab(scoreFromTex("3.1 { pm }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.beats[0].notes[0].techniques, ["PM"]);
});

test("vibrato maps to ~", () => {
  const result = scoreToTab(scoreFromTex("3.1 { v }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.beats[0].notes[0].techniques, ["~"]);
});

test("pinch harmonic maps to PH", () => {
  const result = scoreToTab(scoreFromTex("3.1 { ph }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.beats[0].notes[0].techniques, ["PH"]);
});

test("a natural harmonic has no glossary symbol yet -- degrades to untagged, counted as unmapped", () => {
  const result = scoreToTab(scoreFromTex("3.1 { nh }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.beats[0].notes[0].techniques, []);
  assert.equal(result.unmappedTechniques, 1);
});

test("an accent has no glossary symbol yet -- counted as unmapped", () => {
  const result = scoreToTab(scoreFromTex("3.1 { ac }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.beats[0].notes[0].techniques, []);
  assert.equal(result.unmappedTechniques, 1);
});

test("staccato has no glossary symbol yet -- counted as unmapped", () => {
  const result = scoreToTab(scoreFromTex("3.1 { st }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.beats[0].notes[0].techniques, []);
  assert.equal(result.unmappedTechniques, 1);
});

test("let-ring has no glossary symbol yet -- counted as unmapped", () => {
  const result = scoreToTab(scoreFromTex("3.1 { lr }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.beats[0].notes[0].techniques, []);
  assert.equal(result.unmappedTechniques, 1);
});

test("a slide-in has no glossary symbol yet -- counted as unmapped", () => {
  const result = scoreToTab(scoreFromTex("3.1 { sib }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.beats[0].notes[0].techniques, []);
  assert.equal(result.unmappedTechniques, 1);
});

test("tremolo picking (a Beat-level effect, invisible to per-note checks) is counted as unmapped", () => {
  const result = scoreToTab(scoreFromTex("3.1 { tp 16 }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.beats[0].notes[0].techniques, []);
  assert.equal(result.unmappedTechniques, 1);
});

test("a second Beat-level effect (slap) is also counted as unmapped", () => {
  const result = scoreToTab(scoreFromTex("3.1 { s }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.unmappedTechniques, 1);
});

test("a Beat-level effect on a multi-note beat (chord) is counted once, not once per note", () => {
  const result = scoreToTab(scoreFromTex("(3.1 5.2) { tp 16 }"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.tab.beats[0].notes.length, 2);
  assert.equal(result.unmappedTechniques, 1);
});

test("a dead note has no fret", () => {
  const result = scoreToTab(scoreFromTex("x.1 5.1"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.beats[0].notes[0], { string: 5, fret: null, techniques: ["x"] });
});

test("a non-6-string staff (4-string bass) is rejected as wrongStringCount", () => {
  const score = scoreFromTex('\\track "Bass"\n\\tuning (G3 D3 A2 E2)\n3.1 5.1');
  const result = scoreToTab(score);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "wrongStringCount");
});

test("title, artist and tempo are read from the score", () => {
  const result = scoreToTab(
    scoreFromTex('\\title "We All Die Young"\n\\artist "Steel Dragons"\n\\tempo 140\n.\n3.1 5.1'),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.tab.title, "We All Die Young");
  assert.equal(result.tab.artist, "Steel Dragons");
  assert.equal(result.tab.tempo, 140);
});

test("blank title/artist (no directive in the source) fall back to undefined, not an empty string", () => {
  const result = scoreToTab(scoreFromTex("3.1 5.1"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.tab.title, undefined);
  assert.equal(result.tab.artist, undefined);
});

test("tuning reads low string to high, as it's conventionally written (\"E A D G B E\"), not the raw high-to-low storage order", () => {
  const result = scoreToTab(scoreFromTex("3.1 5.1"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.tuning, ["E", "A", "D", "G", "B", "E"]);
});

test("a non-standard tuning (drop D) is read in the same low-to-high order", () => {
  const result = scoreToTab(scoreFromTex("\\tuning E4 B3 G3 D3 A2 D2\n.\n3.1 5.1"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.tuning, ["D", "A", "D", "G", "B", "E"]);
});

test("garbage bytes are rejected as corruptFile, not thrown", async () => {
  const result = await importGuitarProFile(new Uint8Array([1, 2, 3, 4, 5]));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "corruptFile");
});
