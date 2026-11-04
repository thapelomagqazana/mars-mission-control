/**
 * Edit workflow — end to end.
 *
 * The edit lifecycle as a user experiences it:
 *
 *   1. Click a card's Edit button.
 *   2. The dialog opens with that task's values in every field.
 *   3. Change one or more fields.
 *   4. Submit.
 *   5. The card updates in place; the counter does not change; the
 *      store contains the new values under the same id.
 *
 * And the cancel paths:
 *
 *   1. Click a card's Edit button.
 *   2. Change one or more fields.
 *   3. Cancel (button or Esc).
 *   4. The dialog closes; the card is unchanged; the store is
 *      unchanged; localStorage is byte-identical.
 *
 * The two focus-restoration paths:
 *
 *   1. Cancel: focus returns to the same Edit button (it was not
 *      replaced by a render).
 *   2. Submit: focus returns to the *new* Edit button for the same
 *      task (the old one was replaced by the render).
 *
 * Fixtures
 *   `tasks.json`'s `threeTasks` provides distinct titles,
 *   descriptions, creators, and assignees per task, so a
 *   wrong-task-opened bug (which would show another task's values)
 *   fails loudly.
 *
 * @module tests/e2e/edit-task
 */

const DIALOG = '.task-dialog';
const CARD = '[data-cy="task-card"]';
const COUNTER = '[data-cy="dashboard-counter"]';

/**
 * Open the edit dialog for the card at index `n` (0-based, in the
 * rendered order).
 */
function openEditForCardIndex(n) {
  cy.get(CARD).eq(n).within(() => {
    cy.get('[data-cy="task-card-edit"]').click();
  });
}

/**
 * Open the edit dialog for the card whose title matches `title`.
 * Useful when the rendered order is not guaranteed and we need to
 * target a specific task by content.
 */
function openEditForTask(title) {
  cy.get(CARD)
    .contains('[data-cy="task-card-title"]', title)
    .closest(CARD)
    .within(() => {
      cy.get('[data-cy="task-card-edit"]').click();
    });
}

// ---------------------------------------------------------------------------
// Correct task opens
// ---------------------------------------------------------------------------

describe('edit workflow — correct task opens', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.threeTasks);
    });
  });

  it('opens the dialog with the clicked card\'s values', () => {
    // Open the edit dialog for "Survey crater" by title, so we do
    // not depend on rendered order.
    openEditForTask('Survey crater');

    cy.get(DIALOG).should('exist');
    cy.get(`${DIALOG} input[name="title"]`).should('have.value', 'Survey crater');
    cy.get(`${DIALOG} textarea[name="description"]`).should('have.value', 'Check water ice');
    cy.get(`${DIALOG} input[name="creator"]`).should('have.value', 'Commander');
    cy.get(`${DIALOG} input[name="assignee"]`).should('have.value', 'Geologist');
  });

  it('opens the dialog for a different task with that task\'s values', () => {
    // This is the wrong-task-opened check: seed three distinct
    // tasks, open the second one, and confirm its values (not the
    // first's or the third's).
    openEditForTask('Deploy rover');

    cy.get(`${DIALOG} input[name="title"]`).should('have.value', 'Deploy rover');
    cy.get(`${DIALOG} input[name="creator"]`).should('have.value', 'Commander');
    cy.get(`${DIALOG} input[name="assignee"]`).should('have.value', 'Engineer');
  });

  it('opening the edit dialog does not change the store', () => {
    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      cy.wrap(win.localStorage.getItem(key)).as('storageBefore');
    });

    openEditForTask('Survey crater');
    cy.get(DIALOG).should('exist');

    cy.get('@storageBefore').then((before) => {
      cy.window().then((win) => {
        const key = Cypress.env('STORAGE_KEY');
        expect(win.localStorage.getItem(key)).to.equal(before);
      });
    });
  });

  it('renders the edit heading and submit label', () => {
    openEditForTask('Survey crater');

    cy.get(`${DIALOG} h2`).should('have.text', 'Edit task');
    cy.get(`${DIALOG} [data-action="submit-dialog"]`).should('have.text', 'Save changes');
  });
});

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

describe('edit workflow — submit', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.threeTasks);
    });
  });

  it('saves the changed field, keeps the id, does not change the count', () => {
    cy.get(CARD).should('have.length', 3);
    cy.get(COUNTER).should('have.attr', 'data-count', '3');

    // Capture the task id before the edit.
    cy.get(CARD)
      .contains('[data-cy="task-card-title"]', 'Survey crater')
      .closest(CARD)
      .then(($card) => {
        cy.wrap($card.attr('data-task-id')).as('originalId');
      });

    openEditForTask('Survey crater');
    cy.get(`${DIALOG} input[name="title"]`).clear().type('Survey crater (revised)');
    cy.get(`${DIALOG} [data-action="submit-dialog"]`).click();

    // The dialog is gone.
    cy.get(DIALOG).should('not.exist');

    // The count is unchanged.
    cy.get(CARD).should('have.length', 3);
    cy.get(COUNTER).should('have.attr', 'data-count', '3');

    // The card is updated in place — same task id, new title.
    cy.get('@originalId').then((originalId) => {
      cy.get(`[data-cy="task-card"][data-task-id="${originalId}"]`)
        .find('[data-cy="task-card-title"]')
        .should('have.text', 'Survey crater (revised)');
    });

    // The store reflects the change. The other tasks are untouched.
    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      const tasks = JSON.parse(win.localStorage.getItem(key));
      expect(tasks).to.have.length(3);
      expect(tasks.map((t) => t.title)).to.include('Survey crater (revised)');
      expect(tasks.map((t) => t.title)).to.include('Deploy rover');
      expect(tasks.map((t) => t.title)).to.include('Analyse sample');
    });
  });

  it('does not create a duplicate when the title is unchanged', () => {
    // An edit that submits identical values must still be an update,
    // not a delete-then-create. The count stays at 3; no new id.
    openEditForTask('Survey crater');
    cy.get(`${DIALOG} [data-action="submit-dialog"]`).click();

    cy.get(CARD).should('have.length', 3);
    cy.get(COUNTER).should('have.attr', 'data-count', '3');

    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      const tasks = JSON.parse(win.localStorage.getItem(key));
      expect(tasks).to.have.length(3);
      // The three ids are the three fixture ids; none were replaced.
      expect(tasks.map((t) => t.id).sort()).to.deep.equal([
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440002',
        '550e8400-e29b-41d4-a716-446655440003',
      ]);
    });
  });

  it('validation failure keeps the dialog open and does not mutate', () => {
    openEditForTask('Survey crater');
    cy.get(`${DIALOG} input[name="title"]`).clear();
    cy.get(`${DIALOG} [data-action="submit-dialog"]`).click();

    // The dialog is still open.
    cy.get(DIALOG).should('exist');
    cy.get(`${DIALOG} input[name="title"]`).should('have.attr', 'aria-invalid', 'true');

    // The count is unchanged, the card still shows the original.
    cy.get(CARD).should('have.length', 3);
    cy.get('[data-cy="task-card-title"]')
      .filter(':contains("Survey crater")')
      .should('have.length', 1);
  });

  it('does not create a duplicate when the title is changed', () => {
    // Same duplicate-guard, but exercising the changed-field path.
    openEditForTask('Survey crater');
    cy.get(`${DIALOG} input[name="title"]`).clear().type('Survey crater (renamed)');
    cy.get(`${DIALOG} [data-action="submit-dialog"]`).click();

    cy.get(DIALOG).should('not.exist');
    cy.get(CARD).should('have.length', 3);

    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      const tasks = JSON.parse(win.localStorage.getItem(key));
      expect(tasks).to.have.length(3);
      // No new id; the original three ids are still present.
      const ids = tasks.map((t) => t.id).sort();
      expect(ids).to.deep.equal([
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440002',
        '550e8400-e29b-41d4-a716-446655440003',
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

describe('edit workflow — cancel paths', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.threeTasks);
    });
  });

  function captureStorage() {
    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      cy.wrap(win.localStorage.getItem(key)).as('storageBefore');
    });
  }

  function assertStorageUnchanged() {
    cy.get('@storageBefore').then((before) => {
      cy.window().then((win) => {
        const key = Cypress.env('STORAGE_KEY');
        expect(win.localStorage.getItem(key)).to.equal(before);
      });
    });
  }

  it('cancel button leaves storage byte-identical (no changes made)', () => {
    captureStorage();
    openEditForTask('Survey crater');
    cy.get(`${DIALOG} [data-action="cancel-dialog"]`).click();
    cy.get(DIALOG).should('not.exist');
    assertStorageUnchanged();
  });

  it('cancel button leaves storage byte-identical (one field changed)', () => {
    captureStorage();
    openEditForTask('Survey crater');
    cy.get(`${DIALOG} input[name="title"]`).clear().type('Mutated');
    cy.get(`${DIALOG} [data-action="cancel-dialog"]`).click();
    cy.get(DIALOG).should('not.exist');
    assertStorageUnchanged();
  });

  it('cancel button leaves storage byte-identical (all fields changed)', () => {
    captureStorage();
    openEditForTask('Survey crater');
    cy.get(`${DIALOG} input[name="title"]`).clear().type('Mutated');
    cy.get(`${DIALOG} textarea[name="description"]`).clear().type('Mutated');
    cy.get(`${DIALOG} input[name="creator"]`).clear().type('Mutated');
    cy.get(`${DIALOG} input[name="assignee"]`).clear().type('Mutated');
    cy.get(`${DIALOG} [data-action="cancel-dialog"]`).click();
    cy.get(DIALOG).should('not.exist');
    assertStorageUnchanged();
  });

  it('Esc leaves storage byte-identical (no changes made)', () => {
    captureStorage();
    openEditForTask('Survey crater');
    cy.get(`${DIALOG} input[name="title"]`).type('{esc}');
    cy.get(DIALOG).should('not.exist');
    assertStorageUnchanged();
  });

  it('Esc leaves storage byte-identical (one field changed)', () => {
    captureStorage();
    openEditForTask('Survey crater');
    cy.get(`${DIALOG} input[name="title"]`).clear().type('Mutated');
    cy.get(`${DIALOG} input[name="title"]`).type('{esc}');
    cy.get(DIALOG).should('not.exist');
    assertStorageUnchanged();
  });

  it('Esc leaves storage byte-identical (all fields changed)', () => {
    captureStorage();
    openEditForTask('Survey crater');
    cy.get(`${DIALOG} input[name="title"]`).clear().type('Mutated');
    cy.get(`${DIALOG} textarea[name="description"]`).clear().type('Mutated');
    cy.get(`${DIALOG} input[name="creator"]`).clear().type('Mutated');
    cy.get(`${DIALOG} input[name="assignee"]`).clear().type('Mutated');
    cy.get(`${DIALOG} input[name="title"]`).type('{esc}');
    cy.get(DIALOG).should('not.exist');
    assertStorageUnchanged();
  });
});

// ---------------------------------------------------------------------------
// Focus restoration
// ---------------------------------------------------------------------------

describe('edit workflow — focus restoration', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.threeTasks);
    });
  });

  it('restores focus to the clicked edit button after cancel', () => {
    // Capture the trigger element before opening, so the assertion
    // after the dialog closes can compare against the same node.
    cy.get(CARD)
      .contains('[data-cy="task-card-title"]', 'Survey crater')
      .closest(CARD)
      .within(() => {
        cy.get('[data-cy="task-card-edit"]').as('trigger').click();
      });

    cy.get(`${DIALOG} [data-action="cancel-dialog"]`).click();
    cy.get(DIALOG).should('not.exist');

    // The trigger is still in the DOM (no render happened on the
    // cancel path), so focus must be on it.
    cy.get('@trigger').should('have.focus');
  });

  it('restores focus to the *replacement* edit button after submit', () => {
    // On submit, render() replaces the entire card tree. The original
    // trigger is detached; focus must resolve to the *new* button for
    // the same task.
    cy.get(CARD)
      .contains('[data-cy="task-card-title"]', 'Survey crater')
      .closest(CARD)
      .then(($card) => {
        cy.wrap($card.attr('data-task-id')).as('editedId');
      });

    openEditForTask('Survey crater');
    cy.get(`${DIALOG} input[name="title"]`).clear().type('Survey crater (focus test)');
    cy.get(`${DIALOG} [data-action="submit-dialog"]`).click();
    cy.get(DIALOG).should('not.exist');

    cy.get('@editedId').then((id) => {
      cy.get(`[data-cy="task-card"][data-task-id="${id}"] [data-cy="task-card-edit"]`)
        .should('have.focus');
    });
  });

  it('restores focus to the edit button after Escape', () => {
    cy.get(CARD)
      .contains('[data-cy="task-card-title"]', 'Deploy rover')
      .closest(CARD)
      .within(() => {
        cy.get('[data-cy="task-card-edit"]').as('trigger').click();
      });

    cy.get(`${DIALOG} input[name="title"]`).type('{esc}');
    cy.get(DIALOG).should('not.exist');

    cy.get('@trigger').should('have.focus');
  });
});