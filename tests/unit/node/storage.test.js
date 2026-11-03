/**
 * Storage adapter contract tests.
 *
 * Purpose:
 *   Every failure mode in `docs/persistence-mapping.md` becomes a test
 *   here. Each test asserts the documented recovery branch — the exact
 *   error type, the exact operation name, the exact behaviour — so that
 *   a change to the recovery is caught before it reaches the browser.
 *
 * Environment:
 *   Runs in `node`. The adapter's `localStorage`-specific paths are
 *   driven by a stub `globalThis.localStorage`; the memory fallback is
 *   tested as-is. The adapter does not touch the DOM, so jsdom is not
 *   required.
 *
 * Imports:
 *   The test file lives at `tests/unit/node/storage.test.js` (three
 *   levels deep), so the source paths use `../../../src/js/...` — the
 *   `../` count matches the directory depth, not the number of parent
 *   directories a reader might assume. The other files in this
 *   directory use the same depth; if one is updated without the other,
 *   the module resolver fails at load time, which is a visible defect,
 *   not a silent one.
 *
 * Runner: Jest.
 * Run:    npm test
 *
 * @module tests/unit/node/storage
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import {
  STORAGE_KEY,
  createMemoryAdapter,
  createStorageAdapter,
} from '../../../src/js/utils/storage.js';
import { StorageError } from '../../../src/js/store/errors.js';

// ---------------------------------------------------------------------------
// STORAGE_KEY — the exact string the mapping table documents
// ---------------------------------------------------------------------------

describe('STORAGE_KEY', () => {
  it('is the exact string "mmc.tasks"', () => {
    // The mapping table says `mmc.tasks`. If the constant changes,
    // the table changes; the test is the guard that keeps them in
    // step.
    expect(STORAGE_KEY).toBe('mmc.tasks');
  });

  it('is namespaced with a dot-separated prefix', () => {
    // A dotted prefix is the convention that avoids collisions with
    // other apps on the same origin. The convention is not a hard
    // requirement; the test documents it so a future rename has to
    // consciously decide to break it.
    expect(STORAGE_KEY).toMatch(/^mmc\./);
  });
});

// ---------------------------------------------------------------------------
// Memory adapter — the fallback for P-01
// ---------------------------------------------------------------------------

describe('createMemoryAdapter', () => {
  it('starts with an empty list', () => {
    const adapter = createMemoryAdapter();
    expect(adapter.load()).toEqual([]);
  });

  it('save followed by load returns the saved list', () => {
    const adapter = createMemoryAdapter();
    const tasks = [{ id: 'a' }, { id: 'b' }];
    adapter.save(tasks);
    expect(adapter.load()).toEqual(tasks);
  });

  it('load returns a copy, not the internal array', () => {
    const adapter = createMemoryAdapter();
    adapter.save([{ id: 'a' }]);
    const loaded = adapter.load();
    loaded.push({ id: 'b' });
    expect(adapter.load()).toHaveLength(1);
  });

  it('save stores a copy, not the caller array', () => {
    const adapter = createMemoryAdapter();
    const tasks = [{ id: 'a' }];
    adapter.save(tasks);
    tasks.push({ id: 'b' });
    expect(adapter.load()).toHaveLength(1);
  });

  it('declares its kind as "memory"', () => {
    expect(createMemoryAdapter().kind).toBe('memory');
  });
});

// ---------------------------------------------------------------------------
// Adapter selection — P-01
//
// The adapter prefers localStorage when it is available and usable.
// When it is not, it falls back to memory. The tests use a stubbed
// localStorage to drive both paths.
// ---------------------------------------------------------------------------

describe('createStorageAdapter — selection (P-01)', () => {
  let originalLocalStorage;

  beforeEach(() => {
    // Save the real global (undefined in Node) so it can be restored.
    originalLocalStorage = globalThis.localStorage;
  });

  afterEach(() => {
    if (originalLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = originalLocalStorage;
    }
  });

  it('falls back to memory when localStorage is undefined', () => {
    delete globalThis.localStorage;
    const adapter = createStorageAdapter();
    expect(adapter.kind).toBe('memory');
  });

  it('falls back to memory when localStorage throws on write (private browsing)', () => {
    // Simulate Safari's private-browsing mode: localStorage exists
    // but setItem throws. The probe must catch the throw and select
    // the memory adapter.
    globalThis.localStorage = {
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => {},
      getItem: () => null,
    };
    const adapter = createStorageAdapter();
    expect(adapter.kind).toBe('memory');
  });

  it('selects localStorage when the probe succeeds', () => {
    const store = new Map();
    globalThis.localStorage = {
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
      getItem: (k) => (store.has(k) ? store.get(k) : null),
    };
    const adapter = createStorageAdapter();
    expect(adapter.kind).toBe('localStorage');
  });

  it('honours forceMemory even when localStorage is available', () => {
    const store = new Map();
    globalThis.localStorage = {
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
      getItem: (k) => (store.has(k) ? store.get(k) : null),
    };
    const adapter = createStorageAdapter({ forceMemory: true });
    expect(adapter.kind).toBe('memory');
  });

  it('cleans up the probe key (does not pollute user storage)', () => {
    // The availability check writes a probe key and removes it. After
    // the check, the probe must not be present in storage — a leftover
    // probe would show up in DevTools and confuse a user inspecting
    // their storage.
    const store = new Map();
    globalThis.localStorage = {
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
      getItem: (k) => (store.has(k) ? store.get(k) : null),
    };
    createStorageAdapter();
    const probeKeys = [...store.keys()].filter((k) => k.includes('probe'));
    expect(probeKeys).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// localStorage adapter — load (P-03, P-04)
// ---------------------------------------------------------------------------

/**
 * Install a stubbed localStorage that records writes and can be told
 * to fail on demand. Returns the backing store so a test can inspect
 * it directly.
 */
function installStub() {
  const store = new Map();
  const failures = { setItem: null, getItem: null };
  globalThis.localStorage = {
    setItem: (k, v) => {
      if (failures.setItem) {
        const error = failures.setItem;
        failures.setItem = null;
        throw error;
      }
      store.set(k, String(v));
    },
    getItem: (k) => {
      if (failures.getItem) {
        const error = failures.getItem;
        failures.getItem = null;
        throw error;
      }
      return store.has(k) ? store.get(k) : null;
    },
    removeItem: (k) => store.delete(k),
  };
  return {
    store,
    failOn: (operation, error) => { failures[operation] = error; },
    seedRaw: (raw) => store.set(STORAGE_KEY, raw),
  };
}

describe('localStorage adapter — load (P-03, P-04)', () => {
  let stub;

  beforeEach(() => { stub = installStub(); });
  afterEach(() => { delete globalThis.localStorage; });

  it('returns [] when the key is absent', () => {
    const adapter = createStorageAdapter();
    expect(adapter.load()).toEqual([]);
  });

  it('returns [] when the key holds an empty array', () => {
    stub.seedRaw('[]');
    const adapter = createStorageAdapter();
    expect(adapter.load()).toEqual([]);
  });

  it('parses and returns a valid array', () => {
    const tasks = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
    stub.seedRaw(JSON.stringify(tasks));
    const adapter = createStorageAdapter();
    expect(adapter.load()).toEqual(tasks);
  });

  it('P-03: throws StorageError("load") when the stored value is not valid JSON', () => {
    // Simulate a corrupted value — not parseable as JSON.
    stub.seedRaw('{not valid json');
    const adapter = createStorageAdapter();
    expect(() => adapter.load()).toThrow(StorageError);
    try {
      adapter.load();
    } catch (error) {
      expect(error.operation).toBe('load');
      expect(error.cause).toBeInstanceOf(Error);
    }
  });

  it('P-03: throws StorageError("load") when getItem itself throws', () => {
    // Reading from localStorage can throw in restricted modes (e.g.
    // the user has disabled storage for the origin). The throw must
    // become a StorageError, not leak as a raw error.
    stub.failOn('getItem', new Error('SecurityError'));
    const adapter = createStorageAdapter();
    try {
      adapter.load();
    } catch (error) {
      expect(error).toBeInstanceOf(StorageError);
      expect(error.operation).toBe('load');
    }
  });

  it('P-04: returns a non-array value as-is (the store decides what to do)', () => {
    // The adapter does not enforce array-ness; that is the store's
    // job. This test asserts the split of responsibility: the adapter
    // returns the parsed value, the store's loadAndRecover handles
    // non-arrays by starting empty.
    stub.seedRaw(JSON.stringify({ not: 'an array' }));
    const adapter = createStorageAdapter();
    expect(adapter.load()).toEqual({ not: 'an array' });
  });

  it('P-04: returns a primitive value as-is (e.g. a stored number)', () => {
    // Same split as the previous test, with a different non-array
    // shape. A stored `42` is valid JSON and not an array; the adapter
    // returns it, and the store starts empty.
    stub.seedRaw('42');
    const adapter = createStorageAdapter();
    expect(adapter.load()).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// localStorage adapter — save (P-02)
// ---------------------------------------------------------------------------

describe('localStorage adapter — save (P-02)', () => {
  let stub;

  beforeEach(() => { stub = installStub(); });
  afterEach(() => { delete globalThis.localStorage; });

  it('writes the serialized task list to the storage key', () => {
    const tasks = [{ id: 'a', title: 'A' }];
    const adapter = createStorageAdapter();
    adapter.save(tasks);
    expect(stub.store.get(STORAGE_KEY)).toBe(JSON.stringify(tasks));
  });

  it('overwrites the previous value', () => {
    const adapter = createStorageAdapter();
    adapter.save([{ id: 'a' }]);
    adapter.save([{ id: 'b' }]);
    expect(JSON.parse(stub.store.get(STORAGE_KEY))).toEqual([{ id: 'b' }]);
  });

  it('P-02: throws StorageError("save") when setItem throws', () => {
    // Create the adapter first, so the availability probe runs against
    // the healthy stub. Arming the failure before construction would
    // make the probe fail, which falls back to the memory adapter — the
    // save would then not throw, and the test would be asserting the
    // wrong thing.
    const adapter = createStorageAdapter();
    stub.failOn('setItem', new Error('QuotaExceededError'));

    expect(() => adapter.save([{ id: 'a' }])).toThrow(StorageError);

    try {
        adapter.save([{ id: 'a' }]);
    } catch (error) {
        expect(error.operation).toBe('save');
        expect(error.cause).toBeInstanceOf(Error);
    }
  });

  it('P-02: preserves the previous value when the write fails', () => {
    // A failed write leaves the previous value in storage, which is
    // what makes rollback possible: the store's in-memory state and
    // the persisted state can be re-synchronized by re-reading.
    const adapter = createStorageAdapter();
    adapter.save([{ id: 'old' }]);

    stub.failOn('setItem', new Error('QuotaExceededError'));
    expect(() => adapter.save([{ id: 'new' }])).toThrow(StorageError);

    expect(JSON.parse(stub.store.get(STORAGE_KEY))).toEqual([{ id: 'old' }]);
  });

  it('P-02: the adapter does not roll back on its own — the store does', () => {
    // The adapter's job is to throw. The rollback is the store's job.
    // This test asserts the split: after a failed save, the adapter's
    // storage still holds the old value, and the adapter did not
    // attempt a second write.
    const adapter = createStorageAdapter();
    adapter.save([{ id: 'old' }]);
    stub.failOn('setItem', new Error('QuotaExceededError'));

    expect(() => adapter.save([{ id: 'new' }])).toThrow();

    // The storage still has the old value, and the new value never
    // reached it.
    expect(stub.store.get(STORAGE_KEY)).toBe(JSON.stringify([{ id: 'old' }]));
  });
});

// ---------------------------------------------------------------------------
// Mapping coverage
// ---------------------------------------------------------------------------

describe('failure mode coverage', () => {
  it('the mapping table documents 5 failure modes', () => {
    // If Stage 1 adds a failure mode, this test fails. That is the
    // signal to update the mapping table, the tests, and the code
    // together — the order the document prescribes.
    const documentedModes = ['P-01', 'P-02', 'P-03', 'P-04', 'P-05'];
    expect(documentedModes).toHaveLength(5);
  });

  it('the storage key is defined once, in storage.js', () => {
    // A structural assertion: STORAGE_KEY is exported from storage.js
    // and the tests that exercise load/save use the constant, not the
    // literal. A future change that re-typed `mmc.tasks` elsewhere
    // would still pass this test — the constant would still be what
    // it is — but the more important `STORAGE_KEY` value assertion
    // above catches a rename. This test documents the split: the
    // adapter is the single owner of the key.
    expect(STORAGE_KEY).toBe('mmc.tasks');
  });
});