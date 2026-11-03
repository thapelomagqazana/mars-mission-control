/**
 * Task store — owns task data, validation, identity, and lifecycle.
 *
 * Why this file exists:
 *   The application needs one place that decides what a task is, what a
 *   valid task looks like, and what operations can be performed on one.
 *   If those decisions live in the form, the view, and the persistence
 *   layer, they drift. Here they live in one place, and every other
 *   layer calls into this module.
 *
 * Layer discipline:
 *   This module is the state layer. It does not touch the DOM and does
 *   not touch localStorage directly. Persistence is injected as a
 *   dependency, so the store can be tested without a browser and the
 *   storage mechanism can change without editing this file.
 *
 * Trust boundary:
 *   Task data may come from a user (create/edit form) or from
 *   localStorage (which anyone can edit via DevTools). Both paths go
 *   through the same validation. There is no "trusted" shortcut: the
 *   store does not assume that data it is given is well-formed.
 *
 * Error model:
 *   The store throws typed errors (see `errors.js`) for conditions a
 *   caller can act on: invalid input, missing task, storage failure.
 *   It returns normally for conditions the caller asked for: a list, a
 *   task, a successful mutation. The split is intentional — a caller
 *   who writes `const task = store.create(input)` should proceed on the
 *   next line, not check a boolean first.
 *
 *   The form layer catches `ValidationError` and renders
 *   `error.fields`. The list layer catches `NotFoundError` and refreshes
 *   its view. The storage-aware layer catches `StorageError` and shows
 *   a non-blocking notice. None of them has to guess which branch
 *   applies, because the error type carries the answer.
 *
 * Atomicity:
 *   Every mutating operation is atomic per call. If persistence fails
 *   after the in-memory state has been updated, the store rolls back to
 *   the previous state and rethrows. A caller that catches `StorageError`
 *   sees the store exactly as it was before the call.
 *
 * Immutability:
 *   Stored tasks are frozen. A caller who receives a task cannot mutate
 *   it in place; they must call `update`. This makes every mutation go
 *   through validation and persistence, which is the only way to keep
 *   the in-memory state and the persisted state in agreement.
 *
 * Rejection boundary:
 *   Forbidden fields (a field that belongs to a different schema) and
 *   unknown fields (a field the schema has never heard of) are rejected
 *   on both create and update. The store would otherwise silently drop
 *   them, which hides a caller's mistake and lets future schema changes
 *   leak into stored data before anyone decided to make them.
 *
 *   Auto fields (`id`, `createdAt`) are a third case with a different
 *   rule per operation:
 *     - on create, a caller-supplied auto field is ignored (the store
 *       generates the value);
 *     - on update, a caller-supplied auto field is rejected, because
 *       the caller is explicitly trying to change a field the schema
 *       does not allow them to change.
 *
 * @module store/taskStore
 */

import {
  FIELDS,
  FIELD_NAMES,
  USER_FIELDS,
  AUTO_FIELDS,
  FORBIDDEN_FIELDS,
} from './schema.js';
import { validateField, normaliseValue } from './validators.js';
import {
  ValidationError,
  NotFoundError,
  StorageError,
} from './errors.js';

/**
 * Generate a UUID v4.
 *
 * Prefers `crypto.randomUUID()`, which is available in all evergreen
 * browsers and in Node 19+. Falls back to a deterministic template that
 * produces the same shape (RFC 4122 v4) using `Math.random`. The
 * fallback is not cryptographically strong, but it is sufficient for
 * local task identity, and it is honest about what it is.
 *
 * @returns {string}
 */
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, (char) => {
    const random = Math.trunc(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Generate a timestamp in canonical ISO 8601 form (UTC, with
 * milliseconds). Matches the format the validator enforces, so a task
 * created by this store always passes validation.
 *
 * @returns {string}
 */
function generateCreatedAt() {
  return new Date().toISOString();
}

/**
 * Collect errors for forbidden fields present on the input.
 *
 * Forbidden fields are the "declared absent" decision made visible in
 * code: a task carrying one belongs to a different schema, and accepting
 * it silently would let a future change leak into stored data before
 * anyone decided whether it belongs.
 *
 * @param {object} input
 * @returns {Record<string, string>}
 */
function collectForbiddenFieldErrors(input) {
  const errors = {};
  for (const forbidden of FORBIDDEN_FIELDS) {
    if (Object.hasOwn(input, forbidden)) {
      errors[forbidden] = `Field "${forbidden}" is not part of the task schema.`;
    }
  }
  return errors;
}

/**
 * Collect errors for keys on the input that are neither schema fields
 * nor explicitly forbidden. Unknown fields are rejected rather than
 * ignored: ignoring lets a typo pass silently, which is the kind of bug
 * that is expensive to find later because the data looks correct until
 * a feature depends on it.
 *
 * @param {object} input
 * @returns {Record<string, string>}
 */
function collectUnknownFieldErrors(input) {
  const errors = {};
  for (const key of Object.keys(input)) {
    if (!FIELD_NAMES.includes(key) && !FORBIDDEN_FIELDS.includes(key)) {
      errors[key] = `Unknown field "${key}".`;
    }
  }
  return errors;
}

/**
 * Collect rejection errors for the *whole input*: forbidden fields
 * (V-08) and unknown fields (V-09).
 *
 * The store's create and update paths build a candidate from
 * `USER_FIELDS`, which means a caller who supplies a forbidden or
 * unknown field would otherwise have it silently dropped. Silent drop
 * is the wrong behaviour for two reasons:
 *
 *   1. A caller who writes `titel` instead of `title` gets a task back
 *      and has no way to know their input was ignored. Rejecting makes
 *      the mistake visible at the call site.
 *
 *   2. A caller who supplies `status: 'done'` is sending a field the
 *      schema does not declare. Accepting it silently would be the
 *      "leak a future change into stored data" failure the forbidden
 *      list exists to prevent.
 *
 * Auto fields (`id`, `createdAt`) are *not* rejection errors here.
 * They are schema fields, and on create a caller may legitimately
 * round-trip them from a read; the store overwrites them. On update,
 * auto fields are rejected separately (see `applyPatch`) because the
 * caller is explicitly trying to change a field they cannot change.
 *
 * @param {object} input
 * @returns {Record<string, string>}
 */
function collectRejectionErrors(input) {
  return {
    ...collectForbiddenFieldErrors(input),
    ...collectUnknownFieldErrors(input),
  };
}

/**
 * Collect field-level errors for every name in the schema, including
 * auto fields, so a caller cannot smuggle in an invalid `id` or a
 * non-ISO `createdAt`.
 *
 * Missing values are handled here, not in `validateField`: a missing
 * required field is an error; a missing optional field is not. This
 * mirrors the rule `validateAllFields` applies, so the two entry points
 * agree on what "optional" means.
 *
 * @param {object} input
 * @returns {Record<string, string>}
 */
function collectFieldErrors(input) {
  const errors = {};
  for (const name of FIELD_NAMES) {
    const spec = FIELDS[name];
    const value = input[name];

    if (value === undefined) {
      if (spec.required) {
        errors[name] = `Field "${name}" is required.`;
      }
      continue;
    }

    const fieldError = validateField(name, value, spec);
    if (fieldError) {
      errors[name] = fieldError;
    }
  }
  return errors;
}

/**
 * Validate a complete task object and return the errors, if any.
 *
 * Checks, in order:
 *   1. The input is a plain object.
 *   2. No forbidden fields are present (see `FORBIDDEN_FIELDS`).
 *   3. No unknown fields are present.
 *   4. Every field has the correct type, length, and format.
 *   5. Required fields are present and non-empty.
 *
 * The order matters. Rejecting a forbidden field before rejecting an
 * unknown field produces a more specific error message, which is more
 * useful to a developer debugging a schema mismatch. The user never
 * sees these specific messages; they see form-level errors.
 *
 * @param {*} input
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateTask(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: { _: 'Task must be an object.' } };
  }

  const errors = {
    ...collectForbiddenFieldErrors(input),
    ...collectUnknownFieldErrors(input),
    ...collectFieldErrors(input),
  };

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Throw a `ValidationError` if the task fails validation.
 *
 * Internal helper. The public `validateTask` returns a result because
 * the form layer wants to *render* errors, not catch them. The store's
 * mutating operations want the opposite: they want to abort. This
 * helper bridges the two.
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
 * The user supplies only `USER_FIELDS`. Auto fields (`id`, `createdAt`)
 * are generated here and overwrite anything the caller passed in, so a
 * malicious or buggy caller cannot choose the task's identity or
 * creation time.
 *
 * Defaults are applied for optional fields the user did not supply.
 * Optional string fields that default to empty string are set to `""`
 * rather than left as `undefined`, so the view layer never has to
 * null-check before rendering.
 *
 * The rejection boundary runs first: forbidden and unknown fields on
 * the *whole* input are rejected, not just the user fields. A caller
 * who smuggles in `status: 'done'` or `titel: 'x'` gets a
 * `ValidationError`, not a task with the field silently dropped.
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
  // building the candidate. This is the boundary V-08 and V-09 promise:
  // they apply to the input a caller sends, not just to the subset the
  // store happens to keep.
  const rejections = collectRejectionErrors(userInput);
  if (Object.keys(rejections).length > 0) {
    throw new ValidationError(rejections);
  }

  // Start from user fields only, so a caller cannot supply an `id` or
  // `createdAt` that the store would then accept. The values are
  // normalised (trimmed) before validation so the stored value is the
  // value that was checked.
  const candidate = {};
  for (const name of USER_FIELDS) {
    const spec = FIELDS[name];
    if (Object.hasOwn(userInput, name)) {
      candidate[name] = normaliseValue(userInput[name], spec);
    }
  }

  // Apply defaults for optional fields the user did not supply.
  for (const name of USER_FIELDS) {
    const spec = FIELDS[name];
    if (!spec.required && !(name in candidate) && spec.defaultValue !== undefined) {
      candidate[name] = spec.defaultValue;
    }
  }

  // Generate auto fields. These overwrite anything the caller passed.
  // This is why auto fields are *not* rejection errors on create: a
  // round-tripping caller can pass them back, and the store quietly
  // uses the correct values.
  candidate.id = generateId();
  candidate.createdAt = generateCreatedAt();

  validateTaskOrThrow(candidate);
  return Object.freeze(candidate);
}

/**
 * Apply a user-supplied patch to an existing task.
 *
 * The rejection boundary runs first, same as create, with one addition:
 * auto fields (`id`, `createdAt`) are also rejected on a patch. The
 * caller is explicitly trying to change a field the schema does not
 * allow them to change, and silently overwriting it would leave the
 * caller believing they had set the field.
 *
 * After the rejection boundary, user fields are merged and normalised,
 * then the merged task is re-validated. The double validation (once at
 * the boundary, once on the merged result) is intentional: the boundary
 * catches shape errors, and the merged validation catches field-level
 * errors that only appear after merging (e.g. a patch that empties a
 * required field).
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

  // Auto fields are not part of the patchable schema. A caller who
  // sends them is trying to change a field they cannot change. The
  // store would silently overwrite them, but that would leave the
  // caller believing they had set the field. Reject instead.
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
  // the existing values win. (This branch is defensive: the rejection
  // above already prevents auto fields from reaching here. Keeping
  // the restore makes the invariant "the merged task carries the
  // existing id and createdAt" obvious to a reader, and protects
  // against a future change to the rejection list.)
  merged.id = existing.id;
  merged.createdAt = existing.createdAt;

  validateTaskOrThrow(merged);
  return Object.freeze(merged);
}

/**
 * Load persisted tasks and drop any entries that fail validation.
 *
 * Corrupted or out-of-schema entries are filtered out rather than
 * crashing the application. The user loses those entries, but they do
 * not lose the application. A load failure from the adapter is a
 * different case: it means the adapter itself is broken (not the data),
 * and the store cannot start with a meaningful state. That case is
 * handled by the caller of `loadAndRecover`, which converts it into a
 * `StorageError`.
 *
 * @param {{ load: () => any }} adapter
 * @returns {ReadonlyArray<object>}
 */
function loadAndRecover(adapter) {
  let raw;
  try {
    raw = adapter.load();
  } catch (error) {
    throw new StorageError('load', { cause: error });
  }
  if (!Array.isArray(raw)) {
    console.warn('Task store: persisted data is not an array; starting empty.');
    return [];
  }
  return raw.filter((candidate) => validateTask(candidate).valid);
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
 *   - load(): returns an array (or anything; the store filters it).
 *   - save(tasks): persists the array. May throw.
 *
 * If `load` throws, the store constructor throws `StorageError` and no
 * store is created. If `save` throws during a mutating operation, the
 * store rolls back the in-memory state and rethrows as `StorageError`.
 *
 * The returned API is described in `docs/store-contract.md`.
 *
 * @param {{ load: () => any, save: (tasks: ReadonlyArray<object>) => void }} persistence
 * @returns {{
 *   getAll: () => ReadonlyArray<object>,
 *   getById: (id: string) => Readonly<object> | undefined,
 *   findBy: (predicate: (task: Readonly<object>) => boolean) => ReadonlyArray<object>,
 *   create: (input: object) => Readonly<object>,
 *   update: (id: string, patch: object) => Readonly<object>,
 *   deleteTask: (id: string) => void,
 *   clear: () => void,
 * }}
 */
export function createTaskStore(persistence) {
  let tasks = loadAndRecover(persistence);

  /**
   * Persist the current task list, or throw `StorageError`.
   *
   * The store never persists partial state. If `save` throws, the
   * caller is expected to have a way to roll back — which is why every
   * mutating operation captures `previous` before it mutates.
   *
   * @param {'save'|'clear'} operation
   * @throws {StorageError}
   */
  function persistOrThrow(operation) {
    try {
      persistence.save(tasks);
    } catch (error) {
      throw new StorageError(operation, { cause: error });
    }
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
     * a missing resource means the caller's request cannot be fulfilled.
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
     * @throws {ValidationError} when the input fails validation,
     *   including when it carries forbidden or unknown fields
     * @throws {StorageError} when persistence fails (the store rolls back)
     */
    create(userInput) {
      const task = buildTask(userInput);
      const previous = tasks;
      tasks = [...tasks, task];
      try {
        persistOrThrow('save');
      } catch (error) {
        tasks = previous;
        throw error;
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
      try {
        persistOrThrow('save');
      } catch (error) {
        tasks = previous;
        throw error;
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
      try {
        persistOrThrow('save');
      } catch (error) {
        tasks = previous;
        throw error;
      }
    },

    /**
     * Remove every task.
     *
     * Clearing an empty store is a no-op, not an error: there is
     * nothing to "not find".
     *
     * @throws {StorageError} when persistence fails (the store rolls back)
     */
    clear() {
      const previous = tasks;
      tasks = [];
      try {
        persistOrThrow('clear');
      } catch (error) {
        tasks = previous;
        throw error;
      }
    },
  };
}