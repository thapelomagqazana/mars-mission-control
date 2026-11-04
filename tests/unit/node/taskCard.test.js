/**
 * Unit tests for the task card view.
 *
 * These tests run in Node.js using jsdom. They construct the card
 * directly from a task object and inspect the resulting DOM tree.
 *
 * What these tests own:
 *   1. The FIELD SELECTOR contract (every field has a stable data-cy).
 *   2. The DISPLAY RULE contract (empty description is hidden).
 *   3. The ESCAPING contract (XSS payloads render as literal text).
 *   4. The TIMESTAMP contract (malformed dates don't crash the render).
 *
 * What these tests do not do:
 *   - They do not assert on CSS classes (that is the styling layer).
 *   - They do not test the list container or ordering (that is
 *     taskList.test.js).
 *
 * @module tests/unit/node/taskCard
 */

const { JSDOM } = require('jsdom');

const { renderTaskCard, TASK_CARD_SELECTORS } = require('../../../src/js/views/taskCard.js');

/**
 * A helper to run a test within a jsdom window.
 *
 * The view functions call `document.createElement`. Node does not have a
 * `document`. This helper creates a fresh jsdom environment, assigns it
 * to the global scope, runs the test function, and then restores the
 * previous global scope.
 *
 * Using a fresh DOM for every test ensures no state leaks between tests.
 *
 * @param {Function} fn - The test body to run. Receives the window.
 */
function withDom(fn) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const prevWindow = global.window;
  const prevDocument = global.document;
  
  global.window = dom.window;
  global.document = dom.window.document;
  
  try {
    return fn(dom.window);
  } finally {
    global.window = prevWindow;
    global.document = prevDocument;
  }
}

/**
 * A factory for a valid task object.
 *
 * This keeps the tests focused on the fields they care about (e.g.,
 * description presence for display, title for escaping) while providing
 * sensible defaults for the rest.
 *
 * @param {object} overrides - Fields to override in the default task.
 * @returns {object}
 */
const T = (overrides) => ({
  id: 'id-default',
  title: 'Task',
  description: 'Description',
  creator: 'Commander',
  assignee: 'Pilot',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('renderTaskCard — selectors and structure', () => {
  it('renders the card container with its identity attributes', () => withDom(() => {
    const card = renderTaskCard(T({ id: 'task-123' }));
    
    // The card has its role selector.
    expect(card.getAttribute('data-cy')).toBe(TASK_CARD_SELECTORS.card);
    
    // The card has its identity for delegation.
    expect(card.getAttribute('data-task-id')).toBe('task-123');
    
    // The card is an <article>.
    expect(card.tagName).toBe('ARTICLE');
  }));

  it('renders every user field with its own selector', () => withDom(() => {
    const card = renderTaskCard(T());
    
    expect(card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.title}"]`)).not.toBeNull();
    expect(card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.description}"]`)).not.toBeNull();
    expect(card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.creator}"]`)).not.toBeNull();
    expect(card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.assignee}"]`)).not.toBeNull();
    expect(card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.createdAt}"]`)).not.toBeNull();
  }));

  it('renders the edit and delete buttons with selectors and task id', () => withDom(() => {
    const card = renderTaskCard(T({ id: 'task-456' }));
    
    const edit = card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.edit}"]`);
    const del = card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.delete}"]`);
    
    expect(edit).not.toBeNull();
    expect(edit.getAttribute('data-action')).toBe('edit-task');
    expect(edit.getAttribute('data-task-id')).toBe('task-456');
    
    expect(del).not.toBeNull();
    expect(del.getAttribute('data-action')).toBe('delete-task');
    expect(del.getAttribute('data-task-id')).toBe('task-456');
  }));
});

describe('renderTaskCard — display rules', () => {
  it('shows the description element when the description is present', () => withDom(() => {
    const card = renderTaskCard(T({ description: 'Visible text' }));
    const desc = card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.description}"]`);
    
    expect(desc).not.toBeNull();
    expect(desc.textContent).toBe('Visible text');
  }));

  it('hides the description element when the description is empty', () => withDom(() => {
    const card = renderTaskCard(T({ description: '' }));
    expect(card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.description}"]`)).toBeNull();
  }));

  it('hides the description element when the description is whitespace-only', () => withDom(() => {
    // A description of three spaces is indistinguishable from no
    // description to a reader, so the DOM should not carry a difference
    // the reader cannot see.
    const card = renderTaskCard(T({ description: '   ' }));
    expect(card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.description}"]`)).toBeNull();
  }));

  it('trims leading and trailing whitespace from title and description', () => withDom(() => {
    const card = renderTaskCard(T({ title: '  Padded  ', description: '  Text  ' }));
    
    expect(card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.title}"]`).textContent).toBe('Padded');
    expect(card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.description}"]`).textContent).toBe('Text');
  }));
});

describe('renderTaskCard — security (XSS boundary)', () => {
  it('renders script tags as literal text and does not execute them', () => withDom((window) => {
    const payload = "<script>window.__xss = true;</script>";
    const card = renderTaskCard(T({ title: payload }));
    
    const title = card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.title}"]`);
    
    // The payload is present as text.
    expect(title.textContent).toBe(payload);
    
    // No <script> element was created inside the title.
    expect(title.querySelector('script')).toBeNull();
    
    // The payload did not execute.
    expect(window.__xss).toBeUndefined();
  }));

  it('renders image tags with onerror as literal text', () => withDom((window) => {
    const payload = '<img src=x onerror="window.__xss = true;">';
    const card = renderTaskCard(T({ description: payload }));
    
    const desc = card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.description}"]`);
    
    // The payload is present as text.
    expect(desc.textContent).toBe(payload);
    
    // No <img> element was created.
    expect(desc.querySelector('img')).toBeNull();
    
    // The payload did not execute.
    expect(window.__xss).toBeUndefined();
  }));

  it('does not interpret HTML entities in user strings', () => withDom(() => {
    // A string of "&amp;" should render as the literal four characters,
    // not as "&". This proves the text is going through createTextNode,
    // not innerHTML.
    const payload = "AT&amp;T";
    const card = renderTaskCard(T({ creator: payload }));
    
    const creator = card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.creator}"]`);
    expect(creator.textContent).toBe("AT&amp;T");
  }));
});

describe('renderTaskCard — timestamp formatting', () => {
  it('formats a valid ISO string using Intl.DateTimeFormat', () => withDom(() => {
    const card = renderTaskCard(T({ createdAt: '2024-01-15T14:30:00.000Z' }));
    const dateEl = card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.createdAt}"]`);
    
    // The exact string depends on the Node environment's locale.
    // We assert that it contains the year and the month abbreviation,
    // which are stable across locales for dateStyle: 'medium'.
    expect(dateEl.textContent).toContain('2024');
    expect(dateEl.textContent).toContain('Jan');
  }));

  it('returns the raw string for a malformed timestamp', () => withDom(() => {
    const card = renderTaskCard(T({ createdAt: 'not-a-date' }));
    const dateEl = card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.createdAt}"]`);
    
    expect(dateEl.textContent).toBe('not-a-date');
  }));

  it('does not throw when timestamp is missing', () => withDom(() => {
    const card = renderTaskCard(T({ createdAt: undefined }));
    const dateEl = card.querySelector(`[data-cy="${TASK_CARD_SELECTORS.createdAt}"]`);
    
    expect(dateEl.textContent).toBe('');
  }));
});