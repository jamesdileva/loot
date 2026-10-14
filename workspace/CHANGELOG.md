# Changelog

## Unreleased (v1.19)

### Added

- Full DOM coverage for the drag-reorder branch (`app.js` `onPointerDown` /
  `onPointerMove` / `onPointerUp` / `onPointerCancel`): `test/app.dom.test.js`
  now drives a real pointer sequence — jitter below the 5px threshold does not
  start a drag, movement past the threshold marks the row `dragging`,
  `document.elementFromPoint` + `getBoundingClientRect` fakes insert the dragged
  row before the hovered one, and `pointerup` persists the new index over
  `PUT /api/tasks/:id/order` and re-renders. Companion tests pin that a bare
  tap never persists, pointerdown on a button is ignored (`dragIgnoredTarget`),
  and a `pointercancel` fully detaches the drag listeners instead of leaving
  them attached to the row.
- The fake DOM (`test/dom.js`) now mirrors real `insertBefore` semantics (an
  existing child is moved, not silently skipped) and exposes `listenerCount()`
  so the drag tests can assert listener-cleanup directly.
- `test/app.dom.test.js` dispatches `change` with a bogus `status-select` /
  `due-select` value and asserts the app normalizes to the `all` view without
  crashing or shifting rows, then that valid filters still work afterwards —
  exercising the `normalizeStatus`/`normalizeDue` source wiring in the UI.

### Fixed

- `onPointerCancel` in `public/app.js` now removes the `pointermove`,
  `pointerup`, and `pointercancel` listeners when a drag is cancelled,
  mirroring the `pointerup` cleanup. Previously a cancelled drag left all three
  listeners attached to the row for its lifetime (after `render()` rebuilds the
  list the whole subtree is discarded, so the leak was bounded, but the row
  kept dead-notifying handlers in the meantime).

## Unreleased (v1.18)

### Added

- Macro-branch DOM coverage: `test/app.dom.test.js` now drives the move-up/down
  buttons end to end (the reorder path was previously API-tested but had zero
  UI-wiring coverage) — a real test clicks the buttons, asserts the DOM row
  order flips, verifies the new order is persisted through the store, and
  checks the first-row-up / last-row-down buttons clamp as disabled. The fake
  store gained a `move(id, toIndex)` and the fake fetch handles the
  `PUT /api/tasks/:id/order` route.

### Changed

- Status/due `<select>` values are normalized at the source: `app.js` now
  feeds `normalizeStatus(statusSelect.value)` / `normalizeDue(dueSelect.value)`
  into the change handlers instead of raw select values. The canonical clamp
  logic moved into pure `normalizeStatus(value)` / `normalizeDue(value)` in
  `public/filter.js` (exported, reused by `applyView` and `viewIsFiltered`), so
  `currentStatus`/`currentDue` never hold an off-menu value and the view state
  matches what the dropdowns can produce. 4 new unit tests + 1 DOM test,
  183/183 green.

## Unreleased (v1.17)

### Fixed

- Pinned the concurrent-render race with a monotonic `renderSeq` guard: when a
  newer `render()` supersedes an older one still awaiting its fetch, the older
  call now discards its commit instead of wiping the newer rows. Previously an
  older render resolving after a newer one would clear the list (clear-after-
  fetch traded the v1.16 duplicate bug for an oldest-wins stale clobber).
- Status/due `<select>` changes now `cancel()` any pending debounced search
  render before running, closing a narrow overlap window where a stale debounce
  could land after the filter render. Two DOM regression tests pin both paths.

## Unreleased (v1.16)

### Fixed

- `render()` no longer clears the task list before awaiting `GET /api/tasks`.
  Overlapping `render()` calls (e.g. loading the page while a status/due change
  lands, two quick filter changes, or a full render racing a debounced one)
  previously accumulated rows — each call cleared first, then appended its own
  copy, so the list could show duplicates. Clearing after the fetch keeps every
  render a full replace, so concurrent renders converge instead of stacking.

### Added

- Minimal DOM harness (`test/dom.js`) + loader hook (`test/loader-hooks.js`):
  a zero-dep fake DOM (`getElementById`, `createElement`, classList, attribute
  handling, event dispatch) plus an absolute-specifier resolver so the real
  `public/app.js` can be imported in-process and driven headlessly.
  `test/app.dom.test.js` wires fake `fetch`/store and exercises the full app:
  boot render + first-row pre-selection, empty state, optimistic-append add,
  debounced search narrowing, filtered-append (query / status=done / due=overdue
  full render paths), the no-filter-match placeholder, and selection
  re-clamping — the addTask/filter wiring previously only unit-tested in
  pieces, and the render race above, end-to-end. 8 new tests, 178/178 green.

## Unreleased (v1.15)

### Fixed

- addTask filtered-append mismatch (D#988, from D#249): adding a task while a
  text query / status / due filter is active no longer appends the raw row —
  which could fail the current view (a non-matching title still shown until the
  next render), leave the appended row with both move buttons actionable
  (index/count were `undefined`), sit at the wrong position under the
  due-sorted `DUE_DATED` view, or bypass the no-filter-match empty state.
  `public/filter.js` adds pure `viewIsFiltered(view)` (any active
  query/status/due filter?); `addTask` now branches — any active filter →
  cancel the pending debounced render and run the single full-`render()` path
  (correct sort/filter/no-match state, selection re-clamped by
  `selectionForRender`); no active filter → optimistic append with real
  index/count so the move buttons clamp. Tests in `test/filter.test.js` cover
  `viewIsFiltered` and pin the reasoning the branch depends on: a freshly added
  task is invisible under done/overdue/dated/query views, so those paths must
  render, not append.

- The search box no longer re-renders when a query that is already empty grows
  whitespace (typing a Space), per the REVIEW #250 nit: only the non-empty→empty
  transition prompts an immediate flush-or-render; other empty→empty input is
  a no-op. The debounced-typing behavior from v1.14 is unchanged.

## Unreleased (v1.14)

### Features

- Debounced live search (D#970, endorsed D#975): the search box no longer fires
  a full render round-trip (fetch `/api/tasks` + DOM rebuild) on every
  keystroke. `public/debounce.js` adds a pure, zero-dep
  `createDebouncer(fn, {delay, setTimeout, clearTimeout})` with
  `schedule`/`flush`/`cancel`; `app.js` uses a 300ms debounce on the existing
  search-input `input` handler. Clearing the search box flushes promptly so no
  old result lingers, and add / delete / import cancel any pending debounced
  render so the list never re-renders with stale state. Timer functions are
  injected, so the 10 new tests in `test/debounce.test.js` drive a fake clock
  deterministically (no real waits, no flake) — the debouncer contract that the
  DOM wiring depends on (rapid schedules collapse, flush runs now, cancel
  drops) is what those tests pin down.

## Unreleased (v1.13)

### Removed

- Dead `public/nav.js` → `normalizeSelection` export dropped (D#933 aftermath):
  it was production-dead after the v1.11 render refactor and its contract
  (out-of-range resets to `null`) contradicted the shipped
  `selectionForRender` out-of-range pre-select policy, making it a trap for
  future callers. Selection clamping now lives solely in `selectionForRender`;
  the four `normalizeSelection` tests were deleted and README module table
  updated.

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
