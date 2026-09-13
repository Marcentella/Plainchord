/** Compares two token lists assuming a single contiguous span changed —
 * chords inserted, removed, or both (a "replace") in one spot. Used to
 * find WHERE a progression edit happened, so an entrance/exit animation
 * attaches to the chord actually touched instead of always the last one.
 *
 * Equal-length lists return an empty diff without comparing content — an
 * in-place edit (e.g. mid-typing a chord's name) must never look like a
 * remove+insert, or it would animate on every keystroke. */
export function diffTokens(
  prev: string[],
  next: string[],
): { at: number; removedCount: number; insertedCount: number } {
  if (prev.length === next.length) {
    return { at: 0, removedCount: 0, insertedCount: 0 };
  }

  const minLen = Math.min(prev.length, next.length);
  let start = 0;
  while (start < minLen && prev[start] === next[start]) start++;

  const maxEnd = minLen - start;
  let end = 0;
  while (
    end < maxEnd &&
    prev[prev.length - 1 - end] === next[next.length - 1 - end]
  ) {
    end++;
  }

  return {
    at: start,
    removedCount: prev.length - start - end,
    insertedCount: next.length - start - end,
  };
}
