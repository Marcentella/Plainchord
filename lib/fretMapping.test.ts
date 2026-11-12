import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calibrate,
  fretPositionIn,
  imageAt,
  neckUV,
  fretAt,
  fretPosition,
  isCalibration,
  onNeck,
  orderCorners,
  pressPoint,
  solveHomography,
  stringAt,
  wireU,
  type Calibration,
  type Vec2,
} from "./fretMapping.ts";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

// A neck seen at an angle, as in the first real test: headstock on the
// left, low E along the top edge, slightly tilted, the far end a little
// narrower (perspective). Clicked on the 12th fret.
const nutLow = { x: 0.2, y: 0.33 };
const nutHigh = { x: 0.205, y: 0.4 };
const twelveLow = { x: 0.62, y: 0.42 };
const twelveHigh = { x: 0.615, y: 0.485 };
const good = [nutLow, nutHigh, twelveLow, twelveHigh];

function cal(clicks: Vec2[] = good): Calibration {
  const result = calibrate(clicks, 12);
  assert.ok(isCalibration(result), `calibration failed: ${String(result)}`);
  return result;
}

test("calibrate: each corner lands on its string and fret line", () => {
  const c = cal();
  const expected = [
    [0, 0],
    [0, 1],
    [0.5, 0],
    [0.5, 1],
  ];
  good.forEach((p, i) => {
    const q = neckUV(c, p);
    close(q.x, expected[i][0]);
    close(q.y, expected[i][1]);
  });
});

test("calibrate: toImage undoes toNeck anywhere on the neck", () => {
  const c = cal();
  for (const p of [
    { x: 0.3, y: 0.38 },
    { x: 0.5, y: 0.42 },
    { x: 0.7, y: 0.47 },
  ]) {
    const uv = neckUV(c, p);
    const back = imageAt(c, uv.x, uv.y);
    close(back.x, p.x);
    close(back.y, p.y);
  }
});

test("orderCorners: any click order inside each pair gives the same calibration", () => {
  // The two mistakes seen on the real camera: high e clicked first on both
  // ends (strings came out reversed), and the fret pair crossed (bow tie).
  const reversed = [nutHigh, nutLow, twelveHigh, twelveLow];
  const crossed = [nutLow, nutHigh, twelveHigh, twelveLow];
  for (const clicks of [reversed, crossed]) assert.deepEqual(orderCorners(clicks), good);
});

test("calibrate: rejects clicks no neck could produce", () => {
  // Nut pair far apart, fret pair nearly on top of each other.
  assert.equal(calibrate([nutLow, { x: 0.2, y: 0.9 }, twelveLow, { x: 0.621, y: 0.421 }], 12), "proportion");
  // Short and wide: a "neck" wider than it is long.
  assert.equal(calibrate([{ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.6 }, { x: 0.3, y: 0.2 }, { x: 0.3, y: 0.6 }], 12), "proportion");
  // Three on a line.
  assert.notEqual(isCalibration(calibrate([{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }, { x: 0.5, y: 0.5 }], 5)), true);
  assert.equal(calibrate(good.slice(0, 3), 12), "degenerate");
});

test("solveHomography: degenerate points give no transform", () => {
  const line = [
    { x: 0.1, y: 0.1 },
    { x: 0.2, y: 0.2 },
    { x: 0.3, y: 0.3 },
    { x: 0.5, y: 0.6 },
  ];
  assert.equal(solveHomography(line, good), null);
});

test("equal temperament: the 12th fret is halfway, the 24th three quarters", () => {
  close(wireU(12), 0.5);
  close(wireU(24), 0.75);
  close(fretPosition(wireU(7)), 7);
  close(fretPosition(0), 0);
  assert.ok(Number.isNaN(fretPosition(1)));
});

test("fretAt: between wires n-1 and n is fret n, up to the 20th", () => {
  const between = (n: number) => (wireU(n - 1) + wireU(n)) / 2;
  assert.equal(fretAt(between(1)), 1);
  assert.equal(fretAt(between(3)), 3);
  assert.equal(fretAt(between(17)), 17);
  assert.equal(fretAt(between(22)), null);
  assert.equal(fretAt(-0.05), null); // behind the nut
});

test("fretAt / stringAt: a point on a boundary keeps last frame's answer", () => {
  // A tip on or just past wire 3 is still fret 3 (fingers press against the wire);
  // the boundary sits WIRE_SLACK fret spaces past it.
  const pastWire3 = (spaces: number) => wireU(3) + spaces * (wireU(4) - wireU(3));
  assert.equal(fretAt(pastWire3(0.05)), 3);
  assert.equal(fretAt(pastWire3(0.2)), 4);
  assert.equal(fretAt(pastWire3(0.2), 3), 3);
  assert.equal(fretAt(pastWire3(0.1), 4), 4);
  const halfway = 2.5 / 5;
  assert.equal(stringAt(halfway + 0.01, 2), 2);
  assert.equal(stringAt(halfway + 0.01, null), 3);
  assert.equal(stringAt(4 / 5 + 0.2, 2), 5);
});

test("stringAt: maps across the neck and gives up well outside it", () => {
  assert.equal(stringAt(0), 0);
  assert.equal(stringAt(1), 5);
  assert.equal(stringAt(0.41), 2);
  assert.equal(stringAt(-0.3), null);
  assert.equal(stringAt(1.3), null);
});

test("a point placed on the neck reads back as its string and fret, clicks in any order", () => {
  for (const clicks of [good, [nutHigh, nutLow, twelveHigh, twelveLow]]) {
    const c = cal(clicks);
    // A string (1), middle of fret 3 — and B string (4), middle of fret 15,
    // past the clicked 12th: extrapolated.
    for (const [string, fret] of [
      [1, 3],
      [4, 15],
    ]) {
      const p = imageAt(c, (wireU(fret - 1) + wireU(fret)) / 2, string / 5);
      const read = neckUV(c, p);
      assert.equal(fretAt(read.x), fret);
      assert.equal(stringAt(read.y), string);
      assert.ok(onNeck(read));
    }
  }
  assert.ok(!onNeck({ x: 0.95, y: 0.5 }));
});

test("pressPoint: just behind the tip by default, pulled toward the last joint (or past the tip) on request", () => {
  const tip = { x: 1, y: 0 };
  const dip = { x: 0, y: 0 };
  close(pressPoint(tip, dip).x, 0.85);
  close(pressPoint(tip, dip, 0).x, 1);
  close(pressPoint(tip, dip, 0.3).x, 0.7);
  close(pressPoint(tip, dip, -0.2).x, 1.2);
});

test("a tapered neck seen flat-on reads true frets (the strings fan out; it isn't a rectangle)", () => {
  // Draw a real neck straight onto the image, no perspective: 1 scale
  // length = 1.2 image widths, nut at x = 0.1, strings fanning as they do.
  const toImg = (u: number, v: number) => {
    const spread = (35 + (52.5 - 35) * u) / 648;
    return { x: 0.1 + u * 1.2, y: 0.5 + (v - 0.5) * spread * 1.2 };
  };
  const c = cal([toImg(0, 0), toImg(0, 1), toImg(0.5, 0), toImg(0.5, 1)]);
  // Mid-neck is where treating the fan as perspective went wrong by about a fret.
  for (const fret of [2, 5, 7, 9]) {
    const read = neckUV(c, toImg((wireU(fret - 1) + wireU(fret)) / 2, 2 / 5));
    assert.equal(fretAt(read.x), fret, `fret ${fret} read as ${fretAt(read.x)} (${fretPosition(read.x).toFixed(2)})`);
    assert.equal(stringAt(read.y), 2);
  }
});

test("fretPositionIn / fretAt: measured wires replace the formula, frets read between them", () => {
  // Wires a lens has pulled apart unevenly: not 12-TET at all.
  const wires = [0, 0.05, 0.11, 0.16, 0.2];
  assert.equal(fretPositionIn(0.08, wires), 1.5);
  assert.equal(fretAt(0.08, null, wires), 2);
  assert.equal(fretAt(0.13, null, wires), 3);
  assert.equal(fretAt(0.13, null), fretAt(0.13)); // no wires: same as the formula
  close(fretPositionIn(0.24, wires), 5); // past the last wire: extrapolated by the last space
  close(fretPositionIn(0.1, undefined), fretPosition(0.1));
});
