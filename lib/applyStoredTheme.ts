/**
 * Applies the saved theme (.dark) and palette (data-theme) to <html>.
 *
 * Runs in two places: inlined as a <script> in the root layout's <head>
 * (stringified, so it must stay self-contained — no imports, no outer
 * variables) to set them before first paint; and from ThemeSync after
 * every language switch, because moving between /es and /en is a client
 * navigation that re-renders <html> and drops data-theme, while the inline
 * script only runs on a real page load. Any non-empty palette value is
 * applied as-is — azul is never stored (it's the attribute's absence).
 */
export function applyStoredTheme() {
  try {
    const theme = localStorage.getItem("theme");
    const dark = theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
    const palette = localStorage.getItem("palette");
    if (palette) document.documentElement.setAttribute("data-theme", palette);
  } catch {
    /* Storage blocked (private mode): keep the defaults. Block comment on
       purpose — this body is inlined as a script string. */
  }
}
