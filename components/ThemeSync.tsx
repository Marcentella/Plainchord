"use client";

import { applyStoredTheme } from "@/lib/applyStoredTheme";
import { useLocale } from "@/i18n/useLocale";
import { useIsomorphicLayoutEffect } from "@/lib/useIsomorphicLayoutEffect";

/**
 * Re-applies the saved theme/palette whenever the language changes.
 * Switching /es <-> /en (or going back/forward across them) re-renders
 * <html> without a page load, which drops data-theme — so the palette fell
 * back to azul. A layout effect restores it before the browser paints,
 * so there's no flash of the wrong palette.
 */
export default function ThemeSync() {
  const locale = useLocale();
  useIsomorphicLayoutEffect(applyStoredTheme, [locale]);
  return null;
}
