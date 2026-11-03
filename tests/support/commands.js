/**
 * Custom Cypress commands — setup helpers only.
 *
 * Two commands, both setup-only:
 *   - cy.seedTasks(tasks) writes a task array to localStorage under
 *     the app's storage key, before the app reads it.
 *   - cy.seedCorruptStorage(payload) writes a raw string (typically
 *     a malformed JSON value) under the same key, so a test can
 *     exercise the persistence layer's recovery branch.
 *
 * Why this file is setup-only:
 *   The two admission criteria are:
 *     1. The same sequence of steps appears in ≥3 specs.
 *     2. The helper contains zero assertions — no `.should(` and
 *        no `expect(`.
 *
 *   A setup helper writes state; the spec asserts on the rendered
 *   result. The two are different jobs. A helper that both does and
 *   asserts is a helper whose failure names the helper, not the
 *   assertion — the reader cannot tell what the test claims by
 *   reading the test.
 *
 *   A helper that clicks and types is a helper that hides the user
 *   action. The spec should be readable as "the user clicks X, then
 *   sees Y"; a helper that clicks for the user removes the click
 *   from the reading, and the test becomes "the user runs helper X,
 *   then sees Y." The first is a test; the second is a recipe with a
 *   name.
 *
 *   Setup helpers are legitimate because they do not perform user
 *   actions — they prepare the state the test starts from. The spec
 *   still does the actions and still makes the claims. The helper
 *   is the precondition; the spec is the scenario; the assertion is
 *   the claim. Three different things, three different places.
 *
 * The storage key comes from `Cypress.env('STORAGE_KEY')`, which
 * `cypress.config.js` mirrors from `src/js/utils/storage.js`. A spec
 * that reads the key through the env var cannot drift from the app's
 * actual key without the config test failing first.
 *
 * Why the reload is inside the helper:
 *   localStorage is read by the app on page load. A seed written
 *   after the app has loaded is invisible to the current render; the
 *   helper reloads so the app reads the seed. The reload is what
 *   makes "seed, then assert" a single, readable test.
 *
 * What this file does not do:
 *   - Assert outcomes. The spec's assertion is the spec's claim; a
 *     helper that made the claim would hide it.
 *   - Click, type, or navigate. Those are user actions; they belong
 *     in the spec where the reading can show them. A helper that
 *     performs a user action is a helper that hides the action.
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
 *   - cy.assertTaskVisible: an assertion helper; violates criterion 2.
 *   - cy.login: the app has no authentication.
 *
 * Conventions for a future setup helper:
 *   1. Name it for the state it prepares (`seedTasks`, not `doSetup`).
 *   2. Use `[data-cy="..."]` selectors if it reads the DOM; use the
 *      storage key env var if it writes storage.
 *   3. Put it in this file, not in a spec.
 *   4. Update `docs/selector-convention.md` if the helper introduces
 *      a new selector that is not already in the register.
 *   5. Update `docs/helper-catalog.md` with the admission rationale
 *      and the list of specs that use it.
 *   6. Update this docstring's rejected-proposals list if the helper
 *      is a new category or a rejected proposal is re-proposed.
 */

/**
 * Seed the app's localStorage with an array of tasks, then reload so
 * the app reads them.
 *
 * @param {ReadonlyArray<object>} tasks - the tasks to seed. Each is
 *   the app's task shape: id, title, description, creator, assignee,
 *   createdAt. The shape is defined in `docs/schema.md`; a fixture
 *   that adds a field (e.g. `status`) produces a seed the app
 *   rejects on load, which is a test that seeds the wrong data, not
 *   a test that exercises the recovery branch.
 *
 * @example
 *   cy.fixture('tasks.json').then((fixture) => {
 *     cy.seedTasks(fixture.threeTasks);
 *   });
 *   cy.get('[data-cy="task-card"]').should('have.length', 3);
 *
 * @throws {TypeError} if `tasks` is not an array. A single task is
 *   `cy.seedTasks([task])`, not `cy.seedTasks(task)`. The throw is
 *   deliberate: a `seedTasks(undefined)` would write the string
 *   `"undefined"` to localStorage, and the app would treat it as a
 *   corrupted entry. The failure would surface in the spec as "no
 *   tasks visible" with no clue about the cause. The `TypeError` at
 *   the command boundary names the mistake at the call site.
 *
 * Assertions: 0. The spec asserts the rendered result.
 * Admission: 6 specs use it (create, read, edit, delete,
 *   counter-search, isolation-probe).
 */
Cypress.Commands.add('seedTasks', (tasks) => {
  if (!Array.isArray(tasks)) {
    throw new TypeError(
      'cy.seedTasks expects an array of tasks. ' +
        'For a single task, pass an array: cy.seedTasks([task]).'
    );
  }

  cy.window().then((win) => {
    win.localStorage.setItem(Cypress.env('STORAGE_KEY'), JSON.stringify(tasks));
  });

  // Reload so the app reads the seeded state. Without the reload,
  // the app would render from the state it loaded before the seed,
  // and the test's assertion would fail for the wrong reason.
  cy.reload();
});

/**
 * Seed the app's localStorage with a raw value, then reload so the
 * app reads it.
 *
 * This command is for testing the persistence layer's recovery
 * branches: a malformed string exercises the "corrupted JSON" branch
 * (P-03 in `docs/persistence-mapping.md`); a non-array JSON value
 * exercises the "non-array" branch (P-04); an array with one invalid
 * entry exercises the "individual corrupted entries" branch (P-05).
 *
 * The value is written as-is, not `JSON.stringify`-ed. A test that
 * wants a malformed string passes the malformed string; a test that
 * wants a valid-but-wrong shape passes a JSON string of that shape
 * (`JSON.stringify({ not: 'an array' })`). The interface is a string
 * because "corrupted" is a property of the bytes, not of the JS
 * value; a helper that took a JS value would only ever write valid
 * JSON, and the corrupted cases would be impossible.
 *
 * @param {string} payload - the raw string to write. Must be a
 *   string; a non-string is a programming error, and the command
 *   throws rather than coercing.
 *
 * @example
 *   // P-03: corrupted JSON — the app starts with an empty store.
 *   cy.seedCorruptStorage('{not valid json');
 *   cy.get('[data-cy="task-empty-no-tasks"]').should('be.visible');
 *
 * @example
 *   // P-04: valid JSON, wrong shape — the app starts empty.
 *   cy.seedCorruptStorage(JSON.stringify({ not: 'an array' }));
 *   cy.get('[data-cy="task-empty-no-tasks"]').should('be.visible');
 *
 * @example
 *   // P-05: an array with one invalid entry — the app filters the
 *   // invalid entry and keeps the valid ones.
 *   const tasks = [
 *     { id: 'not-a-uuid', title: '' },  // invalid: no required fields
 *     validTask(),                       // valid
 *   ];
 *   cy.seedCorruptStorage(JSON.stringify(tasks));
 *   cy.get('[data-cy="task-card"]').should('have.length', 1);
 *
 * @throws {TypeError} if `payload` is not a string. See the
 *   `cy.seedTasks` docstring for the reasoning; the same applies.
 *
 * Assertions: 0. The spec asserts the rendered result.
 * Admission: 3 recovery specs (P-03, P-04, P-05) use it.
 */
Cypress.Commands.add('seedCorruptStorage', (payload) => {
  if (typeof payload !== 'string') {
    throw new TypeError(
      'cy.seedCorruptStorage expects a string. ' +
        'For a JSON value, pass JSON.stringify(value).'
    );
  }

  cy.window().then((win) => {
    win.localStorage.setItem(Cypress.env('STORAGE_KEY'), payload);
  });

  // Same reload as `cy.seedTasks`; the reasoning is the same.
  cy.reload();
});