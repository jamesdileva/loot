import { isOverdue } from "./filter.js";

export function selectionForRender(prevSelected, count) {
  if (count <= 0) return null;
  if (typeof prevSelected === "number" && prevSelected >= 0 && prevSelected < count) return prevSelected;
  return 0;
}

export function rowModel(task, index, count, today) {
  const done = Boolean(task.done);
  const due = task.due || null;
  return {
    id: String(task.id),
    title: String(task.title),
    notes: task.notes || "",
    done,
    due,
    overdue: isOverdue({ done, due }, today),
    moveUpDisabled: index <= 0,
    moveDownDisabled: index >= count - 1,
  };
}