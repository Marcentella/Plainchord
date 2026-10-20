import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canonicalToken,
  capitalizeRoot,
  displayToken,
  convertProgression,
  defaultNotation,
  formatChord,
  formatNote,
  parseChordName,
} from "./notation.ts";

// Read from disk: plain node:test doesn't resolve the "@/" alias chords.ts uses.
const names: string[] = JSON.parse(
  readFileSync(new URL("../data/chords.json", import.meta.url), "utf8"),
).map((c: { name: string }) => c.name);
const known = new Set(names.map((n) => n.toLowerCase()));
const isChord = (canonical: string) => known.has(canonical.toLowerCase());

test("every library chord round-trips through Latin and back", () => {
  for (const name of names) {
    assert.equal(parseChordName(formatChord(name, "latin"), "latin"), name, name);
  }
});

test("formatChord swaps only the root, keeping accidental and suffix", () => {
  assert.equal(formatChord("F#m", "latin"), "Fa#m");
  assert.equal(formatChord("Bb", "latin"), "Sib");
  assert.equal(formatChord("Cadd9", "latin"), "Doadd9");
  assert.equal(formatChord("Em7", "latin"), "Mim7");
  assert.equal(formatChord("G", "latin"), "Sol");
  assert.equal(formatChord("G", "american"), "G");
});

test("formatNote handles octaves", () => {
  assert.equal(formatNote("C#4", "latin"), "Do#4");
  assert.equal(formatNote("E2", "latin"), "Mi2");
  assert.equal(formatNote("A#3", "american"), "A#3");
});

test("parsing is strict: Latin mode doesn't read American names", () => {
  assert.equal(parseChordName("D", "latin"), null);
  assert.equal(parseChordName("G", "latin"), null);
  assert.equal(parseChordName("Am", "latin"), null);
});

test("Latin parsing ignores case and maps to canonical American", () => {
  assert.equal(parseChordName("Rem", "latin"), "Dm");
  assert.equal(parseChordName("sol", "latin"), "G");
  assert.equal(parseChordName("SIB", "latin"), "Bb");
  assert.equal(parseChordName("SI", "latin"), "B");
  assert.equal(parseChordName("Sib", "latin"), "Bb");
  assert.equal(parseChordName("Fa#m", "latin"), "F#m");
});

test("American mode doesn't treat 'Do' as a chord", () => {
  // Passes through untouched; findChord then finds nothing for it.
  assert.equal(isChord(parseChordName("Do", "american")!), false);
});

test("convertProgression keeps separators and spacing exactly", () => {
  assert.equal(convertProgression("G - D, Em  C", "american", "latin", isChord), "Sol - Re, Mim  Do");
  assert.equal(convertProgression("Sol - Re, Mim  Do", "latin", "american", isChord), "G - D, Em  C");
  assert.equal(convertProgression("G D ", "american", "latin", isChord), "Sol Re ");
});

test("convertProgression leaves unknown tokens as typed", () => {
  assert.equal(convertProgression("G Do xyz", "american", "latin", isChord), "Sol Do xyz");
  assert.equal(convertProgression("Sol G", "latin", "american", isChord), "G G");
});

test("convertProgression capitalizes a lowercase root it converts", () => {
  assert.equal(convertProgression("am g", "american", "latin", isChord), "Lam Sol");
  assert.equal(convertProgression("lam sol", "latin", "american", isChord), "Am G");
});

test("capitalizeRoot follows the active notation", () => {
  assert.equal(capitalizeRoot("am", "american"), "Am");
  assert.equal(capitalizeRoot("sol", "latin"), "Sol");
  assert.equal(capitalizeRoot("rem7", "latin"), "Rem7");
  assert.equal(capitalizeRoot("xyz", "latin"), "xyz");
});

test("defaultNotation: Latin only for Spanish-from-Spain browsers", () => {
  assert.equal(defaultNotation(["es-ES", "es"]), "latin");
  assert.equal(defaultNotation(["es-es"]), "latin");
  assert.equal(defaultNotation(["es-AR", "es"]), "american");
  assert.equal(defaultNotation(["es"]), "american");
  assert.equal(defaultNotation(["en-US"]), "american");
  assert.equal(defaultNotation([]), "american");
});

test("canonicalToken: same chord, same token, whatever the notation", () => {
  assert.equal(canonicalToken("Sol", "latin"), canonicalToken("G", "american"));
  assert.equal(canonicalToken("Rem", "latin"), "Dm");
});

test("canonicalToken: a token outside the notation never matches a chord", () => {
  const token = canonicalToken("G", "latin");
  assert.notEqual(token, "G");
  assert.equal(isChord(token), false);
  assert.equal(displayToken(token, "latin"), "G");
});

test("displayToken shows unknown-but-parseable tokens in the active notation", () => {
  assert.equal(displayToken(canonicalToken("Solx", "latin"), "latin"), "Solx");
  assert.equal(displayToken(canonicalToken("xyz", "american"), "american"), "xyz");
});
