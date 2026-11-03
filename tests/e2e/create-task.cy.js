/**
 * Create-task workflow — the "create a task" journey.
 *
 * Upstream source: workflow-stage spec 7.10.2.
 * Data-cy selectors used: task-empty-create-btn, task-dialog,
 *   task-dialog-title, task-dialog-description, task-dialog-creator,
 *   task-dialog-assignee, task-dialog-submit-btn, task-card.
 *
 * This spec is a placeholder for the workflow-stage assertions. The
 * describe block and the case names are the contract; the bodies are
 * filled in when the workflow-stage task runs. A case that is not
 * listed here is not in the workflow; a workflow change adds a case
 * here first.
 */

describe('Create task', () => {
  beforeEach(() => {
    // Cypress.env('STORAGE_KEY') is cleared by tests/support/e2e.js
    // before every test. A spec that needs a specific seed state
    // uses cy.fixture('tasks.json') inside the test.
    cy.visit('/');
  });

  it('opens the create dialog from the empty state', () => {
    // Placeholder: the assertion is in the workflow-stage task.
  });

  it('creates a task with all fields populated', () => {
    // Placeholder.
  });

  it('applies the description default when omitted', () => {
    // Placeholder.
  });

  it('rejects a submission with an empty title', () => {
    // Placeholder.
  });

  it('rejects a submission with a whitespace-only title', () => {
    // Placeholder.
  });

  it('shows the new task in the list after submission', () => {
    // Placeholder.
  });
});