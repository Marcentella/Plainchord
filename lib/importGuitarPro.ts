// This file is the whole surface where alphaTab is ever imported — see
// FEATURES.md: it's used only as a binary parser, never its own renderer.
// Every consumer reaches it through a dynamic import() (see
// app/tablatura/page.tsx), so alphaTab's code only ever loads into the
// browser bundle when someone actually drops/picks a Guitar Pro file —
// the far more common plain-text path never pays for it.
import { importer, model, Settings } from "@coderline/alphatab";
import type { Tab, TabBeat, TabNote, TechniqueSymbol } from "./tab";

// alphaTab's fixed MIDI resolution for a quarter note — confirmed
// empirically against the real parser (a quarter's playbackDuration is
// 960 ticks, an eighth's is 480, a whole's is 3840, a 2/3-compressed
// triplet eighth's is 320, etc. — no exported constant for this in
// alphaTab's own .d.ts to import instead). playbackDuration is already
// fully resolved (dots, tuplets, and grace notes all baked in by alphaTab
// itself), so dividing by this is the whole conversion to quarter-note
// units — no need to hand-roll duration+dots+tuplet math ourselves.
const MIDI_TICKS_PER_QUARTER_NOTE = 960;

/**
 * staff.tuning is ordered "most top tablature line first" — i.e. highest
 * string to lowest, the opposite of how a tuning reads out loud or gets
 * written anywhere else ("E A D G B E", low to high). Reversed here so the
 * displayed order matches that convention; note names only (no octave —
 * "E4 B3 G3 D3 A2 E2" is noisier than "E A D G B E" needs to be for a
 * one-line subtitle).
 */
function tuningNames(staff: model.Staff): string[] {
  return [...staff.tuning].reverse().map((value) => model.Tuning.getTextForTuning(value, false));
}

export type ImportGuitarProResult =
  | { ok: true; tab: Tab; unmappedTechniques: number }
  | { ok: false; error: "corruptFile" | "wrongStringCount" };

/** First staff, across every track, that's a standard 6-string guitar. */
function findSixStringStaff(score: model.Score): model.Staff | null {
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      if (staff.tuning.length === 6) return staff;
    }
  }
  return null;
}

/**
 * h/p direction isn't a separate alphaTab field — both share one
 * "hammerPullOrigin/Destination" pair, same as real notation using one
 * slur for both. Ascending fret reads as a hammer-on, everything else
 * (descending or equal) as a pull-off — mirrors lib/parseTab.ts's own
 * plain-text convention.
 */
function hammerPullSymbol(origin: model.Note, destination: model.Note): TechniqueSymbol {
  return destination.fret > origin.fret ? "h" : "p";
}

// Every alphaTab bend type falls into exactly one of these three buckets —
// verified against 4,398 real bent notes across a real test corpus, and
// against real bendPoints examples for each of the three non-obvious types
// (Release/BendRelease/Hold/PrebendRelease) pulled from that same corpus:
//
// - RISES to a peak during the note (draw the existing upward arrow +
//   amount label): Bend 61.3%, Custom 24.9%, Prebend 11.2%, PrebendBend
//   0.2%, BendRelease 1.3% (real shape [0,4,4,0] — rises then releases
//   within one note, self-contained; the "then releases" part isn't drawn,
//   but showing the peak it reaches is still accurate and needs nothing new).
// - ARRIVES already at a peak and releases DOWN (draw a downward arrow, no
//   label — the amount was already shown on whichever earlier note it's
//   releasing from): Release 0.1%, PrebendRelease 0.4% (real shape [4,0] —
//   these genuinely need cross-note context to be correct, which is exactly
//   what makes them a different case from BendRelease above).
// - HOLDS constant, no change at all (draw nothing, parenthesize the fret
//   digit instead — see bendHold on TabNote): Hold 0.6% (real shape [4,4]).
const BEND_TYPES_RISING = new Set<model.BendType>([
  model.BendType.Bend,
  model.BendType.Custom,
  model.BendType.Prebend,
  model.BendType.PrebendBend,
  model.BendType.BendRelease,
]);
const BEND_TYPES_RELEASING = new Set<model.BendType>([model.BendType.Release, model.BendType.PrebendRelease]);

/**
 * The bend's peak height above the note's own open/written pitch, in
 * quarter-tones — alphaTab's own BendPoint.value units, which despite the
 * "1/4 note value offsets" doc wording really do mean quarter-tone pitch
 * steps (4 = a full step, 2 = a half step), confirmed against the same real
 * corpus: values cluster cleanly at 1/2/3/4/6/8/12, exactly Guitar Pro's own
 * Quarter/Half/3-4/Full/1half/FullFull/3-whole bend presets. Peak, not
 * "end minus start": neither a Prebend's nor a releasing bend's points rise
 * during the note the way a plain Bend's do, so only the peak reads the same
 * way for every bend type this covers (everything except Hold, which has no
 * arrow to size at all — see bendHold).
 */
function bendAmountFor(note: model.Note): number | undefined {
  if (!note.bendPoints || note.bendPoints.length === 0) return undefined;
  if (!BEND_TYPES_RISING.has(note.bendType) && !BEND_TYPES_RELEASING.has(note.bendType)) return undefined;
  const amount = Math.max(...note.bendPoints.map((p) => p.value));
  return amount > 0 ? amount : undefined;
}

/** Maps one alphaTab Note's effects onto our glossary's technique symbols. Returns `null` for any effect this glossary has no symbol for yet — the note still renders, just untagged. */
function noteTechniques(note: model.Note): {
  techniques: TechniqueSymbol[];
  hadUnmappedEffect: boolean;
  bendTo?: number;
  bendAmount?: number;
  bendReleasing?: boolean;
  bendHold?: boolean;
} {
  const techniques: TechniqueSymbol[] = [];
  let hadUnmappedEffect = false;
  let bendTo: number | undefined;
  let bendAmount: number | undefined;
  let bendReleasing: boolean | undefined;
  let bendHold: boolean | undefined;

  if (note.isDead) techniques.push("x");
  if (note.isPalmMute) techniques.push("PM");
  // Artificial/Semi/Feedback (alphaTab's remaining HarmonicType members)
  // stay unmapped for now, same as any other technique without a glossary
  // symbol yet — only the three most common types get their own symbol.
  if (note.harmonicType === model.HarmonicType.Pinch) techniques.push("PH");
  else if (note.harmonicType === model.HarmonicType.Natural) techniques.push("NH");
  else if (note.harmonicType === model.HarmonicType.Tap) techniques.push("TH");
  else if (note.harmonicType !== model.HarmonicType.None) hadUnmappedEffect = true;
  if (note.vibrato !== model.VibratoType.None) techniques.push("~");
  if (note.hasBend) {
    techniques.push("b");
    if (note.bendType === model.BendType.Hold) {
      // Nothing changes during this note at all — it's purely continuing
      // whatever bend the previous note left off at, so there's no amount
      // to draw an arrow for. TabRenderer parenthesizes the fret digit
      // instead (see TabNote.bendHold).
      bendHold = true;
    } else {
      bendAmount = bendAmountFor(note);
      if (bendAmount != null) {
        if (BEND_TYPES_RELEASING.has(note.bendType)) {
          bendReleasing = true; // downward arrow, no bendTo — see BEND_TYPES_RELEASING above
        } else if (bendAmount % 2 === 0 && !note.isDead) {
          // Only when it lands on a whole fret (an even quarter-tone count
          // — a half-step multiple): a quarter-tone bend (odd count) has no
          // fret to point bendTo at, same limitation lib/parseTab.ts's own
          // "7b9" notation already has (a written target is always a whole
          // fret).
          bendTo = note.fret + bendAmount / 2;
        }
      }
    }
  }
  if (note.isGhost && !note.isDead) hadUnmappedEffect = true;
  if (note.isLeftHandTapped) hadUnmappedEffect = true; // opposite hand from the glossary's "Tapping" (right-hand) — see the technique mapping table in the plan
  if (note.accentuated !== model.AccentuationType.None) hadUnmappedEffect = true;
  if (note.isStaccato) hadUnmappedEffect = true;
  if (note.isLetRing) hadUnmappedEffect = true;
  if (note.slideInType !== model.SlideInType.None) hadUnmappedEffect = true;

  // Shift/Legato (a slide that connects to a real target note) is tagged on
  // that target note instead — see the caller's loop, which reads
  // note.slideOrigin on the arriving note.
  if (note.slideOutType === model.SlideOutType.OutUp || note.slideOutType === model.SlideOutType.OutDown) {
    techniques.push("/"); // slides off with no destination note — tag the origin itself
  } else if (
    note.slideOutType === model.SlideOutType.PickSlideUp ||
    note.slideOutType === model.SlideOutType.PickSlideDown
  ) {
    hadUnmappedEffect = true; // a pick drag, not the glossary's fretting-hand slide
  }

  return { techniques, hadUnmappedEffect, bendTo, bendAmount, bendReleasing, bendHold };
}

/**
 * Effects that live on the Beat itself, not any one Note — noteTechniques
 * can't see these at all, so before this they didn't just lack a glossary
 * symbol, they didn't even reach the unmappedTechniques count (zero signal
 * to the user that anything was dropped). Checked once per beat by the
 * caller below, not once per note in it, so a 3-note chord with one
 * tremolo-picked beat adds exactly 1 to unmappedTechniques, not 3. Same
 * "still renders, just untagged" contract as noteTechniques — no glossary
 * symbol for any of these yet.
 */
function beatHasUnmappedEffect(beat: model.Beat): boolean {
  return (
    beat.isTremolo ||
    beat.hasWhammyBar ||
    beat.brushType !== model.BrushType.None ||
    beat.pickStroke !== model.PickStroke.None ||
    beat.golpe !== model.GolpeType.None ||
    beat.pop ||
    beat.slap ||
    beat.tap ||
    beat.graceType !== model.GraceType.None ||
    beat.deadSlapped ||
    beat.fade !== model.FadeType.None
  );
}

/**
 * The Score -> Tab mapping itself, split out from `importGuitarProFile` so
 * it can be exercised directly in tests against a `Score` built via
 * alphaTab's own `importer.ScoreLoader.loadAlphaTex` — much easier to get
 * right than hand-crafting real .gp3/4/5/x binary fixtures, and it's the
 * exact same `Score` shape either way (alphaTex is one of alphaTab's own
 * import formats, not a stand-in).
 */
export function scoreToTab(score: model.Score): ImportGuitarProResult {
  const staff = findSixStringStaff(score);
  if (!staff) return { ok: false, error: "wrongStringCount" };

  const beats: TabBeat[] = [];
  let unmappedTechniques = 0;

  staff.bars.forEach((bar, barIndex) => {
    const voice = bar.voices[0];
    if (!voice) return;

    for (const beat of voice.beats) {
      const notes: TabNote[] = beat.notes.map((note) => {
        const { techniques, hadUnmappedEffect, bendTo, bendAmount, bendReleasing, bendHold } = noteTechniques(note);
        if (hadUnmappedEffect) unmappedTechniques++;

        // h/p/slide tags land on the ARRIVING note, same convention as
        // lib/parseTab.ts — a backward reference (hammerPullOrigin/
        // slideOrigin) is only set on the note that's actually arriving.
        if (note.hammerPullOrigin) {
          techniques.push(hammerPullSymbol(note.hammerPullOrigin, note));
        }
        if (
          note.slideOrigin &&
          (note.slideOrigin.slideOutType === model.SlideOutType.Shift ||
            note.slideOrigin.slideOutType === model.SlideOutType.Legato)
        ) {
          techniques.push("/");
        }

        return {
          string: note.string - 1, // alphaTab: 1 = lowest string, same order as ours — just offset by one
          fret: note.isDead ? null : note.fret,
          techniques,
          ...(bendTo != null && { bendTo }),
          ...(bendAmount != null && { bendAmount }),
          ...(bendReleasing && { bendReleasing }),
          ...(bendHold && { bendHold }),
        };
      });

      if (beatHasUnmappedEffect(beat)) unmappedTechniques++;
      beats.push({
        position: beats.length,
        bar: barIndex,
        notes,
        duration: beat.playbackDuration / MIDI_TICKS_PER_QUARTER_NOTE,
      });
    }
  });

  const tab: Tab = {
    beats,
    // Guitar Pro files always carry title/artist fields, but plenty of
    // real-world files just leave them blank — an empty string isn't
    // meaningfully different from "not set" for display purposes, so both
    // fall back to the same undefined the plain-text path already leaves
    // these as, rather than the header showing a blank line.
    title: score.title || undefined,
    artist: score.artist || undefined,
    tempo: score.tempo,
    tuning: tuningNames(staff),
    timeSignature: score.masterBars[0]
      ? {
          numerator: score.masterBars[0].timeSignatureNumerator,
          denominator: score.masterBars[0].timeSignatureDenominator,
        }
      : undefined,
  };

  return { ok: true, tab, unmappedTechniques };
}

// alphaTab's own default (Settings.importer.encoding, 'utf-8') assumes the
// GP3-7/MusicXML text fields are UTF-8 — real Guitar Pro files predate that
// being true. Guitar Pro is (and long was) a Windows-native app, and wrote
// title/artist/etc. in whatever 8-bit codepage Windows itself used, which
// for the vast majority of non-English users is windows-1252 (Western
// European — covers ä/ö/ü/ñ/é and friends). A byte like ä's 0xE4 isn't a
// valid standalone UTF-8 sequence on its own, so decoding it as UTF-8
// fails and falls back to the U+FFFD replacement character — the diamond
// "?" the import showed for "Tränen". windows-1252 is a real TextDecoder
// label (browser support, not alphaTab's own code), and is a superset of
// ISO-8859-1 for the printable range that matters here.
function importSettings(): Settings {
  const settings = new Settings();
  settings.importer.encoding = "windows-1252";
  return settings;
}

export async function importGuitarProFile(bytes: Uint8Array): Promise<ImportGuitarProResult> {
  let score: model.Score;
  try {
    score = importer.ScoreLoader.loadScoreFromBytes(bytes, importSettings());
  } catch {
    return { ok: false, error: "corruptFile" };
  }
  return scoreToTab(score);
}
