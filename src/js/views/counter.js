/**
 * Counter view — renders the visible task count.
 *
 * Card 5 of the rendering contract. The counter is the simplest view in
 * the application: it takes a number and returns a `<span>`. Its
 * simplicity is deliberate — a counter is a number with a label, and the
 * view's job is to render that and nothing else.
 *
 * What the counter counts:
 *   The number passed in is the count of tasks currently *visible*
 *   (after search filtering), not the total in the store. This is the
 *   right number for the user: "3 tasks" when a search shows 3 out of
 *   12 tells the user what they are looking at. "12 tasks" would tell
 *   them how many exist, which they can see by clearing the search.
 *   The counter's card says "visible", and the caller is responsible
 *   for passing the visible count.
 *
 * What the counter owns:
 *   The `<span class="task-counter">` element and its text. The
 *   sidebar container that holds the counter is owned by the dashboard;
 *   the counter fills it, it does not create it. This is why the
 *   counter element does NOT carry `data-region="counter"` — that
 *   attribute marks the container, and the container is the
 *   dashboard's. The counter's own identity is its class and its
 *   `data-count` attribute.
 *
 *   A test that wants to find the counter queries
 *   `[data-region="counter"] .task-counter` — the container by region,
 *   the counter by class. Splitting the two attributes across the two
 *   owners is what makes the ownership map hold.
 *
 * Accessibility:
 *   - `aria-live="polite"` makes the counter a live region. When the
 *     count changes (create, delete, search), a screen reader announces
 *     the new value. Without it, a screen-reader user would not know
 *     the count changed.
 *   - `aria-atomic="true"` makes the announcement read the whole
 *     element, not just the changed part. Without it, a screen reader
 *     might announce only "s" when "3 tasks" becomes "4 tasks" — it
 *     would announce the changed text node, which is "tasks" vs "task"
 *     plus the number, and the result is unintelligible.
 *   - `role="status"` is the explicit role. `aria-live="polite"` alone
 *     implies a status role in most screen readers, but the explicit
 *     role makes the intent unambiguous. The two are not redundant;
 *     they are belt and braces on an element whose entire job is to be
 *     announced.
 *
 * Why "polite" and not "assertive":
 *   "Assertive" interrupts the screen reader to announce the change
 *   immediately. "Polite" waits for a pause. A counter that updates
 *   on every keystroke of a search would interrupt the user's typing
 *   if it were assertive. "Polite" lets the user finish what they are
 *   doing, then announces the new count. That is the right cadence for
 *   a count.
 *
 * @module views/counter
 */

import { el } from '../utils/dom.js';

/**
 * Render the task count.
 *
 * @param {number} count - the number of visible tasks
 * @returns {HTMLElement}
 *
 * The singular/plural handling is deliberate: "1 task" and "3 tasks"
 * are both correct English; "1 tasks" is not. A counter that showed
 * "1 tasks" would look like a bug to a user, and the bug is the kind
 * that undermines trust in the rest of the UI. The two-word decision
 * is one comparison, and it is the view's job to get it right.
 *
 * The count is not validated. A negative count or a non-integer would
 * be a caller bug, not a view bug; the caller is the store's
 * `getAll().length` or a filtered array's length, both of which are
 * non-negative integers. A counter that defended against impossible
 * inputs would add branches that can never run. The contract tests
 * assert the behaviour for the realistic inputs (0, 1, many).
 *
 * The element carries `data-count` so a test can assert the numeric
 * value without parsing the text ("3 tasks" → 3 is fragile; a
 * machine-readable attribute is not). It does not carry
 * `data-region="counter"` — that attribute marks the dashboard's
 * container, and the counter is a child of it, not the container.
 */
export function renderCounter(count) {
  const label = count === 1 ? '1 task' : `${count} tasks`;

  return el('span', {
    class: 'task-counter',
    dataset: { count: String(count) },
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  }, label);
}