import { readFile, writeFile, rename, rm, readdir, mkdir } from "node:fs/promises";
import { dirname, basename, join } from "node:path";

// A store must be a plain object that round-trips as valid JSON. Anything else
// (strings, numbers, arrays, booleans, undefined, functions) would persist to a
// corrupt store: refuse it rather than silently overwrite a previously good one.
function validateStoreData(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data) || typeof data.toJSON === "function") {
    return "store root must be a plain JSON object";
  }
  return null;
}

export function createStore({ file, initial = {} }) {
  const dir = dirname(file);
  const tmpFile = file + ".tmp";
  let cleaned = false;
  let lock = Promise.resolve();

  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    try {
      const entries = await readdir(dir);
      const prefix = basename(file) + ".tmp";
      for (const name of entries) {
        if (name === prefix || (name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)))) {
          await rm(join(dir, name), { force: true });
        }
      }
    } catch {
      // directory may not exist yet; nothing to clean
    }
  }

  async function read() {
    await cleanup();
    try {
      const raw = await readFile(file, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      if (err.code === "ENOENT") return structuredClone(initial);
      throw err;
    }
  }

  async function writeImpl(data) {
    const invalid = validateStoreData(data);
    if (invalid) {
      throw new Error(`refusing to write corrupt store: ${invalid}`);
    }
    await cleanup();
    await mkdir(dir, { recursive: true });
    const raw = JSON.stringify(data, null, 2);
    await writeFile(tmpFile, raw, "utf8");
    await rename(tmpFile, file);
  }

  async function withLock(fn) {
    const next = lock.then(fn, fn);
    lock = next.catch(() => {});
    return next;
  }

  return {
    async read() {
      return read();
    },
    async write(data) {
      return withLock(() => writeImpl(data));
    },
    async mutate(updater) {
      return withLock(async () => {
        const data = await read();
        const result = await updater(data);
        await writeImpl(data);
        return result;
      });
    },
  };
}
