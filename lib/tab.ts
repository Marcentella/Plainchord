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
  /** "7b9" -> fret 7, bendTo 9. Only set when the bend lands on a whole fret
   *  — a Guitar Pro import can carry a quarter-tone bend (see bendAmount)
   *  that has no fret to land on at all. */
  bendTo?: number;
  /** The bend's size in quarter-tones (1 = quarter step, 4 = a full step,
   *  matching Guitar Pro's own convention) — what TabRenderer draws the
   *  bend arrow's "Full"/"½"/etc. label from. Set whenever a note has the
   *  "b" technique and TabRenderer draws an arrow for it (rising or
   *  releasing — see bendReleasing). Independent of bendTo: a quarter-tone
   *  bend (odd value) sets this but not bendTo, since there's no whole fret
   *  for it. */
  bendAmount?: number;
  /** True when this bend arrives already at its peak and releases DOWN
   *  during the note (Guitar Pro's Release/PrebendRelease), as opposed to
   *  the far more common case of rising up to bendAmount — TabRenderer
   *  draws these as a downward arrow instead of the usual upward one, with
   *  no text label (the amount was already shown on whichever earlier note
   *  it's releasing from). Plain text has no equivalent notation for this,
   *  so it's Guitar-Pro-only, same as bendReleasing's sibling bendHold. */
  bendReleasing?: boolean;
  /** True when this note doesn't strike a new pitch at all — it just holds
   *  whatever bend the previous note left off at (Guitar Pro's Hold type).
   *  TabRenderer parenthesizes the fret digit for these (matching how real
   *  tab notation marks a held, not re-picked, note) instead of drawing any
   *  arrow — there's nothing to point at since nothing changes. Guitar-Pro-
   *  only, like bendReleasing. */
  bendHold?: boolean;
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
  /** e.g. {numerator:4, denominator:4} for 4/4. Guitar Pro imports only, same limitation as title/artist/tempo/tuning above. */
  timeSignature?: { numerator: number; denominator: number };
};
