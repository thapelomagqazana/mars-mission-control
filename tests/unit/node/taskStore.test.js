/**
 * Task store contract tests.
 *
 * Purpose:
 *   Every contract card in `docs/store-contract.md` becomes a test group
 *   here. If a card promises a behaviour and the store does not deliver
 *   it, one of these tests fails. If the store gains a behaviour that no
 *   card describes, that is a contract update, and the test suite is
 *   where the update becomes visible.
 *
 * Scope:
 *   - Every operation in the contract has a card, and every card has a
 *     test group here.
 *   - Every promise in a card is asserted at least once.
 *   - Every thrown error is asserted with `toThrow(ErrorClass)` so the
 *     type, not the message, is the check.
 *   - Every invariant (frozen tasks, copy-on-return, rollback on failure,
 *     atomicity) is asserted.
 *
 * What these tests deliberately do not cover:
 *   - Field-level validation rules — those belong to `schema.test.js`.
 *     The store tests use valid input unless they are testing that the
 *     store *rejects* invalid input.
 *   - Persistence adapter internals — the store never imports
 *     `localStorage`, and these tests never touch it either.
 *   - DOM rendering — that belongs to view tests.
 *   - Form behaviour — that belongs to Cypress E2E tests.
 *
 * Runner: Jest.
 * Run:    npm test
 *
 * @module tests/unit/taskStore
 */

import { describe, it, expect, jest } from '@jest/globals';

import { createTaskStore } from '../../../src/js/store/taskStore.js';
import {
  StoreError,
  ValidationError,
  NotFoundError,
  StorageError,
} from '../../../src/js/store/errors.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A minimal set of user fields that will pass validation. The store
 * generates id and createdAt.
 */
function validUserInput(overrides = {}) {
  return {
    title: 'Deploy rover',
    creator: 'Commander',
    assignee: 'Engineer',
    ...overrides,
  };
}

/**
 * A complete, valid task. Used where a test needs a persisted task
 * without going through `create` first.
 */
function validStoredTask(overrides = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Survey crater',
    description: 'Check water ice',
    creator: 'Commander',
    assignee: 'Geologist',
    createdAt: '2026-11-03T09:00:00.000Z',
    ...overrides,
  };
}

/**
 * An in-memory persistence adapter.
 *
 * `_saved()` returns the current persisted array. `_setSaved()` lets a
 * test simulate "someone else wrote to storage" (e.g. another tab).
 * `_failOn()` lets a test simulate a storage failure on the next call
 * to `load` or `save`.
 */
function memoryPersistence(initial = []) {
  let saved = initial;
  const failures = { load: null, save: null };

  return {
    load: () => {
      if (failures.load) {
        const error = failures.load;
        failures.load = null;
        throw error;
      }
      return saved;
    },
    save: (tasks) => {
      if (failures.save) {
        const error = failures.save;
        failures.save = null;
        throw error;
      }
      saved = tasks;
    },
    _saved: () => saved,
    _setSaved: (tasks) => { saved = tasks; },
    _failOn: (operation, error) => { failures[operation] = error; },
  };
}

// ---------------------------------------------------------------------------
// Card 1 — getAll()
// ---------------------------------------------------------------------------

describe('getAll', () => {
  it('returns an empty array when the store starts empty', () => {
    const store = createTaskStore(memoryPersistence());
    expect(store.getAll()).toEqual([]);
  });

  it('returns every task in the store', () => {
    const store = createTaskStore(memoryPersistence());
    store.create(validUserInput({ title: 'A' }));
    store.create(validUserInput({ title: 'B' }));
    expect(store.getAll()).toHaveLength(2);
  });

  it('returns a new array each call, not the internal array', () => {
    const store = createTaskStore(memoryPersistence());
    store.create(validUserInput());

    const first = store.getAll();
    const second = store.getAll();

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it('a caller mutating the returned array does not affect the store', () => {
    const store = createTaskStore(memoryPersistence());
    store.create(validUserInput());

    const list = store.getAll();
    list.push({ id: 'fake' });
    list.length = 0;

    expect(store.getAll()).toHaveLength(1);
  });

  it('returns frozen tasks', () => {
    const store = createTaskStore(memoryPersistence());
    store.create(validUserInput());

    const [task] = store.getAll();
    expect(Object.isFrozen(task)).toBe(true);
  });

  it('mutating a returned task does not affect the store', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validUserInput({ title: 'Original' }));

    const [task] = store.getAll();
    expect(() => { task.title = 'Tampered'; }).toThrow();

    expect(store.getById(created.id).title).toBe('Original');
  });

  it('does not mutate persistence', () => {
    const persistence = memoryPersistence([validStoredTask()]);
    const spy = jest.spyOn(persistence, 'save');
    const store = createTaskStore(persistence);
    store.getAll();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Card 2 — getById(id)
// ---------------------------------------------------------------------------

describe('getById', () => {
  it('returns the task when it exists', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validUserInput());
    expect(store.getById(created.id)).toBe(created);
  });

  it('returns undefined when the task does not exist', () => {
    const store = createTaskStore(memoryPersistence());
    expect(store.getById('nonexistent')).toBeUndefined();
  });

  it('returns undefined when the store is empty', () => {
    const store = createTaskStore(memoryPersistence());
    expect(store.getById('any-id')).toBeUndefined();
  });

  it('does not throw for a missing task (query, not mutation)', () => {
    const store = createTaskStore(memoryPersistence());
    expect(() => store.getById('nonexistent')).not.toThrow();
  });

  it('does not mutate persistence', () => {
    const persistence = memoryPersistence([validStoredTask()]);
    const spy = jest.spyOn(persistence, 'save');
    const store = createTaskStore(persistence);
    store.getById(validStoredTask().id);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Card 3 — create(userInput)
// ---------------------------------------------------------------------------

describe('create', () => {
  it('returns the new task with generated id and createdAt', () => {
    const store = createTaskStore(memoryPersistence());
    const task = store.create(validUserInput());

    expect(task.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(task.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('appends the task to the store', () => {
    const store = createTaskStore(memoryPersistence());
    const task = store.create(validUserInput());
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0]).toBe(task);
  });

  it('persists the new task', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    const task = store.create(validUserInput());
    expect(persistence._saved()).toHaveLength(1);
    expect(persistence._saved()[0]).toBe(task);
  });

  it('returns the same object that is stored (identity, not equality)', () => {
    const store = createTaskStore(memoryPersistence());
    const task = store.create(validUserInput());
    expect(store.getById(task.id)).toBe(task);
  });

  it('returns a frozen task', () => {
    const store = createTaskStore(memoryPersistence());
    const task = store.create(validUserInput());
    expect(Object.isFrozen(task)).toBe(true);
  });

  it('rejects a caller-supplied id', () => {
    const store = createTaskStore(memoryPersistence());
    const task = store.create(validUserInput({ id: 'attacker-chosen-id' }));
    expect(task.id).not.toBe('attacker-chosen-id');
  });

  it('rejects a caller-supplied createdAt', () => {
    const store = createTaskStore(memoryPersistence());
    const task = store.create(
      validUserInput({ createdAt: '1999-01-01T00:00:00.000Z' })
    );
    expect(task.createdAt).not.toBe('1999-01-01T00:00:00.000Z');
  });

  it('throws ValidationError for invalid input', () => {
    const store = createTaskStore(memoryPersistence());
    expect(() => store.create({ title: '', creator: '', assignee: '' }))
      .toThrow(ValidationError);
  });

  it('throws ValidationError with field messages for invalid input', () => {
    const store = createTaskStore(memoryPersistence());
    try {
      store.create({ title: '', creator: '', assignee: '' });
      expect.fail('expected create to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.fields.title).toMatch(/required/i);
      expect(Object.isFrozen(error.fields)).toBe(true);
    }
  });

  it('does not modify the store when validation fails', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    expect(() => store.create({ title: '', creator: '', assignee: '' }))
      .toThrow(ValidationError);
    expect(store.getAll()).toEqual([]);
    expect(persistence._saved()).toEqual([]);
  });

  it('throws StorageError and rolls back when persistence fails', () => {
    const persistence = memoryPersistence();
    persistence._failOn('save', new Error('QuotaExceededError'));
    const store = createTaskStore(persistence);

    expect(() => store.create(validUserInput())).toThrow(StorageError);
    expect(store.getAll()).toEqual([]);
    expect(persistence._saved()).toEqual([]);
  });

  it('StorageError from create carries operation "save"', () => {
    const persistence = memoryPersistence();
    persistence._failOn('save', new Error('boom'));
    const store = createTaskStore(persistence);

    try {
      store.create(validUserInput());
      expect.fail('expected create to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(StorageError);
      expect(error.operation).toBe('save');
      expect(error.cause).toBeInstanceOf(Error);
    }
  });
});

// ---------------------------------------------------------------------------
// Card 4 — update(id, patch)
// ---------------------------------------------------------------------------

describe('update', () => {
  it('applies the patch and returns the updated task', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validUserInput({ title: 'Old title' }));
    const updated = store.update(created.id, { title: 'New title' });

    expect(updated.title).toBe('New title');
    expect(updated.id).toBe(created.id);
  });

  it('persists the updated task', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    const created = store.create(validUserInput({ title: 'Old title' }));
    store.update(created.id, { title: 'New title' });

    expect(persistence._saved()[0].title).toBe('New title');
  });

  it('preserves fields that are not in the patch', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(
      validUserInput({ creator: 'Commander', assignee: 'Geologist' })
    );
    const updated = store.update(created.id, { title: 'New title' });

    expect(updated.creator).toBe('Commander');
    expect(updated.assignee).toBe('Geologist');
  });

  it('rejects a patch that contains id or createdAt', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validUserInput());

    try {
        store.update(created.id, { id: 'attacker-chosen-id' });
        expect.fail('expected update to throw');
    } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.fields.id).toBe('Field "id" cannot be changed.');
    }

    try {
        store.update(created.id, { createdAt: '1999-01-01T00:00:00.000Z' });
        expect.fail('expected update to throw');
    } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.fields.createdAt).toBe('Field "createdAt" cannot be changed.');
    }

    // The store is unchanged.
    expect(store.getById(created.id).id).toBe(created.id);
    expect(store.getById(created.id).createdAt).toBe(created.createdAt);
  });

  it('returns a frozen task', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validUserInput());
    const updated = store.update(created.id, { title: 'New title' });
    expect(Object.isFrozen(updated)).toBe(true);
  });

  it('throws NotFoundError for a missing id', () => {
    const store = createTaskStore(memoryPersistence());
    expect(() => store.update('nonexistent', { title: 'x' }))
      .toThrow(NotFoundError);
  });

  it('NotFoundError carries the id that was not found', () => {
    const store = createTaskStore(memoryPersistence());
    try {
      store.update('missing-id', { title: 'x' });
      expect.fail('expected update to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.id).toBe('missing-id');
    }
  });

  it('throws ValidationError when the patch makes a required field empty', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validUserInput({ title: 'Original' }));
    expect(() => store.update(created.id, { title: '' }))
      .toThrow(ValidationError);
  });

  it('does not modify the store when validation fails', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    const created = store.create(validUserInput({ title: 'Original' }));

    expect(() => store.update(created.id, { title: '' }))
      .toThrow(ValidationError);

    expect(store.getById(created.id).title).toBe('Original');
    expect(persistence._saved()[0].title).toBe('Original');
  });

  it('throws StorageError and rolls back when persistence fails', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    const created = store.create(validUserInput({ title: 'Original' }));

    persistence._failOn('save', new Error('QuotaExceededError'));
    expect(() => store.update(created.id, { title: 'New title' }))
      .toThrow(StorageError);

    expect(store.getById(created.id).title).toBe('Original');
    expect(persistence._saved()[0].title).toBe('Original');
  });
});

// ---------------------------------------------------------------------------
// Card 5 — deleteTask(id)
// ---------------------------------------------------------------------------

describe('deleteTask', () => {
  it('removes the task from the store', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validUserInput());
    store.deleteTask(created.id);
    expect(store.getAll()).toEqual([]);
  });

  it('persists the removal', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    const created = store.create(validUserInput());
    store.deleteTask(created.id);
    expect(persistence._saved()).toEqual([]);
  });

  it('removes only the targeted task', () => {
    const store = createTaskStore(memoryPersistence());
    const a = store.create(validUserInput({ title: 'A' }));
    store.create(validUserInput({ title: 'B' }));

    store.deleteTask(a.id);

    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0].title).toBe('B');
  });

  it('returns void on success', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validUserInput());
    expect(store.deleteTask(created.id)).toBeUndefined();
  });

  it('throws NotFoundError for a missing id', () => {
    const store = createTaskStore(memoryPersistence());
    expect(() => store.deleteTask('nonexistent')).toThrow(NotFoundError);
  });

  it('does not modify the store when the id is missing', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    const created = store.create(validUserInput());
    const before = store.getAll();

    expect(() => store.deleteTask('nonexistent')).toThrow(NotFoundError);

    expect(store.getAll()).toEqual(before);
    expect(persistence._saved()).toHaveLength(1);
  });

  it('throws StorageError and rolls back when persistence fails', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    const created = store.create(validUserInput());

    persistence._failOn('save', new Error('QuotaExceededError'));
    expect(() => store.deleteTask(created.id)).toThrow(StorageError);

    expect(store.getAll()).toHaveLength(1);
    expect(store.getById(created.id)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Card 6 — clear()
// ---------------------------------------------------------------------------

describe('clear', () => {
  it('removes every task', () => {
    const store = createTaskStore(memoryPersistence());
    store.create(validUserInput({ title: 'A' }));
    store.create(validUserInput({ title: 'B' }));
    store.clear();
    expect(store.getAll()).toEqual([]);
  });

  it('persists the empty list', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    store.create(validUserInput());
    store.clear();
    expect(persistence._saved()).toEqual([]);
  });

  it('is a no-op on an empty store (does not throw)', () => {
    const store = createTaskStore(memoryPersistence());
    expect(() => store.clear()).not.toThrow();
    expect(store.getAll()).toEqual([]);
  });

  it('returns void', () => {
    const store = createTaskStore(memoryPersistence());
    expect(store.clear()).toBeUndefined();
  });

  it('throws StorageError and rolls back when persistence fails', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    store.create(validUserInput({ title: 'A' }));
    store.create(validUserInput({ title: 'B' }));

    persistence._failOn('save', new Error('QuotaExceededError'));
    expect(() => store.clear()).toThrow(StorageError);

    expect(store.getAll()).toHaveLength(2);
  });

  it('StorageError from clear carries operation "clear"', () => {
    const persistence = memoryPersistence();
    const store = createTaskStore(persistence);
    store.create(validUserInput());

    persistence._failOn('save', new Error('boom'));
    try {
      store.clear();
      expect.fail('expected clear to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(StorageError);
      expect(error.operation).toBe('clear');
    }
  });
});

// ---------------------------------------------------------------------------
// Card 7 — findBy(predicate)
// ---------------------------------------------------------------------------

describe('findBy', () => {
  it('returns only matching tasks', () => {
    const store = createTaskStore(memoryPersistence());
    store.create(validUserInput({ title: 'Alpha', assignee: 'Geologist' }));
    store.create(validUserInput({ title: 'Beta', assignee: 'Engineer' }));
    store.create(validUserInput({ title: 'Gamma', assignee: 'Geologist' }));

    const matches = store.findBy((task) => task.assignee === 'Geologist');

    expect(matches).toHaveLength(2);
    expect(matches.map((t) => t.title).sort()).toEqual(['Alpha', 'Gamma']);
  });

  it('returns an empty array when nothing matches', () => {
    const store = createTaskStore(memoryPersistence());
    store.create(validUserInput());
    expect(store.findBy(() => false)).toEqual([]);
  });

  it('returns a new array, not the internal array', () => {
    const store = createTaskStore(memoryPersistence());
    store.create(validUserInput());
    const matches = store.findBy(() => true);
    matches.push({ id: 'fake' });
    expect(store.findBy(() => true)).toHaveLength(1);
  });

  it('returns frozen tasks', () => {
    const store = createTaskStore(memoryPersistence());
    store.create(validUserInput());
    const [task] = store.findBy(() => true);
    expect(Object.isFrozen(task)).toBe(true);
  });

  it('does not mutate persistence', () => {
    const persistence = memoryPersistence([validStoredTask()]);
    const spy = jest.spyOn(persistence, 'save');
    const store = createTaskStore(persistence);
    store.findBy(() => true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Constructor — load, recover, throw
// ---------------------------------------------------------------------------

describe('store construction', () => {
  it('loads persisted tasks on construction', () => {
    const persisted = [validStoredTask({ title: 'From storage' })];
    const store = createTaskStore(memoryPersistence(persisted));
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0].title).toBe('From storage');
  });

  it('filters out entries that fail validation on load', () => {
    const persisted = [
      validStoredTask({ id: 'not-a-uuid' }),
      { not: 'a task' },
      validStoredTask(),
    ];
    const store = createTaskStore(memoryPersistence(persisted));
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0].id).toBe(validStoredTask().id);
  });

  it('starts empty when persistence returns a non-array', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createTaskStore(memoryPersistence({ not: 'an array' }));
    expect(store.getAll()).toEqual([]);
    spy.mockRestore();
  });

  it('throws StorageError when load throws', () => {
    const persistence = memoryPersistence();
    persistence._failOn('load', new Error('ReadError'));
    expect(() => createTaskStore(persistence)).toThrow(StorageError);
  });

  it('StorageError from load carries operation "load" and the cause', () => {
    const persistence = memoryPersistence();
    persistence._failOn('load', new Error('ReadError'));
    try {
      createTaskStore(persistence);
      expect.fail('expected construction to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(StorageError);
      expect(error.operation).toBe('load');
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.cause.message).toBe('ReadError');
    }
  });
});

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

describe('error taxonomy', () => {
  it('every store error extends StoreError', () => {
    expect(new ValidationError({ _: 'x' })).toBeInstanceOf(StoreError);
    expect(new NotFoundError('id')).toBeInstanceOf(StoreError);
    expect(new StorageError('load')).toBeInstanceOf(StoreError);
  });

  it('every store error extends Error (so existing catch blocks work)', () => {
    expect(new ValidationError({ _: 'x' })).toBeInstanceOf(Error);
    expect(new NotFoundError('id')).toBeInstanceOf(Error);
    expect(new StorageError('load')).toBeInstanceOf(Error);
  });

  it('error names are set to the subclass name', () => {
    expect(new ValidationError({ _: 'x' }).name).toBe('ValidationError');
    expect(new NotFoundError('id').name).toBe('NotFoundError');
    expect(new StorageError('load').name).toBe('StorageError');
  });

  it('ValidationError freezes its fields object', () => {
    const error = new ValidationError({ title: 'Required.' });
    expect(Object.isFrozen(error.fields)).toBe(true);
  });

  it('ValidationError rejects a non-object fields argument', () => {
    expect(() => new ValidationError('not an object')).toThrow(TypeError);
  });

  it('NotFoundError rejects an empty id', () => {
    expect(() => new NotFoundError('')).toThrow(TypeError);
  });

  it('StorageError rejects an unknown operation', () => {
    expect(() => new StorageError('unknown')).toThrow(TypeError);
  });
});