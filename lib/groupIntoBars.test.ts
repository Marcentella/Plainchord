import { test } from "node:test";
import assert from "node:assert/strict";
import { groupIntoBars } from "./groupIntoBars.ts";
import type { TabBeat } from "./tab.ts";

/** Builds a TabBeat sequence from a list of per-bar beat counts, matching how lib/importGuitarPro.ts numbers position/bar. */
function beatsFromBarSizes(barSizes: number[]): TabBeat[] {
  const beats: TabBeat[] = [];
  barSizes.forEach((size, bar) => {
    for (let i = 0; i < size; i++) {
      beats.push({ position: beats.length, bar, notes: [{ string: 0, fret: 0, techniques: [] }] });
    }
  });
  return beats;
}

// The real 85-bar sequence from public/Steel Dragons - We All Die Young.gp4
// (the file that surfaced the original row-layout bug) — kept as a
// regression fixture even though the packing this file used to also test
// is gone: it's still a good real-world check that bar-splitting alone
// (no merging, no budget) reproduces every one of the source's 85 bars
// exactly, including the run of seven consecutive 1-beat rest bars.
const REAL_BAR_SIZES = [
  10, 10, 11, 10, 11, 10, 11, 10, 10, 10, 11, 10, 10, 10, 11, 10, 10, 10, 11, 10, 10, 10, 11, 10, 1, 1, 1, 1, 1, 1, 1,
  5, 10, 10, 11, 10, 10, 10, 11, 10, 10, 10, 11, 10, 1, 1, 1, 1, 1, 1, 1, 5, 10, 10, 11, 10, 10, 10, 11, 10, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 11, 11, 11, 12, 11, 11, 7, 3, 2,
];

test("empty input produces no groups", () => {
  assert.deepEqual(groupIntoBars([]), []);
});

test("bar-having input: one group per bar, each exactly the bar's own beats, in order", () => {
  const groups = groupIntoBars(beatsFromBarSizes(REAL_BAR_SIZES));
  assert.equal(groups.length, REAL_BAR_SIZES.length);
  assert.deepEqual(
    groups.map((g) => g.length),
    REAL_BAR_SIZES,
  );
  groups.forEach((group, i) => {
    assert.ok(group.every((b) => b.bar === i));
  });
});

test("bar-having input: the seven consecutive 1-beat rest bars stay seven separate groups", () => {
  // No merging anymore — that's now purely flex-wrap's job at render time,
  // not something this function does. Bars 24-30 (0-based) are the run.
  const groups = groupIntoBars(beatsFromBarSizes(REAL_BAR_SIZES));
  const restRun = groups.slice(24, 31);
  assert.equal(restRun.length, 7);
  for (const group of restRun) assert.equal(group.length, 1);
});

test("a single bar of any size stays one group, never split", () => {
  const groups = groupIntoBars(beatsFromBarSizes([3, 40, 3]));
  assert.equal(groups.length, 3);
  assert.equal(groups[1].length, 40);
  assert.ok(groups[1].every((b) => b.bar === 1));
});

test("bar-less input (every beat bar: 0) falls back to small fixed chunks", () => {
  const beats: TabBeat[] = Array.from({ length: 10 }, (_, i) => ({
    position: i,
    bar: 0,
    notes: [{ string: 0, fret: 0, techniques: [] }],
  }));
  const groups = groupIntoBars(beats);
  assert.deepEqual(
    groups.map((g) => g.length),
    [4, 4, 2],
  );
});
