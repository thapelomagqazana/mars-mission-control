/**
 * Conformance checker tests — the shape contract.
 *
 * Three contracts, each tested here:
 *
 *   1. A conforming task returns `{ ok: true, errors: [] }`. The
 *      checker accepts every object that has exactly the schema fields
 *      at their declared types. The fixtures
 *      (tests/fixtures/tasks.conforming.json) are the cases; a future
 *      schema change that breaks one of them is a fixture change in
 *      the same commit, which the test catches.
 *
 *   2. A non-conforming task returns `{ ok: false, errors: [...] }`
 *      with one error per violation. The fixtures
 *      (tests/fixtures/tasks.nonconforming.json) name the expected
 *      error fields; the test asserts the error list matches. The
 *      "one error per violation" contract is what makes the checker's
 *      output useful: a task with three bad fields produces three
 *      errors, not one aggregate error.
 *
 *   3. The checker is *total*: any input — null, undefined, a
 *      primitive, an array, an object — returns a result. It never
 *      throws. A throwing checker would force every caller (the
 *      store's load path, the store's create path) to wrap the call
 *      in try/catch, which is noise the caller does not need.
 *
 * The fixtures are JSON, not JS modules, so the node test (this file)
 * and any future tooling (a CLI conformance report, a Cypress
 * pre-flight check) read the same source without a transpile step.
 *
 * Environment: node (no DOM). The checker is a pure function; it does
 * not need jsdom.
 *
 * @module tests/unit/node/conformance
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { conformsToSchema } from '../../../src/js/store/conformance.js';
import {
  SCHEMA_FIELDS,
  SCHEMA_FIELD_NAMES,
} from '../../../src/js/store/schema.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const conformingFixtures = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../fixtures/tasks.conforming.json'),
    'utf8',
  ),
);
const nonConformingFixtures = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../fixtures/tasks.nonconforming.json'),
    'utf8',
  ),
);

// A sanity check on the fixture counts. The WBS item names "≥3
// conforming and ≥3 non-conforming" as the fixture requirement. The
// assertions below make the *test file* responsible for the count, not
// a reviewer's memory — a fixture removal that dropped below the
// minimum fails here, naming the fixture file.
describe('fixtures', () => {
  it('has at least 3 conforming fixtures', () => {
    expect(conformingFixtures.length).toBeGreaterThanOrEqual(3);
  });

  it('has at least 3 non-conforming fixtures', () => {
    expect(nonConformingFixtures.length).toBeGreaterThanOrEqual(3);
  });

  it('every non-conforming fixture names its expected error fields', () => {
    for (const fixture of nonConformingFixtures) {
      expect(fixture).toHaveProperty('expectedErrorFields');
      expect(Array.isArray(fixture.expectedErrorFields)).toBe(true);
      expect(fixture.expectedErrorFields.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Contract 1: conforming fixtures pass
// ---------------------------------------------------------------------------

describe('conformsToSchema — conforming fixtures', () => {
  for (const fixture of conformingFixtures) {
    it(`accepts "${fixture.name}": ${fixture.description}`, () => {
      const result = conformsToSchema(fixture.task);

      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Contract 2: non-conforming fixtures fail with one error per violation
// ---------------------------------------------------------------------------

describe('conformsToSchema — non-conforming fixtures', () => {
  for (const fixture of nonConformingFixtures) {
    it(`rejects "${fixture.name}": ${fixture.description}`, () => {
      const result = conformsToSchema(fixture.task);

      expect(result.ok).toBe(false);

      // The error count matches the expected violations. This is the
      // "one error per violation" contract: a task with three bad
      // fields produces three errors, not one aggregate error. The
      // test asserts the count first, then the field set — the count
      // catches "the checker reported two errors when it should have
      // reported three" (a bug the field-set assertion would miss if
      // the two extra errors were on fields the expected set did not
      // include).
      expect(result.errors.length).toBe(fixture.expectedErrorFields.length);

      // The error fields match the expected fields. This is the "the
      // error names the offending field" contract: a developer
      // debugging a failing check sees which field, not just that
      // "something was wrong."
      const actualFields = result.errors.map((e) => e.field).sort();
      const expectedFields = [...fixture.expectedErrorFields].sort();
      expect(actualFields).toEqual(expectedFields);
    });

    it(`"${fixture.name}": every error has the four-part shape`, () => {
      // Every error has field, expected, actual, and reason. A
      // developer debugging a failure needs all four; a checker that
      // produced only a message string would give the developer less
      // to work with. The four-part shape is a contract.
      const result = conformsToSchema(fixture.task);

      for (const error of result.errors) {
        expect(error).toHaveProperty('field');
        expect(error).toHaveProperty('expected');
        expect(error).toHaveProperty('actual');
        expect(error).toHaveProperty('reason');
        // The fields that can be checked for type are checked; the
        // `actual` value is not asserted (it can be anything, including
        // null or a number, so `toBeDefined` would fail on a legitimate
        // null).
        expect(typeof error.field).toBe('string');
        expect(typeof error.expected).toBe('string');
        expect(typeof error.reason).toBe('string');
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Contract 3: the checker is total — never throws for any input
// ---------------------------------------------------------------------------

describe('conformsToSchema — totality', () => {
  // Every input a caller might pass. The checker is a *validator* —
  // its job is to answer "is this a task?", and a caller might ask
  // about *any* value. A throwing validator would force every caller
  // to wrap the call in try/catch; a total validator lets the caller
  // treat the check as a simple `if (result.ok)`.
  const nonObjectInputs = [
    ['null', null],
    ['undefined', undefined],
    ['number 42', 42],
    ['number 0', 0],
    ['number NaN', Number.NaN],
    ['string', 'not a task'],
    ['empty string', ''],
    ['boolean true', true],
    ['boolean false', false],
    ['empty array', []],
    ['array of tasks', [{}, {}]],
    ['function', function noop() {}],
    ['symbol', Symbol('not a task')],
    ['bigint', BigInt(42)],
  ];

  for (const [label, input] of nonObjectInputs) {
    it(`returns { ok: false } for ${label} without throwing`, () => {
      let result;
      // The try/catch is the assertion: if the checker throws, the
      // test fails with the thrown error, which names the input.
      // A checker that returned { ok: false } for some inputs but
      // threw for others would be an inconsistent API; this test
      // catches the inconsistency.
      expect(() => {
        result = conformsToSchema(input);
      }).not.toThrow();

      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // The root-level error is reported under the '<root>' field
      // name, so a caller can distinguish "the input is not a task at
      // all" from "the input is a task with bad fields."
      expect(result.errors[0].field).toBe('<root>');
    });
  }
});

// ---------------------------------------------------------------------------
// Error shape — specific cases beyond the fixtures
//
// The fixtures cover one fixture per category (missing, type, extra,
// multiple). The tests below cover cases the fixtures deliberately do
// not, because they would make the fixtures heavy: a task with a
// required field set to undefined, a task with an inherited property
// (hasOwnProperty semantics), a task with a symbol key (Object.keys
// skips it, but Object.getOwnPropertyNames would not — the checker
// uses Object.keys, so a symbol key is invisible).
// ---------------------------------------------------------------------------

describe('conformsToSchema — error shape edge cases', () => {
  const validTask = () => ({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Check hull',
    description: 'Inspect the port-side seal.',
    creator: 'Commander Aria Vance',
    assignee: 'Engineer Kade',
    createdAt: '2026-11-03T09:00:00.000Z',
  });

  it('a required field set to undefined is reported as a violation', () => {
    const task = validTask();
    task.title = undefined;
    const result = conformsToSchema(task);

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('title');
    expect(result.errors[0].actual).toBeUndefined();
  });

  it('a required field present with a non-schema value type is reported', () => {
    const task = validTask();
    task.title = 42;
    const result = conformsToSchema(task);

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('title');
    expect(result.errors[0].expected).toBe('string');
    expect(result.errors[0].actual).toBe(42);
  });

  it('an inherited property does not satisfy a required field', () => {
    // A task created with `Object.create({ title: 'inherited' })` has
    // a `title` accessible via `.title`, but the title is on the
    // *prototype*, not owned by the object. The checker uses
    // `hasOwnProperty`, which reports the field as missing. This is
    // the correct behaviour: a task must *own* its fields, not
    // inherit them.
    const task = Object.create({ title: 'inherited' });
    Object.assign(task, {
      id: '11111111-1111-4111-8111-111111111111',
      // title is inherited, not assigned
      description: 'Inspect.',
      creator: 'Commander Aria Vance',
      assignee: 'Engineer Kade',
      createdAt: '2026-11-03T09:00:00.000Z',
    });
    const result = conformsToSchema(task);

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'title')).toBe(true);
  });

  it('an extra field is reported, and the rest of the task is still checked', () => {
    const task = validTask();
    task.priority = 'high';
    task.title = 42; // also broken
    const result = conformsToSchema(task);

    expect(result.ok).toBe(false);
    // Both violations are reported: the extra field *and* the
    // wrong-typed field. The checker does not stop at the first
    // violation; it reports the full picture.
    const fields = result.errors.map((e) => e.field).sort();
    expect(fields).toEqual(['priority', 'title']);
  });

  it('a symbol-keyed extra field is not reported (Object.keys skips it)', () => {
    // A symbol key is not returned by Object.keys, so the checker's
    // extra-field loop does not see it. This is a limitation of the
    // checker's design (it uses Object.keys, which is the right
    // choice for JSON-serialisable data — a symbol key would not be
    // persisted anyway). The test documents the limitation: a
    // symbol-keyed extra field passes the checker *because it would
    // not survive JSON serialisation*, which is the correct
    // behaviour for persisted data.
    const task = validTask();
    const symbolKey = Symbol('not a real key');
    task[symbolKey] = 'ignored';
    const result = conformsToSchema(task);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('a non-schema field with value undefined is still reported', () => {
    // `{ priority: undefined }` is still an extra field — the key is
    // present on the object, even though its value is undefined. The
    // extra-field policy is about the *key set*, not the value set.
    // This is different from a missing required field: the title
    // being undefined is a "missing value" violation; a priority
    // being undefined is a "present key that should not be present"
    // violation. Both are reported, with different reasons.
    const task = validTask();
    task.priority = undefined;
    const result = conformsToSchema(task);

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'priority')).toBe(true);
  });

  it('a task with every field at the exact declared type passes', () => {
    // The conforming fixtures cover this; this test is a *direct*
    // assertion (rather than via a fixture) that the checker accepts
    // the minimal valid shape. If a future schema change adds a
    // field, the fixture in tasks.conforming.json would need updating
    // — but this test would also fail, naming the missing field. Two
    // independent signals for the same schema change.
    const task = validTask();
    const result = conformsToSchema(task);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Schema-driven coverage
//
// The checker is schema-driven: it iterates SCHEMA_FIELD_NAMES and
// reads SCHEMA_FIELDS. A test that hard-coded "six fields" would miss
// a future field addition. The tests below read from the schema, so a
// future field is picked up automatically.
// ---------------------------------------------------------------------------

describe('conformsToSchema — schema-driven coverage', () => {
  it('for each required schema field, omitting it produces one violation', () => {
    // Build a maximal valid task by filling every schema field with a
    // value of its declared type. Then for each *required* field,
    // remove it and assert the checker reports exactly one violation
    // for that field. This is the schema-driven version of the
    // "missing required field" tests: a future field addition is one
    // row in the schema and this test picks it up.
    const requiredFields = SCHEMA_FIELD_NAMES.filter(
      (name) => SCHEMA_FIELDS[name].required,
    );

    // Sanity: the schema has at least one required field. If it did
    // not, this test would be vacuously true and the checker's
    // required-field logic would be untested.
    expect(requiredFields.length).toBeGreaterThan(0);

    for (const name of requiredFields) {
      const task = {};
      for (const fieldName of SCHEMA_FIELD_NAMES) {
        const spec = SCHEMA_FIELDS[fieldName];
        // A value of the declared type. The exact value does not
        // matter — the checker checks presence and type, not content.
        if (spec.type === 'string') task[fieldName] = 'x';
        else if (spec.type === 'number') task[fieldName] = 1;
        else if (spec.type === 'boolean') task[fieldName] = true;
      }
      delete task[name];

      const result = conformsToSchema(task);
      expect(result.ok).toBe(false);

      const matchingErrors = result.errors.filter((e) => e.field === name);
      expect(matchingErrors).toHaveLength(1);
      expect(matchingErrors[0].expected).toContain('required');
    }
  });

  it('for each schema field, supplying the wrong type produces one violation', () => {
    // Same shape as above, but the violation is a type mismatch, not
    // a missing field. For each schema field, build a valid task,
    // replace the field with a value of the *wrong* type, and assert
    // the checker reports exactly one violation for that field.
    for (const name of SCHEMA_FIELD_NAMES) {
      const spec = SCHEMA_FIELDS[name];
      const task = {};
      for (const fieldName of SCHEMA_FIELD_NAMES) {
        const s = SCHEMA_FIELDS[fieldName];
        if (s.type === 'string') task[fieldName] = 'x';
        else if (s.type === 'number') task[fieldName] = 1;
        else if (s.type === 'boolean') task[fieldName] = true;
      }
      // Assign a value of the *opposite* type. For a string field,
      // a number; for a number field, a string; for a boolean, a
      // number. The specific wrong type does not matter — the point
      // is that it is not the declared type.
      if (spec.type === 'string') task[name] = 42;
      else if (spec.type === 'number') task[name] = 'not a number';
      else if (spec.type === 'boolean') task[name] = 42;

      const result = conformsToSchema(task);
      expect(result.ok).toBe(false);

      const matchingErrors = result.errors.filter((e) => e.field === name);
      expect(matchingErrors).toHaveLength(1);
    }
  });

  it('a task missing every schema field produces one violation per required field', () => {
    // The "everything is missing" case. The checker reports one
    // error per required field (via the schema iteration), plus one
    // error per extra field on the task. An empty object has no extra
    // fields, so the error count equals the number of required fields.
    const requiredFields = SCHEMA_FIELD_NAMES.filter(
      (name) => SCHEMA_FIELDS[name].required,
    );
    const result = conformsToSchema({});

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBe(requiredFields.length);
    const reportedFields = result.errors.map((e) => e.field).sort();
    const expectedFields = [...requiredFields].sort();
    expect(reportedFields).toEqual(expectedFields);
  });
});