// Runs as a dedicated module Worker (see app/dev/synth/page.tsx). Owns the
// alphaSynth instance, the soundfont bytes and MIDI generation -- none of it
// runs on the main thread. Audio samples flow straight from here to
// public/synth-worklet.js over a dedicated MessagePort; only small control
// messages (load/play/pause/...) and position updates cross to the page.
// See plans/synth_blueprint.md (Step 0) for the full architecture.
//
// Importing @coderline/alphatab here auto-registers its own "message"
// listener on this worker's global scope (Environment.initializeWorker(),
// since "WorkerGlobalScope" in self is true in a real Worker). Its
// AlphaTabWebWorker handler safely ignores messages with no `cmd`, but its
// AlphaSynthWebWorker handler does not -- it unconditionally calls
// `data.cmd.startsWith("alphaSynth.exporter")` after its switch, with no
// guard for `cmd` being undefined, and throws on every message we send.
// The page's postToWorker (app/dev/synth/page.tsx) works around this by
// tagging every outgoing message with `cmd: "plainchord"`, a value that
// can't match any of its own "alphaSynth.*"/"alphaTab.*" cases -- our own
// protocol below still switches on `type`, `cmd` is only there for their
// listener's benefit.
import { synth, midi, importer, model, Settings } from "@coderline/alphatab";
import { tabToScore, createPlaybackSettings } from "../tabToScore";
import type { Tab } from "../tab";

type VibratoSettings = {
  noteSlightLength: number;
  noteSlightAmplitude: number;
  noteWideLength: number;
  noteWideAmplitude: number;
  beatSlightLength: number;
  beatSlightAmplitude: number;
  beatWideLength: number;
  beatWideAmplitude: number;
};

type InMessage =
  | { type: "init"; port: MessagePort; sampleRate: number; bufferTimeInMilliseconds: number }
  | { type: "load"; tex: string; program: number }
  | { type: "loadTab"; tab: Tab; bpm: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "stop" }
  | { type: "seek"; timeMs: number }
  | { type: "setVibrato"; vibrato: Partial<VibratoSettings> }
  | { type: "setProgram"; program: number };

export type OutMessage =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "soundFontProgress"; loaded: number; total: number }
  | { type: "positionChanged"; currentTime: number; endTime: number }
  | { type: "stateChanged"; playing: boolean }
  | { type: "finished" };

/**
 * alphaTab exports only the IEventEmitter(OfT) *interfaces*, not a concrete
 * class -- ISynthOutput needs real instances to hand back to AlphaSynth.
 */
class Emitter<T = void> {
  private handlers = new Set<(arg: T) => void>();
  on(handler: (arg: T) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  off(handler: (arg: T) => void): void {
    this.handlers.delete(handler);
  }
  trigger(arg: T): void {
    for (const handler of this.handlers) handler(arg);
  }
}

/**
 * Bridges ISynthOutput to the worklet over a dedicated MessagePort (handed
 * in via the "init" message, already connected to synth-worklet.js's own
 * audio-sample port -- see app/dev/synth/page.tsx for how the two ends get
 * wired). Audio sample data never touches the main thread.
 */
class WorkletBridgeOutput implements synth.ISynthOutput {
  readonly ready = new Emitter<void>();
  readonly sampleRequest = new Emitter<void>();
  readonly samplesPlayed = new Emitter<number>();
  private port: MessagePort | null = null;
  onFlushed: (() => void) | null = null;

  constructor(readonly sampleRate: number) {}

  connect(port: MessagePort): void {
    this.port = port;
    port.onmessage = (e: MessageEvent) => {
      const data = e.data as { type: string; samples?: number };
      if (data.type === "sampleRequest") this.sampleRequest.trigger();
      else if (data.type === "samplesPlayed" && data.samples != null) this.samplesPlayed.trigger(data.samples);
      else if (data.type === "flushed") this.onFlushed?.();
    };
  }

  open(): void {
    // The port is already connected by the time AlphaSynth calls this, so
    // there's no real "opening" to do.
    this.ready.trigger();
  }
  play(): void {}
  pause(): void {}
  destroy(): void {}
  activate(): void {}
  addSamples(samples: Float32Array): void {
    this.port?.postMessage({ type: "addSamples", samples });
  }
  resetSamples(): void {
    this.port?.postMessage({ type: "resetSamples" });
  }
  /** Drops the worklet's buffered audio; onFlushed runs once it's gone (see synth-worklet.js). */
  flush(): void {
    this.port?.postMessage({ type: "flush" });
  }
  async enumerateOutputDevices(): Promise<synth.ISynthOutputDevice[]> {
    return [];
  }
  async setOutputDevice(): Promise<void> {}
  async getOutputDevice(): Promise<synth.ISynthOutputDevice | null> {
    return null;
  }
}

const settings = new Settings();
let player: synth.AlphaSynth | null = null;
let output: WorkletBridgeOutput | null = null;
let score: model.Score | null = null;

function post(message: OutMessage): void {
  self.postMessage(message);
}

/**
 * Setting track.playbackInfo.program alone isn't enough: alphaTex (and
 * Guitar Pro imports) also put an Instrument automation on the first beat,
 * defaulting to GM program 25, and MidiFileGenerator emits that as a second
 * ProgramChange right after the track's own -- so every "instrument" played
 * as steel guitar. Both places have to change.
 */
function applyProgram(score: model.Score, program: number): void {
  for (const track of score.tracks) {
    track.playbackInfo.program = program;
    for (const staff of track.staves)
      for (const bar of staff.bars)
        for (const voice of bar.voices)
          for (const beat of voice.beats)
            for (const automation of beat.automations)
              if (automation.type === model.AutomationType.Instrument) automation.value = program;
  }
}

/**
 * Regenerates the MIDI file for the currently loaded score and hands it to
 * the synth -- the only way to change vibrato or program, since both bake
 * into MIDI pitch-bend/program-change events at generation time, not at
 * playback time. Reloading the MIDI resets the playhead to 0, which is fine
 * for this prototype (Step 2 will need to preserve position across this).
 */
function regenerateMidi(generatorSettings: Settings = settings): void {
  if (!score || !player) return;
  const midiFile = new midi.MidiFile();
  const handler = new midi.AlphaSynthMidiFileHandler(midiFile);
  new midi.MidiFileGenerator(score, generatorSettings, handler).generate();
  player.loadMidiFile(midiFile);
}

// Versioned name: next.config.ts serves /soundfont/* as immutable for a
// year, so a changed font must get a new filename to reach returning visitors.
const SOUNDFONT_URL = "/soundfont/FluidR3_GM_guitars-v1.sf2";

/** Streams the soundfont so the page can show real progress (it's ~9.6 MB). */
async function loadSoundFont(): Promise<Uint8Array> {
  const response = await fetch(SOUNDFONT_URL);
  if (!response.ok || !response.body) throw new Error(`soundfont: ${response.status} ${response.statusText}`);
  const total = Number(response.headers.get("content-length")) || 0;
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    post({ type: "soundFontProgress", loaded, total });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function init(message: Extract<InMessage, { type: "init" }>): Promise<void> {
  // message.sampleRate is the page's real ctx.sampleRate (see
  // app/dev/synth/page.tsx), not a guessed/default value. AlphaSynth's own
  // constructor reads output.sampleRate synchronously to build its
  // synthesizer (`new TinySoundFont(output.sampleRate)`), so this has to be
  // set before construction below, not patched in after -- it is.
  output = new WorkletBridgeOutput(message.sampleRate);
  output.connect(message.port);
  // Pause, part 2: the worklet's buffer is gone and every samplesPlayed
  // before it has arrived, so timePosition is exactly what was heard. The
  // sequencer had synthesized that dropped buffer already; seeking it back
  // to the heard position makes resume pick up exactly there.
  output.onFlushed = () => {
    if (player && player.state === synth.PlayerState.Paused) player.timePosition = player.timePosition;
  };

  player = new synth.AlphaSynth(output, message.bufferTimeInMilliseconds);
  // positionChanged fires once per worklet render quantum -- roughly every
  // 2.9ms, ~345 times/sec -- since AlphaSynthBase itself does no throttling
  // (see updateTimePosition). Forwarding every tick into the page's React
  // state froze the tab; a plain UI readout needs nowhere near that rate.
  let lastPositionPost = 0;
  player.positionChanged.on((e) => {
    const now = Date.now();
    // A seek always goes out, so the page can re-anchor to it at once.
    if (!e.isSeek && now - lastPositionPost < 100) return;
    lastPositionPost = now;
    post({ type: "positionChanged", currentTime: e.currentTime, endTime: e.endTime });
  });
  player.stateChanged.on((e) => post({ type: "stateChanged", playing: e.state === synth.PlayerState.Playing }));
  player.finished.on(() => post({ type: "finished" }));
  player.soundFontLoadFailed.on((e) => post({ type: "error", message: e.message }));
  player.midiLoadFailed.on((e) => post({ type: "error", message: e.message }));
  player.readyForPlayback.on(() => post({ type: "ready" }));

  try {
    const bytes = await loadSoundFont();
    player.loadSoundFont(bytes, false);
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
}

self.onmessage = (event: MessageEvent<InMessage>) => {
  const message = event.data;
  switch (message.type) {
    case "init":
      void init(message);
      break;
    case "load":
      try {
        score = importer.ScoreLoader.loadAlphaTex(message.tex, settings);
        applyProgram(score, message.program);
        regenerateMidi();
      } catch (error) {
        post({ type: "error", message: error instanceof Error ? error.message : String(error) });
      }
      break;
    case "play":
      player?.play();
      break;
    case "loadTab":
      try {
        score = tabToScore(message.tab, { tempo: message.bpm });
        regenerateMidi(createPlaybackSettings());
      } catch (error) {
        post({ type: "error", message: error instanceof Error ? error.message : String(error) });
      }
      break;
    case "pause":
      // Pause, part 1: stop synthesizing and drop the worklet's buffered
      // audio (up to a whole buffer, which would otherwise keep sounding --
      // and moving the position -- after Pause). Part 2 is onFlushed above.
      player?.pause();
      output?.flush();
      break;
    case "stop":
      player?.stop();
      break;
    case "seek":
      if (player) player.timePosition = message.timeMs;
      break;
    case "setVibrato":
      Object.assign(settings.player.vibrato, message.vibrato);
      regenerateMidi();
      break;
    case "setProgram":
      if (score) {
        applyProgram(score, message.program);
        regenerateMidi();
      }
      break;
  }
};
