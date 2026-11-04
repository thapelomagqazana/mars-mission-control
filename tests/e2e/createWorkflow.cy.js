/**
 * Create workflow — end to end.
 *
 * The create workflow as a user experiences it:
 *
 *   1. Click a create affordance — the header's "Create task" button,
 *      or the empty state's "Create your first task" when the list is
 *      empty.
 *   2. The dialog opens; the title input is focused.
 *   3. Fill the form and submit.
 *   4. The dialog closes; the task appears in the list; the counter
 *      increments; the task is in localStorage.
 *
 * This spec asserts the SHAPE OF THE FLOW (click → dialog → fill →
 * submit → list → persistence). The jsdom unit tests assert the shape
 * of each view. The two layers are complementary: unit tests catch a
 * schema drift, e2e tests catch an event-wiring drift.
 *
 * Fixture boundary
 *   The form values filled in the happy path are LITERAL, in one
 *   object (NEW_TASK), because the assertion is about those values
 *   round-tripping. The seed for the "second task" test comes from
 *   `tasks.json`, because that test asserts a COUNT TRANSITION, not
 *   the seed's content. Move a literal to a fixture only when the
 *   assertion stops being about the value.
 *
 * Isolation
 *   `tests/support/e2e.js` clears `localStorage[STORAGE_KEY]` and
 *   visits `/` before every test. Every test below therefore starts
 *   from an empty store and its first line is the user's first
 *   action. No test depends on another test's residue.
 *
 * Selectors
 *   `[data-cy="…"]` from the selector register; `[data-action="…"]`
 *   from the dialog contract. CSS classes are used only where the
 *   register does not yet name the element (`.task-dialog`,
 *   `.empty-state`) — those are the dialogs' and empty state's
 *   styling hooks, and this spec uses them as *containers*, not as
 *   behaviour anchors. Assertions target the registered child
 *   selectors inside them.
 *
 * @module tests/e2e/createWorkflow
 */

/**
 * The values used across the happy-path tests. One object keeps the
 * fill and the assertion in sync — a typo becomes a typo in both,
 * and the failure is "the values did not round-trip", which is the
 * correct failure mode.
 *
 * `description` is deliberately absent: the schema declares it
 * optional with a default of `''`, and the happy path submits the
 * minimal form. A future full-form test adds the field to a separate
 * object so the minimal and full cases stay legible.
 */
const NEW_TASK = Object.freeze({
  title: 'Check hull',
  creator: 'Commander Aria Vance',
  assignee: 'Engineer Kade',
});

/** The task dialog's container. */
const DIALOG = '.task-dialog';

/** The empty state's container. */
const EMPTY_STATE = '.empty-state';

/** The task-area container (registered). */
const LIST = '[data-cy="dashboard-list"]';

/** A card in the list (registered). */
const CARD = '[data-cy="task-card"]';

/** The counter (registered). */
const COUNTER = '[data-cy="dashboard-counter"]';

/**
 * Fill the dialog's required fields.
 *
 * Spec-local, not a custom command: it is used only here, and a
 * reader of this file sees the exact field names and values — which
 * is the point of a workflow test. The helper does not assert; the
 * test does. The helper does not submit; the test does. Those are
 * the user actions a workflow test exists to show.
 *
 * @param {{ title: string, creator: string, assignee: string }} values
 */
function fillRequiredFields(values) {
  cy.get(`${DIALOG} input[name="title"]`).type(values.title);
  cy.get(`${DIALOG} input[name="creator"]`).type(values.creator);
  cy.get(`${DIALOG} input[name="assignee"]`).type(values.assignee);
}

/**
 * Assert the dialog is absent. Used at every "closed" point, so the
 * assertion's wording (the dialog is *removed*, not merely hidden) is
 * stated once.
 */
function assertDialogClosed() {
  cy.get(DIALOG).should('not.exist');
}

/**
 * Assert the counter shows the given count via its `data-count`
 * attribute. The counter is registered; the count is its contract.
 *
 * @param {number} count
 */
function assertCounter(count) {
  cy.get(COUNTER).should('have.attr', 'data-count', String(count));
}

// ---------------------------------------------------------------------------
// Setup sanity — both affordances exist on first load
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
    assertCounter(0);
  });

  it('renders the empty state inside the list container, not replacing it', () => {
    // The container is present.
    cy.get(LIST).should('exist');

    // The empty state is its content.
    cy.get(`${LIST} ${EMPTY_STATE}`).should('be.visible');

    // No cards.
    cy.get(CARD).should('have.length', 0);
  });
});

// ---------------------------------------------------------------------------
// Header button — the persistent affordance
// ---------------------------------------------------------------------------

describe('create workflow — header button', () => {
  it('opens the dialog and focuses the title input', () => {
    cy.get('[data-cy="dashboard-create"]').click();

    cy.get(DIALOG).should('exist');
    cy.get(DIALOG).then(($dialog) => {
      // `dialog.open` is the native modal state — not a class, not
      // an attribute. The DOM property is the source of truth.
      expect($dialog[0].open, 'dialog.open').to.equal(true);
    });

    // The title input is focused so the user can start typing
    // immediately.
    cy.get(`${DIALOG} input[name="title"]`).should('have.focus');
  });

  it('creates a task, closes the dialog, updates the list and counter, and persists', () => {
    cy.get('[data-cy="dashboard-create"]').click();
    fillRequiredFields(NEW_TASK);
    cy.get(`${DIALOG} [data-action="submit-dialog"]`).click();

    assertDialogClosed();

    // The task card appears.
    cy.get(`${LIST} ${CARD}`)
      .should('have.length', 1)
      .and('contain.text', NEW_TASK.title)
      .and('contain.text', NEW_TASK.creator)
      .and('contain.text', NEW_TASK.assignee);

    // The counter reflects the new count.
    assertCounter(1);

    // The persisted form is the store's contract with the next page
    // load. Asserting on `localStorage` is not an implementation
    // detail — it is the store's observable output from the browser.
    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      const raw = win.localStorage.getItem(key);
      expect(raw, `localStorage[${key}]`).to.be.a('string');

      const tasks = JSON.parse(raw);
      expect(tasks, 'persisted tasks').to.have.length(1);
      expect(tasks[0].title).to.equal(NEW_TASK.title);
      expect(tasks[0].creator).to.equal(NEW_TASK.creator);
      expect(tasks[0].assignee).to.equal(NEW_TASK.assignee);
      // The description is stored as the schema's default, '' — not
      // omitted. A future change that omitted the field would be a
      // schema change, and this assertion is what would catch it.
      expect(tasks[0].description).to.equal('');
      // The generated ID and timestamp are present and well-formed;
      // their exact values are not asserted (they are the store's
      // business, not the flow's).
      expect(tasks[0].id, 'task id').to.be.a('string').and.not.be.empty;
      expect(tasks[0].createdAt, 'createdAt')
        .to.be.a('string')
        .and.match(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  it('persists the task across a page reload', () => {
    cy.get('[data-cy="dashboard-create"]').click();
    fillRequiredFields(NEW_TASK);
    cy.get(`${DIALOG} [data-action="submit-dialog"]`).click();
    assertDialogClosed();

    // The support file's reset runs once per test, so `cy.reload()`
    // does NOT re-clear storage. The task must survive.
    cy.reload();

    cy.get(`${LIST} ${CARD}`).should('have.length', 1);
    cy.get(`${LIST} ${CARD}`).should('contain.text', NEW_TASK.title);
    assertCounter(1);
  });

  it('creates a second task when one is already present', () => {
    // The header button is the *persistent* affordance — it must
    // work when the list is non-empty. The empty state's button is
    // gone once a task exists, so the header button is the only way
    // a user with one task can create a second.
    //
    // The seed comes from a fixture because this test asserts a
    // COUNT TRANSITION (1 → 2), not the seed's content. Fixture use
    // here is correct: identity of the seed does not matter.
    cy.fixture('tasks.json').then((fixture) => {
      // `cy.seedTasks` resolves only after the app has rendered the
      // seeded task — no race with the app's async hydration.
      cy.seedTasks(fixture.singleTask);
    });

    cy.get(`${LIST} ${CARD}`).should('have.length', 1);

    cy.get('[data-cy="dashboard-create"]').click();
    fillRequiredFields({ title: 'Second task', creator: 'C', assignee: 'A' });
    cy.get(`${DIALOG} [data-action="submit-dialog"]`).click();

    cy.get(`${LIST} ${CARD}`).should('have.length', 2);
    assertCounter(2);
  });
});

// ---------------------------------------------------------------------------
// Empty state button — the contextual affordance
// ---------------------------------------------------------------------------

describe('create workflow — empty state button', () => {
  it('opens the same dialog as the header button', () => {
    cy.get('[data-cy="dashboard-empty-create"]').click();
    cy.get(DIALOG).should('exist');
    cy.get(`${DIALOG} input[name="title"]`).should('have.focus');
  });

  it('replaces the empty state with the list on submit', () => {
    cy.get('[data-cy="dashboard-empty-create"]').click();
    fillRequiredFields(NEW_TASK);
    cy.get(`${DIALOG} [data-action="submit-dialog"]`).click();

    cy.get(EMPTY_STATE).should('not.exist');
    cy.get(`${LIST} ${CARD}`).should('have.length', 1);
    assertCounter(1);
  });
});

// ---------------------------------------------------------------------------
// Validation — the required-field failure path
// ---------------------------------------------------------------------------

describe('create workflow — validation', () => {
  it('keeps the dialog open and marks required fields invalid', () => {
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get(`${DIALOG} [data-action="submit-dialog"]`).click();

    // Still open.
    cy.get(DIALOG).should('exist');
    cy.get(DIALOG).then(($dialog) => {
      expect($dialog[0].open, 'dialog.open').to.equal(true);
    });

    // The first invalid field is focused (schema order: title first).
    cy.get(`${DIALOG} input[name="title"]`).should('have.focus');

    // Required fields are marked.
    cy.get(`${DIALOG} input[name="title"]`).should('have.attr', 'aria-invalid', 'true');
    cy.get(`${DIALOG} input[name="creator"]`).should('have.attr', 'aria-invalid', 'true');
    cy.get(`${DIALOG} input[name="assignee"]`).should('have.attr', 'aria-invalid', 'true');

    // The optional description is NOT marked. This asserts that
    // errors are per-field, not a blanket "the form has errors".
    cy.get(`${DIALOG} textarea[name="description"]`).should('not.have.attr', 'aria-invalid');

    // Nothing was created.
    cy.get(CARD).should('have.length', 0);
    assertCounter(0);
  });

  it('rejects whitespace-only values in required fields', () => {
    cy.get('[data-cy="dashboard-create"]').click();

    // Type only spaces into each required field.
    cy.get(`${DIALOG} input[name="title"]`).type('   ');
    cy.get(`${DIALOG} input[name="creator"]`).type('   ');
    cy.get(`${DIALOG} input[name="assignee"]`).type('   ');
    cy.get(`${DIALOG} [data-action="submit-dialog"]`).click();

    // The submit reads trimmed values (dialog's `readValues`), so
    // these are empty strings — validation rejects them, dialog
    // stays open, nothing is created.
    cy.get(DIALOG).should('exist');
    cy.get(CARD).should('have.length', 0);
    assertCounter(0);
  });

  it('clears a field\'s error when the user types into that field', () => {
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get(`${DIALOG} [data-action="submit-dialog"]`).click();

    cy.get(`${DIALOG} input[name="title"]`).should('have.attr', 'aria-invalid', 'true');

    cy.get(`${DIALOG} input[name="title"]`).type('X');
    cy.get(`${DIALOG} input[name="title"]`).should('not.have.attr', 'aria-invalid');

    // Creator's error persists — the user still has work to do.
    cy.get(`${DIALOG} input[name="creator"]`).should('have.attr', 'aria-invalid', 'true');
  });
});

// ---------------------------------------------------------------------------
// Cancel — both paths, idempotence, and reopen state
// ---------------------------------------------------------------------------

describe('create workflow — cancel', () => {
  it('closes the dialog and creates no task when Cancel is clicked', () => {
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get(`${DIALOG} input[name="title"]`).type('A title that will be discarded');
    cy.get(`${DIALOG} [data-action="cancel-dialog"]`).click();

    assertDialogClosed();
    cy.get(CARD).should('have.length', 0);
    assertCounter(0);
  });

  it('closes the dialog and creates no task when Escape is pressed', () => {
    // The Esc key fires the dialog's native `cancel` event; the
    // app's `onCancel` is notified from `close`. This exercises that
    // path end-to-end.
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get(`${DIALOG} input[name="title"]`).type('Discarded via Escape');
    cy.get(`${DIALOG} input[name="title"]`).type('{esc}');

    assertDialogClosed();
    cy.get(CARD).should('have.length', 0);
    assertCounter(0);
  });

  it('closes the dialog on a single Cancel click (idempotence regression)', () => {
    // The delivered dialog's symptom: "I have to click twice to
    // exit." The fix is a `dialog.open` guard at both cancel entry
    // points. Observable outcome: ONE click closes the dialog.
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get(`${DIALOG} [data-action="cancel-dialog"]`).click();

    cy.get(DIALOG).should('not.exist');
  });

  it('reopens with empty fields after a cancel', () => {
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get(`${DIALOG} input[name="title"]`).type('Will be discarded');
    cy.get(`${DIALOG} [data-action="cancel-dialog"]`).click();
    assertDialogClosed();

    // Reopen — the dialog is a fresh instance, no leftover values.
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get(DIALOG).should('exist');
    cy.get(`${DIALOG} input[name="title"]`).should('have.value', '');
    cy.get(`${DIALOG} input[name="creator"]`).should('have.value', '');
    cy.get(`${DIALOG} input[name="assignee"]`).should('have.value', '');
    cy.get(`${DIALOG} textarea[name="description"]`).should('have.value', '');
  });
});

// ---------------------------------------------------------------------------
// Dialog lifecycle — clean mount and unmount, no residue
// ---------------------------------------------------------------------------

describe('create workflow — dialog lifecycle', () => {
  it('mounts when opened and removes when closed', () => {
    cy.get(DIALOG).should('not.exist');

    cy.get('[data-cy="dashboard-create"]').click();
    cy.get(DIALOG).should('exist');

    cy.get(`${DIALOG} [data-action="cancel-dialog"]`).click();
    assertDialogClosed();
  });

  it('leaves no residual dialog after two open/close cycles', () => {
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get(`${DIALOG} [data-action="cancel-dialog"]`).click();
    assertDialogClosed();

    cy.get('[data-cy="dashboard-create"]').click();
    cy.get(DIALOG).should('have.length', 1);

    cy.get(`${DIALOG} [data-action="cancel-dialog"]`).click();
    assertDialogClosed();
  });
});

// ---------------------------------------------------------------------------
// Focus restoration — the trigger regains focus on close
// ---------------------------------------------------------------------------

describe('create workflow — focus restoration', () => {
  it('restores focus to the header trigger after a cancel', () => {
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get(`${DIALOG} [data-action="cancel-dialog"]`).click();
    assertDialogClosed();

    // The dialog's controller restores focus to the element that
    // opened it. This is the header button in this path.
    cy.get('[data-cy="dashboard-create"]').should('have.focus');
  });

  it('restores focus to the empty-state trigger after a cancel', () => {
    cy.get('[data-cy="dashboard-empty-create"]').click();
    cy.get(`${DIALOG} [data-action="cancel-dialog"]`).click();
    assertDialogClosed();

    cy.get('[data-cy="dashboard-empty-create"]').should('have.focus');
  });
});