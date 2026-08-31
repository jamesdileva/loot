export const ACTION_MOVE_UP = "move-up";
export const ACTION_MOVE_DOWN = "move-down";
export const ACTION_TOGGLE_DONE = "toggle-done";
export const ACTION_DELETE = "delete";
export const ACTION_NONE = "none";

export const KEY_DOWN = "ArrowDown";
export const KEY_UP = "ArrowUp";
export const KEY_ENTER = "Enter";

export function nextSelection(move, index, count) {
  if (index === null || index === undefined || index < 0) return count > 0 ? 0 : null;
  if (count === 0) return null;
  if (move === ACTION_MOVE_UP) return index > 0 ? index - 1 : index;
  if (move === ACTION_MOVE_DOWN) return index < count - 1 ? index + 1 : index;
  return index;
}

export function shortcutAction(key, options = {}) {
  if (key === KEY_DOWN) return ACTION_MOVE_DOWN;
  if (key === KEY_UP) return ACTION_MOVE_UP;
  if (key === KEY_ENTER) return options.enterAction || ACTION_TOGGLE_DONE;
  return ACTION_NONE;
}
