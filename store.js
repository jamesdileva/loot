import { readFile, writeFile, rename, rm, readdir } from "node:fs/promises";
import { dirname, basename, join } from "node:path";

export function createStore({ file, initial = {} }) {
  const dir = dirname(file);
  const tmpFile = file + ".tmp";
  let cleaned = false;

  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    try {
      const entries = await readdir(dir);
      const prefix = basename(file) + ".tmp";
      for (const name of entries) {
        if (name.startsWith(prefix)) {
          await rm(join(dir, name), { force: true });
        }
      }
    } catch {
      // directory may not exist yet; nothing to clean
    }
  }

  return {
    async read() {
      await cleanup();
      try {
        const raw = await readFile(file, "utf8");
        return JSON.parse(raw);
      } catch (err) {
        if (err.code === "ENOENT") return initial;
        throw err;
      }
    },
    async write(data) {
      await cleanup();
      const raw = JSON.stringify(data, null, 2);
      await writeFile(tmpFile, raw, "utf8");
      await rename(tmpFile, file);
    },
  };
}
