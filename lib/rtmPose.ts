/**
 * RTMPose-m hand (MMPose; Apache 2.0) for the camera check's high-precision
 * mode: a heavier hand model whose fingertips land closer to where a guitarist
 * presses than MediaPipe's (measured in docs/camara-limitaciones.md). It only
 * locates the 21 points inside a box, so MediaPipe keeps finding the hand and
 * following it every frame; RTMPose re-reads it every so often, and the
 * fingertip refiner trained on RTMPose's points (fingertip-refiner-rtm) takes
 * it from there.
 *
 * The crop, colour handling and decoding repeat what rtmlib does (the code the
 * refiner's training data came from); lib/rtmPose.test.ts checks them against
 * its output.
 */
import type { Vec2 } from "./fretMapping.ts";
import type { Pixels } from "./fingerRefiner.ts";

export const RTM_SIZE = 256;
/** simcc_x / simcc_y have this many bins per input pixel. */
const SPLIT = 2;
/** Per channel, in the order the model was fed: blue, green, red (rtmlib passes OpenCV's BGR frames). */
const MEAN = [123.675, 116.28, 103.53];
const STD = [58.395, 57.12, 57.375];

/** Square crop around a hand: centre and side, in frame pixels. */
export type RtmCrop = { cx: number; cy: number; side: number };

/**
 * The box rtmlib was given in training (scripts/refiner: around MediaPipe's
 * landmarks, half side 0.65 × the larger extent) with rtmlib's own 1.25 padding.
 */
export function rtmCrop(hand: Vec2[], width: number, height: number): RtmCrop {
  const xs = hand.map((p) => p.x * width);
  const ys = hand.map((p) => p.y * height);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, side: 2 * 0.65 * Math.max(x1 - x0, y1 - y0) * 1.25 };
}

/** The model's input (3 × RTM_SIZE × RTM_SIZE, normalized), written into `out`: the crop, bilinear, black outside the frame. */
export function rtmInput(frame: Pixels, crop: RtmCrop, out: Float32Array) {
  const { data, width, height } = frame;
  const k = crop.side / RTM_SIZE;
  const plane = RTM_SIZE * RTM_SIZE;
  for (let py = 0; py < RTM_SIZE; py++) {
    const y = (py - RTM_SIZE / 2) * k + crop.cy;
    for (let px = 0; px < RTM_SIZE; px++) {
      const x = (px - RTM_SIZE / 2) * k + crop.cx;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const i = py * RTM_SIZE + px;
      for (let c = 0; c < 3; c++) {
        // OpenCV's border: pixels outside the frame are 0.
        const at = (xx: number, yy: number) => (xx >= 0 && yy >= 0 && xx < width && yy < height ? data[(yy * width + xx) * 4 + 2 - c] : 0);
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
        const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
        out[c * plane + i] = (top + (bottom - top) * fy - MEAN[c]) / STD[c];
      }
    }
  }
}

/** The model's outputs -> 21 points, normalized to the frame. */
export function rtmDecode(simccX: Float32Array, simccY: Float32Array, crop: RtmCrop, width: number, height: number): Vec2[] {
  const binsX = simccX.length / 21;
  const binsY = simccY.length / 21;
  const argmax = (a: Float32Array, from: number, n: number) => {
    let best = 0;
    for (let i = 1; i < n; i++) if (a[from + i] > a[from + best]) best = i;
    return best;
  };
  const k = crop.side / RTM_SIZE;
  return Array.from({ length: 21 }, (_, j) => ({
    x: ((argmax(simccX, j * binsX, binsX) / SPLIT - RTM_SIZE / 2) * k + crop.cx) / width,
    y: ((argmax(simccY, j * binsY, binsY) / SPLIT - RTM_SIZE / 2) * k + crop.cy) / height,
  }));
}

export type RtmPose = {
  /** Re-reads the hand MediaPipe found (`hand`, 21 normalized points) with RTMPose. */
  detect: (frame: Pixels, hand: Vec2[]) => Promise<Vec2[]>;
  close: () => void;
};

/** `model`: the .onnx file's URL or bytes; `wasmPaths` as in createFingerRefiner. */
export async function createRtmPose(model: string | Uint8Array, wasmPaths?: string): Promise<RtmPose> {
  const ort = await import("onnxruntime-web/wasm");
  if (wasmPaths) {
    ort.env.wasm.wasmPaths = wasmPaths;
    ort.env.wasm.proxy = true;
  }
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(model as string, { executionProviders: ["wasm"] });
  return {
    async detect(frame, hand) {
      const crop = rtmCrop(hand, frame.width, frame.height);
      const input = new Float32Array(3 * RTM_SIZE * RTM_SIZE);
      rtmInput(frame, crop, input);
      const out = await session.run({ input: new ort.Tensor("float32", input, [1, 3, RTM_SIZE, RTM_SIZE]) });
      return rtmDecode(out.simcc_x.data as Float32Array, out.simcc_y.data as Float32Array, crop, frame.width, frame.height);
    },
    close: () => void session.release(),
  };
}
