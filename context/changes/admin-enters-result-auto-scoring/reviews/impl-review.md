<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Admin wprowadza wynik, system automatycznie nalicza punkty

- **Plan**: context/changes/admin-enters-result-auto-scoring/plan.md
- **Scope**: Phase 1 of 3 (full plan — all phases complete)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Notes:
- All 4 changed/new files match their plan contracts exactly, **including the in-plan-documented deviation** (upsert → per-row `update`, discovered live during manual testing when the RLS-INSERT gap caused predictions.points to silently fail while matches.actual_* succeeded).
- The scoring algorithm (`calculatePoints`/`outcomeSign`) was independently traced through 4 test vectors, including the highest-risk edge case (predicted 2:2 vs actual 1:1 → correctly 1 pt, not 3) — verified correct, matching the PRD's Guardrail on point-calculation correctness.
- The `admin_update_matches`/`admin_update_predictions` RLS policies omit an explicit `WITH CHECK` — reasoned through and confirmed correct: Postgres defaults `WITH CHECK` to the `USING` clause when omitted, and since the policy condition (`is_admin(auth.uid())`) depends only on the caller's role, not row data, this is equivalent to an explicit `WITH CHECK` here. Not a finding.
- Success Criteria: this phase's live debugging cycle (2 real bugs found and fixed via the Cloudflare Workers Builds log: an Astro compiler misparse of a bare `<` in a template expression, and the RLS upsert/INSERT-policy gap) is exactly the kind of defect this review process exists to catch — both are now fixed, confirmed live, and recorded in repo memory as lessons for future sessions.

## Findings

### F1 — Partial-failure gap when scoring predictions

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/pages/api/admin/matches/[id]/result.ts (per-row `Promise.all` update loop)
- **Detail**: The match's `actual_home_score`/`actual_away_score` are written first (step a), then predictions are scored via independent per-row `update()` calls run in parallel (step d). If the match update succeeds but only *some* of the per-row prediction updates fail (e.g. a transient network/DB hiccup on one of many parallel REST calls), the match ends up with a saved result while some predictions are left with `points = NULL` — and re-POSTing to retry is rejected by the endpoint's own "already has a result" guard (`actual_home_score !== null`), leaving no in-app recovery path.
- **Fix**: Accept the small risk of a rare partial failure at this scale (dozens of rows, no other part of this codebase uses transactions), but improve the failure signal: make the generic "Nie udało się zapisać wyniku" error message distinguish "result saved, N of M predictions failed to score" from a total failure, so the Admin knows the match result IS saved and only needs to fix the stragglers (via Supabase Studio) rather than assuming nothing happened.
  - Strength: Cheap (message-only change), doesn't require introducing transactions/rollback into a codebase that has none today, and gives the Admin accurate information to act on manually — consistent with this project's established small-office-scale, manual-SQL-Editor-recovery convention (already used elsewhere in this project).
  - Tradeoff: Doesn't eliminate the possibility of a partially-scored match; still requires a manual Studio fix in the rare case it happens.
  - Confidence: HIGH — matches this repo's existing risk posture (no transactions anywhere, Admin already relies on Supabase Studio for edge-case fixes).
  - Blind spot: Haven't measured actual PostgREST per-request failure rates in production; if partial failures turn out to be more common than expected, a stronger fix (fetch-then-validate-before-any-write, or a single RPC/transaction) would be worth revisiting.
- **Decision**: SKIPPED — accepted as risk at current scale; no transactions used anywhere else in this codebase.

### F2 — Leftover unnecessary `<Fragment>` conversion

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/admin/tournaments/[id]/matches.astro (outer `<Fragment>...</Fragment>` wrapping, from commit b3f8295)
- **Detail**: During live debugging, an intermediate fix attempt converted the outer `<>...</>` shorthand fragments to explicit `<Fragment>...</Fragment>`, guessing it was the cause of the Astro compile error. It wasn't (the real cause, found next, was a bare `<` in a `<=` comparison elsewhere in the file) — but the `<Fragment>` conversion is harmless and already deployed working, so there's no functional reason to revert it.
- **Fix**: No action needed — leave as-is; reverting purely for tidiness risks re-introducing a working build for no benefit.
- **Decision**: SKIPPED
