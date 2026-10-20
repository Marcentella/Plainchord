import type es from "./es.json";

// Types + the lookup function only — no dictionary values. Client code
// imports from here (via LocaleProvider), so neither JSON file ends up in
// the browser bundle; the active dictionary arrives as a prop instead.

export type TKey = keyof typeof es;
export type Dict = Record<TKey, string>;
export type TFunction = (key: TKey, vars?: Record<string, string>) => string;

export function makeT(dict: Dict): TFunction {
  return (key, vars) => {
    const str = dict[key] ?? key;
    if (!vars) return str;
    return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), str);
  };
}
