"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Tab } from "./tab";
import { groupIntoBars } from "./groupIntoBars";
import { buildTimeline, locateAtElapsedWithFraction, startSecondsFor, type BeatLocation } from "./playhead";
import { useAudioPlayback } from "./useAudioPlayback";

export type PlayheadTarget = {
  // animate: true only for an explicit seek() — a genuine, non-continuous
  // relocation. Every natural tick-driven advance omits it (defaults to
  // false/instant) — see setPlayheadProgress's own comment for why easing
  // the jump on top of the creep would double-animate the same handoff.
  setPlayheadPosition: (location: BeatLocation | null, animate?: boolean) => void;
  // Fired every frame during playback with how far through the CURRENT beat
  // elapsed time is (0→1) — drives the pill's within-beat creep. Never
  // dedup-gated like setPlayheadPosition; the beat itself might not have
  // changed, but the fraction always has.
  setPlayheadProgress: (progress: BeatLocation & { fraction: number }) => void;
};

/**
 * Drives a visual playhead purely via `targetRef` — the current beat never
 * becomes React state. TabRenderer's whole notation tree re-renders on
 * every state change with no memoization, so routing a value that changes
 * several times a second through setState/props would force that full tree
 * to re-render at that frequency for as long as playback runs. Calling
 * targetRef.current.setPlayheadPosition directly from inside the RAF tick
 * bypasses React's render cycle entirely for beat-to-beat movement.
 *
 * Kept in its own file (not inlined where it's used) because it has two
 * consumers — the transport controls and TabRenderer's imperative handle —
 * and because it's the one place that knows where time comes from. Each
 * play() picks the clock: the synth's (lib/useAudioPlayback.ts), so the pill
 * follows what's actually heard, or — when audio can't start (soundfont
 * fetch failed, AudioContext blocked) — plain performance.now()-diffing, the
 * silent visual tempo guide this hook always was. Callers can't tell which.
 */
export function usePlayhead(tab: Tab | null, bpm: number | null, targetRef: RefObject<PlayheadTarget | null>) {
  const [isPlaying, setIsPlaying] = useState(false);
  const startedAtRef = useRef<number | null>(null); // performance.now() that maps to elapsed=0
  const pausedElapsedRef = useRef(0); // elapsed seconds banked at last pause/stop
  const lastLocationRef = useRef<BeatLocation | null>(null); // dedupe key — avoids redundant DOM writes
  const usingAudioRef = useRef(false); // which clock the current/last play() chose
  // Bumped by anything that should cancel a play() still waiting on audio
  // setup (stop, pause, a new tab) — the first Play downloads the soundfont,
  // and a user who gave up in the meantime mustn't get sound seconds later.
  const playRequestRef = useRef(0);
  const [isLoading, setIsLoading] = useState(false);
  const audio = useAudioPlayback(() => stop());

  // A pure derivation of tab/bpm, not an imperative concern — useMemo, not
  // the ref+deps-less-effect pattern used elsewhere in this file for things
  // that actually need to survive outside React's render cycle.
  const timeline = useMemo(() => {
    return tab && bpm ? buildTimeline(groupIntoBars(tab.beats), bpm) : [];
  }, [tab, bpm]);

  // "Adjusting state when a prop changes," React's own documented pattern
  // for this exact case, not a useEffect+setState: a new tab (reimport /
  // history pick) always means "not playing anymore," computed during
  // render rather than reset via an effect that would itself call setState.
  // Refs can't be written here too (a stricter lint rule than the "adjust
  // state during render" pattern itself allows — it flags any ref write
  // during render, full stop) — those reset in the effect below instead.
  const [prevTab, setPrevTab] = useState(tab);
  if (tab !== prevTab) {
    setPrevTab(tab);
    setIsPlaying(false);
    setIsLoading(false);
  }

  // Ref resets + clearing the DOM playhead (an imperative call into
  // TabRenderer's exposed handle) — none of this calls setState, so an
  // effect is the correctly-scoped place for it, unlike the state reset
  // above. Runs before any repaint the user could act on, so play()'s
  // isPlaying-false guard never races a stale ref value here.
  useEffect(() => {
    pausedElapsedRef.current = 0;
    lastLocationRef.current = null;
    playRequestRef.current++;
    if (usingAudioRef.current) audio.stop();
    targetRef.current?.setPlayheadPosition(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // BPM only changes while stopped/paused (the field is disabled during
  // playback). One tempo means every time in the song scales by the same
  // ratio, so rescaling the banked position keeps the playhead on the same
  // beat instead of wherever the old seconds land at the new speed.
  const bpmRef = useRef(bpm);
  useEffect(() => {
    if (bpmRef.current && bpm) pausedElapsedRef.current *= bpmRef.current / bpm;
    bpmRef.current = bpm;
  }, [bpm]);

  function elapsedSeconds(): number {
    return usingAudioRef.current ? audio.getElapsedSeconds() : (performance.now() - startedAtRef.current!) / 1000;
  }

  // Must be called straight from the click/keypress: the first call builds
  // the AudioContext, which browsers only allow inside a user gesture. That
  // happens synchronously, before ensureReady's first await.
  async function play() {
    if (isPlaying || isLoading || !bpm || !tab) return;
    const request = ++playRequestRef.current;
    setIsLoading(true);
    const withAudio = await audio.ensureReady(tab, bpm);
    if (request !== playRequestRef.current) return; // cancelled while loading
    setIsLoading(false);
    usingAudioRef.current = withAudio;
    const from = pausedElapsedRef.current;
    if (withAudio) {
      // Always seek: a reload (new bpm) restarts the synth at 0, and a
      // stopped synth is at 0 while the playhead may have been clicked elsewhere.
      audio.seek(from);
      audio.play();
    } else {
      startedAtRef.current = performance.now() - from * 1000;
    }
    setIsPlaying(true);
  }

  function pause() {
    playRequestRef.current++;
    setIsLoading(false);
    if (!isPlaying) return;
    pausedElapsedRef.current = elapsedSeconds();
    if (usingAudioRef.current) audio.pause();
    setIsPlaying(false);
  }

  function stop() {
    playRequestRef.current++;
    setIsLoading(false);
    if (usingAudioRef.current) audio.stop();
    setIsPlaying(false);
    pausedElapsedRef.current = 0;
    lastLocationRef.current = null;
    targetRef.current?.setPlayheadPosition(null);
  }

  // Never touches isPlaying — a seek only ever relocates the current
  // position, whether or not playback is running. If playing, rebase
  // startedAtRef so the RAF loop's very next tick reads the correct elapsed
  // time from the new anchor; if not, just bank it in pausedElapsedRef for
  // whenever play() is next called. lastLocationRef is set directly (not
  // left for the RAF loop to discover) so tick()'s own dedup check doesn't
  // redundantly re-paint the same spot on its next frame.
  function seek(location: BeatLocation) {
    const startSeconds = startSecondsFor(timeline, location);
    if (startSeconds === null) return;
    pausedElapsedRef.current = startSeconds;
    if (isPlaying) {
      if (usingAudioRef.current) audio.seek(startSeconds);
      else startedAtRef.current = performance.now() - startSeconds * 1000;
    }
    lastLocationRef.current = location;
    targetRef.current?.setPlayheadPosition(location, true);
  }

  // `timeline` is a plain value closed over inside tick() below, not a ref
  // — unlike a ref (always current regardless of closure age), it has to be
  // a real dependency here or this effect could keep running against a
  // stale timeline after a tab change. (In practice a tab change also
  // resets isPlaying above, which independently forces this effect to
  // re-run — but that's a coincidental coupling between two different
  // pieces of logic, not a guarantee either one owes the other, so it's
  // listed explicitly rather than relied on silently.)
  useEffect(() => {
    if (!isPlaying || !bpm) return;
    let raf: number;
    const tick = () => {
      const elapsed = elapsedSeconds();
      const located = locateAtElapsedWithFraction(timeline, elapsed);
      if (located === null) {
        stop();
        return;
      }
      if (located.barIdx !== lastLocationRef.current?.barIdx || located.colIdx !== lastLocationRef.current?.colIdx) {
        lastLocationRef.current = { barIdx: located.barIdx, colIdx: located.colIdx };
        targetRef.current?.setPlayheadPosition(lastLocationRef.current);
      }
      targetRef.current?.setPlayheadProgress(located);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, bpm, timeline]);

  return {
    isPlaying,
    isLoading,
    play,
    pause,
    stop,
    seek,
    audioStatus: audio.status,
    audioProgress: audio.progress,
    muted: audio.muted,
    setMuted: audio.setMuted,
  };
}
