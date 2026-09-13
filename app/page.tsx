"use client";

import { useMemo, useState } from "react";
import ChordDiagram from "@/components/ChordDiagram";
import ChordNotFound from "@/components/ChordNotFound";
import ChordProgressionInput from "@/components/ChordProgressionInput";
import TransitionBadge from "@/components/TransitionBadge";
import { findChord, parseProgression } from "@/lib/chords";
import { transitionDifficulty } from "@/lib/transitionDifficulty";
import { t } from "@/i18n";

const CHORD_LIMIT = 16;

// Literal, curated progressions — no transposition, no matching logic (see
// FEATURES.md's "evaluado y pausado" note on why the dynamic version isn't
// built). Every chord here already exists in data/chords.json so none of
// these ever render as "no encontrado".
const COMMON_PROGRESSIONS = [
  "G - D - Em - C",
  "C - G - Am - Em",
  "Am - Dm - E7",
  "D - A - G",
  "E - A - B7",
  "C - Am - Dm - G7",
];

export default function Home() {
  const [input, setInput] = useState("G - D - Em - C");
  const [showDifficulty, setShowDifficulty] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const allTokens = useMemo(() => parseProgression(input), [input]);
  const tokens = allTokens.slice(0, CHORD_LIMIT);
  const truncated = allTokens.length > CHORD_LIMIT;

  return (
    <div className="flex flex-1 flex-col items-center gap-10 px-6 py-12">
      <div className="w-full max-w-xl flex flex-col gap-2">
        <label htmlFor="progression" className="text-sm font-medium">
          {t("home.progressionLabel")}
        </label>
        <ChordProgressionInput
          id="progression"
          value={input}
          onChange={setInput}
          placeholder={t("home.progressionHint")}
        />
        {truncated && (
          <p className="text-xs text-muted">
            {t("home.chordLimit", { limit: String(CHORD_LIMIT) })}
          </p>
        )}
      </div>

      {/* Own centered block (sibling of the input box, not nested inside
          it) — this is what the difficulty toggle used to be on its own;
          grouping the suggestions link in with it must not pull it into
          the input box's left-aligned column. */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={() => setShowSuggestions((v) => !v)}
            className="text-xs text-muted underline transition hover-fine:text-accent active:scale-[0.97] duration-[160ms] ease-out"
          >
            {showSuggestions
              ? t("home.hideSuggestions")
              : t("home.showSuggestions")}
          </button>
          <button
            onClick={() => setShowDifficulty((v) => !v)}
            className="rounded-full border border-line px-3 py-1 text-sm transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
          >
            {showDifficulty
              ? t("home.hideDifficulty")
              : t("home.showDifficulty")}
          </button>
        </div>
        {showSuggestions && (
          <div className="flex flex-wrap justify-center gap-2">
            {COMMON_PROGRESSIONS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setInput(p);
                  setShowSuggestions(false);
                }}
                className="rounded-full border border-line px-3 py-1 text-sm transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fixed-width columns (not flex-wrap) so every row gets the same
          column count — flex-wrap packs each row greedily by cumulative
          width, and the last bundle (no trailing badge) is narrower than
          the rest, so it would randomly squeeze an extra item onto its row
          while identical-width bundles elsewhere don't. */}
      <div className="w-full grid justify-center gap-x-4 gap-y-6 [grid-template-columns:repeat(auto-fit,190px)]">
        {tokens.map((token, i) => {
          const chord = findChord(token);
          // Bundled with the OUTGOING transition (to i+1), not the incoming
          // one — so when the grid wraps to a new row, the badge stays
          // glued to the chord it's leaving, instead of drifting to the
          // start of the next row where it reads as unrelated.
          const nextChord =
            i < tokens.length - 1 ? findChord(tokens[i + 1]) : undefined;

          return (
            <div
              key={`${token}-${i}`}
              // gap-7 (28px), not gap-4 — with a fixed 190px cell, a 110px
              // diagram, and the grid's own 16px column gap, that's what
              // centers the badge between this chord and the next one
              // instead of it hugging the left chord (96px total slack,
              // badge ~38-41px wide, (96-40)/2 ≈ 28px either side).
              className="flex items-center justify-start gap-7"
            >
              {chord ? (
                <ChordDiagram chord={chord} />
              ) : (
                <ChordNotFound name={token} />
              )}
              {showDifficulty && chord && nextChord && (
                <TransitionBadge
                  difficulty={transitionDifficulty(chord, nextChord)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
