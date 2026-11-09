"use client";

import type { Chord } from "@/lib/chords";
import { findBarres } from "@/lib/chordShape";
import { FRETBOARD, FretboardGrid, fretY } from "@/components/Fretboard";
import { useT } from "@/i18n/LocaleProvider";
import { formatChord, formatNote } from "@/lib/notation";
import { useNotation } from "@/lib/useNotation";

const { W, H, NUT_Y, STRING_X, DOT_R } = FRETBOARD;

// Open-string notes, low E -> high e, same order as Chord.frets.
const OPEN_NOTES = ["E", "A", "D", "G", "B", "E"];
// Extra room the guide's labels need around the plain diagram: fret
// numbers to the left, string numbers + names below the grid (which already
// has spare space under it, so the height stays the same).
const LABEL_PAD_X = 22;

/** Where a finger actually is (the camera check, components/CameraCheckModal.tsx). */
export type FingerMark = { string: number; fret: number; finger: number; match: boolean };

/**
 * `labels` (the guide's "how to read a diagram" articles): numbers each
 * string 6..1 with its open note, and each fret 1..4 — the same diagram
 * everyone sees in /acordes, just with its parts named.
 *
 * `marks`: where the camera sees each finger — a ring around the dot when
 * it's there, a grey dot with the finger's number (same size as the
 * diagram's own) where it is instead. Off the diagram's four frets, not
 * drawn (the text beside it still says where). `size` overrides the
 * default width.
 */
export default function ChordDiagram({
  chord,
  labels = false,
  marks = [],
  size,
}: {
  chord: Chord;
  labels?: boolean;
  marks?: FingerMark[];
  size?: number;
}) {
  const t = useT();
  const notation = useNotation();
  const name = formatChord(chord.name, notation);
  const viewX = labels ? -LABEL_PAD_X : 0;
  const viewW = labels ? W + LABEL_PAD_X * 2 : W;
  const width = size ?? (labels ? 190 : 110);
  const barres = findBarres(chord);
  // A string under a barre is drawn as part of the bar, not as its own
  // dot on top of it.
  const barredStrings = new Set(barres.flatMap((b) => b.strings));

  return (
    <figure className="flex flex-col items-center gap-1">
      <svg
        viewBox={`${viewX} 0 ${viewW} ${H}`}
        width={width}
        height={(width * H) / viewW}
        className="text-foreground"
        role="img"
        aria-label={t("chordDiagram.ariaLabel", { name })}
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

        {labels && (
          <g textAnchor="middle" style={{ fill: "var(--muted)" }}>
            {STRING_X.map((x, i) => (
              <g key={`label-${i}`}>
                <text x={x} y={NUT_Y + FRETBOARD.FRETS * FRETBOARD.FRET_H + 16} fontSize={10} fontWeight="bold">
                  {6 - i}
                </text>
                <text x={x} y={NUT_Y + FRETBOARD.FRETS * FRETBOARD.FRET_H + 29} fontSize={8}>
                  {formatNote(OPEN_NOTES[i], notation)}
                </text>
              </g>
            ))}
            {Array.from({ length: FRETBOARD.FRETS }, (_, f) => (
              <text key={`fret-${f}`} x={-10} y={fretY(f + 1) + 3} fontSize={9}>
                {f + 1}
              </text>
            ))}
          </g>
        )}

        {/* barres — one long rounded bar per barred finger, the standard
            chord-chart symbol, instead of a separate circle per string it
            covers. Drawn before the individual dots below so a chord
            whose barre finger and a regular finger ever land at the exact
            same fret+string (not possible with today's data, but not
            structurally prevented either) would still show the dot on
            top. */}
        {barres.map((b) => {
          const from = Math.min(...b.strings);
          const to = Math.max(...b.strings);
          const cy = fretY(b.fret);
          return (
            <g key={`barre-${b.finger}-${b.fret}`}>
              <rect
                x={STRING_X[from] - DOT_R}
                y={cy - DOT_R}
                width={STRING_X[to] - STRING_X[from] + DOT_R * 2}
                height={DOT_R * 2}
                rx={DOT_R}
                fill="var(--accent)"
              />
              <text
                x={(STRING_X[from] + STRING_X[to]) / 2}
                y={cy + 4}
                textAnchor="middle"
                fontSize={9}
                fontWeight="bold"
                style={{ fill: "var(--dot-text)" }}
              >
                {b.finger}
              </text>
            </g>
          );
        })}

        {/* finger positions not already covered by a barre above */}
        {chord.frets.map((f, i) => {
          if (f <= 0 || barredStrings.has(i)) return null;
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

        {marks
          .filter((m) => m.fret >= 1 && m.fret <= FRETBOARD.FRETS)
          .map((m) => {
            const cx = STRING_X[m.string];
            const cy = fretY(m.fret);
            return m.match ? (
              <circle key={`mark-${m.finger}`} cx={cx} cy={cy} r={DOT_R + 3} fill="none" stroke="var(--difficulty-facil)" strokeWidth={2.5} />
            ) : (
              <g key={`mark-${m.finger}`}>
                <circle cx={cx} cy={cy} r={DOT_R} fill="var(--muted)" opacity={0.85} />
                <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9} fontWeight="bold" style={{ fill: "var(--background)" }}>
                  {m.finger}
                </text>
              </g>
            );
          })}
      </svg>
      <figcaption className="text-sm font-medium">{name}</figcaption>
    </figure>
  );
}
