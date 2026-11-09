import type { Chord } from "./chords";

export type Barre = { finger: number; fret: number; strings: number[] };

/** A finger pressing the same fret on 2+ strings is physically a barre
 * (full or partial) — one finger can't otherwise be in two places at
 * once. Detected from frets/fingers alone (grouping by finger+fret), no
 * extra data field needed: data/chords.json never has to say "this one is
 * a barre" for this to work. `strings` keeps the exact indices the finger
 * touches (e.g. F's index finger is on strings 0, 4 and 5 — NOT a
 * contiguous run, since the G/D/A strings in between are pressed higher
 * by other fingers) — the bar is still drawn across the full min-to-max
 * span, same as every printed chord chart draws it.
 *
 * Shared by components/ChordDiagram.tsx (drawing the bar) and
 * lib/chordFingerCheck.ts (a barre finger counts anywhere along its span).
 * Kept apart from lib/chords.ts so node:test can import it: that module
 * loads the chord data through the "@/" alias. */
export function findBarres(chord: Chord): Barre[] {
  const groups = new Map<string, number[]>();
  chord.frets.forEach((fret, i) => {
    const finger = chord.fingers[i];
    if (fret > 0 && finger > 0) {
      const key = `${finger}-${fret}`;
      const strings = groups.get(key);
      if (strings) strings.push(i);
      else groups.set(key, [i]);
    }
  });
  return Array.from(groups.entries())
    .filter(([, strings]) => strings.length >= 2)
    .map(([key, strings]) => ({
      finger: Number(key.split("-")[0]),
      fret: Number(key.split("-")[1]),
      strings,
    }));
}
