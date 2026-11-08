/**
 * Camera image -> fretboard geometry for the fingering check (plan: Step 2).
 * Pure math, no DOM, tested under node:test.
 *
 * The user clicks where the two outer strings cross the nut, then where
 * they cross one fret wire (5th, 7th or 12th). A homography (projective
 * transform) maps the image onto a flat, true-to-scale "neck plane":
 *   x = distance from the nut as a fraction of the scale length
 *       (0 at the nut, 0.5 at the 12th fret, 1 at the bridge)
 *   y = across the neck, same unit, 0 on the centre line
 * which undoes the camera's perspective for anything lying on the
 * fretboard. In equal temperament fret n's wire sits at x = 1 − 2^(−n/12),
 * so one calibrated wire fixes every other.
 *
 * The plane is NOT a rectangle: the strings fan out from ~35 mm apart at
 * the nut toward the bridge (~44 mm at the 12th fret). Modelling it as a
 * rectangle made the homography read that widening as perspective (the far
 * end "closer to the camera") and squeezed the frets toward the nut by
 * about a fret mid-neck when calibrating on the 12th (real camera, second
 * test). `u`/`v` below are the reading coordinates: u = x, v = 0 on the low
 * E string and 1 on the high e at that point along the fan.
 *
 * Image points are normalized 0-1 and unmirrored (MediaPipe's own frame);
 * a mirrored display is undone before clicks reach here.
 */

export type Vec2 = { x: number; y: number };
/** 3×3 row-major, h[8] = 1. */
export type Homography = number[];

/** Strings across the neck, 0 = low E ... 5 = high e (same order as Chord.frets). */
const STRINGS = 6;
/** Frets a calibration can be clicked on: 12 (double dot) is easiest to spot and covers the most neck. */
export const CALIBRATION_FRETS = [5, 7, 12] as const;
export type CalibrationFret = (typeof CALIBRATION_FRETS)[number];
/** Readings stop here: past it the fretting hand is over the body. */
export const LAST_READ_FRET = 20;

/** u of fret n's wire. */
export function wireU(n: number): number {
  return 1 - 2 ** (-n / 12);
}

/**
 * Low E to high e distance at u, in scale lengths: linear from the nut to
 * the bridge (Fender-style figures, 35 mm and 52.5 mm on a 648 mm scale;
 * other guitars differ by a few mm, which moves readings far less than a
 * string spacing).
 */
const SPREAD_AT_NUT = 35 / 648;
const SPREAD_AT_BRIDGE = 52.5 / 648;
export function stringSpread(u: number): number {
  return SPREAD_AT_NUT + (SPREAD_AT_BRIDGE - SPREAD_AT_NUT) * u;
}

/** Continuous fret position of u: 2.5 = halfway between the 2nd and 3rd wires. NaN at or past the bridge. */
export function fretPosition(u: number): number {
  return u < 1 ? -12 * Math.log2(1 - u) : NaN;
}

/**
 * Solves the homography taking each `from[i]` to `to[i]` (four pairs).
 * Eight equations, eight unknowns (h33 fixed at 1), Gaussian elimination
 * with partial pivoting. null when the points are degenerate (three on a
 * line, two the same): no transform exists.
 */
export function solveHomography(from: Vec2[], to: Vec2[]): Homography | null {
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    a.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u]);
    a.push([0, 0, 0, x, y, 1, -x * v, -y * v, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-10) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const factor = a[row][col] / a[col][col];
      for (let k = col; k < 9; k++) a[row][k] -= factor * a[col][k];
    }
  }
  return [...a.map((row, i) => row[8] / row[i]), 1];
}

/** Denominator of a homography at p: its sign flips across the "horizon", where the transform folds. */
function depth(h: Homography, p: Vec2): number {
  return h[6] * p.x + h[7] * p.y + h[8];
}

export function applyHomography(h: Homography, p: Vec2): Vec2 {
  const w = depth(h, p);
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

export type Calibration = {
  /** Image -> neck plane. */
  toNeck: Homography;
  /** Neck plane -> image, for drawing the grid back over the video. */
  toImage: Homography;
  fret: CalibrationFret;
  /** The clicks, reordered: nut × low E, nut × high e, fret × low E, fret × high e. */
  corners: Vec2[];
};

export type CalibrationError = "degenerate" | "shape" | "proportion";

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/**
 * Puts four clicks (two on the nut, then two on the fret wire, either end
 * first) in a fixed order, so the user can't get it wrong:
 * - the fret pair is matched to the nut pair the way that doesn't cross
 *   (crossed string sides is the "bow tie" a wrong order produces);
 * - the low E side is the one higher on screen. Holding a guitar, the low
 *   E is the string nearest the face, so it's the upper edge of the neck in
 *   a camera facing the player — mirrored or not, right- or left-handed.
 *   (A neck held near vertical, classical style, would break this.)
 */
export function orderCorners(clicks: Vec2[]): Vec2[] {
  const [n1, n2, f1, f2] = clicks;
  const [fa, fb] = dist(n1, f1) + dist(n2, f2) <= dist(n1, f2) + dist(n2, f1) ? [f1, f2] : [f2, f1];
  const sideA = (n1.y + fa.y) / 2;
  const sideB = (n2.y + fb.y) / 2;
  return sideA <= sideB ? [n1, n2, fa, fb] : [n2, n1, fb, fa];
}

/**
 * Seen at an angle the neck's length shrinks (foreshortening) and the far
 * end narrows (perspective), so the bounds are wide: they only catch clicks
 * no guitar could produce. Ratios are measured against what a flat-on view
 * would show.
 */
const LENGTH_RATIO_RANGE = [0.25, 3];
const END_WIDTH_RATIO_RANGE = [0.4, 2.5];

/**
 * `ordered`: the points are already nut × low E, nut × high e, fret × low E,
 * fret × high e — neck following (lib/neckTracking.ts) moves the corners of
 * an existing calibration, and re-guessing the order from screen position
 * could flip the strings if the neck tilts a long way.
 */
export function calibrate(clicks: Vec2[], fret: CalibrationFret, ordered = false): Calibration | CalibrationError {
  if (clicks.length !== 4) return "degenerate";
  const corners = ordered ? clicks : orderCorners(clicks);
  const [nutLow, nutHigh, fretLow, fretHigh] = corners;

  // Convex, consistently turning outline (nut low -> nut high -> fret high -> fret low).
  const outline = [nutLow, nutHigh, fretHigh, fretLow];
  const turns = outline.map((p, i) => cross(p, outline[(i + 1) % 4], outline[(i + 2) % 4]));
  if (!turns.every((t) => t > 0) && !turns.every((t) => t < 0)) return "shape";

  const at = wireU(fret);
  const nutWidth = dist(nutLow, nutHigh);
  const fretWidth = dist(fretLow, fretHigh);
  const mid = (a: Vec2, b: Vec2) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const length = dist(mid(nutLow, nutHigh), mid(fretLow, fretHigh));
  const lengthRatio = length / nutWidth / (at / stringSpread(0));
  const endRatio = fretWidth / nutWidth / (stringSpread(at) / stringSpread(0));
  if (
    nutWidth === 0 ||
    lengthRatio < LENGTH_RATIO_RANGE[0] ||
    lengthRatio > LENGTH_RATIO_RANGE[1] ||
    endRatio < END_WIDTH_RATIO_RANGE[0] ||
    endRatio > END_WIDTH_RATIO_RANGE[1]
  ) {
    return "proportion";
  }

  const plane = [
    { x: 0, y: -stringSpread(0) / 2 },
    { x: 0, y: stringSpread(0) / 2 },
    { x: at, y: -stringSpread(at) / 2 },
    { x: at, y: stringSpread(at) / 2 },
  ];
  const toNeck = solveHomography(corners, plane);
  const toImage = solveHomography(plane, corners);
  if (!toNeck || !toImage) return "degenerate";

  // The neck must not cross the transform's horizon anywhere it's read,
  // or the grid would fold back on itself past some fret.
  const reach = wireU(LAST_READ_FRET);
  const edge = [
    { x: 0, y: -stringSpread(0) },
    { x: 0, y: stringSpread(0) },
    { x: reach, y: -stringSpread(reach) },
    { x: reach, y: stringSpread(reach) },
  ].map((p) => depth(toImage, p));
  if (!edge.every((d) => d > 0) && !edge.every((d) => d < 0)) return "shape";

  return { toNeck, toImage, fret, corners };
}

export function isCalibration(result: Calibration | CalibrationError): result is Calibration {
  return typeof result !== "string";
}

/** Image point -> reading coordinates: u along the neck, v across the strings (0 low E, 1 high e). */
export function neckUV(cal: Calibration, p: Vec2): Vec2 {
  const q = applyHomography(cal.toNeck, p);
  return { x: q.x, y: q.y / stringSpread(q.x) + 0.5 };
}

/** Reading coordinates -> image point (drawing the grid over the video). */
export function imageAt(cal: Calibration, u: number, v: number): Vec2 {
  return applyHomography(cal.toImage, { x: u, y: (v - 0.5) * stringSpread(u) });
}

/** Band either side of a boundary where the previous reading is kept, so a fingertip right on a string line or fret wire doesn't flicker between two answers. In string spacings / fret spaces. */
const HYSTERESIS = 0.15;

/**
 * String under a point, or null off the neck. `previous` is last frame's
 * answer for the same finger (hysteresis).
 */
export function stringAt(v: number, previous: number | null = null): number | null {
  const s = v * (STRINGS - 1);
  if (s < -0.6 || s > STRINGS - 1 + 0.6) return null;
  if (previous !== null && Math.abs(s - previous) < 0.5 + HYSTERESIS) return previous;
  return Math.min(STRINGS - 1, Math.max(0, Math.round(s)));
}

/**
 * Fret a fingertip at u is pressing: between wires n−1 and n is fret n
 * (fingers press just behind a wire). null behind the nut or past
 * LAST_READ_FRET. `previous` as in stringAt.
 */
export function fretAt(u: number, previous: number | null = null): number | null {
  const n = fretPosition(u);
  if (!(n > -0.3) || n > LAST_READ_FRET) return null;
  if (previous !== null && n > previous - 1 - HYSTERESIS && n < previous + HYSTERESIS) return previous;
  return Math.max(1, Math.ceil(n));
}

/**
 * Where a finger actually presses: MediaPipe's tip landmark is the very
 * end of the finger, but the string is pressed by the pad just behind it,
 * so the point is pulled back toward the last joint (DIP).
 */
const PAD_PULLBACK = 0.3;
export function pressPoint(tip: Vec2, dip: Vec2): Vec2 {
  return { x: tip.x + (dip.x - tip.x) * PAD_PULLBACK, y: tip.y + (dip.y - tip.y) * PAD_PULLBACK };
}

/** Is a neck-plane point over the fretboard (with a margin), up to LAST_READ_FRET? */
export function onNeck(p: Vec2): boolean {
  return p.x > -0.03 && p.x < wireU(LAST_READ_FRET) && p.y > -0.25 && p.y < 1.25;
}
