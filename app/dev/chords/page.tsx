"use client";

// Calibration page for chord detection (lib/chordDetection.ts) — never linked
// from the real UI, same convention as /dev/synth: hardcoded Spanish on
// purpose, this isn't interface copy. Purpose: strum a real guitar (or load a
// recording of one) and SEE what the detector sees — the 12 chroma bars, the
// top candidates and their scores — so DETECTION's numbers get picked from
// evidence instead of guessed. Nothing here is uploaded or saved.

import { useEffect, useRef, useState } from "react";
import type MeydaType from "meyda";
import { allChords } from "@/lib/chords";
import {
  DETECTION,
  extractFrame,
  matchesTarget,
  rankChords,
  type DetectionSettings,
  type Frame,
  type Ranked,
} from "@/lib/chordDetection";
import { openMic, type MicInput } from "@/lib/micInput";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

type Snapshot = { frame: Frame; ranked: Ranked[] };
type Segment = { from: number; to: number; chord: string; score: number; runnerUp: string };

let meydaPromise: Promise<typeof MeydaType> | null = null;
function loadMeyda() {
  meydaPromise ??= import("meyda").then((m) => m.default);
  return meydaPromise;
}

export default function ChordCalibrationPage() {
  const [settings, setSettings] = useState<DetectionSettings>(DETECTION);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [target, setTarget] = useState("G");
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [fileStatus, setFileStatus] = useState<string | null>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);

  const micRef = useRef<MicInput | null>(null);
  const rafRef = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  function stop() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    setListening(false);
  }
  useEffect(() => stop, []);

  async function start(fftSize = settings.fftSize) {
    stop();
    setError(null);
    try {
      const [mic, Meyda] = await Promise.all([openMic(fftSize), loadMeyda()]);
      micRef.current = mic;
      setSampleRate(mic.audioCtx.sampleRate);
      const buffer = new Float32Array(fftSize);
      let last = 0;
      setListening(true);
      const loop = (now: number) => {
        rafRef.current = requestAnimationFrame(loop);
        if (now - last < 100) return;
        last = now;
        mic.analyser.getFloatTimeDomainData(buffer);
        const frame = extractFrame(Meyda, buffer, mic.audioCtx.sampleRate);
        setSnap({ frame, ranked: rankChords(frame.chroma, allChords, settingsRef.current) });
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      setError(String(err));
    }
  }

  function setFftSize(fftSize: number) {
    setSettings((s) => ({ ...s, fftSize }));
    if (listening) void start(fftSize);
  }

  // A recording, analyzed with the exact same code as the mic: windows of
  // fftSize samples every 100 ms, collapsed into runs of the same top chord.
  async function analyzeFile(file: File) {
    setFileStatus("Decodificando…");
    setSegments(null);
    try {
      const Meyda = await loadMeyda();
      const ctx = new AudioContext();
      const audio = await ctx.decodeAudioData(await file.arrayBuffer());
      void ctx.close();
      const samples = audio.getChannelData(0);
      const hop = Math.round(audio.sampleRate / 10);
      const out: Segment[] = [];
      for (let start = 0; start + settings.fftSize <= samples.length; start += hop) {
        const frame = extractFrame(Meyda, samples.slice(start, start + settings.fftSize), audio.sampleRate);
        const t = start / audio.sampleRate;
        if (frame.rms < settings.minRms) continue;
        const ranked = rankChords(frame.chroma, allChords, settings);
        const prev = out[out.length - 1];
        if (prev && prev.chord === ranked[0].chord.name && t - prev.to <= 0.15) {
          prev.to = t;
          prev.score = Math.max(prev.score, ranked[0].score);
        } else {
          out.push({ from: t, to: t, chord: ranked[0].chord.name, score: ranked[0].score, runnerUp: `${ranked[1].chord.name} ${ranked[1].score.toFixed(3)}` });
        }
      }
      setSegments(out);
      setFileStatus(`${file.name}: ${audio.duration.toFixed(1)} s, ${audio.sampleRate} Hz`);
    } catch (err) {
      setFileStatus(`No se pudo leer: ${String(err)}`);
    }
  }

  const targetChord = allChords.find((c) => c.name === target)!;
  const loud = snap ? snap.frame.rms >= settings.minRms : false;
  const targetMatch = snap && loud ? matchesTarget(snap.ranked, targetChord, settings) : false;
  const targetScore = snap?.ranked.find((r) => r.chord.name === target)?.score;

  const slider = (key: "accept" | "margin" | "minRms" | "harmonicDecay", min: number, max: number, step: number) => (
    <label className="grid grid-cols-[9rem_1fr_4rem] items-center gap-3 text-sm">
      <span>{key}</span>
      <input type="range" min={min} max={max} step={step} value={settings[key]} onChange={(e) => setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))} />
      <span className="tabular-nums">{settings[key]}</span>
    </label>
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold">Calibración: detección de acordes</h1>
        <p className="mt-1 text-sm text-muted">
          Rasguea cada acorde unas veces y mira las barras y los candidatos. Los ajustes parten de DETECTION
          (lib/chordDetection.ts) y solo cambian esta página. Nada se graba ni se sube.
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-4 text-sm">
        <button type="button" className="rounded border border-line px-3 py-1.5" onClick={() => (listening ? stop() : void start())}>
          {listening ? "Detener micrófono" : "Activar micrófono"}
        </button>
        <span>Buffer:</span>
        {[8192, 16384].map((size) => (
          <label key={size} className="flex items-center gap-1">
            <input type="radio" name="fft" checked={settings.fftSize === size} onChange={() => setFftSize(size)} />
            {size}
          </label>
        ))}
        {listening && sampleRate && (
          <span className="text-muted">
            {sampleRate} Hz → {((settings.fftSize / sampleRate) * 1000).toFixed(0)} ms por ventana
          </span>
        )}
        {error && <span className="text-difficulty-dificil">{error}</span>}
      </section>

      <section>
        <h2 className="font-semibold">Chroma en vivo</h2>
        <div className="mt-3 flex h-40 items-end gap-1.5">
          {NOTE_NAMES.map((name, i) => (
            <div key={name} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t bg-accent transition-[height] duration-100" style={{ height: `${(loud ? (snap?.frame.chroma[i] ?? 0) : 0) * 128}px` }} />
              <span className="text-xs text-muted">{name}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span>rms</span>
          <div className="relative h-2 flex-1 rounded bg-line">
            <div className="h-2 rounded bg-foreground" style={{ width: `${Math.min(1, (snap?.frame.rms ?? 0) * 5) * 100}%` }} />
            <div className="absolute top-[-3px] h-3.5 w-px bg-difficulty-dificil" style={{ left: `${Math.min(1, settings.minRms * 5) * 100}%` }} title="minRms" />
          </div>
          <span className="w-16 tabular-nums">{(snap?.frame.rms ?? 0).toFixed(4)}</span>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="font-semibold">Candidatos</h2>
          <ol className="mt-2 flex flex-col gap-1 text-sm tabular-nums">
            {loud && snap
              ? snap.ranked.slice(0, 5).map((r, i) => (
                  <li key={r.chord.name} className={i === 0 ? "text-lg font-semibold" : "text-muted"}>
                    {r.chord.name} — {r.score.toFixed(3)}
                  </li>
                ))
              : <li className="text-muted">Silencio (rms bajo minRms)</li>}
          </ol>
        </div>
        <div>
          <h2 className="font-semibold">Objetivo simulado</h2>
          <select className="mt-2 rounded border border-line bg-background px-2 py-1 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
            {allChords.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
          <p className={`mt-2 text-lg font-semibold ${targetMatch ? "text-difficulty-facil" : "text-muted"}`}>
            {targetMatch ? `✓ ${target} aceptado` : `${target} no aceptado`}
          </p>
          <p className="text-sm text-muted tabular-nums">puntaje {target}: {targetScore?.toFixed(3) ?? "—"}</p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Ajustes (solo esta página)</h2>
        {slider("accept", 0.7, 1, 0.005)}
        {slider("margin", 0, 0.1, 0.005)}
        {slider("minRms", 0, 0.1, 0.001)}
        {slider("harmonicDecay", 0, 1, 0.05)}
        <pre className="mt-2 overflow-x-auto rounded border border-line p-2 text-xs">{JSON.stringify(settings)}</pre>
      </section>

      <section>
        <h2 className="font-semibold">Analizar una grabación</h2>
        <p className="mt-1 text-sm text-muted">Mismo código que el micrófono, sobre un archivo de audio tuyo. Se procesa en el navegador.</p>
        <input className="mt-2 text-sm" type="file" accept="audio/*" onChange={(e) => e.target.files?.[0] && void analyzeFile(e.target.files[0])} />
        {fileStatus && <p className="mt-2 text-sm text-muted">{fileStatus}</p>}
        {segments && (
          <table className="mt-3 w-full text-left text-sm tabular-nums">
            <thead className="text-muted">
              <tr>
                <th className="font-normal">desde</th>
                <th className="font-normal">hasta</th>
                <th className="font-normal">acorde</th>
                <th className="font-normal">puntaje</th>
                <th className="font-normal">segundo</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.from}>
                  <td>{s.from.toFixed(1)} s</td>
                  <td>{s.to.toFixed(1)} s</td>
                  <td className="font-semibold">{s.chord}</td>
                  <td>{s.score.toFixed(3)}</td>
                  <td className="text-muted">{s.runnerUp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
