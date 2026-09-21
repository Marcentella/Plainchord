"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Mic, MicOff, X } from "lucide-react";
import { t } from "@/i18n";
import {
  TUNING_PRESETS,
  isPlausiblePitch,
  medianFrequency,
  readingFor,
  type TunerReading,
} from "@/lib/tuning";

type MicState = "idle" | "requesting" | "listening" | "denied" | "unavailable";

const ACCURACY_COLOR: Record<TunerReading["accuracy"], string> = {
  inTune: "text-difficulty-facil",
  close: "text-difficulty-media",
  off: "text-difficulty-dificil",
};

// Track/indicator geometry — kept as plain numbers (not Tailwind arbitrary
// values) since the indicator's position is computed from live cents, not a
// fixed class.
const TRACK_WIDTH = 256; // px, matches w-64 below
const INDICATOR_SIZE = 14;
const MAX_OFFSET = TRACK_WIDTH / 2 - INDICATOR_SIZE / 2;

export default function TunerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [micState, setMicState] = useState<MicState>("idle");
  const [presetId, setPresetId] = useState(TUNING_PRESETS[0].id);
  const [reading, setReading] = useState<TunerReading | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const recentRef = useRef<number[]>([]);
  const presetRef = useRef<number[] | null>(TUNING_PRESETS[0].strings);
  // Invalidates an in-flight activateMic() call — bumped by stopMic() so a
  // getUserMedia()/import("pitchy") that resolves AFTER the dialog has
  // already closed (fast open→close, or React unmounting mid-request) is
  // recognized as stale and torn down instead of starting a loop against a
  // dialog nobody can see, or worse, leaving the mic hot with no UI to stop
  // it from.
  const requestTokenRef = useRef(0);

  useEffect(() => {
    presetRef.current = TUNING_PRESETS.find((p) => p.id === presetId)!.strings;
  }, [presetId]);

  function stopMic() {
    requestTokenRef.current++;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    // Stopping the tracks (not just closing the AudioContext) is what
    // actually turns off the browser's "this tab is using your microphone"
    // indicator and releases the hardware.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    recentRef.current = [];
    setReading(null);
  }

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      stopMic();
      setMicState("idle");
      setPresetId(TUNING_PRESETS[0].id);
    };
  }, [open]);

  async function activateMic() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState("unavailable");
      return;
    }
    const token = ++requestTokenRef.current;
    setMicState("requesting");
    try {
      // Browsers apply speech-tuned DSP (echo cancellation, noise
      // suppression, auto gain) by default — actively harmful for
      // instrument pitch detection, not neutral. Ask for the raw signal.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (token !== requestTokenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      // Dynamic import, same pattern as lib/importGuitarPro.ts's alphaTab
      // load: a browser-only dependency stays out of the main bundle until
      // someone actually opens the tuner.
      const { PitchDetector } = await import("pitchy");
      if (token !== requestTokenRef.current) return; // stopMic() already tore the stream/context above down

      const detector = PitchDetector.forFloat32Array(analyser.fftSize);
      const buffer = new Float32Array(analyser.fftSize);

      setMicState("listening");
      const loop = () => {
        analyser.getFloatTimeDomainData(buffer);
        const [hz, clarity] = detector.findPitch(buffer, audioCtx.sampleRate);
        if (isPlausiblePitch(hz, clarity)) {
          const recent = recentRef.current;
          recent.push(hz);
          if (recent.length > 8) recent.shift();
          setReading(readingFor(medianFrequency(recent), presetRef.current));
        } else {
          recentRef.current = [];
          setReading(null);
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      if (token !== requestTokenRef.current) return;
      setMicState(err instanceof DOMException && err.name === "NotFoundError" ? "unavailable" : "denied");
    }
  }

  const clampedCents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0;
  const offsetPx = (clampedCents / 50) * MAX_OFFSET;
  const direction = !reading || reading.accuracy === "inTune" ? "inTune" : reading.cents < 0 ? "flat" : "sharp";
  const directionLabel = t(direction === "flat" ? "tuner.flat" : direction === "sharp" ? "tuner.sharp" : "tuner.inTune");

  return (
    <dialog
      ref={dialogRef}
      className="tuner-dialog m-auto w-full max-w-sm rounded-lg border border-line bg-background p-6 text-foreground shadow-xl"
      aria-labelledby="tuner-title"
      onClose={onClose}
      onClick={(e) => {
        // A click that lands on the <dialog> element itself (not any of its
        // children) is a click on ::backdrop — dialog's own box only covers
        // its visible content, so hit-testing outside that content resolves
        // to the dialog element. Same "click missed everything real" test
        // NavMenu/PalettePicker do with a ref, just expressed via native
        // event targeting instead of a document listener.
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="tuner-title" className="text-lg font-medium">
          {t("tuner.title")}
        </h2>
        <button
          onClick={() => dialogRef.current?.close()}
          aria-label={t("tuner.close")}
          className="rounded-full border border-line p-1.5 transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <label className="mt-4 flex flex-col gap-1 text-sm">
        {t("tuner.tuningLabel")}
        <select
          value={presetId}
          onChange={(e) => setPresetId(e.target.value)}
          // bg-background, not bg-transparent: Chromium bases the native
          // option-list popup's own background on the <select>'s RESOLVED
          // background-color. "transparent" isn't a color it can reuse, so
          // it fell back to the browser default (white) while the text
          // still inherited the dialog's light foreground — white on white
          // in dark mode. An explicit color fixes the popup, not just the
          // closed control. tuner-select (app/globals.css) is a Chrome-
          // 135+-only progressive enhancement on top of this baseline —
          // every browser gets a correctly readable dropdown from the
          // classes here alone.
          className="tuner-select rounded-md border border-line bg-background text-foreground px-2 py-1.5 text-sm transition-colors focus:border-accent focus:outline-2 focus:outline-accent focus:outline-offset-2"
        >
          {TUNING_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {t(preset.labelKey as Parameters<typeof t>[0])}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-6 flex flex-col items-center gap-4">
        {micState === "idle" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Mic size={28} className="text-muted" aria-hidden />
            <p className="text-sm text-muted">{t("tuner.privacyNote")}</p>
            <button
              onClick={activateMic}
              className="rounded-full border border-line px-4 py-2 text-sm transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
            >
              {t("tuner.activateMic")}
            </button>
          </div>
        )}

        {micState === "requesting" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 size={28} className="text-accent animate-spin" aria-hidden />
            <p className="text-sm text-muted">{t("tuner.requesting")}</p>
          </div>
        )}

        {(micState === "denied" || micState === "unavailable") && (
          <div className="flex flex-col items-center gap-3 text-center">
            <MicOff size={28} className="text-difficulty-dificil" aria-hidden />
            <p className="text-sm text-muted">
              {t(micState === "denied" ? "tuner.permissionDenied" : "tuner.noMicrophone")}
            </p>
          </div>
        )}

        {micState === "listening" && (
          <div className="flex w-full flex-col items-center gap-3">
            <div className="text-6xl font-semibold tabular-nums" aria-hidden>
              {reading ? reading.noteName : "—"}
            </div>

            <div className="relative" style={{ width: TRACK_WIDTH, height: 24 }}>
              {/* Center tick — the reference point stays visible independent of the indicator's color or position. */}
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-muted" aria-hidden />
              <div className="absolute left-0 top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-line" aria-hidden />
              <div
                className={`tuner-indicator absolute left-1/2 top-1/2 rounded-full ${reading ? ACCURACY_COLOR[reading.accuracy] : "bg-muted"} ${reading ? "opacity-100" : "opacity-0"}`}
                style={{
                  width: INDICATOR_SIZE,
                  height: INDICATOR_SIZE,
                  backgroundColor: "currentColor",
                  transform: `translate(-50%, -50%) translateX(${offsetPx}px)`,
                }}
                aria-hidden
              />
            </div>

            <div className="flex min-h-8 items-center gap-1.5 text-sm">
              {reading ? (
                <>
                  {reading.accuracy === "inTune" && <Check size={16} className={ACCURACY_COLOR.inTune} aria-hidden />}
                  <span className={ACCURACY_COLOR[reading.accuracy]}>{directionLabel}</span>
                </>
              ) : (
                <span className="text-muted">{t("tuner.playAString")}</span>
              )}
            </div>

            {/* role="meter" gives assistive tech the numeric reading directly
                — position/color/icon/text above are the sighted+low-vision
                redundant channels, this is the screen-reader one. Only the
                note name or accuracy band changing re-renders this, not
                every animation frame, or aria-live would announce constant
                noise. */}
            <div
              role="meter"
              aria-valuemin={-50}
              aria-valuemax={50}
              aria-valuenow={reading ? Math.round(reading.cents) : 0}
              aria-valuetext={
                reading
                  ? t("tuner.centsValueText", {
                      note: reading.noteName,
                      cents: String(Math.abs(Math.round(reading.cents))),
                      direction: directionLabel,
                    })
                  : t("tuner.playAString")
              }
              aria-live="polite"
              className="sr-only"
            />
          </div>
        )}
      </div>
    </dialog>
  );
}
