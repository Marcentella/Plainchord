import type { Locale } from "@/i18n/locales";
import { alternates } from "@/i18n/routes";
import TermsEs, { title as titleEs } from "./content.es";
import TermsEn, { title as titleEn } from "./content.en";

// One file per language: legal text is a document, not interface copy, so
// it doesn't go through the dictionaries. Both versions say the same thing
// and get edited together; section 10 says English prevails if they differ.
const CONTENT = {
  es: { title: titleEs, Body: TermsEs },
  en: { title: titleEn, Body: TermsEn },
};

export async function generateMetadata({ params }: PageProps<"/[lang]/terminos">) {
  const lang = (await params).lang as Locale;
  return { title: CONTENT[lang].title, alternates: alternates("terms", lang) };
}

export default async function Terminos({ params }: PageProps<"/[lang]/terminos">) {
  const { Body } = CONTENT[(await params).lang as Locale];
  return <Body />;
}
