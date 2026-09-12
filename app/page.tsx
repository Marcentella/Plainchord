"use client";

import { useMemo, useState } from "react";
import ChordDiagram from "@/components/ChordDiagram";
import ChordNotFound from "@/components/ChordNotFound";
import { findChord, parseProgression } from "@/lib/chords";

export default function Home() {
  const [input, setInput] = useState("G - D - Em - C");
  const tokens = useMemo(() => parseProgression(input), [input]);

  return (
    <div className="flex flex-1 flex-col items-center gap-10 px-6 py-12">
      <div className="w-full max-w-xl flex flex-col gap-2">
        <label htmlFor="progression" className="text-sm font-medium">
          Progresión de acordes
        </label>
        <input
          id="progression"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="G - D - Em - C"
          className="w-full rounded-lg border border-line bg-transparent px-4 py-2 text-lg focus:border-accent focus:outline-2 focus:outline-accent focus:outline-offset-2"
        />
      </div>

      <div className="flex flex-wrap justify-center gap-x-8 gap-y-6">
        {tokens.map((token, i) => {
          const chord = findChord(token);
          return chord ? (
            <ChordDiagram key={`${token}-${i}`} chord={chord} />
          ) : (
            <ChordNotFound key={`${token}-${i}`} name={token} />
          );
        })}
      </div>
    </div>
  );
}
