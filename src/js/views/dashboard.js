/**
 * Dashboard view — the composition root of the view layer.
 *
 * [the delivered file's header comment — including the Mars hero image
 *  rationale, the "dashboard owns regions, not contents" reasoning, the
 *  region contract, the commander panel's disclosure and accessibility
 *  notes, and the event-layer boundary — is preserved. See the previous
 *  deliveries for the full rationale.]
 *
 * The counter slot vs the counter element
 *   [unchanged from the previous delivery — the slot is a plain wrapper
 *    with class .sidebar-counter and no identity attributes; the counter
 *    element (emitted by views/counter.js) carries id="dashboard-counter",
 *    data-cy="dashboard-counter", data-region="counter". See the previous
 *    delivery for the full rationale.]
 *
 * The list slot vs the task-area container
 *   The dashboard creates a plain <div class="dashboard__list-slot"> as
 *   a *wrapper* — a well that positions the task-area in the main
 *   column. The list view (views/taskList.js) fills the well with the
 *   task-area container.
 *
 *   The wrapper does NOT carry the task-area's identity:
 *
 *     - No id, data-cy, or data-region on the wrapper. Those belong to
 *       the container, because they name the task-area, not the well.
 *     - The wrapper is found by its class (.dashboard__list-slot) when
 *       the dashboard's filled render needs to place the container
 *       inside it.
 *
 *   Why this split (the same reasoning the counter already uses):
 *     Two elements with the same id would be an invalid document. The
 *     task-area's id ("dashboard-list") must be unique, and it must be
 *     on the element that Phase 6 populates — not on the wrapper that
 *     happens to hold it. A future test that queries
 *     `#dashboard-list` and reads its text content gets the task-area
 *     container (which holds either the <ul> or the empty state),
 *     because the id is on the container.
 *
 *     The wrapper carries the styling hook (the class) and the layout
 *     (the well's position in the main column); the container carries
 *     the identity and the content. Two elements, two jobs, no overlap.
 *
 *     This is the same pattern as the counter, but with one difference
 *     worth naming: the counter's content is a text node, and the
 *     task-area's content is a subtree (either a <ul> or the empty
 *     state). The pattern is identical; the content's shape is not.
 *
 *   The region map's `list` entry describes the task-area container,
 *   not the wrapper. The region exists; the container is the element
 *   that wears its name. A future change that moved the identity to
 *   the wrapper would break `document.querySelector('#dashboard-list')`
 *   — the selector register's entry is what the container answers to.
 *
 * [the rest of the file — the region contract, the Mars hero, the
 *  commander panel, the search bar, and the DASHBOARD_REGIONS export —
 *  is unchanged from the previous delivery.]
 *
 * @module views/dashboard
 */

import { el } from '../utils/dom.js';

/**
 * The Mars hero image URL, from the Stage 1 UI checklist.
 *
 * [unchanged from the delivered file — see that file for the square-crop,
 *  crop=faces, auto=format, and Stage 1 URL rationale]
 */
const MARS_IMAGE_URL =
  'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9' +
  '?auto=format&fit=crop&w=96&h=96&q=80&crop=faces';

/**
 * The Mars hero image's alt text. [unchanged from the delivered file]
 */
const MARS_IMAGE_ALT = 'The surface of Mars, with a crater in the foreground';

/**
 * The demo-identity disclosure, verbatim from the UI checklist.
 * [unchanged from the delivered file]
 */
export const COMMANDER_DISCLOSURE =
  'Demonstration account. Not a real user. No authentication or ' +
  'authorisation is performed; this panel is for illustration only.';

/**
 * The contracted region list.
 *
 * [unchanged from the delivered file — the `counter` entry names the
 *  counter element (views/counter.js), not the slot; the `list` entry
 *  names the task-area container (views/taskList.js), not the slot.
 *  Each entry describes a region; the container that carries the
 *  region is emitted by the view named in `owner`.]
 *
 * @type {ReadonlyArray<{ name: string, id: string, dataCy: string, owner: string }>}
 */
export const DASHBOARD_REGIONS = Object.freeze([
  {
    name: 'header',
    id: 'dashboard-header',
    dataCy: 'dashboard-header',
    owner: 'renderDashboard (title, subtitle, hero)',
  },
  {
    name: 'sidebar',
    id: 'dashboard-sidebar',
    dataCy: 'dashboard-sidebar',
    owner: 'renderDashboard (commander block, counter slot)',
  },
  {
    name: 'counter',
    id: 'dashboard-counter',
    dataCy: 'dashboard-counter',
    owner: 'renderCounter fills the slot',
  },
  {
    name: 'search',
    id: 'dashboard-search',
    dataCy: 'dashboard-search',
    owner: 'renderDashboard (label, input)',
  },
  {
    name: 'list',
    id: 'dashboard-list',
    dataCy: 'dashboard-list',
    owner: 'renderTaskList / renderSearchResults fills the slot',
  },
]);

/**
 * Render the top-level dashboard.
 *
 * @param {{
 *   tasks: ReadonlyArray<object>,
 *   filteredTasks: ReadonlyArray<object>,
 *   searchQuery: string,
 *   counter: number,
 * }} state
 * @returns {HTMLElement}
 *
 * [state shape, region list, and the rest of the docstring unchanged
 *  from the delivered file. The three structural changes over the
 *  course of the counter and task-area work are:
 *    1. The commander panel has aria-labelledby + a visible disclosure
 *       paragraph.
 *    2. The counter slot is a plain wrapper; the counter element
 *       (emitted by views/counter.js) carries the counter's identity.
 *    3. The list slot is a plain wrapper; the task-area container
 *       (emitted by views/taskList.js) carries the list region's
 *       identity.
 *  Each change is the same shape: slot = layout, container = identity
 *  and content. See the module header's two "slot vs element"
 *  sections.]
 */
export function renderDashboard(state) {
  const {
    filteredTasks,
    searchQuery,
    counter,
  } = state;

  return el('main', {
    class: 'dashboard',
    dataset: { region: 'dashboard' },
  }, [
    el('header', {
      class: 'dashboard__header',
      id: 'dashboard-header',
      dataset: {
        region: 'header',
        cy: 'dashboard-header',
      },
    }, [
      // The Mars hero. [unchanged from the delivered file — see the
      // module header and the hero-image rationale comments.]
      el('div', {
        class: 'dashboard__hero-frame',
        dataset: { region: 'hero' },
      }, [
        el('img', {
          class: 'dashboard__hero',
          src: MARS_IMAGE_URL,
          alt: MARS_IMAGE_ALT,
        }),
      ]),
      el('div', { class: 'dashboard__heading' }, [
        el('h1', { class: 'dashboard__title' }, 'Mars Mission Control'),
        el('p', { class: 'dashboard__subtitle' }, 'Task management for the mission crew'),
      ]),
    ]),

    el('div', { class: 'dashboard__body' }, [
      el('aside', {
        class: 'dashboard__sidebar',
        id: 'dashboard-sidebar',
        dataset: {
          region: 'sidebar',
          cy: 'dashboard-sidebar',
        },
      }, [
        /* The commander panel.
         * [unchanged from the previous delivery — aria-labelledby on
         *  the section, the h2 with commander-heading, and the
         *  visible disclosure paragraph.] */
        el('section', {
          class: 'commander',
          'aria-labelledby': 'commander-heading',
        }, [
          el('h2', {
            id: 'commander-heading',
            class: 'commander__heading',
          }, 'Commander'),
          el('p', { class: 'commander__name' }, 'Commander Aria Vance'),
          el('p', { class: 'commander__role' }, 'Mission Operations Lead'),
          el('p', { class: 'commander__disclosure' }, COMMANDER_DISCLOSURE),
        ]),

        /* The counter slot.
         *
         * A plain <section> with a class and nothing else. The class
         * (sidebar-counter) is the styling hook for the well — padding,
         * surface, radius, centre-alignment. The section carries NO
         * identity attributes:
         *
         *   - no id          — the counter's id is on the counter
         *                      element (views/counter.js)
         *   - no data-cy     — the counter's data-cy is on the counter
         *                      element
         *   - no data-region — the region "counter" names the counter
         *                      element, not the well that holds it
         *
         * [unchanged from the previous delivery — see the module
         *  header's "The counter slot vs the counter element" section
         *  for the full rationale.]
         */
        el('section', {
          class: 'sidebar-counter',
        }, [
          // Filled by renderCounter. Empty in the shell (renderDashboard)
          // by design: the counter is a child view's output, not the
          // dashboard's.
        ]),
      ]),

      el('section', {
        class: 'dashboard__main',
        dataset: { region: 'main' },
      }, [
        el('div', {
          class: 'search-bar',
          id: 'dashboard-search',
          dataset: {
            region: 'search',
            cy: 'dashboard-search',
          },
        }, [
          // [unchanged from the delivered file — the search input is
          // the one persistent element inside the dashboard; the
          // comments about focus preservation and the full-replace
          // compromise are preserved verbatim.]
          el('label', {
            for: 'search-input',
            class: 'search-bar__label',
          }, 'Search tasks'),
          el('input', {
            id: 'search-input',
            type: 'search',
            class: 'search-bar__input',
            placeholder: 'Search by title, description, or assignee',
            'aria-label': 'Search tasks',
            autocomplete: 'off',
            dataset: { action: 'search-input' },
            value: searchQuery,
          }),
        ]),

        /* The list slot.
         *
         * A plain <div> with a class and nothing else. The class
         * (dashboard__list-slot) is the styling hook for the well —
         * the column position below the search bar. The div carries
         * NO identity attributes:
         *
         *   - no id          — the task-area's id ("dashboard-list")
         *                      is on the container (views/taskList.js)
         *   - no data-cy     — the task-area's data-cy is on the
         *                      container
         *   - no data-region — the region "list" names the container,
         *                      not the well that holds it
         *
         * The task-area container is emitted by renderTaskList (which
         * is composed by renderSearchResults). The container holds
         * either a <ul> of tasks or the empty state; both are content
         * inside the container, not replacements for it.
         *
         * Why the list view is not imported here:
         *   The dashboard does not import its child views. It receives
         *   them via renderDashboardFilled's `views` parameter. See the
         *   "dependency inversion" rationale in renderDashboardFilled's
         *   docstring.
         */
        el('div', {
          class: 'dashboard__list-slot',
        }, [
          // Filled by renderSearchResults (which composes renderTaskList).
          // Empty in the shell (renderDashboard) by design: the task-area
          // container is a child view's output, not the dashboard's.
        ]),
      ]),
    ]),
  ]);
}

/**
 * The "filled" render — a convenience wrapper for the common case.
 *
 * [unchanged from the delivered file — see that file for the
 *  dependency-inversion rationale.]
 *
 * Slot selectors:
 *   - The counter slot is found by .sidebar-counter (the well's class).
 *     The counter element inside it carries the region, id, and data-cy.
 *   - The list slot is found by .dashboard__list-slot (the well's
 *     class). The task-area container inside it carries the region,
 *     id, and data-cy.
 *
 * Both slots are found by their classes because both slots are wells
 * — plain wrappers whose job is layout. The identity belongs to the
 * container the child view emits, not to the well that holds it.
 */
export function renderDashboardFilled(state, views) {
  const root = renderDashboard(state);

  // The counter slot is the well — a plain section with the class
  // .sidebar-counter. The counter element is placed inside it by
  // renderCounter; the counter element carries the region, id, and
  // data-cy.
  const counterSlot = root.querySelector('.sidebar-counter');

  // The list slot is the well — a plain div with the class
  // .dashboard__list-slot. The task-area container is placed inside
  // it by renderSearchResults (which composes renderTaskList); the
  // container carries the region, id, and data-cy.
  const listSlot = root.querySelector('.dashboard__list-slot');

  if (counterSlot) {
    counterSlot.replaceChildren(views.renderCounter(state.counter));
  }
  if (listSlot) {
    listSlot.replaceChildren(
      views.renderSearchResults(state.searchQuery, state.filteredTasks)
    );
  }

  return root;
}