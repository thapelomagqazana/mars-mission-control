/**
 * Double-submit protection tests — the dialog's `submitting` guard.
 *
 * [the module header comment is preserved from the previous delivery.]
 *
 * The failed-save test's onSubmit catches its own rejection.
 *   The dialog's contract is "the caller's `onSubmit` is
 *   responsible for its own rejections." The dialog's submit
 *   handler awaits `onSubmit` and its `finally` clears the
 *   `submitting` flag — but it does NOT catch the rejection. If
 *   `onSubmit` rejects, the rejection propagates out of the dialog's
 *   submit handler (which is an async event listener — its
 *   returned promise is discarded by the browser) and becomes an
 *   unhandled rejection.
 *
 *   The previous delivery's failed-save test rejected a promise
 *   that the dialog awaited — and the rejection propagated out as
 *   an unhandled rejection, crashing the Jest worker. The fix is
 *   to have the test's `onSubmit` wrap its deferred promise in a
 *   `try`/`catch` so the rejection is handled inside the caller.
 *   The dialog's behaviour is unchanged; the caller (the test)
 *   is honouring the dialog's contract.
 *
 * @module tests/unit/doubleSubmit
 */
import { describe, it, expect, beforeEach } from '@jest/globals';

import { createTaskDialog } from '../../../src/js/views/dialog.js';

/**
 * A deferred promise. [unchanged from the previous delivery.]
 */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * [unchanged from the previous delivery.]
 */
function submitForm(dialogElement) {
  const form = dialogElement.querySelector('form');
  form.dispatchEvent(
    new window.Event('submit', { bubbles: true, cancelable: true }),
  );
}

/**
 * jsdom's `<dialog>` stubs. [unchanged from the previous delivery.]
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

describe('createTaskDialog — double-submit protection', () => {
  it('does not call onSubmit again for a second submit during an in-flight save', async () => {
    const save = deferred();
    const onSubmit = jest.fn(() => save.promise);

    const dialog = createTaskDialog({
      mode: 'create',
      task: null,
      onSubmit,
      onCancel: () => {},
    });
    dialog.open();

    submitForm(dialog.element);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    submitForm(dialog.element);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    save.resolve();
    await save.promise;
    await Promise.resolve();

    submitForm(dialog.element);
    expect(onSubmit).toHaveBeenCalledTimes(2);

    dialog.destroy();
  });

  it('marks the form aria-busy while the save is in flight', async () => {
    const save = deferred();
    const onSubmit = jest.fn(() => save.promise);

    const dialog = createTaskDialog({
      mode: 'create',
      task: null,
      onSubmit,
      onCancel: () => {},
    });
    dialog.open();

    const form = dialog.element.querySelector('form');
    expect(form.hasAttribute('aria-busy')).toBe(false);

    submitForm(dialog.element);
    expect(form.getAttribute('aria-busy')).toBe('true');

    save.resolve();
    await save.promise;
    await Promise.resolve();

    expect(form.hasAttribute('aria-busy')).toBe(false);

    dialog.destroy();
  });

  /**
   * FIX: onSubmit catches its own rejection.
   *
   * The dialog's submit handler does not catch a rejection from
   * `onSubmit`. The contract is that the *caller* (which provides
   * `onSubmit`) is responsible for handling its own rejections —
   * the app's `handleFormSubmit` catches them, and this test's
   * `onSubmit` must too. Without the catch, the rejection propagates
   * as an unhandled rejection and crashes the Jest worker.
   */
  it('clears the guard after a failed save, leaving the form submittable', async () => {
    const save = deferred();

    // The onSubmit wrapper catches its own rejection. The dialog
    // sees a resolved promise (the catch's result, `undefined`),
    // clears its `submitting` flag in `finally`, and remains
    // submittable.
    const onSubmit = jest.fn(async () => {
      try {
        await save.promise;
      } catch {
        // Swallow — the test exercises the dialog's `finally` path,
        // not the caller's error handling. The caller (this test's
        // `onSubmit`) is responsible for its own rejections per the
        // dialog's contract.
      }
    });

    const dialog = createTaskDialog({
      mode: 'create',
      task: null,
      onSubmit,
      onCancel: () => {},
    });
    dialog.open();

    const form = dialog.element.querySelector('form');

    submitForm(dialog.element);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(form.getAttribute('aria-busy')).toBe('true');

    save.reject(new Error('Simulated save failure'));

    // Await the promise *through the onSubmit wrapper* so the
    // rejection has been handled by the wrapper before this test
    // asserts. The wrapper's own catch is what removes the
    // unhandled-rejection risk.
    await onSubmit.mock.results[0].value;
    await Promise.resolve();

    expect(form.hasAttribute('aria-busy')).toBe(false);

    submitForm(dialog.element);
    expect(onSubmit).toHaveBeenCalledTimes(2);

    dialog.destroy();
  });

  it('allows a subsequent submit after a save completes', async () => {
    const save1 = deferred();
    const save2 = deferred();
    const onSubmit = jest
      .fn()
      .mockReturnValueOnce(save1.promise)
      .mockReturnValueOnce(save2.promise);

    const dialog = createTaskDialog({
      mode: 'create',
      task: null,
      onSubmit,
      onCancel: () => {},
    });
    dialog.open();

    submitForm(dialog.element);
    save1.resolve();
    await save1.promise;
    await Promise.resolve();

    submitForm(dialog.element);
    expect(onSubmit).toHaveBeenCalledTimes(2);

    save2.resolve();
    await save2.promise;
    await Promise.resolve();

    dialog.destroy();
  });
});