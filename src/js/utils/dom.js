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
 * Security (The Two Doors):
 *   There are exactly two ways user data can enter the DOM:
 *   1. As a child (text). `el` and `replaceChildren` use
 *      `document.createTextNode`. Text nodes cannot execute.
 *   2. As an attribute value. `el` uses `setAttribute`. Attribute values
 *      do not execute (unless the attribute is `onclick`, `onerror`, etc.).
 *
 *   To close the second door completely, `applyAttribute` explicitly
 *   rejects attribute *keys* that start with "on" (case-insensitive).
 *   A developer cannot accidentally pass `{ onclick: '...' }` to `el`,
 *   even if the value came from a trusted source. Event listeners must
 *   use `addEventListener` via the `delegate` helper.
 *
 * @module utils/dom
 */

/**
 * Whether a value should be skipped when setting an attribute.
 *
 * `false`, `null`, and `undefined` all mean "do not set this
 * attribute". `true` is intentionally not skipped — it means "set this
 * boolean attribute to the empty string".
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
 * and falls through to `setAttribute` for everything else.
 *
 * Defensive check: Rejects event-handler attributes (`onclick`,
 * `onerror`, etc.). This prevents an accidental injection if a view
 * is refactored to use a dynamic attribute name. If an event is needed,
 * it must be attached via `addEventListener` (see `delegate`).
 *
 * @param {HTMLElement} element
 * @param {string} key
 * @param {*} value
 */
function applyAttribute(element, key, value) {
  if (isSkippedAttributeValue(value)) return;

  // Reject inline event handlers (onclick, onmouseover, etc.).
  // We use addEventListener for all events.
  if (key.toLowerCase().startsWith('on')) {
    throw new Error(
      `Inline event handler attribute "${key}" is forbidden. ` +
        `Use addEventListener or the delegate() helper instead.`
    );
  }

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
  
  // If we get here, it's a normal attribute (id, href, aria-label, etc.)
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
  
  if (typeof child === 'string' || typeof child === 'number') {
    // createTextNode, never innerHTML. This is the XSS guard.
    element.appendChild(document.createTextNode(String(child)));
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
 *   - `false`, `null`, and `undefined` values are skipped.
 *   - `true` sets the attribute to the empty string.
 *   - `class` and `className` both set `className`.
 *   - `dataset` is an object; each key becomes a `data-*` attribute.
 *   - `style` is an object; each key is set via `style.setProperty`.
 *   - Attributes starting with "on" are rejected (defense in depth).
 *   - Everything else is set via `setAttribute`.
 *
 * Children handling:
 *   - A string becomes a text node (via `document.createTextNode`).
 *   - `null` and `undefined` are skipped.
 *   - A Node is appended as-is.
 *   - An array is flattened one level.
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
 * unchanged.
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
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return document.createTextNode(String(child));
      }
      return child;
    });
  container.replaceChildren(...nodes);
}

/**
 * Clear a container's children.
 *
 * Equivalent to `replaceChildren(container, [])`, provided as a named
 * function so the intent is obvious at the call site.
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
 * The returned function removes the listener.
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