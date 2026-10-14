import { test } from "node:test";
import assert from "node:assert/strict";
import { exportStore, parseImport, TASK_FIELDS } from "../transfer.js";

const store = {
  tasks: [
    { id: 1, title: "alpha", notes: "n1", done: false, due: null },
    { id: 2, title: "beta", notes: "", done: true, due: "2026-09-01" },
  ],
};

test("exportStore preserves persisted array order", () => {
  assert.deepEqual(exportStore(store).tasks.map((t) => t.id), [1, 2]);
});

test("exportStore does not mutate the input", () => {
  const before = JSON.stringify(store);
  exportStore(store);
  assert.equal(JSON.stringify(store), before);
});

test("exportStore returns a copy, not the same reference", () => {
  const out = exportStore(store);
  assert.notEqual(out, store);
  assert.notEqual(out.tasks, store.tasks);
  assert.notEqual(out.tasks[0], store.tasks[0]);
});

test("exportStore is defensive about missing or non-array tasks", () => {
  assert.deepEqual(exportStore({}), { tasks: [] });
  assert.deepEqual(exportStore(null), { tasks: [] });
  assert.deepEqual(exportStore(undefined), { tasks: [] });
  assert.deepEqual(exportStore({ tasks: "nope" }), { tasks: [] });
});

test("parseImport accepts a full store and keeps the canonical shape", () => {
  const out = parseImport(store);
  assert.equal(out.ok, true);
  assert.deepEqual(out.data, store);
});

test("parseImport normalizes missing optional fields to defaults", () => {
  const out = parseImport({ tasks: [{ id: 7, title: "legacy" }] });
  assert.deepEqual(out.data.tasks, [{ id: 7, title: "legacy", notes: "", done: false, due: null }]);
});

test("empty-string and null due both parse to null", () => {
  const out = parseImport({ tasks: [{ id: 1, title: "x", due: "" }, { id: 2, title: "y", due: null }] });
  assert.equal(out.ok, true);
  assert.equal(out.data.tasks[0].due, null);
  assert.equal(out.data.tasks[1].due, null);
});

test("parseImport rejects non-object input", () => {
  assert.equal(parseImport(null).ok, false);
  assert.equal(parseImport([]).ok, false);
  assert.equal(parseImport("tasks").ok, false);
  assert.equal(parseImport(42).ok, false);
});

test("parseImport rejects missing or non-array tasks", () => {
  assert.equal(parseImport({}).ok, false);
  assert.equal(parseImport({ tasks: "nope" }).ok, false);
  assert.equal(parseImport({ tasks: {} }).ok, false);
});

test("parseImport rejects tasks that break the required shape", () => {
  assert.equal(parseImport({ tasks: ["nope"] }).ok, false);
  assert.equal(parseImport({ tasks: [{ id: "1", title: "x" }] }).ok, false);
  assert.equal(parseImport({ tasks: [{ id: 0, title: "x" }] }).ok, false);
  assert.equal(parseImport({ tasks: [{ id: -1, title: "x" }] }).ok, false);
  assert.equal(parseImport({ tasks: [{ id: 1 }] }).ok, false);
  assert.equal(parseImport({ tasks: [{ id: 1, title: "  " }] }).ok, false);
  assert.equal(parseImport({ tasks: [{ id: 1, title: "x", notes: 5 }] }).ok, false);
  assert.equal(parseImport({ tasks: [{ id: 1, title: "x", done: "yes" }] }).ok, false);
});

test("parseImport rejects invalid due dates", () => {
  assert.equal(parseImport({ tasks: [{ id: 1, title: "x", due: "2026-02-30" }] }).ok, false);
  assert.equal(parseImport({ tasks: [{ id: 1, title: "x", due: "tomorrow" }] }).ok, false);
  assert.equal(parseImport({ tasks: [{ id: 1, title: "x", due: 1 }] }).ok, false);
});

test("parseImport rejects duplicate ids", () => {
  assert.equal(parseImport({ tasks: [{ id: 1, title: "a" }, { id: 1, title: "b" }] }).ok, false);
});

test("TASK_FIELDS lists the exportable task keys", () => {
  assert.deepEqual(TASK_FIELDS, ["id", "title", "notes", "done", "due"]);
});

test("export then import round-trips a canonical store losslessly", () => {
  const exported = exportStore(store);
  const imported = parseImport(exported);
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.data, store);
});