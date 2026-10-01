/**
 * Pure chord-detection math for the play-along mode (lib/useChordPlayAlong.ts)
 * and its calibration page (app/dev/chords). No audio or DOM here, same split
 * as lib/tuning.ts: the math is tested with node:test, the browser wrapper
 * around it isn't.
 *
 * How it works: Meyda's `chroma` folds one frame of audio into 12 numbers,
 * one per note name (C, C#, D... B), saying how much of each is sounding.
 * Every chord in the library gets the same kind of 12-number "template" from
 * its own frets, and the frame is compared against each template by cosine
 * similarity. No machine learning, no note-by-note transcription.
 */
import type { Chord } from "./chords";

/**
 * Calibration knobs. Starting values, picked from the synthetic test signal;
 * real ones come from strumming a real guitar into /dev/chords (see
 * FEATURES.md). A real mic/room/guitar never matches a model, so these stay
 * plain numbers meant to be tuned, not derived.
 */
export const DETECTION = {
  /** Samples per analysis frame. 16384 at 48 kHz = ~2.9 Hz per FFT bin, ~340 ms window. 8192 (~5.9 Hz) can't cleanly separate the low E string's neighbors (~5 Hz apart); on synthetic chords 16384 ranked every library chord first where 8192 missed 1-4. A strummed chord rings far longer than the window, so the extra latency is fine. */
  fftSize: 16384,
  /** How fast a string's overtones fade in the templates (see chordTemplate). 0.8 ranked every library chord first on synthetic strums; plain note-count templates (no overtones) only managed 16-22 of 28. */
  harmonicDecay: 0.8,
  /** Below this loudness the frame counts as silence: no match, no "Escuchando" readout. */
  minRms: 0.01,
  /** Cosine similarity the target chord needs to count as heard. Synthetic strums of every library chord scored >= 0.90 against their own template. */
  accept: 0.88,
  /**
   * How far behind the best-scoring chord the target may be and still count.
   * Real guitars are messier than the synthetic test, so a little slack; at
   * 0.02 the only confusions on synthetic strums were near-twins (G/G7,
   * Em/Em7, C/Cadd9) — "almost the right chord", not a different one.
   */
  margin: 0.02,
  /** How long the target must stay matched before it counts — one stray frame never advances. */
  holdMs: 300,
  /** A repeated chord (G G D) needs a fresh strum: loudness must jump this much above its quietest point since the last advance. */
  onsetRatio: 1.5,
};

export type DetectionSettings = typeof DETECTION;

/** Standard tuning, low E to high e, as MIDI notes — same string order as Chord.frets. */
const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];

/** One entry per sounding string: the pitch class (0 = C ... 11 = B) it rings at. */
export function chordPitchClasses(chord: Chord): number[] {
  return chord.frets.flatMap((fret, i) => (fret < 0 ? [] : [(OPEN_STRINGS[i] + fret) % 12]));
}

/**
 * Pitch-class offset of a string's 1st..6th harmonics: octave, octave, a
 * fifth up (3rd harmonic), two octaves, a major third up (5th), a fifth (6th).
 */
const HARMONIC_OFFSETS = [0, 0, 7, 0, 4, 7];

/**
 * 12 numbers, C first (Meyda's chroma also starts at C): what the chord
 * should look like to the mic, not just which notes it has. Every string
 * counts (a G chord rings G on three strings, so G dominates), and every
 * string brings its overtones along. Without them the 3rd harmonic of C's
 * E strings rings a B and a played C matches Cmaj7 better than C.
 */
export function chordTemplate(chord: Chord, harmonicDecay = DETECTION.harmonicDecay): number[] {
  const template = new Array(12).fill(0);
  for (const pc of chordPitchClasses(chord)) {
    HARMONIC_OFFSETS.forEach((offset, h) => {
      template[(pc + offset) % 12] += harmonicDecay ** h;
    });
  }
  return template;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 12; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** The slice of Meyda's API used here — passed in, so the browser can lazy-load Meyda while tests import it directly. */
export type MeydaLike = {
  bufferSize: number;
  sampleRate: number;
  chromaFilterBank?: unknown;
  extract(features: ("chroma" | "rms")[], signal: Float32Array): { chroma?: number[]; rms?: number } | null;
};

export type Frame = { chroma: number[]; rms: number };

/**
 * One frame of audio -> chroma + loudness. Not Meyda's own analyzer
 * (createMeydaAnalyzer runs on the deprecated ScriptProcessorNode); callers
 * pull samples from a native AnalyserNode and hand them here instead.
 */
export function extractFrame(meyda: MeydaLike, signal: Float32Array, sampleRate: number): Frame {
  if (meyda.bufferSize !== signal.length || meyda.sampleRate !== sampleRate) {
    meyda.bufferSize = signal.length;
    meyda.sampleRate = sampleRate;
    // Meyda caches its chroma filter bank and only rebuilds it when the
    // NUMBER of chroma bands changes (meyda@5.6.3 main.js) — not when the
    // buffer size or sample rate does. Left alone, a buffer-size switch
    // keeps folding the spectrum with bins computed for the old size.
    meyda.chromaFilterBank = undefined;
  }
  const features = meyda.extract(["chroma", "rms"], signal);
  return { chroma: features?.chroma ?? new Array(12).fill(0), rms: features?.rms ?? 0 };
}

export type Ranked = { chord: Chord; score: number };

/** Every chord, best match first. */
export function rankChords(
  chroma: number[],
  chords: Chord[],
  settings: DetectionSettings = DETECTION,
): Ranked[] {
  return chords
    .map((chord) => ({ chord, score: cosine(chroma, chordTemplate(chord, settings.harmonicDecay)) }))
    .sort((a, b) => b.score - a.score);
}

/** Is `target` what's sounding? Close-enough-to-the-best counts, so a C that scores a hair under Am still passes when C is what the user is supposed to play. */
export function matchesTarget(
  ranked: Ranked[],
  target: Chord,
  settings: DetectionSettings = DETECTION,
): boolean {
  const entry = ranked.find((r) => r.chord.name === target.name);
  if (!entry || ranked.length === 0) return false;
  return entry.score >= settings.accept && entry.score >= ranked[0].score - settings.margin;
}

/**
 * Play-along progress. `index` points into the progression's chord list
 * (the same list the home grid renders, unknown chords included as
 * undefined); it only ever lands on a chord that exists in the library.
 */
export type PlayAlongState = {
  index: number;
  /** Indices already heard in this pass through the progression; cleared when it loops. */
  played: number[];
  /** When the current target first matched, or null if it isn't matching right now. */
  heardSince: number | null;
  /** False right after advancing onto the SAME chord again, until a fresh strum is heard. */
  armed: boolean;
  /** Quietest loudness since the last advance — the baseline a fresh strum has to jump above. */
  rmsFloor: number;
};

function nextPlayable(targets: (Chord | undefined)[], from: number): number {
  for (let step = 1; step <= targets.length; step++) {
    const i = (from + step) % targets.length;
    if (targets[i]) return i;
  }
  return -1;
}

/** First playable index, or -1 when the progression has no known chord at all (nothing to play along with). */
export function initialPlayAlong(targets: (Chord | undefined)[]): PlayAlongState {
  return {
    index: nextPlayable(targets, -1),
    played: [],
    heardSince: null,
    armed: true,
    rmsFloor: Infinity,
  };
}

/**
 * One analysis frame's worth of progress. Returns the new state and, when
 * the target was just heard, which index that was (for the brief green
 * check on that card).
 */
export function stepPlayAlong(
  state: PlayAlongState,
  targets: (Chord | undefined)[],
  frame: { matches: boolean; rms: number; now: number },
  settings: DetectionSettings = DETECTION,
): { state: PlayAlongState; matchedIndex: number | null } {
  if (state.index < 0) return { state, matchedIndex: null };

  const rmsFloor = Math.min(state.rmsFloor, frame.rms);
  const armed =
    state.armed || (frame.rms >= settings.minRms && frame.rms > rmsFloor * settings.onsetRatio);

  if (!armed || !frame.matches) {
    return { state: { ...state, rmsFloor, armed, heardSince: null }, matchedIndex: null };
  }

  const heardSince = state.heardSince ?? frame.now;
  if (frame.now - heardSince < settings.holdMs) {
    return { state: { ...state, rmsFloor, armed, heardSince }, matchedIndex: null };
  }

  const next = nextPlayable(targets, state.index);
  const wrapped = next <= state.index;
  return {
    state: {
      index: next,
      played: wrapped ? [] : [...state.played, state.index],
      heardSince: null,
      // Still ringing from the strum that just counted, so a repeated chord
      // would otherwise match instantly: hold it until a new strum.
      armed: targets[next]!.name !== targets[state.index]!.name,
      rmsFloor: frame.rms,
    },
    matchedIndex: state.index,
  };
}
