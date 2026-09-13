import type { PositionVisual } from "@/lib/glossary";
import { FRETBOARD, FretboardGrid, fretY } from "@/components/Fretboard";

const { W, H, STRING_X, DOT_R } = FRETBOARD;

// One loop length for all four kinds — native SVG SMIL <animate>, no JS
// timers. Each kind below is keyed so the value at t=1 always matches the
// value at t=0, so the indefinite repeat has no visible jump at the seam.
const DUR = "2.4s";

export default function PositionAnimation({ visual }: { visual: PositionVisual }) {
  const cx = STRING_X[visual.string];
  const cyTo = fretY(visual.toFret);
  const cyFrom = visual.fromFret != null ? fretY(visual.fromFret) : undefined;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={110}
      height={(110 * H) / W}
      className="text-foreground"
      role="img"
      aria-hidden
    >
      <FretboardGrid />

      {visual.kind === "hammer-on" && cyFrom !== undefined && (
        <>
          {/* origin note: always sounding */}
          <circle cx={cx} cy={cyFrom} r={DOT_R} fill="var(--accent)" />
          {/* hammered note: appears and stays for the rest of the loop */}
          <circle cx={cx} cy={cyTo} r={DOT_R} fill="var(--accent)">
            <animate
              attributeName="opacity"
              keyTimes="0;0.35;0.45;1"
              values="0;0;1;1"
              dur={DUR}
              repeatCount="indefinite"
            />
          </circle>
        </>
      )}

      {visual.kind === "pull-off" && cyFrom !== undefined && (
        <>
          {/* note left ringing */}
          <circle cx={cx} cy={cyTo} r={DOT_R} fill="var(--accent)" />
          {/* origin note: present, then released */}
          <circle cx={cx} cy={cyFrom} r={DOT_R} fill="var(--accent)">
            <animate
              attributeName="opacity"
              keyTimes="0;0.35;0.45;1"
              values="1;1;0;0"
              dur={DUR}
              repeatCount="indefinite"
            />
          </circle>
        </>
      )}

      {visual.kind === "slide" && cyFrom !== undefined && (
        <circle cx={cx} cy={cyFrom} r={DOT_R} fill="var(--accent)">
          {/* single continuous move, faded out during the reset jump */}
          <animate
            attributeName="cy"
            keyTimes="0;0.05;0.5;1"
            values={`${cyFrom};${cyFrom};${cyTo};${cyTo}`}
            dur={DUR}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            keyTimes="0;0.03;0.9;0.95;1"
            values="0;1;1;0;0"
            dur={DUR}
            repeatCount="indefinite"
          />
        </circle>
      )}

      {visual.kind === "tapping" && (
        <circle cx={cx} cy={cyTo} r={DOT_R} fill="var(--accent)">
          {/* pops in with no origin dot, holds, releases */}
          <animate
            attributeName="opacity"
            keyTimes="0;0.3;0.4;0.85;0.95;1"
            values="0;0;1;1;0;0"
            dur={DUR}
            repeatCount="indefinite"
          />
        </circle>
      )}
    </svg>
  );
}
