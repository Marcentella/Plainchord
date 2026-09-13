import { test } from "node:test";
import assert from "node:assert/strict";
import { transitionDifficulty } from "./transitionDifficulty.ts";
import type { Chord } from "./chords.ts";

// Fixtures mirror data/chords.json — inlined so this test has no dependency
// on the "@/*" path alias, which plain `node --test` doesn't resolve.
const E: Chord = { name: "E", frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] };
const E7: Chord = { name: "E7", frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] };
const G: Chord = { name: "G", frets: [3, 2, 0, 0, 0, 3], fingers: [3, 2, 0, 0, 0, 4] };
const D: Chord = { name: "D", frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] };
const Am: Chord = { name: "Am", frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] };
const C: Chord = { name: "C", frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] };

test("transitionDifficulty: same shape plus one finger is facil", () => {
  assert.equal(transitionDifficulty(E, E7), "facil");
});

test("transitionDifficulty: fully different shape and hand position is dificil", () => {
  assert.equal(transitionDifficulty(G, D), "dificil");
});

test("transitionDifficulty: same pair scores the same in either direction", () => {
  assert.equal(transitionDifficulty(Am, C), transitionDifficulty(C, Am));
});
