import type { Locale } from "@/i18n/locales";
import { alternates } from "@/i18n/routes";
import PrivacyEs, { title as titleEs } from "./content.es";
import PrivacyEn, { title as titleEn } from "./content.en";

// Same split as app/[lang]/terminos/page.tsx: one file per language,
// edited together.
const CONTENT = {
  es: { title: titleEs, Body: PrivacyEs },
  en: { title: titleEn, Body: PrivacyEn },
};

export async function generateMetadata({ params }: PageProps<"/[lang]/privacidad">) {
  const lang = (await params).lang as Locale;
  return { title: CONTENT[lang].title, alternates: alternates("privacy", lang) };
}

export default async function Privacidad({ params }: PageProps<"/[lang]/privacidad">) {
  const { Body } = CONTENT[(await params).lang as Locale];
  return <Body />;
}
