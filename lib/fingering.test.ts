import { test } from "node:test";
import assert from "node:assert/strict";
import { assignFingering, type Position } from "./fingering.ts";

const STANDARD = [40, 45, 50, 55, 59, 64];
const at = (notes: Position[]) => notes.map((n) => [n.string, n.fret]);
const sounds = (n: Position, tuning = STANDARD) => tuning[n.string] + n.fret;

test("assignFingering: C major scale lands in open position, open strings first", () => {
  const scale = [48, 50, 52, 53, 55, 57, 59, 60].map((p) => [p]);
  assert.deepEqual(
    assignFingering(scale).map((beat) => at(beat)[0]),
    [[1, 3], [2, 0], [2, 2], [2, 3], [3, 0], [3, 2], [4, 0], [4, 1]],
  );
});

test("assignFingering: a full open G chord gets its usual shape", () => {
  const [g] = assignFingering([[43, 47, 50, 55, 59, 67]]);
  const frets = [-1, -1, -1, -1, -1, -1];
  for (const n of g) frets[n.string] = n.fret;
  assert.deepEqual(frets, [3, 2, 0, 0, 0, 3]);
});

test("assignFingering: a line up the neck stays in one hand position instead of jumping back", () => {
  // Lowest fret for each note would be e5 e7 e8 e10 then B3: a 7-fret jump
  // at the end. Played in 7th position it never moves.
  const line = [69, 71, 72, 74, 62].map((p) => [p]);
  const placed = assignFingering(line).map((beat) => beat[0]);
  const frets = placed.map((n) => n.fret);
  assert.ok(Math.max(...frets) - Math.min(...frets) <= 4, `frets ${frets} span more than one position`);
  assert.deepEqual(at([placed[4]]), [[3, 7]]);
});

test("assignFingering: every note sounds its pitch, and never two on one string", () => {
  const beats = [[40, 47, 52, 56, 59, 64], [45, 52, 57, 60, 64], [50, 57, 62, 66], [41, 48, 53, 57, 60, 65], [64, 67], [76]];
  const result = assignFingering(beats);
  result.forEach((notes, i) => {
    assert.deepEqual(notes.map((n) => sounds(n)).sort((a, b) => a - b), beats[i]);
    assert.equal(new Set(notes.map((n) => n.string)).size, notes.length);
  });
});

test("assignFingering: rests pass through as empty beats", () => {
  const result = assignFingering([[52], [], [55]]);
  assert.deepEqual(result[1], []);
  assert.equal(result.length, 3);
});

test("assignFingering: pitches no string reaches are dropped", () => {
  assert.deepEqual(assignFingering([[30], [40]]), [[], [{ string: 0, fret: 0 }]]);
  assert.deepEqual(assignFingering([[90]], { maxFret: 20 }), [[]]);
});

test("assignFingering: pitches that can't share the neck keep the bass and top line", () => {
  // F2 only exists on the low E string, same as E2: one of them has to go.
  assert.equal(assignFingering([[40, 41]])[0].length, 1);
  // Seven notes on six strings: the lowest and highest survive.
  const [seven] = assignFingering([[40, 45, 50, 55, 59, 64, 67]]);
  const kept = seven.map((n) => sounds(n));
  assert.equal(seven.length, 6);
  assert.ok(kept.includes(40) && kept.includes(67));
});

test("assignFingering: follows the tab's tuning", () => {
  const dropD = [38, 45, 50, 55, 59, 64];
  assert.deepEqual(assignFingering([[38]], { tuning: dropD }), [[{ string: 0, fret: 0 }]]);
});

test("assignFingering: an empty sequence gives an empty result", () => {
  assert.deepEqual(assignFingering([]), []);
});
