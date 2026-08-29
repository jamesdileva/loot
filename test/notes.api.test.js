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

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "loot-notes-"));
  const errFile = join(dir, "child.err.log");
  const errStream = createWriteStream(errFile);
  port = 4400 + Math.floor(Math.random() * 1000);
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
});

after(async () => {
  child.kill();
  await rm(dir, { recursive: true, force: true });
});

const base = () => `http://127.0.0.1:${port}`;

test("POST stores markdown notes and GET round-trips them unchanged", async () => {
  const notes = "# Plan\n- step one\n- step two\n\n`code` here";
  const post = await fetch(`${base()}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "with notes", notes }),
  });
  assert.equal(post.status, 201);
  const task = await post.json();
  assert.equal(task.notes, notes);

  const get = await fetch(`${base()}/api/tasks`);
  assert.equal(get.status, 200);
  const tasks = await get.json();
  assert.deepEqual(tasks.find((t) => t.id === task.id), { id: task.id, title: "with notes", notes, done: false });
});

test("POST without notes defaults to an empty string", async () => {
  const post = await fetch(`${base()}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "bare" }),
  });
  assert.equal(post.status, 201);
  const task = await post.json();
  assert.equal(task.notes, "");
});

test("PUT updates notes and preserves them across title-only edits", async () => {
  const post = await fetch(`${base()}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "keep", notes: "sticky notes" }),
  });
  const { id } = await post.json();

  const putTitle = await fetch(`${base()}/api/tasks/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "kept" }),
  });
  assert.equal(putTitle.status, 200);
  assert.deepEqual(await putTitle.json(), { id, title: "kept", notes: "sticky notes", done: false });

  const putNotes = await fetch(`${base()}/api/tasks/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "kept", notes: "**now bold**" }),
  });
  assert.equal(putNotes.status, 200);
  assert.deepEqual(await putNotes.json(), { id, title: "kept", notes: "**now bold**", done: false });
});

test("hostile markup round-trips as text and stays out of the rendered boundary", async () => {
  const hostile = '<script>alert(1)</script>\n\n[click](javascript:alert(2))';
  const post = await fetch(`${base()}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "hostile", notes: hostile }),
  });
  assert.equal(post.status, 201);
  const task = await post.json();
  assert.equal(task.notes, hostile, "raw notes stored unchanged for editing");
});