import type { PositionVisual } from "@/lib/glossary";
import { FRETBOARD, FretboardGrid, fretY, GLOSSARY_LOOP_DUR } from "@/components/Fretboard";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

const { W, H, STRING_X, DOT_R } = FRETBOARD;

export default function PositionAnimation({ visual }: { visual: PositionVisual }) {
  const reduced = usePrefersReducedMotion();
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
            {!reduced && (
              <animate
                attributeName="opacity"
                keyTimes="0;0.35;0.45;1"
                values="0;0;1;1"
                calcMode="spline"
                keySplines="0 0 1 1;0.23 1 0.32 1;0 0 1 1"
                dur={GLOSSARY_LOOP_DUR}
                repeatCount="indefinite"
              />
            )}
          </circle>
        </>
      )}

      {visual.kind === "pull-off" && cyFrom !== undefined && (
        <>
          {/* note left ringing */}
          <circle cx={cx} cy={cyTo} r={DOT_R} fill="var(--accent)" />
          {/* origin note: present, then released */}
          <circle cx={cx} cy={cyFrom} r={DOT_R} fill="var(--accent)">
            {!reduced && (
              <animate
                attributeName="opacity"
                keyTimes="0;0.35;0.45;1"
                values="1;1;0;0"
                calcMode="spline"
                keySplines="0 0 1 1;0.23 1 0.32 1;0 0 1 1"
                dur={GLOSSARY_LOOP_DUR}
                repeatCount="indefinite"
              />
            )}
          </circle>
        </>
      )}

      {visual.kind === "slide" && cyFrom !== undefined && (
        <circle
          cx={cx}
          cy={reduced ? cyTo : cyFrom}
          r={DOT_R}
          fill="var(--accent)"
          opacity={reduced ? 1 : undefined}
        >
          {/* single continuous move, faded out during the reset jump */}
          {!reduced && (
            <animate
              attributeName="cy"
              keyTimes="0;0.05;0.5;1"
              values={`${cyFrom};${cyFrom};${cyTo};${cyTo}`}
              calcMode="spline"
              keySplines="0 0 1 1;0.77 0 0.175 1;0 0 1 1"
              dur={GLOSSARY_LOOP_DUR}
              repeatCount="indefinite"
            />
          )}
          {!reduced && (
            <animate
              attributeName="opacity"
              keyTimes="0;0.03;0.9;0.95;1"
              values="0;1;1;0;0"
              dur={GLOSSARY_LOOP_DUR}
              repeatCount="indefinite"
            />
          )}
        </circle>
      )}

      {visual.kind === "tapping" && (
        <circle
          cx={cx}
          cy={cyTo}
          r={DOT_R}
          fill="var(--accent)"
          opacity={reduced ? 1 : undefined}
        >
          {/* pops in with no origin dot, holds, releases */}
          {!reduced && (
            <animate
              attributeName="opacity"
              keyTimes="0;0.3;0.4;0.85;0.95;1"
              values="0;0;1;1;0;0"
              calcMode="spline"
              keySplines="0 0 1 1;0.23 1 0.32 1;0 0 1 1;0.23 1 0.32 1;0 0 1 1"
              dur={GLOSSARY_LOOP_DUR}
              repeatCount="indefinite"
            />
          )}
        </circle>
      )}
    </svg>
  );
}
