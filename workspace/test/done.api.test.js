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
  dir = await mkdtemp(join(tmpdir(), "loot-done-"));
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

async function createTask(title, extra = {}) {
  const res = await fetch(`${base()}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, ...extra }),
  });
  assert.equal(res.status, 201);
  return res.json();
}

async function setDone(id, done) {
  const res = await fetch(`${base()}/api/tasks/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "x", done }),
  });
  assert.equal(res.status, 200);
  return res.json();
}

test("POST defaults done to false", async () => {
  const task = await createTask("plain");
  assert.equal(task.done, false);
});

test("PUT title-only preserves done", async () => {
  const task = await createTask("keep");
  await setDone(task.id, true);
  const put = await fetch(`${base()}/api/tasks/${task.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "kept" }),
  });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { id: task.id, title: "kept", notes: "", done: true, due: null });
});

test("PUT non-boolean done is coerced to the stored value", async () => {
  const fresh = await createTask("fresh");
  const stringy = await fetch(`${base()}/api/tasks/${fresh.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "fresh", done: "yes" }),
  });
  assert.equal(stringy.status, 200);
  assert.equal((await stringy.json()).done, false);

  const completed = await createTask("completed");
  await setDone(completed.id, true);
  const nullish = await fetch(`${base()}/api/tasks/${completed.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "completed", done: "yes" }),
  });
  assert.equal(nullish.status, 200);
  assert.equal((await nullish.json()).done, true);
});

test("PUT with notes preserves done and notes round-trip unchanged", async () => {
  const task = await createTask("keep notes", { notes: "# Plan\n- step one" });
  const put = await fetch(`${base()}/api/tasks/${task.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "keep notes", notes: "# Plan\n- step one", done: true }),
  });
  assert.equal(put.status, 200);
  const updated = await put.json();
  assert.deepEqual(updated, { id: task.id, title: "keep notes", notes: "# Plan\n- step one", done: true, due: null });

  const get = await fetch(`${base()}/api/tasks/${task.id}`);
  assert.deepEqual(await get.json(), { id: task.id, title: "keep notes", notes: "# Plan\n- step one", done: true, due: null });
});

test("done flag round-trips through the API for the UI checkbox", async () => {
  const task = await createTask("ui done");
  const put = await fetch(`${base()}/api/tasks/${task.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "ui done", notes: "", done: true }),
  });
  assert.equal(put.status, 200);
  assert.equal((await put.json()).done, true);

  const list = await fetch(`${base()}/api/tasks`);
  const tasks = await list.json();
  assert.equal(tasks.find((t) => t.id === task.id).done, true);
});

test("legacy tasks stored without done are served normalized to false", async () => {
  const dataFile = join(dir, "data.json");
  const store = createStore({ file: dataFile, initial: { tasks: [] } });
  await store.write({ tasks: [{ id: 999, title: "legacy", notes: "old" }] });

  const list = await fetch(`${base()}/api/tasks`);
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), [{ id: 999, title: "legacy", notes: "old", done: false, due: null }]);

  const single = await fetch(`${base()}/api/tasks/999`);
  assert.equal(single.status, 200);
  assert.deepEqual(await single.json(), { id: 999, title: "legacy", notes: "old", done: false, due: null });
});