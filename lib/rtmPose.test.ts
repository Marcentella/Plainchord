import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RTM_SIZE, rtmCrop, rtmDecode, rtmInput } from "./rtmPose.ts";

// rtmlib's own crop, input and decoding on a synthetic frame (scripts/refiner/rtm_fixture.py).
const fixture = JSON.parse(readFileSync(new URL("./rtmPose.fixture.json", import.meta.url), "utf8"));
const hand = fixture.hand.map(([x, y]: number[]) => ({ x, y }));

function syntheticFrame(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) data[(y * width + x) * 4 + c] = Math.round(127 + 120 * Math.sin(x * 0.13 + c) * Math.cos(y * 0.11 - c));
    }
  }
  return { data, width, height };
}

test("rtmCrop: the box rtmlib was given in training", () => {
  const crop = rtmCrop(hand, fixture.width, fixture.height);
  assert.ok(Math.abs(crop.cx - fixture.center[0]) < 1e-3 && Math.abs(crop.cy - fixture.center[1]) < 1e-3);
  assert.ok(Math.abs(crop.side - fixture.side) < 1e-3);
});

test("rtmInput: the same model input rtmlib builds, black outside the frame", () => {
  const out = new Float32Array(3 * RTM_SIZE * RTM_SIZE);
  rtmInput(syntheticFrame(fixture.width, fixture.height), rtmCrop(hand, fixture.width, fixture.height), out);
  let worst = 0;
  fixture.input.forEach((expected: number, k: number) => (worst = Math.max(worst, Math.abs(out[k * fixture.step] - expected))));
  // Normalized units (1 ≈ 58 grey levels): within OpenCV's 8-bit bilinear rounding.
  assert.ok(worst < 0.05, `input off by ${worst}`);
});

test("rtmDecode: the same keypoints rtmlib decodes", () => {
  const points = rtmDecode(Float32Array.from(fixture.simccX), Float32Array.from(fixture.simccY), rtmCrop(hand, fixture.width, fixture.height), fixture.width, fixture.height);
  points.forEach((p, j) => {
    assert.ok(Math.abs(p.x - fixture.keypoints[j][0]) < 1e-4 && Math.abs(p.y - fixture.keypoints[j][1]) < 1e-4, `point ${j}`);
  });
});
