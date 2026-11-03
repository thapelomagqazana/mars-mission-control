/**
 * Counter and search workflow — the live count and the search input.
 *
 * Upstream source: workflow-stage spec 11.8.2.
 * Data-cy selectors used: dashboard-counter, search-input,
 *   search-summary, search-clear-btn, task-empty-no-results,
 *   task-card.
 *
 * The counter and the search are in the same spec because they share
 * the same state: the counter shows the count of the filtered list,
 * and the search filter is what changes the count. A test that asserts
 * the counter without the search, or the search without the counter,
 * is a test that misses the interaction.
 */

describe('Counter and search', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('shows the count of all tasks when the search is empty', () => {
    // Placeholder.
  });

  it('filters the list and the counter by title', () => {
    // Placeholder.
  });

  it('filters by description', () => {
    // Placeholder.
  });

  it('filters by assignee', () => {
    // Placeholder.
  });

  it('debounces the search and updates after the quiet period', () => {
    // Placeholder.
  });

  it('clears the search and restores the full list', () => {
    // Placeholder.
  });

  it('shows the no-results empty state when the search matches nothing', () => {
    // Placeholder.
  });
});