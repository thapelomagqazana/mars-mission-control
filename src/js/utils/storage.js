/**
 * Storage adapter — the persistence layer's only browser-specific code.
 *
 * Why this file exists:
 *   The task store needs to persist data across sessions. The browser's
 *   `localStorage` is the mechanism for that, but the store is not
 *   allowed to know that. This file is the seam: it presents a small
 *   interface (`load` and `save`) that the store depends on, and
 *   implements it using `localStorage`. A test can pass a different
 *   adapter (an in-memory one) and the store behaves identically.
 *
 * What this file owns:
 *   - The storage key (one name, defined once).
 *   - JSON serialization and deserialization.
 *   - The mapping from `localStorage`'s exceptions to the store's
 *     `StorageError` taxonomy.
 *   - The `localStorage` unavailability check (private browsing, quota
 *     disabled, etc.).
 *
 * What this file deliberately does not do:
 *   - Validate task shapes. The store does that. This adapter writes
 *     and reads whatever the store gives it; if the data on disk is
 *     malformed, the store's load-recovery filters it out.
 *   - Log. The store logs. The adapter throws; the store decides
 *     whether a throw is a recoverable warning or a fatal error.
 *   - Retry. Retry is a policy decision, and it belongs to the caller
 *     that knows what a retry would mean.
 *   - Provide migrations. When the schema changes, the migration lives
 *     in the store's load-recovery or in a dedicated migration module.
 *     The adapter just reads and writes bytes.
 *
 * Failure modes and how they map:
 *   - `localStorage` unavailable (private browsing, disabled by policy):
 *     load() throws `StorageError('load')`; save() throws
 *     `StorageError('save')`. The store's constructor will throw, and
 *     the caller presents "storage unavailable" to the user.
 *   - Quota exceeded on save: save() throws `StorageError('save')`.
 *     The store rolls back the in-memory change.
 *   - Corrupted JSON: load() throws `StorageError('load')`. The store
 *     cannot recover a task list from bytes it cannot parse.
 *   - Missing key: load() returns `[]`. This is "no data yet", not a
 *     failure.
 *   - Non-array JSON (e.g. a user manually wrote `{"foo": "bar"}`):
 *     load() returns the parsed value; the store's load-recovery filters
 *     it out and starts empty. The adapter does not enforce array-ness
 *     because that is a schema concern, and schema concerns belong to
 *     the store.
 *
 * @module utils/storage
 */

import { StorageError } from '../store/errors.js';

/**
 * The `localStorage` key used by the application.
 *
 * Defined here, not duplicated in tests or views. A test that wants to
 * seed storage, or a view that wants to show "storage is full", refers
 * to this constant rather than re-typing the key. The leading prefix
 * (`mmc.`) namespaces it so it does not collide with other apps on the
 * same origin.
 */
export const STORAGE_KEY = 'mmc.tasks';

/**
 * The in-memory fallback adapter.
 *
 * When `localStorage` is unavailable (private browsing, quota disabled),
 * the application can still run for the current session. This adapter
 * gives the store something to talk to: it holds tasks in memory, and
 * they disappear when the page reloads. That is a degraded mode, not a
 * failure — the user can still create, edit, and delete tasks, they
 * just cannot keep them across sessions.
 *
 * The store is given this adapter only if the browser check in
 * `createStorageAdapter` decides that `localStorage` cannot be used.
 * The choice is made once, at construction, so the store's contract
 * ("persistence is injected") is unchanged: the store never knows
 * which adapter it has.
 *
 * @returns {{ load: () => any[], save: (tasks: ReadonlyArray<object>) => void, kind: 'memory' }}
 */
export function createMemoryAdapter() {
  let tasks = [];
  return {
    load: () => tasks.slice(),
    save: (nextTasks) => { tasks = nextTasks.slice(); },
    kind: 'memory',
  };
}

/**
 * Check whether `localStorage` is usable.
 *
 * The check is not just `typeof localStorage !== 'undefined'`. In
 * private browsing modes (Safari, older Firefox), `localStorage`
 * exists but writing to it throws. The only reliable test is to write
 * a value and then remove it. The test key is small and is cleaned up
 * immediately, so it does not pollute the user's storage.
 *
 * @returns {boolean}
 */
function isLocalStorageAvailable() {
  if (typeof localStorage === 'undefined') {
    return false;
  }
  try {
    const probeKey = '__mmc_probe__';
    localStorage.setItem(probeKey, '1');
    localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * The `localStorage` adapter.
 *
 * The adapter is created by `createStorageAdapter`, not exported
 * directly, so the availability check runs once at construction. A
 * caller who constructs the store in an environment where storage is
 * unavailable gets the memory adapter instead — the store still works,
 * the user just loses persistence.
 *
 * @returns {{
 *   load: () => any[],
 *   save: (tasks: ReadonlyArray<object>) => void,
 *   kind: 'localStorage',
 * }}
 */
function createLocalStorageAdapter() {
  return {
    kind: 'localStorage',

    /**
     * Read the persisted task list.
     *
     * Missing key is "no data yet" and returns `[]`. A key that
     * exists but holds malformed JSON throws `StorageError('load')`;
     * the store cannot recover from unparseable bytes.
     *
     * The return value is whatever was stored: array, object, string,
     * or number. The store's load-recovery is responsible for deciding
     * what to do with a non-array. The adapter does not enforce array-
     * ness because that is a schema concern.
     */
    load() {
      let raw;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch (error) {
        // Reading from localStorage can throw in restricted modes
        // (e.g. if the user has disabled storage for the origin).
        throw new StorageError('load', { cause: error });
      }

      if (raw === null) {
        return [];
      }

      try {
        return JSON.parse(raw);
      } catch (error) {
        throw new StorageError('load', { cause: error });
      }
    },

    /**
     * Write the task list.
     *
     * `JSON.stringify` can throw on circular structures. The store
     * never produces one (tasks are flat objects), but a future caller
     * passing the wrong shape would find out here rather than losing
     * data silently. The serialised string is small enough that no
     * streaming is needed.
     */
    save(tasks) {
      let serialised;
      try {
        serialised = JSON.stringify(tasks);
      } catch (error) {
        throw new StorageError('save', { cause: error });
      }
      try {
        localStorage.setItem(STORAGE_KEY, serialised);
      } catch (error) {
        // QuotaExceededError, SecurityError, and other storage
        // exceptions all arrive here. The store will roll back the
        // in-memory change and rethrow; the caller (the view) shows a
        // non-blocking notice.
        throw new StorageError('save', { cause: error });
      }
    },
  };
}

/**
 * Create the storage adapter for the current environment.
 *
 * Prefers `localStorage` when it is available and usable. Falls back to
 * the in-memory adapter when it is not. The choice is made once, at
 * construction, so the store never has to check the environment.
 *
 * A caller who wants the in-memory adapter in tests or in a preview
 * environment can pass `{ forceMemory: true }` and get it even when
 * `localStorage` is available.
 *
 * The returned adapter carries a `kind` property (`'localStorage'` or
 * `'memory'`) so the application can show a banner ("Changes will not
 * persist across sessions") when the memory adapter is in use.
 *
 * @param {{ forceMemory?: boolean }} [options]
 * @returns {{
 *   load: () => any,
 *   save: (tasks: ReadonlyArray<object>) => void,
 *   kind: 'localStorage' | 'memory',
 * }}
 */
export function createStorageAdapter(options = {}) {
  if (options.forceMemory) {
    return createMemoryAdapter();
  }
  if (isLocalStorageAvailable()) {
    return createLocalStorageAdapter();
  }
  return createMemoryAdapter();
}