import es from "./es.json";
import en from "./en.json";
import type { Locale } from "./locales";
import { makeT, type Dict, type TFunction } from "./t";

export type { Dict, TFunction, TKey } from "./t";

// Server side: pages and layouts get the locale from their `params` and
// call getT(lang). Client components use useT() from ./LocaleProvider
// instead, which receives only the active dictionary from the layout.
// `satisfies Dict` makes a key missing from en.json a type error.
const dictionaries: Record<Locale, Dict> = { es, en: en satisfies Dict };

export function getDictionary(locale: Locale): Dict {
  return dictionaries[locale];
}

export function getT(locale: Locale): TFunction {
  return makeT(dictionaries[locale]);
}
