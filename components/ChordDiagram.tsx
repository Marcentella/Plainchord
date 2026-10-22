"use client";

import type { Chord } from "@/lib/chords";
import { FRETBOARD, FretboardGrid, fretY } from "@/components/Fretboard";
import { useT } from "@/i18n/LocaleProvider";
import { formatChord, formatNote } from "@/lib/notation";
import { useNotation } from "@/lib/useNotation";

const { W, H, NUT_Y, STRING_X, DOT_R } = FRETBOARD;

type Barre = { finger: number; fret: number; strings: number[] };

/** A finger pressing the same fret on 2+ strings is physically a barre
 * (full or partial) — one finger can't otherwise be in two places at
 * once. Detected from frets/fingers alone (grouping by finger+fret), no
 * extra data field needed: data/chords.json never has to say "this one is
 * a barre" for this to work. `strings` keeps the exact indices the finger
 * touches (e.g. F's index finger is on strings 0, 4 and 5 — NOT a
 * contiguous run, since the G/D/A strings in between are pressed higher
 * by other fingers) — the bar is still drawn across the full min-to-max
 * span, same as every printed chord chart draws it. */
function findBarres(chord: Chord): Barre[] {
  const groups = new Map<string, number[]>();
  chord.frets.forEach((fret, i) => {
    const finger = chord.fingers[i];
    if (fret > 0 && finger > 0) {
      const key = `${finger}-${fret}`;
      const strings = groups.get(key);
      if (strings) strings.push(i);
      else groups.set(key, [i]);
    }
  });
  return Array.from(groups.entries())
    .filter(([, strings]) => strings.length >= 2)
    .map(([key, strings]) => ({
      finger: Number(key.split("-")[0]),
      fret: Number(key.split("-")[1]),
      strings,
    }));
}

// Open-string notes, low E -> high e, same order as Chord.frets.
const OPEN_NOTES = ["E", "A", "D", "G", "B", "E"];
// Extra room the guide's labels need around the plain diagram: fret
// numbers to the left, string numbers + names below the grid (which already
// has spare space under it, so the height stays the same).
const LABEL_PAD_X = 22;

/**
 * `labels` (the guide's "how to read a diagram" articles): numbers each
 * string 6..1 with its open note, and each fret 1..4 — the same diagram
 * everyone sees in /acordes, just with its parts named.
 */
export default function ChordDiagram({ chord, labels = false }: { chord: Chord; labels?: boolean }) {
  const t = useT();
  const notation = useNotation();
  const name = formatChord(chord.name, notation);
  const viewX = labels ? -LABEL_PAD_X : 0;
  const viewW = labels ? W + LABEL_PAD_X * 2 : W;
  const width = labels ? 190 : 110;
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
      </svg>
      <figcaption className="text-sm font-medium">{name}</figcaption>
    </figure>
  );
}
