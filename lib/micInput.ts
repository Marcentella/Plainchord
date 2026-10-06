/**
 * Opening the microphone for analysis — shared by the tuner
 * (components/TunerModal.tsx) and chord play-along (lib/useChordPlayAlong.ts),
 * so both ask for the same raw signal and both release it the same way.
 */
import type { Chord } from "./chords";
import { OPEN_STRINGS } from "./chordDetection";

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

export type DemoInput = MicInput & { strum: (chord: Chord) => void };

/**
 * Stand-in for openMic() behind /acordes?demo: no mic, a synthesized strum
 * instead, fed straight into the same analyser (so the real detector does the
 * listening) and to the speakers (so a room can hear it). Same tone color as
 * the detection tests' synthChord — harmonics 1-12 at 1/h — which every
 * library chord already passes.
 */
export function openDemoInput(fftSize: number): DemoInput {
  const audioCtx = new AudioContext();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = fftSize;
  const bus = audioCtx.createGain();
  bus.connect(analyser);
  bus.connect(audioCtx.destination);
  const real = new Float32Array(13);
  const imag = Float32Array.from({ length: 13 }, (_, h) => (h ? 1 / h : 0));
  const wave = audioCtx.createPeriodicWave(real, imag);

  return {
    analyser,
    audioCtx,
    stop() {
      void audioCtx.close();
    },
    strum(chord) {
      const start = audioCtx.currentTime;
      chord.frets.forEach((fret, string) => {
        if (fret < 0) return;
        const t = start + string * 0.015; // low to high, like a downstroke
        const osc = audioCtx.createOscillator();
        osc.setPeriodicWave(wave);
        osc.frequency.value = 440 * 2 ** ((OPEN_STRINGS[string] + fret - 69) / 12);
        const env = audioCtx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.15, t + 0.005);
        env.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
        osc.connect(env).connect(bus);
        osc.start(t);
        osc.stop(t + 2.5);
      });
    },
  };
}
