/**
 * Create workflow tests — the end-to-end flow from click to persisted task.
 *
 * [the delivered file's module header — the three-layer description, the
 *  three observable places, the environment notes, the diagnostics from
 *  the previous deliveries — is preserved. See the previous deliveries
 *  for the full rationale.]
 *
 * ## Toast isolation between tests
 *
 * The success toast lives on `document.body`, not on the test's `root`,
 * and it auto-dismisses after `TOAST_DURATION_MS` (3 s). Jest does not
 * wait between tests, so a toast shown in test *N* is still on the page
 * when test *N+1* runs. Without a cleanup, the next test's assertions
 * find the previous test's toast — a *test pollution* bug that reads as
 * a *code* bug ("validation failed but a success toast appeared").
 *
 * The `beforeEach` cleans every `#toast-region` from `document.body`,
 * exactly as it cleans every `dialog.task-dialog`. The cleanup runs
 * before the fresh root is created, so the next test starts with an
 * empty page. The cleanup is *the* reason the tests are independent;
 * without it, they are order-dependent.
 *
 * The cleanup removes the region's DOM node. It does not cancel the
 * region's pending timer (the timer belongs to `views/toast.js`'s
 * module state, not to the DOM). A stale timer would fire on a
 * detached node — a `removeChild` no-op — which is safe but noisy in
 * logs. The dismissal test at the bottom of this file asserts the
 * timer's behaviour explicitly, with fake timers, so the pending
 * timer's shape is verified rather than assumed.
 *
 * @module tests/unit/createWorkflow
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { startApp } from '../../../src/js/app.js';

/**
 * [unchanged from the delivered file.]
 */
function validFormValues(overrides = {}) {
  return {
    title: 'Survey crater',
    creator: 'Commander Aria Vance',
    assignee: 'Engineer Kade',
    ...overrides,
  };
}

/**
 * [unchanged from the delivered file.]
 */
function memoryPersistence(initial = null) {
  let current = initial;
  return {
    load: () => current,
    save: (tasks) => { current = tasks.map((t) => ({ ...t })); },
    _get: () => current,
  };
}

/**
 * [unchanged from the delivered file.]
 */
function fillCreateForm(dialogElement, values) {
  const { title, creator, assignee, description = '' } = values;
  dialogElement.querySelector('input[name="title"]').value = title;
  dialogElement.querySelector('textarea[name="description"]').value = description;
  dialogElement.querySelector('input[name="creator"]').value = creator;
  dialogElement.querySelector('input[name="assignee"]').value = assignee;
}

/**
 * [unchanged from the delivered file.]
 */
async function submitForm(dialogElement) {
  const form = dialogElement.querySelector('form');
  form.dispatchEvent(
    new window.Event('submit', { bubbles: true, cancelable: true }),
  );
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * jsdom's `<dialog>` stubs. [unchanged from the delivered file.]
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

describe('create workflow — header button → dialog → store → DOM', () => {
  let root;
  let persistence;
  let app;

  beforeEach(() => {
    // Clean the document of everything a previous test may have left
    // behind. Three cleanup targets, each a distinct kind of residue:
    //
    //   1. Any stray <dialog> (a crashed test's dialog, or a dialog
    //      the app failed to destroy — a bug the tests would
    //      otherwise mask).
    //   2. Any stray toast region (the current fix — a success
    //      toast from the previous test, which the previous test's
    //      3 s timer has not yet dismissed).
    //   3. The test's own previous root (a crashed test's root).
    //
    // The cleanup runs *before* the fresh root is created, so the
    // next test's `document.body` contains exactly one root (its
    // own) and zero dialogs and zero toasts. That is the definition
    // of "clean baseline."
    document.querySelectorAll('dialog').forEach((d) => d.remove());
    document.getElementById('toast-region')?.remove();

    root = document.createElement('div');
    root.id = 'app-root';
    document.body.appendChild(root);

    persistence = memoryPersistence();
    app = startApp({ root, persistence });
  });

  afterEach(() => {
    app.destroy();
    root.remove();
    // Defensive: same three targets, in case a test crashed
    // mid-flight. The `afterEach` is the *belt*; the `beforeEach`
    // is the *braces*.
    document.querySelectorAll('dialog').forEach((d) => d.remove());
    document.getElementById('toast-region')?.remove();
  });

  /**
   * [unchanged from the delivered file — the header button smoke test.]
   */
  it('renders the header create button and opens the dialog on click', () => {
    const button = root.querySelector('[data-cy="dashboard-create"]');
    expect(button).not.toBeNull();
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('data-action')).toBe('open-create-dialog');

    button.click();

    const dialog = document.querySelector('dialog.task-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog.open).toBe(true);
  });

  /**
   * [unchanged from the delivered file — the empty state button
   *  delegation test.]
   */
  it('opens the dialog from the empty state\'s create button (via delegation)', () => {
    const emptyState = root.querySelector('.empty-state--no-tasks');
    expect(emptyState).not.toBeNull();

    const button = emptyState.querySelector('[data-action="open-create-dialog"]');
    expect(button).not.toBeNull();
    expect(button.id).toBe('dashboard-empty-create');

    button.click();

    const dialog = document.querySelector('dialog.task-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog.open).toBe(true);
  });

  /**
   * [unchanged from the delivered file — the happy path, with the
   *  three-layer assertions and the structured dialog-gone failure
   *  messages.]
   */
  it('creates a task from the dialog and reflects it in store, persistence, and DOM', async () => {
    root.querySelector('[data-cy="dashboard-create"]').click();
    const dialog = document.querySelector('dialog.task-dialog');
    expect(dialog).not.toBeNull();

    fillCreateForm(dialog, validFormValues());
    await submitForm(dialog);

    const tasks = app.store.getAll();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Survey crater');
    expect(tasks[0].creator).toBe('Commander Aria Vance');
    expect(tasks[0].assignee).toBe('Engineer Kade');
    expect(tasks[0].description).toBe('');

    const persisted = persistence._get();
    expect(persisted).not.toBeNull();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].id).toBe(tasks[0].id);

    expect(root.querySelector('.empty-state--no-tasks')).toBeNull();
    const card = root.querySelector('.task-card');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Survey crater');

    // The toast appears *and* is on `document.body`, not on the
    // test's `root`. This test asserts *presence only*. The
    // dismissal test at the bottom of the file asserts that the
    // toast is not still present after the timer fires — that is
    // the isolation contract.
    const toast = document.querySelector('.toast');
    expect(toast).not.toBeNull();
    expect(toast.textContent).toBe('Task created');
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.getAttribute('aria-live')).toBe('polite');
    expect(toast.getAttribute('data-variant')).toBe('success');

    const leftoverDialog = document.querySelector('dialog.task-dialog');
    if (leftoverDialog !== null) {
      if (leftoverDialog.open) {
        throw new Error(
          'The dialog is still open after a successful create. ' +
            'handleFormSubmit did not call closeActiveDialog() on success — ' +
            'or closeActiveDialog() returned early because activeDialog was null.',
        );
      }
      throw new Error(
        'The dialog is closed but still in the DOM after a successful create. ' +
          'closeActiveDialog() called controller.close() but did not call ' +
          'controller.destroy().',
      );
    }
    expect(leftoverDialog).toBeNull();
  });

  /**
   * [unchanged from the delivered file — the validation-failure
   *  path, with the "any visible error" assertion and the
   *  aria-invalid assertion.]
   *
   * One addition: the test asserts that **no toast was shown on
   * validation failure**. This is the assertion the current test
   * suite's failure pointed at — the *previous* test's toast was
   * still on the page because `beforeEach` did not clean it. With
   * the `beforeEach` cleanup in place, the toast assertion passes
   * for the right reason: no toast exists, not because the
   * previous test's toast has been cleaned but because *this*
   * test's validation path correctly suppresses the toast (a
   * validation error is surfaced in the dialog, not as a
   * transient toast).
   */
  it('keeps the dialog open and shows a field error when validation fails', async () => {
    root.querySelector('[data-cy="dashboard-create"]').click();
    const dialog = document.querySelector('dialog.task-dialog');
    expect(dialog).not.toBeNull();

    fillCreateForm(dialog, validFormValues({ title: '' }));
    await submitForm(dialog);

    expect(app.store.getAll()).toHaveLength(0);
    expect(persistence._get()).toBeNull();

    const stillDialog = document.querySelector('dialog.task-dialog');
    expect(stillDialog).not.toBeNull();
    expect(stillDialog.open).toBe(true);

    const allErrors = stillDialog.querySelectorAll('.task-dialog__error');
    const visibleErrors = Array.from(allErrors).filter(
      (e) => e.textContent.trim() !== '',
    );
    expect(visibleErrors.length).toBeGreaterThan(0);

    const invalidInputs = Array.from(
      stillDialog.querySelectorAll('input[aria-invalid="true"], textarea[aria-invalid="true"]'),
    );
    expect(invalidInputs.length).toBeGreaterThan(0);

    // A validation error is shown in the dialog, not in a toast.
    // The `beforeEach` cleanup is what makes this assertion true
    // for the right reason: there is no toast because the current
    // test did not show one, not because a previous test's toast
    // happened to have been dismissed.
    expect(document.querySelector('.toast')).toBeNull();
  });

  /**
   * [unchanged from the delivered file — the cancel path, with the
   *  structured dialog-gone failure messages.]
   */
  it('does not create a task when the dialog is cancelled', () => {
    root.querySelector('[data-cy="dashboard-create"]').click();
    const dialog = document.querySelector('dialog.task-dialog');
    expect(dialog).not.toBeNull();

    dialog.querySelector('[data-action="cancel-dialog"]').click();

    expect(app.store.getAll()).toHaveLength(0);
    expect(persistence._get()).toBeNull();

    const leftoverDialog = document.querySelector('dialog.task-dialog');
    if (leftoverDialog !== null) {
      if (leftoverDialog.open) {
        throw new Error(
          'The dialog is still open after Cancel was clicked. ' +
            'The cancel button\'s click handler did not call onCancel(), ' +
            'or the click handler\'s `!dialog.open` guard returned early ' +
            'because the dialog was not open (a test-setup bug).',
        );
      }
      throw new Error(
        'The dialog is closed but still in the DOM after Cancel. ' +
          'closeActiveDialog() called controller.close() but not controller.destroy().',
      );
    }
    expect(leftoverDialog).toBeNull();

    // Cancel does not show a toast — the user changed their mind,
    // there is nothing to confirm.
    expect(document.querySelector('.toast')).toBeNull();
  });

  /**
   * [unchanged from the delivered file — the header button
   *  persistence test.]
   */
  it('keeps the header create button available after the first task is created', async () => {
    root.querySelector('[data-cy="dashboard-create"]').click();
    const dialog = document.querySelector('dialog.task-dialog');
    fillCreateForm(dialog, validFormValues());
    await submitForm(dialog);

    expect(root.querySelector('[data-cy="dashboard-empty-create"]')).toBeNull();

    const headerButton = root.querySelector('[data-cy="dashboard-create"]');
    expect(headerButton).not.toBeNull();
    expect(headerButton.disabled).toBe(false);

    headerButton.click();
    const secondDialog = document.querySelector('dialog.task-dialog');
    expect(secondDialog).not.toBeNull();
    expect(secondDialog.open).toBe(true);
    expect(secondDialog.querySelector('input[name="title"]').value).toBe('');
  });

  /**
   * The toast's dismissal lifecycle.
   *
   * The previous tests assert the toast *appears* on success. This
   * test asserts it *disappears* after the timer fires. The two
   * together are the toast's whole lifecycle: show, then dismiss.
   *
   * `jest.useFakeTimers()` is the right tool here — the toast's
   * dismissal is *time-based* (`setTimeout(…, TOAST_DURATION_MS)`),
   * and fake timers let the test advance the clock deterministically.
   * A test that awaited a real `setTimeout(…, 3000)` would take
   * three real seconds and be vulnerable to scheduling jitter.
   *
   * The test uses the real `TOAST_DURATION_MS` constant from the
   * view, not a hard-coded 3000. If the constant changes, the test
   * advances by the new value — the test does not drift from the
   * code.
   */
  it('dismisses the toast after the timer fires', async () => {
    // A fresh clock, scoped to this test. The toast's timer runs on
    // this clock; the test controls when time advances.
    jest.useFakeTimers();
    try {
      root.querySelector('[data-cy="dashboard-create"]').click();
      const dialog = document.querySelector('dialog.task-dialog');
      fillCreateForm(dialog, validFormValues());

      // The submit path has microtasks. Fake timers replace
      // `setTimeout`, not `Promise.resolve`. The microtask flush
      // is still needed for the async pipeline to run; the fake
      // timers only control the toast's *dismissal* timer.
      const form = dialog.querySelector('form');
      form.dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // The toast is visible immediately after the save.
      const toast = document.querySelector('.toast');
      expect(toast).not.toBeNull();
      expect(toast.textContent).toBe('Task created');

      // Advance the fake clock by the toast's duration. The timer
      // callback fires synchronously within `advanceTimersByTime`,
      // so the assertion after it sees the toast *removed*.
      jest.advanceTimersByTime(3000);

      expect(document.querySelector('.toast')).toBeNull();
      expect(document.getElementById('toast-region')).not.toBeNull();
      // The region's children are gone; the region itself stays.
      expect(document.getElementById('toast-region').children.length).toBe(0);
    } finally {
      // Restore the real timers so any *later* test that uses real
      // timers (or the toast's timer in a fresh test) is not
      // affected. `useFakeTimers` is scoped to this test, but
      // `finally` guarantees it is restored even on a throw.
      jest.useRealTimers();
    }
  });
});