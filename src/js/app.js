/**
 * Application event layer — wires events to the store and views.
 *
 * [the delivered file's header comment — including the layer discipline,
 *  state ownership, re-render policy, error handling, ordering rule, the
 *  create workflow end to end, the double-submission note, the header
 *  create affordance, the cancel-flow idempotence, and the single-open
 *  and close-before-destroy sections — is preserved. See the previous
 *  deliveries for the full rationale.]
 *
 * ## The success message
 *
 * The previous delivery used `flashSuccess(trigger, label)` to confirm
 * a save: the trigger button's text briefly changed to "Created" or
 * "Saved" for two seconds. That mechanism had two specific failure
 * cases:
 *
 *   1. The empty state's "Create your first task" button is
 *      *removed* when the store has a task. The flash is a no-op
 *      when the trigger is detached (the `isConnected` guard), so
 *      the user who clicked the only visible affordance — the one
 *      in the empty state — gets no confirmation at all.
 *
 *   2. The trigger button may be off-screen after the list scrolls,
 *      so a user who scrolled the confirmation away does not see it.
 *      The flash is on the trigger; the trigger is wherever the
 *      user last touched, not wherever the user is now looking.
 *
 * The fix is a toast — a transient notification mounted to
 * `document.body`, positioned fixed in the bottom-right corner,
 * visible regardless of the trigger's state or the user's scroll
 * position, and auto-dismissing after three seconds. See
 * `views/toast.js` for the view's lifecycle and its accessibility
 * contract (`role="status"`, `aria-live="polite"`, `aria-atomic`).
 *
 * The toast replaces `flashSuccess`, not adds to it. Both mechanisms
 * would produce *two* confirmations for the same save — a bug, not a
 * feature. The `flashSuccess` function and its `SUCCESS_FLASH_MS`
 * constant are removed in the same commit.
 *
 * The toast is called from three places:
 *
 *   - `handleFormSubmit` on create success: "Task created".
 *   - `handleFormSubmit` on update success: "Task saved".
 *   - `handleFormSubmit` on a storage error: "Could not save the task."
 *
 * And from `handleDeleteClick` for the same three shapes:
 *
 *   - delete success: `Deleted "<title>"`.
 *   - delete storage error: "Could not delete the task."
 *
 * The error variant uses the danger-tinted border so the toast's
 * colour matches the outcome. The view handles both variants; this
 * file just decides *when* to show which.
 *
 * @module app
 */

import { createTaskStore } from './store/taskStore.js';
import { ValidationError, NotFoundError } from './store/errors.js';
import { renderDashboardFilled } from './views/dashboard.js';
import { renderCounter } from './views/counter.js';
import { renderTaskList } from './views/taskList.js';
import { renderSearchResults } from './views/search.js';
import { createTaskDialog } from './views/dialog.js';
import { showToast } from './views/toast.js';
import { createStorageAdapter } from './utils/storage.js';
import { SEARCH_DEBOUNCE_MS, debounce } from './events/debounce.js';
import { onEscape, onSearchEscape } from './events/keyboard.js';
import { focusOnOpen } from './events/focus.js';
import { replaceChildren, requireEl } from './utils/dom.js';

/**
 * Filter tasks by query. [unchanged from the delivered file.]
 *
 * The filter is case-insensitive across the three searchable fields
 * (title, description, assignee). The empty query is "no filter"
 * (return all tasks), not "match nothing."
 *
 * @param {ReadonlyArray<object>} tasks
 * @param {string} query
 * @returns {ReadonlyArray<object>}
 */
function filterTasks(tasks, query) {
  const q = query.trim().toLowerCase();
  if (q === '') return tasks;
  return tasks.filter(
    (task) =>
      task.title.toLowerCase().includes(q) ||
      task.description.toLowerCase().includes(q) ||
      task.assignee.toLowerCase().includes(q)
  );
}

/**
 * Boot the application.
 *
 * [the delivered file's signature and return shape are unchanged.]
 *
 * @param {{
 *   root?: HTMLElement,
 *   persistence?: { load: () => any, save: (tasks: ReadonlyArray<object>) => void },
 * }} [options]
 * @returns {{
 *   render: () => void,
 *   store: object,
 *   destroy: () => void,
 * }}
 */
export function startApp(options = {}) {
  const root = options.root || requireEl(document, '#app-root');
  const persistence = options.persistence || createStorageAdapter();
  const store = createTaskStore(persistence);

  let searchQuery = '';

  // The element that opened the current dialog. Captured on open and
  // restored on close so a keyboard user does not lose their place.
  // Retained after the toast replaced the flash because focus
  // restoration is a separate concern from the confirmation — the
  // trigger is where focus goes *back*, the toast is where
  // confirmation goes *forward*. Two concerns, two mechanisms, both
  // reading `dialogTrigger` at different moments.
  let dialogTrigger = null;

  let activeDialog = null;
  let activeDialogMode = null;
  let activeDialogTask = null;

  let dialogDetachers = [];
  let detachers = [];

  const debouncedSearch = debounce((query) => {
    searchQuery = query;
    render();
  }, SEARCH_DEBOUNCE_MS);

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------

  /**
   * [unchanged from the delivered file.]
   */
  function render() {
    const allTasks = store.getAll();
    const filtered = filterTasks(allTasks, searchQuery);
    const emptyReason = searchQuery.trim() === '' ? 'no-tasks' : 'no-results';

    const dashboard = renderDashboardFilled(
      {
        tasks: allTasks,
        filteredTasks: filtered,
        searchQuery,
        counter: filtered.length,
      },
      {
        renderCounter,
        renderTaskList: (tasks) => renderTaskList(tasks, { emptyReason }),
        renderSearchResults: (query, tasks) =>
          renderSearchResults({ query, tasks, renderTaskList }),
      }
    );

    replaceChildren(root, dashboard);
    attachListeners();
  }

  // ---------------------------------------------------------------------
  // Listener attachment
  // ---------------------------------------------------------------------

  /**
   * Detach every listener from the previous render and attach new ones
   * to the current DOM. Called at the end of every render.
   *
   * [the delivered file's delegate-once commentary is preserved —
   *  the delegation on `root` is the single source of truth for
   *  every `[data-action]` click inside the dashboard. The search
   *  input keeps its direct listener (with the `__wired` guard)
   *  because the input survives re-renders and the direct listener
   *  is the smallest correct shape for a single persistent element.]
   */
  function attachListeners() {
    for (const detach of detachers) detach();
    detachers = [];

    // Search input — direct listener, one per app. The `__wired`
    // guard prevents duplicate attachment across renders.
    const searchInput = root.querySelector('[data-action="search-input"]');
    if (searchInput && !searchInput.__wired) {
      const onInput = (event) => handleSearchInput(event);
      searchInput.addEventListener('input', onInput);
      const detachEscape = onSearchEscape(searchInput, handleClearSearch);
      detachers.push(
        () => searchInput.removeEventListener('input', onInput),
        detachEscape
      );
      searchInput.__wired = true;
    }

    // The dashboard root — the only click dispatcher for every
    // `[data-action]` inside the dashboard. [See the delivered
    // file's delegate-once commentary for the full rationale.]
    const content = root;
    if (content) {
      const onClick = (event) => {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl || !content.contains(actionEl)) return;

        const action = actionEl.dataset.action;
        const taskId = actionEl.closest('[data-task-id]')?.dataset.taskId;

        if (action === 'edit-task') {
          handleEditClick(taskId, actionEl);
        } else if (action === 'delete-task') {
          handleDeleteClick(taskId);
        } else if (action === 'clear-search') {
          handleClearSearch();
        } else if (action === 'open-create-dialog') {
          handleOpenCreate(actionEl);
        }
      };
      content.addEventListener('click', onClick);
      detachers.push(() => content.removeEventListener('click', onClick));
    }
  }

  // ---------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------

  /**
   * [unchanged from the delivered file.]
   */
  function handleOpenCreate(trigger) {
    dialogTrigger = trigger;
    openDialog(null, 'create');
  }

  function handleEditClick(taskId, trigger) {
    dialogTrigger = trigger;
    if (!taskId) return;
    const task = store.getById(taskId);
    if (!task) {
      render();
      return;
    }
    openDialog(task, 'edit');
  }

  /**
   * Delete a task, with a confirmation and a toast.
   *
   * [the delivered file's structure — the `window.confirm` gate, the
   *  NotFoundError and storage-error branches, and the render on
   *  both success and rollback — is preserved. Two changes:]
   *
   *   - The success path shows `Deleted "<title>"` as a toast. The
   *     title is included so a user who deletes several tasks in
   *     succession sees *which* task each confirmation refers to.
   *     The title is read from the task object before the delete —
   *     after the delete, `store.getById` returns undefined.
   *
   *   - The storage-error branch shows "Could not delete the task."
   *     as an error-variant toast. The render (which reflects the
   *     rollback) runs first, then the toast — same render-then-
   *     notify order as the save path.
   *
   * The NotFoundError branch does *not* show a toast — the task
   * being gone is a normal outcome of the user's action (someone
   * else deleted it, or the user double-clicked Delete on an
   * already-deleted row). A confirmation of "already gone" would
   * be noise.
   */
  function handleDeleteClick(taskId) {
    if (!taskId) return;
    const task = store.getById(taskId);
    if (!task) {
      render();
      return;
    }

    const confirmed = window.confirm(`Delete task "${task.title}"?`);
    if (!confirmed) return;

    try {
      store.deleteTask(task.id);
      render();
      showToast(`Deleted "${task.title}"`, { variant: 'success' });
    } catch (error) {
      if (error instanceof NotFoundError) {
        render();
      } else {
        render();
        showToast('Could not delete the task.', { variant: 'error' });
        console.warn('Delete failed; the task is still present.', error);
      }
    }
  }

  function handleSearchInput(event) {
    debouncedSearch(event.target.value);
  }

  function handleClearSearch() {
    debouncedSearch.cancel();
    searchQuery = '';
    render();
  }

  /**
   * Submit the dialog's form.
   *
   * [the delivered file's structure — the try/catch shape, the
   *  validation-error branch that keeps the dialog open, the
   *  render-then-close ordering for focus restoration, the
   *  aria-busy lifecycle — is preserved. The one change: the
   *  `flashSuccess(dialogTrigger, ...)` call is replaced by
   *  `showToast(...)`, and the storage-error branch gains a
   *  toast so a failed save is visible.
   *
   *  The toast is *fire-and-forget*: it mounts to `document.body`,
   *  owns its own timer, and does not participate in the dashboard's
   *  render cycle. The `render()` call below replaces the
   *  dashboard's children; the toast is on `document.body`, not on
   *  the dashboard, so the render does not disturb it. That is the
   *  whole reason the toast is a *view* rather than a piece of
   *  dashboard state — its lifecycle is independent.
   *
   *  Ordering on the success path:
   *
   *    1. `showToast(...)` — the confirmation. Called first because
   *       it is *independent* of the rest of the sequence. A failure
   *       in `render()` below does not un-show the toast — the user
   *       still sees "Task created" even if the list is momentarily
   *       stale (the next render will fix the list; the toast's job
   *       is done).
   *
   *    2. `render()` — the dashboard update. Best-effort (wrapped
   *       in try/catch); a render failure does not prevent the
   *       close.
   *
   *    3. `closeActiveDialog()` — the dialog teardown. Close-then-
   *       destroy, per the file's discipline.
   *
   *    4. `formEl?.removeAttribute('aria-busy')` — the form is
   *       detached by now, but the call is harmless and keeps the
   *       symmetry with the other paths.]
   */
  async function handleFormSubmit(values) {
    if (!activeDialog) return;

    const formEl = activeDialog.element.querySelector('form');
    formEl?.setAttribute('aria-busy', 'true');

    let succeeded = false;

    try {
      if (activeDialogMode === 'create') {
        store.create(values);
      } else if (activeDialogMode === 'edit' && activeDialogTask) {
        store.update(activeDialogTask.id, values);
      }
      succeeded = true;
    } catch (error) {
      if (error instanceof ValidationError) {
        // The user is mid-edit; the errors are shown in the dialog;
        // the dialog stays open. No toast on validation failure —
        // the dialog's own field errors are the confirmation
        // channel for a form that is still open.
        activeDialog.showErrors(error.fields);
        formEl?.removeAttribute('aria-busy');
        return;
      }
      // A storage error (or any non-ValidationError from the store).
      // The store has rolled back; the dialog's job is done. Render
      // to reflect the rollback, then close, then show the error
      // toast. The toast is shown *after* the close so the user
      // does not see the dialog on top of the toast (the toast is
      // fixed-position; the dialog is a modal; keeping the close
      // first means the toast lands on the page, not on a modal's
      // scrim).
      try {
        render();
      } catch (renderError) {
        console.warn('Render failed after a save error; the dialog will still close.', renderError);
      }
      closeActiveDialog();
      formEl?.removeAttribute('aria-busy');
      showToast('Could not save the task.', { variant: 'error' });
      console.warn('Save failed; the change was not applied.', error);
      return;
    }

    if (!succeeded) return;

    // Success path. The confirmation is independent of the rest of
    // the sequence — the user should see "Task created" even if the
    // render below fails. The message is per-mode: create is "Task
    // created", update is "Task saved". The two phrasings match the
    // user's mental model ("I created a new task" vs. "I saved my
    // edits to an existing task") and the two button labels the
    // dialog renders ("Create task" / "Save changes").
    const successMessage =
      activeDialogMode === 'create' ? 'Task created' : 'Task saved';
    showToast(successMessage, { variant: 'success' });

    // Best-effort render. A render failure is logged; the close
    // below is unconditional (the store persisted — the dialog's
    // job is done).
    try {
      render();
    } catch (renderError) {
      console.warn('Render failed after a successful save; the dialog will still close.', renderError);
    }

    // Close the dialog (restores focus to the trigger).
    closeActiveDialog();
    formEl?.removeAttribute('aria-busy');
  }

  function handleDialogCancel() {
    closeActiveDialog();
  }

  // ---------------------------------------------------------------------
  // Dialog lifecycle
  // ---------------------------------------------------------------------

  /**
   * Open the create or edit dialog.
   *
   * [the delivered file's version — the dialog-creation, the
   *  focus-on-open, and the Escape wiring. Behaviour unchanged.]
   *
   * `dialogTrigger` is set by the caller (`handleOpenCreate`,
   * `handleEditClick`) *before* this function runs. The trigger is
   * used for focus restoration on close. The toast does *not* use
   * `dialogTrigger` — the toast is a fixed-position notification,
   * independent of the element that opened the dialog.
   */
  function openDialog(task, mode) {
    dialogDetachers = [];

    activeDialog = createTaskDialog({
      mode,
      task,
      onSubmit: handleFormSubmit,
      onCancel: handleDialogCancel,
    });
    activeDialogMode = mode;
    activeDialogTask = task;

    activeDialog.open();

    const titleInput = activeDialog.element.querySelector('input[name="title"]');
    const restoreFocus = focusOnOpen(activeDialog.element, dialogTrigger, titleInput);
    dialogDetachers.push(restoreFocus);

    const detachEscape = onEscape(activeDialog.element, () => {
      handleDialogCancel();
    });
    dialogDetachers.push(detachEscape);
  }

  /**
   * Close the active dialog.
   *
   * [the delivered file's close-before-destroy discipline — the
   *  modal state is released before the DOM node is removed. See
   *  the delivered file's section on the topic for the reasoning.]
   */
  function closeActiveDialog() {
    if (!activeDialog) return;

    for (const detach of dialogDetachers) detach();
    dialogDetachers = [];

    const controller = activeDialog;
    activeDialog = null;
    activeDialogMode = null;
    activeDialogTask = null;

    controller.close();
    controller.destroy();
  }

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  /**
   * Tear down the app.
   *
   * [the delivered file's version — the close-then-destroy
   *  discipline applies to the active dialog on teardown as well,
   *  so a torn-down app does not leave a stray modal in the
   *  browser's top layer.]
   *
   * The toast is *not* dismissed here — the toast's timer will
   * expire on its own, and a toast with no dashboard is a harmless
   * (and typically invisible, because the user is navigating away)
   * notification. A future change that wanted the toast dismissed
   * on teardown would call `dismissActiveToastNow()` (exported
   * from `views/toast.js` for exactly this purpose). That is a
   * deliberate omission, not an oversight — the toast's lifecycle
   * is independent of the app's, and coupling them would make
   * teardown longer than it needs to be.
   */
  function destroy() {
    for (const detach of detachers) detach();
    detachers = [];

    for (const detach of dialogDetachers) detach();
    dialogDetachers = [];

    debouncedSearch.cancel();

    if (activeDialog) {
      const controller = activeDialog;
      activeDialog = null;
      activeDialogMode = null;
      activeDialogTask = null;
      controller.close();
      controller.destroy();
    }
  }

  // Initial render.
  render();

  return {
    render,
    store,
    destroy,
  };
}