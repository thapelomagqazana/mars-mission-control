/**
 * Toast view — transient notifications mounted to <body>.
 *
 * Why a dedicated view:
 *   A toast is a piece of UI that is not part of the dashboard's tree.
 *   It is mounted on `document.body` (the same host the startup-error
 *   banner uses), it is visible regardless of scroll position, and it
 *   auto-dismisses after a fixed duration. Encapsulating the mount,
 *   dismiss and cleanup in one file keeps the pattern in one place —
 *   the app calls `showToast('Task created')`, the toast does the rest.
 *
 * What this view owns:
 *   The `<div class="toast-region">` host and the toast elements inside
 *   it. The host is created lazily on the first `showToast` call, so an
 *   app that never shows a toast pays nothing for the module. A
 *   future change that wanted a toast with a "Dismiss" button would
 *   extend the view's internal rendering — the app's call site does
 *   not change.
 *
 * What this view does NOT do:
 *   - It does not know about tasks, the store, or the app's state.
 *     It receives a message string and a variant ('success' | 'info' |
 *     'error'), and it renders. The *decision* to show a toast — after
 *     a create, after a delete, after a failed save — is the app's;
 *     the *presentation* is this file's.
 *   - It does not queue toasts. A call while a toast is visible
 *     dismisses the previous toast and shows the new one. A future
 *     "queue toasts" change is a deliberate enhancement (multiple
 *     simultaneous toasts), not a bug fix.
 *   - It does not manage focus. A toast is a live region
 *     (`role="status"`), announced by assistive technology. It does
 *     not steal focus, because focus movement on a transient success
 *     would be more disruptive than the toast's information is
 *     valuable.
 *
 * Accessibility:
 *   - `role="status"` and `aria-live="polite"` on the toast element:
 *     screen readers announce the message when it appears, without
 *     interrupting the user's current activity.
 *   - `aria-atomic="true"`: the whole message is announced, not just
 *     the changed part (the whole toast is new text, so the two
 *     attributes are redundant today — they are set anyway for a
 *     future change that updates a toast in place).
 *   - The toast is positioned `fixed`, so it is visible regardless
 *     of scroll position — a user who scrolled the list away from
 *     the trigger still sees the confirmation.
 *
 * @module views/toast
 */

import { el } from '../utils/dom.js';

/**
 * The id of the toast-region host. One host per document, created
 * lazily on first use. The host is separate from the app's
 * `#app-root` so a full dashboard re-render does not disturb an
 * active toast.
 */
const TOAST_REGION_ID = 'toast-region';

/**
 * How long a toast remains visible before auto-dismissing. Three
 * seconds is the standard "read it, then it goes" duration for a
 * short message. A future change that wanted a *longer* duration
 * for error toasts (which a user might need to read twice) would
 * branch on the variant — the constant stays the default.
 */
const TOAST_DURATION_MS = 3000;

/**
 * The variant → CSS class map. The variant is the app's way of
 * saying "this toast is informational / a success / an error."
 * The class is the view's way of styling the variant. Two
 * concepts, two names — the app does not know the class name,
 * the view does not know why the toast was shown.
 */
const VARIANT_CLASS = Object.freeze({
  success: 'toast--success',
  info: 'toast--info',
  error: 'toast--error',
});

/**
 * The active toast's element, or `null` when no toast is visible.
 * A module-level variable because the toast-region has exactly one
 * toast at a time. A future "queue toasts" change would replace
 * this with an array.
 */
let activeToast = null;
let activeTimer = null;

/**
 * Ensure the toast-region host exists on `document.body`. Created
 * lazily on the first `showToast` call, so importing this module
 * has no side effects.
 *
 * The host is `position: fixed` and its position is managed by the
 * stylesheet; this function only ensures it is in the document.
 *
 * @returns {HTMLElement}
 */
function ensureToastRegion() {
  let region = document.getElementById(TOAST_REGION_ID);
  if (region === null) {
    region = el('div', {
      id: TOAST_REGION_ID,
      class: 'toast-region',
      // The host is a live region container. The *toast* inside it
      // is also a live region (`role="status"`); the outer host is
      // `aria-live="polite"` so the region itself is quiet when
      // empty and announces when a toast appears.
      'aria-live': 'polite',
      'aria-atomic': 'true',
    });
    document.body.appendChild(region);
  }
  return region;
}

/**
 * Dismiss the active toast, if any, and clean up its timer.
 *
 * Called by the auto-dismiss timer and by `showToast` when a new
 * toast replaces the current one. Idempotent: a call when no toast
 * is visible is a no-op.
 */
function dismissActiveToast() {
  if (activeTimer !== null) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  if (activeToast !== null && activeToast.parentNode) {
    activeToast.parentNode.removeChild(activeToast);
  }
  activeToast = null;
}

/**
 * Show a transient toast.
 *
 * @param {string} message - the user-visible message. Should be a
 *   single short sentence ("Task created", "Task updated", "Save
 *   failed"). The view does not enforce a length limit — the
 *   stylesheet's `max-width` does.
 * @param {{ variant?: 'success' | 'info' | 'error', durationMs?: number }} [options]
 *   - variant: the visual style. Defaults to 'success'.
 *   - durationMs: how long the toast is visible. Defaults to
 *     TOAST_DURATION_MS (3s). A future long-form message might
 *     want a longer duration; the caller overrides per call.
 *
 * The toast replaces any currently visible toast — a second call
 * while a toast is on screen dismisses the first, resets the timer,
 * and shows the second. This is the "latest message wins" policy:
 * a user who triggered two actions in quick succession sees the
 * latest outcome, not a queue of past outcomes.
 *
 * Idempotent at the *call* level: calling `showToast` twice in the
 * same tick produces one toast (the second call replaces the first
 * before the first has rendered). Calling `showToast` with an empty
 * message is a no-op — a toast with no text is a layout bug, not a
 * confirmation.
 *
 * The toast is removed on a `setTimeout`; the timer handle is
 * stored so a subsequent `showToast` can clear it (replacement) or
 * so `destroyActiveToast` (not exported today, but a future
 * enhancement) could clear it on app teardown.
 */
export function showToast(message, options = {}) {
  if (typeof message !== 'string' || message.trim() === '') {
    return;
  }

  const { variant = 'success', durationMs = TOAST_DURATION_MS } = options;
  const variantClass = VARIANT_CLASS[variant] || VARIANT_CLASS.info;

  // Replace any active toast. The "latest message wins" policy is
  // deliberate — a queue would show the user two confirmations for
  // two actions, which is more information than they need.
  dismissActiveToast();

  const region = ensureToastRegion();

  const toast = el('div', {
    class: `toast ${variantClass}`,
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
    dataset: { variant },
  }, message);

  region.appendChild(toast);
  activeToast = toast;

  activeTimer = setTimeout(() => {
    activeTimer = null;
    if (activeToast === toast) {
      // Only dismiss if this toast is still the active one — a
      // subsequent `showToast` may have replaced it, in which case
      // the timer has been cleared and this callback would not run.
      // The check is defensive against a future change to the timer
      // management.
      dismissActiveToast();
    }
  }, durationMs);
}

/**
 * Dismiss the active toast immediately.
 *
 * Exported for a future "the app is shutting down" path — a
 * destroy-time call to dismiss a toast that a full teardown would
 * otherwise leave on `document.body`. Not called today; the
 * timer-based dismissal covers the current app's lifecycle.
 *
 * Idempotent: a call when no toast is visible is a no-op.
 */
export function dismissActiveToastNow() {
  dismissActiveToast();
}