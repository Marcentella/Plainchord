import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgression } from "./parseProgression.ts";

test("parseProgression splits on dashes, commas and spaces", () => {
  assert.deepEqual(parseProgression("G - D - Em - C"), ["G", "D", "Em", "C"]);
  assert.deepEqual(parseProgression("G, D,Em C"), ["G", "D", "Em", "C"]);
  assert.deepEqual(parseProgression("  G  "), ["G"]);
  assert.deepEqual(parseProgression(""), []);
});
