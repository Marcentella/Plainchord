import { test } from "node:test";
import assert from "node:assert/strict";
import { STRUM, initialStrum, rmsOf, stepStrum, type StrumEvent } from "./strumDetect.ts";

/** Runs a loudness curve (one value per 100 ms frame) and returns the events with their times. */
function run(rmsCurve: number[]): { at: number; event: StrumEvent }[] {
  let state = initialStrum();
  const events: { at: number; event: StrumEvent }[] = [];
  rmsCurve.forEach((rms, i) => {
    const now = i * 100;
    const step = stepStrum(state, { rms, now });
    state = step.state;
    if (step.event) events.push({ at: now, event: step.event });
  });
  return events;
}

/** A strum: a jump, then an exponential ring-out. */
const strum = (peak: number, frames: number) => Array.from({ length: frames }, (_, i) => peak * 0.8 ** i);

test("silence never strums", () => {
  assert.deepEqual(run(Array(30).fill(0.002)), []);
});

test("one strum gives an onset, then ready after the settle time", () => {
  const events = run([0.002, 0.002, ...strum(0.1, 20)]);
  assert.deepEqual(events, [
    { at: 200, event: "onset" },
    // The first 100 ms frame at or past the settle time.
    { at: 200 + Math.ceil(STRUM.settleMs / 100) * 100, event: "ready" },
  ]);
});

test("a strum over a chord still ringing counts as a new one", () => {
  const events = run([0.002, ...strum(0.1, 12), ...strum(0.1, 12)]);
  assert.equal(events.filter((e) => e.event === "onset").length, 2);
  assert.equal(events.filter((e) => e.event === "ready").length, 2);
});

test("the ring-out of one strum never reads as another", () => {
  const events = run([0.002, ...strum(0.2, 40)]);
  assert.equal(events.filter((e) => e.event === "onset").length, 1);
});

test("a loud start with no quiet before it waits for a real jump", () => {
  // The mic opens while a chord is already ringing: the first frame is the floor.
  const events = run([...strum(0.1, 10), ...strum(0.1, 10)]);
  assert.equal(events.filter((e) => e.event === "onset").length, 1);
  assert.equal(events[0].at, 1000);
});

test("rms of a full-scale square wave is 1, of a sine about 0.707", () => {
  assert.equal(rmsOf(Float32Array.from({ length: 64 }, (_, i) => (i % 2 ? 1 : -1))), 1);
  const sine = Float32Array.from({ length: 4800 }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / 48000));
  assert.ok(Math.abs(rmsOf(sine) - Math.SQRT1_2) < 0.001);
});
