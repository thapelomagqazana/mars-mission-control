/**
 * Task list view — renders the task-area container, and its content.
 *
 * The list takes an array of tasks and returns the task-area container,
 * populated with either:
 *   - a `<ul>` with one `<li>` per task, each wrapping a card, or
 *   - the empty state, when the array is empty.
 *
 * The container is the same element in both cases.
 *
 * What the list owns:
 *   The task-area container (a `<div class="task-area-container">`)
 *   and, when populated, the `<ul>` and its `<li>` wrappers. The
 *   card's contents are owned by `renderTaskCard`; the list does not
 *   reach inside them.
 *
 *   The container carries:
 *     - id="dashboard-list"             — the selector register's id
 *     - data-region="list"              — the region name
 *     - data-cy="dashboard-list"        — the test-selector contract
 *     - data-listener="task-actions"    — the delegation boundary
 *
 *   The `<ul>` carries:
 *     - class="task-list"
 *     - data-region="task-list"         — the `<ul>`'s role as a list
 *     - data-cy="task-list"             — the register's selector
 *
 *   Each `<li>` carries:
 *     - class="task-list__item"
 *     - data-task-id="<id>"             — the row's identity
 *     - data-cy="task-list__item"       — the register's selector
 *
 * Deterministic Ordering:
 *   The list renders tasks in a declared order so that two renders of
 *   the same data produce the exact same DOM. This is the property that
 *   keeps downstream comparisons — reload fidelity checks, Cypress
 *   assertions, visual regressions — from being a coin flip.
 *
 *   The rule: **newest first, tie-broken by title A–Z, then by ID**.
 *   - Newest first: the task you just added is the one you are most
 *     likely to act on.
 *   - Title A–Z: if two tasks share a timestamp, they need a secondary
 *     order.
 *   - ID: the final tie-breaker ensures the order is *total*. Even if
 *     two tasks have identical titles and timestamps, their unique IDs
 *     guarantee a stable sort.
 *
 * @module views/taskList
 */

import { el } from '../utils/dom.js';
import { renderTaskCard } from './taskCard.js';
import { renderEmptyState } from './emptyState.js';

export const TASK_AREA_REGION = 'list';
export const TASK_AREA_ID = 'dashboard-list';
export const TASK_AREA_DATA_CY = 'dashboard-list';
export const TASK_ACTIONS_LISTENER = 'task-actions';

/**
 * Render the task-area container, populated with the current tasks or
 * the empty state.
 *
 * @param {ReadonlyArray<object>} tasks - the tasks to render
 * @param {{ emptyReason?: 'no-tasks' | 'no-results' }} [options]
 * @returns {HTMLElement}
 */
export function renderTaskList(tasks, options = {}) {
  const emptyReason = options.emptyReason || 'no-tasks';
  
  // Apply the deterministic order before rendering.
  const orderedTasks = orderTasks(tasks);

  const container = el('div', {
    class: 'task-area-container',
    id: TASK_AREA_ID,
    dataset: {
      region: TASK_AREA_REGION,
      cy: TASK_AREA_DATA_CY,
      listener: TASK_ACTIONS_LISTENER,
    },
  });

  if (orderedTasks.length === 0) {
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
    }, orderedTasks.map((task) =>
      el('li', {
        class: 'task-list__item',
        dataset: {
          taskId: String(task.id),
          cy: 'task-list__item',
        },
      }, renderTaskCard(task))
    ))
  );
  
  return container;
}

/**
 * Order the tasks deterministically.
 *
 * This function creates a shallow copy of the array before sorting.
 * A view that mutates its input is a view that cannot be safely
 * re-run, and re-runnability is the determinism contract.
 *
 * @param {ReadonlyArray<object>} tasks
 * @returns {Array<object>}
 */
function orderTasks(tasks) {
  const copy = Array.isArray(tasks) ? tasks.slice() : [];
  copy.sort(compareTasks);
  return copy;
}

/**
 * The comparator for the declared ordering rule.
 *
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function compareTasks(a, b) {
  // 1. Newest first (createdAt descending).
  const timeA = parseTime(a.createdAt);
  const timeB = parseTime(b.createdAt);
  if (timeA !== timeB) {
    return timeB - timeA;
  }

  // 2. Title A–Z (ascending).
  const titleA = typeof a.title === 'string' ? a.title : '';
  const titleB = typeof b.title === 'string' ? b.title : '';
  if (titleA !== titleB) {
    return titleA < titleB ? -1 : 1;
  }

  // 3. ID (ascending, final tie-breaker).
  const idA = typeof a.id === 'string' ? a.id : '';
  const idB = typeof b.id === 'string' ? b.id : '';
  if (idA !== idB) {
    return idA < idB ? -1 : 1;
  }

  return 0;
}

/**
 * Safely parse an ISO timestamp into a number.
 * Malformed or missing timestamps default to 0 (which sorts last
 * in a descending order).
 *
 * @param {unknown} value
 * @returns {number}
 */
function parseTime(value) {
  if (typeof value !== 'string') return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}