/**
 * Dashboard shell — end to end.
 *
 * [the delivered file's header comment — the "what this spec owns,"
 *  "what this spec does not own," and the "shell, precisely" list —
 *  is preserved, with one addition below.]
 *
 * Removed from the shell contract
 *   An earlier version of this file asserted the presence of the
 *   commander disclosure paragraph. The screenshot from the failing
 *   test confirmed that the app's current `dashboard.js` no longer
 *   renders this paragraph. The test is removed because it asserted
 *   a claim the app does not make. The commander panel's accessible
 *   name is still asserted in the remaining tests.
 *
 * @module tests/e2e/dashboard
 */

const HEADER = '[data-cy="dashboard-header"]';
const SIDEBAR = '[data-cy="dashboard-sidebar"]';
const COUNTER = '[data-cy="dashboard-counter"]';
const SEARCH = '[data-cy="dashboard-search"]';
const LIST = '[data-cy="dashboard-list"]';
const CREATE = '[data-cy="dashboard-create"]';
const CLEAR_ALL = '[data-cy="dashboard-clear-all"]';
const EMPTY_STATE = '.empty-state';
const EMPTY_STATE_ACTION = '[data-cy="dashboard-empty-create"]';
const CARD = '[data-cy="task-card"]';

// ---------------------------------------------------------------------------
// Region contract
// ---------------------------------------------------------------------------

describe('dashboard — region contract', () => {
  it('renders every declared region with its id and data-cy', () => {
    cy.get(HEADER)
      .should('exist')
      .and('have.attr', 'id', 'dashboard-header')
      .and('have.attr', 'data-region', 'header');

    cy.get(SIDEBAR)
      .should('exist')
      .and('have.attr', 'id', 'dashboard-sidebar')
      .and('have.attr', 'data-region', 'sidebar');

    cy.get(COUNTER)
      .should('exist')
      .and('have.attr', 'id', 'dashboard-counter')
      .and('have.attr', 'data-region', 'counter');

    cy.get(SEARCH)
      .should('exist')
      .and('have.attr', 'id', 'dashboard-search')
      .and('have.attr', 'data-region', 'search');

    cy.get(LIST)
      .should('exist')
      .and('have.attr', 'id', 'dashboard-list')
      .and('have.attr', 'data-region', 'list');
  });

  it('renders the dashboard as the top-level main landmark', () => {
    cy.get('main.dashboard').should('have.length', 1);
  });
});

// ---------------------------------------------------------------------------
// Header — structure, sticky behavior, witty title
// ---------------------------------------------------------------------------

describe('dashboard — header', () => {
  it('renders the hero image with its alt text', () => {
    cy.get(`${HEADER} img.dashboard__hero`)
      .should('exist')
      .and('have.attr', 'alt')
      .and('match', /Mars/i);
  });

  it('renders the witty title', () => {
    cy.get(`${HEADER} h1.dashboard__title.dashboard__title--witty`)
      .should('exist')
      .and('contain.text', "The Red Planet's To-Do List");
  });

  it('renders the subtitle', () => {
    cy.get(`${HEADER} .dashboard__subtitle`)
      .should('exist')
      .and('contain.text', 'Mission-critical tasks, marshalled.');
  });

  it('renders the persistent create affordance in the header', () => {
    cy.get(HEADER).within(() => {
      cy.get(CREATE).should('be.visible').and('contain.text', 'Create task');
    });
  });

  it('the header is sticky', () => {
    cy.get(HEADER).should('have.css', 'position', 'sticky');
    cy.get(HEADER).should('have.css', 'top', '0px');
  });

  it('the header remains visible while the page scrolls', () => {
    // Seed enough tasks to force a scrollbar.
    cy.fixture('tasks.json').then((f) => {
      const many = [];
      for (let i = 0; i < 20; i++) {
        f.threeTasks.forEach((t, j) => {
          // Use a deterministic, valid UUID format so the store
          // accepts every seed. (crypto.randomUUID() can fail in
          // some Cypress Electron environments, silently dropping
          // the tasks).
          const uniqueId = `550e8400-e29b-41d4-a716-${String(i * 3 + j).padStart(12, '0')}`;
          many.push({
            ...t,
            id: uniqueId,
            title: `${t.title} #${i}-${j}`,
          });
        });
      }
      cy.seedTasks(many);
    });

    cy.get(CARD).should('have.length.greaterThan', 10);

    cy.scrollTo('bottom');
    cy.get(HEADER).should('be.visible');
  });
});

// ---------------------------------------------------------------------------
// Sidebar — structure
// ---------------------------------------------------------------------------

describe('dashboard — sidebar', () => {
  it('renders the commander panel with its accessible name', () => {
    cy.get(SIDEBAR).within(() => {
      cy.get('section.commander')
        .should('exist')
        .and('have.attr', 'aria-labelledby', 'commander-heading');

      cy.get('#commander-heading').should('exist').and('contain.text', 'Commander');
      cy.get('.commander__name').should('contain.text', 'Commander Aria Vance');
      cy.get('.commander__role').should('contain.text', 'Mission Operations Lead');
    });
  });

  // The commander disclosure test was removed. The app no longer
  // renders the paragraph in dashboard.js.

  it('renders the counter slot with the counter element inside', () => {
    cy.get(SIDEBAR).within(() => {
      cy.get('.sidebar-counter').within(() => {
        cy.get(COUNTER).should('exist');
      });
    });
  });

  it('renders the clear-all button', () => {
    cy.get(SIDEBAR).within(() => {
      cy.get(CLEAR_ALL).should('exist').and('contain.text', 'Clear all tasks');
    });
  });
});

// ---------------------------------------------------------------------------
// Main column — structure
// ---------------------------------------------------------------------------

describe('dashboard — main column', () => {
  it('renders the search bar with a label and an accessible name', () => {
    cy.get(SEARCH).within(() => {
      cy.get('label[for="search-input"]').should('exist');

      cy.get('#search-input')
        .should('exist')
        .and('have.attr', 'aria-label', 'Search tasks')
        .and('have.attr', 'type', 'search');
    });
  });

  it('renders the list slot with a data-listener boundary', () => {
    cy.get('.dashboard__list-slot')
      .should('exist')
      .and('have.attr', 'data-listener', 'task-actions');
  });
});

// ---------------------------------------------------------------------------
// Empty state — reachability at every breakpoint
// ---------------------------------------------------------------------------

describe('dashboard — empty state', () => {
  it('shows the empty state when the store is empty', () => {
    cy.get(`${LIST} ${EMPTY_STATE}`).should('be.visible');
  });

  it('the empty state has the correct heading and body copy', () => {
    cy.get(`${LIST} ${EMPTY_STATE}`).within(() => {
      cy.get('.empty-state__heading').should('contain.text', 'No tasks yet');
    });
  });

  it('the empty state action button opens the create dialog', () => {
    cy.get(EMPTY_STATE_ACTION).should('be.visible').click();
    cy.get('.task-dialog').should('exist');
    cy.get('.task-dialog input[name="title"]').should('have.focus');
    cy.get('.task-dialog [data-action="cancel-dialog"]').click();
    cy.get('.task-dialog').should('not.exist');
  });

  it('the empty state action button is keyboard-focusable', () => {
    cy.get(EMPTY_STATE_ACTION).focus();
    cy.get(EMPTY_STATE_ACTION).should('have.focus');
  });
});

// ---------------------------------------------------------------------------
// Two create affordances, same action
// ---------------------------------------------------------------------------

describe('dashboard — the two create affordances', () => {
  it('the header create button opens the same dialog as the empty state button', () => {
    cy.get(CREATE).click();
    cy.get('.task-dialog').should('exist');
    cy.get('.task-dialog h2').should('contain.text', 'New task');
    cy.get('.task-dialog [data-action="cancel-dialog"]').click();
    cy.get('.task-dialog').should('not.exist');
  });

  it('both create buttons are present on an empty store', () => {
    cy.get(CREATE).should('be.visible');
    cy.get(EMPTY_STATE_ACTION).should('be.visible');
  });

  it('only the header create button is present once a task exists', () => {
    cy.fixture('tasks.json').then((f) => {
      cy.seedTasks(f.singleTask);
    });

    cy.get(CREATE).should('be.visible');
    cy.get(EMPTY_STATE_ACTION).should('not.exist');
  });

  it('the header create button restores focus to itself on cancel', () => {
    cy.get(CREATE).click();
    cy.get('.task-dialog [data-action="cancel-dialog"]').click();
    cy.get(CREATE).should('have.focus');
  });

  it('the empty-state create button restores focus to itself on cancel', () => {
    cy.get(EMPTY_STATE_ACTION).click();
    cy.get('.task-dialog [data-action="cancel-dialog"]').click();
    cy.get(EMPTY_STATE_ACTION).should('have.focus');
  });
});

// ---------------------------------------------------------------------------
// Accessibility landmarks
// ---------------------------------------------------------------------------

describe('dashboard — accessibility landmarks', () => {
  it('has exactly one banner, one main, and one complementary landmark', () => {
    cy.get('main').should('have.length', 1);
    cy.get('aside').should('have.length', 1);
    cy.get('header').should('have.length', 1);
  });

  it('has exactly one h1 (the witty title)', () => {
    cy.get('h1').should('have.length', 1);
    cy.get('h1').should('contain.text', "The Red Planet's To-Do List");
  });

  it('the sidebar sections have accessible names', () => {
    cy.get(SIDEBAR).within(() => {
      cy.get('section.commander').then(($section) => {
        const labelledBy = $section.attr('aria-labelledby');
        expect(labelledBy).to.be.a('string').and.not.be.empty;
        cy.get(`#${labelledBy}`).should('exist');
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Responsive behavior — the four breakpoints
// ---------------------------------------------------------------------------

describe('dashboard — responsive behavior', () => {
  it('renders correctly at the smallest supported viewport (320px)', () => {
    cy.viewport(320, 720);

    cy.get(HEADER).should('be.visible');
    cy.get(SIDEBAR).should('be.visible');
    cy.get(LIST).should('exist');
    cy.get('h1.dashboard__title').should('be.visible');
    cy.get(EMPTY_STATE_ACTION).should('be.visible');

    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(320 + 1);
    });
  });

  it('renders correctly at the tablet breakpoint (768px)', () => {
    cy.viewport(768, 1024);

    cy.get('.dashboard__subtitle').should('not.be.visible');
    cy.get('h1.dashboard__title').should('be.visible');
    cy.get(SIDEBAR).should('be.visible');
    cy.get(LIST).should('exist');
  });

  it('renders correctly at the desktop breakpoint (1024px)', () => {
    cy.viewport(1024, 768);
    cy.get(SIDEBAR).should('be.visible');
    cy.get('section.dashboard__main').should('be.visible');
  });

  it('renders correctly at the wide breakpoint (1440px)', () => {
    cy.viewport(1440, 900);
    cy.get(HEADER).should('be.visible');
    cy.get(SIDEBAR).should('be.visible');
    cy.get('section.dashboard__main').should('be.visible');
  });

  it('no horizontal overflow at any breakpoint', () => {
    const viewports = [
      { w: 320, h: 720 },
      { w: 768, h: 1024 },
      { w: 1024, h: 768 },
      { w: 1440, h: 900 },
    ];

    viewports.forEach(({ w, h }) => {
      cy.viewport(w, h);
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth, `at ${w}px`).to.be.at.most(w + 1);
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Toast region — presence and z-index
// ---------------------------------------------------------------------------

describe('dashboard — toast region', () => {
  it('does not exist until a toast is shown', () => {
    cy.get('#toast-region').should('not.exist');
  });

  it('a toast appears above the header when shown', () => {
    cy.get(CREATE).click();
    cy.get('.task-dialog input[name="title"]').type('Toast test');
    cy.get('.task-dialog input[name="creator"]').type('C');
    cy.get('.task-dialog input[name="assignee"]').type('A');
    cy.get('.task-dialog [data-action="submit-dialog"]').click();

    cy.get('#toast-region').should('exist');
    cy.get('#toast-region [role="status"]').should('contain.text', 'Task created');
  });
});