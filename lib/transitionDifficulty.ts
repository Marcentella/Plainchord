import type { Chord } from "./chords";

export type Difficulty = "facil" | "media" | "dificil";

type FingerPos = { string: number; fret: number };

/** Fret/string of each fretted finger (1-4). Open/muted strings have no finger. */
function fingerPositions(chord: Chord): Map<number, FingerPos> {
  const positions = new Map<number, FingerPos>();
  chord.frets.forEach((fret, string) => {
    const finger = chord.fingers[string];
    if (fret > 0 && finger > 0) positions.set(finger, { string, fret });
  });
  return positions;
}

/** Lowest fretted position — a rough proxy for where the hand sits on the neck. */
function handPosition(chord: Chord): number {
  const fretted = chord.frets.filter((f) => f > 0);
  return fretted.length ? Math.min(...fretted) : 0;
}

/** A finger pressed across 2+ strings at once means a barre is required. */
export function requiresBarre(chord: Chord): boolean {
  const stringsPerFinger = new Map<number, number>();
  chord.frets.forEach((fret, i) => {
    const finger = chord.fingers[i];
    if (fret > 0 && finger > 0) {
      stringsPerFinger.set(finger, (stringsPerFinger.get(finger) ?? 0) + 1);
    }
  });
  return [...stringsPerFinger.values()].some((count) => count >= 2);
}

/**
 * Higher = harder transition. Combines: per-finger travel distance, hand
 * position shift, fingers that must fully lift and reposition (rather than
 * slide on the same string), and a barre-only-on-one-side penalty.
 */
export function transitionScore(a: Chord, b: Chord): number {
  const posA = fingerPositions(a);
  const posB = fingerPositions(b);
  const fingers = new Set([...posA.keys(), ...posB.keys()]);

  let travel = 0;
  let repositioned = 0;

  for (const finger of fingers) {
    const pa = posA.get(finger);
    const pb = posB.get(finger);
    if (pa && pb && pa.string === pb.string) {
      travel += Math.abs(pa.fret - pb.fret); // slides along one string
    } else if (pa && pb) {
      travel += Math.abs(pa.fret - pb.fret) + Math.abs(pa.string - pb.string);
      repositioned += 1; // jumps to a different string
    } else {
      repositioned += 1; // only used in one of the two chords
    }
  }

  const handShift = Math.abs(handPosition(a) - handPosition(b));
  const barreMismatch = requiresBarre(a) !== requiresBarre(b) ? 1 : 0;

  return travel + repositioned * 1.5 + handShift * 1.5 + barreMismatch * 3;
}

// ponytail: thresholds picked by computing the score for every pair in the
// current chord library and splitting near its terciles (~facil/media/dificil
// each get a third); revisit if new chords skew the distribution.
export function classifyDifficulty(score: number): Difficulty {
  if (score <= 6) return "facil";
  if (score <= 10) return "media";
  return "dificil";
}

export function transitionDifficulty(a: Chord, b: Chord): Difficulty {
  return classifyDifficulty(transitionScore(a, b));
}
