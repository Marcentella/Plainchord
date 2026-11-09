/**
 * One Euro filter (Casiez, Roussel & Vogel, CHI 2012): a low-pass filter
 * whose cutoff rises with speed. A still fingertip gets heavy smoothing (the
 * landmark's frame-to-frame jitter disappears); a moving one gets almost
 * none (no lag chasing it). Plain exponential smoothing has to pick one.
 *
 * Plus jitter detection (ours, not in the paper): speed alone can't tell a
 * hand trembling in place from one moving, since both have velocity. Over
 * the last few raw steps, consistency = |sum of steps| / sum of |steps| is
 * ~1 when the point is going somewhere and ~0 when it's going back and forth.
 * The lower it is, the lower the cutoff — up to JITTER_FLOOR of it — so
 * jitter gets extra smoothing while real movement keeps its responsiveness.
 *
 * Units here: pixels and seconds. minCutoff is in Hz; beta scales how fast
 * the cutoff opens up with speed (px/s).
 */

export type OneEuroSettings = {
  minCutoff: number;
  beta: number;
  derivativeCutoff: number;
  /** Raw steps the jitter detection looks back over; 0 turns it off. */
  jitterWindow: number;
};

/** Tuned for hand landmarks at 15-30 fps in a 1280-wide frame. */
export const FINGERTIP_FILTER: OneEuroSettings = { minCutoff: 1.2, beta: 0.02, derivativeCutoff: 1, jitterWindow: 6 };

/** Fully back-and-forth movement gets this share of the normal cutoff. */
const JITTER_FLOOR = 0.3;

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroFilter {
  private value: number | null = null;
  private derivative = 0;
  private lastTime = 0;
  private lastRaw = 0;
  private steps: number[] = [];
  // Assigned in the body, not as a `private settings` parameter property:
  // node:test runs .ts by stripping types, and that shorthand isn't strippable.
  private settings: OneEuroSettings;

  constructor(settings: OneEuroSettings = FINGERTIP_FILTER) {
    this.settings = settings;
  }

  /** `time` in seconds, strictly increasing. */
  filter(x: number, time: number): number {
    if (this.value === null) {
      this.value = x;
      this.lastTime = time;
      this.lastRaw = x;
      return x;
    }
    const dt = time - this.lastTime;
    if (dt <= 0) return this.value;
    this.lastTime = time;
    const { minCutoff, beta, derivativeCutoff, jitterWindow } = this.settings;
    const rawDerivative = (x - this.value) / dt;
    this.derivative += alpha(derivativeCutoff, dt) * (rawDerivative - this.derivative);
    let cutoff = minCutoff + beta * Math.abs(this.derivative);
    if (jitterWindow > 0) {
      this.steps.push(x - this.lastRaw);
      if (this.steps.length > jitterWindow) this.steps.shift();
      cutoff *= JITTER_FLOOR + (1 - JITTER_FLOOR) * this.consistency();
    }
    this.lastRaw = x;
    this.value += alpha(cutoff, dt) * (x - this.value);
    return this.value;
  }

  /** 1 = every recent step in the same direction, 0 = they cancel out. */
  private consistency(): number {
    let net = 0;
    let total = 0;
    for (const s of this.steps) {
      net += s;
      total += Math.abs(s);
    }
    return total > 0 ? Math.abs(net) / total : 1;
  }

  reset() {
    this.value = null;
    this.derivative = 0;
    this.steps = [];
  }
}
