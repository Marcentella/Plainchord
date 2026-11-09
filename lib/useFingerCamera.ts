"use client";

/**
 * The camera fingering pipeline as one hook, shared by the real check
 * (components/CameraCheckModal.tsx) and the measuring page (/dev/camera):
 *
 * camera -> MediaPipe hand landmarks -> (neck following moves the
 * calibration) -> fretting hand = most fingertips over the neck -> One Euro
 * filter on all 21 of its points -> string/fret per finger -> stabilized
 * readings
 *
 * The frame loop runs outside React (refs, a <canvas> drawn per frame);
 * React state is refreshed a few times a second, enough for text and the
 * chord diagram without re-rendering on every frame.
 */
import { useEffect, useRef, useState } from "react";
import {
  cameraControls,
  createHandTracker,
  openCamera,
  setCameraControl,
  startFrameLoop,
  type CameraControls,
  type HandTracker,
  type TrackedHand,
} from "./handTracking";
import {
  PRESS_PULLBACK,
  calibrate,
  fretAt,
  isCalibration,
  neckUV,
  onNeck,
  pressPoint,
  stringAt,
  fretPositionIn,
  wireAt,
  LAST_READ_FRET,
  type Calibration,
  type CalibrationError,
  type CalibrationFret,
  type Vec2,
} from "./fretMapping";
import { OneEuroFilter } from "./oneEuroFilter";
import { NeckTracker, type Gray } from "./neckTracking";
import { FingerLock, ReadingStabilizer, type FingerPosition, type FingerReading } from "./chordFingerCheck";
import type { Chord } from "./chords";
import { micErrorFor } from "./micInput";
import { cssColor, drawClicks, drawFingertip, drawGrid, drawNeckPoints, drawSkeleton } from "./fingerCameraDraw";
import { detectFretWires } from "./fretDetection";

export type CameraStatus = "idle" | "loading" | "running" | "denied" | "unavailable" | "error";
export type CameraStats = { fps: number; inferenceMs: number; hands: number; width: number; height: number };
export type NeckState = { state: "off" | "following" | "lost"; points: number; ms: number };
/** Fret measurement: waiting for the hand to leave the neck, done (how many of how many wires), or not possible. */
export type FretState = { state: "none" | "waiting" | "measured" | "model"; found: number; total: number };

/** MediaPipe landmarks for index..pinky — fingers 1-4, the same numbering data/chords.json uses. */
const FINGERTIPS = [8, 12, 16, 20];
const FINGER_DIPS = [7, 11, 15, 19];
const STATE_EVERY_MS = 200;
/** Fretting hand gone this long: forget its filtered positions instead of gliding from stale ones. */
const LOST_HAND_MS = 300;
/**
 * Neck following runs on a downscaled grayscale copy of the frame: optical
 * flow needs texture, not resolution, and at 480 px wide a frame costs
 * ~14 ms (tests: under 0.4 px of corner error with a hand over the neck).
 */
const TRACK_WIDTH = 480;
/** Measuring waits this long for the hand to leave the neck, then measures anyway (the median copes with a partial cover). */
const MEASURE_WAIT_MS = 3000;
/** The grid's glide from predicted to measured wires: a one-off state change, so short and ease-out. */
const SETTLE_MS = 180;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export type FingerCameraOptions = {
  /** Text above each fingertip, e.g. the dev page's "c5 t3". */
  caption?: (reading: FingerReading) => string | undefined;
  /** Fingertip dot color (finger 1-4 and its stable reading); the accent color otherwise. */
  fingerColor?: (finger: number, reading: FingerReading, locked: boolean) => string | undefined;
  /** The chord being checked, read every frame. With one, fingers that read
   *  right lock in place (lib/chordFingerCheck.ts's FingerLock). */
  target?: () => Chord | undefined;
};

/** Fingertip press points of a hand in the neck plane, and how many sit on the neck. */
function neckPoints(hand: TrackedHand, cal: Calibration, pullback: number): { points: Vec2[]; onNeckCount: number } {
  const points = FINGERTIPS.map((tip, i) => neckUV(cal, pressPoint(hand.landmarks[tip], hand.landmarks[FINGER_DIPS[i]], pullback)));
  return { points, onNeckCount: points.filter((p) => onNeck(p, cal.wires)).length };
}

export function useFingerCamera(options: FingerCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [delegate, setDelegate] = useState("—");
  const [stats, setStats] = useState<CameraStats | null>(null);
  const [mirrored, setMirrored] = useState(true);
  const [clicks, setClicks] = useState<Vec2[]>([]);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrated, setCalibrated] = useState(false);
  const [calFret, setCalFret] = useState<CalibrationFret>(12);
  const [calError, setCalError] = useState<CalibrationError | null>(null);
  const [readings, setReadings] = useState<FingerReading[]>([null, null, null, null]);
  const [stableReadings, setStableReadings] = useState<FingerReading[]>([null, null, null, null]);
  const [locked, setLocked] = useState<boolean[]>([false, false, false, false]);
  const [controls, setControls] = useState<CameraControls | null>(null);
  const [follow, setFollow] = useState(true);
  const [pullback, setPullback] = useState(PRESS_PULLBACK);
  const [neckState, setNeckState] = useState<NeckState>({ state: "off", points: 0, ms: 0 });
  const [fretState, setFretState] = useState<FretState>({ state: "none", found: 0, total: LAST_READ_FRET });

  const trackerRef = useRef<HandTracker | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const stopRef = useRef<() => void>(() => {});
  // Read every frame by the loop, which is created once per camera start.
  const calRef = useRef<Calibration | null>(null);
  const clicksRef = useRef<Vec2[]>([]);
  const mirroredRef = useRef(true);
  const followRef = useRef(true);
  const pullbackRef = useRef(PRESS_PULLBACK);
  const optionsRef = useRef(options);
  const neckRef = useRef<NeckTracker | null>(null);
  // Set when a calibration lands: the loop starts the neck tracker on the
  // next frame, the first one it has a grayscale copy of.
  const startNeckRef = useRef(false);
  // Set by a calibration (or "Medir trastes"): measure the fret wires on the
  // next frames, once the hand is off the neck. Holds when it was asked.
  const measureRef = useRef<number | null>(null);
  // Same stale-request guard as TunerModal: a camera prompt or model load
  // that resolves after stop() must tear down, not start unseen.
  const tokenRef = useRef(0);

  useEffect(() => {
    optionsRef.current = options;
  });
  useEffect(() => {
    mirroredRef.current = mirrored;
  }, [mirrored]);
  useEffect(() => {
    pullbackRef.current = pullback;
  }, [pullback]);
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
    setStatus("idle");
  }

  // Unmount: camera off and the model's WASM/GPU memory freed.
  useEffect(
    () => () => {
      tokenRef.current++;
      stopRef.current();
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
      trackerRef.current = tracker; // kept across stop/start: reloading the model is the slow part
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
      // Full-resolution copy for fret measuring: a one-off per calibration, so
      // the camera's own pixels, not the 480 px tracking copy.
      const fullGrabber = document.createElement("canvas");
      const fullCtx = fullGrabber.getContext("2d", { willReadFrequently: true })!;
      const grabFull = (): Gray => {
        fullGrabber.width = video.videoWidth;
        fullGrabber.height = video.videoHeight;
        fullCtx.drawImage(video, 0, 0);
        const rgba = fullCtx.getImageData(0, 0, video.videoWidth, video.videoHeight).data;
        const data = new Float32Array(video.videoWidth * video.videoHeight);
        for (let i = 0, j = 0; i < data.length; i++, j += 4) data[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
        return { data, width: video.videoWidth, height: video.videoHeight };
      };
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let settle: { from: number[]; to: number[]; start: number } | null = null;
      let neckMs = 0;
      let neckStatus: NeckState["state"] = "off";
      // One filter pair per landmark of the hand being read: the skeleton,
      // knuckles and fingertips all come from the same smoothed points, so
      // what's drawn is exactly what's read.
      const filters = Array.from({ length: 21 }, () => ({ x: new OneEuroFilter(), y: new OneEuroFilter() }));
      const smooth = (hand: TrackedHand): TrackedHand => ({
        ...hand,
        landmarks: hand.landmarks.map((p, i) => ({
          // Filtered in pixels, the filter's tuning unit.
          x: filters[i].x.filter(p.x * canvas.width, now / 1000) / canvas.width,
          y: filters[i].y.filter(p.y * canvas.height, now / 1000) / canvas.height,
          z: p.z,
        })),
      });
      let now = 0;
      const stabilizer = new ReadingStabilizer();
      const fingerLock = new FingerLock();
      // What the check sees: stable readings, with locked fingers held on their target.
      let shown: FingerReading[] = [null, null, null, null];
      let lockedState = [false, false, false, false];
      const previous: FingerReading[] = [null, null, null, null];
      let stable: FingerReading[] = [null, null, null, null];
      let lastSeen = 0;
      let frames = 0;
      let inferenceTotal = 0;
      let lastHands = 0;
      let windowStart = performance.now();

      const stopLoop = startFrameLoop(video, (frameTime) => {
        now = frameTime;
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        const { width: w, height: h } = canvas;
        const scale = Math.max(1, w / 640);
        const ctx = canvas.getContext("2d")!;
        const frame = tracker.detect(video, now);
        const mirror = mirroredRef.current;
        const { caption, fingerColor, target } = optionsRef.current;
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
                { wires: current.wires, found: current.found },
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
          const pts = (neckRef.current?.points ?? []).map((p) => ({ x: p.x / gray.width, y: p.y / gray.height }));
          drawNeckPoints(ctx, pts, neckStatus === "lost", w, h, scale);
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
            const { onNeckCount } = neckPoints(hand, cal, pullbackRef.current);
            if (onNeckCount > best) {
              best = onNeckCount;
              fretting = hand;
            }
          }
        }

        // Fret measuring: on the first frame after a calibration with the hand
        // off the neck (or after MEASURE_WAIT_MS regardless).
        if (cal && measureRef.current !== null) {
          const handOnNeck = frame.hands.some((hand) => neckPoints(hand, cal, pullbackRef.current).onNeckCount > 0);
          if (!handOnNeck || now - measureRef.current > MEASURE_WAIT_MS) {
            measureRef.current = null;
            const measured = detectFretWires(grabFull(), cal);
            if (measured) {
              const from = Array.from({ length: LAST_READ_FRET + 1 }, (_, n) => wireAt(n, cal.wires));
              calRef.current = { ...cal, wires: measured.wires, found: measured.found };
              settle = reducedMotion ? null : { from, to: measured.wires, start: now };
              setFretState({ state: "measured", found: measured.found.filter(Boolean).length - 1, total: LAST_READ_FRET });
            } else {
              setFretState({ state: "model", found: 0, total: LAST_READ_FRET });
            }
          } else {
            setFretState((s) => (s.state === "waiting" ? s : { state: "waiting", found: 0, total: LAST_READ_FRET }));
          }
        }
        const gridCal = calRef.current;
        if (gridCal) {
          let shownWires = gridCal.wires;
          if (settle) {
            const t = Math.min(1, (now - settle.start) / SETTLE_MS);
            const k = easeOut(t);
            shownWires = settle.to.map((to, n) => settle!.from[n] + (to - settle!.from[n]) * k);
            if (t >= 1) settle = null;
          }
          drawGrid(ctx, gridCal, w, h, scale, shownWires);
        }
        // Before calibration there's no neck to pick the fretting hand by:
        // the first hand found is the one smoothed and drawn in full.
        const main = cal ? fretting : (frame.hands[0] ?? null);
        const smoothed = main ? smooth(main) : null;
        for (const hand of frame.hands) {
          if (hand === main) continue;
          drawSkeleton(ctx, hand, tracker.connections, w, h, scale, cal !== null);
        }
        if (smoothed) {
          lastSeen = now;
          drawSkeleton(ctx, smoothed, tracker.connections, w, h, scale, false);
        }

        const tips: Vec2[] = [];
        const positions: FingerPosition[] = [null, null, null, null];
        if (cal && smoothed) {
          FINGERTIPS.forEach((tip, i) => {
            const press = pressPoint(smoothed.landmarks[tip], smoothed.landmarks[FINGER_DIPS[i]], pullbackRef.current);
            tips.push(press);
            const neck = neckUV(cal, press);
            let reading: FingerReading = null;
            if (onNeck(neck, cal.wires)) {
              positions[i] = { string: neck.y * 5, fret: fretPositionIn(neck.x, cal.wires) };
              const s = stringAt(neck.y, previous[i]?.string ?? null);
              const f = fretAt(neck.x, previous[i]?.fret ?? null, cal.wires);
              if (s !== null && f !== null) reading = { string: s, fret: f };
            }
            previous[i] = reading;
          });
          stable = stabilizer.update(previous, now);
        }
        // The lock runs every frame, hand or no hand: a locked finger that
        // drops out of view gets its grace period instead of vanishing.
        const chord = cal ? target?.() : undefined;
        let lockedNow = [false, false, false, false];
        if (chord) {
          const result = fingerLock.update(chord, stable, positions, now);
          shown = result.readings;
          lockedNow = result.locked;
        } else {
          shown = stable;
        }
        lockedState = lockedNow;
        if (cal && smoothed) {
          const accent = cssColor("--accent", "#b8492a");
          tips.forEach((tip, i) =>
            drawFingertip(ctx, tip, i + 1, fingerColor?.(i + 1, shown[i], lockedNow[i]) ?? accent, w, h, scale, mirror, caption?.(previous[i]), lockedNow[i]),
          );
        }
        if (!smoothed && now - lastSeen > LOST_HAND_MS) {
          filters.forEach((f) => {
            f.x.reset();
            f.y.reset();
          });
          previous.fill(null);
          stabilizer.reset();
          stable = [null, null, null, null];
        }

        drawClicks(ctx, clicksRef.current, w, h, scale, mirror);

        frames++;
        inferenceTotal += frame.inferenceMs;
        lastHands = frame.hands.length;
        if (now - windowStart >= STATE_EVERY_MS) {
          setStats({
            fps: (frames * 1000) / (now - windowStart),
            inferenceMs: inferenceTotal / frames,
            hands: lastHands,
            width: video.videoWidth,
            height: video.videoHeight,
          });
          setReadings([...previous]);
          setStableReadings([...shown]);
          setLocked([...lockedState]);
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
      tokenRef.current++;
      stopRef.current();
      stopRef.current = () => {};
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
    setCalError(null);
    setCalibrated(false);
    setCalibrating(true);
  }

  /** onClick for the element wrapping the <video>. */
  function handleVideoClick(e: React.MouseEvent<HTMLElement>) {
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
    // The clicks have done their job either way; left on screen they'd sit
    // where the neck was while the grid follows where it is.
    clicksRef.current = [];
    setClicks([]);
    const result = calibrate(next, calFret);
    if (!isCalibration(result)) {
      setCalError(result);
      return;
    }
    calRef.current = result;
    startNeckRef.current = followRef.current;
    measureRef.current = performance.now();
    setFretState({ state: "waiting", found: 0, total: LAST_READ_FRET });
    setCalibrated(true);
  }

  /** Measure the fret wires again (new light, the guitar moved a lot). */
  function measureFrets() {
    if (!calRef.current) return;
    measureRef.current = performance.now();
    setFretState({ state: "waiting", found: 0, total: LAST_READ_FRET });
  }

  async function changeControl(values: Parameters<typeof setCameraControl>[1]) {
    const track = trackRef.current;
    if (!track) return;
    try {
      await setCameraControl(track, values);
    } catch {
      // The camera refused the value (some only accept it in manual mode):
      // re-reading below shows what it actually kept.
    }
    setControls(cameraControls(track));
  }

  return {
    videoRef,
    canvasRef,
    status,
    progress,
    error,
    delegate,
    stats,
    start,
    stop,
    mirrored,
    setMirrored,
    clicks,
    calibrating,
    calibrated,
    calFret,
    setCalFret,
    calError,
    startCalibration,
    handleVideoClick,
    /** Latest reading per finger (index..pinky), as of the last state refresh. */
    readings,
    /** The same, but only readings that held for STABLE_MS: what to compare against a chord. */
    stableReadings,
    /** Which fingers are locked on their target (only with a `target` chord). */
    locked,
    controls,
    changeControl,
    follow,
    setFollow,
    pullback,
    setPullback,
    neckState,
    fretState,
    measureFrets,
  };
}
