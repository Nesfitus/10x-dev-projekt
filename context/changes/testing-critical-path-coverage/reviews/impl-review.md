<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Critical-Path Test Coverage (Scoring Rule + Match-Lock Timing)

- **Plan**: context/changes/testing-critical-path-coverage/plan.md
- **Scope**: Full plan (Phase 1-3 of 3)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations (all 4 triaged: F1 fixed, F2 fixed, F3 fixed + recorded as lesson, F4 fixed)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Orphaned test user if sign-in fails after creation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/integration/helpers/test-user.ts:15-24
- **Detail**: `createTestUser` calls `adminClient.auth.admin.createUser(...)` then `anonClient.auth.signInWithPassword(...)`. If sign-in fails (transient network error, rate limit, etc.) after the user was already created, the function throws without rolling back the just-created `auth.users` row. Since the caller's `userId` variable is only assigned on successful return, `afterAll`'s `deleteTestUser(adminClient, userId)` never runs either — the orphaned test account (`test-*@example.test`) is left permanently in the shared, remote Supabase project. This is exactly the kind of leftover the plan's cleanup discipline (Phase 2 manual check 2.3, Phase 3 manual check 3.3) was designed to prevent, but only covers the happy path.
- **Fix**: Wrap the sign-in call in try/catch; on failure, `await adminClient.auth.admin.deleteUser(created.user.id)` before re-throwing the original error.
  - Strength: Keeps the "zero leftover test data" guarantee intact even under transient failures, matching the plan's stated cleanup goal.
  - Tradeoff: A few extra lines; a rollback-of-a-rollback edge case (delete itself failing) is still possible but is now a much smaller residual window.
  - Confidence: HIGH — straightforward compensating-action pattern.
  - Blind spot: Doesn't cover a process crash between createUser and the try/catch being entered (unavoidable without external reconciliation tooling).
- **Decision**: FIXED (rollback via `adminClient.auth.admin.deleteUser` on sign-in failure)

### F2 — Missing `userId` guard in `afterAll` teardown

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/integration/helpers/harness.smoke.test.ts:14-16, tests/integration/prediction-lock.test.ts:47-49
- **Detail**: Both integration test files declare `let userId: string;` and assign it inside `beforeAll`. If `beforeAll` throws before the assignment (e.g., `createTestUser` itself fails), `afterAll` still runs and calls `deleteTestUser(adminClient, userId)` with `userId` as `undefined`, producing a confusing secondary error that can mask the real setup failure in the test output.
- **Fix**: Guard the teardown: `if (userId) { await deleteTestUser(adminClient, userId); }`.
- **Decision**: FIXED (guard added in both files)

### F3 — Mock doesn't assert `createClient` is called with real headers/cookies

- **Severity**: OBSERVATION
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/prediction-lock.test.ts:13-18
- **Detail**: The plan's Critical Implementation Details explicitly scope this mock to swap only the Astro-specific cookie/SSR transport, keeping the rest of the endpoint real — this is by design, not an oversight. Noting it for future readers: because the mock ignores whatever arguments `predictions.ts` passes to `createClient(...)`, this test suite would not catch a regression where the endpoint stopped passing `context.request.headers`/`context.cookies` correctly (e.g. an accidental `createClient(undefined, cookies)`). That specific wiring is trivial enough today to be covered by TypeScript's parameter typing, but it's worth knowing this test's blind spot if `predictions.ts`'s auth wiring ever gets more complex.
- **Fix**: No action required now; if `@/lib/supabase`'s `createClient` call site logic grows more complex, consider asserting on the mock's received arguments at that point.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Mockowanie transportu w testach integracyjnych nie weryfikuje samego wiring'u (mock now asserts `headers instanceof Headers` and `cookies.set` is a function; lesson recorded in `context/foundation/lessons.md`)

### F4 — Generic error on missing active tournament conflates two failure causes

- **Severity**: OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: tests/integration/helpers/tournament-fixtures.ts:12-20
- **Detail**: `getActiveTournamentId` throws the same "brak aktywnego turnieju" message whether the actual cause is "no active tournament exists" or a real Supabase/network error surfaced via `error`. This is low-value today (single-purpose test helper, small team) but could slow down debugging a genuine outage.
- **Fix**: Include `error.message` in the thrown error when `error` is present, distinct from the "no active tournament" case.
- **Decision**: FIXED (error message now includes `error.message`)

## Notes (non-findings)

- **`tournament-fixtures.ts` deviates from the plan's original contract** (create-your-own-tournament) by attaching fixtures to the pre-existing active tournament instead — this was a deliberate, surfaced-and-approved adaptation during Phase 2 implementation (the plan's contract would have violated the `tournaments_one_active_idx` unique index against the shared remote project's real active tournament). Verified: the file contains no `insert`/`update`/`delete` against the `tournaments` table, only a `select`. Treated as approved adaptation, not drift.
- **`tests/integration/helpers/harness.smoke.test.ts` was not named in Phase 2's "Changes Required" list** but is required by Phase 2's own success criterion 2.2 ("`npm run test:integration` przechodzi dla testu dymnego harnessu"). Treated as an implied, justified addition.
- **`context/foundation/test-plan.md` landed in the Phase 1 commit** alongside this change's own artifacts — an explicit, interactively-approved staging choice during the Phase 1 commit ritual (user picked "Stage all" when asked about this unrelated dirty path), not an oversight.
