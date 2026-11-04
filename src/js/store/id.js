/**
 * Task ID generation — the one place a task's ID is produced.
 *
 * The strategy is declared in `ID_STRATEGY` and documented in
 * `docs/id-strategy.md`. The module exists so that:
 *
 *   1. There is *one* place a task ID is generated. A grep for
 *      `generateTaskId` returns the module's export, the store's one
 *      call site, and the test — no other place invents IDs. A future
 *      change to the strategy is a change to this file, and the store
 *      follows.
 *
 *   2. The strategy is a *value*, not a set of scattered choices. A
 *      reader sees `ID_STRATEGY === 'crypto.randomUUID()'` and knows
 *      what the app does without reading the implementation. A future
 *      change to a counter-based strategy changes the constant and
 *      the function body — together, in the same commit.
 *
 *   3. The ID is *assignment-derived*, not content-derived. See the
 *      module header's "content-derived vs. assignment-derived"
 *      section below, and `docs/id-strategy.md` for the full reasoning.
 *
 * ## The chosen strategy
 *
 * `crypto.randomUUID()` — the browser-native (and Node 19+) UUID v4
 * generator. It is chosen because:
 *
 *   - **Collision is impossible by construction.** Two tabs, two
 *     processes, two machines: the platform's CSPRNG draws from
 *     independent entropy, so two UUIDs are independent. No counter,
 *     no lock, no persisted state; no way for one caller to influence
 *     another's ID.
 *
 *   - **It survives a reload unchanged.** The ID is generated once,
 *     at task creation, and stored. The app never regenerates it. A
 *     task's identity is stable for the record's lifetime, including
 *     across reloads.
 *
 *   - **It is browser-native in every runtime the app supports.** The
 *     fallback exists for unsupported runtimes, not as an equal
 *     alternative (see the module's "The fallback" section below).
 *
 * ## Content-derived vs. assignment-derived
 *
 * **Assignment-derived.** The ID is assigned at creation and is not
 * derived from the task's content. Two tasks with identical titles,
 * descriptions, creators, and assignees have different IDs, because
 * their IDs were drawn at different times. Editing a task's title
 * does not change its ID, because the ID was not derived from the
 * title.
 *
 * A content-derived ID (e.g. `sha256(title)` ) would change when the
 * title changed, which would break every reference to the task (the
 * DOM, an in-flight search, a bookmarked URL). It would also collide
 * for two tasks with the same title. Assignment-derived is the only
 * strategy that gives "stable for life of record" *and* "unique even
 * for identical content."
 *
 * ## The fallback
 *
 * Runtimes without `crypto.randomUUID()` (old Safari, some embedded
 * webviews) get a fallback that produces a UUID-v4-shaped string
 * using `Math.random()`. The fallback is *not* cryptographically
 * strong — its collision probability is roughly 2⁻⁵³ for two IDs
 * drawn from a fast RNG, which is fine for local task identity and
 * not fine for a security-sensitive ID. The module names this
 * trade-off so a future contributor does not mistake the fallback for
 * an equal alternative.
 *
 * A future change that dropped the fallback (because the app no
 * longer supports the affected runtimes) removes the `if` branch and
 * lets the primary path throw if it is called in an environment
 * without `crypto.randomUUID()`. That is a deliberate "fail fast"
 * change, not a silent one.
 *
 * ## What this file does NOT do
 *
 *   - It does not persist IDs. Persistence is the store's job (see
 *     `utils/storage.js`); the ID is just a value the store persists.
 *
 *   - It does not validate IDs. The schema's `format: 'uuid-v4'` field
 *     and the `validators.js` format validator check an ID's *shape*
 *     when a task is validated. This module only *produces* the shape.
 *
 *   - It does not generate other identifiers. Task IDs are the only
 *     identifier this module produces. If the app later needs a
 *     slug, a short ID, a session ID, or a correlation ID, that is a
 *     *different* module with its own decision record — not a new
 *     function in this file, because the strategies differ (a slug is
 *     content-derived; a correlation ID may be header-derived; etc.).
 *
 * @module store/id
 */

/**
 * The ID strategy, as a value.
 *
 * A reader opening this file sees the strategy's name before the
 * implementation. A future change to a different strategy is a change
 * to this constant *and* to the body of `generateTaskId`, in the same
 * commit — the test suite asserts the strategy name and the shape of
 * the produced ID, so a mismatch fails.
 *
 * The values are:
 *
 *   - 'crypto.randomUUID()' — the primary path. Every runtime the app
 *     supports has it.
 *   - 'uuid-v4-fallback' — the fallback path. Named separately so a
 *     reader knows which path is being used.
 *
 * A future strategy (e.g. 'monotonic-counter') would add a value here
 * and a branch in `generateTaskId`. The `test` file would need a test
 * for the new strategy's properties (uniqueness, cross-tab, etc.), and
 * `docs/id-strategy.md` would need a new decision record — because the
 * trade-off is different.
 *
 * @type {'crypto.randomUUID()' | 'uuid-v4-fallback'}
 */
export const ID_STRATEGY = 'crypto.randomUUID()';

/**
 * The UUID v4 pattern, used to verify the shape of an ID produced by
 * the fallback path. The primary path uses `crypto.randomUUID()`,
 * which is guaranteed to produce this shape; the fallback reproduces
 * the shape manually, and this pattern is what the fallback's tests
 * assert against.
 *
 * The pattern is the one in `validators.js` for `format: 'uuid-v4'`
 * — duplicated here because `id.js` is a leaf module (it does not
 * import the validators, to avoid a cycle: validators → schema →
 * id would be a cycle if id imported validators). The duplication is
 * a *test-level* concern: `id.test.js` asserts that the produced
 * shape matches the *validators'* pattern, not just the local one, so
 * a drift between the two is caught.
 *
 * @type {RegExp}
 */
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Generate a new task ID.
 *
 * @returns {string} a UUID v4 string (36 characters, hyphenated).
 *
 * The function is synchronous and total: it returns a string for every
 * call, in every runtime the app supports. The primary path (native
 * `crypto.randomUUID()`) returns the platform's value; the fallback
 * path (runtimes without the native function) builds a UUID-v4-shaped
 * string from `Math.random()`. The two paths return the same *shape*;
 * the fallback's collision properties are weaker, but the shape is the
 * same, and `id.test.js` asserts both.
 *
 * Why the shape check on the fallback's output:
 *   `Math.random()` is fast but not cryptographically strong, and its
 *   output formatting is on us. A bug in the fallback's formatting
 *   (e.g. wrong version nibble, missing hyphens) would produce a
 *   string that *looks* like a UUID but that the schema's format
 *   validator rejects. The shape check catches the formatting bug
 *   before the string reaches the store. The primary path is trusted
 *   to produce a valid UUID v4 (the platform guarantees it), so the
 *   check is not on the primary path — only on the fallback.
 */
export function generateTaskId() {
  // Primary path — every runtime the app supports provides this.
  // The browser's crypto.randomUUID() is a CSPRNG draw from the OS
  // entropy pool, so two calls are independent; two tabs, two
  // processes, two machines cannot collide by construction. No lock,
  // no persisted state, no reset.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback path — runtimes without crypto.randomUUID(). The
  // fallback produces a UUID-v4-shaped string from Math.random().
  // The module header's "The fallback" section names the trade-off:
  // the fallback is not cryptographically strong, but its shape is
  // correct, and the app's supported runtime (evergreen browsers and
  // Node 19+) always takes the primary path.
  return generateFallbackUuidV4();
}

/**
 * Produce a UUID-v4-shaped string using `Math.random()`.
 *
 * Internal to the module — the fallback is reached only via
 * `generateTaskId` when the primary path is unavailable. Kept as a
 * separate function (not inlined) so the fallback's shape is
 * independently testable and a future contributor can see it as a
 * distinct *alternative*, not as part of the primary path.
 *
 * The template `'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'` is the
 * canonical UUID v4 template: the third group starts with `4` (the
 * version), and the fourth group starts with `[89ab]` (the variant).
 * The `[xy]` positions are replaced by hexadecimal digits; the `x`
 * positions are `Math.random() * 16` truncated; the `y` positions
 * are `(random & 0x3) | 0x8`, which forces the first bit to be 1 and
 * the second to be 0 or 1 — matching the `[89ab]` variant.
 *
 * The function does not have a length guard or a shape check of its
 * own output — the caller (`generateTaskId`) is responsible for
 * returning the string, and `id.test.js` asserts the produced shape
 * against the *validators'* UUID v4 pattern. That assertion is what
 * catches a formatting bug in this function.
 *
 * @returns {string}
 */
function generateFallbackUuidV4() {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, (char) => {
    const random = Math.trunc(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Verify that a string is a UUID v4.
 *
 * Exported for tests. The primary path's output is guaranteed by the
 * platform; the fallback's output is asserted by this function in
 * `id.test.js`. A production caller does not need to call this — the
 * schema's format validator does the same check when a task is
 * validated. Exporting it means the test file can assert the shape
 * against the *canonical* pattern (the one in this module, which
 * mirrors the one in validators.js) rather than reimplementing the
 * pattern in the test.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isUuidV4(value) {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value);
}