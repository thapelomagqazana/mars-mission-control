/**
 * Read-tasks workflow — the "view the task list" journey.
 *
 * Upstream source: workflow-stage spec 8.8.2.
 * Data-cy selectors used: task-list, task-card, task-card-title,
 *   task-card-description, task-card-creator, task-card-assignee,
 *   task-card-created, task-empty-no-tasks.
 *
 * The read workflow is the baseline: the app renders an empty state
 * when there are no tasks, and a list of cards when there are.
 */

describe('Read tasks', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('shows the empty state when there are no tasks', () => {
    // Placeholder.
  });

  it('renders one card per task', () => {
    // Placeholder.
  });

  it('renders title, description, creator, assignee, and created time', () => {
    // Placeholder.
  });

  it('omits the description when it is empty', () => {
    // Placeholder.
  });

  it('preserves the task list across a page reload', () => {
    // Placeholder.
  });
});