/** Splits "G - D - Em - C" (or comma/space separated) into chord name tokens. */
export function parseProgression(input: string): string[] {
  return input
    .split(/[\s,\-–—]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
