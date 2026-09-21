/**
 * Pure pitch/note math for the tuner (components/TunerModal.tsx) — no audio
 * or DOM here, so it stays testable with the plain node:test runner the rest
 * of lib/ uses (same split as lib/cssTiming.ts's parseCssDuration/
 * cssDurationMs, or lib/importGuitarPro.ts's scoreToTab/importGuitarProFile:
 * the math is tested, the browser-API wrapper around it isn't).
 */

export type Accuracy = "inTune" | "close" | "off";

export type TuningPreset = {
  id: string;
  labelKey: string;
  /** MIDI note numbers, low string to high. null = chromatic (match any note, not just these strings). */
  strings: number[] | null;
};

export type TunerReading = {
  targetMidi: number;
  noteName: string;
  cents: number;
  accuracy: Accuracy;
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

// Sharps only (D#2, not Eb2) — standard for a chromatic tuner display and
// keeps this table a single fixed array. ponytail: per-preset enharmonic
// spelling (an Eb-tuning player expects "Eb2") is a real ceiling here, add
// it if a real user asks for it.
export function noteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${octave}`;
}

export function centsBetween(hz: number, targetHz: number): number {
  return 1200 * Math.log2(hz / targetHz);
}

/** Nearest MIDI note to a detected frequency — among `targets` if given, otherwise any chromatic note. */
export function nearestMidi(hz: number, targets: number[] | null): number {
  if (targets === null) {
    return Math.round(69 + 12 * Math.log2(hz / 440));
  }
  return targets.reduce((best, midi) =>
    Math.abs(centsBetween(hz, midiToFrequency(midi))) < Math.abs(centsBetween(hz, midiToFrequency(best))) ? midi : best,
  );
}

export function accuracyFor(cents: number): Accuracy {
  const abs = Math.abs(cents);
  if (abs <= 5) return "inTune";
  if (abs <= 15) return "close";
  return "off";
}

export function readingFor(hz: number, targets: number[] | null): TunerReading {
  const targetMidi = nearestMidi(hz, targets);
  const cents = centsBetween(hz, midiToFrequency(targetMidi));
  return { targetMidi, noteName: noteName(targetMidi), cents, accuracy: accuracyFor(cents) };
}

/**
 * Raw per-frame pitch readings jitter by several cents even from a steady
 * string — without this, the on-screen needle visibly vibrates and reads as
 * broken rather than as "in tune." A median (not a mean) also rejects a
 * single wild outlier frame instead of being dragged toward it.
 */
export function medianFrequency(recent: number[]): number {
  const sorted = [...recent].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Guards against Pitchy returning a low-confidence guess or an out-of-guitar-range frequency (room noise, footsteps, a cough). */
export function isPlausiblePitch(hz: number, clarity: number): boolean {
  return clarity >= 0.85 && hz >= 60 && hz <= 1400;
}

export const TUNING_PRESETS: TuningPreset[] = [
  { id: "standard", labelKey: "tuner.preset.standard", strings: [40, 45, 50, 55, 59, 64] },
  { id: "dropD", labelKey: "tuner.preset.dropD", strings: [38, 45, 50, 55, 59, 64] },
  { id: "halfStepDown", labelKey: "tuner.preset.halfStepDown", strings: [39, 44, 49, 54, 58, 63] },
  { id: "openG", labelKey: "tuner.preset.openG", strings: [38, 43, 50, 55, 59, 62] },
  { id: "openD", labelKey: "tuner.preset.openD", strings: [38, 45, 50, 54, 57, 62] },
  { id: "dadgad", labelKey: "tuner.preset.dadgad", strings: [38, 45, 50, 55, 57, 62] },
  { id: "chromatic", labelKey: "tuner.preset.chromatic", strings: null },
];
