import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../store.js";

async function tempDir() {
  return mkdtemp(join(tmpdir(), "loot-store-"));
}

test("read returns empty default state when the store file does not exist", async () => {
  const dir = await tempDir();
  try {
    const store = createStore({ file: join(dir, "data.json") });
    assert.deepEqual(await store.read(), {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("atomic write persists data readable by a fresh store instance", async () => {
  const dir = await tempDir();
  try {
    const file = join(dir, "data.json");
    const store = createStore({ file });
    await store.write({ tasks: [{ id: 1, title: "hello" }] });

    const second = createStore({ file });
    assert.deepEqual(await second.read(), { tasks: [{ id: 1, title: "hello" }] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("leftover temp files from an interrupted write are cleaned on startup", async () => {
  const dir = await tempDir();
  try {
    const file = join(dir, "data.json");
    const temp = file + ".tmp";
    await writeFile(temp, '{"partial":true,"r"', "utf8");

    const store = createStore({ file });
    assert.deepEqual(await store.read(), {}, "lazy cleanup runs before first read");

    await assert.rejects(readFile(temp), { code: "ENOENT" }, "leftover temp removed");

    await store.write({ ok: true });

    const entries = await readdir(dir);
    assert.deepEqual(entries, ["data.json"], "no temp file remains after write");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
