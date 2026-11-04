/**
 * Task list view — renders the task-area container, and its content.
 *
 * Card 2 of the rendering contract. The list takes an array of tasks and
 * returns the task-area container, populated with either:
 *   - a `<ul>` with one `<li>` per task, each wrapping a card, or
 *   - the empty state, when the array is empty.
 *
 * The container is the same element in both cases.
 *   The task-area container is not replaced by the empty state — and it
 *   is not replaced by the list. The container is stable across renders;
 *   its content (a `<ul>` or the empty state) is what changes. This is
 *   the "no throwaway placeholder" rule made structural: Phase 6's
 *   update mechanism calls `renderTaskList(tasks)` on every render — an
 *   empty array produces the empty state; a non-empty array produces
 *   the list. Same function, same container, same attributes.
 *
 *   The anti-pattern this shape avoids:
 *     The common pattern is "render a placeholder element that looks
 *     like the list, then replace it with the real list when data
 *     arrives." The placeholder and the real list are separate DOM
 *     shapes; a change to one does not affect the other, so the two
 *     drift. The placeholder is also throwaway code — its attributes,
 *     styles, and accessibility guarantees are unrelated to the real
 *     list's, so when the real list arrives, all of the placeholder's
 *     choices are up for revision.
 *
 *   The alternative (this file's shape):
 *     The container is the render target. The empty state is a normal
 *     render of the container with zero items — the same shape the
 *     populated list uses, with different children. The container's
 *     identity (region, id, data-cy) is preserved across renders;
 *     only the container's content changes.
 *
 * What the list owns:
 *   The task-area container (a `<div class="task-area-container">`)
 *   and, when populated, the `<ul>` and its `<li>` wrappers. The
 *   card's contents are owned by `renderTaskCard`; the list does not
 *   reach inside them.
 *
 *   The `<ul>` carries `data-region="task-list"` — a name that
 *   describes the `<ul>`'s role as a list, distinct from the
 *   container's role as the region. The two regions are different
 *   because the two elements are different: the container is the
 *   region the UI checklist names ("task area"); the `<ul>` is one
 *   possible content of that container (a list of tasks).
 *
 * What the list does not do:
 *   - It does not read from `taskStore`. The tasks are passed in.
 *   - It does not filter. The filtering happened before the call; the
 *     list renders what it was given.
 *   - It does not attach listeners per card. Events are delegated from
 *     the content region (the dashboard's `[data-region="content"]`
 *     ancestor); the event layer attaches one listener for that region
 *     and matches `[data-action]` descendants. The list does not need
 *     its own listener.
 *   - It does not decide between "no tasks" and "no results." The
 *     empty state takes a `reason`; the list passes `'no-tasks'`
 *     because the list's job is "render this array," and an empty
 *     array from the list's caller means "the store is empty" — the
 *     caller that wants `'no-results'` (the search results view)
 *     passes the empty array to the same list, but the reason comes
 *     from the search context, not the list.
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
 *   in explicitly. The parameter is part of the card's contract — it
 *   is named in the card, not invented at the call site.
 *
 * @module views/taskList
 */

import { el } from '../utils/dom.js';
import { renderTaskCard } from './taskCard.js';
import { renderEmptyState } from './emptyState.js';

/**
 * The task-area container's contract.
 *
 * Exported so a test, the region map, and the CSS grid-area name all
 * reference the same values. The values follow the "dashboard-<region>"
 * convention.
 *
 * The container's region name is "list" — matching the UI checklist's
 * "task area" and the grid's area name. This is not the same as the
 * `<ul>`'s `data-region="task-list"`: the `<ul>` is a list-of-tasks
 * (a specific content shape); the container is the region (the slot
 * the UI checklist names). A future change that wanted the `<ul>` to
 * carry the region instead of the container would put the region on
 * one of the container's two possible contents, which would make the
 * region's identity depend on which content was rendered — the wrong
 * shape.
 */
export const TASK_AREA_REGION = 'list';
export const TASK_AREA_ID = 'dashboard-list';
export const TASK_AREA_DATA_CY = 'dashboard-list';

/**
 * Render the task-area container, populated with the current tasks or
 * the empty state.
 *
 * @param {ReadonlyArray<object>} tasks - the tasks to render
 * @param {{ emptyReason?: 'no-tasks' | 'no-results' }} [options]
 * @returns {HTMLElement}
 *
 * The return value is the *container* (a `<div class="task-area-container">`)
 * wrapping either a `<ul>` or the empty state. The container is the
 * element the selector register names, the accessibility anchor points
 * at, and the event layer's delegation targets. The content inside the
 * container is replaced on each render; the container itself persists
 * across renders as a stable element.
 *
 * Why the container is not just the `<ul>`:
 *   A `<ul>` cannot contain the empty state (a `<div>`), because the
 *   content model of `<ul>` is `<li>`. The empty state would have to
 *   be a `<li>` — a card-shaped empty state pretending to be a list
 *   item. That is the wrong shape: the empty state is not a task, it
 *   is the absence of tasks. Putting it in a `<div>` container next to
 *   the `<ul>` (mutually exclusive) is the correct structure: the
 *   container is a task area that currently contains a `<ul>` or the
 *   empty state.
 *
 *   A future change that wanted the container to be a `<ul>` *and* the
 *   empty state to be a `<li>` would be a structural change — and
 *   would need to answer "why is the empty state a list item?" The
 *   current structure says "the empty state is not a task"; that is
 *   the answer.
 *
 * Why the `<ul>` carries `data-region="task-list"` even when the
 * container carries `data-region="list"`:
 *   The two regions are different things. The container is the region
 *   the UI checklist names ("task area"); the `<ul>` is one possible
 *   content of that container (a list of tasks). The `<ul>`'s
 *   `data-region="task-list"` names the `<ul>`'s role *as a list* —
 *   which is why a test that wants to find "the list of tasks" can
 *   query `[data-region="task-list"]` and get the `<ul>` (when it
 *   exists), independent of the container. The container's
 *   `data-region="list"` names the container's role *as the region*.
 *   Two elements, two regions, two roles.
 *
 *   The `data-region="task-list"` on the `<ul>` is preserved from the
 *   previous delivery — a test that targeted the `<ul>` by its region
 *   continues to work. The container is an addition, not a rename.
 */
export function renderTaskList(tasks, options = {}) {
  const emptyReason = options.emptyReason || 'no-tasks';

  const container = el('div', {
    class: 'task-area-container',
    id: TASK_AREA_ID,
    dataset: {
      region: TASK_AREA_REGION,
      cy: TASK_AREA_DATA_CY,
    },
  });

  if (tasks.length === 0) {
    container.appendChild(renderEmptyState(emptyReason));
    return container;
  }

  container.appendChild(
    el('ul', {
      class: 'task-list',
      dataset: { region: 'task-list' },
    }, tasks.map((task) =>
      el('li', {
        class: 'task-list__item',
        dataset: { taskId: task.id },
      }, renderTaskCard(task))
    ))
  );
  return container;
}