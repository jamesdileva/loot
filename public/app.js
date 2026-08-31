import { renderMarkdown } from "/markdown.js";
import { shouldStartDrag } from "/drag.js";
import { applyView, isOverdue, viewIsFiltered, VIEW_ALL, DUE_ALL } from "/filter.js";
import { nextSelection, shortcutAction, ACTION_MOVE_UP, ACTION_MOVE_DOWN, ACTION_TOGGLE_DONE } from "/nav.js";
import { selectionForRender, rowModel } from "/render.js";
import { createDebouncer } from "/debounce.js";

const list = document.getElementById("task-list");
const empty = document.getElementById("empty");
const noFilterMatch = document.getElementById("no-filter-match");
const form = document.getElementById("add-form");
const input = document.getElementById("title-input");
const searchInput = document.getElementById("search-input");
const statusEl = document.getElementById("status");

let dragging = null;
let reordering = false;
let currentQuery = "";
let currentStatus = VIEW_ALL;
let currentDue = DUE_ALL;
let selectedIndex = null;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message || "";
  statusEl.classList.toggle("error", isError);
}

async function api(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.error ? `: ${body.error}` : "";
    } catch {}
    throw new Error(`request failed (${res.status})${detail}`);
  }
  return res.status === 204 ? null : res.json();
}

function makeTaskElement(task, index, count) {
  const li = document.createElement("li");
  li.className = "task";
  const model = rowModel(task, index, count, todayIso());
  li.dataset.id = model.id;
  const state = { id: model.id, title: model.title, notes: model.notes, done: model.done, due: model.due };

  function isOverdueNow() {
    return isOverdue(state, todayIso());
  }

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "done-box";
  checkbox.checked = state.done;
  checkbox.setAttribute("aria-label", "Toggle done");
  checkbox.addEventListener("change", async () => {
    const next = checkbox.checked;
    try {
      const updated = await api(`/api/tasks/${state.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: state.title, notes: state.notes, done: next }),
      });
      state.done = Boolean(updated.done);
      li.classList.toggle("done", state.done);
      li.classList.toggle("overdue", isOverdueNow());
      setStatus(state.done ? "Task completed" : "Task reopened");
    } catch (err) {
      checkbox.checked = state.done;
      setStatus(err.message, true);
    }
  });

  const title = document.createElement("span");
  title.className = "title";
  title.textContent = state.title;

  const upBtn = document.createElement("button");
  upBtn.className = "move up";
  upBtn.textContent = "↑";
  upBtn.setAttribute("aria-label", "Move up");
  upBtn.disabled = model.moveUpDisabled;
  upBtn.addEventListener("click", () => moveTask(state.id, index - 1, upBtn));

  const downBtn = document.createElement("button");
  downBtn.className = "move down";
  downBtn.textContent = "↓";
  downBtn.setAttribute("aria-label", "Move down");
  downBtn.disabled = model.moveDownDisabled;
  downBtn.addEventListener("click", () => moveTask(state.id, index + 1, downBtn));

  const editBtn = document.createElement("button");
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => startEdit(li, state, title));

  const dueInput = document.createElement("input");
  dueInput.type = "date";
  dueInput.className = "due";
  dueInput.value = state.due || "";
  dueInput.setAttribute("aria-label", "Due date");
  dueInput.addEventListener("change", async () => {
    const next = dueInput.value || null;
    try {
      const updated = await api(`/api/tasks/${state.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: state.title, notes: state.notes, done: state.done, due: next }),
      });
      state.due = updated.due || null;
      li.classList.toggle("overdue", isOverdueNow());
      setStatus(updated.due ? `Due ${updated.due}` : "Due date cleared");
    } catch (err) {
      dueInput.value = state.due || "";
      setStatus(err.message, true);
    }
  });

  const notesBtn = document.createElement("button");
  notesBtn.textContent = "Notes";
  notesBtn.addEventListener("click", toggleNotes);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => removeTask(state.id));

  const notesView = document.createElement("div");
  notesView.className = "notes-view";

  const editor = document.createElement("div");
  editor.className = "notes-editor";
  editor.hidden = true;
  const textarea = document.createElement("textarea");
  textarea.rows = 4;
  textarea.placeholder = "Markdown notes…";
  const actions = document.createElement("div");
  actions.className = "actions";
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "cancel";
  cancelBtn.textContent = "Cancel";
  actions.append(saveBtn, cancelBtn);
  editor.append(textarea, actions);

  async function persistNotes() {
    const notes = textarea.value;
    try {
      const updated = await api(`/api/tasks/${state.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: state.title, notes }),
      });
      state.notes = updated.notes || "";
      renderNotesView();
      editor.hidden = true;
      setStatus("Notes saved");
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  function renderNotesView() {
    if (state.notes) {
      notesView.innerHTML = renderMarkdown(state.notes);
      notesView.hidden = false;
    } else {
      notesView.replaceChildren();
      notesView.hidden = true;
    }
  }

  function toggleNotes() {
    if (!editor.hidden) {
      editor.hidden = true;
      return;
    }
    textarea.value = state.notes;
    editor.hidden = false;
    textarea.focus();
  }

  saveBtn.addEventListener("click", persistNotes);
  cancelBtn.addEventListener("click", () => { editor.hidden = true; });
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") editor.hidden = true;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) persistNotes();
  });

  renderNotesView();
  li.classList.toggle("done", state.done);
  li.classList.toggle("overdue", model.overdue);
  li.append(checkbox, title, upBtn, downBtn, editBtn, dueInput, notesBtn, deleteBtn, notesView, editor);
  li.addEventListener("pointerdown", (e) => onPointerDown(e, li, state.id));
  return li;
}

async function reorderTask(id, toIndex) {
  await api(`/api/tasks/${id}/order`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toIndex }),
  });
}

async function moveTask(id, toIndex, btn) {
  if (reordering) return;
  reordering = true;
  if (btn) btn.disabled = true;
  try {
    await reorderTask(id, toIndex);
    await render();
    setStatus("Task moved");
  } catch (err) {
    setStatus(err.message, true);
    await render();
  } finally {
    reordering = false;
  }
}

function taskIndex(li) {
  return Array.prototype.indexOf.call(list.children, li);
}

function dragIgnoredTarget(target) {
  const t = target.closest ? target.closest("button, input, textarea, a, .notes-editor, .notes-view") : null;
  return Boolean(t);
}

function onPointerDown(e, li, id) {
  if (reordering || dragging || dragIgnoredTarget(e.target)) return;
  if (taskIndex(li) === -1) return;
  e.preventDefault();
  dragging = { id, pointerId: e.pointerId, startIndex: taskIndex(li), startX: e.clientX, startY: e.clientY, li, active: false };
  if (li.setPointerCapture) li.setPointerCapture(e.pointerId);
  li.addEventListener("pointermove", onPointerMove);
  li.addEventListener("pointerup", onPointerUp);
  li.addEventListener("pointercancel", onPointerCancel);
}

function onPointerMove(e) {
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  e.preventDefault();
  if (!dragging.active) {
    if (!shouldStartDrag(e.clientX - dragging.startX, e.clientY - dragging.startY)) return;
    dragging.active = true;
    dragging.li.classList.add("dragging");
  }
  const li = dragging.li;
  const over = document.elementFromPoint(e.clientX, e.clientY);
  const other = over && over.closest ? over.closest(".task") : null;
  if (!other || other === li) return;
  const rect = other.getBoundingClientRect();
  const placeBefore = e.clientY < rect.top + rect.height / 2;
  if (placeBefore) list.insertBefore(li, other);
  else list.insertBefore(li, other.nextSibling);
}

async function onPointerUp(e) {
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  const { id, li, active } = dragging;
  const startIndex = dragging.startIndex;
  dragging = null;
  li.classList.remove("dragging");
  li.removeEventListener("pointermove", onPointerMove);
  li.removeEventListener("pointerup", onPointerUp);
  li.removeEventListener("pointercancel", onPointerCancel);
  if (!active) return;
  const newIndex = taskIndex(li);
  if (newIndex === startIndex || reordering) return;
  reordering = true;
  try {
    await reorderTask(id, newIndex);
    await render();
    setStatus("Task moved");
  } catch (err) {
    setStatus(err.message, true);
    await render();
  } finally {
    reordering = false;
  }
}

function onPointerCancel(e) {
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  dragging.li.classList.remove("dragging");
  dragging = null;
}

function startEdit(li, state, titleEl) {
  const current = state.title;
  titleEl.classList.add("editing");
  const inputEl = document.createElement("input");
  inputEl.value = current;
  titleEl.replaceChildren(inputEl);
  inputEl.focus();
  inputEl.select();

  async function commit() {
    const value = inputEl.value.trim();
    titleEl.classList.remove("editing");
    if (!value || value === current) {
      titleEl.textContent = current;
      return;
    }
    try {
      const task = await api(`/api/tasks/${state.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: value, notes: state.notes }),
      });
      state.title = task.title;
      titleEl.textContent = task.title;
      setStatus("Task updated");
    } catch (err) {
      titleEl.textContent = current;
      setStatus(err.message, true);
    }
  }

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      titleEl.classList.remove("editing");
      titleEl.textContent = current;
    }
  });
  inputEl.addEventListener("blur", commit);
}

async function render() {
  const tasks = await api("/api/tasks");
  list.replaceChildren();
  const visible = applyView(tasks, { query: currentQuery, status: currentStatus, due: currentDue, today: todayIso() });
  empty.hidden = true;
  noFilterMatch.hidden = true;
  if (tasks.length === 0) {
    empty.hidden = false;
    selectedIndex = null;
    syncSelectionUI();
    return;
  }
  if (visible.length === 0) {
    noFilterMatch.hidden = false;
    selectedIndex = null;
    syncSelectionUI();
    return;
  }
  for (const [i, task] of visible.entries()) list.append(makeTaskElement(task, i, visible.length));
  selectedIndex = selectionForRender(selectedIndex, visible.length);
  syncSelectionUI();
}

function syncSelectionUI() {
  for (const child of list.children) {
    child.classList.remove("selected");
    child.removeAttribute("tabindex");
  }
  const item = list.children[selectedIndex];
  if (item) {
    item.classList.add("selected");
    item.setAttribute("tabindex", "0");
  }
}

function renderNow() {
  render().catch((err) => setStatus(err.message, true));
}

const renderDebounced = createDebouncer(renderNow, { delay: 300 });

function moveSelection(action) {
  const count = list.childElementCount;
  if (count === 0) return;
  selectedIndex = nextSelection(action, selectedIndex, count);
  syncSelectionUI();
  const item = list.children[selectedIndex];
  if (item) item.focus();
}

list.addEventListener("keydown", (e) => {
  if (e.target.closest && (e.target.closest("input, textarea, button"))) return;
  const action = shortcutAction(e.key);
  if (action === ACTION_MOVE_UP || action === ACTION_MOVE_DOWN) {
    e.preventDefault();
    moveSelection(action);
    return;
  }
  if (action === ACTION_TOGGLE_DONE) {
    const item = list.children[selectedIndex];
    if (!item) return;
    e.preventDefault();
    const box = item.querySelector(".done-box");
    if (box) box.click();
  }
});

async function addTask(title) {
  renderDebounced.cancel();
  const task = await api("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (viewIsFiltered({ query: currentQuery, status: currentStatus, due: currentDue })) {
    await render();
    setStatus("Task added");
    return;
  }
  const prevCount = list.childElementCount;
  empty.hidden = true;
  list.append(makeTaskElement(task, prevCount, prevCount + 1));
  selectedIndex = selectionForRender(selectedIndex, list.childElementCount);
  syncSelectionUI();
  setStatus("Task added");
}

async function removeTask(id) {
  renderDebounced.cancel();
  try {
    await api(`/api/tasks/${id}`, { method: "DELETE" });
    const el = list.querySelector(`[data-id="${id}"]`);
    if (el) el.remove();
    if (list.childElementCount === 0) empty.hidden = false;
    selectedIndex = selectionForRender(selectedIndex, list.childElementCount);
    syncSelectionUI();
    setStatus("Task deleted");
  } catch (err) {
    setStatus(err.message, true);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  input.disabled = true;
  try {
    await addTask(title);
    input.value = "";
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    input.disabled = false;
    input.focus();
  }
});

searchInput.addEventListener("input", () => {
  const wasEmpty = currentQuery.trim() === "";
  currentQuery = searchInput.value;
  if (currentQuery.trim() === "") {
    if (!wasEmpty && !renderDebounced.flush()) renderNow();
  } else {
    renderDebounced.schedule();
  }
});

const statusSelect = document.getElementById("status-select");
const dueSelect = document.getElementById("due-select");

statusSelect.addEventListener("change", () => {
  currentStatus = statusSelect.value;
  render().catch((err) => setStatus(err.message, true));
});

dueSelect.addEventListener("change", () => {
  currentDue = dueSelect.value;
  render().catch((err) => setStatus(err.message, true));
});

const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");

exportBtn.addEventListener("click", async () => {
  try {
    const data = await api("/api/export");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `loot-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setStatus("Exported");
  } catch (err) {
    setStatus(err.message, true);
  }
});

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  importFile.value = "";
  if (!file) return;
  renderDebounced.cancel();
  try {
    const result = await api("/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await file.text(),
    });
    await render();
    setStatus(`Imported ${result.count} task${result.count === 1 ? "" : "s"}`);
  } catch (err) {
    setStatus(err.message, true);
  }
});

render().catch((err) => setStatus(err.message, true));