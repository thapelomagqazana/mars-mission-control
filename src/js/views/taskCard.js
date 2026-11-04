/**
 * Task card view — renders one task as a card.
 *
 * What the card owns:
 *   The `<article>` wrapper and every element inside it. The card is a
 *   pure display component: it receives a task object and returns a DOM
 *   node. It does not read from the store, it does not validate input,
 *   and it does not attach event listeners (the list handles delegation).
 *
 * The card's attributes, and why each exists:
 *   - class="task-card"
 *     The styling hook. A CSS rule targets this; a future visual change
 *     edits the CSS, not the markup.
 *   - data-task-id="<id>"
 *     The row's identity, used by the event layer's delegation (a click
 *     finds the closest `[data-task-id]`) and by tests that want to assert
 *     on a specific task.
 *   - data-cy="task-card"
 *     The card's role for tests (e.g., counting visible cards).
 *
 * Per-field selectors:
 *   Every field inside the card has its own `data-cy`. This means a test
 *   that wants to assert "the title of the card is X" can target
 *   `[data-cy="task-card-title"]` without relying on CSS classes or DOM
 *   position. The selectors are defined in `TASK_CARD_SELECTORS` below.
 *
 * Security (The Escaping Boundary):
 *   Every user-supplied string (title, description, creator, assignee)
 *   is passed as a child to `el()`. The `el` helper uses
 *   `document.createTextNode`, which treats the string as literal text.
 *   No `innerHTML` is used. An XSS payload renders as a string, not code.
 *
 * Accessibility:
 *   The action buttons include the task title in their `aria-label`
 *   (e.g., "Edit task: Check hull"). A screen-reader user hearing "Edit"
 *   repeated five times in a list would not know which task each button
 *   applies to. The title disambiguates them.
 *
 * @module views/taskCard
 */

import { el } from '../utils/dom.js';

/**
 * The task card's contracted `data-cy` values.
 *
 * Exported so tests can reference the exact same strings the view writes.
 * The naming convention follows the register: `task-card-<field>`.
 */
export const TASK_CARD_SELECTORS = Object.freeze({
  card: 'task-card',
  title: 'task-card-title',
  description: 'task-card-description',
  creator: 'task-card-creator',
  assignee: 'task-card-assignee',
  createdAt: 'task-card-created',
  edit: 'task-card-edit',
  delete: 'task-card-delete',
});

/**
 * Render a single task as a card.
 *
 * @param {{
 *   id: string,
 *   title: string,
 *   description: string,
 *   creator: string,
 *   assignee: string,
 *   createdAt: string,
 * }} task
 * @returns {HTMLElement}
 */
export function renderTaskCard(task) {
  // A description is "present" only if it contains non-whitespace
  // characters. A description of "   " is treated exactly like "".
  const description = normaliseText(task.description);
  const hasDescription = description.length > 0;

  return el('article', {
    class: 'task-card',
    dataset: {
      taskId: String(task.id),
      cy: TASK_CARD_SELECTORS.card,
    },
  }, [
    el('h2', {
      class: 'task-card__title',
      dataset: { cy: TASK_CARD_SELECTORS.title },
    }, normaliseText(task.title)),

    // If the description is empty/whitespace, the element is omitted
    // entirely. Rendering an empty <p> leaves an unexplained gap in the
    // layout. Hiding it is the honest representation of "no description".
    hasDescription
      ? el('p', {
          class: 'task-card__description',
          dataset: { cy: TASK_CARD_SELECTORS.description },
        }, description)
      : null,

    el('dl', { class: 'task-card__meta' }, [
      el('dt', { class: 'task-card__meta-label' }, 'Creator'),
      el('dd', {
        class: 'task-card__meta-value',
        dataset: { cy: TASK_CARD_SELECTORS.creator },
      }, normaliseText(task.creator)),

      el('dt', { class: 'task-card__meta-label' }, 'Assignee'),
      el('dd', {
        class: 'task-card__meta-value',
        dataset: { cy: TASK_CARD_SELECTORS.assignee },
      }, normaliseText(task.assignee)),

      el('dt', { class: 'task-card__meta-label' }, 'Created'),
      el('dd', {
        class: 'task-card__meta-value',
        dataset: { cy: TASK_CARD_SELECTORS.createdAt },
      }, formatCreatedAt(task.createdAt)),
    ]),

    el('div', { class: 'task-card__actions' }, [
      el('button', {
        type: 'button',
        class: 'task-card__action task-card__action--edit',
        dataset: {
          action: 'edit-task',
          taskId: String(task.id),
          cy: TASK_CARD_SELECTORS.edit,
        },
        'aria-label': `Edit task: ${normaliseText(task.title)}`,
      }, 'Edit'),

      el('button', {
        type: 'button',
        class: 'task-card__action task-card__action--delete',
        dataset: {
          action: 'delete-task',
          taskId: String(task.id),
          cy: TASK_CARD_SELECTORS.delete,
        },
        'aria-label': `Delete task: ${normaliseText(task.title)}`,
      }, 'Delete'),
    ]),
  ]);
}

/**
 * Normalise a field to a display string.
 *
 * `trim()` collapses the whitespace-only case to '' — which the card
 * then treats as absent. This is deliberate: a description of three
 * spaces is indistinguishable from no description to a reader, so the
 * DOM should not carry a difference the reader cannot see.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normaliseText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Format an ISO 8601 timestamp for display.
 *
 * `Intl.DateTimeFormat` is used rather than `toLocaleString()` so the
 * output is stable across environments. A locale-sensitive default can
 * change between a developer's browser and CI, turning a display change
 * into a test failure. The `dateStyle: 'medium'` and `timeStyle: 'short'`
 * options produce a consistent, readable format (e.g., "Nov 3, 2026,
 * 2:00 PM").
 *
 * If the timestamp is malformed or missing, the raw value is returned
 * rather than throwing. A card that cannot render because its timestamp
 * is odd is a worse failure than a card that shows the odd timestamp.
 *
 * @param {string} isoString
 * @returns {string}
 */
function formatCreatedAt(isoString) {
  if (typeof isoString !== 'string') return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    // Fallback in case `Intl` is unavailable (e.g., very old environments)
    return isoString;
  }
}