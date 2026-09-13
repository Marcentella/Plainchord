import glossaryData from "@/data/glossary.json";

/**
 * "posicion" family: two frets on one string, animated (hammer-on, pull-off,
 * slide, tapping). string: 0-5, low E -> high e, same convention as Chord.
 * fromFret is the origin fret; omitted for tapping, which has none.
 */
export type PositionVisual = {
  kind: "hammer-on" | "pull-off" | "slide" | "tapping";
  string: number;
  fromFret?: number;
  toFret: number;
};

/**
 * "distorsion" family: the string itself deforms at a fixed fret, instead of
 * moving between frets (bend, vibrato).
 */
export type DistortionVisual = {
  kind: "bend" | "vibrato";
  string: number;
  fret: number;
};

/** One fretboard position, echoed in a plain-text tab example (dead note). */
export type MarkerVisual = {
  string: number;
  fret: number;
};

type GlossaryBase = {
  name: string;
  /** How it's written in a plain-text tab, e.g. "b", "h", "PM". */
  symbol: string;
  /** What it is, in plain language. */
  definicion: string;
  /** How to physically play it, guitar in hand. */
  ejecucion: string;
};

// Discriminated on visualType so `visual`'s shape is known without a cast.
export type GlossaryEntry =
  | (GlossaryBase & { visualType?: undefined; visual?: undefined })
  | (GlossaryBase & { visualType: "posicion"; visual: PositionVisual })
  | (GlossaryBase & { visualType: "distorsion"; visual: DistortionVisual })
  | (GlossaryBase & { visualType: "marcador"; visual: MarkerVisual });

export const allGlossaryEntries = glossaryData as GlossaryEntry[];

export function searchGlossary(query: string): GlossaryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return allGlossaryEntries;
  return allGlossaryEntries.filter(
    (e) =>
      e.name.toLowerCase().includes(q) || e.symbol.toLowerCase().includes(q),
  );
}
