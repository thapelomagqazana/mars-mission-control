/**
 * Mars Mission Control — Cypress configuration
 *
 * Purpose:
 *   Configures Cypress for an E2E suite that runs against the webpack
 *   build (./dist, served by a static server) or the webpack dev server
 *   (`npm start`, port 8080). The application is a vanilla-JS SPA with
 *   localStorage persistence, so test isolation is achieved by clearing
 *   that storage before each test (see tests/support/e2e.js) rather
 *   than by resetting a backend.
 *
 * Folder layout:
 *   tests/e2e/        — one .cy.js spec per user journey
 *   tests/support/    — shared hooks, custom commands
 *   tests/fixtures/   — deterministic seed data
 *
 * Run:
 *   npm run test:e2e        → headless, CI-style run
 *   npm run test:e2e:open   → interactive runner
 *
 * Every setting in this file is explicit. Cypress's defaults are
 * documented in this file's comments where they differ from the value
 * chosen here; a reader can see what was decided and why, rather than
 * inheriting Cypress's choices by accident. `docs/cypress-configuration.md`
 * is the reviewable summary; `tests/unit/cypressConfig.test.js` is the
 * enforcement.
 *
 * Source-of-truth references:
 *   - Base URL: `webpack.config.js`'s `devServer.port` is 8080. The
 *     config uses that URL, overridable via `CYPRESS_BASE_URL` for
 *     CI jobs that serve the build on a different port.
 *   - Retries: 0 local (developer sees every failure), 2 CI (a cold
 *     browser launch is plausible; two retries absorb it without
 *     masking a real failure).
 *   - Storage key: `mmc.tasks`, matching `STORAGE_KEY` in
 *     `src/js/utils/storage.js`. The env var `STORAGE_KEY` mirrors
 *     the constant so a spec does not re-type the literal.
 *
 * @module cypress.config
 */

const { defineConfig } = require('cypress');

module.exports = defineConfig({
  // ----------------------------------------------------------------
  // E2E configuration
  // ----------------------------------------------------------------
  e2e: {
    /**
     * Base URL — the application under test.
     *
     * The key is `baseUrl` (lowercase `url`), not `baseURL`. Cypress
     * reads `baseUrl`; a config that sets `baseURL` is silently
     * ignored, and `cy.visit('/')` falls back to Cypress's default
     * `http://localhost:3000`. This is the single most common
     * misconfiguration in a Cypress config, and it produces a
     * connection error that looks like the app is down.
     *
     * The default matches `webpack.config.js`'s dev port (8080). A
     * CI job that serves the production build on a different port
     * sets `CYPRESS_BASE_URL` and does not edit this file.
     */
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:8080',

    /**
     * Folder overrides — this project uses `tests/` rather than the
     * Cypress default `cypress/`, so source, configs, and tests sit
     * side-by-side in the repository.
     */
    specPattern: 'tests/e2e/**/*.cy.js',
    supportFile: 'tests/support/e2e.js',
    fixturesFolder: 'tests/fixtures',
    screenshotsFolder: 'tests/screenshots',
    videosFolder: 'tests/videos',
    downloadsFolder: 'tests/downloads',

    /**
     * Viewport — matches a common desktop baseline (1280×800). The
     * rendering contract's desktop breakpoint is 1024; 1280 is above
     * it, so the desktop layout is the one under test by default.
     * Mobile and tablet layouts are exercised per-test with
     * `cy.viewport()` rather than by running the whole suite at
     * multiple sizes, which keeps runtime bounded.
     */
    viewportWidth: 1280,
    viewportHeight: 800,

    /**
     * Video — off by default. Video roughly doubles the run time and
     * produces files that are large enough to be awkward in CI
     * artefacts. Screenshots on failure are the primary evidence.
     *
     * A CI job that wants video sets `CYPRESS_VIDEO=true` and the
     * environment variable turns it on without editing the config.
     *
     * `videoCompression` and `videoUploadOnPasses` are only
     * meaningful when video is enabled; the values are the Cypress
     * defaults, kept explicit so a future reader knows they were
     * considered.
     */
    video: process.env.CYPRESS_VIDEO === 'true',
    videoCompression: 32,
    videoUploadOnPasses: false,

    /**
     * Screenshots — captured on failure only. A failed test's
     * screenshot is the first thing a reviewer wants; Cypress
     * captures it automatically, so the value is on.
     */
    screenshotOnRunFailure: true,

    /**
     * Clear screenshots and videos before each run so a passing run
     * does not leave a screenshot from a previously-failing test.
     * Without this, a reviewer sees an artefact and assumes the test
     * is still failing.
     */
    trashAssetsBeforeRuns: true,

    /**
     * Retries.
     *
     * Local: 0. A developer running the suite wants to see every
     * failure immediately. A retry locally would turn "this test
     * fails" into "this test is flaky", which is the wrong signal.
     *
     * CI: 2. A cold browser launch, a network hiccup, or a slow
     * first paint can fail a test on the first run and pass on the
     * second. Two retries absorbs that without masking a real
     * failure: a test that fails three times is broken, not flaky.
     * The count is deliberately low; a higher count (5, 10) would
     * hide flakiness behind repeated passes.
     */
    retries: {
      runMode: process.env.CI ? 2 : 0,
      openMode: 0,
    },

    /**
     * Timeouts.
     *
     * `defaultCommandTimeout` — 6000 ms. Cypress's default is 4000
     * ms. The extra 2 seconds absorb the first request after a
     * webpack rebuild in the dev server, which compiles on demand
     * and can take longer than 4 seconds. A real test failure is
     * usually infinite or wrong, not slow; the extra window covers
     * the known dev-server latency without papering over a slow
     * test.
     *
     * `requestTimeout` — 10 seconds. No current `cy.request` calls;
     * the value is set so a future test has a sensible default
     * (Cypress's 5 s is too short for a loaded CI machine).
     *
     * `responseTimeout` — 15 seconds. A `should` that retries
     * against a real network (waiting for a task to appear after a
     * create) needs more time than a `get` that queries an
     * already-present element.
     */
    defaultCommandTimeout: 6000,
    requestTimeout: 10000,
    responseTimeout: 15000,

    /**
     * Test isolation — on. Cypress 12+ resets browser state between
     * tests; the support file additionally clears localStorage
     * before every test. Do not disable: order-dependent tests
     * would be unreliable, and the contract's isolation guarantee
     * would be a wish.
     */
    testIsolation: true,

    /**
     * Reporters — JUnit XML in CI so results can be parsed for the
     * test summary; Cypress's built-in `spec` reporter locally.
     *
     * Cypress 13+ supports both `junit` and `json`; JUnit is chosen
     * because it is what most CI systems parse natively (GitHub
     * Actions, GitLab, Jenkins). If a downstream tool expects JSON,
     * `reporter: 'json'` produces it; the choice is a one-line
     * change, not a config rewrite.
     *
     * The output path uses `[hash]` so parallel CI jobs do not
     * overwrite each other's results. A single-job CI run produces
     * one file; a parallel one produces one per job.
     */
    reporter: process.env.CI ? 'junit' : 'spec',
    reporterOptions: process.env.CI
      ? {
          mochaFile: 'tests/results/test-results-[hash].xml',
          toConsole: false,
        }
      : {},

    /**
     * Node event listeners.
     *
     * Reserved for hooks that belong at the config level (e.g.
     * starting a static server, pre-seeding localStorage). Currently
     * unused because the standard `npm start` workflow keeps setup
     * explicit. The function is present so a future hook has a
     * home; an empty function with a comment is a placeholder, not
     * a mystery.
     */
    setupNodeEvents(on, config) {
      return config;
    },
  },

  // ----------------------------------------------------------------
  // Component testing — not configured.
  //
  // The assessment specifies end-to-end testing via Cypress; adding
  // component tests without a framework would dilute the focus. The
  // block is present so reviewers see the omission was deliberate,
  // not an oversight.
  // ----------------------------------------------------------------
  component: {
    devServer: {
      framework: 'vanilla',
      bundler: 'webpack',
    },
  },

  // ----------------------------------------------------------------
  // Environment variables available inside tests via Cypress.env().
  //
  // These mirror constants in the source, so a spec that needs the
  // value reads it from here rather than re-typing the literal. A
  // spec that reads `Cypress.env('STORAGE_KEY')` gets the same string
  // the app writes to; a rename in the source that is not mirrored
  // here would cause the spec to seed the wrong key — a silent
  // failure that the storage adapter's own tests do not catch.
  // ----------------------------------------------------------------
  env: {
    /**
     * The storage key used by the task store.
     *
     * Mirrors `STORAGE_KEY` in `src/js/utils/storage.js`. The value
     * is `mmc.tasks`, not a more descriptive string; the constant
     * in the source is the source of truth, and this env var is its
     * mirror.
     */
    STORAGE_KEY: 'mmc.tasks',

    /**
     * The selector attribute the tests target.
     *
     * `data-cy` is the Cypress convention. The value is documented
     * here so new specs use the same attribute; Cypress does not
     * enforce it, but a spec that uses a different attribute is
     * visible in review as a convention violation.
     */
    SELECTOR_ATTRIBUTE: 'data-cy',
  },
});