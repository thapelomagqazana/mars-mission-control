/**
 * Task list view — renders the task-area container, and its content.
 *
 * Card 2 of the rendering contract. The list takes an array of tasks and
 * returns the task-area container, populated with either:
 *   - a `<ul>` with one `<li>` per task, each wrapping a card, or
 *   - the empty state, when the array is empty.
 *
 * The container is the same element in both cases.
 *   [unchanged from the previous delivery — see that file for the full
 *    rationale on why the container is stable across renders and why
 *    the empty state is content, not a replacement.]
 *
 * What the list owns:
 *   The task-area container (a `<div class="task-area-container">`)
 *   and, when populated, the `<ul>` and its `<li>` wrappers. The
 *   card's contents are owned by `renderTaskCard`; the list does not
 *   reach inside them.
 *
 *   The container carries:
 *     - id="dashboard-list"             — the selector register's id
 *     - data-region="list"              — the region name (matches the
 *                                          grid area and region map)
 *     - data-cy="dashboard-list"        — the test-selector contract
 *     - data-listener="task-actions"    — the delegation boundary the
 *                                          event layer attaches its
 *                                          click listener to
 *
 *   The `data-listener` attribute is the *event-layer* contract, not a
 *   region attribute. It marks the well as the element the event layer
 *   delegates `[data-action]` clicks from — stable across renders, so
 *   the delegated listener does not need re-attaching when the
 *   container's content is replaced. A future change that added a
 *   second action-bearing region (say, a card-level action menu) would
 *   add its own `data-listener` attribute, and the event layer would
 *   attach a listener to it.
 *
 *   The `<ul>` carries:
 *     - class="task-list"
 *     - data-region="task-list"         — the `<ul>`'s role *as a list*,
 *                                          distinct from the container's
 *                                          role as the region. A test
 *                                          that wants "the list of tasks"
 *                                          queries this attribute.
 *     - data-cy="task-list"             — the register's selector for
 *                                          the `<ul>` (used by tests
 *                                          that want the list, not the
 *                                          region)
 *
 *   Each `<li>` carries:
 *     - class="task-list__item"
 *     - data-task-id="<id>"             — the row's identity, matched
 *                                          by the event layer's
 *                                          delegation (a click on the
 *                                          card's action finds the
 *                                          closest `[data-task-id]`)
 *     - data-cy="task-list__item"       — the register's selector for
 *                                          list items (useful for tests
 *                                          that count rows without
 *                                          caring about card contents)
 *
 * What the list does not do:
 *   [unchanged from the previous delivery — the list does not read
 *    from the store, does not filter, does not attach listeners per
 *    card, does not decide between "no tasks" and "no results."]
 *
 * A note on the empty-state reason:
 *   [unchanged from the previous delivery — `emptyReason` is the
 *    parameter that lets the search-results view ask for
 *    'no-results' while the dashboard's filled render uses the default
 *    'no-tasks'.]
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
 * The delegation boundary attribute. The event layer's `attachListeners`
 * queries `[data-listener="task-actions"]` to find the element it
 * should attach its delegated click listener to. The attribute is
 * exported so a test can query it by the same constant the view
 * writes — the test and the view name the same boundary.
 *
 * A future change that added a second action-bearing region (say, a
 * card-level action menu separate from the current edit/delete
 * buttons) would add a *different* `data-listener` value on its
 * container, and the event layer would add a listener for it. One
 * `data-listener` value per delegation boundary keeps the event
 * layer's wiring legible.
 */
export const TASK_ACTIONS_LISTENER = 'task-actions';

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
 *   [unchanged from the previous delivery — a `<ul>` cannot contain the
 *    empty state, because the content model of `<ul>` is `<li>`. The
 *    container is a `<div>` that holds either content.]
 *
 * Why the `<ul>` carries `data-region="task-list"` even when the
 * container carries `data-region="list"`:
 *   [unchanged from the previous delivery — the two regions are
 *    different things: the container is the region the UI checklist
 *    names; the `<ul>` is one possible content of that container.]
 *
 * Why the container carries `data-listener="task-actions"`:
 *   The event layer needs a stable element to attach its delegated
 *   click listener to. The container is that element — its content
 *   is replaced on each render, but the container itself is re-created
 *   (by this function) only once per render. Attaching the listener
 *   to the container means:
 *
 *     - The listener is attached once per render (not once per card).
 *     - A future change to the card's internals (adding a button,
 *       reordering fields) does not break the delegation — the
 *       listener matches `[data-action]` descendants regardless of
 *       what the card contains.
 *     - The listener is attached to an element that exists *before*
 *       the cards are placed inside it, so there is no race between
 *       "cards rendered" and "listener attached."
 *
 *   The `data-listener` attribute is *not* a region attribute. It is
 *   a *delegation* attribute — it says "the event layer listens here."
 *   A future reader who wants to find every delegation boundary in the
 *   app greps for `data-listener` and finds them; a reader who wants
 *   to find every region greps for `data-region` and finds those. Two
 *   concepts, two attributes.
 */
export function renderTaskList(tasks, options = {}) {
  const emptyReason = options.emptyReason || 'no-tasks';

  const container = el('div', {
    class: 'task-area-container',
    id: TASK_AREA_ID,
    dataset: {
      region: TASK_AREA_REGION,
      cy: TASK_AREA_DATA_CY,
      listener: TASK_ACTIONS_LISTENER,
    },
  });

  if (tasks.length === 0) {
    container.appendChild(renderEmptyState(emptyReason));
    return container;
  }

  container.appendChild(
    el('ul', {
      class: 'task-list',
      dataset: {
        region: 'task-list',
        cy: 'task-list',
      },
    }, tasks.map((task) =>
      el('li', {
        class: 'task-list__item',
        dataset: {
          taskId: task.id,
          cy: 'task-list__item',
        },
      }, renderTaskCard(task))
    ))
  );
  return container;
}