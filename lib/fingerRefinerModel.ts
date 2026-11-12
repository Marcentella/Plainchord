/**
 * Runs the fingertip refiner network (lib/fingerRefiner.ts explains what it
 * is) with onnxruntime-web's WASM backend. Loaded only when the camera check
 * opens, like the hand model; the runtime is self-hosted under
 * /onnxruntime/<version> and the model under /models. Everything stays on the
 * device.
 *
 * The model was trained with the GuiFiR dataset (An et al., IEEE Access 2026,
 * doi:10.1109/ACCESS.2026.3713562; non-commercial research and education
 * terms) and our own recordings: scripts/refiner/.
 */
import type { Calibration, Vec2 } from "./fretMapping.ts";
import { PATCH_CHANNELS, PATCH_H, PATCH_W, refinedUV, refinerPatch, type Pixels } from "./fingerRefiner.ts";

export type FingerRefiner = {
  /**
   * Where each finger (index..pinky) presses, in reading coordinates (u along
   * the neck, v across), or null for a finger nowhere near the neck. One
   * request at a time: a call made while another is running resolves to null.
   */
  refine: (frame: Pixels, cal: Pick<Calibration, "toNeck" | "toImage">, hand: Vec2[]) => Promise<(Vec2 | null)[] | null>;
  close: () => void;
};

const FINGERS = 4;
const PATCH = PATCH_CHANNELS * PATCH_H * PATCH_W;

/** `model`: the .onnx file's URL or bytes. `wasmPaths`: folder of the runtime's .wasm/.mjs (the browser needs it; Node finds its own). */
export async function createFingerRefiner(model: string | Uint8Array, wasmPaths?: string): Promise<FingerRefiner> {
  const ort = await import("onnxruntime-web/wasm");
  if (wasmPaths) {
    ort.env.wasm.wasmPaths = wasmPaths;
    // In the browser the network runs in a worker: an answer takes a few hundred
    // milliseconds, which on the main thread would freeze the video.
    ort.env.wasm.proxy = true;
  }
  // ponytail: one thread. More needs cross-origin isolation headers (COOP/COEP) on
  // every page; add them, or the WebGPU backend, if this proves too slow on real machines.
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(model as string, { executionProviders: ["wasm"] });
  const input = new Float32Array(FINGERS * PATCH);
  let busy = false;

  return {
    async refine(frame, cal, hand) {
      if (busy) return null;
      busy = true;
      try {
        // Fingers with nothing to refine still go through the network (as blank
        // patches) so the batch keeps one shape; their answers are dropped. The tensor
        // gets a copy: the worker takes ownership of what it is sent.
        input.fill(0);
        const origins = Array.from({ length: FINGERS }, (_, f) => refinerPatch(frame, cal, hand, f, input, f * PATCH));
        const result = await session.run({ patch: new ort.Tensor("float32", input.slice(), [FINGERS, PATCH_CHANNELS, PATCH_H, PATCH_W]) });
        const press = result.press.data as Float32Array;
        return origins.map((origin, f) => (origin === null ? null : refinedUV(origin, press[2 * f], press[2 * f + 1])));
      } finally {
        busy = false;
      }
    },
    close: () => void session.release(),
  };
}
