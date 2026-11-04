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
     */
    getAll() {
      return tasks.slice();
    },

    /**
     * Return a single task by id, or `undefined` if not found.
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