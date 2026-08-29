import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

let child;
let port;

before(async () => {
  port = 3100 + Math.floor(Math.random() * 1000);
  child = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "ignore", "ignore"],
  });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", reject);
    setTimeout(resolve, 300);
  });
});

after(() => child.kill());

test("GET / returns the hello page", async () => {
  const res = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Hello from Loot/);
});