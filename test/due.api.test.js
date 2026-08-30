import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../store.js";

let child;
let port;
let dir;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "loot-due-"));
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

async function createTask(title, extra = {}) {
  const res = await fetch(`${base()}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, ...extra }),
  });
  assert.equal(res.status, 201);
  return res.json();
}

test("POST defaults due to null", async () => {
  const task = await createTask("plain");
  assert.equal(task.due, null);
});

test("POST with a valid due date stores it", async () => {
  const task = await createTask("dated", { due: "2026-09-01" });
  assert.equal(task.due, "2026-09-01");
});

test("POST with an invalid due date stores null", async () => {
  for (const bad of ["2026-13-01", "2026-02-29", "not-a-date", "09/01/2026", 20260901]) {
    const task = await createTask(`bad ${String(bad)}`, { due: bad });
    assert.equal(task.due, null, `due ${bad} should normalize to null`);
  }
});

test("PUT sets and later clears a due date", async () => {
  const task = await createTask("bookable");
  const set = await fetch(`${base()}/api/tasks/${task.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "bookable", due: "2026-10-15" }),
  });
  assert.equal(set.status, 200);
  assert.equal((await set.json()).due, "2026-10-15");

  const cleared = await fetch(`${base()}/api/tasks/${task.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "bookable", due: null }),
  });
  assert.equal(cleared.status, 200);
  assert.equal((await cleared.json()).due, null);
});

test("PUT title-only preserves due", async () => {
  const task = await createTask("keep", { due: "2026-11-01" });
  const put = await fetch(`${base()}/api/tasks/${task.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "kept" }),
  });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { id: task.id, title: "kept", notes: "", done: false, due: "2026-11-01" });
});

test("PUT invalid due is coerced to the stored value", async () => {
  const bare = await createTask("bare");
  const stringy = await fetch(`${base()}/api/tasks/${bare.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "bare", due: "oops" }),
  });
  assert.equal(stringy.status, 200);
  assert.equal((await stringy.json()).due, null);

  const dated = await createTask("dated", { due: "2026-12-01" });
  const broken = await fetch(`${base()}/api/tasks/${dated.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "dated", due: "nope" }),
  });
  assert.equal(broken.status, 200);
  assert.equal((await broken.json()).due, "2026-12-01");
});

test("PUT empty-string due clears a stored date", async () => {
  const task = await createTask("wipe", { due: "2026-12-24" });
  const put = await fetch(`${base()}/api/tasks/${task.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "wipe", due: "" }),
  });
  assert.equal(put.status, 200);
  assert.equal((await put.json()).due, null);
});

test("due round-trips through list and single GET", async () => {
  const task = await createTask("round", { due: "2027-01-01" });

  const single = await fetch(`${base()}/api/tasks/${task.id}`);
  assert.equal(single.status, 200);
  assert.deepEqual(await single.json(), { id: task.id, title: "round", notes: "", done: false, due: "2027-01-01" });

  const list = await fetch(`${base()}/api/tasks`);
  const tasks = await list.json();
  assert.equal(tasks.find((t) => t.id === task.id).due, "2027-01-01");
});

test("done toggle does not disturb due (PUT omits it)", async () => {
  const task = await createTask("done keeps due", { due: "2026-09-09" });
  const put = await fetch(`${base()}/api/tasks/${task.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "done keeps due", notes: "", done: true }),
  });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { id: task.id, title: "done keeps due", notes: "", done: true, due: "2026-09-09" });
});

test("legacy tasks stored without due are served normalized to null", async () => {
  const dataFile = join(dir, "data.json");
  const store = createStore({ file: dataFile, initial: { tasks: [] } });
  await store.write({ tasks: [{ id: 888, title: "legacy", notes: "old", done: false }] });

  const list = await fetch(`${base()}/api/tasks`);
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), [{ id: 888, title: "legacy", notes: "old", done: false, due: null }]);

  const single = await fetch(`${base()}/api/tasks/888`);
  assert.equal(single.status, 200);
  assert.deepEqual(await single.json(), { id: 888, title: "legacy", notes: "old", done: false, due: null });
});