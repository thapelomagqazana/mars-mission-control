/**
 * Delete-tasks workflow — the "remove a task" journey, individual and
 * bulk.
 *
 * Upstream source: workflow-stage spec 10.9.2.
 * Data-cy selectors used: task-card-delete-btn, task-dialog (for any
 *   confirmation dialog the workflow uses), task-empty-no-tasks,
 *   dashboard-counter.
 *
 * Individual delete and clear-all are in the same spec because they
 * share the same workflow (remove a task) and the same confirmation
 * pattern. A future workflow that adds a "delete all matching" path
 * would extend this spec, not create a new one.
 */

describe('Delete tasks', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('deletes a single task when the confirmation is accepted', () => {
    // Placeholder.
  });

  it('keeps the task when the confirmation is cancelled', () => {
    // Placeholder.
  });

  it('clears all tasks when the clear-all action is confirmed', () => {
    // Placeholder.
  });

  it('keeps all tasks when the clear-all confirmation is cancelled', () => {
    // Placeholder.
  });

  it('updates the counter after each delete', () => {
    // Placeholder.
  });
});