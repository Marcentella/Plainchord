/**
 * One Euro filter (Casiez, Roussel & Vogel, CHI 2012): a low-pass filter
 * whose cutoff rises with speed. A still fingertip gets heavy smoothing (the
 * landmark's frame-to-frame jitter disappears); a moving one gets almost
 * none (no lag chasing it). Plain exponential smoothing has to pick one.
 *
 * Units here: pixels and seconds. minCutoff is in Hz; beta scales how fast
 * the cutoff opens up with speed (px/s).
 */

export type OneEuroSettings = { minCutoff: number; beta: number; derivativeCutoff: number };

/** Tuned for fingertips at 15-30 fps in a 1280-wide frame. */
export const FINGERTIP_FILTER: OneEuroSettings = { minCutoff: 1.2, beta: 0.02, derivativeCutoff: 1 };

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroFilter {
  private value: number | null = null;
  private derivative = 0;
  private lastTime = 0;
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
      return x;
    }
    const dt = time - this.lastTime;
    if (dt <= 0) return this.value;
    this.lastTime = time;
    const { minCutoff, beta, derivativeCutoff } = this.settings;
    const rawDerivative = (x - this.value) / dt;
    this.derivative += alpha(derivativeCutoff, dt) * (rawDerivative - this.derivative);
    const cutoff = minCutoff + beta * Math.abs(this.derivative);
    this.value += alpha(cutoff, dt) * (x - this.value);
    return this.value;
  }

  reset() {
    this.value = null;
    this.derivative = 0;
  }
}
