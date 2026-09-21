"use client";

import { useEffect, useRef, useState } from "react";
import { History, Trash2 } from "lucide-react";
import { t } from "@/i18n";
import type { TabHistoryEntry } from "@/lib/tabHistory";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });

export default function TabHistoryMenu({
  history,
  onSelect,
  onDelete,
}: {
  history: TabHistoryEntry[];
  onSelect: (entry: TabHistoryEntry) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Same dismissal pattern as PalettePicker/NavMenu: outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("tabHistory.ariaLabel")}
        aria-expanded={open}
        className="rounded-full border border-line p-1.5 transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
      >
        <History size={16} aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 flex w-72 flex-col gap-0.5 rounded-lg border border-line bg-background p-1.5 shadow-lg">
          {history.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted">{t("tabHistory.empty")}</p>
          ) : (
            history.map((entry) => {
              const title = entry.tab.title ?? t("tab.untitled");
              return (
                // A real <button> can't contain another focusable element
                // (invalid HTML — the delete button below would get hoisted
                // out of it by the browser's parser, breaking both click
                // and focus order), so the row itself is a div acting as a
                // button, with a genuine nested <button> for delete.
                <div
                  key={entry.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onSelect(entry);
                    setOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(entry);
                      setOpen(false);
                    }
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover-fine:text-accent"
                >
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate">{title}</div>
                    <div className="text-xs text-muted">{dateFormat.format(entry.importedAt)}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(entry.id);
                    }}
                    aria-label={t("tabHistory.deleteAriaLabel", { title })}
                    className="shrink-0 text-muted transition hover-fine:text-difficulty-dificil active:scale-[0.97] duration-[160ms] ease-out"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
