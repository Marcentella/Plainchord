// ponytail: kept in sync by hand with the 0.3s duration of the
// `.theme-transitioning` override in app/globals.css — a CSS duration and
// a JS timeout can't share one source without a build step.
const THEME_TRANSITION_MS = 300;

/**
 * Briefly marks <html> so every element's color/border/fill transition —
 * even ones with their own faster hover-feedback duration (nav links,
 * buttons: transition-colors's 150ms, the pill buttons' 160ms) — uses the
 * slower, ambient theme-switch fade instead, for exactly as long as that
 * fade takes. Without this, an element with its own tuned transition
 * duration keeps it even when the color change was actually caused by a
 * theme/palette switch, not a hover — it finishes fading noticeably
 * faster than the rest of the page.
 *
 * Call this right before mutating the dark/light class or the palette's
 * data-theme attribute (ThemeToggle, PalettePicker).
 */
export function flashThemeTransition() {
  const html = document.documentElement;
  html.classList.add("theme-transitioning");
  setTimeout(() => {
    html.classList.remove("theme-transitioning");
  }, THEME_TRANSITION_MS);
}
