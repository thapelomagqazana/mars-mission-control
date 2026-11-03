/**
 * Global Cypress support — runs once before every spec file.
 *
 * Why this file exists:
 *   Cypress runs the support file once per spec, before any test in
 *   that spec. The hooks here are the ones that must apply to every
 *   test in every spec: resetting the app's persisted state so tests
 *   do not leak into each other, and tolerating the one external
 *   dependency the app has (the remote Mars image, which is not
 *   under the test's control).
 *
 * What this file does not do:
 *   - Register custom commands. Those live in `commands.js`, which is
 *     imported below. The split keeps "global hooks" and "shared
 *     helpers" visible as separate concerns.
 *   - Seed state that only some specs need. A spec that needs a
 *     specific seed uses `cy.fixture(...)` and `cy.seedTasks(...)`
 *     in its own `beforeEach`. The global hook is for the state every
 *     spec needs (an empty store), not the state some specs want.
 *
 * State reset — the whole point of this file:
 *   Every test must start from a known state. The default is an empty
 *   store; a spec that needs a seeded state calls `cy.seedTasks(...)`
 *   explicitly. A test that depends on a previous test's state is a
 *   test that fails when run alone — the single most-common defect in
 *   a shipped Cypress suite, and the one the isolation probe exists
 *   to catch.
 *
 *   The reset has two steps, both required:
 *
 *     1. cy.visit('/') — load the app so the window exists under the
 *        app's origin. `cy.clearLocalStorage` and `cy.window()`
 *        both require a window; without a visit, the window is
 *        about:blank, which has no localStorage for the app's origin.
 *        A reset that runs against about:blank is a reset that does
 *        nothing, silently.
 *
 *     2. cy.window().then(win => win.localStorage.removeItem(key)) —
 *        remove the app's task key. `removeItem`, not
 *        `cy.clearLocalStorage(key)`: `clearLocalStorage` clears the
 *        *value* of the key but leaves the key present. A test that
 *        asserts "the app has never run" (the key is absent) needs
 *        the key removed; a test that asserts "the app starts with
 *        an empty store" is satisfied by the app treating a missing
 *        key as an empty list. The absent key is the unambiguous
 *        "nothing has happened yet" state; the empty value is the
 *        "something happened, and it produced nothing" state. The
 *        reset produces the first.
 *
 * The storage key comes from `Cypress.env('STORAGE_KEY')`, which
 * `cypress.config.js` mirrors from `src/js/utils/storage.js`. A spec
 * that reads the key through the env var cannot drift from the app's
 * actual key without the config test failing first.
 */

import './commands';

beforeEach(() => {
  // 1. Visit the app. This is setup, not the test's action. The visit
  //    is what makes the window exist under the app's origin, which
  //    is what makes the localStorage reset below target the right
  //    storage. A reset before the visit would run against
  //    about:blank and do nothing.
  cy.visit('/');

  // 2. Remove the app's task key. `removeItem` is the correct call,
  //    not `cy.clearLocalStorage(key)`. The latter leaves the key
  //    present with an empty value; the former removes the key
  //    entirely. The difference matters for a test that asserts
  //    "the app has never run" — that test needs the absent key.
  cy.window().then((win) => {
    win.localStorage.removeItem(Cypress.env('STORAGE_KEY'));
  });
});

/**
 * Tolerate the one external dependency the tests cannot control: the
 * remote Mars image loaded by the dashboard.
 *
 * The app degrades gracefully when the image is missing (the layout
 * does not break), so the image's failure is not a defect in the app.
 * A test that fails because a remote image was blocked in CI would
 * be a false negative: the app is fine, the network is not.
 *
 * Every other uncaught exception is allowed to fail the test. A
 * programming error in the app is exactly what the E2E suite exists
 * to surface; suppressing all exceptions would hide the defect the
 * suite is meant to catch.
 *
 * The handler returns `true` when the exception should be allowed to
 * fail the test, and `false` when it should be suppressed. The single
 * expression below inverts the "is this the tolerated host?" check:
 * the Unsplash image is the one exception that is expected, so it
 * yields `false`; everything else yields `true`.
 */
Cypress.on('uncaught:exception', (err) => !err.message.includes('images.unsplash.com'));