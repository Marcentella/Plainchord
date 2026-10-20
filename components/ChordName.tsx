"use client";

import { formatChord } from "@/lib/notation";
import { useNotation } from "@/lib/useNotation";

/** A chord name in the active notation, for server components that can't read it themselves. */
export default function ChordName({ name }: { name: string }) {
  return <>{formatChord(name, useNotation())}</>;
}
