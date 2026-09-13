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

export default function Home() {
  const [input, setInput] = useState("G - D - Em - C");
  const [showDifficulty, setShowDifficulty] = useState(true);

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
          placeholder={t("home.progressionPlaceholder")}
        />
        <p className="text-xs text-muted">{t("home.progressionHint")}</p>
        {truncated && (
          <p className="text-xs text-muted">
            {t("home.chordLimit", { limit: String(CHORD_LIMIT) })}
          </p>
        )}
      </div>

      <button
        onClick={() => setShowDifficulty((v) => !v)}
        className="rounded-full border border-line px-3 py-1 text-sm hover:border-accent"
      >
        {showDifficulty ? t("home.hideDifficulty") : t("home.showDifficulty")}
      </button>

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-6">
        {tokens.map((token, i) => {
          const chord = findChord(token);
          // Bundled with the OUTGOING transition (to i+1), not the incoming
          // one — so when flex-wrap breaks the line, the badge stays glued
          // to the chord it's leaving (end of the row), instead of drifting
          // to the start of the next row where it reads as unrelated.
          const nextChord =
            i < tokens.length - 1 ? findChord(tokens[i + 1]) : undefined;

          return (
            <div key={`${token}-${i}`} className="flex items-center gap-4">
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
