import { test } from "node:test";
import assert from "node:assert/strict";
import { degreeOf, detectKey, keyChords, keyView } from "./keys.ts";

test("keyView lists a key from its home, as books do", () => {
  assert.deepEqual(keyView(7, false).chords, ["G", "Am", "Bm", "C", "D", "Em"]);
  const aMinor = keyView(0, true);
  assert.deepEqual(aMinor.chords, ["Am", "C", "Dm", "E7", "F", "G"]);
  assert.deepEqual(aMinor.numerals, ["i", "III", "iv", "V7", "VI", "VII"]);
  assert.deepEqual(keyView(7, true).chords, ["Em", "G", "Am", "B7", "C", "D"]);
});

test("keyChords spells each key's seven chords", () => {
  assert.deepEqual(keyChords(0), ["C", "Dm", "Em", "F", "G", "Am", "Bdim"]);
  assert.deepEqual(keyChords(7), ["G", "Am", "Bm", "C", "D", "Em", "F#dim"]);
  assert.deepEqual(keyChords(5), ["F", "Gm", "Am", "Bb", "C", "Dm", "Edim"]);
});

test("degreeOf reads extensions as their triad", () => {
  assert.equal(degreeOf("G7", 0), 4);
  assert.equal(degreeOf("Am7", 0), 5);
  assert.equal(degreeOf("Cadd9", 7), 3);
  assert.equal(degreeOf("Dsus4", 7), 4);
  assert.equal(degreeOf("E", 0), -1); // E major isn't in C
  assert.equal(degreeOf("Bb", 5), 3);
});

test("detectKey picks the key a progression is in", () => {
  const major = (tonic: number) => ({ tonic, minor: false, outside: [] });
  assert.deepEqual(detectKey(["G", "D", "Em", "C"]), major(7));
  assert.deepEqual(detectKey(["C", "G", "Am", "Em"]), major(0)); // also fits G; starts on C
  assert.deepEqual(detectKey(["Am", "F", "C", "G"]), major(0)); // starts on vi but ends on V
  assert.deepEqual(detectKey(["Em", "C", "G", "D"]), major(7));
  assert.deepEqual(detectKey(["E", "A", "B7"]), major(4));
  assert.deepEqual(detectKey(["G"]), major(7));
  assert.equal(detectKey([]), null);
  assert.equal(detectKey(["G", "Xyz"]), null);
});

test("detectKey names borrowed chords and minor keys", () => {
  assert.deepEqual(detectKey(["G", "F", "C", "G"]), { tonic: 7, minor: false, outside: ["F"] });
  assert.deepEqual(detectKey(["Am", "Dm", "E7"]), { tonic: 0, minor: true, outside: [] }); // E7 is A minor's own V
  assert.deepEqual(detectKey(["Am", "F", "C", "Am"]), { tonic: 0, minor: true, outside: [] });
  // Two outsiders in four chords is too many to call it one key.
  assert.equal(detectKey(["C", "F#", "Bb", "G"]), null);
});
