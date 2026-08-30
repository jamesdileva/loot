# Changelog

## Unreleased (v1.1)

### Fixed

- `PUT` with an invalid `due` value now returns `400` instead of silently
  keeping the previously stored date (v1.1 debt #141). `PUT` still normalizes
  `due: null`/`""` to no date and preserves the stored date when `due` is
  omitted.

## v1.0.0 (2026-08-29)

Local-first task list with markdown notes. Runs entirely on the machine of the
user: no accounts, no external APIs, no runtime network calls. The only runtime
dependency is Node.js.

### Features

- Task list UI served at `http://127.0.0.1:3000`
- Create, read, update, delete tasks via a JSON HTTP API
- Task `done` flag: checkbox + strikethrough
- Markdown notes field with a zero-dependency, HTML-escaping renderer
- Task reorder: up/down buttons with array-order persistence
- Task due dates: optional `YYYY-MM-DD` per task, overdue highlight in the UI
- Drag-and-drop reorder via HTML5 pointer events with a 5px start threshold and
  coarse-pointer jitter guard (fallback up/down reorder retained)
- Atomic data writes (temp + rename), per-store write mutex, leftover temp-file
  cleanup, `readBody` size cap (`413`), prefix-exact static-file checks, and
  `EACCES` mapping
- Ephemeral test-port infrastructure (no `EADDRINUSE` flake)

### Known gaps (deferred to v1.1)

- The pointer/DOM drag-reorder wiring (onPointerMove / elementFromPoint) is
  covered only by a pure predicate test, not an E2E/browser test. Recorded as
  v1.1 debt: manual browser drag-reorder E2E plus a keyboard/long-press
  alternative.
- `PUT` with an invalid `due` value is silently ignored rather than surfaced as
  an error; the today-ISO value is left hoisted in the UI. Both deferred to v1.1.
