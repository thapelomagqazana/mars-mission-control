# Event Catalog

**Status:** Finalised  
**Date finalised:** 2026-11-03  
**Owner:** UI Lead + QA Lead  
**Sources:**
- Workflow spec (`docs/workflow.md`, Stage 1)
- UI checklist (`docs/ui-checklist.md`, Stage 1)
- Rendering contract (`docs/rendering-contract.md`)
- Store contract (`docs/store-contract.md`)

**Implements:**
- `src/js/app.js` — the handlers (one per catalog row)
- `src/js/events/debounce.js` — the search debounce
- `src/js/events/keyboard.js` — the keyboard handlers
- `src/js/events/focus.js` — the focus restoration

**Contract tests:**
- `tests/unit/jsdom/eventCatalog.test.js` — the debounce, keyboard, focus helpers

**E2E tests:** `tests/e2e/*.cy.js` — exercise the interactions end-to-end

---

## Purpose

This document is the complete inventory of interactions the
application responds to. Every interactive control has a row: what
event it fires, which handler responds, what the handler does, and
what the user sees. A control with no row is a control that does
nothing. A row with no handler is a promise the code does not keep.
Both are defects, and the tests enforce the rule.

The catalog exists so that:

- A reviewer can trace every click to a handler by reading one
  document.
- A Cypress test author knows exactly which `data-cy` value to target
  and which outcome to assert.
- A future contributor knows which event names are already in use, so
  they do not accidentally rewire a handler by renaming a
  `data-action`.

The catalog is a contract between three things:

- The views that **produce** controls (with `data-action` attributes
  that the event layer matches on).
- The event layer that **handles** the interactions.
- This catalog, which records the **agreement**.

When the three disagree, one of them is wrong. The event catalog test
at `tests/unit/jsdom/eventCatalog.test.js` detects the
disagreement for the helpers; the E2E specs detect it for the wiring.

---

## Debounce policy (stated once, applied uniformly)

**Search input uses a 200 ms debounce.**

Rationale: the task list is small enough that a re-render is under 5 ms,
and the filter runs in under 1 ms. Debouncing prevents a re-render on
every keystroke, which would create visible flicker on slower machines
and would fire an `aria-live` announcement per character (a
screen-reader user would hear every intermediate count). 200 ms is
short enough to feel immediate and long enough to coalesce a fast
typist's keystrokes into one render.

Every other event is **immediate** (no debounce). The pattern:

| Event type | Debounce |
|---|---|
| Search input (`input`) | 200 ms |
| Click | Immediate |
| Submit | Immediate |
| `keydown` | Immediate |
| `focus` | Immediate |
| `blur` | Immediate |

**Where the delay lives:** in `src/js/events/debounce.js`, as a
constant `SEARCH_DEBOUNCE_MS = 200`. The event catalog test asserts
that the constant is 200 and that the debounce primitive coalesces
rapid calls. Changing the value is a one-line change with a visible
diff in this document.

---

## How to read the catalog

Each row has six columns:

| Column | Meaning |
|---|---|
| **Control** | The stable `data-action` value, or a well-known DOM selector for browser-native events. |
| **View** | Which view produces the control (from the rendering contract). |
| **Event** | The DOM event: `click`, `submit`, `input`, `keydown`, `focus`, `blur`. |
| **Handler** | The function that runs. Every handler lives in `src/js/app.js` or `src/js/events/`. |
| **Action** | What the handler does — the store call and/or view call. |
| **Outcome** | What the user sees as a result. |

A row is complete when all six columns are filled. A cell that says
"TBD" is a row that is not ready; it is not a row.

---

## Primary controls

| Control | View | Event | Handler | Action | Outcome |
|---|---|---|---|---|---|
| `open-create-dialog` | dashboard (empty state) | click | `handleOpenCreate` | Mount the create dialog, focus the title input | Modal opens with an empty form |
| `edit-task` | taskCard | click | `handleEditClick` | Mount the edit dialog pre-filled with the task | Modal opens with the task's values |
| `delete-task` | taskCard | click | `handleDeleteClick` | Confirm (browser `confirm()`), then `store.deleteTask(id)` | Confirmation, then the card disappears |
| `submit-dialog` | dialog | submit | `handleFormSubmit` | `store.create` or `store.update`, then close the dialog | Dialog closes; the list updates |
| `cancel-dialog` | dialog | click | `handleDialogCancel` | Close the dialog, discard input | Dialog closes; nothing changes |
| `clear-search` | emptyState (no results) | click | `handleClearSearch` | Clear the input, re-render | All tasks shown; the input is empty |
| `open-create-dialog` | emptyState (no tasks) | click | `handleOpenCreate` | Same as the dashboard's create | Same as the dashboard's create |
| `search-input` | dashboard | input | `handleSearchInput` | Debounced re-render of results | The list and counter update after 200 ms |

**`open-create-dialog` appears twice** — once from the dashboard's
empty state, once from the tasks view. Both produce the same action;
the `data-action` value is the same, so the event layer's delegation
matches both. The two rows are separate because the *views* are
different, and a reviewer tracing a user journey needs to know that
the empty state and the main list are both entry points.

---

## Cancellation controls (one row each — not merged)

Every cancellation control is listed separately, because each one
cancels a different thing and gives a different outcome. A single
"cancel" row would hide the fact that edit and create cancel
different work, and that the confirmation dialogs cancel a destructive
action the user almost took.

| Control | View | Event | Handler | Action | Outcome |
|---|---|---|---|---|---|
| `cancel-dialog` (edit) | dialog | click | `handleDialogCancel` | Close the dialog, discard changes | The task is unchanged; the dialog closes |
| `cancel-dialog` (create) | dialog | click | `handleDialogCancel` | Close the dialog, discard input | No task is created; the dialog closes |
| Dialog Esc | dialog | keydown | `handleDialogEscape` | Same as `cancel-dialog` click | Same as cancel; focus returns to the trigger |
| Delete confirmation cancel | (browser `confirm()`) | (browser) | `handleConfirmCancel` | Do not delete; the browser closes the confirm | The task remains |
| Clear-all confirmation cancel | (browser `confirm()`) | (browser) | `handleConfirmCancel` | Do not clear; the browser closes the confirm | All tasks remain |

**Five cancellation rows, three distinct handlers.** The two
`cancel-dialog` rows share `handleDialogCancel` (they cancel the same
dialog, with the same behaviour). The two confirmation rows share
`handleConfirmCancel` (they cancel the same browser prompt, with the
same behaviour). The dialog Esc is a separate handler because it is a
keyboard event, not a click. The test in
`tests/unit/jsdom/eventCatalog.test.js` asserts the distinctness: a
future refactor that merges the dialog cancel and the dialog Esc
into one handler would fail the test, which is the signal that the
catalog's structure was changed.

---

## Keyboard events

Documented expectations. Some are tested by Cypress; some are
expectations that a manual accessibility review confirms.

| Control | Event | Handler | Behaviour | Tested by |
|---|---|---|---|---|
| Form (dialog) | `submit` | `handleFormSubmit` | Enter in a text field submits the form | `tests/e2e/*.cy.js` |
| Dialog | `keydown` (Escape) | `handleDialogEscape` | Esc closes the dialog; focus returns to the trigger | `tests/e2e/*.cy.js` |
| Search input | `keydown` (Escape) | `handleSearchEscape` | Esc clears the search, keeps focus in the input | `tests/e2e/*.cy.js` |
| All buttons | `keydown` (Enter, Space) | browser default | Activate the button (native behaviour) | (browser) |
| Tab (dialog) | `focus` | browser default | Focus stays inside the dialog (native `<dialog>` behaviour) | `tests/e2e/*.cy.js` |
| Tab (page) | `focus` | browser default | Follows DOM order: header → sidebar → search → list → cards | Documented expectation |

**The `keydown`/Enter case for buttons:** buttons activate on Enter
and Space by browser default; no handler is needed. The catalog
records this as "(browser)" so a reader does not look for a handler
that does not exist. The absence is deliberate, not an oversight.

**The Tab order is an expectation, not a test.** Cypress can assert
focus movement but cannot assert "the order a keyboard user
experiences" without a lot of brittle per-element `.focus()` calls.
The catalog documents the expected order so a manual accessibility
review has a checklist; the E2E tests assert the dialog's focus trap
(which is what a keyboard user notices most) and not the full page
order.

---

## Focus events

| Control | Event | Handler | Behaviour |
|---|---|---|---|
| Dialog | `open` | `handleDialogOpen` | Focus the first user input (title) |
| Dialog | `close` | `handleDialogClose` | Return focus to the element that opened the dialog |
| Search input | `focus` | (browser) | Input outline visible (CSS) |
| Task card button | `focus` | (browser) | Focus ring visible (CSS) |

**Focus management on the dialog is explicit code, not browser
default.** `<dialog showModal()>` focuses the first focusable child,
but "first focusable child" can be the close button, not the title
input. The catalog says "focus the title input", and
`handleDialogOpen` does that explicitly.

**On close, focus returns to the trigger.** The browser does not do
this reliably when the dialog is removed from the DOM, so
`handleDialogClose` captures the trigger's reference on open and
restores focus on close. The test in
`tests/unit/jsdom/eventCatalog.test.js` asserts the microtask timing
that makes the restoration reliable (the focus is queued, not
synchronous, so it lands after the browser's own `showModal` focus).

---

## Search debounce: the decision

The catalog states **200 ms** for the search input, and **no
debounce** for every other event.

**Why the search needs debouncing:** the search input fires `input` on
every keystroke. Without a debounce, every keystroke triggers a full
re-render of the task list, the counter, and the search summary.
That is visible flicker and a noisy screen-reader announcement. A 200
ms debounce coalesces a fast typist's keystrokes into a single render.

**Why nothing else needs debouncing:** every other event fires once
per user action (a click, a submit, a keydown). A user clicking
"delete" twice quickly is two deletes, which is the user's intent;
debouncing would silently drop one. Debouncing is for high-frequency
events with a natural coalescing point; a click does not have one.

**Why 200 ms:** short enough to feel immediate, long enough to absorb
the median inter-key interval (100–150 ms). A longer delay (300–500
ms) starts to feel laggy; a shorter delay (50–100 ms) does not
coalesce enough to be worth the machinery.

**Where the value lives:** `SEARCH_DEBOUNCE_MS` in
`src/js/events/debounce.js`. The event catalog test asserts the
constant's value; a future change is a one-line diff with the
rationale above.

---

## Coverage statement

Cross-check against the UI checklist:

| UI checklist item | Interactive? | Catalog rows |
|---|---|---|
| Dashboard renders | No | — |
| Task cards visible | No | — |
| Title displayed | No | — |
| Description displayed | No | — |
| Creator displayed | No | — |
| Assignee displayed | No | — |
| Edit control | Yes | `edit-task` |
| Delete control | Yes | `delete-task` |
| Sticky header | No | — |
| Side panel | No | — |
| Live task count | No | — |
| Empty state (no tasks) | Yes (via button) | `open-create-dialog` (emptyState) |
| Empty state (no results) | Yes (via button) | `clear-search` |
| Search input | Yes | `search-input` (input), `handleSearchEscape` (keydown) |
| Search results summary | No | — |
| Create dialog | Yes | `submit-dialog`, `cancel-dialog` |
| Edit dialog | Yes | `submit-dialog`, `cancel-dialog`, Esc |

**Result:** 6 interactive controls in the checklist, 15 catalog rows
(a control can have multiple events). **0 interactive controls with
no row.** **0 rows referencing a non-existent handler.** The 5
cancellation rows are all present, not merged; the keyboard and focus
rows document what the browser does and what the handlers add.

---

## Handler inventory

Every handler named in the catalog must exist in `src/js/app.js` (or
`src/js/events/`). This table is the mapping the tests check against.

| Handler | File | Purpose |
|---|---|---|
| `handleOpenCreate` | `src/js/app.js` | Mounts the create dialog |
| `handleEditClick` | `src/js/app.js` | Mounts the edit dialog with the task |
| `handleDeleteClick` | `src/js/app.js` | Shows confirmation, deletes on confirm |
| `handleFormSubmit` | `src/js/app.js` | Creates or updates, closes on success |
| `handleDialogCancel` | `src/js/app.js` | Closes the dialog without saving |
| `handleDialogEscape` | `src/js/events/keyboard.js` | Closes the dialog on Esc |
| `handleClearSearch` | `src/js/app.js` | Clears the input, re-renders |
| `handleSearchInput` | `src/js/app.js` (with `src/js/events/debounce.js`) | Debounced re-render |
| `handleSearchEscape` | `src/js/events/keyboard.js` | Clears the search on Esc |
| `handleConfirmCancel` | `src/js/app.js` | Closes the confirm, does nothing |
| `handleDialogOpen` | `src/js/events/focus.js` | Focuses the title input |
| `handleDialogClose` | `src/js/events/focus.js` | Returns focus to the trigger |

**12 handlers, all in `src/js/app.js` or `src/js/events/`.**
`tests/unit/jsdom/eventCatalog.test.js` asserts the keyboard and
focus handlers' behaviour; the E2E specs exercise the app-level
handlers end-to-end. A handler that is renamed in the code but not in
this catalog (or vice versa) fails the E2E spec that references the
old name, which is the signal that the catalog and the code have
drifted.

---

## Acceptance check

- [x] Every interactive element in the UI checklist has ≥1 row
- [x] Every cancellation control has its own row (5 rows, 3 distinct handlers)
- [x] Every row references an existing store or view method or handler
- [x] Search debounce is stated (200 ms) and distinguished from every other event
- [x] Esc and Enter behaviours are recorded
- [x] Focus behaviour on dialog open and close is recorded
- [x] No "TBD" cells
- [x] Coverage statement confirms 0 orphan controls, 0 orphan handlers

---

## Change protocol

When a control, event, handler, or outcome changes, all of the
following change together:

1. **The view file** — the `data-action` attribute or the element
   that produces the event.
2. **The event layer** — the handler in `src/js/app.js` or
   `src/js/events/`.
3. **This catalog** — the row (or rows) for the control, event, and
   outcome.
4. **The E2E spec** — the assertion that the outcome is what the
   catalog says.
5. **`tests/unit/jsdom/eventCatalog.test.js`** — if the change
   affects a debounce, keyboard, or focus helper.
6. **`docs/selector-convention.md`** — if the control gains or loses
   a `data-cy` value.

The catalog is the record; the code and the tests are the truth. When
the two disagree, this catalog is corrected, or the code is corrected,
depending on which side is wrong. The E2E specs are what tell a
reviewer which side is wrong: a failing spec names the workflow and
the outcome; the catalog names the handler and the action. The two
together are enough to find the defect.

**Why the protocol matters:** a control's `data-action` value is a
name that at least three places agree on — the view, the event
layer's delegation, and the E2E spec. A rename that updates one place
is a silent break: the click does nothing, and the spec fails for a
reason that does not name the rename. The protocol makes the rename a
reviewable change; a diff that touches one file and breaks the others
is a diff that gets merged.

---

## See also

- `docs/rendering-contract.md` — the view cards and the DOM ownership
  map; the views that produce the controls in this catalog.
- `docs/selector-convention.md` — the `data-cy` values the E2E specs
  target; the other half of the test-author's contract.
- `docs/store-contract.md` — the store operations the handlers call.
- `docs/cypress-folder-structure.md` — the spec files that exercise
  the catalog's interactions.
- `docs/cypress-configuration.md` — the runner's `SELECTOR_ATTRIBUTE`
  env var (`data-cy`).
