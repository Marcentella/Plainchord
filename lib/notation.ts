/**
 * American (C D E) vs Latin (Do Re Mi) note names. Pure — no React, no
 * storage — so it's unit tested (lib/notation.test.ts).
 *
 * Everything inside PlainChord stays American: data/chords.json,
 * findChord, transition difficulty, chord detection, the tab model and
 * whatever is saved in localStorage. Notation only changes what's shown
 * and what's typed. It's strict on purpose: Latin mode doesn't read "G"
 * and American mode doesn't read "Do", because mixing both breaks
 * autocomplete ("d" would match D and Do, and Do is C).
 */

export type Notation = "american" | "latin";

const TO_LATIN: Record<string, string> = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };
const FROM_LATIN: Record<string, string> = { do: "C", re: "D", mi: "E", fa: "F", sol: "G", la: "A", si: "B" };

// Root letter, optional accidental, the rest (quality suffix or octave).
const AMERICAN_ROOT = /^([A-Ga-g])([#b]?)(.*)$/;
// No suffix in the library starts with "b", so "Sib" (Bb) is unambiguous.
const LATIN_ROOT = /^(do|re|mi|fa|sol|la|si)([#b]?)(.*)$/i;

/** "F#m" -> "Fa#m", "Bb" -> "Sib", "Cadd9" -> "Doadd9". American names pass through. */
export function formatChord(name: string, notation: Notation): string {
  if (notation === "american") return name;
  const m = AMERICAN_ROOT.exec(name);
  return m ? TO_LATIN[m[1].toUpperCase()] + m[2] + m[3] : name;
}

/** Same mapping for a single note, with or without octave: "C#4" -> "Do#4". */
export const formatNote = formatChord;

/**
 * A typed token in `notation` -> the canonical American name findChord
 * understands, or null when it isn't written in that notation at all.
 * American tokens pass through untouched (findChord already ignores case).
 */
export function parseChordName(token: string, notation: Notation): string | null {
  if (notation === "american") return token;
  const m = LATIN_ROOT.exec(token);
  // The flat sign is lowercased: with case-insensitive matching, "SIB" is Si + flat.
  return m ? FROM_LATIN[m[1].toLowerCase()] + m[2].toLowerCase() + m[3] : null;
}

// Prefixed to a token that isn't written in the active notation at all
// ("G" while in Latin mode). No chord name contains it, so findChord can
// never match the token — that's what keeps parsing strict — while the
// token still has a stable string identity for the chord grid's diffing.
const NOT_IN_NOTATION = "\u0000";

/**
 * Typed token -> the token the app works with: the canonical American name
 * when it's written in `notation` (so "Sol" and "G" are the same token and
 * a notation switch doesn't look like an edit), otherwise the raw token
 * marked as not-in-notation.
 */
export function canonicalToken(token: string, notation: Notation): string {
  return parseChordName(token, notation) ?? NOT_IN_NOTATION + token;
}

/** Inverse of canonicalToken for display: "Gx" -> "Solx" in Latin; a marked token shows exactly as typed. */
export function displayToken(token: string, notation: Notation): string {
  return token.startsWith(NOT_IN_NOTATION) ? token.slice(1) : formatChord(token, notation);
}

/** Typed root to its written form once a chord is closed: "am" -> "Am", "sol" -> "Sol". */
export function capitalizeRoot(token: string, notation: Notation): string {
  const root = notation === "american" ? /^[a-g]/ : LATIN_ROOT;
  return root.test(token) ? token[0].toUpperCase() + token.slice(1) : token;
}

// Same separator set as lib/parseProgression.ts, captured so it's kept.
const SEPARATORS = /([\s,\-–—]+)/;

/**
 * Re-writes a progression in another notation, keeping its separators and
 * spacing exactly ("G - D, Em" -> "Sol - Re, Mim"). Only tokens that are
 * real chords (`isChord`, given the canonical name) are converted;
 * anything else stays as typed, so a stray "Do" in American mode doesn't
 * turn into nonsense like "Reo".
 */
export function convertProgression(
  text: string,
  from: Notation,
  to: Notation,
  isChord: (canonical: string) => boolean = () => true,
): string {
  if (from === to) return text;
  return text
    .split(SEPARATORS)
    .map((part, i) => {
      if (i % 2 === 1 || part === "") return part; // separators sit at odd indices
      const canonical = parseChordName(part, from);
      if (!canonical || !AMERICAN_ROOT.test(canonical) || !isChord(canonical)) return part;
      const normalized = canonical[0].toUpperCase() + canonical.slice(1);
      return formatChord(normalized, to);
    })
    .join("");
}

/**
 * Starting notation when the person hasn't picked one: Latin for a
 * browser set to Spanish-from-Spain, where Do Re Mi is what classrooms
 * teach; American everywhere else, including the rest of the
 * Spanish-speaking world, where chord sheets mostly use C D E.
 */
export function defaultNotation(languages: readonly string[]): Notation {
  return languages[0]?.toLowerCase() === "es-es" ? "latin" : "american";
}
