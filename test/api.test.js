import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let child;
let port;
let dir;
let childErr = "";

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "loot-api-"));
  const errFile = join(dir, "child.err.log");
  const errStream = createWriteStream(errFile);
  port = 4200 + Math.floor(Math.random() * 1000);
  child = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(port), DATA_FILE: join(dir, "data.json") },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  child.stderr.pipe(errStream);
  const outcome = await Promise.race([
    new Promise((resolve) => child.on("message", (msg) => resolve(msg && msg.ready ? "ready" : null))),
    new Promise((resolve) => child.once("exit", (code, sig) => resolve(`exit:${code}:${sig}`))),
    new Promise((resolve) => child.once("error", (e) => resolve(`error:${e.message}`))),
  ]);
  if (outcome !== "ready") {
    await new Promise((r) => setTimeout(r, 500));
    errStream.end();
    const log = await readFile(errFile, "utf8");
    throw new Error(`server not ready (${outcome}). stderr:\n${log}`);
  }
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      const probe = await fetch(`http://127.0.0.1:${port}/api/tasks`);
      await probe.json();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
});

after(async () => {
  child.kill();
  await rm(dir, { recursive: true, force: true });
});

const base = () => `http://127.0.0.1:${port}`;

test("POST and GET /api/tasks round-trip a task", async () => {
  const post = await fetch(`${base()}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "demo" }),
  });
  assert.equal(post.status, 201);
  const task = await post.json();
  assert.ok(task.id);

  const get = await fetch(`${base()}/api/tasks`);
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), [{ id: task.id, title: "demo", notes: "" }]);
});

test("GET /api/tasks/:id returns a single task", async () => {
  const post = await fetch(`${base()}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "single" }),
  });
  const { id } = await post.json();
  const get = await fetch(`${base()}/api/tasks/${id}`);
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), { id, title: "single", notes: "" });
});

test("PUT /api/tasks/:id replaces a task title", async () => {
  const post = await fetch(`${base()}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "old" }),
  });
  const { id } = await post.json();
  const put = await fetch(`${base()}/api/tasks/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "new" }),
  });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { id, title: "new", notes: "" });
});

test("DELETE /api/tasks/:id removes a task", async () => {
  const post = await fetch(`${base()}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "remove-me" }),
  });
  const { id } = await post.json();
  const del = await fetch(`${base()}/api/tasks/${id}`, { method: "DELETE" });
  assert.equal(del.status, 200);
  const get = await fetch(`${base()}/api/tasks/${id}`);
  assert.equal(get.status, 404);
});

test("unknown API route returns 404", async () => {
  const res = await fetch(`${base()}/api/nope`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not found" });
});

test("bad method on task collection returns 405", async () => {
  const res = await fetch(`${base()}/api/tasks`, { method: "PATCH" });
  assert.equal(res.status, 405);
  assert.deepEqual(await res.json(), { error: "method not allowed" });
});

test("POST with invalid JSON returns 400", async () => {
  const res = await fetch(`${base()}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "invalid JSON" });
});

test("POST without a title returns 400", async () => {
  const res = await fetch(`${base()}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "title required" });
});

test("missing task returns 404", async () => {
  const res = await fetch(`${base()}/api/tasks/99999`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "task not found" });
});

test("POST with oversized body returns 413", async () => {
  const res = await fetch(`${base()}/api/tasks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      connection: "close",
    },
    body: JSON.stringify({ title: "x".repeat(1200 * 1024) }),
  });
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: "body too large" });
});

test("POST round-trips a multi-byte UTF-8 title unchanged", async () => {
  const title = "tâche à faire — 完成事宜 🎯";
  const post = await fetch(`${base()}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  assert.equal(post.status, 201);
  const task = await post.json();
  assert.equal(task.title, title);
});

test("static request that escapes public is rejected", async () => {
  const res = await fetch(`${base()}/%2e%2e/package.json`);
  assert.equal(res.status, 404);
  const body = await res.text();
  assert.doesNotMatch(body, /loot@/);
});

test("encoded-separator traversal is rejected by the root guard", async () => {
  const attempts = [
    "/%2e%2e%2f/package.json",
    "/%2e%2e%5cpackage.json",
    "/..%2f/package.json",
    "/..%5cpackage.json",
  ];
  for (const path of attempts) {
    const res = await fetch(`${base()}${path}`);
    assert.equal(res.status, 403, `${path} should be 403`);
  }
});
