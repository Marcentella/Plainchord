"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref, type PointerEvent as ReactPointerEvent } from "react";
import type { Tab, TabBeat, TabNote, TechniqueSymbol } from "@/lib/tab";
import { CONNECTING_TECHNIQUES } from "@/lib/tab";
import { groupIntoBars } from "@/lib/groupIntoBars";
import { allGlossaryEntries } from "@/lib/glossary";
import type { BeatLocation } from "@/lib/playhead";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";
import TechniquePopup from "@/components/TechniquePopup";
import { t } from "@/i18n";

export type TabRendererHandle = {
  setPlayheadPosition: (location: BeatLocation | null, animate?: boolean) => void;
  setPlayheadProgress: (progress: BeatLocation & { fraction: number }) => void;
};

const COL_W = 32;
const STRING_GAP = 20;
const PAD_Y = 14;
// How much of the headroom's own top is set aside for the vibrato mark
// (see VIBRATO_Y below) — pushes the bend label/arrow down by this much so
// there's genuine empty space above them for it, rather than fighting the
// label for the same few pixels.
const VIBRATO_ROOM = 8;
// Reserved above every bar's top string line, always — not just bars that
// happen to have a bend. Bars in the same flex-wrapped row must keep their
// string lines aligned (that's the whole point of the seamless-staff look),
// so one bar being taller than its neighbors to fit a bend arrow would
// throw that off; giving every bar the same fixed headroom keeps them
// uniform regardless of what's actually in each one. Sized with real
// clearance below BEND_ARROWHEAD_BASE_Y (not just enough to reach it) —
// tried exactly enough once, and the top string's own bends ended up with a
// zero-length shaft, collapsing the arrow into a degenerate little shape at
// the arrowhead.
const BEND_HEADROOM = 34 + VIBRATO_ROOM;
// One arrow per BEAT, not per bent note — two notes bending together in the
// same beat (a very common double-stop bend: two strings pushed by the same
// finger, almost always by the same amount) share a single arrow instead of
// each getting their own. Landing every arrow at this same fixed height,
// regardless of which string(s) it's for, is what makes that possible: the
// shaft's bottom end is just wherever the LOWEST of this beat's bent notes
// sits, so the same line reads as pointing at all of them, whether there's
// one or several.
const BEND_LABEL_Y = PAD_Y + VIBRATO_ROOM + 8;
const BEND_ARROWHEAD_TIP_Y = PAD_Y + VIBRATO_ROOM + 14;
const BEND_ARROWHEAD_BASE_Y = PAD_Y + VIBRATO_ROOM + 18;
// A release-type bend (direction="down" in renderBendArrow) arrives already
// at its peak and comes back down during the note — real notation draws
// that as a curve connecting back to the rising bend it's releasing from
// (found via findPrecedingBendColIdx), not a mirrored copy of the rising
// arrow's own straight shaft. This is the curve's own starting offset — a
// few px diagonally down-right from the rising arrow's own tip, so the two
// read as one continuous gesture without literally sharing a vertex with
// that arrow's own arrowhead polygon (which would look like a coincidence,
// not an intentional join).
const BEND_RELEASE_GAP = 3;
// Where a harmonic-type technique's own text ("P.H.", "N.H.", "T.H.") sits
// above the staff — the headroom's own LOWER half, not sharing BEND_LABEL_Y's
// row (the upper half, where "Full" sits) — a beat can genuinely have both a
// bend AND a harmonic at once, so the two labels need their own separate
// rows. The squeeze is real: below BEND_ARROWHEAD_BASE_Y the arrowhead
// triangle's own tip pokes into the label (tried +4, the "P" clipped its
// left corner); at/below the top string's own cutout a harmonic on the
// highest string collides with its own label instead (tried right at the
// string line originally). +8 is the sliver between those two failures —
// still shares this one row with every harmonic label, bend or not, rather
// than carving out a special case just for the bend-arrow combination.
const HARMONIC_LABEL_Y = BEND_ARROWHEAD_BASE_Y + 8;
// A beat with a bend already has its arrow's shaft running straight down
// the note's own center x — nudging the harmonic label to START just right
// of that center, instead of centering it there like the bend-free case,
// keeps it legible next to the shaft instead of straddling it. Small on
// purpose (a first version used 4px): the note this most often lands on is
// the LAST beat of its bar (a bend's peak, released a beat or two later,
// often falls right at a phrase's end) — every bar is its own <svg>, which
// clips its own content at its own right edge, so anything pushed too far
// right runs straight into that boundary. See HARMONIC_LABEL_WIDTH below
// for how far right this can safely go on any given beat.
const HARMONIC_LABEL_BEND_OFFSET_X = 2;
// All three harmonic labels are the same length ("P.H.", "N.H.", "T.H."), so
// one fixed width estimate covers every case — unlike CUTOUT_CHAR_WIDTH
// (below), which has to handle genuinely different lengths (a connector
// prefix, a 1-2 digit fret) and so multiplies per character instead. SVG has
// no synchronous way to measure real rendered text width; this errs a
// little wide, the safe direction, same reasoning as CUTOUT_CHAR_WIDTH.
const HARMONIC_LABEL_WIDTH = 17;
// One mark per BEAT, same "shared, not per-note" reasoning as the bend
// arrow above — and always in this same fixed spot, whether or not the beat
// also has a bend. Originally drawn inline right after the fret digit, but
// that put it directly on top of the string line (every note already
// crosses the string at that exact y; the digit gets its own background
// cutout to punch a gap for it, the squiggle didn't), and for a
// connecting-technique note (h/p/slide) it also collided with the "p"/"h"
// prefix and the line to the next note — genuinely not enough horizontal
// room there. Above the staff sidesteps both: never touches the string, and
// never competes for space with anything horizontal.
const VIBRATO_Y = PAD_Y + 5;
// Every bar has this exact same height (see BEND_HEADROOM's own comment —
// it's deliberately uniform across bars). Used for bar/SVG layout — NOT the
// playhead/ghost pill's own height, see PLAYHEAD_HEIGHT below for why those
// are shorter.
const BAR_HEIGHT = PAD_Y + BEND_HEADROOM + 5 * STRING_GAP + PAD_Y;
// The playhead/ghost pill's own height and top offset — deliberately
// shorter than BAR_HEIGHT and NOT starting at the bar's own top. Spanning
// the full BAR_HEIGHT (as an earlier version did) meant the pill stuck out
// PAD_Y+BEND_HEADROOM (48px) above the top string but only PAD_Y (14px)
// below the bottom one — BEND_HEADROOM is reserved for a bend arrow, not
// for the pill itself, so on any beat without a bend the pill just read as
// an oversized cap towering over the actual notes. PLAYHEAD_TOP_MARGIN
// matches PAD_Y so the pill overhangs the staff by the same small amount on
// both sides, same "just a pinch" symmetry as the seek rail's own band.
const PLAYHEAD_TOP_MARGIN = PAD_Y;
const PLAYHEAD_HEIGHT = PLAYHEAD_TOP_MARGIN + 5 * STRING_GAP + PAD_Y;
// Where the pill's own top edge sits within a bar's local coordinates — the
// top string's own y (PAD_Y + BEND_HEADROOM) minus PLAYHEAD_TOP_MARGIN, so
// it starts that margin above the top string line instead of at the very
// top of the reserved bend-arrow headroom.
const PLAYHEAD_Y_OFFSET = PAD_Y + BEND_HEADROOM - PLAYHEAD_TOP_MARGIN;
// A hover-opened popup shouldn't close the instant the pointer leaves the
// note — the popup itself sits a few px away (see TechniquePopup's GAP), so
// moving the mouse toward it to read or scroll always crosses a gap that
// isn't the note. This grace period gives the pointer time to land on the
// popup (which cancels the close) before treating the hover as genuinely
// over; short enough to still feel near-instant when the pointer moves
// elsewhere instead of toward the popup. The real-world gap it has to cover
// is tiny (GAP=12px in TechniquePopup), so a fast, deliberate move across it
// takes far less than this.
const HOVER_CLOSE_DELAY = 120;
// Small background-color cutout so the string line (and a bend arrow's own
// shaft, when one passes through) doesn't run straight through a note's own
// digit. Still used for the bend arrow's vertical clearance below (a fixed
// value, unrelated to text width) — the cutout's own shape is now a
// dynamically-sized rect, not a fixed circle; see CUTOUT_CHAR_WIDTH below
// for why.
const CUTOUT_R = 6;
// A single digit ("7") fits the old fixed-radius circle fine, but a longer
// label doesn't: a connecting technique's own prefix plus a two-digit fret
// ("h10", 3 characters) is visibly wider than a 12px circle, so the string
// line shows through the characters that fall outside it — the same root
// cause the vibrato mark used to have when it lived inline (now fixed by
// moving it above the staff instead), just for a case that can't be moved
// anywhere: the fret digit has to stay where the note actually is. The
// cutout now sizes itself to the actual rendered text (connector prefix +
// label, the same string the <text> below renders) rather than assuming
// one character always fits. CUTOUT_CHAR_WIDTH is a generous fixed
// per-character estimate at fontSize 12 (not real text measurement — SVG
// has no synchronous way to get that without a post-render effect, and an
// estimate that errs a little wide is the safe direction here), and the
// result is capped so an extreme label (a connecting technique on a
// bend-hold's parenthesized double-digit fret, e.g. "h(10)") still can't
// bleed into a neighboring beat's own column.
const CUTOUT_CHAR_WIDTH = 7.5;
const CUTOUT_HEIGHT = CUTOUT_R * 2;
const CUTOUT_MAX_WIDTH = COL_W - 4;
// The accent mark's own point, offset right of the note's own center —
// mirrors the harmonic diamond's own outer bound on the LEFT (x-13..x-7, see
// noteEls below), just on the opposite side, so a note that's both accented
// and a harmonic doesn't fight itself for the same few px. A drawn chevron,
// not a text ">" character — same reason the bend arrowhead is plain SVG
// shapes rather than a Unicode arrow: guaranteed identical rendering
// everywhere, not left to font/platform differences. 9 read as touching a
// 2-digit fret's own right edge (a plain digit's cutout half-width alone is
// ~7.5px) — 13 gives it real clearance, same outer reach as the diamond.
const ACCENT_MARK_OFFSET = 13;
// Reserved below every bar, always, for the seek rail. Lives below rather
// than above for the same reason bend arrows only ever grow upward into
// BEND_HEADROOM: the space below the low-E string is unconditionally free
// of every technique glyph regardless of which string a bend lands on, so
// the rail can live there with no risk of ever colliding with one. Sized to
// PAD_Y itself, not BEND_HEADROOM — the tab should stick out below by the
// same small pinch it already sticks out above (PAD_Y, the breathing room
// before BEND_HEADROOM even starts), not the full headroom, which is sized
// for an arrow shaft plus a label the rail has no equivalent of.
const SEEK_RAIL_BAND = PAD_Y;
// A slim visible track, like every media player's scrubber. The invisible
// hit target fills the whole band — there's no spare room to make it taller
// than that without going back to the "long hat" look this was sized down
// from.
const SEEK_RAIL_VISUAL_HEIGHT = 4;
const SEEK_RAIL_HIT_HEIGHT = SEEK_RAIL_BAND;
// Where the rail's track/fill/thumb sit, in each bar's own local SVG
// coordinates — a fixed constant (not computed per-bar) since every bar
// shares the same BAR_HEIGHT and SEEK_RAIL_BAND.
const RAIL_Y = BAR_HEIGHT + (SEEK_RAIL_BAND - SEEK_RAIL_VISUAL_HEIGHT) / 2;
const RAIL_HIT_Y = BAR_HEIGHT + (SEEK_RAIL_BAND - SEEK_RAIL_HIT_HEIGHT) / 2;
// The single shared thumb dot's own diameter — a bit larger than the track
// itself so it reads clearly as "the current position," not just another
// segment of the track.
const RAIL_THUMB_SIZE = 10;

const CONNECTOR_LABEL: Record<string, string> = { h: "h", p: "p", "/": "/" };

// Every harmonic-type technique's own display text — the same "X.H."
// shorthand real tab notation (and alphaTab's own renderer) already uses.
// alphaTab also has Artificial/Semi/Feedback harmonic types with no entry
// here — they have no glossary symbol yet (see lib/importGuitarPro.ts's own
// harmonicType mapping), so they fall through cleanly: no label, no diamond,
// same as any other unmapped technique.
const HARMONIC_LABELS: Partial<Record<TechniqueSymbol, string>> = {
  PH: "P.H.",
  NH: "N.H.",
  TH: "T.H.",
};

/**
 * "Full", "1/2", "1 1/2", etc. from a raw quarter-tone amount (lib/tab.ts's
 * TabNote.bendAmount — 4 = a full step, alphaTab's own unit) — a plain
 * formula instead of a lookup table, since it falls out directly from the
 * quarter-tones-per-whole-step math rather than needing every value
 * enumerated by hand. Plain "1/4"-style text, not the ¼ ½ ¾ Unicode glyphs —
 * those render as genuinely tiny, hard-to-read shapes at small sizes (this
 * app already avoids exactly this class of font-rendering inconsistency
 * elsewhere, see CLAUDE.md's lucide-react-not-emoji rule and the bend
 * arrow's own use of plain SVG shapes over a Unicode arrow character).
 */
function bendLabel(amount: number): string {
  const whole = Math.floor(amount / 4);
  const fraction = ["", "1/4", "1/2", "3/4"][amount % 4];
  if (whole === 0) return fraction;
  if (whole === 1 && !fraction) return "Full";
  return fraction ? `${whole} ${fraction}` : `${whole}`;
}

/**
 * The one shared arrow's label for every bent note in a beat — almost
 * always just one amount (a double-stop bend's two strings are pushed by
 * the same finger, so they're the same amount far more often than not),
 * but joins distinct amounts with the same " · " separator the header's own
 * subtitle already uses, rather than picking just one and hiding the rest,
 * for the rarer case where they genuinely differ.
 */
function bendGroupLabel(amounts: number[]): string {
  return [...new Set(amounts)].map(bendLabel).join(" · ");
}

/**
 * Reorders a note's own techniques so "b" (bend) comes first — used only
 * when opening the popup FROM the bend arrow itself, not from the note's
 * own digit. Hovering a note's digit can reasonably show its techniques in
 * whatever order they were tagged (e.g. pinch harmonic before bend); but
 * hovering the bend arrow specifically is an unambiguous request for bend
 * info, so that popup should lead with Bend rather than whatever else
 * happens to be stacked on the same note.
 */
function withBendFirst(note: TabNote): TabNote {
  if (!note.techniques.includes("b")) return note;
  return { ...note, techniques: ["b", ...note.techniques.filter((t) => t !== "b")] };
}

/**
 * The nearest earlier beat, within the same bar, whose note on this string
 * is a rising bend — what a release-type bend's own curve connects back to
 * (see renderBendArrow's "down" branch). Scoped to the current bar on
 * purpose: reaching into a previous bar would mean spanning two separate
 * <svg> elements in two separate local coordinate systems, which a single
 * path can't do (the same reason the playhead itself became a single
 * page-coordinate overlay instead of one element per bar). null when there
 * genuinely isn't one in this bar — the caller falls back to a plain arrow.
 */
function findPrecedingBendColIdx(bar: TabBeat[], beforeColIdx: number, string: number): number | null {
  for (let i = beforeColIdx - 1; i >= 0; i--) {
    if (bar[i].notes.some((n) => n.string === string && n.bendAmount != null && !n.bendReleasing)) return i;
  }
  return null;
}

/**
 * The display label for whichever harmonic-type technique a note carries
 * (P.H., N.H., T.H.) — null for a note with none, so both the notehead
 * diamond and the above-staff text share this one lookup instead of
 * checking each symbol by hand in two places.
 */
function harmonicNoteLabel(note: TabNote): string | null {
  for (const technique of note.techniques) {
    const label = HARMONIC_LABELS[technique];
    if (label) return label;
  }
  return null;
}

function noteAriaLabel(note: TabNote): string {
  const label = note.fret === null ? t("tab.deadNoteLabel") : String(note.fret);
  const names = note.techniques
    .map((symbol) =>
      // More specific than the glossary's generic "Bend" name once the
      // actual amount is known — same info the arrow shows visually.
      symbol === "b" && note.bendAmount != null
        ? `${bendLabel(note.bendAmount)} bend`
        : allGlossaryEntries.find((e) => e.symbol === symbol)?.name,
    )
    .filter((n): n is string => !!n);
  return names.length ? `${label} — ${names.join(", ")}` : label;
}

type Selected = {
  note: TabNote;
  anchor: { x: number; top: number; bottom: number };
  // Hover is a lightweight peek and closes itself on mouse-leave; a click
  // or keyboard-open is deliberate and needs an explicit dismissal
  // (Escape / outside click), same as before this distinction existed.
  openedVia: "hover" | "click";
};

export default function TabRenderer({
  tab,
  ref,
  onSeek,
}: {
  tab: Tab;
  ref?: Ref<TabRendererHandle>;
  // Fires on a committed seek — a rail click/drag/keyboard-Enter, or a click
  // on the notation itself outside any technique's own hit area (see the
  // per-beat "notation seek-through" rect below). Optional: the blurred
  // reimport-snapshot TabRenderer in app/tablatura/page.tsx has no playhead
  // at all, so it never passes this.
  onSeek?: (location: BeatLocation) => void;
}) {
  const bars = groupIntoBars(tab.beats);
  const [selected, setSelected] = useState<Selected | null>(null);
  // True while the popup is fading out but still mounted. `selected` itself
  // can't just go straight to null on close — TechniquePopup needs to stay
  // rendered for its own fade-out transition to play at all, the same
  // "keep it mounted a beat longer" idea as app/page.tsx's chord-card exit,
  // just for a single item instead of a list.
  const [closing, setClosing] = useState(false);
  // Pending "close after leaving hover" — cancelled if the pointer lands
  // back on the note or on the popup itself before it fires.
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Playhead: driven entirely outside React state (see lib/usePlayhead.ts's
  // own comment) — these refs are mutated directly from the imperative
  // handle below, never trigger a render themselves.
  //
  // ONE overlay element, not one per bar. An earlier version gave every bar
  // its own <rect> in its own bar-local <svg>, faded between them at a bar
  // crossing — two real bugs came from that: (1) different bars' rects
  // never got their position reset when hidden, so re-entering a bar showed
  // it glide in from wherever it was last left, not from the entry beat;
  // (2) more fundamentally, two separate DOM elements in two separate SVG
  // coordinate spaces can't share one continuous CSS transition — crossing
  // between bars was always going to be a hard cut no matter how the
  // transition was tuned. A single element positioned in real page
  // coordinates (via getBoundingClientRect, not a bar's local SVG space)
  // fixes both: there's only ever one position to be stale, and it can
  // glide continuously to literally anywhere, including across a wrapped
  // row, with the exact same transition doing all the work every time.
  const playheadRef = useRef<HTMLDivElement>(null);
  // Nested inside playheadRef — carries the pill's own visible styling and a
  // separate transform (translateX only, within its own beat's COL_W-wide
  // slot) for the within-beat creep. Split into two elements specifically so
  // the creep's per-frame, transition-free writes can never fight the outer
  // element's own transition-driven beat-to-beat glide — see
  // setPlayheadProgress and setPlayheadPosition's own comments.
  const playheadCreepRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const svgRefs = useRef<Map<number, SVGSVGElement>>(new Map());
  const activeBarRef = useRef<number | null>(null);
  // The seek rail's own visuals — a ghost preview overlay (same shape as
  // playheadRef, hollow instead of solid), each bar's own progress fill
  // (muted, not accent — this is "already played," not the current
  // position), and ONE shared thumb dot marking the current/candidate
  // position. The thumb is deliberately a single page-coordinate overlay
  // like playheadRef/ghostRef, not one per bar: an earlier version gave
  // every bar its own thumb, defaulting to each unplayed bar's own left
  // edge — which read as a scatter of small dots down the whole rail
  // instead of one clear marker, the same one-rect-per-bar mistake the
  // playhead itself already learned not to repeat (see its own comment
  // above). All driven imperatively for the exact same reason playheadRef
  // is: rapid pointermove events during a drag would otherwise force React
  // re-renders at that frequency across the whole notation tree.
  const ghostRef = useRef<HTMLDivElement>(null);
  const railFillRefs = useRef<Map<number, SVGRectElement>>(new Map());
  const railThumbRef = useRef<HTMLDivElement>(null);
  // The playhead's real current location (not just its bar — colIdx too),
  // kept in sync by setPlayheadPosition below. Needed so a hover-leave or an
  // aborted drag can restore the rail's fill to what's actually playing,
  // not just clear it to zero.
  const currentLocationRef = useRef<BeatLocation | null>(null);
  // True only between a rail pointerdown and its matching up/cancel — gates
  // pointermove so it only drives the continuous drag-tracking path, not the
  // discrete hover one.
  const draggingRef = useRef(false);
  // Set right after a rail pointerup/pointercancel genuinely resolves a
  // gesture (committed or not) — and checked, then cleared, by the same
  // rect's onClick. Needed because setPointerCapture makes the browser
  // treat pointerdown+pointerup on the captured element as a completed
  // click, so a real drag (press on beat A, release on beat B) still fires
  // a click afterward on beat A's own rect — and since that onClick closes
  // over beat A's fixed barIdx/colIdx, it would silently re-seek back to
  // the press point, undoing whatever the release point (the correct one)
  // just committed. This flag lets onClick recognize "the pointer path
  // already handled this gesture" and skip, rather than re-firing a stale
  // seek. onClick still needs its own commit path for input that never
  // goes through pointer events at all (e.g. assistive tech).
  const pointerHandledRef = useRef(false);
  const reducedMotion = usePrefersReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  // `bars` itself, mirrored into a ref for the same reason reducedMotionRef
  // exists: useImperativeHandle's factory below has empty deps (everything
  // it used to touch was refs, safe to close over once at mount), but the
  // rail-fill helpers it now also calls need this bar-lengths data — reading
  // it as a plain closed-over value would pin it to whatever `bars` was on
  // the very first render, going stale the moment a new tab changes it.
  const barsRef = useRef(bars);
  // Keeps both refs current without writing to them during render — runs
  // after every commit instead (same pattern as lib/usePlayhead.ts's own
  // barsRef).
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
    barsRef.current = bars;
  });

  // Shared by the real playhead and the ghost preview — both are one shared
  // overlay div positioned via translate() from a bar's own real on-screen
  // rect (not bar-local SVG coordinates), so either can glide continuously
  // to literally anywhere, including across a wrapped row.
  function positionOverlay(el: HTMLDivElement, location: BeatLocation): boolean {
    const wrapper = wrapperRef.current;
    const barSvg = svgRefs.current.get(location.barIdx);
    if (!wrapper || !barSvg) return false;
    const wrapperRect = wrapper.getBoundingClientRect();
    const barRect = barSvg.getBoundingClientRect();
    const x = barRect.left - wrapperRect.left + location.colIdx * COL_W;
    const y = barRect.top - wrapperRect.top + PLAYHEAD_Y_OFFSET;
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.setProperty("opacity", "1");
    return true;
  }

  // Every bar strictly before targetBarIdx reads fully played (muted, not
  // accent — this is "already played," not "here right now," see the
  // rail-fill's own JSX comment), targetBarIdx itself fills to `fraction`
  // (colIdx/bar.length), every bar after is empty. targetBarIdx=-1 (used to
  // clear everything on stop/reset) falls through every comparison to 0 for
  // every bar, with no separate branch needed. Only ever called with a real,
  // committed position — never during a live hover/drag preview, which
  // moves the thumb (below) instead of the fill.
  function updateRailFill(targetBarIdx: number, fraction: number) {
    for (const [barIdx, fillRect] of railFillRefs.current) {
      const barWidth = barsRef.current[barIdx].length * COL_W;
      const width = barIdx < targetBarIdx ? barWidth : barIdx === targetBarIdx ? fraction * barWidth : 0;
      fillRect.style.width = `${width}px`;
    }
  }

  // The rail's own committed fill/dot position — anchored to the middle of
  // the currently-sounding beat, not its raw start. The notation's own pill
  // continuously creeps through the beat in real time (setPlayheadProgress),
  // so a rail anchored to the beat's bare start reads as meaningfully behind
  // the pill for the beat's whole first half, catching up only right before
  // it snaps ahead again — a real, noticed "lagging" look during playback.
  // The midpoint doesn't fix that (the rail still only moves in per-beat
  // jumps, unlike the pill), but it halves the worst-case mismatch: ahead by
  // half a beat's width right at the start, behind by half a beat's width
  // right at the end, instead of a full beat's width of lag every time.
  function committedRailFraction(barIdx: number, colIdx: number): number {
    return (colIdx + 0.5) / barsRef.current[barIdx].length;
  }

  // Toggles the thumb's own transition directly on the element (inline,
  // not a class) — set true right before any hover/drag preview position,
  // false only once a tracking session (hover or drag) truly ends. Inline
  // rather than a "rail-tracking" class toggled on a shared ancestor: a
  // class relies on the browser committing that style change before the
  // next transform write is *also* committed, and a hover/drag session can
  // move fast enough (sibling rail-hit rects firing leave/enter, or a
  // captured pointer's own rapid pointermove) that the two easily end up
  // batched into the same style recalculation — the net effect reads as
  // the dot visibly gliding to each new hover target instead of snapping.
  // Setting `transition` directly on the exact element being moved, in the
  // exact same call that's about to move it, leaves nothing to batch.
  function setRailThumbTracking(tracking: boolean) {
    const thumb = railThumbRef.current;
    if (thumb) thumb.style.transition = tracking ? "none" : "";
  }

  // The single shared thumb — positioned in real page coordinates exactly
  // like playheadRef/ghostRef, not per bar (see the ref's own comment for
  // why). `fraction` can be continuous (a live hover/drag preview) or
  // discrete (colIdx/bar.length, a committed position); either way this is
  // the only place that moves it.
  function positionRailThumb(barIdx: number, fraction: number) {
    const thumb = railThumbRef.current;
    const wrapper = wrapperRef.current;
    const barSvg = svgRefs.current.get(barIdx);
    if (!thumb || !wrapper || !barSvg) return;
    const wrapperRect = wrapper.getBoundingClientRect();
    const barRect = barSvg.getBoundingClientRect();
    const barWidth = barsRef.current[barIdx].length * COL_W;
    const x = barRect.left - wrapperRect.left + fraction * barWidth;
    const y = barRect.top - wrapperRect.top + RAIL_Y + SEEK_RAIL_VISUAL_HEIGHT / 2;
    thumb.style.transform = `translate(${x}px, ${y}px)`;
    thumb.style.setProperty("opacity", "1");
  }

  function hideRailThumb() {
    railThumbRef.current?.style.setProperty("opacity", "0");
  }

  function restoreRailToCurrent() {
    const loc = currentLocationRef.current;
    if (loc) {
      const fraction = committedRailFraction(loc.barIdx, loc.colIdx);
      updateRailFill(loc.barIdx, fraction);
      positionRailThumb(loc.barIdx, fraction);
    } else {
      updateRailFill(-1, 0);
      hideRailThumb();
    }
  }

  function showGhostAt(location: BeatLocation) {
    const ghost = ghostRef.current;
    if (ghost) positionOverlay(ghost, location);
  }

  function hideGhost() {
    ghostRef.current?.style.setProperty("opacity", "0");
  }

  // The rail is a smooth drag surface but seeking only ever lands on a
  // beat — this is the "which beat is the pointer nearest" resolver for
  // both the ghost preview and the eventual seek commit. Deliberately NOT
  // plain 2D nearest-rect distance: with bars wrapping into multiple rows,
  // that makes a drag moving right past a row's last bar "stick" there
  // instead of continuing into the next row, since the last bar is
  // physically closer by raw distance than the next row's first bar. This
  // instead treats it the way text selection treats wrapped lines: find the
  // row nearest the pointer's Y, then within that row either locate the
  // bar under the pointer's X or, if the pointer is past either end of the
  // row, wrap to the adjacent beat in chronological (bar/beat) order — not
  // just clamp at that row's own edge.
  function nearestBeatAtPoint(clientX: number, clientY: number): { barIdx: number; colIdx: number; fraction: number } | null {
    const entries = Array.from(svgRefs.current.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([barIdx, svg]) => ({ barIdx, rect: svg.getBoundingClientRect() }));
    if (entries.length === 0) return null;

    const rows: (typeof entries)[] = [];
    for (const entry of entries) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(row[0].rect.top - entry.rect.top) < 2) row.push(entry);
      else rows.push([entry]);
    }

    let targetRow = rows[0];
    let bestRowDist = Infinity;
    for (const row of rows) {
      const { top, bottom } = row[0].rect;
      const dist = clientY < top ? top - clientY : clientY > bottom ? clientY - bottom : 0;
      if (dist < bestRowDist) {
        bestRowDist = dist;
        targetRow = row;
      }
    }
    const rowIndex = rows.indexOf(targetRow);
    const first = targetRow[0];
    const last = targetRow[targetRow.length - 1];

    if (clientX < first.rect.left) {
      const prevRow = rows[rowIndex - 1];
      if (prevRow) {
        const prevBar = prevRow[prevRow.length - 1];
        return { barIdx: prevBar.barIdx, colIdx: barsRef.current[prevBar.barIdx].length - 1, fraction: 1 };
      }
      return { barIdx: first.barIdx, colIdx: 0, fraction: 0 };
    }
    if (clientX > last.rect.right) {
      const nextRow = rows[rowIndex + 1];
      if (nextRow) return { barIdx: nextRow[0].barIdx, colIdx: 0, fraction: 0 };
      return { barIdx: last.barIdx, colIdx: barsRef.current[last.barIdx].length - 1, fraction: 1 };
    }

    const target = targetRow.find((e) => clientX >= e.rect.left && clientX <= e.rect.right) ?? last;
    const fraction = Math.min(1, Math.max(0, (clientX - target.rect.left) / target.rect.width));
    const targetBarLength = barsRef.current[target.barIdx].length;
    const colIdx = Math.min(targetBarLength - 1, Math.max(0, Math.round(fraction * targetBarLength)));
    return { barIdx: target.barIdx, colIdx, fraction };
  }

  // Every way a seek can actually commit (rail pointerup, a plain click with
  // no real drag, keyboard Enter/Space) routes through here — the one place
  // that both hides the ghost and fires onSeek, so a leftover hover/drag
  // preview can never survive a commit no matter which input path triggered
  // it. Discovered live: onClick and onPointerUp can each fire somewhat
  // independently depending on the input method, and a version that only
  // hid the ghost inside the pointerup handler left it stuck on screen when
  // a commit arrived via onClick instead.
  function commitSeek(location: BeatLocation) {
    hideGhost();
    onSeek?.(location);
    // A clicked (or keyboard-activated) rail segment stays the focused
    // element in Chrome afterward — so a later, unrelated Space press meant
    // for the global play/pause shortcut (app/tablatura/page.tsx) lands on
    // THIS element first and re-fires its own onKeyDown, silently re-
    // seeking back to this exact spot before the page's own handler even
    // runs. Blurring whatever's focused right after a seek commits means
    // there's nothing left to catch that later keypress — same fix applied
    // in openFrom below for the same reason.
    (document.activeElement as HTMLElement | SVGElement | null)?.blur?.();
  }

  // Ghost + dot together, snapped to the exact beat pressed — the dot then
  // tracks continuously from here via handleRailDragMove's own pointermove.
  // Only a drag moves the dot at all; plain hover only shows the ghost (see
  // the rail-hit rect's own onPointerEnter) — an earlier version also
  // snapped the dot to whichever beat was hovered, but sweeping the pointer
  // across the rail made it visibly teleport bar to bar, which read as
  // broken rather than responsive. Worth reconsidering as an opt-in
  // preference later, not as the default.
  function handleRailDragStart(e: ReactPointerEvent, barIdx: number, colIdx: number) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    pointerHandledRef.current = false;
    setRailThumbTracking(true);
    showGhostAt({ barIdx, colIdx });
    positionRailThumb(barIdx, colIdx / barsRef.current[barIdx].length);
  }

  function handleRailDragMove(e: ReactPointerEvent) {
    const result = nearestBeatAtPoint(e.clientX, e.clientY);
    if (!result) return;
    showGhostAt({ barIdx: result.barIdx, colIdx: result.colIdx });
    positionRailThumb(result.barIdx, result.fraction);
  }

  // commit=false is a cancelled gesture (e.g. a touch scroll interrupting
  // the drag) — clean up without seeking, since the event's own coordinates
  // at that point aren't a deliberate choice by the user.
  function handleRailDragEnd(e: ReactPointerEvent, commit: boolean) {
    draggingRef.current = false;
    pointerHandledRef.current = true;
    setRailThumbTracking(false);
    if (!commit) {
      hideGhost();
      restoreRailToCurrent();
      return;
    }
    const result = nearestBeatAtPoint(e.clientX, e.clientY);
    if (result) commitSeek({ barIdx: result.barIdx, colIdx: result.colIdx });
    else {
      hideGhost();
      restoreRailToCurrent();
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      setPlayheadPosition(location, animate = false) {
        const overlay = playheadRef.current;
        if (!overlay) return;
        if (!location) {
          overlay.style.setProperty("opacity", "0");
          activeBarRef.current = null;
          currentLocationRef.current = null;
          updateRailFill(-1, 0);
          hideRailThumb();
          playheadCreepRef.current?.style.setProperty("transform", "translateX(0px)");
          return;
        }
        // animate=false (every natural playback tick) must snap the outer
        // element instantly instead of easing — the within-beat creep (see
        // setPlayheadProgress) already delivers continuous, real-time-
        // accurate motion across the WHOLE beat, so an eased jump layered on
        // top of that at the boundary double-animates the same handoff: the
        // outer would start easing from its own last (stale, pre-creep)
        // value in the same frame the creep resets to 0, and the combined
        // position would visibly snap back by one COL_W before gliding
        // forward to where it already visually was. Only an explicit
        // seek() passes animate=true — a genuine relocation with no creep
        // already covering the distance, where the existing glide is still
        // exactly right. Toggling transitionProperty specifically (not the
        // transition shorthand) leaves .playhead-rect's own opacity fade
        // (the pill appearing on first play()) transitioning unconditionally
        // — that fade has nothing to do with this and must never be gated
        // by it.
        overlay.style.transitionProperty = animate ? "" : "opacity";
        if (!positionOverlay(overlay, location)) return;
        playheadCreepRef.current?.style.setProperty("transform", "translateX(0px)");
        const barSvg = svgRefs.current.get(location.barIdx)!;
        if (location.barIdx !== activeBarRef.current) {
          barSvg.scrollIntoView({
            block: "center",
            behavior: reducedMotionRef.current ? "auto" : "smooth",
          });
        }
        activeBarRef.current = location.barIdx;
        currentLocationRef.current = location;
        const fraction = committedRailFraction(location.barIdx, location.colIdx);
        updateRailFill(location.barIdx, fraction);
        positionRailThumb(location.barIdx, fraction);
      },
      // Every frame during playback, regardless of whether the beat itself
      // changed — moves just the inner element within its own COL_W slot,
      // never transitioned (see playheadCreepRef's own comment for why).
      // Skipped entirely under reduced motion, same "drop transform motion,
      // keep opacity" rule .ghost-rect already follows — this is decorative
      // motion, not essential to comprehension, and the beat-to-beat
      // relocation itself already collapses to instant under that setting
      // via the existing CSS rule.
      setPlayheadProgress(progress) {
        const creep = playheadCreepRef.current;
        if (!creep || reducedMotionRef.current) return;
        creep.style.transform = `translateX(${progress.fraction * COL_W}px)`;
      },
    }),
    [],
  );

  function cancelHoverClose() {
    if (hoverCloseTimer.current !== null) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  }

  function scheduleHoverClose() {
    cancelHoverClose();
    hoverCloseTimer.current = setTimeout(() => setClosing(true), HOVER_CLOSE_DELAY);
  }

  useEffect(() => cancelHoverClose, []);

  function openFrom(note: TabNote, target: SVGGraphicsElement, openedVia: Selected["openedVia"]) {
    if (note.techniques.length === 0) return;
    cancelHoverClose();
    const rect = target.getBoundingClientRect();
    setClosing(false);
    setSelected({ note, anchor: { x: rect.x, top: rect.top, bottom: rect.bottom }, openedVia });
    // Only for a deliberate click/keyboard-activate, not a hover preview —
    // same reason as commitSeek's own blur: leaves nothing focused to catch
    // a later, unrelated Space press meant for the global play/pause
    // shortcut. Less harmful here than on the rail (it would just re-open
    // the same popup, not move playback), but the same fix either way.
    if (openedVia === "click") target.blur();
  }

  return (
    // One <svg> per bar, laid out with plain CSS flex-wrap — the browser's
    // own layout engine decides how many bars fit per line, live, on any
    // width, with no JS measurement and no re-render on resize. The only
    // real constraint (a bar can't be split across two lines) comes for
    // free: flex-wrap never splits a single flex item across a wrap.
    // No gap-x: bars sit flush so the string lines read as one continuous
    // staff, with only each bar's own tick marking the seam.
    // w-fit + max-w-full + mx-auto (not justify-center): a short tab's box
    // shrinks to its own content and centers under the input, same as
    // before this fix — but a tab wide enough to hit the max-width cap
    // gets pinned to that full width, so flex-wrap's default (flex-start)
    // aligns every wrapped line to the same left edge. justify-center
    // would've centered each wrapped line's own content independently
    // again, reintroducing the exact cross-line misalignment fixed earlier.
    <div
      ref={wrapperRef}
      role="group"
      aria-label={t("tab.renderAriaLabel")}
      // tab-renderer: a pure CSS targeting hook, not a style — see its own
      // rule in globals.css (search "tab-renderer") for why this specific
      // subtree needs to opt out of the global theme-switch transition.
      className="tab-renderer relative flex w-fit max-w-full mx-auto flex-wrap gap-y-4"
    >
      {/* Playhead — one shared overlay, not one per bar (see the refs'
          own comment above for why). The outer div is a pure positioning
          anchor (transform + opacity only, in page coordinates computed
          fresh on every setPlayheadPosition call); the inner div carries
          the actual visible pill and its own separate within-beat creep
          transform (see playheadCreepRef's own comment for why these are
          split). pointer-events-none since it's a pure visual overlay
          sitting on top of real, clickable note content. */}
      <div ref={playheadRef} aria-hidden className="playhead-rect pointer-events-none absolute left-0 top-0" style={{ opacity: 0 }}>
        <div
          ref={playheadCreepRef}
          style={{
            width: COL_W,
            height: PLAYHEAD_HEIGHT,
            borderRadius: COL_W / 2,
            // The highlight's own constant translucency lives in the color
            // itself (color-mix, an HTML div's equivalent of the SVG
            // version's fill-opacity) — kept separate from the OUTER
            // element's own opacity, which is the JS-driven show/hide
            // toggle and needs to go all the way to 0, not just fade to
            // this tint.
            backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)",
          }}
        />
      </div>
      {/* Ghost preview — shows exactly which beat a rail hover/drag is
          about to land on. Same shape as the real playhead, hollow instead
          of solid so the two are never mistaken for each other; position is
          always instant (no glide), since its whole purpose is precise
          "right now" feedback, not a smooth transition. */}
      <div
        ref={ghostRef}
        aria-hidden
        className="ghost-rect pointer-events-none absolute left-0 top-0"
        style={{
          width: COL_W,
          height: PLAYHEAD_HEIGHT,
          borderRadius: COL_W / 2,
          background: "transparent",
          border: "1.5px solid var(--accent)",
          boxSizing: "border-box",
          opacity: 0,
        }}
      />
      {/* The rail's own thumb — one shared dot, not one per bar (see
          railThumbRef's own comment for why). Marks the current committed
          position at rest, or tracks a hover/drag candidate live; the ghost
          above is what confirms exactly which beat that candidate is. */}
      <div
        ref={railThumbRef}
        aria-hidden
        className="rail-thumb-dot pointer-events-none absolute left-0 top-0"
        style={{
          width: RAIL_THUMB_SIZE,
          height: RAIL_THUMB_SIZE,
          marginLeft: -RAIL_THUMB_SIZE / 2,
          marginTop: -RAIL_THUMB_SIZE / 2,
          borderRadius: "50%",
          backgroundColor: "var(--accent)",
          opacity: 0,
        }}
      />
      {bars.map((bar, barIdx) => {
        // No left/right padding constant here on purpose: the first and
        // last note of a bar sit half a slot in from its own edges (see
        // the note `x` below), so a bar's own width is exactly enough
        // slots — and when two bars sit flush (no gap-x), the space from
        // one bar's last note to the next bar's first note comes out to
        // exactly one COL_W, identical to the spacing between any two
        // notes inside a bar. Any extra margin here would make that seam
        // look wider than the internal spacing.
        const width = bar.length * COL_W;
        // BEND_HEADROOM only on top — a bend's arrow (up OR down, see
        // renderBendArrow) only ever needs room above the string lines, so
        // the bottom margin stays exactly what it was.
        const topOffset = PAD_Y + BEND_HEADROOM;
        // BAR_HEIGHT (notation) plus the seek rail's own reserved band
        // below it — strictly additional space, BAR_HEIGHT itself (used
        // elsewhere for the playhead/ghost overlays' height) is unchanged.
        const height = BAR_HEIGHT + SEEK_RAIL_BAND;
        const isFinalBar = barIdx === bars.length - 1;

        // One arrow per beat per direction, not per bent note — two notes
        // bending together in the same beat (a double-stop bend, almost
        // always the same amount) share a single arrow instead of each
        // getting their own; direction is "up" for a bend rising to its
        // peak (the common case) or "down" for one arriving already at a
        // peak and releasing (Guitar Pro's Release/PrebendRelease — see
        // TabNote.bendReleasing). Its shaft reaches down to the LOWEST (up)
        // or up to the HIGHEST (down — there isn't one here, but kept
        // symmetric) of the group's own notes, so the same line still reads
        // as pointing at every one of them, not just the one it's flush
        // against. Hovering/clicking it opens the same popup as its note —
        // it isn't pure decoration, the same way the note's own digit
        // isn't. withBendFirst: an unambiguous request for bend info, so it
        // should lead with Bend even on a note stacked with other
        // techniques. Plain SVG shapes throughout, not a Unicode arrow
        // character: those render inconsistently across platforms/fonts,
        // exactly what this app already avoids elsewhere (see CLAUDE.md's
        // lucide-react icon rule).
        function renderBendArrow(colIdx: number, x: number, notes: TabNote[], direction: "up" | "down") {
          if (notes.length === 0) return null;
          const edgeY =
            Math.max(...notes.map((n) => topOffset + (5 - n.string) * STRING_GAP)) - CUTOUT_R - 2;
          const representativeNote = withBendFirst(notes[0]);

          const shaftTopY = direction === "up" ? BEND_ARROWHEAD_BASE_Y : BEND_ARROWHEAD_TIP_Y;
          const arrowheadTipY = direction === "up" ? BEND_ARROWHEAD_TIP_Y : edgeY;
          const arrowheadBaseY = direction === "up" ? BEND_ARROWHEAD_BASE_Y : edgeY - 4;
          const shaftBottomY = direction === "up" ? edgeY : arrowheadBaseY;
          const rectTop = direction === "up" ? BEND_LABEL_Y - 9 : shaftTopY - 4;
          const rectBottom = direction === "up" ? shaftBottomY : arrowheadTipY;
          // Only relevant for "down" — where this release curve connects
          // back to, if anywhere (see findPrecedingBendColIdx's own
          // comment). null falls back to a plain arrow instead of a curve.
          const precedingBendColIdx =
            direction === "down" ? findPrecedingBendColIdx(bar, colIdx, representativeNote.string) : null;

          return (
            <g
              key={`${barIdx}-${colIdx}-bend-${direction}`}
              role="button"
              tabIndex={0}
              aria-label={noteAriaLabel(representativeNote)}
              style={{ cursor: "pointer" }}
              onClick={(e) => openFrom(representativeNote, e.currentTarget, "click")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openFrom(representativeNote, e.currentTarget, "click");
                }
              }}
              onMouseEnter={(e) => {
                if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
                  openFrom(representativeNote, e.currentTarget, "hover");
                }
              }}
              onMouseLeave={() => {
                if (selected?.openedVia === "hover" && selected.note === representativeNote) {
                  scheduleHoverClose();
                }
              }}
            >
              {/* Wider than the visible 1.5px shaft — a hairline is too thin
                  to reliably hover; this invisible rect is the real hit
                  target. Kept narrower than COL_W (32) on purpose, so it
                  can't reach into a neighboring beat's own hover zone. */}
              <rect x={x - 13} y={rectTop} width={26} height={rectBottom - rectTop} fill="transparent" />
              {precedingBendColIdx !== null ? (
                // Connects back to the rising arrow found above: starts a
                // small gap down-right of its own tip, control point
                // directly above the landing point and level with the
                // start — that's what makes the curve go right first, then
                // arc down into the note, instead of a diagonal line.
                <path
                  d={`M ${precedingBendColIdx * COL_W + COL_W / 2 + BEND_RELEASE_GAP} ${BEND_ARROWHEAD_TIP_Y + BEND_RELEASE_GAP} Q ${x} ${BEND_ARROWHEAD_TIP_Y} ${x} ${arrowheadBaseY}`}
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  fill="none"
                />
              ) : (
                <line x1={x} y1={shaftTopY} x2={x} y2={shaftBottomY} stroke="var(--accent)" strokeWidth={1.5} />
              )}
              <polygon
                points={`${x - 3},${arrowheadBaseY} ${x + 3},${arrowheadBaseY} ${x},${arrowheadTipY}`}
                fill="var(--accent)"
              />
              {direction === "up" && (
                <text x={x} y={BEND_LABEL_Y} textAnchor="middle" fontSize={9} fill="var(--accent)">
                  {bendGroupLabel(notes.map((n) => n.bendAmount!))}
                </text>
              )}
            </g>
          );
        }

        return (
          <svg
            key={barIdx}
            ref={(el) => {
              if (el) svgRefs.current.set(barIdx, el);
              else svgRefs.current.delete(barIdx);
            }}
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            className="text-foreground"
          >
            {[0, 1, 2, 3, 4, 5].map((string) => (
              <line
                key={string}
                x1={0}
                x2={width}
                y1={topOffset + (5 - string) * STRING_GAP}
                y2={topOffset + (5 - string) * STRING_GAP}
                // --line (a hairline divider/border color) was too close to
                // --background to read as a string; plain currentColor
                // (full --foreground, FretboardGrid's own choice) turned out
                // too strong here, since these lines run the full width of
                // the bar behind every note instead of a few short segments
                // in a small diagram. --muted is the same "clearly visible,
                // not the loudest thing on screen" token already used for
                // secondary text throughout the app.
                stroke="var(--muted)"
                strokeWidth={1}
              />
            ))}

            {/* This bar's own closing tick, always at its own right edge —
                every bar closes itself now, no cross-bar lookup needed.
                The one tick that closes the WHOLE tab (not just this bar)
                is drawn heavier, the way a final bar line reads in real
                notation — every other bar's tick is an ordinary boundary,
                not an ending, and should read that way. */}
            <line
              x1={width}
              x2={width}
              y1={topOffset}
              y2={topOffset + 5 * STRING_GAP}
              stroke="var(--muted)"
              strokeWidth={isFinalBar ? 2.5 : 1}
            />

            {bar.flatMap((beat, colIdx) => {
              // Every beat gets the same COL_W slot, regardless of how many
              // raw source-text columns separated it from the previous one
              // — a beat is a rhythmic time-step here, not a proportional
              // copy of the ASCII source's own spacing (same reason sheet
              // music doesn't stretch a note's position to match how far
              // apart two characters happened to be typed). Inserting a
              // note at a genuinely new column adds one more beat into this
              // sequence, which is why every later note shifts over by
              // exactly one slot — that's this reflow working as intended,
              // not a positioning bug.
              const x = colIdx * COL_W + COL_W / 2;
              const risingNotes = beat.notes.filter((n) => n.bendAmount != null && !n.bendReleasing);
              const releasingNotes = beat.notes.filter((n) => n.bendAmount != null && n.bendReleasing);
              // One mark per beat, not per note — see VIBRATO_Y's own
              // comment for why it lives above the staff instead of beside
              // the digit, and why it's shared rather than drawn once per
              // vibrato'd note in a chord.
              const vibratoMark = beat.notes.some((n) => n.techniques.includes("~")) ? (
                <path
                  key={`${barIdx}-${colIdx}-vibrato`}
                  d={`M ${x - 4} ${VIBRATO_Y} Q ${x - 2} ${VIBRATO_Y - 2.5} ${x} ${VIBRATO_Y} Q ${x + 2} ${VIBRATO_Y + 2.5} ${x + 4} ${VIBRATO_Y}`}
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  fill="none"
                />
              ) : null;

              // One label per beat, not per note — same "shared, not
              // per-note" reasoning as the bend arrow and vibrato mark
              // above. A chord with two different harmonic types stacked on
              // the same beat is a real edge case Guitar Pro can produce,
              // but rare enough that showing just the first one found is an
              // acceptable simplification — the note's own popup still
              // lists every technique it actually carries.
              const harmonicNotes = beat.notes.filter((n) => harmonicNoteLabel(n) != null);
              const hasBend = risingNotes.length > 0 || releasingNotes.length > 0;
              // Clamped, not just the fixed offset — this bar's own <svg>
              // clips at its own right edge (width), and a beat near the end
              // of a bar leaves less than COL_W/2 of room to grow into.
              // Shrinks toward 0 (starting flush at the note's own center,
              // never past it) rather than ever going negative into the
              // shaft's own x — see HARMONIC_LABEL_BEND_OFFSET_X's own
              // comment for why this is usually the last beat of a bar.
              const harmonicOffsetX = Math.max(
                0,
                Math.min(HARMONIC_LABEL_BEND_OFFSET_X, width - x - HARMONIC_LABEL_WIDTH),
              );
              const harmonicMark = harmonicNotes.length > 0 ? (
                <text
                  key={`${barIdx}-${colIdx}-harmonic`}
                  x={hasBend ? x + harmonicOffsetX : x}
                  y={HARMONIC_LABEL_Y}
                  textAnchor={hasBend ? "start" : "middle"}
                  fontSize={9}
                  fill="var(--accent)"
                >
                  {harmonicNoteLabel(harmonicNotes[0])}
                </text>
              ) : null;

              // Extra, secondary seek path — clicking the notation itself,
              // not just the dedicated rail below. Painted first (furthest
              // back), so any note/bend-arrow hit-target painted after it
              // still wins a click that lands on them — same "paint order
              // settles hit priority" trick used elsewhere in this file
              // (arrows painted behind notes). A click anywhere else in this
              // column (blank space, a non-technique note) falls through to
              // this and seeks instead. The rail is the reliable, "can't
              // miss" way to seek; this is a bonus convenience layered on
              // top of it, not a replacement.
              const seekThroughRect = (
                <rect
                  key={`${barIdx}-${colIdx}-seek`}
                  x={colIdx * COL_W}
                  y={0}
                  width={COL_W}
                  height={BAR_HEIGHT}
                  fill="transparent"
                  onClick={() => commitSeek({ barIdx, colIdx })}
                />
              );

              const noteEls = beat.notes.map((note) => {
                const y = topOffset + (5 - note.string) * STRING_GAP;
                const connecting = note.techniques.find((tech) => CONNECTING_TECHNIQUES.includes(tech));
                // Parenthesized, not a plain digit: a Hold note isn't a
                // fresh pick, it's purely continuing whatever bend the
                // previous note left off at (see TabNote.bendHold) — same
                // convention real tab notation uses for a held, not
                // re-struck, note.
                const label = note.fret === null ? "x" : note.bendHold ? `(${note.fret})` : String(note.fret);
                const interactive = note.techniques.length > 0;
                // Solid diamond marks a harmonic, same convention Songsterr
                // uses (see the deferred-visual-notation-references memory)
                // — sits just left of the note rather than around it, so it
                // doesn't share an outline with the digit and fight it for
                // legibility. Any harmonic type (see HARMONIC_LABELS), not
                // just pinch harmonics.
                const harmonicLabel = harmonicNoteLabel(note);
                const hasAccent = note.techniques.includes(">");
                // The exact same string the <text> below renders (connector
                // prefix + label) — the cutout has to cover precisely this,
                // not just `label` alone, since the connector is what makes
                // "h10" three characters instead of two. See
                // CUTOUT_CHAR_WIDTH's own comment for the sizing approach.
                const displayText = connecting ? CONNECTOR_LABEL[connecting] + label : label;
                const cutoutWidth = Math.min(displayText.length * CUTOUT_CHAR_WIDTH, CUTOUT_MAX_WIDTH);
                // Asymmetric, not just wider — the digit's own text still
                // grows equally in both directions from center, but the
                // accent chevron only ever sits on the right (see
                // ACCENT_MARK_OFFSET), so only that side needs the extra
                // reach. Math.max, not addition — the cutout only needs to
                // reach exactly to the chevron's own point (plus a couple px
                // clearance, same pattern as the bend arrow's own edgeY
                // - CUTOUT_R - 2), not stack on top of the digit's own
                // half-width too. Adding them left a wide dead strip of
                // erased string with no mark drawn over most of it.
                const cutoutLeftHalf = cutoutWidth / 2;
                const cutoutRightHalf = hasAccent ? Math.max(cutoutWidth / 2, ACCENT_MARK_OFFSET + 2) : cutoutWidth / 2;

                return (
                  <g key={`${barIdx}-${colIdx}-${note.string}`}>
                    {/* Painted before the harmonic diamond (not after, like
                        the old single-size circle could get away with) — a
                        wide cutout for a long label could otherwise paint
                        over and hide part of the diamond, which sits close
                        by at x-13..x-7. */}
                    <rect
                      x={x - cutoutLeftHalf}
                      y={y - CUTOUT_HEIGHT / 2}
                      width={cutoutLeftHalf + cutoutRightHalf}
                      height={CUTOUT_HEIGHT}
                      rx={CUTOUT_HEIGHT / 2}
                      fill="var(--background)"
                    />
                    {hasAccent && (
                      <polyline
                        points={`${x + ACCENT_MARK_OFFSET - 4},${y - 3} ${x + ACCENT_MARK_OFFSET},${y} ${x + ACCENT_MARK_OFFSET - 4},${y + 3}`}
                        stroke="var(--accent)"
                        strokeWidth={1.5}
                        fill="none"
                      />
                    )}
                    {harmonicLabel && (
                      <polygon
                        points={`${x - 10},${y - 4} ${x - 7},${y} ${x - 10},${y + 4} ${x - 13},${y}`}
                        fill="var(--accent)"
                      />
                    )}
                    <text
                      x={x}
                      y={y + 4}
                      textAnchor="middle"
                      fontSize={12}
                      fill={interactive ? "var(--accent)" : "var(--foreground)"}
                      role={interactive ? "button" : undefined}
                      tabIndex={interactive ? 0 : undefined}
                      aria-label={interactive ? noteAriaLabel(note) : undefined}
                      style={interactive ? { cursor: "pointer" } : undefined}
                      onClick={(e) => interactive && openFrom(note, e.currentTarget, "click")}
                      onKeyDown={(e) => {
                        if (interactive && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          openFrom(note, e.currentTarget, "click");
                        }
                      }}
                      onMouseEnter={(e) => {
                        if (interactive && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
                          openFrom(note, e.currentTarget, "hover");
                        }
                      }}
                      onMouseLeave={() => {
                        // Only a hover-opened popup closes itself this way —
                        // a click/keyboard-opened one still needs Escape or
                        // an outside click, same as before this existed.
                        // Schedules the close rather than firing it
                        // immediately — the pointer is very likely headed
                        // for the popup itself (to read or scroll it), which
                        // cancels this via its own onMouseEnter below.
                        if (selected?.openedVia === "hover" && selected.note === note) {
                          scheduleHoverClose();
                        }
                      }}
                    >
                      {/* Touches the fret number directly, same size, same as the plain-text source ("5h7", "/12") — no gap, no size mismatch. */}
                      {connecting && <tspan>{CONNECTOR_LABEL[connecting]}</tspan>}
                      {label}
                    </text>
                  </g>
                );
              });

              if (risingNotes.length === 0 && releasingNotes.length === 0) {
                return [seekThroughRect, vibratoMark, harmonicMark, ...noteEls];
              }

              // Arrows FIRST, notes after — SVG paints in DOM order, and a
              // multi-note bend's shaft runs straight through wherever an
              // in-between note sits (e.g. the higher note of a double-stop
              // bend, on its way down to the lower one). Drawing them behind
              // the notes lets each note's own background-cutout circle
              // punch a clean gap through it, exactly the same trick that
              // already keeps the string lines from running through a
              // note's own digit. seekThroughRect stays furthest back of
              // all — see its own comment above. vibratoMark sits well clear
              // of the arrow/label (VIBRATO_ROOM), so its own paint order
              // relative to them doesn't matter.
              return [
                seekThroughRect,
                vibratoMark,
                harmonicMark,
                renderBendArrow(colIdx, x, risingNotes, "up"),
                renderBendArrow(colIdx, x, releasingNotes, "down"),
                ...noteEls,
              ];
            })}

            {/* Seek rail — dedicated, always-safe territory below the
                staff (see SEEK_RAIL_BAND's own comment for why below, not
                above). Fill is accent, same as the real playhead — muted
                gray was tried and reads as just another string line at this
                thickness, indistinguishable from the notation's own muted
                string strokes above it. No live preview fill on top of it
                (see updateRailFill's own comment) — the single shared thumb
                dot alone carries hover/drag feedback, deliberately kept
                minimal rather than layering in a second preview bar. */}
            <rect
              x={0}
              y={RAIL_Y}
              width={width}
              height={SEEK_RAIL_VISUAL_HEIGHT}
              rx={SEEK_RAIL_VISUAL_HEIGHT / 2}
              fill="color-mix(in srgb, var(--accent) 15%, transparent)"
            />
            <rect
              ref={(el) => {
                if (el) railFillRefs.current.set(barIdx, el);
                else railFillRefs.current.delete(barIdx);
              }}
              className="rail-fill"
              x={0}
              y={RAIL_Y}
              width={0}
              height={SEEK_RAIL_VISUAL_HEIGHT}
              rx={SEEK_RAIL_VISUAL_HEIGHT / 2}
              fill="var(--accent)"
            />
            {bar.map((beat, colIdx) => (
              <rect
                key={`${barIdx}-${colIdx}-rail-hit`}
                x={colIdx * COL_W}
                y={RAIL_HIT_Y}
                width={COL_W}
                height={SEEK_RAIL_HIT_HEIGHT}
                fill="transparent"
                role="button"
                tabIndex={0}
                aria-label={t("tab.seekAriaLabel", { bar: String(barIdx + 1), beat: String(colIdx + 1) })}
                style={{ cursor: "pointer" }}
                // setPointerCapture (in handleRailDragStart) means a real
                // drag — press on one beat, release on another — still
                // fires a click afterward on THIS rect (the press point),
                // since the browser treats the captured element as where
                // the click "happened." Left unguarded, that click would
                // silently re-seek back to the press point, undoing the
                // release point pointerup already (correctly) committed.
                // pointerHandledRef is how onClick tells the two apart —
                // see its own comment where it's declared.
                onClick={() => {
                  if (pointerHandledRef.current) {
                    pointerHandledRef.current = false;
                    return;
                  }
                  commitSeek({ barIdx, colIdx });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    commitSeek({ barIdx, colIdx });
                  }
                }}
                // Plain hover shows the ghost and snaps the dot straight to
                // this beat — no continuous tracking, and setRailThumbTracking
                // keeps it a true snap, not a glide (see that function's own
                // comment). Each beat is its own rect, so moving to a
                // neighboring one is a plain enter/leave pair — no
                // pointermove needed here; only an active drag's pointermove
                // tracks continuously (handleRailDragMove, below), the one
                // place that's supposed to feel smooth.
                onPointerEnter={() => {
                  if (draggingRef.current) return;
                  setRailThumbTracking(true);
                  showGhostAt({ barIdx, colIdx });
                  positionRailThumb(barIdx, colIdx / barsRef.current[barIdx].length);
                }}
                onPointerLeave={() => {
                  if (draggingRef.current) return;
                  hideGhost();
                  restoreRailToCurrent();
                  setRailThumbTracking(false);
                }}
                onPointerMove={(e) => {
                  if (draggingRef.current) handleRailDragMove(e);
                }}
                onPointerDown={(e) => handleRailDragStart(e, barIdx, colIdx)}
                onPointerUp={(e) => handleRailDragEnd(e, true)}
                onPointerCancel={(e) => handleRailDragEnd(e, false)}
              />
            ))}
          </svg>
        );
      })}

      {selected && (
        <TechniquePopup
          note={selected.note}
          anchor={selected.anchor}
          closing={closing}
          onRequestClose={() => setClosing(true)}
          onExited={() => {
            setSelected(null);
            setClosing(false);
          }}
          // Only a hover-opened popup needs this — the pointer entering it
          // cancels the close scheduled by the note's own onMouseLeave, and
          // leaving it (e.g. after scrolling the glossary text) schedules
          // the same close. A click-opened popup stays open regardless of
          // the pointer and only closes via Escape/outside click.
          onMouseEnter={selected.openedVia === "hover" ? cancelHoverClose : undefined}
          onMouseLeave={selected.openedVia === "hover" ? scheduleHoverClose : undefined}
        />
      )}
    </div>
  );
}
