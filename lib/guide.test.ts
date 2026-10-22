import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SUBPAGES } from "../i18n/routes.ts";

// Read as plain JSON (lib/guide.ts uses the "@/*" alias, which node --test can't resolve).
const guide = JSON.parse(readFileSync(new URL("../data/guide.json", import.meta.url), "utf8"));
const chordNames = new Set(
  JSON.parse(readFileSync(new URL("../data/chords.json", import.meta.url), "utf8")).map((c: { name: string }) => c.name),
);

test("every article has a localized slug, and every slug an article", () => {
  assert.deepEqual(Object.keys(guide.articles).sort(), Object.keys(SUBPAGES.guide!).sort());
});

test("every article sits in exactly one category", () => {
  const listed = guide.categories.flatMap((c: { articles: string[] }) => c.articles);
  assert.equal(new Set(listed).size, listed.length);
  assert.deepEqual([...listed].sort(), Object.keys(guide.articles).sort());
});

test("every text block is written in both languages", () => {
  for (const [id, article] of Object.entries<{ blocks: Record<string, unknown>[] }>(guide.articles)) {
    for (const block of article.blocks) {
      if (["text", "mnemonic", "mistake"].includes(block.type as string)) {
        assert.ok(block.es && block.en, `${id}: ${block.type} block missing a language`);
      }
    }
  }
});

test("every chord a figure draws exists in the library", () => {
  for (const article of Object.values<{ blocks: Record<string, unknown>[] }>(guide.articles)) {
    for (const block of article.blocks) {
      if (block.visual === "chord") assert.ok(chordNames.has(block.chord), String(block.chord));
      if (block.visual === "difficulty") {
        for (const name of (block.pairs as string[][]).flat()) assert.ok(chordNames.has(name), name);
      }
    }
  }
});
