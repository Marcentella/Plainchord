import { LOCALES, hasLocale, pickLocale, type Locale } from "./locales.ts";

/**
 * Localized URL slugs. The filesystem keeps the Spanish folder names
 * (app/[lang]/acordes…); English slugs are served by an internal rewrite in
 * proxy.ts, so /en/chords is what people and Google see. Every internal
 * link goes through href() below — never a hardcoded "/acordes".
 */
export const PAGES = {
  chords: { es: "acordes", en: "chords" },
  glossary: { es: "glosario", en: "glossary" },
  tab: { es: "tablatura", en: "tab" },
  terms: { es: "terminos", en: "terms" },
  privacy: { es: "privacidad", en: "privacy" },
} as const satisfies Record<string, Record<Locale, string>>;

export type PageId = keyof typeof PAGES;

export function href(page: PageId | "home", locale: Locale): string {
  return page === "home" ? `/${locale}` : `/${locale}/${PAGES[page][locale]}`;
}

/**
 * Metadata `alternates` for a page: its canonical URL in this language plus
 * hreflang links to both versions, so search engines index each language
 * as a translation of the other instead of duplicate content. x-default is
 * the locale-less URL, which proxy.ts sends to the visitor's language.
 */
export function alternates(page: PageId | "home", locale: Locale) {
  return {
    canonical: href(page, locale),
    languages: {
      es: href(page, "es"),
      en: href(page, "en"),
      "x-default": page === "home" ? "/" : `/${PAGES[page].en}`,
    },
  };
}

/** The page a slug belongs to, in either language. */
function pageForSlug(slug: string): PageId | undefined {
  return (Object.keys(PAGES) as PageId[]).find((id) => LOCALES.some((l) => PAGES[id][l] === slug));
}

/** Re-slugs a locale-less path ("/chords/x", "/acordes") for `locale`. Unknown first segments pass through. */
function localizeRest(rest: string, locale: Locale): string {
  const [, first = "", ...tail] = rest.split("/");
  const page = pageForSlug(first);
  const slug = page ? PAGES[page][locale] : first;
  return ["", slug, ...tail].join("/").replace(/\/$/, "");
}

/** Splits "/en/chords/x" into ["en", "/chords/x"]; null when there's no locale prefix. */
function splitLocale(pathname: string): [Locale, string] | null {
  const [, first, ...rest] = pathname.split("/");
  return hasLocale(first) ? [first, rest.length ? `/${rest.join("/")}` : ""] : null;
}

/** Same page, other language: "/en/chords?x=1" -> "/es/acordes?x=1". */
export function swapLocale(path: string, to: Locale): string {
  const [pathname, query] = path.split(/(?=\?)/);
  const split = splitLocale(pathname);
  const rest = split ? split[1] : pathname;
  return `/${to}${localizeRest(rest, to)}${query ?? ""}`;
}

export type Resolution =
  | { kind: "next" }
  | { kind: "redirect"; to: string }
  | { kind: "rewrite"; to: string };

/**
 * What proxy.ts does with a request path. Pure so it can be unit tested.
 * - No locale prefix ("/", "/acordes", "/fr/x") -> redirect into the
 *   visitor's language. Old links keep working; "/fr/x" becomes "/en/fr/x"
 *   and lands on the localized 404.
 * - Prefix with the other language's slug ("/en/acordes") -> redirect to
 *   this language's slug, so each page has exactly one URL per language.
 * - English slug ("/en/chords") -> rewrite to the Spanish-named folder.
 */
export function resolvePath(
  pathname: string,
  cookie: string | undefined,
  acceptLanguage: string | null | undefined,
): Resolution {
  const split = splitLocale(pathname);
  if (!split) {
    const locale = pickLocale(cookie, acceptLanguage);
    return { kind: "redirect", to: `/${locale}${localizeRest(pathname === "/" ? "" : pathname, locale)}` };
  }
  const [locale, rest] = split;
  const localized = localizeRest(rest, locale);
  if (localized !== rest) return { kind: "redirect", to: `/${locale}${localized}` };
  const fsPath = localizeRest(rest, "es");
  if (fsPath !== rest) return { kind: "rewrite", to: `/${locale}${fsPath}` };
  return { kind: "next" };
}
