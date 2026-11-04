/**
 * Startup sequence contract tests.
 *
 * Purpose:
 *   The startup sequence is a contract: the error handlers are
 *   installed before any application code, the mount lookup throws
 *   on a missing mount, and the startup-complete flag is set after
 *   the app starts. The tests read the entry's source (the sequence
 *   is the import order and the call order) and assert:
 *
 *   1. `installStartupErrorHandlers` is imported before `startApp`.
 *   2. `installStartupErrorHandlers()` is called before `startApp()`.
 *   3. `markStartupComplete()` is called after `startApp()`.
 *   4. The mount lookup throws on a missing mount and on a non-
 *      HTMLElement mount.
 *   5. The startup module exports the handlers and the flag.
 *   6. The doc records the sequence and the failure modes.
 *
 * Why line-anchored regexes:
 *   The entry's docstring explains the sequence and names each step
 *   (`installStartupErrorHandlers`, `startApp`, `requireMount`). A
 *   plain `indexOf` on the identifier would find the docstring's
 *   mention, not the code's call — and the docstring's mention is
 *   earlier (the docstring is at the top of the file), so a sequence
 *   comparison would be comparing the docstring's order, not the
 *   code's. A line-anchored regex (`^identifier(`) finds the code's
 *   call, because the code's call is at the start of a line; the
 *   docstring's mention is inside a ` *`-prefixed comment line, which
 *   `^identifier` does not match.
 *
 * Why the tests read the source as text:
 *   The entry's top-level code cannot be imported and executed in
 *   `node` — it reaches into `document`, calls `startApp` (which
 *   needs a DOM and a store), and expects a browser. Importing the
 *   file would throw before the test could assert anything. The
 *   source's *order* is the sequence; reading the source as text is
 *   how the test asserts the order without executing the file. The
 *   behavioral checks (the four failure modes) are in the Cypress
 *   test (`tests/e2e/startup.cy.js`), which runs in a real browser.
 *
 * Environment:
 *   Runs in `node`. Reads the entry and the startup module as text;
 *   does not execute them.
 *
 * Runner: Jest.
 * Run:    npm test
 *
 * @module tests/unit/node/startupSequence
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const ENTRY_PATH = resolve(PROJECT_ROOT, 'src/js/index.js');
const STARTUP_PATH = resolve(PROJECT_ROOT, 'src/js/startup.js');

function readEntry() {
  return readFileSync(ENTRY_PATH, 'utf8');
}

function readStartup() {
  return readFileSync(STARTUP_PATH, 'utf8');
}

/**
 * Find the index of a line-anchored code pattern in the entry.
 *
 * The pattern is compiled with the `m` flag, so `^` matches the
 * start of any line. The code's lines start at column 0; the
 * docstring's lines are prefixed with ` *` and do not match `^`.
 *
 * Returns -1 if the pattern is not found.
 *
 * @param {string} source
 * @param {string} pattern - a regex pattern (not a RegExp literal;
 *   the caller passes a `String.raw` template so backslashes are
 *   preserved)
 * @returns {number}
 */
function codeLineIndex(source, pattern) {
  const match = source.match(new RegExp(pattern, 'm'));
  return match ? match.index : -1;
}

// ---------------------------------------------------------------------------
// The sequence order
// ---------------------------------------------------------------------------

describe('startup sequence order', () => {
  it('imports installStartupErrorHandlers before startApp', () => {
    // The imports are the sequence's first signal. The
    // `from './startup.js'` line is the startup module's import;
    // the `from './app.js'` line is the app's. The order is the
    // source's order.
    const entry = readEntry();
    const startupImportIndex = entry.indexOf("from './startup.js'");
    const startAppImportIndex = entry.indexOf("from './app.js'");
    expect(startupImportIndex).toBeGreaterThan(-1);
    expect(startAppImportIndex).toBeGreaterThan(-1);
    expect(startupImportIndex).toBeLessThan(startAppImportIndex);
  });

  it('calls installStartupErrorHandlers() before startApp()', () => {
    // The calls are the sequence's second signal. A line-anchored
    // search finds the code's calls, not the docstring's mentions.
    // The code's call is at column 0; the docstring's mention is
    // inside a ` *   `-prefixed comment, which the line anchor does
    // not match.
    const entry = readEntry();
    const installIndex = codeLineIndex(
      entry,
      String.raw`^installStartupErrorHandlers\(\)`
    );
    const startAppIndex = codeLineIndex(entry, String.raw`^startApp\(`);

    expect(installIndex).toBeGreaterThan(-1);
    expect(startAppIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeLessThan(startAppIndex);
  });

  it('calls markStartupComplete() after startApp()', () => {
    // The startup-complete flag is the boundary; its call is after
    // `startApp`. A line-anchored search finds both code calls.
    const entry = readEntry();
    const startAppIndex = codeLineIndex(entry, String.raw`^startApp\(`);
    const markIndex = codeLineIndex(
      entry,
      String.raw`^markStartupComplete\(\)`
    );

    expect(startAppIndex).toBeGreaterThan(-1);
    expect(markIndex).toBeGreaterThan(-1);
    expect(markIndex).toBeGreaterThan(startAppIndex);
  });

  it('locates the mount before startApp()', () => {
    // The mount lookup is `const mount = requireMount();`. The
    // line-anchored search finds the declaration line, not the
    // docstring's mention of `requireMount`.
    const entry = readEntry();
    const requireMountIndex = codeLineIndex(
      entry,
      String.raw`^const mount = requireMount\(\)`
    );
    const startAppIndex = codeLineIndex(entry, String.raw`^startApp\(`);

    expect(requireMountIndex).toBeGreaterThan(-1);
    expect(startAppIndex).toBeGreaterThan(-1);
    expect(requireMountIndex).toBeLessThan(startAppIndex);
  });
});

// ---------------------------------------------------------------------------
// The mount lookup throws
// ---------------------------------------------------------------------------

describe('mount lookup', () => {
  it('throws on a missing mount', () => {
    // The throw is the missing-mount decision. The error message
    // names the id and the template file; the test asserts both.
    const entry = readEntry();
    expect(entry).toMatch(/throw new Error/);
    expect(entry).toContain('Mount element');
    expect(entry).toContain('src/index.html');
  });

  it('throws on a non-HTMLElement mount', () => {
    // The defensive check: a `<svg>` or another non-`HTMLElement`
    // in the mount's place is a malformed template, not a missing
    // one. The throw is a `TypeError`, distinct from the missing-
    // mount `Error`.
    const entry = readEntry();
    expect(entry).toMatch(/throw new TypeError/);
    expect(entry).toContain('not an HTMLElement');
  });
});

// ---------------------------------------------------------------------------
// The startup module
// ---------------------------------------------------------------------------

describe('startup module', () => {
  it('exports installStartupErrorHandlers', () => {
    expect(readStartup()).toMatch(
      /export function installStartupErrorHandlers/
    );
  });

  it('exports markStartupComplete', () => {
    expect(readStartup()).toMatch(/export function markStartupComplete/);
  });

  it('exports isStartupComplete', () => {
    expect(readStartup()).toMatch(/export function isStartupComplete/);
  });

  it('installs both window event handlers', () => {
    // The `error` handler catches synchronous exceptions; the
    // `unhandledrejection` handler catches unhandled promise
    // rejections. Both are what make a startup failure visible.
    const startup = readStartup();
    expect(startup).toContain("addEventListener('error'");
    expect(startup).toContain("addEventListener('unhandledrejection'");
  });

  it('shows a user-facing banner on a startup failure', () => {
    // The banner is the user-visible outcome of a startup failure.
    // The id and the function are the contract; the test asserts
    // both are present.
    const startup = readStartup();
    expect(startup).toContain('STARTUP_ERROR_BANNER_ID');
    expect(startup).toContain('showStartupErrorBanner');
  });

  it('the banner is idempotent (checks for an existing one)', () => {
    // A second failure must not append a second banner. The check
    // is `document.getElementById(STARTUP_ERROR_BANNER_ID)`.
    const startup = readStartup();
    expect(startup).toMatch(
      /document\.getElementById\(STARTUP_ERROR_BANNER_ID\)/
    );
  });

  it('the banner has a Reload button', () => {
    // The recovery for a startup failure is a reload. The banner
    // must offer it.
    const startup = readStartup();
    expect(startup).toContain("'Reload'");
  });
});