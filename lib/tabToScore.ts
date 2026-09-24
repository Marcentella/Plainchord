// The reverse of lib/importGuitarPro.ts: turns our internal Tab back into an
// alphaTab Score so alphaSynth can play it (plans/synth_blueprint.md, Step 1).
// Playback reads Tab, never the original Guitar Pro file, which is what lets a
// plain-text tab play too. Like importGuitarPro.ts, alphaTab is only ever
// reached from a worker or a dynamic import(), so it never enters the
// plain-text bundle.
import { model, Settings } from "@coderline/alphatab";
import type { Tab, TabBeat, TabNote } from "./tab";

/** GM program 27 — "Clean Guitar" in public/soundfont/FluidR3_GM.sf3. */
const DEFAULT_PROGRAM = 27;
/**
 * The only presets public/soundfont/FluidR3_GM.sf3 keeps (it was trimmed to
 * GM guitars 25-31: steel, jazz, clean, muted, overdrive, distortion,
 * harmonics). Any other program resolves to no preset and plays silence.
 */
const SOUNDFONT_PROGRAMS = new Set([25, 26, 27, 28, 29, 30, 31]);

/** The program a tab plays with: its own track program when the soundfont has it, else clean guitar. */
export function playbackProgramFor(tab: Pick<Tab, "program">): number {
  return tab.program !== undefined && SOUNDFONT_PROGRAMS.has(tab.program) ? tab.program : DEFAULT_PROGRAM;
}
const DEFAULT_TEMPO = 120;
const TICKS_PER_QUARTER = 960;
const STANDARD_TUNING_LOW_TO_HIGH = [40, 45, 50, 55, 59, 64];

// alphaTab's own bend-point convention (offset 0-60 across the note, value in
// quarter-tones), read off scores built by importer.ScoreLoader.loadAlphaTex
// for "b (0 4)", "b release (4 0)" and "b hold (4 4)".
const BEND_END = model.BendPoint.MaxPosition;

/**
 * Playback settings shared by score.finish() here and by MidiFileGenerator in
 * the worker (vibrato is baked into MIDI pitch-bend events at generation
 * time, so it has to be the same object). The "~" symbol has no slight/wide
 * split, so it maps to alphaTab's Slight vibrato; 360 ticks / 0.5 semitones
 * were tuned by ear in the /dev/synth prototype. These equal the library's
 * defaults today, pinned here so an alphaTab upgrade can't change the sound.
 */
export function createPlaybackSettings(): Settings {
  const settings = new Settings();
  settings.player.vibrato.noteSlightLength = 360;
  settings.player.vibrato.noteSlightAmplitude = 0.5;
  return settings;
}

export type TabToScoreOptions = {
  /** BPM. Falls back to tab.tempo, then 120. */
  tempo?: number;
};

// Every (duration, dots, tuplet) combination a beat's length in quarter notes
// could have come from: quarters = (4 / duration) * (2 - 0.5^dots) * (d / n)
// for an n-in-the-time-of-d tuplet.
const DURATIONS = [1, 2, 4, 8, 16, 32, 64] as const;
const TUPLETS: [number, number][] = [
  [1, 1],
  [3, 2],
  [5, 4],
  [6, 4],
  [7, 4],
  [9, 8],
  [10, 8],
  [11, 8],
  [12, 8],
  [13, 8],
];

type Rhythm = { duration: number; dots: number; tupletNumerator: number; tupletDenominator: number };

function rhythmFor(quarters: number): Rhythm {
  for (const [numerator, denominator] of TUPLETS) {
    for (let dots = 0; dots <= 2; dots++) {
      for (const duration of DURATIONS) {
        const length = (4 / duration) * (2 - 0.5 ** dots) * (denominator / numerator);
        if (Math.abs(length - quarters) < 1e-3) {
          return {
            duration,
            dots,
            tupletNumerator: numerator === 1 ? -1 : numerator,
            tupletDenominator: numerator === 1 ? -1 : denominator,
          };
        }
      }
    }
  }
  // Nothing matches (a grace beat's sliver of a length): the nearest plain
  // duration keeps it playable.
  const nearest = DURATIONS.reduce((best, d) => (Math.abs(4 / d - quarters) < Math.abs(4 / best - quarters) ? d : best));
  return { duration: nearest, dots: 0, tupletNumerator: -1, tupletDenominator: -1 };
}

function quartersOf(beat: TabBeat): number {
  return beat.duration ?? 1;
}

function ticksOf(beat: TabBeat): number {
  return Math.round(quartersOf(beat) * TICKS_PER_QUARTER);
}

/**
 * A bar's time signature comes from what's actually in it, not from
 * tab.timeSignature: alphaTab places each bar at masterBar.calculateDuration(),
 * and a plain-text tab has no meter at all (its bars are just N implicit
 * quarters). A signature that disagrees with the bar's beats makes bars
 * overlap or leave gaps in the MIDI.
 *
 * The bar's length must be exact to the tick (the playhead times from the
 * same ticks). alphaTab measures a bar as numerator * (3840 / denominator | 0),
 * so power-of-2 denominators stay exact down to 256 (15 ticks); a bar of
 * truncated tuplets (a 16th septuplet is 137 ticks) can sum to 3839, which
 * only a 1-tick unit spells. That denominator only reaches the MIDI
 * time-signature event, which the synth ignores for timing.
 */
function timeSignatureFor(ticks: number): { numerator: number; denominator: number } {
  for (const denominator of [4, 8, 16, 32, 64, 128, 256]) {
    const unit = (4 * TICKS_PER_QUARTER) / denominator;
    if (ticks % unit === 0) return { numerator: ticks / unit, denominator };
  }
  return { numerator: ticks, denominator: 4 * TICKS_PER_QUARTER };
}

/**
 * Which overtone a natural harmonic at this fret rings — without it alphaTab
 * plays the plain fretted pitch, not the harmonic. alphaTab computes this in
 * its alphaTex importer via ModelUtils.deltaFretToHarmonicValue, which isn't
 * exported, so this mirrors it (the round-trip test against alphaTex's own
 * "nh" would catch drift).
 */
function naturalHarmonicValue(fret: number): number {
  switch (fret) {
    case 2:
      return 2.4;
    case 3:
      return 3.2;
    case 4:
    case 5:
    case 7:
    case 9:
    case 12:
    case 16:
    case 17:
    case 19:
    case 24:
      return fret;
    case 8:
      return 8.2;
    case 10:
      return 9.6;
    case 14:
    case 15:
      return 14.7;
    case 21:
    case 22:
      return 21.7;
    default:
      return 12;
  }
}

function bendPoints(...points: [number, number][]): model.BendPoint[] {
  return points.map(([offset, value]) => new model.BendPoint(offset, value));
}

function buildNote(
  tabNote: TabNote,
  previous: model.Note | undefined,
  previousBendEnd: number | undefined,
): { note: model.Note; bendEnd: number } {
  const note = new model.Note();
  note.string = tabNote.string + 1;
  note.fret = tabNote.fret ?? 0;
  let bendEnd = 0;

  for (const technique of tabNote.techniques) {
    switch (technique) {
      case "x":
        note.isDead = true;
        break;
      case "PM":
        note.isPalmMute = true;
        break;
      case "~":
        note.vibrato = model.VibratoType.Slight;
        break;
      case ">":
        note.accentuated = model.AccentuationType.Normal;
        break;
      case "PH":
        note.harmonicType = model.HarmonicType.Pinch;
        break;
      case "NH":
        note.harmonicType = model.HarmonicType.Natural;
        note.harmonicValue = naturalHarmonicValue(note.fret);
        break;
      case "TH":
        note.harmonicType = model.HarmonicType.Tap;
        break;
      case "h":
      case "p":
        // Tagged on the arriving note in Tab; alphaTab wants the flag on the
        // note being left, and links the pair itself when the score is finished.
        if (previous) previous.isHammerPullOrigin = true;
        break;
      case "/":
        // No previous note on this string = a slide-off with no destination,
        // which has no arrival to play toward.
        if (previous) previous.slideOutType = model.SlideOutType.Shift;
        break;
      case "b": {
        if (tabNote.bendHold) {
          if (previousBendEnd) {
            note.bendType = model.BendType.Hold;
            for (const point of bendPoints([0, previousBendEnd], [BEND_END, previousBendEnd])) note.addBendPoint(point);
            bendEnd = previousBendEnd;
          }
          break;
        }
        const amount = tabNote.bendAmount ?? (tabNote.bendTo != null && tabNote.fret != null ? (tabNote.bendTo - tabNote.fret) * 2 : 0);
        if (amount <= 0) break;
        if (tabNote.bendReleasing) {
          note.bendType = model.BendType.Release;
          for (const point of bendPoints([0, amount], [BEND_END, 0])) note.addBendPoint(point);
        } else {
          note.bendType = model.BendType.Bend;
          for (const point of bendPoints([0, 0], [BEND_END, amount])) note.addBendPoint(point);
          bendEnd = amount;
        }
        break;
      }
      // "T" (tapping) is a beat-level flag, handled by the caller.
    }
  }

  return { note, bendEnd };
}

export function tabToScore(tab: Tab, options: TabToScoreOptions = {}): model.Score {
  const settings = createPlaybackSettings();
  const score = new model.Score();
  score.title = tab.title ?? "";
  score.artist = tab.artist ?? "";

  const track = new model.Track();
  track.name = "Guitar";
  // A bare Track leaves channels/volume unset. Same values alphaTab gives a
  // score it loads itself; the secondary channel is where notes that need
  // their own pitch bend (bends, vibrato) go so they don't drag other notes.
  const playback = track.playbackInfo;
  playback.program = playbackProgramFor(tab);
  playback.primaryChannel = 0;
  playback.secondaryChannel = 1;
  playback.port = 1;
  playback.volume = 15;
  playback.balance = 8;
  score.addTrack(track);
  track.ensureStaveCount(1);
  const staff = track.staves[0];

  const lowToHigh = tab.tuningMidi ?? STANDARD_TUNING_LOW_TO_HIGH;
  const isStandard = lowToHigh.join() === STANDARD_TUNING_LOW_TO_HIGH.join();
  // alphaTab stores tuning highest string first.
  staff.stringTuning = new model.Tuning(isStandard ? "Guitar Standard Tuning" : "Custom", [...lowToHigh].reverse(), isStandard);

  // Group beats into bars by their bar index, in order of appearance.
  const bars: TabBeat[][] = [];
  for (const beat of tab.beats) {
    const last = bars[bars.length - 1];
    if (last && last[0].bar === beat.bar) last.push(beat);
    else bars.push([beat]);
  }
  if (bars.length === 0) bars.push([{ position: 0, bar: 0, notes: [] }]);

  const tempo = options.tempo ?? tab.tempo ?? DEFAULT_TEMPO;
  // Per string: the last note built (for h/p// links) and where its bend
  // ended (for a "hold" that continues it). Cleared by any note that isn't
  // in the immediately preceding beat.
  let previousNotes = new Map<number, model.Note>();
  let previousBendEnds = new Map<number, number>();
  const tabBeatOf = new Map<model.Beat, TabBeat>();

  bars.forEach((tabBeats, barIndex) => {
    const masterBar = new model.MasterBar();
    const signature = timeSignatureFor(tabBeats.reduce((sum, beat) => sum + ticksOf(beat), 0));
    masterBar.timeSignatureNumerator = signature.numerator;
    masterBar.timeSignatureDenominator = signature.denominator;
    if (barIndex === 0) {
      masterBar.tempoAutomations.push(model.Automation.buildTempoAutomation(false, 0, tempo, 2));
    }
    score.addMasterBar(masterBar);

    const bar = new model.Bar();
    staff.addBar(bar);
    const voice = new model.Voice();
    bar.addVoice(voice);

    for (const tabBeat of tabBeats) {
      const beat = new model.Beat();
      const rhythm = rhythmFor(quartersOf(tabBeat));
      beat.duration = rhythm.duration;
      beat.dots = rhythm.dots;
      beat.tupletNumerator = rhythm.tupletNumerator;
      beat.tupletDenominator = rhythm.tupletDenominator;
      voice.addBeat(beat);
      tabBeatOf.set(beat, tabBeat);

      const notes = new Map<number, model.Note>();
      const bendEnds = new Map<number, number>();
      for (const tabNote of tabBeat.notes) {
        const { note, bendEnd } = buildNote(tabNote, previousNotes.get(tabNote.string), previousBendEnds.get(tabNote.string));
        beat.addNote(note);
        notes.set(tabNote.string, note);
        bendEnds.set(tabNote.string, bendEnd);
        if (tabNote.techniques.includes("T")) beat.tap = true;
      }
      previousNotes = notes;
      previousBendEnds = bendEnds;
    }
  });

  score.finish(settings);

  // The playhead (lib/playhead.ts) times beats from Tab durations, so the
  // audio must too, to the tick. rhythmFor can only approximate lengths that
  // no notated rhythm spells (a Guitar Pro grace note's 0, the 0.625 of the
  // beat it borrowed time from), and MidiFileGenerator reads these two fields
  // directly, so the exact ticks overwrite whatever finish() derived.
  for (const bar of staff.bars) {
    let tick = 0;
    for (const beat of bar.voices[0].beats) {
      beat.playbackStart = tick;
      beat.playbackDuration = ticksOf(tabBeatOf.get(beat)!);
      tick += beat.playbackDuration;
    }
  }
  return score;
}
