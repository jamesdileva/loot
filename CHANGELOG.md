# Changelog

## Unreleased (v1.12)

### Fixed

- Selection-anchor sync (#21): `addTask` and `removeTask` now re-clamp
  `selectedIndex` through `selectionForRender` and call `syncSelectionUI`, so
  adding the first task into an empty list carries the `tabindex` anchor on the
  new row and deleting the selected row never leaves a stale index (highlight
  no longer silently vanishes after the delete; the next arrow works
  immediately). `render()`'s empty/no-filter-match branches now also call
  `syncSelectionUI`, so "selection state mirrors the list after every
  mutation" holds unconditionally.

## Unreleased (v1.11)

### Features

- Render-module refactor (#19): the render selection policy and per-row
  display model move into pure functions in `public/render.js`
  (`selectionForRender` / `rowModel`), covered by `node:test` without a browser
  or jsdom. `app.js` keeps the DOM mechanics (row building, focus, `.selected`
  class), now driven by that model.

- Load-window focus entry (#20): the first row is pre-selected on load and
  carries the list's single `tabindex` anchor, so keyboard navigation works as
  soon as the list is reached by Tab — no longer requiring a first arrow/click.
  This deliberately resolves the v1.10 tradeoff (list out of tab order until
  the first arrow) without re-introducing a stray-Enter hazard: the
  pre-selected row is highlighted but not focused on load, and Enter inside the
  add form still adds a task. The currently selected row is the sole `tabindex`
  anchor; it moves with arrow navigation.

## Unreleased (v1.10)

### Fixed

- Keyboard-navigation selection is no longer pre-set to the first task on
  render, so a stray Enter right after load can no longer toggle task #1
  unprompted. Selection starts (and is visibly highlighted with a `.selected`
  outline) only after the first arrow key. A new pure helper
  `public/nav.js` → `normalizeSelection` anchors/drops the selection across
  re-renders; the `nextSelection` / `shortcutAction` contract is unchanged. As
  a tradeoff, tasks carry no `tabindex` on load, so the list is out of tab
  order until the first arrow or click.

### Known gaps

- The DOM wiring of the keyboard nav (focus move, `.selected` class, Enter
  clicking the right done-box) is still exercised only by manual verification,
  not an automated browser/jsdom test. Extracting that wiring into pure
  functions is planned as part of the app.js render-module refactor. The
  pure-selection half shipped in v1.11 (→ `public/render.js` → `selectionForRender`).

## Unreleased (v1.9)

### Features

- Keyboard navigation: arrow Up/Down move the selection across the task list
  and Enter toggles the selected task's done flag, from a pure client module
  (`public/nav.js` → `nextSelection` / `shortcutAction`). The handler is
  scoped to the task list and ignores key presses while editing or clicking
  buttons/inputs, so typing and form shortcuts are unaffected.

## Unreleased (v1.8)

### Test infrastructure

- cwd-independent boot (#208): every test file that boots the server resolves
  `server.js` via `import.meta.url` (never the process cwd) and spawns it with
  `process.execPath`. The suite now runs green (130/130) from the repo cwd *and*
  from an arbitrary foreign cwd, eliminating the `FAIL(0.0s)` decoherence where
  a mis-configured cwd silently launched zero tests.

## Unreleased (v1.7)

### Test infrastructure

- `tests>0` guard (#208): `npm test` now runs through `test/verify.js`, which
  discovers the suite by absolute path, executes it via the `node:test` runner,
  and **fails with an explicit message if 0 tests execute**. A silently broken
  test command (wrong cwd, lost `node`/`npm` on PATH) can no longer pass as a
  green run.

## Unreleased (v1.6)

### Features

- E2E smoke slice (#189): the smoke test boots the real server on an ephemeral
  port, asserts GET / returns 200, round-trips a task over `/api/tasks`, and
  confirms storage isolation — writes land in `DATA_FILE`, never in the
  default workspace `data/data.json`.

## Unreleased (v1.4)

### Features

- Syntax guard (#176): the test suite now runs `node --check` over every JS
  file in the repo and fails fast on any syntax error.

### Fixed

- `store.write`/`store.mutate` refuse to persist a corrupt store (a root that
  is not a plain JSON object) with a clear error instead of silently
  overwriting a previously good store file.

### Features

- Status filter (All/Open/Done) and due views (Overdue / Has due date, sorted
  soonest-first) added to the toolbar, from a pure client module
  (`public/filter.js` → `applyView` / `isOverdue`). Text, status, and due
  filters AND together in a single filter; `isOverdue(task, today)` takes the
  reference day as an injected argument so it is deterministic and unit-testable.

## Unreleased (v1.3)

### Features

- JSON export/import (D#600): `GET /api/export` returns the store in persisted
  order; `POST /api/import` replaces it, writing an atomic `.pre-import` backup
  first. Strict validation via a pure module (`transfer.js` → `exportStore` /
  `parseImport`) rejects malformed input with `400` and refuses to overwrite a
  corrupt store with `409`. Export/Import buttons added to the UI.

### Fixed

- `store.read()` no longer returns the shared default `<initial>` object on a
  missing file: `mutate` was mutating it in place, so a later missing-file read
  (e.g. importing into a fresh store) could surface stale tasks. The default
  is now a fresh copy per read.

## Unreleased (v1.2)

### Features

- Search/filter: live task filtering by title and notes from a pure module
  (`public/search.js` → `filterTasks`). Empty query keeps the full list intact.

## Unreleased (v1.1)

### Fixed

- `PUT` with an invalid `due` value now returns `400` instead of silently
  keeping the previously stored date (v1.1 debt #141). `PUT` still normalizes
  `due: null`/`""` to no date and preserves the stored date when `due` is
  omitted.

### Debts closed

- Browser-level drag-reorder E2E closed as manual verification (D#590, option
  A): the drag math is covered by pure unit tests; the remaining DOM wiring
  (`onPointerMove` / `elementFromPoint`) is verified by hand. See
  `docs/README.md` → Manual verification. No new dependency added.

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
