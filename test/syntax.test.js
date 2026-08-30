import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set(["node_modules", ".git", "data"]);

// Recursively collect every *.js file under root, skipping ignored dirs.
async function collect(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await collect(full));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

test("every JS file in the repo parses (node --check syntax sweep)", async () => {
  const files = await collect(repoRoot);
  assert.ok(files.length > 0, "expected at least one JS file to sweep");

  const failures = [];
  for (const file of files) {
    const res = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (res.status !== 0) {
      failures.push({ file, stderr: res.stderr.trim() });
    }
  }

  assert.deepEqual(
    failures,
    [],
    failures.map((f) => `${f.file}:\n${f.stderr}`).join("\n\n")
  );
});
