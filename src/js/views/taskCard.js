/**
 * Task card view — renders one task as a card.
 *
 * Card 4 of the rendering contract. The card takes a single task and
 * returns a fresh `<article>`. It does not read from the store, does not
 * attach listeners, and does not know about the list that contains it.
 *
 * What the card owns:
 *   The `<article>` and everything inside it. The list wraps the card in
 *   an `<li>`; the card does not know that `<li>` exists. The card's
 *   contents are its own.
 *
 * What the card does not do:
 *   - It does not read from `taskStore`. The task is passed in. A card
 *     that pulled its own data would render differently depending on
 *     when it was called, which is the opposite of what the contract
 *     promises.
 *   - It does not attach event listeners. Events are delegated from
 *     the list container (see the list's card). A card with its own
 *     listener would leak one listener per render; the list's
 *     delegation attaches one listener for the list's lifetime.
 *   - It does not decide which actions to show. It shows edit and
 *     delete, because those are the actions the workflow supports.
 *     If a future workflow adds "duplicate" or "complete," that is a
 *     contract change and a card update, not a per-card decision.
 *
 * Security:
 *   Every user-supplied string (title, description, creator, assignee)
 *   is inserted via `el`'s text path, which uses `createTextNode`. A
 *   user who names a task `<script>alert(1)</script>` sees that text
 *   in the card, not a script execution. The render contract tests
 *   assert this explicitly.
 *
 * Accessibility:
 *   - The card is an `<article>` because it is a self-contained
 *     composition. Screen readers announce it as an article, which is
 *     the correct semantics for "a task."
 *   - The edit and delete buttons have `aria-label` values that name
 *     the task. A screen-reader user who tabs to the button hears
 *     "Edit task: Survey crater" rather than "Edit," which would be
 *     indistinguishable from every other card's edit button.
 *   - The task id is exposed as `data-task-id` on the article, not as
 *     an `id` attribute. An `id` would have to be unique on the page,
 *     which the task id already is, but the `id` attribute is meant
 *     for label/aria references, not for data. The `data-*` attribute
 *     is the right choice for "this node represents task X."
 *
 * @module views/taskCard
 */

import { el } from '../utils/dom.js';

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
 *
 * The task shape is the schema's shape. The card does not validate it;
 * the store has already done that before the task reached the view. A
 * card that re-validated would be duplicating the store's job, and the
 * two would eventually disagree.
 */
export function renderTaskCard(task) {
  // Render the description only when it is non-empty. An empty
  // paragraph would add vertical space and look like a rendering bug.
  // The check is on the trimmed value, not the raw value, so a card
  // whose description is `"   "` treats it the same as `""`. The
  // store already trims, but the view does not rely on that — a card
  // rendered in a test with a hand-built task should still behave.
  const hasDescription = typeof task.description === 'string' && task.description.trim().length > 0;

  return el('article', {
    class: 'task-card',
    dataset: {
      taskId: task.id,
      actionTarget: 'task-card',
    },
  }, [
    // Title — the most prominent element. A real `<h2>` rather than a
    // styled `<div>` so that screen readers can navigate the list by
    // heading, and so that the card's title participates in the page's
    // heading hierarchy (the dashboard has `<h1>`, cards are `<h2>`).
    el('h2', { class: 'task-card__title' }, task.title),

    hasDescription
      ? el('p', { class: 'task-card__description' }, task.description)
      : null,

    // Metadata: creator, assignee, created time. A `<dl>` because the
    // data is term/definition pairs. A `<div>` with spans would be
    // visually identical and semantically weaker; a screen reader
    // would hear "Creator Commander Assignee Geologist" with no
    // structure. The `<dl>` gives each pair a relationship.
    el('dl', { class: 'task-card__meta' }, [
      el('dt', { class: 'task-card__meta-label' }, 'Creator'),
      el('dd', { class: 'task-card__meta-value' }, task.creator),
      el('dt', { class: 'task-card__meta-label' }, 'Assignee'),
      el('dd', { class: 'task-card__meta-value' }, task.assignee),
      el('dt', { class: 'task-card__meta-label' }, 'Created'),
      el('dd', { class: 'task-card__meta-value' }, formatCreatedAt(task.createdAt)),
    ]),

    // Actions. Each button carries:
    //   - data-action: which action the event layer should dispatch
    //   - data-task-id: which task to act on (so delegation can find it
    //     without walking up the DOM)
    //   - aria-label: the accessible name, which names the task
    //     so a screen-reader user can distinguish one edit button from
    //     another
    //
    // The task id is duplicated from the article because the event
    // layer's delegation matches on the button, not the article. The
    // event handler reads `event.target.dataset.taskId`, not
    // `event.target.closest('article').dataset.taskId`, because the
    // former is one lookup and the latter is a walk. Both work; the
    // former is simpler to read.
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
 * `toLocaleString` produces a human-readable date in the user's locale,
 * which is the right behaviour: a user in the UK sees "03/11/2026,
 * 09:00" and a user in the US sees "11/3/2026, 9:00 AM". Both are
 * correct for their locale.
 *
 * The function guards against a non-string or a non-parseable input by
 * returning the raw value. The store guarantees a valid ISO 8601
 * string, but a hand-built task in a test might not be, and a card
 * rendered in a test should not throw on malformed data — the test is
 * asserting the card's other properties, and a throw would mask them.
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