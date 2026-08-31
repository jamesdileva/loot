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
  dir = await mkdtemp(join(tmpdir(), "loot-smoke-"));
  const errFile = join(dir, "child.err.log");
  const errStream = createWriteStream(errFile);
  child = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: "0", DATA_FILE: join(dir, "data.json") },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  child.stderr.pipe(errStream);
  const bootTimeout = new Promise((_, reject) => {
    const t = setTimeout(() => reject(new Error("boot timeout after 10s")), 10_000);
    t.unref();
  });
  let outcome;
  try {
    outcome = await Promise.race([
      new Promise((resolve) => child.on("message", (msg) => { if (msg && msg.ready) port = msg.port; resolve(msg && msg.ready ? "ready" : null); })),
      new Promise((resolve) => child.once("exit", (code, sig) => resolve(`exit:${code}:${sig}`))),
      new Promise((resolve) => child.once("error", (e) => resolve(`error:${e.message}`))),
      bootTimeout,
    ]);
  } catch (e) {
    outcome = e.message;
  }
  if (outcome !== "ready") {
    await new Promise((r) => setTimeout(r, 500));
    errStream.end();
    const log = await readFile(errFile, "utf8").catch(() => "");
    throw new Error(`server not ready (${outcome}). stderr:\n${log}`);
  }
});

after(async () => {
  if (child) {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    const killTimeout = new Promise((_, reject) => {
      const t = setTimeout(() => reject(new Error("child did not exit in 10s")), 10_000);
      t.unref();
    });
    await Promise.race([exited, killTimeout]).catch(() => {});
  }
  await rm(dir, { recursive: true, force: true }).catch(() => {});
});

test("GET / returns the Loot task list page", async () => {
  const res = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Loot/);
  assert.match(body, /api\/tasks|app\.js|Add a task/);
});

test("GET /index.html serves the static UI", async () => {
  const res = await fetch(`http://127.0.0.1:${port}/index.html`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Loot/);
});

test("HTML app can round-trip a task over /api/tasks", async () => {
  const base = `http://127.0.0.1:${port}`;
  const post = await fetch(`${base}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "ui round-trip" }),
  });
  assert.equal(post.status, 201);
  const task = await post.json();

  const getPage = await fetch(`${base}/`);
  assert.equal(getPage.status, 200);

  const getTasks = await fetch(`${base}/api/tasks`);
  assert.equal(getTasks.status, 200);
  assert.deepEqual(await getTasks.json(), [{ id: task.id, title: "ui round-trip", notes: "", done: false, due: null }]);
});

test("storage is isolated to DATA_FILE, not the default workspace data path", async () => {
  const base = `http://127.0.0.1:${port}`;
  const post = await fetch(`${base}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "isolated-write" }),
  });
  assert.equal(post.status, 201);

  const stored = JSON.parse(await readFile(join(dir, "data.json"), "utf8"));
  assert.ok(stored.tasks.some((t) => t.title === "isolated-write"));

  const prodPath = new URL("../data/data.json", import.meta.url);
  const beforeBytes = await readFile(prodPath, "utf8").catch(() => null);
  const hasProd = beforeBytes !== null;
  if (hasProd) {
    const prod = JSON.parse(beforeBytes);
    assert.ok(!prod.tasks.some((t) => t.title === "isolated-write"));
  }
  const afterBytes = await readFile(prodPath, "utf8").catch(() => null);
  assert.equal(afterBytes, beforeBytes);
});
