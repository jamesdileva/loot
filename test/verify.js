import { run } from "node:test";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here)
  .filter((f) => f.endsWith(".test.js"))
  .sort()
  .map((f) => join(here, f));

console.log(`verify: discovered ${files.length} test file(s)`);
if (files.length === 0) {
  console.error("FAIL: no test files found under " + here);
  process.exit(1);
}

const stream = run({ files });
let pass = 0;
let fail = 0;
let skip = 0;
let todo = 0;

for await (const e of stream) {
  switch (e.type) {
    case "test:pass":
      pass++;
      console.log(`ok ${pass} - ${e.data.name}`);
      break;
    case "test:fail":
      fail++;
      console.log(`not ok - ${e.data.name}`);
      if (e.data.details && e.data.details.error) {
        console.error(String(e.data.details.error));
      }
      break;
    case "test:skip":
      skip++;
      break;
    case "test:todo":
      todo++;
      break;
    case "test:diagnostic":
      console.log(e.data.message);
      break;
    case "test:stderr":
      process.stderr.write(e.data.message);
      break;
    default:
      break;
  }
}

const total = pass + fail + skip + todo;
console.log(`# tests ${total}`);
console.log(`# pass ${pass}`);
console.log(`# fail ${fail}`);

if (total === 0) {
  console.error(
    "FAIL: 0 tests executed across " +
      files.length +
      " file(s) - caught by tests>0 guard; the test toolchain (cwd/PATH/launch) is broken, not the app."
  );
  process.exit(1);
}

process.exit(fail === 0 ? 0 : 1);