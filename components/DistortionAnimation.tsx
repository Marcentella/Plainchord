import type { DistortionVisual } from "@/lib/glossary";
import { FRETBOARD, FretboardGrid, GLOSSARY_LOOP_DUR } from "@/components/Fretboard";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

const { W, H, STRING_X, NUT_Y, FRET_H, FRETS } = FRETBOARD;
const BOTTOM_Y = NUT_Y + FRETS * FRET_H;

// A vertical line only reads as "bulging" if it deflects sideways — bowing
// its own y control point wouldn't be visible (it'd stay on the same x).
// So "bends up" is drawn here as a sideways bulge; a simplified schematic,
// not the true bend direction (which varies by string).
const BULGE_X = 10;

export default function DistortionAnimation({ visual }: { visual: DistortionVisual }) {
  const reduced = usePrefersReducedMotion();
  const cx = STRING_X[visual.string];
  const top = NUT_Y + (visual.fret - 1) * FRET_H;
  const bottom = NUT_Y + visual.fret * FRET_H;
  const mid = (top + bottom) / 2;

  // Both keyframes share the exact same command sequence (M,L,Q,L) — SMIL
  // can only interpolate/step between path values with matching command
  // structure; a Q whose control point sits on the line renders as straight.
  const straightD = `M ${cx} ${NUT_Y} L ${cx} ${top} Q ${cx} ${mid} ${cx} ${bottom} L ${cx} ${BOTTOM_Y}`;
  const bentD = `M ${cx} ${NUT_Y} L ${cx} ${top} Q ${cx + BULGE_X} ${mid} ${cx} ${bottom} L ${cx} ${BOTTOM_Y}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={110}
      height={(110 * H) / W}
      className="text-foreground"
      role="img"
      aria-hidden
    >
      {/* the animated string replaces its own plain grid line entirely */}
      <FretboardGrid hideString={visual.string} />

      {visual.kind === "bend" && (
        <path
          d={reduced ? bentD : straightD}
          stroke="currentColor"
          strokeWidth={1}
          fill="none"
        >
          {/* same appear-hold-reset timing as hammer-on: quick push, hold,
              snap back at the loop seam — no explicit reverse tween */}
          {!reduced && (
            <animate
              attributeName="d"
              keyTimes="0;0.35;0.45;1"
              values={`${straightD};${straightD};${bentD};${bentD}`}
              calcMode="spline"
              keySplines="0 0 1 1;0.77 0 0.175 1;0 0 1 1"
              dur={GLOSSARY_LOOP_DUR}
              repeatCount="indefinite"
            />
          )}
        </path>
      )}

      {visual.kind === "vibrato" && (
        <line
          x1={cx}
          y1={NUT_Y}
          x2={cx}
          y2={BOTTOM_Y}
          stroke="currentColor"
          strokeWidth={1}
        >
          {/* continuous side-to-side wobble, no hold/pause between cycles */}
          {!reduced && (
            <animateTransform
              attributeName="transform"
              type="translate"
              keyTimes="0;0.125;0.25;0.375;0.5;0.625;0.75;0.875;1"
              values="0,0;2,0;-2,0;2,0;-2,0;2,0;-2,0;2,0;0,0"
              dur={GLOSSARY_LOOP_DUR}
              repeatCount="indefinite"
            />
          )}
        </line>
      )}
    </svg>
  );
}
