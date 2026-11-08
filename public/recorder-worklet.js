// AudioWorkletProcessor for "Escuchar y escribir" (components/RecordTabModal.tsx).
// Copies the mic signal out in chunks, each tagged with the AudioContext frame
// it started at. That frame number is what lines the recording up with the
// count-in clicks, which were scheduled on the same context clock: the
// downbeat's position in the samples is exact, not guessed.

const CHUNK = 2048; // ~43 ms at 48 kHz; at most this much is lost off the end on stop

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(CHUNK);
    this.filled = 0;
    this.startFrame = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      if (this.filled === 0) this.startFrame = currentFrame + i;
      this.buffer[this.filled++] = channel[i];
      if (this.filled === CHUNK) {
        this.port.postMessage({ frame: this.startFrame, samples: this.buffer }, [this.buffer.buffer]);
        this.buffer = new Float32Array(CHUNK);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor("recorder", RecorderProcessor);
