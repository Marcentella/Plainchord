import { LOCALES, hasLocale, pickLocale, type Locale } from "./locales.ts";

/**
 * Localized URL slugs. The filesystem keeps the Spanish folder names
 * (app/[lang]/acordes…); English slugs are served by an internal rewrite in
 * proxy.ts, so /en/chords is what people and Google see. Every internal
 * link goes through href() below — never a hardcoded "/acordes".
 */
export const PAGES = {
  guide: { es: "guia", en: "guide" },
  chords: { es: "acordes", en: "chords" },
  glossary: { es: "glosario", en: "glossary" },
  tab: { es: "tablatura", en: "tab" },
  terms: { es: "terminos", en: "terms" },
  privacy: { es: "privacidad", en: "privacy" },
} as const satisfies Record<string, Record<Locale, string>>;

export type PageId = keyof typeof PAGES;

/**
 * Second-level slugs for pages that have them: Spanish slug (the id, and
 * the [slug] param every page receives) -> English slug. Same rule as
 * PAGES: proxy.ts rewrites the English one to the Spanish one. Kept here,
 * not in data/guide.json, so proxy.ts doesn't bundle the guide's content;
 * lib/guide.test.ts checks both lists hold the same articles.
 */
export const SUBPAGES: Partial<Record<PageId, Record<string, string>>> = {
  guide: {
    "partes-de-la-guitarra": "parts-of-the-guitar",
    cuerdas: "strings",
    trastes: "frets",
    notas: "notes",
    afinar: "tuning",
    dedos: "fingers",
    "diagramas-de-acordes": "chord-diagrams",
    "x-o-y-cejilla": "x-o-and-barre",
    tablatura: "reading-tabs",
    dificultad: "difficulty",
  },
};

/** A sub slug (in either language) for `locale`; unknown ones pass through. */
function localizeSub(page: PageId, slug: string, locale: Locale): string {
  const subs = SUBPAGES[page];
  if (!subs) return slug;
  const id = Object.keys(subs).find((es) => es === slug || subs[es] === slug);
  if (!id) return slug;
  return locale === "es" ? id : subs[id];
}

/** `sub` is the Spanish slug (the id), e.g. href("guide", "en", "cuerdas") -> "/en/guide/strings". */
export function href(page: PageId | "home", locale: Locale, sub?: string): string {
  if (page === "home") return `/${locale}`;
  const base = `/${locale}/${PAGES[page][locale]}`;
  return sub ? `${base}/${localizeSub(page, sub, locale)}` : base;
}

/**
 * Metadata `alternates` for a page: its canonical URL in this language plus
 * hreflang links to both versions, so search engines index each language
 * as a translation of the other instead of duplicate content. x-default is
 * the locale-less URL, which proxy.ts sends to the visitor's language.
 */
export function alternates(page: PageId | "home", locale: Locale, sub?: string) {
  return {
    canonical: href(page, locale, sub),
    languages: {
      es: href(page, "es", sub),
      en: href(page, "en", sub),
      "x-default": page === "home" ? "/" : href(page, "en", sub).slice("/en".length),
    },
  };
}

/** The page a slug belongs to, in either language. */
function pageForSlug(slug: string): PageId | undefined {
  return (Object.keys(PAGES) as PageId[]).find((id) => LOCALES.some((l) => PAGES[id][l] === slug));
}

/** Re-slugs a locale-less path ("/chords/x", "/acordes") for `locale`. Unknown first segments pass through. */
function localizeRest(rest: string, locale: Locale): string {
  const [, first = "", sub, ...tail] = rest.split("/");
  const page = pageForSlug(first);
  const slug = page ? PAGES[page][locale] : first;
  const subSlug = page && sub ? localizeSub(page, sub, locale) : sub;
  return ["", slug, ...(subSlug === undefined ? [] : [subSlug]), ...tail].join("/").replace(/\/$/, "");
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
