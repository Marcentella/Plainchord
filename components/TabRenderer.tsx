"use client";

import { useEffect, useRef, useState } from "react";
import type { Tab, TabNote } from "@/lib/tab";
import { CONNECTING_TECHNIQUES } from "@/lib/tab";
import { groupIntoBars } from "@/lib/groupIntoBars";
import { allGlossaryEntries } from "@/lib/glossary";
import TechniquePopup from "@/components/TechniquePopup";
import { t } from "@/i18n";

const COL_W = 32;
const STRING_GAP = 20;
const PAD_Y = 14;
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
const BEND_HEADROOM = 34;
// One arrow per BEAT, not per bent note — two notes bending together in the
// same beat (a very common double-stop bend: two strings pushed by the same
// finger, almost always by the same amount) share a single arrow instead of
// each getting their own. Landing every arrow at this same fixed height,
// regardless of which string(s) it's for, is what makes that possible: the
// shaft's bottom end is just wherever the LOWEST of this beat's bent notes
// sits, so the same line reads as pointing at all of them, whether there's
// one or several.
const BEND_LABEL_Y = PAD_Y + 8;
const BEND_ARROWHEAD_TIP_Y = PAD_Y + 14;
const BEND_ARROWHEAD_BASE_Y = PAD_Y + 18;
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
// Small background-color cutout so the string line doesn't run straight
// through a note's own digit.
const CUTOUT_R = 6;

const CONNECTOR_LABEL: Record<string, string> = { h: "h", p: "p", "/": "/" };

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

export default function TabRenderer({ tab }: { tab: Tab }) {
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
      role="group"
      aria-label={t("tab.renderAriaLabel")}
      className="flex w-fit max-w-full mx-auto flex-wrap gap-y-4"
    >
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
        const height = topOffset + 5 * STRING_GAP + PAD_Y;
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
              <line x1={x} y1={shaftTopY} x2={x} y2={shaftBottomY} stroke="var(--accent)" strokeWidth={1.5} />
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
          <svg key={barIdx} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="text-foreground">
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

                return (
                  <g key={`${barIdx}-${colIdx}-${note.string}`}>
                    <circle cx={x} cy={y} r={CUTOUT_R} fill="var(--background)" />
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

              if (risingNotes.length === 0 && releasingNotes.length === 0) return noteEls;

              // Arrows FIRST, notes after — SVG paints in DOM order, and a
              // multi-note bend's shaft runs straight through wherever an
              // in-between note sits (e.g. the higher note of a double-stop
              // bend, on its way down to the lower one). Drawing them behind
              // the notes lets each note's own background-cutout circle
              // punch a clean gap through it, exactly the same trick that
              // already keeps the string lines from running through a
              // note's own digit.
              return [
                renderBendArrow(colIdx, x, risingNotes, "up"),
                renderBendArrow(colIdx, x, releasingNotes, "down"),
                ...noteEls,
              ];
            })}
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
