"use client";

import { useEffect, useRef, useState } from "react";
import { FolderOpen, Loader2, Upload } from "lucide-react";
import { parseTab, MAX_BEATS } from "@/lib/parseTab";
import type { Tab } from "@/lib/tab";
import TabRenderer from "@/components/TabRenderer";
import { useIsomorphicLayoutEffect } from "@/lib/useIsomorphicLayoutEffect";
import { t } from "@/i18n";

// Explicit map (not a template-string key) so renaming an error variant
// without updating this breaks the build instead of silently rendering a
// missing-key fallback.
const ERROR_MESSAGE_KEY = {
  noStaff: "tab.noStaff",
  wrongStringCount: "tab.wrongStringCount",
  corruptFile: "tab.corruptFile",
  badExtension: "tab.badExtension",
} as const;

const GP_EXTENSIONS = [".gp3", ".gp4", ".gp5", ".gpx"];
const MAX_TEXTAREA_HEIGHT = 320; // px — auto-grows up to this, scrolls internally beyond it
// The already-parsed Tab, not the raw source — identical shape for a pasted
// tab and a Guitar Pro import, so one save path covers both, and it's the
// normalized beat data rather than a multi-hundred-KB binary file. A one-off
// value like this is the same simple case as ThemeToggle/PalettePicker's
// localStorage use (see app/page.tsx's PROGRESSION_KEY); IndexedDB stays the
// right store for anything bigger or multi-item later (a saved-tabs library,
// say), not for "the one most recent tab."
const LAST_TAB_KEY = "lastTab";

type ImportState =
  | { kind: "empty" }
  | { kind: "textError"; error: "noStaff" | "wrongStringCount" }
  | { kind: "fileError"; error: "corruptFile" | "wrongStringCount" | "badExtension" }
  // notices are pre-resolved i18n strings, not raw counts — one shape
  // covers both the plain-text path's (truncated/ignoredChars/skippedBlocks)
  // and the Guitar Pro path's (unmappedTechniques) different notice sets.
  | { kind: "ok"; tab: Tab; notices: string[] };

function hasGpExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return GP_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// Artist, tuning, tempo — whichever of these a Guitar Pro import actually
// had (see lib/importGuitarPro.ts). A plain-text paste has none of them, so
// this returns null and the header simply skips the subtitle line rather
// than showing an empty one.
function tabSubtitle(tab: Tab): string | null {
  const parts = [tab.artist, tab.tuning?.join(" "), tab.tempo ? `${tab.tempo} BPM` : null].filter(
    (part): part is string => !!part,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

// Header's fixed, known shape (a title line over a subtitle line) makes it
// a good fit for a real skeleton — unlike the notation below, which has no
// knowable shape until the import actually finishes (see the "importing"
// branch further down, which blurs the existing render instead of guessing).
function TabHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-0.5">
      <div className="skeleton-shimmer h-7 w-48 rounded" />
      <div className="skeleton-shimmer h-4 w-64 rounded" />
    </div>
  );
}

function ImportingSpinner() {
  return (
    <>
      <Loader2 className="size-8 text-accent animate-spin" aria-hidden="true" />
      <span className="sr-only">{t("tab.importingStatus")}</span>
    </>
  );
}

export default function Tablatura() {
  const [text, setText] = useState("");
  const [state, setState] = useState<ImportState>({ kind: "empty" });
  const [expanded, setExpanded] = useState(true);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  // True while a Guitar Pro file is being read/parsed — the only import
  // path with a real async gap (dynamic-imports alphaTab, then parses).
  // Plain-text paste is synchronous and never sets this.
  const [isImporting, setIsImporting] = useState(false);
  // Gates the save effect below until the load effect has actually run —
  // same hydration-safe shape as ThemeToggle/PalettePicker/app/page.tsx's
  // progression input.
  const [tabLoaded, setTabLoaded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Runs before the first paint, not after — restoring a saved tab lands in
  // the SAME paint as the hydrated default instead of a visible flash of
  // the empty input first (see lib/useIsomorphicLayoutEffect.ts).
  useIsomorphicLayoutEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_TAB_KEY);
      const tab = saved ? (JSON.parse(saved) as Tab) : null;
      if (tab && Array.isArray(tab.beats)) {
        setState({ kind: "ok", tab, notices: [] });
        setExpanded(false);
      }
    } catch {
      // Corrupt or incompatible saved data — ignore, keep the empty default.
    }
    setTabLoaded(true);
  }, []);

  // Saves whenever a tab successfully (re)loads, from either import path —
  // not on every keystroke the way the progression input saves, since
  // there's no "committed" moment there but there very much is here.
  useEffect(() => {
    if (tabLoaded && state.kind === "ok") {
      try {
        localStorage.setItem(LAST_TAB_KEY, JSON.stringify(state.tab));
      } catch {
        // Safari private browsing throws on every localStorage.setItem
        // unconditionally, not just when actually over quota — persistence
        // is a nice-to-have here, not something the rest of the page
        // depends on, so just skip it rather than let this become an
        // uncaught error in the effect.
      }
    }
  }, [state, tabLoaded]);

  // Auto-grow, capped, then scroll internally — replaces the manual resize
  // handle, which made no sense once this box also collapses to a pill the
  // moment a tab loads (point 2 of the brief).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [text]);

  function applyTextChange(value: string) {
    setText(value);
    if (!value.trim()) {
      setState({ kind: "empty" });
      return;
    }
    const result = parseTab(value);
    if (!result.ok) {
      setState({ kind: "textError", error: result.error });
      return;
    }
    // A block of six valid staff lines with no fret numbers anywhere (e.g.
    // all dashes) parses as a technically-successful, empty tab — nothing
    // actually loaded, so don't collapse the input or render an empty
    // renderer for it.
    if (result.tab.beats.length === 0) {
      setState({ kind: "empty" });
      return;
    }
    const notices: string[] = [];
    if (result.truncatedFrom) notices.push(t("tab.truncated", { limit: String(MAX_BEATS) }));
    if (result.ignoredChars > 0) notices.push(t("tab.ignoredChars"));
    if (result.skippedBlocks > 0) notices.push(t("tab.skippedBlocks"));
    setState({ kind: "ok", tab: result.tab, notices });
    setExpanded(false);
  }

  async function applyGuitarProFile(file: File) {
    if (isImporting) return; // already importing one — ignore a second drop/pick mid-flight
    if (!hasGpExtension(file.name)) {
      setState({ kind: "fileError", error: "badExtension" });
      return;
    }
    setIsImporting(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { importGuitarProFile } = await import("@/lib/importGuitarPro");
      const result = await importGuitarProFile(bytes);
      if (!result.ok) {
        setState({ kind: "fileError", error: result.error });
        return;
      }
      if (result.tab.beats.length === 0) {
        setState({ kind: "empty" });
        return;
      }
      const notices: string[] = [];
      if (result.unmappedTechniques > 0) notices.push(t("tab.unmappedTechniques"));
      setState({ kind: "ok", tab: result.tab, notices });
      setExpanded(false);
    } finally {
      setIsImporting(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files[0];
    if (file) applyGuitarProFile(file);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    // Moving over a child element (the hint text, the picker link) fires
    // dragleave on this container too — only clear the indicator once the
    // pointer has actually left the whole drop zone, not just crossed into
    // a child of it.
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsDraggingFile(false);
    }
  }

  const showInput = expanded || state.kind !== "ok";
  const subtitle = state.kind === "ok" ? tabSubtitle(state.tab) : null;
  const showTabArea = state.kind === "ok" || isImporting;

  return (
    <div
      className="flex flex-1 flex-col items-center gap-8 px-6 py-12"
      // On the whole page, not just the small input card — dragging a file
      // in from anywhere should register, not just a precise hover over the
      // textarea itself. The visual "drop here" cue still appears on the
      // textarea (see below); this only widens where the drag is DETECTED.
      onDragOver={(e) => {
        e.preventDefault();
        if (!isImporting) setIsDraggingFile(true);
      }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {showInput && (
        <div className="w-full max-w-xl flex flex-col gap-2">
          <label htmlFor="tab-input" className="text-sm font-medium">
            {t("tab.inputLabel")}
          </label>
          <div className="relative">
            <textarea
              ref={textareaRef}
              id="tab-input"
              value={text}
              onChange={(e) => applyTextChange(e.target.value)}
              placeholder={t("tab.inputPlaceholder")}
              spellCheck={false}
              className={`themed-scrollbar w-full resize-none overflow-y-auto rounded-lg border bg-transparent px-4 py-2 font-mono text-sm transition-colors focus:border-accent focus:outline-2 focus:outline-accent focus:outline-offset-2 ${isDraggingFile ? "border-dashed border-accent" : "border-line"}`}
              style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
            />
            {/* pointer-events-none: purely visual, drag events keep landing
                on the container above (and its onDragOver/onDrop) either
                way — this only needs to sit on top, not intercept anything. */}
            {isDraggingFile && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/90 pointer-events-none">
                <Upload className="size-6 text-accent" aria-hidden="true" />
                <p className="text-sm text-accent">{t("tab.dropHint")}</p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted">{t("tab.inputHint")}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept={GP_EXTENSIONS.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) applyGuitarProFile(file);
              e.target.value = ""; // lets picking the same file twice re-trigger onChange
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="self-start text-xs text-muted underline transition hover-fine:text-accent active:scale-[0.97] duration-[160ms] ease-out disabled:opacity-50 disabled:pointer-events-none"
          >
            {t("tab.gpPickerLink")}
          </button>
        </div>
      )}

      {(state.kind === "textError" || state.kind === "fileError") && (
        <p className="w-full max-w-xl text-sm text-difficulty-dificil">
          {t(ERROR_MESSAGE_KEY[state.error])}
        </p>
      )}

      {showTabArea && (
        // Wider than the paste input on purpose — components/TabRenderer.tsx
        // now wraps bars with plain CSS flex-wrap, so a wide container is
        // what actually lets multiple bars sit per line instead of one.
        <div className="w-full max-w-4xl flex flex-col gap-4">
          {/* Document header, not the old "Tablatura cargada" pill — this
              lives with the render itself (not gated behind !showInput), so
              it stays visible even while "Importar otra" has reopened the
              input above to load a replacement. Skeletons while importing:
              its shape (a title line over a subtitle line) is always the
              same, known width range, so a real skeleton fits — unlike the
              notation below. */}
          <div className="flex items-start justify-between gap-4 border-b border-line pb-3">
            {isImporting ? (
              <TabHeaderSkeleton />
            ) : (
              state.kind === "ok" && (
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold leading-tight">
                    {state.tab.title ?? t("tab.untitled")}
                  </h2>
                  {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
                </div>
              )
            )}
            {!isImporting && state.kind === "ok" && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="shrink-0 inline-flex items-center gap-1.5 text-sm text-accent transition hover-fine:opacity-70 active:scale-[0.97] duration-[160ms] ease-out"
              >
                <FolderOpen className="size-4" aria-hidden="true" />
                {t("tab.reimportButton")}
              </button>
            )}
          </div>

          {!isImporting && state.kind === "ok" && state.notices.length > 0 && (
            <div className="flex flex-col gap-1">
              {state.notices.map((notice) => (
                <p key={notice} className="text-xs text-muted">
                  {notice}
                </p>
              ))}
            </div>
          )}

          {isImporting ? (
            state.kind === "ok" ? (
              // Re-importing over an existing tab: blur the real, already-
              // correctly-shaped notation instead of faking one — there's
              // no way to know the new tab's bar count/width ahead of time,
              // but the OLD one is real content sitting right there already.
              <div className="relative">
                <div className="blur-sm pointer-events-none select-none">
                  <TabRenderer tab={state.tab} />
                </div>
                <div
                  role="status"
                  aria-live="polite"
                  className="absolute inset-0 rounded-lg bg-background/30"
                >
                  {/* sticky + top-1/2 + -translate-y-1/2: a long tab's
                      notation is far taller than the viewport, so centering
                      against the FULL blurred height (plain items-center on
                      the inset-0 parent) would place the spinner far below
                      the fold — this keeps it pinned to the center of
                      whatever's actually in view as the page scrolls. */}
                  <div className="sticky top-1/2 flex -translate-y-1/2 items-center justify-center">
                    <ImportingSpinner />
                  </div>
                </div>
              </div>
            ) : (
              // First import ever: nothing to blur, so just a plain spinner
              // in a placeholder box roughly where the notation will land.
              <div
                role="status"
                aria-live="polite"
                className="flex items-center justify-center rounded-lg border border-line py-20"
              >
                <ImportingSpinner />
              </div>
            )
          ) : (
            state.kind === "ok" && <TabRenderer tab={state.tab} />
          )}
        </div>
      )}
    </div>
  );
}
