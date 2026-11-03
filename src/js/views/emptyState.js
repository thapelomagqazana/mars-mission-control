/**
 * Empty-state view — renders the message shown when a list has no items.
 *
 * Card 3 of the rendering contract. The empty state is what a list looks
 * like when it has nothing to show. The list renders it in place of the
 * `<ul>`; the dashboard does not know about it, because the dashboard
 * does not know whether an empty list means "the store is empty" or "the
 * search matched nothing" — but the list does, because it received the
 * array, and the search view does, because it knows the query. The empty
 * state takes the *reason* as its input so it can say the right thing.
 *
 * Why the reason matters:
 *   An empty list caused by "there are no tasks yet" needs a different
 *   message than an empty list caused by "your search matched nothing."
 *   The first says "create your first task"; the second says "try a
 *   different search." Both are empty states; both look the same; only
 *   the message differs. A view that guessed would guess wrong half the
 *   time, and the wrong message is worse than no message — "Create your
 *   first task" shown to a user whose search has no matches is confusing,
 *   not helpful.
 *
 * What the empty state owns:
 *   The `<div data-region="empty">` and everything inside it. The
 *   container is created fresh on every render, so the empty state can
 *   be replaced with a fresh empty state (different reason) or with a
 *   list (tasks exist). The list's region is the same in both cases;
 *   the empty state and the list are two renderings of the same region.
 *
 * @module views/emptyState
 */

import { el } from '../utils/dom.js';

/**
 * Render the empty state for the given reason.
 *
 * @param {'no-tasks' | 'no-results'} reason
 * @returns {HTMLElement}
 *
 * The two reasons are the only two states in which the list can be
 * empty. If a third state ever appears (e.g. "storage unavailable"),
 * that is a contract change and a new reason — not a message change on
 * an existing reason. The narrow union is deliberate: it makes a new
 * state a visible code change rather than a string the caller happened
 * to pass.
 */
export function renderEmptyState(reason) {
  if (reason === 'no-results') {
    return renderNoResults();
  }
  // Default to 'no-tasks' for any other reason. This is a deliberate
  // fallback: if a caller passes an unexpected value, the view shows
  // the more general message rather than throwing. A throw from a
  // render function is worse than a slightly wrong message, because a
  // throw breaks the whole render tree and the user sees nothing. The
  // contract tests assert the two valid reasons produce the correct
  // messages; the fallback only catches the case where a caller has
  // a bug, and showing the general message is the least-bad response.
  return renderNoTasks();
}

/**
 * The "the store is empty" empty state.
 *
 * The call to action is "Create your first task" because that is
 * exactly what the user can do. The message names the concept
 * ("tasks") so a first-time user knows what will appear here.
 *
 * @returns {HTMLElement}
 */
function renderNoTasks() {
  return el('div', {
    class: 'empty-state empty-state--no-tasks',
    dataset: { region: 'empty', reason: 'no-tasks' },
    role: 'status',
  }, [
    el('p', { class: 'empty-state__heading' }, 'No tasks yet'),
    el('p', { class: 'empty-state__body' }, 'Mission tasks will appear here once they are created.'),
    el('button', {
      type: 'button',
      class: 'empty-state__action',
      dataset: { action: 'open-create-dialog' },
    }, 'Create your first task'),
  ]);
}

/**
 * The "the search matched nothing" empty state.
 *
 * The call to action is "Clear search" because the user's current query
 * is why the list is empty. The message names the query so the user
 * knows which search produced no results — helpful when they have
 * several windows open or several searches in memory.
 *
 * The query is not passed to this view. The view shows the *generic*
 * "clear your search" message rather than repeating the query, because
 * the query may be long and the message would wrap awkwardly. The
 * search-results view (Card 6) is the one that shows the query in its
 * summary line; the empty state shows the resolution. Two views, two
 * jobs, no overlap.
 *
 * @returns {HTMLElement}
 */
function renderNoResults() {
  return el('div', {
    class: 'empty-state empty-state--no-results',
    dataset: { region: 'empty', reason: 'no-results' },
    role: 'status',
  }, [
    el('p', { class: 'empty-state__heading' }, 'No matching tasks'),
    el('p', { class: 'empty-state__body' }, 'No tasks match your current search.'),
    el('button', {
      type: 'button',
      class: 'empty-state__action',
      dataset: { action: 'clear-search' },
    }, 'Clear search'),
  ]);
}