"use client";

// Mock-up of the key ("tonalidad") section for /acordes — never linked from
// the real UI, same convention as /dev/synth: hardcoded Spanish on purpose,
// it isn't interface copy yet. If it holds up, the section moves into
// /acordes (replacing the suggestion pills) and its strings go to i18n.
//
// What it tries: a quiet line under the chords that names the key they're
// in (and any chord borrowed from outside it); opened, that key's chords
// from its home chord, as a theory book lists them, with what each does, the classic shapes played
// in it with the real transition difficulty, and a key switcher, so the
// same shape can be watched moving from key to key.

import { Fragment, useEffect, useRef, useState } from "react";
import { CaretDownIcon, MinusIcon, SpeakerHighIcon, XIcon } from "@phosphor-icons/react";
import ChordDiagram from "@/components/ChordDiagram";
import ChordNotFound from "@/components/ChordNotFound";
import ChordProgressionInput from "@/components/ChordProgressionInput";
import TransitionBadge from "@/components/TransitionBadge";
import { findChord } from "@/lib/chords";
import { parseProgression } from "@/lib/parseProgression";
import { detectKey, keyView, noteName, type HarmonicFunction } from "@/lib/keys";
import { formatChord } from "@/lib/notation";
import { useNotationText } from "@/lib/useNotation";
import { transitionDifficulty } from "@/lib/transitionDifficulty";
import { playChords } from "@/lib/strum";
import { useIsomorphicLayoutEffect } from "@/lib/useIsomorphicLayoutEffect";
import type { Chord } from "@/lib/chords";

const isChord = (canonical: string) => findChord(canonical) !== undefined;

/** The open-chord keys a beginner meets first: C, G, D, A, E. */
const KEYS = [0, 7, 2, 9, 4];

/**
 * What each chord does in the key, in the words of functional harmony: home
 * (reposo), moving away (preparación), pulling back (tensión). Real theory,
 * three words instead of six invented ones; repeats are the point (in G, Em
 * rests like G, Am prepares like C). lib/keys.ts's keyView says which is which.
 */
const FUNCTION_WORD: Record<HarmonicFunction, string> = { T: "Reposo", S: "Preparación", D: "Tensión" };

const CHORD_LIMIT = 16;

/**
 * Where a card's popup hangs, by its place in a row of three (phones; on
 * wider screens six fit, and the same anchors still open inward): from its
 * left edge, centred, from its right edge.
 */
const POP_ANCHOR = ["left-0 origin-top-left", "left-1/2 -translate-x-1/2 origin-top", "right-0 origin-top-right"];

/** Hear it: a small speaker button beside whatever it plays (never inside another button). */
function PlayButton({ chords, label, className = "" }: { chords: Chord[]; label: string; className?: string }) {
  return (
    <button
      onClick={() => playChords(chords)}
      aria-label={label}
      title={label}
      className={`flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition duration-[160ms] ease-out hover-fine:bg-line hover-fine:text-foreground active:scale-[0.92] ${className}`}
    >
      <SpeakerHighIcon size={18} aria-hidden />
    </button>
  );
}

export default function KeyMockPage() {
  const { text, setText, setCanonical, canonical, notation } = useNotationText("G - D - Em - C", isChord);
  const name = (n: string) => formatChord(n, notation);
  // "G", or "La menor" when the relative minor is home.
  const keyLabel = (tonic: number, minor: boolean) =>
    minor ? `${name(noteName((tonic + 9) % 12, tonic))} menor` : name(noteName(tonic));
  // Each chord in the library's own spelling: the box accepts "em7" (lookups
  // ignore case), but the key logic and the cards compare names, so "em7"
  // has to arrive as "Em7". Unknown tokens stay as typed.
  const typed = parseProgression(canonical).map((t) => findChord(t)?.name ?? t);
  const fit = detectKey(typed);

  // The key the open panel shows, or null while it is closed. Opening takes
  // the detected key once; after that only the key buttons change it, so
  // adding chords (which can change what they're "in") never swaps the cards
  // out from under the pointer.
  // A key here is its major tonic plus whether its relative minor is home
  // (A minor = { tonic: C, minor: true }), the same pair detectKey returns.
  const [openKey, setOpenKey] = useState<{ tonic: number; minor: boolean } | null>(null);
  const open = openKey !== null;
  const key = openKey ?? (fit ? { tonic: fit.tonic, minor: fit.minor } : { tonic: 7, minor: false });
  const view = keyView(key.tonic, key.minor);
  const label = keyLabel(key.tonic, key.minor);
  const isKey = (k: { tonic: number; minor: boolean }) => k.tonic === key.tonic && k.minor === key.minor;
  // The pills: the five open-chord majors, plus the minor key the chords are
  // in when that's where they live, so it can be picked back after leaving.
  const pills = [
    ...KEYS.map((tonic) => ({ tonic, minor: false })),
    ...(fit?.minor ? [{ tonic: fit.tonic, minor: true }] : []),
  ];

  // The card whose "which one?" popup is open (a degree), if any. It closes
  // on a click elsewhere or Escape, and on its own once one copy is left.
  const [popFor, setPopFor] = useState<number | null>(null);
  useEffect(() => {
    if (popFor === null) return;
    const away = (e: PointerEvent) => {
      if (!(e.target as Element).closest("[data-pop]")) setPopFor(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPopFor(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [popFor]);


  // Edits made from inside the key section (cards, the popup, a progression
  // row) keep the section still on screen; see the layout effect below.
  // Holds where the section sat on screen at the click, until the effect
  // puts it back there.
  const editedHere = useRef<number | null>(null);
  const editHere = (next: string) => {
    editedHere.current = sectionRef.current?.getBoundingClientRect().top ?? null;
    setCanonical(next);
  };
  const remove = (i: number) => editHere(typed.filter((_, j) => j !== i).join(" - "));

  // One card of the key (a plain function, not a component, so its popup
  // isn't remounted on every render). Tapping it adds the chord at the end,
  // repeats included (G C G D); lit = that exact chord is in the progression. The bottom-left corner (the speaker has the right) takes one out: "−" when it's there once, "×2" opens the
  // progression with that chord's copies marked, to pick which.
  // `col` (0-2, its place in the row) anchors the popup so it opens inward
  // and never runs off a phone screen.
  const keyCard = (d: number, col: number) => {
    col %= 3;
    const n = view.chords[d];
    const chord = findChord(n);
    // Exact: a card lights for its own chord only. Em7 isn't the Em card (it
    // would play a different chord), even though both belong to the key.
    const at = typed.flatMap((t, i) => (t === n ? [i] : []));
    const corner =
      "absolute bottom-1.5 left-1.5 flex h-7 min-w-7 items-center justify-center rounded-full border px-1.5 text-xs font-medium tabular-nums transition duration-[160ms] ease-out active:scale-[0.92]";
    return (
      <li key={n} className="relative" data-pop={popFor === d || undefined}>
        <button
          disabled={!chord || typed.length >= CHORD_LIMIT}
          onClick={() => editHere([...typed, n].join(" - "))}
          aria-label={`Añadir ${name(n)}`}
          className={`flex h-full w-full flex-col items-center gap-2 rounded-lg border p-2 pt-3 transition duration-[160ms] ease-out hover-fine:enabled:-translate-y-0.5 hover-fine:enabled:border-accent active:enabled:scale-[0.97] disabled:cursor-not-allowed ${
            at.length ? "border-accent" : "border-line"
          }`}
        >
          <span className="flex flex-col items-center text-sm font-medium leading-tight">
            {FUNCTION_WORD[view.functions[d]]}
            <span className="font-mono text-xs font-normal text-muted">{view.numerals[d]}</span>
          </span>
          {chord ? <ChordDiagram chord={chord} size={90} /> : <ChordNotFound name={name(n)} />}
        </button>

        {at.length === 1 && (
          <button
            onClick={() => remove(at[0])}
            aria-label={`Quitar ${name(n)}`}
            title={`Quitar ${name(n)}`}
            className={`${corner} border-line bg-background text-muted hover-fine:border-accent hover-fine:text-foreground`}
          >
            <MinusIcon size={14} aria-hidden />
          </button>
        )}
        {at.length > 1 && (
          <button
            onClick={() => setPopFor(popFor === d ? null : d)}
            aria-expanded={popFor === d}
            aria-label={`${name(n)} está ${at.length} veces: elegir cuál quitar`}
            className={`${corner} border-accent bg-background text-accent hover-fine:bg-accent hover-fine:text-dot-text`}
          >
            ×{at.length}
          </button>
        )}
        {popFor === d && at.length > 1 && (
          <div
            role="group"
            aria-label={`Quitar un ${name(n)}`}
            className={`absolute top-full z-20 mt-1 flex w-max max-w-[16rem] flex-wrap ${POP_ANCHOR[col]} items-center gap-1 rounded-lg border border-line bg-background p-2 shadow-lg transition-[opacity,scale] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] starting:opacity-0 motion-safe:starting:scale-95`}
          >
            {typed.map((t, i) =>
              at.includes(i) ? (
                <button
                  key={i}
                  onClick={() => remove(i)}
                  aria-label={`Quitar ${name(t)}, el ${i + 1}º`}
                  className="flex items-center gap-1 rounded-full border border-accent px-2.5 py-1 text-sm font-medium transition duration-[160ms] ease-out hover-fine:bg-accent hover-fine:text-dot-text active:scale-[0.95]"
                >
                  {name(t)}
                  <XIcon size={12} aria-hidden />
                </button>
              ) : (
                <span key={i} className="px-1 text-sm text-muted">
                  {name(t)}
                </span>
              ),
            )}
          </div>
        )}

        {chord && <PlayButton chords={[chord]} label={`Escuchar ${name(n)}`} className="absolute bottom-1 right-1" />}
      </li>
    );
  };

  // When the diagrams above gain or lose a row, the key section moves. Two
  // cases, picked by where the edit came from:
  // - From inside the section (you're looking at it): the page scrolls so the
  //   section is back where it was on screen at the click, so it stays still
  //   under the pointer and the new or removed diagram happens out of sight
  //   above. No glide. Measured on screen, not as a distance, so it also
  //   holds when the browser already clamped the scroll at the page bottom.
  // - From the text box (you're looking up there): the section glides to its
  //   new place (a FLIP: measure, invert, play); a move that interrupts a
  //   glide starts from wherever it had got to.
  // The browser's own scroll anchoring is off for this page (the wrapper's
  // overflow-anchor: none): it made the same correction on its own timing,
  // and the two fought, which read as jumping up and down.
  const sectionRef = useRef<HTMLElement>(null);
  const lastTop = useRef<number | null>(null);
  useIsomorphicLayoutEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    // offsetTop is the laid-out place, ignoring any glide in progress, so a
    // render that moved nothing leaves a running glide alone.
    const top = el.offsetTop;
    const prev = lastTop.current;
    lastTop.current = top;
    const stillAt = editedHere.current;
    editedHere.current = null;
    if (prev === null || prev === top) return;
    if (stillAt !== null) {
      el.getAnimations().forEach((anim) => anim.cancel());
      window.scrollBy({ top: el.getBoundingClientRect().top - stillAt, behavior: "instant" });
      return;
    }
    const drawn = el.getBoundingClientRect().top;
    el.getAnimations().forEach((anim) => anim.cancel());
    const from = prev - top + (drawn - el.getBoundingClientRect().top);
    if (Math.abs(from) < 1 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate([{ transform: `translateY(${from}px)` }, { transform: "none" }], {
      duration: 320,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
    });
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12 [overflow-anchor:none]">
      <div className="flex flex-col gap-2">
        <label htmlFor="progression" className="text-sm font-medium">
          Acordes
        </label>
        <ChordProgressionInput id="progression" value={text} onChange={setText} chordLimit={CHORD_LIMIT} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-6">
        {typed.map((n, i) => {
          const chord = findChord(n);
          const next = findChord(typed[i + 1] ?? "");
          // Keyed by chord and which time it appears, so removing one chord
          // doesn't remount (and re-fade) every diagram after it.
          const nth = typed.slice(0, i).filter((t) => t === n).length;
          return (
            <div key={`${n}#${nth}`} className="chord-card flex items-center gap-3">
              {chord ? <ChordDiagram chord={chord} /> : <ChordNotFound name={name(n)} />}
              {chord && next && <TransitionBadge difficulty={transitionDifficulty(chord, next)} />}
            </div>
          );
        })}
      </div>

      <section ref={sectionRef} className="flex flex-col gap-6 border-t border-line pt-5">
        <button
          onClick={() => setOpenKey(open ? null : key)}
          aria-expanded={open}
          className="group flex items-center gap-2 self-start text-lg transition hover-fine:text-accent"
        >
          {fit ? (
            <span>
              Estos acordes están en <span className="font-medium">{keyLabel(fit.tonic, fit.minor)}</span>
              {fit.outside.length > 0 && <>, salvo <span className="font-medium">{fit.outside.map(name).join(" y ")}</span></>}
            </span>
          ) : (
            "Explorar por tonalidad"
          )}
          <CaretDownIcon size={18} aria-hidden className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="flex flex-col gap-10">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tonalidad">
              {pills.map((k) => (
                <button
                  key={`${k.tonic}${k.minor}`}
                  onClick={() => {
                    setOpenKey(k);
                    setPopFor(null);
                  }}
                  aria-pressed={isKey(k)}
                  className={`min-w-12 rounded-full border px-4 py-1.5 text-base font-medium transition active:scale-[0.97] duration-[160ms] ease-out ${
                    isKey(k) ? "border-accent bg-accent text-dot-text" : "border-line hover-fine:border-accent"
                  }`}
                >
                  {keyLabel(k.tonic, k.minor)}
                </button>
              ))}
              <span className="ml-1 text-sm text-muted">¿Qué es una tonalidad? (artículo pendiente)</span>
            </div>

            <div className="flex flex-col gap-4">
              <h2 className="text-xl font-medium tracking-tight">Los acordes de {label}</h2>
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">{[0, 1, 2, 3, 4, 5].map(keyCard)}</ul>
            </div>

            <div className="flex flex-col gap-4">
              <h2 className="text-xl font-medium tracking-tight">Progresiones en {label}</h2>
              <ul className="flex flex-col">
                {view.shapes.map((shape) => {
                  const names = shape.map((d) => view.chords[d]);
                  const found = names.map(findChord);
                  return (
                    <li key={shape.join()} className="flex items-center gap-2 border-t border-line last:border-b">
                      {/* Fixed tracks, chord / change / chord …, the same in
                          every row, so chords, badges and numerals line up
                          down the list. Four chords at most. */}
                      <button
                        disabled={found.some((c) => !c)}
                        onClick={() => editHere(names.join(" - "))}
                        className="grid min-w-0 flex-1 grid-cols-[repeat(3,2.75rem_2.5rem)_2.75rem] items-center gap-y-1 py-4 text-left transition hover-fine:enabled:text-accent disabled:cursor-not-allowed sm:grid-cols-[repeat(3,3.75rem_4rem)_3.75rem]"
                      >
                        {names.map((n, i) => (
                          <Fragment key={i}>
                            <span style={{ gridColumn: i * 2 + 1, gridRow: 1 }} className={`justify-self-center text-lg font-medium ${found[i] ? "" : "text-muted line-through"}`}>
                              {name(n)}
                            </span>
                            {found[i] && found[i + 1] && (
                              <span style={{ gridColumn: i * 2 + 2, gridRow: 1 }} className="justify-self-center">
                                <TransitionBadge difficulty={transitionDifficulty(found[i]!, found[i + 1]!)} />
                              </span>
                            )}
                            <span style={{ gridColumn: i * 2 + 1, gridRow: 2 }} className="justify-self-center font-mono text-xs text-muted">
                              {view.numerals[shape[i]]}
                            </span>
                          </Fragment>
                        ))}
                      </button>
                      {found.every(Boolean) && <PlayButton chords={found as Chord[]} label={`Escuchar ${names.map(name).join(" ")}`} />}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
