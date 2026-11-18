import { test } from "node:test";
import assert from "node:assert/strict";
import { capitalizeChords, deleteSeparator, dropEmptySlots, openSlot, snapCaret, stepCaret, tidySeparators, typeAtStart } from "./progressionCaret.ts";

// "C - Em - D": C 0-1, sep 1-4, Em 4-6, sep 6-9, D 9-10. Chord ends: 1, 6, 10.
const V = "C - Em - D";

test("the caret rests only at a chord's end", () => {
  assert.equal(snapCaret(V, 0), 0); // the start is a stop of its own
  assert.equal(snapCaret(V, 1), 1);
  assert.equal(snapCaret(V, 4), 6); // before Em -> after Em
  assert.equal(snapCaret(V, 5), 6); // between E and m -> after Em
  assert.equal(snapCaret(V, 6), 6);
  assert.equal(snapCaret(V, 2), 1); // on the separator, nearer C
  assert.equal(snapCaret(V, 3), 6); // on the separator, nearer Em
  assert.equal(snapCaret(V, 10), 10);
  assert.equal(snapCaret("C -  - D", 4), 4); // an empty slot is a place to type
});

test("arrows hop from chord end to chord end", () => {
  assert.equal(stepCaret(V, 10, -1), 6);
  assert.equal(stepCaret(V, 6, -1), 1);
  assert.equal(stepCaret(V, 1, -1), 0); // to the start
  assert.equal(stepCaret(V, 0, -1), 0); // nowhere further left
  assert.equal(stepCaret(V, 0, 1), 1);
  assert.equal(stepCaret(V, 1, 1), 6);
  assert.equal(stepCaret(V, 10, 1), 10);
});

test("Backspace past a chord's first letter takes its separator", () => {
  assert.deepEqual(deleteSeparator("C - ", 4, -1), { value: "C", caret: 1 });
  assert.deepEqual(deleteSeparator("C -  - D", 4, -1), { value: "C - D", caret: 1 });
  assert.equal(deleteSeparator(V, 6, -1), null); // a letter: the browser handles it
  assert.deepEqual(deleteSeparator(V, 1, -1), { value: "Em - D", caret: 0 }); // first chord gone, no stray dash
  assert.deepEqual(deleteSeparator(" - Em", 0, -1), { value: "Em", caret: 0 });
});

test("a space at a chord's end opens a slot after it, once", () => {
  assert.deepEqual(openSlot("C - D", 1), { value: "C -  - D", caret: 4 });
  assert.equal(openSlot("C -  - D", 4), null);
});

test("every chord but the one being typed gets tidied", () => {
  const up = (c: string) => (c ? c[0].toUpperCase() + c.slice(1) : c);
  assert.equal(capitalizeChords("c - am - d", 5, up), "C - am - D"); // caret at the end of am
  assert.equal(capitalizeChords("c - am - d", -1, up), "C - Am - D");
  assert.equal(capitalizeChords("c -  - d", 4, up), "C -  - D"); // caret in the empty slot
});

test("leaving the box drops empty slots, keeps a trailing one", () => {
  assert.equal(dropEmptySlots("C -  - D"), "C - D");
  assert.equal(dropEmptySlots("C -  -  - D - "), "C - D - ");
  assert.equal(dropEmptySlots(V), V);
  assert.equal(dropEmptySlots(" - Em - D"), "Em - D");
  assert.equal(dropEmptySlots(""), "");
});

test("pasted chords get a separator each", () => {
  assert.equal(tidySeparators("E Em E7"), "E - Em - E7");
  assert.equal(tidySeparators(" C,  G,Am -D–F  "), "C - G - Am - D - F - ");
  assert.equal(tidySeparators(V), V);
});

test("typing at the start puts a new chord in front", () => {
  assert.deepEqual(typeAtStart(V, "g"), { value: "g - C - Em - D", caret: 1 });
  assert.deepEqual(typeAtStart(V, " "), { value: " - C - Em - D", caret: 0 });
  assert.equal(typeAtStart(" - C", "g"), null); // already an empty slot there
  assert.equal(typeAtStart("", "g"), null);
});
