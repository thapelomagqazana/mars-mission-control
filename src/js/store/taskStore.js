/**
 * Task store — owns task data, validation, identity, and lifecycle.
 *
 * Error Handling & Recovery:
 *   The `initializeStore` module handles *data corruption* (bad JSON,
 *   wrong shape) internally by returning an empty array.
 *
 *   If the persistence adapter's `load()` throws a hard error (e.g.,
 *   a browser security policy blocks localStorage access), the store
 *   catches it, wraps it in a `StorageError` with `operation: 'load'`,
 *   and throws. The application startup layer is responsible for
 *   catching this and deciding whether to crash or start with an
 *   in-memory fallback.
 *
 * The delete workflow's requirements on this store:
 *
 *   1. `deleteTask(id)` must remove exactly the targeted record.
 *      Implemented by `tasks.filter(task => task.id !== id)` — a
 *      task with a different id cannot be removed by this call.
 *
 *   2. `deleteTask(id)` must throw `NotFoundError` if the id is not
 *      present. Implemented by the `index === -1` check before any
 *      mutation. The delete dialog's "concurrent delete" path relies
 *      on this: a task removed in another tab between the dialog's
 *      open and the confirm surfaces as `NotFoundError`, which the
 *      app handles by re-rendering without a toast.
 *
 *   3. `deleteTask(id)` must throw `StorageError` on write failure,
 *      after rolling back. Implemented by the `previous` capture,
 *      the `writeToStorage` call, and the rollback on `!write.ok`.
 *
 *   4. `deleteTask(id)` must write through `writeToStorage`, not
 *      call localStorage directly. No localStorage reference exists
 *      in this file; the adapter is the only thing that touches
 *      storage. The delete workflow inherits the store's atomicity
 *      guarantee because it does not bypass the store.
 *
 *   5. `clear()` must exist for the eventual clear-all control.
 *      Implemented as a write of `[]` through the same path.
 *
 * Any change to these five properties is a change to the delete
 * workflow's contract. The E2E delete spec (`tests/e2e/delete-task.cy.js`)
 * asserts the observable consequences.
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
 */
function generateCreatedAt() {
  return new Date().toISOString();
}

/**
 * Throw a `ValidationError` if the task fails validation.
 */
function validateTaskOrThrow(input) {
  const result = validateTask(input);
  if (!result.valid) {
    throw new ValidationError(result.errors);
  }
}

/**
 * Build a new task from user-supplied fields and validate it.
 */
export function buildTask(userInput) {
  if (userInput === null || typeof userInput !== 'object' || Array.isArray(userInput)) {
    throw new ValidationError({ _: 'Task input must be an object.' });
  }

  const rejections = collectRejectionErrors(userInput);
  if (Object.keys(rejections).length > 0) {
    throw new ValidationError(rejections);
  }

  const candidate = {};
  for (const name of USER_FIELDS) {
    const spec = FIELDS[name];
    if (Object.hasOwn(userInput, name)) {
      candidate[name] = normaliseValue(userInput[name], spec);
    }
  }

  for (const name of USER_FIELDS) {
    const spec = FIELDS[name];
    if (!(name in candidate) && spec.default !== undefined) {
      candidate[name] = spec.default;
    }
  }

  candidate.id = generateTaskId();
  candidate.createdAt = generateCreatedAt();

  validateTaskOrThrow(candidate);
  return Object.freeze(candidate);
}

/**
 * Apply a user-supplied patch to an existing task.
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

  merged.id = existing.id;
  merged.createdAt = existing.createdAt;

  validateTaskOrThrow(merged);
  return Object.freeze(merged);
}

/**
 * Create a task store bound to a persistence adapter.
 *
 * @param {{ load: () => any, save: (tasks: ReadonlyArray<object>) => void }} persistence
 * @returns {{ getAll, getById, findBy, create, update, deleteTask, clear }}
 * @throws {StorageError} if persistence.load throws.
 */
export function createTaskStore(persistence) {
  let tasks;

  try {
    tasks = initializeStore(persistence);
  } catch (error) {
    // The persistence adapter's `load()` threw a hard error (e.g.,
    // ReadError, SecurityError). Wrap it so the caller can handle it.
    throw new StorageError('load', { cause: error });
  }

  return {
    /**
     * Return a snapshot of the current task list.
     *
     * `slice()` returns a new array, so a caller who mutates the
     * returned array cannot affect the store's internal state. The
     * task objects themselves are frozen, so mutation of an
     * individual task is also prevented.
     */
    getAll() {
      return tasks.slice();
    },

    /**
     * Return a single task by id, or `undefined` if not found.
     *
     * "Not found" is a normal query result, not an error. The error
     * taxonomy reserves `NotFoundError` for mutating operations,
     * where a missing resource means the caller's request cannot be
     * fulfilled.
     */
    getById(id) {
      return tasks.find((task) => task.id === id);
    },

    /**
     * Return every task for which `predicate` returns a truthy value.
     */
    findBy(predicate) {
      return tasks.filter(predicate);
    },

    /**
     * Create a new task from user input.
     *
     * The write happens *before* the store returns the task. If the
     * write fails, the store rolls back the in-memory append and
     * throws `StorageError` — so the caller does not receive a task
     * that is only in memory.
     *
     * @throws {ValidationError} when the input fails validation
     * @throws {StorageError} when persistence fails (the store rolls back)
     */
    create(userInput) {
      const task = buildTask(userInput);
      const previous = tasks;
      tasks = [...tasks, task];

      const write = writeToStorage(persistence, tasks);
      if (!write.ok) {
        tasks = previous;
        throw new StorageError('save', { cause: write.cause });
      }

      return task;
    },

    /**
     * Update an existing task with a user-supplied patch.
     *
     * Auto fields are rejected on the patch. The task's identity is
     * stable across updates, so references to it (in the DOM, in a
     * running search) remain valid.
     *
     * @throws {NotFoundError} when no task with the given id exists
     * @throws {ValidationError} when the patch fails validation
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
     * The delete-confirmation dialog shows "Deleted '<title>'" on
     * success and must not show that for a no-op. Throwing puts the
     * decision in the caller, where it belongs.
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