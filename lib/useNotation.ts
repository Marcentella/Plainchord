"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { convertProgression, defaultNotation, type Notation } from "./notation";

const KEY = "notation";
// Same-tab change signal; the native `storage` event only fires in OTHER tabs.
const EVENT = "notationchange";

// Fallback when storage is blocked (private mode), so switching still
// works for the rest of the visit instead of silently doing nothing.
let memory: Notation | null = null;

function read(): Notation {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "american" || stored === "latin") return stored;
  } catch {
    // Storage blocked: fall through.
  }
  return memory ?? defaultNotation(navigator.languages ?? [navigator.language]);
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The active notation. Static HTML always renders American (the server
 * snapshot, since the server can't see localStorage or the browser's
 * language); a Latin reader's names swap right after hydration.
 */
export function useNotation(): Notation {
  return useSyncExternalStore(subscribe, read, () => "american");
}

export function setNotation(next: Notation) {
  memory = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Storage blocked: `memory` keeps it for this visit.
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * A typed progression that stays readable when the notation changes —
 * including the hydration swap from the American server render. It keeps
 * what was typed *and the notation it was typed in*, and derives the text
 * for the active notation during render ("G D Em" <-> "Sol Re Mim"), so
 * there's never an in-between render showing the old notation (which the
 * chord grid would read as every chord being deleted and retyped).
 *
 * `setCanonical` takes American text — what localStorage and the curated
 * progressions hold. `canonical` is the current text back in American.
 */
export function useNotationText(initialAmerican: string, isChord: (canonical: string) => boolean) {
  const notation = useNotation();
  const [draft, setDraft] = useState<{ text: string; notation: Notation }>({
    text: initialAmerican,
    notation: "american",
  });
  const text =
    draft.notation === notation ? draft.text : convertProgression(draft.text, draft.notation, notation, isChord);
  const setText = useCallback((next: string) => setDraft({ text: next, notation }), [notation]);
  const setCanonical = useCallback((american: string) => setDraft({ text: american, notation: "american" }), []);
  const canonical = convertProgression(text, notation, "american", isChord);
  return { text, setText, setCanonical, canonical, notation };
}
