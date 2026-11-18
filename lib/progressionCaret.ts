/**
 * The chord box treats each chord as one unit and each " - " as one
 * character. The caret only ever rests at the END of a chord (or in an
 * empty slot between two separators), never before or inside one: a tap
 * anywhere on "Em" lands after the m, so typing adds to that chord and
 * Backspace edits it, with no second tap on a phone. The one other stop is
 * the very start, where typing puts a new chord before the first one. Arrows hop from chord
 * end to chord end. A space at a chord's end opens an empty slot after it
 * (C - | - D) to type a new chord into; leaving the box tidies away slots
 * left empty. Selecting (a double tap on a chord) is left alone, so a chord
 * can still be replaced whole.
 *
 * The text still holds real " - " separators, so copy, paste and parsing
 * are untouched. Pure, so lib/progressionCaret.test.ts covers it; the
 * wiring is in components/ChordProgressionInput.tsx.
 */

export const SEP = " - ";

/** The text between separators, each with where it starts and ends. Empty ones are slots. */
function segments(value: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let start = 0;
  for (let i = value.indexOf(SEP); i >= 0; i = value.indexOf(SEP, i + SEP.length)) {
    out.push({ start, end: i });
    start = i + SEP.length;
  }
  out.push({ start, end: value.length });
  return out;
}

/** Every place the caret may rest: the start, and each chord's end (an empty slot's only position). */
function stops(value: string): number[] {
  return [0, ...segments(value).map((s) => s.end)];
}

/** Where a caret dropped at `caret` should rest: the end of the chord it's on, or of the nearer chord when it's on a separator. */
export function snapCaret(value: string, caret: number): number {
  if (caret <= 0) return 0;
  const segs = segments(value);
  for (let k = 0; k < segs.length; k++) {
    if (caret <= segs[k].end) {
      if (caret >= segs[k].start) return segs[k].end; // on (or right before) this chord
      // On the separator before chord k: the nearer side wins.
      return caret - segs[k - 1].end <= segs[k].start - caret ? segs[k - 1].end : segs[k].end;
    }
  }
  return value.length;
}

/** One arrow press from `caret`: to the previous or next chord's end. */
export function stepCaret(value: string, caret: number, dir: -1 | 1): number {
  const s = stops(value);
  if (dir < 0) return [...s].reverse().find((p) => p < caret) ?? caret;
  return s.find((p) => p > caret) ?? caret;
}

/** Backspace (-1) or Delete (1) at `caret` when a separator is right there; null to let the browser do it. */
export function deleteSeparator(value: string, caret: number, dir: -1 | 1): { value: string; caret: number } | null {
  // The first chord's last letter, or Backspace in an empty first slot: its
  // separator goes too, so no stray " - " is left at the start.
  if (dir < 0 && caret <= 1 && value.slice(caret, caret + SEP.length) === SEP) {
    return { value: value.slice(caret + SEP.length), caret: 0 };
  }
  const start = dir < 0 ? caret - SEP.length : caret;
  if (start < 0 || value.slice(start, start + SEP.length) !== SEP) return null;
  return { value: value.slice(0, start) + value.slice(start + SEP.length), caret: start };
}

/**
 * A space (or dash) typed at `caret` away from the end of the text: opens an
 * empty slot after the chord there. Null when the caret already sits in an
 * empty slot (nothing to separate yet).
 */
export function openSlot(value: string, caret: number): { value: string; caret: number } | null {
  if (value.slice(caret - SEP.length, caret) === SEP && value.slice(caret, caret + SEP.length) === SEP) return null;
  return { value: value.slice(0, caret) + SEP + value.slice(caret), caret: caret + SEP.length };
}

/** Typing at the very start, before the first chord: a new chord (or, for a space or dash, an empty slot) goes in front. */
export function typeAtStart(value: string, data: string): { value: string; caret: number } | null {
  if (value === "" || value.startsWith(SEP)) return null; // nothing in front to separate from
  const slot = data === " " || data === "-";
  return { value: (slot ? "" : data) + SEP + value, caret: slot ? 0 : data.length };
}

/**
 * Every chord passed through `cap` except the one the caret is in (pass -1
 * for all of them): the chord being typed stays as typed, every other one
 * is tidied as soon as the caret leaves it. `cap` must keep the length (it
 * only changes case), so caret positions stay valid.
 */
export function capitalizeChords(value: string, caret: number, cap: (chord: string) => string): string {
  return segments(value)
    .map(({ start, end }) => (caret >= start && caret <= end ? value.slice(start, end) : cap(value.slice(start, end))))
    .join(SEP);
}

/** Empty slots left between chords or at the start, removed (a trailing " - " stays: that's someone mid-typing). */
export function dropEmptySlots(value: string): string {
  const parts = value.split(SEP);
  return parts.filter((p, i) => p !== "" || i === parts.length - 1).join(SEP);
}

/**
 * Pasted text ("E Em E7", "C, G, Am", "D-A") with its separators turned
 * into " - ", so every chord is its own unit again; leading ones dropped.
 */
export function tidySeparators(value: string): string {
  return value.replace(/^[\s,\-–—]+/, "").replace(/[\s,\-–—]+/g, SEP);
}
