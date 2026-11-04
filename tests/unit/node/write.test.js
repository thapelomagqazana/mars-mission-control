/**
 * Storage write tests — the atomicity policy, the failure
 * classification, and the negative check.
 *
 * Three contracts, each tested here:
 *
 *   1. The two decisions are *values*. A future policy change is a
 *      change to the constant (or to `STORAGE_FAILURE_OUTCOME` in
 *      `errors.js`), and the test that asserts the constant's value
 *      fails loudly — the failure names the new value, so a
 *      contributor knows what to update.
 *
 *   2. A successful write returns `{ ok: true }`, calls the adapter's
 *      `save` exactly once with the current task list, and does not
 *      log. The atomicity policy is "per-mutation" — the module
 *      writes once per call, synchronously, no debounce.
 *
 *   3. A failed write returns `{ ok: false, reason, cause }` with
 *      the classified reason (quota / unavailable / unknown), leaves
 *      the adapter's stored value unchanged (nothing was written),
 *      and logs the failure. The log's existence is the
 *      `STORAGE_FAILURE_OUTCOME === 'silent-logged'` policy made
 *      visible; a future policy of `'user-notification'` would move
 *      the display to a view-layer component, and the test would
 *      assert the *report* the store's event layer reads instead.
 *
 * The negative check (contract 3) is the acceptance criterion the
 * WBS item names: "simulate quota failure and confirm the outcome
 * declared in 1.6.1." The tests simulate a `QuotaExceededError` by
 * making the adapter's `save` throw a `DOMException` with that name.
 *
 * On the test stub's faithfulness
 *   The `adapter` helper below simulates the persistence adapter.
 *   The real adapter's `save` throws *whatever it is configured to
 *   throw* — a `QuotaExceededError`, a `SecurityError`, an arbitrary
 *   `Error`, or (in a contrived case) a non-Error value like `null`
 *   or `undefined`. The stub is faithful to that contract only if it
 *   *throws on demand for any configured failure value*, not only for
 *   truthy ones. The stub checks `'failure' in options` (presence),
 *   not `if (failure)` (truthiness) — because a stub that silently
 *   skips the throw for `null`/`undefined` would fail to exercise the
 *   module's edge-case handling, and the module's tests would
 *   silently miss the edge.
 *
 *   This is the one place the stub's *shape* matters to the test's
 *   *meaning*: a truthiness guard turns "the adapter threw `null`"
 *   into "the adapter succeeded." The presence check preserves the
 *   real thing's contract.
 *
 * Environment: node. The module is a pure read-and-write over an
 * injected adapter; it does not touch the DOM or `localStorage`
 * directly, so no jsdom is needed.
 *
 * @module tests/unit/node/write
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import {
  writeToStorage,
  WRITE_ATOMICITY,
} from '../../../src/js/store/write.js';

import { STORAGE_FAILURE_OUTCOME } from '../../../src/js/store/errors.js';

// ---------------------------------------------------------------------------
// Console spy
//
// The write module logs on failure. The tests capture the console to
// assert the log fires when the policy says it does — and does not fire
// when the policy says it does not.
// ---------------------------------------------------------------------------

let warnSpy;

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A valid task. The write module does not validate — it writes
 * whatever tasks it is given. The fixture is a realistic object so
 * the tests read like real calls.
 */
function validTask(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Check hull',
    description: '',
    creator: 'Commander Aria Vance',
    assignee: 'Engineer Kade',
    createdAt: '2026-11-03T09:00:00.000Z',
    ...overrides,
  };
}

/**
 * An in-memory persistence adapter whose `save` can be made to throw
 * on demand and whose saved value can be inspected.
 *
 * The `_saveCalls` array records every `save` invocation, so a test
 * can assert how many calls the write module made (the atomicity
 * policy: one call per write) and what argument each call received.
 *
 * The `_saved()` value is the last successfully written value — the
 * write module does not partially write, so a failed call leaves this
 * value unchanged.
 *
 * The failure is *configured* (not merely present as a truthy value)
 * when the caller passes the `failure` key on `options`. This is
 * deliberate: the real adapter's `save` throws whatever it is
 * configured to throw, including a `null` or `undefined` value (a
 * legal JavaScript throw, and one the module's classifier must
 * handle). A stub that skipped the throw for a falsy `failure` would
 * fail to exercise the module's edge-case handling.
 *
 * @param {unknown} initial - the value `load` returns.
 * @param {{ failure?: unknown }} [options] - if the `failure` key is
 *   present, `save` throws its value. Absent, `save` succeeds.
 */
function adapter(initial = [], options = {}) {
  let saved = initial;
  const saveCalls = [];
  const hasFailure = Object.prototype.hasOwnProperty.call(options, 'failure');

  return {
    save(tasks) {
      saveCalls.push(tasks);
      // Presence check, not truthiness: a configured `null` or
      // `undefined` failure is still a failure. The real adapter's
      // `save` throws whatever it fails with, and the stub must do
      // the same.
      if (hasFailure) throw options.failure;
      saved = tasks;
    },
    _saved() {
      return saved;
    },
    _saveCalls() {
      return saveCalls;
    },
  };
}

// ---------------------------------------------------------------------------
// Policy declarations
//
// A future policy change is a change to the constant. The tests below
// assert the *current* value, so a change without updating this file
// is a loud failure (the test names the new value).
// ---------------------------------------------------------------------------

describe('write policy declarations', () => {
  it('declares WRITE_ATOMICITY as a value', () => {
    expect(['per-mutation', 'debounced-batch']).toContain(WRITE_ATOMICITY);
  });

  it('declares STORAGE_FAILURE_OUTCOME as a value (in errors.js)', () => {
    expect(['silent-logged', 'user-notification']).toContain(STORAGE_FAILURE_OUTCOME);
  });
});

// ---------------------------------------------------------------------------
// Contract 2 — successful write
// ---------------------------------------------------------------------------

describe('writeToStorage — success', () => {
  it('returns { ok: true } on a successful save', () => {
    const p = adapter([]);
    const tasks = [validTask()];

    const result = writeToStorage(p, tasks);

    expect(result).toEqual({ ok: true });
  });

  it('calls save exactly once with the exact task list', () => {
    const p = adapter([]);
    const tasks = [validTask()];

    writeToStorage(p, tasks);

    expect(p._saveCalls()).toHaveLength(1);
    expect(p._saveCalls()[0]).toBe(tasks);
    expect(p._saved()).toBe(tasks);
  });

  it('does not log on success', () => {
    const p = adapter([]);
    writeToStorage(p, [validTask()]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('writes an empty task list successfully', () => {
    // An empty list is a valid write — `clear` writes `[]` to
    // persist the emptied state. The module does not skip the save
    // for an empty list.
    const p = adapter([validTask()]);

    const result = writeToStorage(p, []);

    expect(result).toEqual({ ok: true });
    expect(p._saved()).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Contract 3 — failed write (the negative check)
//
// The three classifications (quota, unavailable, unknown) and the
// silent-logged outcome. Each test simulates a failure the production
// code will encounter on its worst day, and walks the failure path.
// ---------------------------------------------------------------------------

describe('writeToStorage — failure: quota', () => {
  it('classifies a QuotaExceededError as "quota"', () => {
    const quotaError = new DOMException('Storage full', 'QuotaExceededError');
    const p = adapter([validTask()], { failure: quotaError });
    const tasks = [validTask(), validTask({ id: 'b' })];

    const result = writeToStorage(p, tasks);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('quota');
    expect(result.cause).toBe(quotaError);
  });

  it('leaves the adapter\'s stored value unchanged on quota failure', () => {
    // The adapter's save throws before writing (a correct adapter
    // does not partially write — the invariant the module relies on).
    // The stored value is the initial one.
    const p = adapter([validTask({ id: 'prior' })], {
      failure: new DOMException('Storage full', 'QuotaExceededError'),
    });
    const prior = p._saved();

    writeToStorage(p, [validTask(), validTask({ id: 'b' })]);

    expect(p._saved()).toEqual(prior);
  });

  it('logs the quota failure with the reason and the task count', () => {
    const p = adapter([], {
      failure: new DOMException('Storage full', 'QuotaExceededError'),
    });
    writeToStorage(p, [validTask(), validTask({ id: 'b' })]);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0][0];
    expect(message).toMatch(/save failed/);
    expect(message).toMatch(/quota/);
    expect(message).toMatch(/2 tasks/);
    // The log does not name the task contents — a task's contents
    // are user data, and logging them would leak that data to the
    // console. The log names the *count*, which is enough for a
    // developer to know whether the failure happened on an empty
    // store or a populated one.
    expect(message).not.toMatch(/Check hull/);
  });

  it('classifies NS_ERROR_DOM_QUOTA_REACHED as "quota" (Firefox variant)', () => {
    const p = adapter([], {
      failure: new DOMException('Storage full', 'NS_ERROR_DOM_QUOTA_REACHED'),
    });
    const result = writeToStorage(p, [validTask()]);
    expect(result.reason).toBe('quota');
  });

  it('classifies a generic Error with "quota" in the message as "quota"', () => {
    // Some environments throw a plain Error with a "quota exceeded"
    // message. The classifier reads the message as a fallback.
    const p = adapter([], { failure: new Error('Quota exceeded for storage') });
    const result = writeToStorage(p, [validTask()]);
    expect(result.reason).toBe('quota');
  });
});

describe('writeToStorage — failure: unavailable', () => {
  it('classifies a SecurityError as "unavailable"', () => {
    // Some environments (private-mode browsers; a security policy
    // that blocks localStorage) throw a SecurityError.
    const p = adapter([], { failure: new DOMException('Storage blocked', 'SecurityError') });
    const result = writeToStorage(p, [validTask()]);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unavailable');
  });

  it('classifies an InvalidStateError as "unavailable" (Chrome private-mode variant)', () => {
    const p = adapter([], { failure: new DOMException('Storage blocked', 'InvalidStateError') });
    const result = writeToStorage(p, [validTask()]);
    expect(result.reason).toBe('unavailable');
  });
});

describe('writeToStorage — failure: unknown', () => {
  it('classifies an unrecognised error as "unknown"', () => {
    // An adapter bug, a programming error, or an adapter-specific
    // error the classifier does not know about. The result is still
    // `{ ok: false }` — the module does not throw — so the store can
    // roll back and the caller can decide what to do.
    const p = adapter([], { failure: new Error('Some other failure') });
    const result = writeToStorage(p, [validTask()]);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unknown');
    expect(result.cause).toBeInstanceOf(Error);
  });

  it('classifies a null/undefined thrown value as "unknown"', () => {
    // A `throw null` or `throw undefined` is legal JavaScript (the
    // adapter could throw a non-Error). The classifier is total on
    // the *thrown value*: it returns 'unknown' rather than throwing
    // itself.
    //
    // The stub's `save` must throw the configured `null`/`undefined`
    // — hence the presence check in the `adapter` helper above. A
    // truthiness guard (`if (failure)`) would skip the throw for
    // these values, and the test would silently exercise the wrong
    // path.
    for (const thrown of [null, undefined]) {
      const p = adapter([], { failure: thrown });
      const result = writeToStorage(p, [validTask()]);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('unknown');
    }
  });
});

// ---------------------------------------------------------------------------
// Contract 3 (continued) — the "silent-logged" outcome
//
// The policy `STORAGE_FAILURE_OUTCOME === 'silent-logged'` means:
// on failure, the module logs (silent) and does not show a
// user-facing notification (no view-layer call). The tests below
// assert the *log* — the "logged" half of the policy. The "silent"
// half (no view-layer call) is tested indirectly by asserting the
// module's *only* side effect is the log call.
// ---------------------------------------------------------------------------

describe('writeToStorage — silent-logged outcome policy', () => {
  it('asserts the policy is "silent-logged"', () => {
    // A guard that fires if the policy changes. The test body is
    // the assertion; the guard is the message when the assertion is
    // out of date.
    if (STORAGE_FAILURE_OUTCOME !== 'silent-logged') {
      throw new Error(
        `This test asserts the "silent-logged" outcome; the recorded policy is "${STORAGE_FAILURE_OUTCOME}". ` +
          'Update the module, the doc, and this test together.',
      );
    }
  });

  it('logs on failure (matches the "silent-logged" policy)', () => {
    const p = adapter([], { failure: new Error('boom') });
    writeToStorage(p, [validTask()]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('logs even when the failed write was for an empty list', () => {
    // A failure on `clear` (an empty list) is still a failure. The
    // policy is about the *event*, not the *size of the data*.
    const p = adapter([], { failure: new Error('boom') });
    writeToStorage(p, []);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('logs with the reason and the count for every classification', () => {
    const cases = [
      {
        failure: new DOMException('Storage full', 'QuotaExceededError'),
        reason: 'quota',
      },
      {
        failure: new DOMException('Storage blocked', 'SecurityError'),
        reason: 'unavailable',
      },
      {
        failure: new Error('boom'),
        reason: 'unknown',
      },
    ];

    for (const { failure, reason } of cases) {
      warnSpy.mockClear();
      const p = adapter([], { failure });
      writeToStorage(p, [validTask(), validTask({ id: 'b' })]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = warnSpy.mock.calls[0][0];
      expect(message).toContain(reason);
      expect(message).toContain('2 tasks');
    }
  });
});

// ---------------------------------------------------------------------------
// Contract 3 (continued) — totality
//
// `writeToStorage` is total: it returns a result for every input. A
// failed write is not a thrown error — the caller (the store) decides
// what to throw. A future change that added a throw would fail these
// tests.
// ---------------------------------------------------------------------------

describe('writeToStorage — totality', () => {
  it('does not throw when the adapter throws', () => {
    const p = adapter([], { failure: new Error('boom') });
    expect(() => writeToStorage(p, [validTask()])).not.toThrow();
  });

  it('does not throw when the adapter throws a non-Error value', () => {
    for (const thrown of [null, undefined, 42, 'string']) {
      const p = adapter([], { failure: thrown });
      expect(() => writeToStorage(p, [validTask()])).not.toThrow();
    }
  });

  it('returns a result object with the expected shape on every call', () => {
    const success = writeToStorage(adapter([]), []);
    expect(success).toHaveProperty('ok');
    expect(success.ok).toBe(true);

    const failure = writeToStorage(adapter([], { failure: new Error('boom') }), []);
    expect(failure).toHaveProperty('ok');
    expect(failure).toHaveProperty('reason');
    expect(failure).toHaveProperty('cause');
    expect(failure.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Atomicity policy — write-on-every-call
//
// `WRITE_ATOMICITY === 'per-mutation'` means the module writes on
// every call, synchronously. The tests below assert the *unit*
// behaviour (one call → one save); the atomicity's *arrangement* (the
// store calls this module from every mutation) is tested in
// `taskStore.test.js`.
// ---------------------------------------------------------------------------

describe('writeToStorage — atomicity (per-mutation)', () => {
  it('asserts the policy is "per-mutation"', () => {
    if (WRITE_ATOMICITY !== 'per-mutation') {
      throw new Error(
        `This test asserts "per-mutation" atomicity; the recorded policy is "${WRITE_ATOMICITY}". ` +
          'Update the module, the doc, and this test together.',
      );
    }
  });

  it('performs exactly one save per call', () => {
    const p = adapter([]);
    writeToStorage(p, [validTask()]);
    expect(p._saveCalls()).toHaveLength(1);
  });

  it('does not debounce or batch (immediate write)', () => {
    // A debounced policy would not call save synchronously. This
    // test asserts the save already happened by the time the module
    // returned — the value is in the adapter, not scheduled for
    // later.
    const p = adapter([]);
    writeToStorage(p, [validTask()]);
    expect(p._saved()).toHaveLength(1);
  });

  it('writes on every call (no coalescing)', () => {
    // Three calls → three saves. A batching policy would coalesce
    // the first two; the atomicity policy does not.
    const p = adapter([]);
    writeToStorage(p, [validTask()]);
    writeToStorage(p, [validTask(), validTask({ id: 'b' })]);
    writeToStorage(p, []);
    expect(p._saveCalls()).toHaveLength(3);
  });
});