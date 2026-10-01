/**
 * Opening the microphone for analysis — shared by the tuner
 * (components/TunerModal.tsx) and chord play-along (lib/useChordPlayAlong.ts),
 * so both ask for the same raw signal and both release it the same way.
 */

export type MicInput = {
  analyser: AnalyserNode;
  audioCtx: AudioContext;
  /** Stops the tracks (not just the AudioContext) — that's what turns off the browser's "using your microphone" indicator and frees the hardware. */
  stop: () => void;
};

export type MicError = "denied" | "unavailable";

export async function openMic(fftSize: number): Promise<MicInput> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("No microphone API in this browser", "NotFoundError");
  }
  // Browsers apply speech-tuned DSP (echo cancellation, noise suppression,
  // auto gain) by default — actively harmful for instrument analysis: noise
  // suppression treats a held note or chord as background and fades it out.
  // Ask for the raw signal.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const audioCtx = new AudioContext();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = fftSize;
  audioCtx.createMediaStreamSource(stream).connect(analyser);
  return {
    analyser,
    audioCtx,
    stop() {
      stream.getTracks().forEach((track) => track.stop());
      void audioCtx.close();
    },
  };
}

/** What to tell the user when openMic() throws: no mic at all, or permission refused. */
export function micErrorFor(err: unknown): MicError {
  return err instanceof DOMException && err.name === "NotFoundError" ? "unavailable" : "denied";
}
