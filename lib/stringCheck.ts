/**
 * Which strings of a strummed chord actually rang (plan: Step 3 of the
 * camera + mic check). Pure: samples in, one result per string out; tested
 * under node:test against synthetic strums.
 *
 * The whole-chord match (lib/chordDetection.ts) can't tell a C from a C
 * whose B string rang open: that's a Cmaj7, "almost C". Here the expected
 * chord is known, so instead of transcribing blind, each string's note is
 * looked for where only that string can put energy:
 *
 * 1. Every sounding string's note has a comb of harmonics (f0, 2f0, 3f0…).
 * 2. A harmonic is "unique" when no other string's harmonic lands near it.
 *    Strings an octave apart share every harmonic (a C chord's C3 and C4:
 *    each harmonic of C4 is an even harmonic of C3), so that string gets
 *    "unknown": the check says it can't tell rather than guess.
 * 3. A unique harmonic counts as present when its peak stands well above the
 *    spectrum around it.
 *
 * Fretted strings are also checked for their OPEN note: if it rings, the
 * finger on that string isn't pressing it down. Strings the chord leaves out
 * (x) are checked for their open note too: if it rings, it was strummed.
 */
import type { Chord } from "./chords.ts";
import { OPEN_STRINGS } from "./chordDetection.ts";
import { spectrum } from "./transcribe.ts";

/** Calibration knobs: start values from synthetic strums; real ones come from Focusrite takes (?debug downloads the judged audio). */
export const STRING_CHECK = {
  /** Harmonics of a string's own note examined for evidence. Higher ones fade on a real guitar and drift sharp (string stiffness). */
  harmonics: 6,
  /** Harmonics of the OTHER strings that may collide with those. */
  otherHarmonics: 16,
  /** Half-width of the window around each harmonic: tuning, inharmonicity. */
  toleranceCents: 30,
  /** …and never narrower than this many FFT bins (a Hann window's peak is ~2 bins wide each side). */
  minBins: 2,
  /** A harmonic is present when its peak is this many times the median of the spectrum around it. */
  presentRatio: 8,
  /** …and at least this fraction of the strongest peak in the spectrum, so faint sympathetic ringing doesn't count. */
  relativeMin: 0.02,
};

export type StringCheckSettings = typeof STRING_CHECK;

export type StringResult =
  /** Its note rang. */
  | "sounds"
  /** The chord has it ringing, but no sign of it. */
  | "missing"
  /** Fretted in the chord, but its open note rang: the finger isn't pressing it. */
  | "open"
  /** Its note shares every harmonic with another string's: can't tell. */
  | "unknown"
  /** Left out of the chord (x), and quiet as it should be. */
  | "silent"
  /** Left out of the chord (x), but its open note rang. */
  | "ringsButShouldnt";

/** Minimum bins either side of a harmonic's window that its noise floor is measured over. */
const FLOOR_BINS = 10;

/** MIDI note -> Hz. */
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

type Evidence = "present" | "absent" | "unknown";

/** Everything the per-note test needs about one spectrum. */
type Analysis = { mag: Float64Array; binHz: number; strongest: number; settings: StringCheckSettings };

function windowHz(f: number, a: Analysis): number {
  return Math.max(f * (2 ** (a.settings.toleranceCents / 1200) - 1), a.settings.minBins * a.binHz);
}

/** Is a harmonic at `f` clear of every harmonic of the `others` notes? */
function isUnique(f: number, others: number[], a: Analysis): boolean {
  return others.every((other) => {
    for (let k = 1; k <= a.settings.otherHarmonics; k++) {
      const g = other * k;
      if (Math.abs(f - g) <= windowHz(f, a) + windowHz(g, a)) return false;
    }
    return true;
  });
}

function isPresent(f: number, a: Analysis): boolean {
  const w = windowHz(f, a);
  const lo = Math.max(1, Math.floor((f - w) / a.binHz));
  const hi = Math.min(a.mag.length - 1, Math.ceil((f + w) / a.binHz));
  if (lo >= hi) return false;
  let at = lo;
  for (let b = lo; b <= hi; b++) if (a.mag[b] > a.mag[at]) at = b;
  // A real peak, not the slope of a loud neighbour a semitone away (Bb3's
  // skirt reaching into B3's window): that one tops out at the window's edge.
  if (a.mag[at] <= a.mag[at - 1] || a.mag[at] <= a.mag[at + 1] || at === lo || at === hi) return false;
  // And at the right pitch. Low on the neck a semitone is under two bins
  // (E2-F2: 4.9 Hz, bins 2.9 Hz apart), so an open low E rings inside an F's
  // window; the peak's true position (a parabola through the log magnitudes
  // of its bin and neighbours, accurate to a fraction of a bin on a Hann
  // window) tells them apart.
  const [l, c, r] = [a.mag[at - 1], a.mag[at], a.mag[at + 1]].map(Math.log);
  const offset = (0.5 * (l - r)) / (l - 2 * c + r);
  const peakHz = (at + offset) * a.binHz;
  if (Math.abs(peakHz - f) > Math.max(f * (2 ** (a.settings.toleranceCents / 1200) - 1), 0.5 * a.binHz)) return false;
  const peak = a.mag[at];
  // The floor: the median around the window, a semitone and a half either
  // side, but never fewer than FLOOR_BINS each side. Low on the neck that
  // span is only a few bins, and a neighbouring string's peak inside it
  // (open A2 next to G2) would make it most of the "floor".
  const span = Math.max(f * (2 ** (1.5 / 12) - 1), FLOOR_BINS * a.binHz);
  const nlo = Math.max(1, Math.floor((f - w - span) / a.binHz));
  const nhi = Math.min(a.mag.length - 1, Math.ceil((f + w + span) / a.binHz));
  const around: number[] = [];
  for (let b = nlo; b <= nhi; b++) if (b < lo || b > hi) around.push(a.mag[b]);
  around.sort((x, y) => x - y);
  const floor = around.length ? around[Math.floor(around.length / 2)] : 0;
  return peak >= a.settings.presentRatio * floor && peak >= a.settings.relativeMin * a.strongest;
}

/** Evidence that `note` (Hz) rang, from its harmonics that none of `others` can account for. */
function evidence(note: number, others: number[], a: Analysis): Evidence {
  let unique = 0;
  for (let h = 1; h <= a.settings.harmonics; h++) {
    const f = note * h;
    if (f / a.binHz >= a.mag.length - 2 || !isUnique(f, others, a)) continue;
    unique++;
    if (isPresent(f, a)) return "present";
  }
  return unique ? "absent" : "unknown";
}

/** One result per string, low E first (Chord.frets order). `samples` is one analysis window of the strum after its attack. */
export function checkStrings(
  chord: Chord,
  samples: Float32Array,
  sampleRate: number,
  settings: StringCheckSettings = STRING_CHECK,
): StringResult[] {
  // Largest power of two that fits: spectrum() is radix-2.
  const size = 2 ** Math.floor(Math.log2(samples.length));
  const mag = spectrum(samples, samples.length - size, size);
  let strongest = 0;
  for (let k = 1; k < mag.length; k++) strongest = Math.max(strongest, mag[k]);
  const a: Analysis = { mag, binHz: sampleRate / size, strongest, settings };

  // What each string could plausibly be ringing: the note the chord gives
  // it, and for a fretted string also its open note (finger lifted). A
  // harmonic only proves something when none of the OTHER possibilities can
  // explain it. Judging against the intended notes alone isn't enough: with
  // C's B string ringing open, open B3 sat on the low E's 3rd harmonic and
  // the (silent) low E read as strummed.
  const possible = chord.frets.map((fret, s) => {
    const open = hz(OPEN_STRINGS[s]);
    if (fret < 0) return [];
    return fret === 0 ? [open] : [hz(OPEN_STRINGS[s] + fret), open];
  });
  const besides = (s: number, own: number[]) => [...possible.flatMap((p, i) => (i === s ? [] : p)), ...own];

  return chord.frets.map((fret, s) => {
    const open = hz(OPEN_STRINGS[s]);
    if (fret < 0) {
      const heard = evidence(open, besides(s, []), a);
      return heard === "present" ? "ringsButShouldnt" : heard === "absent" ? "silent" : "unknown";
    }
    if (fret === 0) {
      const own = evidence(open, besides(s, []), a);
      return own === "present" ? "sounds" : own === "absent" ? "missing" : "unknown";
    }
    // Fretted: "pressed" and "rang open" each have to be told apart from the
    // other as well (C#m's G#3 on the D string: its 5th harmonic sits within
    // the window of open D3's 7th).
    const note = hz(OPEN_STRINGS[s] + fret);
    const own = evidence(note, besides(s, [open]), a);
    if (own === "present") return "sounds";
    if (evidence(open, besides(s, [note]), a) === "present") return "open";
    return own === "absent" ? "missing" : "unknown";
  });
}
