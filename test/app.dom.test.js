import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { createDom } from "./dom.js";

await register(new URL("./loader-hooks.js", import.meta.url).href, import.meta.url);

const { document, elements } = createDom();
globalThis.document = document;

function makeStore() {
  let tasks = [];
  let seq = 1;
  const norm = (t) => ({
    id: t.id,
    title: String(t.title),
    notes: t.notes || "",
    done: Boolean(t.done),
    due: t.due || null,
  });
  return {
    reset(items) {
      tasks = items.map((t) => norm({ id: t.id, title: t.title, notes: t.notes, done: t.done, due: t.due }));
      seq = tasks.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0) + 1;
    },
    list: () => tasks.map(norm),
    add(title) {
      const t = { id: seq++, title: String(title), notes: "", done: false, due: null };
      tasks.push(t);
      return norm(t);
    },
    get: (id) => {
      const t = tasks.find((x) => String(x.id) === String(id));
      return t ? norm(t) : null;
    },
    remove(id) {
      const i = tasks.findIndex((x) => String(x.id) === String(id));
      if (i < 0) return null;
      return norm(tasks.splice(i, 1)[0]);
    },
    update(id, patch) {
      const i = tasks.findIndex((x) => String(x.id) === String(id));
      if (i < 0) return null;
      const next = { ...tasks[i] };
      if (patch.title !== undefined) next.title = String(patch.title);
      if (patch.notes !== undefined) next.notes = String(patch.notes);
      if (patch.done !== undefined) next.done = Boolean(patch.done);
      if ("due" in patch) next.due = patch.due ? String(patch.due) : null;
      tasks[i] = next;
      return norm(next);
    },
  };
}

const store = makeStore();

globalThis.fetch = async (url, options = {}) => {
  const method = String(options.method || "GET").toUpperCase();
  const path = new URL(url, "http://loot.invalid").pathname;
  const body = () => {
    try {
      return JSON.parse(options.body || "null");
    } catch {
      return null;
    }
  };
  const respond = (status, data) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  });

  if (method === "GET" && path === "/api/tasks") return respond(200, store.list());
  if (method === "POST" && path === "/api/tasks") return respond(201, store.add(body().title));

  const m = path.match(/^\/api\/tasks\/(\d+)(?:\/order)?$/);
  if (m) {
    const id = Number(m[1]);
    if (method === "DELETE") {
      const removed = store.remove(id);
      return removed ? respond(200, removed) : respond(404, { error: "not found" });
    }
    if (method === "PUT") {
      const updated = store.update(id, body() || {});
      return updated ? respond(200, updated) : respond(404, { error: "not found" });
    }
  }
  return respond(404, { error: "not found" });
};

const byId = (id) => elements[id];
const list = byId("task-list");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async (n = 40) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
async function waitFor(pred, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (pred()) return true;
    await sleep(5);
  }
  return pred();
}

const titles = () => [...list.children].map((li) => li.querySelector(".title").textContent);
const fire = (el, type, ev = {}) => el.dispatch(type, ev);
const typeQuery = (q) => {
  const search = byId("search-input");
  search.value = q;
  fire(search, "input", { target: search });
};
const selectValue = (id, v) => {
  const el = byId(id);
  el.value = v;
  fire(el, "change", { target: el });
};
const submitAdd = (title) => {
  const input = byId("title-input");
  input.value = title;
  fire(byId("add-form"), "submit", { preventDefault() {} });
};

async function resetView(seed, expected) {
  store.reset(seed);
  byId("status").textContent = "";
  byId("title-input").value = "";
  const search = byId("search-input");
  search.value = "";
  fire(search, "input", { target: search });
  selectValue("status-select", "all");
  selectValue("due-select", "all");
  if (expected !== undefined) assert.ok(await waitFor(() => list.childElementCount === expected), `resetView: expected ${expected} rows`);
  else await settle();
}

await import("../public/app.js");

test("boot: initial render lists seeded tasks and pre-selects the first row", async () => {
  await resetView([
    { id: 1, title: "Buy milk" },
    { id: 2, title: "Call plumber" },
  ], 2);
  assert.equal(list.childElementCount, 2);
  assert.deepEqual(titles(), ["Buy milk", "Call plumber"]);
  assert.ok(list.children[0].classList.contains("selected"));
  assert.equal(list.children[0].getAttribute("tabindex"), "0");
  assert.equal(byId("status").textContent, "");
});

test("empty state: zero tasks shows the placeholder, adding the first hides it", async () => {
  await resetView([], 0);
  assert.equal(byId("empty").hidden, false);
  assert.equal(byId("no-filter-match").hidden, true);
  submitAdd("First task");
  assert.ok(await waitFor(() => byId("status").textContent === "Task added"));
  assert.equal(list.childElementCount, 1);
  assert.equal(byId("empty").hidden, true);
  assert.deepEqual(titles(), ["First task"]);
});

test("addTask without filters appends the new row at the end (optimistic path)", async () => {
  await resetView([
    { id: 3, title: "First" },
    { id: 4, title: "Second" },
  ], 2);
  submitAdd("Third");
  assert.ok(await waitFor(() => byId("status").textContent === "Task added"));
  assert.equal(list.childElementCount, 3);
  assert.deepEqual(titles(), ["First", "Second", "Third"]);
  assert.ok(list.children[0].classList.contains("selected"));
});

test("typing a query debounces then narrows the list to matches", async () => {
  await resetView([
    { id: 5, title: "Buy milk" },
    { id: 6, title: "Call plumber" },
  ], 2);
  typeQuery("plumber");
  assert.ok(await waitFor(() => list.childElementCount === 1));
  assert.deepEqual(titles(), ["Call plumber"]);
});

test("addTask under a text query filter renders, not appends: non-matching row stays invisible, matching row appears", async () => {
  await resetView([
    { id: 7, title: "Buy milk" },
    { id: 8, title: "Call plumber" },
  ], 2);
  typeQuery("milk");
  submitAdd("Water plants");
  assert.ok(await waitFor(() => byId("status").textContent === "Task added"));
  assert.equal(list.childElementCount, 1);
  assert.deepEqual(titles(), ["Buy milk"]);
  assert.equal(byId("no-filter-match").hidden, true);

  submitAdd("Buy milk carton");
  assert.ok(await waitFor(() => list.childElementCount === 2));
  assert.deepEqual(titles(), ["Buy milk", "Buy milk carton"]);
  assert.ok(list.children[0].classList.contains("selected"));
  assert.equal(list.children[0].getAttribute("tabindex"), "0");
});

test("addTask under status=done stays invisible (new tasks are open)", async () => {
  await resetView([
    { id: 9, title: "Clean fridge", done: true },
    { id: 10, title: "Read book", done: false },
  ], 2);
  selectValue("status-select", "done");
  assert.ok(await waitFor(() => list.childElementCount === 1));
  assert.deepEqual(titles(), ["Clean fridge"]);
  submitAdd("Unread task");
  assert.ok(await waitFor(() => byId("status").textContent === "Task added"));
  assert.equal(list.childElementCount, 1);
  assert.deepEqual(titles(), ["Clean fridge"]);
});

test("addTask under due=overdue stays invisible (new tasks have no due date)", async () => {
  await resetView([
    { id: 11, title: "Pay rent", due: "2020-01-01" },
    { id: 12, title: "Plan trip", due: null },
  ], 2);
  selectValue("due-select", "overdue");
  assert.ok(await waitFor(() => list.childElementCount === 1));
  assert.deepEqual(titles(), ["Pay rent"]);
  submitAdd("New undated task");
  assert.ok(await waitFor(() => byId("status").textContent === "Task added"));
  assert.equal(list.childElementCount, 1);
  assert.deepEqual(titles(), ["Pay rent"]);
});

test("a query with zero matches shows the no-filter-match placeholder and holds after add", async () => {
  await resetView([{ id: 13, title: "Buy milk" }], 1);
  typeQuery("zzz");
  assert.ok(await waitFor(() => list.childElementCount === 0));
  assert.equal(byId("no-filter-match").hidden, false);
  assert.equal(byId("empty").hidden, true);
  submitAdd("Everything");
  assert.ok(await waitFor(() => byId("status").textContent === "Task added"));
  assert.equal(list.childElementCount, 0);
  assert.equal(byId("no-filter-match").hidden, false);
});

test("overlapping renders from two synchronous filter changes produce no duplicate rows", async () => {
  await resetView([
    { id: 14, title: "Clean fridge", done: true },
    { id: 15, title: "Read book", done: false },
    { id: 16, title: "Pay rent", done: false },
  ], 3);
  selectValue("status-select", "done");
  selectValue("due-select", "all");
  await settle();
  assert.equal(list.childElementCount, 1);
  assert.deepEqual(titles(), ["Clean fridge"]);
});

test("stale render that resolves after a newer one does not wipe the newer rows", async () => {
  await resetView([
    { id: 17, title: "Buy milk" },
    { id: 18, title: "Call plumber" },
    { id: 19, title: "Clean fridge", done: true },
  ], 3);
  const realFetch = globalThis.fetch;
  const gates = [];
  globalThis.fetch = (url, opts) => {
    if (String(url).endsWith("/api/tasks") && (opts?.method || "GET").toUpperCase() === "GET") {
      let release;
      const p = new Promise((r) => { release = r; });
      gates.push(() => release(realFetch(url, opts)));
      return p;
    }
    return realFetch(url, opts);
  };
  try {
    selectValue("status-select", "done");
    selectValue("due-select", "all");
    assert.equal(gates.length, 2, "two synchronous filter changes should each trigger a render");
    gates[1]();
    await settle();
    assert.equal(list.childElementCount, 1);
    assert.deepEqual(titles(), ["Clean fridge"]);
    gates[0]();
    await settle();
    assert.equal(list.childElementCount, 1, "stale render must not clobber the newer rows");
    assert.deepEqual(titles(), ["Clean fridge"]);
  } finally {
    for (const g of gates) g();
    globalThis.fetch = realFetch;
  }
});