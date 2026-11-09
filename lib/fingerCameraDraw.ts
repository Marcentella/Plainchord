/**
 * Canvas drawing for the camera fingering check (lib/useFingerCamera.ts):
 * hand skeleton, calibrated fret grid, tracked neck points, fingertips.
 * Every line gets a dark halo under it so it stays visible on pale skin, a
 * white guitar body, or a dark room (first real-camera tests).
 */
import type { TrackedHand } from "./handTracking";
import { LAST_READ_FRET, imageAt, wireAt, type Calibration, type Vec2 } from "./fretMapping";

const HALO = "rgba(0,0,0,0.75)";
const BONE = "#7dd3fc";
export const GRID_COLOR = "#facc15";

/** MediaPipe's thumb chain (1-4). It's behind the neck while fretting, so the
 *  model guesses it and it jumps around; it's never read, so it isn't drawn. */
const THUMB = new Set([1, 2, 3, 4]);
const FINGERTIP_INDICES = new Set([8, 12, 16, 20]);

export function cssColor(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function haloLine(ctx: CanvasRenderingContext2D, path: Path2D, color: string, width: number) {
  ctx.lineCap = "round";
  ctx.strokeStyle = HALO;
  ctx.lineWidth = width + 3;
  ctx.stroke(path);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(path);
}

/** Text that stays readable when the canvas is mirrored by CSS. */
export function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, mirrored: boolean, size: number) {
  ctx.save();
  ctx.translate(x, y);
  if (mirrored) ctx.scale(-1, 1);
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = size / 3;
  ctx.strokeStyle = HALO;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = "white";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  hand: TrackedHand,
  connections: [number, number][],
  w: number,
  h: number,
  scale: number,
  faded: boolean,
) {
  const p = hand.landmarks;
  const bones = new Path2D();
  for (const [a, b] of connections) {
    if (THUMB.has(a) || THUMB.has(b)) continue;
    bones.moveTo(p[a].x * w, p[a].y * h);
    bones.lineTo(p[b].x * w, p[b].y * h);
  }
  // No dark outline here, unlike the grid: the light blue stands out on any
  // skin tone (no one's hand is that colour), and the outline made the hand
  // look heavy.
  ctx.globalAlpha = faded ? 0.35 : 1;
  ctx.lineCap = "round";
  ctx.strokeStyle = BONE;
  ctx.lineWidth = 2.5 * scale;
  ctx.stroke(bones);
  // Knuckles: a small dot on every joint but the thumb's and the fingertips
  // (those get their own numbered dots).
  ctx.fillStyle = BONE;
  p.forEach((point, i) => {
    if (THUMB.has(i) || FINGERTIP_INDICES.has(i)) return;
    ctx.beginPath();
    ctx.arc(point.x * w, point.y * h, 3.5 * scale, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

/**
 * Strings and fret wires as the calibration places them; nut and calibrated
 * wire heavier, so a misplaced one stands out. With measured wires, the ones
 * actually found are drawn solid and the ones filled in from the fit thinner
 * and dimmer: the user sees what was measured. `wires` overrides the
 * calibration's own (the brief glide from predicted to measured).
 */
export function drawGrid(ctx: CanvasRenderingContext2D, cal: Calibration, w: number, h: number, scale: number, wires = cal.wires) {
  const toPx = (u: number, v: number) => {
    const q = imageAt(cal, u, v);
    return [q.x * w, q.y * h] as const;
  };
  const strings = new Path2D();
  for (let s = 0; s < 6; s++) {
    strings.moveTo(...toPx(0, s / 5));
    strings.lineTo(...toPx(wireAt(LAST_READ_FRET, wires), s / 5));
  }
  const solid = new Path2D();
  const filled = new Path2D();
  const heavy = new Path2D();
  for (let n = 0; n <= LAST_READ_FRET; n++) {
    const path = n === 0 || n === cal.fret ? heavy : !wires || cal.found?.[n] ? solid : filled;
    path.moveTo(...toPx(wireAt(n, wires), -0.12));
    path.lineTo(...toPx(wireAt(n, wires), 1.12));
  }
  ctx.globalAlpha = 0.8;
  haloLine(ctx, strings, GRID_COLOR, 1 * scale);
  haloLine(ctx, solid, GRID_COLOR, 1.5 * scale);
  haloLine(ctx, heavy, GRID_COLOR, 3 * scale);
  ctx.globalAlpha = 0.4;
  haloLine(ctx, filled, GRID_COLOR, 1 * scale);
  ctx.globalAlpha = 1;
}

/** The points neck following holds on to: green while following, red when lost. */
export function drawNeckPoints(ctx: CanvasRenderingContext2D, points: Vec2[], lost: boolean, w: number, h: number, scale: number) {
  ctx.fillStyle = lost ? "rgba(248,113,113,0.8)" : "rgba(74,222,128,0.8)";
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 2.5 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawFingertip(
  ctx: CanvasRenderingContext2D,
  p: Vec2,
  finger: number,
  color: string,
  w: number,
  h: number,
  scale: number,
  mirrored: boolean,
  caption?: string,
  locked = false,
) {
  ctx.beginPath();
  ctx.arc(p.x * w, p.y * h, 8 * scale, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (locked) {
    // A white ring: this finger is locked on its target.
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 11 * scale, 0, Math.PI * 2);
    ctx.lineWidth = 2.5 * scale;
    ctx.strokeStyle = "white";
    ctx.stroke();
  }
  drawLabel(ctx, String(finger), p.x * w, p.y * h, mirrored, 11 * scale);
  if (caption) drawLabel(ctx, caption, p.x * w, p.y * h - 20 * scale, mirrored, 12 * scale);
}

/** Calibration clicks so far, numbered in click order. */
export function drawClicks(ctx: CanvasRenderingContext2D, clicks: Vec2[], w: number, h: number, scale: number, mirrored: boolean) {
  clicks.forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(c.x * w, c.y * h, 6 * scale, 0, Math.PI * 2);
    ctx.fillStyle = GRID_COLOR;
    ctx.fill();
    ctx.strokeStyle = HALO;
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
    drawLabel(ctx, String(i + 1), c.x * w, c.y * h - 14 * scale, mirrored, 11 * scale);
  });
}
