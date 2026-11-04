/**
 * Rendering contract tests.
 *
 * Purpose:
 *   Every view card in `docs/rendering-contract.md` becomes a test here.
 *   Each test asserts the view's output shape, its DOM ownership, and
 *   the security guarantee (no user string becomes markup). The
 *   ownership map is also asserted: no two views write into the same
 *   node, and every UI checklist item is produced by exactly one view.
 *
 * Why a separate file from the other unit tests:
 *   `schema.test.js` tests data shapes. `taskStore.test.js` tests the
 *   state layer. `validationMapping.test.js` tests validation rules.
 *   This file tests the *view* layer, which is a different concern
 *   with a different dependency (a DOM). Grouping it separately means
 *   a view regression is not lost among data-layer failures, and the
 *   test environment can be configured for a DOM without affecting the
 *   other files.
 *
 * The region list is derived from `DASHBOARD_REGIONS`, not hard-coded.
 *   The dashboard's `DASHBOARD_REGIONS` export is the source of truth
 *   for "which regions exist." A future region addition, rename, or
 *   removal is a change to that array; the tests that iterate over
 *   regions read it and follow automatically. A hard-coded list in the
 *   test would be a second source of truth — and a second source of
 *   truth is the thing this project spends effort avoiding.
 *
 * The counter lives inside a slot, and the counter *is* the region.
 *   See the tests in `describe('renderCounter')` and the counter tests
 *   in `describe('renderDashboardFilled')` for the contract: the slot
 *   (`.sidebar-counter`) is a plain well with no identity attributes;
 *   the counter element (`<span class="task-counter" id="dashboard-counter"
 *   data-region="counter" data-cy="dashboard-counter">`) carries the
 *   identity. A `querySelector('[data-region="counter"]')` on the
 *   filled dashboard returns the counter element, not the slot.
 *
 * The task area is a container, and the list and empty state are its content.
 *   `renderTaskList` returns the container (a `<div class="task-area-container">`)
 *   with either a `<ul>` or the empty state *inside* it. The container
 *   carries the region (`data-region="list"`), the id, and the data-cy;
 *   the `<ul>` carries `data-region="task-list"`; the empty state carries
 *   `data-region="empty"`. The container is the render target Phase 6
 *   populates — not a placeholder the empty state will be replaced by.
 *
 * Environment:
 *   Runs in `jsdom`. The Jest config in `package.json` declares two
 *   projects — `node` for the data-layer tests, `jsdom` for this file.
 *   The split is deliberate: the data layer has no DOM dependency, and
 *   the test environment should reflect that.
 *
 * Runner: Jest.
 * Run:    npm test
 *
 * @module tests/unit/renderContract
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

import {
  renderDashboard,
  renderDashboardFilled,
  DASHBOARD_REGIONS,
} from '../../../src/js/views/dashboard.js';
import { renderTaskCard } from '../../../src/js/views/taskCard.js';
import {
  renderTaskList,
  TASK_AREA_ID,
  TASK_AREA_DATA_CY,
  TASK_AREA_REGION,
} from '../../../src/js/views/taskList.js';
import {
  renderEmptyState,
  EMPTY_STATE_CREATE_ID,
  EMPTY_STATE_CREATE_DATA_CY,
} from '../../../src/js/views/emptyState.js';
import {
  renderCounter,
  COUNTER_REGION,
  COUNTER_ID,
  COUNTER_DATA_CY,
} from '../../../src/js/views/counter.js';
import { renderSearchResults } from '../../../src/js/views/search.js';
import { createTaskDialog } from '../../../src/js/views/dialog.js';
import { el } from '../../../src/js/utils/dom.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A minimal valid task. Each test overrides one field at a time so a
 * failure is unambiguously the behaviour under test.
 */
function validTask(overrides = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Survey crater',
    description: 'Check water ice',
    creator: 'Commander',
    assignee: 'Geologist',
    createdAt: '2026-11-03T09:00:00.000Z',
    ...overrides,
  };
}

/**
 * A stub list renderer, for tests that compose the search view but do
 * not want to depend on `taskList.js`'s output shape.
 *
 * The stub returns a bare `<ul>` — it does not emulate the container
 * the real `renderTaskList` returns. Tests that use it target the
 * search view's *own* output (the summary line, the composed list); a
 * test that needed the full container shape would call the real
 * `renderTaskList`.
 */
function stubTaskList(tasks) {
  return el('ul', { class: 'task-list' },
    tasks.map((task) => el('li', {}, task.title))
  );
}

/**
 * Convenience: render the filled dashboard with the current counter
 * element and a stub list. Used by tests that need to inspect the
 * fully-populated dashboard DOM.
 *
 * The stub is used for the *list* because the tests that call
 * `filledDashboard` are exercising the dashboard's placement of the
 * list slot, not the list's own output shape. Tests for the list's
 * shape live in the `renderTaskList` block below and use the real
 * `renderTaskList`.
 */
function filledDashboard(counter = 0, tasks = []) {
  return renderDashboardFilled(
    { tasks, filteredTasks: tasks, searchQuery: '', counter },
    {
      renderCounter,
      renderTaskList: stubTaskList,
      renderSearchResults: (q, ts) =>
        renderSearchResults({ query: q, tasks: ts, renderTaskList: stubTaskList }),
    }
  );
}

/**
 * jsdom does not implement `<dialog>`'s `showModal`/`close`. Stub them
 * so the dialog lifecycle can be tested without a real browser. In a
 * browser these are native; the stub makes the shape testable in CI.
 */
beforeEach(() => {
  if (typeof window !== 'undefined' && window.HTMLDialogElement) {
    if (!window.HTMLDialogElement.prototype.showModal) {
      window.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
    }
    if (!window.HTMLDialogElement.prototype.close) {
      window.HTMLDialogElement.prototype.close = function () {
        this.open = false;
        this.dispatchEvent(new window.Event('close'));
      };
    }
  }
});

// ---------------------------------------------------------------------------
// Card 1 — renderDashboard
//
// The shell render creates the layout regions and leaves the counter
// slot and the list slot empty. Child views fill them (see the
// renderDashboardFilled tests below).
// ---------------------------------------------------------------------------

describe('renderDashboard', () => {
  it('returns a <main> element with the dashboard class', () => {
    const node = renderDashboard({ tasks: [], filteredTasks: [], searchQuery: '', counter: 0 });
    expect(node.tagName).toBe('MAIN');
    expect(node.className).toBe('dashboard');
    expect(node.dataset.region).toBe('dashboard');
  });

  it('creates the shell regions that the dashboard owns', () => {
    const node = renderDashboard({ tasks: [], filteredTasks: [], searchQuery: '', counter: 0 });

    // The shell owns the header, sidebar, and search regions. The
    // counter region is on the counter element (rendered by
    // renderCounter inside the slot); the list region is on the
    // task-area container (rendered by renderTaskList inside its
    // slot). Neither region exists on the shell.
    const shellOwnedRegions = ['header', 'sidebar', 'search'];

    for (const region of shellOwnedRegions) {
      const matches = node.querySelectorAll(`[data-region="${region}"]`);
      expect(matches.length).toBe(1);
    }
  });

  it('leaves the counter slot and the list slot empty (child views fill them)', () => {
    const node = renderDashboard({ tasks: [], filteredTasks: [], searchQuery: '', counter: 0 });

    // The counter slot is the well — a plain <section class="sidebar-counter">
    // with no identity attributes. The counter element (span.task-counter,
    // with data-region="counter") is placed by renderCounter. The shell
    // leaves the well empty.
    const counterSlot = node.querySelector('.sidebar-counter');
    expect(counterSlot).not.toBeNull();
    expect(counterSlot.dataset.region).toBeUndefined();
    expect(counterSlot.id).toBe('');
    expect(counterSlot.getAttribute('data-cy')).toBeNull();
    expect(counterSlot.children.length).toBe(0);

    // The list slot is the well — a plain <div class="dashboard__list-slot">
    // with no identity attributes. The task-area container (with
    // data-region="list") is placed by renderTaskList (via
    // renderSearchResults). The shell leaves the well empty.
    const listSlot = node.querySelector('.dashboard__list-slot');
    expect(listSlot).not.toBeNull();
    expect(listSlot.dataset.region).toBeUndefined();
    expect(listSlot.id).toBe('');
    expect(listSlot.getAttribute('data-cy')).toBeNull();
    expect(listSlot.children.length).toBe(0);
  });

  it('includes the search input with an accessible name', () => {
    const node = renderDashboard({ tasks: [], filteredTasks: [], searchQuery: '', counter: 0 });
    const input = node.querySelector('[data-action="search-input"]');
    expect(input).not.toBeNull();
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('aria-label')).toBe('Search tasks');
  });

  it('pre-fills the search input from the query', () => {
    const node = renderDashboard({ tasks: [], filteredTasks: [], searchQuery: 'crater', counter: 0 });
    expect(node.querySelector('[data-action="search-input"]').value).toBe('crater');
  });

  it('marks the header as sticky via its class', () => {
    const node = renderDashboard({ tasks: [], filteredTasks: [], searchQuery: '', counter: 0 });
    expect(node.querySelector('[data-region="header"]').classList.contains('dashboard__header')).toBe(true);
  });

  it('shows commander information in the sidebar', () => {
    const node = renderDashboard({ tasks: [], filteredTasks: [], searchQuery: '', counter: 0 });
    const sidebar = node.querySelector('[data-region="sidebar"]');
    expect(sidebar.textContent).toContain('Commander');
  });
});

// ---------------------------------------------------------------------------
// renderDashboardFilled
//
// The filled render places each child view's output inside its slot.
// ---------------------------------------------------------------------------

describe('renderDashboardFilled', () => {
  it('places the counter inside the slot, with the identity on the counter element', () => {
    const node = filledDashboard(5);

    // The slot is a plain well. No identity attributes.
    const counterSlot = node.querySelector('.sidebar-counter');
    expect(counterSlot).not.toBeNull();
    expect(counterSlot.dataset.region).toBeUndefined();
    expect(counterSlot.id).toBe('');
    expect(counterSlot.getAttribute('data-cy')).toBeNull();

    // The counter element inside the slot carries the identity.
    const counterElement = node.querySelector('[data-region="counter"]');
    expect(counterElement).not.toBeNull();
    expect(counterElement.tagName).toBe('SPAN');
    expect(counterElement.className).toBe('task-counter');
    expect(counterElement.id).toBe(COUNTER_ID);
    expect(counterElement.getAttribute('data-cy')).toBe(COUNTER_DATA_CY);
    expect(counterElement.textContent).toBe('5 tasks');
    expect(counterElement.getAttribute('data-count')).toBe('5');

    // And the counter is a child of the slot.
    expect(counterSlot.contains(counterElement)).toBe(true);
  });

  it('places the list output inside the list slot', () => {
    // Use the *real* renderTaskList so the test can assert the full
    // shape: the container is inside the slot, the slot has no
    // identity, and the container has the contracted identity.
    const node = renderDashboardFilled(
      { tasks: [], filteredTasks: [], searchQuery: '', counter: 0 },
      {
        renderCounter,
        renderTaskList,
        renderSearchResults: (q, ts) =>
          renderSearchResults({ query: q, tasks: ts, renderTaskList }),
      }
    );

    // The slot is a plain well.
    const listSlot = node.querySelector('.dashboard__list-slot');
    expect(listSlot).not.toBeNull();
    expect(listSlot.dataset.region).toBeUndefined();
    expect(listSlot.id).toBe('');

    // The container is inside the slot and carries the identity.
    const container = node.querySelector(`[data-region="${TASK_AREA_REGION}"]`);
    expect(container).not.toBeNull();
    expect(container.className).toBe('task-area-container');
    expect(container.id).toBe(TASK_AREA_ID);
    expect(container.getAttribute('data-cy')).toBe(TASK_AREA_DATA_CY);
    expect(listSlot.contains(container)).toBe(true);

    // The container's content is the empty state (no tasks were passed).
    expect(container.querySelector('.empty-state')).not.toBeNull();
  });

  it('preserves the search input across filling', () => {
    const node = renderDashboardFilled(
      { tasks: [], filteredTasks: [], searchQuery: 'crater', counter: 0 },
      {
        renderCounter,
        renderTaskList: stubTaskList,
        renderSearchResults: (q, ts) =>
          renderSearchResults({ query: q, tasks: ts, renderTaskList: stubTaskList }),
      }
    );
    const input = node.querySelector('[data-action="search-input"]');
    expect(input).not.toBeNull();
    expect(input.value).toBe('crater');
  });
});

// ---------------------------------------------------------------------------
// Card 2 — renderTaskList
//
// The list returns the *task-area container*, whose content is either
// a <ul> of tasks or the empty state. The container is the render
// target — not a placeholder the empty state will be replaced by.
// ---------------------------------------------------------------------------

describe('renderTaskList', () => {
  it('returns the task-area container (not the <ul> directly)', () => {
    const node = renderTaskList([validTask()]);
    // The container is a <div>, not a <ul>. The container carries the
    // task-area identity; the <ul> inside it carries the task-list
    // region.
    expect(node.tagName).toBe('DIV');
    expect(node.className).toBe('task-area-container');
    expect(node.id).toBe(TASK_AREA_ID);
    expect(node.getAttribute('data-cy')).toBe(TASK_AREA_DATA_CY);
    expect(node.dataset.region).toBe(TASK_AREA_REGION);
  });

  it('wraps a <ul> of tasks when the array is non-empty', () => {
    const node = renderTaskList([validTask()]);
    const ul = node.querySelector('ul.task-list');
    expect(ul).not.toBeNull();
    expect(ul.dataset.region).toBe('task-list');
  });

  it('wraps each task in an <li>', () => {
    const node = renderTaskList([validTask({ id: 'a' }), validTask({ id: 'b' })]);
    const items = node.querySelectorAll('li.task-list__item');
    expect(items.length).toBe(2);
  });

  it('each <li> carries the task id in data-task-id', () => {
    const task = validTask({ id: 'unique-id-1' });
    const node = renderTaskList([task]);
    const li = node.querySelector('li.task-list__item');
    expect(li.dataset.taskId).toBe(task.id);
  });

  it('wraps the empty state when the array is empty (default reason)', () => {
    const node = renderTaskList([]);
    // The container is still the task-area container (same id, same
    // region). Its content is the empty state, which carries its own
    // region.
    expect(node.className).toBe('task-area-container');
    expect(node.dataset.region).toBe(TASK_AREA_REGION);

    const emptyState = node.querySelector('.empty-state');
    expect(emptyState).not.toBeNull();
    expect(emptyState.dataset.region).toBe('empty');
    expect(emptyState.dataset.reason).toBe('no-tasks');
  });

  it('honours the explicit emptyReason option', () => {
    const node = renderTaskList([], { emptyReason: 'no-results' });
    const emptyState = node.querySelector('.empty-state');
    expect(emptyState).not.toBeNull();
    expect(emptyState.dataset.reason).toBe('no-results');
    expect(emptyState.textContent).toContain('No matching tasks');
  });

  it('delegates to renderTaskCard for each card', () => {
    // Sanity: the card's markup is present, which proves the list
    // delegates rather than reimplementing.
    const node = renderTaskList([validTask({ title: 'Unique title' })]);
    expect(node.querySelector('.task-card__title').textContent).toBe('Unique title');
  });
});

// ---------------------------------------------------------------------------
// Card 3 — renderEmptyState
// ---------------------------------------------------------------------------

describe('renderEmptyState', () => {
  it('no-tasks: has the correct region, reason, and message', () => {
    const node = renderEmptyState('no-tasks');
    expect(node.dataset.region).toBe('empty');
    expect(node.dataset.reason).toBe('no-tasks');
    expect(node.textContent).toContain('No tasks yet');
    expect(node.querySelector('[data-action="open-create-dialog"]')).not.toBeNull();
  });

  it('no-tasks: the create affordance carries the contracted id and data-cy', () => {
    const node = renderEmptyState('no-tasks');
    const button = node.querySelector('[data-action="open-create-dialog"]');
    expect(button.tagName).toBe('BUTTON');
    expect(button.id).toBe(EMPTY_STATE_CREATE_ID);
    expect(button.getAttribute('data-cy')).toBe(EMPTY_STATE_CREATE_DATA_CY);
  });

  it('no-results: has the correct region, reason, and message', () => {
    const node = renderEmptyState('no-results');
    expect(node.dataset.region).toBe('empty');
    expect(node.dataset.reason).toBe('no-results');
    expect(node.textContent).toContain('No matching tasks');
    expect(node.querySelector('[data-action="clear-search"]')).not.toBeNull();
  });

  it('the two states have distinct classes', () => {
    expect(renderEmptyState('no-tasks').className).not.toBe(renderEmptyState('no-results').className);
  });

  it('declares itself as a status', () => {
    expect(renderEmptyState('no-tasks').getAttribute('role')).toBe('status');
    expect(renderEmptyState('no-results').getAttribute('role')).toBe('status');
  });
});

// ---------------------------------------------------------------------------
// Card 4 — renderTaskCard
// ---------------------------------------------------------------------------

describe('renderTaskCard', () => {
  it('returns an <article> with the task id in data-task-id', () => {
    const task = validTask();
    const node = renderTaskCard(task);
    expect(node.tagName).toBe('ARTICLE');
    expect(node.dataset.taskId).toBe(task.id);
  });

  it('renders the title as an <h2>', () => {
    const node = renderTaskCard(validTask({ title: 'Unique title' }));
    const heading = node.querySelector('h2.task-card__title');
    expect(heading).not.toBeNull();
    expect(heading.textContent).toBe('Unique title');
  });

  it('renders the description when non-empty', () => {
    const node = renderTaskCard(validTask({ description: 'Visible' }));
    expect(node.querySelector('.task-card__description').textContent).toBe('Visible');
  });

  it('omits the description when empty', () => {
    expect(renderTaskCard(validTask({ description: '' })).querySelector('.task-card__description')).toBeNull();
  });

  it('omits the description when whitespace-only', () => {
    expect(renderTaskCard(validTask({ description: '   ' })).querySelector('.task-card__description')).toBeNull();
  });

  it('renders creator, assignee, and created time', () => {
    const node = renderTaskCard(validTask());
    const values = node.querySelectorAll('.task-card__meta-value');
    expect(values[0].textContent).toBe('Commander');
    expect(values[1].textContent).toBe('Geologist');
    expect(values[2].textContent.length).toBeGreaterThan(0);
  });

  it('renders edit and delete controls with the task id', () => {
    const task = validTask();
    const node = renderTaskCard(task);
    const edit = node.querySelector('[data-action="edit-task"]');
    const del = node.querySelector('[data-action="delete-task"]');
    expect(edit).not.toBeNull();
    expect(del).not.toBeNull();
    expect(edit.dataset.taskId).toBe(task.id);
    expect(del.dataset.taskId).toBe(task.id);
  });

  it('edit and delete controls have accessible names that name the task', () => {
    const task = validTask({ title: 'Survey crater' });
    const node = renderTaskCard(task);
    expect(node.querySelector('[data-action="edit-task"]').getAttribute('aria-label')).toContain('Survey crater');
    expect(node.querySelector('[data-action="delete-task"]').getAttribute('aria-label')).toContain('Survey crater');
  });

  it('does not attach inline event handlers', () => {
    const node = renderTaskCard(validTask());
    const buttons = node.querySelectorAll('button');
    for (const button of buttons) {
      expect(button.getAttribute('onclick')).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Card 5 — renderCounter
//
// The counter element IS the region. It carries the region name, the
// id, the data-cy, and the data-count. The slot the dashboard wraps
// around it is a plain well (no identity attributes).
// ---------------------------------------------------------------------------

describe('renderCounter', () => {
  it('returns a <span> with the task-counter class and the count', () => {
    const node = renderCounter(3);
    expect(node.tagName).toBe('SPAN');
    expect(node.className).toBe('task-counter');
    expect(node.dataset.count).toBe('3');
  });

  it('claims the counter region, id, and data-cy', () => {
    const node = renderCounter(3);
    expect(node.dataset.region).toBe(COUNTER_REGION);
    expect(node.id).toBe(COUNTER_ID);
    expect(node.getAttribute('data-cy')).toBe(COUNTER_DATA_CY);
  });

  it('renders "0 tasks" for the empty state (the empty-state value)', () => {
    const node = renderCounter(0);
    expect(node.textContent).toBe('0 tasks');
    expect(node.getAttribute('data-count')).toBe('0');
  });

  it('renders "N tasks" for N > 1', () => {
    expect(renderCounter(3).textContent).toBe('3 tasks');
    expect(renderCounter(5).textContent).toBe('5 tasks');
  });

  it('uses the singular form for 1', () => {
    expect(renderCounter(1).textContent).toBe('1 task');
  });

  it('is a polite live region with atomic announcements', () => {
    const node = renderCounter(3);
    expect(node.getAttribute('role')).toBe('status');
    expect(node.getAttribute('aria-live')).toBe('polite');
    expect(node.getAttribute('aria-atomic')).toBe('true');
  });

  it('exposes the numeric count machine-readably', () => {
    expect(renderCounter(0).getAttribute('data-count')).toBe('0');
    expect(renderCounter(1).getAttribute('data-count')).toBe('1');
    expect(renderCounter(42).getAttribute('data-count')).toBe('42');
  });
});

// ---------------------------------------------------------------------------
// Card 6 — renderSearchResults
// ---------------------------------------------------------------------------

describe('renderSearchResults', () => {
  it('returns a <div> with the search-results class', () => {
    const node = renderSearchResults({ query: '', tasks: [], renderTaskList: stubTaskList });
    expect(node.tagName).toBe('DIV');
    expect(node.className).toBe('search-results');
    // The region belongs to the dashboard's container, not the view.
    expect(node.dataset.region).toBeUndefined();
  });

  it('shows "all tasks" when there is no query', () => {
    const node = renderSearchResults({
      query: '',
      tasks: [validTask({ id: 'a' }), validTask({ id: 'b' })],
      renderTaskList: stubTaskList,
    });
    expect(node.textContent).toContain('Showing all 2 tasks');
  });

  it('uses singular "task" for a no-query count of 1', () => {
    const node = renderSearchResults({
      query: '',
      tasks: [validTask()],
      renderTaskList: stubTaskList,
    });
    expect(node.textContent).toContain('Showing all 1 task');
  });

  it('shows the count and the query when there is a query', () => {
    const node = renderSearchResults({
      query: 'crater',
      tasks: [validTask()],
      renderTaskList: stubTaskList,
    });
    expect(node.textContent).toContain('1 result for "crater"');
  });

  it('uses singular "result" for a query count of 1', () => {
    const node = renderSearchResults({
      query: 'crater',
      tasks: [validTask()],
      renderTaskList: stubTaskList,
    });
    expect(node.textContent).toContain('1 result for "crater"');
    expect(node.textContent).not.toContain('1 results');
  });

  it('trims the query in the summary', () => {
    const node = renderSearchResults({
      query: '  crater  ',
      tasks: [validTask()],
      renderTaskList: stubTaskList,
    });
    expect(node.textContent).toContain('for "crater"');
    expect(node.textContent).not.toContain('  crater  ');
  });

  it('composes the list into its output', () => {
    const node = renderSearchResults({
      query: 'crater',
      tasks: [validTask()],
      renderTaskList: stubTaskList,
    });
    expect(node.querySelector('ul.task-list')).not.toBeNull();
  });

  it('summary is a polite live region', () => {
    const node = renderSearchResults({ query: '', tasks: [], renderTaskList: stubTaskList });
    const summary = node.querySelector('.search-results__summary');
    expect(summary.getAttribute('role')).toBe('status');
    expect(summary.getAttribute('aria-live')).toBe('polite');
    expect(summary.getAttribute('aria-atomic')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// Card 7 — createTaskDialog
// ---------------------------------------------------------------------------

describe('createTaskDialog — create mode', () => {
  it('returns a controller with element, open, close, destroy, showErrors', () => {
    const dialog = createTaskDialog({ mode: 'create', task: null, onSubmit: () => {}, onCancel: () => {} });
    expect(dialog.element.tagName).toBe('DIALOG');
    expect(typeof dialog.open).toBe('function');
    expect(typeof dialog.close).toBe('function');
    expect(typeof dialog.destroy).toBe('function');
    expect(typeof dialog.showErrors).toBe('function');
  });

  it('renders a form with one input per user field', () => {
    const dialog = createTaskDialog({ mode: 'create', task: null, onSubmit: () => {}, onCancel: () => {} });
    expect(dialog.element.querySelector('input[name="title"]')).not.toBeNull();
    expect(dialog.element.querySelector('textarea[name="description"]')).not.toBeNull();
    expect(dialog.element.querySelector('input[name="creator"]')).not.toBeNull();
    expect(dialog.element.querySelector('input[name="assignee"]')).not.toBeNull();
  });

  it('shows the create heading and submit label', () => {
    const dialog = createTaskDialog({ mode: 'create', task: null, onSubmit: () => {}, onCancel: () => {} });
    expect(dialog.element.textContent).toContain('New task');
    expect(dialog.element.querySelector('[data-action="submit-dialog"]').textContent).toBe('Create task');
  });

  it('calls onSubmit with trimmed values', () => {
    let submitted = null;
    const dialog = createTaskDialog({
      mode: 'create',
      task: null,
      onSubmit: (values) => { submitted = values; },
      onCancel: () => {},
    });
    dialog.element.querySelector('input[name="title"]').value = '  New title  ';
    dialog.element.querySelector('input[name="creator"]').value = '  Commander  ';
    dialog.element.querySelector('input[name="assignee"]').value = '  Geologist  ';
    dialog.element.querySelector('form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );
    // The submit handler is async. Wait for the microtask queue to
    // flush so the `await onSubmit(...)` inside the handler resolves.
    // `Promise.resolve().then(...)` is available in both node and
    // jsdom; `setImmediate` is node-only and not available in jsdom.
    return Promise.resolve().then(() => {
      expect(submitted).not.toBeNull();
      expect(submitted.title).toBe('New title');
      expect(submitted.creator).toBe('Commander');
      expect(submitted.assignee).toBe('Geologist');
    });
  });

  it('calls onCancel when the cancel button is clicked', () => {
    let cancelled = false;
    const dialog = createTaskDialog({
      mode: 'create',
      task: null,
      onSubmit: () => {},
      onCancel: () => { cancelled = true; },
    });
    dialog.element.querySelector('[data-action="cancel-dialog"]').click();
    expect(cancelled).toBe(true);
  });

  it('showErrors writes each message to the corresponding field', () => {
    const dialog = createTaskDialog({ mode: 'create', task: null, onSubmit: () => {}, onCancel: () => {} });
    dialog.showErrors({
      title: 'Title is required.',
      assignee: 'Assignee is required.',
    });
    const errors = dialog.element.querySelectorAll('.task-dialog__error');
    // The errors array is in USER_FIELDS order: title, description,
    // creator, assignee.
    expect(errors[0].textContent).toBe('Title is required.');
    expect(errors[3].textContent).toBe('Assignee is required.');
    expect(dialog.element.querySelector('input[name="title"]').getAttribute('aria-invalid')).toBe('true');
    expect(dialog.element.querySelector('input[name="assignee"]').getAttribute('aria-invalid')).toBe('true');
  });

  it('showErrors with an empty object clears all errors', () => {
    const dialog = createTaskDialog({ mode: 'create', task: null, onSubmit: () => {}, onCancel: () => {} });
    dialog.showErrors({ title: 'Title is required.' });
    dialog.showErrors({});
    expect(dialog.element.querySelector('input[name="title"]').hasAttribute('aria-invalid')).toBe(false);
  });

  it('destroy removes the dialog from the document', () => {
    const dialog = createTaskDialog({ mode: 'create', task: null, onSubmit: () => {}, onCancel: () => {} });
    dialog.open();
    expect(dialog.element.isConnected).toBe(true);
    dialog.destroy();
    expect(dialog.element.isConnected).toBe(false);
  });
});

describe('createTaskDialog — edit mode', () => {
  it('shows the edit heading and submit label', () => {
    const dialog = createTaskDialog({ mode: 'edit', task: validTask(), onSubmit: () => {}, onCancel: () => {} });
    expect(dialog.element.textContent).toContain('Edit task');
    expect(dialog.element.querySelector('[data-action="submit-dialog"]').textContent).toBe('Save changes');
  });

  it('pre-fills the fields from the task', () => {
    const dialog = createTaskDialog({ mode: 'edit', task: validTask(), onSubmit: () => {}, onCancel: () => {} });
    expect(dialog.element.querySelector('input[name="title"]').value).toBe('Survey crater');
    expect(dialog.element.querySelector('textarea[name="description"]').value).toBe('Check water ice');
    expect(dialog.element.querySelector('input[name="creator"]').value).toBe('Commander');
    expect(dialog.element.querySelector('input[name="assignee"]').value).toBe('Geologist');
  });

  it('sets data-mode to "edit"', () => {
    const dialog = createTaskDialog({ mode: 'edit', task: validTask(), onSubmit: () => {}, onCancel: () => {} });
    expect(dialog.element.dataset.mode).toBe('edit');
  });
});

// ---------------------------------------------------------------------------
// Security: no user string becomes markup
// ---------------------------------------------------------------------------

describe('XSS guard — user strings are rendered as text', () => {
  const payload = '<img src=x onerror="alert(1)">';

  it('renderTaskCard: title is not parsed as markup', () => {
    const node = renderTaskCard(validTask({ title: payload }));
    expect(node.querySelector('img')).toBeNull();
    expect(node.querySelector('h2.task-card__title').textContent).toBe(payload);
  });

  it('renderTaskCard: description is not parsed as markup', () => {
    const node = renderTaskCard(validTask({ description: payload }));
    expect(node.querySelector('img')).toBeNull();
    expect(node.querySelector('.task-card__description').textContent).toBe(payload);
  });

  it('renderTaskCard: creator is not parsed as markup', () => {
    const node = renderTaskCard(validTask({ creator: payload }));
    expect(node.querySelector('img')).toBeNull();
  });

  it('renderTaskCard: assignee is not parsed as markup', () => {
    const node = renderTaskCard(validTask({ assignee: payload }));
    expect(node.querySelector('img')).toBeNull();
  });

  it('renderTaskCard: aria-label is a text value, not markup', () => {
    const node = renderTaskCard(validTask({ title: payload }));
    const edit = node.querySelector('[data-action="edit-task"]');
    // The label contains the payload as text; it must not have been
    // interpreted by a `for` loop that builds strings with innerHTML.
    expect(edit.getAttribute('aria-label')).toContain(payload);
  });

  it('createTaskDialog: title in edit mode is a value, not markup', () => {
    const dialog = createTaskDialog({
      mode: 'edit',
      task: validTask({ title: payload }),
      onSubmit: () => {},
      onCancel: () => {},
    });
    const input = dialog.element.querySelector('input[name="title"]');
    expect(input.value).toBe(payload);
    // A value attribute is text; it cannot create a child element.
    expect(dialog.element.querySelector('img')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DOM ownership map — no two views own the same container
// ---------------------------------------------------------------------------

describe('DOM ownership', () => {
  it('the dashboard shell produces exactly one of each region it owns', () => {
    const node = renderDashboard({ tasks: [], filteredTasks: [], searchQuery: '', counter: 0 });

    // The shell owns header, sidebar, and search. The counter and list
    // regions live on the child views' elements (inside their slots).
    const shellOwnedRegions = ['header', 'sidebar', 'search'];

    for (const region of shellOwnedRegions) {
      expect(node.querySelectorAll(`[data-region="${region}"]`).length).toBe(1);
    }
  });

  it('the filled dashboard produces exactly one of every region in the map', () => {
    // Use the *real* renderTaskList so the list container's identity
    // is present in the tree, matching the region map's "list" entry.
    const node = renderDashboardFilled(
      { tasks: [], filteredTasks: [], searchQuery: '', counter: 0 },
      {
        renderCounter,
        renderTaskList,
        renderSearchResults: (q, ts) =>
          renderSearchResults({ query: q, tasks: ts, renderTaskList }),
      }
    );

    for (const region of DASHBOARD_REGIONS.map((r) => r.name)) {
      expect(node.querySelectorAll(`[data-region="${region}"]`).length).toBe(1);
    }
  });

  it('the empty state and the task list are mutually exclusive as container content', () => {
    // Both renders produce the *same* container (the task-area container).
    // What differs is the container's content: a <ul> when there are tasks,
    // the empty state when there are none.
    const nonEmpty = renderTaskList([validTask()]);
    const empty = renderTaskList([]);

    // Same container identity in both cases.
    expect(nonEmpty.className).toBe('task-area-container');
    expect(empty.className).toBe('task-area-container');
    expect(nonEmpty.dataset.region).toBe(empty.dataset.region);

    // Different content.
    expect(nonEmpty.querySelector('ul.task-list')).not.toBeNull();
    expect(nonEmpty.querySelector('.empty-state')).toBeNull();

    expect(empty.querySelector('ul.task-list')).toBeNull();
    expect(empty.querySelector('.empty-state')).not.toBeNull();
  });

  it('every data-region value used across the views is unique to one view', () => {
    // Render each top-level view that produces regions and collect
    // every data-region value. Each must be produced by exactly one
    // view. The dialog and the empty state are checked separately
    // because they do not render inside the dashboard's tree.
    const seen = new Map();
    const record = (viewName, node) => {
      const regions = node.querySelectorAll ? node.querySelectorAll('[data-region]') : [];
      const list = [node, ...Array.from(regions)];
      for (const elNode of list) {
        if (!elNode.dataset || !elNode.dataset.region) continue;
        const region = elNode.dataset.region;
        if (!seen.has(region)) seen.set(region, new Set());
        seen.get(region).add(viewName);
      }
    };

    record('dashboard', renderDashboard({ tasks: [], filteredTasks: [], searchQuery: '', counter: 0 }));
    record('taskList', renderTaskList([validTask()]));
    record('taskList-empty', renderTaskList([]));
    record('emptyState-noTasks', renderEmptyState('no-tasks'));
    record('emptyState-noResults', renderEmptyState('no-results'));
    record('counter', renderCounter(1));
    record('searchResults', renderSearchResults({ query: '', tasks: [], renderTaskList: stubTaskList }));

    // Every region has exactly one producing view — with two exceptions:
    //
    //   1. `empty` — produced by renderEmptyState under multiple entry
    //      points, but all are the same *view*. The rule is "one view
    //      per region," not "one call site per region."
    //
    //   2. `list` — the task-area container. It is produced by
    //      renderTaskList (as the top-level return value) and also
    //      appears in renderTaskList([]) (the empty-state render).
    //      Both are the same *view*: renderTaskList. The region
    //      belongs to renderTaskList.
    for (const [region, producers] of seen.entries()) {
      if (region === 'empty') {
        expect(Array.from(producers)).toEqual(
          expect.arrayContaining(['emptyState-noTasks', 'emptyState-noResults'])
        );
        continue;
      }
      if (region === TASK_AREA_REGION) {
        // Both entries are `taskList` calls — the empty render and the
        // populated render both produce the container. Same view.
        expect(Array.from(producers)).toEqual(
          expect.arrayContaining(['taskList', 'taskList-empty'])
        );
        continue;
      }
      expect(producers.size).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// UI checklist traceability — every checklist item is produced by a view
// ---------------------------------------------------------------------------

describe('UI checklist traceability', () => {
  it('the sticky header is present in the dashboard', () => {
    const node = renderDashboard({ tasks: [], filteredTasks: [], searchQuery: '', counter: 0 });
    const header = node.querySelector('[data-region="header"]');
    expect(header).not.toBeNull();
    expect(header.classList.contains('dashboard__header')).toBe(true);
  });

  it('the live task counter is rendered by renderCounter, and is itself the counter region', () => {
    const dashboard = filledDashboard(3);

    // The counter element IS the region. The slot is a plain well.
    const counterRegion = dashboard.querySelector('[data-region="counter"]');
    expect(counterRegion).not.toBeNull();
    expect(counterRegion.tagName).toBe('SPAN');
    expect(counterRegion.className).toBe('task-counter');
    expect(counterRegion.textContent).toBe('3 tasks');
    expect(counterRegion.id).toBe(COUNTER_ID);
    expect(counterRegion.getAttribute('data-cy')).toBe(COUNTER_DATA_CY);

    // And it is inside the slot.
    expect(dashboard.querySelector('.sidebar-counter').contains(counterRegion)).toBe(true);
  });

  it('task cards render title, description, creator, assignee, edit, delete', () => {
    const node = renderTaskCard(validTask());
    expect(node.querySelector('.task-card__title')).not.toBeNull();
    expect(node.querySelector('.task-card__description')).not.toBeNull();
    expect(node.textContent).toContain('Commander');
    expect(node.textContent).toContain('Geologist');
    expect(node.querySelector('[data-action="edit-task"]')).not.toBeNull();
    expect(node.querySelector('[data-action="delete-task"]')).not.toBeNull();
  });

  it('the empty state renders inside the task-area container for an empty list', () => {
    const container = renderTaskList([]);
    // The container carries the task-area region.
    expect(container.dataset.region).toBe(TASK_AREA_REGION);
    // The empty state inside it carries the empty region.
    const emptyState = container.querySelector('.empty-state');
    expect(emptyState).not.toBeNull();
    expect(emptyState.dataset.region).toBe('empty');
  });

  it('the search summary renders for a query', () => {
    const node = renderSearchResults({
      query: 'crater',
      tasks: [],
      renderTaskList: stubTaskList,
    });
    expect(node.querySelector('.search-results__summary')).not.toBeNull();
  });

  it('the create dialog renders an empty form', () => {
    const dialog = createTaskDialog({ mode: 'create', task: null, onSubmit: () => {}, onCancel: () => {} });
    expect(dialog.element.querySelector('input[name="title"]').value).toBe('');
  });

  it('the edit dialog renders a populated form', () => {
    const dialog = createTaskDialog({ mode: 'edit', task: validTask(), onSubmit: () => {}, onCancel: () => {} });
    expect(dialog.element.querySelector('input[name="title"]').value).toBe('Survey crater');
  });
});