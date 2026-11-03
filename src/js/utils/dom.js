/**
 * DOM helpers — small, pure functions that make the view layer
 * consistent.
 *
 * Why this file exists:
 *   Every view does three things: create elements, set attributes and
 *   text, and fill a container. If each view invented its own way of
 *   doing those three things, the views would diverge — some would set
 *   `textContent`, some `innerHTML`, some `appendChild`, and the ones
 *   that used `innerHTML` would be a security defect waiting for user
 *   input to arrive. One helper, used everywhere, is one rule to audit.
 *
 * What this file is not:
 *   - Not a framework. There is no reactivity, no virtual DOM, no
 *     diffing. Full replace is the re-render strategy; these helpers
 *     make full replace cheap.
 *   - Not a template engine. Views compose elements by calling `el`.
 *   - Not a state container. Views receive state from the event layer.
 *
 * Security:
 *   `el` sets text with `textContent`, never `innerHTML`. User-supplied
 *   strings (task title, description, creator, assignee) are therefore
 *   inserted as text, not parsed as HTML. This is the single most
 *   important security property of the view layer: no user string can
 *   become markup.
 *
 *   The one place where HTML is trusted is `el`'s attribute handling:
 *   attribute *values* are set via `setAttribute`, which does not
 *   execute scripts. Attribute *names* are caller-controlled; a view
 *   passing `{ onclick: 'alert(1)' }` would set an event handler
 *   attribute. No view does this, and the render contract tests assert
 *   that rendered nodes carry no `onclick`-style attributes.
 *
 * Accessibility:
 *   The helpers do not enforce ARIA. They make it easy to set ARIA
 *   (via `'aria-live': 'polite'` in the attrs object), but the view's
 *   card decides what ARIA is needed. A helper that "added ARIA" would
 *   be guessing at intent.
 *
 * @module utils/dom
 */

/**
 * Whether a value should be skipped when setting an attribute.
 *
 * `false`, `null`, and `undefined` all mean "do not set this
 * attribute". `true` is intentionally not skipped — it means "set this
 * boolean attribute to the empty string". Extracted so the three loops
 * in `el` share one definition of "skip".
 *
 * @param {*} value
 * @returns {boolean}
 */
function isSkippedAttributeValue(value) {
  return value === false || value === null || value === undefined;
}

/**
 * Apply a single attribute entry to an element.
 *
 * Handles the special cases (`class`/`className`, `dataset`, `style`)
 * and falls through to `setAttribute` for everything else. Extracted
 * from `el` so the branch chain lives in one small, readable function
 * instead of inside a loop inside a function.
 *
 * @param {HTMLElement} element
 * @param {string} key
 * @param {*} value
 */
function applyAttribute(element, key, value) {
  if (isSkippedAttributeValue(value)) return;

  if (key === 'class' || key === 'className') {
    element.className = String(value);
    return;
  }
  if (key === 'dataset' && typeof value === 'object') {
    applyDataset(element, value);
    return;
  }
  if (key === 'style' && typeof value === 'object') {
    applyStyle(element, value);
    return;
  }
  element.setAttribute(key, value === true ? '' : String(value));
}

/**
 * Apply a `dataset` object as `data-*` attributes.
 *
 * Each key becomes `element.dataset[key]`. Values that would be skipped
 * as attributes (`false`, `null`, `undefined`) are skipped here too, so
 * a view can write `dataset: { taskId: maybeId }` without a ternary.
 *
 * @param {HTMLElement} element
 * @param {Record<string, *>} dataset
 */
function applyDataset(element, dataset) {
  for (const [dataKey, dataValue] of Object.entries(dataset)) {
    if (isSkippedAttributeValue(dataValue)) continue;
    element.dataset[dataKey] = String(dataValue);
  }
}

/**
 * Apply a `style` object as inline styles.
 *
 * Keys are converted from camelCase to kebab-case (or left alone if
 * they are custom properties). String values for `style` are rejected
 * by `el` before this runs, because the string form is the one that
 * invites CSS injection.
 *
 * @param {HTMLElement} element
 * @param {Record<string, *>} style
 */
function applyStyle(element, style) {
  for (const [styleKey, styleValue] of Object.entries(style)) {
    if (isSkippedAttributeValue(styleValue)) continue;
    element.style.setProperty(cssCase(styleKey), String(styleValue));
  }
}

/**
 * Append a single child to an element.
 *
 * Strings become text nodes (the XSS guard); `null`/`undefined` are
 * skipped; everything else is appended as-is. Extracted so the child
 * loop in `el` and the filter in `replaceChildren` express the same
 * rule.
 *
 * @param {HTMLElement} element
 * @param {*} child
 */
function appendChild(element, child) {
  if (child === null || child === undefined) return;
  if (typeof child === 'string') {
    // createTextNode, never innerHTML. This is the XSS guard.
    element.appendChild(document.createTextNode(child));
    return;
  }
  element.appendChild(child);
}

/**
 * Create an element with attributes and children.
 *
 * @param {string} tag - the element tag, e.g. 'div', 'article'
 * @param {Record<string, string | number | boolean | undefined | null>} [attrs]
 * @param {Node | string | null | undefined | Array<Node | string | null | undefined>} [children]
 * @returns {HTMLElement}
 *
 * Attribute handling:
 *   - `false`, `null`, and `undefined` values are skipped (no
 *     attribute is set). This lets a view write
 *     `{ disabled: isDisabled }` without a ternary.
 *   - `true` sets the attribute to the empty string, which is the
 *     HTML convention for boolean attributes.
 *   - `class` and `className` both set `className`. This matters
 *     because a view reader may use either word, and the helper
 *     should not make them guess.
 *   - `dataset` is an object; each key becomes a `data-*` attribute.
 *     This is the attribute the render contract uses to map a rendered
 *     node back to its owner (`data-region="..."`, `data-task-id=...`).
 *   - `style` is an object; each key is set via `style.setProperty`.
 *     String values for `style` are rejected because the string form
 *     is the one that invites CSS injection, and this helper is not
 *     going to be the place where that happens.
 *   - Everything else is set via `setAttribute`.
 *
 * Children handling:
 *   - A string becomes a text node (via `document.createTextNode`,
 *     which is equivalent to `textContent` and never parses HTML).
 *     This is the XSS guard.
 *   - `null` and `undefined` are skipped. This lets a view write
 *     `condition ? el('p', {}, text) : null` in a children array
 *     without filtering.
 *   - A Node is appended as-is. `Node` is the check, not
 *     `HTMLElement`, because a view may reasonably append a
 *     `Text` node, a `DocumentFragment`, or an SVG element.
 *   - An array is flattened one level. Deeper nesting is a sign the
 *     view is doing too much; the caller should compose in stages.
 */
export function el(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    applyAttribute(element, key, value);
  }

  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    appendChild(element, child);
  }

  return element;
}

/**
 * Convert a camelCase CSS property name to its kebab-case form.
 *
 * `'backgroundColor'` becomes `'background-color'`, `'fontSize'` becomes
 * `'font-size'`, and `'--accent'` (a custom property) is returned
 * unchanged. The conversion is one-directional: a caller who writes
 * `'background-color'` already gets the right form, and the regex leaves
 * it alone.
 *
 * @param {string} name
 * @returns {string}
 */
function cssCase(name) {
  if (name.startsWith('--')) return name;
  return name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/**
 * Replace the children of `container` with `children`.
 *
 * `replaceChildren` is the standard, well-optimised way to do full
 * replace. It removes all existing children and appends the new ones in
 * one call. Every view uses this; no view sets `innerHTML`.
 *
 * The function filters `null` and `undefined` so a caller can pass an
 * array with conditional entries without a second filter pass. It
 * converts string children to text nodes for the same reason `el`
 * does: the same XSS guard applies whether a string is passed to `el`
 * or to `replaceChildren`.
 *
 * @param {Element} container
 * @param {Node | string | null | undefined | Array<Node | string | null | undefined>} children
 */
export function replaceChildren(container, children) {
  const list = Array.isArray(children) ? children : [children];
  const nodes = list
    .filter((child) => child !== null && child !== undefined)
    .map((child) => (typeof child === 'string' ? document.createTextNode(child) : child));
  container.replaceChildren(...nodes);
}

/**
 * Clear a container's children.
 *
 * Equivalent to `replaceChildren(container, [])`, provided as a named
 * function so the intent is obvious at the call site. `clear(el)` reads
 * as "empty this" where `replaceChildren(el, [])` reads as "replace the
 * children with nothing" — same behaviour, clearer intent.
 *
 * @param {Element} container
 */
export function clear(container) {
  container.replaceChildren();
}

/**
 * Select the first descendant matching `selector`. Throws if not found.
 *
 * A missing node at a call site that expects it is a bug, not a runtime
 * condition. The event layer calls `requireEl` when it is wiring an
 * event to a specific node; if that node is gone, the wiring is wrong,
 * and the throw makes the mistake visible at the point of failure
 * rather than three callbacks later.
 *
 * The error message names the selector and the container's tag, which
 * is usually enough to find the missing node without a debugger.
 *
 * @param {Element | Document} root
 * @param {string} selector
 * @returns {Element}
 */
export function requireEl(root, selector) {
  const found = root.querySelector(selector);
  if (!found) {
    const where = root instanceof Document ? 'document' : root.tagName;
    throw new Error(`Expected element matching "${selector}" inside ${where}.`);
  }
  return found;
}

/**
 * Select the first descendant matching `selector`, or `null` if not
 * found. Used where the absence of a node is meaningful (e.g. "is the
 * empty state rendered?") rather than a bug.
 *
 * @param {Element | Document} root
 * @param {string} selector
 * @returns {Element | null}
 */
export function findEl(root, selector) {
  return root.querySelector(selector);
}

/**
 * Select every descendant matching `selector` as an array. Returns an
 * empty array, not `null`, when nothing matches, so a caller can iterate
 * without a null check.
 *
 * `querySelectorAll` returns a `NodeList`, which is array-like but does
 * not have array methods (`map`, `filter`, `forEach` is a NodeList
 * method in modern browsers, but not in all older ones). This helper
 * converts to a real array so the rest of the code can use array
 * methods without thinking about it.
 *
 * @param {Element | Document} root
 * @param {string} selector
 * @returns {Element[]}
 */
export function findAllEl(root, selector) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Attach an event listener with delegation and return a detach function.
 *
 * Delegation means the listener is attached to `root` and reacts to
 * events that bubble up from descendants matching `selector`. This is
 * the pattern the list uses so that no card has to attach its own
 * listener. A card that attached its own listener would leak one per
 * render; a list that delegates attaches one listener for the list's
 * lifetime.
 *
 * The returned function removes the listener. A caller that renders the
 * list once and never replaces it does not need to call the returned
 * function; a caller that replaces the list's root should. Documenting
 * the detach function as the return value makes the ownership of the
 * listener explicit.
 *
 * @param {Element} root - the container to listen on
 * @param {string} eventType - e.g. 'click', 'input'
 * @param {string} selector - descendant selector to match
 * @param {(event: Event, target: Element) => void} handler
 * @returns {() => void} detach function
 */
export function delegate(root, eventType, selector, handler) {
  const listener = (event) => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!target || !root.contains(target)) return;
    handler(event, target);
  };
  root.addEventListener(eventType, listener);
  return () => root.removeEventListener(eventType, listener);
}

/**
 * Generate an accessible id for a form input and its label.
 *
 * When a view renders a form, each input needs an `id` and each label
 * needs a matching `for`. The ids must be unique on the page, so a
 * fixed prefix and a counter are used. The counter is module-level and
 * monotonic; a form that re-renders gets fresh ids, which is correct
 * because the old inputs are gone.
 *
 * A view that built its own ids would eventually collide with another
 * view's ids, and the label would point at the wrong input — a subtle
 * accessibility bug that is hard to find because it does not break
 * anything visible.
 *
 * @param {string} prefix
 * @returns {string}
 */
let idCounter = 0;
export function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/**
 * Test-only reset for the id counter.
 *
 * Tests that assert specific ids need a predictable counter. Production
 * code never calls this; the counter monotonically increases for the
 * lifetime of the page, which is what ids need.
 *
 * The function is exported so a test can import it without monkey-
 * patching the module. The `_` prefix is a convention: it says "this is
 * not part of the public API, do not call it from views."
 */
export function _resetIdCounter() {
  idCounter = 0;
}