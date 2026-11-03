# Test Fixtures

**Status:** Finalised  
**Date finalised:** 2026-11-03  
**Owner:** QA Engineer  
**Source of truth:** `tests/fixtures/*.json`  
**Related documents:**
- `docs/schema.md` — the field constraints every valid fixture must respect
- `docs/selector-convention.md` — the `data-cy` values the tests use to assert against the fixture-seeded state
- `docs/test-state-reset.md` — the `cy.seedTasks` and `cy.seedCorruptStorage` helpers that write a fixture to `localStorage`
- `docs/event-catalog.md` — the interactions the workflow specs exercise on the fixture-seeded state

---

## Purpose

This document is the reviewable summary of the test fixtures. Every
fixture is **an answer to a question from a specification** — a case
a workflow spec, a security spec, or a character-encoding spec named.
A fixture without a source is a fixture nobody asked for. A
specification case without a fixture is a case the suite cannot
test.

The fixtures are JSON because the tests are Cypress and Cypress's
`cy.fixture()` loads JSON. The data is the shape the app accepts; the
test seeds it with `cy.seedTasks` or `cy.seedCorruptStorage`, then
asserts on the rendered state.

The document is organized as:
1. **The format decision** (JSON, and why).
2. **The fixture inventory** — one row per file, with its source.
3. **The case-to-fixture mapping** — one row per upstream case, with
   the fixture that covers it.
4. **The constraint check** — how the fixture test proves the values
   respect the schema.
5. **The non-duplication check** — how the fixture set avoids
   duplicating shapes.

---

## Format decision: JSON

**Decision: fixtures are JSON files.**

| Option | Pros | Cons |
|---|---|---|
| **JSON** | Loaded by `cy.fixture()` with no build step; visible in a diff; editable by a non-developer. | No types; a typo in a field name is a runtime failure. |
| **JS modules** | IDE-friendly (types, autocomplete); a function can build fixtures programmatically. | Requires Babel for the E2E project; `cy.fixture` does not load JS modules; a non-developer cannot edit a `.js` file safely. |

**Why JSON:** the fixtures are *data*, not behaviour. A JS module
would let a fixture be a function (`makeTasks(3)`), but a function is
a behaviour, and the fixtures are meant to be the *states* a test
starts from, not a generator of those states. The `cy.seedTasks`
helper writes data; the fixture is the data. JSON is the honest type.

**The trade-off:** a typo in a field name (`assigne` instead of
`assignee`) is a runtime failure. The fixture test
(`tests/unit/node/fixtures.test.js`) catches it by validating every
fixture through the app's validator. A fixture that fails validation
fails the test, and the failure names the field.

**The constraint that makes JSON safe:** a fixture that is the app's
shape is validated by the app's validator. A fixture that is
*deliberately invalid* (the `invalid-empty.json` and
`invalid-whitespace.json` cases) must fail validation — and the test
asserts that too. The two together are the contract: valid fixtures
pass, invalid fixtures fail, and the inventory table says which is
which.

---

## The fixture inventory

| File | Shapes | Source of the cases | What it covers |
|---|---|---|---|
| `tasks.json` | `emptyList`, `singleTask`, `threeTasks`, `invalidTasks.{notAnArray, notJson, arrayWithOneInvalidEntry}` | Workflow specs (7.10.2, 8.8.2, 9.7.2, 10.9.2, 11.8.2); persistence-recovery spec (6.6.1) | The baseline shapes every workflow spec starts from, plus the three corrupted-storage states the recovery tests start from. |
| `valid-minimal.json` | `minimalValidTask` | Create workflow (7.10.2) — the valid-minimal case | Every required field at its minimum length; the optional field at its default (`""`). |
| `valid-max.json` | `maxValidTask` | Create workflow (7.10.2) — the valid-max case | Every field at its maximum (`title` 120, `description` 2000, `creator` 80, `assignee` 80). |
| `valid-unicode.json` | `unicodeTasks.{accentedLatin, emoji, rightToLeft, mixedScripts}` | Character-encoding spec (8.6.1) — the Unicode round-trip cases | Accented Latin, emoji (including ZWJ sequences), RTL Arabic, and mixed scripts. Every field within its length limits. |
| `invalid-empty.json` | `allRequiredEmpty`, `onlyTitleEmpty`, `onlyCreatorEmpty`, `onlyAssigneeEmpty` | Create workflow (7.10.2) — the invalid-empty case | Every required field empty; then each required field empty on its own. The optional description is empty in every shape (and is valid). |
| `invalid-whitespace.json` | `allRequiredWhitespace`, `onlyTitleWhitespace`, `onlyCreatorWhitespace`, `onlyAssigneeWhitespace`, `mixedWhitespace` | Create workflow (7.10.2) — the invalid-whitespace case | Whitespace-only required fields, using spaces, tabs, and newlines to prove the trim rule. |
| `xss-vectors.json` | `vectors.{X1_script_tag ... X8_style_expression}` | Security spec (8.4.2) — the eight XSS vectors | Eight distinct injection contexts: script tag, image error, SVG load, iframe URL, anchor URL, body load, div mouseover, CSS expression. |
| `long-text.json` | `title.{nearMax, exactlyMax, maxPlusOne}`, `description_field.{nearMax, exactlyMax, maxPlusOne}` | Character-encoding spec (8.6.1) — the length-boundary cases | Near-max (one below), exactly-max (at the limit), max-plus-one (one above). The first two are valid; the third is invalid. |
| `special-chars.json` | `quoteVariants.{singleQuote, doubleQuote, mixedQuotes}`, `backslashAndSlash`, `ampersandAndMarkup`, `backticksAndTemplateSyntax`, `controlCharacters`, `unicodeLineSeparators`, `selectorHostile` | Character-encoding spec (8.6.1) — the special-character cases | Quotes, backslashes, forward slashes, ampersands, angle brackets, backticks, newlines, tabs, carriage returns, U+2028/U+2029, and selector-hostile characters. Every task is valid. |

**Nine fixtures, one per upstream case group.** The `tasks.json`
fixture is the baseline; the other eight are the enumerated cases.
The count matches the upstream specifications: one baseline plus one
per rule (minimal, maximal, unicode, empty, whitespace, xss, length,
special characters).

---

## The case-to-fixture mapping

Each upstream case is covered by exactly one fixture. The table is the
traceability record.

| Upstream spec | Case | Fixture | Shape |
|---|---|---|---|
| 7.10.2 | valid-minimal | `valid-minimal.json` | `minimalValidTask` |
| 7.10.2 | valid-max | `valid-max.json` | `maxValidTask` |
| 7.10.2 | invalid-empty | `invalid-empty.json` | `allRequiredEmpty`, `only*Empty` |
| 7.10.2 | invalid-whitespace | `invalid-whitespace.json` | `allRequiredWhitespace`, `only*Whitespace`, `mixedWhitespace` |
| 8.6.1 | long text (near-max, exactly-max, max+1) | `long-text.json` | `title.*`, `description_field.*` |
| 8.6.1 | emoji | `valid-unicode.json` | `unicodeTasks.emoji` |
| 8.6.1 | RTL | `valid-unicode.json` | `unicodeTasks.rightToLeft` |
| 8.6.1 | accented Latin | `valid-unicode.json` | `unicodeTasks.accentedLatin` |
| 8.6.1 | mixed scripts | `valid-unicode.json` | `unicodeTasks.mixedScripts` |
| 8.6.1 | special characters | `special-chars.json` | nine named shapes |
| 8.4.2 | X1 — script tag | `xss-vectors.json` | `vectors.X1_script_tag` |
| 8.4.2 | X2 — img onerror | `xss-vectors.json` | `vectors.X2_img_onerror` |
| 8.4.2 | X3 — svg onload | `xss-vectors.json` | `vectors.X3_svg_onload` |
| 8.4.2 | X4 — iframe javascript: | `xss-vectors.json` | `vectors.X4_iframe_javascript` |
| 8.4.2 | X5 — anchor javascript: | `xss-vectors.json` | `vectors.X5_a_javascript` |
| 8.4.2 | X6 — body onload | `xss-vectors.json` | `vectors.X6_body_onload` |
| 8.4.2 | X7 — div onmouseover | `xss-vectors.json` | `vectors.X7_div_onmouseover` |
| 8.4.2 | X8 — style expression | `xss-vectors.json` | `vectors.X8_style_expression` |
| 11.4.1 | unicode (full set) | `valid-unicode.json` | `unicodeTasks.*` |
| 1.3.1 | field constraints | every valid fixture | asserted by `fixtures.test.js` |
| 6.1.1 | baseline shapes | `tasks.json` | `emptyList`, `singleTask`, `threeTasks` |
| 6.6.1 | corrupted storage (P-03, P-04, P-05) | `tasks.json` | `invalidTasks.{notJson, notAnArray, arrayWithOneInvalidEntry}` |

**Every upstream case has a fixture. Every fixture has a source.**
A future case that is not in this table is a case the suite cannot
test; a fixture that is not in this table is a fixture nobody asked
for. The table is the contract.

---

## The constraint check

Every valid fixture must satisfy the schema's field constraints. The
schema (from `docs/schema.md`) is:

| Field | Type | Required | Min | Max |
|---|---|---|---|---|
| `id` | string (UUID v4) | yes | 36 | 36 |
| `title` | string | yes | 1 | 120 |
| `description` | string | no | 0 | 2000 |
| `creator` | string | yes | 1 | 80 |
| `assignee` | string | yes | 1 | 80 |
| `createdAt` | string (ISO 8601) | yes | 24 | 24 |

**How the fixture test enforces it:**

- **Valid fixtures** — every task in `tasks.json`'s `singleTask` and
  `threeTasks`, every task in `valid-minimal.json`, `valid-max.json`,
  `valid-unicode.json`, `special-chars.json` — are passed through the
  app's `validateTask`. The test asserts `result.valid === true`.
- **Invalid fixtures** — every task in `invalid-empty.json` and
  `invalid-whitespace.json`, and every invalid entry in
  `tasks.json`'s `invalidTasks.arrayWithOneInvalidEntry` — are passed
  through `validateTask`. The test asserts `result.valid === false`,
  and asserts *which fields* failed (so a fixture that failed for the
  wrong reason is caught).
- **Length boundary fixtures** — `long-text.json`'s `nearMax` and
  `exactlyMax` values are asserted to be *at most* the field's max
  length (so a typo in the fixture — a 121-character "near-max" — is
  caught); `maxPlusOne` is asserted to be *exactly* the max plus one.
- **Unicode length check** — `valid-unicode.json`'s values are
  measured in **code points** (via `[...value].length`), not UTF-16
  code units, so an emoji that is one visible character but two code
  units does not falsely appear to exceed the limit. The app's
  validator uses `String.length` (code units), so the fixture test
  also asserts that no value is within the limit in code points but
  over the limit in code units — a property that catches an emoji
  fixture that would be rejected by the app for the wrong reason.

**The constraint check is the fixture's most important property.** A
fixture that claims to be valid but fails the validator would be a
fixture whose test asserts "the app handles this task" when the app
actually rejects it. The fixture test catches that before the workflow
spec does.

---

## The non-duplication check

The fixture set must not duplicate a shape. The rules:

1. **No two files define the same shape with the same values.** If
   two fixtures need "a task with all fields at their minimum," one
   of them should reference the other's shape, not copy it.
2. **The baseline shape is defined once.** `tasks.json`'s
   `singleTask` is the canonical "one valid task." The enumerated
   fixtures (`valid-minimal.json`, `valid-max.json`, etc.) add shapes
   for specific rules; they do not redefine the baseline.
3. **The invalid shapes are distinct.** `invalid-empty.json` tests
   empty strings; `invalid-whitespace.json` tests whitespace-only
   strings. The bytes differ; the shapes differ.
4. **The unicode and special-chars fixtures do not overlap.**
   `valid-unicode.json` tests characters that must render correctly
   (accents, emoji, RTL). `special-chars.json` tests characters that
   would break a selector or a JSON round-trip (quotes, backslashes,
   control characters). The emoji in `valid-unicode.json` are
   astral-plane characters; the special characters in
   `special-chars.json` are in the ASCII or BMP ranges. The split is
   the rule the fixtures test, not the character they contain.

**How the fixture test enforces it:** the test does not grep for
duplicate values (JSON values can legitimately repeat across
fixtures — e.g., a valid `title` may appear in `singleTask` and in a
workflow-specific shape). The test asserts that each fixture file
contains at least one shape that is *unique to it* — a shape that no
other fixture contains. The uniqueness is checked by comparing the
fixture's shapes to the union of all other fixtures' shapes; a
fixture whose every shape is a duplicate of another fixture's shape
fails the test.

**The non-duplication rule is what makes a fixture set a set.** Nine
files that each contain "a valid task" would be nine files that test
the same thing. Nine files that each contain a distinct case are a
set that covers the space.

---

## How the fixtures are used

A workflow spec loads a baseline shape:

```javascript
cy.fixture('tasks.json').then((fixture) => {
  cy.seedTasks(fixture.threeTasks);
});
cy.get('[data-cy="task-card"]').should('have.length', 3);
```

A rule-specific spec loads an enumerated shape:

```javascript
cy.fixture('valid-unicode.json').then((fixture) => {
  cy.seedTasks([fixture.unicodeTasks.emoji]);
});
cy.get('[data-cy="task-card-title"]').should('contain', '🚀');
```

A security spec loads an XSS vector:

```javascript
cy.fixture('xss-vectors.json').then((fixture) => {
  cy.seedTasks([{
    ...validTask(),
    title: fixture.vectors.X1_script_tag.payload,
  }]);
});
cy.get('[data-cy="task-card-title"]').should('have.text', '<script>alert(\'X1\')</script>');
```

A recovery spec loads a corrupted shape:

```javascript
cy.fixture('tasks.json').then((fixture) => {
  cy.seedCorruptStorage(fixture.invalidTasks.notJson);
});
cy.get('[data-cy="task-empty-no-tasks"]').should('be.visible');
```

**The consistent pattern:** `cy.fixture(...).then(fixture => ...)`,
then either `cy.seedTasks(array)` or `cy.seedCorruptStorage(string)`,
then a `cy.get(...).should(...)` assertion. The fixture is the input;
the helper writes it; the spec asserts. The three steps are visible
in every test.

---

## Acceptance check

- [x] Every upstream case from 7.10.2, 8.6.1, 8.4.2, 11.4.1 is
      covered by a fixture
- [x] Every fixture has a source in the inventory table
- [x] Every valid fixture passes the app's `validateTask`
- [x] Every invalid fixture fails the app's `validateTask` for the
      expected fields
- [x] The length-boundary fixture's `nearMax` and `exactlyMax` values
      are at most the field's limit; `maxPlusOne` is exactly one over
- [x] The unicode fixture's values are within the limit measured in
      code points, not code units
- [x] No fixture duplicates another fixture's entire shape set
- [x] The XSS fixture's eight vectors are distinct
- [x] The special-chars fixture's nine shapes are distinct
- [x] The `tasks.json` corrupted shapes map to P-03, P-04, P-05 in
      `docs/persistence-mapping.md`

---

## Change protocol

When a fixture is added, renamed, or removed, all of the following
change together:

1. **The file in `tests/fixtures/`.**
2. **This document's inventory table** — the row for the file.
3. **This document's case-to-fixture mapping** — the row for the
   upstream case.
4. **`tests/unit/node/fixtures.test.js`** — the assertion that the
   new fixture is well-shaped and its shapes are not duplicates.
5. **The workflow or rule-specific spec** that loads the fixture —
   the `cy.fixture('<name>.json')` call.
6. **The commit message** — a note naming the upstream case and the
   fixture that covers it.

The fixture test is the enforcement: a fixture that is not in the
inventory table is a fixture the test does not validate; a fixture
that is in the table but not in the directory is a fixture the test
cannot find. The two together keep the fixture set and the document
in step.

**Why the protocol matters:** a fixture is a promise that the data is
what a test expects. A fixture that is renamed without updating the
spec that loads it is a spec that fails with "fixture not found" —
a clear error, but a detour. A fixture that is added without updating
the inventory table is a fixture that a reviewer cannot audit — a
silent addition to the test data. The protocol makes both visible.

---

## See also

- `docs/schema.md` — the field constraints the valid fixtures respect.
- `docs/selector-convention.md` — the `data-cy` values the tests use
  to assert on the fixture-seeded state.
- `docs/test-state-reset.md` — the `cy.seedTasks` and
  `cy.seedCorruptStorage` helpers.
- `docs/persistence-mapping.md` — the recovery branches the
  `tasks.json` corrupted shapes exercise (P-03, P-04, P-05).
- `docs/event-catalog.md` — the interactions the workflow specs
  exercise on the fixture-seeded state.
- `tests/fixtures/*.json` — the fixtures.

