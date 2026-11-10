"use client";

import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { flashThemeTransition } from "@/lib/flashThemeTransition";
import { useT } from "@/i18n/LocaleProvider";

export default function ThemeToggle() {
  const t = useT();

  // The <html> class is the only source of truth: the inline theme script in
  // layout.tsx sets it before first paint. Reading it on click (instead of
  // mirroring it in state synced after mount) is what lets the icon below be
  // right from the first frame, with no sun/moon flash on reload.
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    flashThemeTransition();
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  // Icon-only, no text label — sun/moon is understood without one (same
  // call HeySpinner and most other apps make), and it keeps this button a
  // fixed size regardless of screen width instead of needing a responsive
  // show/hide breakpoint. Both icons render; the `dark:` variant shows the
  // right one, so server HTML and first paint already agree with the theme.
  return (
    <button
      onClick={toggle}
      aria-label={t("themeToggle.ariaLabel")}
      className="rounded-full border border-line p-1.5 transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
    >
      <MoonIcon size={18} aria-hidden className="dark:hidden" />
      <SunIcon size={18} aria-hidden className="hidden dark:block" />
    </button>
  );
}
