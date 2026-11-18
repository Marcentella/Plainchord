/**
 * Synthetic guitar audio for the node:test suites (chord detection, the
 * per-string check). Not imported by the app.
 */
import type { Chord } from "./chords.ts";

export const SAMPLE_RATE = 48000;
const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];

/** Deterministic noise/phases, so a failure is reproducible run to run. */
export function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/**
 * A strum of the given frets (low E first, -1 = not sounding), roughly:
 * every sounding string with 12 harmonics, plus a little noise. `amp` shapes
 * the overtones so tests don't only pass for one tone color. `inharmonicity`
 * is a real string's stiffness (B in f_h = h·f0·√(1 + B·h²); ~1e-4 on a
 * guitar), which pulls the upper harmonics sharp.
 */
export function synthFrets(
  frets: number[],
  size: number,
  seed = 1,
  amp: (harmonic: number, string: number) => number = (h) => 0.1 / h,
  inharmonicity = 0,
): Float32Array {
  const rand = rng(seed);
  const out = new Float32Array(size);
  frets.forEach((fret, string) => {
    if (fret < 0) return;
    const hz = 440 * 2 ** ((OPEN_STRINGS[string] + fret - 69) / 12);
    for (let h = 1; h <= 12; h++) {
      const phase = rand() * 2 * Math.PI;
      const a = amp(h, string);
      const f = hz * h * Math.sqrt(1 + inharmonicity * h * h);
      for (let n = 0; n < size; n++) out[n] += a * Math.sin((2 * Math.PI * f * n) / SAMPLE_RATE + phase);
    }
  });
  for (let n = 0; n < size; n++) out[n] += (rand() - 0.5) * 0.01;
  return out;
}

export function synthChord(chord: Chord, size: number, seed = 1, amp?: (harmonic: number, string: number) => number): Float32Array {
  return synthFrets(chord.frets, size, seed, amp);
}
