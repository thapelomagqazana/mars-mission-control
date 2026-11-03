/**
 * Validation mapping tests.
 *
 * Purpose:
 *   Each row in `docs/validation-mapping.md` becomes a test here. If a
 *   message string changes in the code without changing in Stage 1, or
 *   if a rule is silently added or removed, one of these tests fails.
 *
 * Why a separate file from `schema.test.js`:
 *   `schema.test.js` tests the *schema shape* and the *validator
 *   functions in isolation*. This file tests the *store's end-to-end
 *   enforcement* of each rule, including the exact message the user
 *   sees. The two files have different scopes; keeping them separate
 *   means a schema change (which might break many schema tests) does
 *   not drown out a message change (which is a different kind of bug).
 *
 * Contract:
 *   `docs/validation-mapping.md` is the reference. If this file and
 *   that document disagree, the document is right and this file is
 *   wrong — but the failing test is the alarm that they disagree.
 *
 * Rule enforcement boundaries:
 *   The mapping table names a "check location" for every rule. Some
 *   rules are enforced on *any* call that reaches validation (V-08,
 *   V-09, V-10) and some are enforced only for the fields the caller
 *   is allowed to change (V-01 through V-07, V-11, V-12). This file
 *   tests each rule through the boundary it is enforced at:
 *
 *   - V-01…V-07: through `store.create` and `store.update`, because the
 *     rule is about a user-facing field.
 *   - V-08, V-09: through `store.create`, because the rule is about
 *     *any* field on the input, not just user fields. A caller who
 *     smuggles in a forbidden field must be rejected, not ignored.
 *   - V-10, V-11, V-12: through `store.create` and `store.update`,
 *     because the rule is about the shape of the whole input.
 *
 * Shape errors abort before field errors:
 *   When the input carries a forbidden or unknown field, the store
 *   throws a `ValidationError` containing *only* the shape errors.
 *   Field-level errors (a missing title, an over-length creator) are
 *   not collected at the same time, because the two have different
 *   audiences: shape errors are developer-facing ("the client used
 *   the wrong API"), field errors are user-facing ("please fill this
 *   in"). Mixing them would send the user to fix a form field when the
 *   real problem is a caller bug. The two "reports X and required
 *   errors together" tests below assert this design deliberately.
 *
 * Runner: Jest.
 * Run:    npm test
 *
 * @module tests/unit/validationMapping
 */

import { describe, it, expect } from '@jest/globals';

import { createTaskStore } from '../../../src/js/store/taskStore.js';
import { ValidationError } from '../../../src/js/store/errors.js';

/**
 * In-memory persistence. Never fails unless a test asks it to.
 */
function memoryPersistence(initial = []) {
  let saved = initial;
  return {
    load: () => saved,
    save: (tasks) => { saved = tasks; },
    _saved: () => saved,
  };
}

/**
 * Build a store and return a function that creates a task with the
 * given user input, returning the task on success or the ValidationError
 * fields on failure.
 */
function setup() {
  const store = createTaskStore(memoryPersistence());
  return {
    store,
    createOrError(userInput) {
      try {
        const task = store.create(userInput);
        return { ok: true, task };
      } catch (error) {
        if (error instanceof ValidationError) {
          return { ok: false, error, fields: error.fields };
        }
        throw error;
      }
    },
  };
}

/**
 * A minimal valid user input. Individual tests override one field at a
 * time, so a failure is unambiguously the rule under test and not
 * incidental to another field.
 */
function validInput(overrides = {}) {
  return {
    title: 'Deploy rover',
    creator: 'Commander',
    assignee: 'Engineer',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// V-01 — Title is required
// ---------------------------------------------------------------------------

describe('V-01 — Title is required', () => {
  it('rejects a missing title with the exact message', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError(validInput({ title: undefined }));
    expect(ok).toBe(false);
    expect(fields.title).toBe('Field "title" is required.');
  });

  it('rejects an empty title', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError(validInput({ title: '' }));
    expect(ok).toBe(false);
    expect(fields.title).toBe('Title is required.');
  });

  it('rejects a whitespace-only title (trim before check)', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError(validInput({ title: '   ' }));
    expect(ok).toBe(false);
    expect(fields.title).toBe('Title is required.');
  });
});

// ---------------------------------------------------------------------------
// V-02 — Title maximum length
// ---------------------------------------------------------------------------

describe('V-02 — Title maximum length', () => {
  it('accepts a title at exactly 120 characters', () => {
    const { createOrError } = setup();
    const { ok } = createOrError(validInput({ title: 'x'.repeat(120) }));
    expect(ok).toBe(true);
  });

  it('rejects a title at 121 characters with the exact message', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError(validInput({ title: 'x'.repeat(121) }));
    expect(ok).toBe(false);
    expect(fields.title).toBe('Title must be at most 120 characters.');
  });

  it('measures the trimmed length, not the raw length', () => {
    // 120 chars of content, wrapped in 10 chars of whitespace on each
    // side: 140 raw, 120 trimmed. Should pass.
    const { createOrError } = setup();
    const { ok } = createOrError(
      validInput({ title: `          ${'x'.repeat(120)}          ` })
    );
    expect(ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// V-03 — Description maximum length
// ---------------------------------------------------------------------------

describe('V-03 — Description maximum length', () => {
  it('accepts an empty description (optional)', () => {
    const { createOrError } = setup();
    const { ok } = createOrError(validInput({ description: '' }));
    expect(ok).toBe(true);
  });

  it('accepts a description at exactly 2000 characters', () => {
    const { createOrError } = setup();
    const { ok } = createOrError(validInput({ description: 'x'.repeat(2000) }));
    expect(ok).toBe(true);
  });

  it('rejects a description at 2001 characters with the exact message', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError(
      validInput({ description: 'x'.repeat(2001) })
    );
    expect(ok).toBe(false);
    expect(fields.description).toBe('Description must be at most 2000 characters.');
  });
});

// ---------------------------------------------------------------------------
// V-04 — Creator is required
// ---------------------------------------------------------------------------

describe('V-04 — Creator is required', () => {
  it('rejects an empty creator with the exact message', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError(validInput({ creator: '' }));
    expect(ok).toBe(false);
    expect(fields.creator).toBe('Creator is required.');
  });

  it('rejects a whitespace-only creator', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError(validInput({ creator: '   ' }));
    expect(ok).toBe(false);
    expect(fields.creator).toBe('Creator is required.');
  });
});

// ---------------------------------------------------------------------------
// V-05 — Creator maximum length
// ---------------------------------------------------------------------------

describe('V-05 — Creator maximum length', () => {
  it('rejects an 81-character creator with the exact message', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError(validInput({ creator: 'x'.repeat(81) }));
    expect(ok).toBe(false);
    expect(fields.creator).toBe('Creator must be at most 80 characters.');
  });
});

// ---------------------------------------------------------------------------
// V-06 — Assignee is required
// ---------------------------------------------------------------------------

describe('V-06 — Assignee is required', () => {
  it('rejects an empty assignee with the exact message', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError(validInput({ assignee: '' }));
    expect(ok).toBe(false);
    expect(fields.assignee).toBe('Assignee is required.');
  });

  it('rejects a whitespace-only assignee', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError(validInput({ assignee: '   ' }));
    expect(ok).toBe(false);
    expect(fields.assignee).toBe('Assignee is required.');
  });
});

// ---------------------------------------------------------------------------
// V-07 — Assignee maximum length
// ---------------------------------------------------------------------------

describe('V-07 — Assignee maximum length', () => {
  it('rejects an 81-character assignee with the exact message', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError(validInput({ assignee: 'x'.repeat(81) }));
    expect(ok).toBe(false);
    expect(fields.assignee).toBe('Assignee must be at most 80 characters.');
  });
});

// ---------------------------------------------------------------------------
// V-08 — Forbidden fields are rejected
// ---------------------------------------------------------------------------

describe('V-08 — Forbidden fields are rejected', () => {
  it('rejects a task carrying a forbidden field with the exact message', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError(validInput({ status: 'in-progress' }));
    expect(ok).toBe(false);
    expect(fields.status).toBe('Field "status" is not part of the task schema.');
  });

  it('rejects every forbidden field with the same message shape', () => {
    const forbidden = [
      'updatedAt', 'status', 'priority', 'dueDate', 'completed',
      'done', 'tags', 'attachments', 'order', 'position',
    ];
    for (const name of forbidden) {
      const { createOrError } = setup();
      const { ok, fields } = createOrError(validInput({ [name]: 'x' }));
      expect(ok).toBe(false);
      expect(fields[name]).toBe(`Field "${name}" is not part of the task schema.`);
    }
  });

  it('a shape error aborts before field errors are collected', () => {
    // When the input carries a forbidden field, the store throws a
    // ValidationError containing *only* the shape errors. Field-level
    // errors (a missing title) are not collected, because the two have
    // different audiences: shape errors are developer-facing, field
    // errors are user-facing. The rejection message must be present;
    // the field error must not be, because the caller is not in a
    // state where a field message would help.
    const { createOrError } = setup();
    const { ok, fields } = createOrError({
      title: '',
      creator: 'Commander',
      assignee: 'Engineer',
      status: 'done',
    });
    expect(ok).toBe(false);
    expect(fields.status).toBe('Field "status" is not part of the task schema.');
    // The title error is NOT included — the shape error aborted the
    // call before validateTask ran.
    expect(fields.title).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// V-09 — Unknown fields are rejected
// ---------------------------------------------------------------------------

describe('V-09 — Unknown fields are rejected', () => {
  it('rejects a task carrying an unknown field with the exact message', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError(validInput({ madeUpField: 'x' }));
    expect(ok).toBe(false);
    expect(fields.madeUpField).toBe('Unknown field "madeUpField".');
  });

  it('rejects a typo in a known field name', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError(validInput({ titel: 'x' }));
    expect(ok).toBe(false);
    expect(fields.titel).toBe('Unknown field "titel".');
  });

  it('a shape error aborts before field errors are collected', () => {
    // Same as V-08: the shape error is the only one reported.
    const { createOrError } = setup();
    const { ok, fields } = createOrError({
      title: '',
      creator: 'Commander',
      assignee: 'Engineer',
      notAField: 'x',
    });
    expect(ok).toBe(false);
    expect(fields.notAField).toBe('Unknown field "notAField".');
    expect(fields.title).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// V-10 — Task must be an object
// ---------------------------------------------------------------------------

describe('V-10 — Task must be an object', () => {
  it('rejects a non-object task with the general error message', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError(null);
    expect(ok).toBe(false);
    expect(fields._).toBe('Task input must be an object.');
  });

  it('rejects an array', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError([]);
    expect(ok).toBe(false);
    expect(fields._).toBe('Task input must be an object.');
  });

  it('rejects a string', () => {
    const { createOrError } = setup();
    const { ok, fields } = createOrError('not a task');
    expect(ok).toBe(false);
    expect(fields._).toBe('Task input must be an object.');
  });
});

// ---------------------------------------------------------------------------
// V-11 — Patch must be an object
// ---------------------------------------------------------------------------

describe('V-11 — Patch must be an object', () => {
  it('rejects a non-object patch with the exact message', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validInput());
    expect(() => store.update(created.id, null)).toThrow(ValidationError);
    try {
      store.update(created.id, null);
    } catch (error) {
      expect(error.fields._).toBe('Task patch must be an object.');
    }
  });

  it('rejects an array patch', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validInput());
    try {
      store.update(created.id, []);
      expect.fail('expected update to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.fields._).toBe('Task patch must be an object.');
    }
  });
});

// ---------------------------------------------------------------------------
// V-12 — Field-level rules apply to patches
// ---------------------------------------------------------------------------

describe('V-12 — Field-level rules apply to patches', () => {
  it('a patch that empties a required field is rejected', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validInput({ title: 'Original' }));
    try {
      store.update(created.id, { title: '' });
      expect.fail('expected update to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.fields.title).toBe('Title is required.');
    }
  });

  it('a patch that adds a forbidden field is rejected', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validInput());
    try {
      store.update(created.id, { status: 'done', title: 'New' });
      expect.fail('expected update to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.fields.status).toBe('Field "status" is not part of the task schema.');
    }
  });

  it('a patch that adds an unknown field is rejected', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validInput());
    try {
      store.update(created.id, { madeUpField: 'x' });
      expect.fail('expected update to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.fields.madeUpField).toBe('Unknown field "madeUpField".');
    }
  });

  it('a patch that changes id is rejected with the specific message', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validInput());
    try {
      store.update(created.id, { id: 'attacker-chosen-id' });
      expect.fail('expected update to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.fields.id).toBe('Field "id" cannot be changed.');
    }
  });

  it('a patch that changes createdAt is rejected with the specific message', () => {
    const store = createTaskStore(memoryPersistence());
    const created = store.create(validInput());
    try {
      store.update(created.id, { createdAt: '1999-01-01T00:00:00.000Z' });
      expect.fail('expected update to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.fields.createdAt).toBe('Field "createdAt" cannot be changed.');
    }
  });
});