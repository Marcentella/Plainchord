import type { Chord } from "@/lib/chords";

const W = 120;
const H = 150;
const MARGIN_X = 20;
const NUT_Y = 26;
const FRET_H = 20;
const FRETS = 4;
const STRING_X = Array.from(
  { length: 6 },
  (_, i) => MARGIN_X + i * ((W - MARGIN_X * 2) / 5),
);

export default function ChordDiagram({ chord }: { chord: Chord }) {
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={110}
        height={(110 * H) / W}
        className="text-foreground"
        role="img"
        aria-label={`Diagrama del acorde ${chord.name}`}
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
              fill="currentColor"
            >
              {f === 0 ? "o" : "x"}
            </text>
          ) : null,
        )}

        {/* strings */}
        {STRING_X.map((x, i) => (
          <line
            key={`string-${i}`}
            x1={x}
            y1={NUT_Y}
            x2={x}
            y2={NUT_Y + FRETS * FRET_H}
            stroke="currentColor"
            strokeWidth={1}
          />
        ))}

        {/* frets (nut is thicker) */}
        {Array.from({ length: FRETS + 1 }, (_, f) => (
          <line
            key={`fret-${f}`}
            x1={STRING_X[0]}
            y1={NUT_Y + f * FRET_H}
            x2={STRING_X[5]}
            y2={NUT_Y + f * FRET_H}
            stroke="currentColor"
            strokeWidth={f === 0 ? 3 : 1}
          />
        ))}

        {/* finger positions */}
        {chord.frets.map((f, i) => {
          if (f <= 0) return null;
          const cy = NUT_Y + (f - 0.5) * FRET_H;
          return (
            <g key={`dot-${i}`}>
              <circle cx={STRING_X[i]} cy={cy} r={7} fill="var(--accent)" />
              {chord.fingers[i] > 0 && (
                <text
                  x={STRING_X[i]}
                  y={cy + 4}
                  textAnchor="middle"
                  fontSize={9}
                  style={{ fill: "var(--background)" }}
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
