# Selector Convention and Coverage Register

**Status:** Finalised  
**Date finalised:** 2026-11-03  
**Owner:** QA Lead + UI Lead  
**Sources:**
- Event catalog (`docs/event-catalog.md`) — the interactive controls
- Rendering contract (`docs/rendering-contract.md`) — the DOM ownership map
- UI checklist (Stage 1) — the display elements the tests will assert

**Implements:**
- `src/js/views/*.js` — every view carries the `data-cy` attributes
- `src/js/utils/dom.js` — passes `data-cy` through via the `cy` shorthand
**Contract tests:**
- `tests/unit/jsdom/renderContract.test.js` — asserts each `data-cy` exists on a rendered element

**E2E tests:** `tests/e2e/*.cy.js` — target selectors by `[data-cy="..."]`

---

## Purpose

This document defines how the application marks elements for testing,
so the tests target stable identifiers rather than incidental structure
(CSS classes, DOM position, text content). It also records the
**coverage register**: one row per testable element, with its `data-cy`
value, its context, and its purpose.

The convention is a contract between three things:

- The views that **produce** elements.
- The tests that **target** elements.
- This register, which records the **agreement**.

When the three disagree, one of them is wrong. The coverage test at
`tests/unit/jsdom/renderContract.test.js` detects the disagreement: a
`data-cy` on a rendered element that is not in the register fails the
test, and a register row whose element is not rendered fails the test.
The two failures together keep the register, the views, and the tests
in step.

---

## The naming convention

### The pattern

**`<context>-<element>-<role>` in kebab-case.**

| Segment | Meaning | Examples |
|---|---|---|
| `context` | The region or feature the element belongs to | `dashboard`, `search`, `task`, `dialog` |
| `element` | The noun the element represents | `card`, `list`, `input`, `counter`, `summary` |
| `role` | What the element does in the test | `btn`, `input`, `error`, `title` |

**Examples:**

- `dashboard-counter` — the count element in the dashboard's sidebar.
- `search-input` — the search field.
- `task-card` — one task card.
- `task-card-delete-btn` — the delete button inside a task card.
- `task-dialog-title` — the title input inside the task dialog.
- `task-dialog-cancel-btn` — the cancel button inside the dialog.

**Two-word forms are allowed when the element is unambiguous.**
`task-card` is two words, not three; "card" is the element, and the
role is implied by the element's position. `search-input` is two words
because "input" is both the element and the role. The rule is: **as
short as unambiguous, as long as needed**.

**Every value has at least two segments** (a hyphen). A one-word value
like `card` would be ambiguous with every other word in the app; the
two-segment minimum is what prevents it.

### Forbidden characters

A `data-cy` value must not contain:

| Character class | Why it is forbidden |
|---|---|
| Whitespace | Breaks the attribute selector (`[data-cy="task card"]` is valid CSS but easy to mistype and hard to read). |
| Uppercase letters | The convention is kebab-case; a value starting uppercase (`TaskCard`) is inconsistent with the rest of the register and reads as a different convention. |
| Underscores | Kebab-case uses hyphens; underscores would introduce a second convention, and the two would drift. |
| `:`, `.`, `#`, `[`, `]`, `*`, `>`, `+`, `~`, `,`, `=`, `"`, `'` | Any of these breaks a CSS attribute selector or an `aria-*` reference that uses the value. |
| The prefix `data-` | The attribute is `data-cy`; the value does not repeat the prefix. `data-cy-task-card` would produce `[data-cy="data-cy-task-card"]`, which is confusing. |

The coverage test asserts every register value matches
`/^[a-z][a-z0-9-]*$/`.

### The `data-cy` attribute, not `data-testid`

`data-cy` is the Cypress convention. The project uses Cypress for E2E
tests; the attribute is what Cypress's `cy.get('[data-cy="..."]')`
targets. `data-testid` is the React Testing Library convention, which
the project does not use.

Using one convention throughout means:

- A reader knows immediately what attribute the tests target.
- A future tool (Cypress's codegen, a selector linter) recognises the attribute.
- A `data-testid` appearing in the codebase is a visible inconsistency,
  not a quiet second convention.

---

## Dynamic content: the pattern

The task list produces one `<article>` per task. A test that wants to
click the delete button on "Survey crater" cannot use a fixed selector,
because there are as many delete buttons as there are tasks.

**The pattern: a stable selector plus a key-by-id attribute.**

```html
<article data-cy="task-card" data-task-id="550e8400-...">
  <h2 data-cy="task-card-title">Survey crater</h2>
  ...
  <button data-cy="task-card-delete-btn" data-task-id="550e8400-...">
    Delete
  </button>
</article>
```

A test targets a specific card by combining the two:

```javascript
// Find the card for task X, then the delete button inside it.
cy.get('[data-cy="task-card"][data-task-id="550e8400-..."]')
  .find('[data-cy="task-card-delete-btn"]')
  .click();
```

**Why this pattern:**

- The `data-cy` value is **stable**. It does not change when the task data changes.
- The `data-task-id` is the **key**. It identifies which card, not what kind of element.
- The combination is **unambiguous**: there is exactly one card per id, and one delete button per card.
- A test that wants "the first card's delete button" uses
  `.first()` after the combined selector — a different intent,
  expressed differently, and therefore visible in the test.

**Why the id is not in the `data-cy` value** (e.g.
`data-cy="task-card-550e..."`):

- The `data-cy` value would become dynamic, which means every test
  that targets any card would need a different selector for each card.
- The register would need an entry per task, not per kind of task.
- A test author cannot copy a selector from the register if the
  selector is per-task.

**Why the buttons also carry `data-task-id`:**

- The event layer's delegation reads `event.target.closest('[data-action]')`
  to find the button, not the card. Putting `data-task-id` on the
  button means the handler reads `button.dataset.taskId` in one
  lookup, without walking up the tree.
- A test that targets the button directly
  (`[data-cy="task-card-delete-btn"][data-task-id="..."]`) finds
  exactly one button, even when the card's article is also matched.

**The dialog's error elements use the same pattern, keyed by field:**

```html
<p data-cy="task-dialog-error" data-field="title">Title is required.</p>
```

A test that wants the title's error uses
`[data-cy="task-dialog-error"][data-field="title"]`. The key is the
field name, the same way the task card's key is the task id.

---

## Assertion vs. action

Every `data-cy` in the register has one or both of two purposes:

| Purpose | Used by | Example |
|---|---|---|
| **Action** | A test clicks, types, or otherwise interacts with the element | `data-cy="task-card-delete-btn"` — the test calls `.click()` on it |
| **Assertion** | A test asserts the element's presence, text, or state | `data-cy="dashboard-counter"` — the test asserts `.should('have.text', '3 tasks')` |

Some elements serve both purposes. A button is an **action** target
(the click) and an **assertion** target (its label changes between
"Create task" and "Save changes"). The register records both purposes
for those elements.

**Why the distinction matters:** a test that uses an action selector
for an assertion is testing the wrong thing. If `task-card-delete-btn`
is used to assert "the button is visible", the test will pass when the
button is visible even if the underlying delete does not work. The
action selector is for the click; a separate assertion selector (or
the button's `data-cy` used with an assertion method like
`.should('be.visible')`) is for the state.

The register's `purpose` column is documentation, not enforcement. The
coverage test asserts every registered `data-cy` exists on an element;
it does not assert how the element is used. The purpose split is a
review aid.

---

## The fallback rule

**Critical-flow tests use `data-cy` only. No CSS-class selectors, no
XPath, no text-based matching for controls.**

A "critical flow" is any test that exercises a user journey: create,
edit, delete, search, cancel, clear. These flows touch the event
catalog's controls. Every control has a `data-cy`. A test that targets
a control by class (`.task-card__action`) or by position
(`cy.get('button').eq(2)`) is brittle against a styling or layout
change that does not affect behaviour.

**Allowed exceptions:**

| Exception | Allowed when | Must be justified in the test |
|---|---|---|
| Text matching (`cy.contains('Survey crater')`) | Asserting user-visible copy that the register does not cover — e.g. "the empty state says 'No tasks yet'". | The assertion is about the *content*; a `data-cy` would assert structure, not content. |
| CSS-class matching (`.task-list`) | Never for actions; only for assertions of a *class that is itself a contract* (rare). | The class is in the rendering contract as an ownership marker. |
| XPath | Never | XPath is fragile against any structural change; Cypress's XPath support is via a plugin the project does not use. |

**The rule of thumb:** if the assertion is "this element exists and has
the right text", `data-cy` plus a text assertion works. If the
assertion is "the user sees this specific string", text matching is
allowed and the register does not need an entry. If the assertion is
"this element is present in this state", `data-cy` plus
`.should('exist')` or `.should('not.exist')` is required.

---

## Coverage register

Every interactive control from the event catalog and every asserted
display from the UI checklist. One row per element.

### Dashboard

| Element | `data-cy` | Context | Purpose |
|---|---|---|---|
| Dashboard root | `dashboard` | dashboard | assertion (present) |
| Sticky header | `dashboard-header` | dashboard | assertion (present, sticky class) |
| Mission title | `dashboard-title` | dashboard | assertion (text) |
| Sidebar | `dashboard-sidebar` | dashboard | assertion (present) |
| Commander name | `dashboard-commander-name` | sidebar | assertion (text) |
| Live counter | `dashboard-counter` | sidebar | assertion (text, `data-count`) |

### Search

| Element | `data-cy` | Context | Purpose |
|---|---|---|---|
| Search input | `search-input` | search | action (type), assertion (value) |
| Search summary | `search-summary` | search | assertion (text) |
| Clear search button | `search-clear-btn` | search | action (click), assertion (present when query active) |

### Task list

| Element | `data-cy` | Context | Purpose |
|---|---|---|---|
| Task list container | `task-list` | list | assertion (present) |
| Empty state (no tasks) | `task-empty-no-tasks` | list | assertion (present, text) |
| Empty state (no results) | `task-empty-no-results` | list | assertion (present, text) |
| Empty state create button | `task-empty-create-btn` | list | action (click) |
| Empty state clear-search button | `task-empty-clear-search-btn` | list | action (click) |

### Task card (dynamic — carries `data-task-id`)

| Element | `data-cy` | Context | Purpose |
|---|---|---|---|
| Card root | `task-card` | list | assertion (present, count) |
| Card title | `task-card-title` | list | assertion (text) |
| Card description | `task-card-description` | list | assertion (text, present-when-nonempty) |
| Card creator | `task-card-creator` | list | assertion (text) |
| Card assignee | `task-card-assignee` | list | assertion (text) |
| Card created time | `task-card-created` | list | assertion (text) |
| Edit button | `task-card-edit-btn` | list | action (click), assertion (present) |
| Delete button | `task-card-delete-btn` | list | action (click), assertion (present) |

**Key-by-id:** every row in this group also carries `data-task-id` on
the element, so a test targets a specific card by
`[data-cy="task-card"][data-task-id="..."]`.

### Dialog

| Element | `data-cy` | Context | Purpose |
|---|---|---|---|
| Dialog root | `task-dialog` | dialog | assertion (present, open, closed) |
| Dialog heading | `task-dialog-heading` | dialog | assertion (text: "New task" or "Edit task") |
| Title input | `task-dialog-title` | dialog | action (type), assertion (value) |
| Description input | `task-dialog-description` | dialog | action (type), assertion (value) |
| Creator input | `task-dialog-creator` | dialog | action (type), assertion (value) |
| Assignee input | `task-dialog-assignee` | dialog | action (type), assertion (value) |
| Submit button | `task-dialog-submit-btn` | dialog | action (click) |
| Cancel button | `task-dialog-cancel-btn` | dialog | action (click) |
| Field error | `task-dialog-error` | dialog | assertion (text, present-when-invalid) — carries `data-field` |

**The `task-dialog-error` is dynamic:** each field has its own error
element. A test targeting the title's error uses
`[data-cy="task-dialog-error"][data-field="title"]`. The `data-field`
attribute is the key, mirroring the `data-task-id` pattern for cards.

---

## Coverage statement

Cross-check against the event catalog and the UI checklist:

| Source | Items | Covered by a register row? |
|---|---|---|
| Event catalog — primary controls | 8 | ✅ (all eight have a `data-cy`; the create-dialog trigger is `task-empty-create-btn`, the clear-search trigger is `task-empty-clear-search-btn`) |
| Event catalog — cancellation controls | 5 | ✅ (cancel-dialog × 2 use the same `task-dialog-cancel-btn`; dialog Esc is a keyboard event, not a `data-cy` target; confirm dialogs are browser-native and cannot be targeted by any selector) |
| UI checklist — asserted displays | 12 | ✅ (title, description, creator, assignee, created, counter, summary, empty state × 2, header, sidebar, commander name) |
| Dialog controls | 9 | ✅ (heading, four inputs, submit, cancel, error, dialog root) |

**Result:** 100% of interactive controls covered; 100% of asserted
displays covered; 0 convention violations; the dynamic-content pattern
is present for both task cards and dialog errors.

**What is not a `data-cy` target:**

- **The dialog Esc key.** It is a keyboard event, not an element. It
  is tested by `cy.get('[data-cy="task-dialog"]').type('{esc}')` on
  the dialog, not by a selector for an element.
- **The browser-native `confirm()` dialog.** It cannot be targeted by
  any selector. Cypress stubs it with
  `cy.on('window:confirm', ...)`, which is the documented approach
  and is justified in the spec that uses it.

---

## Acceptance check

- [x] Every interactive control from the event catalog has ≥1 `data-cy`
- [x] Every UI-checklist display element that tests will assert has a `data-cy`
- [x] No selector contains forbidden characters
- [x] The dynamic-content pattern is stated and exemplified
- [x] Critical-flow tests are declared to use `data-cy` only
- [x] Text matching is allowed only for assertion of copy, with justification
- [x] No row contains "TBD"
- [x] The convention is enforced by tests (the render contract test and
      the Cypress config test)

---

## Change protocol

When a `data-cy` value is added, renamed, or removed, all of the
following change together:

1. **The view file** — the `cy: '<value>'` attribute in the view that
   produces the element.
2. **This register** — the row for the element.
3. **`tests/unit/jsdom/renderContract.test.js`** — the assertion that
   the element carries the value.
4. **The spec files that target the value** — the `[data-cy="..."]`
   selectors in `tests/e2e/`.
5. **The commit message** — a note naming the element and the change.

The render contract test is the enforcement: it asserts every rendered
`data-cy` is in the register and every register row appears in a
rendered view. A rename that updates the view but not the register
fails the test; a rename that updates the register but not the view
fails the test; a rename that updates both but not a spec fails the
spec at run time.

**Why the protocol matters:** a `data-cy` value is a name that at
least three places agree on. A rename that updates one place is a
silent break — the test that used the old name finds nothing, and the
element is either untested or tested under the wrong name. The
protocol makes a rename a reviewable change; a diff that touches one
file and breaks the others is a diff that gets merged.

---

## See also

- `docs/event-catalog.md` — the controls and interactions the
  selectors target.
- `docs/rendering-contract.md` — the DOM ownership map and the view
  cards.
- `docs/cypress-folder-structure.md` — the spec files that use these
  selectors.
- `docs/cypress-configuration.md` — the runner's `SELECTOR_ATTRIBUTE`
  env var (`data-cy`).
- `src/js/utils/dom.js` — the `cy` shorthand that passes the attribute
  through.
