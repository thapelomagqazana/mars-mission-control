/**
 * Initialization tests — the four cases, the fifth case, and the four
 * policy values.
 *
 * The module declares four policies (write-timing, corruption, empty-
 * input, notice) as values. Each test asserts:
 *
 *   1. The returned task list matches the policy's expected outcome.
 *   2. The side effects (a write, a console warning, or neither) match
 *      the policy's declared behaviour.
 *
 * A future change to a policy is a change to the exported constant
 * AND to the module's code AND to this test file — together, in the
 * same commit. The tests read from the constants where the policy
 * value is part of the assertion, so a policy change that forgot the
 * tests is caught by the constant-vs-behaviour mismatch (a policy of
 * 'whole-discard' would fail a test that asserts per-record-filter
 * behaviour, and the failure names the constant).
 *
 * Environment: node. The initialize module is a pure read-and-filter
 * over an injected adapter; it does not touch the DOM or `localStorage`
 * directly, so no jsdom is needed.
 *
 * @module tests/unit/node/initialize
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import {
  initializeStore,
  INIT_WRITE_POLICY,
  INIT_CORRUPTION_POLICY,
  INIT_EMPTY_INPUT_POLICY,
  INIT_CORRUPTION_NOTICE,
} from '../../../src/js/store/initialize.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A valid task object — passes the conformance checker. Every field is
 * present, at its declared type, with a value the schema's format
 * validators accept. A future schema change that added a field would
 * need a fixture update; the "produces the array unchanged" test would
 * then fail, naming the missing field.
 */
function validTask(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Check hull',
    description: 'Inspect the port-side seal.',
    creator: 'Commander Aria Vance',
    assignee: 'Engineer Kade',
    createdAt: '2026-11-03T09:00:00.000Z',
    ...overrides,
  };
}

/**
 * A non-conforming task — fails the conformance checker. Used to
 * construct partially invalid arrays. The shape is irrelevant to the
 * test (the checker will fail on the missing field); it just has to be
 * recognisably not a task.
 */
function invalidTask() {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    // title is missing — required field violation.
    description: '',
    creator: 'Commander Aria Vance',
    assignee: 'Engineer Kade',
    createdAt: '2026-11-03T09:00:00.000Z',
  };
}

/**
 * An in-memory persistence adapter that records writes and throws on
 * demand. The initialize module *reads* from the adapter; if the module
 * wrote on load, the adapter's `save` count would be non-zero. The
 * write-count assertions in the tests below rely on this — a future
 * change that wrote on load would fail the "does not write" tests.
 *
 * @param {any} initialRaw - the value `load()` returns.
 * @param {{ throwOnLoad?: boolean }} [options]
 */
function inMemoryPersistence(initialRaw = null, options = {}) {
  let current = initialRaw;
  const writes = [];

  return {
    load() {
      if (options.throwOnLoad) {
        throw new Error('Simulated load failure');
      }
      return current;
    },
    save(tasks) {
      writes.push(tasks);
      current = tasks;
    },
    // Test-only helpers — not part of the adapter contract.
    _writes() {
      return writes;
    },
    _current() {
      return current;
    },
  };
}

// ---------------------------------------------------------------------------
// Console spy
//
// The initialize module logs two kinds of warnings (non-array raw value;
// dropped records). The tests capture the console to assert the warning
// fires when the policy says it does — and does not fire when the policy
// says it does not. A future change that silenced the warning would fail
// the "logs when the policy says" tests; a change that fired it
// unconditionally would fail the "does not log" tests.
// ---------------------------------------------------------------------------

let warnSpy;

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Policy declaration
// ---------------------------------------------------------------------------

describe('initialize — policy declarations', () => {
  it('declares INIT_WRITE_POLICY as a value', () => {
    expect(['lazy', 'immediate']).toContain(INIT_WRITE_POLICY);
  });

  it('declares INIT_CORRUPTION_POLICY as a value', () => {
    expect(['per-record-filter', 'whole-discard', 'fail-hard-with-message'])
      .toContain(INIT_CORRUPTION_POLICY);
  });

  it('declares INIT_EMPTY_INPUT_POLICY as a value', () => {
    expect(['treat-as-empty', 'fail']).toContain(INIT_EMPTY_INPUT_POLICY);
  });

  it('declares INIT_CORRUPTION_NOTICE as a value', () => {
    expect(['console-warning', 'user-banner']).toContain(INIT_CORRUPTION_NOTICE);
  });
});

// ---------------------------------------------------------------------------
// Case 1 — missing key
// ---------------------------------------------------------------------------

describe('initialize — case 1: missing key (null/undefined)', () => {
  for (const raw of [null, undefined]) {
    it(`returns [] and does not write for raw=${String(raw)}`, () => {
      const persistence = inMemoryPersistence(raw);
      const tasks = initializeStore(persistence);

      expect(tasks).toEqual([]);
      // The lazy-write policy: no write on load. The empty state is
      // in-memory until the first mutation.
      expect(persistence._writes()).toEqual([]);
      // No console warning — a missing key is the expected first-run
      // state, not a corruption.
      expect(warnSpy).not.toHaveBeenCalled();
    });
  }

  it('the policy is "treat-as-empty" (asserts the module matches its declared policy)', () => {
    // If the policy ever changes to 'fail', this test should be
    // replaced with one that asserts the constructor throws. The
    // assertion below is against the *policy value*, not the module's
    // behaviour — the behaviour assertion is in the test above.
    if (INIT_EMPTY_INPUT_POLICY !== 'treat-as-empty') {
      throw new Error(
        `The module's case-1 test asserts "treat-as-empty" behaviour; the recorded policy is "${INIT_EMPTY_INPUT_POLICY}". ` +
          'Update the module and this test together.',
      );
    }
    const persistence = inMemoryPersistence(null);
    expect(() => initializeStore(persistence)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Case 2 — empty array
// ---------------------------------------------------------------------------

describe('initialize — case 2: empty array', () => {
  it('returns [] and does not write for a raw empty array', () => {
    const persistence = inMemoryPersistence([]);
    const tasks = initializeStore(persistence);

    expect(tasks).toEqual([]);
    // The lazy-write policy: an empty array already IS the value; a
    // write would be a no-op that could fail. No write.
    expect(persistence._writes()).toEqual([]);
    // No console warning — an empty array is the empty state, not a
    // corruption.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('treats a parsed "[]" the same as a raw empty array', () => {
    // The adapter returns parsed values, but a test can pass the
    // already-parsed empty array; the behavior is identical. This
    // test exists so a future adapter change that returned parsed
    // vs. raw values is visible in one place.
    const persistence = inMemoryPersistence(JSON.parse('[]'));
    const tasks = initializeStore(persistence);
    expect(tasks).toEqual([]);
    expect(persistence._writes()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Case 3 — valid array
// ---------------------------------------------------------------------------

describe('initialize — case 3: valid array', () => {
  it('returns the array unchanged and does not write', () => {
    const raw = [validTask(), validTask({ id: '33333333-3333-4333-8333-333333333333' })];
    const persistence = inMemoryPersistence(raw);
    const tasks = initializeStore(persistence);

    // The returned array has the same length and each element is
    // deep-equal to the corresponding input element. The module does
    // not filter, sort, or mutate.
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual(raw[0]);
    expect(tasks[1]).toEqual(raw[1]);

    // The lazy-write policy: the value is already correct; no write.
    expect(persistence._writes()).toEqual([]);

    // No warning — every record was valid.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not modify the input array (it returns a new array or the same contents)', () => {
    // The module may return `raw` directly or a copy; either is fine,
    // but the *contents* must not have been mutated. This test asserts
    // the contents — the reader of this test file cares that
    // initializeStore does not silently drop or reorder records on a
    // valid input.
    const raw = [validTask()];
    const persistence = inMemoryPersistence(raw);
    const tasks = initializeStore(persistence);

    expect(tasks).toEqual(raw);
    expect(raw).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Case 4 — partially invalid array
// ---------------------------------------------------------------------------

describe('initialize — case 4: partially invalid array', () => {
  it('keeps valid records, drops invalid records, returns the filtered array', () => {
    const raw = [
      validTask({ id: 'aaaa1111-1111-4111-8111-111111111111' }),
      invalidTask(),
      validTask({ id: 'bbbb2222-2222-4222-8222-222222222222' }),
      invalidTask(),
    ];
    const persistence = inMemoryPersistence(raw);
    const tasks = initializeStore(persistence);

    // Two valid records survive; two invalid records are dropped.
    expect(tasks).toHaveLength(2);
    expect(tasks[0].id).toBe('aaaa1111-1111-4111-8111-111111111111');
    expect(tasks[1].id).toBe('bbbb2222-2222-4222-8222-222222222222');

    // The lazy-write policy: no write on load, even when the load
    // dropped records. The drop will be persisted on the next
    // mutation (create / update / deleteTask / clear) — not here.
    expect(persistence._writes()).toEqual([]);
  });

  it('logs a console warning naming the count of dropped records', () => {
    const raw = [
      validTask({ id: 'aaaa1111-1111-4111-8111-111111111111' }),
      invalidTask(),
      invalidTask(),
    ];
    const persistence = inMemoryPersistence(raw);
    initializeStore(persistence);

    // The console-warning policy: the drop is reported. The message
    // names the count (2) so a developer sees how much data was
    // lost without reading the console for individual records.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0][0];
    expect(message).toMatch(/2 records/);
    expect(message).toMatch(/dropped/);
    // The warning does not name the record contents — those are
    // untrusted and would leak hand-edited data to the console. The
    // count is what the developer needs.
    expect(message).not.toMatch(/Check hull/);
  });

  it('uses singular "record" for a single dropped record', () => {
    // A single dropped record produces a warning with "1 record", not
    // "1 records". A future change that dropped the singular case
    // would produce a message a reviewer would notice — and a
    // developer reading "1 records dropped" would notice the bug in
    // the message itself.
    const raw = [validTask(), invalidTask()];
    const persistence = inMemoryPersistence(raw);
    initializeStore(persistence);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0][0];
    expect(message).toMatch(/1 record[^s]/);
  });

  it('the per-record-filter policy is what produced this behaviour', () => {
    // Guard: if the policy ever changes to 'whole-discard', this test
    // should be replaced with one that asserts the whole array is
    // dropped. The guard is the test's way of failing *loudly* when a
    // policy changes without the test being updated — a silent pass
    // would let the policy drift.
    if (INIT_CORRUPTION_POLICY !== 'per-record-filter') {
      throw new Error(
        `This test asserts the "per-record-filter" policy; the recorded policy is "${INIT_CORRUPTION_POLICY}". ` +
          'Update the module and this test together.',
      );
    }
  });

  it('the console-warning policy is what produced the notice', () => {
    // Guard: if the policy ever changes to 'user-banner', this test
    // should be replaced with one that asserts the store returns a
    // report the view can display. The guard makes the change visible.
    if (INIT_CORRUPTION_NOTICE !== 'console-warning') {
      throw new Error(
        `This test asserts the "console-warning" notice policy; the recorded policy is "${INIT_CORRUPTION_NOTICE}". ` +
          'Update the module and this test together.',
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Fifth case — non-array raw value
//
// The WBS item names four cases; the initialize module documents a
// fifth (non-array raw value) as a shape the module recovers from,
// using the same 'treat-as-empty' policy as a missing key. The fifth
// case is tested here because a future adapter change that returned
// something other than an array (a Map, an object) would go through
// this path.
// ---------------------------------------------------------------------------

describe('initialize — fifth case: non-array raw value', () => {
  for (const raw of ['garbage', 42, true, { not: 'an array' }, Symbol('x')]) {
    it(`recovers to [] for raw of type ${typeof raw === 'symbol' ? 'symbol' : typeof raw}`, () => {
      const persistence = inMemoryPersistence(raw);
      const tasks = initializeStore(persistence);

      expect(tasks).toEqual([]);
      // The lazy-write policy: no write, even on this recovery. The
      // empty state is in-memory until the first mutation.
      expect(persistence._writes()).toEqual([]);
    });
  }

  it('logs a console warning for a non-array raw value', () => {
    // The console warning is the developer's signal that the
    // persisted data is not what the store expects. The message names
    // the *kind* of raw value (string, object, primitive) so a
    // developer can tell "the value was a string" from "the value was
    // an object."
    const persistence = inMemoryPersistence('garbage');
    initializeStore(persistence);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0][0];
    expect(message).toMatch(/not an array/);
    expect(message).toMatch(/string/);
  });

  it('the warning names the raw value kind for the developer', () => {
    // A raw value of `{ not: 'an array' }` should be described as
    // "object", not "string" or "primitive". The kind is what a
    // developer debugging the corruption uses to understand what they
    // are looking at.
    const persistence = inMemoryPersistence({ not: 'an array' });
    initializeStore(persistence);
    const message = warnSpy.mock.calls[0][0];
    expect(message).toMatch(/object/);
  });
});

// ---------------------------------------------------------------------------
// Load failure (adapter throws)
//
// `initializeStore` does not catch a load failure — it propagates.
// The *store* wraps the failure as StorageError. This test asserts
// the propagation, which is the module's contract: the module's job
// is to read and classify; the error *type* (StorageError) is the
// store's vocabulary, not the module's.
// ---------------------------------------------------------------------------

describe('initialize — load failure', () => {
  it('propagates the adapter\'s error (does not catch)', () => {
    // The module does not import StorageError, and does not catch —
    // the error is the adapter's, and the module's contract is to
    // propagate it. The store's constructor wraps it, which is
    // tested in taskStore.test.js.
    const persistence = inMemoryPersistence(null, { throwOnLoad: true });
    expect(() => initializeStore(persistence)).toThrow('Simulated load failure');
  });

  it('does not write when the adapter throws on load', () => {
    const persistence = inMemoryPersistence(null, { throwOnLoad: true });
    expect(() => initializeStore(persistence)).toThrow();
    expect(persistence._writes()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Write-timing policy — the load does not write
//
// Asserted for every case at once, because the policy is "the load
// does not write" regardless of which case the load is in. A future
// change that added a write to one branch of `initializeStore` would
// fail this test even if the other branches were correct.
// ---------------------------------------------------------------------------

describe('initialize — write-timing: no write on load', () => {
  const cases = [
    ['missing key', null],
    ['empty array', []],
    ['valid array', [validTask()]],
    ['partially invalid array', [validTask(), invalidTask()]],
    ['non-array raw value', 'garbage'],
  ];

  for (const [label, raw] of cases) {
    it(`does not call save for case: ${label}`, () => {
      const persistence = inMemoryPersistence(raw);
      initializeStore(persistence);
      expect(persistence._writes()).toEqual([]);
    });
  }

  it('the policy is "lazy" (guard)', () => {
    if (INIT_WRITE_POLICY !== 'lazy') {
      throw new Error(
        `This test asserts the "lazy" write policy; the recorded policy is "${INIT_WRITE_POLICY}". ` +
          'Update the module and this test together.',
      );
    }
  });
});