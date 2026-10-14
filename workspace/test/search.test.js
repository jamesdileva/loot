import { test } from "node:test";
import assert from "node:assert/strict";
import { filterTasks, SEARCHABLE_FIELDS } from "../public/search.js";

const tasks = [
  { id: "1", title: "Buy Milk", notes: "2% at the corner shop" },
  { id: "2", title: "Call Plumber", notes: "" },
  { id: "3", title: "Write report", notes: "Include MILK sales figures" },
  { id: "4", title: "Walk the dog", notes: null },
];

test("empty query returns the full list unchanged", () => {
  const out = filterTasks(tasks, "");
  assert.deepEqual(out, tasks);
});

test("whitespace-only query returns the full list", () => {
  const out = filterTasks(tasks, "   ");
  assert.deepEqual(out, tasks);
});

test("undefined and null query return the full list", () => {
  assert.deepEqual(filterTasks(tasks, undefined), tasks);
  assert.deepEqual(filterTasks(tasks, null), tasks);
});

test("does not mutate the input array", () => {
  const before = [...tasks];
  filterTasks(tasks, "milk");
  assert.deepEqual(tasks, before);
});

test("returns a new array, not the same reference", () => {
  assert.notEqual(filterTasks(tasks, "milk"), tasks);
});

test("matching is case-insensitive", () => {
  const out = filterTasks(tasks, "MILK");
  assert.deepEqual(out.map((t) => t.id), ["1", "3"]);
});

test("query is trimmed before matching", () => {
  const out = filterTasks(tasks, "  milk  ");
  assert.deepEqual(out.map((t) => t.id), ["1", "3"]);
});

test("matches within title", () => {
  const out = filterTasks(tasks, "plumber");
  assert.deepEqual(out.map((t) => t.id), ["2"]);
});

test("matches within notes", () => {
  const out = filterTasks(tasks, "corner");
  assert.deepEqual(out.map((t) => t.id), ["1"]);
});

test("notes field is searchable per SEARCHABLE_FIELDS", () => {
  assert.ok(SEARCHABLE_FIELDS.includes("title"));
  assert.ok(SEARCHABLE_FIELDS.includes("notes"));
});

test("no matches returns an empty array", () => {
  const out = filterTasks(tasks, "zzzzzz");
  assert.deepEqual(out, []);
});

test("tasks with null notes are still matched by title", () => {
  const out = filterTasks(tasks, "dog");
  assert.deepEqual(out.map((t) => t.id), ["4"]);
});

test("filtered task objects reference the same task objects", () => {
  const out = filterTasks(tasks, "milk");
  assert.equal(out[0], tasks[0]);
});
