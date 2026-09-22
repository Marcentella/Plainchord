import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTimeline,
  totalDurationSeconds,
  locateAtElapsed,
  startSecondsFor,
  locateAtElapsedWithFraction,
} from "./playhead.ts";
import type { TabBeat } from "./tab.ts";

/** Builds a TabBeat sequence from a list of per-bar beat durations (in
 *  quarter notes; `undefined` for the default-quarter fallback), matching
 *  how lib/importGuitarPro.ts numbers position/bar. */
function beatsFromBarDurations(barDurations: (number | undefined)[][]): TabBeat[][] {
  let position = 0;
  return barDurations.map((durations, bar) =>
    durations.map((duration) => ({
      position: position++,
      bar,
      notes: [{ string: 0, fret: 0, techniques: [] }],
      ...(duration !== undefined && { duration }),
    })),
  );
}

test("buildTimeline assigns correct cumulative start times across bars", () => {
  const bars = beatsFromBarDurations([
    [1, 0.5],
    [2],
  ]);
  const timeline = buildTimeline(bars, 60); // 60 BPM: 1 quarter = 1 second
  assert.deepEqual(
    timeline.map((e) => ({ barIdx: e.barIdx, colIdx: e.colIdx, startSeconds: e.startSeconds })),
    [
      { barIdx: 0, colIdx: 0, startSeconds: 0 },
      { barIdx: 0, colIdx: 1, startSeconds: 1 },
      { barIdx: 1, colIdx: 0, startSeconds: 1.5 },
    ],
  );
});

test("totalDurationSeconds matches the sum of every beat's duration", () => {
  const bars = beatsFromBarDurations([[1, 0.5, 4]]);
  const timeline = buildTimeline(bars, 60);
  assert.equal(totalDurationSeconds(timeline), 5.5);
});

// Plain-text tabs never carry a duration field at all — every beat must
// fall back to a quarter note, reproducing the exact flat "every beat is
// 60/bpm seconds" timing this timeline used before real duration data
// existed. This is the regression guard for that.
test("an all-default-duration timeline matches the old flat quarter-note-per-beat timing", () => {
  const bars = beatsFromBarDurations([
    [undefined, undefined, undefined],
    [undefined],
  ]);
  const timeline = buildTimeline(bars, 120); // 120 BPM: 1 quarter = 0.5s
  assert.deepEqual(
    timeline.map((e) => e.startSeconds),
    [0, 0.5, 1, 1.5],
  );
  assert.equal(totalDurationSeconds(timeline), 2);
});

test("locateAtElapsed resolves the beat sounding at a given time, including mixed durations", () => {
  // A dotted quarter (1.5) followed by an eighth (0.5) at 60 BPM (1 quarter = 1s).
  const bars = beatsFromBarDurations([[1.5, 0.5]]);
  const timeline = buildTimeline(bars, 60);
  assert.deepEqual(locateAtElapsed(timeline, 0), { barIdx: 0, colIdx: 0 });
  assert.deepEqual(locateAtElapsed(timeline, 1.49), { barIdx: 0, colIdx: 0 });
  assert.deepEqual(locateAtElapsed(timeline, 1.5), { barIdx: 0, colIdx: 1 }); // exactly on the boundary
  assert.deepEqual(locateAtElapsed(timeline, 1.99), { barIdx: 0, colIdx: 1 });
});

test("locateAtElapsed returns null before the start, at/past the end, and for an empty timeline", () => {
  const bars = beatsFromBarDurations([[1, 1]]);
  const timeline = buildTimeline(bars, 60);
  assert.equal(locateAtElapsed(timeline, -0.1), null);
  assert.equal(locateAtElapsed(timeline, 2), null); // totalDuration is exactly 2 — reaching it means "done"
  assert.equal(locateAtElapsed(timeline, 5), null);
  assert.equal(locateAtElapsed([], 0), null);
});

test("locateAtElapsed on the last beat's own start still resolves to it, not null", () => {
  const bars = beatsFromBarDurations([[1, 1, 1]]);
  const timeline = buildTimeline(bars, 60);
  assert.deepEqual(locateAtElapsed(timeline, 2), { barIdx: 0, colIdx: 2 });
  assert.deepEqual(locateAtElapsed(timeline, 2.99), { barIdx: 0, colIdx: 2 });
});

test("startSecondsFor finds a real location's own start time", () => {
  const bars = beatsFromBarDurations([[1.5, 0.5], [1]]);
  const timeline = buildTimeline(bars, 60);
  assert.equal(startSecondsFor(timeline, { barIdx: 0, colIdx: 1 }), 1.5);
  assert.equal(startSecondsFor(timeline, { barIdx: 1, colIdx: 0 }), 2);
});

test("startSecondsFor returns null for a location not in the timeline", () => {
  const bars = beatsFromBarDurations([[1, 1]]);
  const timeline = buildTimeline(bars, 60);
  assert.equal(startSecondsFor(timeline, { barIdx: 0, colIdx: 5 }), null);
  assert.equal(startSecondsFor(timeline, { barIdx: 3, colIdx: 0 }), null);
});

test("locateAtElapsedWithFraction reports 0 at a beat's own start, ~0.5 at its midpoint, near 1 at its end", () => {
  // A dotted quarter (1.5) followed by an eighth (0.5) at 60 BPM (1 quarter = 1s).
  const bars = beatsFromBarDurations([[1.5, 0.5]]);
  const timeline = buildTimeline(bars, 60);
  assert.deepEqual(locateAtElapsedWithFraction(timeline, 0), { barIdx: 0, colIdx: 0, fraction: 0 });
  assert.deepEqual(locateAtElapsedWithFraction(timeline, 0.75), { barIdx: 0, colIdx: 0, fraction: 0.5 });
  const nearEnd = locateAtElapsedWithFraction(timeline, 1.49);
  assert.equal(nearEnd?.barIdx, 0);
  assert.equal(nearEnd?.colIdx, 0);
  assert.ok(nearEnd!.fraction > 0.9 && nearEnd!.fraction < 1);
  // Second beat (the eighth) starts fresh at fraction 0, not carrying over.
  assert.deepEqual(locateAtElapsedWithFraction(timeline, 1.5), { barIdx: 0, colIdx: 1, fraction: 0 });
  assert.deepEqual(locateAtElapsedWithFraction(timeline, 1.75), { barIdx: 0, colIdx: 1, fraction: 0.5 });
});

test("locateAtElapsedWithFraction stays within [0,1] and returns null outside the timeline, same as locateAtElapsed", () => {
  const bars = beatsFromBarDurations([[1, 1]]);
  const timeline = buildTimeline(bars, 60);
  assert.equal(locateAtElapsedWithFraction(timeline, -0.1), null);
  assert.equal(locateAtElapsedWithFraction(timeline, 2), null);
  assert.equal(locateAtElapsedWithFraction([], 0), null);
});
