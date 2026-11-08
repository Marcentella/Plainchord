/**
 * Audio to tab, single notes (plantechdifficulty.md, Step 2). Pure: samples
 * in, Tab out — the mic capture lives in components/RecordTabModal.tsx, so
 * this runs under node:test against synthetic audio.
 *
 * samples -> plucks (spectral flux) -> each pluck's pitch from what it added
 * to the spectrum -> 16th-note grid at the user's BPM -> string/fret
 * (lib/fingering.ts) -> Tab
 *
 * Why not just a pitch tracker (Pitchy, like the tuner): on a real guitar
 * the previous string keeps ringing under the next note. Two strings at once
 * have no single period, so a one-pitch tracker reports nonsense (20-50 Hz)
 * and a loudness jump barely registers over the ring. What does stand out
 * is the new note's harmonics appearing — that's what both steps look for.
 */
import { assignFingering } from "./fingering.ts";
import type { Tab, TabBeat } from "./tab.ts";

/** One detected note, in seconds from the start of the samples. */
export type NoteEvent = { midi: number; start: number; end: number };

/** One beat on the grid, in quarter notes from the downbeat. [] = rest. */
export type GridBeat = { pitches: number[]; start: number; duration: number };

/** Onset spectrum: short for timing, but at ~46 ms (44.1 kHz) still several
 *  periods of low E. Shorter, a low note's spectrum wobbles frame to frame as
 *  the window slides across its waveform, and the wobble reads as plucks. */
const ONSET_WINDOW = 2048;
const HOP = 256;
/** Pitch spectrum: long, for frequency (~93 ms): resolves the harmonics of two low notes a semitone apart. */
const PITCH_WINDOW = 4096;
/** Pitch is read from just after the attack's noise has passed. */
const ATTACK_SKIP = 0.02;
/** Log compression for the flux, so a quiet pluck counts nearly as much as a loud one. */
const FLUX_COMPRESSION = 100;
/** Bins above this don't help: pick noise, no fundamentals or useful harmonics. */
const FLUX_MAX_HZ = 6000;
/** Peak picking: a flux peak must beat the local average by this share of the take's biggest peak. */
const FLUX_DELTA = 0.12;
const PEAK_RADIUS = 3; // frames each side that a flux peak must top
const AVERAGE_RADIUS = 10; // frames each side of the local average
/** Two plucks closer than this are one: the attack's own ripple re-triggers otherwise. */
const ONSET_REFRACTORY = 0.06;
/** Relative to the loudest block: what still counts as sound, not room noise or mains hum. */
const SILENCE_RATIO = 0.04;
const SILENCE_FLOOR = 0.003;
/** Silence a note survives before it's considered over. */
const RELEASE_GAP = 0.05;
/** A pluck keeps sounding at least this long after its attack; a click,
 *  a string being muted or a pick scrape doesn't. */
const MIN_NOTE = 0.06;
/** Candidate notes: drop-D low string to the top of a 24-fret neck. */
const LOWEST_MIDI = 36;
const HIGHEST_MIDI = 88;
const HARMONICS = 8;
/**
 * With 1/h weighting, the note an octave below a real note scores almost
 * exactly half of it (it shares only every other harmonic, at half the
 * weight): 0.49-0.53 across every correct note in the first real takes.
 * Clearly more means the lower note's own fundamental is there and the
 * winner was its second harmonic — an octave error (0.86 in the one seen).
 */
const OCTAVE_BELOW_RATIO = 0.65;

const GRID = 4; // 16th notes
const BEATS_PER_BAR = 4; // ponytail: 4/4 only, a time-signature picker when someone records in 3/4
/** Silence after a note shorter than this (in quarters) is the note ringing out, not a
 *  rest: a plucked note fades well before the next one, and a rest after every
 *  note would bury the tab in empty columns. */
const MIN_REST = 1;

const hannCache = new Map<number, Float64Array>();
function hann(size: number): Float64Array {
  let w = hannCache.get(size);
  if (!w) {
    w = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
    hannCache.set(size, w);
  }
  return w;
}

/** Magnitude spectrum of samples[from, from+size), Hann-windowed; out-of-range samples read as silence. */
function spectrum(samples: Float32Array, from: number, size: number): Float64Array {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const w = hann(size);
  for (let i = 0; i < size; i++) re[i] = (samples[from + i] ?? 0) * w[i];
  // Iterative radix-2 FFT (size is a power of two).
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= size; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < size; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
  const mag = new Float64Array(size / 2);
  for (let k = 0; k < size / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  return mag;
}

function rmsAt(samples: Float32Array, from: number, length: number): number {
  let sum = 0;
  let n = 0;
  for (let i = Math.max(0, from); i < Math.min(samples.length, from + length); i++, n++) sum += samples[i] * samples[i];
  return n ? Math.sqrt(sum / n) : 0;
}

/**
 * Pluck times, in seconds: peaks of the spectral flux (how much energy
 * appeared, bin by bin, since the previous frame). Bins that were already
 * ringing contribute nothing, so a pluck stands out over a ringing string.
 * The previous frame is widened by a bin each side first (Böck & Widmer's
 * SuperFlux), so a ringing note drifting slightly in pitch — vibrato, a
 * string settling — doesn't count as new energy either.
 */
function detectOnsets(samples: Float32Array, sampleRate: number, silence: number): number[] {
  const frames = Math.max(0, Math.floor((samples.length - ONSET_WINDOW) / HOP) + 1);
  const maxBin = Math.min(ONSET_WINDOW / 2, Math.floor((FLUX_MAX_HZ * ONSET_WINDOW) / sampleRate));
  const flux = new Float64Array(frames);
  let previous: Float64Array | null = null;
  for (let i = 0; i < frames; i++) {
    const mag = spectrum(samples, i * HOP, ONSET_WINDOW);
    const log = new Float64Array(maxBin);
    for (let k = 0; k < maxBin; k++) log[k] = Math.log1p(FLUX_COMPRESSION * mag[k]);
    if (previous) {
      let sum = 0;
      for (let k = 0; k < maxBin; k++) {
        const before = Math.max(previous[k], previous[k - 1] ?? 0, previous[k + 1] ?? 0);
        sum += Math.max(0, log[k] - before);
      }
      flux[i] = sum;
    }
    previous = log;
  }

  const delta = FLUX_DELTA * Math.max(0, ...flux);
  const onsets: number[] = [];
  for (let i = 1; i < frames; i++) {
    let isPeak = flux[i] > 0;
    for (let j = Math.max(0, i - PEAK_RADIUS); j <= Math.min(frames - 1, i + PEAK_RADIUS) && isPeak; j++) {
      if (flux[j] > flux[i]) isPeak = false;
    }
    if (!isPeak) continue;
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - AVERAGE_RADIUS); j <= Math.min(frames - 1, i + AVERAGE_RADIUS); j++, n++) sum += flux[j];
    if (flux[i] < sum / n + delta) continue;
    // The frame where the flux peaks has the attack around its middle.
    const time = (i * HOP + ONSET_WINDOW / 2) / sampleRate;
    if (onsets.length && time - onsets[onsets.length - 1] < ONSET_REFRACTORY) continue;
    // Room noise and hum can still flicker in the flux, and muting a string
    // or a pick scrape is a burst with nothing after it; a pluck rings on.
    const sustainFrom = Math.round((time + ATTACK_SKIP) * sampleRate);
    if (rmsAt(samples, sustainFrom, Math.round(MIN_NOTE * sampleRate)) < silence) continue;
    onsets.push(time);
  }
  return onsets;
}

/** How well a spectrum fits one note: its harmonics, weighted 1/h so a note an octave below can't win on shared harmonics. */
function salience(mag: Float64Array, sampleRate: number, midi: number): number {
  const f0 = 440 * 2 ** ((midi - 69) / 12);
  let total = 0;
  for (let h = 1; h <= HARMONICS; h++) {
    const bin = (h * f0 * mag.length * 2) / sampleRate;
    if (bin >= mag.length - 1) break;
    const b = Math.floor(bin);
    const frac = bin - b;
    total += (mag[b] * (1 - frac) + mag[b + 1] * frac) / h;
  }
  return total;
}

/**
 * The note a pluck added: the spectrum just after it, minus the spectrum
 * just before it (what was already ringing), matched against every
 * candidate note's harmonic pattern.
 */
function pitchAt(samples: Float32Array, sampleRate: number, onset: number): number {
  const at = Math.round(onset * sampleRate);
  const after = spectrum(samples, at + Math.round(ATTACK_SKIP * sampleRate), PITCH_WINDOW);
  const before = spectrum(samples, at - PITCH_WINDOW - Math.round(0.005 * sampleRate), PITCH_WINDOW);
  const added = after.map((v, k) => Math.max(0, v - before[k]));
  const score = (midi: number) => salience(added, sampleRate, midi);
  let best = LOWEST_MIDI;
  for (let midi = LOWEST_MIDI + 1; midi <= HIGHEST_MIDI; midi++) {
    if (score(midi) > score(best)) best = midi;
  }
  while (best - 12 >= LOWEST_MIDI && score(best - 12) > OCTAVE_BELOW_RATIO * score(best)) best -= 12;
  return best;
}

export function detectNotes(samples: Float32Array, sampleRate: number): NoteEvent[] {
  let peak = 0;
  for (let i = 0; i + HOP <= samples.length; i += HOP) peak = Math.max(peak, rmsAt(samples, i, HOP));
  const silence = Math.max(SILENCE_FLOOR, peak * SILENCE_RATIO);
  const onsets = detectOnsets(samples, sampleRate, silence);

  const notes = onsets.map((start, i) => {
    // A note lasts until the next pluck, or until it fades to silence first.
    const next = onsets[i + 1] ?? samples.length / sampleRate;
    let end = next;
    let quietSince: number | null = null;
    for (let t = start + ATTACK_SKIP; t < next; t += HOP / sampleRate) {
      if (rmsAt(samples, Math.round(t * sampleRate), HOP) >= silence) quietSince = null;
      else if (quietSince === null) quietSince = t;
      else if (t - quietSince >= RELEASE_GAP) {
        end = quietSince;
        break;
      }
    }
    return { midi: pitchAt(samples, sampleRate, start), start, end };
  });
  return notes.filter((n) => n.end - n.start >= MIN_NOTE);
}

/**
 * Snaps note events to a 16th-note grid. The grid starts on the first note
 * when it lands within a beat of the end of the count-in (`downbeat`):
 * players come in a reaction-time late far more often than they start on an
 * off-beat, and anchoring there also absorbs the interface's latency. A take
 * that starts later than that keeps the count-in's downbeat and gets a
 * leading rest. Every gap is filled — a short one by stretching the note
 * before it, a long one with a rest — so the beats' durations add up to real
 * time and playback lines up with what was played.
 */
export function quantize(notes: NoteEvent[], bpm: number, downbeat: number): GridBeat[] {
  const secondsPerQuarter = 60 / bpm;
  const first = notes.find((n) => n.start >= downbeat - secondsPerQuarter / GRID);
  const anchor = first && first.start <= downbeat + secondsPerQuarter ? first.start : downbeat;
  const snap = (seconds: number) => Math.round(((seconds - anchor) / secondsPerQuarter) * GRID) / GRID;

  // ponytail: two notes landing on the same 16th keep only the first. Fine
  // for single notes at practice tempos; a finer grid if fast runs collapse.
  const slots: { midi: number; start: number; end: number }[] = [];
  for (const note of notes) {
    if (snap(note.start) < 0) continue; // played during the count-in
    const start = snap(note.start);
    if (slots.length && slots[slots.length - 1].start === start) continue;
    slots.push({ midi: note.midi, start, end: Math.max(snap(note.end), start + 1 / GRID) });
  }

  const beats: GridBeat[] = [];
  const rest = (start: number, end: number) => {
    // Split at bar lines: a bar with nothing starting in it would vanish
    // from the renderer, which draws one group per bar index.
    // ponytail: notes ringing across a bar line stay whole, ties when Step 4 draws rhythm.
    for (let at = start; at < end; ) {
      const barEnd = (Math.floor(at / BEATS_PER_BAR + 1e-9) + 1) * BEATS_PER_BAR;
      const to = Math.min(end, barEnd);
      beats.push({ pitches: [], start: at, duration: to - at });
      at = to;
    }
  };

  if (slots.length && slots[0].start > 0) rest(0, slots[0].start);
  slots.forEach((slot, i) => {
    const next = slots[i + 1]?.start;
    if (next === undefined) {
      beats.push({ pitches: [slot.midi], start: slot.start, duration: slot.end - slot.start });
    } else if (next - slot.end >= MIN_REST) {
      beats.push({ pitches: [slot.midi], start: slot.start, duration: slot.end - slot.start });
      rest(slot.end, next);
    } else {
      beats.push({ pitches: [slot.midi], start: slot.start, duration: next - slot.start });
    }
  });
  return beats;
}

export function gridToTab(beats: GridBeat[], bpm: number, tuning?: number[]): Tab {
  const positions = assignFingering(
    beats.map((b) => b.pitches),
    { tuning },
  );
  const tabBeats: TabBeat[] = beats.map((beat, i) => ({
    position: i,
    bar: Math.floor(beat.start / BEATS_PER_BAR + 1e-9),
    duration: beat.duration,
    notes: positions[i].map((p) => ({ ...p, techniques: [] })),
  }));
  return {
    beats: tabBeats,
    tempo: bpm,
    timeSignature: { numerator: BEATS_PER_BAR, denominator: 4 },
  };
}

/** The whole pipeline. `downbeat` is where the count-in ends, in seconds into `samples`. */
export function transcribe(samples: Float32Array, sampleRate: number, bpm: number, downbeat: number): Tab {
  return gridToTab(quantize(detectNotes(samples, sampleRate), bpm, downbeat), bpm);
}
