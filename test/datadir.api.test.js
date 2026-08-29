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
  dir = await mkdtemp(join(tmpdir(), "loot-nodir-"));
  const errFile = join(dir, "child.err.log");
  const errStream = createWriteStream(errFile);
  port = 5200 + Math.floor(Math.random() * 1000);
  child = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(port), DATA_FILE: join(dir, "missing", "data.json") },
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

test("POST works when DATA_FILE lives in a non-existent directory", async () => {
  const res = await fetch(`http://127.0.0.1:${port}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "fresh-checkout" }),
  });
  assert.equal(res.status, 201);
  const task = await res.json();
  assert.ok(task.id);

  const get = await fetch(`http://127.0.0.1:${port}/api/tasks`);
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), [{ id: task.id, title: "fresh-checkout" }]);
});