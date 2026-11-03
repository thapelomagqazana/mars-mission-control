# End-to-end specs

One `.cy.js` file per user workflow — one spec per journey, not one
spec per page, not one spec per assertion.

The files here are the workflow-stage tests. Each is named for the
workflow it exercises, and that name is the link between a failing
test and the requirement it belongs to.

---

## The five specs

| File | Workflow | Upstream source |
|---|---|---|
| `create-task.cy.js` | Creating a task from the dialog. | 7.10.2 |
| `read-tasks.cy.js` | Viewing the task list, including the empty state. | 8.8.2 |
| `edit-task.cy.js` | Editing an existing task, including cancel. | 9.7.2 |
| `delete-tasks.cy.js` | Deleting a single task and clearing all. | 10.9.2 |
| `counter-search.cy.js` | The live counter and the search input. | 11.8.2 |

The workflow sources are the requirement; the specs are the tests.
When a workflow changes, the spec changes with it. A spec that is not
in this table is a test looking for a requirement.

---

## What belongs here

**A spec file.** One per workflow. The file's `describe` block names
the workflow; its `it` cases name the assertions within it.

**A comment that names the workflow.** The first lines of the file
state which workflow it tests, which upstream source declared the
workflow, and which `data-cy` selectors the spec uses. A reviewer
reading the file sees the traceability without opening another
document.

**A `beforeEach` that starts from a known state.** Each spec's
`beforeEach` visits the base URL (`cy.visit('/')`) and, if it needs a
seeded list, loads a fixture (`cy.fixture('tasks.json')`). The
support file already clears `localStorage` before every test, so a
spec does not have to.

---

## What does not belong here

- **A helper file.** A function used by one spec belongs in that
  spec; a function used by three or more belongs in
  `tests/support/commands.js`. A file that is not a spec but lives in
  this folder is a file Cypress will not run and a contributor will
  wonder about.
- **A fixture.** Seed data lives in `tests/fixtures/`. A spec loads
  it with `cy.fixture('name.json')`; the JSON does not live here.
- **A custom command.** Commands live in
  `tests/support/commands.js`; the spec imports them through the
  support file, not by copying them.
- **A page object.** The project does not use a page-object model.
  The `data-cy` selectors are the interface; a page object would be a
  second interface to keep in sync.
- **A screenshot or a video.** Artefacts are written to
  `tests/screenshots/` and `tests/videos/`; they are not committed.
- **A test for a single assertion that is not a workflow.** An
  isolated unit test belongs in `tests/unit/`, not here. The E2E
  suite is for journeys a user could actually take.

---

## How a spec is structured

```javascript
/**
 * <Workflow name> — the "<workflow>" journey.
 *
 * Upstream source: workflow-stage spec <ID>.
 * Data-cy selectors used: <list from the selector register>.
 */

describe('<Workflow name>', () => {
  beforeEach(() => {
    cy.visit('/');
    // If the spec needs a seed, load it here:
    // cy.fixture('tasks.json').then((fixture) => {
    //   cy.seedTasks(fixture.threeTasks);
    // });
  });

  it('<one user-observable outcome>', () => {
    // Arrange, act, assert — in that order, with the assert being the
    // thing the user sees, not the thing the code does.
  });
});
```

The `describe` name matches the workflow spec's name. The `it` names
describe outcomes ("creates a task with all fields populated"), not
actions ("fills the form"). A reviewer reading the test run's output
should be able to read the test names top to bottom and understand
what the workflow does.

---

## Selector discipline

Every spec targets elements by `[data-cy="..."]`, using the
selectors in `docs/selector-convention.md`. A spec that targets a CSS
class or an XPath is a spec that breaks when the styling changes; the
convention exists to prevent that.

**Allowed exceptions:**

- **Text matching** (`cy.contains('No tasks yet')`) for assertions of
  user-visible copy. The copy is what the user sees; a `data-cy` would
  assert structure, not content. The exception is documented in the
  selector convention.
- **Browser-native dialogs** (the `confirm()` prompt for delete). The
  dialog is the browser's; it has no `data-cy`. Cypress stubs it with
  `cy.on('window:confirm', ...)`; the spec documents the stub.

For everything else, the selector convention's register is the source
of truth. A `data-cy` that is not in the register is a selector a
reviewer will flag; a spec that uses one is coupling to a name the
view chose, not a name the project agreed on.

---

## How a spec is run

```bash
# Headless, the way CI runs it.
npm run test:e2e

# Interactive, for a developer watching the run.
npm run test:e2e:open
```

The `pretest:e2e` script builds the production bundle before the run.
The suite tests the artifact that ships, not the dev build. A change
that only works in the dev build is a change that does not work; the
E2E suite catches it.

---

## When a spec is added

A new spec is added when a new workflow is added, not when a new
assertion is added to an existing workflow. The sequence:

1. **The workflow-stage spec declares the workflow** — the ID and the
   name come from there, not from the spec author's preference.
2. **The spec file is created here** with the workflow's name
   (`<verb>-<object>.cy.js`).
3. **The mapping table above is updated** in the same commit.
4. **`docs/cypress-folder-structure.md` is updated** with the new
   row.
5. **The `data-cy` selectors the spec uses are already in the
   register** — a spec that needs a new selector is a spec that needs
   a selector-convention change first.

A spec that is added without the mapping table update is a spec that
the traceability cannot find. The table is the record; the file is
the test.

---

## When a workflow changes

A workflow that gains a new assertion is a spec that gains a new `it`
case, in the existing spec file. A workflow that changes its name is a
spec file rename, a mapping-table change, a folder-structure change,
and a workflow-stage update — all in one commit. The name is the
contract; a rename is a contract change, not a formatting choice.

---

## When a spec fails

A spec failure names the workflow (the `describe`) and the outcome
(the `it`). The two together are the traceability link:

- **The `describe` name** points at the workflow-stage spec.
- **The `it` name** points at the specific outcome the workflow
  declared.

A reviewer who reads the failure knows which requirement is not
met, not just which assertion failed. That is the value of the naming
discipline: a failure is a message, not a mystery.

---

## The folder in one line

**Specs are named for workflows; a spec that is not named for a
workflow is a test looking for a requirement.**

---

## See also

- `docs/cypress-folder-structure.md` — the tree, the folder purposes,
  and the spec-name mapping.
- `docs/selector-convention.md` — the `data-cy` convention and the
  coverage register.
- `docs/event-catalog.md` — the controls and interactions the specs
  exercise.
- `docs/cypress-configuration.md` — the runner's settings, including
  the base URL, viewport, and retry policy.
