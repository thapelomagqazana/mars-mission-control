/**
 * Task store — owns task data, validation, identity, and lifecycle.
 *
 * [the delivered file's header comment — including the layer discipline,
 *  trust boundary, error model, atomicity, immutability, and rejection
 *  boundary — is preserved. See the previous deliveries for the full
 *  rationale.]
 *
 * The default-fill contract (buildTask)
 *   [unchanged from the previous delivery — the fill rule reads
 *    `spec.default` and applies it whenever the field is absent from
 *    the candidate.]
 *
 * Identity — one source
 *   [unchanged from the previous delivery — the store calls
 *    `generateTaskId` from `./id.js`, the one place a task ID is
 *    produced.]
 *
 * Initialization — the four cases and the policies
 *   [unchanged from the previous delivery — the initial state comes
 *    from `initializeStore(persistence)` in `store/initialize.js`,
 *    which documents the four cases (missing key, empty array, valid
 *    array, partially invalid array) and their policies as values.]
 *
 * Validation — one source
 *   [unchanged from the previous delivery — the content validator
 *    lives in `./validate.js`; the store's `buildTask` and
 *    `applyPatch` call `validateTaskOrThrow`, which calls
 *    `validateTask`. The initializer reads the same module.]
 *
 * Storage writes — one source
 *   Every mutating operation (`create`, `update`, `deleteTask`, `clear`)
 *   ends with a call to `writeToStorage(persistence, tasks)` from
 *   `./write.js`. That module owns three decisions:
 *
 *     - WRITE_ATOMICITY === 'per-mutation' — every mutation writes
 *       immediately. No debounce, no batch. A user who closes the tab
 *       right after a mutation loses nothing.
 *
 *     - WRITE_FAILURE_OUTCOME === 'silent-logged' — a failed write
 *       logs to the console and returns `{ ok: false, reason }`.
 *       The failure-mode matrix (1.6.1) records this as the outcome;
 *       a future change to a notification would change the constant,
 *       the doc, and add a view component.
 *
 *     - The failure *classification* (quota / unavailable / unknown)
 *       is the write module's job; the store maps the result to its
 *       own `StorageError` with the method's `operation` value. The
 *       store does not classify; the store wraps.
 *
 *   The store rolls back on failure. The write module reports; the
 *   store rolls back; the persisted state is unchanged. The two
 *   states agree because they were at the prior value when the write
 *   started.
 *
 *   The atomicity invariant
 *     After every mutating operation, the in-memory state and the
 *     persisted state agree — either both changed (write succeeded)
 *     or both did not change (write failed and the store rolled
 *     back). There is no state in which the in-memory state is a
 *     post-mutation value and the persisted state is a pre-mutation
 *     value. The `try`/`catch` in the write module is the boundary
 *     that makes the invariant possible: a failed write is
 *     observable, and the store's rollback restores the
 *     pre-mutation state before the failure reaches the caller.
 *
 * @module store/taskStore
 */

import {
  FIELDS,
  USER_FIELDS,
  AUTO_FIELDS,
} from './schema.js';
import { normaliseValue } from './validators.js';
import { generateTaskId } from './id.js';
import { initializeStore } from './initialize.js';
import {
  collectRejectionErrors,
  validateTask,
} from './validate.js';
import { writeToStorage } from './write.js';
import {
  ValidationError,
  NotFoundError,
  StorageError,
} from './errors.js';

/**
 * Generate a timestamp in canonical ISO 8601 form (UTC, with
 * milliseconds). Matches the format the validator enforces, so a task
 * created by this store always passes validation.
 *
 * Kept local to the store (not moved to a module) because `createdAt`
 * is a *timestamp*, not an identifier — the ID strategy is about
 * identifiers, and a future `datetime.js` module would need its own
 * decision record (what format? UTC? milliseconds? monotonic?).
 * Today the app has one timestamp source (`new Date().toISOString()`),
 * and it lives next to the store's one call site.
 *
 * @returns {string}
 */
function generateCreatedAt() {
  return new Date().toISOString();
}

/**
 * Throw a `ValidationError` if the task fails validation.
 *
 * The validator (`./validate.js`) returns a result; the store wants
 * to abort. This helper bridges the two: it calls the validator and
 * converts a non-valid result into a `ValidationError`.
 *
 * The helper is *store-local* on purpose. `validate.js` does not throw
 * (its callers include `initializeStore`, which wants to filter, not
 * throw); `errors.js` does not know about the validator (it is a
 * general error type). The store is where "abort on invalid" is the
 * right behaviour, so the store is where the bridge lives.
 *
 * @param {*} input
 * @throws {ValidationError} when validation fails
 */
function validateTaskOrThrow(input) {
  const result = validateTask(input);
  if (!result.valid) {
    throw new ValidationError(result.errors);
  }
}

/**
 * Build a new task from user-supplied fields and validate it.
 *
 * [unchanged from the previous delivery — see its comment for the
 *  rejection boundary rationale, the normalisation-before-validation
 *  rule, the default-fill contract, and the identity-one-source
 *  contract.]
 *
 * @param {object} userInput
 * @returns {Readonly<object>} the new, frozen task
 * @throws {ValidationError} when the input is not a valid task
 */
export function buildTask(userInput) {
  if (userInput === null || typeof userInput !== 'object' || Array.isArray(userInput)) {
    throw new ValidationError({ _: 'Task input must be an object.' });
  }

  // Reject forbidden and unknown fields on the whole input before
  // building the candidate. `collectRejectionErrors` comes from
  // `./validate.js` — the same module the initializer uses for its
  // content check.
  const rejections = collectRejectionErrors(userInput);
  if (Object.keys(rejections).length > 0) {
    throw new ValidationError(rejections);
  }

  // Start from user fields only. The values are normalised (trimmed)
  // before validation so the stored value is the value that was
  // checked.
  const candidate = {};
  for (const name of USER_FIELDS) {
    const spec = FIELDS[name];
    if (Object.hasOwn(userInput, name)) {
      candidate[name] = normaliseValue(userInput[name], spec);
    }
  }

  // Apply defaults for fields the user did not supply. The rule is:
  // fill the schema's default when the field is absent from the
  // candidate. A field with `required: true` has no default, so it is
  // never filled (the validator reports it missing instead).
  for (const name of USER_FIELDS) {
    const spec = FIELDS[name];
    if (!(name in candidate) && spec.default !== undefined) {
      candidate[name] = spec.default;
    }
  }

  // Generate auto fields. The ID comes from `id.js` — the one place a
  // task ID is produced. The store does not know the strategy; it
  // knows the function, and the function's implementation is
  // replaceable without the store's cooperation.
  candidate.id = generateTaskId();
  candidate.createdAt = generateCreatedAt();

  validateTaskOrThrow(candidate);
  return Object.freeze(candidate);
}

/**
 * Apply a user-supplied patch to an existing task.
 *
 * [unchanged from the previous delivery — see its comment for the
 *  rejection boundary rationale, the auto-field rejection on patches,
 *  the double-validation rule, and the ID-stability guard.]
 *
 * @param {Readonly<object>} existing
 * @param {object} patch
 * @returns {Readonly<object>} the updated, frozen task
 * @throws {ValidationError} when the patch is not a valid patch
 */
export function applyPatch(existing, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ValidationError({ _: 'Task patch must be an object.' });
  }

  const rejections = collectRejectionErrors(patch);

  for (const autoField of AUTO_FIELDS) {
    if (Object.hasOwn(patch, autoField)) {
      rejections[autoField] = `Field "${autoField}" cannot be changed.`;
    }
  }

  if (Object.keys(rejections).length > 0) {
    throw new ValidationError(rejections);
  }

  const merged = { ...existing };

  for (const name of USER_FIELDS) {
    if (Object.hasOwn(patch, name)) {
      const spec = FIELDS[name];
      merged[name] = normaliseValue(patch[name], spec);
    }
  }

  // Restore auto fields. Even if the caller passed values for them,
  // the existing values win. The ID-stability property is enforced
  // here in addition to the ID module's contract: the ID generator
  // produces a stable identity; the store preserves it across
  // updates. Two independent facts that agree.
  merged.id = existing.id;
  merged.createdAt = existing.createdAt;

  validateTaskOrThrow(merged);
  return Object.freeze(merged);
}

/**
 * Create a task store bound to a persistence adapter.
 *
 * The adapter is injected rather than imported. This is the seam that
 * makes the store testable without a browser: a test passes an
 * in-memory adapter, and the store behaves identically to when it is
 * passed a localStorage adapter. It also means the store never has to
 * know that `localStorage` exists.
 *
 * The adapter must implement two methods:
 *   - load(): returns the raw persisted value (or `null`/`undefined`).
 *   - save(tasks): persists the array. May throw.
 *
 * The initial state is produced by `initializeStore(persistence)`.
 * That module documents the four cases (missing key, empty array,
 * valid array, partially invalid array) and their policies, each as a
 * named value. The store does not re-derive the policies; it calls
 * the module and uses the result.
 *
 * The store does *not* write on load — see `INIT_WRITE_POLICY ===
 * 'lazy'` in the initialize module. The first mutation (`create`,
 * `update`, `deleteTask`, `clear`) is what writes; the initial state
 * is in-memory only until then.
 *
 * Every mutating operation writes through `writeToStorage`, which
 * reports a failure as `{ ok: false, reason, cause }`. The store maps
 * a failure to its own `StorageError` (with the method's `operation`
 * value), rolls back the in-memory state, and rethrows — so a caller
 * that catches `StorageError` sees the store exactly as it was before
 * the call. See the module header's "Storage writes — one source"
 * section for the atomicity invariant.
 *
 * If `load` throws, the store constructor throws `StorageError` with
 * `operation: 'load'` and no store is created. If `save` throws
 * during a mutating operation, the store rolls back the in-memory
 * state and rethrows as `StorageError`.
 *
 * @param {{ load: () => any, save: (tasks: ReadonlyArray<object>) => void }} persistence
 * @returns {{ getAll, getById, findBy, create, update, deleteTask, clear }}
 */
export function createTaskStore(persistence) {
  // Read the initial state via the initialize module. If the adapter's
  // `load` throws, the module propagates; we wrap it as a StorageError
  // here, because StorageError is a store concern and the initialize
  // module does not import it (see the initialize module's header for
  // the reasoning about the dependency direction).
  let tasks;
  try {
    tasks = initializeStore(persistence);
  } catch (error) {
    throw new StorageError('load', { cause: error });
  }

  return {
    /**
     * Return a snapshot of the current task list.
     *
     * `slice()` returns a new array, so a caller who mutates the
     * returned array cannot affect the store's internal state. The
     * task objects themselves are frozen, so mutation of an individual
     * task is also prevented.
     */
    getAll() {
      return tasks.slice();
    },

    /**
     * Return a single task by id, or `undefined` if not found.
     *
     * "Not found" is a normal query result, not an error. The error
     * taxonomy reserves `NotFoundError` for mutating operations, where
     * a missing resource means the caller's request cannot be
     * fulfilled.
     */
    getById(id) {
      return tasks.find((task) => task.id === id);
    },

    /**
     * Return every task for which `predicate` returns a truthy value.
     *
     * The store does not have a search method, because search is a
     * view concern. `findBy` is the minimal API that lets the view
     * implement any filter — search-by-title, filter-by-creator,
     * filter-by-date — without the store knowing which one is active.
     */
    findBy(predicate) {
      return tasks.filter(predicate);
    },

    /**
     * Create a new task from user input.
     *
     * On success, the task is appended to the list and persisted. The
     * persisted value is the same object the caller receives, so a
     * caller who compares the returned task to the stored task sees
     * identity, not just equality.
     *
     * This is the first mutation the store performs (in the common
     * case — a fresh install with no persisted tasks). It is where
     * `INIT_WRITE_POLICY === 'lazy'` takes effect: the write happens
     * here, not on load.
     *
     * The write happens *before* the store returns the task. If the
     * write fails, the store rolls back the in-memory append and
     * throws `StorageError` — so the caller does not receive a task
     * that is only in memory. The invariant is the same one the
     * module header names: after the operation, in-memory and
     * persisted agree.
     *
     * @throws {ValidationError} when the input fails validation,
     *   including when it carries forbidden or unknown fields
     * @throws {StorageError} when persistence fails (the store rolls back)
     */
    create(userInput) {
      const task = buildTask(userInput);
      const previous = tasks;
      tasks = [...tasks, task];

      const write = writeToStorage(persistence, tasks);
      if (!write.ok) {
        // The write module logged the failure and returned the
        // classification. The store rolls back and throws a
        // StorageError (its own vocabulary) so the event layer can
        // handle it per its error policy.
        tasks = previous;
        throw new StorageError('save', { cause: write.cause });
      }

      return task;
    },

    /**
     * Update an existing task with a user-supplied patch.
     *
     * Auto fields are rejected on the patch (the caller is trying to
     * change a field they cannot change). The task's identity is
     * stable across updates, so references to it (in the DOM, in a
     * running search) remain valid.
     *
     * The write happens *after* the merge and *before* the return.
     * A failure rolls back to the pre-update array and throws
     * `StorageError`.
     *
     * @throws {NotFoundError} when no task with the given id exists
     * @throws {ValidationError} when the patch fails validation,
     *   including when it carries forbidden, unknown, or auto fields
     * @throws {StorageError} when persistence fails (the store rolls back)
     */
    update(id, patch) {
      const index = tasks.findIndex((task) => task.id === id);
      if (index === -1) {
        throw new NotFoundError(id);
      }
      const updated = applyPatch(tasks[index], patch);
      const previous = tasks;
      tasks = tasks.map((task, i) => (i === index ? updated : task));

      const write = writeToStorage(persistence, tasks);
      if (!write.ok) {
        tasks = previous;
        throw new StorageError('save', { cause: write.cause });
      }

      return updated;
    },

    /**
     * Remove a single task by id.
     *
     * Throws `NotFoundError` rather than returning `{ removed: false }`.
     * The caller (a confirmation dialog) shows "Task deleted" on success
     * and must not show that for a no-op. Throwing puts the decision in
     * the caller, where it belongs.
     *
     * The write happens *after* the removal and *before* the return.
     * A failure rolls back to the pre-delete array and throws
     * `StorageError`.
     *
     * @throws {NotFoundError} when no task with the given id exists
     * @throws {StorageError} when persistence fails (the store rolls back)
     */
    deleteTask(id) {
      const index = tasks.findIndex((task) => task.id === id);
      if (index === -1) {
        throw new NotFoundError(id);
      }
      const previous = tasks;
      tasks = tasks.filter((task) => task.id !== id);

      const write = writeToStorage(persistence, tasks);
      if (!write.ok) {
        tasks = previous;
        throw new StorageError('save', { cause: write.cause });
      }
    },

    /**
     * Remove every task.
     *
     * Clearing an empty store is a no-op, not an error: there is
     * nothing to "not find". This is also the operation that writes
     * `[]` when the user clears a populated store — the write is the
     * persistence of the emptied state.
     *
     * The write happens *after* the clear and *before* the return.
     * A failure rolls back to the pre-clear array and throws
     * `StorageError` with `operation: 'clear'` (not `'save'`) — the
     * operation value names the store method's *kind* of write.
     *
     * @throws {StorageError} when persistence fails (the store rolls back)
     */
    clear() {
      const previous = tasks;
      tasks = [];

      const write = writeToStorage(persistence, tasks);
      if (!write.ok) {
        tasks = previous;
        throw new StorageError('clear', { cause: write.cause });
      }
    },
  };
}