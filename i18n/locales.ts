// Pure locale helpers — no Next imports, so proxy.ts, server components,
// client components and node:test can all share them.

export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Functional cookie holding a manual language choice (see the privacy policy, section 4). */
export const LANG_COOKIE = "lang";

export function hasLocale(value: string | undefined): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? "");
}

/**
 * Language for a visitor whose URL doesn't carry one yet. A manual choice
 * (the cookie) always wins; otherwise the browser's language: anything
 * Spanish (es, es-AR, es-ES…) gets Spanish, everyone else English. Only the
 * first listed language counts — that's the one the person actually set.
 * Location (IP) is deliberately not used: where someone is says nothing
 * about what they read.
 */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null | undefined): Locale {
  if (hasLocale(cookie)) return cookie;
  const first = acceptLanguage?.split(",")[0]?.split(";")[0]?.trim().toLowerCase() ?? "";
  return first === "es" || first.startsWith("es-") ? "es" : "en";
}
