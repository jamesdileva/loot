export const SEARCHABLE_FIELDS = ["title", "notes"];

export function filterTasks(tasks, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return tasks.slice();
  return tasks.filter((task) => {
    return SEARCHABLE_FIELDS.some((field) => {
      const value = task[field];
      return typeof value === "string" && value.toLowerCase().includes(q);
    });
  });
}
