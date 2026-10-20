import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Read with fs rather than `import … with { type: "json" }`, so this runs
// under plain node:test like the rest of the suite.
const load = (lang: string): Record<string, string> =>
  JSON.parse(readFileSync(new URL(`./${lang}.json`, import.meta.url), "utf8"));

const es = load("es");
const en = load("en");
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

test("both dictionaries have exactly the same keys", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
});

test("every key uses the same {placeholders} in both languages", () => {
  for (const key of Object.keys(es)) {
    assert.deepEqual(placeholders(en[key] ?? ""), placeholders(es[key]), key);
  }
});

test("no translation is left empty", () => {
  for (const [lang, dict] of [["es", es], ["en", en]] as const) {
    for (const [key, value] of Object.entries(dict)) {
      assert.ok(value.trim() !== "", `${lang}: ${key}`);
    }
  }
});
