/**
 * Application event layer — wires events to the store and views.
 *
 * Why this file exists:
 *   The store owns data. The views own rendering. Neither knows about
 *   the other, and neither knows about browser events. This file is the
 *   seam: it listens for events, calls the store or the views in the
 *   right order, and re-renders. Every handler here corresponds to a
 *   supported user action; a handler without a caller is dead code,
 *   and a user action without a handler is unimplemented behaviour.
 *   The contract tests assert the two agree.
 *
 * Layer discipline:
 *   This file is the event layer. It imports the store, the views, the
 *   event helpers, and the DOM helper. It is the only place that knows
 *   about all of them. It does not implement rendering (the views do),
 *   does not implement persistence (the store does), and does not
 *   implement validation (the store and validators do).
 *
 * State ownership:
 *   The only mutable state this file owns is the current search query
 *   and the reference to the currently-open dialog. Everything else
 *   derives from the store or from the query. The query is held here,
 *   not in the store, because the store does not know about search —
 *   search is a view concern, and the event layer is where the view's
 *   concerns live between renders.
 *
 * Re-render policy:
 *   Full replace of the dashboard on every state change. The search
 *   input is preserved because a keystroke re-renders the list and the
 *   counter, not the entire dashboard — the input is the one element
 *   the app does not rebuild. This is the rendering contract's
 *   compromise, and this file is where the compromise is implemented.
 *
 * Error handling:
 *   The store throws typed errors (ValidationError, NotFoundError,
 *   StorageError). This file catches them at the boundary: a
 *   ValidationError from a form submit is shown in the dialog; a
 *   NotFoundError from a delete is treated as "already gone" and the
 *   list is refreshed; a StorageError is surfaced to the user as a
 *   non-blocking notice. A programming error (a TypeError from a null
 *   reference, say) is not caught — it is a bug, and a bug should be
 *   visible, not swallowed.
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
import { createStorageAdapter } from './utils/storage.js';
import { SEARCH_DEBOUNCE_MS, debounce } from './events/debounce.js';
import { onEscape, onSearchEscape } from './events/keyboard.js';
import { focusOnOpen } from './events/focus.js';
import { replaceChildren, requireEl } from './utils/dom.js';

/**
 * Filter tasks by query.
 *
 * The filter is case-insensitive across the three searchable fields
 * (title, description, assignee). The rule lives here rather than in
 * the store because the store does not know about search — search is a
 * view concern, and this is the layer that holds the view's state
 * between renders.
 *
 * The empty query is treated as "no filter" (return all tasks), not
 * as "match nothing." That is the behaviour a user expects: an empty
 * search shows the full list.
 *
 * Moved to module scope: it is pure, takes everything it needs as
 * arguments, and references nothing from the `startApp` closure.
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
 * Called once by `src/js/index.js`. Sets up the store, mounts the
 * dashboard, attaches listeners, and returns a reference to the app's
 * internal functions so a test can drive the app without a browser
 * click. The return value is not part of the public API; the entry
 * point ignores it.
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
 *
 * The `options` parameter exists so a test can pass an in-memory
 * persistence adapter and a scratch root element. Production callers
 * pass nothing; the defaults find `#app-root` in the document and use
 * the browser's localStorage.
 */
export function startApp(options = {}) {
  const root = options.root || requireEl(document, '#app-root');
  const persistence = options.persistence || createStorageAdapter();
  const store = createTaskStore(persistence);

  // The query is the only piece of view state the event layer owns.
  // It is not in the store because the store does not know about
  // search; it is not in the dashboard because the dashboard is
  // re-rendered from scratch and would lose it. Here, it survives the
  // re-renders that matter (keystroke → list update) and is reset only
  // by an explicit clear.
  let searchQuery = '';

  // The element that opened the current dialog. Captured on open and
  // restored on close so a keyboard user does not lose their place.
  let dialogTrigger = null;

  // The current dialog controller, or null when no dialog is open.
  // The controller is created by `openDialog` and destroyed by
  // `closeActiveDialog`. Holding it here (rather than on the dialog's
  // own state) means the app can close the dialog from any path —
  // submit, cancel, escape, or a programmatic call.
  let activeDialog = null;
  let activeDialogMode = null;
  let activeDialogTask = null;

  // The detach functions for the current render's listeners. Every
  // render replaces the listeners, so the previous ones must be
  // detached first. Without this, every render would add a listener
  // to the new node and leave the old one attached to a detached
  // node — a leak that is invisible until the page slows down.
  let detachers = [];

  /**
   * The debounced search handler.
   *
   * Created once per app, not per render. The debounce timer survives
   * across renders, which is what lets a fast typist's keystrokes be
   * coalesced into one render even if the list re-renders between
   * keystrokes (which it does not, but the timing must not depend on
   * that assumption).
   */
  const debouncedSearch = debounce((query) => {
    searchQuery = query;
    render();
  }, SEARCH_DEBOUNCE_MS);

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------

  /**
   * Render the dashboard from the current store state and search query.
   *
   * Full replace of the dashboard's subtree. The search input is the
   * one element the app rebuilds (per the rendering contract's
   * compromise); every other element is fresh on every render.
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
        renderTaskList: (tasks) =>
          renderTaskList(tasks, { emptyReason }),
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
   * Delegation is used for the list: one listener on the content
   * container matches clicks on any card's edit or delete button. A
   * direct listener is used for the search input and the create button,
   * because there is exactly one of each and the listener is re-attached
   * on every render (the input is preserved, but its listeners are not
   * — the input is the same node, so its listeners are not re-attached;
   * the `__wired` guard on the input prevents duplicate attachment).
   */
  function attachListeners() {
    // Detach the old listeners first. The listeners attached to the
    // previous render's nodes are still attached to those nodes; the
    // nodes are gone, but a reference to a listener on a detached node
    // is still a leak until GC collects it (which it will, once no
    // reference remains). Explicit detach makes the lifetime obvious.
    for (const detach of detachers) detach();
    detachers = [];

    // Create button — a direct listener, one per render. The button is
    // re-created on every render, so the listener must be re-attached.
    const createButton = root.querySelector('[data-action="open-create-dialog"]');
    if (createButton) {
      const onClick = (event) => handleOpenCreate(event);
      createButton.addEventListener('click', onClick);
      detachers.push(() => createButton.removeEventListener('click', onClick));
    }

    // Search input — a direct listener. The input survives re-renders
    // (it is the one element the app does not rebuild), so the
    // `__wired` guard prevents attaching the same listener twice on
    // successive renders. The guard is a property on the element; a
    // detached element loses it, which is correct (the next render
    // creates a fresh input and a fresh listener).
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

    // Content container — delegation for card actions. One listener
    // matches any `[data-action]` descendant of the content region.
    // The listener is attached fresh on every render (the container
    // is re-created), so no `__wired` guard is needed or wanted here.
    const content = root.querySelector('[data-region="content"]');
    if (content) {
      const onClick = (event) => {
        const target = event.target.closest('[data-action]');
        if (!target || !content.contains(target)) return;
        const action = target.dataset.action;
        if (action === 'edit-task') handleEditClick(target);
        else if (action === 'delete-task') handleDeleteClick(target);
        else if (action === 'clear-search') handleClearSearch();
        else if (action === 'open-create-dialog') handleOpenCreate(event, target);
      };
      content.addEventListener('click', onClick);
      detachers.push(() => content.removeEventListener('click', onClick));
    }
  }

  // ---------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------

  function handleOpenCreate(event, target) {
    dialogTrigger = target || event.currentTarget;
    openDialog(null, 'create');
  }

  function handleEditClick(button) {
    dialogTrigger = button;
    const task = store.getById(button.dataset.taskId);
    if (!task) {
      // The task was removed between render and click. Refresh so the
      // view matches the store; do not show an error, the user did not
      // do anything wrong.
      render();
      return;
    }
    openDialog(task, 'edit');
  }

  function handleDeleteClick(button) {
    const task = store.getById(button.dataset.taskId);
    if (!task) {
      // Same as edit: the task is gone, refresh the view.
      render();
      return;
    }
    // The confirmation is synchronous (window.confirm). A future
    // improvement would replace it with a styled confirm dialog, but
    // the current behaviour is what the user sees today.
    const confirmed = window.confirm(`Delete task "${task.title}"?`);
    if (!confirmed) return;
    try {
      store.deleteTask(task.id);
      render();
    } catch (error) {
      if (error instanceof NotFoundError) {
        // The task was removed between the confirmation and the
        // delete. Refresh; the user's intent was satisfied.
        render();
      } else {
        // A storage error is not the user's fault and not the
        // user's responsibility to fix by retrying — but the store
        // has already rolled back, so a refresh shows the correct
        // state.
        render();
        // The console warning is the developer's debug aid. A future
        // improvement would surface this to the user as a toast.
        console.warn('Delete failed; the task is still present.', error);
      }
    }
  }

  function handleSearchInput(event) {
    debouncedSearch(event.target.value);
  }

  function handleClearSearch() {
    // Cancel any pending debounced render so a stale query does not
    // fire after the clear.
    debouncedSearch.cancel();
    searchQuery = '';
    render();
  }

  /**
   * Submit the dialog's form. Creates or updates depending on the
   * dialog mode, then closes the dialog on success.
   *
   * The dialog calls this with the form's values; the store decides
   * whether the values are valid. A ValidationError is shown in the
   * dialog (the user can fix the input); anything else is a
   * programming error and is rethrown.
   */
  async function handleFormSubmit(values) {
    if (!activeDialog) return;

    try {
      if (activeDialogMode === 'create') {
        store.create(values);
      } else if (activeDialogMode === 'edit' && activeDialogTask) {
        store.update(activeDialogTask.id, values);
      }
      closeActiveDialog();
      render();
    } catch (error) {
      if (error instanceof ValidationError) {
        // Show the errors in the dialog; the user fixes the fields
        // and submits again. The dialog is not closed — the user is
        // mid-edit and closing it would lose their work.
        activeDialog.showErrors(error.fields);
      } else {
        // A storage error during create or update. The store has
        // rolled back the in-memory change, so the dialog is still
        // the right place for the user to be; close it and show a
        // notice. The failure path is a future improvement.
        closeActiveDialog();
        render();
        console.warn('Save failed; the change was not applied.', error);
      }
    }
  }

  function handleDialogCancel() {
    closeActiveDialog();
  }

  // ---------------------------------------------------------------------
  // Dialog lifecycle
  // ---------------------------------------------------------------------

  function openDialog(task, mode) {
    activeDialog = createTaskDialog({
      mode,
      task,
      onSubmit: handleFormSubmit,
      onCancel: handleDialogCancel,
    });
    activeDialogMode = mode;
    activeDialogTask = task;

    activeDialog.open();

    // Focus the title input on open. The dialog's own code cannot do
    // this because it does not know which input is "first" — that is
    // an app-level decision, and this is where the app makes it.
    const titleInput = activeDialog.element.querySelector('input[name="title"]');
    const restoreFocus = focusOnOpen(activeDialog.element, dialogTrigger, titleInput);

    // Esc closes the dialog, same as the cancel button. The dialog's
    // own `close` event is not used here because it fires for submit
    // too, and a submit is not a cancel.
    const detachEscape = onEscape(activeDialog.element, () => {
      handleDialogCancel();
    });

    // Stash the detach functions on the dialog controller so
    // closeActiveDialog can clean up. A `_cleanup` property on the
    // controller keeps the wiring visible without a separate map.
    activeDialog._cleanup = () => {
      detachEscape();
      restoreFocus();
    };
  }

  function closeActiveDialog() {
    if (!activeDialog) return;
    const controller = activeDialog;
    activeDialog = null;
    activeDialogMode = null;
    activeDialogTask = null;

    // Restore focus before destroying the dialog, so the trigger is
    // the active element when the dialog's DOM is removed. If the
    // dialog is destroyed first, the trigger reference is still valid
    // (it is a DOM node), but the focus is lost in the interim.
    if (typeof controller._cleanup === 'function') {
      controller._cleanup();
    }
    controller.destroy();
  }

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  /**
   * Tear down the app. Called by tests and by any future hot-reload
   * integration. Detaches every listener and destroys the active
   * dialog, so a re-mount does not leave stale listeners on detached
   * nodes.
   */
  function destroy() {
    for (const detach of detachers) detach();
    detachers = [];
    debouncedSearch.cancel();
    if (activeDialog) {
      activeDialog.destroy();
      activeDialog = null;
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