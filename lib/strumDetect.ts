/**
 * When a strum happens, for the combined camera + mic check
 * (components/CameraCheckModal.tsx via lib/useStrumCheck.ts). Pure, stepped
 * once per analysis frame, tested under node:test.
 *
 * Two moments per strum:
 * - "onset": the loudness just jumped. The fingers were placed before the
 *   strum, so this is when the camera's reading is kept.
 * - "ready": `settleMs` later, past the pick's attack, when the strings ring
 *   on their own. This is when the audio is judged.
 *
 * Same loudness-jump idea as the play-along's re-arming (lib/chordDetection.ts's
 * stepPlayAlong): a strum is a jump above the quietest point since the last
 * one, so a new strum over a chord still ringing counts too.
 */
import { DETECTION } from "./chordDetection.ts";

export const STRUM = {
  minRms: DETECTION.minRms,
  onsetRatio: DETECTION.onsetRatio,
  /**
   * Onset to judging. The analysis window (~0.35 s) ends here, so this sets
   * how much of the attack it still holds. Real Focusrite strums of C
   * (2026-11-16): at 300 ms the window could start right on the strum, while
   * the pick was still crossing the strings, and an open G read as missing;
   * starting 0.1 s later every take read right. Much later costs the whole-
   * chord match: a correct C fell under `accept` a second after the strum.
   */
  settleMs: 450,
  /** After judging, no new strum for this long: the tail of the pick's attack can still read as a jump. */
  cooldownMs: 300,
};

export type StrumSettings = typeof STRUM;

export type StrumState = {
  /** Quietest loudness since the last strum was judged. */
  floor: number;
  /** When the strum being settled started, or null between strums. */
  onsetAt: number | null;
  cooldownUntil: number;
};

export type StrumEvent = "onset" | "ready" | null;

export function initialStrum(): StrumState {
  return { floor: Infinity, onsetAt: null, cooldownUntil: -Infinity };
}

export function stepStrum(
  state: StrumState,
  frame: { rms: number; now: number },
  settings: StrumSettings = STRUM,
): { state: StrumState; event: StrumEvent } {
  if (state.onsetAt !== null) {
    if (frame.now - state.onsetAt < settings.settleMs) return { state, event: null };
    return {
      // The chord is ringing now: the next strum has to jump above this.
      state: { floor: frame.rms, onsetAt: null, cooldownUntil: frame.now + settings.cooldownMs },
      event: "ready",
    };
  }
  const floor = Math.min(state.floor, frame.rms);
  const jumped = frame.rms >= settings.minRms && frame.rms > floor * settings.onsetRatio;
  if (frame.now < state.cooldownUntil || !jumped) return { state: { ...state, floor }, event: null };
  return { state: { ...state, floor, onsetAt: frame.now }, event: "onset" };
}

/** Loudness of one buffer, the same measure Meyda's `rms` gives — cheap enough for every frame, unlike the chroma. */
export function rmsOf(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}
