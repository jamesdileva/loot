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

export function applyView(tasks, view = {}) {
  const query = String(view.query ?? "").trim().toLowerCase();
  const status = view.status === VIEW_OPEN || view.status === VIEW_DONE ? view.status : VIEW_ALL;
  const due = view.due === DUE_OVERDUE || view.due === DUE_DATED ? view.due : DUE_ALL;

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