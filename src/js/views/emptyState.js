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
 *   [unchanged from the previous delivery — see that file for the full
 *    rationale on why a single empty state with a "reason" input
 *    replaces two separate views.]
 *
 * What the empty state owns:
 *   [unchanged from the previous delivery — the `<div class="empty-state">`
 *    and everything inside it, as *content* of the task-area
 *    container, not the container itself.]
 *
 * The empty-state copy
 *   [unchanged from the previous delivery — the strings are exported
 *    constants so a test can assert they match the compliance doc
 *    verbatim. This is the same discipline the commander disclosure's
 *    string follows.]
 *
 * The "create task" affordance
 *   [unchanged from the previous delivery — the no-tasks state's action
 *    button carries the contracted id and data-cy, the same
 *    `data-action="open-create-dialog"` the event layer delegates, and
 *    is a real `<button>` (not a styled div).]
 *
 * The "clear search" affordance
 *   The no-results state's action button carries its *own* contracted
 *   id and data-cy — `dashboard-empty-clear` — matching the same
 *   pattern as the create affordance. The two buttons are different
 *   actions with different resolutions (create vs. clear), and a test
 *   that wants to target one without the other should be able to
 *   without a class selector, a text-content match, or a positional
 *   selector.
 *
 *   Why the "clear search" button gained a contract in this delivery
 *   (and not earlier): the *create-workflow audit* (Stage 7) tests the
 *   "cancel via Esc during an open create dialog" path by pressing Esc
 *   on the dialog — but the *empty-state* cancel path (the "clear
 *   search" button) was tested only by text content, which is fragile
 *   (a wording change would break the test without breaking the
 *   button). Giving the button its own `data-cy` makes the test a
 *   *selector* test — the register names the selector, the test
 *   references it, the view emits it, and a wording change does not
 *   affect the test. This is the same discipline the create
 *   affordance already follows.
 *
 *   The button is a real `<button>` — focusable, keyboard-activatable,
 *   announced as a button. A future change that replaced it with a
 *   visual affordance would fail the same unit test the create button
 *   has: the element would no longer be a `<button>`.
 *
 * @module views/emptyState
 */

import { el } from '../utils/dom.js';

/**
 * The empty-state copy for the "no tasks in the store" state, verbatim
 * from the UI checklist.
 *
 * [unchanged from the previous delivery.]
 */
export const EMPTY_STATE_NO_TASKS_HEADING = 'No tasks yet';
export const EMPTY_STATE_NO_TASKS_BODY =
  'Mission tasks will appear here once they are created.';
export const EMPTY_STATE_NO_TASKS_ACTION = 'Create your first task';

/**
 * The empty-state copy for the "search matched nothing" state, verbatim
 * from the UI checklist.
 *
 * [unchanged from the previous delivery.]
 */
export const EMPTY_STATE_NO_RESULTS_HEADING = 'No matching tasks';
export const EMPTY_STATE_NO_RESULTS_BODY =
  'No tasks match your current search.';
export const EMPTY_STATE_NO_RESULTS_ACTION = 'Clear search';

/**
 * The contracted id and data-cy for the "create task" affordance.
 *
 * [unchanged from the previous delivery — exported so the test can
 *  compare the rendered element's attributes against these constants,
 *  and so a future selector-register entry can reference the same
 *  values without duplicating strings.]
 */
export const EMPTY_STATE_CREATE_ID = 'dashboard-empty-create';
export const EMPTY_STATE_CREATE_DATA_CY = 'dashboard-empty-create';

/**
 * The contracted id and data-cy for the "clear search" affordance.
 *
 * The pattern mirrors the create affordance's: a `dashboard-empty-<name>`
 * id and data-cy, exported so a test references the same constants the
 * view writes, and so a future selector-register entry names the same
 * value.
 *
 * The values are added in this delivery because the create-workflow
 * audit needed to target the "clear search" action *as an action*
 * (not as text), and a text-content selector is fragile. The register
 * gains the entry; the view emits the attribute; the test references
 * the constant. Three places, one value.
 *
 * A future change that wanted a *different* affordance in the no-results
 * state (say, "Show all tasks" instead of "Clear search") would: rename
 * the action; rename the constant; update the register; update the test.
 * The button's identity (the id and data-cy) would remain — they name
 * the *slot*, not the action's text.
 */
export const EMPTY_STATE_CLEAR_ID = 'dashboard-empty-clear';
export const EMPTY_STATE_CLEAR_DATA_CY = 'dashboard-empty-clear';

/**
 * Render the empty state for the given reason.
 *
 * [unchanged from the previous delivery — the two reasons are the only
 *  two states in which the list can be empty. A third state is a
 *  contract change and a new reason, not a message change on an
 *  existing reason. The narrow union is deliberate.]
 *
 * @param {'no-tasks' | 'no-results'} reason
 * @returns {HTMLElement}
 */
export function renderEmptyState(reason) {
  if (reason === 'no-results') {
    return renderNoResults();
  }
  // Default to 'no-tasks' for any other reason. This is a deliberate
  // fallback: if a caller passes an unexpected value, the view shows
  // the more general message rather than throwing. A throw from a
  // render function is worse than a slightly wrong message, because a
  // throw breaks the whole render tree and the user sees nothing.
  return renderNoTasks();
}

/**
 * The "the store is empty" empty state.
 *
 * [unchanged from the previous delivery — the call to action is
 *  "Create your first task" because that is exactly what the user can
 *  do; the button carries the contracted id and data-cy, plus the
 *  data-action="open-create-dialog" the event layer delegates.]
 *
 * @returns {HTMLElement}
 */
function renderNoTasks() {
  return el('div', {
    class: 'empty-state empty-state--no-tasks',
    dataset: { region: 'empty', reason: 'no-tasks' },
    role: 'status',
  }, [
    el('p', { class: 'empty-state__heading' }, EMPTY_STATE_NO_TASKS_HEADING),
    el('p', { class: 'empty-state__body' }, EMPTY_STATE_NO_TASKS_BODY),
    el('button', {
      type: 'button',
      class: 'empty-state__action',
      id: EMPTY_STATE_CREATE_ID,
      dataset: {
        action: 'open-create-dialog',
        cy: EMPTY_STATE_CREATE_DATA_CY,
      },
    }, EMPTY_STATE_NO_TASKS_ACTION),
  ]);
}

/**
 * The "the search matched nothing" empty state.
 *
 * The call to action is "Clear search" because the user's current query
 * is why the list is empty. The button carries its own contracted id
 * and data-cy, matching the same pattern as the create affordance.
 *
 * Why the query is not passed to this view:
 *   [unchanged from the previous delivery — the *generic* "clear your
 *    search" message is shown rather than repeating the query, because
 *   the query may be long and the message would wrap awkwardly. The
 *    search-results view is the one that shows the query in its
 *    summary line; the empty state shows the resolution.]
 *
 * The button carries:
 *   - id="dashboard-empty-clear"       — the contracted selector
 *   - data-cy="dashboard-empty-clear"  — the test selector
 *   - data-action="clear-search"       — the event layer's delegation hook
 *
 * A future change that wanted the no-results affordance to do something
 * other than clear the search (e.g. "Show all tasks" that also resets
 * other filters) would: change the action; change the button text;
 * change the event layer's handler. The id and data-cy would *not*
 * change — they name the slot, not the behaviour. This is the same
 * split the create affordance follows: the id/cy is the *slot's*
 * identity; the action and text are the *slot's* behaviour.
 *
 * @returns {HTMLElement}
 */
function renderNoResults() {
  return el('div', {
    class: 'empty-state empty-state--no-results',
    dataset: { region: 'empty', reason: 'no-results' },
    role: 'status',
  }, [
    el('p', { class: 'empty-state__heading' }, EMPTY_STATE_NO_RESULTS_HEADING),
    el('p', { class: 'empty-state__body' }, EMPTY_STATE_NO_RESULTS_BODY),
    el('button', {
      type: 'button',
      class: 'empty-state__action',
      id: EMPTY_STATE_CLEAR_ID,
      dataset: {
        action: 'clear-search',
        cy: EMPTY_STATE_CLEAR_DATA_CY,
      },
    }, EMPTY_STATE_NO_RESULTS_ACTION),
  ]);
}