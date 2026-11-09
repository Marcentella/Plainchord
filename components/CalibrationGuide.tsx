import { wireU, type CalibrationFret } from "@/lib/fretMapping";

/**
 * A schematic neck showing what to click next while calibrating the camera
 * fingering check: the nut, or the chosen fret wire right after its inlay
 * dot(s). For someone who doesn't know the word "cejuela" yet. Fixed
 * orientation (headstock left): it's a legend, not a copy of the camera
 * view, and the click order doesn't depend on it (lib/fretMapping.ts's
 * orderCorners sorts the clicks out).
 */
export default function CalibrationGuide({
  step,
  fret,
  nutLabel,
  fretLabel,
}: {
  /** Clicks made so far, 0-3. */
  step: number;
  fret: CalibrationFret;
  nutLabel: string;
  fretLabel: string;
}) {
  const W = 300;
  const H = 70;
  const left = 34; // nut x
  const scale = 520; // px per scale length, so fret 13 still fits
  const top = 14;
  const bottom = H - 14;
  const x = (n: number) => left + wireU(n) * scale;
  const target = step < 2 ? 0 : fret;
  const accent = "var(--accent)";
  // The first click of a pair can be either end; on the second, the end
  // already clicked is shown dimmed.
  const secondOfPair = step % 2 === 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden className="max-w-full shrink-0 text-foreground">
      <path d={`M ${left} ${top - 4} L 4 ${top + 4} L 4 ${bottom - 4} L ${left} ${bottom + 4} Z`} fill="currentColor" opacity={0.15} />
      <rect x={left} y={top} width={x(13) - left} height={bottom - top} fill="currentColor" opacity={0.08} />
      {[3, 5, 7, 9].map((n) => (
        <circle key={n} cx={(x(n - 1) + x(n)) / 2} cy={H / 2} r={3} fill="currentColor" opacity={0.4} />
      ))}
      {[H / 2 - 9, H / 2 + 9].map((cy) => (
        <circle key={cy} cx={(x(11) + x(12)) / 2} cy={cy} r={3} fill="currentColor" opacity={0.4} />
      ))}
      {Array.from({ length: 13 }, (_, n) => n + 1).map((n) => (
        <line key={n} x1={x(n)} x2={x(n)} y1={top} y2={bottom} stroke="currentColor" strokeWidth={1} opacity={0.5} />
      ))}
      {Array.from({ length: 6 }, (_, s) => top + ((bottom - top) * (s + 0.5)) / 6).map((y) => (
        <line key={y} x1={left} x2={x(13)} y1={y} y2={y} stroke="currentColor" strokeWidth={0.6} opacity={0.5} />
      ))}
      <line x1={left} x2={left} y1={top} y2={bottom} stroke="currentColor" strokeWidth={4} />
      <line x1={x(target)} x2={x(target)} y1={top - 4} y2={bottom + 4} stroke={accent} strokeWidth={target === 0 ? 5 : 3} />
      {[top, bottom].map((y, i) => (
        <circle
          key={y}
          cx={x(target)}
          cy={y}
          r={5}
          fill={secondOfPair && i === 0 ? "currentColor" : accent}
          opacity={secondOfPair && i === 0 ? 0.35 : 1}
        />
      ))}
      <text x={x(target)} y={H - 1} textAnchor="middle" fontSize={9} fill="currentColor">
        {target === 0 ? nutLabel : fretLabel}
      </text>
    </svg>
  );
}
