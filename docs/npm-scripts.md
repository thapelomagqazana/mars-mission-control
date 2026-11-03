# npm Scripts

**Status:** Finalised  
**Date finalised:** 2026-11-03  
**Owner:** Build/Release Engineer  
**Source of truth:** `package.json`'s `scripts` block  

---

## Purpose

This document is the reviewable summary of every npm script in the
project. A developer who wants to know "how do I run the tests?" or
"what does `npm run verify` do?" reads one table, not the manifest's
`scripts` block.

When the manifest and this table disagree, **the manifest wins** and
the table is corrected. The test asserts the manifest's values; the
table is the prose summary.

---

## The scripts

### Development

| Script | Command | Purpose | When to use it |
|---|---|---|---|
| `start` | `webpack serve --mode development --open` | Start the dev server and open the browser. | The first thing a developer runs after `npm install`. |
| `dev` | `webpack serve --mode development` | Start the dev server without opening the browser. | A script or a second terminal that wants the server without a browser pop-up. |
| `build` | `webpack --mode production` | Build the production bundle into `dist/`. | Before serving the production output; the `pretest:e2e` hook runs it. |
| `build:dev` | `webpack --mode development` | Build a development bundle into `dist/`. | Debugging a production-only issue with source maps. |
| `clean` | `rimraf dist` | Remove `dist/`. | When a stale build is suspected. Cross-platform (the script uses `rimraf`, not `rm -rf`). |

### Testing — unit

| Script | Command | Purpose | When to use it |
|---|---|---|---|
| `test` | `jest` | Run the unit tests (both the `node` and `jsdom` projects). | Every code change. Fast (under a second per project). |
| `test:watch` | *(not configured)* | Run Jest in watch mode. | A future addition; the current suite is fast enough to run once. |

### Testing — end-to-end

| Script | Command | Purpose | When to use it |
|---|---|---|---|
| `test:e2e` | `cypress run` | Run the E2E suite headless, against the base URL from `cypress.config.js`. The `pretest:e2e` hook builds the production bundle first. | CI and a local pre-submit check. |
| `test:e2e:open` | `cypress open` | Open the Cypress interactive runner. | A developer watching the tests run, debugging a failure, or writing a new spec. |
| `test:e2e:headless` | `cypress run --browser chrome --headless` | Run the suite headless in Chrome specifically. | A local run that wants Chrome's behaviour (the default `cypress run` uses Electron). |
| `test:e2e:ci` | `cypress run --browser chrome --headless` | The CI run: headless, Chrome. Identical to `test:e2e:headless` today; the name is the contract for "what CI runs". | CI. |
| `test:e2e:report` | `cross-env CI=true cypress run --browser chrome --headless` | The CI run with `CI=true` set explicitly, so the config's JUnit reporter writes to `tests/results/`. | CI that wants the JUnit XML artefact without relying on the CI provider to set `CI`. |

**Why `test:e2e` and `test:e2e:headless` are different:** `test:e2e`
uses Cypress's default browser (Electron). `test:e2e:headless` uses
Chrome. The two produce different results when the app depends on a
browser-specific behaviour; the distinction is real, and the names
reflect it.

**Why `test:e2e:ci` exists when `test:e2e:headless` already does the
same thing:** the name is the contract. A CI job that reads
`npm run test:e2e:ci` knows the command is what the project runs in
CI. A future change that adds a CI-only flag (e.g. `--record`, a
custom reporter) changes `test:e2e:ci` and not `test:e2e:headless`;
the two are allowed to diverge because their contracts differ.

### Verification

| Script | Command | Purpose | When to use it |
|---|---|---|---|
| `verify` | `npm run verify:cypress && npm run lint:syntax && npm run test && npm run build && npm run test:e2e` | The full verification chain: Cypress binary present, syntax check, unit tests, production build, E2E suite. | Before claiming a change works. The sequence is ordered so a fast failure (missing Cypress) comes before the slow steps. |
| `verify:cypress` | `bash scripts/verify-cypress.sh` | The Cypress install check: exact pin, binary present, version matches. | A CI job that wants to fail fast on a broken Cypress install; `verify` calls it first. |
| `lint:syntax` | `node --check src/js/*.js` (each file) | A syntax check on every source file. | Fast feedback on a syntax error before Jest or webpack runs. |
| `check:layers` | `bash scripts/check-layers.sh` | The layer dependency check: the view must not import state or persistence; the entry layer is the only one allowed to import everything. | Before a refactor that moves code between layers. |

---

## The decisions

### `--record` (Cypress Cloud): not used

**Decision:** the suite does not record to Cypress Cloud.

**Rationale:** the assessment's evidence requirement is a JUnit XML
file and a report, both of which are produced locally. A cloud
dashboard is a convenience, and it would add a network call and a
secret (`CYPRESS_RECORD_KEY`) to the CI pipeline for a benefit the
assessment does not require.

**What a future change that wants recording looks like:** a new
script `test:e2e:record` with `--record --key $CYPRESS_RECORD_KEY`,
documented in this file, and a CI job that provides the secret. The
existing scripts are unchanged; the change is additive.

### Reporter: built-in `junit`, no new dependency

**Decision:** the JUnit reporter is Cypress's built-in one, selected
by `cypress.config.js` when `CI=true`. No `mocha-junit-reporter`,
no `cypress-mochawesome-reporter`.

**Rationale:** Cypress 13 ships a JUnit reporter. GitHub Actions,
GitLab, and Jenkins parse JUnit XML natively. A third-party reporter
would be a second reporter to maintain and a second output format to
parse — for a format the built-in reporter already produces.

**What a future change that wants a different reporter looks like:**
a new dependency, a config change to select it, a documentation
change in this file and in `docs/cypress-configuration.md`, and a
CI job that parses the new format. The change is visible in a diff;
the current scripts do not carry a dependency that a future change
would have to remove.

### Portability: `cross-env` for env vars

**Decision:** `test:e2e:report` uses `cross-env` to set `CI=true`
portably.

**Rationale:** `CI=true cypress run` is POSIX shell syntax. On
Windows, it is parsed as "run the `CI` command", which fails. The
project's `engines` do not require Windows, but a developer on any OS
should be able to run the CI-shaped command locally. `cross-env` is
small, has no dependencies, and is the standard fix.

**The dependency:** `cross-env` is a `devDependency`. Its version is
pinned with `--save-exact` to match the Cypress convention: it is a
tool whose behaviour affects the test command, and a minor-version
change is a small risk. A future contributor who prefers a caret can
change the pin; the trade-off is the same as for Cypress.

---

## Acceptance check

- [x] `test:e2e` exists and matches the naming convention
- [x] `test:e2e:open` exists and matches the naming convention
- [x] `test:e2e:ci` exists (the CI-shaped headless run)
- [x] `test:e2e:report` exists (the JUnit-producing run)
- [x] `--record` decision is recorded (not used, with rationale)
- [x] Reporter decision is recorded (built-in JUnit, no new dependency)
- [x] `cross-env` dependency is documented with its rationale and pin
- [x] Every script is described in this file with its purpose
- [x] `npm run test:e2e -- --spec <path>` dry-run is executable
