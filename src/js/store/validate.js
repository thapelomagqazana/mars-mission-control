/**
 * Task validator — the content check for a task object.
 *
 * Why this module exists:
 *   Two layers need to ask "is this a valid task?":
 *
 *     - The store, on create and update, before persisting a task.
 *     - Initialization, on load, to decide which persisted records
 *       are the user's data and which are corrupted records to drop.
 *
 *   The answer to "is this a valid task?" is *content*, not just
 *   *shape*: a task with `id: 'not-a-uuid'` has the right *shape*
 *   (a string `id`), but the wrong *content* (`format: 'uuid-v4'`
 *   rejects it). The conformance checker (`conformance.js`) answers
 *   the shape question; this module answers the content question,
 *   which subsumes the shape question.
 *
 *   The two layers above need the content answer, so the content
 *   answer lives here — where both can import it without a cycle.
 *   (The store imports the initializer; the initializer imports the
 *   validator; the validator imports the schema. No module imports
 *   the store except the application root.)
 *
 * What this module is:
 *   - Pure. It reads from `schema.js` and `validators.js`; it does
 *     not touch the DOM, `localStorage`, or the store.
 *   - A pure function of its inputs. `validateTask(input)` returns a
 *     `{ valid, errors }` result; it does not throw for a malformed
 *     task.
 *   - The single source of truth for "is this a valid task?" The
 *     store's create path, the store's update path, and the
 *     initializer's load path all read the same answer.
 *
 * What this module is not:
 *   - Not the shape checker. See `conformance.js` for the pure
 *     shape check (used by the factory's cross-check and by tools
 *     that only need to know "does this object have the right
 *     fields?").
 *   - Not the store. See `taskStore.js` for create / update / delete.
 *   - Not the initializer. See `initialize.js` for the four-case
 *     policy and the console warning on dropped records.
 *
 * @module store/validate
 */

import {
  FIELDS,
  FIELD_NAMES,
  FORBIDDEN_FIELDS,
} from './schema.js';
import { validateField } from './validators.js';

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
export function collectForbiddenFieldErrors(input) {
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
export function collectUnknownFieldErrors(input) {
  const errors = {};
  for (const key of Object.keys(input)) {
    if (!FIELD_NAMES.includes(key) && !FORBIDDEN_FIELDS.includes(key)) {
      errors[key] = `Unknown field "${key}".`;
    }
  }
  return errors;
}

/**
 * Collect rejection errors for the *whole input*: forbidden fields and
 * unknown fields.
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
export function collectRejectionErrors(input) {
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
export function collectFieldErrors(input) {
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
 * This is the *content* validation: it includes the shape checks
 * (required fields present, types match) *and* the per-field content
 * checks (max length, format). It is the answer to "is this a valid
 * task?" — the shape checker (`conformsToSchema`) answers only the
 * shape half of that question.
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