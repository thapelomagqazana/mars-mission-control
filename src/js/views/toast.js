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
 *   app that never shows a toast pays nothing for the module.
 *
 * What this view does NOT do:
 *   - It does not know about tasks, the store, or the app's state.
 *     It receives a message string, a variant, and (optionally) an
 *     action, and it renders. The *decision* to show a toast — after
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
 *     valuable. If an action button is rendered inside the toast
 *     (see `action` below), the user tabs into it — the toast does
 *     not force focus onto the button.
 *
 * The `action` parameter
 *   `showToast(message, { action: { label, onClick } })` renders an
 *   optional button inside the toast. The button's `onClick` is
 *   called when the user clicks or presses Enter/Space on the
 *   button, and the toast is dismissed in the same tick (the toast
 *   has served its purpose).
 *
 *   Nothing in this stage uses it. It is plumbing for two future
 *   features that are commonly requested after a delete lands:
 *
 *     - "Deleted 'X' — Undo" (a 3–5 second grace window). The app
 *       would capture the deleted task object before the delete,
 *       render the toast with `action: { label: 'Undo', onClick:
 *       () => { store.create(deletedTask); render(); } }`, and
 *       schedule a real delete after the toast's timer. That
 *       feature is out of scope here; the API is here for when it
 *       lands.
 *
 *     - "Could not save — Retry". The app would capture the
 *       submission values before the save, render the error toast
 *       with `action: { label: 'Retry', onClick: () => { ... } }`.
 *
 *   Both features are the same shape: a toast with a button that
 *   does something on click. The parameter is the same shape; the
 *   button's `aria-label` is set to the label, its `type` is
 *   `button` (never `submit` — the toast is not in a form), and
 *   its click does not navigate.
 *
 * Accessibility:
 *   - `role="status"` and `aria-live="polite"` on the toast element:
 *     screen readers announce the message when it appears, without
 *     interrupting the user's current activity.
 *   - `aria-atomic="true"`: the whole message is announced.
 *   - The toast is positioned `fixed`, so it is visible regardless
 *     of scroll position.
 *   - When an action button is present, the toast's accessible name
 *     is still the message (the button is a child, not part of the
 *     name); a screen reader announces the message, then the button
 *     is reachable via Tab. The button's `aria-label` is its own
 *     label, so a screen-reader user hears "Undo, button" after the
 *     status message.
 *
 * Teardown:
 *   `dismissActiveToastNow` is exported and called by the app's
 *   `beforeunload` handler (added by `startApp`). A toast that
 *   survives a page unload would be invisible (the page is gone)
 *   but the module would still hold a reference to a detached
 *   node and a pending timer — a small memory leak that is best
 *   avoided. The `beforeunload` hook is the natural place to clean
 *   it up.
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
 * short message.
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
 * toast at a time.
 */
let activeToast = null;
let activeTimer = null;

/**
 * Ensure the toast-region host exists on `document.body`. Created
 * lazily on the first `showToast` call, so importing this module
 * has no side effects.
 *
 * @returns {HTMLElement}
 */
function ensureToastRegion() {
  let region = document.getElementById(TOAST_REGION_ID);
  if (region === null) {
    region = el('div', {
      id: TOAST_REGION_ID,
      class: 'toast-region',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    });
    document.body.appendChild(region);
  }
  return region;
}

/**
 * Dismiss the active toast, if any, and clean up its timer.
 * Idempotent: a call when no toast is visible is a no-op.
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
 *   single short sentence ("Task created", "Task deleted", "Save
 *   failed"). The view does not enforce a length limit — the
 *   stylesheet's `max-width` does.
 * @param {{
 *   variant?: 'success' | 'info' | 'error',
 *   durationMs?: number,
 *   action?: { label: string, onClick: () => void },
 * }} [options]
 *   - variant: the visual style. Defaults to 'success'.
 *   - durationMs: how long the toast is visible. Defaults to
 *     TOAST_DURATION_MS (3s).
 *   - action: an optional button rendered inside the toast. See the
 *     module header for the two future features it enables.
 */
export function showToast(message, options = {}) {
  if (typeof message !== 'string' || message.trim() === '') {
    return;
  }

  const {
    variant = 'success',
    durationMs = TOAST_DURATION_MS,
    action = null,
  } = options;

  const variantClass = VARIANT_CLASS[variant] || VARIANT_CLASS.info;

  // Replace any active toast. The "latest message wins" policy is
  // deliberate — a queue would show the user two confirmations for
  // two actions, which is more information than they need.
  dismissActiveToast();

  const region = ensureToastRegion();

  // The toast's children: the message text, and (when an action is
  // provided) a button. The message is a text node (via `el`'s
  // child path); the button is its own element. The button is
  // declared before the message is appended so the message can be
  // wrapped in a span if a future change wants the message and
  // the button to have separate layout control.
  const toastChildren = [message];

  if (action && typeof action.onClick === 'function' && typeof action.label === 'string' && action.label.trim() !== '') {
    const actionButton = el('button', {
      type: 'button',
      class: 'toast__action',
      'aria-label': action.label,
      dataset: { action: 'toast-action' },
    }, action.label);

    actionButton.addEventListener('click', (event) => {
      event.preventDefault();
      // Dismiss the toast first, so the action's effect (e.g., an
      // undo re-render) happens against a clean toast region.
      dismissActiveToast();
      try {
        action.onClick();
      } catch (error) {
        // An action handler that throws should not leave a broken
        // toast state. Log it and let the app's error boundary (if
        // any) handle the rest.
        console.warn('Toast action handler threw.', error);
      }
    });

    toastChildren.push(actionButton);
  }

  const toast = el('div', {
    class: `toast ${variantClass}`,
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
    dataset: { variant },
  }, toastChildren);

  region.appendChild(toast);
  activeToast = toast;

  activeTimer = setTimeout(() => {
    activeTimer = null;
    if (activeToast === toast) {
      // Only dismiss if this toast is still the active one — a
      // subsequent `showToast` may have replaced it, in which case
      // the timer has been cleared and this callback would not run.
      dismissActiveToast();
    }
  }, durationMs);
}

/**
 * Dismiss the active toast immediately.
 *
 * Exported for two callers:
 *
 *   1. The app's `beforeunload` handler (registered by `startApp`).
 *      A toast that survives a page unload holds a reference to a
 *      detached node and a pending timer — a small memory leak
 *      that the unload hook cleans up.
 *
 *   2. A future "app teardown" path — a full destroy that should
 *      not leave a toast on `document.body`.
 *
 * Idempotent: a call when no toast is visible is a no-op.
 */
export function dismissActiveToastNow() {
  dismissActiveToast();
}