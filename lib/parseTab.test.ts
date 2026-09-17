import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTab, MAX_BEATS } from "./parseTab.ts";
import { TECHNIQUE_SYMBOLS } from "./tab.ts";
import glossaryData from "../data/glossary.json" with { type: "json" };

const SIX_LINE_LABELS = ["e|", "B|", "G|", "D|", "A|", "E|"];

/** Builds a labeled 6-line block from top (high e) to bottom (low E). */
function tab(lines: [string, string, string, string, string, string]): string {
  return lines.map((l, i) => `${SIX_LINE_LABELS[i]}${l}`).join("\n");
}

test("every TechniqueSymbol still exists as a glossary entry symbol", () => {
  const glossarySymbols = new Set(glossaryData.map((e: { symbol: string }) => e.symbol));
  for (const symbol of TECHNIQUE_SYMBOLS) {
    assert.ok(glossarySymbols.has(symbol), `"${symbol}" has no matching glossary entry`);
  }
});

test("parses a single fretted note", () => {
  // Third line of a labeled block (e,B,G,D,A,E) is G, which is string index 3
  // (E A D G B e — see lib/chords.ts's own string-order convention).
  const result = parseTab(
    tab(["-----", "-----", "--0--", "-----", "-----", "-----"]),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.tab.beats.length, 1);
  assert.deepEqual(result.tab.beats[0].notes, [{ string: 3, fret: 0, techniques: [] }]);
});

test("labels of different widths still align columns per-line", () => {
  // "e|" (2 chars) vs "E |" (3 chars) — each line's own label is stripped
  // independently, so both remainders start at column 0.
  const result = parseTab(
    ["e|--0--", "B |--0--", "G  |--0--", "D|--0--", "A|--0--", "E |--0--"].join("\n"),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // All 6 strings fretted at the same column -> one beat, 6 notes.
  assert.equal(result.tab.beats.length, 1);
  assert.equal(result.tab.beats[0].notes.length, 6);
});

test("a hammer-on tags the arriving note, not the origin", () => {
  const result = parseTab(
    tab(["-----", "-----", "--5h7--", "-----", "-----", "-----"]),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.tab.beats.length, 2);
  assert.deepEqual(result.tab.beats[0].notes[0], { string: 3, fret: 5, techniques: [] });
  assert.deepEqual(result.tab.beats[1].notes[0], { string: 3, fret: 7, techniques: ["h"] });
});

test("a bend keeps the written target fret", () => {
  const result = parseTab(
    tab(["-----", "-----", "--7b9--", "-----", "-----", "-----"]),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.tab.beats.length, 1);
  assert.deepEqual(result.tab.beats[0].notes[0], {
    string: 3,
    fret: 7,
    techniques: ["b"],
    bendTo: 9,
  });
});

test("a bend followed by vibrato stacks both technique tags", () => {
  const result = parseTab(
    tab(["-----", "-----", "--7b9~--", "-----", "-----", "-----"]),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.beats[0].notes[0], {
    string: 3,
    fret: 7,
    techniques: ["b", "~"],
    bendTo: 9,
  });
});

test("a dead note has no fret", () => {
  const result = parseTab(
    tab(["-----", "-----", "--x--", "-----", "-----", "-----"]),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.tab.beats[0].notes[0], { string: 3, fret: null, techniques: ["x"] });
});

test("a two-digit fret merges with an overlapping single-digit fret into one beat", () => {
  const result = parseTab(
    tab(["--12---", "-------", "---5---", "-------", "-------", "-------"]),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.tab.beats.length, 1);
  const frets = result.tab.beats[0].notes.map((n) => n.fret).sort((a, b) => a! - b!);
  assert.deepEqual(frets, [5, 12]);
});

test("an unrecognized bend-release character is ignored but its note kept", () => {
  const result = parseTab(
    tab(["-----", "-----", "--7b9r7--", "-----", "-----", "-----"]),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.ignoredChars, 1);
  // The release lands back on 7 as a plain fretted note, no crash/data loss.
  assert.equal(result.tab.beats.length, 2);
  assert.equal(result.tab.beats[1].notes[0].fret, 7);
});

test("a PM annotation line tags every note under its span", () => {
  const input = [
    "  PM--------|",
    "e|----------|",
    "B|----------|",
    "G|--0---0---|",
    "D|----------|",
    "A|----------|",
    "E|----------|",
  ].join("\n");
  const result = parseTab(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.tab.beats.length, 2);
  assert.ok(result.tab.beats[0].notes[0].techniques.includes("PM"));
  assert.ok(result.tab.beats[1].notes[0].techniques.includes("PM"));
});

test("a bar line advances every beat after it to the next bar", () => {
  const result = parseTab(
    tab(["--0--|--0--", "-----|-----", "-----|-----", "-----|-----", "-----|-----", "-----|-----"]),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.tab.beats.length, 2);
  assert.equal(result.tab.beats[0].bar, 0);
  assert.equal(result.tab.beats[1].bar, 1);
});

test("two separate systems keep counting position and bar upward", () => {
  const input = [
    tab(["--0--", "-----", "-----", "-----", "-----", "-----"]),
    "",
    tab(["--0--", "-----", "-----", "-----", "-----", "-----"]),
  ].join("\n");
  const result = parseTab(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.tab.beats.length, 2);
  assert.equal(result.tab.beats[0].position, 0);
  assert.equal(result.tab.beats[1].position, 1);
  assert.ok(result.tab.beats[1].bar > result.tab.beats[0].bar);
});

test("a 4-line block is skipped, not misread as 6 strings", () => {
  const fourLine = ["e|--0--", "B|-----", "G|-----", "D|-----"].join("\n");
  const sixLine = tab(["--0--", "-----", "-----", "-----", "-----", "-----"]);
  const result = parseTab([fourLine, "", sixLine].join("\n"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.skippedBlocks, 1);
});

test("wrong string count with no valid 6-line block anywhere", () => {
  const result = parseTab(["e|--0--", "B|-----", "G|-----", "D|-----"].join("\n"));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "wrongStringCount");
});

test("prose with no staff lines at all", () => {
  const result = parseTab("Este es un ejercicio de práctica, no una canción.");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "noStaff");
});

test("truncates past MAX_BEATS and reports the real total", () => {
  const beatCount = MAX_BEATS + 10;
  const line = Array.from({ length: beatCount }, () => "0-").join("");
  const result = parseTab(
    tab([line, "", "", "", "", ""].map((l, i) => (i === 0 ? l : "-".repeat(line.length)))),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.tab.beats.length, MAX_BEATS);
  assert.equal(result.truncatedFrom, beatCount);
});
