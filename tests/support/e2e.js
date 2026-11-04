/**
 * Global Cypress support — runs once before every spec file.
 *
 * Why this file exists:
 *   Cypress runs the support file once per spec, before any test in
 *   that spec. The hooks here are the ones that apply to every test
 *   in every spec:
 *
 *     1. Reset the app's persisted state, so tests do not leak into
 *        each other.
 *     2. Tolerate the one external dependency the app has (the
 *        remote Mars image), which is not under the test's control.
 *
 * What this file does not do:
 *   - Register custom commands. Those live in `commands.js`, imported
 *     below. The split keeps "global hooks" and "shared helpers"
 *     visible as separate concerns.
 *   - Seed state that only some specs need. A spec that needs a
 *     specific seed uses `cy.fixture(...)` and `cy.seedTasks(...)` in
 *     its own `beforeEach` or test body. The global hook is for the
 *     state every spec needs (an empty store), not the state some
 *     specs want.
 *
 * State reset — how it works, and why both steps are required:
 *
 *   Every test must start from a known state. The default is an empty
 *   store; a spec that needs a seeded state calls `cy.seedTasks(...)`
 *   explicitly. A test that depends on a previous test's state is a
 *   test that fails when run alone — the single most-common defect in
 *   a shipped Cypress suite, and the one the isolation probe exists
 *   to catch.
 *
 *   The reset has two steps:
 *
 *     1. cy.visit('/') — load the app so the window exists under the
 *        app's origin. `cy.window()` and localStorage access both
 *        require a window; without a visit, the window is
 *        about:blank, which has no localStorage for the app's
 *        origin. A reset against about:blank is a reset that runs
 *        against the wrong storage and silently does nothing.
 *
 *     2. cy.window().then(win => win.localStorage.removeItem(key)) —
 *        remove the app's task key entirely.
 *
 *   `removeItem`, not `cy.clearLocalStorage(key)`. The two are not
 *   the same: `cy.clearLocalStorage(key)` sets the key to an empty
 *   string, which the app reads as a corrupted entry and recovers
 *   from as an empty store. `removeItem` removes the key entirely,
 *   which the app reads as "nothing has ever run" — the
 *   unambiguous "fresh install" state. Both produce an empty store,
 *   but only `removeItem` produces the state a first-time user's
 *   browser is in. A test that asserts "the app has never run"
 *   needs the key absent; a test that asserts "the app starts empty"
 *   is satisfied by either, but the fresh-install state is the
 *   stronger default and the one the reset should produce.
 *
 * How the reset interacts with the seed commands:
 *
 *   `cy.seedTasks` and `cy.seedCorruptStorage` call
 *   `cy.visit('/', { onBeforeLoad })` internally. That visit runs
 *   `onBeforeLoad` (which writes the seed), then loads the app,
 *   which reads the seed. The visit supersedes the `beforeEach`'s
 *   `removeItem` — the seed is what the test starts from, not the
 *   empty store. This layering is correct: the `beforeEach` sets
 *   the DEFAULT state; a seed command, called from a spec, sets the
 *   SPECIFIC state that spec needs. The seed wins because it is
 *   later; the reset establishes "no residue from the previous
 *   test," and the seed establishes "the state this test wants."
 *
 *   The alternative — moving the reset out of `beforeEach` and
 *   requiring every spec to call it explicitly — was rejected. The
 *   default (empty store) is the state almost every spec wants, and
 *   making it explicit in every spec would be a line every spec
 *   forgets. A spec that wants a different starting state calls the
 *   seed command; a spec that wants the default gets it for free.
 *   That is the right split.
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
  //    not `cy.clearLocalStorage(key)`. See the file header for the
  //    full reasoning; the short version is that `removeItem` yields
  //    the fresh-install state (key absent), which is the state a
  //    first-time user's browser is in.
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
 *
 * A note on the narrowness of this exception:
 *   The check is on the host in the error message, not on "any
 *   error that mentions an image" or "any network error." A future
 *   external dependency (an analytics beacon, a font) would need
 *   its own reasoning, and the exception should not be widened
 *   preemptively. The narrow version is the one that catches a real
 *   defect in the app while tolerating the one external failure
 *   the tests cannot prevent.
 */
Cypress.on('uncaught:exception', (err) => !err.message.includes('images.unsplash.com'));