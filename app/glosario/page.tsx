"use client";

import { useMemo, useState } from "react";
import { allGlossaryEntries, searchGlossary } from "@/lib/glossary";
import GlossaryEntryDetail from "@/components/GlossaryEntryDetail";
import { t } from "@/i18n";

export default function Glosario() {
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState(allGlossaryEntries[0].name);

  const results = useMemo(() => searchGlossary(query), [query]);
  const selected = allGlossaryEntries.find((e) => e.name === selectedName);

  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-6 py-12">
      <div className="w-full max-w-xl flex flex-col gap-2">
        <label htmlFor="glossary-search" className="text-sm font-medium">
          {t("glossary.searchLabel")}
        </label>
        <input
          id="glossary-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("glossary.searchPlaceholder")}
          className="w-full rounded-lg border border-line bg-transparent px-4 py-2 text-lg transition-colors focus:border-accent focus:outline-2 focus:outline-accent focus:outline-offset-2"
        />
      </div>

      {results.length === 0 ? (
        <p className="text-sm text-muted">
          {t("glossary.notFound", { query })}
        </p>
      ) : (
        <div className="flex flex-wrap justify-center gap-2 max-w-xl">
          {results.map((entry) => (
            <button
              key={entry.name}
              onClick={() => setSelectedName(entry.name)}
              className={`rounded-full border px-3 py-1 text-sm transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out ${
                entry.name === selectedName
                  ? "border-accent text-accent"
                  : "border-line"
              }`}
            >
              <span className="font-mono text-accent mr-1.5">{entry.symbol}</span>
              {entry.name}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="w-full max-w-xl rounded-lg border border-line p-5">
          <GlossaryEntryDetail entry={selected} />
        </div>
      )}
    </div>
  );
}
