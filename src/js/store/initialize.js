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
 *   The module also handles a fifth shape:
 *     5. Corrupted string — the key holds unparseable JSON.
 *
 * The policies:
 *   - 'lazy' — write on the first mutation, not on load.
 *   - 'per-record-filter' — keep valid records, drop invalid ones.
 *   - 'treat-as-empty' — missing key, empty array, or corrupted JSON
 *     returns an empty store.
 *   - 'console-warning' — report dropped records to the developer.
 *
 * @module store/initialize
 */

import { validateTask } from './validate.js';

/**
 * The write-timing policy — when the store writes the initial state.
 * @type {'lazy'}
 */
export const INIT_WRITE_POLICY = 'lazy';

/**
 * The partial-corruption policy — what to do with an array where some
 * records are valid and some are not.
 * @type {'per-record-filter'}
 */
export const INIT_CORRUPTION_POLICY = 'per-record-filter';

/**
 * The empty-input policy — what to do when the key is missing, holds
 * an empty array, or holds unparseable JSON.
 * @type {'treat-as-empty'}
 */
export const INIT_EMPTY_INPUT_POLICY = 'treat-as-empty';

/**
 * The corruption-notice policy — what the user sees when the
 * per-record filter drops records.
 * @type {'console-warning'}
 */
export const INIT_CORRUPTION_NOTICE = 'console-warning';

/**
 * The shape of the raw data the adapter returned, before parsing.
 * Used only for the console warning's message.
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
 * @throws {Error} if the adapter's `load()` throws. (Corrupted JSON is
 *   handled internally and does not throw).
 */
export function initializeStore(persistence) {
  // ---- Step 1: read ------------------------------------------------------
  // We do NOT wrap this in a try/catch. If the adapter's load() fails,
  // it is a hard error (e.g., ReadError) and the caller (createTaskStore)
  // must handle it.
  const raw = persistence.load();

  // ---- Step 2: parse (if the adapter returned a JSON string) -------------
  let parsed = raw;
  
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    
    // Case 1: Empty string
    if (trimmed === '') {
      return [];
    }
    
    // Case 2: String that looks like JSON (starts with { or [)
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        parsed = JSON.parse(trimmed);
      } catch (error) {
        // P-03: Corrupted JSON. The string claimed to be JSON but
        // failed parsing. Recover to an empty store.
        console.warn(
          'Task store: persisted data is not valid JSON; starting empty.',
          error
        );
        return [];
      }
    } else {
      // Case 3: String that is clearly not JSON (e.g., "garbage").
      // We leave `parsed` as the string so it falls through to the
      // non-array check below, which logs the correct warning.
      parsed = raw;
    }
  }

  // ---- Step 3: classify the parsed value ---------------------------------
  const rawKind = describeRaw(parsed);

  // Case 1 and the fifth case: nullish or non-array.
  if (parsed === null || parsed === undefined || !Array.isArray(parsed)) {
    if (rawKind !== 'nullish') {
      console.warn(
        `Task store: persisted data is not an array (received ${rawKind}); starting empty.`,
      );
    }
    return [];
  }

  // ---- Step 4: apply the partial-corruption policy -----------------------
  if (parsed.length === 0) {
    return [];
  }

  // Cases 3 and 4: filter records via the *content* validator.
  const valid = [];
  const dropped = [];

  for (const candidate of parsed) {
    const result = validateTask(candidate);
    if (result.valid) {
      valid.push(candidate);
    } else {
      dropped.push(candidate);
    }
  }

  // ---- Step 5: log the corruption notice ---------------------------------
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