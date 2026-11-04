/**
 * Task factory — the one place a task record is constructed.
 *
 * Why this file exists:
 *   Every task the app produces passes through `createTaskRecord`. The
 *   store calls it on load (for each persisted record), on create (for
 *   the new task's body), and on update (for the merged task). Views
 *   and the dialog never call it — they receive tasks that have
 *   already been through it.
 *
 *   The factory's job is narrow: given a set of inputs, produce an
 *   object with *exactly* the schema's fields, at the schema's types,
 *   in the schema's order, with defaults filled in for any absent
 *   fields that declare one. That is all it does. It is not a
 *   validator — see `conformance.js` for `conformsToSchema`, which the
 *   store runs on the factory's output. It is not a store — see
 *   `taskStore.js` for the create / update / delete lifecycle.
 *
 * The factory's three contracts:
 *
 *   1. Every schema field is present on the output. A field with a
 *      `default` in `SCHEMA_FIELDS` is filled with that default when
 *      absent from the inputs. A field without a default is present as
 *      `undefined` when absent from the inputs; the validator then
 *      decides whether `undefined` is acceptable for that field (it is
 *      for optional fields, not for required ones).
 *
 *   2. Every field is at its declared type. The factory does not
 *      *coerce* — a caller who passes `{ title: 42 }` gets a task with
 *      `title: 42`, and the conformance checker catches the type
 *      violation. The factory trusts its caller; the checker verifies.
 *      This split is deliberate: a factory that also validated would
 *      duplicate the checker's rules, and the two would drift.
 *
 *   3. No field outside the schema is present on the output. A key on
 *      the inputs that is not in `SCHEMA_FIELD_NAMES` is *dropped*.
 *      This is the extra-field policy — see `TASK_FACTORY_POLICY`
 *      below and `docs/task-schema.md` for the recorded decision and
 *      its reasoning.
 *
 * The output is frozen.
 *   Every task record the factory produces is `Object.freeze`-d. A
 *   caller who tries to mutate a task gets a silent no-op in sloppy
 *   mode and a thrown TypeError in strict mode. Either way, the store
 *   is protected: a task, once constructed, never changes. Updates
 *   produce a new task; they do not mutate the old one.
 *
 * Field order is deterministic.
 *   The output's keys are emitted in `SCHEMA_FIELD_NAMES` order. Two
 *   tasks created with the same inputs (modulo auto fields) have
 *   `JSON.stringify` output that differs only in the auto fields'
 *   values, not in key order. This matters for storage (the adapter
 *   writes JSON — a stable key order makes the persisted bytes stable)
 *   and for tests (a fixture's `JSON.stringify` comparison is stable
 *   across runs).
 *
 * What the factory does NOT do:
 *   - It does not generate `id` or `createdAt`. Those are the store's
 *     responsibility (`crypto.randomUUID()` and `new Date().toISOString()`
 *     respectively). The factory accepts them as inputs; the store
 *     supplies them. This means a test that wants a factory-produced
 *     task with a known id can pass one; the factory does not invent
 *     ids.
 *   - It does not validate. A caller who passes a wrong-typed value
 *     gets a task with that wrong-typed value; the conformance
 *     checker (`conformsToSchema`) reports the violation. The
 *     factory's job is to *produce* a well-shaped object; the
 *     checker's job is to *verify* one. They are two operations on
 *     two boundaries, not the same operation twice.
 *   - It does not trim strings. The validator's `normaliseValue`
 *     handles trimming — the factory produces the object, the store's
 *     build path normalises it before the factory, and the factory
 *     preserves the normalised values. If a caller calls the factory
 *     directly with un-normalised inputs, the factory produces
 *     un-normalised outputs; the checker will report the *content*
 *     violation (e.g. a title that is only whitespace fails the
 *     validator's `required` check because it is effectively empty).
 *     The separation keeps the factory focused on *shape*.
 *
 * @module store/taskFactory
 */

import { SCHEMA_FIELDS, SCHEMA_FIELD_NAMES } from './schema.js';

/**
 * The extra-field policy, as a value.
 *
 * The policy is "drop, unless a future schema change explicitly
 * requires preservation." Today no schema change requires
 * preservation, so the policy is `'drop'`. The value is exported so:
 *
 *   - A reviewer reading this file sees the decision, not just its
 *     implementation.
 *
 *   - The tests at `tests/unit/node/taskFactory.test.js` can assert
 *     the factory's behaviour matches the recorded policy. A future
 *     change to `'preserve'` that forgot to update the factory body
 *     fails the test with the policy value in the failure message.
 *
 *   - `docs/task-schema.md` can cross-reference the same constant, so
 *     the human-readable record and the machine-readable value agree.
 *
 * Why "drop" is the right policy here:
 *
 *   The extra fields come from legacy storage or hand-edited data.
 *   They are not part of the current schema, so nothing in the app
 *   reads them. Preserving them would mean every future read of a
 *   task has to consider "what if this task has fields we do not know
 *   about?" — a question the app does not need to answer, and a
 *   question that would make every task-shaped value's identity
 *   depend on what was in storage rather than what the schema
 *   declares.
 *
 *   If the app later adds a field, the schema changes (one row in
 *   `SCHEMA_FIELDS`); the field is now *declared*, so it is preserved
 *   on the next factory pass. A legacy field that predates the
 *   schema — and is not in the current schema — is not preserved
 *   because the app cannot promise what it means.
 *
 *   The alternative ("preserve") would require the factory to keep
 *   every key it does not recognise. That is *easier* to implement
 *   but *harder* to reason about: a task from the factory would have
 *   a shape that depends on what was in storage, not on the schema.
 *   Two tasks created by the same user, with the same inputs, could
 *   have different shapes if one was imported from legacy storage and
 *   one was created fresh. That is a *bug* the "preserve" policy would
 *   introduce; "drop" makes the shape deterministic.
 *
 * @type {'drop' | 'preserve'}
 */
export const TASK_FACTORY_POLICY = 'drop';

/**
 * Create a task record conforming to the schema.
 *
 * @param {object} inputs - the raw values. Keys not in the schema are
 *   dropped (per `TASK_FACTORY_POLICY`). Missing keys with a `default`
 *   in the schema are filled with that default. Missing keys without a
 *   default are set to `undefined`.
 * @returns {Readonly<object>} a frozen task object with exactly the
 *   schema fields, in `SCHEMA_FIELD_NAMES` order.
 * @throws {TypeError} if `inputs` is not a non-null, non-array object.
 *
 * The type check at the top is a *programmer* check, not a *data*
 * check. A caller who passes `null`, `undefined`, a primitive, or an
 * array is making a mistake the compiler would have caught in a
 * statically typed language. Throwing early gives them a stack trace
 * pointing at their call site, rather than a downstream `Cannot read
 * properties of null` three frames deep. A task with a wrong-typed
 * *field* (e.g. `title: 42`) is a *data* problem, caught by the
 * conformance checker; a wrong-typed *input* is a *code* problem,
 * caught here.
 *
 * The array check is deliberate: an array is technically an object
 * in JavaScript, but it is not a valid task input. Passing an array
 * would silently iterate its indices as if they were field names —
 * the output would be a task with numeric keys, missing every real
 * field. Rejecting arrays at the boundary prevents a class of
 * confusing downstream failures.
 *
 * The function iterates `SCHEMA_FIELD_NAMES`, not `Object.keys(inputs)`.
 * The schema decides the output's keys; the input decides the values.
 * A key in the input but not in the schema is never asked for — that
 * is the "drop" policy, implemented by the iteration, not by a
 * separate filtering step. A key in the schema but not in the input
 * is filled with its default (or left `undefined`, per the schema
 * row). This is why the factory does not need to explicitly iterate
 * the input's keys to drop them — the iteration over the schema is
 * the drop.
 *
 * `hasOwnProperty` is used instead of `in` because `in` would return
 * true for inherited properties (e.g. a task with `Object.prototype.
 * toString` as a field name would pass an `in` check). `hasOwnProperty`
 * is the correct check for "the caller supplied this key on their
 * object."
 *
 * A key supplied as `undefined` is treated the same as a missing key:
 * `{ title: undefined }` is the same as `{}` for the factory's
 * purposes. The `Object.prototype.hasOwnProperty.call(inputs, name)`
 * check would distinguish them, but the factory does not — the
 * validator's `required` check treats `undefined` as absent (see
 * `collectFieldErrors` in taskStore.js and `validateString` in
 * validators.js). Making the factory agree with the validator keeps
 * "the task from the factory" and "the task the validator approves"
 * the same shape.
 *
 * A field with no default and no input is set to `undefined`
 * explicitly (not left off the object). This makes `Object.keys(record)`
 * return every schema field, always — a caller who iterates the output
 * sees every field, including the `undefined` ones. The alternative
 * (omit undefined fields) would mean the output's keys depend on the
 * inputs, which is the shape instability the extra-field policy exists
 * to prevent.
 */
export function createTaskRecord(inputs) {
  if (inputs === null || typeof inputs !== 'object' || Array.isArray(inputs)) {
    throw new TypeError(
      'createTaskRecord(inputs): inputs must be a non-null, non-array object. ' +
        `Received: ${
          inputs === null
            ? 'null'
            : Array.isArray(inputs)
              ? 'array'
              : typeof inputs
        }.`,
    );
  }

  const record = {};

  for (const name of SCHEMA_FIELD_NAMES) {
    const field = SCHEMA_FIELDS[name];

    // A missing schema row for a name in SCHEMA_FIELD_NAMES is a
    // schema bug (the two constants should agree). The factory throws
    // so the bug is loud rather than silent.
    if (!field) {
      throw new Error(
        `createTaskRecord(inputs): schema inconsistency — ` +
          `"${name}" is in SCHEMA_FIELD_NAMES but has no row in SCHEMA_FIELDS. ` +
          'Fix schema.js before using the factory.',
      );
    }

    const hasInput = Object.prototype.hasOwnProperty.call(inputs, name);
    const inputValue = hasInput ? inputs[name] : undefined;

    if (inputValue !== undefined) {
      // Input supplied and not undefined: preserve it. The factory
      // does not coerce, trim, or validate — see the module header.
      record[name] = inputValue;
    } else if (Object.prototype.hasOwnProperty.call(field, 'default')) {
      // Input absent (or undefined) and the schema declares a default:
      // fill it. This is the factory's contract: every field with a
      // default is present on every factory-produced task.
      record[name] = field.default;
    } else {
      // Input absent (or undefined) and the schema declares no default:
      // the field is present but `undefined`. A required field will be
      // caught by the conformance checker; an optional field will pass.
      record[name] = undefined;
    }
  }

  return Object.freeze(record);
}