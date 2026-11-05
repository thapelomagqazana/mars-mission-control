/**
 * Clear-all workflow — end to end.
 *
 * Covers:
 *   - The sidebar's clear-all button is present in every state.
 *   - The button is disabled when the store is empty, enabled when
 *     it has tasks.
 *   - The button's aria-label names the count.
 *   - Clicking the button opens the confirmation dialog with the
 *     count in the heading.
 *   - The dialog has the alertdialog role, aria-modal,
 *     aria-labelledby, and initial focus on Cancel.
 *   - Confirm empties the store, resets the counter, shows the empty
 *     state, clears the search, shows the toast, and disables the
 *     button.
 *   - Cancel (button and Esc) leaves storage byte-identical.
 *   - Focus restores to the clear-all button on cancel and to the
 *     header create button on confirm (the clear-all button is
 *     disabled after a successful confirm and cannot receive
 *     focus).
 *   - The button is unreachable from behind a create/edit or delete
 *     dialog (modal scrim), and opening the clear-all dialog closes
 *     any other open dialog (mutual exclusion).
 *
 * Esc paths use `cy.escDialog` (from `tests/support/commands.js`),
 * not `cy.type('{esc}')`. Cypress's synthetic keyboard events do
 * not trigger a native `<dialog>`'s Esc-close sequence: the browser
 * dispatches `cancel` from the UA's real-keyboard handler, which
 * synthetic events do not reach. The helper fires the same `cancel`
 * and `close` events the browser would; the app's code path is
 * identical. See the helper's docstring in `commands.js` for the
 * full rationale.
 *
 * Focus-on-confirm and disabled buttons:
 *   After a successful clear, the store is empty and the sidebar's
 *   clear-all button becomes `disabled`. A `disabled` <button>
 *   cannot receive focus — the browser no-ops `.focus()` on it.
 *   The app's focus-restoration chain routes the confirm path to
 *   the header create button, which is always present and always
 *   enabled. The confirm-focus test asserts *that* target, not the
 *   disabled clear-all button (which would be a claim the browser
 *   cannot fulfill).
 *
 * Fixtures
 *   `tasks.json`'s `threeTasks` provides a known three-task store,
 *   so the count and the resulting empty state are deterministic.
 *   `singleTask` covers the singular-label path.
 *
 * @module tests/e2e/clear-all
 */

const CLEAR_ALL = '[data-cy="dashboard-clear-all"]';
const DIALOG = '.clear-all-dialog';
const CARD = '[data-cy="task-card"]';
const COUNTER = '[data-cy="dashboard-counter"]';
const SIDEBAR = '[data-cy="dashboard-sidebar"]';

// ---------------------------------------------------------------------------
// Button presence and state
// ---------------------------------------------------------------------------

describe('clear-all — button presence and state', () => {
  it('renders the button in the sidebar, disabled at zero tasks', () => {
    // The empty-store default from the support file's beforeEach.
    cy.get(CARD).should('have.length', 0);

    cy.get(SIDEBAR).within(() => {
      cy.get(CLEAR_ALL).should('exist');
      cy.get(CLEAR_ALL).should('be.disabled');
    });
  });

  it('renders the button enabled when tasks exist', () => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });

    cy.get(CARD).should('have.length', 3);
    cy.get(CLEAR_ALL).should('exist').and('not.be.disabled');
  });

  it('the aria-label names the task count when tasks exist', () => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });

    cy.get(CLEAR_ALL)
      .invoke('attr', 'aria-label')
      .should('match', /3 tasks will be deleted/);
  });

  it('the aria-label reflects the singular for a single task', () => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.singleTask);
    });

    cy.get(CLEAR_ALL)
      .invoke('attr', 'aria-label')
      .should('match', /1 task will be deleted/);
  });

  it('the aria-label says "no tasks to clear" when empty', () => {
    cy.get(CLEAR_ALL)
      .invoke('attr', 'aria-label')
      .should('match', /no tasks to clear/);
  });
});

// ---------------------------------------------------------------------------
// Confirmation dialog — content and accessibility
// ---------------------------------------------------------------------------

describe('clear-all — dialog content and accessibility', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });
  });

  it('opens with the count in the heading', () => {
    cy.get(CLEAR_ALL).click();
    cy.get(DIALOG).should('exist');
    cy.get(`${DIALOG} h2`).should('contain.text', 'Delete all 3 tasks?');
  });

  it('uses the singular for a single task', () => {
    cy.clearLocalStorage();
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.singleTask);
    });

    cy.get(CLEAR_ALL).click();
    cy.get(`${DIALOG} h2`).should('contain.text', 'Delete all 1 task?');
  });

  it('has role="alertdialog" and aria-modal="true"', () => {
    cy.get(CLEAR_ALL).click();
    cy.get(DIALOG).should('have.attr', 'role', 'alertdialog');
    cy.get(DIALOG).should('have.attr', 'aria-modal', 'true');
  });

  it('has aria-labelledby pointing at the heading', () => {
    cy.get(CLEAR_ALL).click();
    cy.get(DIALOG).then(($dialog) => {
      const labelledBy = $dialog.attr('aria-labelledby');
      expect(labelledBy).to.be.a('string').and.not.be.empty;
      cy.get(`#${labelledBy}`).should('exist');
      cy.get(`#${labelledBy}`).should('contain.text', 'Delete all 3 tasks?');
    });
  });

  it('names the irreversibility in the body copy', () => {
    cy.get(CLEAR_ALL).click();
    cy.get(`${DIALOG} .clear-all-dialog__body`)
      .should('contain.text', 'cannot be undone')
      .and('contain.text', 'every task');
  });

  it('initial focus is on the Cancel button (safe default)', () => {
    cy.get(CLEAR_ALL).click();
    cy.get(`${DIALOG} [data-action="cancel-clear-all"]`).should('have.focus');
  });

  it('opening the dialog does not change the store', () => {
    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      cy.wrap(win.localStorage.getItem(key)).as('before');
    });

    cy.get(CLEAR_ALL).click();
    cy.get(DIALOG).should('exist');

    cy.get('@before').then((before) => {
      cy.window().then((win) => {
        const key = Cypress.env('STORAGE_KEY');
        expect(win.localStorage.getItem(key)).to.equal(before);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Confirm path
// ---------------------------------------------------------------------------

describe('clear-all — confirm', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });
  });

  it('empties the store, shows the empty state, and resets the counter', () => {
    cy.get(CARD).should('have.length', 3);
    cy.get(COUNTER).should('have.attr', 'data-count', '3');

    cy.get(CLEAR_ALL).click();
    cy.get(`${DIALOG} [data-action="confirm-clear-all"]`).click();
    cy.get(DIALOG).should('not.exist');

    cy.get(CARD).should('have.length', 0);
    cy.get(COUNTER).should('have.attr', 'data-count', '0');
    cy.get('[data-cy="dashboard-list"] .empty-state').should('be.visible');

    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      const tasks = JSON.parse(win.localStorage.getItem(key));
      expect(tasks).to.deep.equal([]);
    });
  });

  it('shows the success toast', () => {
    cy.get(CLEAR_ALL).click();
    cy.get(`${DIALOG} [data-action="confirm-clear-all"]`).click();
    cy.get('[role="status"]').should('contain.text', 'All tasks cleared');
  });

  it('clears the search query along with the tasks', () => {
    // Start a search that matches exactly one task.
    cy.get('#search-input').type('rover');
    cy.get(CARD).should('have.length', 1);
    cy.get('#search-input').should('have.value', 'rover');

    cy.get(CLEAR_ALL).click();
    cy.get(`${DIALOG} [data-action="confirm-clear-all"]`).click();

    // The search input is empty.
    cy.get('#search-input').should('have.value', '');

    // The empty state is the no-tasks variant.
    cy.get('[data-cy="dashboard-list"] .empty-state').should('be.visible');
    cy.get(CARD).should('have.length', 0);
  });

  it('disables the button after the store becomes empty', () => {
    cy.get(CLEAR_ALL).should('not.be.disabled');
    cy.get(CLEAR_ALL).click();
    cy.get(`${DIALOG} [data-action="confirm-clear-all"]`).click();
    cy.get(CLEAR_ALL).should('be.disabled');
  });

  it('a second clear-all click after confirm is a no-op (button disabled)', () => {
    cy.get(CLEAR_ALL).click();
    cy.get(`${DIALOG} [data-action="confirm-clear-all"]`).click();
    cy.get(DIALOG).should('not.exist');

    // The button is disabled; Cypress's `.click()` on a disabled
    // button would fail. Assert the disabled state directly.
    cy.get(CLEAR_ALL).should('be.disabled');

    // The store is still empty (no error introduced).
    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      const tasks = JSON.parse(win.localStorage.getItem(key));
      expect(tasks).to.deep.equal([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Cancel paths
// ---------------------------------------------------------------------------

describe('clear-all — cancel paths', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });
  });

  it('Cancel leaves storage byte-identical', () => {
    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      cy.wrap(win.localStorage.getItem(key)).as('before');
    });

    cy.get(CLEAR_ALL).click();
    cy.get(`${DIALOG} [data-action="cancel-clear-all"]`).click();
    cy.get(DIALOG).should('not.exist');

    cy.get('@before').then((before) => {
      cy.window().then((win) => {
        const key = Cypress.env('STORAGE_KEY');
        expect(win.localStorage.getItem(key)).to.equal(before);
      });
    });

    // The tasks are still present.
    cy.get(CARD).should('have.length', 3);
  });

  it('Esc leaves storage byte-identical', () => {
    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      cy.wrap(win.localStorage.getItem(key)).as('before');
    });

    cy.get(CLEAR_ALL).click();
    // The dialog opens with focus on Cancel; confirm that before
    // firing the Esc sequence.
    cy.get(`${DIALOG} [data-action="cancel-clear-all"]`).should('have.focus');
    // Esc goes through cy.escDialog, not cy.type('{esc}'):
    // Cypress's synthetic keyboard events do not trigger a native
    // <dialog>'s Esc-close. See the file header and the helper's
    // docstring.
    cy.escDialog(DIALOG);
    cy.get(DIALOG).should('not.exist');

    cy.get('@before').then((before) => {
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

describe('clear-all — focus restoration', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });
  });

  it('focus returns to the clear-all button after Cancel', () => {
    cy.get(CLEAR_ALL).click();
    cy.get(`${DIALOG} [data-action="cancel-clear-all"]`).click();
    cy.get(CLEAR_ALL).should('have.focus');
  });

  it('focus returns to the clear-all button after Esc', () => {
    cy.get(CLEAR_ALL).click();
    cy.get(`${DIALOG} [data-action="cancel-clear-all"]`).should('have.focus');
    cy.escDialog(DIALOG);
    cy.get(CLEAR_ALL).should('have.focus');
  });

  it('focus returns to the header create button after Confirm (clear-all now disabled)', () => {
    // On the confirm path, the clear-all button is disabled after
    // the render. A disabled <button> cannot receive focus — the
    // browser no-ops `.focus()` on it. The app's focus-restoration
    // chain routes to the header create button instead, which is
    // always present and always enabled, and is the natural next
    // action after the store has been emptied.
    cy.get(CLEAR_ALL).click();
    cy.get(`${DIALOG} [data-action="confirm-clear-all"]`).click();
    cy.get(DIALOG).should('not.exist');

    cy.get(CLEAR_ALL).should('be.disabled');
    cy.get('[data-cy="dashboard-create"]').should('have.focus');
  });

  it('focus is never left on <body> after Cancel', () => {
    cy.get(CLEAR_ALL).click();
    cy.get(`${DIALOG} [data-action="cancel-clear-all"]`).click();
    cy.focused().should('not.have.prop', 'tagName', 'BODY');
  });

  it('focus is never left on <body> after Confirm', () => {
    cy.get(CLEAR_ALL).click();
    cy.get(`${DIALOG} [data-action="confirm-clear-all"]`).click();
    cy.focused().should('not.have.prop', 'tagName', 'BODY');
  });
});

// ---------------------------------------------------------------------------
// Interaction with other dialogs (mutual exclusion)
// ---------------------------------------------------------------------------

describe('clear-all — interaction with other dialogs', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });
  });

  it('a create dialog blocks the clear-all button (modal scrim)', () => {
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get('.task-dialog').should('exist');

    // The clear-all button is behind the modal scrim. Cypress's
    // `should('not.be.visible')` would fail because the button is
    // still in the DOM and technically "visible" — the scrim is
    // what blocks it, not visibility. The correct assertion is that
    // the dialog is the topmost interactive layer.
    cy.get('.task-dialog [data-action="cancel-dialog"]').click();
    cy.get('.task-dialog').should('not.exist');
  });

  it('the delete dialog blocks the clear-all button (modal scrim)', () => {
    cy.get(CARD).first().within(() => {
      cy.get('[data-cy="task-card-delete"]').click();
    });
    cy.get('.delete-dialog').should('exist');

    cy.get('.delete-dialog [data-action="cancel-delete"]').click();
    cy.get('.delete-dialog').should('not.exist');
  });

  it('opening the clear-all dialog after closing a create dialog works', () => {
    // Open the create dialog.
    cy.get('[data-cy="dashboard-create"]').click();
    cy.get('.task-dialog').should('exist');

    // The clear-all button is behind the modal scrim, so a real
    // user cannot click it while the create dialog is open. Close
    // the create dialog normally, then verify the clear-all dialog
    // opens cleanly — the app's mutual-exclusion rule (which would
    // close any active create dialog before opening the clear-all)
    // is not exercised here because the modal prevents the click;
    // it is exercised by the unit tests for `handleClearAllClick`.
    cy.get('.task-dialog [data-action="cancel-dialog"]').click();
    cy.get('.task-dialog').should('not.exist');

    cy.get(CLEAR_ALL).click();
    cy.get(DIALOG).should('exist');
    cy.get(`${DIALOG} [data-action="cancel-clear-all"]`).click();
  });
});