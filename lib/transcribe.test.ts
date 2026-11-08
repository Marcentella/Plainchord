import { test } from "node:test";
import assert from "node:assert/strict";
import { detectNotes, quantize, gridToTab, transcribe, type NoteEvent } from "./transcribe.ts";

const SR = 48000;

/**
 * A plucked-string stand-in: harmonics 1-8 at 1/h, sharp attack,
 * exponential decay (`decay` per second, 3 by default; a real string can
 * ring far longer, see the ringing-string test).
 */
function synth(notes: { midi: number; start: number; length: number; decay?: number }[], seconds: number) {
  const out = new Float32Array(Math.ceil(seconds * SR));
  for (const note of notes) {
    const from = Math.floor(note.start * SR);
    const len = Math.floor(note.length * SR);
    let phase = 0;
    for (let i = 0; i < len && from + i < out.length; i++) {
      const t = i / SR;
      phase += (2 * Math.PI * 440 * 2 ** ((note.midi - 69) / 12)) / SR;
      // 3 ms attack, 10 ms release: a real string is damped, never cut off,
      // and a hard cut is a click the detector rightly hears as a new attack.
      const env = Math.min(1, t / 0.003, (note.length - t) / 0.01) * Math.exp(-t * (note.decay ?? 3));
      let s = 0;
      for (let h = 1; h <= 8; h++) s += Math.sin(h * phase) / h;
      out[from + i] += 0.3 * env * s;
    }
  }
  // A little room noise, so silence isn't digital zero.
  for (let i = 0; i < out.length; i++) out[i] += (Math.random() - 0.5) * 0.001;
  return out;
}

test("detectNotes: finds each plucked note's pitch and start", () => {
  const played = [
    { midi: 52, start: 0.2, length: 0.4 },
    { midi: 55, start: 0.7, length: 0.4 },
    { midi: 57, start: 1.2, length: 0.4 },
    { midi: 64, start: 1.7, length: 0.4 },
  ];
  const found = detectNotes(synth(played, 2.3), SR);
  assert.deepEqual(found.map((n) => n.midi), [52, 55, 57, 64]);
  found.forEach((n, i) => assert.ok(Math.abs(n.start - played[i].start) < 0.03, `note ${i} at ${n.start}`));
});

test("detectNotes: the same note plucked twice is two notes", () => {
  const found = detectNotes(synth([{ midi: 50, start: 0.2, length: 0.5 }, { midi: 50, start: 0.7, length: 0.5 }], 1.4), SR);
  assert.equal(found.length, 2);
});

test("detectNotes: a new note is found while the previous strings still ring", () => {
  // Open low E left ringing at full sustain under three more plucks — what
  // broke the first version on a real guitar: no single pitch, barely any
  // loudness jump.
  const played = [
    { midi: 40, start: 0.2, length: 3, decay: 0.3 },
    { midi: 45, start: 0.95, length: 2.2, decay: 0.3 },
    { midi: 47, start: 1.7, length: 1.4, decay: 0.3 },
    { midi: 52, start: 2.45, length: 0.7, decay: 0.3 },
  ];
  const found = detectNotes(synth(played, 3.3), SR);
  assert.deepEqual(found.map((n) => n.midi), [40, 45, 47, 52]);
  found.forEach((n, i) => assert.ok(Math.abs(n.start - played[i].start) < 0.03, `note ${i} at ${n.start}`));
});

test("detectNotes: a semitone apart down low is still told apart", () => {
  const found = detectNotes(synth([{ midi: 40, start: 0.2, length: 0.6 }, { midi: 41, start: 0.9, length: 0.6 }], 1.6), SR);
  assert.deepEqual(found.map((n) => n.midi), [40, 41]);
});

test("detectNotes: low E and the high end of the neck are both in range", () => {
  const found = detectNotes(synth([{ midi: 40, start: 0.2, length: 0.6 }, { midi: 81, start: 0.9, length: 0.4 }], 1.5), SR);
  assert.deepEqual(found.map((n) => n.midi), [40, 81]);
});

test("detectNotes: silence gives no notes", () => {
  assert.deepEqual(detectNotes(synth([], 1), SR), []);
});

const note = (midi: number, start: number, end: number): NoteEvent => ({ midi, start, end });

test("quantize: snaps slightly early/late playing to the 16th grid", () => {
  // 120 BPM: a quarter is 0.5 s. Downbeat at 1 s.
  const grid = quantize([note(52, 1.02, 1.5), note(55, 1.48, 2.0), note(57, 1.97, 2.5)], 120, 1);
  assert.deepEqual(grid.map((b) => [b.pitches, b.start, b.duration]), [
    [[52], 0, 1],
    [[55], 1, 1],
    [[57], 2, 1],
  ]);
});

test("quantize: a long silence becomes a rest, a note fading early just rings on", () => {
  // 120 BPM, downbeat at 0: the first note fades half a beat early (rings
  // on into the next), the second ends 2.5 quarters before the third (a rest).
  const grid = quantize([note(52, 0, 0.25), note(55, 0.5, 0.75), note(57, 2.0, 2.5)], 120, 0);
  assert.deepEqual(grid.map((b) => [b.pitches, b.start, b.duration]), [
    [[52], 0, 1],
    [[55], 1, 0.5],
    [[], 1.5, 2.5],
    [[57], 4, 1],
  ]);
});

test("quantize: a late first note gets a leading rest, and rests split at bar lines", () => {
  const grid = quantize([note(52, 3.0, 3.5)], 120, 0); // first note on beat 7 (bar 2)
  assert.deepEqual(grid.map((b) => [b.pitches, b.start, b.duration]), [
    [[], 0, 4],
    [[], 4, 2],
    [[52], 6, 1],
  ]);
});

test("quantize: a player coming in late still starts on beat 1", () => {
  // 80 BPM (0.75 s a beat), count-in ends at 3.3 s, first note at 3.69 s —
  // the reaction delay a real take showed. Without anchoring, every note
  // would sit half a beat late.
  const grid = quantize([note(40, 3.69, 4.4), note(45, 4.44, 5.1), note(47, 5.19, 5.9)], 80, 3.3);
  assert.deepEqual(grid.map((b) => [b.pitches, b.start]), [
    [[40], 0],
    [[45], 1],
    [[47], 2],
  ]);
});

test("quantize: notes in the count-in are dropped, a hair early still counts", () => {
  const grid = quantize([note(40, 0.2, 0.4), note(52, 0.98, 1.4)], 120, 1);
  assert.deepEqual(grid.map((b) => b.pitches), [[52]]);
  assert.equal(grid[0].start, 0);
});

test("gridToTab: beats get bars, durations, fingering and the tempo", () => {
  const tab = gridToTab(
    [
      { pitches: [48], start: 0, duration: 2 },
      { pitches: [], start: 2, duration: 2 },
      { pitches: [50], start: 4, duration: 1 },
    ],
    90,
  );
  assert.equal(tab.tempo, 90);
  assert.deepEqual(tab.beats.map((b) => [b.position, b.bar, b.duration]), [[0, 0, 2], [1, 0, 2], [2, 1, 1]]);
  assert.deepEqual(tab.beats[0].notes, [{ string: 1, fret: 3, techniques: [] }]);
  assert.deepEqual(tab.beats[1].notes, []);
});

test("transcribe: a played C major arpeggio comes out as open-position tab on the beat", () => {
  // 100 BPM, quarter = 0.6 s, downbeat at 0.5 s.
  const q = 0.6;
  const played = [48, 52, 55, 60].map((midi, i) => ({ midi, start: 0.5 + i * q + 0.01, length: q * 0.9 }));
  const tab = transcribe(synth(played, 0.5 + 4 * q + 0.3), SR, 100, 0.5);
  assert.deepEqual(
    tab.beats.map((b) => b.notes.map((n) => [n.string, n.fret])),
    [[[1, 3]], [[2, 2]], [[3, 0]], [[4, 1]]],
  );
  assert.deepEqual(tab.beats.map((b) => b.duration), [1, 1, 1, 1]);
});
