/**
 * Debounce helper — the search input's debounce mechanism.
 *
 * Why a debounce:
 *   The search input fires `input` on every keystroke. Without a
 *   debounce, every keystroke triggers a full re-render of the task
 *   list, the counter, and the search summary. For a list of a few
 *   dozen items that is a few milliseconds per render — cheap, but
 *   visible as flicker on slower machines, and noisy for a screen
 *   reader, which would announce the result count on every character.
 *
 *   A 200 ms debounce coalesces a fast typist's keystrokes into a
 *   single render. The user sees the list update after they pause,
 *   which reads as "the search responded" rather than "the list is
 *   flickering."
 *
 * Why 200 ms and not 300 or 500:
 *   200 ms is short enough that the user perceives the update as
 *   immediate, and long enough to absorb the interval between
 *   characters in fast typing (the median inter-key interval is around
 *   100–150 ms). A longer delay starts to feel laggy; a shorter delay
 *   does not coalesce enough to be worth the machinery.
 *
 * The delay is a constant, not an option, because it is part of the
 * event catalog's contract. Changing it is a change to the catalog,
 * not a per-call decision. The constant is exported so a test can
 * assert its value without hard-coding 200 in two places.
 *
 * @module events/debounce
 */

/**
 * The search input debounce delay, in milliseconds.
 *
 * Changing this value is a change to the event catalog. The catalog
 * states the delay; this constant implements it; a test asserts that
 * the two agree.
 */
export const SEARCH_DEBOUNCE_MS = 200;

/**
 * Wrap a function so it runs at most once per `delayMs` of quiet.
 *
 * The returned function forwards its arguments to the wrapped function,
 * so it can be used as a drop-in replacement in an event handler. It
 * also exposes a `cancel` method so a caller can cancel a pending
 * invocation (used when the search is cleared by Esc, which should not
 * trigger a trailing debounced render).
 *
 * The wrapped function is called with `undefined` as its `this`. The
 * debounced wrapper does not capture or forward the caller's `this`:
 * the views in this application invoke their debounced functions as
 * plain calls (`onSearch(value)`), and an event handler that needed
 * `this` would be better served by a bound handler than by a debounce
 * that leaks call-site context into a timer.
 *
 * @param {Function} fn - the function to debounce
 * @param {number} delayMs - the quiet period, in milliseconds
 * @returns {Function & { cancel: () => void }} the debounced function
 *
 * @example
 *   const onSearch = debounce((query) => renderResults(query), 200);
 *   input.addEventListener('input', (e) => onSearch(e.target.value));
 *   // Later, when the search is cleared:
 *   onSearch.cancel();
 *   renderResults('');
 */
export function debounce(fn, delayMs) {
  if (typeof fn !== 'function') {
    throw new TypeError('debounce: fn must be a function.');
  }
  if (typeof delayMs !== 'number' || delayMs < 0) {
    throw new TypeError('debounce: delayMs must be a non-negative number.');
  }

  let timerId = null;
  let pendingArgs = null;

  const debounced = function debounced(...args) {
    pendingArgs = args;
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      timerId = null;
      const argsToApply = pendingArgs;
      pendingArgs = null;
      fn(...argsToApply);
    }, delayMs);
  };

  debounced.cancel = function cancel() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    pendingArgs = null;
  };

  return debounced;
}