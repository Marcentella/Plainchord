/**
 * Measures where the fret wires really are (plan: Step 2c), instead of only
 * predicting them from two calibration clicks. Pure, tested under node:test.
 *
 * The 12-TET model fits every guitar (scale length cancels out), so a missed
 * fret comes from the clicks being a few px off, the camera lens bending
 * straight lines, or far frets being only a few px apart. All three are
 * fixed by looking:
 *
 * 1. Rectify: sample the frame along the calibrated neck — nut on the left,
 *    body on the right — in rows between the outer strings.
 * 2. Ridge profile: a thin-line filter along each row; the rows combined by
 *    median, so a dot inlay, a string glint or a finger on a few rows doesn't
 *    move the result. Both polarities: bright wires on a dark (rosewood)
 *    board, darker wires on a light (maple) one.
 * 3. Match inside the clicked span (nut to the calibration fret), where the
 *    model is interpolating and close: each predicted wire takes the nearest
 *    peak, and a curve u_true = a + b·u + c·u² is fitted through the matches
 *    and the nut (a, b absorb click error, c the lens bend), then matched again.
 * 4. Walk outward past the clicked fret one wire at a time, each predicted
 *    from the last two with equal temperament's fixed spacing ratio 2^(−1/12).
 *    A single global curve drifted over half a fret past the 13th on a wide
 *    lens and latched onto the neighbouring wire; stepping locally follows
 *    the bend instead. A wire not found is stepped over, its place predicted.
 * 5. Too few wires found: null, and the 12-TET model stays.
 *
 * Positions are u in the calibration's neck plane (fraction of the scale
 * length, as lib/fretMapping.ts), so they ride along with neck following.
 */
import { LAST_READ_FRET, imageAt, wireU, type Calibration } from "./fretMapping.ts";
import type { Gray } from "./neckTracking.ts";

export type FretWires = {
  /** u of each wire, 0 (the nut) … LAST_READ_FRET, strictly increasing. */
  wires: number[];
  /** Whether each wire was measured (true) or filled in from the fitted curve. */
  found: boolean[];
  /** RMS distance of the measured wires from the fitted curve, in fret spaces. */
  residual: number;
};

const ROWS = 24;
const V_FROM = 0.1;
const V_TO = 0.9;
/** Just behind the nut to a little past the last wire read. */
const U_FROM = -0.01;
const U_TO = wireU(LAST_READ_FRET + 1);
/** Samples per image pixel along the neck. */
const OVERSAMPLE = 2;
/** Width of the thin-line filter, in samples: a fret wire is ~1-3 px wide. */
const SIGMA = 1.5;
/** A peak must clear the profile's median by this many MADs. */
const PEAK_MADS = 3;
/** How far from its prediction a wire may be matched, as a share of the fret space there. */
const MATCH_WINDOW = 0.35;
/** A matched peak this far from the fitted curve is replaced by the curve. */
const AGREE = 0.15;
const ICP_ROUNDS = 3;
const MIN_MATCHES = 6;
const MIN_SPAN = 8;
/** Fret space ratio between consecutive frets in equal temperament. */
const STEP_RATIO = 2 ** (-1 / 12);
/** Walking outward, give up after this many wires in a row aren't found. */
const MAX_MISSES = 3;

function sample(g: Gray, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= g.width - 1 || y0 >= g.height - 1) return NaN;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * g.width + x0;
  const a = g.data[i];
  const b = g.data[i + 1];
  const c = g.data[i + g.width];
  const d = g.data[i + g.width + 1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Zero-mean "Mexican hat" (negative 2nd derivative of a Gaussian): peaks on a thin bright line. */
function ridgeKernel(sigma: number): number[] {
  const r = Math.ceil(sigma * 3);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => {
    const x = i - r;
    return (1 - (x * x) / (sigma * sigma)) * Math.exp(-(x * x) / (2 * sigma * sigma));
  });
  const mean = k.reduce((s, v) => s + v, 0) / k.length;
  return k.map((v) => v - mean);
}

function median(values: number[]): number {
  const s = values.filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
}

/** The thin-line response along the neck, one value per sample, rows combined by median. */
export function ridgeProfile(gray: Gray, cal: Calibration): { u: number[]; bright: number[] } {
  const px = (u: number, v: number) => {
    const q = imageAt(cal, u, v);
    return { x: q.x * gray.width, y: q.y * gray.height };
  };
  const a = px(U_FROM, 0.5);
  const b = px(U_TO, 0.5);
  const n = Math.max(64, Math.round(Math.hypot(b.x - a.x, b.y - a.y) * OVERSAMPLE));
  const u = Array.from({ length: n }, (_, i) => U_FROM + ((U_TO - U_FROM) * i) / (n - 1));
  const kernel = ridgeKernel(SIGMA);
  const r = (kernel.length - 1) / 2;
  const rows: number[][] = [];
  for (let j = 0; j < ROWS; j++) {
    const v = V_FROM + ((V_TO - V_FROM) * j) / (ROWS - 1);
    const line = u.map((uu) => {
      const p = px(uu, v);
      return sample(gray, p.x, p.y);
    });
    rows.push(
      line.map((_, i) => {
        let sum = 0;
        for (let k = -r; k <= r; k++) {
          const value = line[i + k];
          if (value === undefined || Number.isNaN(value)) return NaN;
          sum += kernel[k + r] * value;
        }
        return sum;
      }),
    );
  }
  return { u, bright: u.map((_, i) => median(rows.map((row) => row[i]))) };
}

function peaks(u: number[], profile: number[]): number[] {
  const valid = profile.filter((v) => !Number.isNaN(v));
  const m = median(valid);
  const mad = median(valid.map((v) => Math.abs(v - m))) || 1e-9;
  const threshold = m + PEAK_MADS * mad;
  const found: number[] = [];
  for (let i = 2; i < profile.length - 2; i++) {
    const p = profile[i];
    if (!(p > threshold) || !(p > 0)) continue;
    if (p >= profile[i - 1] && p >= profile[i - 2] && p > profile[i + 1] && p > profile[i + 2]) {
      // Parabolic refinement of the peak between samples.
      const l = profile[i - 1];
      const rr = profile[i + 1];
      const denom = l - 2 * p + rr;
      const offset = denom !== 0 ? (0.5 * (l - rr)) / denom : 0;
      found.push(u[i] + offset * (u[1] - u[0]));
    }
  }
  return found;
}

/** Least squares for y = a + b·x (+ c·x²); null if singular. */
function fitCurve(xs: number[], ys: number[], quadratic: boolean): number[] | null {
  const m = quadratic ? 3 : 2;
  const ata = Array.from({ length: m }, () => new Array(m).fill(0));
  const aty = new Array(m).fill(0);
  xs.forEach((x, i) => {
    const row = quadratic ? [1, x, x * x] : [1, x];
    for (let r = 0; r < m; r++) {
      aty[r] += row[r] * ys[i];
      for (let c = 0; c < m; c++) ata[r][c] += row[r] * row[c];
    }
  });
  // Gaussian elimination, partial pivoting.
  const a = ata.map((row, i) => [...row, aty[i]]);
  for (let col = 0; col < m; col++) {
    let pivot = col;
    for (let row = col + 1; row < m; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-14) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let row = 0; row < m; row++) {
      if (row === col) continue;
      const f = a[row][col] / a[col][col];
      for (let k = col; k <= m; k++) a[row][k] -= f * a[col][k];
    }
  }
  const coef = a.map((row, i) => row[m] / row[i]);
  return quadratic ? coef : [...coef, 0];
}

const curveAt = (c: number[], x: number) => c[0] + c[1] * x + c[2] * x * x;

/** Fret space around wire n, in u. */
function spaceAt(n: number): number {
  return Math.min(n > 0 ? wireU(n) - wireU(n - 1) : Infinity, wireU(n + 1) - wireU(n));
}

function nearest(found: number[], target: number, window: number): number | null {
  let best: number | null = null;
  for (const p of found) if (Math.abs(p - target) < window && (best === null || Math.abs(p - target) < Math.abs(best - target))) best = p;
  return best;
}

function match(found: number[], calibrationFret: number): { result: FretWires; matches: number } | null {
  if (found.length < MIN_MATCHES) return null;

  // 3. Inside the clicked span: fit a curve through the matches and the nut.
  let curve = [0, 1, 0];
  let inner: { n: number; peak: number }[] = [];
  for (let round = 0; round < ICP_ROUNDS; round++) {
    inner = [];
    for (let n = 1; n <= calibrationFret; n++) {
      const best = nearest(found, curveAt(curve, wireU(n)), MATCH_WINDOW * spaceAt(n) * curve[1]);
      if (best !== null) inner.push({ n, peak: best });
    }
    if (inner.length < Math.min(MIN_MATCHES, calibrationFret - 1)) return null;
    // The nut is where the user clicked it: an anchor the fit has to pass near.
    const xs = [0, 0, ...inner.map((p) => wireU(p.n))];
    const ys = [0, 0, ...inner.map((p) => p.peak)];
    const fitted = fitCurve(xs, ys, inner.length >= 6);
    if (!fitted) return null;
    curve = fitted;
  }

  const wires: (number | null)[] = new Array(LAST_READ_FRET + 1).fill(null);
  const isFound: boolean[] = new Array(LAST_READ_FRET + 1).fill(false);
  let squares = 0;
  let agreeing = 0;
  const accept = (n: number, peak: number | null, predicted: number, space: number) => {
    const off = peak === null ? Infinity : Math.abs(peak - predicted) / space;
    if (peak !== null && off < AGREE) {
      wires[n] = peak;
      isFound[n] = true;
      squares += off * off;
      agreeing++;
    } else {
      wires[n] = predicted;
    }
  };
  wires[0] = curveAt(curve, 0);
  for (let n = 1; n <= calibrationFret; n++) {
    const predicted = curveAt(curve, wireU(n));
    accept(n, inner.find((p) => p.n === n)?.peak ?? null, predicted, spaceAt(n) * curve[1]);
  }

  // 4. Outward, one wire at a time, from the last two.
  let misses = 0;
  for (let n = calibrationFret + 1; n <= LAST_READ_FRET; n++) {
    const space = (wires[n - 1]! - wires[n - 2]!) * STEP_RATIO;
    const predicted = wires[n - 1]! + space;
    const peak = misses < MAX_MISSES ? nearest(found, predicted, MATCH_WINDOW * space) : null;
    // Within the walk the prediction is local, so a peak inside the window is taken as is.
    if (peak !== null) {
      wires[n] = peak;
      isFound[n] = true;
      agreeing++;
      misses = 0;
    } else {
      wires[n] = predicted;
      misses++;
    }
  }

  const result = wires as number[];
  for (let n = 1; n < result.length; n++) if (!(result[n] > result[n - 1])) return null;
  const foundOnes = isFound.map((f, n) => (f ? n : -1)).filter((n) => n > 0);
  if (agreeing < MIN_MATCHES || foundOnes[foundOnes.length - 1] - foundOnes[0] < MIN_SPAN) return null;
  return { result: { wires: result, found: isFound, residual: Math.sqrt(squares / Math.max(1, agreeing)) }, matches: agreeing };
}

/**
 * Finds the fret wires on `gray` (the full-resolution frame, pixels) for
 * calibration `cal` (normalized image coordinates). null when too few wires
 * show up to trust: keep the 12-TET model then.
 */
export function detectFretWires(gray: Gray, cal: Calibration): FretWires | null {
  const { u, bright } = ridgeProfile(gray, cal);
  const dark = bright.map((v) => -v);
  const candidates = [match(peaks(u, bright), cal.fret), match(peaks(u, dark), cal.fret)].filter((c) => c !== null);
  if (candidates.length === 0) return null;
  // Whichever polarity explains more wires; ties to the tighter fit.
  candidates.sort((a, b) => b.matches - a.matches || a.result.residual - b.result.residual);
  return candidates[0].result;
}
