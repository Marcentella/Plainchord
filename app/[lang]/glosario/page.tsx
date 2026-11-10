"use client";

import { useMemo, useRef, useState } from "react";
import { allGlossaryEntries, localizedEntry, searchGlossary } from "@/lib/glossary";
import GlossaryEntryDetail from "@/components/GlossaryEntryDetail";
import { useT } from "@/i18n/LocaleProvider";
import { useLocale } from "@/i18n/useLocale";

// From lg up the search and the list sit in a sticky column beside the
// entry, like a reference's index; below that the list is two even columns
// above it. Either way each row is symbol (fixed-width column) + name, so the
// names line up instead of reading as ragged pills wrapped around the centre.
const WIDE = "(min-width: 1024px)";

export default function Glosario() {
  const t = useT();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState(allGlossaryEntries[0].name);
  const detailRef = useRef<HTMLElement>(null);

  const results = useMemo(() => searchGlossary(query, locale), [query, locale]);
  const selected = allGlossaryEntries.find((e) => e.name === selectedName);

  function select(name: string) {
    setSelectedName(name);
    // Stacked layout: the entry is below the list, so bring it into view.
    if (!window.matchMedia(WIDE).matches) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      detailRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl flex-1 content-start gap-8 px-6 py-12 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
      <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <div className="flex flex-col gap-2">
          <label htmlFor="glossary-search" className="text-sm font-medium">
            {t("glossary.searchLabel")}
          </label>
          <input
            id="glossary-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("glossary.searchPlaceholder")}
            className="w-full rounded-lg border border-line bg-transparent px-3 py-2 transition-colors focus:border-accent focus:outline-2 focus:outline-accent focus:outline-offset-2"
          />
        </div>

        {results.length === 0 ? (
          <p className="text-sm text-muted">{t("glossary.notFound", { query })}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 min-[440px]:grid-cols-2 lg:grid-cols-1">
            {results.map((entry) => {
              const current = entry.name === selectedName;
              return (
                <li key={entry.name}>
                  <button
                    onClick={() => select(entry.name)}
                    aria-current={current || undefined}
                    className={`flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      current ? "bg-line/60 font-medium text-foreground" : "text-muted hover-fine:text-foreground"
                    }`}
                  >
                    <span className="w-7 shrink-0 font-mono text-accent">{entry.symbol}</span>
                    <span className="min-w-0">{localizedEntry(entry, locale).name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {selected && (
        <section ref={detailRef} className="scroll-mt-24 rounded-lg border border-line p-6 lg:max-w-2xl">
          <GlossaryEntryDetail entry={selected} />
        </section>
      )}
    </div>
  );
}
