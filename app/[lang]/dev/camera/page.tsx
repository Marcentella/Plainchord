"use client";

// Measuring page for the camera fingering check — never linked from the real
// UI, same convention as /dev/synth and /dev/chords: hardcoded Spanish on
// purpose, this isn't interface copy. The pipeline itself is
// lib/useFingerCamera.ts, shared with the real check in /acordes
// (components/CameraCheckModal.tsx); this page adds what's only for
// measuring: fps/inference/neck stats, the press-point slider, raw readings
// with their "c5 t3" captions, and the camera's own exposure controls.
// Nothing is recorded, uploaded or saved.

import { Camera, CameraOff, Crosshair, Loader2, RotateCcw } from "lucide-react";
import CalibrationGuide from "@/components/CalibrationGuide";
import { CALIBRATION_FRETS, type CalibrationError, type CalibrationFret } from "@/lib/fretMapping";
import type { CameraControlName } from "@/lib/handTracking";
import { useFingerCamera } from "@/lib/useFingerCamera";

const FINGER_NAMES = ["Índice", "Medio", "Anular", "Meñique"];

/** Where the second pair of clicks goes, as a player would recognise it. */
const FRET_CUE: Record<CalibrationFret, string> = {
  5: "el alambre del traste 5: justo después del punto (hacia el cuerpo)",
  7: "el alambre del traste 7: justo después del punto (hacia el cuerpo)",
  12: "el alambre del traste 12: justo después de los dos puntos (hacia el cuerpo)",
};
const calibrationStep = (i: number, fret: CalibrationFret) =>
  i < 2
    ? `la cejuela (la pieza donde las cuerdas salen del clavijero), justo donde la cruza ${i === 0 ? "una de las cuerdas de los bordes (6ª o 1ª)" : "la otra cuerda del borde"}`
    : `${FRET_CUE[fret]}, justo donde lo cruza ${i === 2 ? "una de las cuerdas de los bordes" : "la otra cuerda del borde"}`;

const CALIBRATION_ERRORS: Record<CalibrationError, string> = {
  degenerate: "Hay puntos repetidos o en línea recta. Vuelve a calibrar.",
  shape: "Esos cuatro puntos no forman un mástil (la forma queda torcida o cruzada). Vuelve a calibrar.",
  proportion:
    "Las proporciones no calzan con un mástil: revisa que los dos primeros clics sean la cejuela y los dos últimos el traste elegido.",
};

const CONTROL_LABELS: Record<CameraControlName, string> = {
  exposureTime: "Tiempo de exposición",
  exposureCompensation: "Compensación de exposición",
  brightness: "Brillo",
  contrast: "Contraste",
};

export default function DevCamera() {
  // The element refs pulled out first: React's lint treats an object holding
  // refs as a ref, and would flag every other field read during render.
  const { videoRef, canvasRef, ...cam } = useFingerCamera({ caption: (r) => (r ? `c${6 - r.string} t${r.fret}` : undefined) });
  const mirror = cam.mirrored ? "scale-x-[-1]" : "";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Cámara: digitación (medición)</h1>
        <p className="text-sm text-muted">
          Calibra el mástil y cada dedo se lee como cuerda y traste. Los números 1-4 son los dedos (índice a meñique), la
          misma numeración que los diagramas. Nada se graba ni se envía.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {cam.status === "running" || cam.status === "loading" ? (
          <button
            onClick={cam.stop}
            className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 transition hover-fine:border-accent"
          >
            <CameraOff size={16} aria-hidden /> Cerrar cámara
          </button>
        ) : (
          <button
            onClick={cam.start}
            className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 transition hover-fine:border-accent"
          >
            <Camera size={16} aria-hidden /> Abrir cámara
          </button>
        )}
        {cam.status === "running" && (
          <button
            onClick={cam.startCalibration}
            className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 transition hover-fine:border-accent"
          >
            {cam.calibrated ? <RotateCcw size={16} aria-hidden /> : <Crosshair size={16} aria-hidden />}
            {cam.calibrated ? "Recalibrar" : "Calibrar mástil"}
          </button>
        )}
        {cam.status === "running" && cam.calibrated && (
          <button
            onClick={cam.measureFrets}
            className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 transition hover-fine:border-accent"
          >
            Medir trastes
          </button>
        )}
        {cam.status === "running" && (
          <label className="flex items-center gap-2">
            Traste de calibración
            <select
              value={cam.calFret}
              onChange={(e) => cam.setCalFret(Number(e.target.value) as CalibrationFret)}
              className="rounded-md border border-line bg-background px-2 py-1"
            >
              {CALIBRATION_FRETS.map((f) => (
                <option key={f} value={f}>
                  {f}
                  {f === 12 ? " (recomendado)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={cam.follow} onChange={(e) => cam.setFollow(e.target.checked)} className="accent-accent" />
          Seguir el mástil
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={cam.mirrored} onChange={(e) => cam.setMirrored(e.target.checked)} className="accent-accent" />
          Espejo (solo la vista)
        </label>
        {cam.status === "loading" && (
          <span className="inline-flex items-center gap-2 text-muted" role="status">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            {cam.progress < 1 ? `Descargando modelo… ${Math.round(cam.progress * 100)}%` : "Iniciando…"}
          </span>
        )}
        {cam.status === "denied" && <span className="text-difficulty-dificil">Permiso de cámara denegado.</span>}
        {cam.status === "unavailable" && <span className="text-difficulty-dificil">No se encontró ninguna cámara.</span>}
        {cam.status === "error" && <span className="text-difficulty-dificil">Error: {cam.error}</span>}
      </div>

      {cam.calibrating && (
        <div className="flex flex-wrap items-center gap-4 rounded border border-accent px-3 py-2 text-sm">
          <CalibrationGuide step={cam.clicks.length} fret={cam.calFret} nutLabel="cejuela" fretLabel={`traste ${cam.calFret}`} />
          <p className="min-w-60 flex-1" role="status">
            Punto {cam.clicks.length + 1} de 4: haz clic en {calibrationStep(cam.clicks.length, cam.calFret)}.
          </p>
        </div>
      )}
      {cam.calError && <p className="text-sm text-difficulty-dificil">{CALIBRATION_ERRORS[cam.calError]}</p>}
      {cam.calibrated && cam.fretState.state !== "none" && (
        <p className="text-sm text-muted" role="status">
          {cam.fretState.state === "waiting"
            ? "Retira la mano del mástil un momento para medir los trastes…"
            : cam.fretState.state === "measured"
              ? `Trastes medidos: ${cam.fretState.found} de ${cam.fretState.total} (el resto, interpolado)`
              : "No se pudieron medir los trastes: se usan los calculados."}
        </p>
      )}
      {cam.calibrated && cam.follow && cam.neckState.state === "lost" && (
        <p className="text-sm text-difficulty-dificil" role="status">
          Se perdió el mástil: vuelve a ponerlo donde estaba, o recalibra.
        </p>
      )}

      <div
        className={`relative w-full overflow-hidden rounded-lg border border-line bg-black ${cam.calibrating ? "cursor-crosshair" : ""}`}
        onClick={cam.handleVideoClick}
      >
        <video ref={videoRef} playsInline muted className={`block w-full ${mirror}`} />
        <canvas ref={canvasRef} className={`pointer-events-none absolute inset-0 h-full w-full ${mirror}`} />
        {cam.status !== "running" && <div className="aspect-video" />}
      </div>

      {cam.calibrated && (
        <label className="flex flex-wrap items-center gap-3 text-sm">
          <span>Punto de presión</span>
          <input
            type="range"
            min={-0.4}
            max={0.6}
            step={0.05}
            value={cam.pullback}
            onChange={(e) => cam.setPullback(Number(e.target.value))}
            className="w-48 accent-accent"
          />
          <span className="tabular-nums text-muted">
            {cam.pullback.toFixed(2)} ({cam.pullback === 0 ? "la punta" : cam.pullback > 0 ? "hacia el nudillo" : "más allá de la punta"})
          </span>
        </label>
      )}
      {cam.calibrated && (
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4 tabular-nums">
          {cam.readings.map((r, i) => (
            <li key={FINGER_NAMES[i]}>
              <span className="text-muted">
                {i + 1} {FINGER_NAMES[i]}:
              </span>{" "}
              {r ? `cuerda ${6 - r.string}, traste ${r.fret}` : "—"}
            </li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-6 tabular-nums">
        <div>
          <dt className="text-muted">FPS</dt>
          <dd>{cam.stats ? cam.stats.fps.toFixed(0) : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">Inferencia</dt>
          <dd>{cam.stats ? `${cam.stats.inferenceMs.toFixed(1)} ms` : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">Aceleración</dt>
          <dd>{cam.delegate}</dd>
        </div>
        <div>
          <dt className="text-muted">Manos</dt>
          <dd>{cam.stats ? cam.stats.hands : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">Mástil</dt>
          <dd>
            {cam.neckState.state === "off"
              ? "—"
              : `${cam.neckState.state === "following" ? "siguiendo" : "perdido"} · ${cam.neckState.points} pts · ${cam.neckState.ms.toFixed(0)} ms`}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Resolución</dt>
          <dd>{cam.stats ? `${cam.stats.width}×${cam.stats.height}` : "—"}</dd>
        </div>
      </dl>

      {cam.controls && (
        <section className="flex flex-col gap-2 rounded-lg border border-line p-4 text-sm">
          <h2 className="font-medium">Ajustes de la cámara</h2>
          <p className="text-xs text-muted">
            Cambian la imagen que recibe el modelo (no solo la vista). Con poca luz, la exposición automática aclara todo
            y quema las manos: prueba la exposición manual con la lámpara apuntando al mástil.
          </p>
          {cam.controls.manualExposure !== null && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={cam.controls.manualExposure}
                onChange={(e) => cam.changeControl({ exposureMode: e.target.checked ? "manual" : "continuous" })}
                className="accent-accent"
              />
              Exposición manual
            </label>
          )}
          {cam.controls.controls.map((c) => (
            <label key={c.name} className="grid grid-cols-[12rem_1fr_4rem] items-center gap-3">
              <span>{CONTROL_LABELS[c.name]}</span>
              <input
                type="range"
                min={c.min}
                max={c.max}
                step={c.step}
                value={c.value}
                disabled={c.name === "exposureTime" && cam.controls!.manualExposure === false}
                onChange={(e) => cam.changeControl({ [c.name]: Number(e.target.value) })}
                className="accent-accent"
              />
              <span className="tabular-nums text-muted">{Math.round(c.value * 100) / 100}</span>
            </label>
          ))}
          {cam.controls.manualExposure === null && cam.controls.controls.length === 0 && (
            <p className="text-muted">Esta cámara no ofrece ajustes al navegador.</p>
          )}
        </section>
      )}

      <p className="text-xs text-muted">
        Para calibrar: la cámara de frente al diapasón, el mástil quieto. La cuadrícula amarilla tiene que caer sobre las
        cuerdas y trastes reales; los puntos verdes son lo que se sigue cuando el mástil se mueve.
      </p>
    </div>
  );
}
