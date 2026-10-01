"use client";

import { useEffect, useRef, useState } from "react";
import { allChords, type Chord } from "./chords";
import {
  DETECTION,
  extractFrame,
  initialPlayAlong,
  matchesTarget,
  rankChords,
  stepPlayAlong,
  type PlayAlongState,
} from "./chordDetection";
import { micErrorFor, openMic, type MicError, type MicInput } from "./micInput";

export type PlayAlongStatus = "idle" | "requesting" | "listening" | MicError;

/** Chroma doesn't change faster than a guitarist changes chords; ~10 analyses a second is plenty and keeps a 16384-sample FFT off every frame. */
const ANALYSIS_INTERVAL_MS = 100;
/** How long a just-heard chord keeps its green check at full brightness before dimming with the rest. */
const JUST_MATCHED_MS = 600;

/**
 * "Tocar junto": listens to the mic and walks through `targets` (the home
 * grid's chords, in order; undefined = a chord not in the library) as each
 * one is heard. Nothing is recorded or kept — stopping, or changing the
 * progression, starts over from the first chord.
 */
export function useChordPlayAlong(targets: (Chord | undefined)[]) {
  const [status, setStatus] = useState<PlayAlongStatus>("idle");
  const [progress, setProgress] = useState<PlayAlongState>(() => initialPlayAlong(targets));
  const [justMatched, setJustMatched] = useState<number | null>(null);
  const [hearing, setHearing] = useState<string | null>(null);

  const targetsRef = useRef(targets);
  const progressRef = useRef(progress);
  const micRef = useRef<MicInput | null>(null);
  const rafRef = useRef<number | null>(null);
  const justMatchedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Same stale-request guard as TunerModal: a mic permission prompt or the
  // Meyda import that resolves after stop() was pressed must not start a
  // loop (or leave the mic on) behind the user's back.
  const requestTokenRef = useRef(0);

  function reset() {
    const initial = initialPlayAlong(targetsRef.current);
    progressRef.current = initial;
    setProgress(initial);
    setJustMatched(null);
    if (justMatchedTimerRef.current) clearTimeout(justMatchedTimerRef.current);
  }

  // A different progression is a different exercise: start it from the top.
  // Keyed by the chord names, not the array — the caller builds a new array
  // every render.
  const targetsKey = targets.map((c) => c?.name ?? "").join("|");
  useEffect(() => {
    targetsRef.current = targets;
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- targetsKey captures every change to `targets` that matters
  }, [targetsKey]);

  function stop() {
    requestTokenRef.current++;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    setStatus("idle");
    setHearing(null);
    reset();
  }

  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps -- release the mic on unmount

  async function start() {
    if (progressRef.current.index < 0) return;
    const token = ++requestTokenRef.current;
    setStatus("requesting");
    try {
      const mic = await openMic(DETECTION.fftSize);
      if (token !== requestTokenRef.current) {
        mic.stop();
        return;
      }
      micRef.current = mic;
      // Dynamic import, same as the tuner's pitchy: Meyda stays out of the
      // home page's bundle until someone actually presses "Tocar junto".
      const { default: Meyda } = await import("meyda");
      if (token !== requestTokenRef.current) return; // stop() already released the mic

      const { analyser, audioCtx } = mic;
      const buffer = new Float32Array(analyser.fftSize);
      let lastAnalysis = 0;
      setStatus("listening");

      const loop = (now: number) => {
        rafRef.current = requestAnimationFrame(loop);
        if (now - lastAnalysis < ANALYSIS_INTERVAL_MS) return;
        lastAnalysis = now;

        analyser.getFloatTimeDomainData(buffer);
        const frame = extractFrame(Meyda, buffer, audioCtx.sampleRate);
        const loud = frame.rms >= DETECTION.minRms;
        const ranked = loud ? rankChords(frame.chroma, allChords) : [];
        setHearing(loud ? ranked[0].chord.name : null);

        const current = progressRef.current;
        const target = targetsRef.current[current.index];
        const { state, matchedIndex } = stepPlayAlong(current, targetsRef.current, {
          matches: loud && !!target && matchesTarget(ranked, target),
          rms: frame.rms,
          now,
        });
        progressRef.current = state;
        // Re-render only when something visible changed, not ~10x a second.
        if (state.index !== current.index) setProgress(state);
        if (matchedIndex !== null) {
          setJustMatched(matchedIndex);
          if (justMatchedTimerRef.current) clearTimeout(justMatchedTimerRef.current);
          justMatchedTimerRef.current = setTimeout(() => setJustMatched(null), JUST_MATCHED_MS);
        }
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      if (token !== requestTokenRef.current) return;
      micRef.current?.stop();
      micRef.current = null;
      setStatus(micErrorFor(err));
    }
  }

  return {
    status,
    /** Index of the chord to play now, or -1 when the progression has no known chord. */
    index: progress.index,
    played: progress.played,
    justMatched,
    /** Best-matching library chord for what the mic hears right now, or null when it's quiet. */
    hearing,
    start,
    stop,
  };
}
