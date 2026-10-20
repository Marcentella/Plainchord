import { allChords, type Chord } from "./chords";
import { suggestFrom } from "./chordRank";
import type { Notation } from "./notation";

/** Library chords matching what's being typed, in the active notation (see suggestFrom). */
export function suggestChords(prefix: string, notation: Notation): Chord[] {
  return suggestFrom(allChords, prefix, notation);
}
