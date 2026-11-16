/**
 * Major keys: which chords belong to one, which key a progression is in, and
 * the classic progression shapes moved into any key. Pure, names only (no
 * chord library lookups), so lib/keys.test.ts runs it under plain Node.
 *
 * Revives FEATURES.md's paused "progresiones dinámicas + transposición":
 * a shape is stored once as degrees and turned into chords per key.
 */

const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
// F, Bb, Eb, Ab, Db: keys written with flats (F's IV is Bb, never A#).
const FLAT_KEYS = new Set([5, 10, 3, 8, 1]);

/** Semitones from the tonic to each degree of the major scale. */
const STEPS = [0, 2, 4, 5, 7, 9, 11];
/** Triad quality on each degree: I ii iii IV V vi vii°. */
const QUALITY = ["", "m", "m", "", "", "m", "dim"];
export const NUMERALS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];

/**
 * Common shapes, as degree indexes (0 = I). Played in a loop, so the last
 * chord also changes back to the first.
 */
export const SHAPES: number[][] = [
  [0, 3, 4], // I–IV–V
  [0, 4, 5, 3], // I–V–vi–IV
  [5, 3, 0, 4], // vi–IV–I–V
  [0, 5, 3, 4], // I–vi–IV–V
  [1, 4, 0], // ii–V–I
];

const ROOT = /^([A-G])([#b]?)(.*)$/;

function pitchClass(letter: string, accidental: string): number {
  const pc = SHARPS.indexOf(letter);
  return (pc + (accidental === "#" ? 1 : accidental === "b" ? 11 : 0)) % 12;
}

/** Major / minor / diminished, or "any" for sus chords, which have no third. */
function family(suffix: string): string {
  if (suffix.startsWith("dim")) return "dim";
  if (suffix.startsWith("m") && !suffix.startsWith("maj")) return "m";
  if (suffix.startsWith("sus")) return "any";
  return ""; // "", "7", "maj7", "add9": a major triad underneath
}

function parse(name: string): { pc: number; family: string } | null {
  const m = ROOT.exec(name);
  return m ? { pc: pitchClass(m[1], m[2]), family: family(m[3]) } : null;
}

export function noteName(pc: number, tonic = pc): string {
  return (FLAT_KEYS.has(tonic) ? FLATS : SHARPS)[pc];
}

/** The seven chords of the major key on `tonic` (a pitch class, C = 0). */
export function keyChords(tonic: number): string[] {
  return STEPS.map((step, d) => noteName((tonic + step) % 12, tonic) + QUALITY[d]);
}

/** Which degree (0-6) `name` is in the key, or -1 when it doesn't belong. */
export function degreeOf(name: string, tonic: number): number {
  const c = parse(name);
  if (!c) return -1;
  const d = STEPS.indexOf((c.pc - tonic + 12) % 12);
  return d >= 0 && (c.family === "any" || c.family === QUALITY[d]) ? d : -1;
}

/**
 * A progression's key. `tonic` is always the major key whose chords it uses;
 * `minor` means its relative minor is home instead (Am rather than C: same
 * six chords, vi as the centre). `outside` lists the chords borrowed from
 * outside the key (the F in G F C G), each named once.
 */
export type KeyFit = { tonic: number; minor: boolean; outside: string[] };

/**
 * The key a progression fits best, or null when nothing was typed or a token
 * isn't a chord. Most chords must belong: up to one outsider in four distinct
 * chords (at least one allowed). Each fitting chord outweighs the hints
 * except when the hints are strong: starting AND ending on a key's I beats
 * one more fit, which is how G F C G reads as G with a borrowed F, not C.
 * Hints: the first chord is home, then the last, then a start on the
 * relative minor, then fewer sharps or flats.
 * Minor: starts on vi and ends on vi or on the minor key's major V (the E7
 * in Am Dm E7, itself an outsider).
 */
export function detectKey(names: string[]): KeyFit | null {
  const distinct = [...new Set(names)];
  if (distinct.length === 0 || distinct.some((n) => !parse(n))) return null;
  const allowed = Math.max(1, Math.floor(distinct.length / 4));
  let best: KeyFit | null = null;
  let bestScore = -Infinity;
  for (let tonic = 0; tonic < 12; tonic++) {
    const outside = distinct.filter((n) => degreeOf(n, tonic) < 0);
    if (outside.length > allowed || outside.length === distinct.length) continue;
    const first = degreeOf(names[0], tonic);
    const last = degreeOf(names[names.length - 1], tonic);
    const accidentals = Math.min((tonic * 7) % 12, (tonic * 5) % 12); // steps round the circle of fifths
    const score =
      (distinct.length - outside.length) * 10 +
      (first === 0 ? 8 : 0) +
      (last === 0 ? 4 : 0) +
      (first === 5 ? 2 : 0) -
      accidentals * 0.1;
    if (score > bestScore) {
      const end = parse(names[names.length - 1])!;
      const minorDominant = end.pc === (tonic + 4) % 12 && end.family !== "m" && end.family !== "dim";
      const minor = first === 5 && (last === 5 || minorDominant);
      // In a minor key the major V (E / E7 in A minor) is the usual tension
      // chord, not a borrowed one, so it isn't listed as outside.
      best = { tonic, minor, outside: minor ? outside.filter((n) => !isMinorDominant(n, tonic)) : outside };
      bestScore = score;
    }
  }
  return best;
}

/** E or E7 for C's relative minor (A minor): a major chord on the major key's 3rd degree. */
function isMinorDominant(name: string, tonic: number): boolean {
  const c = parse(name);
  return !!c && c.pc === (tonic + 4) % 12 && (c.family === "" || c.family === "any");
}

/** What each chord does: home (T), moving away (S), pulling back (D). */
export type HarmonicFunction = "T" | "S" | "D";

/**
 * A key as the cards show it: six chords in the order a theory book lists
 * them, from the home chord, with numerals counted from that home, and the
 * classic shapes as indexes into the six. vii° (ii° in minor) is left out.
 *
 * Major (C): C Dm Em F G Am, I ii iii IV V vi.
 * Minor (A minor, same chords as C): Am C Dm E7 F G, i III iv V7 VI VII.
 * The V is major (E, not Em), the "harmonic minor" dominant that pulls back
 * to Am, and shown as E7, the form beginners play (Am Dm E7) and books
 * write as V7. Cards match typed chords exactly, so E7 is what lights it.
 */
export type KeyView = { chords: string[]; numerals: string[]; functions: HarmonicFunction[]; shapes: number[][] };

export function keyView(tonic: number, minor: boolean): KeyView {
  const c = keyChords(tonic);
  if (!minor) {
    return {
      chords: c.slice(0, 6),
      numerals: NUMERALS.slice(0, 6),
      functions: ["T", "S", "T", "S", "D", "T"],
      shapes: SHAPES,
    };
  }
  return {
    chords: [c[5], c[0], c[1], c[2].replace(/m$/, "7"), c[3], c[4]],
    numerals: ["i", "III", "iv", "V7", "VI", "VII"],
    functions: ["T", "T", "S", "D", "S", "D"],
    shapes: [
      [0, 2, 3], // i–iv–V
      [0, 4, 1, 5], // i–VI–III–VII
      [0, 4, 5], // i–VI–VII
      [0, 5, 4, 3], // i–VII–VI–V
      [0, 2, 5, 1], // i–iv–VII–III
    ],
  };
}

/** Where a fitted key's home is: the tonic, or the relative minor's root. */
export function homeOf(fit: KeyFit): number {
  return fit.minor ? (fit.tonic + 9) % 12 : fit.tonic;
}
