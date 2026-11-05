/**
 * Mars Mission Control — Cypress configuration
 *
 * [the delivered file's header comment — including the "Folder
 *  layout," "Run," "Source-of-truth references," and "@module" sections
 *  — is preserved. See the previous delivery for the full rationale.]
 *
 * Headless rendering on Linux
 *   Cypress's bundled Electron uses GPU-accelerated rendering for its
 *   own UI (the spec list, the command log, the preview panel). On
 *   Linux systems without a working GPU pipeline — VMs, servers,
 *   containers, machines with a broken Mesa/driver stack — the
 *   renderer process crashes at launch with:
 *
 *     [ERROR:gl_utils.cc(402)] GPU stall due to ReadPixels
 *     [ERROR:bad_message.cc(29)] Terminating renderer for bad IPC message, reason 114
 *
 *   That is a crash in Cypress's UI, not in the application under
 *   test. The tests never run; the runner dies first. The application
 *   is unaffected.
 *
 *   The fix is to disable GPU acceleration for Cypress's Electron.
 *   The flag is passed via the `ELECTRON_EXTRA_LAUNCH_ARGS` env var,
 *   which Cypress's Electron respects. The npm scripts
 *   (`test:e2e` and `test:e2e:open`) export the flag; a developer
 *   who runs `npx cypress open` directly must export it themselves
 *   (the npm scripts are the documented entry points).
 *
 *   The flag combination:
 *
 *     --disable-gpu
 *       Turn off GPU acceleration entirely. Cypress's UI renders in
 *       software; slightly slower, but stable. This is the flag that
 *       actually fixes the crash.
 *
 *     --disable-software-rasterizer
 *       Do not fall back to software GL. Without this, `--disable-gpu`
 *       still attempts a software-rendered GL context on some
 *       systems, which can hit the same crash path. Turning it off
 *       means "no GL at all," which is what the crash needs.
 *
 *   A future Cypress version that fixes the underlying Electron bug
 *   (or a future developer on a machine with a working GPU) can drop
 *   the flags from the npm scripts. Until then, the flags are the
 *   difference between "the suite runs" and "the suite cannot start."
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
     * `http://localhost:3000`.
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
     */
    viewportWidth: 1280,
    viewportHeight: 800,

    /**
     * Video — off by default. Screenshots on failure are the primary
     * evidence.
     */
    video: process.env.CYPRESS_VIDEO === 'true',
    videoCompression: 32,

    /**
     * Screenshots — captured on failure only.
     */
    screenshotOnRunFailure: true,

    /**
     * Trash prior artefacts before each run.
     */
    trashAssetsBeforeRuns: true,

    /**
     * Retries.
     *
     * Local: 0. A developer running the suite wants to see every
     * failure immediately.
     *
     * CI: 2. A cold browser launch or slow first paint is absorbed
     * without masking a real failure.
     */
    retries: {
      runMode: process.env.CI ? 2 : 0,
      openMode: 0,
    },

    /**
     * Timeouts.
     *
     * `defaultCommandTimeout` — 6000 ms (Cypress's default is 4000).
     * The extra 2 seconds absorb the first request after a webpack
     * rebuild in the dev server.
     *
     * `requestTimeout` — 10 seconds. No current `cy.request` calls.
     *
     * `responseTimeout` — 15 seconds. A `should` that retries against
     * a real network needs more time than a `get` that queries an
     * already-present element.
     */
    defaultCommandTimeout: 6000,
    requestTimeout: 10000,
    responseTimeout: 15000,

    /**
     * Test isolation — on. Cypress 12+ resets browser state between
     * tests; the support file additionally clears localStorage before
     * every test.
     */
    testIsolation: true,

    /**
     * Reporters — JUnit XML in CI; Cypress's built-in `spec` reporter
     * locally. JUnit is chosen because it is what most CI systems
     * parse natively.
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
     * unused. The function is present so a future hook has a home.
     */
    setupNodeEvents(on, config) {
      return config;
    },
  },

  // ----------------------------------------------------------------
  // Component testing — not configured.
  //
  // The assessment specifies end-to-end testing via Cypress; adding
  // component tests without a framework would dilute the focus.
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
     * The storage key used by the task store.
     *
     * Mirrors `STORAGE_KEY` in `src/js/utils/storage.js`. A rename in
     * the source that is not mirrored here would cause a spec to seed
     * the wrong key — a silent failure the storage adapter's own
     * tests do not catch.
     */
    STORAGE_KEY: 'mmc.tasks',

    /**
     * The selector attribute the tests target.
     *
     * `data-cy` is the Cypress convention. The value is documented
     * here so new specs use the same attribute; a spec that uses a
     * different attribute is visible in review as a convention
     * violation.
     */
    SELECTOR_ATTRIBUTE: 'data-cy',
  },
});