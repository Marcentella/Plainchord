// This file is the whole surface where alphaTab is ever imported — see
// FEATURES.md: it's used only as a binary parser, never its own renderer.
// Every consumer reaches it through a dynamic import() (see
// app/tablatura/page.tsx), so alphaTab's code only ever loads into the
// browser bundle when someone actually drops/picks a Guitar Pro file —
// the far more common plain-text path never pays for it.
import { importer, model, Settings } from "@coderline/alphatab";
import type { Tab, TabBeat, TabNote, TechniqueSymbol } from "./tab";

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

/** Maps one alphaTab Note's effects onto our glossary's technique symbols. Returns `null` for any effect this glossary has no symbol for yet — the note still renders, just untagged. */
function noteTechniques(note: model.Note): { techniques: TechniqueSymbol[]; hadUnmappedEffect: boolean } {
  const techniques: TechniqueSymbol[] = [];
  let hadUnmappedEffect = false;

  if (note.isDead) techniques.push("x");
  if (note.isPalmMute) techniques.push("PM");
  if (note.harmonicType === model.HarmonicType.Pinch) techniques.push("PH");
  else if (note.harmonicType !== model.HarmonicType.None) hadUnmappedEffect = true;
  if (note.vibrato !== model.VibratoType.None) techniques.push("~");
  // bendTo (a target fret number, like plain text's "7b9") is deliberately
  // left unset: alphaTab's BendPoint.value is documented only as "1/4 note
  // value offsets" — ambiguous enough (quarter-tone units? semitone units?)
  // that converting it to a fret offset without a real bent .gp fixture to
  // verify against risks showing a confidently wrong number. The "b" tag
  // itself (and the glossary popup it opens) is still accurate either way.
  if (note.hasBend) techniques.push("b");
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

  return { techniques, hadUnmappedEffect };
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
        const { techniques, hadUnmappedEffect } = noteTechniques(note);
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
        };
      });

      if (beatHasUnmappedEffect(beat)) unmappedTechniques++;
      beats.push({ position: beats.length, bar: barIndex, notes });
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
  };

  return { ok: true, tab, unmappedTechniques };
}

export async function importGuitarProFile(bytes: Uint8Array): Promise<ImportGuitarProResult> {
  let score: model.Score;
  try {
    score = importer.ScoreLoader.loadScoreFromBytes(bytes, new Settings());
  } catch {
    return { ok: false, error: "corruptFile" };
  }
  return scoreToTab(score);
}
