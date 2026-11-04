/**
 * Startup error handling — installs the window-level error handlers
 * and the startup-complete signal.
 *
 * [Header comment unchanged from the delivered file. See that file for the
 * rationale of the phase classification, the idempotent installation, and
 * the choice to keep the console error visible to developers.]
 *
 * Design-token discipline (added):
 *   The user-facing banner is the only imperative UI in the startup path, and
 *   it must obey the same token register as the rest of the app. Its colours,
 *   spacing, radii, font stack and z-index are read through `readToken()`
 *   (see `./utils/tokens.js`); no literal appears in this file. This is not
 *   ceremony — the banner is exactly the kind of one-off that historically
 *   drifts ("oh, the error page can just hard-code the brand orange") and
 *   then becomes the first place a reviewer notices the palette has forked.
 *
 * @module startup
 */

import { readToken } from './utils/tokens.js';

/**
 * Whether the application has finished starting.
 * [Unchanged.]
 */
let startupComplete = false;

/**
 * The id of the user-facing error banner. [Unchanged.]
 */
const STARTUP_ERROR_BANNER_ID = 'startup-error';

/**
 * Install the startup's error handlers. [Unchanged.]
 *
 * See the delivered file for the rationale; the body is identical because
 * the handlers do not read any token. The banner they eventually invoke does.
 */
export function installStartupErrorHandlers() {
  if (typeof window === 'undefined') {
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
 * Mark the startup as complete. [Unchanged.]
 */
export function markStartupComplete() {
  startupComplete = true;
}

/**
 * Report a failure. [Unchanged.]
 *
 * See the delivered file for the phase classification logic. The function
 * is reproduced here only because the module is presented as a whole; the
 * body has not changed.
 */
function reportStartupFailure(kind, error, context) {
  const phase = startupComplete ? 'runtime' : 'startup';
  const label = `[${phase}] ${kind}`;

  console.error(label, error, context);

  if (phase === 'startup') {
    showStartupErrorBanner(error);
  }
}

/**
 * Show the user-facing startup-error banner.
 *
 * Why every value comes from the token register:
 *   The banner is the app's face when the app cannot start — arguably the
 *   most visible screen in the product. It must look like the rest of the
 *   app. Reading from the register means a future rebrand (one edit to
 *   `tokens.css`) updates the banner automatically; hard-coding the palette
 *   here would leave the error page as the last relic of the old theme.
 *
 * Why inline styles at all:
 *   The banner fires on a startup failure, which includes the case where the
 *   stylesheet itself failed to load (a 404 on the emitted CSS, a CSP block
 *   on the `<style>` injection). A class-based banner would render unstyled
 *   in exactly the failure mode it exists to handle. Inline styles are the
 *   right tool; the values they carry are the register's, not this file's.
 *
 * Idempotent: a second startup failure does not append a second banner.
 * The check is `getElementById`, which is cheap and exact.
 *
 * The banner is `role="alert"` so a screen reader announces it
 * immediately — a startup failure is exactly the "something urgent
 * happened" case `role="alert"` exists for.
 */
function showStartupErrorBanner(error) {
  if (document.getElementById(STARTUP_ERROR_BANNER_ID)) {
    return;
  }

  // Read the tokens once, up front. If any token is missing, the throw
  // happens here — before the banner is half-built — and the developer
  // sees the offending token name. This is deliberately a hard failure:
  // a missing token is a deployment bug, not a state to degrade from.
  const tokens = {
    bgBase:        readToken('color-bg-base'),
    bgSurface:     readToken('color-bg-surface'),
    borderDefault: readToken('color-border-default'),
    textPrimary:   readToken('color-text-primary'),
    textSecondary: readToken('color-text-secondary'),
    accent:        readToken('color-accent'),
    fontFamily:    readToken('font-family-base'),
    fontMono:      readToken('font-family-mono'),
    fontSizeXl:    readToken('font-size-xl'),
    fontSizeSm:    readToken('font-size-sm'),
    radiusMd:      readToken('radius-md'),
    space3:        readToken('space-3'),
    space4:        readToken('space-4'),
    space5:        readToken('space-5'),
    zToast:        readToken('z-header'), // highest registered layer; banner owns it
  };

  const banner = document.createElement('div');
  banner.id = STARTUP_ERROR_BANNER_ID;
  banner.setAttribute('role', 'alert');
  banner.style.cssText = [
    'position: fixed',
    'inset: 0',
    // The startup banner must sit above the application, and the
    // application's own highest layer is `--z-header`. Reading it here —
    // rather than inventing 2147483647 — keeps the ladder honest: if a
    // future component needs to sit above the banner (a toast, say), the
    // ladder is extended in one place, not worked around twice.
    `z-index: ${tokens.zToast}`,
    'display: flex',
    'flex-direction: column',
    'align-items: center',
    'justify-content: center',
    `gap: ${tokens.space4}`,
    `padding: ${tokens.space5}`,
    `background: ${tokens.bgBase}`,
    `color: ${tokens.textPrimary}`,
    `font-family: ${tokens.fontFamily}`,
    'text-align: center',
  ].join('; ');

  const heading = document.createElement('h1');
  heading.textContent = 'The application could not start';
  heading.style.cssText = [
    'margin: 0',
    `font-size: ${tokens.fontSizeXl}`,
    `color: ${tokens.accent}`,
  ].join('; ');

  const message = document.createElement('p');
  message.textContent =
    'An unexpected error prevented the application from loading. ' +
    'Reloading the page may fix the problem.';
  message.style.cssText = [
    'margin: 0',
    'max-width: 60ch',
    `color: ${tokens.textSecondary}`,
  ].join('; ');

  const detail = document.createElement('pre');
  detail.textContent = error?.message ?? String(error);
  detail.style.cssText = [
    'margin: 0',
    `padding: ${tokens.space3} ${tokens.space4}`,
    'max-width: 80ch',
    'overflow: auto',
    `background: ${tokens.bgSurface}`,
    `border: 1px solid ${tokens.borderDefault}`,
    `border-radius: ${tokens.radiusMd}`,
    `font-family: ${tokens.fontMono}`,
    `font-size: ${tokens.fontSizeSm}`,
    `color: ${tokens.textPrimary}`,
    'text-align: left',
  ].join('; ');

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Reload';
  reload.style.cssText = [
    `padding: ${tokens.space2 ?? tokens.space3} ${tokens.space4}`,
    `border: 1px solid ${tokens.accent}`,
    `border-radius: ${tokens.radiusMd}`,
    'background: transparent',
    `color: ${tokens.accent}`,
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
 * Whether the startup is complete. Exported for tests.
 */
export function isStartupComplete() {
  return startupComplete;
}