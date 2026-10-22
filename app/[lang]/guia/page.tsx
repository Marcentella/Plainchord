import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { guideCategories } from "@/lib/guide";
import { getT } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { alternates, href } from "@/i18n/routes";

export async function generateMetadata({ params }: PageProps<"/[lang]/guia">) {
  const lang = (await params).lang as Locale;
  return { title: getT(lang)("guide.title"), alternates: alternates("guide", lang) };
}

// Same inset for the header, the glossary banner and the cards' content, so
// every block's text starts on one left edge. Cards and banner are solid
// bg-background: their muted/accent text (down to 4.51:1 for the pink
// palette's badge) then sits on the color it was measured against, not on
// the ornament, which is darker than the background in light mode.
const INSET = "px-4 sm:px-5";

/**
 * The guide's index: categories in reading order, easiest first. Every
 * category gets the same card; "Empieza aquí" is only a badge on the first.
 * The 1.1, 1.2… numbers show the suggested order — nothing tracks what was
 * read (the guide is a reference, not a course with progress).
 */
export default async function Guia({ params }: PageProps<"/[lang]/guia">) {
  const lang = (await params).lang as Locale;
  const t = getT(lang);
  const categories = guideCategories(lang);

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <div className="flex w-full max-w-xl flex-col gap-6 lg:max-w-5xl">
        <header className={`flex flex-col gap-2 ${INSET}`}>
          <h1 className="text-2xl font-semibold tracking-tight">{t("guide.title")}</h1>
          <p className="max-w-xl text-muted">{t("guide.intro")}</p>
        </header>

        {/* The whole banner is the link (a full-size tap target, like the rows below). */}
        <Link
          href={href("glossary", lang)}
          className={`group flex min-h-11 items-center gap-2.5 rounded-lg border border-line bg-background py-3 text-sm transition-colors hover-fine:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${INSET}`}
        >
          <BookOpen size={16} aria-hidden className="shrink-0 text-accent" />
          <span className="flex-1">
            <span className="text-muted">{t("guide.glossaryPointer")}</span>{" "}
            <span className="font-medium text-accent underline group-hover-fine:no-underline">
              {t("guide.glossaryLink")}
            </span>
          </span>
          <ChevronRight size={16} aria-hidden className="shrink-0 text-muted transition-colors group-hover-fine:text-accent" />
        </Link>

        <ol className="grid gap-6 lg:grid-cols-2">
          {categories.map((category, i) => (
            <li key={category.id} className={`flex flex-col gap-4 rounded-lg border border-line bg-background pt-5 pb-2 ${INSET}`}>
              <div className="flex gap-3">
                <span aria-hidden className="text-3xl leading-none font-semibold tabular-nums text-muted">
                  {i + 1}
                </span>
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <h2 className="text-lg font-semibold sm:text-xl">{category.title}</h2>
                    {i === 0 && (
                      <span className="rounded-full border border-accent px-2 py-0.5 text-xs font-medium text-accent">
                        {t("guide.startHere")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted">{category.summary}</p>
                </div>
              </div>

              <ul className="flex flex-col divide-y divide-line border-t border-line">
                {category.articles.map((article, j) => (
                  <li key={article.id}>
                    <Link
                      href={href("guide", lang, article.id)}
                      className="group -mx-2 flex min-h-11 items-center gap-3 rounded-md px-2 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                    >
                      <span aria-hidden className="w-7 shrink-0 text-xs tabular-nums text-muted">
                        {i + 1}.{j + 1}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[15px] font-medium transition-colors group-hover-fine:text-accent">
                          {article.title}
                        </span>
                        <span className="text-[13px] text-muted">{article.summary}</span>
                      </span>
                      <ChevronRight
                        size={16}
                        aria-hidden
                        className="shrink-0 text-muted transition-colors group-hover-fine:text-accent"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
