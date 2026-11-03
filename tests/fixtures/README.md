# Test fixtures

Deterministic seed data for the E2E specs. A fixture is JSON that a
spec loads with `cy.fixture('tasks.json')`.

Fixtures are for *data* the spec needs — a task with a known id, a
task with an empty description — not for *behaviour* the spec
asserts. If a spec needs a specific task, the fixture provides it; if
a spec needs a specific interaction, the spec does the interaction.

The current fixture is `tasks.json`. A future fixture (a larger list,
a list with a corrupted entry) is added here, named for what it
represents.

---

## What belongs here

**JSON files** that a spec loads with `cy.fixture('<name>.json')`.
Each file is a single JSON value: usually an object with named
collections, sometimes an array. The spec destructures the value it
needs; the fixture does not know which spec is reading it.

**A name that describes the data.** `tasks.json` for a task list;
`tasks-corrupted.json` for a list with a bad entry;
`tasks-large.json` for a pagination stress test. The name is the
description; a contributor who needs a specific shape finds it by
name.

**Data that is stable and readable.** A fixture that changes between
runs is a fixture that makes the spec flaky. Timestamps are fixed
(not `new Date()`), ids are fixed (not `crypto.randomUUID()`), and
the values are chosen to be legible in a diff — "Survey crater",
not "task1" and "task2".

---

## What does not belong here

- **A helper function.** A function that *builds* a task belongs in
  the spec or in `tests/support/commands.js`, not in a fixture.
  Fixtures are data; code is not data.
- **A script.** A `.js` file that runs when imported is not a
  fixture. Cypress's `cy.fixture()` loads JSON, not modules.
- **A screenshot or a video.** Artefacts are written to
  `tests/screenshots/` and `tests/videos/`; they are not fixtures.
- **A fixture for a test that does not exist yet.** A fixture is
  added when a spec needs it. An unused fixture is a file nobody
  reads and nobody removes.
- **A fixture that encodes a state the app cannot reach.** A fixture
  with a task the app would never create (a `title` with 1000
  characters, a `createdAt` in 1970) is a fixture that tests a state
  the app cannot produce. The spec that needs that state seeds it
  explicitly, and the fixture is not used.

---

## The current fixture: `tasks.json`

The file has three named shapes, one for each kind of state a spec
starts from:

| Shape | What it is | Which spec loads it |
|---|---|---|
| `emptyList` | An empty array — no tasks. | `read-tasks.cy.js` for the empty-state test. |
| `singleTask` | One task with all fields populated. | `create-task.cy.js`, `read-tasks.cy.js`, `edit-task.cy.js`, `delete-tasks.cy.js` for the simplest case. |
| `threeTasks` | Three tasks with distinct assignees. | `counter-search.cy.js` for filter and count tests. |

**Why three shapes, not one:** the specs have different needs. A spec
that asserts the empty state needs `emptyList`; a spec that asserts
a card's description needs `singleTask`; a spec that asserts a
filter on one of three needs `threeTasks`. One fixture with all three
shapes serves all specs; three files would be three places to look.

**Why the shapes are named, not indexed:** a spec that writes
`fixture.threeTasks` reads the intent; a spec that writes
`fixture[2]` reads the shape. The name is the documentation.

**Why the ids are fixed:** a spec that targets a card uses
`[data-cy="task-card"][data-task-id="..."]`. The id must be stable
across runs, or the spec that targets "the first task" is a spec
that targets whichever task the fixture happened to generate this
time. The fixture's ids are RFC 4122 v4 UUIDs with a fixed
sequence; they look like the app's ids but do not change.

**Why the timestamps are fixed:** the same reason. A spec that
asserts "the created time is displayed" needs a timestamp the test
can compare against; `new Date()` in a fixture would make the
assertion different every run.

---

## How a spec uses a fixture

```javascript
beforeEach(() => {
  cy.visit('/');
  cy.fixture('tasks.json').then((fixture) => {
    cy.seedTasks(fixture.threeTasks);  // or whatever the spec needs
  });
});
```

The fixture is loaded, the spec picks the shape it needs, and the
spec seeds the app's `localStorage` with it. The seeding is the
spec's job, not the fixture's — the fixture provides the data, the
spec decides which shape and when.

**The seeding helper:** if three or more specs seed tasks the same
way, the seeding becomes a custom command in
`tests/support/commands.js`. Below that threshold, a helper
function in the spec is simpler. The fixture does not know which
one the spec uses; it is data, and the spec reads it.

---

## Adding a fixture

A new fixture is added when a spec needs a shape the current
fixture does not have. The sequence:

1. **The spec that needs it is written first**, and fails because
   the shape does not exist.
2. **The fixture is added** with the shape the spec needs.
3. **The spec passes.**
4. **The fixture's row in this README is updated** with the shape's
   name, what it is, and which spec loads it.
5. **The fixture is named for what it represents**, not for the spec
   that uses it.

The row in this README is the record; the fixture is the data; the
spec is the consumer. All three are needed for a reader to know what
a fixture is for.

---

## The folder in one line

**Fixtures are data, not code: a fixture is the seed a spec starts
from, and its shape is the spec's precondition made explicit.**

---

## See also

- `docs/cypress-folder-structure.md` — the tree, the folder
  purposes, and the spec-name mapping.
- `docs/selector-convention.md` — the `data-cy` convention the specs
  use to target the tasks a fixture provides.
- `docs/event-catalog.md` — the interactions the specs exercise on
  the tasks a fixture provides.
- `cypress.config.js` — the `fixturesFolder` setting that points at
  this folder.
