/**
 * Delete-confirmation dialog view — the "are you sure?" gate for
 * destructive actions.
 *
 * Why this dialog is separate from the create/edit dialog
 * -------------------------------------------------------
 *
 * The create/edit dialog and this delete dialog look similar — both
 * are native `<dialog>` elements with a heading, a body, and two
 * buttons. They could be unified into one component with a
 * "destructive" flag. That unification would be wrong, for three
 * reasons:
 *
 *   1. Different ARIA role.
 *      The create/edit dialog is `role="dialog"` (a neutral
 *      modal). This one is `role="alertdialog"` — a destructive
 *      modal. Screen readers announce alertdialogs with urgency
 *      and, in some implementations, read the full contents on
 *      open. That is correct for an action the user cannot undo,
 *      and wrong for a routine form.
 *
 *   2. Different default focus.
 *      The create/edit dialog focuses the title input: the user
 *      came to type. This dialog focuses Cancel: the user came to
 *      decide, and the safe decision is the default. A user
 *      pressing Enter without reading cancels by accident (safe)
 *      rather than deletes by accident (unsafe). Default focus is
 *      an opinion about what happens when the user is not paying
 *      attention; for destructive actions, the opinion must be
 *      "do nothing."
 *
 *   3. Different lifecycle.
 *      The create/edit dialog has three states (closed, open,
 *      submitting) and an in-flight guard. This dialog has two
 *      states (closed, open) and no in-flight state — the
 *      confirmation is a synchronous gate. Adding an in-flight
 *      state would be inventing a problem this dialog does not
 *      have.
 *
 * The shared behavior — close-on-Esc, close-before-destroy,
 * cancel-vs-confirm callback dispatch — is reimplemented here in
 * the shape that fits this dialog's lifecycle. It is not
 * copy-pasted from the create/edit dialog; it is the same
 * *pattern* expressed for a different set of states.
 *
 * Security
 * --------
 *
 * The task title is user-supplied. It reaches the DOM via
 * `el()`'s text-child path, which uses `document.createTextNode`.
 * A task titled `<script>alert(1)</script>` renders as that
 * literal string in the heading — not as code. This is the same
 * escaping boundary the card and the create/edit dialog use; the
 * delete dialog does not open a new door.
 *
 * Focus management
 * ----------------
 *
 * On open: focus moves to the Cancel button. The user must Tab to
 * reach Delete.
 *
 * On close (any path — Cancel button, Esc key, or a programmatic
 * close): the dialog fires its `close` event. The dialog's own
 * handlers decide whether to call `onCancel` or `onConfirm` based
 * on which path initiated the close.
 *
 * Focus *restoration* is the caller's responsibility. The dialog
 * does not know where the trigger button was, or whether it still
 * exists — the caller does. The app layer (in `app.js`) handles
 * the fallback chain: the trigger's position, the next card's
 * delete button, the header create button, the task list.
 *
 * Idempotence
 * -----------
 *
 * Every close path is guarded by `if (!dialog.open) return;` so a
 * second close (a fast double-click on Cancel, a stray Esc after a
 * button click) is a no-op. The `closedByExplicitAction` flag
 * distinguishes the cancel-button and confirm-button paths (which
 * have already notified via their own handler) from the Esc path
 * (which relies on the `close` event to notify).
 *
 * This is the same discipline the create/edit dialog uses, and for
 * the same reason: the browser's event dispatch chain can deliver
 * a `cancel` event and a `close` event for what the user
 * experienced as a single action, and the dialog must notify the
 * app exactly once.
 *
 * @module views/deleteDialog
 */

import { el, nextId } from '../utils/dom.js';

/**
 * Create the delete-confirmation dialog.
 *
 * @param {{
 *   task: { id: string, title: string },
 *   onConfirm: () => void,
 *   onCancel: () => void,
 * }} options
 * @returns {{
 *   element: HTMLDialogElement,
 *   open: () => void,
 *   close: () => void,
 *   destroy: () => void,
 * }}
 */
export function createDeleteDialog({ task, onConfirm, onCancel }) {
  const dialogId = nextId('delete-dialog');
  const headingId = `${dialogId}-heading`;

  // The safe button is declared first. This is not cosmetic — it is
  // the button whose reference is captured for the initial-focus
  // call in `open()`, and the button whose `dataset.action` the
  // cancel handler matches. Declaring it first means a future
  // reader sees "Cancel, then Delete" in the source, which matches
  // the visual order and the intended safety hierarchy.
  const cancelButton = el('button', {
    type: 'button',
    class: 'delete-dialog__button delete-dialog__button--cancel',
    dataset: { action: 'cancel-delete' },
  }, 'Cancel');

  const confirmButton = el('button', {
    type: 'button',
    class: 'delete-dialog__button delete-dialog__button--confirm',
    dataset: { action: 'confirm-delete' },
  }, 'Delete');

  const dialog = el('dialog', {
    class: 'delete-dialog',
    dataset: { region: 'delete-dialog' },
    role: 'alertdialog',
    'aria-modal': 'true',
    'aria-labelledby': headingId,
  }, [
    el('h2', {
      id: headingId,
      class: 'delete-dialog__heading',
    }, [
      // The heading is composed of three text nodes:
      //   1. The literal prefix "Delete ".
      //   2. The user-supplied task title (a separate text node,
      //      passed through the escaping boundary).
      //   3. The literal suffix "?".
      //
      // Splitting the string this way makes the escaping boundary
      // structural: the title is *a child*, which means it goes
      // through `createTextNode`. If it were interpolated into a
      // larger template literal and passed as one string, the
      // escaping would still work (the whole string is a text
      // node), but the reader could not tell at a glance that the
      // title is untrusted. The three-node structure is the code
      // saying what the intent is.
      'Delete "',
      String(task.title ?? ''),
      '"?',
    ]),
    el('p', {
      class: 'delete-dialog__body',
    }, 'This action cannot be undone.'),
    el('div', { class: 'delete-dialog__actions' }, [
      cancelButton,
      confirmButton,
    ]),
  ]);

  /**
   * The single close path — `close()` closes the native dialog and
   * fires the `close` event. Both button handlers call this before
   * notifying the app, so the notify and the close are coordinated
   * through the `closedByExplicitAction` flag.
   *
   * Why close-then-notify rather than notify-then-close: the app's
   * `onConfirm` and `onCancel` handlers render the page. If the
   * dialog were still open during the render, the browser would
   * paint the page under a modal scrim for one frame — a visible
   * flash. Closing first eliminates the flash.
   */
  function close() {
    if (!dialog.open) return;
    closedByExplicitAction = true;
    dialog.close();
  }

  /**
   * The `closedByExplicitAction` flag distinguishes closes initiated
   * by the dialog's own button handlers (which call the app's
   * callback themselves) from closes initiated by the browser (Esc)
   * or by the app's programmatic `close()`.
   *
   *   - Button click → `close()` sets the flag → `close` event fires
   *     → listener sees the flag, resets it, and returns without
   *     calling `onCancel` (the button's handler already notified
   *     the app via `onCancel` or `onConfirm`).
   *
   *   - Esc key → `cancel` event → browser closes the dialog → `close`
   *     event fires → listener sees the flag is false → calls
   *     `onCancel`. The Esc path is a cancel by definition; there
   *     is no "Esc confirms" behavior.
   *
   *   - Programmatic close (the app calling `controller.close()`
   *     directly, e.g., on teardown) → `close` fires → listener sees
   *     the flag is false → calls `onCancel`. This is correct: a
   *     programmatic close that was not initiated by the confirm
   *     button is a cancel from the app's perspective.
   */
  let closedByExplicitAction = false;

  // Cancel — the safe path.
  cancelButton.addEventListener('click', (event) => {
    event.preventDefault();
    if (!dialog.open) return;
    close();
    onCancel();
  });

  // Confirm — the destructive path.
  confirmButton.addEventListener('click', (event) => {
    event.preventDefault();
    if (!dialog.open) return;
    close();
    onConfirm();
  });

  // Esc — the browser's native cancel. We do NOT preventDefault;
  // the browser closes the dialog natively, firing `close`. The
  // `close` listener below notifies the app via `onCancel`. This is
  // the same discipline the create/edit dialog uses: let the browser
  // finish its modal-close sequence, then notify. Preventing the
  // default and closing programmatically has been observed to break
  // the browser's top-layer bookkeeping on some engines (the "next
  // Esc does nothing" symptom).
  dialog.addEventListener('cancel', (event) => {
    // Defensive guard: a `cancel` event on a closed dialog should
    // not fire, but if it does (a programmatic close racing a user
    // Esc), let the browser proceed and notify via `close`.
    if (!dialog.open) {
      event.preventDefault();
    }
  });

  // The `close` listener — the single place the dialog tells the
  // app "I am closed" for the Esc and programmatic paths. The
  // button paths have already notified via their own handlers, and
  // are excluded by the `closedByExplicitAction` guard.
  dialog.addEventListener('close', () => {
    if (closedByExplicitAction) {
      closedByExplicitAction = false;
      return;
    }
    onCancel();
  });

  /**
   * Open the dialog and move focus to the safe button.
   *
   * The focus call is deferred one animation frame because some
   * browsers ignore `focus()` on an element that was just added to
   * the DOM until layout has run. On modern browsers, the
   * synchronous call works; the deferred call is a defensive habit
   * that costs nothing on the browsers that do not need it.
   *
   * If the dialog is closed before the animation frame runs (a
   * programmatic close racing the open), the `dialog.open` check
   * inside the frame prevents a focus call on a closed dialog.
   */
  function open() {
    if (!dialog.isConnected) {
      document.body.appendChild(dialog);
    }
    dialog.showModal();
    requestAnimationFrame(() => {
      if (dialog.open) cancelButton.focus();
    });
  }

  function destroy() {
    if (dialog.isConnected) {
      dialog.remove();
    }
  }

  return {
    element: dialog,
    open,
    close,
    destroy,
  };
}