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
 *   The only mutable state this file owns is the current search query,
 *   the reference to the currently-open dialog, and the list of cleanup
 *   functions associated with that dialog. Everything else derives from
 *   the store or from the query.
 *
 * Re-render policy:
 *   Full replace of the dashboard on every state change. The search
 *   input is preserved because a keystroke re-renders the list and the
 *   counter, not the entire dashboard — the input is the one element
 *   the app does not rebuild.
 *
 * Error handling:
 *   The store throws typed errors (ValidationError, NotFoundError,
 *   StorageError). This file catches them at the boundary: a
 *   ValidationError from a form submit is shown in the dialog; a
 *   NotFoundError from a delete is treated as "already gone" and the
 *   list is refreshed; a StorageError is surfaced to the developer as
 *   a console warning (user-facing toasts are a future improvement).
 *   A programming error (a TypeError from a null reference, say) is
 *   not caught — it is a bug, and a bug should be visible, not
 *   swallowed.
 *
 * Ordering rule (important):
 *   When a handler both mutates the store and closes the dialog,
 *   `render()` runs BEFORE `closeActiveDialog()`. The reason is focus
 *   restoration: `closeActiveDialog` restores focus to the element
 *   that opened the dialog, and that element lives inside `root`.
 *   If `render()` ran after the close, the trigger it just restored
 *   focus to would be removed from the document on the next line, and
 *   focus would fall through to `<body>`. Rendering first means the
 *   trigger is the fresh node and focus lands on it cleanly.
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

  // Cleanup functions associated with the open dialog: Escape handler,
  // focus restoration, anything else `openDialog` installs. Run by
  // `closeActiveDialog` BEFORE the dialog is destroyed, so a handler
  // that needs the dialog's DOM (focus restoration needs the trigger
  // element, not the dialog) still has it.
  //
  // This mirrors `detachers` below: a single array per concern, run
  // and cleared as a unit. The alternative — stashing cleanup on the
  // controller as `_cleanup` — was the previous shape, and it made
  // the controller's contract implicit (a private property added by
  // the caller, not returned by `createTaskDialog`). The array is
  // visible where it is used and has no contract to violate.
  let dialogDetachers = [];

  // The detach functions for the current render's listeners. Every
  // render replaces the listeners, so the previous ones must be
  // detached first.
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
   * one element the app does not rebuild; every other element is fresh
   * on every render.
   *
   * Note on ordering with `closeActiveDialog`: callers that mutate the
   * store and close the dialog in the same action call `render()`
   * FIRST. See the file-level docstring "Ordering rule" for the
   * focus-restoration reasoning.
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
   * Delegation is used for the content container: one listener matches
   * any `[data-action]` descendant. A direct listener is used for the
   * search input, because it is the one element preserved across
   * renders, and the `__wired` guard prevents re-attaching on success.
   */
  function attachListeners() {
    for (const detach of detachers) detach();
    detachers = [];

    // Create button — direct listener, one per render. The button is
    // re-created on every render, so the listener must be re-attached.
    const createButton = root.querySelector('[data-action="open-create-dialog"]');
    if (createButton) {
      const onClick = (event) => handleOpenCreate(event.currentTarget);
      createButton.addEventListener('click', onClick);
      detachers.push(() => createButton.removeEventListener('click', onClick));
    }

    // Search input — direct listener. The input survives re-renders,
    // so the `__wired` guard prevents duplicate attachment.
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
    //
    // The task id is read from the CLOSEST ancestor carrying
    // `data-task-id`, not from `target.dataset.taskId`. This is the
    // single place that decides where the id lives — the view is free
    // to place `data-task-id` on the button or on the card, and this
    // delegation block is the only code that has to know. A handler
    // that read `target.dataset.taskId` directly would couple the
    // handler to the view's DOM shape; if the view later moved the
    // attribute to the card, every handler would silently stop
    // matching.
    const content = root.querySelector('[data-listener="task-actions"]');
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
   * Open the create dialog. `trigger` is the element that received the
   * click (or the delegated action element) — passed explicitly so
   * this handler does not depend on `event.currentTarget`, which is
   * the delegated content container, not the button.
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
      // The task was removed between render and click. Refresh so the
      // view matches the store; do not show an error, the user did
      // not do anything wrong.
      render();
      return;
    }
    openDialog(task, 'edit');
  }

  function handleDeleteClick(taskId) {
    if (!taskId) return;
    const task = store.getById(taskId);
    if (!task) {
      // Same as edit: the task is gone, refresh the view.
      render();
      return;
    }

    // TODO(accessibility): window.confirm ignores the app's theme,
    // cannot meet the register's focus-ring spec (see tokens.css
    // --color-focus-ring), and announces inconsistently across screen
    // readers. Replacing it is a follow-up task; it is NOT part of
    // the design-token work. The seam for the replacement is this
    // single call — a future `confirmDelete(task)` returning a
    // Promise<boolean> can be dropped in with no other change.
    const confirmed = window.confirm(`Delete task "${task.title}"?`);
    if (!confirmed) return;

    try {
      store.deleteTask(task.id);
      render();
    } catch (error) {
      if (error instanceof NotFoundError) {
        // The task was removed between confirmation and delete.
        // Refresh; the user's intent was satisfied.
        render();
      } else {
        // A storage error. The store has already rolled back, so a
        // refresh shows the correct state. The console warning is the
        // developer's debug aid; a user-facing toast is a future
        // improvement (see the TODO above — the same seam).
        render();
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
   * Ordering note: `render()` runs BEFORE `closeActiveDialog()`. See
   * the file-level docstring "Ordering rule" — focus restoration
   * targets an element inside `root`, so it must run against the
   * fresh DOM the render just produced, not the one about to be
   * replaced.
   */
  async function handleFormSubmit(values) {
    if (!activeDialog) return;

    try {
      if (activeDialogMode === 'create') {
        store.create(values);
      } else if (activeDialogMode === 'edit' && activeDialogTask) {
        store.update(activeDialogTask.id, values);
      }
      render();
      closeActiveDialog();
    } catch (error) {
      if (error instanceof ValidationError) {
        // Show the errors in the dialog; the user fixes the fields
        // and submits again. The dialog is not closed — the user is
        // mid-edit and closing it would lose their work.
        activeDialog.showErrors(error.fields);
      } else {
        // A storage error during create or update. The store has
        // rolled back the in-memory change. Render first (fresh DOM),
        // then close (focus restore lands on the fresh trigger).
        render();
        closeActiveDialog();
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

  /**
   * Open the create or edit dialog.
   *
   * Cleanup functions are pushed onto `dialogDetachers` in the order
   * they should run on close. The order is: Escape handler first (stop
   * listening), focus restoration second (return focus to the
   * trigger), so the Escape handler cannot fire during the restore.
   * Running in reverse would be harmless here, but the order is
   * documented so a future addition can reason about it.
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

    // Focus the title input on open. The dialog's own code cannot do
    // this because it does not know which input is "first" — that is
    // an app-level decision, and this is where the app makes it.
    const titleInput = activeDialog.element.querySelector('input[name="title"]');
    const restoreFocus = focusOnOpen(activeDialog.element, dialogTrigger, titleInput);
    dialogDetachers.push(restoreFocus);

    // Esc closes the dialog, same as the cancel button. The dialog's
    // own `close` event is not used here because it fires for submit
    // too, and a submit is not a cancel.
    const detachEscape = onEscape(activeDialog.element, () => {
      handleDialogCancel();
    });
    dialogDetachers.push(detachEscape);
  }

  function closeActiveDialog() {
    if (!activeDialog) return;

    // Detach the dialog's listeners first, so a focus-restore that
    // happens to dispatch an event (it does not today; it might in the
    // future) does not re-enter this function through the Escape
    // handler.
    for (const detach of dialogDetachers) detach();
    dialogDetachers = [];

    const controller = activeDialog;
    activeDialog = null;
    activeDialogMode = null;
    activeDialogTask = null;

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

    for (const detach of dialogDetachers) detach();
    dialogDetachers = [];

    debouncedSearch.cancel();

    if (activeDialog) {
      activeDialog.destroy();
      activeDialog = null;
      activeDialogMode = null;
      activeDialogTask = null;
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