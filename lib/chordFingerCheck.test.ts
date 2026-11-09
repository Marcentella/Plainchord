import { test } from "node:test";
import assert from "node:assert/strict";
import { FingerLock, LOCK_MS, ReadingStabilizer, STABLE_MS, allInPlace, checkChord, expectedFingers, type FingerReading } from "./chordFingerCheck.ts";
import type { Chord } from "./chords.ts";

// Same shapes as data/chords.json (inlined: node:test can't resolve "@/").
const C: Chord = { name: "C", frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] };
const G: Chord = { name: "G", frets: [3, 2, 0, 0, 0, 3], fingers: [3, 2, 0, 0, 0, 4] };
const F: Chord = { name: "F", frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1] };

const at = (string: number, fret: number): FingerReading => ({ string, fret });

test("expectedFingers: one string per finger, nothing for unused ones", () => {
  assert.deepEqual(expectedFingers(C), [
    { strings: [4], fret: 1, barre: false },
    { strings: [2], fret: 2, barre: false },
    { strings: [1], fret: 3, barre: false },
    null,
  ]);
});

test("expectedFingers: a barre's tip belongs on the bar's top string, the span kept for describing it", () => {
  assert.deepEqual(expectedFingers(F)[0], { strings: [0], fret: 1, barre: true, span: [0, 5] });
});

test("checkChord: a correct C is all in place", () => {
  const checks = checkChord(C, [at(4, 1), at(2, 2), at(1, 3), null]);
  assert.deepEqual(checks.map((c) => c.status), ["ok", "ok", "ok", "unused"]);
  assert.ok(allInPlace(checks));
});

test("checkChord: tells a wrong string from a wrong fret from neither", () => {
  // The real-camera mistake: ring finger one string off. Middle on the
  // right string a fret high. Index somewhere else entirely.
  const checks = checkChord(C, [at(3, 2), at(2, 3), at(2, 3), null]);
  assert.deepEqual(checks.map((c) => c.status), ["elsewhere", "wrongFret", "wrongString", "unused"]);
  assert.ok(!allInPlace(checks));
});

test("checkChord: a finger the chord needs but the camera doesn't see", () => {
  const checks = checkChord(G, [null, at(1, 2), at(0, 3), null]);
  assert.deepEqual(checks.map((c) => c.status), ["unused", "ok", "ok", "notSeen"]);
});

test("checkChord: an F barre's index counts with its tip on the 6th string, not just anywhere on the fret", () => {
  assert.equal(checkChord(F, [at(0, 1), at(3, 2), at(1, 3), at(2, 3)])[0].status, "ok");
  // Tip on the 1st string at fret 1: pressing one string, not barring.
  assert.equal(checkChord(F, [at(5, 1), at(3, 2), at(1, 3), at(2, 3)])[0].status, "wrongString");
});

test("ReadingStabilizer: a reading counts once it holds, a passing finger doesn't", () => {
  const s = new ReadingStabilizer();
  // Finger sliding across strings 5, 4, 3 every 60 ms, then resting on 2.
  assert.deepEqual(s.update([at(5, 1), null, null, null], 0)[0], null);
  assert.deepEqual(s.update([at(4, 1), null, null, null], 60)[0], null);
  assert.deepEqual(s.update([at(3, 1), null, null, null], 120)[0], null);
  assert.deepEqual(s.update([at(2, 1), null, null, null], 180)[0], null);
  assert.deepEqual(s.update([at(2, 1), null, null, null], 180 + STABLE_MS)[0], at(2, 1));
  // A one-frame glitch doesn't replace it.
  assert.deepEqual(s.update([at(3, 1), null, null, null], 400)[0], at(2, 1));
  assert.deepEqual(s.update([at(2, 1), null, null, null], 430)[0], at(2, 1));
});

const pos = (s: number, f: number) => ({ string: s, fret: f });

test("FingerLock: locks after reading right for LOCK_MS, then rides out wobble", () => {
  const lock = new FingerLock();
  const right = [at(4, 1), at(2, 2), at(1, 3), null];
  const exact = [pos(4, 0.5), pos(2, 1.5), pos(1, 2.5), null];
  assert.deepEqual(lock.update(C, right, exact, 0).locked, [false, false, false, false]);
  assert.deepEqual(lock.update(C, right, exact, LOCK_MS).locked, [true, true, true, false]);
  // The index wobbles 0.7 of a string toward the G string and its raw
  // reading flips to the wrong string: still locked, still reads right.
  const r = lock.update(C, [at(3, 1), at(2, 2), at(1, 3), null], [pos(3.3, 0.6), pos(2, 1.5), pos(1, 2.5), null], LOCK_MS + 100);
  assert.equal(r.locked[0], true);
  assert.deepEqual(r.readings[0], at(4, 1));
});

test("FingerLock: a finger on the neighbouring string always breaks the lock", () => {
  const lock = new FingerLock();
  lock.update(C, [at(4, 1), null, null, null], [pos(4, 0.5), null, null, null], 0);
  lock.update(C, [at(4, 1), null, null, null], [pos(4, 0.5), null, null, null], LOCK_MS);
  const r = lock.update(C, [at(3, 1), null, null, null], [pos(3.05, 0.5), null, null, null], LOCK_MS + 50);
  assert.equal(r.locked[0], false);
  assert.deepEqual(r.readings[0], at(3, 1));
});

test("FingerLock: never snaps a nearby but wrong finger into place", () => {
  const lock = new FingerLock();
  // Held a long time just off target (its reading says string 3): no lock, ever.
  for (let t = 0; t <= 2000; t += 100) {
    const r = lock.update(C, [at(3, 1), null, null, null], [pos(3.4, 0.5), null, null, null], t);
    assert.equal(r.locked[0], false);
  }
});

test("FingerLock: survives a brief occlusion, not a long one; a new chord starts over", () => {
  const lock = new FingerLock();
  lock.update(C, [at(4, 1), null, null, null], [pos(4, 0.5), null, null, null], 0);
  lock.update(C, [at(4, 1), null, null, null], [pos(4, 0.5), null, null, null], LOCK_MS);
  assert.equal(lock.update(C, [null, null, null, null], [null, null, null, null], LOCK_MS + 300).locked[0], true);
  assert.equal(lock.update(C, [null, null, null, null], [null, null, null, null], LOCK_MS + 900).locked[0], false);
  lock.update(C, [at(4, 1), null, null, null], [pos(4, 0.5), null, null, null], 2000);
  lock.update(C, [at(4, 1), null, null, null], [pos(4, 0.5), null, null, null], 2000 + LOCK_MS);
  assert.equal(lock.update(G, [at(4, 1), null, null, null], [pos(4, 0.5), null, null, null], 2400).locked[0], false);
});

test("FingerLock: a locked barre unlocks when its tip slides down the fret", () => {
  // The real-camera bug: locked with the tip on the 6th string, it then
  // stayed locked while the finger slid across the whole fret.
  const lock = new FingerLock();
  const read = [at(0, 1), at(3, 2), at(1, 3), at(2, 3)];
  const where = [pos(0.1, 0.5), pos(3, 1.5), pos(1, 2.5), pos(2, 2.5)];
  lock.update(F, read, where, 0);
  assert.equal(lock.update(F, read, where, LOCK_MS).locked[0], true);
  const slid = lock.update(F, [at(3, 1), ...read.slice(1)], [pos(3, 0.6), ...where.slice(1)], LOCK_MS + 50);
  assert.equal(slid.locked[0], false);
  assert.equal(checkChord(F, slid.readings)[0].status, "wrongString");
});
