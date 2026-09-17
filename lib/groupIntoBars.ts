import type { TabBeat } from "./tab.ts";

// Bar-less plain text (every beat is `bar: 0`) has no real measure to
// protect from splitting, so there's nothing for a wrap-aware grouping to
// preserve — just chunk into small fixed groups purely so flex-wrap (see
// components/TabRenderer.tsx) has units to wrap at all.
const FALLBACK_CHUNK_SIZE = 4;

/**
 * Splits a beat sequence into one array per bar (or, for bar-less input,
 * one array per small fixed chunk) — nothing more. This used to also pack
 * multiple bars into a shared "row" up to a beat-count budget, to keep
 * rendered rows a consistent width. That was working around not being able
 * to let bars wrap natively: components/TabRenderer.tsx now renders one
 * `<svg>` per bar and relies on plain CSS `flex-wrap` to decide how many
 * bars fit per line, live, on any container width — which already
 * guarantees "never split this atomic item across a line" for free, the
 * one real constraint here (a measure can't be split across two lines).
 * No JS measurement, no resize-driven re-render, no budget to pick.
 */
export function groupIntoBars(beats: TabBeat[]): TabBeat[][] {
  if (beats.length === 0) return [];
  const usesBarLines = beats.some((b) => b.bar > 0);

  if (!usesBarLines) {
    const groups: TabBeat[][] = [];
    for (let start = 0; start < beats.length; start += FALLBACK_CHUNK_SIZE) {
      groups.push(beats.slice(start, start + FALLBACK_CHUNK_SIZE));
    }
    return groups;
  }

  const bars: TabBeat[][] = [[beats[0]]];
  for (let i = 1; i < beats.length; i++) {
    if (beats[i].bar !== beats[i - 1].bar) bars.push([]);
    bars[bars.length - 1].push(beats[i]);
  }
  return bars;
}
