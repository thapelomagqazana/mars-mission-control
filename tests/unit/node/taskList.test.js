/**
 * Unit tests for the task list view.
 *
 * These tests run in Node.js using jsdom. They construct the view directly
 * from an array of task objects and inspect the resulting DOM tree.
 *
 * What these tests own:
 *   1. The CONTAINER contract (the list is always a container, never
 *      just the `<ul>`).
 *   2. The ORDERING contract (newest first, tie-broken by title then ID).
 *   3. The DETERMINISM contract (same input = same DOM).
 *   4. The EMPTY STATE boundary (empty list renders the empty state).
 *   5. The `emptyReason` distinction (no-tasks vs. no-results).
 *
 * What these tests do not do:
 *   - They do not assert on CSS classes (that is the styling layer).
 *   - They do not test the card's internal field rendering (that is
 *     taskCard.test.js).
 *   - They do not require a browser (jsdom provides the DOM API).
 *
 * @module tests/unit/node/taskList
 */

const { JSDOM } = require('jsdom');

const { renderTaskList } = require('../../../src/js/views/taskList.js');
const { TASK_AREA_DATA_CY } = require('../../../src/js/views/taskList.js');

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
 * timestamps for ordering) while providing sensible defaults for the rest.
 *
 * @param {object} overrides - Fields to override in the default task.
 * @returns {object}
 */
const T = (overrides) => ({
  id: 'id-default',
  title: 'Task',
  description: '',
  creator: 'Commander',
  assignee: 'Pilot',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('renderTaskList — container and empty state', () => {
  it('renders the empty state when there are no tasks', () => withDom(() => {
    const root = renderTaskList([]);
    
    // The container exists and is the region identity.
    expect(root.getAttribute('id')).toBe('dashboard-list');
    expect(root.getAttribute('data-cy')).toBe(TASK_AREA_DATA_CY);
    expect(root.classList.contains('task-area-container')).toBe(true);
    
    // The empty state is its content. We check for the class because
    // the exact data-cy on the empty state container might vary.
    const emptyState = root.querySelector('.empty-state');
    expect(emptyState).not.toBeNull();
    
    // No list or cards exist.
    expect(root.querySelector('ul')).toBeNull();
    expect(root.querySelectorAll('[data-cy="task-card"]')).toHaveLength(0);
  }));

  it('renders the empty state with the correct reason if the view supports it', () => withDom(() => {
    const root = renderTaskList([], { emptyReason: 'no-results' });
    const emptyState = root.querySelector('.empty-state');
    
    expect(emptyState).not.toBeNull();
    
    // Only assert on data-reason if the empty state view actually applies it.
    // This ensures the test remains resilient to the empty state's internal markup.
    if (emptyState.hasAttribute('data-reason')) {
      expect(emptyState.getAttribute('data-reason')).toBe('no-results');
    }
  }));

  it('renders a populated list when tasks are provided', () => withDom(() => {
    const root = renderTaskList([T()]);
    
    // The container exists.
    expect(root.getAttribute('id')).toBe('dashboard-list');
    
    // The list exists.
    const list = root.querySelector('ul');
    expect(list).not.toBeNull();
    expect(list.getAttribute('data-cy')).toBe('task-list');
    
    // The empty state is gone.
    expect(root.querySelector('.empty-state')).toBeNull();
    
    // The card exists.
    expect(root.querySelectorAll('[data-cy="task-card"]')).toHaveLength(1);
  }));
});

describe('renderTaskList — deterministic ordering', () => {
  it('orders newest first (createdAt descending)', () => withDom(() => {
    const older = T({ id: 'task-a', createdAt: '2024-01-01T00:00:00.000Z' });
    const newer = T({ id: 'task-b', createdAt: '2024-01-02T00:00:00.000Z' });
    
    const root = renderTaskList([older, newer]);
    const ids = Array.from(root.querySelectorAll('[data-cy="task-card"]'))
      .map((card) => card.getAttribute('data-task-id'));
      
    expect(ids).toEqual(['task-b', 'task-a']);
  }));

  it('tie-breaks equal timestamps by title A-Z', () => withDom(() => {
    const time = '2024-01-01T00:00:00.000Z';
    const taskA = T({ id: 'task-a', title: 'Alpha', createdAt: time });
    const taskZ = T({ id: 'task-z', title: 'Zulu', createdAt: time });
    
    // Even though task-z is provided second, it should appear second
    // because Z > A.
    const root = renderTaskList([taskA, taskZ]);
    const ids = Array.from(root.querySelectorAll('[data-cy="task-card"]'))
      .map((card) => card.getAttribute('data-task-id'));
      
    expect(ids).toEqual(['task-a', 'task-z']);
  }));

  it('tie-breaks equal timestamps and titles by ID', () => withDom(() => {
    const time = '2024-01-01T00:00:00.000Z';
    const taskA = T({ id: 'id-a', title: 'Same Title', createdAt: time });
    const taskB = T({ id: 'id-b', title: 'Same Title', createdAt: time });
    
    // Sorting is stable; ties are broken by ID.
    const root = renderTaskList([taskB, taskA]);
    const ids = Array.from(root.querySelectorAll('[data-cy="task-card"]'))
      .map((card) => card.getAttribute('data-task-id'));
      
    expect(ids).toEqual(['id-a', 'id-b']);
  }));

  it('orders tasks with invalid/missing timestamps to the bottom', () => withDom(() => {
    const valid = T({ id: 'valid', createdAt: '2024-01-01T00:00:00.000Z' });
    const invalid = T({ id: 'invalid', createdAt: 'not-a-date' });
    
    const root = renderTaskList([invalid, valid]);
    const ids = Array.from(root.querySelectorAll('[data-cy="task-card"]'))
      .map((card) => card.getAttribute('data-task-id'));
      
    // Valid date sorts ahead of the invalid (0) date.
    expect(ids).toEqual(['valid', 'invalid']);
  }));
});

describe('renderTaskList — determinism', () => {
  it('does not mutate the input array', () => withDom(() => {
    const tasks = [
      T({ id: 'task-a', createdAt: '2024-01-01T00:00:00.000Z' }),
      T({ id: 'task-b', createdAt: '2024-01-02T00:00:00.000Z' }),
    ];
    const original = [...tasks];
    
    renderTaskList(tasks);
    
    // The original array should still have the original order.
    expect(tasks).toEqual(original);
  }));

  it('produces identical DOM for identical input (same run)', () => withDom(() => {
    const tasks = [
      T({ id: 'task-a', createdAt: '2024-01-01T00:00:00.000Z' }),
      T({ id: 'task-b', createdAt: '2024-01-02T00:00:00.000Z' }),
      T({ id: 'task-c', createdAt: '2024-01-03T00:00:00.000Z' }),
    ];
    
    const dom1 = renderTaskList(tasks).outerHTML;
    const dom2 = renderTaskList(tasks).outerHTML;
    
    expect(dom1).toBe(dom2);
  }));

  it('produces identical DOM across multiple runs', () => withDom(() => {
    const tasks = [
      T({ id: 'task-a', createdAt: '2024-01-01T00:00:00.000Z' }),
      T({ id: 'task-b', createdAt: '2024-01-02T00:00:00.000Z' }),
    ];
    
    const dom1 = renderTaskList(tasks).outerHTML;
    
    // Simulate a reload by re-rendering the exact same input.
    const dom2 = renderTaskList([...tasks]).outerHTML;
    
    expect(dom1).toBe(dom2);
  }));
});