import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldStartDrag, DRAG_THRESHOLD } from "../public/drag.js";

test("DRAG_THRESHOLD is 5px", () => {
  assert.equal(DRAG_THRESHOLD, 5);
});

test("tap jitter within the threshold does not start a drag", () => {
  assert.equal(shouldStartDrag(1, 1), false);
  assert.equal(shouldStartDrag(4, 0), false);
  assert.equal(shouldStartDrag(0, 4), false);
  assert.equal(shouldStartDrag(3, 4), false);
  assert.equal(shouldStartDrag(-4, 3), false);
});

test("movement exactly at the threshold does not start a drag", () => {
  assert.equal(shouldStartDrag(5, 0), false);
  assert.equal(shouldStartDrag(0, 5), false);
  assert.equal(shouldStartDrag(-5, 0), false);
  assert.equal(shouldStartDrag(0, -5), false);
  assert.equal(shouldStartDrag(4, 3), false);
});

test("movement beyond the threshold starts a drag in any direction", () => {
  assert.equal(shouldStartDrag(6, 0), true);
  assert.equal(shouldStartDrag(-6, 0), true);
  assert.equal(shouldStartDrag(0, 6), true);
  assert.equal(shouldStartDrag(0, -6), true);
  assert.equal(shouldStartDrag(4, 4), true);
});

test("coarse-pointer slop: the 5px catch is a circular radius, not a box", () => {
  for (let dx = -8; dx <= 8; dx += 1) {
    for (let dy = -8; dy <= 8; dy += 1) {
      const inside = dx * dx + dy * dy <= DRAG_THRESHOLD * DRAG_THRESHOLD;
      assert.equal(shouldStartDrag(dx, dy), !inside, `dx=${dx} dy=${dy}`);
    }
  }
});

test("a caller-supplied threshold overrides the default", () => {
  assert.equal(shouldStartDrag(3, 0), false);
  assert.equal(shouldStartDrag(3, 0, 2), true);
  assert.equal(shouldStartDrag(0, 10, 20), false);
});

test("shouldStartDrag is pure: repeated calls return the same result", () => {
  assert.equal(shouldStartDrag(7, 0), shouldStartDrag(7, 0));
});