import { test } from "node:test";
import assert from "node:assert/strict";
import { rawMoveIndex } from "../public/reorder.js";

test("rawMoveIndex moves a task up to the raw index of its upper visible neighbor", () => {
  const ids = ["a", "b", "c"];
  assert.equal(rawMoveIndex(ids, "b", "a"), 0);
});

test("rawMoveIndex moves a task down to just after its lower visible neighbor", () => {
  const ids = ["a", "b", "c"];
  assert.equal(rawMoveIndex(ids, "a", "b"), 1);
});

test("rawMoveIndex maps visible->raw when a filter hides rows in between", () => {
  const ids = ["alpha", "beta", "gamma", "delta"];
  assert.equal(rawMoveIndex(ids, "delta", "beta"), 1, "delta moves up to sit before beta");
});

test("rawMoveIndex produces a toIndex the server splices into the raw array correctly", () => {
  const ids = ["alpha", "beta", "gamma", "delta"];
  const toIndex = rawMoveIndex(ids, "delta", "beta");
  const rest = ids.filter((x) => x !== "delta");
  rest.splice(toIndex, 0, "delta");
  assert.deepEqual(rest, ["alpha", "delta", "beta", "gamma"]);
});

test("rawMoveIndex with lower-neighbor maps down across hidden rows", () => {
  const ids = ["alpha", "beta", "gamma", "delta"];
  assert.equal(rawMoveIndex(ids, "alpha", "gamma"), 2, "alpha moves down past beta to sit after gamma");
});

test("rawMoveIndex round-trips an in-place move to the same effective order", () => {
  const ids = ["a", "b", "c"];
  assert.equal(rawMoveIndex(ids, "b", "c"), 2);
  assert.equal(rawMoveIndex(ids, "b", "a"), 0);
});

test("rawMoveIndex ignores display order and derives from the raw store array via id", () => {
  const ids = ["x", "y", "z", "w"];
  assert.equal(rawMoveIndex(ids, "w", "y"), 1);
});

test("rawMoveIndex with a vanished moving id clamps to the raw end", () => {
  assert.equal(rawMoveIndex(["a", "b"], "ghost", "a"), 2);
});

test("rawMoveIndex with a vanished neighbor leaves the raw index unchanged", () => {
  const ids = ["a", "b", "c"];
  assert.equal(rawMoveIndex(ids, "b", "ghost"), 1);
});