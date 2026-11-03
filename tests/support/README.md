# Shared Cypress support

`e2e.js` runs once before every spec file. It is the place for global
`beforeEach` hooks (clearing `localStorage`, stubbing the remote Mars
image) and for `Cypress.Commands.add` calls that every spec uses.

`commands.js` holds custom commands. A command is added only when the
same multi-step interaction is repeated in three or more specs; below
that threshold, a helper function in a spec is simpler and easier to
debug. The file exists so a future command has a home; it is empty on
purpose today.

---

## The two files

### `e2e.js`

**Runs once per spec file, before any test in the spec.**

The file has two jobs:

1. **Clear the app's persisted state** so every test starts from a
   known empty store. The clear is in a `beforeEach`, and it uses
   `Cypress.env('STORAGE_KEY')` — the same key the app writes to,
   mirrored in `cypress.config.js`. A spec that needs a seeded state
   seeds it explicitly inside its own `beforeEach`; the support file's
   job is to clear, not to seed.

2. **Tolerate the one external dependency the tests cannot control** —
   the remote Mars image. The app degrades gracefully when the image
   is missing, so a blocked image is not a defect in the app. Every
   other uncaught exception is allowed to fail the test, because a
   programming error in the app is exactly what the E2E suite exists
   to surface.

**What does not belong here:**

- A hook that only some specs need. A spec that needs a specific
  seed loads a fixture in its own `beforeEach`; the support file is
  for the state every spec needs (an empty store), not the state some
  specs want.
- A custom command. Commands go in `commands.js`; the support file
  imports them.
- A test. The support file has no `it` blocks; a file with `it`
  blocks in the support folder is not a support file.

### `commands.js`

**Custom Cypress commands, added only when they are justified.**

A command is added when the same multi-step interaction is repeated
in three or more specs. Below that threshold:

- A helper function in the spec is simpler (it lives where it is used).
- It is easier to debug (the stack trace points at the spec, not a
  command).
- It is easier to remove (deleting a helper from a spec leaves no
  shared state; deleting a command requires finding every caller).

**The criteria, stated as a test:**

| Criterion | Command | Spec-local helper |
|---|---|---|
| Used by 3+ specs | ✅ | — |
| Used by 1–2 specs | — | ✅ |
| Reduces meaningful repeated steps | ✅ | — |
| Hides an assertion a reviewer would want to see | — | ✅ |
| Uses `[data-cy="..."]` selectors only | ✅ | ✅ |
| Documented in `docs/selector-convention.md` if it adds a selector | ✅ | ✅ |

The file is empty today because no interaction has reached the
three-spec threshold. That is the correct state: an empty
`commands.js` with a comment explaining why is a placeholder, not a
mystery; a `commands.js` with one command is a decision to be
reviewed.

---

## The support folder in one line

**`e2e.js` is the global setup; `commands.js` is the shared helpers
— and both are empty-by-default, filled only when a spec cannot
carry the work itself.**

---

## Why the split

Cypress's default structure puts both files under `cypress/support/`
with `e2e.js` importing `commands.js`. The project keeps the same
split under `tests/support/`:

- **`e2e.js`** is the file Cypress loads by name
  (`cypress.config.js`'s `supportFile`). It runs once per spec.
- **`commands.js`** is a file `e2e.js` imports. Cypress does not load
  it directly; the import is what makes the commands available.

The split is not cosmetic. A hook in `e2e.js` runs for every spec,
whether the spec uses it or not. A command in `commands.js` is
registered once, and every spec can call it. The two are
different mechanisms with different scope; putting them in one
file would hide the distinction.

---

## When a spec fails

A failure that names `tests/support/e2e.js` in its stack means the
support file's `beforeEach` failed — usually a `localStorage` clear
that could not find the key, which means `Cypress.env('STORAGE_KEY')`
does not match the app's key. The fix is to check
`cypress.config.js`'s `env.STORAGE_KEY` against
`src/js/utils/storage.js`'s `STORAGE_KEY`; the config test asserts
they match, so a failure here is a defect the config test should
have caught first.

A failure that names `tests/support/commands.js` in its stack means a
custom command failed. The command's name and its selector are in the
stack trace; the assertion inside the command is the failing line.

A failure that does not name either file is a spec failure, not a
support failure. The support files are global; a failure scoped to
one spec is the spec's.

---

## See also

- `docs/cypress-folder-structure.md` — the tree, the folder purposes,
  and the spec-name mapping.
- `docs/selector-convention.md` — the `data-cy` convention and the
  coverage register.
- `docs/event-catalog.md` — the controls and interactions the specs
  exercise.
- `cypress.config.js` — the runner's settings, including the
  `supportFile` path and the `STORAGE_KEY` env var.
