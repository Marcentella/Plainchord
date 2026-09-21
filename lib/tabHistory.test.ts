import { test } from "node:test";
import assert from "node:assert/strict";
import { overflowIds } from "./tabHistory.ts";

test("overflowIds keeps the most recent `max` entries, returns the rest as overflow", () => {
  const entries = [
    { id: "a", importedAt: 1 },
    { id: "b", importedAt: 3 },
    { id: "c", importedAt: 2 },
  ];
  assert.deepEqual(overflowIds(entries, 2), ["a"]);
});

test("overflowIds returns [] when entries.length <= max", () => {
  const entries = [
    { id: "a", importedAt: 1 },
    { id: "b", importedAt: 2 },
  ];
  assert.deepEqual(overflowIds(entries, 2), []);
  assert.deepEqual(overflowIds(entries, 5), []);
});
