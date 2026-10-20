import { test } from "node:test";
import assert from "node:assert/strict";
import { isOpenOrSimple, pickDefaultIndex, suggestFrom } from "./chordRank.ts";
import type { Chord } from "./chords.ts";

// Fixtures mirror data/chords.json — inlined so this test has no dependency
// on the "@/*" path alias, which plain `node --test` doesn't resolve.
const E: Chord = { name: "E", frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] };
const Em: Chord = { name: "Em", frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] };
const E7: Chord = { name: "E7", frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] };
const Cmaj7: Chord = { name: "Cmaj7", frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0] };
// Same finger (1) on two strings at once -> requires a barre despite a plain name.
const barreG: Chord = { name: "G", frets: [3, 1, 0, 0, 1, 3], fingers: [3, 1, 0, 0, 1, 4] };
const C: Chord = { name: "C", frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] };
const C7: Chord = { name: "C7", frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] };

test("isOpenOrSimple: plain major/minor triads are simple", () => {
  assert.equal(isOpenOrSimple(E), true);
  assert.equal(isOpenOrSimple(Em), true);
});

test("isOpenOrSimple: 7th/maj7 qualities are not simple", () => {
  assert.equal(isOpenOrSimple(E7), false);
  assert.equal(isOpenOrSimple(Cmaj7), false);
});

test("isOpenOrSimple: a barre demotes an otherwise-plain name", () => {
  assert.equal(isOpenOrSimple(barreG), false);
});

test("pickDefaultIndex: skips a leading exact match for what's already typed", () => {
  assert.equal(pickDefaultIndex([C, C7], "c"), 1);
});

test("pickDefaultIndex: falls back to 0 when the exact match is the only option", () => {
  assert.equal(pickDefaultIndex([C], "c"), 0);
});

test("pickDefaultIndex: no exact match in the list -> first result", () => {
  assert.equal(pickDefaultIndex([C7], "c"), 0);
});

const D: Chord = { name: "D", frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] };
const Dm: Chord = { name: "Dm", frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] };
const LIBRARY = [E, Em, E7, Cmaj7, C, C7, D, Dm];
const names = (chords: Chord[]) => chords.map((c) => c.name);

test("suggestFrom: in Latin, 'd' only offers Do chords (C), never D", () => {
  assert.deepEqual(names(suggestFrom(LIBRARY, "d", "latin")).sort(), ["Do", "Do7", "Domaj7"]);
});

test("suggestFrom: in Latin, 're' offers the D family under Latin names", () => {
  assert.deepEqual(names(suggestFrom(LIBRARY, "re", "latin")), ["Re", "Rem"]);
});

test("suggestFrom: in American, 'd' offers D chords and nothing named Do", () => {
  assert.deepEqual(names(suggestFrom(LIBRARY, "d", "american")), ["D", "Dm"]);
});

test("suggestFrom: simple voicings rank first in either notation", () => {
  assert.deepEqual(names(suggestFrom(LIBRARY, "mi", "latin")), ["Mi", "Mim", "Mi7"]);
});
