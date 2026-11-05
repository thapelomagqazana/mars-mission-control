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
 *     finds the closest `[data-task-id]`) and by tests that want to
 *     assert on a specific task.
 *   - data-cy="task-card"
 *     The card's role for tests (e.g., counting visible cards).
 *
 * Per-field selectors:
 *   Every field inside the card has its own `data-cy`. This means a test
 *   that wants to assert "the title of the card is X" can target
 *   `[data-cy="task-card-title"]` without relying on CSS classes or DOM
 *   position. The selectors are defined in `TASK_CARD_SELECTORS` below.
 *
 * Per-action selectors:
 *   The edit and delete buttons each carry their own `data-cy`. The
 *   event layer's delegation does not use them (it matches
 *   `[data-action]`), but tests do — a test that wants "the delete
 *   button for the Survey crater task" targets the card by
 *   `data-task-id`, then the button by `data-cy="task-card-delete"`.
 *   Two selectors, two concepts, one query.
 *
 * Security (The Escaping Boundary):
 *   Every user-supplied string (title, description, creator, assignee)
 *   is passed as a child to `el()`. The `el` helper uses
 *   `document.createTextNode`, which treats the string as literal text.
 *   No `innerHTML` is used. An XSS payload renders as a string, not
 *   code.
 *
 *   The `aria-label` on the edit and delete buttons interpolates the
 *   task title. It is passed as an attribute *value* via
 *   `setAttribute`, which does not execute. A title of
 *   `<script>alert(1)</script>` becomes a literal string in the
 *   attribute; a screen reader reads it as text. The same escaping
 *   discipline applies to text children and to attribute values —
 *   both are inert.
 *
 * Accessibility:
 *   The action buttons include the task title in their `aria-label`
 *   (e.g., "Edit task: Check hull"). A screen-reader user hearing
 *   "Edit" repeated five times in a list would not know which task
 *   each button applies to. The title disambiguates them.
 *
 *   The task title's `h2` is the primary landmark within the card; a
 *   future change that added a card-level link or a card-level action
 *   should reference it via `aria-labelledby` if the action's label
 *   would otherwise be ambiguous.
 *
 * The delete workflow's requirements on this card:
 *   1. The delete button carries `data-task-id` — the value the
 *      delegation reads as the target. (Implemented; the value
 *      matches the card's own `data-task-id`.)
 *   2. The delete button carries `data-action="delete-task"` — the
 *      dispatch key the app matches. (Implemented.)
 *   3. The delete button is a real `<button type="button">` — not a
 *      styled `<a>` or `<div>` — so it is focusable, keyboard-
 *      activatable, and announced as a button. (Implemented; the
 *      `type="button"` matters because a future change that wrapped
 *      the actions in a `<form>` would otherwise make this button
 *      submit the form.)
 *   4. The delete button's accessible name includes the task title,
 *      so a screen-reader user navigating a list of Delete buttons
 *      can distinguish them. (Implemented; the `aria-label` is
 *      `Delete task: <title>`.)
 *   5. The delete button carries a per-action `data-cy` so tests
 *      can target it. (Implemented; `TASK_CARD_SELECTORS.delete`.)
 *
 * @module views/taskCard
 */

import { el } from '../utils/dom.js';

/**
 * The task card's contracted `data-cy` values.
 *
 * Exported so tests can reference the exact same strings the view
 * writes. The naming convention follows the register:
 * `task-card-<field>` for user fields, `task-card-<action>` for
 * actions.
 *
 * A future change that renamed a selector (e.g., `'task-card-edit'`
 * → `'edit-button'`) would be a change to this constant AND to
 * every test that queries `[data-cy="task-card-edit"]`. The constant
 * makes the view one edit; the tests are the other edit. That is the
 * intended friction: a selector rename is a real contract change and
 * should not happen silently.
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

  // The title is normalised once and reused for the h2 text, the
  // edit button's aria-label, and the delete button's aria-label.
  // Normalising once means a trailing space in the stored title does
  // not survive into any of the three places — the visible heading,
  // the edit label, and the delete label all show the same value
  // the user will see in the h2.
  const title = normaliseText(task.title);

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
    }, title),

    // If the description is empty/whitespace, the element is omitted
    // entirely. Rendering an empty <p> leaves an unexplained gap in
    // the layout. Hiding it is the honest representation of "no
    // description".
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
      // The Edit button.
      //
      // `type="button"` prevents accidental form submission if a
      // future change wraps the card in a `<form>`.
      //
      // `data-action="edit-task"` is the dispatch key the app's
      // delegated click handler matches.
      //
      // `data-task-id` on the button is the *primary* value the
      // delegation reads; the card's own `data-task-id` is the
      // fallback via `closest('[data-task-id]')` if a future
      // change removed the button's attribute.
      //
      // `aria-label` includes the task title so a screen-reader
      // user can distinguish this Edit button from the others in
      // the list.
      el('button', {
        type: 'button',
        class: 'task-card__action task-card__action--edit',
        dataset: {
          action: 'edit-task',
          taskId: String(task.id),
          cy: TASK_CARD_SELECTORS.edit,
        },
        'aria-label': `Edit task: ${title}`,
      }, 'Edit'),

      // The Delete button.
      //
      // Same discipline as the Edit button. The `aria-label`
      // including the task title is not optional — a delete button
      // whose accessible name is just "Delete" is one of the most
      // common a11y bugs in list UIs, and it is the delete workflow's
      // job to not reintroduce it.
      //
      // The button does not open the delete dialog itself; it emits
      // a click with `data-action="delete-task"` and the app's
      // handler opens the dialog. The card is a display component;
      // it does not own the confirmation flow.
      el('button', {
        type: 'button',
        class: 'task-card__action task-card__action--delete',
        dataset: {
          action: 'delete-task',
          taskId: String(task.id),
          cy: TASK_CARD_SELECTORS.delete,
        },
        'aria-label': `Delete task: ${title}`,
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
    // Fallback in case `Intl` is unavailable (e.g., very old
    // environments). Returning the raw string is better than
    // throwing — the card still renders.
    return isoString;
  }
}