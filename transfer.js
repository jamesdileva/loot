export const TASK_FIELDS = ["id", "title", "notes", "done", "due"];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validDue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) === value ? value : null;
}

// Deep, order-preserving copy of the store shape for export. Never mutates input.
export function exportStore(data) {
  const tasks = Array.isArray(data && data.tasks) ? data.tasks : [];
  return { tasks: tasks.map((task) => ({ ...task })) };
}

// Strict parse of import input: returns { ok: true, data: { tasks } } with
// canonical task shape, or { ok: false, error }. id and title are required;
// notes/done/due default when absent. Malformed or duplicate data is rejected
// wholesale before anything is written.
export function parseImport(value) {
  if (!isPlainObject(value)) return { ok: false, error: "expected an object" };
  if (!Array.isArray(value.tasks)) return { ok: false, error: "tasks must be an array" };
  const seen = new Set();
  const tasks = [];
  for (let i = 0; i < value.tasks.length; i += 1) {
    const task = value.tasks[i];
    const at = `task ${i}`;
    if (!isPlainObject(task)) return { ok: false, error: `${at}: must be an object` };
    if (!Number.isInteger(task.id) || task.id <= 0) {
      return { ok: false, error: `${at}: id must be a positive integer` };
    }
    if (typeof task.title !== "string" || !task.title.trim()) {
      return { ok: false, error: `${at}: title required` };
    }
    if (seen.has(task.id)) return { ok: false, error: `${at}: duplicate id ${task.id}` };
    seen.add(task.id);
    if (task.notes !== undefined && typeof task.notes !== "string") {
      return { ok: false, error: `${at}: notes must be a string` };
    }
    if (task.done !== undefined && typeof task.done !== "boolean") {
      return { ok: false, error: `${at}: done must be a boolean` };
    }
    let due = null;
    if (task.due !== undefined && task.due !== null && task.due !== "") {
      if (typeof task.due !== "string" || validDue(task.due) === null) {
        return { ok: false, error: `${at}: invalid due date` };
      }
      due = task.due;
    }
    tasks.push({
      id: task.id,
      title: task.title,
      notes: task.notes === undefined ? "" : task.notes,
      done: task.done === undefined ? false : task.done,
      due,
    });
  }
  return { ok: true, data: { tasks } };
}