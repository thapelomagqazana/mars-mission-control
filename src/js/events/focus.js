/**
 * Focus management for the dialog.
 *
 * Why focus is explicit:
 *   `<dialog showModal()>` focuses the first focusable child when the
 *   dialog opens, but "first focusable child" is the close button (or
 *   the first button in DOM order), not the first text input. A user
 *   who opens the create dialog expects to start typing, not to tab
 *   past the close button to find the title field.
 *
 *   When the dialog closes, the browser does not return focus to the
 *   element that opened it. The user is dropped at the top of the page
 *   (or at the start of the body), and a keyboard user loses their
 *   place. The handler here captures the trigger on open and restores
 *   focus on close.
 *
 * The catalog records both focus behaviours. The tests assert that
 * focus lands on the title input on open and on the trigger on close.
 *
 * @module events/focus
 */

/**
 * Capture the element that opened the dialog, focus the first user
 * input, and return a function that restores focus to the trigger.
 *
 * The returned function is the counterpart of the focus-on-open
 * behaviour. It is called when the dialog closes, whether the close
 * was a cancel, an escape, or a successful submit. Focus always
 * returns to where the user was, which is the only behaviour that
 * does not surprise a keyboard user.
 *
 * @param {HTMLDialogElement} dialog - the dialog that was opened
 * @param {HTMLElement | null} trigger - the element that opened it
 *   (from `document.activeElement` before the dialog was mounted)
 * @param {HTMLInputElement} firstInput - the input to focus
 * @returns {() => void} the focus-restore function
 */
export function focusOnOpen(dialog, trigger, firstInput) {
  if (firstInput && typeof firstInput.focus === 'function') {
    // Queue the focus to the next microtask so the dialog has time to
    // be mounted and the browser's own focus logic (which focuses the
    // first focusable child) has already run. Without the microtask,
    // the browser's focus can land after ours and overwrite it.
    queueMicrotask(() => firstInput.focus());
  }
  return () => {
    if (trigger && typeof trigger.focus === 'function') {
      trigger.focus();
    } else if (dialog && typeof dialog.close === 'function' && dialog.open) {
      // Fall back to closing the dialog, which (in browsers that
      // support it) returns focus to the previously focused element.
      dialog.close();
    }
  };
}