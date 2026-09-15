/**
 * Parses a CSS time value ("280ms", "0.3s") into milliseconds. Split out
 * from cssDurationMs so the actual parsing logic has a plain-function unit
 * test — the DOM read around it (getComputedStyle) isn't something this
 * project's test setup (node --test, no DOM) can exercise directly.
 */
export function parseCssDuration(raw: string): number {
  const value = raw.trim();
  if (value.endsWith("ms")) return parseFloat(value);
  if (value.endsWith("s")) return parseFloat(value) * 1000;
  return 0; // not a recognized CSS time value
}

/**
 * Reads a CSS custom property's time value (declared once in
 * app/globals.css) and returns it in milliseconds. Lets a duration used by
 * both CSS and JS live in exactly one place — the property — instead of
 * being duplicated by hand into a JS literal that can silently drift out
 * of sync with the CSS it's supposed to match (the "ponytail: kept in sync
 * by hand..." comments this replaces, in app/page.tsx and
 * lib/flashThemeTransition.ts, were exactly that drift risk).
 */
export function cssDurationMs(customProperty: string): number {
  return parseCssDuration(
    getComputedStyle(document.documentElement).getPropertyValue(
      customProperty,
    ),
  );
}
