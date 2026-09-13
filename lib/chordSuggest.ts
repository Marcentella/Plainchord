import { allChords, type Chord } from "./chords";
import { isOpenOrSimple } from "./chordRank";

/** Chords starting with `prefix` (case-insensitive), simple voicings first. */
export function suggestChords(prefix: string): Chord[] {
  const p = prefix.trim().toLowerCase();
  if (!p) return [];
  return allChords
    .filter((c) => c.name.toLowerCase().startsWith(p))
    .sort((a, b) => Number(isOpenOrSimple(b)) - Number(isOpenOrSimple(a)));
}
