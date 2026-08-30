import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../store.js";

let child;
let port;
let dir;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "loot-transfer-"));
  const errFile = join(dir, "child.err.log");
  const errStream = createWriteStream(errFile);
  child = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: "0", DATA_FILE: join(dir, "data.json") },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  child.stderr.pipe(errStream);
  const outcome = await Promise.race([
    new Promise((resolve) => child.on("message", (msg) => { if (msg && msg.ready) port = msg.port; resolve(msg && msg.ready ? "ready" : null); })),
    new Promise((resolve) => child.once("exit", (code, sig) => resolve(`exit:${code}:${sig}`))),
    new Promise((resolve) => child.once("error", (e) => resolve(`error:${e.message}`))),
  ]);
  if (outcome !== "ready") {
    await new Promise((r) => setTimeout(r, 500));
    errStream.end();
    const log = await readFile(errFile, "utf8");
    throw new Error(`server not ready (${outcome}). stderr:\n${log}`);
  }
});

after(async () => {
  child.kill();
  await rm(dir, { recursive: true, force: true });
});

const base = () => `http://127.0.0.1:${port}`;
const dataFile = () => join(dir, "data.json");

let n = 0;

async function createTask(title) {
  const res = await fetch(`${base()}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  assert.equal(res.status, 201);
  return res.json();
}

async function moveTask(id, toIndex) {
  const res = await fetch(`${base()}/api/tasks/${id}/order`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toIndex }),
  });
  assert.equal(res.status, 200);
  return res.json();
}

async function listTitles() {
  const res = await fetch(`${base()}/api/tasks`);
  assert.equal(res.status, 200);
  const tasks = await res.json();
  return tasks.map((t) => t.title);
}

async function diskTitles() {
  const store = createStore({ file: dataFile(), initial: { tasks: [] } });
  const data = await store.read();
  return data.tasks.map((t) => t.title);
}

async function resetTasks() {
  const res = await fetch(`${base()}/api/tasks`);
  const tasks = await res.json();
  for (const task of tasks) {
    await fetch(`${base()}/api/tasks/${task.id}`, { method: "DELETE" });
  }
}

async function seed(titles = ["a", "b", "c"]) {
  await resetTasks();
  n += 1;
  const prefix = `s${n}-`;
  const ids = [];
  for (const title of titles) {
    const task = await createTask(`${prefix}${title}`);
    ids.push(task.id);
  }
  return { names: titles.map((t) => `${prefix}${t}`), ids };
}

async function exportTasks() {
  const res = await fetch(`${base()}/api/export`);
  assert.equal(res.status, 200);
  return res.json();
}

async function importTasks(body) {
  return fetch(`${base()}/api/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("export preserves the persisted save-order, not a sorted view", async () => {
  const { names, ids } = await seed(["a", "b", "c"]);
  await moveTask(ids[2], 0);
  const exported = await exportTasks();
  assert.deepEqual(exported.tasks.map((t) => t.title), [names[2], names[0], names[1]]);
  assert.deepEqual(exported.tasks.map((t) => t.title), await diskTitles());
});

test("import replaces the store and round-trips byte-identically", async () => {
  const { ids } = await seed(["a", "b", "c"]);
  await moveTask(ids[1], 2);
  const exported = await exportTasks();
  const res = await importTasks(exported);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { count: 3 });
  assert.deepEqual(await exportTasks(), exported);
  assert.deepEqual(await listTitles(), await diskTitles());
});

test("import writes an atomic backup of the prior store before overwriting", async () => {
  const { names } = await seed(["a", "b"]);
  const before = await exportTasks();
  const res = await importTasks({ tasks: [{ id: 100, title: "replaced" }] });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(await readFile(dataFile() + ".pre-import", "utf8")), before);
  assert.deepEqual(await listTitles(), ["replaced"]);
  await assert.rejects(readFile(dataFile() + ".pre-import.tmp", "utf8"));
});

test("import with malformed input returns 400 and never touches the store", async () => {
  const { names } = await seed(["keep"]);
  const malformedJson = await fetch(`${base()}/api/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ nope",
  });
  assert.equal(malformedJson.status, 400);

  const badContent = await fetch(`${base()}/api/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tasks: "nope" }),
  });
  assert.equal(badContent.status, 400);

  const badTask = await fetch(`${base()}/api/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tasks: [{ id: "x", title: "bad" }] }),
  });
  assert.equal(badTask.status, 400);

  const emptyBody = await fetch(`${base()}/api/import`, { method: "POST" });
  assert.equal(emptyBody.status, 400);

  assert.deepEqual(await diskTitles(), names);
});

test("corrupt store returns 409 and is refused, fresh store overwrites freely", async () => {
  await rm(dataFile() + ".pre-import", { force: true });
  await writeFile(dataFile(), "definitely not json", "utf8");
  const corrupt = await importTasks({ tasks: [{ id: 1, title: "x" }] });
  assert.equal(corrupt.status, 409);
  assert.equal(await readFile(dataFile(), "utf8"), "definitely not json");
  await assert.rejects(readFile(dataFile() + ".pre-import", "utf8"));

  await rm(dataFile(), { force: true });
  const fresh = await importTasks({ tasks: [{ id: 1, title: "fresh" }] });
  assert.equal(fresh.status, 200);
  assert.deepEqual(await listTitles(), ["fresh"]);
  assert.deepEqual(JSON.parse(await readFile(dataFile() + ".pre-import", "utf8")), { tasks: [] });
});

test("export and import reject wrong methods with 405", async () => {
  const posted = await fetch(`${base()}/api/export`, { method: "POST" });
  assert.equal(posted.status, 405);
  const imported = await fetch(`${base()}/api/import`);
  assert.equal(imported.status, 405);
});