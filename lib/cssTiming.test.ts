import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCssDuration } from "./cssTiming.ts";

test("parseCssDuration reads milliseconds", () => {
  assert.equal(parseCssDuration("280ms"), 280);
});

test("parseCssDuration reads seconds", () => {
  assert.equal(parseCssDuration("0.3s"), 300);
});

test("parseCssDuration trims surrounding whitespace", () => {
  assert.equal(parseCssDuration("  280ms  "), 280);
});

test("parseCssDuration returns 0 for an unrecognized unit", () => {
  assert.equal(parseCssDuration("280"), 0);
});
