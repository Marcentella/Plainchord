"use client";

// Prototype page for the camera fingering check (plan: Step 1) — never linked
// from the real UI, same convention as /dev/synth and /dev/chords: hardcoded
// Spanish on purpose, this isn't interface copy. Purpose: see what the hand
// model sees on a real guitar, and measure it (fps, inference time, GPU or
// CPU) on whatever camera and laptop end up at the demo. Nothing is
// recorded, uploaded or saved.

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { createHandTracker, openCamera, startFrameLoop, type HandFrame, type HandTracker } from "@/lib/handTracking";
import { micErrorFor } from "@/lib/micInput";

type Status = "idle" | "loading" | "running" | "denied" | "unavailable" | "error";
type Stats = { fps: number; inferenceMs: number; hands: number; width: number; height: number };

/** MediaPipe's fingertip landmarks for index..pinky — fingers 1-4, the same numbering data/chords.json uses. */
const FINGERTIPS = [8, 12, 16, 20];
const STATS_EVERY_MS = 250;

function cssColor(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function drawHands(canvas: HTMLCanvasElement, frame: HandFrame, connections: [number, number][]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  const accent = cssColor("--accent", "#b8492a");
  const scale = Math.max(1, w / 640); // lines stay visible on a 1280-wide frame
  for (const hand of frame.hands) {
    const p = hand.landmarks;
    // Dark halo under a bright line: plain white vanished on pale,
    // well-lit skin (first real-camera test), plain dark would on dark skin
    // or a dark room. The pair stays readable on both.
    const bones = new Path2D();
    for (const [a, b] of connections) {
      bones.moveTo(p[a].x * w, p[a].y * h);
      bones.lineTo(p[b].x * w, p[b].y * h);
    }
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.lineWidth = 6 * scale;
    ctx.stroke(bones);
    ctx.strokeStyle = "#7dd3fc";
    ctx.lineWidth = 2.5 * scale;
    ctx.stroke(bones);
    for (const point of p) {
      ctx.beginPath();
      ctx.arc(point.x * w, point.y * h, 3.5 * scale, 0, Math.PI * 2);
      ctx.fillStyle = "#7dd3fc";
      ctx.fill();
      ctx.lineWidth = 1.5 * scale;
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.stroke();
    }
    FINGERTIPS.forEach((tip, i) => {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(p[tip].x * w, p[tip].y * h, 9 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2 * scale;
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.stroke();
      ctx.fillStyle = "white";
      ctx.font = `bold ${11 * scale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // The canvas is mirrored with the video by CSS; un-mirror the text
      // itself so the finger numbers stay readable.
      ctx.save();
      ctx.translate(p[tip].x * w, p[tip].y * h);
      if (canvas.dataset.mirrored === "true") ctx.scale(-1, 1);
      ctx.fillText(String(i + 1), 0, 0);
      ctx.restore();
    });
  }
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

  const trackerRef = useRef<HandTracker | null>(null);
  const stopRef = useRef<() => void>(() => {});
  // Same stale-request guard as TunerModal: a camera prompt or model load
  // that resolves after "Cerrar" must tear down, not start unseen.
  const tokenRef = useRef(0);

  function stop() {
    tokenRef.current++;
    stopRef.current();
    stopRef.current = () => {};
    setStats(null);
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
      setDelegate(tracker.delegate);
      setStatus("running");

      const canvas = canvasRef.current!;
      let frames = 0;
      let inferenceTotal = 0;
      let lastHands = 0;
      let windowStart = performance.now();
      const stopLoop = startFrameLoop(video, (now) => {
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        const frame = tracker.detect(video, now);
        drawHands(canvas, frame, tracker.connections);
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

  const mirror = mirrored ? "scale-x-[-1]" : "";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Cámara: seguimiento de la mano (prototipo)</h1>
        <p className="text-sm text-muted">
          Paso 1: cámara + esqueleto de la mano. Los números 1-4 son los dedos (índice a meñique), la misma
          numeración que los diagramas de acordes. Nada se graba ni se envía: el video va directo del navegador
          al modelo.
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

      <div className="relative w-full overflow-hidden rounded-lg border border-line bg-black">
        <video ref={videoRef} playsInline muted className={`block w-full ${mirror}`} />
        <canvas
          ref={canvasRef}
          data-mirrored={mirrored}
          className={`pointer-events-none absolute inset-0 h-full w-full ${mirror}`}
        />
        {status !== "running" && <div className="aspect-video" />}
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5 tabular-nums">
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
          <dt className="text-muted">Resolución</dt>
          <dd>{stats ? `${stats.width}×${stats.height}` : "—"}</dd>
        </div>
      </dl>

      <p className="text-xs text-muted">
        Para el paso 2: la cámara de frente al diapasón, el mástil horizontal y bien iluminado; la mano que pisa
        las cuerdas completa en el cuadro.
      </p>
    </div>
  );
}
