/**
 * Store initialization — the four cases of persisted data, and the
 * policies for each.
 *
 * Why this module exists:
 *   The store's first job is to produce the initial state from
 *   whatever `localStorage` has (or does not have). That state
 *   comes in four shapes:
 *
 *     1. Missing key — no value at the key (or `null`).
 *     2. Empty array — the key holds `"[]"`.
 *     3. Valid array — the key holds a JSON array where every record
 *        passes the conformance check.
 *     4. Partially invalid array — the key holds a JSON array where
 *        some records pass and some do not.
 *
 *   Each shape has a different policy: whether to write back, which
 *   records to keep, and what the user sees. Those policies are
 *   *decisions*, not accidents of the code, and this module names them
 *   as values so a reviewer can read the decision and a test can
 *   assert the behaviour.
 *
 * The module's exports — four decisions, one function:
 *
 *   - INIT_WRITE_POLICY ('lazy') — when to write the initial state.
 *     'lazy' means: write on the first mutation, not on load. The
 *     alternative ('immediate') would write an empty array back on a
 *     missing key, which turns a *read* into a *write* and makes the
 *     app's first paint a potential `save` failure. See the policy's
 *     comment below for the full reasoning.
 *
 *   - INIT_CORRUPTION_POLICY ('per-record-filter') — what to do with
 *     a partially invalid array. 'per-record-filter' keeps the valid
 *     records, drops the invalid ones, logs a warning. See the
 *     policy's comment below.
 *
 *   - INIT_EMPTY_INPUT_POLICY ('treat-as-empty') — what to do with a
 *     missing key or an empty array. 'treat-as-empty' means the store
 *     starts with an empty collection. The alternative ('fail') would
 *     crash on a first-run install, which is the opposite of what a
 *     first-run install should do.
 *
 *   - INIT_CORRUPTION_NOTICE ('console-warning') — what the user sees
 *     when the per-record filter drops records. 'console-warning'
 *     means a `console.warn` for the developer. The alternative
 *     ('user-banner') would require the *view layer* to display a
 *     notification, which is a change to a different layer; the store
 *     reports the event, the view decides whether to show it. See the
 *     policy's comment below.
 *
 *   - initializeStore(persistence) — the function that reads from
 *     the persistence adapter, applies the four policies above, and
 *     returns the initial task array.
 *
 * What this module does NOT do:
 *
 *   - It does not write. Persistence writes are the store's job
 *     (per the "lazy" policy, on the first mutation). The module
 *     reads; the store writes.
 *
 *   - It does not throw for a corrupted array. 'per-record-filter'
 *     means a bad record is *dropped*, not a fatal error. A corrupted
 *     array is a normal case (a hand-edited `localStorage`, an
 *     interrupted write that left a partial JSON), not an exceptional
 *     one.
 *
 *   - It does not notify the user directly. The console warning is
 *     for the developer; a user-facing notification is the view's job
 *     (see INIT_CORRUPTION_NOTICE).
 *
 * Why the filter uses `validateTask`, not `conformsToSchema`:
 *   The *shape* checker (`conformsToSchema`) answers "does this object
 *   have the task fields at their declared types?" A record with
 *   `id: 'not-a-uuid'` passes the shape check (a string `id` is a
 *   string), but fails the *content* check (the `format: 'uuid-v4'`
 *   rule rejects a non-UUID string).
 *
 *   Initialization wants the content check, not the shape check. A
 *   record the app cannot *edit* (because the app's update path runs
 *   `validateTask` and would reject the record's non-UUID `id`) is not
 *   the user's data, even though it *looks* like a task. Keeping such
 *   a record would surface the bug later — at the worst possible
 *   moment, when the user tries to edit their task — as "this task
 *   cannot be edited" with no way to recover.
 *
 *   The content validator is the same function the store's create and
 *   update paths run. Running the same check at load means the record
 *   either passes (and the user can edit it) or is dropped (and the
 *   user never sees it). The two paths agree on what "a valid task"
 *   means.
 *
 * @module store/initialize
 */

import { validateTask } from './validate.js';

/**
 * The write-timing policy — when the store writes the initial state.
 *
 * @type {'lazy'}
 */
export const INIT_WRITE_POLICY = 'lazy';

/**
 * The partial-corruption policy — what to do with an array where some
 * records are valid and some are not.
 *
 * @type {'per-record-filter'}
 */
export const INIT_CORRUPTION_POLICY = 'per-record-filter';

/**
 * The empty-input policy — what to do when the key is missing, or
 * holds an empty array.
 *
 * @type {'treat-as-empty'}
 */
export const INIT_EMPTY_INPUT_POLICY = 'treat-as-empty';

/**
 * The corruption-notice policy — what the user sees when the
 * per-record filter drops records.
 *
 * @type {'console-warning'}
 */
export const INIT_CORRUPTION_NOTICE = 'console-warning';

/**
 * The shape of the raw data the adapter returned, before parsing.
 *
 * Used only for the console warning's message. Kept as a small
 * enumeration so a future adapter that returned, say, a `Map` or a
 * typed array would be visible in the warning — rather than the
 * generic "not an array."
 *
 * @param {unknown} raw
 * @returns {'nullish' | 'array' | 'object' | 'primitive' | 'string'}
 */
function describeRaw(raw) {
  if (raw === null || raw === undefined) return 'nullish';
  if (Array.isArray(raw)) return 'array';
  if (typeof raw === 'string') return 'string';
  if (typeof raw === 'object') return 'object';
  return 'primitive';
}

/**
 * Initialize the store from a persistence adapter.
 *
 * @param {{ load: () => any, save: (tasks: ReadonlyArray<object>) => void }} persistence
 * @returns {ReadonlyArray<object>} the initial task list
 * @throws {Error} if the adapter's `load` throws
 *
 * The function reads from the adapter, applies the four policies above,
 * and returns the initial task list. It does *not* write (see
 * INIT_WRITE_POLICY).
 *
 * The four cases, and what the function returns for each:
 *
 *   1. Missing key → returns `[]`.
 *   2. Empty array → returns `[]`.
 *   3. Valid array → returns the array unchanged.
 *   4. Partially invalid array → returns the array with invalid
 *      records removed; logs the drop.
 *
 * A fifth case — the adapter returns something that is not an array
 * (a string, an object, a primitive) — is treated as
 * `INIT_EMPTY_INPUT_POLICY === 'treat-as-empty'` and logs a warning.
 *
 * @throws {Error} if the adapter's `load` throws — the store's
 *   construction cannot proceed. The error is wrapped by the caller
 *   (`createTaskStore`) as a `StorageError` with `operation: 'load'`.
 */
export function initializeStore(persistence) {
  // ---- Step 1: read ------------------------------------------------------
  const raw = persistence.load();

  // ---- Step 2: classify the raw value ------------------------------------
  const rawKind = describeRaw(raw);

  // Case 1 and the fifth case: nullish or non-array.
  if (raw === null || raw === undefined || !Array.isArray(raw)) {
    if (rawKind !== 'nullish') {
      console.warn(
        `Task store: persisted data is not an array (received ${rawKind}); starting empty.`,
      );
    }
    return [];
  }

  // ---- Step 3: apply the partial-corruption policy -----------------------
  if (raw.length === 0) {
    return [];
  }

  // Cases 3 and 4: filter records via the *content* validator.
  //
  // `validateTask` (from `./validate.js`) is the content check — the
  // same function the store runs on create and update. A record that
  // passes here is a record the store can edit; a record that fails
  // here is a record the store would reject on the next edit, which
  // makes it not-the-user's-data even if it *looks* like a task.
  //
  // The shape checker (`conformsToSchema`) would accept a record with
  // `id: 'not-a-uuid'` (a string `id` is a string); the content
  // validator rejects it (the format check). Initialization needs the
  // content answer.
  const valid = [];
  const dropped = [];

  for (const candidate of raw) {
    const result = validateTask(candidate);
    if (result.valid) {
      valid.push(candidate);
    } else {
      dropped.push(candidate);
    }
  }

  // ---- Step 4: log the corruption notice ---------------------------------
  if (dropped.length > 0) {
    console.warn(
      `Task store: ${dropped.length} record${dropped.length === 1 ? '' : 's'} ` +
        `failed the conformance check and ${dropped.length === 1 ? 'was' : 'were'} dropped. ` +
        'The valid records are preserved. ' +
        'To see the dropped records, inspect the persisted value under the store\'s key.',
    );
  }

  return valid;
}