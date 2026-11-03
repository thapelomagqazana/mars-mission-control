/**
 * Edit-task workflow — the "change an existing task" journey.
 *
 * Upstream source: workflow-stage spec 9.7.2.
 * Data-cy selectors used: task-card-edit-btn, task-dialog,
 *   task-dialog-heading, task-dialog-title, task-dialog-submit-btn,
 *   task-dialog-cancel-btn, task-card-title.
 *
 * The edit workflow opens the dialog pre-filled, allows a change,
 * and cancels without saving in one case. The cancel path is part of
 * the workflow, not a separate one.
 */

describe('Edit task', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('opens the edit dialog pre-filled with the task values', () => {
    // Placeholder.
  });

  it('saves a change and updates the card', () => {
    // Placeholder.
  });

  it('cancels without saving and leaves the task unchanged', () => {
    // Placeholder.
  });

  it('preserves the id and createdAt across an edit', () => {
    // Placeholder.
  });
});