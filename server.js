import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "./store.js";

const root = fileURLToPath(new URL("./public", import.meta.url));
const port = Number(process.env.PORT || 3000);
const dataFile = process.env.DATA_FILE || join(root, "..", "data", "data.json");

const store = createStore({ file: dataFile, initial: { tasks: [] } });

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  return res.end(JSON.stringify(body));
}

const MAX_BODY_BYTES = 1024 * 1024;

class BodyTooLarge extends Error {}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLarge();
  }
  if (size === 0) return null;
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

function validDue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === value ? value : null;
}

function normalizeTask(t) {
  return {
    id: t.id,
    title: t.title,
    notes: typeof t.notes === "string" ? t.notes : "",
    done: typeof t.done === "boolean" ? t.done : false,
    due: validDue(t.due),
  };
}

async function nextId(data) {
  return data.tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
}

async function addTask(store, title, notes, due) {
  return store.mutate(async (data) => {
    const task = { id: await nextId(data), title, notes, done: false, due: validDue(due) };
    data.tasks.push(task);
    return task;
  });
}

async function handleApi(req, res, url) {
  const match = url.pathname.match(/^\/api\/tasks(?:\/(\d+))?(?:\/(order))?$/);
  if (!match) return false;

  const [, idRaw, sub] = match;
  const id = idRaw ? Number(idRaw) : null;

  if (url.pathname === "/api/tasks") {
    if (req.method === "GET") {
      const data = await store.read();
      return json(res, 200, data.tasks.map(normalizeTask));
    }
    if (req.method === "POST") {
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        if (err instanceof BodyTooLarge) return json(res, 413, { error: "body too large" });
        return json(res, 400, { error: "invalid JSON" });
      }
      if (!body || typeof body.title !== "string" || !body.title.trim()) {
        return json(res, 400, { error: "title required" });
      }
      const task = await addTask(store, body.title.trim(), typeof body.notes === "string" ? body.notes : "", body.due);
      return json(res, 201, task);
    }
    return json(res, 405, { error: "method not allowed" });
  }

  if (id && Number.isInteger(id)) {
    if (sub === "order") {
      if (req.method !== "PUT") return json(res, 405, { error: "method not allowed" });
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        if (err instanceof BodyTooLarge) return json(res, 413, { error: "body too large" });
        return json(res, 400, { error: "invalid JSON" });
      }
      const toIndex = body && body.toIndex;
      if (!Number.isInteger(toIndex)) {
        return json(res, 400, { error: "toIndex must be an integer" });
      }
      const moved = await store.mutate(async (data) => {
        const idx = data.tasks.findIndex((t) => t.id === id);
        if (idx === -1) return null;
        const [task] = data.tasks.splice(idx, 1);
        const at = Math.max(0, Math.min(toIndex, data.tasks.length));
        data.tasks.splice(at, 0, task);
        return { id, toIndex: at };
      });
      if (!moved) return json(res, 404, { error: "task not found" });
      return json(res, 200, moved);
    }
    if (req.method === "GET") {
      const data = await store.read();
      const task = data.tasks.find((t) => t.id === id);
      if (!task) return json(res, 404, { error: "task not found" });
      return json(res, 200, normalizeTask(task));
    }
    if (req.method === "PUT") {
      let body;
      try {
        body = await readBody(req);
      } catch (err) {
        if (err instanceof BodyTooLarge) return json(res, 413, { error: "body too large" });
        return json(res, 400, { error: "invalid JSON" });
      }
      if (!body || typeof body.title !== "string" || !body.title.trim()) {
        return json(res, 400, { error: "title required" });
      }
      const title = body.title.trim();
      const task = await store.mutate(async (data) => {
        const idx = data.tasks.findIndex((t) => t.id === id);
        if (idx === -1) return null;
        const prev = data.tasks[idx];
        const notes = typeof body.notes === "string" ? body.notes : (prev.notes ?? "");
        const done = typeof body.done === "boolean" ? body.done : (prev.done ?? false);
        const due = body.due === undefined
          ? (prev.due ?? null)
          : (body.due === null || body.due === "" ? null : (validDue(body.due) ?? (prev.due ?? null)));
        data.tasks[idx] = { id, title, notes, done, due };
        return data.tasks[idx];
      });
      if (!task) return json(res, 404, { error: "task not found" });
      return json(res, 200, task);
    }
    if (req.method === "DELETE") {
      const removed = await store.mutate(async (data) => {
        const idx = data.tasks.findIndex((t) => t.id === id);
        if (idx === -1) return null;
        const [task] = data.tasks.splice(idx, 1);
        return task;
      });
      if (!removed) return json(res, 404, { error: "task not found" });
      return json(res, 200, normalizeTask(removed));
    }
    return json(res, 405, { error: "method not allowed" });
  }

  return false;
}

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const url = new URL(req.url, "http://localhost");

    if (urlPath === "/api" || urlPath.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "POST" && req.method !== "PUT" && req.method !== "DELETE") {
        return json(res, 405, { error: "method not allowed" });
      }
      const handled = await handleApi(req, res, url);
      if (!handled) return json(res, 404, { error: "not found" });
      return;
    }

    const rel = urlPath === "/" ? "/index.html" : urlPath;
    const filePath = normalize(join(root, rel));
    if (!filePath.startsWith(root + sep)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": types[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch (err) {
    if (err && err.code === "EACCES") {
      if (!res.headersSent) return json(res, 404, { error: "not accessible" });
      return res.end();
    }
    if (!res.headersSent) {
      res.writeHead(404);
      res.end("Not found");
    } else {
      res.end();
    }
  }
});

if (process.send) {
  server.listen(port, "127.0.0.1", () => process.send({ ready: true, port }));
} else {
  server.listen(port, "127.0.0.1", () => {
    console.log(`Loot running at http://127.0.0.1:${port}`);
  });
}

export { server };
