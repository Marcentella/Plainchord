import { test } from "node:test";
import assert from "node:assert/strict";
import { NeckTracker, fitHomography, ransacHomography, seededRandom, type Gray } from "./neckTracking.ts";
import { applyHomography, solveHomography, type Vec2 } from "./fretMapping.ts";

const W = 240;
const H = 160;

/**
 * A textured stand-in for a fretboard: smooth blobs (inlays, wood grain)
 * plus thin bright lines across it (fret wires). Analytic, so a moved
 * frame is rendered exactly instead of resampled from pixels.
 */
function makeTexture(seed: number) {
  const random = seededRandom(seed);
  const blobs = Array.from({ length: 90 }, () => ({
    x: random() * W,
    y: random() * H,
    s: 1.5 + random() * 3,
    a: (random() - 0.5) * 180,
  }));
  return (x: number, y: number) => {
    let v = 100;
    for (const b of blobs) v += b.a * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * b.s * b.s));
    v += 60 * Math.exp(-(((((x % 17) + 17) % 17) - 8) ** 2) / 0.8); // "fret wires"
    return v;
  };
}

/** Renders the texture moved by `motion` (reference -> frame), with an optional occluder drawn on top. */
function render(texture: (x: number, y: number) => number, motion: number[], occluder?: { x: number; y: number; r: number }): Gray {
  const back = solveHomography(
    [0, 1, 2, 3].map((i) => applyHomography(motion, CORNERS[i])),
    CORNERS,
  )!;
  const data = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (occluder && Math.hypot(x - occluder.x, y - occluder.y) < occluder.r) {
        data[y * W + x] = 230 + 20 * Math.sin(x * 0.7) * Math.cos(y * 0.6); // textured "hand"
        continue;
      }
      const s = applyHomography(back, { x, y });
      data[y * W + x] = texture(s.x, s.y);
    }
  }
  return { data, width: W, height: H };
}

const CORNERS: Vec2[] = [
  { x: 40, y: 60 },
  { x: 42, y: 100 },
  { x: 190, y: 55 },
  { x: 188, y: 102 },
];

/** A small rotation + shift + slight perspective, scaled by t (0 = identity). */
function motionAt(t: number): number[] {
  const angle = 0.04 * t;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = W / 2;
  const cy = H / 2;
  return [cos, -sin, cx - cos * cx + sin * cy + 6 * t, sin, cos, cy - sin * cx - cos * cy + 3 * t, 0.00008 * t, 0, 1];
}

function cornerError(found: Vec2[], motion: number[]): number {
  return Math.max(...CORNERS.map((c, i) => {
    const truth = applyHomography(motion, c);
    return Math.hypot(found[i].x - truth.x, found[i].y - truth.y);
  }));
}

test("fitHomography: least squares over noisy pairs beats any 4 of them", () => {
  const random = seededRandom(9);
  const truth = motionAt(1);
  const from = Array.from({ length: 50 }, () => ({ x: random() * W, y: random() * H }));
  const to = from.map((p) => {
    const q = applyHomography(truth, p);
    return { x: q.x + (random() - 0.5) * 0.6, y: q.y + (random() - 0.5) * 0.6 }; // ±0.3 px noise
  });
  const fit = fitHomography(from, to)!;
  assert.ok(cornerError(CORNERS.map((c) => applyHomography(fit, c)), truth) < 0.2);
});

test("ransacHomography: recovers the motion with a third of the matches wrong", () => {
  const random = seededRandom(1);
  const truth = motionAt(1);
  const from = Array.from({ length: 60 }, () => ({ x: random() * W, y: random() * H }));
  const to = from.map((p, i) => (i % 3 === 0 ? { x: random() * W, y: random() * H } : applyHomography(truth, p)));
  const fit = ransacHomography(from, to, seededRandom(2))!;
  assert.ok(fit);
  assert.ok(cornerError(CORNERS.map((c) => applyHomography(fit.h, c)), truth) < 0.01);
  assert.equal(fit.inliers.filter(Boolean).length, 40);
});

test("NeckTracker: follows a neck that turns and slides over 12 frames", () => {
  const texture = makeTexture(7);
  const tracker = new NeckTracker(render(texture, motionAt(0)), CORNERS, [], seededRandom(3));
  assert.ok(tracker.featureCount >= 20, `only ${tracker.featureCount} features`);
  let last = null;
  for (let f = 1; f <= 12; f++) {
    const result = tracker.update(render(texture, motionAt(f / 4)));
    assert.ok(result.corners, `lost the neck at frame ${f}`);
    last = { corners: result.corners!, motion: motionAt(f / 4) };
  }
  const error = cornerError(last!.corners, last!.motion);
  assert.ok(error < 0.5, `corners off by ${error.toFixed(2)} px after 12 frames`);
});

test("NeckTracker: a hand sliding across the neck the other way doesn't drag the fit", () => {
  const texture = makeTexture(11);
  const tracker = new NeckTracker(render(texture, motionAt(0)), CORNERS, [], seededRandom(5));
  let error = Infinity;
  for (let f = 1; f <= 12; f++) {
    // The neck drifts right; the "hand" moves left across it, ending over the nut end.
    const hand = { x: 160 - 9 * f, y: 80, r: 22 };
    // The real page passes all 21 hand landmarks; a ring of points stands in for them.
    const landmarks = [{ x: hand.x, y: hand.y }, ...Array.from({ length: 8 }, (_, k) => ({
      x: hand.x + hand.r * Math.cos((k * Math.PI) / 4),
      y: hand.y + hand.r * Math.sin((k * Math.PI) / 4),
    }))];
    const result = tracker.update(render(texture, motionAt(f / 5), hand), landmarks);
    assert.ok(result.corners, `lost the neck at frame ${f}`);
    error = cornerError(result.corners!, motionAt(f / 5));
  }
  assert.ok(error < 0.6, `corners off by ${error.toFixed(2)} px with a hand over the neck`);
});

test("NeckTracker: a frame with nothing like the neck reports it lost instead of guessing", () => {
  const tracker = new NeckTracker(render(makeTexture(7), motionAt(0)), CORNERS, [], seededRandom(3));
  const blank: Gray = { data: new Float32Array(W * H).fill(90), width: W, height: H };
  assert.equal(tracker.update(blank).corners, null);
});
