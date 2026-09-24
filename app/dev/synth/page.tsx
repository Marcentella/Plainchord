"use client";

// Throwaway prototype page for Fase 3 / Paso 2 (plans/synth_blueprint.md,
// Step 0) -- never linked from the real UI, deleted once Step 3 lands. Its
// strings are hardcoded Spanish on purpose: this isn't real interface copy,
// so the i18n rule doesn't apply (see the plan doc).
//
// Purpose: let a human listen to alphaSynth's guitar tone, tune the vibrato
// constants live, and confirm there are no audio dropouts while the main
// thread is deliberately busy -- before any of Step 1-3 gets built.

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import type { OutMessage } from "@/lib/synth/synthWorker";

// Sizes the worklet's ring buffer (see public/synth-worklet.js). 200ms
// only had room for ~4 in-flight synthesize replies without risking
// overflow-truncation (each reply is 4096 interleaved samples -- see
// MICRO_BUFFER_CHUNK_SAMPLES there); 500ms gives a deeper, jitter-tolerant
// pipeline at the cost of a bit more startup/seek latency, an easy trade
// for a dev prototype.
const BUFFER_TIME_MS = 500;

const SNIPPETS = {
  scale: { label: "Escala (afinación/timing)", tex: "8.6 10.6 12.6 13.6 15.6 17.6 19.6 20.6" },
  vibrato: { label: "Vibrato: leve vs. amplio", tex: ":2 3.6{v} 3.6{vw}" },
  bend: {
    label: "Bends: completo, bend+release, bend+vibrato",
    tex: ":2 7.3{b (0 4)} 7.3{b (0 4 4 0)} 7.3{b (0 4) v}",
  },
  techniques: {
    label: "Slide, hammer-on, palm mute",
    tex: ":4 5.3{sl} 8.3 | 5.3{h} 8.3 | 3.6{pm} 3.6{pm} 3.6{pm} 3.6{pm}",
  },
} as const;

type SnippetKey = keyof typeof SNIPPETS;

// Standard General MIDI guitar programs, which is what Guitar Pro files
// carry -- public/soundfont/FluidR3_GM.sf3 keeps just these presets.
const PROGRAMS = {
  steel: { label: "Cuerdas de acero", program: 25 },
  jazz: { label: "Jazz", program: 26 },
  clean: { label: "Eléctrica limpia", program: 27 },
  muted: { label: "Palm mute", program: 28 },
  overdrive: { label: "Overdrive", program: 29 },
  distortion: { label: "Distorsión", program: 30 },
  harmonics: { label: "Armónicos", program: 31 },
} as const;

type ProgramKey = keyof typeof PROGRAMS;

// Defaults straight from VibratoPlaybackSettings (see
// plans/synth_blueprint.md's table) -- the starting point for live tuning.
type VibratoSettings = {
  noteSlightLength: number;
  noteSlightAmplitude: number;
  noteWideLength: number;
  noteWideAmplitude: number;
  beatSlightLength: number;
  beatSlightAmplitude: number;
  beatWideLength: number;
  beatWideAmplitude: number;
};

const DEFAULT_VIBRATO: VibratoSettings = {
  noteSlightLength: 360,
  noteSlightAmplitude: 0.5,
  noteWideLength: 240,
  noteWideAmplitude: 1,
  beatSlightLength: 480,
  beatSlightAmplitude: 2,
  beatWideLength: 480,
  beatWideAmplitude: 2,
};

const VIBRATO_FIELDS: { key: keyof VibratoSettings; label: string; max: number; step: number }[] = [
  { key: "noteSlightLength", label: "Nota leve — longitud (ticks)", max: 960, step: 10 },
  { key: "noteSlightAmplitude", label: "Nota leve — amplitud (semitonos)", max: 4, step: 0.1 },
  { key: "noteWideLength", label: "Nota amplio — longitud (ticks)", max: 960, step: 10 },
  { key: "noteWideAmplitude", label: "Nota amplio — amplitud (semitonos)", max: 4, step: 0.1 },
  { key: "beatSlightLength", label: "Compás leve — longitud (ticks)", max: 960, step: 10 },
  { key: "beatSlightAmplitude", label: "Compás leve — amplitud (semitonos)", max: 4, step: 0.1 },
  { key: "beatWideLength", label: "Compás amplio — longitud (ticks)", max: 960, step: 10 },
  { key: "beatWideAmplitude", label: "Compás amplio — amplitud (semitonos)", max: 4, step: 0.1 },
];

export default function SynthDevPage() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const setupRef = useRef<Promise<void> | null>(null);

  const [snippet, setSnippet] = useState<SnippetKey>("scale");
  const [program, setProgram] = useState<ProgramKey>("clean");
  const [vibrato, setVibrato] = useState<VibratoSettings>(DEFAULT_VIBRATO);
  const [stress, setStress] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Busy-loops ~50ms every animation frame to simulate heavy main-thread
  // React work -- playback must stay clean while this runs, since
  // synthesis and output live entirely in the Worker/AudioWorklet split,
  // untouched by main-thread jank.
  useEffect(() => {
    if (!stress) return;
    let raf: number;
    const loop = () => {
      const end = performance.now() + 50;
      while (performance.now() < end) {
        /* deliberately busy */
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stress]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workletNodeRef.current?.disconnect();
      void audioContextRef.current?.close();
    };
  }, []);

  async function ensureSetup(): Promise<void> {
    if (setupRef.current) return setupRef.current;

    setupRef.current = (async () => {
      try {
        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        await ctx.resume();
        await ctx.audioWorklet.addModule("/synth-worklet.js");

        const worklet = new AudioWorkletNode(ctx, "plainchord-synth", {
          outputChannelCount: [2],
          processorOptions: { bufferTimeInMilliseconds: BUFFER_TIME_MS },
        });
        worklet.connect(ctx.destination);
        workletNodeRef.current = worklet;

        const worker = new Worker(new URL("../../../lib/synth/synthWorker.ts", import.meta.url), { type: "module" });
        workerRef.current = worker;
        worker.onerror = (e) => setError(`worker.onerror: ${e.message} @ ${e.filename}:${e.lineno}`);

        // ensureSetup() must not resolve until the synth is actually ready
        // -- otherwise a Play click that lands before the soundfont
        // finishes loading sends "play" too early. AlphaSynth's own
        // play() silently no-ops when the MIDI/soundfont aren't loaded
        // yet and nothing retries it once they are, so the click would
        // just do nothing.
        let resolveReady: () => void;
        const readyPromise = new Promise<void>((resolve) => {
          resolveReady = resolve;
        });

        worker.onmessage = (event: MessageEvent<OutMessage>) => {
          const message = event.data;
          switch (message.type) {
            case "ready":
              setReady(true);
              resolveReady();
              break;
            case "error":
              setError(message.message);
              resolveReady(); // don't leave the caller hanging on a load that failed
              break;
            case "positionChanged":
              setCurrentTime(message.currentTime);
              setEndTime(message.endTime);
              break;
            case "stateChanged":
              setPlaying(message.playing);
              break;
            case "finished":
              setPlaying(false);
              break;
          }
        };

        // One dedicated MessageChannel carries only audio-sample messages
        // between the worker and the worklet -- the worklet's own default
        // `port` is used just once, to hand it that channel's other end.
        const channel = new MessageChannel();
        worklet.port.postMessage({ type: "setPort", port: channel.port2 }, [channel.port2]);
        postToWorker(
          { type: "init", port: channel.port1, sampleRate: ctx.sampleRate, bufferTimeInMilliseconds: BUFFER_TIME_MS },
          [channel.port1],
        );
        postToWorker({ type: "load", tex: SNIPPETS[snippet].tex, program: PROGRAMS[program].program });
        await readyPromise;
      } catch (e) {
        setError(`ensureSetup threw: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
      }
    })();

    return setupRef.current;
  }

  function postToWorker(message: object, transfer?: Transferable[]) {
    // `cmd` is for alphaTab's own benefit, not ours: importing
    // @coderline/alphatab inside a Worker auto-registers its own
    // "message" listener (see synthWorker.ts's header comment), and one
    // of its two handlers crashes on `data.cmd.startsWith(...)` when cmd
    // is missing -- every message we send needs *some* string there, one
    // that can't collide with its own "alphaSynth.*"/"alphaTab.*" cases.
    const withCmd = { ...message, cmd: "plainchord" };
    if (transfer) workerRef.current?.postMessage(withCmd, transfer);
    else workerRef.current?.postMessage(withCmd);
  }

  async function handlePlayPause() {
    setError(null);
    await ensureSetup();
    postToWorker(playing ? { type: "pause" } : { type: "play" });
  }

  function handleStop() {
    postToWorker({ type: "stop" });
  }

  function handleSnippetChange(next: SnippetKey) {
    setSnippet(next);
    setCurrentTime(0);
    setEndTime(0);
    setPlaying(false);
    if (workerRef.current) postToWorker({ type: "load", tex: SNIPPETS[next].tex, program: PROGRAMS[program].program });
  }

  function handleProgramChange(next: ProgramKey) {
    setProgram(next);
    postToWorker({ type: "setProgram", program: PROGRAMS[next].program });
  }

  function handleVibratoChange(key: keyof VibratoSettings, value: number) {
    const next = { ...vibrato, [key]: value };
    setVibrato(next);
    postToWorker({ type: "setVibrato", vibrato: { [key]: value } });
  }

  return (
    <main className="mx-auto max-w-2xl p-6 text-foreground">
      <h1 className="text-xl font-semibold">Prototipo de síntesis (alphaSynth)</h1>
      <p className="mt-1 text-sm text-muted">
        Página interna, no enlazada desde la UI real. Ver plans/synth_blueprint.md.
      </p>

      {error && (
        <p className="mt-4 rounded border border-red-400 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <section className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={handlePlayPause}
          className="flex items-center gap-2 rounded bg-accent px-4 py-2 text-white"
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
          {playing ? "Pausar" : "Reproducir"}
        </button>
        <button onClick={handleStop} className="flex items-center gap-2 rounded border border-line px-4 py-2">
          <Square size={16} />
          Detener
        </button>
        <span className="text-sm text-muted">
          {ready ? "Listo" : "Cargando soundfont…"} · {(currentTime / 1000).toFixed(2)}s / {(endTime / 1000).toFixed(2)}s
        </span>
      </section>

      <section className="mt-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={stress} onChange={(e) => setStress(e.target.checked)} />
          Estrés en el hilo principal (~50ms por frame) — el audio no debería cortarse
        </label>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Fragmento alphaTex</h2>
        <div className="mt-2 flex flex-col gap-1">
          {(Object.keys(SNIPPETS) as SnippetKey[]).map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="snippet"
                checked={snippet === key}
                onChange={() => handleSnippetChange(key)}
              />
              {SNIPPETS[key].label}
            </label>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Instrumento</h2>
        <div className="mt-2 flex flex-wrap gap-1">
          {(Object.keys(PROGRAMS) as ProgramKey[]).map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="radio" name="program" checked={program === key} onChange={() => handleProgramChange(key)} />
              {PROGRAMS[key].label}
            </label>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-medium">Vibrato</h2>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {VIBRATO_FIELDS.map(({ key, label, max, step }) => (
            <label key={key} className="text-sm">
              {label}: {vibrato[key]}
              <input
                type="range"
                min={0}
                max={max}
                step={step}
                value={vibrato[key]}
                onChange={(e) => handleVibratoChange(key, Number(e.target.value))}
                className="mt-1 w-full accent-accent"
              />
            </label>
          ))}
        </div>
      </section>
    </main>
  );
}
