import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFretWires, type FretWires } from "./fretDetection.ts";
import {
  applyHomography,
  calibrate,
  fretAt,
  fretPosition,
  imageAt,
  isCalibration,
  neckUV,
  solveHomography,
  stringSpread,
  wireU,
  type Calibration,
  type Vec2,
} from "./fretMapping.ts";
import { seededRandom, type Gray } from "./neckTracking.ts";

/**
 * A synthetic camera looking at a neck: the true neck plane (u along, y
 * across, scale lengths) through a perspective homography and then barrel
 * lens distortion, like the user's wide USB webcam. Rendered by inverse
 * mapping each pixel, so wires, strings and dots land exactly where a real
 * guitar's would.
 */
const W = 640;
const H = 360;
const CENTER = { x: W / 2, y: H / 2 };
const LENS_K = -0.12; // barrel: straight lines bow outward near the frame edges

const planeToImage = solveHomography(
  [
    { x: 0, y: -0.05 },
    { x: 0, y: 0.05 },
    { x: 0.75, y: -0.07 },
    { x: 0.75, y: 0.07 },
  ],
  [
    { x: 40, y: 150 },
    { x: 42, y: 195 },
    { x: 600, y: 128 },
    { x: 596, y: 214 },
  ],
)!;
const imageToPlane = solveHomography(
  [
    { x: 40, y: 150 },
    { x: 42, y: 195 },
    { x: 600, y: 128 },
    { x: 596, y: 214 },
  ],
  [
    { x: 0, y: -0.05 },
    { x: 0, y: 0.05 },
    { x: 0.75, y: -0.07 },
    { x: 0.75, y: 0.07 },
  ],
)!;

const R2 = CENTER.x * CENTER.x;
function distort(p: Vec2): Vec2 {
  const dx = p.x - CENTER.x;
  const dy = p.y - CENTER.y;
  const f = 1 + (LENS_K * (dx * dx + dy * dy)) / R2;
  return { x: CENTER.x + dx * f, y: CENTER.y + dy * f };
}
function undistort(p: Vec2): Vec2 {
  let q = p;
  for (let i = 0; i < 6; i++) {
    const dx = q.x - CENTER.x;
    const dy = q.y - CENTER.y;
    const f = 1 + (LENS_K * (dx * dx + dy * dy)) / R2;
    q = { x: CENTER.x + (p.x - CENTER.x) / f, y: CENTER.y + (p.y - CENTER.y) / f };
  }
  return q;
}
/** True neck point (u along, v 0 low E … 1 high e) -> pixel the camera sees. */
const seen = (u: number, v: number) => distort(applyHomography(planeToImage, { x: u, y: (v - 0.5) * stringSpread(u) }));
/** Pixel -> true neck u. */
const trueU = (p: Vec2) => applyHomography(imageToPlane, undistort(p)).x;

type Look = { board: number; wire: number; nut: number; hand?: [number, number] };
const ROSEWOOD: Look = { board: 70, wire: 205, nut: 230 };
const MAPLE: Look = { board: 190, wire: 120, nut: 235 };

function render(look: Look, seed = 1): Gray {
  const noise = seededRandom(seed);
  const data = new Float32Array(W * H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const q = applyHomography(imageToPlane, undistort({ x: px, y: py }));
      const u = q.x;
      const y = q.y;
      const half = 0.6 * stringSpread(Math.max(0, u)) + 0.006;
      let v = 40; // background
      if (u > -0.08 && u < 0.78 && Math.abs(y) < half) {
        v = look.board + 6 * Math.sin(u * 900 + y * 40);
        if (u < 0) v = 160; // headstock
        if (Math.abs(u) < 0.006) v = look.nut;
        for (let n = 1; n <= 24; n++) if (Math.abs(u - wireU(n)) < 0.0015) v = look.wire;
        for (const n of [3, 5, 7, 9, 15, 17]) {
          const cu = (wireU(n - 1) + wireU(n)) / 2;
          if (Math.hypot(u - cu, y) < 0.004) v = 225;
        }
        const c12 = (wireU(11) + wireU(12)) / 2;
        if (Math.hypot(u - c12, y - 0.015) < 0.004 || Math.hypot(u - c12, y + 0.015) < 0.004) v = 225;
        for (let s = 0; s < 6; s++) if (Math.abs(y - (s / 5 - 0.5) * stringSpread(Math.max(0, u))) < 0.0006) v = 165;
        if (look.hand && u > look.hand[0] && u < look.hand[1]) v = 200 + 15 * Math.sin(px * 0.3) * Math.cos(py * 0.25);
      }
      data[py * W + px] = v + (noise() - 0.5) * 8;
    }
  }
  return { data, width: W, height: H };
}

/** The user's clicks: nut and 12th wire at both outer strings, the 12th ones a few px off. */
function clicks(): Vec2[] {
  const off = (p: Vec2, dx: number, dy: number) => ({ x: (p.x + dx) / W, y: (p.y + dy) / H });
  return [off(seen(0, 0), 0, 0), off(seen(0, 1), 0, 0), off(seen(0.5, 0), 3, -2), off(seen(0.5, 1), 3, 1)];
}

function cal(): Calibration {
  const result = calibrate(clicks(), 12);
  assert.ok(isCalibration(result), String(result));
  return result;
}

/** Where wire u (calibration plane) really is, in frets. */
const realFret = (c: Calibration, u: number) => {
  const p = imageAt(c, u, 0.5);
  return fretPosition(trueU({ x: p.x * W, y: p.y * H }));
};

/** Fret under neck-plane u by the measured wires: between wires n-1 and n is fret n. */
const fretByWires = (wires: number[], u: number) => {
  for (let n = 1; n < wires.length; n++) if (u < wires[n]) return u > wires[n - 1] ? n : null;
  return null;
};

function detected(look: Look): { c: Calibration; frets: FretWires } {
  const c = cal();
  const frets = detectFretWires(render(look), c);
  assert.ok(frets, "no wires detected");
  return { c, frets: frets! };
}

test("detectFretWires: measured wires land on the real ones despite lens bend and off clicks", () => {
  const { c, frets } = detected(ROSEWOOD);
  for (let n = 1; n <= 18; n++) {
    const err = Math.abs(realFret(c, frets.wires[n]) - n);
    assert.ok(err < 0.15, `wire ${n} off by ${err.toFixed(2)} frets (found: ${frets.found[n]})`);
  }
  assert.ok(frets.found.filter(Boolean).length >= 16, `only ${frets.found.filter(Boolean).length} wires measured`);
});

test("detectFretWires: every fret reads right where the 12-TET model alone misreads some", () => {
  const { c, frets } = detected(ROSEWOOD);
  let byModel = 0;
  let byWires = 0;
  // Past the 12th the wide lens bends the frets away from the model by up to
  // two frets by the 18th (the scene's own check: m-errors in the debug run).
  for (let n = 1; n <= 18; n++) {
    // A fingertip in the middle of fret n on the G string, as the camera sees it.
    const p = seen((wireU(n - 1) + wireU(n)) / 2, 0.6);
    const read = neckUV(c, { x: p.x / W, y: p.y / H });
    if (fretAt(read.x) === n) byModel++;
    if (fretByWires(frets.wires, read.x) === n) byWires++;
  }
  assert.equal(byWires, 18);
  assert.ok(byModel < 18, `the model alone read all ${byModel} right: the scene isn't testing anything`);
});

test("detectFretWires: a maple board (darker wires on a light board) picks the other polarity", () => {
  const { c, frets } = detected(MAPLE);
  for (let n = 1; n <= 12; n++) assert.ok(Math.abs(realFret(c, frets.wires[n]) - n) < 0.15, `maple wire ${n}`);
});

test("detectFretWires: a hand over the first frets is filled in from the fitted curve", () => {
  const { c, frets } = detected({ ...ROSEWOOD, hand: [0.03, wireU(4) + 0.004] });
  for (let n = 5; n <= 12; n++) assert.ok(frets.found[n], `wire ${n} should be measured`);
  for (let n = 1; n <= 4; n++) assert.ok(Math.abs(realFret(c, frets.wires[n]) - n) < 0.25, `hidden wire ${n} filled badly`);
});

test("detectFretWires: nothing that looks like frets returns null, keeping the model", () => {
  const blank: Gray = { data: new Float32Array(W * H).fill(90), width: W, height: H };
  assert.equal(detectFretWires(blank, cal()), null);
});
