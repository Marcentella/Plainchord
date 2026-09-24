// A fixed "guitar through an amp in a room" chain between the synth and the
// speakers, to take the toy edge off the Fluid R3 samples. Not user-facing
// tone control (CLAUDE.md keeps tone guidance out of scope): the app ships one
// preset (TONE_DEFAULT); /dev/synth exposes the knobs only to pick it by ear.
//
// input -> high-pass -> compressor -> saturation -> cabinet EQ -> dry
//                                                              -> chorus (L/R) -> sum -> trim -> output
//                                                              -> room reverb  ->
// Every layer stays wired; "off" sets it to neutral values, so toggling never
// reconnects nodes mid-playback (which clicks).

export type ToneSettings = {
  /** false = the untouched synth signal (the A of the A/B). */
  enabled: boolean;
  compressor: boolean;
  /** Saturation amount; 0 = clean (waveshaper off). */
  drive: number;
  cab: boolean;
  /** Where the cabinet's high-end roll-off starts. */
  cabLowpassHz: number;
  /** 0-1 */
  chorusMix: number;
  /** 0-1 */
  reverbMix: number;
  /** Final trim, to compare A and B at equal loudness. */
  outputGain: number;
};

export const TONE_OFF: ToneSettings = {
  enabled: false,
  compressor: false,
  drive: 0,
  cab: false,
  cabLowpassHz: 5000,
  chorusMix: 0,
  reverbMix: 0,
  outputGain: 1,
};

/** The shipped sound, picked by ear on /dev/synth (2026-09-24): light drive, lots of room and doubling. */
export const TONE_DEFAULT: ToneSettings = {
  enabled: true,
  compressor: true,
  drive: 1,
  cab: true,
  cabLowpassHz: 4750,
  chorusMix: 0.5,
  reverbMix: 0.36,
  outputGain: 0.8,
};

// Smoothing time for parameter changes, so a slider drag never clicks.
const RAMP = 0.02;

function driveCurve(drive: number): Float32Array<ArrayBuffer> {
  // tanh(k·x)/tanh(k): soft clipping that still maps full scale to full
  // scale, so more drive changes the character more than the loudness.
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  return curve;
}

/** A small room: stereo noise under an exponential decay. Generated, so there's no IR file to license. */
function roomImpulse(ctx: BaseAudioContext, seconds = 1.2): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4);
  }
  return buffer;
}

export function createToneChain(ctx: BaseAudioContext) {
  const input = new GainNode(ctx);
  const output = new GainNode(ctx);

  // A/B: the untouched signal and the processed one, crossfaded.
  const bypass = new GainNode(ctx, { gain: 1 });
  const wet = new GainNode(ctx, { gain: 0 });
  input.connect(bypass).connect(output);

  const highpass = new BiquadFilterNode(ctx, { type: "highpass", frequency: 90, Q: 0.7 });
  const compressor = new DynamicsCompressorNode(ctx);
  const shaper = new WaveShaperNode(ctx, { oversample: "4x" });
  const postDrive = new GainNode(ctx);
  // Cabinet: the speaker's low resonance, a slight boxy-mid cut, a presence
  // peak, then two stacked low-passes for a steep (24 dB/oct) roll-off —
  // guitar speakers pass almost nothing above ~5 kHz, which is where the
  // samples' fizz lives.
  const cabLow = new BiquadFilterNode(ctx, { type: "peaking", frequency: 120, Q: 1 });
  const cabMid = new BiquadFilterNode(ctx, { type: "peaking", frequency: 500, Q: 1 });
  const cabPresence = new BiquadFilterNode(ctx, { type: "peaking", frequency: 2500, Q: 1.2 });
  const cabLowpass1 = new BiquadFilterNode(ctx, { type: "lowpass", Q: 0.7 });
  const cabLowpass2 = new BiquadFilterNode(ctx, { type: "lowpass", Q: 0.7 });
  input
    .connect(highpass)
    .connect(compressor)
    .connect(shaper)
    .connect(postDrive)
    .connect(cabLow)
    .connect(cabMid)
    .connect(cabPresence)
    .connect(cabLowpass1)
    .connect(cabLowpass2);

  const sum = new GainNode(ctx);
  const trim = new GainNode(ctx);
  cabLowpass2.connect(sum); // dry

  // Chorus: two short delays, each wobbling slowly at its own rate, panned
  // apart — like a second take of the same part.
  const chorus = new GainNode(ctx, { gain: 0 });
  const oscillators: OscillatorNode[] = [];
  for (const [delaySeconds, rate, pan] of [
    [0.012, 0.6, -0.7],
    [0.017, 0.8, 0.7],
  ]) {
    const delay = new DelayNode(ctx, { delayTime: delaySeconds, maxDelayTime: 0.05 });
    const lfo = new OscillatorNode(ctx, { frequency: rate });
    const depth = new GainNode(ctx, { gain: 0.002 });
    lfo.connect(depth).connect(delay.delayTime);
    lfo.start();
    oscillators.push(lfo);
    cabLowpass2.connect(delay).connect(new StereoPannerNode(ctx, { pan })).connect(chorus);
  }
  chorus.connect(sum);

  // Room: real rooms swallow highs, so the reverb return is darkened too.
  const reverb = new ConvolverNode(ctx, { buffer: roomImpulse(ctx) });
  const reverbTone = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 3500 });
  const reverbReturn = new GainNode(ctx, { gain: 0 });
  cabLowpass2.connect(reverb).connect(reverbTone).connect(reverbReturn).connect(sum);

  sum.connect(trim).connect(wet).connect(output);

  let lastDrive = -1;

  function apply(settings: ToneSettings) {
    const now = ctx.currentTime;
    const ramp = (param: AudioParam, value: number) => param.setTargetAtTime(value, now, RAMP);

    ramp(bypass.gain, settings.enabled ? 0 : 1);
    ramp(wet.gain, settings.enabled ? 1 : 0);

    // Off = ratio 1 (a compressor that never compresses).
    ramp(compressor.threshold, settings.compressor ? -20 : 0);
    ramp(compressor.ratio, settings.compressor ? 4 : 1);
    ramp(compressor.knee, 10);
    ramp(compressor.attack, 0.005);
    ramp(compressor.release, 0.15);

    // The curve is a buffer, not an AudioParam; only rebuild it on change.
    if (settings.drive !== lastDrive) {
      shaper.curve = settings.drive > 0 ? driveCurve(settings.drive) : null;
      lastDrive = settings.drive;
    }
    // Driven, the shaper pushes quiet notes up toward full scale; pull the
    // level back so drive doesn't also mean "louder".
    ramp(postDrive.gain, settings.drive > 0 ? 0.7 : 1);

    ramp(cabLow.gain, settings.cab ? 3 : 0);
    ramp(cabMid.gain, settings.cab ? -3 : 0);
    ramp(cabPresence.gain, settings.cab ? 3 : 0);
    const cutoff = settings.cab ? settings.cabLowpassHz : 20000;
    ramp(cabLowpass1.frequency, cutoff);
    ramp(cabLowpass2.frequency, cutoff);

    ramp(chorus.gain, settings.chorusMix);
    ramp(reverbReturn.gain, settings.reverbMix);
    ramp(trim.gain, settings.outputGain);
  }

  function dispose() {
    for (const lfo of oscillators) lfo.stop();
  }

  return { input, output, apply, dispose };
}
