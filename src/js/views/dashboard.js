/**
 * Dashboard view — the composition root of the view layer.
 *
 * [the delivered file's header comment — including the Mars hero image
 *  rationale, the "dashboard owns regions, not contents" reasoning, the
 *  region contract, the commander panel's disclosure and accessibility
 *  notes, and the event-layer boundary — is preserved. See the previous
 *  deliveries for the full rationale.]
 *
 * The header's witty title
 *   [unchanged from the previous delivery — the h1 carries both
 *    `.dashboard__title` (typographic contract) and
 *    `.dashboard__title--witty` (visual flourish). See that delivery
 *    for the full rationale on the split.]
 *
 * The sidebar's clear-all button
 *   The sidebar region renders a "Clear all tasks" button beneath
 *   the counter. The button:
 *
 *     - Lives in the sidebar, next to the counter. A destructive
 *       action next to the count it destroys is legible: the user
 *       sees "3 tasks" and, immediately below, "Clear all tasks."
 *       The adjacency is the affordance.
 *
 *     - Is a real `<button type="button">`, keyboard-activatable, and
 *       announced as a button. Its `aria-label` includes the current
 *       count so a screen-reader user hears "Clear all tasks, 3 tasks
 *       will be deleted" — the consequence is in the name.
 *
 *     - Carries `data-action="open-clear-all-dialog"` so the event
 *       layer's delegated click handler dispatches to the same
 *       handler pattern as every other `[data-action]` in the
 *       dashboard.
 *
 *     - Is rendered at every state, including when the store is
 *       empty. A button that disappears when the store is empty is a
 *       button whose *presence* implies "there are tasks to clear."
 *       Keeping it visible (and disabled when the count is 0) is the
 *       honest representation: the affordance exists, it just has
 *       no work to do. A disabled button is announced as disabled by
 *       assistive technology, and its `aria-disabled` state is
 *       inspectable by tests.
 *
 *   Why the button is NOT in the header: the header holds the
 *   *persistent create* affordance. A "Clear all" beside "Create
 *   task" would put the two highest-stakes actions of the app
 *   adjacent to each other. That is the opposite of the safe-default
 *   discipline the rest of the app follows. The sidebar is one step
 *   removed from the create flow — the user has to look at the count,
 *   then at the button below it, before they can click. That step is
 *   the safety margin.
 *
 *   Why the disabled state uses the *total* count, not the filtered
 *   count: the button's action ("clear all") applies to every task,
 *   not just the ones currently visible. A user with 5 tasks, filtered
 *   to 1, clicks "Clear all tasks" and expects 0 tasks after — not
 *   "4 tasks remaining because 4 were filtered out." The `disabled`
 *   state is driven by `state.tasks.length` (the total); the visible
 *   counter is driven by `state.counter` (the filtered count).
 *
 * The counter slot vs the counter element
 *   [unchanged from the previous delivery]
 *
 * The list slot vs the task-area container
 *   [unchanged from the previous delivery]
 *
 * The header's create affordance
 *   [unchanged from the previous delivery]
 *
 * @module views/dashboard
 */

import { el } from '../utils/dom.js';

/**
 * The Mars hero image URL, from the Stage 1 UI checklist.
 * [unchanged from the delivered file]
 */
const MARS_IMAGE_URL =
  'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9' +
  '?auto=format&fit=crop&w=96&h=96&q=80&crop=faces';

/**
 * The Mars hero image's alt text. [unchanged from the delivered file]
 */
const MARS_IMAGE_ALT = 'The surface of Mars, with a crater in the foreground';

/**
 * The header's "Create task" button. [unchanged from the delivered file]
 */
export const HEADER_CREATE_ID = 'dashboard-create';
export const HEADER_CREATE_DATA_CY = 'dashboard-create';

/**
 * The sidebar's "Clear all tasks" button. Exported so a test can
 * reference the same constant the view writes, and so a future
 * change to the button's id or data-cy is one edit, visible to the
 * test.
 *
 * The id is `clear-all` (the button's role, short form). The data-cy
 * is `dashboard-clear-all` (the region name plus the button's role,
 * matching the `dashboard-create` / `dashboard-empty-create`
 * convention used elsewhere).
 */
export const CLEAR_ALL_ID = 'clear-all';
export const CLEAR_ALL_DATA_CY = 'dashboard-clear-all';

/**
 * The contracted region list.
 *
 * [unchanged from the delivered file — the region list names
 *  regions, not controls. The clear-all button is a child of the
 *  sidebar region and does not appear here.]
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
    owner: 'renderDashboard (commander block, counter slot, clear-all button)',
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
 * The state shape:
 *   - `tasks` is the store's full list. Used by the clear-all button's
 *     enabled state (the button acts on the total, not on the
 *     filtered subset).
 *   - `filteredTasks` is the list after the search filter is applied.
 *     Used by the list slot's content.
 *   - `searchQuery` is the current filter text. Used by the search
 *     input and by the empty state's `emptyReason` (computed in the
 *     app layer from this value).
 *   - `counter` is the filtered count. Used by the counter view.
 *
 * The six structural changes over the course of the project are:
 *   1. The commander panel has aria-labelledby + a visible disclosure
 *      paragraph.
 *   2. The counter slot is a plain wrapper; the counter element
 *      (emitted by views/counter.js) carries the counter's identity.
 *   3. The list slot is a plain wrapper with a data-listener
 *      attribute; the task-area container carries the list region's
 *      identity.
 *   4. The header carries a persistent "Create task" button.
 *   5. The h1 carries a `--witty` modifier class alongside the base
 *      `.dashboard__title` class.
 *   6. The sidebar carries a "Clear all tasks" button beneath the
 *      counter — disabled when the store is empty, enabled otherwise.
 */
export function renderDashboard(state) {
  const {
    tasks,
    filteredTasks,
    searchQuery,
    counter,
  } = state;

  // The clear-all button's enabled state is driven by the store's
  // *total* task count, not the filtered count. Clearing "all tasks"
  // clears everything, whether or not the current search matches
  // them. A user with 5 tasks, filtered to 1, expects "Clear all"
  // to leave 0 tasks behind, not 4 filtered-out survivors.
  //
  // `tasks` is the store's full list; `counter` is the filtered
  // count. The button uses `tasks.length`. The counter element
  // (rendered by renderCounter) uses `counter`. Both are correct
  // for their purpose.
  const totalTaskCount = tasks.length;
  const clearAllDisabled = totalTaskCount === 0;

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
      // The Mars hero. [unchanged from the delivered file]
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

      // The witty title block. [unchanged from the previous delivery]
      el('div', { class: 'dashboard__heading' }, [
        el('h1', {
          class: 'dashboard__title dashboard__title--witty',
        }, "The Red Planet's To-Do List"),
        el('p', {
          class: 'dashboard__subtitle',
        }, 'Mission-critical tasks, marshalled.'),
      ]),

      // The persistent create affordance. [unchanged from the previous
      // delivery]
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
        /* The commander panel. [unchanged] */
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
        ]),

        /* The counter slot. [unchanged — filled by renderCounter] */
        el('section', {
          class: 'sidebar-counter',
        }, [
          // Filled by renderCounter. Empty in the shell (renderDashboard)
          // by design: the counter is a child view's output, not the
          // dashboard's.
        ]),

        /* The clear-all button — the sidebar's destructive affordance.
         *
         * Position: a sibling of the counter (below it, in the
         * sidebar's flex column). The user sees the count, then
         * the button that acts on the count. That order is the
         * safety margin — the read happens before the click.
         *
         * State: disabled when the store is empty. The `disabled`
         * attribute prevents click dispatch in modern browsers; the
         * `aria-disabled` attribute is the assistive-technology
         * signal. Both are set explicitly because a button that is
         * disabled by the `disabled` attribute alone is not
         * announced as disabled in every screen reader, and an
         * `aria-disabled`-only button still dispatches clicks
         * (requiring the handler to check). Setting both is the
         * belt-and-braces correct form.
         *
         * Accessibility: the `aria-label` includes the count so a
         * screen-reader user hears the consequence before the
         * button's name. Sighted users read the count in the
         * counter above; the label gives the screen-reader user
         * the same information in the same order.
         */
        el('button', {
          type: 'button',
          class: 'sidebar-clear-all',
          id: CLEAR_ALL_ID,
          dataset: {
            action: 'open-clear-all-dialog',
            cy: CLEAR_ALL_DATA_CY,
          },
          disabled: clearAllDisabled,
          'aria-disabled': clearAllDisabled ? 'true' : 'false',
          'aria-label':
            totalTaskCount === 0
              ? 'Clear all tasks (no tasks to clear)'
              : `Clear all tasks (${totalTaskCount} task${totalTaskCount === 1 ? '' : 's'} will be deleted)`,
        }, 'Clear all tasks'),
      ]),

      el('section', {
        class: 'dashboard__main',
        dataset: { region: 'main' },
      }, [
        /* The search bar. [unchanged from the delivered file] */
        el('div', {
          class: 'search-bar',
          id: 'dashboard-search',
          dataset: {
            region: 'search',
            cy: 'dashboard-search',
          },
        }, [
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

        /* The list slot. [unchanged — filled by renderSearchResults] */
        el('div', {
          class: 'dashboard__list-slot',
          dataset: { listener: 'task-actions' },
        }, []),
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
 * The clear-all button is *not* filled by the wrapper — it is
 * emitted by `renderDashboard` itself, because its disabled state
 * depends on `state.tasks.length`, which `renderDashboard` has.
 * A future change that wanted the wrapper to control the button's
 * state would be a change to the state contract, not the wrapper.
 */
export function renderDashboardFilled(state, views) {
  const root = renderDashboard(state);

  const counterSlot = root.querySelector('.sidebar-counter');
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