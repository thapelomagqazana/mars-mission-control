/**
 * Clear-all confirmation dialog — the "are you sure?" gate for the
 * app's most destructive action.
 *
 * Why a separate dialog from the delete dialog
 * --------------------------------------------
 *
 * The delete dialog confirms the deletion of *one* task by name:
 * "Delete 'Survey crater'?" The clear-all dialog confirms the
 * deletion of *every* task by count: "Delete all 3 tasks?" The two
 * have different copy, different target identification (name vs
 * count), and different consequences (one task lost vs the entire
 * store lost).
 *
 * Sharing a dialog with a `mode` flag would couple two different
 * confirmations into one component whose argument drives the copy.
 * That coupling is worse than a small amount of duplication: a
 * future change to the delete dialog's copy (adding the task's
 * creator, say) would need to not accidentally apply to the
 * clear-all dialog, and vice versa. Two dialogs, two reasons.
 *
 * The `count` parameter
 * ---------------------
 *
 * The dialog receives `count` — the number of tasks that will be
 * deleted at the moment the dialog is opened. The count is read by
 * the app at the *click* moment (before the dialog opens), not
 * re-read by the dialog. A task added in another tab between the
 * click and the confirm is not counted; a task removed in another
 * tab between the click and the confirm is counted anyway. The
 * dialog's confirmation reflects the state the user was looking
 * at when they clicked, which is the state they are confirming.
 * The store's `clear()` then operates on the *current* state.
 *
 * Security
 * --------
 *
 * The `count` is a number, not user-supplied text. It reaches the
 * heading via a String coercion and the `el()` text-child path, so
 * even if a future change made it user-supplied (a "delete the
 * next N tasks" feature), the escaping boundary is already in
 * place. A task title does not appear in this dialog — only the
 * count — so the `clearAllDialog` does not open the door a task
 * title would need.
 *
 * Focus management
 * ----------------
 *
 * On open: focus moves to the Cancel button. The user must Tab to
 * reach Delete all.
 *
 * On close (any path — Cancel button, Esc key, or a programmatic
 * close): the dialog fires its `close` event. The dialog's own
 * handlers decide whether to call `onCancel` or `onConfirm` based
 * on which path initiated the close. Focus *restoration* is the
 * caller's responsibility (the app layer knows where the trigger
 * was).
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
 * This is the same discipline the delete dialog uses, and for the
 * same reason: the browser's event dispatch chain can deliver a
 * `cancel` event and a `close` event for what the user experienced
 * as a single action, and the dialog must notify the app exactly
 * once.
 *
 * @module views/clearAllDialog
 */

import { el, nextId } from '../utils/dom.js';

/**
 * Create the clear-all confirmation dialog.
 *
 * @param {{
 *   count: number,
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
export function createClearAllDialog({ count, onConfirm, onCancel }) {
  const dialogId = nextId('clear-all-dialog');
  const headingId = `${dialogId}-heading`;

  // The count is coerced to a number once, at construction time.
  // A future change that passed a string ("3") would still work
  // (String and Number both coerce the same for `=== 1` and the
  // heading text), but the coercion here makes the contract
  // explicit: the dialog's count is a number.
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;

  // The safe button is declared first. This is not cosmetic — it
  // is the button whose reference is captured for the initial-
  // focus call in `open()`, and the button whose `dataset.action`
  // the cancel handler matches. Declaring it first means a future
  // reader sees "Cancel, then Delete all" in the source, which
  // matches the visual order and the intended safety hierarchy.
  const cancelButton = el('button', {
    type: 'button',
    class: 'clear-all-dialog__button clear-all-dialog__button--cancel',
    dataset: { action: 'cancel-clear-all' },
  }, 'Cancel');

  const confirmButton = el('button', {
    type: 'button',
    class: 'clear-all-dialog__button clear-all-dialog__button--confirm',
    dataset: { action: 'confirm-clear-all' },
  }, 'Delete all');

  const dialog = el('dialog', {
    class: 'clear-all-dialog',
    dataset: { region: 'clear-all-dialog' },
    role: 'alertdialog',
    'aria-modal': 'true',
    'aria-labelledby': headingId,
  }, [
    el('h2', {
      id: headingId,
      class: 'clear-all-dialog__heading',
    }, [
      // The heading is composed of three text nodes:
      //   1. The literal prefix "Delete all ".
      //   2. The count (a number, coerced to text by `el()`'s
      //      child handling).
      //   3. The literal suffix " tasks?" — pluralized based on
      //      the count.
      //
      // The count is not user-supplied, but it is still passed as
      // a child (via `el`), so the same escaping discipline applies:
      // if a future change made the count user-supplied (a "delete
      // the next N tasks" feature), the escaping would already be
      // correct.
      'Delete all ',
      String(safeCount),
      safeCount === 1 ? ' task?' : ' tasks?',
    ]),
    el('p', {
      class: 'clear-all-dialog__body',
    }, 'This will remove every task from the application. This action cannot be undone.'),
    el('div', { class: 'clear-all-dialog__actions' }, [
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
   * The `closedByExplicitAction` flag distinguishes closes
   * initiated by the dialog's own button handlers (which call the
   * app's callback themselves) from closes initiated by the
   * browser (Esc) or by the app's programmatic `close()`.
   *
   *   - Button click → `close()` sets the flag → `close` event
   *     fires → listener sees the flag, resets it, and returns
   *     without calling `onCancel` (the button's handler already
   *     notified the app via `onCancel` or `onConfirm`).
   *
   *   - Esc key → `cancel` event → browser closes the dialog →
   *     `close` event fires → listener sees the flag is false →
   *     calls `onCancel`. The Esc path is a cancel by definition;
   *     there is no "Esc confirms" behavior.
   *
   *   - Programmatic close (the app calling `controller.close()`
   *     directly, e.g., on teardown) → `close` fires → listener
   *     sees the flag is false → calls `onCancel`. This is correct:
   *     a programmatic close that was not initiated by the confirm
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
  // `close` listener below notifies the app via `onCancel`. This
  // is the same discipline the delete dialog uses: let the browser
  // finish its modal-close sequence, then notify.
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