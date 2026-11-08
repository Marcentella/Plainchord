"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Square, X } from "lucide-react";
import { useT } from "@/i18n/LocaleProvider";
import { useLocale } from "@/i18n/useLocale";
import { micErrorFor, openMic, type MicInput } from "@/lib/micInput";
import type { Tab } from "@/lib/tab";

type Phase = "idle" | "requesting" | "countIn" | "recording" | "processing" | "noNotes" | "denied" | "unavailable";
type Chunk = { frame: number; samples: Float32Array };

const COUNT_IN = 4;
const BEATS_PER_BAR = 4;
const MAX_SECONDS = 120;
const DEFAULT_BPM = 80;
const MIN_BPM = 40;
const MAX_BPM = 200;
// Head start before the first count-in click, so it never lands while the
// context is still spinning up (a click scheduled in the past plays late).
const LEAD_IN = 0.3;

function scheduleClick(ctx: AudioContext, at: number, accent: boolean) {
  const osc = ctx.createOscillator();
  osc.frequency.value = accent ? 1500 : 1000;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(0.4, at + 0.002);
  env.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
  osc.connect(env).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.06);
}

/**
 * 16-bit mono WAV of exactly what transcription received — behind ?debug
 * (same idea as /acordes?demo), for tuning lib/transcribe.ts's thresholds
 * against a real guitar instead of guessing.
 */
function downloadWav(samples: Float32Array, sampleRate: number, name: string) {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => data.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  data.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true); // PCM
  data.setUint16(22, 1, true); // mono
  data.setUint32(24, sampleRate, true);
  data.setUint32(28, sampleRate * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  text(36, "data");
  data.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => data.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: "audio/wav" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * "Escuchar y escribir": count-in, record the mic, transcribe it into a Tab
 * (lib/transcribe.ts). Same dialog shape and same stale-request guard as
 * components/TunerModal.tsx. During recording the beat is shown, not heard,
 * unless the user turns the click on: from speakers it would leak into the
 * mic and read as notes.
 */
export default function RecordTabModal({
  open,
  onClose,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (tab: Tab) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [bpmText, setBpmText] = useState(String(DEFAULT_BPM));
  const [clickDuring, setClickDuring] = useState(false);
  // Count-in number (1-4) before the downbeat, beat within the bar (0-3) after.
  const [beat, setBeat] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const micRef = useRef<MicInput | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<Chunk[]>([]);
  const downbeatRef = useRef(0);
  const bpmRef = useRef(DEFAULT_BPM);
  // Same job as TunerModal's: a getUserMedia()/addModule() that resolves
  // after the dialog closed must tear down, not start recording unseen.
  const tokenRef = useRef(0);

  function release() {
    tokenRef.current++;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    chunksRef.current = [];
  }

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      release();
      setPhase("idle");
    };
  }, [open]);

  async function start() {
    const token = ++tokenRef.current;
    const bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(Number(bpmText)) || DEFAULT_BPM));
    setBpmText(String(bpm));
    bpmRef.current = bpm;
    setPhase("requesting");
    try {
      const mic = await openMic(2048);
      if (token !== tokenRef.current) {
        mic.stop();
        return;
      }
      micRef.current = mic;
      const ctx = mic.audioCtx;
      await ctx.audioWorklet.addModule("/recorder-worklet.js");
      if (token !== tokenRef.current) return;

      // Mixed down to mono before the worklet sees it: audio interfaces
      // (Focusrite Scarlett and the like) put the instrument jack on input
      // 2, the right channel, and Chrome passes both channels through once
      // echo cancellation is off. Reading channel 0 alone recorded the
      // empty mic input instead of the guitar.
      const recorder = new AudioWorkletNode(ctx, "recorder", { channelCount: 1, channelCountMode: "explicit" });
      // A worklet only runs while something downstream pulls on it; a muted
      // gain into the speakers keeps it pulled without monitoring the mic.
      const sink = ctx.createGain();
      sink.gain.value = 0;
      mic.source.connect(recorder).connect(sink).connect(ctx.destination);
      chunksRef.current = [];
      recorder.port.onmessage = (e: MessageEvent<Chunk>) => chunksRef.current.push(e.data);

      const secondsPerBeat = 60 / bpm;
      const first = ctx.currentTime + LEAD_IN;
      const downbeat = first + COUNT_IN * secondsPerBeat;
      downbeatRef.current = downbeat;
      for (let i = 0; i < COUNT_IN; i++) scheduleClick(ctx, first + i * secondsPerBeat, i === 0);
      if (clickDuring) {
        // All up front: closing the context on stop silences whatever's left.
        for (let i = 0; i * secondsPerBeat < MAX_SECONDS; i++) {
          scheduleClick(ctx, downbeat + i * secondsPerBeat, i % BEATS_PER_BAR === 0);
        }
      }

      setPhase("countIn");
      const loop = () => {
        const now = ctx.currentTime;
        if (now < downbeat) {
          setBeat(Math.min(COUNT_IN, Math.max(1, Math.floor((now - first) / secondsPerBeat) + 1)));
        } else {
          const seconds = now - downbeat;
          if (seconds >= MAX_SECONDS) {
            void finish();
            return;
          }
          setPhase("recording");
          setBeat(Math.floor(seconds / secondsPerBeat) % BEATS_PER_BAR);
          setElapsed(Math.floor(seconds));
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      if (token !== tokenRef.current) return;
      release();
      setPhase(micErrorFor(err));
    }
  }

  async function finish() {
    const mic = micRef.current;
    if (!mic) return;
    const token = tokenRef.current;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const chunks = chunksRef.current;
    const sampleRate = mic.audioCtx.sampleRate;
    mic.stop();
    micRef.current = null;
    setPhase("processing");

    if (chunks.length === 0) {
      setPhase("noNotes");
      return;
    }
    const firstFrame = chunks[0].frame;
    const last = chunks[chunks.length - 1];
    const samples = new Float32Array(last.frame + last.samples.length - firstFrame);
    for (const chunk of chunks) samples.set(chunk.samples, chunk.frame - firstFrame);
    const downbeat = downbeatRef.current - firstFrame / sampleRate;
    if (new URLSearchParams(window.location.search).has("debug")) {
      downloadWav(samples, sampleRate, `plainchord-take_${bpmRef.current}bpm_downbeat-${downbeat.toFixed(3)}s.wav`);
    }

    // Let the spinner paint before transcription holds the main thread.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const { transcribe } = await import("@/lib/transcribe");
    if (token !== tokenRef.current) return;
    const tab = transcribe(samples, sampleRate, bpmRef.current, downbeat);
    if (!tab.beats.some((b) => b.notes.length > 0)) {
      setPhase("noNotes");
      return;
    }
    tab.title = t("record.tabTitle", {
      time: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
    });
    onResult(tab);
    dialogRef.current?.close();
  }

  const busy = phase === "requesting" || phase === "countIn" || phase === "recording" || phase === "processing";

  return (
    <dialog
      ref={dialogRef}
      className="tuner-dialog m-auto w-full max-w-sm rounded-lg border border-line bg-background p-6 text-foreground shadow-xl"
      aria-labelledby="record-title"
      onClose={onClose}
      onClick={(e) => {
        // Backdrop click closes, same as the tuner — but not mid-recording,
        // where a stray click would throw the take away.
        if (e.target === dialogRef.current && !busy) dialogRef.current?.close();
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="record-title" className="text-lg font-medium">
          {t("record.title")}
        </h2>
        <button
          onClick={() => dialogRef.current?.close()}
          aria-label={t("record.close")}
          className="rounded-full border border-line p-1.5 transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="mt-4 flex flex-col items-center gap-4">
        {(phase === "idle" || phase === "noNotes") && (
          <div className="flex w-full flex-col gap-4">
            <p className="text-sm text-muted">{t("record.intro")}</p>
            {phase === "noNotes" && (
              <p className="text-sm text-difficulty-dificil" role="status">
                {t("record.noNotes")}
              </p>
            )}
            <label className="flex items-center justify-between gap-3 text-sm">
              {t("record.bpmLabel")}
              <input
                type="number"
                min={MIN_BPM}
                max={MAX_BPM}
                value={bpmText}
                onChange={(e) => setBpmText(e.target.value)}
                className="w-20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none rounded-md border border-line bg-transparent px-2 py-1 text-foreground focus:border-accent focus:outline-2 focus:outline-accent focus:outline-offset-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={clickDuring}
                onChange={(e) => setClickDuring(e.target.checked)}
                className="accent-accent"
              />
              {t("record.clickLabel")}
            </label>
            <p className="text-xs text-muted">{t("tuner.privacyNote")}</p>
            <button
              onClick={start}
              className="inline-flex items-center justify-center gap-2 rounded border border-line px-4 py-2 text-sm transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
            >
              <Mic size={16} aria-hidden />
              {t(phase === "noNotes" ? "record.retry" : "record.start")}
            </button>
          </div>
        )}

        {(phase === "requesting" || phase === "processing") && (
          <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
            <Loader2 size={28} className="text-accent animate-spin" aria-hidden />
            <p className="text-sm text-muted">{t(phase === "requesting" ? "tuner.requesting" : "record.processing")}</p>
          </div>
        )}

        {phase === "countIn" && (
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <div className="text-6xl font-semibold tabular-nums text-muted" aria-hidden>
              {beat}
            </div>
            <p className="text-sm text-muted" role="status">
              {t("record.countIn")}
            </p>
          </div>
        )}

        {phase === "recording" && (
          <div className="flex flex-col items-center gap-4 py-2">
            {/* The beat as a number carrying on from the count-in (1 2 3 4 |
                1 2 3 4...), the downbeat in the accent color: read as a
                metronome. Cycling dots read as a loading spinner. */}
            <div
              className={`text-6xl font-semibold tabular-nums ${beat === 0 ? "text-accent" : "text-foreground"}`}
              aria-hidden
            >
              {beat + 1}
            </div>
            <p className="text-sm text-muted tabular-nums" role="status">
              {t("record.recording", { time: formatElapsed(elapsed) })}
            </p>
            <button
              onClick={() => void finish()}
              className="inline-flex items-center gap-2 rounded border border-line px-4 py-2 text-sm transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
            >
              <Square size={14} aria-hidden />
              {t("record.stop")}
            </button>
          </div>
        )}

        {(phase === "denied" || phase === "unavailable") && (
          <div className="flex flex-col items-center gap-3 text-center">
            <MicOff size={28} className="text-difficulty-dificil" aria-hidden />
            <p className="text-sm text-muted">
              {t(phase === "denied" ? "tuner.permissionDenied" : "tuner.noMicrophone")}
            </p>
          </div>
        )}
      </div>
    </dialog>
  );
}
