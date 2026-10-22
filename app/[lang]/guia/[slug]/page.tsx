import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import GuideBlocks from "@/components/guide/GuideBlocks";
import { GUIDE_ORDER, guideArticle, guideCategories, guideNeighbors } from "@/lib/guide";
import { getT } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { alternates, href } from "@/i18n/routes";

// Every article is prebuilt for both languages. The param is always the
// Spanish slug: proxy.ts rewrites English slugs to it (see SUBPAGES).
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDE_ORDER.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/guia/[slug]">) {
  const { lang, slug } = await params;
  const article = guideArticle(slug, lang as Locale);
  if (!article) return {};
  return {
    title: article.title,
    description: article.summary,
    alternates: alternates("guide", lang as Locale, slug),
  };
}

/**
 * One fixed template for every article: where you are, title + one-line
 * summary, the blocks (figures come before the text they explain), then
 * previous/next in reading order. No progress or "read" marks — the order
 * is a suggestion, not something tracked.
 */
export default async function GuideArticlePage({ params }: PageProps<"/[lang]/guia/[slug]">) {
  const { lang: rawLang, slug } = await params;
  const lang = rawLang as Locale;
  const article = guideArticle(slug, lang);
  if (!article) notFound();
  const t = getT(lang);
  const { previous, next } = guideNeighbors(slug, lang);

  return (
    <article className="flex flex-1 flex-col items-center px-6 py-12">
      <div className="flex w-full max-w-xl flex-col gap-5">
        <div className="flex items-center justify-between gap-4 text-sm text-muted">
          <p className="flex min-w-0 items-center gap-1.5">
            <Link href={href("guide", lang)} className="transition-colors hover-fine:text-accent">
              {t("guide.title")}
            </Link>
            <span aria-hidden>/</span>
            <span className="truncate">{article.category}</span>
          </p>
          {/* Native <details>: a table of contents needs no JS to open. */}
          <details className="group relative shrink-0">
            <summary className="flex cursor-pointer list-none items-center gap-1 transition-colors hover-fine:text-accent [&::-webkit-details-marker]:hidden">
              {t("guide.contents")}
              <ChevronDown size={14} aria-hidden className="transition-transform group-open:rotate-180" />
            </summary>
            <nav className="absolute right-0 top-full z-10 mt-2 flex w-64 flex-col gap-3 rounded-lg border border-line bg-background p-3 shadow-lg">
              {guideCategories(lang).map((category) => (
                <div key={category.id} className="flex flex-col gap-0.5">
                  <p className="px-2 text-xs font-medium text-muted">{category.title}</p>
                  {category.articles.map((a) => (
                    <Link
                      key={a.id}
                      href={href("guide", lang, a.id)}
                      aria-current={a.id === slug ? "page" : undefined}
                      className={`rounded-md px-2 py-1 transition-colors hover-fine:text-accent ${
                        a.id === slug ? "font-medium text-accent" : "text-foreground"
                      }`}
                    >
                      {a.title}
                    </Link>
                  ))}
                </div>
              ))}
            </nav>
          </details>
        </div>

        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{article.title}</h1>
          <p className="text-muted">{article.summary}</p>
        </header>

        <GuideBlocks blocks={article.blocks} locale={lang} t={t} />

        <nav className="mt-4 flex justify-between gap-4 border-t border-line pt-6 text-sm">
          {previous ? (
            <Link href={href("guide", lang, previous.id)} className="flex flex-col gap-0.5 transition-colors hover-fine:text-accent">
              <span className="flex items-center gap-1 text-xs text-muted">
                <ArrowLeft size={12} aria-hidden />
                {t("guide.previous")}
              </span>
              <span className="font-medium">{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link
              href={href("guide", lang, next.id)}
              className="flex flex-col items-end gap-0.5 text-right transition-colors hover-fine:text-accent"
            >
              <span className="flex items-center gap-1 text-xs text-muted">
                {t("guide.next")}
                <ArrowRight size={12} aria-hidden />
              </span>
              <span className="font-medium">{next.title}</span>
            </Link>
          )}
        </nav>
      </div>
    </article>
  );
}
