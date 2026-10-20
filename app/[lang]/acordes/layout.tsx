import type { Locale } from "@/i18n/locales";
import { alternates } from "@/i18n/routes";

// The page itself is a client component and can't export metadata, so this
// pass-through layout carries its canonical URL and hreflang links.
export async function generateMetadata({ params }: LayoutProps<"/[lang]/acordes">) {
  return { alternates: alternates("chords", (await params).lang as Locale) };
}

export default function Layout({ children }: LayoutProps<"/[lang]/acordes">) {
  return children;
}
