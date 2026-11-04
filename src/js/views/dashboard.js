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
 *    data-cy="dashboard-counter", data-region="counter". See the
 *    previous delivery for the full rationale.]
 *
 * The list slot vs the task-area container
 *   [unchanged from the previous delivery — the slot is a plain wrapper
 *    with class .dashboard__list-slot and a data-listener attribute;
 *    the task-area container (emitted by views/taskList.js) carries the
 *    id, data-cy, and data-region. See the previous delivery for the
 *    full rationale.]
 *
 * The header's create affordance
 *   The header now renders a "Create task" button alongside the Mars
 *   hero and the title. The button is the *persistent* create
 *   affordance — visible at every scroll position, in every task-area
 *   state (empty, populated, filtered-to-empty).
 *
 *   Why the header button, in addition to the empty state's
 *   "Create your first task":
 *
 *     The empty state's affordance is *contextual* — it appears only
 *     when the task area is empty. A user with one task has no
 *     *persistent* affordance to create a second one. The empty state
 *     is the right place for the first affordance a user sees ("start
 *     here"), but it is the *wrong* place for the only affordance a
 *     user has. The header button fills that gap: it is available at
 *     every state, and it is where a user who has used the app for a
 *     while expects a primary action to live (the header's right side).
 *
 *   Why the two buttons have distinct `data-cy` values:
 *
 *     `dashboard-create` (header) and `dashboard-empty-create` (empty
 *     state) name two different elements with the same *action*. A test
 *     that wants "the create button in the header" targets
 *     `[data-cy="dashboard-create"]`; a test that wants "the create
 *     button in the empty state" targets
 *     `[data-cy="dashboard-empty-create"]`. The two are different
 *     elements with different DOM positions, different accessible-name
 *     contexts (the header's "Create task" sits beside the mission
 *     title; the empty state's "Create your first task" sits inside a
 *     "no tasks yet" message), and different trigger elements for the
 *     dialog's focus-restoration. Sharing a `data-cy` would make a
 *     test that targets "the create button" ambiguous — which element
 *     does it mean? Distinct selectors keep the test unambiguous.
 *
 *   Why the button is text, not an icon:
 *
 *     The empty state's affordance is text ("Create your first task")
 *     because the user is a first-time user and the affordance is the
 *     primary thing on the screen. The header's affordance is text
 *     ("Create task") for the same reason, in a shorter form: the
 *     header is narrow, the button is one of several elements, and a
 *     text label keeps the affordance legible to every reader (sighted,
 *     screen-reader, keyboard-only). An icon would require a tooltip,
 *     a title attribute, or an aria-label to be readable — three places
 *     for a single label. Text is one place.
 *
 *   The button's data-action="open-create-dialog" matches the empty
 *   state's button — the event layer's delegated click handler treats
 *   both as the same action, and dispatches to the same
 *   `handleOpenCreate`. The event layer's delegation is extended to
 *   cover the header (see app.js); the button's trigger element is
 *   the button itself, so dialogTrigger is the header button, not the
 *   empty state's button, and the focus restoration lands on whichever
 *   button the user actually clicked.
 *
 * [the rest of the file — the region contract, the Mars hero, the
 *  commander panel, the search bar, the DASHBOARD_REGIONS export, and
 *  renderDashboardFilled — is unchanged from the previous delivery.]
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
 * The header's "Create task" button. Exported so a test can target it
 * by the same constant the view writes, and so a future change to the
 * button's id or data-cy is one edit, visible to the test.
 *
 * The values follow the "dashboard-<name>" convention used by the
 * region map (`dashboard-header`, `dashboard-list`, etc.) and by the
 * empty state's affordance (`dashboard-empty-create`). The header
 * button's values are `dashboard-create` — the *region's* name plus
 * the affordance's role, not the empty state's.
 *
 * See the module header's "The header's create affordance" section
 * for the rationale on the distinct `data-cy` (vs. the empty state's).
 */
export const HEADER_CREATE_ID = 'dashboard-create';
export const HEADER_CREATE_DATA_CY = 'dashboard-create';

/**
 * The contracted region list.
 *
 * [unchanged from the delivered file — the `counter` entry names the
 *  counter element (views/counter.js), not the slot; the `list` entry
 *  names the task-area container (views/taskList.js), not the slot.
 *  The `header` entry names the header element; its create button is
 *  a child of the header and does not appear in this list, because the
 *  region list names regions, not controls. A future change that
 *  wanted the button to be its own region would need a new entry — a
 *  different decision with its own rationale, not a refactor.]
 *
 * @type {ReadonlyArray<{ name: string, id: string, dataCy: string, owner: string }>}
 */
export const DASHBOARD_REGIONS = Object.freeze([
  {
    name: 'header',
    id: 'dashboard-header',
    dataCy: 'dashboard-header',
    owner: 'renderDashboard (title, subtitle, hero, create button)',
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
 *  from the delivered file. The four structural changes over the
 *  course of the counter, task-area, and header-affordance work are:
 *    1. The commander panel has aria-labelledby + a visible disclosure
 *       paragraph.
 *    2. The counter slot is a plain wrapper; the counter element
 *       (emitted by views/counter.js) carries the counter's identity.
 *    3. The list slot is a plain wrapper with a data-listener
 *       attribute; the task-area container (emitted by
 *       views/taskList.js) carries the list region's identity.
 *    4. The header now carries a persistent "Create task" button
 *       (see the module header's "The header's create affordance"
 *       section) — the empty state's "Create your first task" remains,
 *       as the contextual affordance.]
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

      // The persistent create affordance.
      //
      // A <button> (not a styled <a> or <div>) so it is focusable,
      // keyboard-activatable, and announced as a button by screen
      // readers. The type="button" prevents it from submitting any
      // ambient form (it is not inside a form today, but a future
      // change that wrapped the header in a form would make
      // type="button" the difference between "opens the dialog" and
      // "submits the surrounding form").
      //
      // data-action="open-create-dialog" is the *same* delegation hook
      // the empty state's "Create your first task" button uses. The
      // event layer's delegated click handler dispatches to the same
      // `handleOpenCreate`; the trigger element is whichever button
      // the user actually clicked, so focus restoration lands on the
      // right button.
      //
      // data-cy="dashboard-create" — distinct from
      // "dashboard-empty-create" — so a test can target "the header
      // create button" without ambiguity. See the module header for
      // the rationale on the two selectors.
      //
      // The button's text "Create task" is the same imperative mood
      // the empty state's "Create your first task" uses, shortened
      // for the header's narrower context. A future change that
      // wanted an icon would need an aria-label to keep the button
      // readable — the same rule the empty state's affordance follows.
      el('button', {
        type: 'button',
        class: 'dashboard__create-button',
        id: HEADER_CREATE_ID,
        dataset: {
          action: 'open-create-dialog',
          cy: HEADER_CREATE_DATA_CY,
        },
      }, 'Create task'),
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
         * [unchanged from the previous delivery — a plain <section>
         *  with class "sidebar-counter", no identity attributes. The
         *  counter element (emitted by renderCounter) carries the
         *  region, id, and data-cy. See the module header's "The
         *  counter slot vs the counter element" section.]
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
          // the one persistent element inside the dashboard.]
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
         * [unchanged from the previous delivery — a plain <div> with
         *  class "dashboard__list-slot" and
         *  data-listener="task-actions". No identity attributes: the
         *  task-area container (emitted by views/taskList.js) carries
         *  the id, data-cy, and data-region.]
         *
         * The data-listener attribute is the *delegation boundary* —
         * the event layer attaches its delegated click listener to
         * this element, and matches [data-action] descendants within
         * it. The attribute is not a region attribute; the region
         * "list" names the task-area container inside the slot, not
         * the slot itself. See the module header's "The list slot vs
         * the task-area container" section.
         *
         * Note: with the header button added (above), the event
         * layer's delegated click handler needs to cover *both* the
         * task-actions well and the header button. See the
         * corresponding app.js note: the delegation is extended to
         * the dashboard root (`root`), so a click anywhere in the
         * dashboard that lands on a `[data-action]` element is
         * dispatched — the task-actions well and the header's create
         * button are covered by the same listener.
         */
        el('div', {
          class: 'dashboard__list-slot',
          dataset: { listener: 'task-actions' },
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
 *
 * The header is not filled by the wrapper — it has no regions a child
 * view fills. The header's own content (title, subtitle, hero, create
 * button) is emitted by renderDashboard; the empty-state create
 * affordance is emitted by renderNoTasks inside the list slot's
 * content.
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