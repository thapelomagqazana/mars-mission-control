/**
 * Counter view — renders the visible task count.
 *
 * Card 5 of the rendering contract. The counter is the simplest view in
 * the application: it takes a number and returns a `<span>`. Its
 * simplicity is deliberate — a counter is a number with a label, and
 * the view's job is to render that and nothing else.
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
 *   The counter owns the element, its text, AND its identity. The
 *   identity is three attributes that all name the counter — and a
 *   test asserts they resolve to the same element:
 *
 *     data-region="counter"        — the region name; matches the grid
 *                                     area in styles.css and the region
 *                                     map in docs/dashboard-regions.md
 *     id="dashboard-counter"       — the accessibility anchor and the
 *                                     selector register entry
 *     data-cy="dashboard-counter"  — the test-selector contract
 *
 *   Plus one machine-readable value:
 *
 *     data-count="<number>"        — the count as a string, so a test
 *                                     can assert the number without
 *                                     parsing the label ("3 tasks" → 3
 *                                     is fragile; the attribute is not)
 *
 *   Why the identity is on the counter, not on the slot:
 *     The dashboard creates a plain <section class="sidebar-counter">
 *     as a wrapper — a well with padding and a surface. The counter
 *     view fills it. If the identity were on the wrapper, then
 *     `document.querySelector('#dashboard-counter')` would return the
 *     wrapper, not the counter. The wrapper's text content is the
 *     wrapper's own; a future test reading that element for the count
 *     would read the wrong element. The counter's identity belongs on
 *     the counter.
 *
 *   A test that wants to find the counter queries either
 *   `#dashboard-counter` or `[data-cy="dashboard-counter"]` — both
 *   resolve to the same element. The wrapper is found by its class
 *   (`.sidebar-counter`); it does not carry the region, the id, or the
 *   data-cy, because those belong to the counter.
 *
 * The empty-state contract:
 *   `renderCounter(0)` renders the same `<span>`, the same attributes,
 *   the same accessibility semantics, with text content "0 tasks".
 *   It is the FIRST render of the same element Phase 6's update
 *   mechanism will mutate — not a placeholder, not a spinner, not an
 *   empty wrapper. The element persists across renders; only the text
 *   and the `data-count` value change.
 *
 *   The persistence matters for accessibility: `aria-live` is defined
 *   on the *element*, not its descendants. Replacing the element (as a
 *   "placeholder → real value" pattern would) would break the live
 *   region's announcement. The empty state is `renderCounter(0)`, and
 *   a populated state is `renderCounter(N)` — same element, new text.
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
 * The counter's region name.
 *
 * Exported so a test, the region map, and the CSS grid-area name all
 * reference the same string. The value "counter" is the region name
 * — not the container's name ("sidebar-counter") and not the
 * element's class ("task-counter"). Those are three distinct facts
 * about three distinct things; only the region name is a contract
 * across the CSS, the DOM, and the tests.
 */
export const COUNTER_REGION = 'counter';

/**
 * The counter's DOM id.
 *
 * Exported so a test can compare the rendered element's `id` against
 * this constant rather than against a string literal. A future change
 * to the counter's id is a change to this constant; the test and the
 * view stay in sync.
 *
 * The value follows the "dashboard-<region>" convention — a reader
 * can predict the id from the region name. The convention is
 * documented in the dashboard view's module header; it is not enforced
 * by code, but every current region follows it and a future region
 * should too.
 */
export const COUNTER_ID = 'dashboard-counter';

/**
 * The counter's data-cy value.
 *
 * Exported for the same reason as the id. Note that the value equals
 * the id today — that is a coincidence of naming, not a coupling. A
 * future change to the id (e.g. a rename) would not require a change
 * to the data-cy, because they are two different contracts: the id is
 * for accessibility and deep-linking; the data-cy is for test
 * selectors. Keeping them as separate constants means a future change
 * to one can be reasoned about without assuming it changes the other.
 */
export const COUNTER_DATA_CY = 'dashboard-counter';

/**
 * Render the task count.
 *
 * @param {number} count - the number of visible tasks
 * @returns {HTMLElement}
 *
 * The element carries the full identity contract (data-region, id,
 * data-cy) plus the machine-readable count (data-count). See the
 * module docstring for the reasoning.
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
 */
export function renderCounter(count) {
  const label = count === 1 ? '1 task' : `${count} tasks`;

  return el('span', {
    class: 'task-counter',
    id: COUNTER_ID,
    dataset: {
      region: COUNTER_REGION,
      cy: COUNTER_DATA_CY,
      count: String(count),
    },
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  }, label);
}