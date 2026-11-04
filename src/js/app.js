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
 * ## Startup resilience (the P-03 / P-04 recovery boundary)
 *
 * [unchanged from the delivered file — see that file for the full
 *  rationale on the in-memory store fallback.]
 *
 * ## Focus restoration after a render
 *
 * The dialog captures the trigger element on open (`dialogTrigger`).
 * On close, focus returns to that element so a keyboard user does
 * not lose their place.
 *
 * However, if a save succeeds, `render()` runs *before* the dialog
 * closes. The render replaces the entire dashboard, so the original
 * trigger button is detached. Calling `.focus()` on a detached node
 * is a no-op. The `closeActiveDialog` function resolves the trigger
 * to its *current* equivalent in the DOM: the newly-rendered edit
 * button for the same task, or the header create button.
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
  // Dialog lifecycle
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
   * Close the active dialog and restore focus to the trigger.
   *
   * If a render has already happened (which it does on the success
   * path — `render()` runs before `closeActiveDialog` to show the
   * updated card), the original trigger button is detached. Calling
   * `.focus()` on a detached node is a no-op in some browsers and
   * silently fails in others.
   *
   * To fix this, we search the *current* DOM for the element that
   * should receive focus:
   *
   *   1. If the original trigger is still in the DOM, use it.
   *   2. If the trigger was an edit button, look for the replacement
   *      edit button for the same task id.
   *   3. Fall back to the header create button, or the list container.
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

    // Resolve the focus target.
    let focusTarget = null;
    if (trigger && trigger.isConnected) {
      focusTarget = trigger;
    } else if (taskId) {
      // The trigger was detached (a render happened). Find the new
      // edit button for the same task.
      focusTarget = root.querySelector(
        `[data-cy="task-card-edit"][data-task-id="${cssEscape(taskId)}"]`
      );
    }
    
    // Fallback: if no task id, or the button is gone (e.g., task was deleted),
    // focus the header create button, or the list container.
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
  }

  // Initial render.
  render();

  return {
    render,
    store,
    destroy,
  };
}