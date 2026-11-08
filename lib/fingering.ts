/**
 * Picks where on the neck to play each note. A pitch alone doesn't say: E4
 * sits on five different string/fret spots in standard tuning, and audio
 * transcription (plantechdifficulty.md, Step 2) only ever knows the pitch.
 *
 * Viterbi over (positions, hand window) states, one layer per beat. The hand
 * window is where the index finger rests: fingers 1-4 cover frets
 * hand..hand+3 without moving, hand+4 is a stretch. Keeping the hand as its
 * own state (instead of reading it off the notes) is what lets a run like
 * 5-7-8 on one string cost nothing — it's one position, not two shifts.
 *
 * Its own cost model, not lib/transitionDifficulty.ts: that one compares two
 * fixed chord shapes from the library, this one chooses the shapes.
 */

export type Position = { string: number; fret: number };

export type FingeringOptions = {
  /** MIDI note per open string, low to high (Tab.tuningMidi). Default standard tuning. */
  tuning?: number[];
  maxFret?: number;
};

const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];
const DEFAULT_MAX_FRET = 20;
/** Frets past the hand position reachable without moving: index on hand, pinky on hand+3. */
const REACH = 3;
/** Widest fretted span accepted at all, as a stretch. */
const STRETCH = 4;

// Kept as one table so Step 5's ablation can zero one term at a time.
const COST = {
  /** Per fret the hand moves between beats. */
  shift: 1,
  /** Any move at all, on top of the distance: two small shifts cost more than staying put. */
  shiftStart: 0.5,
  /** A note at hand+4. */
  stretch: 1,
  /** Per fret of hand position: lower positions first, for beginners. */
  height: 0.1,
  /** Per fretted note: an open string is easier than pressing one. */
  fretted: 0.1,
  /** Per string between consecutive beats' average string. */
  stringJump: 0.2,
};

type State = { notes: Position[]; hand: number; cost: number; prev: number };

function positionsFor(pitch: number, tuning: number[], maxFret: number): Position[] {
  return tuning
    .map((open, string) => ({ string, fret: pitch - open }))
    .filter((p) => p.fret >= 0 && p.fret <= maxFret);
}

function frettedFrets(notes: Position[]): number[] {
  return notes.filter((n) => n.fret > 0).map((n) => n.fret);
}

/** Every way to put these pitches on distinct strings within a playable span. */
function assignments(pitches: number[], tuning: number[], maxFret: number): Position[][] {
  const out: Position[][] = [];
  const pick = (i: number, used: Position[]) => {
    if (i === pitches.length) {
      out.push(used);
      return;
    }
    for (const p of positionsFor(pitches[i], tuning, maxFret)) {
      if (used.some((u) => u.string === p.string)) continue;
      const next = [...used, p];
      const frets = frettedFrets(next);
      if (frets.length && Math.max(...frets) - Math.min(...frets) > STRETCH) continue;
      pick(i + 1, next);
    }
  };
  pick(0, []);
  return out;
}

/**
 * Candidate shapes for one beat. Pitches no string can reach (below the
 * lowest open string, above maxFret) are dropped: there's nothing to place.
 * ponytail: when the rest still can't share the neck (two pitches only one
 * string reaches, or more than six notes), inner voices go first, keeping
 * the bass and top line that carry the harmony and melody. Trying every
 * subset would keep more notes if transcription ever produces many of these.
 */
function candidatesFor(pitches: number[], tuning: number[], maxFret: number): Position[][] {
  const notes = [...new Set(pitches)]
    .filter((p) => positionsFor(p, tuning, maxFret).length > 0)
    .sort((a, b) => a - b);
  let found = assignments(notes, tuning, maxFret);
  while (found.length === 0) {
    notes.splice(notes.length >= 3 ? 1 : notes.length - 1, 1);
    found = assignments(notes, tuning, maxFret);
  }
  return found;
}

/** Hand positions that cover every fretted note. Open strings and rests leave the hand free. */
function handPositions(notes: Position[], maxFret: number): number[] {
  const frets = frettedFrets(notes);
  const lo = frets.length ? Math.max(1, Math.max(...frets) - STRETCH) : 1;
  const hi = frets.length ? Math.min(...frets) : maxFret - REACH;
  const hands: number[] = [];
  for (let h = lo; h <= hi; h++) hands.push(h);
  return hands;
}

function ownCost(notes: Position[], hand: number): number {
  const frets = frettedFrets(notes);
  const stretched = frets.some((f) => f > hand + REACH);
  return COST.height * (hand - 1) + COST.fretted * frets.length + (stretched ? COST.stretch : 0);
}

function averageString(notes: Position[]): number {
  return notes.reduce((sum, n) => sum + n.string, 0) / notes.length;
}

function transitionCost(from: State, notes: Position[], hand: number): number {
  const shift = Math.abs(hand - from.hand);
  let cost = COST.shift * shift + (shift > 0 ? COST.shiftStart : 0);
  if (from.notes.length && notes.length) {
    cost += COST.stringJump * Math.abs(averageString(notes) - averageString(from.notes));
  }
  return cost;
}

/**
 * One list of MIDI pitches per beat (simultaneous notes together, [] for a
 * rest) in, the cheapest string/fret for each out, aligned beat for beat.
 */
export function assignFingering(beats: number[][], options: FingeringOptions = {}): Position[][] {
  const tuning = options.tuning ?? STANDARD_TUNING;
  const maxFret = options.maxFret ?? DEFAULT_MAX_FRET;

  const layers: State[][] = [];
  for (const pitches of beats) {
    const before = layers.at(-1);
    const layer: State[] = [];
    for (const notes of candidatesFor(pitches, tuning, maxFret)) {
      for (const hand of handPositions(notes, maxFret)) {
        const own = ownCost(notes, hand);
        let cost = own;
        let prev = -1;
        if (before) {
          cost = Infinity;
          before.forEach((from, i) => {
            const c = from.cost + transitionCost(from, notes, hand) + own;
            if (c < cost) {
              cost = c;
              prev = i;
            }
          });
        }
        layer.push({ notes, hand, cost, prev });
      }
    }
    layers.push(layer);
  }

  if (!layers.length) return [];
  const last = layers[layers.length - 1];
  let i = last.reduce((best, s, j) => (s.cost < last[best].cost ? j : best), 0);
  const result: Position[][] = [];
  for (let b = layers.length - 1; b >= 0; b--) {
    result[b] = layers[b][i].notes;
    i = layers[b][i].prev;
  }
  return result;
}
