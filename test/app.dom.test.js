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
    move(id, toIndex) {
      const i = tasks.findIndex((x) => String(x.id) === String(id));
      if (i < 0) return null;
      const [task] = tasks.splice(i, 1);
      const clamped = Math.max(0, Math.min(Number(toIndex) || 0, tasks.length));
      tasks.splice(clamped, 0, task);
      return norm(task);
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
    const isOrder = /\/order$/.test(path);
    if (isOrder && method === "PUT") {
      const moved = store.move(id, body().toIndex);
      return moved ? respond(200, moved) : respond(404, { error: "not found" });
    }
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
const pointer = (o) => ({ preventDefault() {}, ...o });
const box = (top, height = 50) => ({
  top,
  left: 0,
  right: 200,
  bottom: top + height,
  height,
  width: 200,
});

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

test("move buttons reorder rows in the DOM and persist the new order to the store", async () => {
  await resetView([
    { id: 20, title: "Alpha" },
    { id: 21, title: "Beta" },
    { id: 22, title: "Gamma" },
  ], 3);
  assert.deepEqual(titles(), ["Alpha", "Beta", "Gamma"]);

  list.children[0].querySelector(".down").click();
  assert.ok(await waitFor(() => byId("status").textContent === "Task moved" && titles().join("|") === "Beta|Alpha|Gamma"));
  assert.deepEqual(store.list().map((t) => t.title), ["Beta", "Alpha", "Gamma"]);

  list.children[2].querySelector(".up").click();
  assert.ok(await waitFor(() => byId("status").textContent === "Task moved" && titles().join("|") === "Beta|Gamma|Alpha"));
  assert.deepEqual(store.list().map((t) => t.title), ["Beta", "Gamma", "Alpha"]);

  assert.ok(list.children[0].querySelector(".up").disabled, "first row's up button is disabled");
  assert.ok(list.children[2].querySelector(".down").disabled, "last row's down button is disabled");
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

test("drag reorder: pointer drag inserts before the hovered row and persists over /order", async () => {
  await resetView([
    { id: 30, title: "Alpha" },
    { id: 31, title: "Beta" },
    { id: 32, title: "Gamma" },
  ], 3);
  const [alpha, beta] = list.children;
  document.elementFromPoint = () => alpha;
  alpha.getBoundingClientRect = () => box(100, 50);

  fire(beta, "pointerdown", pointer({ pointerId: 7, clientX: 10, clientY: 10 }));
  fire(beta, "pointermove", pointer({ pointerId: 7, clientX: 12, clientY: 14 }));
  assert.equal(beta.classList.contains("dragging"), false, "jitter below the 5px threshold is not a drag");
  assert.deepEqual(titles(), ["Alpha", "Beta", "Gamma"]);

  fire(beta, "pointermove", pointer({ pointerId: 7, clientX: 12, clientY: 25 }));
  assert.equal(beta.classList.contains("dragging"), true, "movement past the threshold activates the drag");
  assert.deepEqual(titles(), ["Beta", "Alpha", "Gamma"], "the dragged row jumps before the hovered one");

  fire(beta, "pointerup", pointer({ pointerId: 7, clientX: 12, clientY: 25 }));
  assert.equal(beta.listenerCount("pointermove"), 0, "pointerup detaches pointermove");
  assert.equal(beta.listenerCount("pointerup"), 0, "pointerup detaches itself");
  assert.equal(beta.listenerCount("pointercancel"), 0, "pointerup detaches pointercancel");
  assert.equal(beta.classList.contains("dragging"), false);
  assert.ok(await waitFor(() => byId("status").textContent === "Task moved"));
  await settle();
  assert.deepEqual(titles(), ["Beta", "Alpha", "Gamma"]);
  assert.deepEqual(store.list().map((t) => t.title), ["Beta", "Alpha", "Gamma"]);
});

test("drag tap: pointerdown/up without movement never persists a reorder", async () => {
  await resetView([
    { id: 33, title: "Alpha" },
    { id: 34, title: "Beta" },
    { id: 35, title: "Gamma" },
  ], 3);
  const beta = list.children[1];
  document.elementFromPoint = () => beta;

  fire(beta, "pointerdown", pointer({ pointerId: 8, clientX: 50, clientY: 50 }));
  fire(beta, "pointerup", pointer({ pointerId: 8, clientX: 50, clientY: 50 }));
  await settle();
  assert.equal(beta.listenerCount("pointermove"), 0);
  assert.equal(byId("status").textContent, "");
  assert.deepEqual(titles(), ["Alpha", "Beta", "Gamma"]);
  assert.deepEqual(store.list().map((t) => t.title), ["Alpha", "Beta", "Gamma"]);
});

test("drag ignores interactive targets: pointerdown on a button does not start a drag", async () => {
  await resetView([
    { id: 36, title: "Alpha" },
    { id: 37, title: "Beta" },
  ], 2);
  const beta = list.children[1];
  const downBtn = beta.querySelector(".down");
  document.elementFromPoint = () => beta;
  downBtn.getBoundingClientRect = () => box(100, 50);

  fire(beta, "pointerdown", pointer({ target: downBtn, pointerId: 9, clientX: 10, clientY: 10 }));
  fire(beta, "pointermove", pointer({ pointerId: 9, clientX: 100, clientY: 100 }));
  assert.equal(beta.classList.contains("dragging"), false);
  assert.equal(beta.listenerCount("pointermove"), 0);
  assert.deepEqual(titles(), ["Alpha", "Beta"]);
});

test("drag cancel: pointercancel detaches all drag listeners and never persists", async () => {
  await resetView([
    { id: 38, title: "Alpha" },
    { id: 39, title: "Beta" },
    { id: 40, title: "Gamma" },
  ], 3);
  const beta = list.children[1];
  const gamma = list.children[2];
  document.elementFromPoint = () => gamma;
  gamma.getBoundingClientRect = () => box(100, 50);

  fire(beta, "pointerdown", pointer({ pointerId: 10, clientX: 100, clientY: 100 }));
  fire(beta, "pointermove", pointer({ pointerId: 10, clientX: 100, clientY: 130 }));
  assert.equal(beta.classList.contains("dragging"), true);
  assert.deepEqual(titles(), ["Alpha", "Gamma", "Beta"], "dropped visually after the hovered row");

  fire(beta, "pointercancel", pointer({ pointerId: 10 }));
  assert.equal(beta.classList.contains("dragging"), false);
  assert.equal(beta.listenerCount("pointermove"), 0, "cancel detaches pointermove");
  assert.equal(beta.listenerCount("pointerup"), 0, "cancel detaches pointerup");
  assert.equal(beta.listenerCount("pointercancel"), 0, "cancel detaches itself");

  fire(beta, "pointerup", pointer({ pointerId: 10 }));
  await settle();
  assert.equal(byId("status").textContent, "", "a late pointerup after cancel persists nothing");
  assert.deepEqual(titles(), ["Alpha", "Gamma", "Beta"], "no re-render, no store change");
  assert.deepEqual(store.list().map((t) => t.title), ["Alpha", "Beta", "Gamma"]);
});

test("select change with a bogus value normalizes to 'all' and renders without shifting rows", async () => {
  await resetView([
    { id: 41, title: "Open task", done: false },
    { id: 42, title: "Done task", done: true },
    { id: 43, title: "Dated task", done: false, due: "2020-01-01" },
  ], 3);
  const statusSelect = byId("status-select");
  const dueSelect = byId("due-select");

  statusSelect.value = "bogus";
  fire(statusSelect, "change", { target: statusSelect });
  await settle();
  assert.deepEqual(titles(), ["Open task", "Done task", "Dated task"], "bogus status falls back to all");

  dueSelect.value = "junk";
  fire(dueSelect, "change", { target: dueSelect });
  await settle();
  assert.deepEqual(titles(), ["Open task", "Done task", "Dated task"], "bogus due falls back to all");
  assert.equal(byId("status").textContent, "");

  statusSelect.value = "done";
  fire(statusSelect, "change", { target: statusSelect });
  assert.ok(await waitFor(() => list.childElementCount === 1));
  assert.deepEqual(titles(), ["Done task"], "a valid filter still works after bogus dispatch");

  statusSelect.value = "all";
  fire(statusSelect, "change", { target: statusSelect });
  await settle();

  dueSelect.value = "dated";
  fire(dueSelect, "change", { target: dueSelect });
  assert.ok(await waitFor(() => list.childElementCount === 1));
  assert.deepEqual(titles(), ["Dated task"], "due filtering survives the normalize wiring");
});