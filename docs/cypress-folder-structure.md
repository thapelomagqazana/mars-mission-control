# Cypress Folder Structure

**Status:** Finalised  
**Date finalised:** 2026-11-03  
**Owner:** QA Engineer  
**Sources of truth:**  
- `cypress.config.js` — the folder paths the runner reads
- `tests/**/README.md` — the one-line purpose per folder 
- `tests/e2e/*.cy.js` — the spec files  

**Upstream workflow specs that named the specs:**
- create-task
- read-tasks
- edit-task
- delete-tasks
- counter-search  

**Related documents:**
- Cypress configuration (`docs/cypress-configuration.md`)

---

## Purpose

This document records three things:

1. **The folder tree** the Cypress runner reads, and what each folder
   is for.
2. **The spec-name mapping** between the workflow-stage specs and the
   spec files in this project.
3. **The Cypress 10+ convention** the project follows, and the one
   deviation from the task's literal wording (the parent folder is
   `tests/`, not `cypress/`).

The folder paths are in `cypress.config.js`; this document repeats them
so a reader can see the structure without opening the config. When the
two disagree, **the config wins** and this document is corrected. The
same rule applies to the spec names: the files on disk are the truth;
the mapping table records the agreement with the upstream specs.

The tree is a **map with labelled drawers**: a folder exists because
something belongs in it, and a one-line README inside the folder says
what. A folder without a README is a drawer someone forgot to label; a
spec file without a matching upstream workflow is a drawer nobody
asked for.

---

## The tree

```
tests/
├── e2e/                    # one spec per user workflow
│   ├── README.md
│   ├── create-task.cy.js
│   ├── read-tasks.cy.js
│   ├── edit-task.cy.js
│   ├── delete-tasks.cy.js
│   └── counter-search.cy.js
├── support/                # global hooks and custom commands
│   ├── README.md
│   ├── e2e.js
│   └── commands.js
├── fixtures/               # deterministic seed data
│   ├── README.md
│   └── tasks.json
├── screenshots/            # failure artefacts (git-ignored)
├── videos/                 # optional video artefacts (git-ignored)
└── downloads/              # download artefacts (git-ignored)
```

**What the tree is not:**

- It is not `cypress/`. The runner reads `tests/` because
  `cypress.config.js` says so. A future rename to `cypress/` would be
  a config change, a folder move, and a documentation update, in one
  commit — not a convention violation.
- It does not have an `integration/` folder. Cypress 10 renamed
  `integration/` to `e2e/`; the project follows the current name. A
  reader who knows Cypress 9 sees the renamed folder and can find the
  plugin hook in the config's `setupNodeEvents`.
- It does not have a `plugins/` folder. Cypress 10 replaced
  `plugins/index.js` with `setupNodeEvents` in the config. The config
  has the function (currently a placeholder returning `config`); there
  is no file to find.

---

## Folder purposes

| Folder | Purpose | README | Config setting |
|---|---|---|---|
| `tests/e2e/` | One `.cy.js` file per user workflow. Five specs: create, read, edit, delete, counter-search. | `tests/e2e/README.md` | `e2e.specPattern` |
| `tests/support/` | Global hooks (`e2e.js`) and custom commands (`commands.js`). | `tests/support/README.md` | `e2e.supportFile` |
| `tests/fixtures/` | Deterministic seed data (`tasks.json`). | `tests/fixtures/README.md` | `e2e.fixturesFolder` |
| `tests/screenshots/` | Failure screenshots. Created at run time; git-ignored. | (none; not a source folder) | `e2e.screenshotsFolder` |
| `tests/videos/` | Optional video artefacts. Created at run time; git-ignored. | (none; not a source folder) | `e2e.videosFolder` |
| `tests/downloads/` | Download artefacts. Created at run time; git-ignored. | (none; not a source folder) | `e2e.downloadsFolder` |

**The three artefact folders are not source.** They are written by
Cypress during a run, and the `.gitignore` excludes them. A contributor
who deletes them loses nothing; a contributor who commits them adds
noise to the repository. The READMEs stop at the source folders
because the artefact folders are not places a contributor puts
anything — they are places the runner leaves things.

---

## Spec-name mapping

Each spec file is named for the workflow it tests, matching the
workflow-stage spec that declared it. The mapping is the record that
the two agree; a rename is a change to this table, the file, and the
workflow spec in the same commit.

| Upstream workflow spec | Declared name | Spec file in this project | Match? |
|---|---|---|---|
| 7.10.2 | `create-task` | `tests/e2e/create-task.cy.js` | ✅ |
| 8.8.2 | `read-tasks` | `tests/e2e/read-tasks.cy.js` | ✅ |
| 9.7.2 | `edit-task` | `tests/e2e/edit-task.cy.js` | ✅ |
| 10.9.2 | `delete-tasks` | `tests/e2e/delete-tasks.cy.js` | ✅ |
| 11.8.2 | `counter-search` | `tests/e2e/counter-search.cy.js` | ✅ |

**5 of 5 match. No deviation.**

**Why the names matter:** the workflow-stage specs are the requirements.
A failure in `delete-tasks.cy.js` names the delete workflow; a reviewer
who reads the failure knows which requirement it belongs to. A name
that does not match (`delete.cy.js`, `deleteTask.cy.js`,
`task-deletion.cy.js`) would break the link between the failing test
and the requirement it tests. The name is not decoration; it is the
traceability.

**The naming convention:** `<workflow-verb>-<object>.cy.js`.
`create-task`, `read-tasks`, `edit-task`, `delete-tasks`,
`counter-search`. The verb comes first because the workflow is a user
action; the object follows because the action is on something. A future
workflow (`archive-task`, `restore-task`) would follow the same shape,
and a row would be added to this table in the same commit.

**A workflow that spans two objects gets a name that names both**
(`counter-search` is the counter *and* the search, because the two
share the same state — the counter shows the count of the filtered
list, and the search is what changes the count). A name that names
only one would hide the relationship the spec tests.

---

## The Cypress 10+ convention

Cypress 10 was a breaking change: it renamed `integration/` to `e2e/`
and replaced `plugins/index.js` with a `setupNodeEvents` function in
the config. This project follows both, and the tree reflects it.

| Cypress 9 convention | Cypress 10+ convention | This project |
|---|---|---|
| `cypress/integration/` | `cypress/e2e/` (or `tests/e2e/` when configured) | `tests/e2e/` |
| `cypress/plugins/index.js` | `setupNodeEvents` in `cypress.config.js` | `setupNodeEvents` in the config (placeholder) |
| `cypress/support/index.js` | `cypress/support/e2e.js` | `tests/support/e2e.js` |
| `cypress.json` | `cypress.config.js` | `cypress.config.js` |

The project's deviation is the parent folder: `tests/` instead of
`cypress/`. The deviation is deliberate and recorded below; the
Cypress 10+ *conventions* (the subfolder names, the config shape, the
absence of a plugins file) are followed inside the `tests/` folder.

---

## Deviation: `tests/` instead of `cypress/`

The task's literal wording says `cypress/e2e/`, `cypress/support/`,
`cypress/fixtures/`. The project uses `tests/e2e/`, `tests/support/`,
`tests/fixtures/`. The deviation is deliberate.

**Why `tests/`:**

The project keeps source, configs, and tests in a flat tree:

```
src/         # application source
tests/       # all tests, unit and E2E
docs/        # design records
scripts/     # build and verification helpers
```

Putting the Cypress tests in `cypress/` would create a second
top-level folder for tests, alongside `tests/` for the unit tests. A
contributor looking for "the tests" would have to check two places.
The flat `tests/` tree answers the question in one place:
`tests/unit/` for Jest, `tests/e2e/` for Cypress.

**Why the config makes the deviation safe:**

`cypress.config.js` reads `specPattern`, `supportFile`, and
`fixturesFolder` from the config, not from a hardcoded `cypress/` path.
The runner does not care what the parent folder is called; it cares
where the config says the folders are. `tests/` is a valid Cypress tree
because the config says so.

**What a future rename would involve:**

A change to `cypress/e2e/` would need, in one commit:

1. Move `tests/e2e/` to `cypress/e2e/`, `tests/support/` to
   `cypress/support/`, `tests/fixtures/` to `cypress/fixtures/`.
2. Update `cypress.config.js`'s `specPattern`, `supportFile`, and
   `fixturesFolder`.
3. Update `tests/unit/node/cypressConfig.test.js` to assert the new
   paths.
4. Update this document's tree and the folder-purpose table.
5. Update the `.gitignore` if the artefact folders move.

The rename is not a convention change; it is a folder move with the
config, the test, and the doc updated together. The Cypress 10+
convention (e2e/, support/, no integration/, setupNodeEvents in the
config) is preserved either way.

---

## What belongs in each folder (the detailed version)

The README-in-folder is one line; this section is the longer
explanation for a contributor who wants to add something and is not
sure which folder it goes in.

### `tests/e2e/`

**Belongs here:** a `.cy.js` file that tests one user workflow
end-to-end. The file's `describe` block names the workflow; its `it`
cases name the individual assertions within it.

**Does not belong here:** a helper file, a fixture, a custom command, a
page-object model, or a screenshot. Those go in `tests/support/`,
`tests/fixtures/`, or the runner's artefact folders.

**When a new spec is added:** the workflow-stage spec declares it
first. The spec file is named for the workflow, and a row is added to
the mapping table above. A spec without a workflow is a test looking
for a requirement.

### `tests/support/`

**Belongs here:** `e2e.js` (global hooks) and `commands.js` (custom
commands). Nothing else.

**Does not belong here:** a helper function used by one spec. That
belongs in the spec, where it is visible and easy to delete when the
spec changes.

**When a custom command is added:** the command is justified by three
or more specs using the same multi-step interaction. Below that
threshold, a spec-local helper is simpler, easier to debug, and easier
to remove.

### `tests/fixtures/`

**Belongs here:** JSON seed data a spec loads with
`cy.fixture('...')`. The fixture provides a known state; the spec does
the interactions.

**Does not belong here:** a fixture that encodes behaviour (a script, a
sequence of interactions). Fixtures are data; behaviour is the spec's
job.

**When a new fixture is added:** the fixture is named for what it
represents (`tasks.json` for a task list, `corrupted-tasks.json` for a
list with a bad entry). The name is the description; a contributor who
needs a specific shape finds it by name.

### `tests/screenshots/`, `tests/videos/`, `tests/downloads/`

**Belongs here:** nothing. These are written by the runner and
excluded from the repository. A contributor who wants a screenshot
from a failed test opens the folder and reads it; a contributor who
wants to add a file does not.

---

## Acceptance check

- [x] `tests/e2e/` exists with a README and five spec files
- [x] `tests/support/` exists with a README, `e2e.js`, and `commands.js`
- [x] `tests/fixtures/` exists with a README and `tasks.json`
- [x] The five spec names match the upstream workflow specs (5/5)
- [x] The Cypress 10+ convention is followed (no `integration/`,
      `setupNodeEvents` in the config, no `plugins/` folder)
- [x] The deviation from the task's literal `cypress/` path is
      recorded with the reason and the rename procedure
- [x] `cypress verify` still passes (the config is unchanged)
- [x] Each source folder has a one-line README
- [x] The tree in this document matches the tree on disk
- [x] The spec-name mapping has no mismatches
