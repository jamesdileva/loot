import { test } from "node:test";
import assert from "node:assert/strict";
import { selectionForRender, rowModel } from "../public/render.js";

test("selectionForRender: no items clears selection", () => {
  assert.equal(selectionForRender(null, 0), null);
  assert.equal(selectionForRender(2, 0), null);
});

test("selectionForRender: no prior selection pre-selects the first row on load", () => {
  assert.equal(selectionForRender(null, 3), 0);
  assert.equal(selectionForRender(undefined, 3), 0);
});

test("selectionForRender: keeps an in-range selection", () => {
  assert.equal(selectionForRender(2, 3), 2);
  assert.equal(selectionForRender(0, 1), 0);
});

test("selectionForRender: out-of-range selection resets to the first row", () => {
  assert.equal(selectionForRender(3, 3), 0);
  assert.equal(selectionForRender(-1, 3), 0);
  assert.equal(selectionForRender(4, 2), 0);
});

test("rowModel: derives done, due, and overdue for a done task", () => {
  const model = rowModel({ id: "x", title: "T", done: true, due: "2020-01-01" }, 0, 2, "2026-08-30");
  assert.equal(model.done, true);
  assert.equal(model.due, "2020-01-01");
  assert.equal(model.overdue, false);
});

test("rowModel: overdue computed from the injected today on open tasks", () => {
  const past = rowModel({ id: "x", title: "T", due: "2020-01-01" }, 1, 2, "2026-08-30");
  assert.equal(past.overdue, true);
  const future = rowModel({ id: "x", title: "T", due: "2030-01-01" }, 1, 2, "2026-08-30");
  assert.equal(future.overdue, false);
  const none = rowModel({ id: "x", title: "T" }, 1, 2, "2026-08-30");
  assert.equal(none.overdue, false);
});

test("rowModel: move-up disabled at the first row, move-down disabled at the last", () => {
  const first = rowModel({ id: "x", title: "T" }, 0, 3, "2026-08-30");
  assert.equal(first.moveUpDisabled, true);
  assert.equal(first.moveDownDisabled, false);
  const last = rowModel({ id: "y", title: "T" }, 2, 3, "2026-08-30");
  assert.equal(last.moveUpDisabled, false);
  assert.equal(last.moveDownDisabled, true);
});

test("rowModel: normalizes missing fields the way the API serves them", () => {
  const model = rowModel({ id: 1, title: "T" }, 1, 3, "2026-08-30");
  assert.equal(model.id, "1");
  assert.equal(model.notes, "");
  assert.equal(model.due, null);
  assert.equal(model.done, false);
});

test("rowModel: does not mutate the input task", () => {
  const task = { id: 1, title: "T", done: false, notes: "n" };
  const before = JSON.stringify(task);
  rowModel(task, 0, 2, "2026-08-30");
  assert.equal(JSON.stringify(task), before);
});