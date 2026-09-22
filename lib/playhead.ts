import type { TabBeat } from "./tab";

export type BeatLocation = { barIdx: number; colIdx: number };

type TimelineEntry = { barIdx: number; colIdx: number; startSeconds: number; durationSeconds: number };

// A beat with no captured duration (plain-text imports; the rare Guitar Pro
// beat that somehow lacks one) is treated as a single quarter note — the
// same flat assumption this timeline used for every beat before real
// duration data existed, now just the fallback instead of the only case.
const DEFAULT_DURATION = 1;

/**
 * One entry per beat, in playback order, with its real cumulative start
 * time — built once per bars/bpm change (see lib/usePlayhead.ts's useMemo),
 * not recomputed every animation frame.
 */
export function buildTimeline(bars: TabBeat[][], bpm: number): TimelineEntry[] {
  const secondsPerQuarter = 60 / bpm;
  const timeline: TimelineEntry[] = [];
  let t = 0;
  for (let barIdx = 0; barIdx < bars.length; barIdx++) {
    const bar = bars[barIdx];
    for (let colIdx = 0; colIdx < bar.length; colIdx++) {
      const durationSeconds = (bar[colIdx].duration ?? DEFAULT_DURATION) * secondsPerQuarter;
      timeline.push({ barIdx, colIdx, startSeconds: t, durationSeconds });
      t += durationSeconds;
    }
  }
  return timeline;
}

/** Total real length of the tab, in seconds — O(1), just the last entry. */
export function totalDurationSeconds(timeline: TimelineEntry[]): number {
  if (timeline.length === 0) return 0;
  const last = timeline[timeline.length - 1];
  return last.startSeconds + last.durationSeconds;
}

/**
 * The beat sounding at `elapsedSeconds` — the last entry whose
 * startSeconds <= elapsedSeconds. null once elapsed reaches/exceeds the
 * tab's total duration (the caller's stop signal), or for an empty tab.
 *
 * Linear scan, deliberately: plain-text tabs cap at MAX_BEATS (300,
 * lib/parseTab.ts), and even a real full-song Guitar Pro import running
 * well past that is only a couple thousand beats — tens of thousands of
 * comparisons/sec at 60fps, trivially cheap, not worth a binary search at
 * this scale.
 */
export function locateAtElapsed(timeline: TimelineEntry[], elapsedSeconds: number): BeatLocation | null {
  if (timeline.length === 0 || elapsedSeconds < 0 || elapsedSeconds >= totalDurationSeconds(timeline)) return null;
  let result: BeatLocation = { barIdx: timeline[0].barIdx, colIdx: timeline[0].colIdx };
  for (const entry of timeline) {
    if (entry.startSeconds > elapsedSeconds) break;
    result = { barIdx: entry.barIdx, colIdx: entry.colIdx };
  }
  return result;
}

/**
 * The reverse of locateAtElapsed — a location's own cumulative start time,
 * for seeking there. null if it isn't in this timeline (e.g. a stale
 * location from before a tab/bpm change invalidated it).
 */
export function startSecondsFor(timeline: TimelineEntry[], location: BeatLocation): number | null {
  const entry = timeline.find((e) => e.barIdx === location.barIdx && e.colIdx === location.colIdx);
  return entry ? entry.startSeconds : null;
}

/**
 * Same lookup as locateAtElapsed, plus how far through that beat
 * elapsedSeconds is (0 at its start, approaching 1 at its end) — drives the
 * playhead's within-beat creep (see components/TabRenderer.tsx's
 * setPlayheadProgress). Guards durationSeconds<=0 (shouldn't happen, but a
 * degenerate zero-length beat must not divide into NaN).
 */
export function locateAtElapsedWithFraction(
  timeline: TimelineEntry[],
  elapsedSeconds: number,
): (BeatLocation & { fraction: number }) | null {
  if (timeline.length === 0 || elapsedSeconds < 0 || elapsedSeconds >= totalDurationSeconds(timeline)) return null;
  let result = timeline[0];
  for (const entry of timeline) {
    if (entry.startSeconds > elapsedSeconds) break;
    result = entry;
  }
  const fraction =
    result.durationSeconds > 0
      ? Math.min(1, Math.max(0, (elapsedSeconds - result.startSeconds) / result.durationSeconds))
      : 0;
  return { barIdx: result.barIdx, colIdx: result.colIdx, fraction };
}
