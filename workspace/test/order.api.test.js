import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../store.js";

let child;
let port;
let dir;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "loot-order-"));
  const errFile = join(dir, "child.err.log");
const errStream = createWriteStream(errFile);
const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), "..");
child = spawn(process.execPath, [join(SERVER, "server.js")], {
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
  const store = createStore({ file: join(dir, "data.json"), initial: { tasks: [] } });
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

test("order moves a task up and persists array order to disk", async () => {
  const { names, ids } = await seed();
  await moveTask(ids[1], 0);
  assert.deepEqual(await listTitles(), [names[1], names[0], names[2]]);
  assert.deepEqual(await diskTitles(), [names[1], names[0], names[2]]);
});

test("order round-trips through GET after a down move", async () => {
  const { names, ids } = await seed();
  await moveTask(ids[0], 2);
  assert.deepEqual(await listTitles(), [names[1], names[2], names[0]]);
  assert.deepEqual(await diskTitles(), [names[1], names[2], names[0]]);
});

test("toIndex above range clamps to the end", async () => {
  const { names, ids } = await seed();
  await moveTask(ids[0], 999);
  assert.deepEqual(await listTitles(), [names[1], names[2], names[0]]);
});

test("negative toIndex clamps to the start", async () => {
  const { names, ids } = await seed();
  await moveTask(ids[2], -5);
  assert.deepEqual(await listTitles(), [names[2], names[0], names[1]]);
});

test("moving a task to its own index is a no-op", async () => {
  const { names, ids } = await seed();
  await moveTask(ids[1], 1);
  assert.deepEqual(await listTitles(), names);
});

test("order with missing id returns 404", async () => {
  const res = await fetch(`${base()}/api/tasks/9999/order`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toIndex: 0 }),
  });
  assert.equal(res.status, 404);
});

test("order with missing or non-integer toIndex returns 400", async () => {
  const task = await createTask("bad-index");
  const missing = await fetch(`${base()}/api/tasks/${task.id}/order`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(missing.status, 400);

  const stringy = await fetch(`${base()}/api/tasks/${task.id}/order`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toIndex: "1" }),
  });
  assert.equal(stringy.status, 400);
});

test("order endpoint rejects non-PUT methods", async () => {
  const task = await createTask("method");
  const get = await fetch(`${base()}/api/tasks/${task.id}/order`);
  assert.equal(get.status, 405);
});