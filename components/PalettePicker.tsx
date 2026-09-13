"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { flashThemeTransition } from "@/lib/flashThemeTransition";
import { t } from "@/i18n";

// Both light AND dark variants of each palette's accent (see
// app/globals.css) — the swatch has to reflect whichever is CURRENTLY
// active, not always light, or it previews the wrong colors while in dark
// mode. "azul" has no data-theme value of its own — it's what :root/.dark
// already are.
//
// `hue` is NOT the literal --background value — background is deliberately
// near-neutral (that's what makes it a good UI background), which at
// swatch size just reads as "basically black" or "basically white" for
// every palette alike, indistinguishable at a glance. `hue` is instead a
// tint (light mode) or shade (dark mode) of the palette's OWN accent —
// fixed at 55% saturation / 72% (light) or 38% (dark) lightness, computed
// per accent hue — so it's guaranteed to read as "this palette's color
// family" while staying legible and muted rather than a neon primary.
const PALETTES = [
  {
    id: "azul",
    light: { hue: "#90b2df", accent: "#2f5fa0" },
    dark: { hue: "#2c4e96", accent: "#8cb1ff" },
  },
  {
    id: "salmon",
    light: { hue: "#dfa190", accent: "#b8492a" },
    dark: { hue: "#96442c", accent: "#ff8c69" },
  },
  {
    id: "pink",
    light: { hue: "#df90b5", accent: "#c23b7a" },
    dark: { hue: "#962c54", accent: "#ff6fa5" },
  },
  {
    id: "green",
    light: { hue: "#90dfc7", accent: "#2b4f44" },
    dark: { hue: "#2c965f", accent: "#5fb98a" },
  },
] as const;

type PaletteId = (typeof PALETTES)[number]["id"];

function Swatch({
  palette,
  dark,
  size,
}: {
  palette: (typeof PALETTES)[number];
  dark: boolean;
  size: number;
}) {
  const { hue, accent } = palette[dark ? "dark" : "light"];
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 overflow-hidden rounded-full border border-line"
      style={{ width: size, height: size }}
    >
      <span className="h-full w-1/2" style={{ background: hue }} />
      <span className="h-full w-1/2" style={{ background: accent }} />
    </span>
  );
}

export default function PalettePicker() {
  const [current, setCurrent] = useState<PaletteId>("azul");
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Tracks the palette AND the dark class live via a MutationObserver,
  // not just once on mount. ThemeToggle mutates the dark class
  // independently — these are sibling components with no shared state —
  // so a one-time read would leave these swatches showing stale colors
  // for the wrong mode the moment someone toggles theme after this mounts.
  useEffect(() => {
    function sync() {
      const attr = document.documentElement.getAttribute("data-theme");
      const match = PALETTES.find((p) => p.id === attr);
      setCurrent(match ? match.id : "azul");
      setDark(document.documentElement.classList.contains("dark"));
    }
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Close on outside click or Escape — the two standard ways to dismiss a
  // popover; no library needed for a menu this small (3 fixed options).
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

  // Only closes the popover — `current`/`dark` update themselves via the
  // MutationObserver above once this mutates the DOM, so there's one
  // source of truth instead of two copies that could drift apart.
  function select(id: PaletteId) {
    flashThemeTransition();
    setOpen(false);
    if (id === "azul") {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("palette");
    } else {
      document.documentElement.setAttribute("data-theme", id);
      localStorage.setItem("palette", id);
    }
  }

  const active = PALETTES.find((p) => p.id === current)!;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("paletteToggle.ariaLabel")}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-full border border-line px-2 py-1.5 transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
      >
        <Swatch palette={active} dark={dark} size={16} />
        <ChevronDown size={12} aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 flex gap-1.5 rounded-full border border-line bg-background p-1.5 shadow-lg">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              onClick={() => select(p.id)}
              aria-label={t(`paletteToggle.${p.id}`)}
              aria-current={p.id === current}
              className={`rounded-full p-0.5 transition hover-fine:scale-110 active:scale-[0.97] duration-[160ms] ease-out ${
                p.id === current
                  ? "ring-2 ring-accent ring-offset-1 ring-offset-background"
                  : ""
              }`}
            >
              <Swatch palette={p} dark={dark} size={24} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
