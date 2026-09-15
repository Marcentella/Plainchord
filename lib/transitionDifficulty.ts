import type { Chord } from "./chords";

export type Difficulty = "facil" | "media" | "dificil";

type FretPosition = { string: number; fret: number };

/**
 * Every physically fretted position, one entry per string. Deliberately NOT
 * keyed by finger label: a chord chart's finger numbers are assigned per
 * chord, for that chord's own ergonomics — "finger 2" in one chord isn't a
 * promise that it's the same physical finger continuing into the next one.
 * Matching by label produced wildly inflated distances (see transitionScore
 * below for the fix this enables). This also fixes a latent bug the old
 * finger-keyed version had: a barre finger pressing 3+ strings collapsed to
 * a single map entry (each string overwrote the last), silently dropping
 * every other string of any barre chord from the whole calculation.
 */
function positionsOf(chord: Chord): FretPosition[] {
  const positions: FretPosition[] = [];
  chord.frets.forEach((fret, string) => {
    const finger = chord.fingers[string];
    if (fret > 0 && finger > 0) positions.push({ string, fret });
  });
  return positions;
}

function positionDistance(p: FretPosition, q: FretPosition): number {
  return Math.abs(p.string - q.string) + Math.abs(p.fret - q.fret);
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
 * Cheapest way to pair up positions from two chords (order-independent;
 * unbalanced sizes are fine — leftover positions on the larger side are
 * left unmatched and counted separately by the caller as "repositioned").
 * A true slide (same string, different fret) isn't special-cased — it just
 * falls out as the cheapest match whenever that string is occupied in both
 * chords, since a 0-or-small same-string distance is hard to beat.
 *
 * ponytail: brute-force backtracking over every pairing, not the Hungarian
 * algorithm. A chord has at most 6 fretted positions (one per string), so
 * this is at most 6! = 720 branches, pruned hard whenever a partial cost
 * already can't beat the best found — instant at chord-sized inputs.
 * Revisit only if a chord shape could ever exceed 6 strings.
 */
function minCostMatching(a: FretPosition[], b: FretPosition[]): number {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length === 0) return 0;

  const used = new Array(longer.length).fill(false);
  let best = Infinity;

  function search(i: number, cost: number) {
    if (cost >= best) return; // can't beat the best matching found so far
    if (i === shorter.length) {
      best = cost;
      return;
    }
    for (let j = 0; j < longer.length; j++) {
      if (used[j]) continue;
      used[j] = true;
      search(i + 1, cost + positionDistance(shorter[i], longer[j]));
      used[j] = false;
    }
  }

  search(0, 0);
  return best;
}

/**
 * Higher = harder transition. Combines: minimum total travel distance
 * between fretted positions (matched by physical closeness, not finger
 * label), fingers that must lift and land fresh with no matching position
 * on the other side, hand position shift, and a barre-only-on-one-side
 * penalty.
 */
export function transitionScore(a: Chord, b: Chord): number {
  const posA = positionsOf(a);
  const posB = positionsOf(b);
  const barreMismatch = requiresBarre(a) !== requiresBarre(b) ? 1 : 0;

  // Gaining or losing a barre re-grips the whole hand around a different
  // shape — it isn't individual fingers sliding to new spots, even when
  // one happens to land on a string/fret it already occupied. Without this
  // guard, position-matching could award real "travel" credit for that
  // kind of coincidence: e.g. C and F's barre shape share two exact
  // string/fret coordinates purely by accident of C's own fingering, which
  // let C -> F score as an easier transition than G -> F even though G's
  // positions sit consistently closer to F's throughout. Barre chords
  // already exist in this library and can be transitioned to/from directly
  // in the browser (e.g. type "C - F" or "G - F"), so this isn't a
  // theoretical case. When barre status differs, skip matching for both
  // travel AND the repositioned count — every position on the larger side
  // is being freshly placed, not carried over from a match. `Math.max`
  // (not `posB.length`) keeps this symmetric: transitionScore(a, b) must
  // equal transitionScore(b, a), and the two chords' position counts don't
  // swap identically when the arguments do.
  const travel = barreMismatch ? 0 : minCostMatching(posA, posB);
  const repositioned = barreMismatch
    ? Math.max(posA.length, posB.length)
    : Math.abs(posA.length - posB.length);

  const handShift = Math.abs(handPosition(a) - handPosition(b));

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
