/**
 * Task card view — renders one task as a card.
 *
 * [the delivered file's header comment — including the "what the card
 *  owns," "what the card does not do," security, and accessibility
 *  sections — is preserved. See the delivered file for the full
 *  rationale.]
 *
 * The card's three attributes, and why each exists
 *   The `<article>` carries three attributes with distinct purposes:
 *
 *     class="task-card"
 *       The styling hook. A CSS rule targets this; a future visual
 *       change (a new border, a hover state) edits the rule, not the
 *       attribute. A test that queried by class would be coupled to
 *       the styling — a rename for a purely visual reason would
 *       break the test. This is why the test does *not* query by
 *       class.
 *
 *     data-task-id="<id>"
 *       The row's identity, for the event layer's delegation. A
 *       click on the card's Edit or Delete button finds the closest
 *       `[data-task-id]` to learn which task the action belongs to.
 *       The event layer matches the *button's* data-task-id, not
 *       the article's — the article's is for tests that want "the
 *       row" (e.g. a test that filters rows by task id) and for
 *       the delegation's `closest('[data-task-id]')` walk, which is
 *       the fallback if a future change moved the attribute up.
 *
 *     data-cy="task-card"
 *       The card's *role*, for tests. The register names three
 *       selectors in the task area:
 *         - "task-list" on the `<ul>` — "the list of tasks"
 *         - "task-list__item" on the `<li>` — "the row in the list"
 *         - "task-card" on the `<article>` — "the card"
 *       Each names a different element for a different test. A test
 *       that wants "the number of cards visible" queries
 *       `[data-cy="task-card"]`; a test that wants "the list" queries
 *       `[data-cy="task-list"]`; a test that wants "the row" queries
 *       `[data-cy="task-list__item"]`. Three elements, three
 *       attributes, three consumers.
 *
 *   The three attributes are not redundant. A future change that
 *   added a wrapper around the card would break a test that queried
 *   by class (the wrapper could carry the same class) or by position
 *   (the card would no longer be the first child of the `<li>`). The
 *   `data-cy` is the one attribute that names *this element*, not its
 *   styling or its position — and a test that queries it is asking
 *   "where is the card?", not "where is the element with this class
 *   in this position?".
 *
 * @module views/taskCard
 */

import { el } from '../utils/dom.js';

/**
 * The task card's contracted `data-cy` value.
 *
 * Exported so a test can reference the same constant the view writes.
 * The value follows the register's convention: `task-card` names the
 * card's role, alongside `task-list` (the `<ul>`) and
 * `task-list__item` (the `<li>`) which `views/taskList.js` emits.
 *
 * A future change that renamed the attribute (e.g. to
 * `data-cy="card"`) would be a change to this constant, to the
 * `dataset.cy` in `renderTaskCard` below, and to every test that
 * queries `[data-cy="task-card"]`. The constant makes the first two
 * one edit; the test change is the third edit, and the register's
 * naming convention is the reason the two agree.
 */
export const TASK_CARD_DATA_CY = 'task-card';

/**
 * Render a single task as a card.
 *
 * [unchanged signature and return shape — see the delivered file's
 *  docstring for the task shape and the "does not validate"
 *  reasoning.]
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
  // [unchanged from the delivered file — the description presence
  //  check on the trimmed value.]
  const hasDescription = typeof task.description === 'string' && task.description.trim().length > 0;

  return el('article', {
    class: 'task-card',
    dataset: {
      taskId: task.id,
      // The card's role for tests. The `actionTarget` attribute the
      // delivered file carried was an internal name ("this is the
      // element the action targets"); it was not part of the
      // register's convention (the register uses `dashboard-` and
      // `task-` prefixes). The `cy` attribute is what the register
      // names, and it is the attribute the e2e tests query.
      cy: TASK_CARD_DATA_CY,
      // `actionTarget` is kept for a future consumer that wants "the
      // element the action targets" (e.g. a test that asserts "the
      // click landed on the card, not the button"). It is *not* the
      // register's name for this element; that is `cy`. Two
      // attributes, two purposes — one is the register's contract,
      // the other is a hint a future test might use. The register
      // names the card; the `actionTarget` is a convenience for a
      // test that wants to verify the *dispatch target* rather than
      // the *card's existence*. If the future test never arrives,
      // the attribute is harmless (one string per card).
      actionTarget: 'task-card',
    },
  }, [
    // [unchanged from the delivered file — the title, description,
    //  meta list, and action buttons.]
    el('h2', { class: 'task-card__title' }, task.title),

    hasDescription
      ? el('p', { class: 'task-card__description' }, task.description)
      : null,

    el('dl', { class: 'task-card__meta' }, [
      el('dt', { class: 'task-card__meta-label' }, 'Creator'),
      el('dd', { class: 'task-card__meta-value' }, task.creator),
      el('dt', { class: 'task-card__meta-label' }, 'Assignee'),
      el('dd', { class: 'task-card__meta-value' }, task.assignee),
      el('dt', { class: 'task-card__meta-label' }, 'Created'),
      el('dd', { class: 'task-card__meta-value' }, formatCreatedAt(task.createdAt)),
    ]),

    el('div', { class: 'task-card__actions' }, [
      el('button', {
        type: 'button',
        class: 'task-card__action task-card__action--edit',
        dataset: { action: 'edit-task', taskId: task.id },
        'aria-label': `Edit task: ${task.title}`,
      }, 'Edit'),
      el('button', {
        type: 'button',
        class: 'task-card__action task-card__action--delete',
        dataset: { action: 'delete-task', taskId: task.id },
        'aria-label': `Delete task: ${task.title}`,
      }, 'Delete'),
    ]),
  ]);
}

/**
 * Format an ISO 8601 timestamp for display.
 *
 * [unchanged from the delivered file — the guard against a non-string
 *  or non-parseable input, the locale-aware `toLocaleString`, and the
 *  rationale for returning the raw value on a malformed input.]
 *
 * @param {string} isoString
 * @returns {string}
 */
function formatCreatedAt(isoString) {
  if (typeof isoString !== 'string') return String(isoString);
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString();
}