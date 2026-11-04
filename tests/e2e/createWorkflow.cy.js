/**
 * Create workflow — end to end.
 *
 * The create workflow, as a user experiences it:
 *
 *   1. The user clicks a create affordance — the header's "Create
 *      task" button, or the empty state's "Create your first task"
 *      button when the list is empty.
 *   2. The dialog opens; the title input is focused.
 *   3. The user fills the form and submits.
 *   4. The dialog closes; the task appears in the list; the counter
 *      increments; the task is in localStorage.
 *
 * This spec exercises that flow through a real browser. Where the
 * unit tests (`renderContract.test.js` in jsdom) assert the *shape*
 * of each view, this spec asserts the *shape* of the flow:
 * click → dialog → fill → submit → list → persistence. The two
 * layers are complementary: the unit tests catch a schema drift,
 * the e2e tests catch an event-wiring drift.
 *
 * The spec relies on the delivered infrastructure:
 *
 *   - `tests/support/e2e.js` runs `cy.visit('/')` and
 *     `cy.window().then(win => win.localStorage.removeItem(STORAGE_KEY))`
 *     before every test. Every test in this file starts with an
 *     empty store, and the first line of every test is the user's
 *     first action.
 *
 *   - `tests/support/commands.js` provides `cy.seedTasks(tasks)` for
 *     the one test that starts from a non-empty state ("creating a
 *     second task"). The seed writes the tasks under
 *     `Cypress.env('STORAGE_KEY')` and reloads the app so the store
 *     reads them.
 *
 * The spec uses `[data-cy="…"]` selectors from the register and
 * `[data-action="…"]` selectors from the dialog's contract. It does
 * not use CSS classes for behaviour (a class is a styling hook, not
 * a behaviour anchor) and does not assert on internal store state
 * (unreachable from the browser; the persisted form is the store's
 * observable output).
 *
 * @module tests/e2e/createWorkflow
 */

/**
 * The form values used across the happy-path tests. A single object
 * keeps the fill and the assertion in sync — a typo in one would be
 * a typo in both, and the test would fail on a wrong *assertion*,
 * not a wrong *fill*. That is the desired failure mode: the test's
 * job is to verify the values round-trip, not to assert a specific
 * literal.
 *
 * The description field is deliberately absent from this object —
 * the schema declares `description` as optional with a default of
 * `''`, and the happy-path tests submit the *minimal* form. A future
 * test that filled the description would exercise the *fuller* path
 * (a different case) and would add the field to this object.
 */
const NEW_TASK = {
  title: 'Check hull',
  creator: 'Commander Aria Vance',
  assignee: 'Engineer Kade',
};

/**
 * Fill the dialog's required fields. A spec-local helper, not a
 * Cypress custom command: it is used only in this spec, and it hides
 * nothing a reader would want to see (the reader sees the exact field
 * names and the exact values — that is the point of a workflow test).
 *
 * The helper does not assert; the test does. The helper does not
 * submit; the test does. Those are the user actions a workflow test
 * exists to show.
 *
 * @param {{ title: string, creator: string, assignee: string }} values
 */
function fillRequiredFields(values) {
  cy.get('.task-dialog input[name="title"]').type(values.title);
  cy.get('.task-dialog input[name="creator"]').type(values.creator);
  cy.get('.task-dialog input[name="assignee"]').type(values.assignee);
}

// ---------------------------------------------------------------------------
// Setup sanity — the affordances both exist on first load
// ---------------------------------------------------------------------------

describe('create workflow — setup', () => {
  it('shows both create affordances on an empty store', () => {
    // The empty state's button — the contextual affordance for a
    // first-time user with no tasks.
    cy.get('[data-cy="dashboard-empty-create"]')
      .should('be.visible')
      .and('contain.text', 'Create your first task');

    // The header button — the persistent affordance, available at
    // every state.
    cy.get('[data-cy="dashboard-create"]')
      .should('be.visible')
      .and('contain.text', 'Create task');

    // The counter starts at zero.
    cy.get('[data-cy="dashboard-counter"]').should('have.attr', 'data-count', '0');
  });
});

// ---------------------------------------------------------------------------
// Header button — open, focus, submit, verify
// ---------------------------------------------------------------------------

describe('create workflow — header button', () => {
  it('opens the dialog and focuses the title input', () => {
    cy.get('[data-cy="dashboard-create"]').click();

    // The dialog exists and is open (the native `open` property of
    // <dialog>).
    cy.get('.task-dialog').should('exist');
    cy.get('.task-dialog').then(($dialog) => {
      expect($dialog[0].open, 'dialog.open').to.equal(true);
    });

    // The title input is focused — the app's `openDialog` focuses it
    // so the user can start typing immediately.
    cy.get('.task-dialog input[name="title"]').should('have.focus');
  });

  it('creates a task, closes the dialog, updates the list and counter, and persists to localStorage', () => {
    cy.get('[data-cy="dashboard-create"]').click();
    fillRequiredFields(NEW_TASK);
    cy.get('.task-dialog [data-action="submit-dialog"]').click();

    // The dialog is gone.
    cy.get('.task-dialog').should('not.exist');

    // The task card appears in the list.
    cy.get('[data-cy="dashboard-list"] [data-cy="task-card"]')
      .should('have.length', 1)
      .and('contain.text', NEW_TASK.title)
      .and('contain.text', NEW_TASK.creator)
      .and('contain.text', NEW_TASK.assignee);

    // The counter reflects the new count.
    cy.get('[data-cy="dashboard-counter"]').should('have.attr', 'data-count', '1');

    // The persisted form is the task. `localStorage` is the store's
    // only observable artifact from the browser — the store itself
    // is not exposed on `window`, and asserting on it directly would
    // be coupling the test to an implementation detail. The
    // persisted form is the store's contract with the next page
    // load.
    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      const raw = win.localStorage.getItem(key);
      expect(raw, `localStorage[${key}]`).to.be.a('string');
      const tasks = JSON.parse(raw);
      expect(tasks, 'persisted tasks').to.have.length(1);
      expect(tasks[0].title).to.equal(NEW_TASK.title);
      expect(tasks[0].creator).to.equal(NEW_TASK.creator);
      expect(tasks[0].assignee).to.equal(NEW_TASK.assignee);
      // The description is stored as the schema's default, '' —
      // not omitted. This is the "default fill" contract; a future
      // change that omitted the field would be a schema change.
      expect(tasks[0].description).to.equal('');
    });
  });

  it('persists the task across a page reload', () => {
    cy.get('[data-cy="dashboard-create"]').click();
    fillRequiredFields(NEW_TASK);
    cy.get('.task-dialog [data-action="submit-dialog"]').click();

    // Reload — the support file's reset only runs once per test, so
    // a manual `cy.reload()` here does NOT clear localStorage. The
    // task should survive.
    cy.reload();

    cy.get('[data-cy="dashboard-list"] [data-cy="task-card"]').should('have.length', 1);
    cy.get('[data-cy="dashboard-list"] [data-cy="task-card"]')
      .should('contain.text', NEW_TASK.title);
    cy.get('[data-cy="dashboard-counter"]').should('have.attr', 'data-count', '1');
  });

  it('creates a second task when one is already present', () => {
    // Start from a non-empty state: seed one task, then create a
    // second via the header button. The header button is the
    // persistent affordance — it must still work when the list is
    // not empty. The empty state's button disappears once a task
    // exists, so the header button is the only way a user with one
    // task can create a second.
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.threeTasks.slice(0, 1));
    });

    cy.get('[data-cy="dashboard-list"] [data-cy="task-card"]').should('have.length', 1);

    cy.get('[data-cy="dashboard-create"]').click();
    fillRequiredFields({ title: 'Second task', creator: 'C', assignee: 'A' });
    cy.get('.task-dialog [data-action="submit-dialog"]').click();

    cy.get('[data-cy="dashboard-list"] [data-cy="task-card"]').should('have.length', 2);
    cy.get('[data-cy="dashboard-counter"]').should('have.attr', 'data-count', '2');
  });
});

// ---------------------------------------------------------------------------
// Empty state button — the contextual affordance
// ---------------------------------------------------------------------------

describe('create workflow — empty state button', () => {
  it('opens the same dialog as the header button', () => {
    cy.get('[data-cy="dashboard-empty-create"]').click();
    cy.get('.task-dialog').should('exist');
    cy.get('.task-dialog input[name="title"]').should('have.focus');
  });

  it('creating a task via the empty state button replaces the empty state with the list', () => {
    cy.get('[data-cy="dashboard-empty-create"]').click();
    fillRequiredFields(NEW_TASK);
    cy.get('.task-dialog [data-action="submit-dialog"]').click();

    cy.get('.empty-state').should('not.exist');
    cy.get('[data-cy="dashboard-list"] [data-cy="task-card"]').should('have.length', 1);
  });
});

// ---------------------------------------------------------------------------
// Validation — the required-field failure path
// ---------------------------------------------------------------------------

describe('create workflow — validation', () => {
  it('keeps the dialog open and shows per-field errors when required fields are missing', () => {
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get('.task-dialog [data-action="submit-dialog"]').click();

    // The dialog is still open.
    cy.get('.task-dialog').should('exist');
    cy.get('.task-dialog').then(($dialog) => {
      expect($dialog[0].open, 'dialog.open').to.equal(true);
    });

    // The first invalid field is focused — the schema's field order
    // is title, description, creator, assignee; title is the first
    // required field, so `showErrors` focuses it first.
    cy.get('.task-dialog input[name="title"]').should('have.focus');

    // The required fields carry `aria-invalid="true"`.
    cy.get('.task-dialog input[name="title"]').should('have.attr', 'aria-invalid', 'true');
    cy.get('.task-dialog input[name="creator"]').should('have.attr', 'aria-invalid', 'true');
    cy.get('.task-dialog input[name="assignee"]').should('have.attr', 'aria-invalid', 'true');

    // The description field is NOT marked invalid — it is optional.
    // This is a check that `showErrors` renders errors per-field,
    // not as a blanket "the form has errors" flag.
    cy.get('.task-dialog textarea[name="description"]').should('not.have.attr', 'aria-invalid');

    // The task was not created.
    cy.get('[data-cy="dashboard-list"] [data-cy="task-card"]').should('have.length', 0);
    cy.get('[data-cy="dashboard-counter"]').should('have.attr', 'data-count', '0');
  });

  it('clears a field\'s error when the user types into that field', () => {
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get('.task-dialog [data-action="submit-dialog"]').click();

    // Title has an error.
    cy.get('.task-dialog input[name="title"]').should('have.attr', 'aria-invalid', 'true');

    // Type into title — the dialog's input event listener clears
    // that field's error and aria-invalid attribute.
    cy.get('.task-dialog input[name="title"]').type('X');

    cy.get('.task-dialog input[name="title"]').should('not.have.attr', 'aria-invalid');

    // Creator's error is still present (the user has more work to
    // do before submitting again).
    cy.get('.task-dialog input[name="creator"]').should('have.attr', 'aria-invalid', 'true');
  });
});

// ---------------------------------------------------------------------------
// Cancel — the two paths, and the double-click safety
// ---------------------------------------------------------------------------

describe('create workflow — cancel', () => {
  it('closes the dialog and creates no task when Cancel is clicked', () => {
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get('.task-dialog input[name="title"]').type('A title that will be discarded');
    cy.get('.task-dialog [data-action="cancel-dialog"]').click();

    cy.get('.task-dialog').should('not.exist');
    cy.get('[data-cy="dashboard-list"] [data-cy="task-card"]').should('have.length', 0);
    cy.get('[data-cy="dashboard-counter"]').should('have.attr', 'data-count', '0');
  });

  it('closes the dialog and creates no task when Escape is pressed', () => {
    // The Esc key fires the dialog's native `cancel` event; the
    // app's `onCancel` is notified from the `close` event. This
    // exercises that path. `cy.type('{esc}')` on the focused input
    // fires the Esc key on the input, which the browser interprets
    // as a cancel of the modal <dialog>.
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get('.task-dialog input[name="title"]').type('Discarded via Escape');
    cy.get('.task-dialog input[name="title"]').type('{esc}');

    cy.get('.task-dialog').should('not.exist');
    cy.get('[data-cy="dashboard-list"] [data-cy="task-card"]').should('have.length', 0);
    cy.get('[data-cy="dashboard-counter"]').should('have.attr', 'data-count', '0');
  });

  it('does not require a second click to close the dialog', () => {
    // The two-click-to-cancel bug from the delivered dialog: the
    // first click on Cancel did not close the dialog; the second did.
    // The fix makes the cancel handler idempotent (guard on
    // `dialog.open`) and moves the notification to the `close`
    // event. The observable outcome is: the dialog is gone after
    // ONE click.
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get('.task-dialog [data-action="cancel-dialog"]').click();

    // After the first click, the dialog must be gone.
    cy.get('.task-dialog').should('not.exist');
  });

  it('reopens with empty fields after a cancel', () => {
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get('.task-dialog input[name="title"]').type('Will be discarded');
    cy.get('.task-dialog [data-action="cancel-dialog"]').click();
    cy.get('.task-dialog').should('not.exist');

    // Reopen. The dialog is a fresh instance — no leftover values.
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get('.task-dialog').should('exist');
    cy.get('.task-dialog input[name="title"]').should('have.value', '');
    cy.get('.task-dialog input[name="creator"]').should('have.value', '');
    cy.get('.task-dialog input[name="assignee"]').should('have.value', '');
  });
});

// ---------------------------------------------------------------------------
// Dialog lifecycle — mounting and unmounting cleanly
// ---------------------------------------------------------------------------

describe('create workflow — dialog lifecycle', () => {
  it('mounts the dialog when opened and removes it when closed', () => {
    // Before opening: no dialog.
    cy.get('.task-dialog').should('not.exist');

    // Open: dialog exists and is in the DOM.
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get('.task-dialog').should('exist');

    // Cancel: dialog removed from the DOM.
    cy.get('.task-dialog [data-action="cancel-dialog"]').click();
    cy.get('.task-dialog').should('not.exist');
  });

  it('the dialog is the only modal — its opening does not leave residual DOM', () => {
    // Two opens and closes in a row. Each open mounts a fresh
    // dialog; each close removes it. A leak (a dialog left in the
    // DOM after close) would show up here as a leftover dialog.
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get('.task-dialog [data-action="cancel-dialog"]').click();
    cy.get('.task-dialog').should('not.exist');

    cy.get('[data-cy="dashboard-create"]').click();
    cy.get('.task-dialog').should('have.length', 1);

    cy.get('.task-dialog [data-action="cancel-dialog"]').click();
    cy.get('.task-dialog').should('not.exist');
  });
});