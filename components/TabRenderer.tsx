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

function noteAriaLabel(note: TabNote): string {
  const label = note.fret === null ? t("tab.deadNoteLabel") : String(note.fret);
  const names = note.techniques
    .map((symbol) => allGlossaryEntries.find((e) => e.symbol === symbol)?.name)
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

  function openFrom(note: TabNote, target: SVGTextElement, openedVia: Selected["openedVia"]) {
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
        const height = PAD_Y * 2 + 5 * STRING_GAP;
        const isFinalBar = barIdx === bars.length - 1;

        return (
          <svg key={barIdx} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="text-foreground">
            {[0, 1, 2, 3, 4, 5].map((string) => (
              <line
                key={string}
                x1={0}
                x2={width}
                y1={PAD_Y + (5 - string) * STRING_GAP}
                y2={PAD_Y + (5 - string) * STRING_GAP}
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
              y1={PAD_Y}
              y2={PAD_Y + 5 * STRING_GAP}
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

              return beat.notes.map((note) => {
                const y = PAD_Y + (5 - note.string) * STRING_GAP;
                const connecting = note.techniques.find((tech) => CONNECTING_TECHNIQUES.includes(tech));
                const label = note.fret === null ? "x" : String(note.fret);
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
