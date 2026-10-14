# Loot audit

| | |
|---|---|
| **Audited** | October 14, 2026 |
| **Version** | `package.json` 1.0.0, CHANGELOG through v1.19 (unreleased), git HEAD `c8a7b3e` (46 commits). The working tree matches HEAD except for line endings in two files. |
| **Scope** | Everything in the zip: `server.js`, `store.js`, `transfer.js`, `public/*`, `test/*`, `docs/README.md`, `CHANGELOG.md`, git history |
| **Purpose** | Check Loot against a "polish pass" checklist, judge it overall, and keep a to-do list for later |

## 1. Summary

Loot is a local-first task list with markdown notes. It has no npm dependencies, but it does need Node.js: a small Node server keeps tasks in `data/data.json` and serves a static front end made of small ES modules.

The engine is well built. Writes are atomic, concurrent writers are serialized, import is strictly validated, and 201 tests cover the logic. The part you touch is the rough part. Running the real app in a browser turned up three bugs the test suite cannot see, because the tests use a hand-rolled fake DOM that does not apply CSS, pointer capture, or blur-on-removal. It also turned up two security gaps (F4, F5) that no test exercises, and polish gaps on touch, tap sizes, dark mode, and undo.

**Fix these first (each is a few lines):**

1. **F1**: the notes editor is open on every task (CSS `display: flex` beats the `hidden` attribute).
2. **F3**: pressing Escape while editing a title saves it instead of cancelling.
3. **F2**: mouse drag-and-drop reorder does not save in Chromium.
4. **F4** and **F5**: a link-filter bypass that lets a note run script, and a server that accepts writes from any page or Host.

**Not covered:** Firefox, Safari, real touch hardware, and Windows. Please re-check F2 and F3 in the browser you actually use.

## 2. What's solid

- Writes are atomic (temp file plus rename), serialized by a lock, and the store refuses to write a non-object root. Leftover `*.tmp` files are cleaned at startup.
- Request bodies are capped at 1 MiB (413), static serving has a prefix-exact traversal guard, and the server binds to `127.0.0.1` only.
- Import is strict (shape, types, real calendar dates, unique ids), refuses to overwrite a corrupt store (409), and writes a `.pre-import` backup first.
- Logic lives in small pure modules (`filter.js`, `nav.js`, `render.js`, `reorder.js`, `debounce.js`, `drag.js`, `transfer.js`, `markdown.js`) with injectable clocks and timers. That makes the browser-only port in F11 cheap.
- Notes go through an escaping markdown renderer that HTML-escapes text before formatting. F4 is a gap in link handling only.
- 201 tests run offline, with a guard that fails if zero tests execute. Render races found along the way were fixed with regression tests.
- Keyboard navigation works (up/down select, Enter toggles done), the up/down buttons reorder and persist, and export/import round-trips.
- Data lives in a plain JSON file that you can back up by copying.

## 3. How this was audited

- Read all source, the README, the CHANGELOG, and the git history.
- Ran `npm test` on Node v22.22.2 (Linux): 201 tests, 200 pass, 1 fails (see F12).
- Drove the real app in headless Chromium 141 with Playwright, at 1000px wide and at phone size (390px, emulated touch), and looked at the screenshots.
- Probed the HTTP server with curl and Python's `http.client`.
- Applied the candidate fixes below to a scratch copy and re-ran everything (Appendix B).

Labels used in this document:

- **Observed**: reproduced by running the app or server.
- **From reading**: seen in the code, not run.
- **Fix verified**: applied to the scratch copy and re-tested in Chromium or Node.
- **Fix sketch**: a suggested change that was not run.

## 4. Findings at a glance

| ID | Severity | Finding | Evidence | Fix |
|---|---|---|---|---|
| F1 | High | Notes editor is open on every task | Observed | Verified |
| F2 | High | Mouse drag-reorder does not save | Observed | Verified (Chromium) |
| F3 | Medium | Escape saves an edit; Enter saves twice | Observed | Verified |
| F4 | Medium | Markdown link filter bypass runs script on click | Observed | Verified |
| F5 | Low to medium | Server accepts cross-site-style writes and any Host header | Observed (curl) | Verified |
| F6 | Medium | Touch drag-reorder does not work | Observed (emulated touch) | Sketch |
| F7 | Medium | Delete has no undo | Observed | Sketch |
| F8 | Medium | Tap targets too small, phone layout cramped | Observed | Sketch |
| F9 | Low | No dark mode | Observed | Sketch |
| F10 | Low | Nothing focused on load | Observed | Sketch |
| F11 | Strategic | Needs Node, so it cannot run on a phone | Observed, from reading | Sketch |
| F12 | Medium | Tests are blind to browser behavior; 1 Linux-only failure | Observed | Sketch |

Severity key: **High** = a visible feature is broken. **Medium** = wrong or risky behavior with a workaround. **Low** = polish, or a low-likelihood risk.

## 5. Findings in detail

### F1. Notes editor is open on every task

*High. Observed. Fix verified.*

`.notes-editor { display: flex; }` in `public/style.css` overrides the `hidden` attribute that `app.js` sets (`editor.hidden = true`), so the editor (textarea plus Save and Cancel) is always visible. The Notes button flips the attribute, but nothing changes on screen.

**Evidence:** with `hidden` set to `true`, the computed `display` is still `flex`, and the block is 115px tall on every row. On a 390px phone the first row measures 291px and 12 tasks make a 3,209px page, so about three tasks fit per screen. Most of that height is this bug.

**Fix (verified):** after the change, `display` is `none` on load and `flex` after clicking Notes.

```css
.notes-editor[hidden] { display: none; }
```

To prevent the whole class of bug, a global `[hidden] { display: none !important; }` also works (not run). It matters again if you ever hide whole `.task` rows, as in the F7 sketch.

### F2. Mouse drag-reorder does not save

*High. Observed. Fix verified in Chromium.*

`onPointerMove` moves the dragged `<li>` in the DOM (`list.insertBefore`) while that row holds pointer capture (`setPointerCapture` in `onPointerDown`). In Chromium, moving the node drops the capture, so `pointerup` is delivered to a different row. The dragged row's `onPointerUp` never runs, so the drag never completes.

**Evidence:** the event log for a slow drag and for a fast drag was the same: `pointerdown` on the title, `gotpointercapture` on the row, `lostpointercapture` on the row (now in the `dragging` state), then `pointerup` on the row under the cursor, not the dragged one. The server order was unchanged and the dragged row kept its `.dragging` (faded) class. It fails the same way with the notes editor hidden, so it is independent of F1.

The README says the drag wiring is verified by hand once per release (D#590), and the drag tests in `test/app.dom.test.js` pass because the fake DOM's `setPointerCapture` is a no-op and its `dispatch` never bubbles. Worth re-checking in your own browser: add three tasks, drag the last above the first, release, and reload.

**Fix (verified in Chromium):** re-take capture after each move.

```js
// public/app.js, end of onPointerMove()
if (placeBefore) list.insertBefore(li, other);
else list.insertBefore(li, other.nextSibling);
// Moving the node makes the browser drop pointer capture; re-take it so pointerup still reaches this row.
if (li.setPointerCapture) {
  try { li.setPointerCapture(dragging.pointerId); } catch {}
}
```

After this change both a slow and a fast drag saved, no row was left in the `dragging` state, and a second drag worked.

**Alternative (more robust, not run):** attach `pointermove`, `pointerup`, and `pointercancel` to `document` instead of the row, which does not depend on capture at all. It needs `document.addEventListener` and event bubbling in `test/dom.js`, plus updates to the drag tests that assert `listenerCount` on the row. Worth doing if you see this misbehave in Firefox or Safari.

### F3. Escape saves the edit; Enter saves twice

*Medium. Observed. Fix verified.*

In `startEdit`, `commit` is bound to both Enter and `blur`. Replacing the input (on Escape, or after a save) removes the focused element, which fires `blur`, which runs `commit` again.

**Evidence:** typing a new title and pressing Escape saved it to the server (1 PUT). Pressing Enter sent 2 PUT requests.

**Fix (verified):** a `finished` guard. After it, Escape saved nothing (0 PUTs) and Enter sent exactly 1.

```js
// public/app.js, startEdit()
inputEl.select();
let finished = false;                  // new

async function commit() {
  if (finished) return;                // new
  finished = true;                     // new
  const value = inputEl.value.trim();
  // ...rest unchanged...
}

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") commit();
  if (e.key === "Escape") {
    if (finished) return;              // new
    finished = true;                   // new
    titleEl.classList.remove("editing");
    titleEl.textContent = current;
  }
});
inputEl.addEventListener("blur", commit);
```

### F4. Markdown link filter can be bypassed (script runs on click)

*Medium (low likelihood, real impact). Observed. Fix verified.*

`safeHref` in `public/markdown.js` tests the scheme with `/^[a-z][a-z0-9+.-]*:/` on the raw string. Browsers strip tabs, newlines, and leading control characters from a URL before parsing it, so `java<TAB>script:` and `<0x01>javascript:` slip past the check but are still `javascript:` URLs. Percent-encoded parentheses (`%28` and `%29`) get around the `[^)]+` link pattern, so the payload can still call a function. Plain `javascript:` is blocked correctly.

**Evidence:** a note containing `[click me](java<TAB>script:alert%281%29)` renders as a normal `<a href>`, and clicking it in Chromium fired `alert(1)`. The WHATWG `URL` parser reports `javascript:` for both bypass variants.

**Impact:** it needs hostile text to get into a note, for example by importing a file from someone else, or through F5. The script would run on the app's origin and could read or change every task. There is no CSP to contain it.

**Fix (verified):** let the URL parser decide. It normalizes exactly the way browsers do.

```js
// public/markdown.js: replaces ALLOWED_HREF, SCHEME and the old safeHref
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function safeHref(raw) {
  const href = raw.trim().replace(/["'`<>]/g, "");
  if (!href) return "";
  try {
    // Relative links resolve against a dummy https base and pass; javascript:, data:, etc. do not.
    const { protocol } = new URL(href, "https://placeholder.invalid/");
    return SAFE_PROTOCOLS.has(protocol) ? href : "";
  } catch {
    return "";
  }
}
```

After this change the bypass link is dropped, while `https://example.com` and `./x.html` links still render, and the existing markdown tests pass. The CSP header in F5 is a second layer: without `unsafe-inline`, it also blocks `javascript:` navigation.

**Tests to add:** `renderMarkdown("[x](java\tscript:alert%281%29)")` contains no `<a`; links to `https:`, `mailto:`, `#anchor`, `/path`, and `./path` still render.

### F5. Server accepts cross-site-style writes and any Host header

*Low to medium. Observed with curl. Fix verified.*

Body parsing ignores `Content-Type`, so a `POST` with `text/plain` is accepted, and that kind of request needs no CORS preflight. The server never checks `Origin` or `Host`, and it sends no security headers.

**Evidence (curl, not a real foreign web page):**

- `POST /api/tasks` and `POST /api/import` with `Content-Type: text/plain` and `Origin: https://evil.example` returned 201 and 200. The import replaced the whole list, and the previous list landed in `data.json.pre-import`.
- `GET /api/export` with `Host: evil.example` returned 200.
- `PUT` and `DELETE` are only incidentally safe: the `OPTIONS` preflight gets a 405.
- Responses carry no CSP, `nosniff`, or `X-Frame-Options`.

**Impact:** low for a personal localhost tool, but cheap to close, and it combines with F4. Import keeps only one `.pre-import` backup, which the next import overwrites.

**Fix (verified):** a Host check, JSON-only bodies, and two headers.

```js
// server.js
const HOST_OK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

const server = createServer(async (req, res) => {
  res.setHeader("content-security-policy", "default-src 'self'");
  res.setHeader("x-content-type-options", "nosniff");
  if (!HOST_OK.test(req.headers.host || "")) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  try {
    // ...unchanged...
```

```js
// server.js, top of readBody()
const type = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
if (type !== "application/json") throw new Error("content-type must be application/json");
```

After the change, `text/plain` writes returned 400, a foreign Host returned 403, both headers were present, a normal JSON write still returned 201, and the existing suite was unchanged. The app already sends `content-type: application/json` on every request. The existing `catch` blocks in `handleApi` turn the new error into a 400 "invalid JSON"; add a dedicated 415 later if you like. Export's blob download was not exercised under the CSP, so click it once after applying this.

### F6. Touch drag-reorder does not work

*Medium. Observed with emulated touch. Fix sketch.*

The whole row is the drag surface and there is no `touch-action` rule, so on touch the browser claims the gesture for scrolling and cancels the pointer.

**Evidence:** an emulated touch drag from the third row to the first produced one `pointerdown`, one `pointermove`, and one `pointercancel`. The page scrolled (`scrollY` 915) and the order did not change. Dragging the first row down was cancelled too. The up/down buttons are the only way to reorder by touch.

**Fix (sketch, not run):** use a dedicated drag handle and keep the buttons as the accessible fallback. Combine this with the F2 fix.

```html
<span class="handle" aria-hidden="true">⋮⋮</span>
```

```css
.handle { touch-action: none; cursor: grab; padding: 0.5rem; user-select: none; }
.task { cursor: auto; }  /* the row itself no longer drags */
```

Then bind `pointerdown` on the handle instead of on the `<li>`.

### F7. Delete has no undo

*Medium. Observed. Fix sketch.*

Clicking Delete removes the task at once: no confirm dialog, no undo, and the status line just says "Task deleted". The button sits next to Notes with a roughly 27px hit area. The only safety nets are a manual Export and the single `.pre-import` backup after an import.

**Fix (sketch, not run):** optimistic hide plus a delayed delete.

```js
function removeTaskWithUndo(id, li) {
  li.classList.add("removing");                        // .task.removing { display: none }
  const timer = setTimeout(() => api(`/api/tasks/${id}`, { method: "DELETE" }), 6000);
  showUndo("Task deleted", () => { clearTimeout(timer); li.classList.remove("removing"); });
}
```

Notes on the design:

- Use a class rather than `li.hidden`, because `.task` has `display: flex` (see F1).
- `render()` must skip ids with a pending delete, otherwise a filter change brings the row back.
- Closing the tab early leaves the task in place, which is the safe failure.
- Do not undo by re-POSTing: the task would get a new id and lose its position.

### F8. Tap targets too small, phone layout cramped

*Medium. Observed. Fix sketch.*

**Evidence (measured):** checkbox 16x16px, up/down buttons 28x27, Edit 44x27, Delete 60x27, date input 137x27. The usual touch minimum is about 44px. The stylesheet has no `@media` rules, and each row is eight controls in a wrapping flex container. After the F1 fix the rows are shorter, but the controls still wrap onto two or three lines on a phone.

**Fix (sketch, not run):**

```css
@media (pointer: coarse) {
  .task button, .task .due, .add-form button { min-height: 44px; }
  .done-box { width: 1.5rem; height: 1.5rem; }
}
```

Also give the row a clear two-line layout on narrow screens: checkbox, title, and handle on the first line, with Edit, Notes, Delete, and the due date on the second line or in an overflow ("...") menu. If you add swipe-to-delete, do it only together with F7.

### F9. No dark mode

*Low. Observed. Fix sketch.*

With `prefers-color-scheme: dark` emulated, the body background stays `rgb(245, 245, 247)`. The stylesheet uses about ten hard-coded greys and a blue.

**Fix (sketch, not run):** move the colors into variables on `:root`, override them in a dark media query, and set `color-scheme` so form controls follow along.

```css
:root {
  color-scheme: light dark;
  --bg: #f5f5f7; --card: #fff; --text: #1d1d1f; --muted: #6e6e73;
  --border: #d1d1d6; --accent: #0a84ff;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #1c1c1e; --card: #2c2c2e; --text: #f5f5f7; --muted: #98989d; --border: #48484a; }
}
body { color: var(--text); background: var(--bg); }
```

The remaining hard-coded colors (`#e5e5ea`, `#3a3a3c`, `#fbfbfd`, `#f0f0f4`, and the overdue reds `#ffe5e5`, `#fff5f5`, `#d70015`) need variables and dark variants too. Add `<meta name="theme-color">` while you are there.

### F10. Nothing focused on load

*Low. Observed. Fix sketch.*

`document.activeElement` is `BODY` when the page loads. Focus only returns to the add box after a task is added (`input.focus()` in the submit handler).

**Fix (sketch, not run):** add `autofocus` to `#title-input`, or call `input.focus()` once at boot.

On iPhone, focusing outside a tap generally does not raise the keyboard. The submit handler also sets `input.disabled = true` during the request, which likely dismisses the keyboard after every add. Consider `readOnly`, or no disabling at all (from reading, untested).

### F11. Needs Node, so it cannot run on a phone

*Strategic. Observed and from reading. Fix sketch.*

- `package.json` has no dependencies, so there is nothing to `npm install`. But `npm start` runs `node server.js`, and the README is explicit that "the only runtime dependency is Node.js".
- The server binds to `127.0.0.1`, so it is not reachable from a phone or another PC.
- There is no manifest, service worker, icon, or favicon (`/favicon.ico`, `/manifest.webmanifest`, and `/sw.js` all return 404), so it cannot be installed as a web app.
- The backend is a JSON file plus a REST API. The front end is already framework-free ES modules with pure logic modules, so a browser-only version is mostly a swap of the `api()` calls in `app.js`.

**Port sketch (not run):**

1. Add `public/store-local.js` exposing the operations the UI uses today: `list()`, `create({ title, notes, due })`, `update(id, patch)`, `remove(id)`, `move(id, toIndex)`, `exportAll()`, `importAll(data)`. Persist one `{ tasks: [...] }` blob in IndexedDB (localStorage is fine at this size).
2. Reuse `transfer.js` (`exportStore`, `parseImport`) unchanged. It is pure and already validates imports strictly.
3. Replace the `api(...)` calls in `app.js` with the store calls. `filter.js`, `nav.js`, `render.js`, `reorder.js`, `markdown.js`, `debounce.js`, and `drag.js` stay as they are.
4. Keep Export/Import as the backup path, keep one previous snapshot under a second key, and call `navigator.storage.persist()` to reduce the risk of eviction.
5. Add `manifest.webmanifest`, icons, and a small service worker so it works offline and can go on a home screen. Any static host with HTTPS works (for example GitHub Pages). Only the code is hosted; the data stays in the browser.
6. Tests: the pure-module tests carry over, the HTTP API tests become store tests, and `server.js`, `store.js`, and the smoke and API tests can go once you cut over.

**Trade-offs:** there is no cross-device sync, and browser storage can be cleared by the user or the browser, so export regularly. If you port, F5 disappears; F1 to F4 and F6 to F10 still apply, so fix them first and port the fixed UI.

### F12. Tests are blind to browser behavior, and one fails on Linux

*Medium. Observed. Fix sketch.*

**Blind spots.** There are 201 tests and about 3,005 lines of test code against 1,452 lines of app code, and logic coverage is strong. But `test/dom.js` is a fake DOM: it has no CSS, `setPointerCapture` is a no-op, there is no focus or blur-on-removal behavior, no event bubbling, and `elementFromPoint` is a stub. That is why F1, F2, F3, F6, and F8 to F10 all went unnoticed. A handful of real-browser checks (Playwright is enough) or the manual smoke checklist in section 9 would close the gap.

**The failing test.** `test/api.test.js` ("encoded-separator traversal is rejected by the root guard") expects a 403 for the `%5c` (backslash) paths. On Windows a backslash is a path separator, so the request is a traversal attempt and gets 403. On Linux it is an ordinary filename character, so the server correctly returns 404. That is one failure (200 of 201 pass). It is not a security bug, and the suite presumably passes on your Windows machine, but it will fail on Mac, Linux, or CI.

**Fix (sketch, not run):** for the two `%5c` paths, accept 403 or 404 and assert that nothing leaked.

```js
for (const path of attempts) {
  const res = await fetch(`${base()}${path}`);
  const body = await res.text();
  assert.ok([403, 404].includes(res.status), `${path} -> ${res.status}`);
  assert.doesNotMatch(body, /"name":\s*"loot"/, `${path} leaked package.json`);
}
```

## 6. Minor findings

| # | Finding | Evidence | Suggested fix |
|---|---|---|---|
| M1 | Code fences with a language tag render wrong: only a bare fence line is recognized, so the opening line becomes paragraph text and the closing fence starts an empty block that swallows what follows. | Observed | Verified: accept an optional tag on the *opening* fence only (see below) |
| M2 | In the "Has due date" view the list is re-sorted by date, so the up/down buttons look dead there (they change the raw order, then the next render re-sorts). | From reading | Disable reorder controls while that view is active |
| M3 | `nextId` is max id plus one, so deleting the highest id and adding a task reuses it. | From reading | Harmless today; keep a counter if you ever link tasks to each other |
| M4 | Import keeps one `.pre-import` backup that each import overwrites, and the read, backup, and write steps are not under the store lock. | From reading | Keep the last few timestamped backups and do the whole import inside the lock |
| M5 | Title length is limited to 200 characters in the add box only; the edit box and the server enforce no limit beyond the 1 MiB body cap. | From reading | Set `maxlength` on the edit input and validate on the server |
| M6 | Overdue styling is computed at render time, so a list left open past midnight is stale until the next render. | From reading | Re-render on `visibilitychange` or at midnight |
| M7 | Every checkbox is labelled just "Toggle done"; Edit, Notes, and Delete do not name their task; there are no `:focus-visible` styles. | From reading | `aria-label` such as `Mark "Buy milk" done`; add focus styles |
| M8 | Markdown gaps: no blockquotes, nested lists, bare-URL autolinks, or `- [ ]` task lists. | From reading | Optional |
| M9 | Dead code and docs drift: `public/search.js` is not imported by the app (live search uses `applyView` in `filter.js`), `ACTION_DELETE` in `nav.js` is only used by a test, and the README architecture table does not list `reorder.js`. | Observed (grep) | Remove or document |
| M10 | Line endings: `public/app.js` and `test/app.dom.test.js` use CRLF, the rest use LF. Git reports both as modified, with an end-of-line-only diff. | Observed | Add `.gitattributes` with `* text=auto eol=lf` and normalize |
| M11 | A stray `node_modules/.vite/vitest/.../results.json` exists even though vitest is not in `package.json` (every entry in it failed). | Observed | Delete it (`node_modules/` is gitignored) |

Fix for M1 (verified: it renders a tagged fence correctly, a bare fence still works, and the 12 markdown tests pass). Change the two *opening* checks, the one in `isBlockStart` and the one in the main loop, and leave the closing check bare:

````js
// public/markdown.js
/^```[\w-]*$/.test(line.trim())
````

## 7. Polish checklist

| Item | Status | See |
|---|---|---|
| Enter to add | Done | |
| Autofocus on load | Partial (refocuses after an add, not on load) | F10 |
| Keyboard navigation (up/down select, Enter toggles done) | Done | |
| Reorder with the up/down buttons | Done | |
| Reorder by mouse drag | Not working | F2 |
| Reorder by touch drag | Not working | F6 |
| Undo instead of confirm | Not done | F7 |
| Dark mode | Not done | F9 |
| Big tap targets and a phone layout | Not done | F8 |
| Export/import with a backup | Done (one backup level) | M4 |
| Notes editor opens and closes | Broken | F1 |
| Escape cancels a title edit | Broken | F3 |

## 8. Suggested order of work

Time estimates are rough guesses.

1. **Quick wins (about 30 minutes):** F1, F3, F10, plus M1, M10, and M11.
2. **Correctness and safety (an hour or two):** F2 (then re-test by hand in your browser), F4, F5, and the F12 test tweak. Add the unit tests listed under F4 and F5 so the fixes stay fixed.
3. **Polish (a weekend):** F8 layout, F9 dark mode, F7 undo, F6 drag handle, and the M7 accessibility labels.
4. **Optional:** the F11 browser-only port. Do it after steps 1 to 3 so the UI you port is already fixed, and decide then whether to keep the Node version at all.

## 9. Manual smoke checklist (about 10 minutes)

Run this after changes. It would have caught F1 to F3.

1. Add three tasks. Enter adds each one and focus stays in the add box.
2. Click Notes on a task. The editor appears only then, and Cancel hides it.
3. Click Edit, type a new title, press Escape. The old title stays, and a reload confirms nothing was saved.
4. Click Edit, change the title, press Enter. It saves once (watch the network tab).
5. Drag the last task above the first and release. The row is not left faded, and the order survives a reload.
6. Use the up/down buttons on a middle task.
7. Add a note with `[ok](https://example.com)` and check the link works. Paste a link with a tab inside `javascript:` and check it is not rendered as a link.
8. Delete a task. After F7, Undo brings it back.
9. Narrow the window to about 390px. Nothing overflows sideways, and controls are comfortable to tap.
10. Switch the OS between light and dark. After F9 the app follows.
11. Export, delete everything, import the file. The list is restored exactly.

## Appendix A. Measurements and evidence

Chromium 141 via Playwright. "Phone" means a 390px viewport with emulated touch; everything else used a 1000px viewport.

| What | Result |
|---|---|
| Checkbox | 16x16px |
| Up/down buttons | 28x27px |
| Edit / Delete / date input | 44x27 / 60x27 / 137x27px |
| Notes editor block with `hidden` set | `display: flex`, 115px tall |
| Phone: first row | 291px |
| Phone: page height with 12 tasks | 3,209px, no horizontal overflow |
| Element focused on load | `BODY` |
| Body background with dark scheme emulated | `rgb(245, 245, 247)` (unchanged) |
| Escape while editing a title | Saved to the server (1 PUT) |
| Enter while editing a title | 2 PUT requests |
| Mouse drag, slow and fast | Order unchanged; row stuck in `.dragging`; event order: pointerdown, gotpointercapture, lostpointercapture (dragged row), pointerup (a different row) |
| Touch drag, emulated | pointerdown, pointermove, pointercancel; `scrollY` 915; order unchanged |
| Link with a tab in the scheme, clicked | Alert dialog with message "1" |
| curl `POST /api/tasks`, `text/plain`, foreign Origin | 201 |
| curl `POST /api/import`, `text/plain` | 200 (list replaced, `.pre-import` written) |
| curl `GET /api/export` with `Host: evil.example` | 200 |
| `OPTIONS` preflight on `/api/tasks/1` | 405 |
| Response headers on `/` | No CSP, nosniff, X-Frame-Options, or cache headers |
| `/favicon.ico`, `/manifest.webmanifest`, `/sw.js` | 404 |
| Delete click | Task removed at once; no dialog; status "Task deleted" |
| Keyboard: ArrowDown then Enter | Toggled done on the second row |
| Up button on the third task | Order changed and survived a reload |
| `npm test` (original) | 201 tests, 200 pass, 1 fail (F12) |

## Appendix B. Fix verification

All the "Fix verified" changes were applied together to a scratch copy of the project (a few lines each in `public/app.js`, `public/markdown.js`, `public/style.css`, and `server.js`), then checked in Chromium and Node. The scripts are not included here; section 9 covers the same ground by hand.

| Check | Result |
|---|---|
| Notes editor hidden on load, visible after clicking Notes | Pass |
| Escape cancels a title edit (nothing saved, no PUT) | Pass |
| Enter saves exactly once | Pass |
| Slow mouse drag of the last task to the top is saved | Pass |
| No row left in the `.dragging` state | Pass |
| A second, fast drag also works | Pass |
| Tab-obfuscated `javascript:` link is dropped; `https:` and relative links kept | Pass |
| `text/plain` write rejected (400) | Pass |
| `text/plain` import rejected (400) | Pass |
| Foreign Host header rejected (403) | Pass |
| CSP and nosniff headers present | Pass |
| Normal JSON write still works (201) | Pass |
| Language-tagged code fence renders correctly (M1); 12 of 12 markdown tests pass | Pass |
| Existing `npm test` on the patched copy | 201 tests, 200 pass, same single failure as before (F12) |

**Not verified:** Firefox, Safari, real touch hardware, Windows, the Export download under the new CSP, and every item marked "Fix sketch".
