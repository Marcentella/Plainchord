"use client";

import { useEffect, useRef } from "react";
import type { TabNote } from "@/lib/tab";
import { allGlossaryEntries } from "@/lib/glossary";
import GlossaryEntryDetail from "@/components/GlossaryEntryDetail";

const POPUP_WIDTH = 288; // matches w-72 below
const GAP = 12; // space between the note and the popup
const MARGIN = 8; // minimum space kept between the popup and the viewport edge
const MIN_HEIGHT = 120; // below this, flip to whichever side has more room instead

export default function TechniquePopup({
  note,
  anchor,
  closing,
  onRequestClose,
  onExited,
  onMouseEnter,
  onMouseLeave,
}: {
  note: TabNote;
  /** Viewport coordinates of the note that opened this popup (its own top and bottom, for flipping above when there's no room below). */
  anchor: { x: number; top: number; bottom: number };
  /** True while fading out — still mounted, opacity animating to 0. */
  closing: boolean;
  /** Starts the fade-out (Escape / outside click). Doesn't unmount anything by itself — TabRenderer owns that, via onExited below, once the fade genuinely finishes. */
  onRequestClose: () => void;
  /** The fade-out's own transition has completed — safe to actually remove this from the DOM now. */
  onExited: () => void;
  /** Only passed for a hover-opened popup — lets hovering the panel itself (e.g. to scroll the glossary text) keep it open. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape, same pattern as PalettePicker/NavMenu
  // — not a full-viewport backdrop button. That backdrop was the actual bug
  // behind "hover opens then instantly closes it again": the moment the
  // popup mounted, that button covered the ENTIRE viewport, including the
  // note currently being hovered (confirmed: document.elementFromPoint at
  // the note's own coordinate returned the backdrop, not the note). Any
  // real mouse's natural micro-movement then triggers a synthetic
  // mouseleave on the now-covered note, closing a hover-opened popup
  // before anyone could see it. A panel-only ref check never covers
  // anything, so this can't happen.
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onRequestClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onRequestClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onRequestClose]);

  // A note can carry more than one technique tag at once (a bend that also
  // has vibrato) — show every matching entry, in the order they were parsed.
  const entries = note.techniques
    .map((symbol) => allGlossaryEntries.find((e) => e.symbol === symbol))
    .filter((e): e is NonNullable<typeof e> => e != null);

  if (entries.length === 0) return null;

  const viewportW = typeof window !== "undefined" ? window.innerWidth : POPUP_WIDTH;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : anchor.bottom + 400;

  const left = Math.min(Math.max(anchor.x - POPUP_WIDTH / 2, MARGIN), viewportW - POPUP_WIDTH - MARGIN);

  // A note near the bottom of the viewport used to always open the popup
  // below it, with no upper bound on `top` — the fixed-position box ran off
  // the bottom edge with no way to reach the rest (page scroll doesn't move
  // a `fixed` element). Flip above when there's more room there, and either
  // way cap the height to whatever room actually exists so the popup's own
  // scrollbar handles overflow instead of the box itself.
  const spaceBelow = viewportH - anchor.bottom - GAP - MARGIN;
  const spaceAbove = anchor.top - GAP - MARGIN;
  const openAbove = spaceBelow < MIN_HEIGHT && spaceAbove > spaceBelow;
  const maxHeight = Math.max(openAbove ? spaceAbove : spaceBelow, MIN_HEIGHT);
  const top = openAbove ? Math.max(anchor.top - GAP - maxHeight, MARGIN) : anchor.bottom + GAP;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      // Plain opacity fade, no transform: this opens on hover, potentially
      // many times per session while browsing a tab — the "tens of
      // times/day" tier calls for near-imperceptible motion, not a modal-
      // style entrance flourish. 150ms sits in the tooltip/small-popover
      // range; cubic-bezier(0.23,1,0.32,1) is this project's own existing
      // strong ease-out (see .chord-card in app/globals.css) reused rather
      // than forked. `starting:opacity-0` (Tailwind v4's @starting-style
      // variant) handles the entrance with no JS; `closing` (lifted into
      // TabRenderer) drives the exit, since unlike the entrance, fading out
      // needs this element to stay mounted a beat past when React would
      // otherwise remove it. Not gated behind prefers-reduced-motion: a
      // movement-free opacity fade is exactly the "gentler, not zero" case
      // this project's own base color-transition rule already keeps under
      // reduced motion, not something to drop entirely.
      // overscroll-contain: without it, scrolling past this panel's own top
      // or bottom hands the rest of the wheel gesture to the page behind it
      // (scroll chaining) — the page then scrolls out from under a fixed
      // popup that isn't meant to move at all.
      // themed-scrollbar (app/globals.css): themed thin scrollbar, replacing
      // the OS-default one.
      className={`themed-scrollbar fixed z-50 flex w-72 flex-col gap-4 overflow-y-auto overscroll-contain rounded-lg border border-line bg-background p-4 shadow-lg transition-opacity duration-[150ms] ease-[cubic-bezier(0.23,1,0.32,1)] starting:opacity-0 ${closing ? "opacity-0" : "opacity-100"}`}
      style={{ left, top, maxHeight }}
      onTransitionEnd={(e) => {
        if (e.propertyName === "opacity" && closing) onExited();
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {entries.map((entry, i) => (
        <GlossaryEntryDetail key={`${entry.symbol}-${i}`} entry={entry} />
      ))}
    </div>
  );
}
