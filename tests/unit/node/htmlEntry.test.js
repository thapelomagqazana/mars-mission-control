/**
 * HTML entry contract tests.
 *
 * Purpose:
 *   The mount point is a contract between the HTML template
 *   (`src/index.html`), the webpack config (`HtmlWebpackPlugin`), and
 *   the entry code (`src/js/index.js`). The three must agree on the
 *   exact id string. The tests assert:
 *
 *   1. The template exists and has exactly one element with the id.
 *   2. The template has the required meta tags (`lang`, `charset`,
 *      `viewport`, `title`).
 *   3. The webpack config points at the template and injects the
 *      script at the end of `<body>`.
 *   4. The entry code looks up the same id (with the `#`).
 *   5. The entry code throws on a missing mount, with a message that
 *      names the id and the template file.
 *   6. The template and the entry agree on the id — the agreement is
 *      asserted by stripping the `#` from the selector and comparing
 *      to the id.
 *
 * Environment:
 *   Runs in `node`. Reads the template, the webpack config, and the
 *   entry as text. Does not execute them — executing the entry would
 *   require a DOM, and the entry's only DOM interaction (the mount
 *   lookup) is what the test asserts against.
 *
 * Why a separate file from `renderContract.test.js`:
 *   The render contract tests assert the view layer against a
 *   simulated DOM (jsdom). This file asserts the *bootstrapping*
 *   contract — the template and the entry — which does not need a
 *   DOM to check. The two are different concerns: a broken view does
 *   not fail this file, and a broken template does not fail the
 *   render tests.
 *
 * Runner: Jest.
 * Run:    npm test
 *
 * @module tests/unit/node/htmlEntry
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const TEMPLATE_PATH = resolve(PROJECT_ROOT, 'src/index.html');
const ENTRY_PATH = resolve(PROJECT_ROOT, 'src/js/index.js');
const WEBPACK_PATH = resolve(PROJECT_ROOT, 'webpack.config.js');

/**
 * Read a file as UTF-8, or throw a clear error if it is missing.
 *
 * A missing file is a defect (a file that the contract references is
 * not present); throwing with the path names the defect at the point
 * of failure.
 */
function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Could not read ${filePath}: ${error.message}`);
  }
}

/**
 * Count the number of exact, non-overlapping occurrences of `needle`
 * in `haystack`. The count is exact-string, not regex, so the needle
 * can contain characters a regex would interpret specially.
 */
function countOccurrences(haystack, needle) {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count++;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

// ---------------------------------------------------------------------------
// The template exists and has exactly one mount
// ---------------------------------------------------------------------------

describe('template — existence and mount', () => {
  it('exists at src/index.html', () => {
    expect(() => readText(TEMPLATE_PATH)).not.toThrow();
  });

  it('declares the HTML5 doctype', () => {
    // The doctype triggers standards mode. Without it, the browser
    // uses quirks mode, and the stylesheet's box-model assumptions
    // (padding inside width, collapsing margins) break.
    expect(readText(TEMPLATE_PATH)).toMatch(/<!DOCTYPE html>/i);
  });

  it('contains exactly one element with id="app-root"', () => {
    // The count is exact. Two elements with the same id is invalid
    // HTML, and the entry code's `querySelector` would return the
    // first and ignore the second — a silent defect.
    const template = readText(TEMPLATE_PATH);
    expect(countOccurrences(template, 'id="app-root"')).toBe(1);
  });

  it('contains the mount element inside <body>', () => {
    // The mount must be in the body, not the head. A <div> in the
    // head is invalid HTML; the browser moves it to the body during
    // parsing, but the entry code's `querySelector` runs during
    // parsing, before the move, and would return null.
    const template = readText(TEMPLATE_PATH);
    const bodyStart = template.indexOf('<body>');
    const bodyEnd = template.indexOf('</body>');
    const mountStart = template.indexOf('id="app-root"');

    expect(bodyStart).toBeGreaterThan(-1);
    expect(bodyEnd).toBeGreaterThan(bodyStart);
    expect(mountStart).toBeGreaterThan(bodyStart);
    expect(mountStart).toBeLessThan(bodyEnd);
  });
});

// ---------------------------------------------------------------------------
// The template has the required meta tags
// ---------------------------------------------------------------------------

describe('template — meta tags', () => {
  it('has <html lang="en">', () => {
    // The document language is required for screen readers and for
    // search engines. The app is English-only; `en` is the value.
    expect(readText(TEMPLATE_PATH)).toMatch(/<html lang="en"/i);
  });

  it('has <meta charset="UTF-8">', () => {
    // The character encoding is required for the app's Unicode
    // content (emoji, RTL, accented Latin — the fixtures cover them).
    // Without UTF-8, the browser uses the document's byte stream as
    // the encoding and misrenders non-ASCII.
    expect(readText(TEMPLATE_PATH)).toMatch(/<meta charset="UTF-8"/i);
  });

  it('has <meta name="viewport"> with width=device-width', () => {
    // The responsive viewport. Without it, mobile browsers render at
    // ~980px and zoom out, breaking the responsive layout.
    expect(readText(TEMPLATE_PATH)).toMatch(
      /<meta name="viewport" content="width=device-width, initial-scale=1\.0"/i
    );
  });

  it('has a non-empty <title>', () => {
    // The title is what the user sees in the browser tab. An empty
    // title is a title the user cannot identify the tab by.
    const template = readText(TEMPLATE_PATH);
    const match = template.match(/<title>([^<]+)<\/title>/i);
    expect(match).not.toBeNull();
    expect(match[1].trim().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The webpack config points at the template and injects into the body
// ---------------------------------------------------------------------------

describe('webpack config — HtmlWebpackPlugin', () => {
  it('references the template path', () => {
    const webpack = readText(WEBPACK_PATH);
    expect(webpack).toContain('HtmlWebpackPlugin');
    expect(webpack).toContain('htmlTemplate');
    // The template path constant resolves to `src/index.html`; the
    // string `index.html` appears in the constant's declaration.
    expect(webpack).toMatch(/index\.html/);
  });

  it('injects the script at the end of <body>', () => {
    // `inject: 'body'` ensures the bundled script runs after the
    // mount div is parsed. `inject: 'head'` would run the script
    // before the body, and the mount lookup would return null.
    expect(readText(WEBPACK_PATH)).toMatch(/inject:\s*['"]body['"]/);
  });
});

// ---------------------------------------------------------------------------
// The entry code looks up the same id
// ---------------------------------------------------------------------------

describe('entry — mount lookup', () => {
  it('declares MOUNT_SELECTOR = "#app-root"', () => {
    // The exact string, including the `#` (querySelector requires
    // the `#`; the template's id does not include it).
    expect(readText(ENTRY_PATH)).toMatch(
      /MOUNT_SELECTOR\s*=\s*['"]#app-root['"]/
    );
  });

  it('uses document.querySelector with the mount selector', () => {
    expect(readText(ENTRY_PATH)).toMatch(
      /document\.querySelector\(\s*MOUNT_SELECTOR\s*\)/
    );
  });

  it('throws when the mount is missing', () => {
    // The throw is the missing-mount decision (see
    // `docs/html-entry.md`). A silent `null` would fail inside the
    // app, with a stack trace that points at the event layer, not at
    // the entry.
    expect(readText(ENTRY_PATH)).toMatch(/throw new Error/);
  });

  it('the error message names the missing id and the template file', () => {
    // A developer who sees the error knows what to look for and
    // where. The message is part of the contract.
    const entry = readText(ENTRY_PATH);
    expect(entry).toContain('src/index.html');
    expect(entry).toMatch(/app-root/);
  });
});

// ---------------------------------------------------------------------------
// The template and the entry agree on the id
// ---------------------------------------------------------------------------

describe('template and entry agree on the mount id', () => {
  it('the id in the template matches the selector in the entry', () => {
    // The template has `id="app-root"`; the entry has
    // `MOUNT_SELECTOR = '#app-root'`. Strip the `#` from the
    // selector and compare to the id; if they differ, the entry
    // cannot find the mount the template provides.
    const template = readText(TEMPLATE_PATH);
    const entry = readText(ENTRY_PATH);

    const templateIdMatch = template.match(/id="([^"]+)"/);
    const entrySelectorMatch = entry.match(
      /MOUNT_SELECTOR\s*=\s*['"]#([^'"]+)['"]/
    );

    expect(templateIdMatch).not.toBeNull();
    expect(entrySelectorMatch).not.toBeNull();
    expect(entrySelectorMatch[1]).toBe(templateIdMatch[1]);
  });
});
