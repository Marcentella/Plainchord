import type { Difficulty } from "@/lib/transitionDifficulty";
import { t } from "@/i18n";

// Dot count still encodes level for anyone who can't distinguish the colors;
// the color itself (--difficulty-*, defined per-theme in globals.css) is the
// shared "visual language" other features (tabs, per FEATURES.md) will reuse.
const DOTS: Record<Difficulty, number> = { facil: 1, media: 2, dificil: 3 };
const COLOR_CLASS: Record<Difficulty, string> = {
  facil: "text-difficulty-facil",
  media: "text-difficulty-media",
  dificil: "text-difficulty-dificil",
};

export default function TransitionBadge({ difficulty }: { difficulty: Difficulty }) {
  const label = t(`difficulty.${difficulty}`);
  return (
    <span
      className={`flex flex-col items-center gap-0.5 self-center px-1 text-xs font-medium ${COLOR_CLASS[difficulty]}`}
      role="img"
      aria-label={label}
    >
      <span aria-hidden className="tracking-widest">
        {"●".repeat(DOTS[difficulty])}
        {"○".repeat(3 - DOTS[difficulty])}
      </span>
      {label}
    </span>
  );
}
