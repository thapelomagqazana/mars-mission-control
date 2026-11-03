/**
 * Search results view — renders the summary line for the current query
 * and the list of matching tasks.
 *
 * Card 6 of the rendering contract. The search view's job is narrower
 * than it looks at first: it renders the *summary* of the current
 * query, plus the list the query produced. It does not filter; the
 * filtering happened before the view was called. It does not read the
 * input; the query is passed in. Its only non-trivial job is deciding
 * what the summary says, because the summary is the one piece of the
 * view that depends on both the query and the match count.
 *
 * Ownership:
 *   The dashboard owns the [data-region="search-results"] container.
 *   This view fills it. The view's <div> carries class="search-results"
 *   but NOT the region attribute — two views claiming one region would
 *   break the ownership map, and the ownership test that enforces the
 *   map fails when it happens.
 *
 *   This is the same split as the counter view: the container is a slot
 *   the dashboard creates and guarantees; the content is what the view
 *   produces. The container owns the region attribute; the content owns
 *   its class.
 *
 * Why the summary is its own view and not part of the list:
 *   The list's job is "render these tasks." The summary's job is "say
 *   what the query matched." Those are different concerns, and mixing
 *   them would make the list know about the query — which the list has
 *   no other reason to know. The list stays query-agnostic; the search
 *   view owns the query's presentation.
 *
 * Why the empty state is the list's job, not the search view's:
 *   When the query matches nothing, the search view still renders a
 *   summary ("0 results for 'crater'") and passes the empty array to
 *   the list. The list is the layer that decides "empty array means
 *   show the empty state," and it does so with the reason
 *   `'no-results'` because it received an empty array from the search
 *   path. The search view does not reach into the list's output; it
 *   composes the list's output into its own.
 *
 * @module views/search
 */

import { el } from '../utils/dom.js';

/**
 * Render the search results: a summary line plus the list of matching
 * tasks.
 *
 * @param {{
 *   query: string,
 *   tasks: ReadonlyArray<object>,
 *   renderTaskList: (tasks: ReadonlyArray<object>) => Node,
 * }} params
 * @returns {HTMLElement}
 *
 * The `renderTaskList` parameter is injected rather than imported. This
 * keeps the dependency arrow pointing the same way as everywhere else
 * in the view layer: a view receives what it renders, not the module
 * that produces it. The caller (the dashboard's filled wrapper) owns
 * the composition, and the search view does not have to know that the
 * list exists as a module — only that something can produce the list's
 * node.
 *
 * The injected function is not the store. It is the list view. The
 * search view renders the list of matches; it does not fetch them. If
 * the search view fetched from the store, it would have to re-fetch on
 * every render, and the store would have to know about the query —
 * which is exactly the coupling the rendering contract forbids.
 */
export function renderSearchResults({ query, tasks, renderTaskList }) {
  const trimmedQuery = typeof query === 'string' ? query.trim() : '';
  const count = tasks.length;
  const plural = count === 1 ? 'result' : 'results';

  let summary;
  if (trimmedQuery === '') {
    const noun = count === 1 ? 'task' : 'tasks';
    summary = `Showing all ${count} ${noun}`;
  } else {
    summary = `${count} ${plural} for "${trimmedQuery}"`;
  }

  return el('div', {
    class: 'search-results',
    // No data-region here. The container that holds this <div> is
    // [data-region="search-results"] (owned by the dashboard); this
    // <div> is its content. The class carries the identity.
  }, [
    el('p', {
      class: 'search-results__summary',
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    }, summary),

    // The list is rendered by the injected function. The search view
    // does not inspect its output, does not wrap it, does not modify
    // it. The list's output replaces the previous list in the container
    // the caller provided. This is the composition rule: the search
    // view composes, it does not modify.
    renderTaskList(tasks),
  ]);
}