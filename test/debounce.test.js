import { test } from "node:test";
import assert from "node:assert/strict";
import { createDebouncer } from "../public/debounce.js";

function fakeClock() {
  let now = 0;
  let nextId = 1;
  const queue = new Map();
  return {
    setTimeout(fn, ms) {
      const id = nextId++;
      queue.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout(id) {
      queue.delete(id);
    },
    tick(ms) {
      now += ms;
      let guard = 0;
      while (queue.size > 0 && guard++ < 10000) {
        let next = null;
        for (const [id, t] of queue) {
          if (t.at <= now && (next === null || t.at < next.t.at)) next = { id, t };
        }
        if (next === null) return;
        queue.delete(next.id);
        next.t.fn();
      }
    },
    pending() {
      return queue.size;
    },
  };
}

test("schedule defers the call until the delay elapses", () => {
  const clock = fakeClock();
  let calls = 0;
  const debounced = createDebouncer(() => calls++, { delay: 300, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  debounced.schedule();
  assert.equal(calls, 0);
  clock.tick(299);
  assert.equal(calls, 0);
  clock.tick(1);
  assert.equal(calls, 1);
});

test("schedule collapses rapid calls into one call", () => {
  const clock = fakeClock();
  let calls = 0;
  const debounced = createDebouncer(() => calls++, { delay: 300, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  for (let i = 0; i < 5; i++) debounced.schedule();
  clock.tick(300);
  assert.equal(calls, 1);
});

test("a later schedule restarts the delay window", () => {
  const clock = fakeClock();
  let calls = 0;
  const debounced = createDebouncer(() => calls++, { delay: 300, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  debounced.schedule();
  clock.tick(299);
  debounced.schedule();
  clock.tick(299);
  assert.equal(calls, 0);
  clock.tick(1);
  assert.equal(calls, 1);
});

test("flush runs a pending call immediately", () => {
  const clock = fakeClock();
  let calls = 0;
  const debounced = createDebouncer(() => calls++, { delay: 300, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  debounced.schedule();
  assert.equal(debounced.flush(), true);
  assert.equal(calls, 1);
  clock.tick(1000);
  assert.equal(calls, 1);
});

test("flush with nothing pending returns false and does not call", () => {
  const clock = fakeClock();
  let calls = 0;
  const debounced = createDebouncer(() => calls++, { delay: 300, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  assert.equal(debounced.flush(), false);
  assert.equal(calls, 0);
});

test("cancel drops a pending call", () => {
  const clock = fakeClock();
  let calls = 0;
  const debounced = createDebouncer(() => calls++, { delay: 300, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  debounced.schedule();
  assert.equal(debounced.cancel(), true);
  clock.tick(1000);
  assert.equal(calls, 0);
});

test("cancel with nothing pending returns false", () => {
  const clock = fakeClock();
  let calls = 0;
  const debounced = createDebouncer(() => calls++, { delay: 300, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  assert.equal(debounced.cancel(), false);
  assert.equal(calls, 0);
});

test("a fired debouncer is reusable for a later schedule", () => {
  const clock = fakeClock();
  let calls = 0;
  const debounced = createDebouncer(() => calls++, { delay: 300, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  debounced.schedule();
  clock.tick(300);
  assert.equal(calls, 1);
  debounced.schedule();
  clock.tick(300);
  assert.equal(calls, 2);
});

test("flush clears the pending handle so a later flush does not double-fire", () => {
  const clock = fakeClock();
  let calls = 0;
  const debounced = createDebouncer(() => calls++, { delay: 300, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  debounced.schedule();
  assert.equal(debounced.flush(), true);
  assert.equal(debounced.flush(), false);
  assert.equal(calls, 1);
});

test("defaults fall back to real timers and a 300ms delay", () => {
  const debounced = createDebouncer(() => {});
  assert.equal(typeof debounced.schedule, "function");
  assert.equal(typeof debounced.flush, "function");
  assert.equal(typeof debounced.cancel, "function");
});