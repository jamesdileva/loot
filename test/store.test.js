import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../store.js";

async function tempDir() {
  return mkdtemp(join(tmpdir(), "loot-store-"));
}

test("write creates a missing parent directory", async () => {
  const dir = await tempDir();
  try {
    const file = join(dir, "nested", "deep", "data.json");
    const store = createStore({ file });
    await store.write({ tasks: [{ id: 1, title: "fresh" }] });

    const second = createStore({ file });
    assert.deepEqual(await second.read(), { tasks: [{ id: 1, title: "fresh" }] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

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

test("cleanup only removes real <basename>.tmp* temp files, not siblings", async () => {
  const dir = await tempDir();
  try {
    const file = join(dir, "data.json");
    await writeFile(file + ".tmp", "{", "utf8");
    await writeFile(file + ".tmp1", "{", "utf8");
    await writeFile(file + ".tmp12", "{", "utf8");
    await writeFile(file + ".tmpx", "keep-me", "utf8");
    await writeFile(file + ".tmpx1", "keep-me", "utf8");
    await writeFile(join(dir, "notdata.json.tmp"), "keep-me", "utf8");

    const store = createStore({ file });
    await store.write({ ok: true });

    const entries = await readdir(dir).then((es) => es.sort());
    assert.deepEqual(
      entries,
      ["data.json", "data.json.tmpx", "data.json.tmpx1", "notdata.json.tmp"],
      "numeric-suffixed temps removed, siblings preserved"
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("mutate serializes concurrent read-modify-write cycles without lost updates", async () => {
  const dir = await tempDir();
  try {
    const file = join(dir, "data.json");
    const store = createStore({ file, initial: { count: 0 } });

    const N = 20;
    await Promise.all(
      Array.from({ length: N }, () => store.mutate(async (data) => {
        data.count += 1;
      }))
    );

    const second = createStore({ file, initial: { count: 0 } });
    assert.deepEqual(await second.read(), { count: N }, "all concurrent increments persisted");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("store.write queues behind an in-flight mutate", async () => {
  const dir = await tempDir();
  try {
    const file = join(dir, "data.json");
    const store = createStore({ file, initial: { v: 0 } });

    let release;
    const gate = new Promise((r) => { release = r; });
    const mutateP = store.mutate(async (data) => {
      await gate;
      data.v = 1;
    });
    const writeP = store.write({ v: 2 });
    release();
    await Promise.all([mutateP, writeP]);

    const second = createStore({ file });
    assert.deepEqual(await second.read(), { v: 2 }, "write applied after the mutate finished");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

