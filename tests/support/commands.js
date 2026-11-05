/**
 * Custom Cypress commands — setup helpers, plus the dialog-Esc helper.
 *
 * Two categories, and the line between them is the whole policy:
 *
 *   SETUP HELPERS prepare the state the test starts from. They may
 *   assert that the state they prepared is now observable. They may
 *   not assert anything the test is claiming.
 *
 *   USER ACTIONS (in specs) click, type, and submit. They belong in
 *   the spec, where the reading shows them. A helper that performs a
 *   user action is a helper that hides the action from the reader.
 *
 * The one-sentence rule for setup helpers:
 *
 *   **The helper proves the precondition; the spec proves the claim.**
 *
 * The one-sentence rule for the Esc helper (a different category —
 * see its docstring):
 *
 *   **The helper fires the event the app listens for; the spec
 *   asserts the app's response.**
 *
 * Why "zero assertions" was wrong for setup helpers, and what
 * replaced it:
 *
 *   The delivered version said setup helpers must contain zero
 *   assertions. That rule was written to keep helpers from making
 *   the spec's claims — a good instinct. But it also forbade the
 *   helper from making ITS OWN claim ("the seeded state is now
 *   rendered"), which is the property that makes the helper
 *   synchronous from the caller's perspective. Without that claim,
 *   a helper that writes localStorage and calls cy.reload() resolves
 *   on the `load` event, not on the app's render, and the caller's
 *   next assertion races the app's async hydration. That race is
 *   what produced the intermittent "Expected to find element" in
 *   createWorkflow.cy.js — the same seed, the same app, passing on
 *   one run and failing the next.
 *
 *   The corrected policy is stricter in one place and looser in
 *   another, and both changes are necessary:
 *
 *     STRICTER: a setup helper must assert its own contract. A seed
 *     that does not prove the seed is visible is a seed that has
 *     only hoped.
 *
 *     LOOSER: a setup helper may make that one assertion. The
 *     delivery's "zero" was a blanket ban; the replacement is
 *     "exactly the helper's contract, nothing the spec is claiming."
 *
 * Why the Esc helper exists (a third category)
 *
 *   `cy.type('{esc}')` dispatches a synthetic `keydown` event with
 *   `key: 'Escape'`. The browser's native modal-close behaviour is
 *   driven by the UA's real-Escape-key handler, not by a synthetic
 *   keydown — so a Cypress `{esc}` does NOT fire the `<dialog>`'s
 *   `cancel` event. The dialog stays open; the test times out.
 *
 *   The dialog's own code listens for `cancel` (the event the
 *   browser fires on real Escape). `cy.escDialog` fires that same
 *   event, one step removed from the browser's keyboard pipeline.
 *   The app's code path is identical; only the trigger is
 *   synthetic. The helper reproduces the browser's full Esc
 *   sequence:
 *
 *     1. Fire `cancel` on the dialog.
 *     2. If the dialog's handler did not call `preventDefault()`,
 *        call the dialog's native `close()` (which fires `close`).
 *     3. The app's `close` listener notifies.
 *
 *   This is a *test-environment* fix, not an *app* fix. The app's
 *   Esc handling is correct — a real user pressing a real Escape
 *   key closes the dialog. Cypress's inability to fire a real
 *   Escape key is a limitation of the test harness, not a defect
 *   in the app. The helper bridges the gap.
 *
 *   Do NOT patch the app to listen for `keydown` on Escape in
 *   addition to `cancel`. That would introduce a duplicate close
 *   path, break the single-cancel-path discipline the dialog is
 *   built on, and fail the idempotence guarantee.
 *
 * The seed mechanism — `cy.visit('/', { onBeforeLoad })`:
 *
 *   `onBeforeLoad` runs after the document exists and before the
 *   app's first script. The seed is in localStorage before startup
 *   reads it, so the app hydrates FROM the seed rather than being
 *   reloaded after the seed. No `cy.reload()`, no window between
 *   write and read. This is the primitive Cypress provides for
 *   exactly this case; the delivered `cy.window().then(...)`
 *   followed by `cy.reload()` was working around its absence.
 *
 * The storage key comes from `Cypress.env('STORAGE_KEY')`, which
 * `cypress.config.js` mirrors from `src/js/utils/storage.js`. A spec
 * that reads the key through the env var cannot drift from the app's
 * actual key without the config test failing first.
 *
 * What this file does not do:
 *   - Assert the spec's claims. The trailing assertions in the setup
 *     helpers are the helper's contract ("the seed is rendered"),
 *     not the spec's ("a second task can be created when one
 *     already exists").
 *   - Click, type, or navigate for the user. Those are user actions;
 *     they belong in the spec where the reading can show them.
 *   - Seed state that only one spec needs. That state belongs in the
 *     spec's `beforeEach`, where its shape is visible and easy to
 *     delete when the spec changes.
 *
 * Rejected helper proposals (recorded in docs/helper-catalog.md):
 *   - cy.openCreateDialog: an action, not a setup. The click belongs
 *     in the spec.
 *   - cy.createTask: an action (open, fill, submit). The steps belong
 *     in the spec; a helper that filled the form for the user would
 *     hide the fields the test is asserting on.
 *   - cy.editTask, cy.deleteTask, cy.clearAllTasks: all actions, and
 *     all below the ≥3 occurrences threshold.
 *   - cy.assertTaskVisible: an assertion helper for the spec's
 *     claim. Violates the "helper proves the precondition, spec
 *     proves the claim" line — the spec's assertion belongs in the
 *     spec.
 *   - cy.login: the app has no authentication.
 *   - cy.clickWithRetry / cy.clickWhenReady: workarounds for flake,
 *     not helpers. The flake fix belongs in the cause (seeds via
 *     onBeforeLoad, listeners attached after render), not in the
 *     click.
 *
 * Conventions for a future setup helper:
 *   1. Name it for the state it prepares (`seedTasks`, not `doSetup`).
 *   2. Seed via `cy.visit('/', { onBeforeLoad })`, not via
 *      `cy.window().then(...) + cy.reload()`. The former has no
 *      race; the latter is the defect.
 *   3. End with the assertion that proves the helper's contract —
 *      "the state I prepared is now observable." This is the
 *      helper's job. It is not the spec's job.
 *   4. Use `[data-cy="..."]` selectors if it reads the DOM; use the
 *      storage key env var if it writes storage.
 *   5. Put it in this file, not in a spec.
 *   6. Update `docs/selector-convention.md` if the helper introduces
 *      a new selector that is not already in the register.
 *   7. Update `docs/helper-catalog.md` with the admission rationale
 *      and the list of specs that use it.
 *   8. Update this docstring's rejected-proposals list if the helper
 *      is a new category or a rejected proposal is re-proposed.
 */

/**
 * Seed the app's localStorage with a raw string payload, and resolve
 * only once the app has started and its task-area container exists.
 *
 * This is the primitive all three seed commands use. It is exposed
 * because P-05 (mixed valid/invalid entries) has a recovery outcome
 * that is a CARD COUNT, not the empty state — the spec that exercises
 * P-05 needs the seed's contract without the empty-state assertion
 * that P-03/P-04 need.
 *
 * The visit uses `onBeforeLoad` so the payload is in localStorage
 * before the app's scripts run. The app reads it during startup; the
 * trailing container assertion is the app's proof that startup
 * reached the render stage. The spec then asserts the recovery
 * outcome it cares about (empty state, card count, console output).
 *
 * @param {string} payload - the raw string to write, as-is.
 * @throws {TypeError} if `payload` is not a string.
 *
 * Assertions: 1 (the task-area container exists). This is the
 * helper's contract: "the app has started and its render stage has
 * produced the container." It is not a claim about what the app did
 * with the payload — that is the spec's claim.
 */
Cypress.Commands.add('seedRawStorage', (payload) => {
  if (typeof payload !== 'string') {
    throw new TypeError(
      'cy.seedRawStorage expects a string. ' +
        'For a JSON value, pass JSON.stringify(value).'
    );
  }

  cy.visit('/', {
    onBeforeLoad(win) {
      win.localStorage.setItem(Cypress.env('STORAGE_KEY'), payload);
    },
  });

  // The app's render stage has produced the container. This is what
  // "startup completed" means for the app; asserting it here is the
  // helper's contract, and it is what makes the command
  // synchronous from the caller's perspective.
  cy.get('[data-cy="dashboard-list"]').should('exist');
});

/**
 * Seed the app's localStorage with an array of tasks, and resolve
 * only once the app has rendered them.
 *
 * The docstring's "Assertions: 0" from the delivered version was the
 * cause of the flake in createWorkflow.cy.js. The two assertions
 * here are the helper's contract, not the spec's claim:
 *
 *   - the container exists (startup reached the render stage), and
 *   - the card count equals the number of tasks passed in (the app
 *     accepted every seeded task).
 *
 * The second is the one that matters. A seed whose contents the app
 * rejects (a fixture with a missing field, a non-string title) will
 * produce fewer cards than the caller asked for, and the failure
 * will name the seed — not the caller's spec, three lines later.
 *
 * @param {ReadonlyArray<object>} tasks - tasks in the app's shape:
 *   id, title, description, creator, assignee, createdAt. See
 *   `docs/schema.md`.
 *
 * @example
 *   cy.fixture('tasks.json').then((fixture) => {
 *     cy.seedTasks(fixture.threeTasks);
 *   });
 *   // By the time seedTasks resolves, the three cards are rendered.
 *   cy.get('[data-cy="task-card"]').should('have.length', 3);
 *
 * @throws {TypeError} if `tasks` is not an array. A single task is
 *   `cy.seedTasks([task])`, not `cy.seedTasks(task)`. A
 *   `seedTasks(undefined)` would write the string `"undefined"` to
 *   localStorage, and the app would treat it as a corrupted entry;
 *   the failure would surface in the spec as "no tasks visible" with
 *   no clue about the cause. The `TypeError` at the command boundary
 *   names the mistake at the call site.
 *
 * Assertions: 2 (container exists; card count equals tasks.length).
 * Admission: 6 specs (create, read, edit, delete, counter-search,
 *   isolation-probe).
 */
Cypress.Commands.add('seedTasks', (tasks) => {
  if (!Array.isArray(tasks)) {
    throw new TypeError(
      'cy.seedTasks expects an array of tasks. ' +
        'For a single task, pass an array: cy.seedTasks([task]).'
    );
  }

  cy.visit('/', {
    onBeforeLoad(win) {
      win.localStorage.setItem(
        Cypress.env('STORAGE_KEY'),
        JSON.stringify(tasks)
      );
    },
  });

  // The helper's contract: the app has rendered the seeded tasks.
  // A caller that writes `cy.seedTasks(x); cy.get(...)` cannot race
  // the app's async hydration, because this command does not
  // resolve until the cards exist.
  cy.get('[data-cy="dashboard-list"]').should('exist');
  cy.get('[data-cy="task-card"]').should('have.length', tasks.length);
});

/**
 * Seed the app's localStorage with a raw string, and resolve only
 * once the app has run its recovery branch and rendered the empty
 * state.
 *
 * This is the P-03/P-04 case. For P-05 (mixed valid/invalid
 * entries), the recovery outcome is a card count — call
 * `cy.seedRawStorage(payload)` directly and assert the count in the
 * spec.
 *
 * The value is written as-is, not `JSON.stringify`-ed. A test that
 * wants a malformed string passes the malformed string; a test that
 * wants a valid-but-wrong shape passes a JSON string of that shape
 * (`JSON.stringify({ not: 'an array' })`). The interface is a string
 * because "corrupted" is a property of the bytes, not of the JS
 * value; a helper that took a JS value would only ever write valid
 * JSON, and the corrupted cases would be impossible.
 *
 * @param {string} payload - the raw string to write.
 *
 * @example
 *   // P-03: corrupted JSON — the app starts with an empty store.
 *   cy.seedCorruptStorage('{not valid json');
 *   // The empty state is already visible when this resolves.
 *   cy.get('[data-cy="empty-state"]').should('be.visible');
 *
 * @example
 *   // P-04: valid JSON, wrong shape — the app starts empty.
 *   cy.seedCorruptStorage(JSON.stringify({ not: 'an array' }));
 *   cy.get('[data-cy="empty-state"]').should('be.visible');
 *
 * @example
 *   // P-05: mixed entries — the app filters invalid, keeps valid.
 *   // Use seedRawStorage, not seedCorruptStorage: the outcome is a
 *   // card count, not the empty state.
 *   const tasks = [
 *     { id: 'not-a-uuid', title: '' }, // invalid
 *     validTask(),
 *   ];
 *   cy.seedRawStorage(JSON.stringify(tasks));
 *   cy.get('[data-cy="task-card"]').should('have.length', 1);
 *
 * @throws {TypeError} if `payload` is not a string.
 *
 * Assertions: 2 (container exists; empty state visible). The second
 * is the recovery branch's observable outcome — the helper's
 * contract, not the spec's claim. The spec's claim ("the app starts
 * from an empty store when storage is corrupted") is still the
 * spec's, and is still worth reading in the spec.
 * Admission: 3 recovery specs (P-03, P-04, P-05).
 */
Cypress.Commands.add('seedCorruptStorage', (payload) => {
  cy.seedRawStorage(payload);
  // The recovery outcome. `seedRawStorage` already proved the app
  // started; this proves it recovered to the empty state.
  cy.get('[data-cy="empty-state"]').should('be.visible');
});

/**
 * Fire the browser's `cancel` + `close` sequence on a `<dialog>`, so a
 * test can exercise the dialog's Esc-close path without relying on
 * Cypress's synthetic keyboard events.
 *
 * Why this helper exists
 * ----------------------
 *
 * Cypress's `cy.type('{esc}')` dispatches a synthetic `keydown` with
 * `key: 'Escape'`. The browser's native modal-close behaviour is
 * driven by the UA's real-Escape-key handler, not by a synthetic
 * keydown — so a Cypress `{esc}` does NOT fire the `<dialog>`'s
 * `cancel` event. The dialog stays open; the test times out with
 * "Expected <dialog> not to exist, but it was continuously found."
 *
 * That is a limitation of the test harness, not a defect in the
 * app. A real user pressing a real Escape key closes the dialog.
 * This helper bridges the gap by firing the same events the browser
 * would fire:
 *
 *   1. Fire `cancel` on the dialog. The app's cancel handler runs.
 *      It either calls `preventDefault()` (an in-flight save — the
 *      dialog should not close) or lets the default through.
 *   2. If the cancel was NOT prevented, call the dialog's native
 *      `close()`. In a real browser the UA does this automatically
 *      after the cancel; in jsdom and in Cypress, it must be called
 *      explicitly. The close fires the `close` event, which the
 *      app's `close` listener uses to notify.
 *
 * What this helper is NOT
 * -----------------------
 *
 *   - Not a replacement for clicking Cancel. Cancel is a button
 *     click; the button's handler is different (it calls `close()`
 *     itself, then `onCancel()`). The Esc path relies on the
 *     `close` listener. Two paths, two tests, two helpers (the
 *     click is a `cy.get(...).click()`, the Esc is this helper).
 *
 *   - Not a test-environment shim to add to the app. The app
 *     should NOT add a `keydown` listener for Escape in addition
 *     to the native `cancel` handler. That would introduce a
 *     duplicate close path, break the single-cancel-path
 *     discipline, and fail the idempotence guarantee. The helper
 *     fires the event the app already listens for; the app does
 *     not need to listen for more.
 *
 *   - Not a claim the helper is making. The spec asserts the
 *     dialog is gone, the store is unchanged, focus is restored.
 *     The helper fires the events; the spec asserts the outcome.
 *
 * Assertions
 * ----------
 *
 * The helper asserts one thing: the dialog exists and is open before
 * the Esc sequence is fired. That is the helper's contract: "I
 * fired Esc on an open dialog." A caller who calls `escDialog` on a
 * closed dialog has a bug; this assertion surfaces it as "the
 * dialog was already closed," not as a silent no-op.
 *
 * The spec asserts everything else.
 *
 * @param {string} selector - a CSS selector for the dialog element.
 *
 * @example
 *   cy.get('[data-cy="dashboard-create"]').click();
 *   cy.get('.task-dialog').should('exist');
 *   cy.escDialog('.task-dialog');
 *   cy.get('.task-dialog').should('not.exist');
 *
 * @example
 *   // Same pattern for the delete and clear-all dialogs.
 *   cy.get('[data-cy="task-card-delete"]').first().click();
 *   cy.get('.delete-dialog').should('exist');
 *   cy.escDialog('.delete-dialog');
 *   cy.get('.delete-dialog').should('not.exist');
 *
 * Admission: 4 specs use it (create, edit, delete, clear-all).
 */
Cypress.Commands.add('escDialog', (selector) => {
  cy.get(selector).should('exist').then(($dialog) => {
    const dialogEl = $dialog[0];

    // The helper's contract. A closed dialog does not fire `cancel`;
    // a caller who reaches this point with a closed dialog has a
    // spec bug, and this assertion names it clearly.
    expect(dialogEl.open, `${selector} must be open before cy.escDialog`).to.equal(true);

    // Step 1: fire `cancel`. Capture whether the app's handler
    // called `preventDefault()` — if it did, the browser would not
    // close the dialog, and neither should this helper.
    let defaultPrevented = false;
    const cancelEvent = new window.Event('cancel', {
      bubbles: true,
      cancelable: true,
    });
    const originalPreventDefault = cancelEvent.preventDefault.bind(cancelEvent);
    cancelEvent.preventDefault = function () {
      defaultPrevented = true;
      originalPreventDefault();
    };
    dialogEl.dispatchEvent(cancelEvent);

    // Step 2: if the cancel was not prevented, the browser closes
    // the dialog natively. In jsdom and Cypress, that native close
    // does not happen automatically after a synthetic `cancel`
    // event — the `close()` must be called explicitly. The close
    // fires the `close` event, which the app's `close` listener
    // uses to notify the app.
    if (!defaultPrevented && dialogEl.open) {
      dialogEl.close();
    }
  });
});