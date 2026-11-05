/**
 * Application event layer — wires events to the store and views.
 *
 * [the delivered file's header comment — including the layer
 *  discipline, state ownership, re-render policy, error handling,
 *  ordering rule, the create workflow end to end, the
 *  double-submission note, the header create affordance, the
 *  cancel-flow idempotence, the single-open and close-before-destroy
 *  sections, and the startup-resilience section — is preserved.
 *  See the previous deliveries for the full rationale.]
 *
 * ## Three dialogs, one at a time
 *
 * The app has three modal dialogs:
 *
 *   - The create/edit dialog (a form).
 *   - The delete-confirmation dialog (a single-task destructive gate).
 *   - The clear-all confirmation dialog (a store-wide destructive gate).
 *
 * They are separate view modules because they have different ARIA
 * roles, different initial-focus targets, different copy, and
 * different consequences. They are *never* open simultaneously:
 *
 *   - `handleOpenCreate` and `handleEditClick` close any active
 *     delete or clear-all dialog before opening the create/edit
 *     dialog.
 *   - `handleDeleteClick` closes any active create/edit or
 *     clear-all dialog before opening the delete dialog.
 *   - `handleClearAllClick` closes any active create/edit or
 *     delete dialog before opening the clear-all dialog.
 *
 * Stacking modals would be a UX bug: the user cannot tell which
 * dialog is on top, and the app cannot tell which one a stray Esc
 * was meant for. One dialog at a time is a hard invariant.
 *
 * ## Focus restoration, per dialog
 *
 * Every dialog restores focus on close. The rules differ because
 * the triggers differ:
 *
 *   - The create/edit dialog's trigger is a button that *survives*
 *     a render on the cancel path. On the submit path, the trigger
 *     may be detached — the edit button's card was re-rendered with
 *     the new values. Focus is resolved by task id.
 *
 *   - The delete dialog's trigger is the per-card delete button.
 *     After a successful delete, the trigger's *card* is gone.
 *     Focus falls through a chain: the next card's delete button,
 *     then the header create button, then the list container.
 *
 *   - The clear-all dialog's trigger is the sidebar's clear-all
 *     button. The button survives a render — the sidebar is always
 *     rendered, and the button's own disabled state changes but
 *     the element persists. Focus returns to the button directly
 *     on both the cancel and the confirm paths. The one exception
 *     is a render that removes the button entirely (a future change
 *     that only rendered the sidebar's clear-all in certain states),
 *     which does not exist today.
 *
 * @module app
 */

import { createTaskStore } from './store/taskStore.js';
import { ValidationError, NotFoundError, StorageError } from './store/errors.js';
import { renderDashboardFilled } from './views/dashboard.js';
import { renderCounter } from './views/counter.js';
import { renderTaskList } from './views/taskList.js';
import { renderSearchResults } from './views/search.js';
import { createTaskDialog } from './views/dialog.js';
import { createDeleteDialog } from './views/deleteDialog.js';
import { createClearAllDialog } from './views/clearAllDialog.js';
import { showToast } from './views/toast.js';
import { createStorageAdapter } from './utils/storage.js';
import { SEARCH_DEBOUNCE_MS, debounce } from './events/debounce.js';
import { onEscape, onSearchEscape } from './events/keyboard.js';
import { focusOnOpen } from './events/focus.js';
import { replaceChildren, requireEl } from './utils/dom.js';

/**
 * Filter tasks by query. [unchanged from the delivered file.]
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
 */
export function startApp(options = {}) {
  const root = options.root || requireEl(document, '#app-root');
  const persistence = options.persistence || createStorageAdapter();

  let store;
  try {
    store = createTaskStore(persistence);
  } catch (error) {
    if (error instanceof StorageError && error.operation === 'load') {
      console.warn(
        'App startup: Failed to load persisted tasks. ' +
          'Starting with an in-memory fallback (tasks will not persist).',
        error
      );
      store = createTaskStore({
        load: () => [],
        save: () => {},
      });
    } else {
      throw error;
    }
  }

  let searchQuery = '';

  // ---------------------------------------------------------------------
  // Dialog state
  // ---------------------------------------------------------------------

  // The create/edit dialog's trigger and controller.
  let dialogTrigger = null;
  let activeDialog = null;
  let activeDialogMode = null;
  let activeDialogTask = null;
  let dialogDetachers = [];

  // The delete dialog's trigger and controller.
  let deleteDialogTrigger = null;
  let activeDeleteDialog = null;
  let deleteDialogTask = null;

  // The clear-all dialog's trigger and controller. Separate state so
  // the three dialogs cannot be confused, and so each restoration
  // path can read the correct trigger.
  let clearAllDialogTrigger = null;
  let activeClearAllDialog = null;
  let clearAllDialogCount = 0;

  // The dashboard's delegated listeners. Cleared and re-attached on
  // every render.
  let detachers = [];

  const debouncedSearch = debounce((query) => {
    searchQuery = query;
    render();
  }, SEARCH_DEBOUNCE_MS);

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------

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

  function attachListeners() {
    for (const detach of detachers) detach();
    detachers = [];

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
          handleDeleteClick(taskId, actionEl);
        } else if (action === 'clear-search') {
          handleClearSearch();
        } else if (action === 'open-create-dialog') {
          handleOpenCreate(actionEl);
        } else if (action === 'open-clear-all-dialog') {
          handleClearAllClick(actionEl);
        }
      };
      content.addEventListener('click', onClick);
      detachers.push(() => content.removeEventListener('click', onClick));
    }
  }

  // ---------------------------------------------------------------------
  // Event handlers — create and edit
  // ---------------------------------------------------------------------

  function handleOpenCreate(trigger) {
    if (activeDeleteDialog) {
      closeDeleteDialog();
    }
    if (activeClearAllDialog) {
      closeClearAllDialog();
    }
    dialogTrigger = trigger;
    openDialog(null, 'create');
  }

  function handleEditClick(taskId, trigger) {
    if (activeDeleteDialog) {
      closeDeleteDialog();
    }
    if (activeClearAllDialog) {
      closeClearAllDialog();
    }
    dialogTrigger = trigger;
    if (!taskId) return;
    const task = store.getById(taskId);
    if (!task) {
      render();
      return;
    }
    openDialog(task, 'edit');
  }

  // ---------------------------------------------------------------------
  // Event handlers — delete
  // ---------------------------------------------------------------------

  /**
   * Open the delete-confirmation dialog for the given task.
   *
   * [unchanged from the delivered file, plus: closes any active
   *  clear-all dialog first, so three dialogs cannot stack.]
   */
  function handleDeleteClick(taskId, trigger) {
    if (!taskId) return;

    const task = store.getById(taskId);
    if (!task) {
      render();
      return;
    }

    if (activeDialog) {
      closeActiveDialog();
    }
    if (activeClearAllDialog) {
      closeClearAllDialog();
    }

    deleteDialogTrigger = trigger || null;
    deleteDialogTask = task;

    activeDeleteDialog = createDeleteDialog({
      task,
      onConfirm: () => handleDeleteConfirm(task),
      onCancel: () => closeDeleteDialog(),
    });

    activeDeleteDialog.open();
  }

  /**
   * The confirm path — the destructive action for one task.
   * [unchanged from the delivered file.]
   */
  function handleDeleteConfirm(task) {
    const title = task.title;
    const id = task.id;

    const controller = activeDeleteDialog;
    activeDeleteDialog = null;

    if (controller) {
      controller.close();
      controller.destroy();
    }

    try {
      store.deleteTask(id);
      render();
      showToast(`Deleted "${title}"`, { variant: 'success' });
    } catch (error) {
      if (error instanceof NotFoundError) {
        // Concurrent deletion: the task is already gone. No toast.
        render();
      } else {
        // A storage write failed. The store rolled back; the task
        // is still present. Re-render to reflect the actual state,
        // and show an error toast.
        render();
        showToast('Could not delete the task.', { variant: 'error' });
        console.warn('Delete failed; the task is still present.', error);
      }
    }

    // Restore focus after the render, since the trigger (and its
    // card) may have been removed.
    restoreFocusAfterDelete();
  }

  /**
   * Close the delete dialog without confirming.
   * [unchanged from the delivered file.]
   */
  function closeDeleteDialog() {
    if (!activeDeleteDialog) return;

    const controller = activeDeleteDialog;
    const trigger = deleteDialogTrigger;

    activeDeleteDialog = null;
    deleteDialogTask = null;
    deleteDialogTrigger = null;

    controller.close();
    controller.destroy();

    if (trigger && trigger.isConnected && typeof trigger.focus === 'function') {
      trigger.focus();
      return;
    }

    restoreFocusAfterDelete();
  }

  /**
   * Restore focus after the delete dialog has closed.
   * [unchanged from the delivered file — see that file's docstring
   *  for the focus chain and its rationale.]
   */
  function restoreFocusAfterDelete() {
    const trigger = deleteDialogTrigger;
    const remaining = root.querySelectorAll('[data-cy="task-card-delete"]');

    let focusTarget = null;

    if (trigger && trigger.isConnected) {
      focusTarget = trigger;
    }

    if (!focusTarget && remaining.length > 0) {
      focusTarget = remaining[0];
    }

    if (!focusTarget) {
      focusTarget = root.querySelector('[data-cy="dashboard-create"]');
    }

    if (!focusTarget) {
      focusTarget = root.querySelector('[data-cy="dashboard-list"]');
    }

    deleteDialogTrigger = null;
    deleteDialogTask = null;

    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }
  }

  // ---------------------------------------------------------------------
  // Event handlers — clear all
  // ---------------------------------------------------------------------

  /**
   * Open the clear-all confirmation dialog.
   *
   * The count is read from the store at the click moment, not
   * cached. The button's `disabled` attribute ensures the handler
   * does not run when the store is empty (a disabled button does
   * not dispatch clicks in modern browsers), but the guard
   * (`totalCount === 0`) is defensive — a future change that
   * removed the disabled attribute would still leave the handler
   * safe.
   *
   * Any other open dialog is closed first. Three dialogs cannot
   * stack.
   *
   * @param {HTMLElement} trigger - the clear-all button that was clicked
   */
  function handleClearAllClick(trigger) {
    const totalCount = store.getAll().length;
    if (totalCount === 0) return;

    if (activeDialog) {
      closeActiveDialog();
    }
    if (activeDeleteDialog) {
      closeDeleteDialog();
    }

    clearAllDialogTrigger = trigger || null;
    clearAllDialogCount = totalCount;

    activeClearAllDialog = createClearAllDialog({
      count: totalCount,
      onConfirm: handleClearAllConfirm,
      onCancel: closeClearAllDialog,
    });

    activeClearAllDialog.open();
  }

  /**
   * The confirm path — the most destructive action in the app.
   *
   * Order of operations:
   *
   *   1. Close and destroy the dialog. The close fires the
   *      dialog's `close` event, which the `closedByExplicitAction`
   *      flag suppresses so `onCancel` is not called — this was a
   *      confirm, not a cancel.
   *
   *   2. Call `store.clear()`. If the write fails, the store
   *      rolls back and throws `StorageError`; the handler shows
   *      an error toast and re-renders to reflect the rollback.
   *
   *   3. On success, clear the search query — a stale filter
   *      would leave the user in a "no results" empty state
   *      after clearing, which is confusing ("I cleared
   *      everything; why is it still showing a search filter?").
   *      The search query is not part of the tasks being
   *      cleared, but it is part of the view state the clear
   *      would leave inconsistent.
   *
   *   4. Re-render. The counter drops to 0, the empty state
   *      appears, the clear-all button disables itself.
   *
   *   5. Toast "All tasks cleared."
   *
   *   6. Restore focus. The clear-all button is still present
   *      (now disabled), so focus returns to it. That is the
   *      correct place: the user's action was "clear all from
   *      the sidebar," and their next action is likely still
   *      in the sidebar (create a task, or look at the empty
   *      state).
   */
  function handleClearAllConfirm() {
    const controller = activeClearAllDialog;
    activeClearAllDialog = null;
    clearAllDialogCount = 0;

    if (controller) {
      controller.close();
      controller.destroy();
    }

    try {
      store.clear();
      // Clear the search too — a stale filter after a clear
      // would leave the user in a "no results" state they did
      // not ask for.
      debouncedSearch.cancel();
      searchQuery = '';
      render();
      showToast('All tasks cleared', { variant: 'success' });
    } catch (error) {
      // The store rolled back; the tasks are still present.
      render();
      showToast('Could not clear tasks.', { variant: 'error' });
      console.warn('Clear failed; the tasks are still present.', error);
    }

    // The clear-all button is still in the DOM (the sidebar does
    // not re-render away), so focus returns to it. If it is
    // somehow detached (a future change that hid the sidebar),
    // the fallback chain applies.
    restoreFocusAfterClearAll();
  }

  /**
   * Close the clear-all dialog without confirming.
   *
   * The clear-all button is still in the DOM (no render happened),
   * so focus returns to it directly. If the trigger is somehow
   * detached (a future change), the fallback chain applies.
   */
  function closeClearAllDialog() {
    if (!activeClearAllDialog) return;

    const controller = activeClearAllDialog;
    const trigger = clearAllDialogTrigger;

    activeClearAllDialog = null;
    clearAllDialogCount = 0;
    clearAllDialogTrigger = null;

    controller.close();
    controller.destroy();

    if (trigger && trigger.isConnected && typeof trigger.focus === 'function') {
      trigger.focus();
      return;
    }

    restoreFocusAfterClearAll();
  }

  /**
   * Restore focus after the clear-all dialog has closed.
   *
   * The chain, in order of preference:
   *
   *   1. The clear-all button, IF it is still connected AND enabled.
   *      On the cancel path, the button is still enabled (the store
   *      still has its tasks) — focus lands on it, exactly where the
   *      user clicked.
   *
   *      On the confirm path, the button is still in the DOM but is
   *      now `disabled`. A `disabled` <button> cannot receive focus
   *      in any modern browser: `.focus()` is a no-op, and the focus
   *      stays where it was (which, after the dialog closes, is
   *      `<body>` — the silent a11y regression the delete workflow's
   *      restore chain was built to avoid). The check for
   *      `!disabled` is what keeps that regression out of the
   *      clear-all path.
   *
   *   2. The header create button. After a successful clear, this is
   *      the natural destination: the store is empty, the sidebar's
   *      clear-all is disabled, and the create button is the next
   *      action the user is likely to take. It is always present and
   *      always enabled.
   *
   *   3. The task list container. Last resort.
   *
   * Never `<body>`. The check for `!disabled` in step 1 is what makes
   * this chain honest: the fallback is not "the button is gone," it
   * is "the button is not focusable," and both cases route to the
   * same next candidate.
   */
  function restoreFocusAfterClearAll() {
    const trigger = clearAllDialogTrigger;

    let focusTarget = null;

    // Step 1: the trigger, if still connected AND enabled.
    if (trigger && trigger.isConnected && !trigger.disabled) {
      focusTarget = trigger;
    }

    // Step 1b: the *current* clear-all button, if still connected AND
    // enabled. After a successful confirm, the button persists across
    // the render but is disabled — this step falls through. After a
    // cancel, the button is the same element as the trigger, so
    // step 1 already caught it; this step is defensive against a
    // future change that replaced the button across a render but
    // kept it enabled.
    if (!focusTarget) {
      const currentButton = root.querySelector('[data-cy="dashboard-clear-all"]');
      if (currentButton && !currentButton.disabled) {
        focusTarget = currentButton;
      }
    }

    // Step 2: the header create button.
    if (!focusTarget) {
      focusTarget = root.querySelector('[data-cy="dashboard-create"]');
    }

    // Step 3: the list container.
    if (!focusTarget) {
      focusTarget = root.querySelector('[data-cy="dashboard-list"]');
    }

    clearAllDialogTrigger = null;
    clearAllDialogCount = 0;

    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }
  }

  // ---------------------------------------------------------------------
  // Event handlers — search
  // ---------------------------------------------------------------------

  function handleSearchInput(event) {
    debouncedSearch(event.target.value);
  }

  function handleClearSearch() {
    debouncedSearch.cancel();
    searchQuery = '';
    render();
  }

  // ---------------------------------------------------------------------
  // Event handlers — form submit (create/edit)
  // ---------------------------------------------------------------------

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
        activeDialog.showErrors(error.fields);
        formEl?.removeAttribute('aria-busy');
        return;
      }
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

    const successMessage =
      activeDialogMode === 'create' ? 'Task created' : 'Task saved';
    showToast(successMessage, { variant: 'success' });

    try {
      render();
    } catch (renderError) {
      console.warn('Render failed after a successful save; the dialog will still close.', renderError);
    }

    closeActiveDialog();
    formEl?.removeAttribute('aria-busy');
  }

  function handleDialogCancel() {
    closeActiveDialog();
  }

  // ---------------------------------------------------------------------
  // Create/edit dialog lifecycle
  // ---------------------------------------------------------------------

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
   * Close the active create/edit dialog and restore focus to the
   * trigger.
   * [unchanged from the delivered file.]
   */
  function closeActiveDialog() {
    if (!activeDialog) return;

    for (const detach of dialogDetachers) detach();
    dialogDetachers = [];

    const controller = activeDialog;
    const trigger = dialogTrigger;
    const taskId = activeDialogTask?.id;

    activeDialog = null;
    activeDialogMode = null;
    activeDialogTask = null;
    dialogTrigger = null;

    controller.close();
    controller.destroy();

    let focusTarget = null;
    if (trigger && trigger.isConnected) {
      focusTarget = trigger;
    } else if (taskId) {
      focusTarget = root.querySelector(
        `[data-cy="task-card-edit"][data-task-id="${cssEscape(taskId)}"]`
      );
    }

    if (!focusTarget) {
      focusTarget = root.querySelector('[data-cy="dashboard-create"]');
    }
    if (!focusTarget) {
      focusTarget = root.querySelector('[data-cy="dashboard-list"]');
    }

    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }
  }

  /**
   * CSS.escape shim for safe selector construction.
   */
  function cssEscape(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, '\\$&');
  }

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

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

    if (activeDeleteDialog) {
      const controller = activeDeleteDialog;
      activeDeleteDialog = null;
      deleteDialogTask = null;
      deleteDialogTrigger = null;
      controller.close();
      controller.destroy();
    }

    if (activeClearAllDialog) {
      const controller = activeClearAllDialog;
      activeClearAllDialog = null;
      clearAllDialogCount = 0;
      clearAllDialogTrigger = null;
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