# Mars Mission Control

A vanilla-JavaScript single-page application for managing mission tasks,
built with webpack and tested with Jest and Cypress. The app stores
tasks in the browser's `localStorage`; there is no backend.

The interface is a dark mission-control dashboard with Mars imagery,
a sticky header, a sidebar showing the current commander and the live
task count, a search bar, and a responsive task list.

---

## What it does

- **Create** a task with a title, description, creator, and assignee.
- **Read** the task list; an empty list shows the empty state with a
  call to action.
- **Edit** a task; changes are validated and persisted.
- **Delete** a single task, or **clear all** tasks.
- **Search** by title, description, or assignee; the counter shows
  the count of the filtered list.
- **Persist** tasks across reloads in `localStorage`.

Every UI control has a documented behaviour in
[`docs/event-catalog.md`](docs/event-catalog.md). Every task field has a
documented rule in [`docs/schema.md`](docs/schema.md).

---

## Requirements

| Tool | Version | Why |
|---|---|---|
| Node.js | `>=22.13.0 <23` | The runtime the project is built and tested on. The exact pin is in `package.json`'s `engines` field and `.nvmrc`. |
| npm | `>=10.9.0 <11` | The package manager bundled with Node 22.13. |

If you use `nvm`:

```bash
nvm use
```

The `.nvmrc` pins the version; `nvm use` reads it.

---

## Install

```bash
npm ci
```

Use `npm ci`, not `npm install`. The lockfile pins the exact
dependency tree the project was built and tested with; `npm ci`
installs from that tree and fails if `package.json` and the lockfile
disagree. `npm install` may resolve a different tree and reintroduce
drift.

Cypress downloads its binary on first install. If the download is
blocked (a corporate proxy, a firewall), `npm ci` still succeeds — the
npm package installs without the binary. Run:

```bash
npm run verify:cypress
```

to confirm the binary is present. A non-zero exit means the download
did not complete; `npx cypress install` retries it with verbose
output.

---

## Run

```bash
npm start
```

Opens `http://localhost:8080` in your default browser. The dev server
rebuilds on save; a change to a source file is visible after a page
refresh.

For a production build:

```bash
npm run build
npx serve dist -l 5050
```

Open `http://localhost:5050`. The production bundle is in `dist/`.

---

## Test

```bash
npm test
```

Runs the unit tests (Jest). The suite has two projects:

- **`node`** — the data-layer tests (`schema`, `taskStore`,
  `validationMapping`, `storage`, `npmScripts`, `cypressConfig`).
- **`jsdom`** — the view-layer tests (`renderContract`,
  `eventCatalog`).

Both run in one `npm test`; the project name appears next to each
result.

For the end-to-end suite:

```bash
npm run test:e2e        # headless, CI-style
npm run test:e2e:open   # interactive
```

The E2E suite runs against the production build; `pretest:e2e` builds
it first. The tests target `data-cy` selectors, documented in
[`docs/selector-convention.md`](docs/selector-convention.md).

---

## Verify

```bash
npm run verify
```

Runs the full verification chain, in order:

1. **`verify:cypress`** — confirms Cypress's binary is present and the
   version matches the pin.
2. **`lint:syntax`** — a syntax check on every source file.
3. **`test`** — the unit tests.
4. **`build`** — the production bundle.
5. **`test:e2e`** — the end-to-end suite against the built output.

The ordering is deliberate: a fast failure (a missing Cypress binary)
comes before the slow steps. If `verify` fails, the failing step's
output names the problem; the doc for each step is in
[`docs/npm-scripts.md`](docs/npm-scripts.md).

---

## Scripts

The full inventory is in [`docs/npm-scripts.md`](docs/npm-scripts.md).
The ones you need most:

| Command | What it does |
|---|---|
| `npm start` | Start the dev server at `http://localhost:8080`. |
| `npm run build` | Build the production bundle into `dist/`. |
| `npm test` | Run the unit tests. |
| `npm run test:e2e` | Run the E2E suite (headless). |
| `npm run test:e2e:open` | Run the E2E suite interactively. |
| `npm run verify` | Run everything; the pre-submit check. |
| `npm run verify:cypress` | Confirm the Cypress binary is present. |
| `npm run check:layers` | Confirm the layer dependencies are respected. |

---

## Project structure

```
src/
├── index.html              # the page shell
├── css/
│   └── styles.css          # the mission-control theme
├── assets/                 # local images (the Mars hero is remote)
└── js/
    ├── index.js            # entry point — boots the app
    ├── app.js              # event layer — wires views, store, events
    ├── store/
    │   ├── schema.js       # the task schema (single source of truth)
    │   ├── validators.js   # field-level validation rules
    │   ├── taskStore.js    # create, read, update, delete
    │   └── errors.js       # ValidationError, NotFoundError, StorageError
    ├── events/
    │   ├── debounce.js     # the search debounce
    │   ├── keyboard.js     # Enter, Escape, keyboard interactions
    │   └── focus.js        # focus on open, focus restore on close
    ├── views/
    │   ├── dashboard.js    # the layout regions
    │   ├── taskList.js     # the list, or the empty state
    │   ├── taskCard.js     # one task card
    │   ├── emptyState.js   # the empty state (no tasks / no results)
    │   ├── counter.js      # the live task count
    │   ├── search.js       # the search summary and results
    │   └── dialog.js       # the create/edit dialog
    └── utils/
        ├── dom.js          # element creation and manipulation helpers
        └── storage.js      # the localStorage adapter

tests/
├── unit/
│   ├── node/               # data-layer tests
│   └── jsdom/              # view-layer tests
├── e2e/                    # Cypress specs, one per workflow
├── support/                # Cypress global hooks and commands
└── fixtures/               # seed data for the E2E specs

docs/                       # design records (see "Documentation" below)
scripts/                    # verification helpers
```

The layer boundaries are documented in
[`docs/layers-and-dependencies.md`](docs/layers-and-dependencies.md) and
enforced by `npm run check:layers`.

---

## Architecture

The application is split into five layers, each with a single
responsibility:

| Layer | Responsibility | Where |
|---|---|---|
| **Domain / state** | Task data, validation, identity | `src/js/store/` |
| **Persistence** | Read and write tasks to `localStorage` | `src/js/utils/storage.js` |
| **Rendering / view** | Produce DOM from data | `src/js/views/` |
| **Event handling** | Listen, call the store, re-render | `src/js/app.js`, `src/js/events/` |
| **Startup / entry** | Wire the layers, boot | `src/js/index.js` |

Every layer's allowed dependencies are in the dependency matrix in
`docs/layers-and-dependencies.md`. The view must not import the store
directly; the entry layer is the only composition root. `check:layers`
enforces the rules.

---

## Documentation

The project keeps its design decisions in `docs/`, not in commit
messages or in the code's comments alone. Each document is a contract;
the tests enforce it. Start with the one whose question you have:

| Question | Document |
|---|---|
| What does the app do, control by control? | [`docs/event-catalog.md`](docs/event-catalog.md) |
| What are the task fields and their rules? | [`docs/schema.md`](docs/schema.md) |
| What does the store promise? | [`docs/store-contract.md`](docs/store-contract.md) |
| Which view owns which DOM? | [`docs/rendering-contract.md`](docs/rendering-contract.md) |
| How do views find each other in tests? | [`docs/selector-convention.md`](docs/selector-convention.md) |
| What are the npm scripts and why? | [`docs/npm-scripts.md`](docs/npm-scripts.md) |
| How is Cypress configured? | [`docs/cypress-configuration.md`](docs/cypress-configuration.md) |
| How is the Cypress tree organised? | [`docs/cypress-folder-structure.md`](docs/cypress-folder-structure.md) |

---

## Limitations

These are deliberate and disclosed:

- **No backend.** Tasks live in `localStorage`. Clearing browser data
  clears tasks; two browser tabs do not share state across a reload
  reliably. The app is a single-user, single-browser tool.
- **No cloud recording.** Cypress runs headless, locally or in CI, and
  writes JUnit XML. There is no Cypress Cloud dashboard. The decision
  is recorded in `docs/npm-scripts.md`.
- **The Mars hero image is remote.** It loads from Unsplash; if the
  network blocks it, the layout degrades gracefully (the fallback
  background is visible). The E2E support file tolerates the image's
  failure and does not let it fail a test.
- **The commander identity is demonstration data.** The app does not
  have authentication; "Commander Aria Vance" is a hardcoded name
  shown in the sidebar. A real deployment would replace it with the
  signed-in user.
- **`window.confirm()` is used for destructive confirmations.** The
  browser's native confirm is the current confirmation mechanism. A
  styled in-app dialog is a future improvement; the current behaviour
  is documented in the event catalog.
- **No i18n.** The app is English-only. A future localisation would
  touch the view labels and the error messages; the validation
  contract and the store are language-agnostic.

---

## Testing philosophy

Three things are worth knowing before you read the test suite:

1. **The tests are the contract, and the contracts are the docs.** A
   test that asserts `viewportWidth === 1280` and a doc that says "the
   desktop breakpoint is 1024" are not independent facts; the test and
   the doc agree because one is the enforcement of the other. When a
   test fails, the first question is "which of the doc, the test, or
   the code is wrong?", not "how do I make the test pass?"

2. **The layers are tested at their boundaries.** The store is tested
   without a browser (`tests/unit/node/taskStore.test.js`); the views
   are tested without a store (`tests/unit/jsdom/renderContract.test.js`);
   the wiring is tested end-to-end (`tests/e2e/`). A test that mocks
   the store in a view test would be testing the mock, not the view;
   the split is deliberate.

3. **The E2E suite tests the shipped artifact.** `pretest:e2e` builds
   the production bundle; the suite runs against `dist/`, not the dev
   server. A change that works in dev and breaks in the build is a
   change that does not work, and the suite catches it.

---

## Contributing

The project has a small set of conventions; the docs are the source
of truth. Before changing a file, read the doc it implements:

- Changing a **task field** — read `docs/schema.md` first. A field
  enters the schema only when a requirement names a consumer; the
  declared-absent list is enforced in code.
- Changing a **store operation** — read `docs/store-contract.md` first.
  Every operation has a signature card; the tests assert the card.
- Changing a **view** — read `docs/rendering-contract.md` first. Every
  view owns a DOM subtree; two views owning one node is a defect, and
  the ownership test catches it.
- Changing an **event** — read `docs/event-catalog.md` first. Every
  row is a handler and an outcome; a row without a handler fails the
  E2E spec.
- Adding a **test** — read `docs/selector-convention.md` first.
  Critical-flow tests use `data-cy` only; a `data-cy` that is not in
  the register is a defect, and the coverage test catches it.

A change that updates one file without updating the doc it implements
is a change the tests will catch. Run `npm run verify` before
submitting.

---

## License

`MIT`
