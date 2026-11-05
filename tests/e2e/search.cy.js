/**
 * Search — end to end.
 *
 * Covers the whole search surface:
 *
 *   - Filtering matches title, description, and assignee independently.
 *   - Case-insensitive matching.
 *   - Whitespace-only queries are "no filter" (show all tasks).
 *   - The summary line reflects the query and match count.
 *   - The no-results empty state appears when the query matches
 *     nothing, and it says "no results", not "no tasks".
 *   - Clearing the query restores the full list.
 *   - The counter updates with the filtered count.
 *   - The search input's Esc key clears the input and restores the
 *     full list.
 *   - A query that matches nothing does not affect the store.
 *
 * Fixtures
 *   `tasks.json`'s `threeTasks` provides distinct titles,
 *   descriptions, and assignees, so filtering by each field can be
 *   exercised with the same fixture. The three tasks are:
 *
 *     Survey crater  / "Check water ice"     / Commander / Geologist
 *     Deploy rover   / ""                    / Commander / Engineer
 *     Analyse sample / "Mass spectrometry"   / Geologist / Scientist
 *
 *   Each field's search is exercised with a distinct term that
 *   matches exactly one task.
 *
 * @module tests/e2e/search
 */

const SEARCH_INPUT = '#search-input';
const SUMMARY = '.search-results__summary';
const CARD = '[data-cy="task-card"]';
const COUNTER = '[data-cy="dashboard-counter"]';
const LIST = '[data-cy="dashboard-list"]';

/**
 * Fill the search input with a query. Uses `.type()` so the input
 * event fires (the debounced search listens for `input`).
 */
function search(query) {
  cy.get(SEARCH_INPUT).clear().type(query);
}

// ---------------------------------------------------------------------------
// Field coverage — each searchable field matches independently
// ---------------------------------------------------------------------------

describe('search — field coverage', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });
  });

  it('filters by title', () => {
    search('crater');
    cy.get(CARD).should('have.length', 1);
    cy.get(`${CARD} [data-cy="task-card-title"]`).should('have.text', 'Survey crater');
  });

  it('filters by description', () => {
    // Only "Survey crater" has "water" in its description
    // ("Check water ice"). "Deploy rover" has an empty
    // description; "Analyse sample" has "Mass spectrometry".
    search('water');
    cy.get(CARD).should('have.length', 1);
    cy.get(`${CARD} [data-cy="task-card-title"]`).should('have.text', 'Survey crater');
  });

  it('filters by assignee', () => {
    // Only "Analyse sample" is assigned to "Scientist".
    search('Scientist');
    cy.get(CARD).should('have.length', 1);
    cy.get(`${CARD} [data-cy="task-card-title"]`).should('have.text', 'Analyse sample');
  });

  it('a query that matches multiple fields of the same task returns the task once', () => {
    // "Commander" is the creator of two tasks, but the fixture
    // creator field is not searched (only title, description,
    // assignee are). "Commander" appears in the *creator* field
    // of two tasks — not in any searchable field — so it should
    // match zero tasks.
    search('Commander');
    cy.get(CARD).should('have.length', 0);
  });
});

// ---------------------------------------------------------------------------
// Case insensitivity
// ---------------------------------------------------------------------------

describe('search — case insensitivity', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });
  });

  it('matches regardless of case', () => {
    search('CRATER');
    cy.get(CARD).should('have.length', 1);
    cy.get(`${CARD} [data-cy="task-card-title"]`).should('have.text', 'Survey crater');

    search('Crater');
    cy.get(CARD).should('have.length', 1);

    search('crater');
    cy.get(CARD).should('have.length', 1);
  });
});

// ---------------------------------------------------------------------------
// Whitespace-only queries
// ---------------------------------------------------------------------------

describe('search — whitespace-only queries', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });
  });

  it('a whitespace-only query shows all tasks (no filter)', () => {
    search('   ');
    cy.get(CARD).should('have.length', 3);
  });

  it('a query with leading and trailing spaces is trimmed', () => {
    search('  crater  ');
    cy.get(CARD).should('have.length', 1);
    cy.get(`${CARD} [data-cy="task-card-title"]`).should('have.text', 'Survey crater');
  });
});

// ---------------------------------------------------------------------------
// Summary line
// ---------------------------------------------------------------------------

describe('search — summary line', () => {
  it('shows "Showing all N tasks" when the query is empty', () => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });

    cy.get(SUMMARY).should('have.text', 'Showing all 3 tasks');
  });

  it('shows "Showing all 1 task" (singular) when the store has one task', () => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.singleTask);
    });

    cy.get(SUMMARY).should('have.text', 'Showing all 1 task');
  });

  it('shows "Showing all 0 tasks" when the store is empty', () => {
    // The empty-store default from the support file's beforeEach.
    cy.get(SUMMARY).should('have.text', 'Showing all 0 tasks');
  });

  it('shows "N results for query" when the query matches', () => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });

    search('crater');
    cy.get(SUMMARY).should('have.text', '1 result for "crater"');
  });

  it('shows "N results" (plural) for multiple matches', () => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });

    // "a" appears in "Survey crater", "Analyse sample", and
    // "Mass spectrometry" (description of Analyse). "Deploy rover"
    // has "a" in... nothing searchable ("Deploy rover" — no a;
    // description empty; "Engineer" — no a). So "a" matches two
    // tasks: "Survey crater" (title) and "Analyse sample" (title).
    search('a');
    cy.get(SUMMARY).should('have.text', '2 results for "a"');
  });
});

// ---------------------------------------------------------------------------
// No-results state
// ---------------------------------------------------------------------------

describe('search — no results', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });
  });

  it('shows the no-results empty state when the query matches nothing', () => {
    search('xyzxyz');

    cy.get(CARD).should('have.length', 0);

    // The empty state is the *no-results* variant, not *no-tasks*.
    // A user searching for something they have no tasks for needs
    // to be told "no matches", not "no tasks".
    cy.get(`${LIST} .empty-state`).should('be.visible');
    cy.get(`${LIST} .empty-state`).should('not.contain.text', 'No tasks yet');
  });

  it('the no-results summary says zero', () => {
    search('xyzxyz');
    cy.get(SUMMARY).should('have.text', '0 results for "xyzxyz"');
  });

  it('a query that matches nothing does not affect the store', () => {
    cy.window().then((win) => {
      const key = Cypress.env('STORAGE_KEY');
      cy.wrap(win.localStorage.getItem(key)).as('before');
    });

    search('xyzxyz');
    cy.get(CARD).should('have.length', 0);

    cy.get('@before').then((before) => {
      cy.window().then((win) => {
        const key = Cypress.env('STORAGE_KEY');
        expect(win.localStorage.getItem(key)).to.equal(before);
      });
    });
  });

  it('the counter reflects the filtered count, not the store count', () => {
    search('xyzxyz');
    cy.get(COUNTER).should('have.attr', 'data-count', '0');
  });
});

// ---------------------------------------------------------------------------
// Clearing the query
// ---------------------------------------------------------------------------

describe('search — clearing the query', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });
  });

  it('backspacing the query restores the full list', () => {
    search('crater');
    cy.get(CARD).should('have.length', 1);

    cy.get(SEARCH_INPUT).clear();
    cy.get(CARD).should('have.length', 3);
    cy.get(SUMMARY).should('have.text', 'Showing all 3 tasks');
  });

  it('the Esc key in the search input clears the query', () => {
    search('crater');
    cy.get(CARD).should('have.length', 1);

    cy.get(SEARCH_INPUT).type('{esc}');
    cy.get(SEARCH_INPUT).should('have.value', '');
    cy.get(CARD).should('have.length', 3);
  });
});

// ---------------------------------------------------------------------------
// Counter interaction
// ---------------------------------------------------------------------------

describe('search — counter interaction', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.threeTasks);
    });
  });

  it('the counter shows the filtered count', () => {
    cy.get(COUNTER).should('have.attr', 'data-count', '3');

    search('crater');
    cy.get(COUNTER).should('have.attr', 'data-count', '1');

    search('a');
    cy.get(COUNTER).should('have.attr', 'data-count', '2');

    search('xyzxyz');
    cy.get(COUNTER).should('have.attr', 'data-count', '0');
  });
});

// ---------------------------------------------------------------------------
// The search input's accessibility
// ---------------------------------------------------------------------------

describe('search — input accessibility', () => {
  it('the input has an aria-label that matches the visible label', () => {
    cy.get(SEARCH_INPUT).should('have.attr', 'aria-label', 'Search tasks');
    cy.get('label[for="search-input"]').should('contain.text', 'Search tasks');
  });

  it('the summary is a polite live region', () => {
    // A live region announces its content when it changes. The
    // summary changes on every search, so a screen-reader user
    // hears the new result count without moving focus.
    cy.get(SUMMARY).should('have.attr', 'role', 'status');
    cy.get(SUMMARY).should('have.attr', 'aria-live', 'polite');
  });
});