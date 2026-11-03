/**
 * Field validators — pure functions that decide whether a value is valid.
 *
 * Why this file exists:
 *   Validation rules are the same whether a value comes from a form, a
 *   test, or localStorage. If those rules live in three places, they
 *   drift. Here they live in one place, and every caller uses the same
 *   function. The store calls them before saving; the form calls them
 *   as the user types; the tests call them directly.
 *
 * What this file is:
 *   - Pure. Every function takes a value and returns an error string or
 *     null. No DOM, no storage, no side effects, no global state.
 *   - Composable. Small validators combine into larger ones; a new
 *     format is one entry in a dispatch table, not a rewrite.
 *   - Testable without a browser. A validator that touches the DOM
 *     cannot be unit-tested; these can.
 *
 * What this file is not:
 *   - Not the schema. Field specifications live in `schema.js`.
 *   - Not the store. Orchestration lives in `taskStore.js`.
 *   - Not the form. Validation messages are returned, not rendered.
 *
 * Error message convention:
 *   Every error message is a complete sentence, capitalised, with a
 *   trailing period. It is written for the person filling in the form,
 *   not for the developer reading a stack trace. "Title is required."
 *   is better than "title: invalid".
 *
 * Missing values:
 *   `validateField` does not accept `undefined` on behalf of an
 *   optional field. A missing optional value is a valid absence, not a
 *   validation failure, and it is the caller's job to decide what
 *   "missing" means for the context (create vs. update vs. whole-task
 *   validation). `validateAllFields` and `validateTask` both apply the
 *   correct rule for their context. `validateField` reports on values
 *   it receives; it does not assume what a missing value should mean.
 *
 * Immutability of results:
 *   The result object returned by `validateAllFields` is frozen. It is
 *   the payload of a `ValidationError`, and a caller who mutates it
 *   would be mutating the error contract. Freezing makes that an
 *   obvious mistake rather than a silent one.
 *
 * @module store/validators
 */

/**
 * Format validators are looked up by name from `schema.js`.
 *
 * A field spec declares `format: 'uuid-v4'`; the dispatcher below maps
 * that name to the function that checks it. Adding a format is one line
 * in `FORMAT_VALIDATORS`, not a new branch in `validateField`.
 *
 * @type {Readonly<Record<string, (value: string) => string | null>>}
 */
const FORMAT_VALIDATORS = Object.freeze({
  'uuid-v4': validateUuidV4,
  'iso-8601': validateIso8601,
});

/**
 * UUID v4 in its canonical hyphenated form.
 *
 * The regex is strict on purpose: it accepts only lowercase hex, only
 * the version-4 nibble, and only the RFC 4122 variant nibble (8, 9, a,
 * b). A looser pattern would accept IDs that no RFC 4122 generator would
 * produce, which would make corruption harder to spot.
 */
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Validate a UUID v4 string.
 *
 * @param {string} value
 * @returns {string|null} error message, or null when valid
 */
function validateUuidV4(value) {
  if (typeof value !== 'string') {
    return 'Identifier must be text.';
  }
  if (!UUID_V4_PATTERN.test(value)) {
    return 'Identifier is not a valid UUID v4.';
  }
  return null;
}

/**
 * Validate an ISO 8601 timestamp.
 *
 * Two checks, both necessary:
 *   1. `Date.parse` accepts some impossible dates (e.g. "2026-13-45"
 *      rolls over in some engines). The round-trip check rejects those:
 *      if `new Date(value).toISOString() !== value`, the input was not
 *      a canonical ISO 8601 string.
 *   2. The round-trip check also rejects date-like strings that
 *      `Date.parse` accepts but that are not ISO 8601 (e.g. "March 5,
 *      2026").
 *
 * We do not check timezone offset here. The store generates `createdAt`
 * with a `Z` suffix; the round-trip check enforces that. A caller that
 * supplies an offset is rejected, which is correct: the schema says the
 * timestamp is stored in UTC.
 *
 * @param {string} value
 * @returns {string|null} error message, or null when valid
 */
function validateIso8601(value) {
  if (typeof value !== 'string') {
    return 'Timestamp must be text.';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Timestamp is not a valid date.';
  }
  if (date.toISOString() !== value) {
    return 'Timestamp must be a canonical ISO 8601 string (UTC, with milliseconds).';
  }
  return null;
}

/**
 * Validate a value against string-shaped rules.
 *
 * Handles the rules every string field shares: type check, trim,
 * required, min length, max length. Format-specific rules are applied
 * separately by `validateField`.
 *
 * Trimming happens here, not in the caller, so that a value of "   "
 * is treated as empty for the required check. The caller receives the
 * error for the value the user actually typed; the store receives the
 * trimmed value. Both are correct because the rule is "required means
 * non-empty after trim", not "required means any bytes at all".
 *
 * @param {*} value
 * @param {object} spec - the field specification from schema.js
 * @param {string} label - human-readable field name for error messages
 * @returns {string|null}
 */
function validateString(value, spec, label) {
  if (typeof value !== 'string') {
    return `${label} must be text.`;
  }

  const normalised = spec.trim ? value.trim() : value;

  if (spec.required && normalised.length === 0) {
    return `${label} is required.`;
  }

  // An optional field that is empty is valid. Do not report a min-length
  // violation for an empty optional field; that would make it required.
  if (!spec.required && normalised.length === 0) {
    return null;
  }

  if (spec.minLength !== undefined && normalised.length < spec.minLength) {
    const suffix = spec.minLength === 1 ? '' : 's';
    return `${label} must be at least ${spec.minLength} character${suffix}.`;
  }

  if (spec.maxLength !== undefined && normalised.length > spec.maxLength) {
    const suffix = spec.maxLength === 1 ? '' : 's';
    return `${label} must be at most ${spec.maxLength} character${suffix}.`;
  }

  return null;
}

/**
 * Validate a single field against its specification.
 *
 * The order of checks matters. The type check runs first so that a
 * number or object never reaches the format check, which would produce
 * a confusing error. The length check runs before the format check so
 * that a value which fails length is reported as a length problem, not
 * a format problem — the user can fix the length, then re-submit, and
 * the format problem (if any) surfaces next.
 *
 * `undefined` is not accepted here. A missing optional field is a valid
 * absence, not an invalid value, and deciding whether an absence is
 * acceptable is the caller's job (see `validateAllFields` and
 * `validateTask`). This function reports on values it receives; it does
 * not invent rules for values it does not.
 *
 * @param {string} name - the field name (used only for the label)
 * @param {*} value - the candidate value; must not be `undefined`
 * @param {object} spec - the field specification from schema.js
 * @returns {string|null} error message, or null when valid
 */
export function validateField(name, value, spec) {
  if (!spec) {
    // A field with no specification should never reach here; the store
    // checks this before calling. Returning an error rather than null
    // makes the bug visible instead of silently accepting the value.
    return `No schema specification for field "${name}".`;
  }

  const label = humaniseFieldName(name);

  if (spec.type === 'string') {
    const stringError = validateString(value, spec, label);
    if (stringError) return stringError;
  }

  // Format checks only run on values that survived the type check.
  // An empty optional field skips format validation: it has no value to
  // format-check.
  if (spec.format && value !== undefined && value !== null && value !== '') {
    const formatValidator = FORMAT_VALIDATORS[spec.format];
    if (!formatValidator) {
      // An unrecognised format in a spec is a schema bug, not a data
      // bug. Surfacing it as an error makes the bug visible in tests.
      return `Field "${name}" declares an unknown format "${spec.format}".`;
    }
    const formatError = formatValidator(value);
    if (formatError) return formatError;
  }

  return null;
}

/**
 * Validate a single field, returning a result object instead of a
 * string-or-null.
 *
 * This form is convenient at call sites that need to distinguish
 * "valid" from "invalid" without null-checks. It delegates to
 * `validateField` so the rules live in one place.
 *
 * @param {string} name
 * @param {*} value
 * @param {object} spec
 * @returns {{ valid: boolean, error: string|null }}
 */
export function checkField(name, value, spec) {
  const error = validateField(name, value, spec);
  return { valid: error === null, error };
}

/**
 * Validate every field of a candidate task.
 *
 * The caller supplies the field names and specifications; this function
 * does not import the schema. That keeps the dependency arrow pointing
 * one way: `taskStore` imports `schema` and `validators`; `validators`
 * imports neither. If `validators` imported `schema`, every test of a
 * validator would also test the schema, and a schema change would break
 * validator tests for reasons unrelated to validation.
 *
 * Missing values are handled here, not in `validateField`. A field that
 * is absent from the input is:
 *   - required -> an error, reported with a "required" message
 *   - optional -> not an error, and not included in the errors object
 *
 * This mirrors the rule `validateTask` applies to whole tasks, so the
 * two entry points agree on what "optional" means.
 *
 * The function iterates the fields in the order given, so the first
 * error in `errors` reflects the first invalid field, which matches the
 * order the form presents. That is a small usability win: the user sees
 * the error for the field they filled first, not an arbitrary one.
 *
 * The result is frozen. The caller (the store) passes the errors object
 * to `ValidationError`, which also freezes it. Freezing here means the
 * store does not have to copy; freezing in `ValidationError` means the
 * store does not have to trust the caller. Both freezes are cheap, and
 * together they make the error contract immutable end to end.
 *
 * @param {object|null|undefined} input - the candidate task
 * @param {ReadonlyArray<string>} fieldNames
 * @param {Record<string, object>} fields
 * @returns {{ valid: boolean, errors: Readonly<Record<string, string>> }}
 */
export function validateAllFields(input, fieldNames, fields) {
  const errors = {};

  for (const name of fieldNames) {
    const spec = fields[name];

    // A spec is required for every iterated field; a missing spec is a
    // schema bug, not a data bug. Report it explicitly.
    if (!spec) {
      errors[name] = `No schema specification for field "${name}".`;
      continue;
    }

    const value = input === null || input === undefined ? undefined : input[name];

    // Missing value: valid only if the field is optional. The guard
    // lives here, not in validateField, because "is absence acceptable"
    // is a context question. validateTask answers it for whole tasks;
    // this function answers it for the fields it was given.
    if (value === undefined) {
      if (spec.required) {
        errors[name] = `${humaniseFieldName(name)} is required.`;
      }
      continue;
    }

    const error = validateField(name, value, spec);
    if (error) {
      errors[name] = error;
    }
  }

  const valid = Object.keys(errors).length === 0;
  return Object.freeze({
    valid,
    errors: Object.freeze({ ...errors }),
  });
}

/**
 * Turn a field name into a human-readable label.
 *
 * "createdAt" becomes "Created at", "id" becomes "Id", "title" becomes
 * "Title". This is a presentation concern that lives here because every
 * error message needs it and duplicating the rule would invite drift.
 *
 * If the form later supplies its own labels (e.g. from a translations
 * file), this function becomes the fallback, not the source of truth.
 *
 * @param {string} name
 * @returns {string}
 */
function humaniseFieldName(name) {
  if (!name) return 'Field';
  // Split camelCase into words, then sentence-case.
  const spaced = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The format validators, exported for direct testing.
 *
 * A test that wants to check UUID validation in isolation imports
 * `formatValidators['uuid-v4']` rather than constructing a fake task and
 * running it through the whole store. That keeps tests focused on what
 * they are testing.
 *
 * The object is frozen; a caller cannot replace a validator at runtime.
 *
 * @type {Readonly<Record<string, (value: string) => string | null>>}
 */
export const formatValidators = FORMAT_VALIDATORS;

/**
 * Whether a value is a non-empty string after trimming.
 *
 * Exported because the store uses it to decide whether to persist
 * trimmed values and the view uses it to decide whether to render a
 * description paragraph. A single definition of "meaningful text" keeps
 * the two decisions consistent.
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isMeaningfulText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Normalise a string value the way the store will store it.
 *
 * Trims if the spec says so; otherwise returns the value unchanged.
 * This is the counterpart to validation: the validator says "this is
 * acceptable", and this function produces the acceptable form. The store
 * calls it after validation and before persistence, so the value that
 * is stored is exactly the value the validator approved.
 *
 * @param {*} value
 * @param {object} spec
 * @returns {*}
 */
export function normaliseValue(value, spec) {
  if (spec && spec.trim && typeof value === 'string') {
    return value.trim();
  }
  return value;
}