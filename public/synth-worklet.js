// AudioWorkletProcessor for PlainChord's alphaSynth prototype
// (plans/synth_blueprint.md, Step 0). Deliberately doesn't import alphaTab:
// an AudioWorkletGlobalScope has no fetch, and pulling in the whole library
// here would be dead weight anyway -- this processor is nothing but a ring
// buffer, the same split alphaTab uses internally for its own worklet
// processor.
//
// Wiring: the main thread creates a MessageChannel, sends one port to this
// processor's own `port` (a one-time "setPort" handoff) and transfers the
// other to the Worker that owns the real synth (lib/synth/synthWorker.ts).
// Audio sample messages then flow worker -> worklet directly over that
// second port, never touching the main thread.

class RingBuffer {
  constructor(size) {
    this.buffer = new Float32Array(size);
    this.writePos = 0;
    this.readPos = 0;
    this.count = 0;
  }

  clear() {
    this.writePos = 0;
    this.readPos = 0;
    this.count = 0;
  }

  write(data) {
    const count = Math.min(data.length, this.buffer.length - this.count);
    const toEnd = Math.min(this.buffer.length - this.writePos, count);
    this.buffer.set(data.subarray(0, toEnd), this.writePos);
    this.writePos = (this.writePos + toEnd) % this.buffer.length;
    if (toEnd < count) {
      this.buffer.set(data.subarray(toEnd, count), this.writePos);
      this.writePos = (this.writePos + (count - toEnd)) % this.buffer.length;
    }
    this.count += count;
  }

  read(out) {
    const count = Math.min(out.length, this.count);
    const toEnd = Math.min(this.buffer.length - this.readPos, count);
    out.set(this.buffer.subarray(this.readPos, this.readPos + toEnd), 0);
    if (toEnd < count) {
      out.set(this.buffer.subarray(0, count - toEnd), toEnd);
    }
    this.readPos = (this.readPos + count) % this.buffer.length;
    this.count -= count;
    return count;
  }
}

// Fraction of the ring's capacity to hold buffered before process() starts
// (or resumes, after an underrun) actually draining it into the audio
// output -- see PlainChordSynthProcessor.primed below.
const LOW_WATER_RATIO = 0.5;
// The worst case size of one addSamples reply: alphaTab's own
// SynthConstants.MicroBufferSize(64) * MicroBufferCount(32) *
// AudioChannels(2) -- not exported, read directly out of
// node_modules/@coderline/alphatab/dist/alphaTab.core.mjs. This is *not*
// small: 4096 interleaved samples per reply. Letting more requests be
// outstanding than the ring has room to receive if they all landed at
// once means RingBuffer.write() truncates the overflow -- real audio
// content silently discarded, not underrun silence. That reads as
// skipped/sped-up playback, not the crackle a genuine underrun sounds
// like, and it's exactly what an earlier version of this file did with a
// flat MAX_PENDING_REQUESTS cap that ignored how big a reply actually is.
const MICRO_BUFFER_CHUNK_SAMPLES = 64 * 32 * 2;

class PlainChordSynthProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    const bufferTimeInMilliseconds = options.processorOptions?.bufferTimeInMilliseconds ?? 200;
    // Interleaved stereo samples.
    this.ring = new RingBuffer(Math.ceil((sampleRate * bufferTimeInMilliseconds) / 1000) * 2);
    this.lowWaterMark = Math.floor(this.ring.buffer.length * LOW_WATER_RATIO);
    this.pendingRequests = 0;
    this.audioPort = null;
    // Pre-buffering (jitter buffer): process() outputs silence and only
    // requests refills -- it never drains -- until the ring holds a real
    // cushion. Without this, playback starts (or resumes after any stall)
    // by consuming samples exactly as fast as they trickle in one small
    // worker reply at a time, which is slower and jitterier than
    // steady-state supply and reliably underruns immediately. Re-armed on
    // any actual underrun so one stall can't cascade into a string of
    // stutters.
    this.primed = false;

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === "setPort") {
        this.audioPort = event.data.port;
        this.audioPort.onmessage = (e) => this.handleAudioMessage(e.data);
        this.requestRefill();
      }
    };
  }

  handleAudioMessage(data) {
    if (data.type === "addSamples") {
      this.ring.write(data.samples);
      this.pendingRequests = Math.max(0, this.pendingRequests - 1);
      if (!this.primed && this.ring.count >= this.lowWaterMark) this.primed = true;
    } else if (data.type === "resetSamples") {
      this.ring.clear();
      this.primed = false;
    } else if (data.type === "flush") {
      // Pause: drop what's buffered so the sound stops now, not up to a
      // buffer later. Unprimed, process() reports no more samplesPlayed, and
      // this port is ordered, so when "flushed" reaches the worker every
      // samplesPlayed before it has too: its position is final.
      this.ring.clear();
      this.primed = false;
      this.audioPort.postMessage({ type: "flushed" });
    }
  }

  // Tops the in-flight request count up in one go (a burst) whenever we're
  // under the watermark, instead of trickling out one extra request per
  // process() tick -- the burst is what lets an empty ring reach the
  // watermark quickly instead of crawling there. The cap is capacity-based,
  // not a flat count: never let there be more requests outstanding than
  // the ring could still hold in the worst case (every one of them a full
  // MICRO_BUFFER_CHUNK_SAMPLES reply, none of them consumed yet).
  requestRefill() {
    if (!this.audioPort || this.ring.count >= this.lowWaterMark) return;
    while ((this.pendingRequests + 1) * MICRO_BUFFER_CHUNK_SAMPLES <= this.ring.buffer.length - this.ring.count) {
      this.audioPort.postMessage({ type: "sampleRequest" });
      this.pendingRequests++;
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1];
    if (!left || !right) return true;

    if (!this.primed) {
      left.fill(0);
      right.fill(0);
    } else {
      const interleaved = new Float32Array(left.length * 2);
      const samplesRead = this.ring.read(interleaved) / 2;
      for (let i = 0; i < left.length; i++) {
        if (i < samplesRead) {
          left[i] = interleaved[i * 2];
          right[i] = interleaved[i * 2 + 1];
        } else {
          left[i] = 0;
          right[i] = 0;
        }
      }
      if (samplesRead < left.length) {
        // The worker fell behind despite priming -- re-arm instead of
        // continuing to drain a ring that's already empty, which is what
        // turns one stall into a string of clicks.
        this.primed = false;
      }
      if (this.audioPort) this.audioPort.postMessage({ type: "samplesPlayed", samples: samplesRead });
    }

    this.requestRefill();
    return true;
  }
}

registerProcessor("plainchord-synth", PlainChordSynthProcessor);
