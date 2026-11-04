/**
 * Startup error handling — installs the window-level error handlers
 * and the startup-complete signal.
 *
 * Why this module exists:
 *   Startup is a sequence of steps that can fail: the mount can be
 *   missing, the persisted state can be corrupted, the first render
 *   can throw, and the event-layer can fail to attach its listeners.
 *   Each failure has a different user-visible outcome, and each one
 *   is handled by a different layer. But the failures share one
 *   property: if nothing catches them, the user sees a blank page
 *   with no clue about what went wrong.
 *
 *   This module catches them. It installs `window.onerror` and
 *   `window.onunhandledrejection` before any application code runs,
 *   and it exposes a `markStartupComplete` function that the entry
 *   calls after the app has started. A failure that fires before
 *   `markStartupComplete` is a **startup failure** — the app never
 *   finished starting — and is shown to the user as such. A failure
 *   that fires after is an **application failure** — the app started,
 *   something went wrong later — and is logged for the developer
 *   without a user-facing message.
 *
 * Why the handlers are installed first:
 *   The entry point's first import is this module. Its top-level code
 *   runs the moment the bundle executes, before the mount lookup,
 *   before the store loads, before `startApp`. A failure in any of
 *   those steps is caught by the handlers; a failure before the
 *   handlers would be caught by the browser's default (a red
 *   `Uncaught ...` line in the console, no user-facing message). The
 *   handlers are what make "startup failure" a visible category.
 *
 * What this module does NOT do:
 *   - It does not render anything. The user-facing message is a
 *     minimal element appended to `document.body`; the app's views
 *     are not loaded yet when it fires.
 *   - It does not recover. It reports. Recovery is the caller's
 *     decision (a reload button, a "clear storage" button); the
 *     module does not invent it.
 *   - It does not suppress the console error. The browser still
 *     logs it; the handler adds the user-facing message and the
 *     classification. A silent failure is the worst kind; the
 *     console entry is the developer's evidence.
 *
 * @module startup
 */

/**
 * Whether the application has finished starting.
 *
 * Set to `true` by `markStartupComplete`, called from the entry
 * after `startApp` returns. A failure before this is a startup
 * failure; a failure after is an application failure.
 */
let startupComplete = false;

/**
 * The id of the user-facing error banner. Used by the failure
 * handler and by tests that want to assert the banner's presence.
 */
const STARTUP_ERROR_BANNER_ID = 'startup-error';

/**
 * Install the startup's error handlers.
 *
 * Called once, as the entry's first import. The function is
 * idempotent: a second call is a no-op, so a test that imports the
 * module twice does not double-install.
 *
 * The handlers:
 *   - `error` — a synchronous uncaught exception. The handler
 *     receives the error, the source file, the line, and the column.
 *   - `unhandledrejection` — a promise rejection with no `catch`.
 *     The handler receives the promise and the rejection reason.
 *
 * Both handlers call `reportStartupFailure` with a classification
 * and the error. The classification is "startup" if the app has not
 * finished starting, "application" if it has.
 */
export function installStartupErrorHandlers() {
  if (typeof window === 'undefined') {
    // The module is imported by tests that run in `node` (no
    // `window`). The handlers are a browser concern; a `node`
    // environment has no `window` and does not need them. The
    // module is safe to import anywhere.
    return;
  }

  if (window.__startupErrorHandlersInstalled) {
    return;
  }
  window.__startupErrorHandlersInstalled = true;

  window.addEventListener('error', (event) => {
    reportStartupFailure('error', event.error || new Error(event.message), {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportStartupFailure(
      'unhandledrejection',
      event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      { source: 'promise' }
    );
  });
}

/**
 * Mark the startup as complete.
 *
 * Called by the entry after `startApp` returns. After this call, a
 * failure is an application failure, not a startup failure: the app
 * is running, and the failure is something that happened later.
 *
 * Exported so the entry can call it and so tests can assert it was
 * called (the test spies on it or checks a flag).
 */
export function markStartupComplete() {
  startupComplete = true;
}

/**
 * Report a failure.
 *
 * @param {'error'|'unhandledrejection'} kind - the event type.
 * @param {Error} error - the error (or a wrapping Error).
 * @param {{ source?: string, line?: number, column?: number }} context
 *
 * The report:
 *   1. Logs the failure to the console with a clear prefix. The
 *      prefix is `[startup]` or `[runtime]`, so a console reader can
 *      filter by category.
 *   2. If the failure is a startup failure, appends a user-facing
 *      banner to `document.body`. The banner is a plain `<div>`; the
 *      app's stylesheet has not loaded yet (or the failure happened
 *      before it loaded), so the banner uses inline styles. The
 *      inline styles are minimal: a dark background, a light text,
 *      a red border. The banner says "The application could not
 *      start" and includes a reload button.
 *   3. If the failure is an application failure, logs it and does
 *      not show the banner. The app is running; a reload button
 *      would be the wrong advice.
 */
function reportStartupFailure(kind, error, context) {
  const phase = startupComplete ? 'runtime' : 'startup';
  const label = `[${phase}] ${kind}`;

  // 1. Log to the console. `console.error` keeps the stack trace
  //    visible to a developer; the label is the category.
  console.error(label, error, context);

  // 2. The user-facing banner, only on a startup failure. A
  //    runtime failure is the app's problem, not the startup's;
  //    the user sees the app's own error UI (or nothing, if the app
  //    does not have one — the app is small enough that a runtime
  //    failure is a defect, not a state to recover from in the UI).
  if (phase === 'startup') {
    showStartupErrorBanner(error);
  }
}

/**
 * Show the user-facing startup-error banner.
 *
 * The banner is a `<div>` appended to `document.body`. It uses
 * inline styles because the app's stylesheet may not have loaded
 * (the failure might have happened before the CSS was injected or
 * linked). The inline styles are the minimum: a dark background, a
 * light text, a red border, a monospace font for the error message.
 *
 * The banner is idempotent: a second failure does not append a
 * second banner. The check is `document.getElementById`.
 */
function showStartupErrorBanner(error) {
  if (document.getElementById(STARTUP_ERROR_BANNER_ID)) {
    return;
  }

  const banner = document.createElement('div');
  banner.id = STARTUP_ERROR_BANNER_ID;
  banner.setAttribute('role', 'alert');
  banner.style.cssText = [
    'position: fixed',
    'inset: 0',
    'z-index: 2147483647',
    'display: flex',
    'flex-direction: column',
    'align-items: center',
    'justify-content: center',
    'gap: 16px',
    'padding: 24px',
    'background: #0d0d0f',
    'color: #f5f5f5',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'text-align: center',
  ].join('; ');

  const heading = document.createElement('h1');
  heading.textContent = 'The application could not start';
  heading.style.cssText = 'margin: 0; font-size: 1.5rem; color: #e8622a;';

  const message = document.createElement('p');
  message.textContent =
    'An unexpected error prevented the application from loading. ' +
    'Reloading the page may fix the problem.';
  message.style.cssText = 'margin: 0; max-width: 60ch; color: #a8a8b0;';

  const detail = document.createElement('pre');
  detail.textContent = error && error.message ? error.message : String(error);
  detail.style.cssText = [
    'margin: 0',
    'padding: 12px 16px',
    'max-width: 80ch',
    'overflow: auto',
    'background: #232327',
    'border: 1px solid #2e2e34',
    'border-radius: 8px',
    'font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    'font-size: 0.8125rem',
    'color: #f5f5f5',
    'text-align: left',
  ].join('; ');

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Reload';
  reload.style.cssText = [
    'padding: 8px 16px',
    'border: 1px solid #e8622a',
    'border-radius: 8px',
    'background: transparent',
    'color: #e8622a',
    'font: inherit',
    'font-weight: 600',
    'cursor: pointer',
  ].join('; ');
  reload.addEventListener('click', () => {
    window.location.reload();
  });

  banner.appendChild(heading);
  banner.appendChild(message);
  banner.appendChild(detail);
  banner.appendChild(reload);
  document.body.appendChild(banner);
}

/**
 * Whether the startup is complete. Exported for tests that want to
 * assert the flag's value.
 *
 * @returns {boolean}
 */
export function isStartupComplete() {
  return startupComplete;
}