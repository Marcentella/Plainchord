"use client";

import { useState } from "react";

export default function ThemeToggle() {
  // Lazy init reads the class the inline theme script already set on <html>.
  // Server render has no DOM, so it starts false there — suppressHydrationWarning
  // below covers the one-time mismatch against the client's real value.
  const [dark, setDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      aria-label="Cambiar tema claro/oscuro"
      suppressHydrationWarning
      className="rounded-full border border-line px-3 py-1 text-sm hover:border-accent"
    >
      {dark ? "☀️ Claro" : "🌙 Oscuro"}
    </button>
  );
}
