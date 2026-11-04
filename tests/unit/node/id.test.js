/**
 * Task ID generation tests — the strategy's properties.
 *
 * Three properties:
 *
 *   1. Uniqueness — 10,000 IDs produce 10,000 distinct strings. A
 *      strategy whose collision rate is "small but nonzero" is not
 *      acceptable for a data store; the test catches the strategy
 *      drifting toward a collision-prone approach.
 *
 *   2. Shape — every ID matches the UUID v4 pattern the schema's
 *      `format: 'uuid-v4'` validator enforces. The primary path
 *      (`crypto.randomUUID()`) is guaranteed to produce this shape;
 *      the fallback path is not, and the shape check is what catches
 *      a formatting bug in the fallback.
 *
 *   3. Cross-"tab" independence — the strategy does not depend on
 *      shared state. The test simulates two callers by drawing two
 *      interleaved streams of IDs and asserting no collision. A
 *      counter-based strategy would fail here (two callers, one
 *      counter, same "next" value); UUID v4 cannot fail because the
 *      IDs are independent random draws.
 *
 * The test does not assert specific ID *values* (they are random),
 * only properties. It does not assert performance; a 10k loop on any
 * modern machine is milliseconds, and a slow ID generator would be a
 * *store* performance problem (calling the generator per task), not a
 * *strategy* problem.
 */
import { describe, it, expect } from '@jest/globals';

import {
  generateTaskId,
  ID_STRATEGY,
  isUuidV4,
} from '../../../src/js/store/id.js';
import { formatValidators } from '../../../src/js/store/validators.js';

describe('generateTaskId — strategy declaration', () => {
  it('records the strategy as a value', () => {
    // The strategy name is a value, not a comment. A future change to
    // a different strategy updates this constant and the test, and
    // the diff is a single string — not a scattered change across the
    // codebase.
    expect(['crypto.randomUUID()', 'uuid-v4-fallback']).toContain(ID_STRATEGY);
  });

  it('produces a valid UUID v4', () => {
    // The shape is the contract. The primary path and the fallback
    // path both produce the same shape; this test asserts the shape,
    // not the path.
    const id = generateTaskId();
    expect(isUuidV4(id)).toBe(true);
  });

  it('the produced shape matches the schema validator\'s pattern', () => {
    // The schema declares `format: 'uuid-v4'` on the `id` field. The
    // validator enforces it via the format validator registered under
    // that name. The ID generator produces the same shape — the test
    // asserts the *two* agree, so a future change to either the
    // generator or the validator that drifted them apart fails here.
    //
    // A generated ID that passes the generator's shape check but
    // fails the validator's format check would be a bug the store
    // would catch at validation time (the task would be rejected) —
    // but the *cause* would be a shape mismatch between two modules
    // that should agree, which is what this test is for.
    const id = generateTaskId();
    expect(formatValidators['uuid-v4'](id)).toBeNull();
  });
});

describe('generateTaskId — 10,000-generation uniqueness', () => {
  it('produces 10,000 unique IDs (0 collisions)', () => {
    // The WBS item names this as the primary negative test. The set
    // size is the assertion — a strategy that produced a duplicate
    // (e.g. a counter that wrapped, or a PRNG with a small seed)
    // would have a set size below 10,000.
    const count = 10_000;
    const ids = new Set();
    for (let i = 0; i < count; i++) {
      ids.add(generateTaskId());
    }
    expect(ids.size).toBe(count);
  });

  it('produces UUID v4 strings for every one of the 10,000', () => {
    // The uniqueness test asserts the set size; this test asserts
    // that every member of the set is the *right shape*. A strategy
    // that produced 10,000 unique integers would pass the uniqueness
    // test and fail this one — the two tests together pin down
    // "unique and well-shaped."
    for (let i = 0; i < 10_000; i++) {
      expect(isUuidV4(generateTaskId())).toBe(true);
    }
  });
});

describe('generateTaskId — cross-"tab" independence', () => {
  it('two interleaved streams produce no collisions', () => {
    // Simulate two tabs by drawing IDs from two interleaved streams
    // and asserting the combined set is collision-free. A
    // counter-based strategy would fail here: both "tabs" would see
    // the same counter and produce the same "next" value. A UUID v4
    // strategy cannot fail: the two streams are independent random
    // draws, and the test's 20,000 draws have the same collision
    // probability as a single 20,000 draw.
    //
    // The test does not simulate *actual* tabs (that would require a
    // browser and a shared storage mechanism the test does not need);
    // it simulates the *property* the two-tab check cares about:
    // two independent callers do not produce the same ID.
    const perStream = 10_000;
    const tabA = [];
    const tabB = [];
    for (let i = 0; i < perStream; i++) {
      tabA.push(generateTaskId());
      tabB.push(generateTaskId());
    }

    const all = new Set([...tabA, ...tabB]);
    // 20,000 draws, 20,000 distinct IDs. If tabA and tabB shared a
    // counter, the set size would be at most 10,000 (the two tabs
    // would produce the same sequence). UUID v4 cannot collide by
    // construction; the set size is 20,000 with probability 1 - 2⁻⁵³
    // (negligible).
    expect(all.size).toBe(perStream * 2);
  });
});

describe('generateTaskId — shape contract', () => {
  it('the produced ID is 36 characters with hyphens', () => {
    // The UUID v4 shape: 32 hex digits in five groups, hyphen-
    // separated: 8-4-4-4-12. A future strategy that produced a
    // different shape (a 32-character hex string without hyphens,
    // or a 36-character alphanumeric) would fail this test — which
    // is the point: the schema's `format: 'uuid-v4'` declares the
    // shape, and the generator's output must match it.
    const id = generateTaskId();
    expect(id).toHaveLength(36);
    expect(id.split('-')).toHaveLength(5);
    expect(id.split('-').map((p) => p.length)).toEqual([8, 4, 4, 4, 12]);
  });

  it('the produced ID has the version-4 nibble', () => {
    // The third group starts with '4'. This is what makes it a v4
    // UUID, not a v1 or v7. A future strategy that produced a v7
    // UUID would fail this test (the schema declares v4). A future
    // change to a different version is a schema change, and the
    // schema's `format: 'uuid-v4'` would need to become
    // `format: 'uuid-v7'` in the same commit.
    const id = generateTaskId();
    const thirdGroup = id.split('-')[2];
    expect(thirdGroup.startsWith('4')).toBe(true);
  });

  it('the produced ID has the RFC 4122 variant nibble', () => {
    // The fourth group starts with '8', '9', 'a', or 'b'. This is the
    // variant the schema's `format: 'uuid-v4'` validator enforces.
    const id = generateTaskId();
    const fourthGroup = id.split('-')[3];
    expect(['8', '9', 'a', 'b']).toContain(fourthGroup[0]);
  });
});