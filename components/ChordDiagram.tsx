import type { Chord } from "@/lib/chords";
import { FRETBOARD, FretboardGrid, fretY } from "@/components/Fretboard";
import { t } from "@/i18n";

const { W, H, NUT_Y, STRING_X, DOT_R } = FRETBOARD;

export default function ChordDiagram({ chord }: { chord: Chord }) {
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={110}
        height={(110 * H) / W}
        className="text-foreground"
        role="img"
        aria-label={t("chordDiagram.ariaLabel", { name: chord.name })}
      >
        {/* open/muted markers above the nut */}
        {chord.frets.map((f, i) =>
          f === 0 || f === -1 ? (
            <text
              key={`mark-${i}`}
              x={STRING_X[i]}
              y={NUT_Y - 10}
              textAnchor="middle"
              fontSize={13}
              fontWeight="bold"
              fill="currentColor"
            >
              {f === 0 ? "o" : "x"}
            </text>
          ) : null,
        )}

        <FretboardGrid />

        {/* finger positions */}
        {chord.frets.map((f, i) => {
          if (f <= 0) return null;
          const cy = fretY(f);
          return (
            <g key={`dot-${i}`}>
              <circle cx={STRING_X[i]} cy={cy} r={DOT_R} fill="var(--accent)" />
              {chord.fingers[i] > 0 && (
                <text
                  x={STRING_X[i]}
                  y={cy + 4}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight="bold"
                  style={{ fill: "var(--dot-text)" }}
                >
                  {chord.fingers[i]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-sm font-medium">{chord.name}</figcaption>
    </figure>
  );
}
