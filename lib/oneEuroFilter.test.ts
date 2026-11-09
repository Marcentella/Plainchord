import { test } from "node:test";
import assert from "node:assert/strict";
import { FINGERTIP_FILTER, OneEuroFilter } from "./oneEuroFilter.ts";

const FPS = 30;

test("OneEuroFilter: a still point with jitter comes out much steadier", () => {
  const f = new OneEuroFilter();
  // ±3 px of alternating jitter around x = 500, the size MediaPipe shows on a still hand.
  const out: number[] = [];
  for (let i = 0; i < 90; i++) out.push(f.filter(500 + (i % 2 ? 3 : -3), i / FPS));
  const settled = out.slice(30);
  const spread = Math.max(...settled) - Math.min(...settled);
  assert.ok(spread < 2, `jitter spread ${spread.toFixed(2)} px (input was 6 px)`);
  assert.ok(Math.abs(settled[settled.length - 1] - 500) < 2);
});

test("OneEuroFilter: a quick move is followed with little lag", () => {
  const f = new OneEuroFilter();
  for (let i = 0; i < 30; i++) f.filter(100, i / FPS);
  // Finger slides 300 px in a third of a second, then stops.
  let x = 0;
  for (let i = 0; i <= 10; i++) x = f.filter(100 + 30 * i, (30 + i) / FPS);
  assert.ok(400 - x < 60, `lagging ${(400 - x).toFixed(0)} px behind at the end of the move`);
  for (let i = 0; i < 15; i++) x = f.filter(400, (41 + i) / FPS);
  assert.ok(Math.abs(x - 400) < 5, `settled at ${x.toFixed(1)}`);
});

test("OneEuroFilter: first value passes through, reset starts over", () => {
  const f = new OneEuroFilter();
  assert.equal(f.filter(42, 0), 42);
  f.reset();
  assert.equal(f.filter(7, 1), 7);
  assert.equal(f.filter(9, 1), 7); // same timestamp: no update
});

test("OneEuroFilter: jitter detection smooths trembling harder without slowing a real move", () => {
  const spreadWith = (jitterWindow: number) => {
    const f = new OneEuroFilter({ ...FINGERTIP_FILTER, jitterWindow });
    const out: number[] = [];
    for (let i = 0; i < 90; i++) out.push(f.filter(500 + (i % 2 ? 4 : -4), i / FPS));
    const settled = out.slice(30);
    return Math.max(...settled) - Math.min(...settled);
  };
  const plain = spreadWith(0);
  const damped = spreadWith(FINGERTIP_FILTER.jitterWindow);
  assert.ok(damped < plain * 0.6, `jitter spread ${damped.toFixed(2)} px with detection vs ${plain.toFixed(2)} without`);

  // A steady slide: consistency stays ~1, so it tracks as before.
  const lagWith = (jitterWindow: number) => {
    const f = new OneEuroFilter({ ...FINGERTIP_FILTER, jitterWindow });
    let x = 0;
    for (let i = 0; i <= 20; i++) x = f.filter(100 + 15 * i, i / FPS);
    return 400 - x;
  };
  assert.ok(Math.abs(lagWith(FINGERTIP_FILTER.jitterWindow) - lagWith(0)) < 1);
});
