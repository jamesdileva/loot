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
| `public/search.js`      | Pure filter: `filterTasks(tasks, query)` over title+notes  |
| `public/filter.js`      | Pure view: `isOverdue(task, today)` and `applyView(tasks, {query, status, due, today})` combining text + status + due with AND semantics |
| `public/nav.js`         | Pure keyboard nav: `nextSelection(move, index, count)`, `normalizeSelection`, `shortcutAction(key)` |
| `public/render.js`      | Pure render policy: `selectionForRender(prev, count)` (pre-selects first row on load) and `rowModel(task, index, count, today)` |
| `transfer.js`           | Pure export/import: `exportStore(data)`, `parseImport(value)` |
| `public/`               | Static front-end assets                                     |
| `test/`                 | Node test-runner tests                                      |
| `docs/`                 | This documentation                                          |

The server routes `/api/*` to the task API and everything else to static files
served from `public/`. Files outside `public/` are refused (`403`).

## Status and due views

The toolbar under the search box filters the list purely on the client:

- **Status** — All / Open (not done) / Done.
- **Due** — Any date / Overdue / Has due date. The "Has due date" view sorts
  tasks soonest-first by `due`.

The views combine with the text search and with each other: a task must match
the text query AND the status bucket AND the due flag. `public/filter.js`
provides the pure logic — `isOverdue(task, today)` takes `today` as an injected
`YYYY-MM-DD` argument so behavior is deterministic (a task is overdue when it
has a due date, is not done, and the due date is strictly before `today`), and
`applyView(tasks, {query, status, due, today})` implements the combined filter
without mutating the input. The text-search match mirrors `search.js`
(`title`+`notes`, case-insensitive).

## HTTP API

Base path: `/api/tasks`

| Method   | Path             | Body          | Success          | Errors                          |
|----------|------------------|---------------|------------------|---------------------------------|
| `GET`    | `/api/tasks`     | —              | `200` list       | —                               |
| `POST`   | `/api/tasks`     | `{"title":…, "notes":…, "due": "YYYY-MM-DD"}` | `201` task | `400` invalid JSON / missing title |
| `GET`    | `/api/tasks/:id` | —              | `200` task       | `404` not found                 |
| `PUT`    | `/api/tasks/:id` | `{"title":…, "notes":…, "done": bool, "due": "YYYY-MM-DD"\|null}` | `200` task | `400`, `404`            |
| `DELETE` | `/api/tasks/:id` | —              | `200` removed    | `404`                           |
| `GET`    | `/api/export`    | —              | `200` store JSON | `409` corrupt store             |
| `POST`   | `/api/import`    | store JSON     | `200` `{"count": n}` | `400` malformed, `409` corrupt store, `413` too large |

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

`test/verify.js` discovers the suite by absolute path and runs it through the
`node:test` runner; if 0 tests execute it fails with an explicit message (`#208`).
Boot tests resolve `server.js` via `import.meta.url`, so `npm test` passes from
any working directory — it is not cwd-sensitive.

## Export and import

`GET /api/export` returns the whole store as `{"tasks": [...]}` in **persisted
on-disk save order** (the same array order used by reorder; not a sorted view).
A re-import of a fresh export restores the identical store.

`POST /api/import` replaces the store wholesale, and a backup of the prior
store is written atomically to `DATA_FILE.pre-import` first. Importing an empty
store (`{"tasks": []}`) is accepted and legitimately wipes the list (count `0`);
the `.pre-import` backup written beforehand keeps the previous data
recoverable. Input is validated
strictly by `transfer.js` before anything is written: the body must be an
object with a `tasks` array, each task needs a positive integer `id` and a
non-empty `title` string, `notes`/`done`/`due` must be the right types when
present (defaulting when absent), `due` must be a valid calendar date, and ids
must be unique. Malformed input is rejected with `400` and never touches the
store. If the current on-disk store is corrupt, import refuses with `409`
instead of clobbering it; a missing (fresh) store is overwritten freely.

The UI exposes Export (downloads `loot-backup-YYYY-MM-DD.json`) and Import
(file picker) buttons; Import re-renders from the server after a successful
replacement.

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
- [x] Search/filter: live task filtering by title and notes from a pure module (D#600)
- [x] JSON export/import (D#600): strict validation, atomic `.pre-import` backup, UI buttons
- [x] Status filter (All/Open/Done) + due view (Overdue / Has due date sorted
  soonest-first) from a pure client module (D#648)
- [x] Syntax guard (#176): `node --check` over all repo JS, fail fast
- [x] E2E smoke slice (#189): boot server on ephemeral port, assert 200, verify
  storage isolation
- [x] `tests>0` guard (#208): `npm test` runs through `test/verify.js` and fails
  loudly if 0 tests execute
- [x] cwd-independent boot (#208): boot tests resolve `server.js` via
  `import.meta.url`, so the suite is green from any cwd