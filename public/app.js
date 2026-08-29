const list = document.getElementById("task-list");
const empty = document.getElementById("empty");
const form = document.getElementById("add-form");
const input = document.getElementById("title-input");
const statusEl = document.getElementById("status");

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

function makeTaskElement(task) {
  const li = document.createElement("li");
  li.className = "task";
  li.dataset.id = task.id;

  const title = document.createElement("span");
  title.className = "title";
  title.textContent = task.title;

  const editBtn = document.createElement("button");
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => startEdit(li, task.id, title));

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => removeTask(task.id));

  li.append(title, editBtn, deleteBtn);
  return li;
}

function startEdit(li, id, titleEl) {
  const current = titleEl.textContent;
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
      const task = await api(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: value }),
      });
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
  list.replaceChildren();
  const tasks = await api("/api/tasks");
  if (tasks.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (const task of tasks) list.append(makeTaskElement(task));
}

async function addTask(title) {
  const task = await api("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  empty.hidden = true;
  list.append(makeTaskElement(task));
  setStatus("Task added");
}

async function removeTask(id) {
  try {
    await api(`/api/tasks/${id}`, { method: "DELETE" });
    const el = list.querySelector(`[data-id="${id}"]`);
    if (el) el.remove();
    if (list.childElementCount === 0) empty.hidden = false;
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

render().catch((err) => setStatus(err.message, true));
