"use client";

// Prototype page for the camera fingering check (plan: Steps 1-2) — never
// linked from the real UI, same convention as /dev/synth and /dev/chords:
// hardcoded Spanish on purpose, this isn't interface copy. Purpose: see what
// the hand model sees on a real guitar, calibrate the neck, read each finger
// as a string and fret, and measure it (fps, inference time, GPU or CPU) on
// whatever camera and laptop end up at the demo. Nothing is recorded,
// uploaded or saved.

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Crosshair, Loader2, RotateCcw } from "lucide-react";
import {
  cameraControls,
  createHandTracker,
  openCamera,
  setCameraControl,
  startFrameLoop,
  type CameraControlName,
  type CameraControls,
  type HandTracker,
  type Point,
  type TrackedHand,
} from "@/lib/handTracking";
import {
  CALIBRATION_FRETS,
  LAST_READ_FRET,
  calibrate,
  fretAt,
  imageAt,
  isCalibration,
  neckUV,
  onNeck,
  pressPoint,
  stringAt,
  wireU,
  type Calibration,
  type CalibrationError,
  type CalibrationFret,
  type Vec2,
} from "@/lib/fretMapping";
import { OneEuroFilter } from "@/lib/oneEuroFilter";
import { NeckTracker, type Gray } from "@/lib/neckTracking";
import { micErrorFor } from "@/lib/micInput";

type Status = "idle" | "loading" | "running" | "denied" | "unavailable" | "error";
type Stats = { fps: number; inferenceMs: number; hands: number; width: number; height: number };
type NeckState = { state: "off" | "following" | "lost"; points: number; ms: number };
type Reading = { string: number; fret: number } | null;

/** MediaPipe landmarks for index..pinky — fingers 1-4, the same numbering data/chords.json uses. */
const FINGERTIPS = [8, 12, 16, 20];
const FINGER_DIPS = [7, 11, 15, 19];
const FINGER_NAMES = ["Índice", "Medio", "Anular", "Meñique"];
const STATS_EVERY_MS = 250;
/** Fretting hand gone this long: forget its filtered positions instead of gliding from stale ones. */
const LOST_HAND_MS = 300;
/** MediaPipe's thumb chain (1-4). It's behind the neck while fretting, so the
 *  model guesses it and it jumps around; it's never read, so it isn't drawn. */
const THUMB = new Set([1, 2, 3, 4]);

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

/**
 * Neck following runs on a downscaled grayscale copy of the frame: optical
 * flow needs texture, not resolution, and at 480 px wide a frame costs
 * ~14 ms (tests: under 0.4 px of corner error with a hand over the neck).
 */
const TRACK_WIDTH = 480;

const HALO = "rgba(0,0,0,0.75)";
const BONE = "#7dd3fc";
const GRID = "#facc15";

function cssColor(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** A line with a dark halo under it: stays visible on pale skin, a white guitar, or a dark room. */
function haloLine(ctx: CanvasRenderingContext2D, path: Path2D, color: string, width: number) {
  ctx.lineCap = "round";
  ctx.strokeStyle = HALO;
  ctx.lineWidth = width + 3;
  ctx.stroke(path);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(path);
}

/** Text that stays readable when the canvas is mirrored by CSS. */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, mirrored: boolean, size: number) {
  ctx.save();
  ctx.translate(x, y);
  if (mirrored) ctx.scale(-1, 1);
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = size / 3;
  ctx.strokeStyle = HALO;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = "white";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawSkeleton(ctx: CanvasRenderingContext2D, hand: TrackedHand, connections: [number, number][], w: number, h: number, scale: number, faded: boolean) {
  const p = hand.landmarks;
  const bones = new Path2D();
  for (const [a, b] of connections) {
    if (THUMB.has(a) || THUMB.has(b)) continue;
    bones.moveTo(p[a].x * w, p[a].y * h);
    bones.lineTo(p[b].x * w, p[b].y * h);
  }
  ctx.globalAlpha = faded ? 0.35 : 1;
  haloLine(ctx, bones, BONE, 2.5 * scale);
  ctx.globalAlpha = 1;
}

function drawGrid(ctx: CanvasRenderingContext2D, cal: Calibration, w: number, h: number, scale: number) {
  const toPx = (u: number, v: number) => {
    const q = imageAt(cal, u, v);
    return [q.x * w, q.y * h] as const;
  };
  const strings = new Path2D();
  for (let s = 0; s < 6; s++) {
    strings.moveTo(...toPx(0, s / 5));
    strings.lineTo(...toPx(wireU(LAST_READ_FRET), s / 5));
  }
  const wires = new Path2D();
  const nut = new Path2D();
  for (let n = 0; n <= LAST_READ_FRET; n++) {
    // The nut and the calibrated wire drawn heavier: they're the ones the
    // user clicked, so a misplaced one stands out.
    const path = n === 0 || n === cal.fret ? nut : wires;
    path.moveTo(...toPx(wireU(n), -0.12));
    path.lineTo(...toPx(wireU(n), 1.12));
  }
  ctx.globalAlpha = 0.8;
  haloLine(ctx, strings, GRID, 1 * scale);
  haloLine(ctx, wires, GRID, 1.5 * scale);
  haloLine(ctx, nut, GRID, 3 * scale);
  ctx.globalAlpha = 1;
}

/** Fingertip press points of a hand in the neck plane, and how many sit on the neck. */
function neckPoints(hand: TrackedHand, cal: Calibration): { points: Vec2[]; onNeckCount: number } {
  const points = FINGERTIPS.map((tip, i) => neckUV(cal, pressPoint(hand.landmarks[tip], hand.landmarks[FINGER_DIPS[i]])));
  return { points, onNeckCount: points.filter(onNeck).length };
}

export default function DevCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [mirrored, setMirrored] = useState(true);
  const [delegate, setDelegate] = useState<string>("—");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [clicks, setClicks] = useState<Vec2[]>([]);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrated, setCalibrated] = useState(false);
  const [calFret, setCalFret] = useState<CalibrationFret>(12);
  const [calError, setCalError] = useState("");
  const [readings, setReadings] = useState<Reading[]>([null, null, null, null]);
  const [controls, setControls] = useState<CameraControls | null>(null);
  const [follow, setFollow] = useState(true);
  const [neckState, setNeckState] = useState<NeckState>({ state: "off", points: 0, ms: 0 });

  const trackerRef = useRef<HandTracker | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const stopRef = useRef<() => void>(() => {});
  // Read every frame by the loop, which is created once per camera start.
  const calRef = useRef<Calibration | null>(null);
  const clicksRef = useRef<Vec2[]>([]);
  const mirroredRef = useRef(true);
  const followRef = useRef(true);
  const neckRef = useRef<NeckTracker | null>(null);
  // Set when a calibration lands: the loop starts the tracker on the next
  // frame, the first one it has a grayscale copy of.
  const startNeckRef = useRef(false);
  // Same stale-request guard as TunerModal: a camera prompt or model load
  // that resolves after "Cerrar" must tear down, not start unseen.
  const tokenRef = useRef(0);

  useEffect(() => {
    mirroredRef.current = mirrored;
  }, [mirrored]);

  useEffect(() => {
    followRef.current = follow;
    // Turning it back on restarts from wherever the calibration is now.
    neckRef.current = null;
    startNeckRef.current = follow && calRef.current !== null;
  }, [follow]);

  function stop() {
    tokenRef.current++;
    stopRef.current();
    stopRef.current = () => {};
    trackRef.current = null;
    setStats(null);
    setControls(null);
  }

  // Leaving the page: camera off and the model's WASM/GPU memory freed.
  useEffect(
    () => () => {
      stop();
      trackerRef.current?.close();
      trackerRef.current = null;
    },
    [],
  );

  async function start() {
    const token = ++tokenRef.current;
    setStatus("loading");
    setProgress(0);
    setError("");
    const cleanups: (() => void)[] = [];
    stopRef.current = () => cleanups.forEach((fn) => fn());
    try {
      // Camera and model in parallel: the permission prompt and the ~22 MB
      // first download overlap instead of adding up.
      const [camera, tracker] = await Promise.all([
        openCamera().then((c) => {
          cleanups.push(c.stop);
          return c;
        }),
        trackerRef.current ? Promise.resolve(trackerRef.current) : createHandTracker(setProgress),
      ]);
      trackerRef.current = tracker; // kept across close/open: reloading the model is the slow part
      if (token !== tokenRef.current) return;

      const video = videoRef.current!;
      video.srcObject = camera.stream;
      await video.play();
      if (token !== tokenRef.current) return;
      trackRef.current = camera.track;
      setControls(cameraControls(camera.track));
      setDelegate(tracker.delegate);
      setStatus("running");

      const canvas = canvasRef.current!;
      // Offscreen copy of the frame for neck following, read back every frame.
      const grabber = document.createElement("canvas");
      const grabCtx = grabber.getContext("2d", { willReadFrequently: true })!;
      const grab = (): Gray => {
        const tw = TRACK_WIDTH;
        const th = Math.round((TRACK_WIDTH * video.videoHeight) / video.videoWidth);
        if (grabber.width !== tw) grabber.width = tw;
        if (grabber.height !== th) grabber.height = th;
        grabCtx.drawImage(video, 0, 0, tw, th);
        const rgba = grabCtx.getImageData(0, 0, tw, th).data;
        const data = new Float32Array(tw * th);
        for (let i = 0, j = 0; i < data.length; i++, j += 4) data[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
        return { data, width: tw, height: th };
      };
      let neckMs = 0;
      let neckStatus: NeckState["state"] = "off";
      const filters = FINGERTIPS.map(() => ({ x: new OneEuroFilter(), y: new OneEuroFilter() }));
      const previous: Reading[] = [null, null, null, null];
      let lastSeen = 0;
      let frames = 0;
      let inferenceTotal = 0;
      let lastHands = 0;
      let windowStart = performance.now();

      const stopLoop = startFrameLoop(video, (now) => {
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        const { width: w, height: h } = canvas;
        const scale = Math.max(1, w / 640);
        const ctx = canvas.getContext("2d")!;
        const frame = tracker.detect(video, now);
        const mirror = mirroredRef.current;
        ctx.clearRect(0, 0, w, h);

        // Neck following: move the calibration with the guitar before
        // anything is read off it this frame.
        const current = calRef.current;
        if (followRef.current && current) {
          const started = performance.now();
          const gray = grab();
          const toPx = (p: Vec2) => ({ x: p.x * gray.width, y: p.y * gray.height });
          const handPx = frame.hands.flatMap((hand) => hand.landmarks.map(toPx));
          if (startNeckRef.current || !neckRef.current) {
            neckRef.current = new NeckTracker(gray, current.corners.map(toPx), handPx);
            startNeckRef.current = false;
            neckStatus = "following";
          } else {
            const result = neckRef.current.update(gray, handPx);
            if (result.corners) {
              const moved = calibrate(
                result.corners.map((p) => ({ x: p.x / gray.width, y: p.y / gray.height })),
                current.fret,
                true,
              );
              // A moved calibration that no longer looks like a neck is a bad
              // fit, not the guitar: keep the last good one.
              if (isCalibration(moved)) calRef.current = moved;
              neckStatus = "following";
            } else {
              neckStatus = "lost";
            }
          }
          neckMs = performance.now() - started;
          // The points being followed, faint: they show what the tracker is holding on to.
          ctx.fillStyle = neckStatus === "lost" ? "rgba(248,113,113,0.8)" : "rgba(74,222,128,0.8)";
          for (const p of neckRef.current?.points ?? []) {
            ctx.beginPath();
            ctx.arc((p.x / gray.width) * w, (p.y / gray.height) * h, 2.5 * scale, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          neckStatus = "off";
        }
        const cal = calRef.current;

        // The fretting hand is the one with most fingertips over the neck;
        // the picking hand gets detected too and must not be read.
        let fretting: TrackedHand | null = null;
        if (cal) {
          let best = 0;
          for (const hand of frame.hands) {
            const { onNeckCount } = neckPoints(hand, cal);
            if (onNeckCount > best) {
              best = onNeckCount;
              fretting = hand;
            }
          }
          drawGrid(ctx, cal, w, h, scale);
        }
        for (const hand of frame.hands) {
          drawSkeleton(ctx, hand, tracker.connections, w, h, scale, cal !== null && hand !== fretting);
        }

        if (cal && fretting) {
          lastSeen = now;
          const accent = cssColor("--accent", "#b8492a");
          FINGERTIPS.forEach((tip, i) => {
            const raw: Point = fretting!.landmarks[tip];
            const press = pressPoint(raw, fretting!.landmarks[FINGER_DIPS[i]]);
            // Filtered in pixels (the filter's tuning unit), read in the neck plane.
            const fx = filters[i].x.filter(press.x * w, now / 1000) / w;
            const fy = filters[i].y.filter(press.y * h, now / 1000) / h;
            const neck = neckUV(cal, { x: fx, y: fy });
            let reading: Reading = null;
            if (onNeck(neck)) {
              const s = stringAt(neck.y, previous[i]?.string ?? null);
              const f = fretAt(neck.x, previous[i]?.fret ?? null);
              if (s !== null && f !== null) reading = { string: s, fret: f };
            }
            previous[i] = reading;
            ctx.beginPath();
            ctx.arc(fx * w, fy * h, 8 * scale, 0, Math.PI * 2);
            ctx.fillStyle = accent;
            ctx.fill();
            ctx.lineWidth = 2 * scale;
            ctx.strokeStyle = HALO;
            ctx.stroke();
            label(ctx, String(i + 1), fx * w, fy * h, mirror, 11 * scale);
            if (reading) {
              label(ctx, `c${6 - reading.string} t${reading.fret}`, fx * w, fy * h - 20 * scale, mirror, 12 * scale);
            }
          });
        } else if (now - lastSeen > LOST_HAND_MS) {
          filters.forEach((f) => {
            f.x.reset();
            f.y.reset();
          });
          previous.fill(null);
        }

        // Calibration clicks so far, numbered in the order they were made.
        clicksRef.current.forEach((c, i) => {
          ctx.beginPath();
          ctx.arc(c.x * w, c.y * h, 6 * scale, 0, Math.PI * 2);
          ctx.fillStyle = GRID;
          ctx.fill();
          ctx.strokeStyle = HALO;
          ctx.lineWidth = 2 * scale;
          ctx.stroke();
          label(ctx, String(i + 1), c.x * w, c.y * h - 14 * scale, mirror, 11 * scale);
        });

        frames++;
        inferenceTotal += frame.inferenceMs;
        lastHands = frame.hands.length;
        if (now - windowStart >= STATS_EVERY_MS) {
          setStats({
            fps: (frames * 1000) / (now - windowStart),
            inferenceMs: inferenceTotal / frames,
            hands: lastHands,
            width: video.videoWidth,
            height: video.videoHeight,
          });
          setReadings([...previous]);
          setNeckState({ state: neckStatus, points: neckRef.current?.featureCount ?? 0, ms: neckMs });
          frames = 0;
          inferenceTotal = 0;
          windowStart = now;
        }
      });
      cleanups.push(stopLoop, () => {
        video.srcObject = null;
        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      });
    } catch (err) {
      if (token !== tokenRef.current) return;
      stop();
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "NotFoundError")) {
        setStatus(micErrorFor(err));
      } else {
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  function startCalibration() {
    calRef.current = null;
    neckRef.current = null;
    clicksRef.current = [];
    setClicks([]);
    setCalError("");
    setCalibrated(false);
    setCalibrating(true);
  }

  function handleVideoClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!calibrating) return;
    const rect = videoRef.current!.getBoundingClientRect();
    const shownX = (e.clientX - rect.left) / rect.width;
    // Clicks land on the mirrored picture; the math works on the camera's own frame.
    const point = { x: mirrored ? 1 - shownX : shownX, y: (e.clientY - rect.top) / rect.height };
    const next = [...clicksRef.current, point];
    clicksRef.current = next;
    setClicks(next);
    if (next.length < 4) return;
    setCalibrating(false);
    const result = calibrate(next, calFret);
    if (!isCalibration(result)) {
      setCalError(CALIBRATION_ERRORS[result]);
      clicksRef.current = [];
      setClicks([]);
      return;
    }
    calRef.current = result;
    startNeckRef.current = followRef.current;
    // The clicks have done their job; left on screen they'd sit where the
    // neck was while the grid follows where it is.
    clicksRef.current = [];
    setClicks([]);
    setCalibrated(true);
  }

  async function changeControl(values: Parameters<typeof setCameraControl>[1]) {
    const track = trackRef.current;
    if (!track) return;
    try {
      await setCameraControl(track, values);
    } catch {
      // The camera refused the value (some only accept it in manual mode): the
      // sliders below re-read what it actually kept.
    }
    setControls(cameraControls(track));
  }

  const mirror = mirrored ? "scale-x-[-1]" : "";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Cámara: digitación (prototipo)</h1>
        <p className="text-sm text-muted">
          Paso 2: calibra el mástil y cada dedo se lee como cuerda y traste. Los números 1-4 son los dedos (índice a
          meñique), la misma numeración que los diagramas. Nada se graba ni se envía.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {status === "running" || status === "loading" ? (
          <button
            onClick={() => {
              stop();
              setStatus("idle");
            }}
            className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 transition hover-fine:border-accent"
          >
            <CameraOff size={16} aria-hidden /> Cerrar cámara
          </button>
        ) : (
          <button
            onClick={start}
            className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 transition hover-fine:border-accent"
          >
            <Camera size={16} aria-hidden /> Abrir cámara
          </button>
        )}
        {status === "running" && (
          <button
            onClick={startCalibration}
            className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 transition hover-fine:border-accent"
          >
            {calibrated ? <RotateCcw size={16} aria-hidden /> : <Crosshair size={16} aria-hidden />}
            {calibrated ? "Recalibrar" : "Calibrar mástil"}
          </button>
        )}
        {status === "running" && (
          <label className="flex items-center gap-2">
            Traste de calibración
            <select
              value={calFret}
              onChange={(e) => setCalFret(Number(e.target.value) as CalibrationFret)}
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
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="accent-accent" />
          Seguir el mástil
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={mirrored} onChange={(e) => setMirrored(e.target.checked)} className="accent-accent" />
          Espejo (solo la vista)
        </label>
        {status === "loading" && (
          <span className="inline-flex items-center gap-2 text-muted" role="status">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            {progress < 1 ? `Descargando modelo… ${Math.round(progress * 100)}%` : "Iniciando…"}
          </span>
        )}
        {status === "denied" && <span className="text-difficulty-dificil">Permiso de cámara denegado.</span>}
        {status === "unavailable" && <span className="text-difficulty-dificil">No se encontró ninguna cámara.</span>}
        {status === "error" && <span className="text-difficulty-dificil">Error: {error}</span>}
      </div>

      {calibrating && (
        <div className="flex flex-wrap items-center gap-4 rounded border border-accent px-3 py-2 text-sm">
          <CalibrationGuide step={clicks.length} fret={calFret} />
          <p className="min-w-60 flex-1" role="status">
            Punto {clicks.length + 1} de 4: haz clic en {calibrationStep(clicks.length, calFret)}.
          </p>
        </div>
      )}
      {calError && <p className="text-sm text-difficulty-dificil">{calError}</p>}
      {calibrated && follow && neckState.state === "lost" && (
        <p className="text-sm text-difficulty-dificil" role="status">
          Perdí el mástil: vuelve a ponerlo donde estaba, o recalibra.
        </p>
      )}

      <div
        className={`relative w-full overflow-hidden rounded-lg border border-line bg-black ${calibrating ? "cursor-crosshair" : ""}`}
        onClick={handleVideoClick}
      >
        <video ref={videoRef} playsInline muted className={`block w-full ${mirror}`} />
        <canvas ref={canvasRef} className={`pointer-events-none absolute inset-0 h-full w-full ${mirror}`} />
        {status !== "running" && <div className="aspect-video" />}
      </div>

      {calibrated && (
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4 tabular-nums">
          {readings.map((r, i) => (
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
          <dd>{stats ? stats.fps.toFixed(0) : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">Inferencia</dt>
          <dd>{stats ? `${stats.inferenceMs.toFixed(1)} ms` : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">Aceleración</dt>
          <dd>{delegate}</dd>
        </div>
        <div>
          <dt className="text-muted">Manos</dt>
          <dd>{stats ? stats.hands : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">Mástil</dt>
          <dd>
            {neckState.state === "off"
              ? "—"
              : `${neckState.state === "following" ? "siguiendo" : "perdido"} · ${neckState.points} pts · ${neckState.ms.toFixed(0)} ms`}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Resolución</dt>
          <dd>{stats ? `${stats.width}×${stats.height}` : "—"}</dd>
        </div>
      </dl>

      {controls && (
        <section className="flex flex-col gap-2 rounded-lg border border-line p-4 text-sm">
          <h2 className="font-medium">Ajustes de la cámara</h2>
          <p className="text-xs text-muted">
            Cambian la imagen que recibe el modelo (no solo la vista). Con poca luz, la exposición automática aclara todo
            y quema las manos: prueba la exposición manual con la lámpara apuntando al mástil.
          </p>
          {controls.manualExposure !== null && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={controls.manualExposure}
                onChange={(e) => changeControl({ exposureMode: e.target.checked ? "manual" : "continuous" })}
                className="accent-accent"
              />
              Exposición manual
            </label>
          )}
          {controls.controls.map((c) => (
            <label key={c.name} className="grid grid-cols-[12rem_1fr_4rem] items-center gap-3">
              <span>{CONTROL_LABELS[c.name]}</span>
              <input
                type="range"
                min={c.min}
                max={c.max}
                step={c.step}
                value={c.value}
                disabled={c.name === "exposureTime" && controls.manualExposure === false}
                onChange={(e) => changeControl({ [c.name]: Number(e.target.value) })}
                className="accent-accent"
              />
              <span className="tabular-nums text-muted">{Math.round(c.value * 100) / 100}</span>
            </label>
          ))}
          {controls.manualExposure === null && controls.controls.length === 0 && (
            <p className="text-muted">Esta cámara no ofrece ajustes al navegador.</p>
          )}
        </section>
      )}

      <p className="text-xs text-muted">
        Para calibrar: la cámara de frente al diapasón, el mástil quieto. Si el mástil se mueve, recalibra: la cuadrícula
        amarilla tiene que caer sobre las cuerdas y trastes reales.
      </p>
    </div>
  );
}

/**
 * A schematic neck showing what to click next: the nut, or the chosen fret
 * wire right after its inlay dot(s). For someone who doesn't know the word
 * "cejuela" yet. Fixed orientation (headstock left): it's a legend, not a
 * copy of the camera view, and the click order doesn't depend on it.
 */
function CalibrationGuide({ step, fret }: { step: number; fret: CalibrationFret }) {
  const W = 300;
  const H = 70;
  const left = 34; // nut x
  const scale = 520; // px per scale length, so fret 13 still fits
  const top = 14;
  const bottom = H - 14;
  const x = (n: number) => left + wireU(n) * scale;
  const target = step < 2 ? 0 : fret;
  const accent = "var(--accent)";
  // The first click of a pair can be either end; on the second, the end
  // already clicked is shown dimmed.
  const secondOfPair = step % 2 === 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden className="shrink-0 text-foreground">
      <path d={`M ${left} ${top - 4} L 4 ${top + 4} L 4 ${bottom - 4} L ${left} ${bottom + 4} Z`} fill="currentColor" opacity={0.15} />
      <rect x={left} y={top} width={x(13) - left} height={bottom - top} fill="currentColor" opacity={0.08} />
      {[3, 5, 7, 9].map((n) => (
        <circle key={n} cx={(x(n - 1) + x(n)) / 2} cy={H / 2} r={3} fill="currentColor" opacity={0.4} />
      ))}
      {[H / 2 - 9, H / 2 + 9].map((cy) => (
        <circle key={cy} cx={(x(11) + x(12)) / 2} cy={cy} r={3} fill="currentColor" opacity={0.4} />
      ))}
      {Array.from({ length: 13 }, (_, n) => n + 1).map((n) => (
        <line key={n} x1={x(n)} x2={x(n)} y1={top} y2={bottom} stroke="currentColor" strokeWidth={1} opacity={0.5} />
      ))}
      {Array.from({ length: 6 }, (_, s) => top + ((bottom - top) * (s + 0.5)) / 6).map((y) => (
        <line key={y} x1={left} x2={x(13)} y1={y} y2={y} stroke="currentColor" strokeWidth={0.6} opacity={0.5} />
      ))}
      <line x1={left} x2={left} y1={top} y2={bottom} stroke="currentColor" strokeWidth={4} />
      <line x1={x(target)} x2={x(target)} y1={top - 4} y2={bottom + 4} stroke={accent} strokeWidth={target === 0 ? 5 : 3} />
      {[top, bottom].map((y, i) => (
        <circle
          key={y}
          cx={x(target)}
          cy={y}
          r={5}
          fill={secondOfPair && i === 0 ? "currentColor" : accent}
          opacity={secondOfPair && i === 0 ? 0.35 : 1}
        />
      ))}
      <text x={x(target)} y={H - 1} textAnchor="middle" fontSize={9} fill="currentColor">
        {target === 0 ? "cejuela" : `traste ${fret}`}
      </text>
    </svg>
  );
}
