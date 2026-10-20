"use client";

import { useRouter } from "next/navigation";
import { href } from "@/i18n/routes";
import { useLocale } from "@/i18n/useLocale";
import ChordDiagram from "@/components/ChordDiagram";
import TransitionBadge from "@/components/TransitionBadge";
import { PROGRESSION_STORAGE_KEY, findChord, parseProgression } from "@/lib/chords";
import { canonicalToken } from "@/lib/notation";
import { useNotationText } from "@/lib/useNotation";
import { transitionDifficulty } from "@/lib/transitionDifficulty";
import { useT } from "@/i18n/LocaleProvider";

/** The landing shows a taste, not the whole library — four chords is a typical song section. */
const PREVIEW_LIMIT = 4;

/**
 * The landing's one action: type a progression, see it answered right
 * there (diagrams + how hard each change is), then carry it into the chord
 * library. Nothing new under the hood — the same parser, diagrams and
 * difficulty the library uses.
 */
const isChord = (canonical: string) => findChord(canonical) !== undefined;

export default function LandingHero() {
  const t = useT();
  const router = useRouter();
  const locale = useLocale();
  // Typed in the active notation; saved for the library in American.
  const { text: input, setText: setInput, canonical, notation } = useNotationText("G D Em C", isChord);
  const chords = parseProgression(input)
    .map((token) => findChord(canonicalToken(token, notation)))
    .filter((chord) => chord !== undefined)
    .slice(0, PREVIEW_LIMIT);

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
    <div className="flex flex-col gap-10">
      <form onSubmit={open} className="flex flex-wrap items-center gap-3">
        <label htmlFor="landing-progression" className="sr-only">
          {t("landing.inputLabel")}
        </label>
        <input
          id="landing-progression"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="h-14 w-full max-w-sm rounded-xl border border-line bg-background px-5 text-xl font-medium transition-colors focus:border-accent focus:outline-2 focus:outline-accent focus:outline-offset-2"
        />
        <button
          type="submit"
          className="h-14 rounded-xl bg-accent px-6 text-lg font-medium text-dot-text transition active:scale-[0.97] duration-[160ms] ease-out"
        >
          {t("landing.cta")}
        </button>
      </form>

      {/* The answer, in open space — no box around it. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        {chords.map((chord, i) => (
          <div key={`${chord.name}-${i}`} className="flex items-center gap-6">
            <ChordDiagram chord={chord} />
            {chords[i + 1] && <TransitionBadge difficulty={transitionDifficulty(chord, chords[i + 1])} />}
          </div>
        ))}
      </div>
    </div>
  );
}
