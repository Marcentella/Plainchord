"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { flashThemeTransition } from "@/lib/flashThemeTransition";
import { t } from "@/i18n";

export default function ThemeToggle() {
  // Starts false on both server and client so hydration always matches —
  // no mismatch means no stale label. Synced to the real value (set by the
  // inline theme script in layout.tsx) right after mount, which is a normal
  // client render and so is guaranteed to update the DOM text.
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    flashThemeTransition();
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  const Icon = dark ? Sun : Moon;

  // Icon-only, no text label — sun/moon is understood without one (same
  // call HeySpinner and most other apps make), and it keeps this button a
  // fixed size regardless of screen width instead of needing a responsive
  // show/hide breakpoint.
  return (
    <button
      onClick={toggle}
      aria-label={t("themeToggle.ariaLabel")}
      className="rounded-full border border-line p-1.5 transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}
