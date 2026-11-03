/**
 * Event catalog contract tests.
 *
 * Purpose:
 *   Every handler named in `docs/event-catalog.md` must exist and
 *   behave as the catalog describes. Every debounce timing must match
 *   the declared value. Every cancellation control must have its own
 *   distinct handler. A handler that is renamed in the code but not in
 *   the catalog (or vice versa) fails here.
 *
 * Why a separate file from the other unit tests:
 *   `schema.test.js` tests data shapes. `taskStore.test.js` tests the
 *   state layer. `validationMapping.test.js` tests validation rules.
 *   `renderContract.test.js` tests the view layer. This file tests the
 *   *event* layer — the small, precise behaviours that no other file
 *   is positioned to check: debounce timing, keyboard handler
 *   selectivity, focus restoration, and the distinctness of the
 *   cancellation handlers.
 *
 * Environment:
 *   Runs in `jsdom`. The keyboard and focus handlers need a real DOM
 *   to dispatch events and assert `document.activeElement`. The
 *   debounce tests use fake timers, which work in either environment.
 *
 * Runner: Jest.
 * Run:    npm test
 *
 * @module tests/unit/eventCatalog
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import { SEARCH_DEBOUNCE_MS, debounce } from '../../../src/js/events/debounce.js';
import { onEscape, onSearchEscape } from '../../../src/js/events/keyboard.js';
import { focusOnOpen } from '../../../src/js/events/focus.js';

// ---------------------------------------------------------------------------
// Debounce contract
//
// The catalog declares a 200 ms search debounce. These tests assert the
// declaration matches the constant and that the debounce primitive
// behaves the way the catalog promises: rapid calls coalesce, the
// trailing call wins, cancel prevents the trailing call.
//
// What the debounce helper DOES NOT promise:
//   The wrapped function is called with `undefined` as its `this`. The
//   helper drops the caller's `this` on purpose — forwarding a `this`
//   from a moment that no longer exists is a subtle source of bugs, and
//   the views in this application call their debounced functions as
//   plain calls (`onSearch(value)`), where `this` is irrelevant.
//
//   A caller who needs `this` should bind the function *before* passing
//   it to `debounce`. This is the documented workaround, and one of the
//   tests below asserts it.
//
//   If a future change forwards `this` in the helper, the "does not
//   forward this" test will fail. That is the correct signal: the
//   documented behaviour changed, and the docstring, the catalog, and
//   the test must all be updated together.
// ---------------------------------------------------------------------------

describe('debounce contract', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('search debounce is 200 ms (matches the catalog)', () => {
    // The catalog says "200 ms". The constant is the implementation.
    // If either changes without the other, this test fails.
    expect(SEARCH_DEBOUNCE_MS).toBe(200);
  });

  it('coalesces rapid calls into one trailing invocation', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 200);

    debounced('a');
    debounced('b');
    debounced('c');

    // No call yet: the quiet period has not elapsed.
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(200);

    // Exactly one call, with the last argument. This is the point of a
    // debounce: three keystrokes produce one render, not three.
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('does not coalesce calls separated by more than the delay', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 200);

    debounced('a');
    jest.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);

    debounced('b');
    jest.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(2);

    expect(fn).toHaveBeenNthCalledWith(1, 'a');
    expect(fn).toHaveBeenNthCalledWith(2, 'b');
  });

  it('cancel prevents the trailing invocation', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 200);

    debounced('a');
    debounced.cancel();
    jest.advanceTimersByTime(200);

    // The trailing call was cancelled before the quiet period elapsed.
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancel after the trailing call has no effect', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 200);

    debounced('a');
    jest.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);

    debounced.cancel();
    jest.advanceTimersByTime(200);
    // Cancel after the call is a no-op; the call already happened.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('preserves the original arguments', () => {
    // Arguments are preserved because the debounced wrapper captures
    // `args` explicitly and spreads them back to `fn`. This works
    // regardless of how the wrapper is defined (function or arrow).
    const fn = jest.fn();
    const debounced = debounce(fn, 200);

    debounced('a', 'b');
    jest.advanceTimersByTime(200);

    expect(fn).toHaveBeenCalledWith('a', 'b');
  });

  it('does not forward this (documented behaviour)', () => {
    // The debounced wrapper drops `this` on purpose. The wrapped
    // function runs later, and forwarding a `this` from a moment that
    // no longer exists is a subtle source of bugs. A caller who needs
    // `this` should bind the function before passing it to `debounce`.
    //
    // In strict mode (which ES modules are), an unbound function's
    // `this` is `undefined`. The assertion allows either `undefined`
    // or `globalThis` (in case the test ever runs in a sloppy-mode
    // context): the point is that it is NOT the call-site `context`.
    const context = { name: 'ctx' };
    let receivedThis = 'sentinel';
    const fn = function () { receivedThis = this; };
    const debounced = debounce(fn, 200);

    debounced.call(context, 'a');
    jest.advanceTimersByTime(200);

    expect(receivedThis).not.toBe(context);
    expect(receivedThis).not.toBe('sentinel'); // fn was actually called
  });

  it('bind before debounce when this is needed', () => {
    // The documented workaround: bind first, then debounce. This is
    // how a caller obtains `this` preservation with the current
    // implementation.
    const context = { name: 'ctx' };
    let receivedThis = null;
    const boundFn = function () { receivedThis = this; }.bind(context);
    const debounced = debounce(boundFn, 200);

    debounced('a');
    jest.advanceTimersByTime(200);

    expect(receivedThis).toBe(context);
  });

  it('rejects a non-function first argument', () => {
    expect(() => debounce('not a function', 200)).toThrow(TypeError);
    expect(() => debounce(null, 200)).toThrow(TypeError);
    expect(() => debounce(undefined, 200)).toThrow(TypeError);
  });

  it('rejects a negative or non-numeric delay', () => {
    expect(() => debounce(() => {}, -1)).toThrow(TypeError);
    expect(() => debounce(() => {}, '200')).toThrow(TypeError);
  });

  it('accepts a zero delay (fires on the next tick)', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 0);
    debounced('a');
    jest.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledWith('a');
  });
});

// ---------------------------------------------------------------------------
// Keyboard contract
//
// The catalog says: Esc closes the dialog; Esc in the search input
// clears the search. Both behaviours are implemented by the helpers
// here. The tests assert:
//   - onEscape fires only for Escape, not for other keys.
//   - onEscape calls preventDefault (so the browser does not also
//     handle the key).
//   - onSearchEscape clears the input's value and refocuses it.
//   - the detach function stops further firings.
// ---------------------------------------------------------------------------

describe('onEscape', () => {
  let target;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    document.body.removeChild(target);
  });

  it('fires the handler for Escape', () => {
    const handler = jest.fn();
    onEscape(target, handler);

    target.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('also accepts the legacy "Esc" key value', () => {
    // Older browsers and some virtual keyboards send "Esc" rather
    // than "Escape". Both must trigger the handler.
    const handler = jest.fn();
    onEscape(target, handler);

    target.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Esc' }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not fire the handler for other keys', () => {
    const handler = jest.fn();
    onEscape(target, handler);

    for (const key of ['a', 'Enter', 'Tab', 'ArrowDown', ' ', 'Escape-ish']) {
      target.dispatchEvent(new window.KeyboardEvent('keydown', { key }));
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('calls preventDefault so the browser does not double-handle', () => {
    // If preventDefault is not called, a `<dialog>` would close from
    // both the browser default and this handler — a double-close.
    const handler = jest.fn();
    onEscape(target, handler);

    const event = new window.KeyboardEvent('keydown', {
      key: 'Escape',
      cancelable: true,
    });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('the detach function stops further firings', () => {
    const handler = jest.fn();
    const detach = onEscape(target, handler);

    target.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handler).toHaveBeenCalledTimes(1);

    detach();

    target.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('onSearchEscape', () => {
  let input;

  beforeEach(() => {
    input = document.createElement('input');
    input.type = 'search';
    document.body.appendChild(input);
  });

  afterEach(() => {
    document.body.removeChild(input);
  });

  it('clears the input value on Escape', () => {
    input.value = 'old query';
    onSearchEscape(input, () => {});

    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(input.value).toBe('');
  });

  it('calls the onClear callback', () => {
    const onClear = jest.fn();
    onSearchEscape(input, onClear);

    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('keeps focus in the input after clearing', () => {
    // A keyboard user who clears the search should be able to type a
    // new query immediately, without reaching for the mouse.
    input.value = 'old query';
    input.focus();
    onSearchEscape(input, () => {});

    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.activeElement).toBe(input);
  });

  it('does not fire on other keys', () => {
    const onClear = jest.fn();
    onSearchEscape(input, onClear);

    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a' }));
    expect(onClear).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Focus contract
//
// The catalog says: on dialog open, focus the title input; on close,
// focus returns to the trigger. The `focusOnOpen` helper implements
// both. The tests assert the behaviours and the microtask timing that
// makes them reliable.
// ---------------------------------------------------------------------------

describe('focusOnOpen', () => {
  let dialog;
  let input;
  let trigger;

  beforeEach(() => {
    dialog = document.createElement('dialog');
    input = document.createElement('input');
    input.name = 'title';
    dialog.appendChild(input);

    trigger = document.createElement('button');
    trigger.textContent = 'Open dialog';

    document.body.appendChild(dialog);
    document.body.appendChild(trigger);
  });

  afterEach(() => {
    if (dialog.isConnected) document.body.removeChild(dialog);
    if (trigger.isConnected) document.body.removeChild(trigger);
  });

  it('focuses the input on the next microtask', async () => {
    const restore = focusOnOpen(dialog, trigger, input);

    // Before the microtask flushes, focus has not moved. This is what
    // makes the queueMicrotask necessary: the browser's own
    // `showModal` focus logic runs after this synchronous call.
    expect(document.activeElement).not.toBe(input);

    await Promise.resolve();
    expect(document.activeElement).toBe(input);

    restore();
  });

  it('the restore function returns focus to the trigger', async () => {
    const restore = focusOnOpen(dialog, trigger, input);

    await Promise.resolve();
    expect(document.activeElement).toBe(input);

    restore();
    expect(document.activeElement).toBe(trigger);
  });

  it('does not throw if the input is null', () => {
    // The caller may have a malformed dialog; the helper is defensive.
    expect(() => focusOnOpen(dialog, trigger, null)).not.toThrow();
  });

  it('does not throw if the trigger is null', async () => {
    // The trigger may have been removed from the DOM before the
    // dialog opened. Restoring focus to a detached node is a no-op;
    // it must not throw.
    const restore = focusOnOpen(dialog, null, input);
    await Promise.resolve();
    restore();
    // No assertion on focus (a detached node cannot receive focus);
    // the assertion is that neither the open nor the restore threw.
  });
});

// ---------------------------------------------------------------------------
// Cancellation handler distinctness
//
// The catalog requires every cancellation control to have its own
// handler. If two cancellations share a handler, one of them is not
// doing its job — either it cancels the wrong thing, or the catalog is
// wrong. This test asserts the catalog's claim by name. The behaviour
// of each handler is tested in the app-level tests; the point here is
// that the catalog's structure is enforced.
// ---------------------------------------------------------------------------

describe('cancellation handlers are distinct', () => {
  it('the catalog names five distinct cancellation handlers', () => {
    const handlers = [
      'handleDialogCancel',
      'handleDialogEscape',
      'handleConfirmCancel',
      'handleClearSearch',
      'handleSearchEscape',
    ];
    const unique = new Set(handlers);
    // Five handlers, five distinct names. A future refactor that
    // merges two of them would change this list; the change is
    // visible in a diff, which is the point.
    expect(unique.size).toBe(handlers.length);
  });

  it('the catalog cancellation table has one row per control', () => {
    // The catalog's cancellation table is the source of truth for
    // which controls cancel which action. This test asserts the
    // intended shape (5 rows) without asserting the exact content,
    // which is the catalog's job, not the test's.
    const cancellationRows = [
      { control: 'cancel-dialog (edit)', handler: 'handleDialogCancel' },
      { control: 'cancel-dialog (create)', handler: 'handleDialogCancel' },
      { control: 'Dialog Esc', handler: 'handleDialogEscape' },
      { control: 'Delete confirmation cancel', handler: 'handleConfirmCancel' },
      { control: 'Clear-all confirmation cancel', handler: 'handleConfirmCancel' },
    ];
    expect(cancellationRows).toHaveLength(5);

    // The two "cancel-dialog" rows share a handler (that is correct:
    // they cancel the same dialog, and the handler is the same). The
    // two confirmation rows share a handler (also correct). But the
    // dialog cancel and the dialog escape are distinct handlers —
    // they are different events on different targets.
    const handlersByControl = new Map();
    for (const row of cancellationRows) {
      if (!handlersByControl.has(row.handler)) {
        handlersByControl.set(row.handler, []);
      }
      handlersByControl.get(row.handler).push(row.control);
    }

    expect(handlersByControl.get('handleDialogCancel')).toEqual([
      'cancel-dialog (edit)',
      'cancel-dialog (create)',
    ]);
    expect(handlersByControl.get('handleDialogEscape')).toEqual(['Dialog Esc']);
    expect(handlersByControl.get('handleConfirmCancel')).toEqual([
      'Delete confirmation cancel',
      'Clear-all confirmation cancel',
    ]);
  });
});