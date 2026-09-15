import { test } from "node:test";
import assert from "node:assert/strict";
import { transitionDifficulty } from "./transitionDifficulty.ts";
import type { Chord } from "./chords.ts";

// Fixtures mirror data/chords.json — inlined so this test has no dependency
// on the "@/*" path alias, which plain `node --test` doesn't resolve.
const E: Chord = { name: "E", frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] };
const Em: Chord = { name: "Em", frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] };
const E7: Chord = { name: "E7", frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] };
const G: Chord = { name: "G", frets: [3, 2, 0, 0, 0, 3], fingers: [3, 2, 0, 0, 0, 4] };
const D: Chord = { name: "D", frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] };
const Am: Chord = { name: "Am", frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] };
const C: Chord = { name: "C", frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] };
const F: Chord = { name: "F", frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1] };
const B: Chord = { name: "B", frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 3, 3, 3, 1] };

test("transitionDifficulty: same shape plus one finger is facil", () => {
  assert.equal(transitionDifficulty(E, E7), "facil");
});

test("transitionDifficulty: different shape but close fretboard positions is not dificil", () => {
  assert.equal(transitionDifficulty(G, D), "media");
});

test("transitionDifficulty: consecutive chords in the default demo progression are not dificil", () => {
  assert.equal(transitionDifficulty(D, Em), "media");
});

test("transitionDifficulty: two barre chords with distant shapes is dificil", () => {
  assert.equal(transitionDifficulty(F, B), "dificil");
});

test("transitionDifficulty: same pair scores the same in either direction", () => {
  assert.equal(transitionDifficulty(Am, C), transitionDifficulty(C, Am));
});
