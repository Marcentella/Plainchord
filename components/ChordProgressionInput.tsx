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

const SHARED = "w-full rounded-lg border px-4 py-2 text-lg";
const GHOST_ONLY =
  "border-transparent pointer-events-none absolute inset-0 whitespace-pre overflow-hidden";
const INPUT_ONLY =
  "border-line bg-transparent relative transition-colors focus:border-accent focus:outline-2 focus:outline-accent focus:outline-offset-2";

export default function ChordProgressionInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
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
        <div aria-hidden className={`${SHARED} ${GHOST_ONLY}`}>
          <span className="invisible">{before}</span>
          <span
            className={
              showGhostInInput && tokenIsExactMatch
                ? "border-b-2 border-accent/50 text-transparent"
                : "invisible"
            }
          >
            {token}
          </span>
          <span className="text-muted">
            {showGhostInInput ? ghost : ""}
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
          placeholder={placeholder}
          className={`${SHARED} ${INPUT_ONLY}`}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {suggestion && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{t("home.tabHint")}</span>
          {/* Tab has no equivalent on a mobile keyboard, so tapping this
              does the exact same accept-or-cycle as pressing Tab. */}
          <button
            type="button"
            onClick={acceptOrCycle}
            aria-label={t("home.acceptSuggestionAria", { name: suggestion.name })}
            className="rounded-full border border-line px-3 py-1 text-sm transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
          >
            ⇥ {suggestion.name}
          </button>
        </div>
      )}
    </div>
  );
}
