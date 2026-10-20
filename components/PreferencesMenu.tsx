"use client";

import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { flashThemeTransition } from "@/lib/flashThemeTransition";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/i18n/LocaleProvider";
import { useLocale } from "@/i18n/useLocale";
import { LANG_COOKIE, type Locale } from "@/i18n/locales";
import { swapLocale } from "@/i18n/routes";
import type { Notation } from "@/lib/notation";
import { setNotation, useNotation } from "@/lib/useNotation";

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

// Language endonyms and notation shorthand, not translatable copy: a
// language is always offered under its own name (an English speaker
// stuck on the Spanish site has to recognize "English", not "Inglés"), and
// "C D E" / "Do Re Mi" show the notation itself rather than naming it — a
// beginner may not know "americana"/"latina", but recognizes what their
// teacher writes.
// Two options fit a segmented control; a third language turns this into a
// dropdown instead.
const LANGUAGES: readonly { id: Locale; label: string }[] = [
  { id: "es", label: "Español" },
  { id: "en", label: "English" },
];

const NOTATIONS: readonly { id: Notation; label: string }[] = [
  { id: "american", label: "C D E" },
  { id: "latin", label: "Do Re Mi" },
];

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-1 rounded-full border border-line p-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={o.id === value}
          className={`rounded-full px-3 py-1 text-sm transition duration-[160ms] ease-out active:scale-[0.97] ${
            o.id === value
              ? "bg-accent text-dot-text"
              : "text-muted hover-fine:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function PreferencesMenu() {
  const t = useT();
  const [current, setCurrent] = useState<PaletteId>("azul");
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  // The language is the URL's; switching it navigates. Notation is a
  // separate, saved preference (lib/useNotation.ts).
  const language = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const notation = useNotation();
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
  // popover; no library needed for a panel this small.
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

  // Saves the choice in the functional `lang` cookie (privacy policy,
  // section 4) so proxy.ts honors it on the next locale-less visit, then
  // opens the same page in the other language. It's a client navigation,
  // not a page load — ThemeSync re-applies the palette it would drop.
  function switchLanguage(next: Locale) {
    if (next === language) return;
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.push(swapLocale(pathname + window.location.search, next));
  }

  // Doesn't close the panel — with language and notation beside it, closing
  // on every swatch click would make trying palettes a reopen-per-click
  // chore. `current`/`dark` update themselves via the MutationObserver
  // above once this mutates the DOM, so there's one source of truth
  // instead of two copies that could drift apart.
  function select(id: PaletteId) {
    flashThemeTransition();
    if (id === "azul") {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("palette");
    } else {
      document.documentElement.setAttribute("data-theme", id);
      localStorage.setItem("palette", id);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t("preferences.ariaLabel")}
        aria-expanded={open}
        className="rounded-full border border-line p-1.5 transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
      >
        <Settings size={16} aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 flex w-60 flex-col gap-4 rounded-lg border border-line bg-background p-4 shadow-lg">
          <section className="flex flex-col gap-2">
            <h2 className="text-xs text-muted">{t("preferences.language")}</h2>
            <Segmented
              label={t("preferences.language")}
              options={LANGUAGES}
              value={language}
              onChange={switchLanguage}
            />
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-xs text-muted">{t("preferences.notation")}</h2>
            <Segmented
              label={t("preferences.notation")}
              options={NOTATIONS}
              value={notation}
              onChange={setNotation}
            />
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="text-xs text-muted">{t("preferences.palette")}</h2>
            <div className="flex gap-2">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => select(p.id)}
                  aria-label={t(`paletteToggle.${p.id}`)}
                  aria-current={p.id === current}
                  className={`flex rounded-full p-0.5 transition hover-fine:scale-110 active:scale-[0.97] duration-[160ms] ease-out ${
                    p.id === current
                      ? "ring-2 ring-accent ring-offset-1 ring-offset-background"
                      : ""
                  }`}
                >
                  <Swatch palette={p} dark={dark} size={24} />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
