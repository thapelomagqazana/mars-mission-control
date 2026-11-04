/**
 * Schema conformance checker — answers "is this object a task?".
 *
 * Why this file exists:
 *   Two layers need to verify a task's shape:
 *
 *     1. The store's load path. Persisted data comes from localStorage,
 *        which a user can edit via DevTools. The store must decide,
 *        for each persisted record, whether to trust it. A record that
 *        does not conform is skipped (the user loses that record but
 *        not the application); the rest of the store's state is
 *        unaffected.
 *
 *     2. The store's create and update paths. The factory produces a
 *        task; before the store persists it, the store verifies that
 *        what the factory produced conforms. A factory output that
 *        does not conform is a *bug in the factory* (or in the schema
 *        the factory reads) — not a user error — and the store must
 *        not persist it.
 *
 *   Both callers need the same check. Putting it here means the
 *   checker's rules live in one place, the error messages are
 *   consistent across both paths, and the "what does it mean for a
 *   task to be valid?" question has a single answer.
 *
 * What this file is:
 *   - A *pure function*. It takes a value and returns a result. It does
 *     not throw for malformed tasks — a validator that throws is hard
 *     to use for the "skip and continue" case the store's load path
 *     needs. The caller decides what to do with a non-ok result.
 *   - *Total*. It handles every input — null, undefined, primitives,
 *     arrays, objects, and the object-shaped-but-invalid cases — and
 *     returns a result for each. No input causes a throw.
 *   - The *single source* of "what does it mean for a task to be
 *     valid?". The rules are derived from `SCHEMA_FIELDS` (via
 *     `schema.js`); the store, the tests, and a future tooling layer
 *     all read the checker's answer, not their own.
 *
 * What this file is not:
 *   - Not the factory. See `taskFactory.js` for `createTaskRecord`. The
 *     factory produces; the checker verifies. The two are separate
 *     because they answer different questions — "what is a task?" and
 *     "is this a task?" — and because a factory that also verified
 *     would duplicate the checker's rules.
 *   - Not the store's field-level validator. See `validators.js` and
 *     `validateTask` in `taskStore.js` for per-field content rules
 *     (max length, format, etc.). The checker answers "does this object
 *     have every schema field at the right type?" — the *shape*
 *     question. The validator answers "is every field's value
 *     acceptable?" — the *content* question. A task can pass the
 *     checker and fail the validator (a 200-character title passes
 *     the shape check but fails the max-length rule); a task can pass
 *     the validator and fail the checker (a task with a foreign field
 *     added passes the per-field rules, because those rules only
 *     iterate the schema's fields, but fails the checker, because the
 *     checker looks at the object's keys). Both checks are needed;
 *     each has its own job.
 *   - Not a schema change. The schema decides what "valid" means; the
 *     checker reads the schema and reports the answer. Adding a field
 *     is one row in `SCHEMA_FIELDS`; the checker follows automatically.
 *
 * Error shape:
 *   The result is `{ ok: boolean, errors: Array<Error> }`. Each error
 *   names the *field* (or `'<root>'` for a non-object input), the
 *   *expected* shape, the *actual* value, and a *reason* written for a
 *   developer. The reason is not for a user — the store logs it or
 *   wraps it, and a test asserts it. A user-facing message is composed
 *   by the layer that displays it, from the field name; the store does
 *   not invent messages for the checker's failures.
 *
 * Why a result and not a throw:
 *   The store's load path iterates persisted records. For each record,
 *   it calls the checker and either keeps or skips the record. A
 *   checker that threw would force the load path to catch per record —
 *   a loop-with-try-catch that is harder to read, slower, and does not
 *   scale to a hundred malformed records (a hundred throws). A result
 *   keeps the loop linear, and the skip decision is a one-line `if`.
 *
 *   The store's create and update paths want to *report* a
 *   non-conforming factory output as a bug — a `ValidationError` with
 *   the error list, or a console warning plus a thrown error, depending
 *   on the layer. The result carries the list; the caller formats it.
 *
 * @module store/conformance
 */

import { SCHEMA_FIELDS, SCHEMA_FIELD_NAMES } from './schema.js';

/**
 * Build the error object for a field whose value has the wrong type.
 *
 * Extracted from `conformsToSchema` so the type-dispatch branch chain
 * lives in one small, readable function. Returns `null` when the type
 * matches (or when the schema declares a type this checker does not
 * yet enforce), and an error object otherwise.
 *
 * @param {string} name - the field name.
 * @param {object} field - the field's schema entry.
 * @param {unknown} value - the value found on the task.
 * @returns {{ field: string, expected: string, actual: unknown, reason: string } | null}
 */
function checkFieldType(name, field, value) {
  const expectedType = field.type;
  const actualType = typeof value;

  if (expectedType === actualType) return null;

  // The schema declares string, number, and boolean today. A future
  // type adds a branch here in the same commit that adds the field to
  // SCHEMA_FIELDS; an unrecognised type passes through as "no error"
  // so the checker does not reject a task for a type it does not know.
  if (
    expectedType === 'string' ||
    expectedType === 'number' ||
    expectedType === 'boolean'
  ) {
    return {
      field: name,
      expected: expectedType,
      actual: value,
      reason: `Field "${name}" must be a ${expectedType}; got ${actualType}.`,
    };
  }

  return null;
}

/**
 * Collect errors for a single schema field.
 *
 * Handles the required/optional distinction and the presence check,
 * then delegates the type check to `checkFieldType`. Returns an array
 * of errors (empty when the field is fine) so the caller can simply
 * spread it into the accumulated list.
 *
 * @param {object} task - the candidate task.
 * @param {string} name - the field name.
 * @param {object} field - the field's schema entry.
 * @returns {Array<{ field: string, expected: string, actual: unknown, reason: string }>}
 */
function checkSchemaField(task, name, field) {
  const errors = [];
  const hasField = Object.hasOwn(task, name);

  if (field.required && !hasField) {
    errors.push({
      field: name,
      expected: `${field.type} (required)`,
      actual: '<missing>',
      reason: `Required field "${name}" is missing.`,
    });
    return errors;
  }

  if (field.required && task[name] === undefined) {
    errors.push({
      field: name,
      expected: `${field.type} (required)`,
      actual: undefined,
      reason: `Required field "${name}" is undefined.`,
    });
    return errors;
  }

  // Optional field, absent — not an error.
  if (!hasField) return errors;

  // Type checks apply to optional fields too: optionality is about
  // whether the field can be absent, not about whether it can be
  // anything when present.
  const typeError = checkFieldType(name, field, task[name]);
  if (typeError) errors.push(typeError);
  return errors;
}

/**
 * Collect errors for keys on the task that the schema does not declare.
 *
 * The factory drops extra fields; the checker reports them, per the
 * recorded policy. A task with a foreign key did not come from the
 * factory (or the factory is buggy), and the checker says so.
 *
 * @param {object} task - the candidate task.
 * @returns {Array<{ field: string, expected: string, actual: unknown, reason: string }>}
 */
function checkExtraFields(task) {
  const errors = [];
  for (const key of Object.keys(task)) {
    if (Object.hasOwn(SCHEMA_FIELDS, key)) continue;
    errors.push({
      field: key,
      expected: '<not declared in schema>',
      actual: task[key],
      reason: `Field "${key}" is not in the schema; it should not be present on a task.`,
    });
  }
  return errors;
}

/**
 * Check whether an object conforms to the task schema.
 *
 * A conforming object has:
 *
 *   1. Every schema field present with a value of the field's declared
 *      type. A field with a `default` in `SCHEMA_FIELDS` may still be
 *      `undefined` here — the factory fills defaults; the checker's
 *      job is to verify what the factory produced, so a field that
 *      the factory should have filled and did not is a *factory bug*
 *      and the checker reports it as a missing required field.
 *
 *   2. No fields outside the schema. The extra-field policy (see
 *      `TASK_FACTORY_POLICY` in `taskFactory.js` and `docs/task-schema.md`)
 *      is "drop": a task from the factory has exactly the schema
 *      fields. The checker enforces that invariant on whatever object
 *      it receives — a task that has extra fields did not come from
 *      the factory, or the factory is buggy, and the checker reports
 *      it either way.
 *
 *   3. Not null, not an array, not a primitive. A task is a plain
 *      object; everything else is a shape violation.
 *
 * The result's `ok` is `true` if and only if `errors.length === 0`.
 * The `ok` field is redundant with `errors.length === 0`, but the
 * common call site reads `if (result.ok)` — the name is worth the
 * extra byte, and it documents the intent.
 *
 * @param {unknown} task
 * @returns {{ ok: boolean, errors: Array<{ field: string, expected: string, actual: unknown, reason: string }> }}
 *
 * The function is *total*: any input (including null, undefined, a
 * primitive, an array) returns a result. It never throws for a
 * malformed task — a validator that throws is harder to use than one
 * that returns a result, and the caller is better placed to decide
 * whether a bad input is an error (create) or a skip (load).
 */
export function conformsToSchema(task) {
  // 1. Root check. A task is a plain object — not null, not an array,
  //    not a primitive. The array check is deliberate: `typeof []` is
  //    `'object'`, but an array is not a task. Rejecting arrays here
  //    avoids every downstream field check treating the array's
  //    indices as if they were task fields.
  if (task === null || typeof task !== 'object' || Array.isArray(task)) {
    return {
      ok: false,
      errors: [
        {
          field: '<root>',
          expected: 'object',
          actual: task,
          reason:
            'A task must be a plain object, not null, undefined, a primitive, or an array.',
        },
      ],
    };
  }

  // 2. Missing required fields and 3. wrong field types, per schema
  //    field. The per-field branch chain lives in `checkSchemaField`;
  //    this loop only accumulates. A field present with value
  //    `undefined` is treated as missing for required fields — the
  //    checker is used on arbitrary objects, including persisted data
  //    a user might edit.
  const errors = [];
  for (const name of SCHEMA_FIELD_NAMES) {
    errors.push(...checkSchemaField(task, name, SCHEMA_FIELDS[name]));
  }

  // 4. Extra fields. The factory drops extra fields; the checker
  //    reports them. The distinction between the factory's "drop" and
  //    the checker's "report" is deliberate: the factory produces a
  //    well-shaped task, and the checker verifies that whatever it
  //    receives is well-shaped. A caller who *asserts* "this is a
  //    task" gets a failure for a task that has extra keys — the right
  //    answer for every caller of the checker.
  errors.push(...checkExtraFields(task));

  return { ok: errors.length === 0, errors };
}