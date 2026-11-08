/**
 * Follows the guitar neck after a one-time calibration (plan: Step 2b), so
 * the player doesn't have to hold the guitar still. Pure math on grayscale
 * frames (no DOM), tested under node:test with synthetic images.
 *
 * 1. Shi-Tomasi corners inside the calibrated neck area (string/fret
 *    crossings, inlay dots), away from the fretting hand.
 * 2. Pyramidal Lucas-Kanade optical flow follows each one frame to frame,
 *    with a forward-backward check: a point that doesn't track back to where
 *    it started is dropped.
 * 3. RANSAC fits the homography from each point's position in the
 *    calibration frame to where it is now. Points dragged along by moving
 *    fingers disagree with the neck's motion and are left out as outliers.
 * 4. That homography moves the four calibration corners.
 *
 * Every frame is matched against the calibration frame, not the previous
 * one, so the error doesn't pile up frame after frame. Coordinates here are
 * pixels of the (downscaled) tracking image.
 */
import { applyHomography, solveHomography, type Homography, type Vec2 } from "./fretMapping.ts";

export type Gray = { data: Float32Array; width: number; height: number };

const LEVELS = 3; // pyramid levels: each halves the size, so ~8× the motion range of one level
const WINDOW_RADIUS = 4; // 9×9 LK window
const LK_ITERATIONS = 12;
const LK_EPSILON = 0.01;
const FORWARD_BACKWARD_MAX = 1; // px a point may miss its start by when tracked back
const MAX_FEATURES = 80;
const MIN_DISTANCE = 7; // px between chosen corners
const CORNER_QUALITY = 0.03; // share of the strongest corner's score a corner needs
const HAND_EXCLUSION = 18; // px around each hand landmark where no feature is picked
const REDETECT_BELOW = 30; // tracked points left before topping them up
const RANSAC_ITERATIONS = 250;
const RANSAC_THRESHOLD = 2; // px
const MIN_INLIERS = 10;
const MIN_INLIER_SHARE = 0.4;
/** New points are only added while the fit is this trustworthy: their calibration-frame
 *  position comes from the fit, so adding them from a shaky fit bakes its error in. */
const REDETECT_MIN_INLIERS = 12;
const REDETECT_MAX_RESIDUAL = 0.75; // px, mean

// ---------------------------------------------------------------- images

function at(g: Gray, x: number, y: number): number {
  const xi = Math.min(g.width - 1, Math.max(0, x));
  const yi = Math.min(g.height - 1, Math.max(0, y));
  return g.data[yi * g.width + xi];
}

/** Bilinear sample, edges clamped. */
function sample(g: Gray, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const a = at(g, x0, y0);
  const b = at(g, x0 + 1, y0);
  const c = at(g, x0, y0 + 1);
  const d = at(g, x0 + 1, y0 + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Half size, 2×2 average. Floor of the size: every source pixel read is in range, no clamping. */
function downsample(g: Gray): Gray {
  const width = Math.max(1, Math.floor(g.width / 2));
  const height = Math.max(1, Math.floor(g.height / 2));
  const data = new Float32Array(width * height);
  const src = g.data;
  const w = g.width;
  for (let y = 0; y < height; y++) {
    const row = 2 * y * w;
    for (let x = 0; x < width; x++) {
      const i = row + 2 * x;
      data[y * width + x] = (src[i] + src[i + 1] + src[i + w] + src[i + w + 1]) / 4;
    }
  }
  return { data, width, height };
}

/**
 * Central-difference gradients. These two passes over every pixel of every
 * pyramid level are most of a tracking frame's cost, so the interior is read
 * by direct index; only the one-pixel border goes through the clamped `at`.
 */
function gradients(g: Gray): { gx: Gray; gy: Gray } {
  const { width: w, height: h, data: d } = g;
  const gx = new Float32Array(d.length);
  const gy = new Float32Array(d.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) {
      gx[i] = (d[i + 1] - d[i - 1]) / 2;
      gy[i] = (d[i + w] - d[i - w]) / 2;
    }
  }
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      gx[y * w + x] = (at(g, x + 1, y) - at(g, x - 1, y)) / 2;
      gy[y * w + x] = (at(g, x, y + 1) - at(g, x, y - 1)) / 2;
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      gx[y * w + x] = (at(g, x + 1, y) - at(g, x - 1, y)) / 2;
      gy[y * w + x] = (at(g, x, y + 1) - at(g, x, y - 1)) / 2;
    }
  }
  return { gx: { data: gx, width: w, height: h }, gy: { data: gy, width: w, height: h } };
}

type Level = { image: Gray; gx: Gray; gy: Gray };
export type Pyramid = Level[];

export function buildPyramid(frame: Gray): Pyramid {
  const levels: Pyramid = [];
  let image = frame;
  for (let l = 0; l < LEVELS; l++) {
    levels.push({ image, ...gradients(image) });
    image = downsample(image);
  }
  return levels;
}

// ---------------------------------------------------------- corners (1)

/** Is p inside the convex polygon (any winding)? */
function insideConvex(p: Vec2, poly: Vec2[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
  }
  return true;
}

/**
 * Shi-Tomasi: the smaller eigenvalue of the 5×5 structure tensor. Large
 * only where the image changes in two directions (a corner) — not along a
 * single edge, where optical flow can't tell motion along the edge apart.
 */
export function findCorners(level: Level, region: Vec2[], exclude: Vec2[], keep: Vec2[] = []): Vec2[] {
  const { image, gx, gy } = level;
  const xs = region.map((p) => p.x);
  const ys = region.map((p) => p.y);
  const x0 = Math.max(3, Math.floor(Math.min(...xs)));
  const x1 = Math.min(image.width - 4, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(3, Math.floor(Math.min(...ys)));
  const y1 = Math.min(image.height - 4, Math.ceil(Math.max(...ys)));
  const candidates: { p: Vec2; score: number }[] = [];
  let best = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const p = { x, y };
      if (!insideConvex(p, region)) continue;
      if (exclude.some((e) => Math.hypot(e.x - x, e.y - y) < HAND_EXCLUSION)) continue;
      let a = 0;
      let b = 0;
      let c = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const ix = at(gx, x + dx, y + dy);
          const iy = at(gy, x + dx, y + dy);
          a += ix * ix;
          b += ix * iy;
          c += iy * iy;
        }
      }
      const score = (a + c) / 2 - Math.sqrt(((a - c) / 2) ** 2 + b * b);
      if (score > 0) {
        candidates.push({ p, score });
        best = Math.max(best, score);
      }
    }
  }
  candidates.sort((m, n) => n.score - m.score);
  const chosen: Vec2[] = [];
  const taken = [...keep];
  for (const { p, score } of candidates) {
    if (score < CORNER_QUALITY * best || chosen.length + keep.length >= MAX_FEATURES) break;
    if (taken.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < MIN_DISTANCE)) continue;
    chosen.push(p);
    taken.push(p);
  }
  return chosen;
}

// ------------------------------------------------------ optical flow (2)

/**
 * Pyramidal Lucas-Kanade (Bouguet's formulation): solve for the
 * displacement that best matches a 9×9 window around `p` in `from` with
 * `to`, coarse level first, each level refining the one above. null when
 * the window has no texture to lock onto or the point leaves the frame.
 */
function lucasKanade(from: Pyramid, to: Pyramid, p: Vec2): Vec2 | null {
  let gx = 0;
  let gy = 0;
  for (let l = from.length - 1; l >= 0; l--) {
    const scale = 2 ** l;
    const px = p.x / scale;
    const py = p.y / scale;
    const { image: I, gx: Ix, gy: Iy } = from[l];
    const J = to[l].image;
    let gxx = 0;
    let gxy = 0;
    let gyy = 0;
    const patch: [number, number, number][] = [];
    for (let dy = -WINDOW_RADIUS; dy <= WINDOW_RADIUS; dy++) {
      for (let dx = -WINDOW_RADIUS; dx <= WINDOW_RADIUS; dx++) {
        const ix = sample(Ix, px + dx, py + dy);
        const iy = sample(Iy, px + dx, py + dy);
        gxx += ix * ix;
        gxy += ix * iy;
        gyy += iy * iy;
        patch.push([sample(I, px + dx, py + dy), ix, iy]);
      }
    }
    const det = gxx * gyy - gxy * gxy;
    if (det < 1e-6) return null;
    let vx = 0;
    let vy = 0;
    for (let k = 0; k < LK_ITERATIONS; k++) {
      let bx = 0;
      let by = 0;
      let i = 0;
      for (let dy = -WINDOW_RADIUS; dy <= WINDOW_RADIUS; dy++) {
        for (let dx = -WINDOW_RADIUS; dx <= WINDOW_RADIUS; dx++, i++) {
          const [value, ix, iy] = patch[i];
          const diff = value - sample(J, px + dx + gx + vx, py + dy + gy + vy);
          bx += diff * ix;
          by += diff * iy;
        }
      }
      const ux = (gyy * bx - gxy * by) / det;
      const uy = (gxx * by - gxy * bx) / det;
      vx += ux;
      vy += uy;
      if (Math.hypot(ux, uy) < LK_EPSILON) break;
    }
    if (l > 0) {
      gx = 2 * (gx + vx);
      gy = 2 * (gy + vy);
    } else {
      gx += vx;
      gy += vy;
    }
  }
  const q = { x: p.x + gx, y: p.y + gy };
  const { width, height } = from[0].image;
  return q.x >= 0 && q.y >= 0 && q.x < width && q.y < height ? q : null;
}

// ----------------------------------------------------------- RANSAC (3)

/** Small deterministic PRNG (mulberry32), so RANSAC is reproducible in tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Fit = { h: Homography; inliers: boolean[]; residual: number };

/** 3×3 row-major product. */
function multiply(a: number[], b: number[]): number[] {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return out;
}

/** Solves the square system m·x = v (Gaussian elimination, partial pivoting); null if singular. */
function solveLinear(m: number[][], v: number[]): number[] | null {
  const n = v.length;
  const a = m.map((row, i) => [...row, v[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = a[row][col] / a[col][col];
      for (let k = col; k <= n; k++) a[row][k] -= f * a[col][k];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

/** Hartley normalization: centroid to the origin, mean distance √2. Returns the transform and its inverse. */
function normalization(points: Vec2[]): { t: number[]; inverse: number[] } {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const mean = points.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / points.length || 1;
  const k = Math.SQRT2 / mean;
  return { t: [k, 0, -k * cx, 0, k, -k * cy, 0, 0, 1], inverse: [1 / k, 0, cx, 0, 1 / k, cy, 0, 0, 1] };
}

/**
 * Least-squares homography over all given pairs (normalized DLT, h33 = 1,
 * solved through the 8×8 normal equations). RANSAC's winning model comes
 * from just 4 points and carries their noise; refitting on every inlier
 * averages it out.
 */
export function fitHomography(from: Vec2[], to: Vec2[]): Homography | null {
  if (from.length < 4) return null;
  const nf = normalization(from);
  const nt = normalization(to);
  const ata = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const atb = new Array(8).fill(0);
  from.forEach((p0, i) => {
    const p = applyHomography(nf.t, p0);
    const q = applyHomography(nt.t, to[i]);
    const rows: [number[], number][] = [
      [[p.x, p.y, 1, 0, 0, 0, -p.x * q.x, -p.y * q.x], q.x],
      [[0, 0, 0, p.x, p.y, 1, -p.x * q.y, -p.y * q.y], q.y],
    ];
    for (const [row, rhs] of rows) {
      for (let r = 0; r < 8; r++) {
        atb[r] += row[r] * rhs;
        for (let c = 0; c < 8; c++) ata[r][c] += row[r] * row[c];
      }
    }
  });
  const h = solveLinear(ata, atb);
  if (!h) return null;
  const out = multiply(nt.inverse, multiply([...h, 1], nf.t));
  return out.map((v) => v / out[8]);
}

function inliersOf(h: Homography, from: Vec2[], to: Vec2[]): { inliers: boolean[]; residual: number } {
  let total = 0;
  let count = 0;
  const inliers = from.map((p, i) => {
    const q = applyHomography(h, p);
    const e = Math.hypot(q.x - to[i].x, q.y - to[i].y);
    const ok = e < RANSAC_THRESHOLD;
    if (ok) {
      total += e;
      count++;
    }
    return ok;
  });
  return { inliers, residual: count ? total / count : Infinity };
}

/** The homography most correspondences agree on, refit on all of them; null when too few agree. */
export function ransacHomography(from: Vec2[], to: Vec2[], random: () => number = Math.random): Fit | null {
  const n = from.length;
  if (n < MIN_INLIERS) return null;
  let best: Fit | null = null;
  let bestCount = 0;
  for (let it = 0; it < RANSAC_ITERATIONS; it++) {
    const picks = new Set<number>();
    while (picks.size < 4) picks.add(Math.floor(random() * n));
    const idx = [...picks];
    const h = solveHomography(
      idx.map((i) => from[i]),
      idx.map((i) => to[i]),
    );
    if (!h) continue;
    const { inliers, residual } = inliersOf(h, from, to);
    const count = inliers.filter(Boolean).length;
    if (count > bestCount) {
      bestCount = count;
      best = { h, inliers, residual };
    }
  }
  if (!best || bestCount < MIN_INLIERS || bestCount < MIN_INLIER_SHARE * n) return null;
  // Refit on the consensus, then once more on the consensus of the refit.
  for (let round = 0; round < 2; round++) {
    const keep = best.inliers;
    const refit = fitHomography(
      from.filter((_, i) => keep[i]),
      to.filter((_, i) => keep[i]),
    );
    if (!refit) break;
    const scored = inliersOf(refit, from, to);
    if (scored.inliers.filter(Boolean).length < MIN_INLIERS) break;
    best = { h: refit, ...scored };
  }
  return best;
}

// --------------------------------------------------------------- tracker

type Feature = { reference: Vec2; current: Vec2 };
export type TrackResult = {
  /** Calibration corners where the neck is now (tracking pixels), or null when the neck is lost. */
  corners: Vec2[] | null;
  tracked: number;
  inliers: number;
};

export class NeckTracker {
  private features: Feature[];
  private previous: Pyramid;
  private referenceCorners: Vec2[];
  private random: () => number;

  /** `corners`: the four calibration corners in the calibration frame; `exclude`: hand landmarks to keep features off. */
  constructor(frame: Gray, corners: Vec2[], exclude: Vec2[] = [], random: () => number = Math.random) {
    this.previous = buildPyramid(frame);
    this.referenceCorners = corners;
    this.random = random;
    this.features = findCorners(this.previous[0], neckRegion(corners), exclude).map((p) => ({ reference: p, current: p }));
  }

  get featureCount(): number {
    return this.features.length;
  }

  /** Where the tracked points are now (tracking pixels), for drawing them. */
  get points(): Vec2[] {
    return this.features.map((f) => f.current);
  }

  update(frame: Gray, exclude: Vec2[] = []): TrackResult {
    const next = buildPyramid(frame);
    const kept: Feature[] = [];
    for (const f of this.features) {
      const forward = lucasKanade(this.previous, next, f.current);
      if (!forward) continue;
      const backward = lucasKanade(next, this.previous, forward);
      if (!backward || Math.hypot(backward.x - f.current.x, backward.y - f.current.y) > FORWARD_BACKWARD_MAX) continue;
      kept.push({ reference: f.reference, current: forward });
    }
    this.previous = next;

    const fit = ransacHomography(
      kept.map((f) => f.reference),
      kept.map((f) => f.current),
      this.random,
    );
    if (!fit) {
      this.features = kept;
      return { corners: null, tracked: kept.length, inliers: 0 };
    }
    // Points that disagree with the neck's motion were on a finger or lost
    // their match: drop them for good.
    this.features = kept.filter((_, i) => fit.inliers[i]);
    const corners = this.referenceCorners.map((c) => applyHomography(fit.h, c));

    const inlierCount = fit.inliers.filter(Boolean).length;
    if (this.features.length < REDETECT_BELOW && inlierCount >= REDETECT_MIN_INLIERS && fit.residual <= REDETECT_MAX_RESIDUAL) {
      // Top up from what's visible now; their calibration-frame position is
      // where the current fit says they came from.
      const back = solveHomography(corners, this.referenceCorners);
      if (back) {
        const fresh = findCorners(next[0], neckRegion(corners), exclude, this.features.map((f) => f.current));
        for (const p of fresh) this.features.push({ reference: applyHomography(back, p), current: p });
      }
    }
    return { corners, tracked: kept.length, inliers: inlierCount };
  }
}

/**
 * Where to look for features: the calibration quad (nut to the calibrated
 * fret, outer strings), widened across to take in the fretboard's edges,
 * and lengthened both ways: back over the headstock (rigid with the neck,
 * full of corners — tuners, logo — and almost never under the fretting
 * hand, which mostly sits near the nut) and on past the calibrated fret.
 * A long baseline matters: with the hand covering the nut end, only points
 * far from it remain, and the corners near the nut are extrapolated from
 * them. Straight-line extension in the image, ignoring perspective — it's
 * only a search area.
 */
const WIDEN_ACROSS = 0.25;
const EXTEND_BACK = 0.3; // of the nut-to-fret length, over the headstock
const EXTEND_FORWARD = 0.2;
function neckRegion(corners: Vec2[]): Vec2[] {
  const [nutLow, nutHigh, fretLow, fretHigh] = corners;
  const along = (from: Vec2, to: Vec2, t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  const ends = [
    along(nutLow, fretLow, -EXTEND_BACK),
    along(nutHigh, fretHigh, -EXTEND_BACK),
    along(nutHigh, fretHigh, 1 + EXTEND_FORWARD),
    along(nutLow, fretLow, 1 + EXTEND_FORWARD),
  ];
  const [backLow, backHigh, frontHigh, frontLow] = ends;
  return [
    along(backHigh, backLow, 1 + WIDEN_ACROSS),
    along(backLow, backHigh, 1 + WIDEN_ACROSS),
    along(frontLow, frontHigh, 1 + WIDEN_ACROSS),
    along(frontHigh, frontLow, 1 + WIDEN_ACROSS),
  ];
}
