/**
 * Schema and store contract tests.
 *
 * Purpose:
 *   These tests are the mechanism that keeps the human-readable schema
 *   record (`docs/schema.md`) and the store contract
 *   (`docs/store-contract.md`) from drifting apart from the code. If a
 *   field is added, removed, or renamed without updating the
 *   documentation, one of these tests fails. If a store method starts
 *   throwing a different error, or returns a different shape, one of
 *   these tests fails. The failure is the signal that the contract has
 *   been broken, and it is what makes the contract a contract rather
 *   than a wish.
 *
 * Scope:
 *   - The schema declares exactly the documented fields.
 *   - Every field has the shape the docs claim.
 *   - Forbidden fields are genuinely not in the schema.
 *   - The store enforces the schema on untrusted input.
 *   - Auto fields cannot be spoofed.
 *   - The store throws typed errors as documented.
 *   - Corrupted storage does not crash the application.
 *
 * Imports — one source per symbol
 *   This file tests three concerns: the schema, the validators, and the
 *   store's schema-enforcing contract. Each symbol is imported from the
 *   module that *owns* it, not from a re-export:
 *
 *     - The schema and its helpers — `schema.js`.
 *     - The field validators — `validators.js`.
 *     - `buildTask`, `applyPatch`, `createTaskStore` — `taskStore.js`
 *       (these are the store's public operations).
 *     - `validateTask` — `validate.js` (the content validator lives
 *       in its own module, shared by the store and the initializer).
 *       Importing it from `taskStore.js` would fail because the store
 *       imports it from `validate.js` and does not re-export it.
 *     - The error types — `errors.js`.
 *
 *   Importing a symbol from a module that does not export it produces
 *   `TypeError: X is not a function` — a *linkage* error, not a
 *   behaviour error. When a symbol moves between modules, this file's
 *   import is the reference that must update in the same commit as
 *   the definition.
 *
 * What these tests deliberately do not cover:
 *   - DOM rendering (that belongs to view tests).
 *   - Persistence adapter internals (that belongs to storage tests).
 *   - Form behaviour (that belongs to Cypress E2E tests).
 *
 * If a test here fails, the correct response is not to change the test.
 * It is to decide whether the code or the contract is right, and to
 * change the other one to match.
 *
 * Runner: Jest.
 * Run:    npm test
 *
 * @module tests/unit/schema
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  FIELDS,
  FIELD_NAMES,
  USER_FIELDS,
  AUTO_FIELDS,
  FORBIDDEN_FIELDS,
  getFieldSpec,
  isSchemaField,
  isForbiddenField,
  isUserField,
  isAutoField,
} from '../../../src/js/store/schema.js';

import {
  validateField,
  validateAllFields,
  formatValidators,
  isMeaningfulText,
  normaliseValue,
} from '../../../src/js/store/validators.js';

import {
  buildTask,
  applyPatch,
  createTaskStore,
} from '../../../src/js/store/taskStore.js';

// `validateTask` lives in its own module (`validate.js`), because it is
// the *content* validator shared by the store's create/update paths and
// the initializer's load path. It is not re-exported from `taskStore.js`
// — the store imports it, it does not own it. The import below reads
// the symbol from its home.
import { validateTask } from '../../../src/js/store/validate.js';

import {
  StoreError,
  ValidationError,
  NotFoundError,
  StorageError,
} from '../../../src/js/store/errors.js';

/**
 * A known-valid task used as the base for mutation in individual tests.
 * Kept as a factory so each test gets a fresh object; a test that
 * mutates the base cannot affect the next test.
 */
function validTask() {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Survey crater',
    description: 'Check water ice',
    creator: 'Commander',
    assignee: 'Geologist',
    createdAt: '2026-11-03T09:00:00.000Z',
  };
}

/**
 * A minimal set of user fields that will pass validation. The store
 * generates the auto fields.
 */
function validUserInput() {
  return {
    title: 'Deploy rover',
    creator: 'Commander',
    assignee: 'Engineer',
  };
}

/**
 * An in-memory persistence adapter. Every test that needs a store uses
 * this, so no test touches localStorage and no test depends on a browser.
 *
 * `_saved()` returns the last array that was written. A test that wants
 * to assert "persistence was updated" calls `_saved()`. A test that
 * wants to simulate a save failure passes a custom adapter.
 */
function memoryPersistence(initial = []) {
  let saved = initial;
  return {
    load: () => saved,
    save: (tasks) => { saved = tasks; },
    _saved: () => saved,
  };
}

// ---------------------------------------------------------------------------
// Schema shape
// ---------------------------------------------------------------------------

describe('schema contract', () => {
  it('declares exactly the six documented fields', () => {
    expect([...FIELD_NAMES].sort()).toEqual(
      ['assignee', 'createdAt', 'creator', 'description', 'id', 'title']
    );
  });

  it('every field has a type and a serialisation-relevant shape', () => {
    for (const name of FIELD_NAMES) {
      const spec = FIELDS[name];
      expect(spec.type).toBeDefined();
      expect(['string', 'number', 'boolean']).toContain(spec.type);
    }
  });

  it('every field declares its required flag explicitly', () => {
    for (const name of FIELD_NAMES) {
      expect(typeof FIELDS[name].required).toBe('boolean');
    }
  });

  it('every required string field declares a max length', () => {
    for (const name of FIELD_NAMES) {
      const spec = FIELDS[name];
      if (spec.type === 'string' && spec.required) {
        expect(typeof spec.maxLength).toBe('number');
        expect(spec.maxLength).toBeGreaterThan(0);
      }
    }
  });

  it('every format name has a registered validator', () => {
    for (const name of FIELD_NAMES) {
      const { format } = FIELDS[name];
      if (format) {
        expect(typeof formatValidators[format]).toBe('function');
      }
    }
  });

  it('the schema object and every field spec are frozen', () => {
    expect(Object.isFrozen(FIELDS)).toBe(true);
    for (const name of FIELD_NAMES) {
      expect(Object.isFrozen(FIELDS[name])).toBe(true);
    }
  });

  it('field lists partition the schema into user and auto fields', () => {
    expect([...USER_FIELDS, ...AUTO_FIELDS].sort()).toEqual(
      [...FIELD_NAMES].sort()
    );
    const overlap = USER_FIELDS.filter((n) => AUTO_FIELDS.includes(n));
    expect(overlap).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Declared-absent fields
// ---------------------------------------------------------------------------

describe('declared-absent fields', () => {
  it('forbidden fields are genuinely not in the schema', () => {
    for (const forbidden of FORBIDDEN_FIELDS) {
      expect(FIELD_NAMES).not.toContain(forbidden);
    }
  });

  it('forbidden list is non-empty (declared-absent is a decision, not an empty set)', () => {
    expect(FORBIDDEN_FIELDS.length).toBeGreaterThan(0);
  });

  it('forbidden list contains the fields docs/schema.md names', () => {
    expect([...FORBIDDEN_FIELDS].sort()).toEqual(
      [
        'attachments', 'completed', 'done', 'dueDate', 'order',
        'position', 'priority', 'status', 'tags', 'updatedAt',
      ].sort()
    );
  });
});

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

describe('schema helpers', () => {
  it('getFieldSpec returns the spec for a known field', () => {
    expect(getFieldSpec('title')).toBe(FIELDS.title);
  });

  it('getFieldSpec returns undefined for an unknown field', () => {
    expect(getFieldSpec('nope')).toBeUndefined();
  });

  it('getFieldSpec does not return inherited Object.prototype members', () => {
    expect(getFieldSpec('hasOwnProperty')).toBeUndefined();
    expect(getFieldSpec('constructor')).toBeUndefined();
  });

  it('isSchemaField distinguishes known from unknown fields', () => {
    expect(isSchemaField('title')).toBe(true);
    expect(isSchemaField('nope')).toBe(false);
  });

  it('isForbiddenField recognises the declared-absent list', () => {
    expect(isForbiddenField('status')).toBe(true);
    expect(isForbiddenField('title')).toBe(false);
  });

  it('isUserField and isAutoField are mutually exclusive', () => {
    for (const name of FIELD_NAMES) {
      expect(isUserField(name) !== isAutoField(name)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// validateField
// ---------------------------------------------------------------------------

describe('validateField', () => {
  const stringSpec = {
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 10,
    trim: true,
  };

  it('accepts a valid string', () => {
    expect(validateField('title', 'hello', stringSpec)).toBeNull();
  });

  it('rejects a non-string', () => {
    expect(validateField('title', 42, stringSpec)).toMatch(/text/);
    expect(validateField('title', null, stringSpec)).toMatch(/text/);
    expect(validateField('title', {}, stringSpec)).toMatch(/text/);
  });

  it('rejects an empty required string', () => {
    expect(validateField('title', '', stringSpec)).toMatch(/required/);
  });

  it('rejects a whitespace-only required string', () => {
    expect(validateField('title', '   ', stringSpec)).toMatch(/required/);
  });

  it('rejects a string over the maximum length', () => {
    expect(validateField('title', 'x'.repeat(11), stringSpec)).toMatch(/at most 10/);
  });

  it('accepts an empty optional field', () => {
    const optional = { type: 'string', required: false, maxLength: 10 };
    expect(validateField('description', '', optional)).toBeNull();
  });

  it('does not enforce minLength on an empty optional field', () => {
    const optional = { type: 'string', required: false, minLength: 5 };
    expect(validateField('description', '', optional)).toBeNull();
  });

  it('rejects an unknown format declaration', () => {
    const withUnknownFormat = { type: 'string', required: true, format: 'unknown' };
    expect(validateField('field', 'x', withUnknownFormat)).toMatch(/unknown format/);
  });

  it('rejects a missing spec (defensive against store bugs)', () => {
    expect(validateField('title', 'x', undefined)).toMatch(/No schema specification/);
  });
});

// ---------------------------------------------------------------------------
// Format validators
// ---------------------------------------------------------------------------

describe('UUID v4 validator', () => {
  it('accepts a canonical UUID v4', () => {
    const value = '550e8400-e29b-41d4-a716-446655440000';
    expect(validateField('id', value, FIELDS.id)).toBeNull();
  });

  it('rejects a UUID with the wrong version nibble', () => {
    const value = '550e8400-e29b-11d4-a716-446655440000';
    expect(validateField('id', value, FIELDS.id)).toMatch(/UUID v4/);
  });

  it('rejects a UUID with the wrong variant nibble', () => {
    const value = '550e8400-e29b-41d4-0716-446655440000';
    expect(validateField('id', value, FIELDS.id)).toMatch(/UUID v4/);
  });

  it('rejects a non-UUID string', () => {
    expect(validateField('id', 'not-a-uuid', FIELDS.id)).toMatch(/UUID v4/);
  });
});

describe('ISO 8601 validator', () => {
  it('accepts a canonical ISO 8601 timestamp', () => {
    expect(validateField('createdAt', '2026-11-03T09:00:00.000Z', FIELDS.createdAt)).toBeNull();
  });

  it('rejects a human-readable date that Date.parse accepts', () => {
    expect(validateField('createdAt', 'March 5, 2026', FIELDS.createdAt)).toMatch(/ISO 8601/);
  });

  it('rejects an impossible date', () => {
    expect(validateField('createdAt', '2026-13-45T00:00:00.000Z', FIELDS.createdAt)).toMatch(/not a valid date/);
  });

  it('rejects a timestamp with a non-zero offset', () => {
    const offsetTimestamp = '2026-11-03T09:00:00.000+02:00';
    expect(validateField('createdAt', offsetTimestamp, FIELDS.createdAt)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateAllFields
// ---------------------------------------------------------------------------

describe('validateAllFields', () => {
  it('returns valid for a complete valid input', () => {
    const result = validateAllFields(validTask(), FIELD_NAMES, FIELDS);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('reports every missing required field at once, not just the first', () => {
    const result = validateAllFields({}, FIELD_NAMES, FIELDS);
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(
      ['assignee', 'createdAt', 'creator', 'id', 'title']
    );
  });

  it('does not report a missing optional field', () => {
    const { description, ...withoutDescription } = validTask();
    const result = validateAllFields(withoutDescription, FIELD_NAMES, FIELDS);
    expect(result.valid).toBe(true);
    expect(result.errors.description).toBeUndefined();
  });

  it('does not throw on null input', () => {
    expect(() => validateAllFields(null, FIELD_NAMES, FIELDS)).not.toThrow();
  });

  it('does not throw on undefined input', () => {
    expect(() => validateAllFields(undefined, FIELD_NAMES, FIELDS)).not.toThrow();
  });

  it('returns a frozen result object and frozen errors', () => {
    const result = validateAllFields({}, FIELD_NAMES, FIELDS);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.errors)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateTask — imported from `validate.js`
//
// The content validator lives in its own module because two callers
// need it: the store's create/update paths and the initializer's load
// path. This file imports it from its home, not from the store.
// ---------------------------------------------------------------------------

describe('validateTask', () => {
  it('accepts a fully valid task', () => {
    expect(validateTask(validTask()).valid).toBe(true);
  });

  it('rejects a non-object', () => {
    expect(validateTask(null).valid).toBe(false);
    expect(validateTask([]).valid).toBe(false);
    expect(validateTask('string').valid).toBe(false);
  });

  it('rejects a forbidden field with a specific message', () => {
    const result = validateTask({ ...validTask(), status: 'in-progress' });
    expect(result.valid).toBe(false);
    expect(result.errors.status).toMatch(/not part of the task schema/);
  });

  it('rejects an unknown field with a specific message', () => {
    const result = validateTask({ ...validTask(), whatever: 1 });
    expect(result.valid).toBe(false);
    expect(result.errors.whatever).toMatch(/Unknown field/);
  });

  it('rejects every forbidden field in the forbidden list', () => {
    for (const forbidden of FORBIDDEN_FIELDS) {
      const result = validateTask({ ...validTask(), [forbidden]: 'x' });
      expect(result.valid).toBe(false);
    }
  });

  it('rejects a missing required field', () => {
    const { title, ...rest } = validTask();
    const result = validateTask(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.title).toMatch(/required/);
  });

  it('rejects a whitespace-only required field', () => {
    const result = validateTask({ ...validTask(), title: '   ' });
    expect(result.valid).toBe(false);
  });

  it('rejects an over-length title', () => {
    const result = validateTask({ ...validTask(), title: 'x'.repeat(121) });
    expect(result.valid).toBe(false);
  });

  it('accepts an empty optional description', () => {
    const result = validateTask({ ...validTask(), description: '' });
    expect(result.valid).toBe(true);
  });

  it('accepts a missing optional description', () => {
    const { description, ...rest } = validTask();
    expect(validateTask(rest).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildTask — throws ValidationError on invalid input
// ---------------------------------------------------------------------------

describe('buildTask', () => {
  it('returns a task with generated id and createdAt', () => {
    const task = buildTask(validUserInput());
    expect(task.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(task.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('applies the description default when omitted', () => {
    const task = buildTask(validUserInput());
    expect(task.description).toBe('');
  });

  it('trims user-supplied values before validation', () => {
    const task = buildTask({
      title: '  Deploy rover  ',
      creator: 'Commander',
      assignee: 'Engineer',
    });
    expect(task.title).toBe('Deploy rover');
  });

  it('ignores user-supplied id', () => {
    const task = buildTask({
      ...validUserInput(),
      id: 'attacker-chosen-id',
    });
    expect(task.id).not.toBe('attacker-chosen-id');
  });

  it('ignores user-supplied createdAt', () => {
    const task = buildTask({
      ...validUserInput(),
      createdAt: '1999-01-01T00:00:00.000Z',
    });
    expect(task.createdAt).not.toBe('1999-01-01T00:00:00.000Z');
  });

  it('throws ValidationError for invalid input', () => {
    expect(() => buildTask({ title: '', creator: '', assignee: '' }))
      .toThrow(ValidationError);
  });

  it('throws ValidationError with field messages attached', () => {
    try {
      buildTask({ title: '', creator: '', assignee: '' });
      expect.fail('expected buildTask to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(Object.keys(error.fields).length).toBeGreaterThan(0);
    }
  });

  it('returns a frozen task', () => {
    const task = buildTask(validUserInput());
    expect(Object.isFrozen(task)).toBe(true);
  });

  it('throws ValidationError for a non-object input', () => {
    expect(() => buildTask(null)).toThrow(ValidationError);
    expect(() => buildTask('string')).toThrow(ValidationError);
    expect(() => buildTask([])).toThrow(ValidationError);
  });
});

// ---------------------------------------------------------------------------
// applyPatch — throws ValidationError on invalid patches
// ---------------------------------------------------------------------------

describe('applyPatch', () => {
  it('applies a valid patch', () => {
    const existing = validTask();
    const updated = applyPatch(existing, { title: 'New title' });
    expect(updated.title).toBe('New title');
  });

  it('rejects a patch that contains id or createdAt (auto fields are not patchable)', () => {
    const existing = validTask();
    expect(() => applyPatch(existing, { title: 'New title', id: 'attacker-chosen-id' }))
        .toThrow(ValidationError);
    expect(() => applyPatch(existing, { title: 'New title', createdAt: '1999-01-01T00:00:00.000Z' }))
        .toThrow(ValidationError);
  });

  it('leaves the existing task unchanged when a patch is rejected', () => {
    const existing = validTask();
    try {
        applyPatch(existing, { id: 'attacker-chosen-id' });
    } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.fields.id).toBe('Field "id" cannot be changed.');
    }
    // The `existing` object is frozen; nothing was mutated.
    expect(existing.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(existing.createdAt).toBe('2026-11-03T09:00:00.000Z');
  });

  it('throws ValidationError when the patch makes a required field empty', () => {
    const existing = validTask();
    expect(() => applyPatch(existing, { title: '' })).toThrow(ValidationError);
  });

  it('returns a frozen task', () => {
    const updated = applyPatch(validTask(), { title: 'New title' });
    expect(Object.isFrozen(updated)).toBe(true);
  });

  it('throws ValidationError for a non-object patch', () => {
    expect(() => applyPatch(validTask(), null)).toThrow(ValidationError);
    expect(() => applyPatch(validTask(), 'string')).toThrow(ValidationError);
  });
});

// ---------------------------------------------------------------------------
// createTaskStore — the schema enforcement on untrusted input
// ---------------------------------------------------------------------------

describe('createTaskStore', () => {
  it('starts empty when persistence is empty', () => {
    const store = createTaskStore(memoryPersistence());
    expect(store.getAll()).toEqual([]);
  });

  it('create returns the new task and persists it', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    const task = store.create(validUserInput());
    expect(task.id).toBeDefined();
    expect(store.getAll()).toHaveLength(1);
    expect(persistence._saved()).toHaveLength(1);
  });

  it('create throws ValidationError and leaves the store unchanged', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    expect(() => store.create({ title: '', creator: '', assignee: '' }))
      .toThrow(ValidationError);
    expect(store.getAll()).toEqual([]);
    expect(persistence._saved()).toEqual([]);
  });

  it('update changes the task and persists the change', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    const created = store.create(validUserInput());
    const updated = store.update(created.id, { title: 'New title' });
    expect(updated.title).toBe('New title');
    expect(store.getAll()[0].title).toBe('New title');
    expect(persistence._saved()[0].title).toBe('New title');
  });

  it('update throws NotFoundError for a missing id', () => {
    const store = createTaskStore(memoryPersistence());
    expect(() => store.update('nonexistent', { title: 'x' }))
      .toThrow(NotFoundError);
  });

  it('update throws ValidationError and leaves the store unchanged', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    const created = store.create(validUserInput());
    const before = store.getAll();
    expect(() => store.update(created.id, { title: '' }))
      .toThrow(ValidationError);
    expect(store.getAll()).toEqual(before);
    expect(persistence._saved()).toHaveLength(1);
  });

  it('deleteTask removes the task and persists the change', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    const created = store.create(validUserInput());
    store.deleteTask(created.id);
    expect(store.getAll()).toEqual([]);
    expect(persistence._saved()).toEqual([]);
  });

  it('deleteTask throws NotFoundError for a missing id', () => {
    const store = createTaskStore(memoryPersistence());
    expect(() => store.deleteTask('nonexistent')).toThrow(NotFoundError);
  });

  it('clear removes everything and persists the empty list', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    store.create({ title: 'a', creator: 'a', assignee: 'a' });
    store.create({ title: 'b', creator: 'b', assignee: 'b' });
    store.clear();
    expect(store.getAll()).toEqual([]);
    expect(persistence._saved()).toEqual([]);
  });

  it('getAll returns a copy, not the internal array', () => {
    const store = createTaskStore(memoryPersistence());
    store.create({ title: 'a', creator: 'a', assignee: 'a' });
    const list = store.getAll();
    list.push({ id: 'fake' });
    expect(store.getAll()).toHaveLength(1);
  });

  it('getById returns the task or undefined', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validUserInput());
    expect(store.getById(created.id)).toBe(created);
    expect(store.getById('nonexistent')).toBeUndefined();
  });

  it('findBy returns only matching tasks', () => {
    const store = createTaskStore(memoryPersistence());
    store.create({ title: 'Alpha', creator: 'C', assignee: 'A' });
    store.create({ title: 'Beta', creator: 'C', assignee: 'B' });
    const matches = store.findBy((t) => t.assignee === 'A');
    expect(matches).toHaveLength(1);
    expect(matches[0].title).toBe('Alpha');
  });

  it('filters corrupted entries on load instead of crashing', () => {
    // The initializer uses the *content* validator (validateTask),
    // not the shape checker — a record whose `id` is not a UUID is
    // dropped here even though it has the right *shape*.
    const store = createTaskStore(memoryPersistence([
      { id: 'not-a-uuid', title: '' },
      { valid: 'no' },
      validTask(),
    ]));
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0].id).toBe(validTask().id);
  });

  it('starts empty when persistence returns a non-array', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createTaskStore(memoryPersistence({ not: 'an array' }));
    expect(store.getAll()).toEqual([]);
    spy.mockRestore();
  });

  it('throws StorageError when persistence.load throws', () => {
    expect(() => createTaskStore({
      load: () => { throw new Error('ReadError'); },
      save: () => {},
    })).toThrow(StorageError);
  });

  it('rolls back and throws StorageError when persistence.save throws on create', () => {
    const store = createTaskStore({
      load: () => [],
      save: () => { throw new Error('QuotaExceededError'); },
    });
    expect(() => store.create(validUserInput())).toThrow(StorageError);
    expect(store.getAll()).toEqual([]);
  });

  it('rolls back and throws StorageError when persistence.save throws on clear', () => {
    const seed = [validTask()];
    let saved = seed;
    const store = createTaskStore({
      load: () => seed,
      save: () => { throw new Error('QuotaExceededError'); },
    });
    expect(() => store.clear()).toThrow(StorageError);
    expect(store.getAll()).toHaveLength(1);
  });

  it('StorageError carries the operation name', () => {
    const store = createTaskStore({
      load: () => [],
      save: () => { throw new Error('boom'); },
    });
    try {
      store.create(validUserInput());
      expect.fail('expected create to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(StorageError);
      expect(error.operation).toBe('save');
    }
  });
});

// ---------------------------------------------------------------------------
// Error taxonomy — asserts the contract card promises
// ---------------------------------------------------------------------------

describe('error taxonomy', () => {
  it('StoreError is the base class for all store errors', () => {
    expect(new ValidationError({ _: 'x' })).toBeInstanceOf(StoreError);
    expect(new NotFoundError('id')).toBeInstanceOf(StoreError);
    expect(new StorageError('load')).toBeInstanceOf(StoreError);
  });

  it('ValidationError carries a frozen fields object', () => {
    const error = new ValidationError({ title: 'Required.' });
    expect(Object.isFrozen(error.fields)).toBe(true);
    expect(error.fields.title).toBe('Required.');
  });

  it('NotFoundError carries the id', () => {
    const error = new NotFoundError('abc');
    expect(error.id).toBe('abc');
  });

  it('StorageError carries the operation', () => {
    const error = new StorageError('save');
    expect(error.operation).toBe('save');
  });
});

// ---------------------------------------------------------------------------
// Validator helpers
// ---------------------------------------------------------------------------

describe('isMeaningfulText', () => {
  it('returns true for non-empty strings', () => {
    expect(isMeaningfulText('hello')).toBe(true);
    expect(isMeaningfulText('  hello  ')).toBe(true);
  });

  it('returns false for empty or whitespace-only strings', () => {
    expect(isMeaningfulText('')).toBe(false);
    expect(isMeaningfulText('   ')).toBe(false);
  });

  it('returns false for non-strings', () => {
    expect(isMeaningfulText(null)).toBe(false);
    expect(isMeaningfulText(42)).toBe(false);
  });
});

describe('normaliseValue', () => {
  it('trims when the spec says to trim', () => {
    expect(normaliseValue('  x  ', { trim: true })).toBe('x');
  });

  it('leaves the value unchanged when the spec does not trim', () => {
    expect(normaliseValue('  x  ', { trim: false })).toBe('  x  ');
  });

  it('leaves non-strings unchanged', () => {
    expect(normaliseValue(42, { trim: true })).toBe(42);
  });
});