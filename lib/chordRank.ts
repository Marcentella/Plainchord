import type { Chord } from "./chords";

// Duplicated from transitionDifficulty's requiresBarre (same finger pressed
// across 2+ strings): that module can't be imported here as a plain value —
// plain `node --test` needs relative imports to carry a real ".ts"
// extension, which tsc rejects project-wide without allowImportingTsExtensions.
// Keeping this file to type-only imports keeps it testable without that flag.
function requiresBarre(chord: Chord): boolean {
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
 * Open/simple = plain major or minor triad, no barre. Everything else
 * (7th, maj7, sus, dim, aug, add9, or any voicing that needs a barre) ranks
 * after it. "Extended/altered" is a naming convention (the quality suffix
 * on the chord name), not something derivable from fret/finger geometry —
 * a bare "" or "m" suffix is the only "simple" case, generalizing to any
 * future chord without a lookup table.
 */
export function isOpenOrSimple(chord: Chord): boolean {
  const quality = chord.name.replace(/^[A-G][#b]?/, "");
  return (quality === "" || quality === "m") && !requiresBarre(chord);
}

/**
 * Index of the first suggestion that isn't a bare exact match for what's
 * already typed. An exact match has nothing left to complete — it's a
 * useless ghost-text default — but it stays reachable by cycling through
 * the rest of the list. Falls back to 0 when every candidate is that match
 * (i.e. it's the only one).
 */
export function pickDefaultIndex(suggestions: Chord[], token: string): number {
  const t = token.toLowerCase();
  const i = suggestions.findIndex((c) => c.name.toLowerCase() !== t);
  return i === -1 ? 0 : i;
}
