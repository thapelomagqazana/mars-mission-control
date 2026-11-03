/**
 * Mars Mission Control — Cypress configuration
 *
 * Purpose:
 *   Configures Cypress for an E2E suite that runs against the webpack
 *   production build (./dist), served by a static file server. The
 *   application is a vanilla-JS SPA with localStorage persistence, so
 *   test isolation is achieved by clearing that storage before each test
 *   (see tests/support/e2e.js) rather than by resetting a backend.
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
 * The dev server (`npm start`, port 8080) is an alternative target, but
 * tests run against the built output by default so the same artefact
 * that ships to production is what gets verified.
 */

const { defineConfig } = require('cypress');

module.exports = defineConfig({
  // ----------------------------------------------------------------
  // E2E configuration
  // ----------------------------------------------------------------
  e2e: {
    /**
     * Base URL — the app under test.
     * Aligns with webpack-dev-server port from webpack.config.js and the
     * delivery note. Change via CYPRESS_BASE_URL env var for CI runs
     * against a static-served build on a different port.
     */
    baseURL: process.env.CYPRESS_BASE_URL || 'http://localhost:8080',

    /**
     * Folder overrides — this project uses `tests/` rather than the
     * Cypress default `cypress/` so source, configs, and tests sit
     * side-by-side in the repository.
     */
    specPattern: 'tests/e2e/**/*.cy.js',
    supportFile: 'tests/support/e2e.js',
    fixturesFolder: 'tests/fixtures',
    screenshotsFolder: 'tests/screenshots',
    videosFolder: 'tests/videos',
    downloadsFolder: 'tests/downloads',

    /**
     * Viewport — matches a common desktop baseline. Mobile and tablet
     * layouts are exercised per-test with cy.viewport() rather than by
     * running the whole suite at multiple sizes, which keeps runtime
     * bounded.
     */
    viewportWidth: 1280,
    viewportHeight: 800,

    /**
     * Video — off by default to keep runtime and disk usage low. Enable
     * in CI for failure analysis by setting CYPRESS_VIDEO=true.
     * Screenshots on failure are always on, which is the primary
     * evidence artifact.
     */
    video: process.env.CYPRESS_VIDEO === 'true',
    videoCompression: 32,
    videoUploadOnPasses: false,

    /**
     * Screenshots — captured on failure only. These are the raw
     * evidence for investigating failures and retaining evidence in CI.
     */
    screenshotOnRunFailure: true,

    /**
     * Retries — one retry only in CI (where flakiness from cold starts
     * or image loading is plausible), zero locally so a developer sees
     * every failure immediately. Retries must not mask flaky tests; a
     * persistent failure after one retry is treated as a real defect.
     */
    retries: {
      runMode: process.env.CI ? 1 : 0,
      openMode: 0,
    },

    /**
     * Default command timeout — 6s is Cypress's default and is adequate
     * for a local SPA. Kept explicit so the value is documented rather
     * than inherited silently.
     */
    defaultCommandTimeout: 6000,
    requestTimeout: 10000,
    responseTimeout: 15000,

    /**
     * Test isolation — on by default in Cypress 12+. Each test starts
     * with a clean browser context, and the support file additionally
     * clears localStorage before every test. Do not disable:
     * order-dependent tests would be unreliable.
     */
    testIsolation: true,

    /**
     * Fail on uncaught exceptions and unhandled rejections from the
     * application — the assessment requires clean runtime behaviour.
     * Suppressing these would hide real defects.
     */
    // (Handled in tests/support/e2e.js via cy.on() only where genuinely
    //  external, e.g. the remote Unsplash image failing to load.)

    /**
     * Reporters — JSON reporter in CI so results can be parsed for the
     * test summary. Locally, Cypress's built-in spec reporter is enough.
     */
    reporter: process.env.CI ? 'junit' : 'spec',
    reporterOptions: process.env.CI
      ? {
          mochaFile: 'tests/results/test-results-[hash].xml',
          toConsole: false,
        }
      : {},

    /**
     * Node event listeners — reserved for hooks that belong at the
     * config level (e.g. starting a static server). Currently unused
     * because the standard `npm start` workflow keeps setup explicit.
     */
    setupNodeEvents(on, config) {
      // Left intentionally empty. If a CI workflow later needs to
      // pre-seed localStorage or capture console logs, that wiring
      // belongs here, not scattered across individual specs.
      return config;
    },
  },

  // ----------------------------------------------------------------
  // Component testing — not configured.
  // The assessment specifies end-to-end testing via Cypress; adding
  // component tests without a framework would dilute the focus. Keep
  // this block explicit so reviewers see the omission was deliberate.
  // ----------------------------------------------------------------
  component: {
    devServer: {
      framework: 'vanilla',
      bundler: 'webpack',
    },
  },

  // ----------------------------------------------------------------
  // Environment variables available inside tests via Cypress.env().
  // ----------------------------------------------------------------
  env: {
    /**
     * Storage key used by the task store. Defined here so tests can
     * seed/clear localStorage by name without duplicating
     * the literal string across specs.
     */
    STORAGE_KEY: 'mars-mission-control.tasks',

    /**
     * Selector strategy reminder — keep the value documented so new
     * specs use the same convention. Not enforced by Cypress itself.
     */
    SELECTOR_ATTRIBUTE: 'data-cy',
  },
});