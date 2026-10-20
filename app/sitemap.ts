import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/locales";
import { PAGES, href, type PageId } from "@/i18n/routes";
import { SITE_URL } from "@/lib/siteUrl";

// Every public page in both languages, each listing its translation, so
// search engines find /en/... as well as /es/... (/dev/* is left out).
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: (PageId | "home")[] = ["home", ...(Object.keys(PAGES) as PageId[])];
  return pages.flatMap((page) =>
    LOCALES.map((locale) => ({
      url: SITE_URL + href(page, locale),
      alternates: {
        languages: Object.fromEntries(LOCALES.map((l) => [l, SITE_URL + href(page, l)])),
      },
    })),
  );
}
