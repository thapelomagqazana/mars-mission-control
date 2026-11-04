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
 *   An empty list caused by "there are no tasks yet" needs a different
 *   message than an empty list caused by "your search matched nothing."
 *   The first says "create your first task"; the second says "try a
 *   different search." Both are empty states; both look the same; only
 *   the message differs. A view that guessed would guess wrong half the
 *   time, and the wrong message is worse than no message — "Create your
 *   first task" shown to a user whose search has no matches is confusing,
 *   not helpful.
 *
 * What the empty state owns:
 *   The `<div class="empty-state">` and everything inside it. This
 *   element is the *content* of the task-area container (emitted by
 *   taskList.js) when the list has zero items. It is not the container
 *   itself — the container is the stable element across renders; the
 *   empty state is one of its content states.
 *
 *   Why this distinction matters:
 *     The task-area container is the render target Phase 6 will
 *     populate. The empty state is the container's *empty render* — the
 *     same container with zero items. If the empty state were the
 *     container, then "populated" would mean "replace the container,"
 *     and Phase 6 would need to know when to replace it. If the empty
 *     state is content *inside* the container, then "populated" means
 *     "the container has different children," and the container's
 *     identity is preserved across renders.
 *
 *   The two states (no-tasks, no-results) are mutually exclusive —
 *   the empty state has one reason at a time. Both render into the
 *   same container; the container's identity is the same in both.
 *
 * The empty-state copy
 *   The strings the view emits are exported as constants so a test can
 *   assert they match the compliance doc (docs/task-area.md) verbatim.
 *   The strings are treated as contract text, not as UI copy to be
 *   softened. A future change to the wording is a change to these
 *   constants AND to the doc, in the same commit — the test is the
 *   guard. This is the same discipline the commander disclosure's
 *   verbatim string follows; the two are compliance artefacts, and
 *   compliance artefacts live in one place each.
 *
 * The "create task" affordance
 *   The no-tasks state's action button carries the contracted `id` and
 *   `data-cy` from the selector register, plus the same
 *   `data-action="open-create-dialog"` the event layer already
 *   delegates. It is a real `<button>` — focusable by default,
 *   keyboard-activatable by default, announced as a button by screen
 *   readers. A future change that replaced the button with a visual
 *   affordance (an icon, a span) would fail the unit test (the button
 *   would no longer be a `<button>`) and the e2e test (the click would
 *   no longer open the dialog) — which is the whole point of the
 *   affordance being a real button.
 *
 * @module views/emptyState
 */

import { el } from '../utils/dom.js';

/**
 * The empty-state copy for the "no tasks in the store" state, verbatim
 * from the UI checklist.
 *
 * A single source. Tested against docs/task-area.md in
 * tests/unit/jsdom/renderContract.test.js. A future change to the
 * wording is a change to these constants AND to the doc, in the same
 * commit.
 */
export const EMPTY_STATE_NO_TASKS_HEADING = 'No tasks yet';
export const EMPTY_STATE_NO_TASKS_BODY =
  'Mission tasks will appear here once they are created.';
export const EMPTY_STATE_NO_TASKS_ACTION = 'Create your first task';

/**
 * The empty-state copy for the "search matched nothing" state, verbatim
 * from the UI checklist.
 *
 * A single source. Tested against docs/task-area.md in
 * tests/unit/jsdom/renderContract.test.js.
 */
export const EMPTY_STATE_NO_RESULTS_HEADING = 'No matching tasks';
export const EMPTY_STATE_NO_RESULTS_BODY =
  'No tasks match your current search.';
export const EMPTY_STATE_NO_RESULTS_ACTION = 'Clear search';

/**
 * The contracted id and data-cy for the "create task" affordance.
 *
 * Exported so the test can compare the rendered element's attributes
 * against these constants, and so a future selector-register entry can
 * reference the same values without duplicating strings. The values
 * follow the "dashboard-<region>" convention: the affordance is part
 * of the task-area region, and its id and data-cy name it as such.
 *
 * The "clear search" affordance does not carry a contracted id or
 * data-cy today — it is identified by `data-action="clear-search"`
 * (the event layer's hook) and by its presence in the no-results empty
 * state. If a future test needed to target it specifically, the id and
 * data-cy would be added here (and in the selector register) in the
 * same commit; the pattern is the same, and the reason for not adding
 * it now is "no consumer needs it yet."
 */
export const EMPTY_STATE_CREATE_ID = 'dashboard-empty-create';
export const EMPTY_STATE_CREATE_DATA_CY = 'dashboard-empty-create';

/**
 * Render the empty state for the given reason.
 *
 * @param {'no-tasks' | 'no-results'} reason
 * @returns {HTMLElement}
 *
 * The two reasons are the only two states in which the list can be
 * empty. If a third state ever appears (e.g. "storage unavailable"),
 * that is a contract change and a new reason — not a message change on
 * an existing reason. The narrow union is deliberate: it makes a new
 * state a visible code change rather than a string the caller happened
 * to pass.
 *
 * The two reasons produce different affordances:
 *   - no-tasks: the action is "Create your first task" (open the create
 *     dialog). The user's resolution is to create something.
 *   - no-results: the action is "Clear search" (clear the query). The
 *     user's resolution is to stop filtering.
 *
 * The two are distinct because a user in the first state has nothing
 * to clear, and a user in the second state does not want to create a
 * task — their task exists, it is just filtered out. A view that
 * offered the same action in both states would be wrong for one of
 * them.
 */
export function renderEmptyState(reason) {
  if (reason === 'no-results') {
    return renderNoResults();
  }
  // Default to 'no-tasks' for any other reason. This is a deliberate
  // fallback: if a caller passes an unexpected value, the view shows
  // the more general message rather than throwing. A throw from a
  // render function is worse than a slightly wrong message, because a
  // throw breaks the whole render tree and the user sees nothing. The
  // contract tests assert the two valid reasons produce the correct
  // messages; the fallback only catches the case where a caller has
  // a bug, and showing the general message is the least-bad response.
  return renderNoTasks();
}

/**
 * The "the store is empty" empty state.
 *
 * The call to action is "Create your first task" because that is
 * exactly what the user can do. The message names the concept
 * ("tasks") so a first-time user knows what will appear here.
 *
 * The button carries:
 *   - id="dashboard-empty-create"   — the contracted selector
 *   - data-cy="dashboard-empty-create" — the test selector
 *   - data-action="open-create-dialog" — the event layer's delegation
 *     hook (the same hook the header's create button uses; the event
 *     layer already handles both because it delegates from the content
 *     region, which contains this button)
 *
 * The button is focusable because it is a real <button>. A future
 * change that wanted a "create" affordance elsewhere (say, a keyboard
 * shortcut) would be a *second* trigger, not a replacement for this
 * one — the empty state's button is the primary affordance and the
 * accessible name's source.
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
 * is why the list is empty. The message names the query so the user
 * knows which search produced no results — helpful when they have
 * several windows open or several searches in memory.
 *
 * The query is not passed to this view. The view shows the *generic*
 * "clear your search" message rather than repeating the query, because
 * the query may be long and the message would wrap awkwardly. The
 * search-results view (Card 6) is the one that shows the query in its
 * summary line; the empty state shows the resolution. Two views, two
 * jobs, no overlap.
 *
 * The button carries:
 *   - data-action="clear-search" — the event layer's delegation hook
 *
 * It does NOT carry a contracted id or data-cy today. If a future test
 * needed to target it specifically, the id and data-cy would be added
 * here (and in the selector register) in the same commit. The reason
 * for not adding it now is "no consumer needs it yet" — the same
 * reason every token in the design-token register has to have a
 * consumer before it is added. A selector is an identifier for a
 * consumer; a selector with no consumer is a wish.
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
      dataset: { action: 'clear-search' },
    }, EMPTY_STATE_NO_RESULTS_ACTION),
  ]);
}