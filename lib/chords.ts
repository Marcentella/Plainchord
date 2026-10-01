import chordsData from "@/data/chords.json";

export { parseProgression } from "./parseProgression";

/**
 * Where the chord library (app/acordes) keeps the last progression typed,
 * and where the landing page's box (components/LandingHero) leaves one for
 * it to pick up. A single string value — same simple case as the
 * theme/palette preferences (see FEATURES.md's palette section for why
 * localStorage, not IndexedDB, is the right store for a value like this).
 */
export const PROGRESSION_STORAGE_KEY = "progression";

/**
 * frets/fingers: 6 entries, string order low E -> high e (E A D G B e).
 * frets: -1 = muted, 0 = open, >0 = fret number.
 * fingers: 0 = open/muted, 1-4 = finger (index..pinky). Ignored when fret <= 0.
 */
export type Chord = {
  name: string;
  frets: number[];
  fingers: number[];
};

export const allChords = chordsData as Chord[];

const byName = new Map(allChords.map((c) => [key(c.name), c]));

function key(name: string): string {
  return name.trim().toLowerCase();
}

export function findChord(name: string): Chord | undefined {
  return byName.get(key(name));
}
