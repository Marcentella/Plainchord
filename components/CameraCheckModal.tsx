"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, CameraOff, Check, Crosshair, Laptop, Loader2, Lock, RotateCcw, Ruler, X } from "lucide-react";
import ChordDiagram, { type FingerMark } from "@/components/ChordDiagram";
import CalibrationGuide from "@/components/CalibrationGuide";
import ChordProgressionInput from "@/components/ChordProgressionInput";
import { useT } from "@/i18n/LocaleProvider";
import type { TKey } from "@/i18n/t";
import type { Chord } from "@/lib/chords";
import { allInPlace, checkChord, type Expected, type FingerReading } from "@/lib/chordFingerCheck";
import { CALIBRATION_FRETS, type CalibrationFret } from "@/lib/fretMapping";
import { formatChord } from "@/lib/notation";
import { useNotation } from "@/lib/useNotation";
import { cssColor } from "@/lib/fingerCameraDraw";
import { useFingerCamera } from "@/lib/useFingerCamera";

const FINGER_KEYS: TKey[] = ["camera.finger1", "camera.finger2", "camera.finger3", "camera.finger4"];

/**
 * The check needs a computer: tested on phones, the camera lags, the
 * calibration points are too small to tap precisely, and the phone can't be
 * held still while tapping it. "Main pointer is a mouse or trackpad" is the
 * test, not screen size or user agent: a touchscreen laptop still passes,
 * a tablet with a keyboard and trackpad passes, a phone doesn't.
 */
const FINE_POINTER = "(pointer: fine)";
function subscribePointer(onChange: () => void) {
  const query = window.matchMedia(FINE_POINTER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * "Revisar con cámara" (plan: Step 3): the webcam watches the fretting
 * hand and the chord's diagram shows where each finger is against where it
 * belongs. Descriptive, never a score — each finger gets "string, fret, as
 * in the diagram" or "…; the diagram puts it at …". Same dialog shape and
 * close behaviour as components/TunerModal.tsx; the pipeline is
 * lib/useFingerCamera.ts, shared with /dev/camera.
 */
export default function CameraCheckModal({
  open,
  onClose,
  chords,
  progression,
  onProgressionChange,
  chordLimit,
}: {
  open: boolean;
  onClose: () => void;
  chords: Chord[];
  /** The /acordes progression, editable here too: closing the check to change
   *  a chord meant turning the camera on and calibrating all over again. */
  progression: string;
  onProgressionChange: (value: string) => void;
  chordLimit: number;
}) {
  const t = useT();
  const notation = useNotation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [chordName, setChordName] = useState<string | null>(null);
  // The chosen chord, or the first one again if the progression changed under it.
  const chord = chords.find((c) => c.name === chordName) ?? chords[0];
  const chordRef = useRef(chord);
  useEffect(() => {
    chordRef.current = chord;
  });

  // Fingertip dots on the video match the diagram's rings: green where the
  // diagram has that finger, red where it doesn't, accent when unused/unseen.
  const { videoRef, canvasRef, ...cam } = useFingerCamera({
    target: () => chordRef.current,
    fingerColor: (finger, reading, locked) => {
      const current = chordRef.current;
      if (locked) return cssColor("--difficulty-facil", "#2a7345");
      if (!current || !reading) return undefined;
      const status = checkChord(current, fingerReadings(finger, reading))[finger - 1].status;
      if (status === "ok") return cssColor("--difficulty-facil", "#2a7345");
      if (status === "unused") return undefined;
      return cssColor("--difficulty-dificil", "#a83f2e");
    },
  });
  const { stop } = cam;
  // Server snapshot "true": the static page renders the full check, and a
  // phone swaps it for the notice on hydration (the dialog is closed then).
  const hasFinePointer = useSyncExternalStore(
    subscribePointer,
    () => window.matchMedia(FINE_POINTER).matches,
    () => true,
  );

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      stop();
    };
    // stop is a fresh closure each render; the dialog only cares about `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const checks = chord ? checkChord(chord, cam.stableReadings) : [];
  // A wrong finger sitting on a spot the chord does use (the ring finger on
  // the middle finger's spot) gets no mark there: a grey dot over the
  // diagram's own dot broke the shape and made it hard to read (real-camera
  // test, 2026-11-09). The diagram keeps its dot, without the "right" ring,
  // and the finger list says which finger is where. Grey only off the chord.
  const chordSpots = new Set(
    (chord?.frets ?? []).flatMap((fret, string) => (fret > 0 ? [`${string}:${fret}`] : [])),
  );
  const marks: FingerMark[] = checks.flatMap((c) => {
    if (!c.detected || c.status === "unused") return [];
    const match = c.status === "ok";
    if (!match && chordSpots.has(`${c.detected.string}:${c.detected.fret}`)) return [];
    return [{ string: c.detected.string, fret: c.detected.fret, finger: c.finger, match }];
  });
  const everyFingerInPlace = cam.calibrated && allInPlace(checks);
  const position = (r: NonNullable<FingerReading>) => t("camera.position", { string: String(6 - r.string), fret: String(r.fret) });
  const expectedText = (e: Expected) =>
    e.barre && e.span
      ? t("camera.barre", { fret: String(e.fret), from: String(6 - e.span[0]), to: String(6 - e.span[1]) })
      : t("camera.position", { string: String(6 - e.strings[0]), fret: String(e.fret) });
  const calStepText = (step: number, fret: CalibrationFret) =>
    t("camera.calStep", {
      n: String(step + 1),
      where:
        step === 0
          ? t("camera.calNutFirst")
          : step === 1
            ? t("camera.calNutSecond")
            : step === 2
              ? t("camera.calFretFirst", { fret: String(fret), dots: t(fret === 12 ? "camera.dotTwo" : "camera.dotOne") })
              : t("camera.calFretSecond"),
    });
  const running = cam.status === "running";
  const mirror = cam.mirrored ? "scale-x-[-1]" : "";

  return (
    <dialog
      ref={dialogRef}
      className="tuner-dialog m-auto w-full max-w-5xl rounded-lg border border-line bg-background p-4 text-foreground shadow-xl sm:p-6"
      aria-labelledby="camera-check-title"
      onClose={onClose}
      onClick={(e) => {
        // Backdrop click closes, like the tuner — but not mid-calibration,
        // where a click that misses the video would throw the clicks away.
        if (e.target === dialogRef.current && !cam.calibrating) dialogRef.current?.close();
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="camera-check-title" className="text-lg font-medium">
          {t("camera.title")}
        </h2>
        <button
          onClick={() => dialogRef.current?.close()}
          aria-label={t("camera.close")}
          className="rounded-full border border-line p-1.5 transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {!hasFinePointer && (
        <div className="mt-6 flex flex-col items-center gap-3 px-2 pb-4 text-center">
          <Laptop size={32} className="text-muted" aria-hidden />
          <p className="max-w-md font-medium">{t("camera.desktopOnly")}</p>
          <p className="max-w-md text-sm text-muted">{t("camera.desktopOnlyWhy")}</p>
        </div>
      )}
      {/* Hidden, not unmounted, on phones: nothing in it runs until "Activar
          cámara" is pressed, and the notice above takes its place. */}
      <div className={`mt-4 grid gap-4 md:grid-cols-[1fr_15rem] ${hasFinePointer ? "" : "hidden"}`}>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {running || cam.status === "loading" ? (
              <button
                onClick={stop}
                className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
              >
                <CameraOff size={16} aria-hidden /> {t("camera.stop")}
              </button>
            ) : (
              <button
                onClick={cam.start}
                className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
              >
                <Camera size={16} aria-hidden /> {t("camera.start")}
              </button>
            )}
            {running && (
              <button
                onClick={cam.startCalibration}
                className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
              >
                {cam.calibrated ? <RotateCcw size={16} aria-hidden /> : <Crosshair size={16} aria-hidden />}
                {t(cam.calibrated ? "camera.recalibrate" : "camera.calibrate")}
              </button>
            )}
            {running && cam.calibrated && (
              <button
                onClick={cam.measureFrets}
                disabled={cam.fretState.state === "waiting"}
                className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out disabled:opacity-50"
              >
                <Ruler size={16} aria-hidden /> {t("camera.measureFrets")}
              </button>
            )}
            {running && (
              <label className="flex items-center gap-2">
                {t("camera.calibrationFret")}
                <select
                  value={cam.calFret}
                  onChange={(e) => cam.setCalFret(Number(e.target.value) as CalibrationFret)}
                  className="tuner-select rounded-md border border-line bg-background px-2 py-1 text-foreground"
                >
                  {CALIBRATION_FRETS.map((f) => (
                    <option key={f} value={f}>
                      {f === 12 ? t("camera.recommended", { fret: String(f) }) : f}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {running && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={cam.mirrored}
                  onChange={(e) => cam.setMirrored(e.target.checked)}
                  className="accent-accent"
                />
                {t("camera.mirror")}
              </label>
            )}
            {cam.status === "loading" && (
              <span className="inline-flex items-center gap-2 text-muted" role="status">
                <Loader2 size={14} className="animate-spin text-accent" aria-hidden />
                {cam.progress < 1 ? t("camera.loading", { percent: String(Math.round(cam.progress * 100)) }) : t("camera.starting")}
              </span>
            )}
          </div>

          {(cam.status === "denied" || cam.status === "unavailable" || cam.status === "error") && (
            <p className="text-sm text-difficulty-dificil" role="status">
              {t(cam.status === "denied" ? "camera.denied" : cam.status === "unavailable" ? "camera.unavailable" : "camera.error")}
            </p>
          )}
          {cam.calibrating && (
            <div className="flex flex-wrap items-center gap-3 rounded border border-accent px-3 py-2 text-sm">
              <CalibrationGuide
                step={cam.clicks.length}
                fret={cam.calFret}
                nutLabel={t("camera.guideNut")}
                fretLabel={t("camera.guideFret", { fret: String(cam.calFret) })}
              />
              <p className="min-w-48 flex-1" role="status">
                {calStepText(cam.clicks.length, cam.calFret)}
              </p>
            </div>
          )}
          {cam.calError && <p className="text-sm text-difficulty-dificil">{t(`camera.calError.${cam.calError}` as TKey)}</p>}
          {cam.calibrated && cam.fretState.state !== "none" && (
            <p className="text-sm text-muted" role="status">
              {cam.fretState.state === "waiting"
                ? t("camera.fretsWaiting")
                : cam.fretState.state === "measured"
                  ? t("camera.fretsMeasured", { found: String(cam.fretState.found), total: String(cam.fretState.total) })
                  : t("camera.fretsModel")}
            </p>
          )}
          {cam.calibrated && cam.neckState.state === "lost" && (
            <p className="text-sm text-difficulty-dificil" role="status">
              {t("camera.lost")}
            </p>
          )}

          <div
            className={`relative w-full overflow-hidden rounded-lg border border-line bg-black ${cam.calibrating ? "cursor-crosshair" : ""}`}
            onClick={cam.handleVideoClick}
          >
            {/* Hidden until the stream starts: an empty <video> still takes
                its default size, which pushed the placeholder text off-centre. */}
            {/* suppressHydrationWarning: some browser extensions (video
                downloaders and the like) stamp crossorigin="anonymous" on every
                <video> before React hydrates, which React reports as a
                server/client mismatch. Nothing on this element is rendered
                differently on the server; this only silences that one case. */}
            <video
              ref={videoRef}
              playsInline
              muted
              suppressHydrationWarning
              className={`block w-full ${mirror} ${running ? "" : "hidden"}`}
            />
            <canvas ref={canvasRef} className={`pointer-events-none absolute inset-0 h-full w-full ${mirror}`} />
            {!running && (
              <div className="flex aspect-video flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/80">
                <Camera size={28} aria-hidden />
                <p>{t("camera.intro")}</p>
                <p className="text-xs text-white/60">{t("camera.privacy")}</p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted">{t("camera.placement")}</p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="camera-progression" className="text-xs text-muted">
              {t("camera.progressionLabel")}
            </label>
            <ChordProgressionInput
              id="camera-progression"
              value={progression}
              onChange={onProgressionChange}
              chordLimit={chordLimit}
            />
          </div>
          {chords.length > 1 && (
            <div className="flex flex-wrap gap-1" role="group" aria-label={t("camera.chordLabel")}>
              {chords.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setChordName(c.name)}
                  aria-pressed={c.name === chord?.name}
                  className={`rounded border px-2 py-0.5 text-sm transition active:scale-[0.97] duration-[160ms] ease-out ${c.name === chord?.name ? "border-accent text-accent" : "border-line hover-fine:border-accent"}`}
                >
                  {formatChord(c.name, notation)}
                </button>
              ))}
            </div>
          )}
          {chord && (
            <div className="flex justify-center">
              <ChordDiagram chord={chord} marks={marks} size={150} />
            </div>
          )}
          {!cam.calibrated ? (
            <p className="text-sm text-muted">{t("camera.calibrateFirst")}</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1 text-sm">
                {checks.map((c) => (
                  <li key={c.finger} className={c.status === "unused" ? "text-muted" : ""}>
                    {cam.locked[c.finger - 1] && (
                      <Lock size={12} className="mr-1 inline align-[-1px] text-difficulty-facil" aria-label={t("camera.locked")} />
                    )}
                    <span className="font-medium">
                      {c.finger} {t(FINGER_KEYS[c.finger - 1])}:
                    </span>{" "}
                    {c.status === "unused"
                      ? t("camera.fingerUnused")
                      : c.status === "notSeen"
                        ? t("camera.fingerNotSeen", { expected: expectedText(c.expected!) })
                        : c.status === "ok"
                          ? t("camera.fingerOk", { position: position(c.detected!) })
                          : t("camera.fingerOff", { position: position(c.detected!), expected: expectedText(c.expected!) })}
                  </li>
                ))}
              </ul>
              <p className="flex min-h-5 items-center gap-1.5 text-sm text-difficulty-facil" role="status" aria-live="polite">
                {everyFingerInPlace && (
                  <>
                    <Check size={16} aria-hidden />
                    {t("camera.allInPlace")}
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

/** Readings with only one finger filled in, for coloring that finger's dot. */
function fingerReadings(finger: number, reading: FingerReading): FingerReading[] {
  return [1, 2, 3, 4].map((f) => (f === finger ? reading : null));
}
