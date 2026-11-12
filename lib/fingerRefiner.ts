/**
 * Fingertip refiner for the camera fingering check: the pure half (no DOM, no
 * model runtime; tested under node:test). lib/fingerRefinerModel.ts runs the
 * network on what this builds.
 *
 * Why: a general hand model places a fretting fingertip about half a string
 * off (it shortens a finger stretched to the far string), and the strings are
 * only ~9 px apart in a 720p frame. Measured on GuiFiR and on our own
 * recordings: docs/camara-limitaciones.md.
 *
 * How: the calibration already says where the neck is, so the surroundings of
 * each fingertip are resampled into a canonical patch: x along the neck, y
 * across it, the six strings always six rows PX_PER_STRING apart whatever the
 * camera, distance or angle. A small network (scripts/refiner/, trained on
 * GuiFiR's labelled fingertips and on recordings of known chords) reads the
 * patch and answers where the finger presses.
 *
 * Must stay in step with scripts/refiner/rect.py, which builds the training
 * patches: same geometry, same channel order (blue, green, red, guide: the
 * training images came through OpenCV).
 */
import { imageAt, neckUV, stringSpread, type Calibration, type Vec2 } from "./fretMapping.ts";

export const PX_PER_STRING = 8;
/** Canonical pixels per unit of u: one string spacing at the nut is PX_PER_STRING. */
const K = PX_PER_STRING / (stringSpread(0) / 5);
/** v from −0.5 to 1.5: the neck plus half its width either side. */
export const PATCH_H = 10 * PX_PER_STRING;
export const PATCH_W = 96;
export const PATCH_CHANNELS = 4;
const ROW_SPAN = 5 * PX_PER_STRING;

/** A video frame's pixels, RGBA row-major (ImageData's layout). */
export type Pixels = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };

type Cal = Pick<Calibration, "toNeck" | "toImage">;

/** Normalized image point -> canonical pixels. */
function toCanon(cal: Cal, p: Vec2): Vec2 {
  const uv = neckUV(cal as Calibration, p);
  return { x: uv.x * K, y: (uv.y + 0.5) * ROW_SPAN };
}

/** Distance from p to the segment a-b. */
function segmentDistance(px: number, py: number, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2)) : 0;
  return Math.hypot(px - a.x - t * dx, py - a.y - t * dy);
}

/**
 * The network's input for one finger (0 = index ... 3 = pinky): PATCH_CHANNELS ×
 * PATCH_H × PATCH_W floats in 0-1, written into `out` at `offset`. `hand`: 21
 * landmarks, normalized to the frame. Returns the canonical x of the patch's
 * left edge (to turn the answer back into neck coordinates), or null when the
 * tip is nowhere near the neck and there's nothing to refine.
 */
export function refinerPatch(frame: Pixels, cal: Cal, hand: Vec2[], finger: number, out: Float32Array, offset = 0): number | null {
  const knuckle = 5 + 4 * finger;
  const tip = toCanon(cal, hand[knuckle + 3]);
  if (!Number.isFinite(tip.x) || !(tip.y >= 0 && tip.y < PATCH_H)) return null;
  const originX = Math.round(tip.x) - PATCH_W / 2;
  const plane = PATCH_H * PATCH_W;
  const { data, width, height } = frame;

  // Colour: each patch pixel looked up in the frame through the calibration, bilinear.
  for (let py = 0; py < PATCH_H; py++) {
    const v = py / ROW_SPAN - 0.5;
    for (let px = 0; px < PATCH_W; px++) {
      const p = imageAt(cal as Calibration, (px + originX) / K, v);
      const x = p.x * width;
      const y = p.y * height;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const i = offset + py * PATCH_W + px;
      if (!(x0 >= 0 && y0 >= 0 && x0 < width - 1 && y0 < height - 1)) {
        out[i] = out[i + plane] = out[i + 2 * plane] = 0;
        continue;
      }
      const fx = x - x0;
      const fy = y - y0;
      const a = (y0 * width + x0) * 4;
      const b = a + width * 4;
      for (let c = 0; c < 3; c++) {
        const top = data[a + c] + (data[a + 4 + c] - data[a + c]) * fx;
        const bottom = data[b + c] + (data[b + 4 + c] - data[b + c]) * fx;
        // Channel planes in blue, green, red order: 2 − c.
        out[i + (2 - c) * plane] = (top + (bottom - top) * fy) / 255;
      }
    }
  }

  // Guide: this finger's last two bones (half strength) and its tip (full), so the
  // network knows which of the fingers in view it is being asked about.
  const joints = [knuckle + 1, knuckle + 2, knuckle + 3].map((j) => {
    const c = toCanon(cal, hand[j]);
    return { x: c.x - originX, y: c.y };
  });
  const guide = offset + 3 * plane;
  for (let py = 0; py < PATCH_H; py++) {
    for (let px = 0; px < PATCH_W; px++) {
      const bone = Math.min(segmentDistance(px, py, joints[0], joints[1]), segmentDistance(px, py, joints[1], joints[2]));
      const dot = Math.hypot(px - joints[2].x, py - joints[2].y);
      // Falloffs measured on OpenCV's anti-aliased 1 px line and radius-1.5 dot, which drew the training guides.
      const line = (128 / 255) * Math.exp(-1.7 * bone * bone);
      out[guide + py * PATCH_W + px] = Math.max(line, Math.max(0, Math.min(1, 2.5 - dot)));
    }
  }
  return originX;
}

/** The network's answer (patch pixels) -> reading coordinates, like neckUV: u along the neck, v across (0 low E, 1 high e). */
export function refinedUV(originX: number, x: number, y: number): Vec2 {
  return { x: (x + originX) / K, y: y / ROW_SPAN - 0.5 };
}

/**
 * The refiner answers a few frames late (the network runs off the frame loop),
 * so its answer is kept as an offset from the hand model's tip and added to
 * every frame's tip until the next answer: a held chord's offset barely
 * changes, while the tip itself keeps following the hand. Averaged over a few
 * answers, since single ones jitter.
 */
const OFFSET_SMOOTHING = 0.5;
export class TipOffsets {
  private offsets: (Vec2 | null)[] = [null, null, null, null];

  /** `model`: the hand model's tip when the refiner was asked; `refined`: its answer (null = nothing to refine). */
  update(finger: number, model: Vec2, refined: Vec2 | null) {
    if (!refined) {
      this.offsets[finger] = null;
      return;
    }
    const now = { x: refined.x - model.x, y: refined.y - model.y };
    const before = this.offsets[finger];
    this.offsets[finger] = before
      ? { x: before.x + (now.x - before.x) * OFFSET_SMOOTHING, y: before.y + (now.y - before.y) * OFFSET_SMOOTHING }
      : now;
  }

  /** The hand model's tip with the latest offset added, or null when there is none (use the unrefined press point). */
  apply(finger: number, model: Vec2): Vec2 | null {
    const o = this.offsets[finger];
    return o ? { x: model.x + o.x, y: model.y + o.y } : null;
  }

  reset() {
    this.offsets = [null, null, null, null];
  }
}
