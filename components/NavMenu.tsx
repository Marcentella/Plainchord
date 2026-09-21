"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, Guitar, BookOpen, Rows3, Music } from "lucide-react";
import { t } from "@/i18n";
import TunerModal from "@/components/TunerModal";

// Guitar/BookOpen/Rows3: same lucide-react convention as every other icon in
// the header (see CLAUDE.md — no emoji). Rows3 stands in for tab notation's
// stacked string lines, the same way it already reads for anyone who's seen
// a "rows" layout icon elsewhere.
const ITEMS = [
  { href: "/", labelKey: "nav.chords", Icon: Guitar },
  { href: "/glosario", labelKey: "nav.glossary", Icon: BookOpen },
  { href: "/tablatura", labelKey: "nav.tab", Icon: Rows3 },
] as const;

/**
 * One collapsed nav menu instead of three inline links — three full-width
 * Spanish words ("Acordes", "Glosario", "Tablatura") plus the wordmark and
 * the palette/theme buttons didn't fit a phone-width header, forcing an
 * unwanted horizontal scroll on the whole page. A single icon-only trigger
 * (same circular-button language as ThemeToggle/PalettePicker) has a fixed,
 * small width regardless of screen size or how many destinations exist —
 * it can't overflow the way inline text links did, and there's no
 * separate mobile/desktop layout to keep in sync.
 */
export default function NavMenu() {
  const [open, setOpen] = useState(false);
  const [tunerOpen, setTunerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Same dismissal pattern as PalettePicker: outside click or Escape.
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
        ref={menuButtonRef}
        onClick={() => setOpen((v) => !v)}
        aria-label={t("nav.menuAriaLabel")}
        aria-expanded={open}
        className="rounded-full border border-line p-1.5 transition hover-fine:border-accent active:scale-[0.97] duration-[160ms] ease-out"
      >
        <Menu size={16} aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 flex min-w-40 flex-col gap-0.5 rounded-lg border border-line bg-background p-1.5 shadow-lg">
          {ITEMS.map(({ href, labelKey, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover-fine:text-accent"
            >
              <Icon size={16} aria-hidden />
              {t(labelKey)}
            </Link>
          ))}
          {/* A single action item, not folded into ITEMS above — that array
              is link-shaped (href) on purpose, and generalizing it into a
              link-or-action union for one entry would be speculative until
              a second action item actually exists. */}
          <button
            onClick={() => {
              setOpen(false);
              setTunerOpen(true);
            }}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover-fine:text-accent"
          >
            <Music size={16} aria-hidden />
            {t("nav.tuner")}
          </button>
        </div>
      )}
      <TunerModal
        open={tunerOpen}
        onClose={() => {
          setTunerOpen(false);
          // The dialog's own native focus-restore has nothing to return to
          // — the "Afinador" item that opened it is a menu row that
          // unmounts (the dropdown closes) in the same tick showModal() is
          // called, so document.activeElement is already <body> by the
          // time the browser tries to remember it. Send focus somewhere
          // real instead: the hamburger trigger, since that's what's
          // actually still on screen.
          menuButtonRef.current?.focus();
        }}
      />
    </div>
  );
}
