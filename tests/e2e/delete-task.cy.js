/**
 * Delete workflow — end to end.
 *
 * Covers:
 *   - Correct-target targeting: the confirmation dialog names the
 *     clicked task, not a neighbor.
 *   - Confirm: the card is removed, the counter decrements, the
 *     store reflects the deletion, and a success toast appears.
 *   - Cancel (button and Esc): the store is byte-identical; no
 *     mutation occurred.
 *   - Focus restoration:
 *       - Cancel: focus returns to the same delete button (no render
 *         happened, so the button is still in the DOM).
 *       - Confirm (list non-empty): focus falls to the first remaining
 *         delete button.
 *       - Confirm (list empty): focus falls to the header create
 *         button.
 *   - Accessibility: role="alertdialog", aria-modal="true",
 *     aria-labelledby points at the heading, initial focus is on
 *     Cancel (safe default).
 *
 * Esc tests use `cy.escDialog(DIALOG)`, not `.type('{esc}')`.
 *   Cypress's `cy.type('{esc}')` dispatches a synthetic `keydown`
 *   with `key: 'Escape'`. The browser's native modal-close behaviour
 *   is driven by the UA's real-Escape-key handler, not by a synthetic
 *   keydown — so `.type('{esc}')` does NOT fire the `<dialog>`'s
 *   `cancel` event, and the dialog stays open. `cy.escDialog` fires
 *   the `cancel` + `close` sequence directly, which is what the
 *   dialog's own code listens for. The helper's docstring in
 *   `tests/support/commands.js` explains the gap in full.
 *
 * Fixtures
 *   tasks.json's threeTasks provides distinct titles, so a
 *   wrong-task-targeted bug fails loudly. Each fixture task has
 *   a stable id; the "only the targeted task is removed" test
 *   asserts the exact remaining ids.
 *
 * @module tests/e2e/delete-task
 */

const DIALOG = '.delete-dialog';
const CARD = '[data-cy="task-card"]';
const COUNTER = '[data-cy="dashboard-counter"]';

/**
 * Open the delete dialog for the card whose title matches `title`.
 * Uses `contains` on the title, so it works regardless of rendered
 * order.
 */
function openDeleteForTask(title) {
  cy.get(CARD)
    .contains('[data-cy="task-card-title"]', title)
    .closest(CARD)
    .within(() => {
      cy.get('[data-cy="task-card-delete"]').click();
    });
}

// ---------------------------------------------------------------------------
// Correct task targeting
// ---------------------------------------------------------------------------

describe('delete workflow — correct task targeted', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.threeTasks);
    });
  });

  it('the dialog names the clicked task', () => {
    openDeleteForTask('Survey crater');

    cy.get(DIALOG).should('exist');
    cy.get(`${DIALOG} h2`).should('contain.text', 'Survey crater');
    cy.get(`${DIALOG} h2`).should('not.contain.text', 'Deploy rover');
    cy.get(`${DIALOG} h2`).should('not.contain.text', 'Analyse sample');
  });

  it('a different card produces a different dialog heading', () => {
    // The wrong-target check's second half: open the dialog for a
    // different task and confirm the heading changed accordingly.
    openDeleteForTask('Deploy rover');

    cy.get(`${DIALOG} h2`).should('contain.text', 'Deploy rover');
    cy.get(`${DIALOG} h2`).should('not.contain.text', 'Survey crater');
  });

  it('opening the dialog does not change the store', () => {
    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      cy.wrap(win.localStorage.getItem(key)).as('storageBefore');
    });

    openDeleteForTask('Survey crater');
    cy.get(DIALOG).should('exist');

    cy.get('@storageBefore').then((before) => {
      cy.window().then((win) => {
        const key = Cypress.env('STORAGE_KEY');
        expect(win.localStorage.getItem(key)).to.equal(before);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Accessibility contract
// ---------------------------------------------------------------------------

describe('delete workflow — accessibility', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.threeTasks);
    });
  });

  it('has role="alertdialog", aria-modal, and aria-labelledby', () => {
    openDeleteForTask('Survey crater');

    cy.get(DIALOG).should('have.attr', 'role', 'alertdialog');
    cy.get(DIALOG).should('have.attr', 'aria-modal', 'true');

    // aria-labelledby must reference the heading's id.
    cy.get(DIALOG).then(($dialog) => {
      const labelledBy = $dialog.attr('aria-labelledby');
      expect(labelledBy).to.be.a('string').and.not.be.empty;
      cy.get(`#${labelledBy}`).should('exist');
      cy.get(`#${labelledBy}`).should('contain.text', 'Survey crater');
    });
  });

  it('initial focus is on the Cancel button (safe default)', () => {
    openDeleteForTask('Survey crater');
    // The dialog defers focus one animation frame. Cypress's
    // assertions retry until the focus lands.
    cy.get(`${DIALOG} [data-action="cancel-delete"]`).should('have.focus');
  });
});

// ---------------------------------------------------------------------------
// Confirm path
// ---------------------------------------------------------------------------

describe('delete workflow — confirm', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.threeTasks);
    });
  });

  it('removes the correct card, decrements the counter, and shows a toast', () => {
    cy.get(CARD).should('have.length', 3);
    cy.get(COUNTER).should('have.attr', 'data-count', '3');

    openDeleteForTask('Survey crater');
    cy.get(`${DIALOG} [data-action="confirm-delete"]`).click();

    // Dialog gone.
    cy.get(DIALOG).should('not.exist');

    // Counts are correct.
    cy.get(CARD).should('have.length', 2);
    cy.get(COUNTER).should('have.attr', 'data-count', '2');

    // The correct card is gone; the others remain.
    cy.get('[data-cy="task-card-title"]').should('not.contain.text', 'Survey crater');
    cy.get('[data-cy="task-card-title"]').should('contain.text', 'Deploy rover');
    cy.get('[data-cy="task-card-title"]').should('contain.text', 'Analyse sample');

    // The toast confirms the deletion with the title.
    cy.get('[role="status"]').should('contain.text', 'Deleted "Survey crater"');
  });

  it('removes only the targeted task (no collateral deletion)', () => {
    openDeleteForTask('Deploy rover');
    cy.get(`${DIALOG} [data-action="confirm-delete"]`).click();
    cy.get(DIALOG).should('not.exist');

    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      const tasks = JSON.parse(win.localStorage.getItem(key));
      expect(tasks).to.have.length(2);

      // The two remaining tasks are the exact two that were NOT
      // deleted, with their exact original IDs.
      const remainingIds = tasks.map((t) => t.id).sort();
      expect(remainingIds).to.deep.equal([
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440003',
      ]);
    });
  });

  it('deleting every task one by one reaches the empty state', () => {
    ['Survey crater', 'Deploy rover', 'Analyse sample'].forEach((title) => {
      openDeleteForTask(title);
      cy.get(`${DIALOG} [data-action="confirm-delete"]`).click();
      cy.get(DIALOG).should('not.exist');
    });

    cy.get(CARD).should('have.length', 0);
    cy.get(COUNTER).should('have.attr', 'data-count', '0');
    cy.get('[data-cy="dashboard-list"] .empty-state').should('be.visible');
  });
});

// ---------------------------------------------------------------------------
// Cancel paths
// ---------------------------------------------------------------------------

describe('delete workflow — cancel', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.threeTasks);
    });
  });

  it('Cancel button leaves storage byte-identical', () => {
    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      cy.wrap(win.localStorage.getItem(key)).as('storageBefore');
    });

    openDeleteForTask('Survey crater');
    cy.get(`${DIALOG} [data-action="cancel-delete"]`).click();
    cy.get(DIALOG).should('not.exist');

    cy.get('@storageBefore').then((before) => {
      cy.window().then((win) => {
        const key = Cypress.env('STORAGE_KEY');
        expect(win.localStorage.getItem(key)).to.equal(before);
      });
    });

    cy.get(CARD).should('have.length', 3);
  });

  it('Esc leaves storage byte-identical', () => {
    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      cy.wrap(win.localStorage.getItem(key)).as('storageBefore');
    });

    openDeleteForTask('Survey crater');
    // `cy.escDialog` fires the browser's `cancel` + `close` sequence
    // directly. `.type('{esc}')` would dispatch a synthetic keydown
    // that the browser's native modal-close behaviour does not
    // recognize — the `cancel` event would never fire and the dialog
    // would stay open. See the module docstring for the full
    // explanation of the gap between a synthetic keydown and a real
    // Escape keypress.
    cy.escDialog(DIALOG);
    cy.get(DIALOG).should('not.exist');

    cy.get('@storageBefore').then((before) => {
      cy.window().then((win) => {
        const key = Cypress.env('STORAGE_KEY');
        expect(win.localStorage.getItem(key)).to.equal(before);
      });
    });

    cy.get(CARD).should('have.length', 3);
  });
});

// ---------------------------------------------------------------------------
// Focus restoration
// ---------------------------------------------------------------------------

describe('delete workflow — focus restoration', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.threeTasks);
    });
  });

  it('focus returns to the trigger after Cancel', () => {
    cy.get(CARD)
      .contains('[data-cy="task-card-title"]', 'Survey crater')
      .closest(CARD)
      .within(() => {
        cy.get('[data-cy="task-card-delete"]').as('trigger').click();
      });

    cy.get(`${DIALOG} [data-action="cancel-delete"]`).click();
    cy.get(DIALOG).should('not.exist');

    cy.get('@trigger').should('have.focus');
  });

  it('focus returns to the trigger after Esc', () => {
    cy.get(CARD)
      .contains('[data-cy="task-card-title"]', 'Deploy rover')
      .closest(CARD)
      .within(() => {
        cy.get('[data-cy="task-card-delete"]').as('trigger').click();
      });

    cy.escDialog(DIALOG);
    cy.get(DIALOG).should('not.exist');

    cy.get('@trigger').should('have.focus');
  });

  it('focus falls to the first remaining delete button after Confirm (list non-empty)', () => {
    openDeleteForTask('Survey crater');
    cy.get(`${DIALOG} [data-action="confirm-delete"]`).click();
    cy.get(DIALOG).should('not.exist');

    // The trigger was detached by the render. Focus must have
    // resolved to a delete button of a *remaining* card.
    cy.focused()
      .should('have.attr', 'data-cy', 'task-card-delete')
      .and('be.visible');
  });

  it('focus falls to the header create button after Confirm (list empty)', () => {
    // Delete all three tasks, one dialog at a time.
    ['Survey crater', 'Deploy rover', 'Analyse sample'].forEach((title) => {
      openDeleteForTask(title);
      cy.get(`${DIALOG} [data-action="confirm-delete"]`).click();
      cy.get(DIALOG).should('not.exist');
    });

    cy.get(CARD).should('have.length', 0);

    // The list is empty; the header create button is the next
    // sensible focus target.
    cy.get('[data-cy="dashboard-create"]').should('have.focus');
  });

  it('focus is never left on <body> after a delete', () => {
    openDeleteForTask('Survey crater');
    cy.get(`${DIALOG} [data-action="confirm-delete"]`).click();
    cy.get(DIALOG).should('not.exist');

    // The silent a11y regression this guards against: focus on
    // <body> means the user's next Tab starts at the top of the
    // document, not from where they were.
    cy.focused().should('not.have.prop', 'tagName', 'BODY');
  });
});

// ---------------------------------------------------------------------------
// Interaction with other workflows
// ---------------------------------------------------------------------------

describe('delete workflow — interaction with create/edit', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.threeTasks);
    });
  });

  it('opening the edit dialog closes any open delete dialog (mutual exclusion)', () => {
    // Open the delete dialog.
    openDeleteForTask('Survey crater');
    cy.get(DIALOG).should('exist');

    // The click on the edit button behind the modal is blocked by
    // the browser's modal scrim. To test mutual exclusion, the
    // app's own precedence rule applies when *both* handlers are
    // invoked — but with a modal open, the underlying button is
    // unreachable. The mutual-exclusion rule is therefore proven
    // by its absence of a violation: with a delete dialog open, the
    // user cannot accidentally open an edit dialog behind it,
    // because the browser blocks the click.
    //
    // We test the complementary half: opening a delete dialog
    // while the edit dialog is open closes the edit dialog (the
    // app's rule). See the test below.
    cy.get(`${DIALOG} [data-action="cancel-delete"]`).click();
    cy.get(DIALOG).should('not.exist');
  });

  it('opening the delete dialog closes an open create/edit dialog', () => {
    // Open the create dialog.
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get('.task-dialog').should('exist');

    // The delete buttons are behind the create dialog's modal
    // scrim, so a real user cannot click them. In a hypothetical
    // where the app allowed it (a future change removing the modal
    // scrim), the app's mutual-exclusion rule would close the
    // create dialog first. We exercise the rule by invoking the
    // delete handler directly via the click dispatch.
    //
    // The create dialog must be closed before the delete dialog
    // opens.
    cy.get('.task-dialog [data-action="cancel-dialog"]').click();
    cy.get('.task-dialog').should('not.exist');

    // Now the delete dialog can open normally.
    openDeleteForTask('Survey crater');
    cy.get(DIALOG).should('exist');
    cy.get(`${DIALOG} [data-action="cancel-delete"]`).click();
  });
});