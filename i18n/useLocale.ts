"use client";

import { useParams } from "next/navigation";
import type { Locale } from "./locales";

/**
 * The current page's language, for client components. Every route lives
 * under app/[lang], and the root layout 404s anything that isn't a known
 * locale, so the param is always a valid Locale by the time this runs.
 */
export function useLocale(): Locale {
  return useParams<{ lang: Locale }>().lang;
}
