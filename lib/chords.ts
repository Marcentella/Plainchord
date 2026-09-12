import chordsData from "@/data/chords.json";

export { parseProgression } from "./parseProgression";

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
