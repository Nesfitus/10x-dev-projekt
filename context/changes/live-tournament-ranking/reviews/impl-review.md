<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: User widzi bieżący ranking turnieju

- **Plan**: context/changes/live-tournament-ranking/plan.md
- **Scope**: Phase 1 of 2, Phase 2 of 2 (full plan)
- **Date**: 2026-09-13
- **Verdict**: APPROVED
- **Findings**: [0 critical] [1 warning — FIXED] [2 observations — triaged]

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS (F1 fixed) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Ranking RPC ujawnia e-maile wszystkich aktywnych Userów każdemu zalogowanemu, bez ograniczenia do "uczestnictwa" w turnieju

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — decyzja już świadomie podjęta i uzasadniona w trakcie `/10x-plan` (pytanie "Identyfikacja"); ten finding tylko formalnie ją odnotowuje
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260913090000_create_tournament_ranking_function.sql`, `src/pages/tournaments/[id]/ranking.astro`
- **Detail**: `tournament_ranking()` (SECURITY DEFINER) zwraca e-mail + sumę punktów każdego aktywnego Usera dla dowolnego `tournament_id`, wywoływane przez zwykłą sesję dowolnego zalogowanego (User lub Admin) bez sprawdzenia "uczestnictwa" w tym konkretnym turnieju. To jednak spójne z już istniejącym, płaskim modelem dostępu PRD — w aplikacji nigdy nie istniała koncepcja "uczestnictwa w turnieju"; `tournaments`/`matches` są już dziś widoczne dla każdego zalogowanego Usera przez istniejące RLS (`user_select_tournaments`, `user_select_matches`, od S-04). Subagent przeglądu oznaczył to jako CRITICAL, ale po konfrontacji z PRD (Access Control: "dokładnie dwie role, płaski model", brak wzmianki o ograniczeniu per-turniej) i z zapisaną w planie/migracji jawną decyzją architektoniczną — obniżam do WARNING: to udokumentowany, przemyślany kompromis, nie przeoczenie.
- **Fix**: Zaakceptować jako świadome ryzyko — opcjonalnie dopisać do PRD Access Control jedno zdanie: "ranking turnieju jest widoczny dla każdego zalogowanego, niezależnie od faktycznego udziału w typowaniu — spójne z brakiem koncepcji uczestnictwa w produkcie."
  - Strength: Zero zmian w kodzie; formalizuje decyzję już podjętą i uzasadnioną w planie.
  - Tradeoff: E-maile wszystkich Userów pozostają widoczne dla każdego zalogowanego — akceptowalne przy skali pojedynczego biura (dziesiątki osób), ale warte świadomego zapisania.
  - Confidence: HIGH — zgodne z PRD Access Control i istniejącym precedensem (tournaments/matches już dziś bez ograniczenia per-turniej).
  - Blind spot: Nie sprawdzono, czy przyszłe skalowanie na wiele niezależnych biur (poza MVP, patrz PRD Non-Goals) wymagałoby rewizji tego założenia.
- **Decision**: FIXED — Fix differently: nowa migracja `20260913100000_mask_tournament_ranking_email_domain.sql` maskuje domenę e-maila (`regexp_replace(u.email, '@.*$', '@***')`), zamiast zwracać pełny adres. Lokalna część (identyfikująca osobę) pozostaje widoczna, domena firmowa — nie.

### F2 — Brak `try/catch` wokół wywołań Supabase w `ranking.astro`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/tournaments/[id]/ranking.astro` (zapytanie `tournaments` i `.rpc("tournament_ranking", ...)`)
- **Detail**: Subagent przeglądu oznaczył to jako WARNING ("unhandled error"), ale supabase-js domyślnie nie rzuca wyjątków dla błędów zapytania (zwraca `{ data: null, error }`, nie throw) — a `?? null`/`?? []` już to pokrywa. To dokładnie ten sam wzorzec co `dashboard.astro` i `admin/tournaments/[id]/matches.astro` (żaden nie ma `try/catch`). Nie jest to regresja wprowadzona przez tę zmianę — to spójność z istniejącą konwencją repo.
- **Fix**: Brak akcji wymaganej — konsekwentne z resztą kodebase.
- **Decision**: ACCEPTED-AS-RULE: supabase-js nie rzuca wyjątków dla błędów zapytań — try/catch niepotrzebny wokół .from()/.rpc() (zapisane w `context/foundation/lessons.md`)

### F3 — Podzapytanie w `LEFT JOIN` zamiast podwójnego `LEFT JOIN`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `supabase/migrations/20260913090000_create_tournament_ranking_function.sql:30-34`
- **Detail**: `left join public.predictions pr on pr.user_id = p.id and pr.match_id in (select m.id from public.matches m where m.tournament_id = p_tournament_id)` działa poprawnie i Postgres zwykle optymalizuje to do semi-joinu; czytelniejszy odpowiednik to `left join public.matches m on m.tournament_id = p_tournament_id` + `left join public.predictions pr on pr.user_id = p.id and pr.match_id = m.id`. Przy skali pojedynczego biura (dziesiątki Userów/meczów) różnica jest nieistotna.
- **Fix**: Opcjonalnie przepisać na podwójny `LEFT JOIN` przy okazji przyszłej migracji dotykającej tę funkcję — nie wymaga osobnej migracji teraz.
- **Decision**: SKIPPED — nie warto teraz, brak realnego wpływu na wydajność przy tej skali.
