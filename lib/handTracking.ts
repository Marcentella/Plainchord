/**
 * Camera + hand tracking for the fingering check (plan: Camera fingering
 * check, Step 1). Browser-only wrapper around MediaPipe's HandLandmarker;
 * the geometry that turns landmarks into strings and frets lives in pure,
 * tested modules next to this one.
 *
 * Everything is self-hosted under /public (runtime in /mediapipe/<version>,
 * model in /models) and loaded only when the camera is first opened, the
 * same way alphaTab and Pitchy stay out of the main bundle. Nothing leaves
 * the device: frames go from the <video> straight into the model.
 */
import type { HandLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";

// Must match the copy in public/mediapipe/ (node_modules/@mediapipe/tasks-vision/wasm,
// only the vision_wasm_internal.* pair: forVisionTasks() never loads the module_ one).
const WASM_PATH = "/mediapipe/1.2.2";
const MODEL_PATH = "/models/hand_landmarker-float16-v1.task";

export type Point = { x: number; y: number; z: number };
export type TrackedHand = {
  /** 21 points, normalized 0-1 to the video frame (unmirrored). MediaPipe's
   *  order: 0 wrist, 4 thumb tip, 8 index tip, 12 middle, 16 ring, 20 pinky. */
  landmarks: Point[];
  /** The subject's own hand ("Left"/"Right"), as MediaPipe guesses it. */
  handedness: string;
  score: number;
};
export type HandFrame = { hands: TrackedHand[]; inferenceMs: number };

export type HandTracker = {
  delegate: "GPU" | "CPU";
  /** Pairs of landmark indices to draw as bones. */
  connections: [number, number][];
  detect: (video: HTMLVideoElement, timestampMs: number) => HandFrame;
  close: () => void;
};

/** Downloads the model with progress (0-1), so a first open on a slow connection isn't a silent wait. */
async function fetchModel(onProgress: (fraction: number) => void): Promise<Uint8Array> {
  const response = await fetch(MODEL_PATH);
  if (!response.ok || !response.body) throw new Error(`Model download failed (${response.status})`);
  const total = Number(response.headers.get("Content-Length")) || 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress(Math.min(1, received / total));
  }
  const model = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    model.set(chunk, offset);
    offset += chunk.length;
  }
  return model;
}

export async function createHandTracker(onProgress: (fraction: number) => void = () => {}): Promise<HandTracker> {
  const [{ FilesetResolver, HandLandmarker }, model] = await Promise.all([
    import("@mediapipe/tasks-vision"),
    fetchModel(onProgress),
  ]);
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  const create = (delegate: "GPU" | "CPU") =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: "VIDEO",
      // Both hands: the picking hand gets detected too, and Step 2 keeps
      // whichever one sits on the calibrated neck.
      numHands: 2,
    });

  // GPU (WebGL) is several times faster; some machines (no WebGL2, blocked
  // drivers, some phones) can't create it, and CPU still works there.
  let landmarker: HandLandmarker;
  let delegate: "GPU" | "CPU" = "GPU";
  try {
    landmarker = await create("GPU");
  } catch {
    delegate = "CPU";
    landmarker = await create("CPU");
  }

  return {
    delegate,
    connections: HandLandmarker.HAND_CONNECTIONS.map((c) => [c.start, c.end] as [number, number]),
    detect(video, timestampMs) {
      const started = performance.now();
      const result = landmarker.detectForVideo(video, timestampMs);
      return {
        inferenceMs: performance.now() - started,
        hands: result.landmarks.map((points: NormalizedLandmark[], i) => ({
          landmarks: points.map(({ x, y, z }) => ({ x, y, z })),
          handedness: result.handedness[i]?.[0]?.categoryName ?? "",
          score: result.handedness[i]?.[0]?.score ?? 0,
        })),
      };
    },
    close: () => landmarker.close(),
  };
}

export type Camera = { stream: MediaStream; track: MediaStreamTrack; stop: () => void };

/**
 * 1280×720 is asked for as "ideal", not required: laptop webcams, USB
 * cameras and phones all answer with whatever they actually have. The
 * model works on a ~224 px crop anyway; the resolution is for the
 * calibration clicks and the user's own view of the neck.
 */
export async function openCamera(): Promise<Camera> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("No camera API in this browser", "NotFoundError");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    // 30 fps asked for, not required: in dim light most webcams drop to ~15
    // on their own (longer exposure), which also blurs fast fingers.
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" },
    audio: false,
  });
  return {
    stream,
    track: stream.getVideoTracks()[0],
    // Stopping the tracks (not just detaching the stream) is what turns the
    // camera light off.
    stop: () => stream.getTracks().forEach((track) => track.stop()),
  };
}

/**
 * Runs `onFrame` once per new camera frame. requestVideoFrameCallback fires
 * only when the camera delivers a frame, so the model never runs twice on
 * the same image; where it's missing (older Firefox) requestAnimationFrame
 * stands in, with a check that the video time moved. Inference is
 * synchronous, so a slow frame simply delays the next callback: frames are
 * dropped, never queued.
 */
export function startFrameLoop(video: HTMLVideoElement, onFrame: (timestampMs: number) => void): () => void {
  let stopped = false;
  // Checked on the prototype, not `video`: TypeScript's DOM types assume
  // every browser has it and would treat the fallback below as unreachable.
  if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
    let handle = 0;
    const tick = (now: number) => {
      if (stopped) return;
      onFrame(now);
      handle = video.requestVideoFrameCallback(tick);
    };
    handle = video.requestVideoFrameCallback(tick);
    return () => {
      stopped = true;
      video.cancelVideoFrameCallback(handle);
    };
  }
  let handle = 0;
  let lastTime = -1;
  const tick = (now: number) => {
    if (stopped) return;
    if (video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      onFrame(now);
    }
    handle = requestAnimationFrame(tick);
  };
  handle = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(handle);
  };
}

/**
 * The webcam's own image controls, where it exposes them (Image Capture
 * constraints; Chrome supports them on many UVC webcams). Unlike a CSS
 * filter on the <video>, these change the frames the model reads: in a dim
 * room auto-exposure brightens everything to suit the dark areas and washes
 * out pale, well-lit hands — manual exposure fixes that at the source.
 */
export type CameraControlName = "exposureTime" | "exposureCompensation" | "brightness" | "contrast";
export type CameraControl = { name: CameraControlName; min: number; max: number; step: number; value: number };
export type CameraControls = {
  /** null when the camera doesn't offer manual exposure at all. */
  manualExposure: boolean | null;
  controls: CameraControl[];
};

const CONTROL_NAMES: CameraControlName[] = ["exposureTime", "exposureCompensation", "brightness", "contrast"];
type Range = { min: number; max: number; step?: number };

export function cameraControls(track: MediaStreamTrack): CameraControls {
  // Not in TypeScript's DOM types yet (Image Capture spec), hence the casts.
  const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
  const settings = track.getSettings() as Record<string, unknown>;
  const modes = caps.exposureMode as string[] | undefined;
  return {
    manualExposure: modes?.includes("manual") ? settings.exposureMode === "manual" : null,
    controls: CONTROL_NAMES.flatMap((name) => {
      const range = caps[name] as Range | undefined;
      if (!range || typeof range.min !== "number" || range.max <= range.min) return [];
      return [{ name, min: range.min, max: range.max, step: range.step || (range.max - range.min) / 100, value: Number(settings[name] ?? range.min) }];
    }),
  };
}

export async function setCameraControl(track: MediaStreamTrack, values: Partial<Record<CameraControlName | "exposureMode", number | string>>) {
  await track.applyConstraints({ advanced: [values as MediaTrackConstraintSet] });
}
