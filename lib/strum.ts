/**
 * A synthesized strum: each sounding string as one oscillator, low to high
 * like a downstroke. Harmonics 1-12 at 1/h, the tone the chord-detection
 * tests' synthChord uses, so /acordes?demo (lib/micInput.ts) can feed it to
 * the real detector. Not a guitar sample, a reference for which notes sound.
 */
import type { Chord } from "./chords";
import { OPEN_STRINGS } from "./chordDetection";

export function strumWave(ctx: BaseAudioContext): PeriodicWave {
  const real = new Float32Array(13);
  const imag = Float32Array.from({ length: 13 }, (_, h) => (h ? 1 / h : 0));
  return ctx.createPeriodicWave(real, imag);
}

/** Schedules one strum of `chord` into `dest`, starting at `at` (AudioContext time). */
export function strumAt(ctx: BaseAudioContext, wave: PeriodicWave, dest: AudioNode, chord: Chord, at: number) {
  chord.frets.forEach((fret, string) => {
    if (fret < 0) return;
    const t = at + string * 0.015;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = 440 * 2 ** ((OPEN_STRINGS[string] + fret - 69) / 12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.15, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    osc.connect(env).connect(dest);
    osc.start(t);
    osc.stop(t + 2.5);
  });
}

let ctx: AudioContext | null = null;
let wave: PeriodicWave | null = null;
let current: GainNode | null = null;

/**
 * Plays `chords` one after another, `gap` seconds apart, on one shared
 * AudioContext (made on the first click, as browsers require). A new call
 * fades out whatever is still ringing, so taps never pile up.
 */
export function playChords(chords: Chord[], gap = 0.9) {
  ctx ??= new AudioContext();
  wave ??= strumWave(ctx);
  void ctx.resume();
  const now = ctx.currentTime;
  if (current) {
    current.gain.setTargetAtTime(0, now, 0.03);
    const old = current;
    setTimeout(() => old.disconnect(), 300);
  }
  current = ctx.createGain();
  current.connect(ctx.destination);
  chords.forEach((chord, i) => strumAt(ctx!, wave!, current!, chord, now + 0.02 + i * gap));
}
