import type { MarkerVisual } from "@/lib/glossary";
import { FRETBOARD, FretboardGrid, fretY } from "@/components/Fretboard";

const { W, H, STRING_X } = FRETBOARD;

// Tab rows read high string (e) on top, low (E) on bottom — the opposite of
// STRING_X's low-to-high order — so row 0 here is string index 5.
const STRING_LABELS = ["e", "B", "G", "D", "A", "E"];
const TAB_COLUMN = 4;

export default function MarkerAnimation({ visual }: { visual: MarkerVisual }) {
  const cx = STRING_X[visual.string];
  const cy = fretY(visual.fret);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={110}
        height={(110 * H) / W}
        className="text-foreground"
        role="img"
        aria-hidden
      >
        <FretboardGrid />
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize={13}
          fill="currentColor"
          className="glossary-fade-hold"
        >
          x
        </text>
      </svg>

      {/* same fretboard position, shown as it looks in a plain-text tab */}
      <pre className="font-mono text-sm leading-tight" aria-hidden>
        {STRING_LABELS.map((label, row) => {
          const isTargetRow = 5 - row === visual.string;
          return (
            <div key={label + row}>
              {label}|
              {"-".repeat(TAB_COLUMN)}
              {isTargetRow ? (
                <span className="glossary-fade-hold">x</span>
              ) : (
                "-"
              )}
              {"-".repeat(TAB_COLUMN)}|
            </div>
          );
        })}
      </pre>
    </div>
  );
}
