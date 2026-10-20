import { test } from "node:test";
import assert from "node:assert/strict";
import { pickLocale } from "./locales.ts";
import { href, resolvePath, swapLocale } from "./routes.ts";

test("pickLocale: a valid cookie beats the browser language", () => {
  assert.equal(pickLocale("en", "es-AR,es;q=0.9"), "en");
  assert.equal(pickLocale("es", "en-US"), "es");
});

test("pickLocale: any Spanish browser gets Spanish, everyone else English", () => {
  assert.equal(pickLocale(undefined, "es-AR,es;q=0.9,en;q=0.8"), "es");
  assert.equal(pickLocale(undefined, "es"), "es");
  assert.equal(pickLocale(undefined, "ES-es"), "es");
  assert.equal(pickLocale(undefined, "en-US,en;q=0.9,es;q=0.8"), "en");
  assert.equal(pickLocale(undefined, "fr-FR"), "en");
  assert.equal(pickLocale(undefined, null), "en");
  assert.equal(pickLocale(undefined, ""), "en");
});

test("pickLocale: an invalid cookie is ignored, not trusted", () => {
  assert.equal(pickLocale("fr", "es-MX"), "es");
});

test("pickLocale: 'est' (Estonian-like tags) isn't mistaken for Spanish", () => {
  assert.equal(pickLocale(undefined, "et-EE"), "en");
  assert.equal(pickLocale(undefined, "esx"), "en");
});

test("href builds localized URLs", () => {
  assert.equal(href("home", "es"), "/es");
  assert.equal(href("chords", "en"), "/en/chords");
  assert.equal(href("chords", "es"), "/es/acordes");
  assert.equal(href("privacy", "en"), "/en/privacy");
});

test("resolvePath: no locale prefix redirects into the visitor's language", () => {
  assert.deepEqual(resolvePath("/", undefined, "es-CL"), { kind: "redirect", to: "/es" });
  assert.deepEqual(resolvePath("/", undefined, "en-US"), { kind: "redirect", to: "/en" });
  assert.deepEqual(resolvePath("/", "es", "en-US"), { kind: "redirect", to: "/es" });
});

test("resolvePath: old Spanish links keep working in either language", () => {
  assert.deepEqual(resolvePath("/acordes", undefined, "es"), { kind: "redirect", to: "/es/acordes" });
  assert.deepEqual(resolvePath("/acordes", undefined, "en"), { kind: "redirect", to: "/en/chords" });
  assert.deepEqual(resolvePath("/dev/synth", undefined, "en"), { kind: "redirect", to: "/en/dev/synth" });
});

test("resolvePath: an unknown language prefix becomes a path inside a real locale (-> localized 404)", () => {
  assert.deepEqual(resolvePath("/fr/x", undefined, "en"), { kind: "redirect", to: "/en/fr/x" });
});

test("resolvePath: the other language's slug redirects to this language's", () => {
  assert.deepEqual(resolvePath("/en/acordes", undefined, null), { kind: "redirect", to: "/en/chords" });
  assert.deepEqual(resolvePath("/es/chords", undefined, null), { kind: "redirect", to: "/es/acordes" });
});

test("resolvePath: English slugs rewrite to the Spanish-named folders", () => {
  assert.deepEqual(resolvePath("/en/chords", undefined, null), { kind: "rewrite", to: "/en/acordes" });
  assert.deepEqual(resolvePath("/en/glossary", undefined, null), { kind: "rewrite", to: "/en/glosario" });
});

test("resolvePath: canonical URLs pass straight through", () => {
  for (const path of ["/es", "/en", "/es/acordes", "/es/tablatura", "/en/dev/synth", "/es/nope"]) {
    assert.deepEqual(resolvePath(path, undefined, null), { kind: "next" }, path);
  }
});

test("swapLocale keeps the page and the query string", () => {
  assert.equal(swapLocale("/en/chords?demo", "es"), "/es/acordes?demo");
  assert.equal(swapLocale("/es/acordes", "en"), "/en/chords");
  assert.equal(swapLocale("/es", "en"), "/en");
  assert.equal(swapLocale("/es/dev/synth", "en"), "/en/dev/synth");
  assert.equal(swapLocale(swapLocale("/en/privacy", "es"), "en"), "/en/privacy");
});
