/**
 * Application event layer — wires events to the store and views.
 *
 * [the delivered file's header comment — including the layer
 *  discipline, state ownership, re-render policy, error handling,
 *  ordering rule, the create workflow end to end, the
 *  double-submission note, the header create affordance, the
 *  cancel-flow idempotence, the single-open and close-before-destroy
 *  sections, the startup-resilience section, and the "three dialogs,
 *  one at a time" and "focus restoration, per dialog" sections — is
 *  preserved. See the previous deliveries for the full rationale.]
 *
 * The empty reason threading
 *   The `render` function computes `emptyReason` from the current
 *   query: 'no-tasks' when the query is empty, 'no-results' when a
 *   query is active. That value must reach the list view, because
 *   the list is what decides which empty state to render when its
 *   tasks array is empty.
 *
 *   The path is:
 *
 *     render() computes emptyReason
 *       → renderDashboardFilled receives it via the config
 *         → renderSearchResults (injected closure) receives it
 *           → renderSearchResults (view) forwards it to
 *             renderTaskList
 *             → renderTaskList (view) reads it and calls
 *               renderEmptyState(reason)
 *
 *   The delivered version of this file wired every layer except
 *   the last one: it built a `renderTaskList` closure that captured
 *   `emptyReason`, but then passed the *raw* imported
 *   `renderTaskList` to `renderSearchResults` — the closure and the
 *   closure's wrapper never met. The search view received the raw
 *   function, which defaults `emptyReason` to 'no-tasks', so a
 *   search that matched nothing rendered the "no tasks yet" empty
 *   state. The fix is to pass `emptyReason` explicitly to the
 *   search view; the search view forwards it; the list honors it.
 *
 *   A future change that added a second caller of `renderTaskList`
 *   from the app layer (a non-search list path) would need to
 *   decide its own `emptyReason` and pass it explicitly. The
 *   config object no longer carries a `renderTaskList` field —
 *   `renderDashboardFilled` does not use one, and the search view
 *   receives the imported function directly. One consumer, one
 *   wiring, one place the reason lives.
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

  let dialogTrigger = null;
  let activeDialog = null;
  let activeDialogMode = null;
  let activeDialogTask = null;
  let dialogDetachers = [];

  let deleteDialogTrigger = null;
  let activeDeleteDialog = null;
  let deleteDialogTask = null;

  let clearAllDialogTrigger = null;
  let activeClearAllDialog = null;
  let clearAllDialogCount = 0;

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
        // The emptyReason is threaded through the injected search
        // renderer so the search view can forward it to the list
        // view. The delivered version dropped it here — the search
        // view then called `renderTaskList(tasks)` without the
        // reason, and the list defaulted to 'no-tasks', rendering
        // the wrong empty state when a search matched nothing. See
        // the module header's "The empty reason threading" section.
        renderSearchResults: (query, tasks) =>
          renderSearchResults({
            query,
            tasks,
            emptyReason,
            renderTaskList,
          }),
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
        render();
      } else {
        render();
        showToast('Could not delete the task.', { variant: 'error' });
        console.warn('Delete failed; the task is still present.', error);
      }
    }

    restoreFocusAfterDelete();
  }

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
      debouncedSearch.cancel();
      searchQuery = '';
      render();
      showToast('All tasks cleared', { variant: 'success' });
    } catch (error) {
      render();
      showToast('Could not clear tasks.', { variant: 'error' });
      console.warn('Clear failed; the tasks are still present.', error);
    }

    restoreFocusAfterClearAll();
  }

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

  function restoreFocusAfterClearAll() {
    const trigger = clearAllDialogTrigger;

    let focusTarget = null;

    if (trigger && trigger.isConnected && !trigger.disabled) {
      focusTarget = trigger;
    }

    if (!focusTarget) {
      const currentButton = root.querySelector('[data-cy="dashboard-clear-all"]');
      if (currentButton && !currentButton.disabled) {
        focusTarget = currentButton;
      }
    }

    if (!focusTarget) {
      focusTarget = root.querySelector('[data-cy="dashboard-create"]');
    }

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