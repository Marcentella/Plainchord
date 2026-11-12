import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calibrate, isCalibration } from "./fretMapping.ts";
import { PATCH_CHANNELS, PATCH_H, PATCH_W, refinedUV, refinerPatch, TipOffsets } from "./fingerRefiner.ts";

// One patch built by the training code (scripts/refiner/fixture.py) on a synthetic frame.
const fixture = JSON.parse(readFileSync(new URL("./fingerRefiner.fixture.json", import.meta.url), "utf8"));
const point = ([x, y]: number[]) => ({ x, y });

function syntheticFrame(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) data[(y * width + x) * 4 + c] = Math.round(127 + 120 * Math.sin(x * 0.13 + c) * Math.cos(y * 0.11 - c));
    }
  }
  return { data, width, height };
}

function build() {
  const cal = calibrate(fixture.corners.map(point), 12, true);
  assert.ok(isCalibration(cal));
  const out = new Float32Array(PATCH_CHANNELS * PATCH_H * PATCH_W);
  const originX = refinerPatch(syntheticFrame(fixture.width, fixture.height), cal, fixture.hand.map(point), fixture.finger, out);
  return { cal, out, originX };
}

test("refinerPatch: the same patch the training code builds", () => {
  const { out, originX } = build();
  assert.equal(originX, fixture.originX);
  const plane = PATCH_H * PATCH_W;
  let colourWorst = 0;
  let guideTotal = 0;
  fixture.samples.forEach((expected: number, k: number) => {
    const i = k * fixture.step;
    if (i < 3 * plane) colourWorst = Math.max(colourWorst, Math.abs(out[i] - expected));
  });
  // Colour: within rounding of OpenCV's 8-bit bilinear.
  assert.ok(colourWorst < 0.02, `colour off by ${colourWorst}`);
  // Guide: drawn by different rasterizers, so compared as a whole: same amount of ink, same tip.
  let peak = 0;
  for (let i = 0; i < plane; i++) {
    guideTotal += out[3 * plane + i];
    if (out[3 * plane + i] > out[3 * plane + peak]) peak = i;
  }
  assert.ok(Math.abs(guideTotal - fixture.guideSum) / fixture.guideSum < 0.15, `guide ink ${guideTotal} vs ${fixture.guideSum}`);
  assert.ok(Math.abs(Math.floor(peak / PATCH_W) - fixture.guidePeak[0]) <= 1 && Math.abs((peak % PATCH_W) - fixture.guidePeak[1]) <= 1);
});

test("refinerPatch: nothing to refine for a fingertip far off the neck", () => {
  const { cal } = build();
  const hand = fixture.hand.map(([x, y]: number[]) => ({ x, y: y + 0.4 }));
  assert.equal(refinerPatch(syntheticFrame(fixture.width, fixture.height), cal, hand, fixture.finger, new Float32Array(PATCH_CHANNELS * PATCH_H * PATCH_W)), null);
});

test("refinedUV: patch rows are strings", () => {
  // Row 20 is the low E (v = 0), row 60 the high e (v = 1), whatever the patch's position along the neck.
  assert.equal(refinedUV(100, 48, 20).y, 0);
  assert.equal(refinedUV(100, 48, 60).y, 1);
  assert.ok(refinedUV(100, 48, 20).x > refinedUV(50, 48, 20).x);
});

test("TipOffsets: the last answer's offset follows the moving tip, and goes away when there's nothing to refine", () => {
  const offsets = new TipOffsets();
  assert.equal(offsets.apply(0, { x: 0.1, y: 0.5 }), null);
  offsets.update(0, { x: 0.1, y: 0.5 }, { x: 0.1, y: 0.3 });
  assert.ok(Math.abs(offsets.apply(0, { x: 0.2, y: 0.6 })!.y - 0.4) < 1e-9);
  // A second answer is averaged in.
  offsets.update(0, { x: 0.1, y: 0.5 }, { x: 0.1, y: 0.5 });
  assert.ok(Math.abs(offsets.apply(0, { x: 0, y: 0 })!.y + 0.1) < 1e-9);
  offsets.update(0, { x: 0.1, y: 0.5 }, null);
  assert.equal(offsets.apply(0, { x: 0.1, y: 0.5 }), null);
});
