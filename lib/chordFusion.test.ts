import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Chord } from "./chords.ts";
import { checkChord, type FingerReading } from "./chordFingerCheck.ts";
import { cameraState, fuseStrum, stringIssues } from "./chordFusion.ts";

const LIBRARY: Chord[] = JSON.parse(readFileSync(new URL("../data/chords.json", import.meta.url), "utf8"));
const C = LIBRARY.find((c) => c.name === "C")!;

// C: finger 1 on the B string (index 4) fret 1, finger 2 on D (2) fret 2, finger 3 on A (1) fret 3.
const right: FingerReading[] = [
  { string: 4, fret: 1 },
  { string: 2, fret: 2 },
  { string: 1, fret: 3 },
  null,
];
const secondOnG: FingerReading[] = [right[0], { string: 3, fret: 2 }, right[2], null];
const thirdUnseen: FingerReading[] = [right[0], right[1], null, null];
const secondOnGThirdUnseen: FingerReading[] = [right[0], { string: 3, fret: 2 }, null, null];

test("the reference readings really are C", () => {
  assert.equal(cameraState(checkChord(C, right)), "right");
});

test("camera states", () => {
  assert.equal(cameraState(null), "off");
  assert.equal(cameraState(checkChord(C, secondOnG)), "wrong");
  assert.equal(cameraState(checkChord(C, thirdUnseen)), "unsure");
  // Seen wrong beats unseen: it's a definite mistake.
  assert.equal(cameraState(checkChord(C, secondOnGThirdUnseen)), "wrong");
});

test("the four combinations when the camera can judge", () => {
  assert.deepEqual(fuseStrum(checkChord(C, right), { matches: true }), { kind: "correct" });
  assert.deepEqual(fuseStrum(checkChord(C, right), { matches: false }), { kind: "pressOrMute", issues: [] });
  assert.deepEqual(fuseStrum(checkChord(C, secondOnG), { matches: true }), { kind: "soundsRight" });
  const fix = fuseStrum(checkChord(C, secondOnG), { matches: false });
  assert.equal(fix.kind, "fixFingers");
  assert.equal(fix.kind === "fixFingers" && fix.finger.finger, 2);
  assert.equal(fix.kind === "fixFingers" && fix.finger.status, "wrongString");
});

test("without a usable camera reading, only the sound is judged", () => {
  assert.deepEqual(fuseStrum(null, { matches: true }), { kind: "soundOnly", matches: true, camera: "off", issues: [] });
  assert.deepEqual(fuseStrum(checkChord(C, thirdUnseen), { matches: false }), { kind: "soundOnly", matches: false, camera: "unsure", issues: [] });
});

test("a flagged string overrules a whole-chord match", () => {
  // C with the B string open matches C as a chord (Cmaj7 is a near-twin), but the string check caught it.
  const issues = stringIssues(C, ["silent", "sounds", "sounds", "sounds", "open", "unknown"], null);
  assert.deepEqual(issues, [{ string: 4, kind: "open", finger: 1 }]);
  assert.deepEqual(fuseStrum(checkChord(C, right), { matches: true }, issues), { kind: "pressOrMute", issues });
  assert.deepEqual(fuseStrum(null, { matches: true }, issues), { kind: "soundOnly", matches: false, camera: "off", issues });
});

test("an open string that didn't ring is pinned on the fingertip leaning on it", () => {
  // C's open G (string index 3) silent; finger 2 (on the D string) has drifted toward it.
  const positions = [{ string: 4.1, fret: 0.6 }, { string: 2.6, fret: 1.5 }, { string: 1, fret: 2.5 }, null];
  assert.deepEqual(stringIssues(C, ["silent", "sounds", "sounds", "missing", "sounds", "sounds"], positions), [
    { string: 3, kind: "missing", finger: 2 },
  ]);
  // No camera, or no fingertip near: no culprit named.
  assert.deepEqual(stringIssues(C, ["silent", "sounds", "sounds", "missing", "sounds", "sounds"], null), [
    { string: 3, kind: "missing", finger: null },
  ]);
  // An x string strummed: no finger to blame.
  assert.deepEqual(stringIssues(C, ["ringsButShouldnt", "sounds", "sounds", "sounds", "sounds", "sounds"], positions), [
    { string: 0, kind: "ringsButShouldnt", finger: null },
  ]);
});
