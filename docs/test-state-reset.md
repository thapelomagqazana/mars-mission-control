# Test-State Reset

**Status:** Finalised  
**Date finalised:** 2026-11-03  
**Owner:** QA Engineer  
**Sources of truth:**
- `tests/support/e2e.js` — the global `beforeEach`
- `tests/support/commands.js` — the seeding helpers
- `tests/fixtures/tasks.json` — the seed shapes
- `docs/persistence-mapping.md` — the storage key and recovery branches

**Contract tests:**
- `tests/e2e/isolation-probe.cy.js` — proves the isolation

**Related documents:**
- `docs/selector-convention.md` — the `data-cy` values the probe uses
- `docs/cypress-folder-structure.md` — the folder purposes
- `docs/cypress-configuration.md` — the `STORAGE_KEY` env var

---

## Purpose

Every test must start from a known state. This document records what
"known state" means for this project, how the global `beforeEach`
produces it, and how a spec can override it with a seed.

The default is **empty**: the app's `localStorage` key is absent when
a test starts. A spec that needs a seeded state calls
`cy.seedTasks(tasks)` in its own `beforeEach`. A spec that needs a
corrupted state calls `cy.seedCorruptStorage(payload)`. There is no
other state a test can start from, and a spec that does not seed is
a spec that depends on the default.

A test that depends on a previous test's state is a test that fails
when run alone. The probe test exists to catch that defect before
the suite does.

---

## The global `beforeEach`

Runs before every test in every spec, via `tests/support/e2e.js`.
Two steps, both required:

### Step 1 — Visit the app

```javascript
cy.visit('/');
```

The visit loads the app under its origin, so the window exists and
the app's `localStorage` is reachable. Without the visit, the window
is `about:blank`, which has no `localStorage` for the app's origin —
a reset that runs against `about:blank` is a reset that does
nothing, silently.

The visit is setup, not the test's action. A spec that wants to
exercise "the user opens the page" still gets its action from the
test body; the global visit is the empty state's load, and the
test's own interactions follow it.

### Step 2 — Remove the app's key

```javascript
cy.window().then((win) => {
  win.localStorage.removeItem(Cypress.env('STORAGE_KEY'));
});
```

`removeItem`, not `cy.clearLocalStorage(key)`. The two are not
synonyms:

| Operation | Key after the call | What the app sees |
|---|---|---|
| `removeItem(key)` | **Absent** | The app reads `null`, treats it as "no data yet," starts empty. |
| `cy.clearLocalStorage(key)` | **Present, empty value** | The app reads `''`, tries to parse it, fails, and the recovery branch starts empty. |

Both produce an empty task list in the rendered output, but they are
different *states*. The reset produces the absent-key state, because
it is the unambiguous "nothing has happened yet" state. A test that
asserts "the app has never run" needs the absent key; a test that
asserts "the app started with an empty value" is a different test and
seeds the empty value explicitly.

### Why both steps are inside the hook

A spec that forgets to clear would leak state; a spec that clears
but does not visit would clear the wrong origin. Putting both in
one hook means a spec cannot forget either.

### Why the key comes from `Cypress.env('STORAGE_KEY')`

`cypress.config.js` mirrors the storage key from
`src/js/utils/storage.js`'s `STORAGE_KEY` constant. A spec that
reads the key through the env var cannot drift from the app's
actual key: `tests/unit/node/cypressConfig.test.js` asserts the env
var matches the constant. A spec that hard-coded `'mmc.tasks'`
would work today and break silently on a future rename; the env var
is the contract.

---

## The seeding helpers

Both helpers live in `tests/support/commands.js`. They are
**setup-only**: they write state, they assert nothing. A spec that
seeds and then asserts has the seed in one place (the `beforeEach`)
and the assertion in another (the `it` body), which is the correct
shape — the seed is the test's precondition, the assertion is its
claim.

### `cy.seedTasks(tasks)`

Writes an array of tasks to the app's key, then reloads so the app
reads the seed.

**Input:** an array of task objects, each with the app's six fields
(id, title, description, creator, assignee, createdAt). A non-array
throws a `TypeError` at the call site.

**Post-condition:** the app is rendering from the seeded state.

**Usage:**

```javascript
beforeEach(() => {
  cy.fixture('tasks.json').then((fixture) => {
    cy.seedTasks(fixture.threeTasks);
  });
});

it('shows three task cards', () => {
  cy.get('[data-cy="task-card"]').should('have.length', 3);
});
```

**What it does, in order:**

1. `cy.window().then(...)` — write `JSON.stringify(tasks)` to
   `localStorage` at the key from `Cypress.env('STORAGE_KEY')`.
2. `cy.reload()` — the app reads the seed on the new page load.

**Why the reload:** `localStorage.setItem` writes to storage; the
app reads storage on page load. A helper that wrote without
reloading would have the post-condition "the storage has the seed,"
not "the app is rendering the seed." The two are different, and the
second is what a test needs.

### `cy.seedCorruptStorage(payload)`

Writes a raw string to the app's key, then reloads so the app reads
it. The string is written as-is, not JSON-encoded, so the caller can
write a value the app cannot parse.

**Input:** a string. A non-string throws a `TypeError` at the call
site. For a JSON value, the caller passes
`JSON.stringify(value)`.

**Post-condition:** the app is rendering from the corrupted state
(or has recovered, depending on the recovery branch the test is
exercising).

**Usage:**

```javascript
// P-03: corrupted JSON — the app starts with an empty store.
it('recovers from malformed JSON', () => {
  cy.seedCorruptStorage('{not valid json');
  cy.get('[data-cy="task-empty-no-tasks"]').should('be.visible');
});

// P-04: valid JSON, wrong shape — the app starts with an empty store.
it('recovers from a non-array value', () => {
  cy.seedCorruptStorage(JSON.stringify({ not: 'an array' }));
  cy.get('[data-cy="task-empty-no-tasks"]').should('be.visible');
});

// P-05: an array with one invalid entry — the app filters the invalid
// entry and keeps the valid ones.
it('filters an invalid entry and keeps the valid ones', () => {
  cy.fixture('tasks.json').then((fixture) => {
    cy.seedCorruptStorage(
      JSON.stringify(fixture.invalidTasks.arrayWithOneInvalidEntry)
    );
  });
  cy.get('[data-cy="task-card"]').should('have.length', 1);
});
```

**Why the string interface:** a helper that took a JS value would
`JSON.stringify` it, producing valid JSON for any value. The one
case it could not produce — malformed JSON, the most important
corrupted case (P-03) — would be impossible to test. The string
interface lets the caller write the exact bytes; "corrupted" is a
property of the bytes, not of the JS value.

**Why setup helpers do not violate the "do not hide assertions"
rule:** the rule is about *assertion* helpers — a helper that clicks
a button and asserts the outcome hides the assertion from the spec.
A *setup* helper writes state; the spec's assertion stays in the
spec, visible on the line where it matters. The distinction is
between "helper that does the assertion for you" (not allowed) and
"helper that does the setup for you" (allowed).

---

## The probe

`tests/e2e/isolation-probe.cy.js` is the proof that the reset
works. It has two tests:

1. **Seed a single task; assert one task.**
2. **Seed three tasks; assert three tasks.**

Each test asserts only its own seed. The probe passes in three runs:

- The whole file (both tests).
- The first test alone.
- The second test alone.

Three identical outcomes are the definition of order-independence.
A failure in any of the three is a state leak; the failure names
the test and the assertion, which is enough to locate the leak.

**What the probe proves:**

- The global reset clears the app's key before each test. (If it
  did not, the second test would see the first test's seed, and its
  count would be wrong.)
- `cy.seedTasks` writes the seed the test expects. (If it did not,
  the test would see the default empty state, and its count would
  be zero.)
- The two together produce a deterministic starting state for any
  test.

**What the probe does not prove:**

- That every spec seeds correctly. The probe uses `cy.seedTasks` on
  the fixture shapes; a spec that uses a different shape or a
  different helper has its own state contract. The probe is the
  reset's proof; the specs are their own proofs.
- That the reset's *mechanism* is correct (the key is removed, not
  merely cleared). The probe asserts the rendered output; a test
  that wanted to assert the mechanism would inspect
  `localStorage.getItem(key) === null` — which is the absent-key
  state the reset produces, but that test is a different test.

**The failure table** is in the probe's docstring; the summary:

| Failure | Meaning |
|---|---|
| Both fail together, pass alone | The reset is not clearing, or the key is wrong. |
| Only the second fails together | The first test's seed is leaking. |
| Only the first fails together | Another spec is leaking into the probe. |
| Both pass, a third spec fails | The third spec is the leaker; the probe is fine. |

---

## What a spec that forgets to seed looks like

A spec that needs a seed and does not seed runs against the empty
state (the global reset's outcome). The spec's assertion — "the task
card is visible" — fails with a message that says the card is not
visible. The failure is correct: the spec forgot its precondition.

**The fix is not to add a seed to the global `beforeEach`.** The
global hook is the *empty* state; a spec with a seed is a spec that
overrides it. Adding a default seed to the global hook would make
every spec depend on the seed, which is the opposite of isolation.

**The fix is to add the seed to the spec's own `beforeEach`**, where
the seed's shape is visible and can be deleted when the spec
changes. A seed in the global hook is a seed every spec depends on;
a seed in the spec's `beforeEach` is a seed one spec depends on.

---

## The probe in the suite

The probe is one of the six E2E specs (create, read, edit, delete,
counter-search, isolation-probe). It is in the suite for two
reasons:

1. **It runs on every `npm run test:e2e`**, so a reset regression is
   caught by the same command that runs the workflows.
2. **It is small enough to run first** when a suite failure is
   confusing. If a workflow spec fails alone but passes in the
   suite (or vice versa), the probe is the first thing to run: if
   the probe passes, the reset is fine and the failure is a spec
   bug; if the probe fails, the reset is the problem.

The probe does not need to be the first spec alphabetically. Its
value is that it is runnable in isolation and that its failure is
unambiguous.

---

## Acceptance check

- [x] The global `beforeEach` visits and removes the app's key
- [x] The default state is the absent key (not the empty value)
- [x] `cy.seedTasks` writes the correct key with the correct shape
      and reloads
- [x] `cy.seedCorruptStorage` writes a raw string and reloads
- [x] Both helpers validate their input
- [x] Both helpers are documented (in the file and in this doc)
- [x] The probe test proves isolation (two tests, each asserting
      only its own seed)
- [x] The probe's outcomes are identical when run alone and as a
      suite
- [x] The storage key comes from `Cypress.env('STORAGE_KEY')`,
      which mirrors the app's constant
- [x] A spec that needs a seed seeds it in its own `beforeEach`,
      not in the global hook

---

## See also

- `docs/persistence-mapping.md` — the recovery branches the
  corrupted-storage helper enables (`P-03`, `P-04`, `P-05`).
- `docs/selector-convention.md` — the `data-cy` values the probe
  uses (`task-card`, `task-card-title`, `task-empty-no-tasks`).
- `docs/cypress-folder-structure.md` — the spec files, including
  the probe's place in the tree.
- `docs/cypress-configuration.md` — the `STORAGE_KEY` env var and
  the runner's settings.
- `tests/support/e2e.js` — the global `beforeEach` implementation.
- `tests/support/commands.js` — the two seeding helpers.
- `tests/e2e/isolation-probe.cy.js` — the probe.
- `tests/fixtures/tasks.json` — the seed shapes.
