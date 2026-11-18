"use client";

import { useEffect, useRef, useState } from "react";
import { allChords, type Chord } from "./chords";
import { DETECTION, extractFrame, matchesTarget, rankChords, type Ranked } from "./chordDetection";
import { listInputs, micErrorFor, openDemoInput, openMic, type DemoInput, type MicError, type MicInput } from "./micInput";
import { initialStrum, rmsOf, stepStrum } from "./strumDetect";
import { checkStrings, type StringResult } from "./stringCheck";

export type StrumCheckStatus = "idle" | "requesting" | "listening" | MicError;

/** One judged strum. `snapshot` is whatever `onOnset` returned when it started (the camera's reading). */
export type Strum<T> = {
  /** Counts up from 1, so a repeat of the same result still reads as a new strum. */
  id: number;
  /** The chord being checked when it was judged; undefined if none was picked. */
  target: Chord | undefined;
  /** Best three library chords for what sounded. */
  top: Ranked[];
  /** The target counts as heard (lib/chordDetection.ts's matchesTarget). */
  matches: boolean;
  /** The best match, if it scored well enough to name; null = not recognized. */
  heard: Chord | null;
  /** Which strings rang (lib/stringCheck.ts), low E first; null without a target. */
  strings: StringResult[] | null;
  /** The judged audio (one analysis window). */
  samples: Float32Array;
  sampleRate: number;
  /**
   * ?debug only: a longer recording around the strum, ready once it has rung
   * out (DEBUG_AFTER_S later). `judgedAt` is where `samples` starts in it,
   * in samples, so the judged window can be found again offline.
   */
  clip: Promise<{ samples: Float32Array; judgedAt: number }> | null;
  snapshot: T;
};

/** rms needs no FFT, so every frame can afford it; the chroma only runs once per strum. */
const ANALYSIS_INTERVAL_MS = 50;
/** No sound at all for this long after starting: suggest checking the input. */
const SILENCE_HINT_MS = 8000;
/** ?debug clips: this much before the judged window and after its end, in seconds; and how much raw audio is kept to cut them from. */
const DEBUG_BEFORE_S = 0.5;
const DEBUG_AFTER_S = 2.5;
const DEBUG_KEEP_S = 6;

type Chunk = { frame: number; samples: Float32Array };

/** The recorded audio between two AudioContext frames (silence where nothing was kept). */
function cut(chunks: Chunk[], from: number, to: number): Float32Array {
  const out = new Float32Array(Math.max(0, to - from));
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.samples.length; i++) {
      const at = chunk.frame + i - from;
      if (at >= 0 && at < out.length) out[at] = chunk.samples[i];
    }
  }
  return out;
}

/**
 * The mic half of the camera check: listens, finds each strum
 * (lib/strumDetect.ts), keeps `onOnset()`'s return value from the moment it
 * starts, and once it rings judges it against `target()`. Same mic handling
 * as lib/useChordPlayAlong.ts (raw signal, stale-request guard, silence
 * hint); that hook walks a progression, this one judges single strums.
 * Nothing is recorded or sent anywhere: only the last strum is kept, in memory.
 */
export function useStrumCheck<T>({
  target,
  onOnset,
  demo = false,
  debug = false,
}: {
  target: () => Chord | undefined;
  onOnset: () => T;
  /** Synthesized strums instead of the mic (/acordes?demo), played with the returned `strum`. */
  demo?: boolean;
  /** Also record around each strum (lastStrum.clip), for tuning on real takes. Mic only, not demo. */
  debug?: boolean;
}) {
  const [status, setStatus] = useState<StrumCheckStatus>("idle");
  const [lastStrum, setLastStrum] = useState<Strum<T> | null>(null);
  const [micSilent, setMicSilent] = useState(false);
  const [inputs, setInputs] = useState<{ id: string; label: string }[]>([]);
  const [inputId, setInputId] = useState<string | undefined>(undefined);

  const optionsRef = useRef({ target, onOnset });
  useEffect(() => {
    optionsRef.current = { target, onOnset };
  });
  const micRef = useRef<MicInput | DemoInput | null>(null);
  const rafRef = useRef<number | null>(null);
  const requestTokenRef = useRef(0);
  const strumIdRef = useRef(0);
  // Resolved by the loop's first analysis of each start: that frame is the
  // quiet floor a strum has to jump from (lib/strumDetect.ts).
  const firstFrameRef = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);

  function release() {
    requestTokenRef.current++;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
  }

  function stop() {
    release();
    setStatus("idle");
    setMicSilent(false);
    setLastStrum(null);
  }

  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps -- release the mic on unmount

  async function start(deviceId = inputId) {
    release(); // switching inputs: the old one goes first
    const token = requestTokenRef.current;
    setStatus("requesting");
    try {
      const mic = demo ? openDemoInput(DETECTION.fftSize) : await openMic(DETECTION.fftSize, deviceId);
      if (token !== requestTokenRef.current) {
        mic.stop();
        return;
      }
      micRef.current = mic;
      // Names only show once permission is granted, which it just was.
      if (!demo) void listInputs().then((list) => token === requestTokenRef.current && setInputs(list));
      const { default: Meyda } = await import("meyda");
      if (token !== requestTokenRef.current) return; // stop() already released the mic

      const { analyser, audioCtx } = mic;
      const buffer = new Float32Array(analyser.fftSize);
      // ?debug: the raw input, kept a few seconds back, on the same clock as
      // the analyser (same recorder as components/RecordTabModal.tsx).
      let chunks: Chunk[] | null = null;
      if (debug && "source" in mic) {
        await audioCtx.audioWorklet.addModule("/recorder-worklet.js");
        if (token !== requestTokenRef.current) return;
        const recorder = new AudioWorkletNode(audioCtx, "recorder", { channelCount: 1, channelCountMode: "explicit" });
        const sink = audioCtx.createGain();
        sink.gain.value = 0; // a worklet only runs while pulled; muted, so the mic isn't monitored
        mic.source.connect(recorder).connect(sink).connect(audioCtx.destination);
        const kept: Chunk[] = [];
        chunks = kept;
        recorder.port.onmessage = (e: MessageEvent<Chunk>) => {
          kept.push(e.data);
          while (kept.length && kept[0].frame < e.data.frame - DEBUG_KEEP_S * audioCtx.sampleRate) kept.shift();
        };
      }
      let strumState = initialStrum();
      let snapshot: T | undefined;
      let settling = false;
      let heardAnything = false;
      let lastAnalysis = 0;
      const startedAt = performance.now();
      let resolveFirst = () => {};
      firstFrameRef.current = { promise: new Promise((r) => (resolveFirst = r)), resolve: () => resolveFirst() };
      setStatus("listening");

      const loop = (now: number) => {
        rafRef.current = requestAnimationFrame(loop);
        if (now - lastAnalysis < ANALYSIS_INTERVAL_MS) return;
        lastAnalysis = now;

        analyser.getFloatTimeDomainData(buffer);
        const rms = rmsOf(buffer);
        if (!heardAnything && rms >= DETECTION.minRms) {
          heardAnything = true;
          setMicSilent(false);
        } else if (!heardAnything && now - startedAt > SILENCE_HINT_MS) {
          setMicSilent(true);
        }

        const step = stepStrum(strumState, { rms, now });
        strumState = step.state;
        firstFrameRef.current?.resolve();
        if (step.event === "onset") {
          snapshot = optionsRef.current.onOnset();
          settling = true;
        }
        if (step.event !== "ready" || !settling) return;
        settling = false;

        // The analyser's window ends at the context's current frame (to a
        // render quantum, 128 samples), which is what lines it up with the
        // recorder's chunks.
        const sr = audioCtx.sampleRate;
        const judgedFrom = Math.round(audioCtx.currentTime * sr) - buffer.length;
        const kept = chunks;
        const clip = kept
          ? new Promise<{ samples: Float32Array; judgedAt: number }>((resolve) =>
              setTimeout(() => {
                const from = judgedFrom - Math.round(DEBUG_BEFORE_S * sr);
                const to = judgedFrom + buffer.length + Math.round(DEBUG_AFTER_S * sr);
                resolve({ samples: cut(kept, from, to), judgedAt: judgedFrom - from });
              }, DEBUG_AFTER_S * 1000 + 100),
            )
          : null;
        const frame = extractFrame(Meyda, buffer, audioCtx.sampleRate);
        const ranked = rankChords(frame.chroma, allChords);
        const chord = optionsRef.current.target();
        setLastStrum({
          id: ++strumIdRef.current,
          target: chord,
          top: ranked.slice(0, 3),
          matches: !!chord && matchesTarget(ranked, chord),
          heard: ranked[0] && ranked[0].score >= DETECTION.accept ? ranked[0].chord : null,
          strings: chord ? checkStrings(chord, buffer, audioCtx.sampleRate) : null,
          samples: buffer.slice(),
          sampleRate: audioCtx.sampleRate,
          clip,
          snapshot: snapshot as T,
        });
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
    lastStrum,
    /** True when nothing at all has been heard SILENCE_HINT_MS into listening. */
    micSilent,
    start: () => start(),
    stop,
    /** Audio inputs to choose from (filled once listening has been allowed). */
    inputs,
    inputId,
    /** Switch input; restarts listening on it if it was on. */
    chooseInput: (id: string) => {
      setInputId(id);
      if (micRef.current) void start(id);
    },
    /** Demo only: strum `chord` into the detector and the speakers, starting to listen first if needed. */
    strum: async (chord: Chord) => {
      if (!demo) return;
      if (!micRef.current) {
        await start();
        // Strum only once the detector has heard a silent frame: a strum
        // already sounding in its first frame has no quieter floor to jump
        // from. Waiting a fixed time wasn't enough when Chrome throttles the
        // page's frames (a covered window runs at ~2 frames a second).
        await firstFrameRef.current?.promise;
      }
      const mic = micRef.current;
      if (mic && "strum" in mic) mic.strum(chord);
    },
  };
}
