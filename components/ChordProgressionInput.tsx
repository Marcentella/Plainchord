"use client";

import { useEffect, useRef, useState } from "react";
import { suggestChords } from "@/lib/chordSuggest";
import { pickDefaultIndex } from "@/lib/chordRank";
import type { Chord } from "@/lib/chords";
import { t } from "@/i18n";

// Mirrors parseProgression's separator set (space, comma, dash variants).
// Kept local — parseProgression itself isn't touched by this feature.
const SEPARATOR = /[\s,\-–—]+/g;

/** "G - D - E" -> { before: "G - D - ", token: "E" }: the chord currently
 * being typed, and everything already-finished before it. */
function splitLastToken(value: string): { before: string; token: string } {
  let lastEnd = 0;
  for (const m of value.matchAll(SEPARATOR)) lastEnd = m.index! + m[0].length;
  return { before: value.slice(0, lastEnd), token: value.slice(lastEnd) };
}

/** Character offset in `value` right after the `limit`-th finished chord's
 * own text ends — everything from here on (its trailing separator, chord
 * 17+, and the chord still being typed) is past the render limit and
 * should be dimmed. `null` if there aren't more than `limit` finished
 * chords yet. Only counts finished chords (closed by a separator) — the
 * chord currently being typed is never itself what pushes the count past
 * `limit`, matching parseProgression's own separator rules. */
function dimFromOffset(value: string, limit: number): number | null {
  let count = 0;
  let segmentStart = 0;
  for (const m of value.matchAll(SEPARATOR)) {
    const segment = value.slice(segmentStart, m.index);
    if (segment !== "") {
      count++;
      if (count === limit) return segmentStart + segment.length;
    }
    segmentStart = m.index! + m[0].length;
  }
  return null;
}

const SHARED = "w-full rounded-lg border px-4 py-2 text-lg";
const GHOST_ONLY =
  "border-transparent pointer-events-none absolute inset-0 whitespace-pre overflow-hidden";
// text-transparent + caret-foreground: the real input no longer draws its
// own text at all — the overlay does, so it can dim chords past the
// limit per-segment (a native input can only be one color at a time). The
// caret is set back to the normal foreground explicitly, or it would
// inherit the same transparency and vanish.
const INPUT_ONLY =
  "border-line bg-transparent relative text-transparent caret-foreground transition-colors focus:border-accent focus:outline-2 focus:outline-accent focus:outline-offset-2";

export default function ChordProgressionInput({
  id,
  value,
  onChange,
  placeholder,
  chordLimit,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Chords past this count render dimmed — still there, just not
   * processed. Purely visual here; the actual cutoff lives in the
   * chord-limit slicing in app/page.tsx, this just mirrors it. */
  chordLimit: number;
}) {
  const initial = splitLastToken(value);
  const beforeRef = useRef(initial.before);
  // What this component itself last handed to onChange — lets the effect
  // below tell "the parent echoed our own edit back" apart from "the
  // parent changed `value` on its own" (e.g. a "common progressions" pill).
  const lastEmittedRef = useRef(value);
  const [suggestions, setSuggestions] = useState<Chord[]>(() =>
    suggestChords(initial.token),
  );
  const [index, setIndex] = useState(() =>
    pickDefaultIndex(suggestChords(initial.token), initial.token),
  );
  const [cycling, setCycling] = useState(false);
  const [focused, setFocused] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const { before, token } = splitLastToken(value);
  const suggestion = suggestions[index];
  const ghost = suggestion ? suggestion.name.slice(token.length) : "";
  // The typed token is itself a full, valid match (e.g. "e" -> "E") — the
  // ghost suffix is empty then, so this underline is the only visible sign
  // there's still something to Tab/tap through.
  const tokenIsExactMatch = suggestion !== undefined && ghost === "";
  // Only the in-input ghost hides on blur — e.g. right after picking a
  // suggested progression ending in "C", nobody typed anything, so a
  // phantom "C(7)" sitting there unasked is just confusing. The hint row
  // and chip button below stay put; they're an explicit control, not a
  // stray artifact.
  const showGhostInInput = focused;

  // dimFromOffset only ever lands inside (or at the very end of) `before`
  // — it counts FINISHED chords, and `token` (still being typed) is by
  // definition not finished yet — so `token` itself is never split, it's
  // either entirely before the cutoff or entirely past it.
  const dimOffset = dimFromOffset(value, chordLimit);
  const beforeNormal = before.slice(0, dimOffset ?? before.length);
  const beforeDimmed = dimOffset !== null ? before.slice(dimOffset) : "";
  const tokenIsDimmed = dimOffset !== null;
  // Same condition that drives the dimming above — the explanatory text
  // and the dimmed chords should always appear/disappear together, never
  // one without the other.
  const truncated = dimOffset !== null;

  function retarget(nextValue: string) {
    const { before, token } = splitLastToken(nextValue);
    beforeRef.current = before;
    const found = suggestChords(token);
    setSuggestions(found);
    setIndex(pickDefaultIndex(found, token));
    setCycling(false);
  }

  /** Every edit this component makes goes through here, so the resync
   * effect below can recognize its own changes coming back as `value`. */
  function applyChange(next: string) {
    lastEmittedRef.current = next;
    onChange(next);
  }

  // If `value` changes without us having emitted it (picking a suggested
  // progression, clearing the field from elsewhere, etc.), our suggestion
  // state is for the OLD text — resync it, instead of leaving a stale chip
  // like "C7" showing after the value no longer even ends in "c".
  useEffect(() => {
    if (value !== lastEmittedRef.current) {
      retarget(value);
      lastEmittedRef.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commit(i: number, nextCycling: boolean) {
    const picked = suggestions[i];
    if (!picked) return;
    applyChange(beforeRef.current + picked.name);
    setIndex(i);
    setCycling(nextCycling);
  }

  /** Tab, and the tap button below, both accept-or-cycle the same way. */
  function acceptOrCycle() {
    if (suggestions.length === 0) return;
    commit(cycling ? (index + 1) % suggestions.length : index, true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Tab") {
      if (suggestions.length === 0) return; // nothing to accept — Tab moves focus as usual
      e.preventDefault();
      acceptOrCycle();
      return;
    }
    if (e.key === "Enter" && ghost) {
      commit(index, false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        {/* The real input's own text is transparent (see INPUT_ONLY) — this
            overlay is the only thing actually drawing it now, which is
            what lets the already-typed portion split into a normal-color
            span and a dimmed one instead of being one uniform color. */}
        <div ref={overlayRef} aria-hidden className={`${SHARED} ${GHOST_ONLY}`}>
          <span>{beforeNormal}</span>
          {beforeDimmed && <span className="opacity-45">{beforeDimmed}</span>}
          <span
            className={
              tokenIsDimmed
                ? "opacity-45"
                : showGhostInInput && tokenIsExactMatch
                  ? "border-b-2 border-accent/50"
                  : ""
            }
          >
            {token}
          </span>
          {/* No ghost suggestion once past the limit — an active
              autocomplete hint would read as "still being processed",
              which contradicts the dimming. */}
          <span className="text-muted">
            {showGhostInInput && !tokenIsDimmed ? ghost : ""}
          </span>
        </div>
        <input
          id={id}
          value={value}
          onChange={(e) => {
            applyChange(e.target.value);
            retarget(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          // The real input is the only thing that actually scrolls
          // horizontally (native caret-follow behavior) — its text is
          // transparent now (see INPUT_ONLY), so the overlay drawing the
          // visible text has to mirror that scroll position or long
          // progressions leave the caret's text off-screen in the overlay
          // while the invisible real input has already scrolled to it.
          onScroll={(e) => {
            if (overlayRef.current) {
              overlayRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
          placeholder={placeholder}
          className={`${SHARED} ${INPUT_ONLY}`}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {/* Directly under the input, above the hint row below — not after it.
          The hint row reserves its height even with no suggestion
          (`invisible`, see below), so putting this message after it would
          leave an awkward gap between the input and this text on the
          (uncommon) no-suggestion case. */}
      {truncated && (
        <p className="text-xs text-muted">
          {t("home.chordLimit", { limit: String(chordLimit) })}
        </p>
      )}

      {/* Always mounted — its height is reserved in the layout at all times.
          Only `visibility` toggles, so nothing below has to shift up/down
          every time typing changes whether there's a match. `visibility`
          (not `opacity`) also removes it from hit-testing and the tab
          order for free while hidden, with no extra `pointer-events`/
          `tabIndex` handling needed. */}
      <div
        className={`flex items-center gap-2 ${suggestion ? "visible" : "invisible"}`}
      >
        <span className="text-xs text-muted">{t("home.tabHint")}</span>
        {/* Tab has no equivalent on a mobile keyboard, so tapping this
            does the exact same accept-or-cycle as pressing Tab. */}
        <button
          type="button"
          onClick={acceptOrCycle}
          aria-label={
            suggestion
              ? t("home.acceptSuggestionAria", { name: suggestion.name })
              : undefined
          }
          className="rounded-full border border-line px-3 py-1 text-sm transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
        >
          ⇥ {suggestion?.name ?? ""}
        </button>
      </div>
    </div>
  );
}
