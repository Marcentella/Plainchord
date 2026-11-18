"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CaretDownIcon, MinusIcon, SpeakerHighIcon, XIcon } from "@phosphor-icons/react";
import ChordDiagram from "@/components/ChordDiagram";
import ChordNotFound from "@/components/ChordNotFound";
import TransitionBadge from "@/components/TransitionBadge";
import { findChord, type Chord } from "@/lib/chords";
import { detectKey, keyView, noteName, type HarmonicFunction } from "@/lib/keys";
import { formatChord } from "@/lib/notation";
import { useNotation } from "@/lib/useNotation";
import { transitionDifficulty } from "@/lib/transitionDifficulty";
import { playChords } from "@/lib/strum";
import { useIsomorphicLayoutEffect } from "@/lib/useIsomorphicLayoutEffect";
import { useT } from "@/i18n/LocaleProvider";
import { useLocale } from "@/i18n/useLocale";
import { href } from "@/i18n/routes";
import type { TKey } from "@/i18n/t";

/** The open-chord keys a beginner meets first: C, G, D, A, E. */
const KEYS = [0, 7, 2, 9, 4];

/**
 * What each chord does in the key, in the words of functional harmony: home
 * (reposo), moving away (preparación), pulling back (tensión). Repeats are
 * the point (in G, Em rests like G, Am prepares like C); lib/keys.ts's
 * keyView says which is which.
 */
const FUNCTION_WORD: Record<HarmonicFunction, TKey> = { T: "keys.fnT", S: "keys.fnS", D: "keys.fnD" };

/**
 * Where a card's popup hangs, by its place in a row of three (phones; on
 * wider screens six fit, and the same anchors still open inward): from its
 * left edge, centred, from its right edge.
 */
const POP_ANCHOR = ["left-0 origin-top-left", "left-1/2 -translate-x-1/2 origin-top", "right-0 origin-top-right"];

type Key = { tonic: number; minor: boolean };

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

/**
 * The chord library's key section (prototyped at /dev/tonalidad): a quiet
 * line under the diagrams naming the key the chords are in, and any chord
 * borrowed from outside it; opened, that key's chords from its home chord
 * (as a theory book lists them) with what each does, the classic shapes in
 * that key with their real difficulty, and a key switcher, so one shape can
 * be watched moving from key to key. Facts about the chords, the same for
 * everyone: nothing here adapts to the user.
 *
 * `tokens` are the progression's chords (American names); `onChange` gets
 * the new progression text, `replace` true when a whole progression is
 * swapped in (so the grid animates it as one replacement).
 */
export default function KeySection({
  tokens,
  onChange,
  chordLimit,
  showDifficulty = true,
}: {
  tokens: string[];
  onChange: (next: string, replace?: boolean) => void;
  chordLimit: number;
  /** The page's "Mostrar dificultad" switch: off hides the badges here too. */
  showDifficulty?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const notation = useNotation();
  const name = (n: string) => formatChord(n, notation);
  // "G", or "La menor" when the relative minor is home.
  const keyLabel = ({ tonic, minor }: Key) =>
    minor ? t("keys.minor", { note: name(noteName((tonic + 9) % 12, tonic)) }) : name(noteName(tonic));

  // Each chord in the library's own spelling: lookups ignore case, but the
  // key logic and the cards compare names, so "em7" has to arrive as "Em7".
  const typed = tokens.map((tok) => findChord(tok)?.name ?? tok);
  const fit = detectKey(typed);

  // The key the open panel shows, or null while it is closed. Opening takes
  // the detected key once; after that only the key buttons change it, so
  // adding chords (which can change what they're "in") never swaps the cards
  // out from under the pointer.
  const [openKey, setOpenKey] = useState<Key | null>(null);
  const open = openKey !== null;
  const key = openKey ?? (fit ? { tonic: fit.tonic, minor: fit.minor } : { tonic: 7, minor: false });
  const view = keyView(key.tonic, key.minor);
  const isKey = (k: Key) => k.tonic === key.tonic && k.minor === key.minor;
  // The five open-chord majors, plus the minor key the chords are in when
  // that's where they live, so it can be picked back after leaving it.
  const pills: Key[] = [...KEYS.map((tonic) => ({ tonic, minor: false })), ...(fit?.minor ? [{ tonic: fit.tonic, minor: true }] : [])];

  // The card whose "which one?" popup is open (a degree), if any. It closes
  // on a click elsewhere or Escape, and on its own once the last copy goes.
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

  // When the diagrams above gain or lose a row, this section moves. Two
  // cases, picked by where the edit came from:
  // - From inside the section (you're looking at it): the page scrolls so the
  //   section is back where it was on screen at the click, so it stays still
  //   under the pointer and the new or removed diagram happens out of sight
  //   above. Measured on screen, not as a distance, so it also holds when the
  //   browser already clamped the scroll at the page bottom.
  // - From the text box (you're looking up there): the section glides to its
  //   new place (a FLIP: measure, invert, play); a move that interrupts a
  //   glide starts from wherever it had got to.
  // The browser's own scroll anchoring is off here (overflow-anchor: none):
  // it made the same correction on its own timing, and the two fought.
  const sectionRef = useRef<HTMLElement>(null);
  const lastTop = useRef<number | null>(null);
  const editedHere = useRef<number | null>(null);
  const edit = (next: string, replace = false) => {
    editedHere.current = sectionRef.current?.getBoundingClientRect().top ?? null;
    onChange(next, replace);
  };
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
    // Where it's drawn now (a running glide included), then where it lays out.
    const drawn = el.getBoundingClientRect().top;
    el.getAnimations().forEach((anim) => anim.cancel());
    const laidOut = el.getBoundingClientRect().top;
    if (stillAt !== null) {
      window.scrollBy({ top: laidOut - stillAt, behavior: "instant" });
      return;
    }
    const from = prev - top + (drawn - laidOut);
    if (Math.abs(from) < 1 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate([{ transform: `translateY(${from}px)` }, { transform: "none" }], {
      duration: 320,
      easing: "cubic-bezier(0.23, 1, 0.32, 1)",
    });
  });

  const remove = (i: number) => edit(typed.filter((_, j) => j !== i).join(" - "));

  // One card of the key (a plain function, not a component, so its popup
  // isn't remounted on every render). Tapping it adds the chord at the end,
  // repeats included (G C G D); lit = that exact chord is in the progression.
  // The bottom-left corner (the speaker has the right) takes one out: "−"
  // when it's there once, "×2" opens the progression with that chord's
  // copies marked, to pick which. `col` places the popup (see POP_ANCHOR).
  const keyCard = (d: number, col: number) => {
    const n = view.chords[d];
    const chord = findChord(n);
    // Exact: a card lights for its own chord only. Em7 isn't the Em card (it
    // would play a different chord), even though both belong to the key.
    const at = typed.flatMap((tok, i) => (tok === n ? [i] : []));
    // An open popup stays open down to the last copy, so the corner keeps
    // its "×N" toggle instead of swapping to "−" under the pointer.
    const picking = popFor === d && at.length > 0;
    const corner =
      "absolute bottom-1.5 left-1.5 flex h-7 min-w-7 items-center justify-center rounded-full border px-1.5 text-xs font-medium tabular-nums transition duration-[160ms] ease-out active:scale-[0.92]";
    return (
      <li key={n} className="relative" data-pop={popFor === d || undefined}>
        <button
          disabled={!chord || typed.length >= chordLimit}
          onClick={() => edit([...typed, n].join(" - "))}
          aria-label={t("keys.add", { name: name(n) })}
          className={`flex h-full w-full flex-col items-center gap-2 rounded-lg border p-2 pt-3 transition duration-[160ms] ease-out hover-fine:enabled:-translate-y-0.5 hover-fine:enabled:border-accent active:enabled:scale-[0.97] disabled:cursor-not-allowed ${
            at.length ? "border-accent" : "border-line"
          }`}
        >
          <span className="flex flex-col items-center text-sm font-medium leading-tight">
            {t(FUNCTION_WORD[view.functions[d]])}
            <span className="font-mono text-xs font-normal text-muted">{view.numerals[d]}</span>
          </span>
          {chord ? <ChordDiagram chord={chord} size={90} /> : <ChordNotFound name={name(n)} />}
        </button>

        {at.length === 1 && !picking && (
          <button
            onClick={() => remove(at[0])}
            aria-label={t("keys.remove", { name: name(n) })}
            title={t("keys.remove", { name: name(n) })}
            className={`${corner} border-line bg-background text-muted hover-fine:border-accent hover-fine:text-foreground`}
          >
            <MinusIcon size={14} aria-hidden />
          </button>
        )}
        {(at.length > 1 || picking) && (
          <button
            onClick={() => setPopFor(popFor === d ? null : d)}
            aria-expanded={popFor === d}
            aria-label={t("keys.chooseCopy", { name: name(n), count: String(at.length) })}
            className={`${corner} border-accent bg-background text-accent hover-fine:bg-accent hover-fine:text-dot-text`}
          >
            ×{at.length}
          </button>
        )}
        {picking && (
          <div
            role="group"
            aria-label={t("keys.removeOneOf", { name: name(n) })}
            className={`absolute top-full z-20 mt-1 flex w-max max-w-[16rem] flex-wrap ${POP_ANCHOR[col % 3]} items-center gap-1 rounded-lg border border-line bg-background p-2 shadow-lg transition-[opacity,scale] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] starting:opacity-0 motion-safe:starting:scale-95`}
          >
            {typed.map((tok, i) =>
              at.includes(i) ? (
                <button
                  key={i}
                  onClick={() => {
                    remove(i);
                    if (at.length === 1) setPopFor(null);
                  }}
                  aria-label={t("keys.removeNth", { name: name(tok), n: String(i + 1) })}
                  className="flex items-center gap-1 rounded-full border border-accent px-2.5 py-1 text-sm font-medium transition duration-[160ms] ease-out hover-fine:bg-accent hover-fine:text-dot-text active:scale-[0.95]"
                >
                  {name(tok)}
                  <XIcon size={12} aria-hidden />
                </button>
              ) : (
                <span key={i} className="px-1 text-sm text-muted">
                  {name(tok)}
                </span>
              ),
            )}
          </div>
        )}

        {chord && <PlayButton chords={[chord]} label={t("keys.listen", { name: name(n) })} className="absolute bottom-1 right-1" />}
      </li>
    );
  };

  const label = keyLabel(key);

  return (
    <section ref={sectionRef} className="mt-10 flex w-full max-w-3xl flex-col gap-6 border-t border-line pt-5">
      <button
        onClick={() => {
          setOpenKey(open ? null : key);
          setPopFor(null);
        }}
        aria-expanded={open}
        className="flex items-center gap-2 self-start text-left text-lg transition hover-fine:text-accent"
      >
        {fit ? (
          <span>
            {t("keys.inKey", { key: keyLabel(fit) })}
            {fit.outside.length > 0 && t("keys.outside", { chords: fit.outside.map(name).join(t("keys.and")) })}
          </span>
        ) : (
          t("keys.explore")
        )}
        <CaretDownIcon size={18} aria-hidden className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="flex flex-col gap-10">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("keys.group")}>
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
                {keyLabel(k)}
              </button>
            ))}
            <Link
              href={href("guide", locale, "tonalidad")}
              className="ml-1 text-sm text-muted underline transition hover-fine:text-accent"
            >
              {t("keys.whatIsKey")}
            </Link>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-medium tracking-tight">{t("keys.chordsOf", { key: label })}</h2>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">{[0, 1, 2, 3, 4, 5].map(keyCard)}</ul>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-medium tracking-tight">{t("keys.progressionsIn", { key: label })}</h2>
            <ul className="flex flex-col">
              {view.shapes.map((shape) => {
                const names = shape.map((d) => view.chords[d]);
                const found = names.map(findChord);
                // The row that is in the box right now, so nobody has to
                // scroll up to check what a click loaded. Exact chords, in order.
                const loaded = typed.length === names.length && typed.every((tok, i) => tok === names[i]);
                return (
                  <li key={shape.join()} className="relative flex items-center gap-2 border-t border-line last:border-b">
                    {/* The loaded row's mark: a bar just outside the row (so
                        nothing shifts or narrows), growing from its middle
                        when the row loads and shrinking back when something
                        else does. */}
                    <span
                      aria-hidden
                      className={`absolute -left-3 top-3 bottom-3 w-0.5 rounded-full bg-accent transition-transform duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
                        loaded ? "scale-y-100" : "scale-y-0"
                      }`}
                    />
                    {/* Fixed tracks, chord / change / chord …, the same in
                        every row, so chords, badges and numerals line up
                        down the list. Four chords at most. */}
                    <button
                      disabled={found.some((c) => !c)}
                      onClick={() => edit(names.join(" - "), true)}
                      aria-pressed={loaded}
                      className={`${loaded ? "text-accent" : ""} grid min-w-0 flex-1 grid-cols-[repeat(3,2.75rem_2.5rem)_2.75rem] items-center gap-y-1 py-4 text-left transition hover-fine:enabled:text-accent disabled:cursor-not-allowed sm:grid-cols-[repeat(3,3.75rem_4rem)_3.75rem]`}
                    >
                      {names.map((n, i) => (
                        <Fragment key={i}>
                          <span
                            style={{ gridColumn: i * 2 + 1, gridRow: 1 }}
                            className={`justify-self-center text-lg font-medium ${found[i] ? "" : "text-muted line-through"}`}
                          >
                            {name(n)}
                          </span>
                          {showDifficulty && found[i] && found[i + 1] && (
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
                    {found.every(Boolean) && <PlayButton chords={found as Chord[]} label={t("keys.listen", { name: names.map(name).join(" ") })} />}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
