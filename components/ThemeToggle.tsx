"use client";

import { useEffect, useState } from "react";
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
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      aria-label={t("themeToggle.ariaLabel")}
      className="rounded-full border border-line px-3 py-1 text-sm hover:border-accent"
    >
      {dark ? t("themeToggle.toLight") : t("themeToggle.toDark")}
    </button>
  );
}
