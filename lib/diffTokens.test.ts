import { test } from "node:test";
import assert from "node:assert/strict";
import { diffTokens } from "./diffTokens.ts";

test("diffTokens finds an append at the end", () => {
  assert.deepEqual(diffTokens(["G", "D", "Em", "C"], ["G", "D", "Em", "C", "E"]), {
    at: 4,
    removedCount: 0,
    insertedCount: 1,
  });
});

test("diffTokens finds a delete at the end", () => {
  assert.deepEqual(diffTokens(["G", "D", "Em", "C"], ["G", "D", "Em"]), {
    at: 3,
    removedCount: 1,
    insertedCount: 0,
  });
});

test("diffTokens finds an insert in the middle", () => {
  assert.deepEqual(diffTokens(["G", "D", "Em", "C"], ["G", "D", "A", "Em", "C"]), {
    at: 2,
    removedCount: 0,
    insertedCount: 1,
  });
});

test("diffTokens finds a delete in the middle", () => {
  assert.deepEqual(diffTokens(["G", "D", "Em", "C"], ["G", "Em", "C"]), {
    at: 1,
    removedCount: 1,
    insertedCount: 0,
  });
});

test("diffTokens finds a replace (different-sized span swapped)", () => {
  assert.deepEqual(
    diffTokens(["G", "D", "Em", "C"], ["G", "A7", "B7", "Dm", "C"]),
    { at: 1, removedCount: 2, insertedCount: 3 },
  );
});

test("diffTokens treats a whole-list replace as remove-all + insert-all", () => {
  assert.deepEqual(diffTokens(["G", "D", "Em", "C"], ["Am", "Dm", "E7"]), {
    at: 0,
    removedCount: 4,
    insertedCount: 3,
  });
});

test("diffTokens returns an empty diff for equal-length lists, even if content differs", () => {
  // An in-place edit (mid-typing a chord's name) must never look like a
  // remove+insert, or the exit/enter animation would fire every keystroke.
  assert.deepEqual(diffTokens(["G", "D", "Em", "C"], ["G", "D", "An", "C"]), {
    at: 0,
    removedCount: 0,
    insertedCount: 0,
  });
});

test("diffTokens handles an empty previous list (initial mount)", () => {
  assert.deepEqual(diffTokens([], ["G", "D", "Em", "C"]), {
    at: 0,
    removedCount: 0,
    insertedCount: 4,
  });
});

test("diffTokens handles clearing the list entirely", () => {
  assert.deepEqual(diffTokens(["G", "D", "Em", "C"], []), {
    at: 0,
    removedCount: 4,
    insertedCount: 0,
  });
});
