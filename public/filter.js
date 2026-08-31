export const VIEW_ALL = "all";
export const VIEW_OPEN = "open";
export const VIEW_DONE = "done";

export const DUE_ALL = "all";
export const DUE_OVERDUE = "overdue";
export const DUE_DATED = "dated";

export function isOverdue(task, today) {
  return Boolean(task.due && !task.done && task.due < today);
}

function matchesText(task, query) {
  return (
    (typeof task.title === "string" && task.title.toLowerCase().includes(query)) ||
    (typeof task.notes === "string" && task.notes.toLowerCase().includes(query))
  );
}

export function normalizeStatus(value) {
  return value === VIEW_OPEN || value === VIEW_DONE ? value : VIEW_ALL;
}

export function normalizeDue(value) {
  return value === DUE_OVERDUE || value === DUE_DATED ? value : DUE_ALL;
}

export function applyView(tasks, view = {}) {
  const query = String(view.query ?? "").trim().toLowerCase();
  const status = normalizeStatus(view.status);
  const due = normalizeDue(view.due);

  const out = tasks.filter((task) => {
    if (query && !matchesText(task, query)) return false;
    if (status === VIEW_OPEN && task.done) return false;
    if (status === VIEW_DONE && !task.done) return false;
    if (due === DUE_OVERDUE && !isOverdue(task, view.today)) return false;
    if (due === DUE_DATED && !task.due) return false;
    return true;
  });

  if (due === DUE_DATED) {
    out.sort((a, b) => {
      if (a.due < b.due) return -1;
      if (a.due > b.due) return 1;
      return 0;
    });
  }
  return out;
}

export function viewIsFiltered(view = {}) {
  const query = String(view.query ?? "").trim();
  const status = normalizeStatus(view.status);
  const due = normalizeDue(view.due);
  return query !== "" || status !== VIEW_ALL || due !== DUE_ALL;
}