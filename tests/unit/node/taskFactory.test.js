/**
 * Task factory tests — the shape contract.
 *
 * Three contracts, each tested here:
 *
 *   1. Every schema field is present on the output, at its declared
 *      type. The schema is the source of truth; the test reads
 *      SCHEMA_FIELDS rather than hard-coding the list, so a future
 *      field addition is one row in the schema and the tests follow.
 *
 *   2. Every field with a `default` in SCHEMA_FIELDS is filled with
 *      that default when absent from the inputs.
 *
 *   3. Every key on the inputs that is not a schema field is *dropped*
 *      (per TASK_FACTORY_POLICY, which is 'drop' today). The test
 *      reads the policy and asserts the factory's behaviour matches.
 *      If a future change flips the policy to 'preserve', the test
 *      should be updated to assert the opposite — but the update is a
 *      visible diff, not a silent regression.
 *
 * The factory's output is also run through the conformance checker.
 * That is a cross-check: the factory *produces* a shape; the checker
 * *verifies* a shape; if the two disagree, the factory's output does
 * not conform and this test fails. That is the whole point of the two
 * being separate — the cross-check catches a factory bug that a
 * factory-only test might miss.
 *
 * Environment: node (no DOM, no browser). The factory is a pure
 * function of its inputs; it does not need jsdom.
 *
 * @module tests/unit/node/taskFactory
 */
import { describe, it, expect } from '@jest/globals';

import {
  createTaskRecord,
  TASK_FACTORY_POLICY,
} from '../../../src/js/store/taskFactory.js';
import { conformsToSchema } from '../../../src/js/store/conformance.js';
import {
  SCHEMA_FIELDS,
  SCHEMA_FIELD_NAMES,
} from '../../../src/js/store/schema.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A complete set of valid inputs for every schema field. Tests override
 * one key at a time so a failure is unambiguously about that key.
 *
 * The values are the *minimum* shapes the schema requires: strings for
 * string fields, values that satisfy any format the field declares (a
 * valid UUID v4, a canonical ISO 8601 timestamp). The factory does not
 * validate format, so the format values matter only because the
 * cross-check runs the output through the checker — and the checker
 * reads `type`, not `format`. But a value that is *shaped* like a real
 * field is a stronger test than an arbitrary string; a future
 * `format`-aware checker would still pass these.
 */
function validInputs(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Check hull',
    description: 'Inspect the port-side seal and record any anomalies.',
    creator: 'Commander Aria Vance',
    assignee: 'Engineer Kade',
    createdAt: '2026-11-03T09:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Contract 1: every schema field is present, at its declared type
// ---------------------------------------------------------------------------

describe('createTaskRecord — schema shape', () => {
  it('produces exactly the schema fields, in schema order', () => {
    const record = createTaskRecord(validInputs());

    // The output's keys are exactly SCHEMA_FIELD_NAMES, in the same
    // order. A future field addition to SCHEMA_FIELDS + SCHEMA_FIELD_NAMES
    // is picked up by this test automatically — the assertion is on the
    // schema's declaration, not on a hard-coded expectation.
    expect(Object.keys(record)).toEqual([...SCHEMA_FIELD_NAMES]);
  });

  it('produces every field at its declared type', () => {
    const record = createTaskRecord(validInputs());

    for (const name of SCHEMA_FIELD_NAMES) {
      const field = SCHEMA_FIELDS[name];
      expect(typeof record[name]).toBe(field.type);
    }
  });

  it('preserves supplied values verbatim (no trimming, no coercion)', () => {
    // The factory does not trim; the store's build path trims before
    // calling the factory. A test that calls the factory directly with
    // whitespace sees the whitespace preserved — the factory's job is
    // the *shape*, not the *content*.
    const inputs = validInputs({
      title: '  Check hull  ',
      creator: '  Commander Aria Vance  ',
    });
    const record = createTaskRecord(inputs);

    expect(record.title).toBe('  Check hull  ');
    expect(record.creator).toBe('  Commander Aria Vance  ');
  });

  it('does not generate an id — it takes what the caller supplies', () => {
    // The store generates ids; the factory trusts them. A test that
    // wanted a known id passes one; the factory does not invent ids.
    const record = createTaskRecord(validInputs({ id: 'custom-id' }));
    expect(record.id).toBe('custom-id');
  });

  it('does not generate createdAt — it takes what the caller supplies', () => {
    const record = createTaskRecord(
      validInputs({ createdAt: '2026-01-01T00:00:00.000Z' }),
    );
    expect(record.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns a frozen object', () => {
    const record = createTaskRecord(validInputs());
    expect(Object.isFrozen(record)).toBe(true);
  });

  it('a frozen record cannot be mutated', () => {
    const record = createTaskRecord(validInputs());
    // In strict mode (which Jest runs in), assigning to a frozen
    // object's property throws. A silent no-op in sloppy mode would
    // be worse — the mutation would look like it succeeded. The test
    // asserts the throw, which is the correct behaviour.
    expect(() => {
      record.title = 'Changed';
    }).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// Contract 2: defaults are filled for absent fields
// ---------------------------------------------------------------------------

describe('createTaskRecord — defaults', () => {
  it('fills every field default when the field is absent from the inputs', () => {
    // Discover which fields declare a default, then for each one
    // build an input that omits it (and supplies every other field).
    // Assert the output has the default value for the omitted field.
    const fieldsWithDefaults = SCHEMA_FIELD_NAMES.filter((name) =>
      Object.prototype.hasOwnProperty.call(SCHEMA_FIELDS[name], 'default'),
    );

    // A sanity check: the schema declares at least one default. If a
    // future schema had no defaults, this block would be vacuously
    // true — the sanity check fails to catch that case, and the
    // factory's default behaviour would be untested. The assertion
    // below prevents that.
    expect(fieldsWithDefaults.length).toBeGreaterThan(0);

    for (const name of fieldsWithDefaults) {
      const inputs = validInputs();
      delete inputs[name];

      const record = createTaskRecord(inputs);
      expect(record[name]).toEqual(SCHEMA_FIELDS[name].default);
    }
  });

  it('fills description with the empty string when absent', () => {
    // The description field declares a default of ''. This is the
    // specific default the empty-state render relies on — a task
    // without a description is `description: ''`, not
    // `description: undefined`.
    const inputs = validInputs();
    delete inputs.description;

    const record = createTaskRecord(inputs);
    expect(record.description).toBe('');
  });

  it('does not apply a default when the input supplies a value', () => {
    // A supplied description overrides the default. This is the
    // mirror of the previous test: the default only applies to an
    // *absent* field.
    const inputs = validInputs({ description: 'A supplied description' });
    const record = createTaskRecord(inputs);
    expect(record.description).toBe('A supplied description');
  });

  it('treats a supplied undefined as absent and applies the default', () => {
    // `{ description: undefined }` is the same as no description for
    // the factory's purposes. The default applies. This matches the
    // store's validator, which treats undefined as absent for
    // required fields.
    const inputs = validInputs({ description: undefined });
    const record = createTaskRecord(inputs);
    expect(record.description).toBe('');
  });

  it('leaves fields without a default as undefined when absent', () => {
    // title, creator, assignee, id, createdAt have no default. If the
    // caller omits one, the factory produces undefined. The
    // conformance checker then reports the missing field as a
    // required-field violation.
    const inputs = validInputs();
    delete inputs.title;

    const record = createTaskRecord(inputs);
    expect(record.title).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(record, 'title')).toBe(true);
    // The key is present (the factory emits every schema key); its
    // value is undefined. This is different from a missing key, and
    // the difference matters: Object.keys(record) still contains
    // 'title', so a caller iterating the output sees every field.
  });
});

// ---------------------------------------------------------------------------
// Contract 3: extra fields are dropped (per policy)
// ---------------------------------------------------------------------------

describe('createTaskRecord — extra-field policy', () => {
  it('records the policy as a value', () => {
    // The policy is a value, not a comment. A future change to
    // 'preserve' is a change to the constant, and this test picks it
    // up. The test does not assert which value is correct — it
    // asserts the constant is one of the two the code supports.
    expect(['drop', 'preserve']).toContain(TASK_FACTORY_POLICY);
  });

  it('drops extra fields on the input (matches the "drop" policy)', () => {
    // Guarded by the policy: if the policy is ever changed to
    // 'preserve', this test should be replaced with one that asserts
    // the extra field is present. The guard makes the test *fail
    // loudly* if the policy changes without the test being updated —
    // the failure message names the new policy, so a developer knows
    // what to do.
    if (TASK_FACTORY_POLICY !== 'drop') {
      throw new Error(
        `This test asserts the "drop" policy; the recorded policy is "${TASK_FACTORY_POLICY}". ` +
          'Update the factory and this test together.',
      );
    }

    const inputs = validInputs({
      priority: 'high',
      status: 'open',
      updatedAt: '2026-11-04T00:00:00.000Z',
      notes: 'a legacy field nobody remembers',
    });
    const record = createTaskRecord(inputs);

    expect(record).not.toHaveProperty('priority');
    expect(record).not.toHaveProperty('status');
    expect(record).not.toHaveProperty('updatedAt');
    expect(record).not.toHaveProperty('notes');
  });

  it('output has exactly the schema fields even when the input has many extras', () => {
    // The stronger form of the drop test: not just "the extras are
    // gone" but "the output's key set is exactly the schema's key
    // set." This catches a factory bug where an extra key sneaks in
    // through some path the first test did not exercise.
    const inputs = validInputs({
      priority: 'high',
      status: 'open',
      updatedAt: '2026-11-04T00:00:00.000Z',
    });
    const record = createTaskRecord(inputs);

    expect(Object.keys(record).sort()).toEqual([...SCHEMA_FIELD_NAMES].sort());
  });
});

// ---------------------------------------------------------------------------
// Cross-check: factory output passes the conformance checker
//
// The factory's job is to produce a *conforming* task. The checker's
// job is to verify conformance. The factory's tests assert that the
// factory's output passes the checker — that is the whole of "the
// factory produces a valid task," from the factory's side.
// ---------------------------------------------------------------------------

describe('createTaskRecord — conformance cross-check', () => {
  it('output from a valid input passes conformsToSchema', () => {
    const record = createTaskRecord(validInputs());
    const result = conformsToSchema(record);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('output from an input with extras passes conformsToSchema (extras dropped)', () => {
    // After the factory drops extras, the record has no extras — so
    // the checker sees exactly the schema fields and passes. This is
    // the *combination* of the two contracts: the factory's drop and
    // the checker's strictness work together.
    const record = createTaskRecord(
      validInputs({ priority: 'high', status: 'open' }),
    );
    const result = conformsToSchema(record);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('output with a missing required field FAILS conformsToSchema', () => {
    // The factory does *not* fill required fields without defaults;
    // it leaves them undefined. The checker then catches the
    // violation. This is the division of labour: the factory
    // produces whatever the input has (plus defaults); the checker
    // verifies the result is a valid task. A test that wanted a
    // "createTaskRecord throws on missing title" behaviour would be
    // testing a factory-that-validates; the actual contract is that
    // the factory produces and the checker (called by the store)
    // verifies.
    const inputs = validInputs();
    delete inputs.title;

    const record = createTaskRecord(inputs);
    const result = conformsToSchema(record);

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'title')).toBe(true);
  });

  it('output with a wrong-typed field FAILS conformsToSchema', () => {
    // Same division of labour: the factory produces the input as-is
    // (no coercion), and the checker catches the type violation.
    const inputs = validInputs({ title: 42 });
    const record = createTaskRecord(inputs);
    const result = conformsToSchema(record);

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'title')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Programmer-error boundaries
//
// The factory throws on programmer errors — null, undefined, a
// primitive, an array. These are not data errors (the checker handles
// those); they are "the caller passed the wrong *kind* of input." The
// factory throws so the caller's stack trace points at their call
// site, rather than a downstream "Cannot read properties of null."
// ---------------------------------------------------------------------------

describe('createTaskRecord — programmer errors', () => {
  it('throws a TypeError on null', () => {
    expect(() => createTaskRecord(null)).toThrow(TypeError);
  });

  it('throws a TypeError on undefined', () => {
    expect(() => createTaskRecord(undefined)).toThrow(TypeError);
  });

  it('throws a TypeError on a primitive', () => {
    expect(() => createTaskRecord(42)).toThrow(TypeError);
    expect(() => createTaskRecord('string')).toThrow(TypeError);
    expect(() => createTaskRecord(true)).toThrow(TypeError);
  });

  it('throws a TypeError on an array', () => {
    // An array is technically an object in JS; the factory rejects it
    // explicitly, because an array is not a valid task input — its
    // indices would be treated as field names if it were not
    // rejected.
    expect(() => createTaskRecord([])).toThrow(TypeError);
    expect(() => createTaskRecord([validInputs()])).toThrow(TypeError);
  });

  it('the error message names the received type', () => {
    // A programmer debugging a thrown TypeError wants to know what
    // was received, not just that *something* was wrong. The error
    // message names it.
    expect(() => createTaskRecord(null)).toThrow(/null/);
    expect(() => createTaskRecord([])).toThrow(/array/);
    expect(() => createTaskRecord(42)).toThrow(/number/);
  });
});

// ---------------------------------------------------------------------------
// Determinism: two runs with the same inputs produce the same output
//
// The factory's output key order is deterministic (SCHEMA_FIELD_NAMES
// order), so two calls with the same inputs produce JSON.stringify
// output that is byte-identical. This matters for persistence (stable
// bytes) and for tests (stable diffs).
// ---------------------------------------------------------------------------

describe('createTaskRecord — determinism', () => {
  it('produces byte-identical output for two calls with the same inputs', () => {
    const inputs = validInputs();
    const a = createTaskRecord(inputs);
    const b = createTaskRecord(inputs);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces byte-identical output regardless of input key order', () => {
    // Two inputs with the same values but different key orders — the
    // factory produces the same output because it iterates the
    // schema, not the input.
    const reordered = {
      createdAt: '2026-11-03T09:00:00.000Z',
      assignee: 'Engineer Kade',
      creator: 'Commander Aria Vance',
      description: 'Inspect the port-side seal and record any anomalies.',
      title: 'Check hull',
      id: '11111111-1111-4111-8111-111111111111',
    };
    const a = createTaskRecord(validInputs());
    const b = createTaskRecord(reordered);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});