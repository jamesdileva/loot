import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyView,
  isOverdue,
  VIEW_ALL,
  VIEW_OPEN,
  VIEW_DONE,
  DUE_ALL,
  DUE_OVERDUE,
  DUE_DATED,
} from "../public/filter.js";

const TODAY = "2026-08-29";

const tasks = [
  { id: 1, title: "Pay rent", notes: "", done: false, due: "2026-08-10" },
  { id: 2, title: "Buy milk", notes: "2% at the corner", done: false, due: "2026-08-31" },
  { id: 3, title: "Call plumber", notes: "", done: true, due: "2026-08-20" },
  { id: 4, title: "Walk MILK pond", notes: null, done: false, due: null },
  { id: 5, title: "Water plants", notes: "", done: true, due: null },
];

test("isOverdue: past due and not done", () => {
  assert.equal(isOverdue({ id: 1, due: "2026-08-10", done: false }, TODAY), true);
});

test("isOverdue: done tasks are never overdue", () => {
  assert.equal(isOverdue({ id: 3, due: "2026-08-10", done: true }, TODAY), false);
});

test("isOverdue: tasks without a due date are not overdue", () => {
  assert.equal(isOverdue({ id: 4, due: null, done: false }, TODAY), false);
});

test("isOverdue: due today is not overdue", () => {
  assert.equal(isOverdue({ id: 1, due: TODAY, done: false }, TODAY), false);
});

test("isOverdue: future due is not overdue", () => {
  assert.equal(isOverdue({ id: 1, due: "2026-08-31", done: false }, TODAY), false);
});

test("isOverdue: injected today keeps results deterministic", () => {
  const task = { id: 1, due: "2026-08-20", done: false };
  assert.equal(isOverdue(task, "2026-08-21"), true);
  assert.equal(isOverdue(task, "2026-08-20"), false);
  assert.equal(isOverdue(task, "2026-08-19"), false);
});

test("applyView: no options returns the full list in order", () => {
  const out = applyView(tasks);
  assert.deepEqual(out.map((t) => t.id), [1, 2, 3, 4, 5]);
});

test("applyView: status open keeps only open tasks", () => {
  const out = applyView(tasks, { status: VIEW_OPEN });
  assert.deepEqual(out.map((t) => t.id), [1, 2, 4]);
});

test("applyView: status done keeps only done tasks", () => {
  const out = applyView(tasks, { status: VIEW_DONE });
  assert.deepEqual(out.map((t) => t.id), [3, 5]);
});

test("applyView: text query ANDed with status", () => {
  const out = applyView(tasks, { query: "milk", status: VIEW_OPEN });
  assert.deepEqual(out.map((t) => t.id), [2, 4]);
});

test("applyView: status done ANDed with query excludes open matches", () => {
  const out = applyView(tasks, { query: "milk", status: VIEW_DONE });
  assert.deepEqual(out, []);
});

test("applyView: due overdue keeps only overdue tasks", () => {
  const out = applyView(tasks, { due: DUE_OVERDUE, today: TODAY });
  assert.deepEqual(out.map((t) => t.id), [1]);
});

test("applyView: due overdue ANDed with query and status", () => {
  const out = applyView(tasks, { query: "zzz", due: DUE_OVERDUE, today: TODAY });
  assert.deepEqual(out, []);
});

test("applyView: overdue depends on injected today", () => {
  const out = applyView(tasks, { due: DUE_OVERDUE, today: "2026-09-01" });
  assert.deepEqual(out.map((t) => t.id), [1, 2]);
});

test("applyView: due dated keeps only dated tasks, sorted soonest-first", () => {
  const out = applyView(tasks, { due: DUE_DATED });
  assert.deepEqual(out.map((t) => t.id), [1, 3, 2]);
});

test("applyView: due dated leaves undated files out even when matching query", () => {
  const out = applyView(tasks, { query: "milk", due: DUE_DATED });
  assert.deepEqual(out.map((t) => t.id), [2]);
});

test("applyView: query, status, and due all ANDed together", () => {
  const out = applyView(tasks, { query: "pay", status: VIEW_OPEN, due: DUE_OVERDUE, today: TODAY });
  assert.deepEqual(out.map((t) => t.id), [1]);
});

test("applyView: invalid status and due fall back to all", () => {
  const out = applyView(tasks, { status: "bogus", due: "nope" });
  assert.deepEqual(out.map((t) => t.id), [1, 2, 3, 4, 5]);
});

test("applyView: does not mutate the input array", () => {
  const before = JSON.parse(JSON.stringify(tasks));
  applyView(tasks, { query: "milk", status: VIEW_OPEN, due: DUE_DATED, today: TODAY });
  assert.deepEqual(tasks, before);
});

test("applyView: returns a new array, not the same reference", () => {
  assert.notEqual(applyView(tasks), tasks);
});

test("applyView: keeps the same task object references", () => {
  const out = applyView(tasks, { query: "milk" });
  assert.equal(out[0], tasks[1]);
});