import guideData from "@/data/guide.json";
import type { Locale } from "@/i18n/locales";

type Localized = Record<Locale, string>;

/** Which figure a "visual" block draws; components/guide/GuideVisual.tsx maps each one. */
export type GuideVisual =
  | { visual: "guitar-parts" | "frets" | "note-names" | "hand" | "orientation" | "tab" }
  | { visual: "strings"; octaves?: boolean }
  | { visual: "chord"; chord: string }
  | { visual: "difficulty"; pairs: [string, string][] };

/**
 * One piece of an article, in reading order. Text supports **bold** and
 * nothing else. `link` points at the PlainChord tool the article teaches
 * ("Pruébalo"), or the tuner, which is a modal rather than a page.
 */
export type GuideBlock =
  | ({ type: "text" | "mnemonic" | "mistake" } & Localized)
  | ({ type: "visual" } & GuideVisual)
  | { type: "link"; to: "chords" | "tab" | "glossary" | "tuner" };

export type GuideArticle = {
  /** Spanish slug, also the [slug] param (see SUBPAGES in i18n/routes.ts). */
  id: string;
  category: string;
  title: string;
  summary: string;
  blocks: GuideBlock[];
};

type RawArticle = Record<Locale, { title: string; summary: string }> & { blocks: GuideBlock[] };

const data = guideData as unknown as {
  categories: (Record<Locale, { title: string; summary: string }> & { id: string; articles: string[] })[];
  articles: Record<string, RawArticle>;
};

/** Article ids in reading order, across categories (drives previous/next). */
export const GUIDE_ORDER = data.categories.flatMap((c) => c.articles);

export function guideCategories(locale: Locale) {
  return data.categories.map((c) => ({
    id: c.id,
    title: c[locale].title,
    summary: c[locale].summary,
    articles: c.articles.map((id) => guideArticle(id, locale)!),
  }));
}

export function guideArticle(id: string, locale: Locale): GuideArticle | undefined {
  const raw = data.articles[id];
  if (!raw) return undefined;
  const category = data.categories.find((c) => c.articles.includes(id))!;
  return { id, category: category[locale].title, ...raw[locale], blocks: raw.blocks };
}

/** The neighbors in reading order, for the previous/next links at the bottom. */
export function guideNeighbors(id: string, locale: Locale) {
  const i = GUIDE_ORDER.indexOf(id);
  return {
    previous: i > 0 ? guideArticle(GUIDE_ORDER[i - 1], locale) : undefined,
    next: i >= 0 && i < GUIDE_ORDER.length - 1 ? guideArticle(GUIDE_ORDER[i + 1], locale) : undefined,
  };
}

/** "**Mi**ra" -> alternating plain/bold runs, bold at odd indices. */
export function splitBold(text: string): string[] {
  return text.split(/\*\*(.+?)\*\*/);
}
