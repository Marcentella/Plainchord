"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Tab } from "./tab";
import type { OutMessage } from "./synth/synthWorker";
import { createToneChain, TONE_DEFAULT, type ToneSettings } from "./toneChain";

// Same size the /dev/synth prototype settled on. Pause and seek drop the
// worklet's buffer (see synth-worklet.js "flush"), so its size no longer
// delays either; it only sets how much main-thread-proof cushion there is.
const BUFFER_TIME_MS = 500;
const MUTED_KEY = "muted";
// Master level. alphaSynth sums every voice at full scale, so a strummed
// six-string chord peaks around 1.5 and hard-clips at the output; 0.5 keeps
// that under 0.75 with room for denser voicings.
const VOLUME = 0.5;

// The mute preference, persisted like theme/palette. An external store (not
// state synced in an effect) so the server render and hydration read "not
// muted" and the client then reads localStorage without a second render pass.
const mutedListeners = new Set<() => void>();
let mutedInMemory = false; // when storage is blocked, mute still works for this visit
function readMuted(): boolean {
  try {
    const stored = localStorage.getItem(MUTED_KEY);
    return stored === null ? mutedInMemory : stored === "1";
  } catch {
    return mutedInMemory;
  }
}
function subscribeMuted(listener: () => void) {
  mutedListeners.add(listener);
  return () => mutedListeners.delete(listener);
}

export type AudioStatus = "idle" | "loading" | "ready" | "error";

type Pipeline = {
  ctx: AudioContext;
  worker: Worker;
  gain: GainNode;
  worklet: AudioWorkletNode;
  tone: ReturnType<typeof createToneChain>;
};

/**
 * Real audio for a tab (plans/synth_blueprint.md, Step 2): AudioContext ->
 * worklet (public/synth-worklet.js) -> gain (mute) -> speakers, fed by the
 * alphaSynth worker (lib/synth/synthWorker.ts). Nothing is created or
 * downloaded until the first ensureReady(), which must run inside the Play
 * click: that click is the gesture that unlocks audio, and the ~9.6 MB
 * soundfont is only paid for by someone who actually presses Play.
 *
 * The synth reports its position ~10 times a second; getElapsedSeconds()
 * extrapolates between reports so a 60fps playhead can read it every frame.
 */
export function useAudioPlayback(onFinished: () => void) {
  const [status, setStatus] = useState<AudioStatus>("idle");
  const [progress, setProgress] = useState(0); // 0-1, soundfont download
  const muted = useSyncExternalStore(subscribeMuted, readMuted, () => false);

  const pipelineRef = useRef<Promise<Pipeline | null> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  // The shipped preset (lib/toneChain.ts); /dev/synth changes it live for A/B.
  const toneRef = useRef<{ settings: ToneSettings; chain: ReturnType<typeof createToneChain> | null }>({
    settings: TONE_DEFAULT,
    chain: null,
  });
  const loadedRef = useRef<{ tab: Tab; bpm: number } | null>(null);
  const resolveReadyRef = useRef<((ok: boolean) => void) | null>(null);
  const failedRef = useRef(false); // sticky: once audio fails, stay on the silent clock
  // Last reported position and when it arrived; `at` is null until the first
  // report after play(), so the clock doesn't run ahead of audio that hasn't
  // started yet (the worklet pre-buffers before it outputs anything).
  const anchorRef = useRef<{ ms: number; at: number | null }>({ ms: 0, at: null });
  const playingRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  useEffect(() => {
    return () => {
      void pipelineRef.current?.then((p) => {
        p?.worker.terminate();
        p?.worklet.disconnect();
        p?.tone.dispose();
        void p?.ctx.close();
      });
    };
  }, []);

  function post(message: object, transfer: Transferable[] = []) {
    // cmd: alphaTab's own worker listener crashes on messages without one
    // (see synthWorker.ts's header comment).
    workerRef.current?.postMessage({ ...message, cmd: "plainchord" }, transfer);
  }

  function fail() {
    failedRef.current = true;
    setStatus("error");
    resolveReadyRef.current?.(false);
  }

  function onMessage(message: OutMessage) {
    switch (message.type) {
      case "soundFontProgress":
        if (message.total) setProgress(message.loaded / message.total);
        break;
      case "ready":
        resolveReadyRef.current?.(true);
        break;
      case "error":
        fail();
        break;
      case "positionChanged":
        anchorRef.current = { ms: message.currentTime, at: playingRef.current ? performance.now() : null };
        break;
      case "finished":
        playingRef.current = false;
        onFinishedRef.current();
        break;
    }
  }

  function createPipeline(): Promise<Pipeline | null> {
    // Constructed synchronously, still inside the click's user activation.
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      fail();
      return Promise.resolve(null);
    }
    void ctx.resume();
    setStatus("loading");
    return (async () => {
      try {
        await ctx.audioWorklet.addModule("/synth-worklet.js");
        const worklet = new AudioWorkletNode(ctx, "plainchord-synth", {
          outputChannelCount: [2],
          processorOptions: { bufferTimeInMilliseconds: BUFFER_TIME_MS },
        });
        const gain = new GainNode(ctx, { gain: muted ? 0 : VOLUME });
        // After the master gain, so the chain's saturation sees peaks that
        // are already under 1 (the raw synth peaks around 1.5).
        const tone = createToneChain(ctx);
        tone.apply(toneRef.current.settings);
        toneRef.current.chain = tone;
        worklet.connect(gain).connect(tone.input);
        tone.output.connect(ctx.destination);
        gainRef.current = gain;

        const worker = new Worker(new URL("./synth/synthWorker.ts", import.meta.url), { type: "module" });
        workerRef.current = worker;
        worker.onmessage = (e: MessageEvent<OutMessage>) => onMessage(e.data);
        worker.onerror = () => onMessage({ type: "error", message: "worker" });

        // Audio samples go worker -> worklet over their own channel and never
        // touch this thread; only control messages and positions come here.
        const channel = new MessageChannel();
        worklet.port.postMessage({ type: "setPort", port: channel.port2 }, [channel.port2]);
        post({ type: "init", port: channel.port1, sampleRate: ctx.sampleRate, bufferTimeInMilliseconds: BUFFER_TIME_MS }, [
          channel.port1,
        ]);
        return { ctx, worker, gain, worklet, tone };
      } catch {
        fail();
        void ctx.close();
        return null;
      }
    })();
  }

  /**
   * Call from the Play click. Builds the pipeline the first time, (re)loads
   * the tab whenever it or the bpm changed, and resolves once the synth can
   * play it: true, or false if audio is unavailable (the caller falls back to
   * the silent timer clock).
   */
  async function ensureReady(tab: Tab, bpm: number): Promise<boolean> {
    if (failedRef.current) return false;
    pipelineRef.current ??= createPipeline();
    if (!(await pipelineRef.current)) return false;
    const loaded = loadedRef.current;
    if (loaded?.tab === tab && loaded.bpm === bpm) return true;
    // The synth says "ready" once it has both the soundfont (first time
    // only, still downloading) and this MIDI; a reload loses the position,
    // so the caller seeks back afterwards.
    const ready = new Promise<boolean>((resolve) => (resolveReadyRef.current = resolve));
    post({ type: "loadTab", tab, bpm });
    if (!(await ready)) return false;
    loadedRef.current = { tab, bpm };
    setStatus("ready");
    return true;
  }

  function play() {
    playingRef.current = true;
    anchorRef.current = { ms: anchorRef.current.ms, at: null };
    post({ type: "play" });
  }

  function pause() {
    playingRef.current = false;
    anchorRef.current = { ms: getElapsedSeconds() * 1000, at: null };
    // The worker answers with the exact heard position, which re-anchors this.
    post({ type: "pause" });
  }

  function stop() {
    playingRef.current = false;
    anchorRef.current = { ms: 0, at: null };
    post({ type: "stop" });
  }

  function seek(seconds: number) {
    anchorRef.current = { ms: seconds * 1000, at: playingRef.current ? performance.now() : null };
    post({ type: "seek", timeMs: seconds * 1000 });
  }

  /** Seconds of the song heard so far, extrapolated between the synth's ~10/s reports. */
  function getElapsedSeconds(): number {
    const { ms, at } = anchorRef.current;
    return (at === null ? ms : ms + (performance.now() - at)) / 1000;
  }

  function setMuted(next: boolean) {
    if (gainRef.current) gainRef.current.gain.value = next ? 0 : VOLUME;
    mutedInMemory = next;
    try {
      localStorage.setItem(MUTED_KEY, next ? "1" : "0");
    } catch {}
    for (const listener of mutedListeners) listener();
  }

  function setTone(settings: ToneSettings) {
    toneRef.current.settings = settings;
    toneRef.current.chain?.apply(settings);
  }

  return { status, progress, muted, setMuted, ensureReady, play, pause, stop, seek, getElapsedSeconds, setTone };
}
