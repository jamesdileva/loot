import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
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

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return null;
  return JSON.parse(raw);
}

async function nextId(data) {
  return data.tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
}

async function handleApi(req, res, url) {
  const match = url.pathname.match(/^\/api\/tasks(?:\/(\d+))?$/);
  if (!match) return false;

  const [, idRaw] = match;
  const id = idRaw ? Number(idRaw) : null;

  if (url.pathname === "/api/tasks") {
    if (req.method === "GET") {
      const data = await store.read();
      return json(res, 200, data.tasks);
    }
    if (req.method === "POST") {
      let body;
      try {
        body = await readBody(req);
      } catch {
        return json(res, 400, { error: "invalid JSON" });
      }
      if (!body || typeof body.title !== "string" || !body.title.trim()) {
        return json(res, 400, { error: "title required" });
      }
      const data = await store.read();
      const task = { id: await nextId(data), title: body.title.trim() };
      data.tasks.push(task);
      await store.write(data);
      return json(res, 201, task);
    }
    return json(res, 405, { error: "method not allowed" });
  }

  if (id && Number.isInteger(id)) {
    const data = await store.read();
    const idx = data.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return json(res, 404, { error: "task not found" });

    if (req.method === "GET") return json(res, 200, data.tasks[idx]);
    if (req.method === "PUT") {
      let body;
      try {
        body = await readBody(req);
      } catch {
        return json(res, 400, { error: "invalid JSON" });
      }
      if (!body || typeof body.title !== "string" || !body.title.trim()) {
        return json(res, 400, { error: "title required" });
      }
      data.tasks[idx] = { id, title: body.title.trim() };
      await store.write(data);
      return json(res, 200, data.tasks[idx]);
    }
    if (req.method === "DELETE") {
      const [removed] = data.tasks.splice(idx, 1);
      await store.write(data);
      return json(res, 200, removed);
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
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": types[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch (err) {
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
