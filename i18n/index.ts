import es from "./es.json";

// Only Spanish exists today. `t` is the single seam a future locale would
// plug into (swap the dictionary by user/browser locale) without touching
// any component.
const dict: Record<string, string> = es;

export function t(key: keyof typeof es, vars?: Record<string, string>) {
  const str = dict[key] ?? key;
  if (!vars) return str;
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, v),
    str,
  );
}
