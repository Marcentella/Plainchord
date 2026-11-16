"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { href } from "@/i18n/routes";
import { useLocale } from "@/i18n/useLocale";
import ChordDiagram from "@/components/ChordDiagram";
import ChordNotFound from "@/components/ChordNotFound";
import ChordProgressionInput from "@/components/ChordProgressionInput";
import TransitionBadge from "@/components/TransitionBadge";
import { PROGRESSION_STORAGE_KEY, findChord, parseProgression } from "@/lib/chords";
import { canonicalToken, displayToken } from "@/lib/notation";
import { useNotationText } from "@/lib/useNotation";
import { transitionDifficulty } from "@/lib/transitionDifficulty";
import { useT } from "@/i18n/LocaleProvider";

/** The landing shows a taste, not the whole library — four chords is a typical song section. */
const PREVIEW_LIMIT = 4;

const isChord = (canonical: string) => findChord(canonical) !== undefined;

export default function LandingHero() {
  const t = useT();
  const router = useRouter();
  const locale = useLocale();
  // Typed in the active notation; saved for the library in American.
  const { text: input, setText: setInput, canonical, notation } = useNotationText("G - D - Em - C", isChord);
  // Every token keeps its slot, found or not: an unknown chord shows as its
  // own "no la tenemos" tile instead of silently vanishing (or leaving an
  // empty hole when nothing matched).
  const slots = parseProgression(input)
    .slice(0, PREVIEW_LIMIT)
    .map((token) => ({ token, chord: findChord(canonicalToken(token, notation)) }));

  // Once the visitor has typed, keep the library's saved progression in step
  // with it, so every way into /acordes (this form, the steps, the closing
  // button) arrives with their chords. Untouched, the library keeps whatever
  // it had saved before — the prefilled example never overwrites it.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) return;
    try {
      localStorage.setItem(PROGRESSION_STORAGE_KEY, canonical);
    } catch {
      // Storage blocked (private mode): the library just opens with its default.
    }
  }, [canonical]);
  function change(value: string) {
    touched.current = true;
    setInput(value);
  }

  function open(e: React.FormEvent) {
    e.preventDefault();
    // The library restores its last progression from here on load, so this
    // is all it takes to arrive with the same chords already typed.
    try {
      localStorage.setItem(PROGRESSION_STORAGE_KEY, canonical);
    } catch {
      // Storage blocked (private mode): the library just opens with its default.
    }
    router.push(href("chords", locale));
  }

  return (
    <section className="flex min-h-[calc(100svh-4.25rem)] items-center px-6 py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 text-center">
        <h1 className="text-balance text-[2.5rem] font-medium leading-[1.04] tracking-[-0.04em] sm:text-7xl">
          {t("landing.title")}
        </h1>
        <p className="max-w-2xl text-pretty text-lg leading-relaxed text-muted sm:text-xl">{t("landing.subtitle")}</p>

        <form onSubmit={open} className="flex w-full max-w-xl flex-col gap-3 text-left sm:flex-row sm:items-start">
          <label htmlFor="landing-progression" className="sr-only">
            {t("landing.inputLabel")}
          </label>
          <div className="min-w-0 flex-1">
            <ChordProgressionInput id="landing-progression" value={input} onChange={change} chordLimit={PREVIEW_LIMIT} hintWhileTyping />
          </div>
          <button
            type="submit"
            className="h-[46px] shrink-0 rounded-xl bg-accent px-6 text-lg font-medium text-dot-text transition hover-fine:-translate-y-px active:scale-[0.97] duration-[160ms] ease-out"
          >
            {t("landing.cta")}
          </button>
        </form>

        {/* The answer, in open space — no box around it. Same grid as
            /acordes (app/[lang]/acordes/page.tsx): 110px columns, each
            change badge hung in the 48px gap to the right of its first
            chord, so a change that ends a row sits after that chord rather
            than on a line of its own. The max-w steps keep 1-4 columns
            exactly. Keyed by chord, so only a chord that actually changed
            fingers itself in again. */}
        <div
          aria-live="polite"
          className="relative mx-auto grid w-full max-w-[110px] min-h-40 justify-start gap-x-12 gap-y-6 text-left [grid-template-columns:repeat(auto-fit,110px)] min-[316px]:max-w-[268px] min-[474px]:max-w-[426px] min-[632px]:max-w-[584px]"
        >
          {slots.map(({ token, chord }, i) => {
            const next = slots[i + 1]?.chord;
            return (
              <div key={`${chord?.name ?? token}-${i}`} className="relative flex items-center justify-start">
                {chord ? (
                  <div className="finger-in">
                    <ChordDiagram chord={chord} />
                  </div>
                ) : (
                  <ChordNotFound name={displayToken(token, notation)} />
                )}
                {chord && next && (
                  <div className="absolute left-full top-1/2 ml-2 -translate-y-1/2">
                    <TransitionBadge difficulty={transitionDifficulty(chord, next)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
