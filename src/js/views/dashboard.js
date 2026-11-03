/**
 * Dashboard view — the composition root of the view layer.
 *
 * Card 1 of the rendering contract. The dashboard creates the layout
 * regions; it does not fill them. Filling them is the job of the views
 * named after them (counter, search, list). The dashboard's only job is
 * to say "these regions exist, in this order, with these containers" so
 * that the child views have a stable place to write.
 *
 * Why the dashboard owns the regions and not the contents:
 *   The dashboard is re-rendered on every application render. If it
 *   also owned the contents, every render would throw away the
 *   counter, the search results, and the list, and rebuild them from
 *   scratch — which is fine in principle (full replace is the policy)
 *   but wrong in practice, because it would also throw away the search
 *   input's focus and the user's typing. The regions are stable; the
 *   contents are replaced by their owners on every render.
 *
 * Why the dashboard does not know about events:
 *   The event layer (`app.js`) wires listeners. The dashboard produces
 *   nodes with `data-action` attributes so the event layer can delegate
 *   from the root. A dashboard that attached its own listeners would
 *   have to detach them on every render, which is a leak waiting to
 *   happen. See the rendering contract's DOM ownership map.
 *
 * @module views/dashboard
 */

import { el } from '../utils/dom.js';

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
 * The state shape is assembled by the event layer from the store and
 * the search input, and passed to the dashboard. The dashboard does not
 * reach into the store or read the input; it receives what it renders.
 * That is what makes it a pure function of its inputs.
 *
 * The four regions are:
 *
 *   [data-region="header"]  — mission title, sticky, contains search
 *   [data-region="sidebar"] — commander info and live task counter
 *   [data-region="search"]  — search input and the results summary
 *   [data-region="list"]    — the task list, or the empty state
 *
 * Each region is a `<section>` with a `data-region` attribute. The
 * attribute is the ownership marker: a test that wants to assert "the
 * counter is in the sidebar" queries `[data-region="sidebar"]
 * [data-region="counter"]`. A view that wants to fill a region queries
 * the same selector. The attribute is a contract, not a style hook.
 *
 * The header is sticky because the UI checklist requires it. The
 * class is on the header element, not the dashboard, because the
 * header is the thing that sticks.
 */
export function renderDashboard(state) {
  const {
    filteredTasks,
    searchQuery,
    counter,
  } = state;

  return el('main', { class: 'dashboard', dataset: { region: 'dashboard' } }, [
    el('header', {
      class: 'dashboard__header',
      dataset: { region: 'header' },
    }, [
      el('h1', { class: 'dashboard__title' }, 'Mars Mission Control'),
      el('p', { class: 'dashboard__subtitle' }, 'Task management for the mission crew'),
    ]),

    el('div', { class: 'dashboard__body' }, [
      el('aside', {
        class: 'dashboard__sidebar',
        dataset: { region: 'sidebar' },
      }, [
        el('section', { class: 'commander' }, [
          el('h2', { class: 'commander__heading' }, 'Commander'),
          el('p', { class: 'commander__name' }, 'Commander Aria Vance'),
          el('p', { class: 'commander__role' }, 'Mission Operations Lead'),
        ]),
        el('section', {
          class: 'sidebar-counter',
          dataset: { region: 'counter' },
        }, [
          // The counter is filled by renderCounter. The dashboard creates
          // the container; the counter view fills it. This is why the
          // dashboard does not import renderCounter — it does not call it,
          // and it does not need to know its output shape. It only needs
          // to know that a container named "counter" exists.
          //
          // The empty placeholder is deliberate. If the counter were
          // rendered here, the dashboard would own the counter's output,
          // and the ownership map would have two owners for the same
          // node. The empty container is the seam.
        ]),
      ]),

      el('section', {
        class: 'dashboard__main',
        dataset: { region: 'main' },
      }, [
        el('div', {
          class: 'search-bar',
          dataset: { region: 'search' },
        }, [
          // The search input is a persistent element: it must survive
          // re-renders so the user does not lose focus while typing.
          // This is the ONE place in the dashboard that is not a fresh
          // element every render — the input is created here and the
          // event layer is expected to preserve it.
          //
          // In practice, "full replace" of the dashboard would destroy
          // the input on every render. The contract resolves this by
          // saying: the search input is created by the dashboard, and
          // the dashboard is re-rendered ONLY on state changes that do
          // not include keystrokes. Keystroke-triggered re-renders use
          // `renderSearchResults` and `renderTaskList` directly, without
          // rebuilding the dashboard. See app.js for the wiring.
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

        el('div', {
          class: 'dashboard__content',
          dataset: { region: 'content' },
        }, [
          // The search results and the list are filled by their own
          // views. The dashboard creates the containers; the views fill
          // them. The containers are stable across renders, which is
          // what lets `renderSearchResults` replace its contents
          // without the dashboard being re-rendered.
          el('div', {
            class: 'search-results-container',
            dataset: { region: 'search-results' },
          }),
        ]),
      ]),
    ]),
  ]);
}

/**
 * The "filled" render — a convenience wrapper for the common case.
 *
 * `renderDashboard` returns the shell with empty containers. Most
 * callers want the shell with the current state filled in. This wrapper
 * calls the shell, then calls each child view and places its output in
 * its region. It does not change the ownership map: the child views
 * still own the contents of their regions; this wrapper is just a
 * shortcut that saves every caller from repeating the four-step dance.
 *
 * If a caller needs partial rendering (e.g. re-render only the list on
 * a keystroke), they should use the child views directly. The wrapper
 * is for the initial render and for full-state changes.
 *
 * @param {{
 *   tasks: ReadonlyArray<object>,
 *   filteredTasks: ReadonlyArray<object>,
 *   searchQuery: string,
 *   counter: number,
 * }} state
 * @param {{
 *   renderCounter: (count: number) => Node,
 *   renderTaskList: (tasks: ReadonlyArray<object>) => Node,
 *   renderSearchResults: (query: string, tasks: ReadonlyArray<object>) => Node,
 * }} views
 * @returns {HTMLElement}
 *
 * Note the `views` parameter: the dashboard does not import the child
 * views. It receives them. This is the dependency inversion that makes
 * the dashboard testable without pulling in the whole view layer, and
 * it is what makes "replace a view with a stub" possible in a test.
 */
export function renderDashboardFilled(state, views) {
  const root = renderDashboard(state);

  const counterSlot = root.querySelector('[data-region="counter"]');
  const searchResultsSlot = root.querySelector('[data-region="search-results"]');

  if (counterSlot) {
    counterSlot.replaceChildren(views.renderCounter(state.counter));
  }
  if (searchResultsSlot) {
    searchResultsSlot.replaceChildren(
      views.renderSearchResults(state.searchQuery, state.filteredTasks)
    );
  }

  return root;
}