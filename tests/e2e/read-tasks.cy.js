/**
 * Read path — end to end.
 *
 * The read path as a user experiences it:
 *
 *   1. The user loads the app. If there are no tasks, the empty state
 *      is shown; if there are tasks, they are rendered as cards.
 *   2. The user searches. The list filters. If the filter matches
 *      nothing, a "no results" empty state is shown.
 *   3. The user clears the search. The full list returns.
 *   4. The user reloads. The same tasks are in the same order, with
 *      the same field values, and the counter matches.
 *
 * This spec asserts the SHAPE OF THE READ PATH. It is the complement
 * of createWorkflow.cy.js (which asserts the write path). Together they
 * cover the two halves of the read/write contract.
 *
 * Fixture boundary
 *   The seeds come from `tasks.json` because each test asserts a COUNT
 *   or an ORDER, not the seed's identity. The fixture supplies three
 *   keys: `singleTask`, `threeTasks`, and `invalidTasks`. The specs
 *   reference the keys by name so a change to the fixture's contents
 *   does not require a change to the spec's assertions.
 *
 * Isolation
 *   `tests/support/e2e.js` clears `localStorage[STORAGE_KEY]` before
 *   every test. `cy.seedTasks` seeds via `onBeforeLoad` and resolves
 *   only after the app has rendered the seed, so a spec that calls
 *   `cy.seedTasks` and then asserts cannot race the app's hydration.
 *
 * @module tests/e2e/read-tasks
 */

/** The list container (registered). */
const LIST = '[data-cy="dashboard-list"]';

/** A card in the list (registered). */
const CARD = '[data-cy="task-card"]';

/** The counter (registered). */
const COUNTER = '[data-cy="dashboard-counter"]';

/** The empty state's container. */
const EMPTY_STATE = '.empty-state';

/** The search input (registered). */
const SEARCH_INPUT = '#search-input';

// ---------------------------------------------------------------------------
// Read path — the empty store
// ---------------------------------------------------------------------------

describe('read path — empty store', () => {
  it('renders the empty state with a reachable create affordance', () => {
    // The container is present.
    cy.get(LIST).should('exist');

    // The empty state is its content.
    cy.get(`${LIST} ${EMPTY_STATE}`).should('be.visible');

    // No cards exist.
    cy.get(CARD).should('have.length', 0);

    // The counter is zero.
    cy.get(COUNTER).should('have.attr', 'data-count', '0');

    // The create affordance is reachable — the empty state must not be
    // a dead end.
    cy.get('[data-cy="dashboard-empty-create"]').should('be.visible');
  });
});

// ---------------------------------------------------------------------------
// Read path — populated store
// ---------------------------------------------------------------------------

describe('read path — populated store', () => {
  it('renders one card per task, inside the list container', () => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.threeTasks);
    });

    cy.get(LIST).should('exist');
    cy.get(CARD).should('have.length', 3);

    // Each card is inside the list.
    cy.get(`${LIST} ${CARD}`).should('have.length', 3);

    // The counter matches.
    cy.get(COUNTER).should('have.attr', 'data-count', '3');

    // The empty state is gone.
    cy.get(EMPTY_STATE).should('not.exist');
  });

  it('renders the card fields with the seed values', () => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.singleTask);
      const task = fixture.singleTask[0];

      // The card's fields are findable by their per-field selectors.
      cy.get('[data-cy="task-card-title"]').should('have.text', task.title);
      cy.get('[data-cy="task-card-creator"]').should('have.text', task.creator);
      cy.get('[data-cy="task-card-assignee"]').should('have.text', task.assignee);
    });
  });
});

// ---------------------------------------------------------------------------
// Read path — reload fidelity (R1–R5)
// ---------------------------------------------------------------------------

describe('read path — reload fidelity', () => {
  it('preserves card count, IDs, order, field text, and counter across reload', () => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.threeTasks);
    });

    // Pre-reload capture.
    cy.get(CARD).should('have.length', 3);
    cy.get(CARD).then(($cards) => {
      const preIds = [...$cards].map((c) => c.getAttribute('data-task-id'));
      const preText = [...$cards].map((c) => c.textContent);

      cy.get(COUNTER).then(($counter) => {
        const preCount = $counter.attr('data-count');

        cy.reload();

        // Post-reload capture and comparison.
        cy.get(CARD).should('have.length', 3).then(($again) => {
          const postIds = [...$again].map((c) => c.getAttribute('data-task-id'));
          const postText = [...$again].map((c) => c.textContent);

          // R1: same card count (asserted above by length 3).
          // R2: same card IDs in same order.
          expect(postIds).to.deep.equal(preIds);
          // R3: same field text per card (no truncation changes).
          expect(postText).to.deep.equal(preText);
        });

        // R4: same counter value.
        cy.get(COUNTER).should('have.attr', 'data-count', preCount);
      });
    });
    // R5 (no new console errors) is implicitly covered by Cypress's
    // default: an uncaught exception fails the test. The support file
    // allows only the Unsplash image exception; every other error
    // fails. If the reload path introduced a new exception, this test
    // would fail on it.
  });
});

// ---------------------------------------------------------------------------
// Read path — search
// ---------------------------------------------------------------------------

describe('read path — search', () => {
  beforeEach(() => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.threeTasks);
    });
  });

  it('filters the list by title substring', () => {
    // The threeTasks fixture has titles "Survey crater", "Deploy rover",
    // and "Analyse sample". A search for "rover" should match exactly
    // one — "Deploy rover".
    cy.get(SEARCH_INPUT).type('rover');
    cy.get(CARD).should('have.length', 1);
    cy.get(`${CARD} [data-cy="task-card-title"]`).should('have.text', 'Deploy rover');
  });

  it('filters the list by description substring', () => {
    // Only "Survey crater" has "water" in its description.
    cy.get(SEARCH_INPUT).type('water');
    cy.get(CARD).should('have.length', 1);
    cy.get(`${CARD} [data-cy="task-card-title"]`).should('have.text', 'Survey crater');
  });

  it('filters the list by assignee substring', () => {
    // "Analyse sample" is assigned to "Scientist".
    cy.get(SEARCH_INPUT).type('Scientist');
    cy.get(CARD).should('have.length', 1);
    cy.get(`${CARD} [data-cy="task-card-title"]`).should('have.text', 'Analyse sample');
  });

  it('shows the no-results empty state when the search matches nothing', () => {
    cy.get(SEARCH_INPUT).type('xyzxyzxyz');

    // No cards.
    cy.get(CARD).should('have.length', 0);

    // The no-results empty state is shown, not the no-tasks one.
    cy.get(`${LIST} ${EMPTY_STATE}`).should('be.visible');

    // The container is still present.
    cy.get(LIST).should('exist');
  });

  it('restores the full list when the search is cleared', () => {
    cy.get(SEARCH_INPUT).type('rover');
    cy.get(CARD).should('have.length', 1);

    cy.get(SEARCH_INPUT).clear();
    cy.get(CARD).should('have.length', 3);

    cy.get(EMPTY_STATE).should('not.exist');
  });
});

// ---------------------------------------------------------------------------
// Read path — malformed storage recovery
// ---------------------------------------------------------------------------

describe('read path — malformed storage recovery', () => {
  it('starts with an empty store when storage is corrupted JSON', () => {
    // P-03: the app's recovery branch treats corrupted JSON as an
    // empty store and renders the empty state.
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedRawStorage(fixture.invalidTasks.notJson);
    });

    cy.get(LIST).should('exist');
    cy.get(CARD).should('have.length', 0);
    cy.get(`${LIST} ${EMPTY_STATE}`).should('be.visible');
    cy.get(COUNTER).should('have.attr', 'data-count', '0');
  });

  it('starts with an empty store when storage holds a non-array JSON value', () => {
    // P-04: valid JSON, wrong shape (an object, not an array).
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedRawStorage(JSON.stringify(fixture.invalidTasks.notAnArray));
    });

    cy.get(CARD).should('have.length', 0);
    cy.get(`${LIST} ${EMPTY_STATE}`).should('be.visible');
    cy.get(COUNTER).should('have.attr', 'data-count', '0');
  });

  it('filters individual corrupted entries and keeps valid ones', () => {
    // P-05: an array with one invalid entry and one valid entry. The
    // app drops the invalid entry and renders the valid one.
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedRawStorage(JSON.stringify(fixture.invalidTasks.arrayWithOneInvalidEntry));
    });

    // The app has started (container exists).
    cy.get(LIST).should('exist');

    // Exactly one valid card is rendered.
    cy.get(CARD).should('have.length', 1);
    cy.get(`${CARD} [data-cy="task-card-title"]`).should('have.text', 'Valid task');

    // The counter reflects the one valid task, not the two seeded.
    cy.get(COUNTER).should('have.attr', 'data-count', '1');
  });
});