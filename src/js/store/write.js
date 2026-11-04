/**
 * Storage write — the one place a store mutation is persisted.
 *
 * Why this module exists:
 *   Four store operations (`create`, `update`, `deleteTask`, `clear`)
 *   end with a persistence write. That write has two decisions baked
 *   into it:
 *
 *     1. When does the write happen? (Every mutation, or batched?)
 *     2. What happens when the write fails? (Quota, private browsing,
 *        a full disk — the failure modes all look like "the save
 *        threw.")
 *
 *   Each of those is a decision, not an accident of the code. This
 *   module names the decisions as values, implements them once, and
 *   returns a result the store maps to its own error vocabulary.
 *
 * The two decisions (see `docs/storage-writes.md` for the full
 * reasoning):
 *
 *   - WRITE_ATOMICITY === 'per-mutation'
 *     Every mutating store operation writes immediately. No debounce,
 *     no batch, no flush-on-unload. A user who closes the tab right
 *     after a mutation loses nothing — the write happened during the
 *     mutation. A debounced flush would risk losing the last N
 *     mutations if the tab closed before the timer fired. For this
 *     app's write cost (localStorage.setItem is synchronous and
 *     microseconds), the debounce saves nothing and costs the
 *     write-after-last-mutation guarantee.
 *
 *   - WRITE_FAILURE_OUTCOME === 'silent-logged'
 *     When the write fails, the module logs a warning to the console
 *     and returns `{ ok: false, reason }`. The module does not throw
 *     — the store wraps the result in its own `StorageError` (a
 *     store concern) and rolls back the in-memory state. The
 *     user-visible outcome is "silent, logged," matching the
 *     failure-mode matrix (1.6.1). A future change to show a
 *     notification would change this constant, add a view-layer
 *     component, and update the doc — three visible sites, one
 *     decision.
 *
 * The function is synchronous. The persistence adapter's `save` is
 * synchronous (localStorage.setItem is synchronous; the in-memory
 * adapter used by tests is synchronous). A future adapter with an
 * async save would change this function's signature and its callers
 * — a change to the write policy *and* its consumers, in the same
 * commit.
 *
 * What this module does NOT do:
 *   - It does not roll back. Rollback is a *store* concern: the store
 *     captures `previous` before mutating, and restores on failure.
 *     This module writes and reports; the store rolls back.
 *   - It does not classify the failure in a way that a *user* sees.
 *     The `reason` field ('quota', 'unavailable', 'unknown') is for
 *     the console log; the store's `StorageError` carries the same
 *     cause for the event layer. A future change to show a
 *     user-facing message per reason would extend the *view*, not
 *     this module.
 *   - It does not retry. Retry is a caller's decision (a future
 *     "flush and retry" flow would live in the event layer, not here).
 *     This module does one write; the caller decides what to do with
 *     the result.
 *
 * @module store/write
 */

/**
 * The atomicity decision — when the store writes.
 *
 * @type {'per-mutation'}
 */
export const WRITE_ATOMICITY = 'per-mutation';

/**
 * The failure-outcome decision — what the user sees when a write fails.
 *
 * @type {'silent-logged'}
 */
export const WRITE_FAILURE_OUTCOME = 'silent-logged';

/**
 * Classify a persistence failure into one of the three categories the
 * store cares about.
 *
 * The three categories and their meaning:
 *
 *   - 'quota'       — the storage is full (localStorage: QuotaExceededError;
 *                     other adapters: an equivalent "no space" error).
 *                     The user's data may be recoverable if they free
 *                     space; the store's rollback preserves the
 *                     in-memory state so a retry is possible after the
 *                     user clears something.
 *
 *   - 'unavailable' — the storage is not available at all (private
 *                     browsing with storage blocked; a browser that
 *                     has disabled localStorage; an adapter that threw
 *                     a "not available" error). The user cannot save
 *                     anything; the store's rollback keeps the app
 *                     usable in-memory for the session.
 *
 *   - 'unknown'     — some other failure (a bug in the adapter; a
 *                     programming error). This is the least-informative
 *                     category; the store still rolls back and the
 *                     console still logs, but the *developer* is the
 *                     audience (a bug in the adapter is the developer's
 *                     problem).
 *
 * The classification is *best-effort*: the persistence adapter may
 * throw a `DOMException` named `QuotaExceededError` (the standard
 * quota error), a generic `Error` with a message like "quota
 * exceeded" (some browsers), or something else entirely. The
 * classification tries the DOMException name first, then the message,
 * then falls back to 'unknown'. A future adapter with its own error
 * type would extend this classifier, in the same commit that added the
 * adapter.
 *
 * @param {unknown} error
 * @returns {'quota' | 'unavailable' | 'unknown'}
 */
function classifyFailure(error) {
  if (error === null || error === undefined) {
    return 'unknown';
  }

  // The standard quota error is a DOMException named QuotaExceededError.
  // Some browsers throw a DOMException named "NS_ERROR_DOM_QUOTA_REACHED"
  // (older Firefox); we check both names.
  const name = typeof error.name === 'string' ? error.name : '';
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return 'quota';
  }

  // Some environments throw a generic Error with "quota" in the
  // message. We check the message as a secondary signal, so a
  // plain-Error quota throw is still classified correctly.
  const message = typeof error.message === 'string' ? error.message : '';
  if (/quota|storage/i.test(message) && /exceed|full|limit/i.test(message)) {
    return 'quota';
  }

  // Some environments throw a DOMException when storage is entirely
  // unavailable (a private-mode browser that has storage disabled; a
  // security policy that has blocked localStorage). The name varies
  // by browser; the common names are "SecurityError" (a policy
  // block) and "InvalidStateError" (a Chrome private-mode block).
  if (name === 'SecurityError' || name === 'InvalidStateError') {
    return 'unavailable';
  }

  return 'unknown';
}

/**
 * Write the current task list to persistence, or report the failure.
 *
 * @param {{ save: (tasks: ReadonlyArray<object>) => void }} persistence
 * @param {ReadonlyArray<object>} tasks
 * @returns {{ ok: true } | { ok: false, reason: 'quota' | 'unavailable' | 'unknown', cause: unknown }}
 *
 * The function is *total*: it returns a result for every input. A
 * failed write is not a thrown error — the caller (the store) decides
 * what to throw. This is the same shape the store's `initializeStore`
 * used for the read side: a result-returning function makes the
 * decision to throw a *caller* decision, not a *function* decision.
 *
 * The `try`/`catch` is the atomicity's foundation. If `save` throws,
 * the caller knows nothing was persisted *for this call* — the
 * persistence adapter either completed the write (returning normally)
 * or threw before completing it. Either way, the in-memory state and
 * the persisted state are in agreement about *what this write
 * attempted*; a subsequent rollback (by the store) restores the
 * in-memory state to its prior value, and the persisted state is
 * unchanged. The two states agree because they were both at the prior
 * value when the write started.
 *
 * `JSON.stringify` is *not* called here — the persistence adapter
 * owns serialization. This module calls `save(tasks)`; the adapter
 * calls `JSON.stringify` internally. The split is deliberate: this
 * module is about *the write attempt* (did `save` throw?), not about
 * *the serialization* (which is the adapter's concern). A future
 * adapter that used a different serialization (binary, compressed,
 * encrypted) would not touch this module.
 *
 * A future change to a *debounced* write policy would move this
 * function's call site from "inside every mutating operation" to
 * "inside a debounced scheduler"; the function itself — one write,
 * one try/catch, one result — would be unchanged. The function is
 * the *unit* of write; the atomicity policy is the *arrangement* of
 * units. This module provides the unit.
 */
export function writeToStorage(persistence, tasks) {
  try {
    persistence.save(tasks);
    return { ok: true };
  } catch (error) {
    const reason = classifyFailure(error);

    // The user-visible outcome is 'silent-logged': the console is the
    // developer's channel. The log names the reason (quota /
    // unavailable / unknown) and the *count* of tasks affected — a
    // count is enough for a developer to know whether the failure
    // happened on an empty store (a first save) or a populated one
    // (a save that would have lost data if the rollback had not
    // run). The log does not name the *task contents*: a task's
    // contents may contain user data, and logging them would leak
    // that data to the console — the same reasoning the initialize
    // module applies to its own warning.
    //
    // If a future change to WRITE_FAILURE_OUTCOME wanted a
    // user-facing message, this branch would *also* push the result
    // onto a report the event layer can display. Today the log is
    // the only side effect, and the return value carries the rest.
    console.warn(
      `Task store: save failed (${reason}). ` +
        `${tasks.length} task${tasks.length === 1 ? '' : 's'} in memory; ` +
        'the write did not change persisted state. ' +
        'The in-memory state will be rolled back by the caller.',
      error,
    );

    return { ok: false, reason, cause: error };
  }
}