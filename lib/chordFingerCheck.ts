/**
 * Compares what the camera reads for each finger with a chord's diagram
 * (plan: Step 3). Pure, tested under node:test. Descriptive, not a score:
 * each finger gets where it is and where the diagram puts it, nothing more.
 */
import type { Chord } from "./chords";
import { findBarres } from "./chordShape.ts";

/** String 0-5 (low E..high e) and fret, as lib/fretMapping.ts reads them; null = not on the neck. */
export type FingerReading = { string: number; fret: number } | null;

export type FingerStatus =
  /** On one of the strings and the fret the diagram gives this finger. */
  | "ok"
  /** Right fret, different string. */
  | "wrongString"
  /** Right string, different fret. */
  | "wrongFret"
  /** Neither. */
  | "elsewhere"
  /** The chord uses this finger, but it isn't over the neck. */
  | "notSeen"
  /** The chord doesn't use this finger. */
  | "unused";

/** Where the diagram puts a finger: one string, or a barre's span. */
export type Expected = { strings: number[]; fret: number; barre: boolean };

export type FingerCheck = { finger: number; status: FingerStatus; expected: Expected | null; detected: FingerReading };

/** Fingers 1-4 (index..pinky), with where the chord puts each one; null if unused. */
export function expectedFingers(chord: Chord): (Expected | null)[] {
  const barres = findBarres(chord);
  return [1, 2, 3, 4].map((finger) => {
    const barre = barres.find((b) => b.finger === finger);
    if (barre) {
      // A barre presses every string across its span, including ones other
      // fingers press higher up: anywhere from its lowest to highest string counts.
      const lo = Math.min(...barre.strings);
      const hi = Math.max(...barre.strings);
      return { strings: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), fret: barre.fret, barre: true };
    }
    const string = chord.fingers.findIndex((f, s) => f === finger && chord.frets[s] > 0);
    return string >= 0 ? { strings: [string], fret: chord.frets[string], barre: false } : null;
  });
}

export function checkChord(chord: Chord, readings: FingerReading[]): FingerCheck[] {
  return expectedFingers(chord).map((expected, i) => {
    const detected = readings[i] ?? null;
    const finger = i + 1;
    if (!expected) return { finger, status: "unused", expected, detected };
    if (!detected) return { finger, status: "notSeen", expected, detected };
    const onString = expected.strings.includes(detected.string);
    const onFret = detected.fret === expected.fret;
    const status: FingerStatus = onString && onFret ? "ok" : onFret ? "wrongString" : onString ? "wrongFret" : "elsewhere";
    return { finger, status, expected, detected };
  });
}

/** Every finger the chord uses is where the diagram puts it. */
export function allInPlace(checks: FingerCheck[]): boolean {
  const used = checks.filter((c) => c.status !== "unused");
  return used.length > 0 && used.every((c) => c.status === "ok");
}

/** How long a finger's reading must hold before it counts. */
export const STABLE_MS = 150;

/**
 * Passes a finger's reading on only once it has held for STABLE_MS. A
 * finger moving across the neck goes through every string and fret on its
 * way; without this the comparison would flicker through all of them. It
 * also stands in for "pressing, not passing by", which a camera can't see.
 */
export class ReadingStabilizer {
  private candidate: FingerReading[] = [null, null, null, null];
  private since: number[] = [0, 0, 0, 0];
  private stable: FingerReading[] = [null, null, null, null];

  update(readings: FingerReading[], timeMs: number): FingerReading[] {
    readings.forEach((reading, i) => {
      const same =
        reading === this.candidate[i] ||
        (reading !== null && this.candidate[i] !== null && reading.string === this.candidate[i]!.string && reading.fret === this.candidate[i]!.fret);
      if (!same) {
        this.candidate[i] = reading;
        this.since[i] = timeMs;
      }
      if (timeMs - this.since[i] >= STABLE_MS) this.stable[i] = this.candidate[i];
    });
    return [...this.stable];
  }

  reset() {
    this.candidate = [null, null, null, null];
    this.since = [0, 0, 0, 0];
    this.stable = [null, null, null, null];
  }
}

/** Where a fingertip is on the neck, continuous: string 0-5 (2.5 = between D and G), fret position as lib/fretMapping.ts's fretPosition gives it (2.5 = halfway between wires 2 and 3). */
export type FingerPosition = { string: number; fret: number } | null;

/** How long a finger must read exactly right before it locks. */
export const LOCK_MS = 300;
/**
 * How far a locked finger may wobble before the lock breaks, in string
 * spacings from its target. Below 1 on purpose: a finger on the
 * neighbouring string — the commonest beginner mistake — is a full spacing
 * away and always breaks it, so the lock only absorbs jitter, never an
 * actual error.
 */
export const LOCK_STRING_RADIUS = 0.85;
/** Fret-space margin on either side of the target fret's cell while locked. */
export const LOCK_FRET_MARGIN = 0.35;
/** A locked finger can drop out of view this long (a blink of occlusion) before unlocking. */
export const LOCK_GRACE_MS = 500;

/**
 * "Snap" for a calmer check: once a finger has read exactly where the
 * diagram puts it for LOCK_MS, it stays there while it's still near,
 * instead of flickering with every wobble of the hand landmarks. Strict by
 * design: it only ever starts from an exact match (it never pulls a nearby
 * finger into place), and moving a whole string breaks it, so it steadies a
 * right answer without being able to hide a wrong one.
 */
export class FingerLock {
  private locked: (Expected | null)[] = [null, null, null, null];
  private okSince: (number | null)[] = [null, null, null, null];
  private lastNear: number[] = [0, 0, 0, 0];
  private chordName: string | null = null;

  update(
    chord: Chord,
    stable: FingerReading[],
    positions: FingerPosition[],
    timeMs: number,
  ): { readings: FingerReading[]; locked: boolean[] } {
    if (chord.name !== this.chordName) {
      this.reset();
      this.chordName = chord.name;
    }
    const expected = expectedFingers(chord);
    const checks = checkChord(chord, stable);
    const readings = stable.map((reading, i) => {
      const target = expected[i];
      if (!target) {
        this.locked[i] = null;
        this.okSince[i] = null;
        return reading;
      }
      if (this.locked[i]) {
        const p = positions[i];
        if (p && isNear(p, target)) this.lastNear[i] = timeMs;
        else if (p || timeMs - this.lastNear[i] > LOCK_GRACE_MS) this.locked[i] = null;
      } else if (checks[i].status === "ok") {
        this.okSince[i] ??= timeMs;
        if (timeMs - this.okSince[i]! >= LOCK_MS) {
          this.locked[i] = target;
          this.lastNear[i] = timeMs;
        }
      } else {
        this.okSince[i] = null;
      }
      if (!this.locked[i]) return reading;
      this.okSince[i] = null;
      // Locked: report the target cell. For a barre, the string the finger is nearest along the bar.
      const p = positions[i];
      const string = p ? nearestOf(target.strings, p.string) : (reading?.string ?? target.strings[0]);
      return { string, fret: target.fret };
    });
    return { readings, locked: this.locked.map((l) => l !== null) };
  }

  reset() {
    this.locked = [null, null, null, null];
    this.okSince = [null, null, null, null];
    this.lastNear = [0, 0, 0, 0];
    this.chordName = null;
  }
}

function nearestOf(strings: number[], s: number): number {
  return strings.reduce((best, x) => (Math.abs(x - s) < Math.abs(best - s) ? x : best));
}

function isNear(p: NonNullable<FingerPosition>, target: Expected): boolean {
  const stringDistance = Math.abs(nearestOf(target.strings, p.string) - p.string);
  return stringDistance < LOCK_STRING_RADIUS && p.fret > target.fret - 1 - LOCK_FRET_MARGIN && p.fret < target.fret + LOCK_FRET_MARGIN;
}
