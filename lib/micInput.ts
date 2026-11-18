/**
 * Opening the microphone for analysis — shared by the tuner
 * (components/TunerModal.tsx) and chord play-along (lib/useChordPlayAlong.ts),
 * so both ask for the same raw signal and both release it the same way.
 */
import type { Chord } from "./chords";
import { strumAt, strumWave } from "./strum";

export type MicInput = {
  analyser: AnalyserNode;
  audioCtx: AudioContext;
  /** The raw mic signal, for consumers that need more than the analyser (recording, see components/RecordTabModal.tsx). */
  source: MediaStreamAudioSourceNode;
  /** Stops the tracks (not just the AudioContext) — that's what turns off the browser's "using your microphone" indicator and frees the hardware. */
  stop: () => void;
};

export type MicError = "denied" | "unavailable";

/** `deviceId`: a specific input (an audio interface rather than the webcam's mic); the browser's default otherwise. */
export async function openMic(fftSize: number, deviceId?: string): Promise<MicInput> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("No microphone API in this browser", "NotFoundError");
  }
  // Browsers apply speech-tuned DSP (echo cancellation, noise suppression,
  // auto gain) by default — actively harmful for instrument analysis: noise
  // suppression treats a held note or chord as background and fades it out.
  // Ask for the raw signal.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
  });
  const audioCtx = new AudioContext();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = fftSize;
  const source = audioCtx.createMediaStreamSource(stream);
  source.connect(analyser);
  return {
    analyser,
    audioCtx,
    source,
    stop() {
      stream.getTracks().forEach((track) => track.stop());
      void audioCtx.close();
    },
  };
}

/**
 * The audio inputs to pick from. Browsers only give their names once the
 * page has had mic permission, so call this after a first openMic().
 */
export async function listInputs(): Promise<{ id: string; label: string }[]> {
  const devices = (await navigator.mediaDevices?.enumerateDevices?.()) ?? [];
  return devices.filter((d) => d.kind === "audioinput" && d.deviceId).map((d) => ({ id: d.deviceId, label: d.label }));
}

/** What to tell the user when openMic() throws: no mic at all, or permission refused. */
export function micErrorFor(err: unknown): MicError {
  // OverconstrainedError: the chosen input was unplugged.
  const name = (err as { name?: string } | null)?.name;
  return name === "NotFoundError" || name === "OverconstrainedError" ? "unavailable" : "denied";
}

export type DemoInput = Omit<MicInput, "source"> & { strum: (chord: Chord) => void };

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
  const wave = strumWave(audioCtx);

  return {
    analyser,
    audioCtx,
    stop() {
      void audioCtx.close();
    },
    strum(chord) {
      strumAt(audioCtx, wave, bus, chord, audioCtx.currentTime);
    },
  };
}
