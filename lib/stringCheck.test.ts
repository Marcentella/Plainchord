import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Chord } from "./chords.ts";
import { DETECTION } from "./chordDetection.ts";
import { checkStrings, type StringResult } from "./stringCheck.ts";
import { SAMPLE_RATE, synthFrets } from "./testAudio.ts";

const LIBRARY: Chord[] = JSON.parse(readFileSync(new URL("../data/chords.json", import.meta.url), "utf8"));
const byName = (name: string) => LIBRARY.find((c) => c.name === name)!;
const SIZE = DETECTION.fftSize;
const PROBLEMS: StringResult[] = ["missing", "open", "ringsButShouldnt"];
/** Strings other than `except` flagged as a problem: one string's mistake must not show up on another. */
const flaggedBesides = (results: StringResult[], except: number) =>
  results.flatMap((r, s) => (s !== except && PROBLEMS.includes(r) ? [`${6 - s}:${r}`] : []));

/** Tone colors: the detector tests' bright 1/h, a duller one, and a stiff string with sharp upper harmonics. */
const TONES: { name: string; amp?: (h: number) => number; inharmonicity?: number }[] = [
  { name: "1/h" },
  { name: "dull", amp: (h) => 0.1 * 0.6 ** (h - 1) },
  { name: "stiff", inharmonicity: 1e-4 },
];

test("a correct strum of every library chord flags no string", () => {
  for (const tone of TONES) {
    for (const chord of LIBRARY) {
      const samples = synthFrets(chord.frets, SIZE, 1, tone.amp, tone.inharmonicity);
      const results = checkStrings(chord, samples, SAMPLE_RATE);
      const flagged = results.flatMap((r, s) => (PROBLEMS.includes(r) ? [`${6 - s}:${r}`] : []));
      assert.deepEqual(flagged, [], `${chord.name} (${tone.name}) flagged ${flagged.join(", ")}`);
    }
  }
});

test("a string left out never reads as ringing, and how often it can be told apart", (t) => {
  let missing = 0;
  let unknown = 0;
  for (const chord of LIBRARY) {
    chord.frets.forEach((fret, s) => {
      if (fret < 0) return;
      const frets = chord.frets.map((f, i) => (i === s ? -1 : f));
      const results = checkStrings(chord, synthFrets(frets, SIZE), SAMPLE_RATE);
      const result = results[s];
      assert.ok(result === "missing" || result === "unknown", `${chord.name} without string ${6 - s} read ${result}`);
      assert.deepEqual(flaggedBesides(results, s), [], `${chord.name} without string ${6 - s}`);
      if (result === "missing") missing++;
      else unknown++;
    });
  }
  // How much of the library this method can see: a thesis number, not a pass/fail.
  t.diagnostic(`silenced strings detected: ${missing} of ${missing + unknown} (${unknown} share every harmonic with another string)`);
  assert.ok(missing > unknown, "most silenced strings should be detectable");
});

test("a fretted string ringing open never reads as pressed", (t) => {
  let open = 0;
  let total = 0;
  for (const chord of LIBRARY) {
    chord.frets.forEach((fret, s) => {
      if (fret <= 0) return;
      const frets = chord.frets.map((f, i) => (i === s ? 0 : f));
      const results = checkStrings(chord, synthFrets(frets, SIZE), SAMPLE_RATE);
      const result = results[s];
      assert.notEqual(result, "sounds", `${chord.name} with string ${6 - s} open read sounds`);
      assert.deepEqual(flaggedBesides(results, s), [], `${chord.name} with string ${6 - s} open`);
      total++;
      if (result === "open") open++;
    });
  }
  t.diagnostic(`lifted fingers named as "open": ${open} of ${total}`);
});

test("C with the B string open (finger 1 lifted) reads as open, not as C", () => {
  const C = byName("C"); // x32010
  const results = checkStrings(C, synthFrets([-1, 3, 2, 0, 0, 0], SIZE), SAMPLE_RATE);
  assert.equal(results[4], "open");
  // The open B also sits on the silent low E's 3rd harmonic: that must not read as the low E strummed.
  assert.equal(results[0], "silent");
});

test("D with the two low strings strummed: both ring but shouldn't", () => {
  const D = byName("D"); // xx0232
  const results = checkStrings(D, synthFrets([0, 0, 0, 2, 3, 2], SIZE), SAMPLE_RATE);
  assert.equal(results[0], "ringsButShouldnt");
  assert.equal(results[1], "ringsButShouldnt");
  // Played right, they're quiet.
  const clean = checkStrings(D, synthFrets(D.frets, SIZE), SAMPLE_RATE);
  assert.equal(clean[0], "silent");
  assert.equal(clean[1], "silent");
});
