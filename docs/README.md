# Loot Documentation

Loot is a local-first task list with markdown notes (v1 scoped). Everything runs
on your machine: no accounts, no external APIs, no runtime network calls. The
only runtime dependency is Node.js.

## Contents

- [Getting started](#getting-started)
- [Architecture](#architecture)
- [HTTP API](#http-api)
- [Data storage](#data-storage)
- [Running tests](#running-tests)
- [Roadmap](#roadmap)

## Getting started

```sh
npm start
```

Serves the app at http://127.0.0.1:3000. No installs beyond Node.js itself.

Configuration is via environment variables:

| Variable      | Default                  | Purpose                          |
|---------------|--------------------------|----------------------------------|
| `PORT`        | `3000`                   | HTTP listen port                 |
| `DATA_FILE`   | `data/data.json`         | Path to the JSON data file       |

## Architecture

| Path                    | Role                                                        |
|-------------------------|-------------------------------------------------------------|
| `server.js`             | HTTP server: static files, API routing, JSON handling       |
| `store.js`              | JSON file store with atomic temp+rename writes              |
| `public/markdown.js`    | Zero-dep markdown renderer that HTML-escapes all output     |
| `public/drag.js`        | Pure drag math: 5px start threshold, `shouldStartDrag(dx, dy)` |
| `public/`               | Static front-end assets                                     |
| `test/`                 | Node test-runner tests                                      |
| `docs/`                 | This documentation                                          |

The server routes `/api/*` to the task API and everything else to static files
served from `public/`. Files outside `public/` are refused (`403`).

## HTTP API

Base path: `/api/tasks`

| Method   | Path             | Body          | Success          | Errors                          |
|----------|------------------|---------------|------------------|---------------------------------|
| `GET`    | `/api/tasks`     | —              | `200` list       | —                               |
| `POST`   | `/api/tasks`     | `{"title":…, "notes":…, "due": "YYYY-MM-DD"}` | `201` task | `400` invalid JSON / missing title |
| `GET`    | `/api/tasks/:id` | —              | `200` task       | `404` not found                 |
| `PUT`    | `/api/tasks/:id` | `{"title":…, "notes":…, "done": bool, "due": "YYYY-MM-DD"\|null}` | `200` task | `400`, `404`            |
| `DELETE` | `/api/tasks/:id` | —              | `200` removed    | `404`                           |

Unsupported methods return `405`; unknown API routes return `404`. A task is
`{"id": number, "title": string, "notes": string, "done": boolean, "due": string|null}`. `notes`
holds raw markdown and defaults to `""`; the UI renders it through a
hand-rolled, sanitizing markdown-to-HTML converter (no dependencies). `done`
defaults to `false` on create; `PUT` accepts an optional boolean `done` and
preserves it when omitted. `due` is an optional `YYYY-MM-DD` date string,
defaulting to `null` on create; `POST` silently stores `null` for an invalid
`due`; `PUT` accepts an optional `due` (set, or `null` / `""` to clear),
preserves the stored value when omitted, and rejects a value that is not a
valid calendar date with `400`. Tasks stored without `done`/`due` (from
older versions) are served normalized to `false`/`null`.

## Data storage

Tasks persist to `DATA_FILE` (default `data/data.json`). The data directory is
gitignored because it holds the user's live data.

Writes are atomic: data is written to `<file>.tmp` then renamed over the real
file. On startup any leftover `*.tmp` files from an interrupted write are
cleaned up. A missing data file reads as the default empty state
(`{ "tasks": [] }`), and the parent directory is created on first write.

## Running tests

```sh
npm test
```

Runs the `node --test` suite covering the store, the HTTP API (including
error paths), and the static-file smoke path. All offline, no network.

## Manual verification

The pointer drag-and-drop wiring (`onPointerMove` / `elementFromPoint`) is not
covered by the automated suite; the drag math is unit-tested and the DOM
wiring is verified by hand once per release (D#590, closed as manual):

1. `npm start` and open http://127.0.0.1:3000.
2. Add at least three tasks, then press one and drag it past the 5px start
   threshold over another task and release — the card should move to that spot.
3. Reload the page — the new order must persist.
4. Tap a card without moving beyond the threshold — no drag should start.

## Roadmap

Scoped v1 todos and known deferred items:

- [x] Task list UI
- [x] Task done flag: checkbox + strikethrough (D#323)
- [x] Markdown notes field + sanitized render (D#168)
- [x] Task reorder: up/down buttons, array-order persistence, `PUT /api/tasks/:id/order` (D#366)
- [x] Task due dates: optional `YYYY-MM-DD` per task, overdue highlight in the UI (D#385)
- [x] Drag-and-drop reorder via pointer events with a 5px start threshold and coarse-pointer jitter guard (D#412)
- [x] Browser drag-reorder E2E closed as manual verification (D#590)
- [x] Per-store write mutex serializes concurrent writers (mutate and write)
- [x] Cap `readBody` size (1 MiB, `413` on overflow)
- [x] Prefix-exact static file check (`root + sep`)
- [x] Prefix-exact cleanup for leftover temp files
- [x] Map `EACCES` to `404`-style errors