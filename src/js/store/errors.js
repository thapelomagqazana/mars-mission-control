/**
 * Store error types — the complete set of errors the task store throws.
 *
 * Why this file exists:
 *   A caller needs to distinguish "the input was invalid" from "the task
 *   was not found" from "storage failed" without parsing message strings.
 *   Typed errors make that distinction a language feature (`instanceof`)
 *   rather than a fragile string match. They also make the store's
 *   failure modes explicit: if a new error can be thrown, it appears
 *   here, and the contract cards and the tests must be updated.
 *
 * Why typed errors and not result objects:
 *   A result object like `{ valid, errors, task }` is convenient for the
 *   form layer, which wants to render per-field messages. But it forces
 *   every other caller to check a boolean before using the result, which
 *   is noise at best and a missed check at worst. Typed errors put the
 *   decision where it belongs: the caller that can do something about
 *   the failure catches it; the caller that cannot lets it propagate.
 *
 *   The form layer catches `ValidationError` and renders
 *   `error.fields`. The list layer catches `NotFoundError` and refreshes
 *   its view. The storage-aware layer catches `StorageError` and shows a
 *   non-blocking notice. None of them has to guess which branch applies.
 *
 * Why a common base class:
 *   A caller who wants to treat any store failure as "something went
 *   wrong, show a generic message" can catch `StoreError`. A caller who
 *   wants to distinguish can do so with the subclasses. The base class
 *   makes both styles possible without forcing either. This is the same
 *   pattern `Error` itself uses, and it is the pattern most JavaScript
 *   codebases have converged on for library errors.
 *
 * What this file does not contain:
 *   - Logging. The store logs; the error class is only a carrier.
 *   - User-facing text. Messages are for developers; the form formats
 *     its own text from `error.fields`.
 *   - Retry logic. Retry is the caller's decision, not the error's job.
 *   - Validation rules. The validators layer decides what is valid;
 *     this file only carries the verdict.
 *
 * Error taxonomy:
 *   StoreError            — base; catch-all for any store failure
 *   ├── ValidationError   — invalid input; carries per-field messages
 *   ├── NotFoundError     — update/delete on a missing task
 *   └── StorageError      — the persistence adapter failed
 *
 *   No other error is thrown by the store. A programming error (e.g.
 *   calling `update` with a non-object patch, or a missing schema spec)
 *   is a bug, not a runtime condition, and it is caught by the contract
 *   tests rather than converted into a user-visible error.
 *
 * @module store/errors
 */

/**
 * Base class for every error the store throws.
 *
 * A `catch` block that handles `StoreError` handles all of them. This is
 * the safe default when the caller has no specific recovery, and it is
 * the contract that lets the store add a new subtype in a future version
 * without breaking callers that catch the base class.
 *
 * The `cause` option preserves the underlying error (if any) so a
 * developer debugging the failure can see the original stack trace.
 * This is the ES2022 `Error` `cause` convention, and it is honoured by
 * every modern runtime and by the browser devtools.
 */
export class StoreError extends Error {
  /**
   * @param {string} message - developer-facing description
   * @param {{ cause?: unknown }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
    // Keep the stack trace clean across environments that support it.
    // Without this, the stack points at the `super()` call rather than
    // at the line that threw.
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when a task fails validation.
 *
 * `fields` maps each offending field name to a human-readable message
 * suitable for display next to the corresponding form input. A
 * non-object input is reported under the key `_`, so the form can render
 * a general error message without inventing a field name for it.
 *
 * The messages come from the validators layer; this class does not
 * invent them. It groups them so the form can render them without
 * parsing error strings. The `fields` object is frozen so a caller
 * cannot add a field that was not reported by the validator — if they
 * want to show an additional message, they should compose their own
 * object, not mutate this one.
 *
 * Example usage:
 *   try {
 *     store.create({ title: '' });
 *   } catch (error) {
 *     if (error instanceof ValidationError) {
 *       renderFieldErrors(error.fields);
 *       // error.fields = { title: 'Title is required.' }
 *     }
 *   }
 */
export class ValidationError extends StoreError {
  /**
   * @param {Record<string, string>} fields
   * @param {{ cause?: unknown }} [options]
   */
  constructor(fields, options = {}) {
    if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
      // A caller constructing a ValidationError with a non-object
      // fields argument is a programming error, not a runtime
      // condition. Surface it clearly rather than accepting garbage.
      throw new TypeError(
        'ValidationError requires a fields object (Record<string, string>).'
      );
    }
    const count = Object.keys(fields).length;
    super(
      count === 1
        ? 'Task validation failed for 1 field.'
        : `Task validation failed for ${count} fields.`,
      options
    );
    this.fields = Object.freeze({ ...fields });
  }
}

/**
 * Thrown when an operation targets a task that does not exist.
 *
 * Used only by mutating operations (`update`, `deleteTask`). Query
 * operations (`getById`) return `undefined` for a missing task, which is
 * a normal result, not an error. The distinction matters because the
 * caller's response differs: a missing task in a query is "render an
 * empty state"; a missing task in a mutation is "refresh your view,
 * someone else removed it".
 *
 * The `id` is preserved on the error so the caller can reference the
 * exact task that was not found, rather than parsing the message.
 */
export class NotFoundError extends StoreError {
  /**
   * @param {string} id - the id that was not found
   * @param {{ cause?: unknown }} [options]
   */
  constructor(id, options = {}) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError(
        'NotFoundError requires a non-empty string id.'
      );
    }
    super(`Task with id "${id}" was not found.`, options);
    this.id = id;
  }
}

/**
 * Thrown when the persistence adapter fails.
 *
 * The `cause` is the underlying error from the adapter (for example, a
 * `QuotaExceededError` from localStorage, or a `SyntaxError` from a
 * malformed JSON payload). The `operation` field names which store
 * operation was attempted, so the caller can present an appropriate
 * message ("Could not save the task" vs. "Could not load tasks") without
 * inspecting the adapter's error type, which it should not have to know.
 *
 * The store rolls back on a storage failure. When this error is thrown
 * from a mutating operation, the in-memory state is unchanged. When it
 * is thrown from `load` at construction time, the store is not created.
 */
export class StorageError extends StoreError {
  /**
   * @param {'load'|'save'|'clear'} operation
   * @param {{ cause?: unknown }} [options]
   */
  constructor(operation, options = {}) {
    if (!['load', 'save', 'clear'].includes(operation)) {
      throw new TypeError(
        `StorageError requires operation to be one of "load", "save", "clear"; received "${operation}".`
      );
    }
    super(`Storage operation "${operation}" failed.`, options);
    this.operation = operation;
  }
}

/**
 * Type guard — narrows to `StoreError`.
 *
 * Useful in catch blocks where the error might be a native `Error` (a
 * programming bug) rather than a store error (a runtime condition). The
 * caller can distinguish "show a user-facing message" from "log and
 * rethrow" without relying on the message string.
 *
 * @param {unknown} error
 * @returns {error is StoreError}
 */
export function isStoreError(error) {
  return error instanceof StoreError;
}

/**
 * Type guard — narrows to `ValidationError`.
 *
 * @param {unknown} error
 * @returns {error is ValidationError}
 */
export function isValidationError(error) {
  return error instanceof ValidationError;
}

/**
 * Type guard — narrows to `NotFoundError`.
 *
 * @param {unknown} error
 * @returns {error is NotFoundError}
 */
export function isNotFoundError(error) {
  return error instanceof NotFoundError;
}

/**
 * Type guard — narrows to `StorageError`.
 *
 * @param {unknown} error
 * @returns {error is StorageError}
 */
export function isStorageError(error) {
  return error instanceof StorageError;
}