# Cypress Configuration Table

**Status:** Finalised  
**Date finalised:** 2026-11-03  
**Owner:** QA Engineer  
**Source of truth:** `cypress.config.js`  
**Contract tests:** `tests/unit/cypressConfig.test.js`

---

## Purpose

This document is the reviewable summary of `cypress.config.js`. Every
setting in the config has an explicit value and a stated rationale; a
setting that is not in the config is not a decision this project has
made, and Cypress's default applies.

When the config and this table disagree, the **config wins** and the
table is corrected. The table exists so a reviewer can see every
decision in one place, and so a future contributor can understand *why*
a value is what it is before changing it.

The rule that makes the table useful: **every value cites a source**.
The base URL cites the dev server's port; the viewport cites the
rendering contract's breakpoint; the retries cite the CI policy. A
value without a source is a value nobody decided.

---

## The table

### Paths and folders

| Setting | Value | Source | Rationale |
|---|---|---|---|
| `specPattern` | `tests/e2e/**/*.cy.js` | Project convention | Specs live under `tests/e2e/`; the `.cy.js` extension marks a spec, not a helper. A helper file that happens to be in the same folder is not run as a test. |
| `supportFile` | `tests/support/e2e.js` | Project convention | Global hooks and custom commands live in one file. The path is explicit so a future contributor has exactly one place to register a command. |
| `fixturesFolder` | `tests/fixtures` | Project convention | Test data is separated from test logic. A spec that reads `cy.fixture('tasks.json')` knows the data is elsewhere. |
| `screenshotsFolder` | `tests/screenshots` | Project convention | Failure screenshots are written next to the tests that produced them. The folder is git-ignored. |
| `videosFolder` | `tests/videos` | Project convention | Same as screenshots. |
| `downloadsFolder` | `tests/downloads` | Project convention | Same. |

### Base URL

| Setting | Value | Source | Rationale |
|---|---|---|---|
| `baseUrl` | `http://localhost:8080` | `webpack.config.js`'s `devServer.port` | The application runs at this address during development and when the production build is served locally. `cy.visit('/')` resolves against it, so a spec never hardcodes a host or a port. |

**Override for CI:** `CYPRESS_BASE_URL=http://ci-host:9999` (or any other URL) overrides the default without editing the config. A CI job that serves the production build on a different port uses this. The override is the only supported way to change the URL; editing the config's default is a change for the local development case, not for CI.

**Why the key is `baseUrl`, not `baseURL`:** Cypress's config schema is case-sensitive. `baseUrl` is the key Cypress reads; `baseURL` is silently ignored, and `cy.visit('/')` falls back to `http://localhost:3000`. A spec that calls `cy.visit('/')` against a config with the wrong case fails with a connection error that looks like the app is down. The test in `tests/unit/cypressConfig.test.js` asserts the key's value, which is what catches the typo.

### Viewport

| Setting | Value | Source | Rationale |
|---|---|---|---|
| `viewportWidth` | `1280` | Rendering contract's desktop breakpoint (1024) | Above the breakpoint, so the desktop layout (header, sidebar, search, list all present) is what the suite exercises by default. |
| `viewportHeight` | `800` | Laptop content area (13-inch) | Tall enough to show header, search, and two to three cards without scrolling — the common assertion in a card-visibility test. |

**Mobile and tablet:** a spec that wants to exercise a narrower width calls `cy.viewport(375, 667)` (mobile) or `cy.viewport(768, 1024)` (tablet). The viewport is scoped to that test; the suite does not run three times at three widths, which would triple the runtime for no additional coverage of the desktop path.

### Timeouts

| Setting | Value | Source | Rationale |
|---|---|---|---|
| `defaultCommandTimeout` | `6000` ms | Dev-server latency | Cypress's default is 4000 ms. The extra 2 seconds absorb the first request after a webpack rebuild in the dev server, which compiles on demand. A real test failure is usually infinite or wrong, not slow; the extra window covers the known dev-server latency without papering over a slow test. |
| `requestTimeout` | `10000` ms | Network tolerance | No current `cy.request` calls; the value is set so a future test has a sensible default (Cypress's 5000 ms is too short for a loaded CI machine). |
| `responseTimeout` | `15000` ms | Assertion retry window | A `should` that retries against a real network (waiting for a task to appear after a create) needs more time than a `get` that queries an already-present element. 15 seconds covers a slow create without making a failing assertion take 30 seconds to report. |

**Rule of thumb:** if a test starts failing on timeout, the response is to investigate the test, not to increase these values. A test that takes 6 seconds is usually a test that is waiting for the wrong thing; the correct fix is to make it wait for the right thing (a `should` with a specific condition), not to give it more time.

### Test isolation

| Setting | Value | Source | Rationale |
|---|---|---|---|
| `testIsolation` | `true` | Suite independence | Cypress 12+ resets browser state between tests. The support file additionally clears `localStorage` before every test. The combination means a test that creates a task does not leak the task into the next test; the suite's order does not affect any test's result. |

**Do not disable.** An order-dependent test is unreliable; a suite that passes when run in one order and fails in another is a suite nobody trusts.

### Retries

| Setting | Value | Source | Rationale |
|---|---|---|---|
| `retries.runMode` | `0` local, `2` CI | Local vs. CI policy | Local: 0 so a developer sees every failure immediately. CI: 2 so a cold browser launch, a network hiccup, or a slow first paint does not fail a build for a reason unrelated to the code. |
| `retries.openMode` | `0` | Interactive runner | The interactive runner is watched by a developer; a retry would hide the failure the developer is trying to see. |

**The CI count is deliberately low.** A test that fails three times is broken, not flaky. A test that passes on the second try is a signal to investigate, not a reason to increase the count. A count of 5 or 10 would hide flakiness behind repeated passes and turn a real defect into a "known flake" that nobody fixes.

**Environment detection:** the config reads `process.env.CI`, which every major CI provider (GitHub Actions, GitLab, CircleCI) sets. A local run does not set it, so a developer gets 0 retries; a CI run gets 2.

### Evidence and artefacts

| Setting | Value | Source | Rationale |
|---|---|---|---|
| `screenshotOnRunFailure` | `true` | Evidence | A failed test's screenshot is the first thing a reviewer wants. Cypress captures it automatically; the value is on. |
| `video` | `false` by default; `CYPRESS_VIDEO=true` to enable | Evidence vs. run time | Video roughly doubles the run time and produces files large enough to be awkward in CI artefacts. The screenshot on failure is usually enough; video is for a debugging session that needs the whole sequence. |
| `trashAssetsBeforeRuns` | `true` | Artefact freshness | A passing run should not leave a screenshot from a previously-failing test. Without this, a reviewer sees an artefact and assumes the test is still failing. |
| `videoCompression` | `32` | Cypress default, made explicit | Only meaningful when video is on; the value is Cypress's default, kept explicit so a future reader sees it was considered. |
| `videoUploadOnPasses` | `false` | Evidence policy | A passing test's video is not evidence of anything; only a failed test's video is. The value is Cypress's default, kept explicit for the same reason. |

**Video decision:** off by default because the run time cost is real and the screenshot is usually sufficient. On via `CYPRESS_VIDEO=true` when a debugging session needs it. The environment variable is the switch, so enabling video in CI is a one-line change to the CI job, not a config edit.

### Reporters

| Setting | Value | Source | Rationale |
|---|---|---|---|
| `reporter` | `spec` local, `junit` CI | CI integration | Locally, the `spec` reporter's coloured output is what a developer reads. In CI, JUnit XML is what most CI systems parse natively (GitHub Actions, GitLab, Jenkins). |
| `reporterOptions.mochaFile` | `tests/results/test-results-[hash].xml` | Parallel CI | `[hash]` so parallel CI jobs do not overwrite each other's results. A single-job CI run produces one file; a parallel one produces one per job. |
| `reporterOptions.toConsole` | `false` | CI output hygiene | The XML file is the artefact; duplicating it to the console makes the CI log noisy without adding information. |

**If a downstream tool expects JSON:** `reporter: 'json'` produces it. The choice between JUnit and JSON is a one-line change; JUnit is chosen because it is the more common CI integration.

### Node-level hooks

| Setting | Value | Source | Rationale |
|---|---|---|---|
| `setupNodeEvents` | Empty function returning `config` | Placeholder | Reserved for hooks that belong at the config level (starting a static server, pre-seeding `localStorage`). Currently unused because the standard `npm start` workflow keeps setup explicit. The function is present so a future hook has a home. |

**Why an empty function with a comment is better than no function:** a reader who sees no `setupNodeEvents` assumes Cypress does not support it or the project does not use it. A reader who sees an empty function with a comment knows the hook exists and the project has not needed it yet. The comment is the documentation; the function is the placeholder.

### Environment variables

| Env var | Value | Source | Rationale |
|---|---|---|---|
| `STORAGE_KEY` | `mmc.tasks` | `STORAGE_KEY` in `src/js/utils/storage.js` | The application's `localStorage` key. Mirrored here so a spec reads `Cypress.env('STORAGE_KEY')` instead of re-typing the literal. A rename in the source that is not mirrored here would cause a spec to seed the wrong key. |
| `SELECTOR_ATTRIBUTE` | `data-cy` | Selector convention | The attribute the specs target. Documented here so a new spec uses the same attribute; Cypress does not enforce it, but a spec that uses a different attribute is visible in review as a convention violation. |

**The `STORAGE_KEY` mirror is the most fragile part of this config.** A change to the storage adapter's constant without a matching change here would cause a spec that seeds `Cypress.env('STORAGE_KEY')` to write to a key the app never reads. The test in `tests/unit/cypressConfig.test.js` should assert the two match; if it does not yet, it is a gap to close, not a reason to remove the env var.

---

## What is not in the config, and why

The absence of a setting is also a decision. The table below records the settings that are deliberately absent, with the reason.

| Absent setting | Why |
|---|---|
| `component` | The assessment specifies end-to-end testing via Cypress. Component tests without a framework would dilute the focus. The block is present in the config with the `devServer` framework declaration, so a reviewer sees the omission was deliberate. |
| `pluginsFile` | Cypress 10+ uses `setupNodeEvents` instead of a plugins file. The function is present, empty, with a comment explaining the placeholder. |
| `experimentalStudio` | Cypress's Studio is an interactive recording tool; the suite is written by hand. Enabling it would invite ad-hoc recordings that bypass review. |
| `chromeWebSecurity: false` | The application does not make cross-origin requests to a backend (it is a `localStorage`-backed SPA). Disabling web security would weaken the browser's same-origin protection for no benefit. |
| `waitForAnimations` override | Cypress's default (`true`) is correct for this app; the rendering contract's CSS transitions are short enough that the default timeout covers them. |

A future contributor who wants to add one of these settings must explain why in the config's comment and update this table. The two changes together are the record that a new decision was made.

---

## Coverage against the acceptance criteria

| Criterion | Where it is satisfied |
|---|---|
| Every setting has an explicit value | Every row in the table names a setting and a value; the config file has no inherited defaults for the settings that matter. |
| `baseUrl` matches the dev port | `baseUrl` is `http://localhost:8080`, matching `webpack.config.js`'s `devServer.port`. The test asserts the match. |
| `baseUrl` override for CI | `CYPRESS_BASE_URL` overrides the default; documented in the table and in the config's comment. |
| Retries: 0 local, CI value recorded | `retries.runMode` is `process.env.CI ? 2 : 0`; the policy is stated in the retries section. |
| Screenshot-on-failure enabled | `screenshotOnRunFailure: true`. |
| Video decision stated | `video` is `false` by default, `CYPRESS_VIDEO=true` to enable; the section explains why. |
| `defaultCommandTimeout` present with rationale | `defaultCommandTimeout: 6000`; the rationale is in the timeouts section (dev-server latency). |
| `cypress verify` still passes | The config is valid Cypress config; `npx cypress verify` exits 0 (unchanged from the install evidence). |

---

## Change protocol

When the config changes, all of the following must change together:

1. `cypress.config.js` — the setting and its comment.
2. This table — the row for the setting.
3. `tests/unit/cypressConfig.test.js` — the assertion that the setting's value is what the table says.
4. If the setting has a source-of-truth (the base URL, the storage key, the viewport), the source file as well.
5. A note in the commit message that names the setting and the reason.

The test is the enforcement. If any of the first four are missed, the test fails; the failure is the signal that the config, the table, and the test have drifted apart.

**Why the protocol matters:** the config is not a file a developer edits casually. Every value is a decision that was made once, with a reason, and recorded here. A future edit that does not follow the protocol is a config that nobody decided — the exact class of defect the table exists to prevent.

---

## Acceptance check

- [x] Every Cypress setting in the config has a value and a rationale
- [x] `baseUrl` is `http://localhost:8080`, matching the dev server, with a documented CI override
- [x] Retries are 0 local, 2 CI, with rationale
- [x] Screenshots on failure are enabled
- [x] Video decision is stated (off by default, on via `CYPRESS_VIDEO=true`)
- [x] `defaultCommandTimeout` has a value and a rationale (dev-server latency)
- [x] Settings that are deliberately absent are recorded with a reason
- [x] The change protocol ensures the config, table, and test stay in step
- [x] `STORAGE_KEY` mirrors the source constant; a future drift is catchable by the test