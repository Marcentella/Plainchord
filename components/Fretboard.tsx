// Shared fretboard geometry + grid, so every diagram (chord library, and now
// glossary position animations) draws the same strings/frets instead of each
// component reimplementing its own.
export const GLOSSARY_LOOP_DUR = "2.4s";

export const FRETBOARD = {
  W: 120,
  H: 150,
  MARGIN_X: 20,
  NUT_Y: 26,
  FRET_H: 20,
  FRETS: 4,
  DOT_R: 7,
  STRING_X: Array.from(
    { length: 6 },
    (_, i) => 20 + i * ((120 - 20 * 2) / 5),
  ),
};

/** Vertical center of a fretted dot for a given fret number (1-based). */
export function fretY(fret: number): number {
  return FRETBOARD.NUT_Y + (fret - 0.5) * FRETBOARD.FRET_H;
}

export function FretboardGrid({ hideString }: { hideString?: number } = {}) {
  const { STRING_X, NUT_Y, FRET_H, FRETS } = FRETBOARD;
  return (
    <>
      {STRING_X.map((x, i) =>
        i === hideString ? null : (
          <line
            key={`string-${i}`}
            x1={x}
            y1={NUT_Y}
            x2={x}
            y2={NUT_Y + FRETS * FRET_H}
            stroke="currentColor"
            strokeWidth={1}
          />
        ),
      )}
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
    </>
  );
}
