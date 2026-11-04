/**
 * Application entry point — the startup sequence.
 *
 * Why this file exists:
 *   The entry point is the composition root of the *startup*: the one
 *   place that orders the five steps below, and the only module that
 *   reaches into the document for the mount and calls `startApp`.
 *
 * The startup sequence (five steps, in order):
 *
 *   1. Install the error handlers (`startup.js`).
 *      First, because every later step can throw. The handlers turn
 *      a thrown error into a user-visible message; without them, the
 *      browser's default is a red console line and a blank page.
 *
 *   2. Import the stylesheet (`../css/styles.css`).
 *      Second, because the browser's first paint must have the
 *      styles. The import triggers webpack's CSS loader chain:
 *        - development: style-loader injects the CSS into a <style>
 *          element at runtime.
 *        - production: MiniCssExtractPlugin.loader extracts the CSS
 *          into a linked .css file, injected into the HTML's <head>
 *          by HtmlWebpackPlugin.
 *
 *   3. Locate the mount (`requireMount`).
 *      Third, because `startApp` receives the mount as an argument.
 *      A missing mount throws; the handlers from step 1 catch it
 *      and show the startup-error banner.
 *
 *   4. Start the app (`startApp({ root: mount })`).
 *      Fourth, because the app's composition root needs the mount.
 *      A failure inside `startApp` (a corrupted store, a view that
 *      throws, a listener that fails to attach) propagates out;
 *      the handlers from step 1 catch it and show the banner.
 *
 *   5. Mark the startup complete (`markStartupComplete()`).
 *      Fifth, because it is the boundary between "startup failure"
 *      and "application failure." A failure before this call is a
 *      startup failure (the app never finished starting); a failure
 *      after is an application failure (the app started, something
 *      went wrong later). The two get different user-facing
 *      treatments: the startup failure shows the banner; the
 *      application failure is logged for the developer.
 *
 *   The order matters. Step 1 before every other step, because the
 *   handlers are what make a failure visible. Step 2 before step 3,
 *   because the CSS is processed before the app's first paint. Step
 *   3 before step 4, because `startApp` needs the mount. Step 4
 *   before step 5, because `markStartupComplete` is the boundary.
 *   The startup sequence's test (`tests/unit/node/startupSequence.
 *   test.js`) reads this file's source and asserts the order.
 *
 * The failure modes the handlers catch (see `docs/startup.md`):
 *   - Missing mount → startup failure, banner shown.
 *   - Corrupted localStorage → startup failure, banner shown (the
 *     store's load throws, `startApp` does not return).
 *   - View throws during first render → startup failure, banner
 *     shown (the throw propagates out of `startApp`).
 *   - Event-handler attach throws → startup failure, banner shown
 *     (the throw propagates out of `startApp`).
 *
 * What this file does NOT do:
 *   - It does not handle failures. `startup.js` does; the entry's
 *     job is to order the steps and mark the boundary.
 *   - It does not render anything. Rendering is the views' job; the
 *     entry hands the mount to `startApp`.
 *   - It does not import the store, the views, or the event helpers
 *     directly. `startApp` is the composition root below this one.
 *   - It does not read the persisted state, attach listeners, or
 *     configure anything. Those are the app's concerns, not the
 *     entry's.
 *
 * Why this file is small:
 *   The entry's job is to be the boundary between "the page has
 *   loaded" and "the app is running." A small entry is easy to read,
 *   easy to test (the five steps and the mount lookup are the only
 *   behaviour), and easy to reason about (a failure here is a
 *   failure to start, not a failure to render). A large entry that
 *   imported everything would be the composition root — and the
 *   composition root is `startApp`, not this file.
 *
 * @module index
 */

// Step 1: install the error handlers before any application code.
// The import's position is the sequence: the module's top-level
// code runs the moment the bundle executes, before the mount
// lookup and before `startApp`. A failure in any later step is
// caught by these handlers.
import { installStartupErrorHandlers, markStartupComplete } from './startup.js';
installStartupErrorHandlers();

// Step 2: import the stylesheet so webpack's CSS loader chain
// processes it before the app renders. The import's position is
// the sequence: it is after the error handlers (so a CSS-related
// error at parse time is caught) and before the mount lookup.
import '../css/styles.css';

// The app's composition root. Imported here, called in step 4.
import { startApp } from './app.js';

/**
 * The selector for the root mount element.
 *
 * The `#` prefix is part of the selector, not part of the id. The
 * template has `id="app-root"` (the id); this file has
 * `MOUNT_SELECTOR = '#app-root'` (the selector that finds the id).
 * The html-entry test compares the two sides after stripping the
 * `#`, so a change to either side is caught.
 *
 * Why a constant and not an inline string:
 *   The test asserts the constant's value. An inline string in
 *   `querySelector` would be asserted by a regex on the entry's
 *   source, which is more brittle. The constant is the contract's
 *   name; the test reads the name.
 */
const MOUNT_SELECTOR = '#app-root';

/**
 * Locate the mount element, or throw an error that names the problem.
 *
 * The throw is a startup failure: the handlers from step 1 catch
 * it, log it as `[startup] error`, and show the user-facing banner.
 *
 * Why `querySelector` and not `getElementById`:
 *   `getElementById('app-root')` returns the element for the id
 *   `app-root`; `querySelector('#app-root')` returns the element for
 *   the selector `#app-root`. The two find the same element today.
 *   The `querySelector` form is used because the constant is the
 *   selector — a future change to a different selector (a
 *   `data-*` attribute, for example) is a change to the constant,
 *   not to the call site.
 *
 * Why the throw names the file:
 *   A developer who sees "Mount element '#app-root' not found"
 *   knows what to look for but not where. The message adds
 *   "check src/index.html" so the next step is in the error. The
 *   message is part of the contract: the html-entry test asserts
 *   it names the id and the template file.
 *
 * @returns {HTMLElement}
 * @throws {Error} if the mount element is missing.
 * @throws {TypeError} if the mount element is not an HTMLElement.
 */
function requireMount() {
  const mount = document.querySelector(MOUNT_SELECTOR);

  if (mount === null) {
    throw new Error(
      `Mount element '${MOUNT_SELECTOR}' not found. ` +
        `Check src/index.html: the template must contain exactly one ` +
        `element with id "app-root".`
    );
  }

  // The `querySelector` return type is `Element | null`. The
  // `mount !== null` check above narrows it to `Element`. The app's
  // `startApp` accepts an `HTMLElement`; a document element that is
  // not an `HTMLElement` (an SVG, for example) would not be a valid
  // mount. The template's mount is a `<div>`, which is an
  // `HTMLElement`; the cast is the entry's acknowledgement that the
  // contract (the template's tag) is what makes this safe.
  if (!(mount instanceof HTMLElement)) {
    throw new TypeError(
      `Mount element '${MOUNT_SELECTOR}' is not an HTMLElement. ` +
        `Check src/index.html: the mount must be a tag that the app ` +
        `can render into (a <div> today).`
    );
  }

  return mount;
}

// Step 3: locate the mount. A throw here is a startup failure; the
// handlers from step 1 catch it and show the banner.
const mount = requireMount();

// Step 4: start the app. A throw here (store load failure, view
// throw, listener attach failure) is a startup failure; the
// handlers from step 1 catch it and show the banner. The app's
// startup is synchronous, so there is no `await` and no promise
// chain — the app is running when `startApp` returns.
startApp({ root: mount });

// Step 5: mark the startup complete. After this line, a failure is
// an application failure — the app started, something went wrong
// later — and the handlers treat it differently: the console logs
// it as `[runtime]`, and the user-facing banner is not shown (the
// app is running; a reload banner would be the wrong advice).
markStartupComplete();