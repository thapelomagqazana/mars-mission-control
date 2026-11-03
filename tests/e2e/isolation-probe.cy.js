/**
 * Isolation probe — proves that tests start from a known state.
 *
 * What this spec is:
 *   A minimal, honest proof that the global `beforeEach` and the
 *   `cy.seedTasks` helper produce a deterministic starting state.
 *   Two tests: one seeds a single task and asserts the single task;
 *   the other seeds three tasks and asserts three tasks. Each test
 *   asserts *only its own seed* — it never asserts the absence of
 *   the other's seed, because the absence is what the global reset
 *   proves, and asserting it here would be a different test.
 *
 * Why this spec exists:
 *   Test isolation is the single most-common defect in a shipped
 *   Cypress suite. A spec that passes when run alone and fails when
 *   run as part of the suite is a spec that depends on a previous
 *   test's state; the failure is confusing because the spec's own
 *   assertions are correct. The probe catches the defect at its
 *   source: if the two tests in this file pass individually and as
 *   a suite, the global reset works.
 *
 * How to verify the probe:
 *   1. Run the whole file: both tests pass.
 *   2. Run only the first test: it passes.
 *   3. Run only the second test: it passes.
 *
 *   Three identical outcomes. A failure in any of the three is a
 *   state leak the global `beforeEach` did not reset.
 *
 * Data-cy selectors used:
 *   task-card, task-card-title, task-empty-no-tasks. All three are in
 *   `docs/selector-convention.md`; the probe does not introduce a new
 *   selector.
 *
 * What this spec deliberately does not do:
 *   - Test any behaviour other than the reset and the seed. The
 *     isolation probe's job is to be minimal; a probe with five
 *     assertions is a probe whose failure could be a probe defect,
 *     not a state leak.
 *   - Seed via a custom command that does not exist. The probe uses
 *     `cy.seedTasks` — the same helper every workflow spec uses — so
 *     the probe exercises the code the specs exercise.
 *   - Assert the absence of the *other* test's seed. That assertion
 *     would couple the two tests; the probe's value is that the two
 *     tests are independent.
 *
 * Runner: Cypress.
 * Run:    npm run test:e2e -- --spec tests/e2e/isolation-probe.cy.js
 *
 * @module tests/e2e/isolation-probe
 */

describe('Isolation probe', () => {
  /**
   * Test 1: seed a single task, see exactly one task.
   *
   * The single-task seed is the simplest possible state: one card,
   * one title. The assertion checks the count (so the global reset
   * is proven: no tasks from a previous test) and the title (so the
   * seed is proven: the task is the one the seed wrote).
   */
  it('seeds a single task and sees exactly one task', () => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.singleTask);
    });

    cy.get('[data-cy="task-card"]').should('have.length', 1);
    cy.get('[data-cy="task-card-title"]').should('have.text', 'Survey crater');
  });

  /**
   * Test 2: seed three tasks, see exactly three tasks.
   *
   * The three-task seed is a different state, chosen so the two
   * tests cannot accidentally pass by seeing the same state. If the
   * global reset failed and test 1's seed leaked into test 2, the
   * count would be four (three from the seed plus one from the
   * leak), and the `have.length, 3` assertion would fail.
   *
   * The test does not assert the titles of the three tasks — that
   * would be a read-tasks assertion, not an isolation assertion. The
   * count is enough to prove the seed is the state the test sees.
   */
  it('seeds three tasks and sees exactly three tasks', () => {
    cy.fixture('tasks.json').then((fixture) => {
      cy.seedTasks(fixture.threeTasks);
    });

    cy.get('[data-cy="task-card"]').should('have.length', 3);
  });
});