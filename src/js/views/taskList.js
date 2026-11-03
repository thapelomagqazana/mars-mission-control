/**
 * Task list view — renders a list of task cards, or the empty state.
 *
 * Card 2 of the rendering contract. The list takes an array of tasks and
 * returns either:
 *   - a `<ul>` with one `<li>` per task, each wrapping a card, or
 *   - the empty state, when the array is empty.
 *
 * What the list owns:
 *   The `<ul>` element and its `<li>` wrappers. The card's contents are
 *   owned by `renderTaskCard`; the list does not reach inside them.
 *
 * What the list does not do:
 *   - It does not read from `taskStore`. The tasks are passed in.
 *   - It does not filter. The filtering happened before the call; the
 *     list renders what it was given.
 *   - It does not attach listeners per card. Events are delegated from
 *     the list container. A card with its own listener would leak one
 *     listener per render; delegation attaches one listener for the
 *     list's lifetime.
 *   - It does not decide between "no tasks" and "no results." The
 *     empty state takes a `reason`; the list passes `'no-tasks'` because
 *     the list's job is "render this array," and an empty array from
 *     the list's caller means "the store is empty" — the caller that
 *     wants `'no-results'` (the search results view) passes the empty
 *     array to the same list, but the reason comes from the search
 *     context, not the list.
 *
 * A note on the empty-state reason:
 *   The list is called from two places:
 *     1. The dashboard's filled wrapper, with the full task list.
 *     2. The search results view, with the filtered list.
 *
 *   In case 1, an empty array means "no tasks exist."
 *   In case 2, an empty array means "no search results."
 *
 *   Both cases call `renderTaskList`, and both want a different empty
 *   state reason. The list cannot know which case it is in, because it
 *   only received an array.
 *
 *   The resolution is a second parameter: `renderTaskList(tasks,
 *   { emptyReason })`. The default is `'no-tasks'` because that is the
 *   more common case, and a caller that wants the other behaviour opts
 *   in explicitly. The parameter is part of the card's contract — it is
 *   named in the card, not invented at the call site.
 *
 * @module views/taskList
 */

import { el } from '../utils/dom.js';
import { renderTaskCard } from './taskCard.js';
import { renderEmptyState } from './emptyState.js';

/**
 * Render a list of tasks, or the empty state if the list is empty.
 *
 * @param {ReadonlyArray<object>} tasks - the tasks to render
 * @param {{ emptyReason?: 'no-tasks' | 'no-results' }} [options]
 * @returns {HTMLElement}
 *
 * The return value is either a `<ul>` or the empty-state `<div>`. The
 * caller (the dashboard or the search results view) places it in the
 * region it owns. The list does not know which region it is being
 * placed in; it just produces the right node.
 */
export function renderTaskList(tasks, options = {}) {
  const emptyReason = options.emptyReason || 'no-tasks';

  if (tasks.length === 0) {
    return renderEmptyState(emptyReason);
  }

  return el('ul', {
    class: 'task-list',
    dataset: { region: 'task-list' },
  }, tasks.map((task) =>
    el('li', {
      class: 'task-list__item',
      dataset: { taskId: task.id },
    }, renderTaskCard(task))
  ));
}