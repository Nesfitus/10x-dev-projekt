<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Admin zarządza użytkownikami (bez samorejestracji)

- **Plan**: context/changes/admin-manages-users/plan.md
- **Scope**: Phase 1 of 5 (full plan — all phases complete)
- **Date**: 2026-09-12
- **Verdict**: NEEDS ATTENTION → resolved (F1, F4 fixed; F2, F3 accepted/skipped)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Note on Success Criteria: automated re-verification in this sandbox hit two environment-level artifacts unrelated to the change's code — (1) `npm run lint` reports repo-wide `prettier/prettier "Delete ␍"` errors caused by `core.autocrlf=true` on this Windows checkout (affects unrelated pre-existing files too, not introduced by this change); (2) `npm run build` fails with a `write EOF` error inside the Cloudflare adapter's secrets/bindings resolution step, reproducible even with `CI=true`, before any application code runs. Both are pre-existing environment conditions, not regressions from this change. The plan's `Progress` section already records passing `lint`/`build` runs at implementation time (commits `9edb8e9`, `53789a6`, `6067667`, `adc92d9`), and GitHub CI (now correctly wired to `main`) will independently re-confirm on next push.

## Findings

### F1 — Unguarded `usersData.users` access can crash `/admin/users` on API error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/pages/admin/users.astro:19
- **Detail**: `adminClient.auth.admin.listUsers()` can return `{ data: null, error }` on failure (e.g. transient API/network issue). The code immediately does `usersData.users.map(...)` with no null guard, while the sibling `profiles` result on the same line is safely defaulted with `(profiles ?? [])`. If `listUsers()` ever errors, the page throws instead of degrading gracefully.
- **Fix**: Guard with `const userList = usersData?.users ?? [];` and build the map from `userList`, matching the existing `profiles ?? []` pattern already used two lines below.
- **Decision**: FIXED

### F2 — Silent empty list on `listUsers()`/`profiles` query failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/pages/admin/users.astro:16-22
- **Detail**: Neither Supabase call's `error` is inspected. Once F1 is fixed with `?? []` fallbacks, a real failure degrades to a silently empty "Brak użytkowników" list instead of a visible error, unlike the two API endpoints in this same change which always check `if (error)` and surface a message.
- **Fix**: Destructure the `error` fields alongside `data` and, when present, pass a message into the same `error` display block the page already renders for `Astro.url.searchParams`.
- **Decision**: SKIPPED

### F3 — Theoretical TOCTOU gap between role check and disable update

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Security)
- **Location**: src/pages/api/admin/users/[id]/disable.ts:22-30
- **Detail**: The endpoint reads `profiles.role`, checks it isn't `admin`, then issues a separate `update` call. Between the two calls, an out-of-band role change (only possible via direct SQL per this plan's own constraints — never through the app) could theoretically slip through. Low real-world risk given the plan explicitly restricts role changes to manual SQL outside the app.
- **Fix**: Optional hardening — add `.neq("role", "admin")` to the `update(...)` call so the check and the write are atomic in one round trip.
- **Decision**: SKIPPED — accepted as low risk given the plan's constraint that role changes only happen via manual SQL outside the app.

### F4 — `src/types.ts` changed without being listed in the plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/types.ts (Profile interface + `disabled: boolean`)
- **Detail**: Phases 3 and 5 both rely on a typed `disabled` field (middleware's inline type, `admin/users.astro`'s `UserRow extends Profile`), but no phase's "Changes Required" lists `src/types.ts` as a file to change. The addition itself is correct and necessary — it's a documentation gap, not a functional problem.
- **Fix**: Add a one-line addendum to Phase 5 of plan.md noting `src/types.ts` (`Profile.disabled`) as a supporting change, so the plan stays an accurate record.
- **Decision**: FIXED
