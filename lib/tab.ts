/**
 * The one internal shape every tab source converges on (plain text today,
 * Guitar Pro via alphaTab later) — see FEATURES.md's data-flow diagram. The
 * renderer only ever reads this, never a source-specific structure.
 */

/**
 * A technique tag IS the glossary's own `symbol` (data/glossary.json), not a
 * parallel enum: the hover popup looks the entry up by symbol, so there's no
 * second copy of the technique list to keep in sync. lib/parseTab.test.ts
 * asserts every symbol here still exists in the glossary.
 */
export type TechniqueSymbol =
  | "b"
  | "h"
  | "p"
  | "/"
  | "PM"
  | "PH"
  | "~"
  | "T"
  | "x";

export const TECHNIQUE_SYMBOLS: TechniqueSymbol[] = [
  "b",
  "h",
  "p",
  "/",
  "PM",
  "PH",
  "~",
  "T",
  "x",
];

/** h/p// describe how a note is *reached*, so they're drawn between it and
 *  the previous note on the same string (see TabRenderer's connector glyph). */
export const CONNECTING_TECHNIQUES: TechniqueSymbol[] = ["h", "p", "/"];

export type TabNote = {
  /** 0-5, low E -> high e — same convention as Chord and the glossary visuals. */
  string: number;
  /** null only for an unfretted dead note ("x" with no number). */
  fret: number | null;
  /** [] = plain note. Several can stack: "7b9~" is a bend plus vibrato. */
  techniques: TechniqueSymbol[];
  /** "7b9" -> fret 7, bendTo 9. The renderer needs it to redraw what was written. */
  bendTo?: number;
};

/** A cluster: one note per string, played together (a chord or double stop). */
export type TabBeat = {
  /** 0-based order in the sequence. The only timing unit for now — plain text
   *  carries no rhythm. A future alphaTab import adds an optional `duration`
   *  here, which is additive and changes nothing else. */
  position: number;
  /** 0-based bar index, from the source's bar lines. */
  bar: number;
  notes: TabNote[];
};

export type Tab = {
  beats: TabBeat[];
  /** Guitar Pro imports only — a plain-text paste has no metadata to read these from. */
  title?: string;
  artist?: string;
  /** Initial tempo in BPM. */
  tempo?: number;
  /** Low string to high, e.g. ["E", "A", "D", "G", "B", "E"] — display names, not MIDI values. */
  tuning?: string[];
};
