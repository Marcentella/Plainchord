import { test } from "node:test";
import assert from "node:assert/strict";
import { overflowIds, duplicateIds } from "./tabHistory.ts";
import type { Tab } from "./tab.ts";

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

const sampleTab: Tab = { beats: [{ position: 0, bar: 0, notes: [{ string: 0, fret: 3, techniques: [] }] }] };
const otherTab: Tab = { beats: [{ position: 0, bar: 0, notes: [{ string: 1, fret: 5, techniques: [] }] }] };

test("duplicateIds finds every existing entry with an identical tab", () => {
  const entries = [
    { id: "a", tab: sampleTab },
    { id: "b", tab: otherTab },
    { id: "c", tab: { ...sampleTab } },
  ];
  assert.deepEqual(duplicateIds(entries, sampleTab), ["a", "c"]);
});

test("duplicateIds returns [] when nothing matches", () => {
  const entries = [{ id: "a", tab: otherTab }];
  assert.deepEqual(duplicateIds(entries, sampleTab), []);
});
