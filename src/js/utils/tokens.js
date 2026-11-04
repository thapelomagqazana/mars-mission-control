/**
 * Design token reader — the JS seam onto the CSS token register.
 *
 * Why this file exists:
 *   The token register lives in `src/css/tokens.css`. CSS rules consume it
 *   through `var(--token)` for free. JavaScript has no such mechanism, so any
 *   imperative UI (the startup-error banner, a toast, a canvas overlay) has
 *   to *read* the values from the document. Doing so inline would put hex
 *   codes back into JS — the exact drift the register exists to prevent —
 *   and would also couple each consumer to the token's spelling.
 *
 *   This module is the one place that knows how to ask the document for a
 *   token. Everything else asks this module.
 *
 * What it guarantees:
 *   - A single spelling of every token's name. Consumers pass the bare name
 *     (`color-accent`, not `--color-accent`); the `--` prefix is the
 *     reader's job so it cannot drift between call sites.
 *   - A synchronous read against the computed style of `:root`, which
 *     reflects the current cascade — including any `@media` override such as
 *     `prefers-reduced-motion`.
 *   - A loud, early failure when a token is missing. A `null` returned into
 *     a `style.cssText` line would silently produce a broken banner; a thrown
 *     error names the offending token and fails the unit test that asserts
 *     every documented token resolves.
 *
 * What it does NOT do:
 *   - It does not cache. Reads are cheap (`getComputedStyle` is memoised by
 *     the engine per element), and caching would mean a media-query change
 *     (system toggle of reduced motion, a future theme switch) would not be
 *     observed. The values are current on every call.
 *   - It does not know which tokens exist. The register is the source of
 *     truth; this module only knows how to ask for one.
 *   - It does not fall back to a literal. If a token is missing, the caller
 *     has a bug, and a bug should be visible — the same rule the event layer
 *     applies to programming errors.
 *
 * @module utils/tokens
 */

/**
 * Read a design token from the root element's computed style.
 *
 * @param {string} name - the token's bare name, without the `--` prefix.
 *   Example: `'color-accent'`, `'layout-hero-size'`, `'z-header'`.
 * @returns {string} the token's resolved value (e.g. `'#e8622a'`, `'48px'`).
 * @throws {TypeError} if `name` is not a non-empty string.
 * @throws {Error} if there is no document to read from, or if the token is
 *   not defined on `:root`. The latter is a startup failure by definition:
 *   the stylesheet the app depends on is missing or out of date.
 *
 * The function is intentionally synchronous. The banner that uses it runs
 * inside an error handler; an async read would race the browser's paint and
 * let the user see an unstyled banner flash.
 */
export function readToken(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('readToken(name): name must be a non-empty string.');
  }

  // The document is required. In a `node` test environment there is no
  // document; the caller that imports this module in `node` must not call
  // it. Guarding with a clear throw beats a `Cannot read properties of
  // undefined` three stack frames deep.
  if (typeof document === 'undefined') {
    throw new TypeError(
      'readToken(name): no document in this environment. ' +
        'Design tokens are read from :root; this call must run in a browser ' +
        'or a DOM test environment (e.g. jsdom).'
    );
  }

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${name}`)
    .trim();

  if (value === '') {
    throw new TypeError(
      `Unknown design token: --${name}. ` +
        'Tokens are declared in src/css/tokens.css. ' +
        'If this is a new token, add it there first, then use it here.'
    );
  }

  return value;
}