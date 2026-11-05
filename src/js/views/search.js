/**
 * Search results view — renders the summary line for the current query
 * and the list of matching tasks.
 *
 * [the delivered file's header comment — including the ownership split
 *  with the dashboard's search-results region, the "why the summary is
 *  its own view" rationale, and the "why the empty state is the list's
 *  job" section — is preserved. See the previous delivery for the full
 *  reasoning.]
 *
 * The empty reason
 *   The search view passes `emptyReason` to the list, because the list
 *   is the layer that decides *which* empty state to render (no-tasks
 *   vs. no-results) when the tasks array is empty. The search view
 *   knows the query matched nothing; the list knows how to render that
 *   state; the search view tells the list, so the list can say the
 *   right thing.
 *
 *   The delivered version of this file called `renderTaskList(tasks)`
 *   with no options, so the list fell back to its default
 *   `emptyReason: 'no-tasks'` — meaning a search that matched nothing
 *   showed "No tasks yet," which is false: the user has tasks; the
 *   search just excludes them. The fix threads `emptyReason` through
 *   this view's input. The app layer supplies the value; the search
 *   view forwards it; the list reads it and renders accordingly.
 *
 *   A future change that wanted the search view to be used as a
 *   non-search renderer (e.g. as the dashboard's filled renderer for
 *   the unfiltered list) would pass `'no-tasks'` and the search view
 *   would forward it the same way. The default `'no-results'` is
 *   because the search view's natural state — the state in which it
 *   appears at all — is "a query is active." A caller who wants the
 *   other state says so explicitly.
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
 *   emptyReason?: 'no-tasks' | 'no-results',
 *   renderTaskList: (
 *     tasks: ReadonlyArray<object>,
 *     options?: { emptyReason?: 'no-tasks' | 'no-results' }
 *   ) => Node,
 * }} params
 * @returns {HTMLElement}
 *
 * The `renderTaskList` parameter is injected rather than imported.
 * This keeps the dependency arrow pointing the same way as everywhere
 * else in the view layer: a view receives what it renders, not the
 * module that produces it. The caller (the dashboard's filled wrapper,
 * via the app layer) owns the composition; the search view does not
 * have to know that the list exists as a module — only that something
 * can produce the list's node, and that the something accepts the
 * list's options.
 *
 * The injected function is not the store. It is the list view. The
 * search view renders the list of matches; it does not fetch them. If
 * the search view fetched from the store, it would have to re-fetch on
 * every render, and the store would have to know about the query —
 * which is exactly the coupling the rendering contract forbids.
 */
export function renderSearchResults({
  query,
  tasks,
  emptyReason = 'no-results',
  renderTaskList,
}) {
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

    // The list is rendered by the injected function, with the empty
    // reason forwarded. The search view does not inspect the list's
    // output, does not wrap it, does not modify it — the list's
    // output replaces the previous list in the container the caller
    // provided. This is the composition rule: the search view
    // composes, it does not modify.
    //
    // The `emptyReason` is what makes the empty state honest. A list
    // that knows it was called from the search path (because the
    // search view told it) renders the no-results state; a list that
    // was called with `emptyReason: 'no-tasks'` renders the
    // no-tasks state. Two reasons, two messages, one list.
    renderTaskList(tasks, { emptyReason }),
  ]);
}