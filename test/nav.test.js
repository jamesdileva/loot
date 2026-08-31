import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextSelection,
  normalizeSelection,
  shortcutAction,
  ACTION_MOVE_UP,
  ACTION_MOVE_DOWN,
  ACTION_TOGGLE_DONE,
  ACTION_DELETE,
  ACTION_NONE,
  KEY_DOWN,
  KEY_UP,
  KEY_ENTER,
} from "../public/nav.js";

test("nextSelection: null index starts at 0 when items exist", () => {
  assert.equal(nextSelection(ACTION_MOVE_DOWN, null, 3), 0);
});

test("nextSelection: undefined index starts at 0 when items exist", () => {
  assert.equal(nextSelection(ACTION_MOVE_DOWN, undefined, 3), 0);
});

test("nextSelection: no items returns null", () => {
  assert.equal(nextSelection(ACTION_MOVE_DOWN, null, 0), null);
});

test("nextSelection: down advances one", () => {
  assert.equal(nextSelection(ACTION_MOVE_DOWN, 1, 3), 2);
});

test("nextSelection: up retreats one", () => {
  assert.equal(nextSelection(ACTION_MOVE_UP, 1, 3), 0);
});

test("nextSelection: down clamps at last item", () => {
  assert.equal(nextSelection(ACTION_MOVE_DOWN, 2, 3), 2);
});

test("nextSelection: up clamps at first item", () => {
  assert.equal(nextSelection(ACTION_MOVE_UP, 0, 3), 0);
});

test("nextSelection: unknown move leaves index unchanged", () => {
  assert.equal(nextSelection("bogus", 1, 3), 1);
});

test("normalizeSelection: never pre-selects when nothing has been selected", () => {
  assert.equal(normalizeSelection(null, 3), null);
  assert.equal(normalizeSelection(undefined, 3), null);
});

test("normalizeSelection: no items clears selection", () => {
  assert.equal(normalizeSelection(0, 0), null);
  assert.equal(normalizeSelection(null, 0), null);
});

test("normalizeSelection: keeps an in-range selection", () => {
  assert.equal(normalizeSelection(2, 3), 2);
});

test("normalizeSelection: out-of-range or negative selection resets to none", () => {
  assert.equal(normalizeSelection(3, 3), null);
  assert.equal(normalizeSelection(-1, 3), null);
});

test("shortcutAction: arrow down maps to move-down", () => {
  assert.equal(shortcutAction(KEY_DOWN), ACTION_MOVE_DOWN);
});

test("shortcutAction: arrow up maps to move-up", () => {
  assert.equal(shortcutAction(KEY_UP), ACTION_MOVE_UP);
});

test("shortcutAction: enter defaults to toggle-done", () => {
  assert.equal(shortcutAction(KEY_ENTER), ACTION_TOGGLE_DONE);
});

test("shortcutAction: enter honors custom enterAction", () => {
  assert.equal(shortcutAction(KEY_ENTER, { enterAction: ACTION_DELETE }), ACTION_DELETE);
});

test("shortcutAction: other keys map to none", () => {
  assert.equal(shortcutAction("a"), ACTION_NONE);
  assert.equal(shortcutAction(" "), ACTION_NONE);
});
