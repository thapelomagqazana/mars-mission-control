/**
 * Keyboard event handlers — Enter submits, Esc closes.
 *
 * Why keyboard handling is explicit:
 *   Browsers do not do the right thing by default in all cases. Enter
 *   in a `<textarea>` inserts a newline instead of submitting the form
 *   — correct for a description field, but a form with a textarea and
 *   no submit button has no way for a keyboard user to submit. Esc on
 *   a `<dialog>` closes the dialog but does not return focus to the
 *   trigger (the element the user clicked to open it), so a keyboard
 *   user is dropped back at the top of the page. The handlers here
 *   fill the gaps between browser behaviour and the catalog's
 *   promise.
 *
 * The catalog records which key events are handled here and which are
 * browser defaults. The distinction matters: a reviewer reading the
 * catalog should not look for a handler for "button activates on
 * Enter" — the browser does that. They should look for a handler for
 * "Esc returns focus to the trigger" — that is the handler here.
 *
 * @module events/keyboard
 */

/**
 * Attach a keydown listener for Escape to a target. The handler runs
 * only when the key is Escape. The `event.preventDefault()` is called
 * so the browser does not also handle the key (e.g. closing a dialog
 * twice, once from the browser default and once from this handler).
 *
 * Returns a detach function so the caller can clean up when the target
 * is replaced.
 *
 * @param {EventTarget} target - the element to listen on
 * @param {(event: KeyboardEvent) => void} onEscape - the handler
 * @returns {() => void} detach function
 */
export function onEscape(target, onEscape) {
  const listener = (event) => {
    if (event.key !== 'Escape' && event.key !== 'Esc') return;
    event.preventDefault();
    onEscape(event);
  };
  target.addEventListener('keydown', listener);
  return () => target.removeEventListener('keydown', listener);
}

/**
 * Attach a keydown listener for Escape specifically to the search
 * input. Escape clears the search and keeps focus in the input, so the
 * user can start typing a new query without clicking.
 *
 * The search input's Escape is separate from the dialog's Escape
 * because they do different things. A shared handler would have to
 * know which context it was in, which is exactly the coupling the
 * event catalog avoids by listing them as separate rows.
 *
 * @param {HTMLInputElement} input - the search input
 * @param {() => void} onClear - the handler that clears the search
 * @returns {() => void} detach function
 */
export function onSearchEscape(input, onClear) {
  return onEscape(input, () => {
    input.value = '';
    onClear();
    // Keep focus in the input so the user can type a new query
    // without reaching for the mouse.
    input.focus();
  });
}