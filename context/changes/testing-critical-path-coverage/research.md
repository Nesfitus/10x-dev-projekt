---
date: 2026-09-13T00:00:00+02:00
researcher: GitHub Copilot
git_commit: 948e15dc88d36812056ffbed4883d5e19e003364
branch: main
repository: 10x-dev-projekt
topic: "Grunt pod Fazę 1 rolloutu testów — reguła punktacji 3/1/0 (#1) i blokada czasowa typowania (#2)"
tags: [research, codebase, scoring, predictions, rls, time-lock, test-plan]
status: complete
last_updated: 2026-09-13
last_updated_by: GitHub Copilot
---

# Research: Grunt pod Fazę 1 rolloutu testów — reguła punktacji 3/1/0 i blokada czasowa typowania

**Date**: 2026-09-13
**Researcher**: GitHub Copilot
**Git Commit**: 948e15dc88d36812056ffbed4883d5e19e003364
**Branch**: main
**Repository**: 10x-dev-projekt

## Research Question

Na potrzeby `context/changes/testing-critical-path-coverage/` (Faza 1 rolloutu z `context/foundation/test-plan.md` §3) — zgromadzić kontekst wymagany przez `/10x-plan`, aby zaplanować testy unit + integration dla dwóch ryzyk:

- **#1 — Reguła punktacji (3/1/0)**: gdzie dokładnie liczona jest punktacja, jaka jest dokładna formuła porównania, jak obsługiwany jest przypadek remis:remis różnymi wynikami. Cel dowodowy: pełna macierz predykcja×wynik daje 3/1/0; unikać oracle problem (asercja skopiowana z implementacji, nie z reguły biznesowej).
- **#2 — Blokada czasowa typowania**: gdzie żyje sprawdzenie granicy czasowej (API vs RLS), jaki zegar, jak przechowywana jest `scheduled_at`. Cel dowodowy: zapis po starcie meczu odrzucony niezależnie od UI, na warstwie API **i** RLS.

Dodatkowo: jaka infrastruktura testowa istnieje dziś w projekcie (żeby Faza 1 mogła dobrać/zainstalować runner).

## Summary

Obie reguły biznesowe są już **zaimplementowane i ręcznie zweryfikowane w code review**, ale **nie mają żadnych zautomatyzowanych testów** — projekt nie ma skonfigurowanego runnera testowego (brak Vitest/Jest/Playwright, brak `npm run test`).

- **Punktacja (#1)** żyje wyłącznie w TypeScript — czysta, deterministyczna funkcja `calculatePoints`/`outcomeSign` w [src/pages/api/admin/matches/[id]/result.ts](src/pages/api/admin/matches/[id]/result.ts#L20-L27). SQL nie liczy punktów — tylko je agreguje (`sum(pr.points)`). To jest **idealny kandydat na czysty unit test** (brak I/O, brak Supabase w środku).
- **Blokada czasowa (#2)** jest zaimplementowana **podwójnie i niezależnie**: raz w API endpointzie ([src/pages/api/matches/[id]/predictions.ts](src/pages/api/matches/[id]/predictions.ts#L61)) jako `new Date(match.scheduled_at) <= new Date()`, i raz w RLS `WITH CHECK` na `insert`/`update` ([supabase/migrations/20260912090000_create_predictions.sql](supabase/migrations/20260912090000_create_predictions.sql#L40-L65)) jako `m.scheduled_at > now()`. To wymaga **testu integracyjnego uderzającego bezpośrednio w Supabase REST API z tokenem sesji User**, z pominięciem endpointu — inaczej test nigdy nie zweryfikuje realnej ochrony (tylko duplikat logiki aplikacji).
- Oba obszary mają już udokumentowaną świadomość ryzyk w historii projektu (`plan.md`, `reviews/impl-review.md`) — patrz sekcja Historical Context. Warto to potraktować jako **oracle** (źródło reguły), a nie kopiować asercje z bieżącego kodu.

## Detailed Findings

### #1 — Reguła punktacji 3/1/0

**Źródło prawdy**: kod aplikacji (TypeScript), nie SQL.

```typescript
// src/pages/api/admin/matches/[id]/result.ts:20-27
function outcomeSign(home: number, away: number) {
  return home > away ? 1 : home < away ? -1 : 0;
}

function calculatePoints(predictedHome: number, predictedAway: number, actualHome: number, actualAway: number) {
  if (predictedHome === actualHome && predictedAway === actualAway) return 3;
  if (outcomeSign(predictedHome, predictedAway) === outcomeSign(actualHome, actualAway)) return 1;
  return 0;
}
```

- Funkcja jest **czysta** (brak side-effectów, brak zależności od Supabase) — nie jest eksportowana (brak `export`), więc plan musi przewidzieć albo dodanie `export`, albo test przez re-implementację/import wewnętrzny modułu.
- Wywoływana w [src/pages/api/admin/matches/[id]/result.ts:113-127](src/pages/api/admin/matches/[id]/result.ts#L113-L127) — dla każdej istniejącej predykcji danego meczu, równolegle (`Promise.all`), `update` po `id` (nie `upsert` — patrz komentarz w kodzie o RLS INSERT policy blokującej upsert dla Admina).
- **Przypadek remis:remis różnymi wynikami** (np. predykcja 2:2, wynik faktyczny 1:1) jest jawnie rozpoznanym najbardziej ryzykownym przypadkiem brzegowym: `outcomeSign(2,2) === outcomeSign(1,1)` → `0 === 0` → **1 pkt** (trafiony kierunek), NIE 3 pkt. Udokumentowane w [context/changes/admin-enters-result-auto-scoring/plan.md:33](context/changes/admin-enters-result-auto-scoring/plan.md) i zweryfikowane w [context/changes/admin-enters-result-auto-scoring/reviews/impl-review.md:23](context/changes/admin-enters-result-auto-scoring/reviews/impl-review.md) przez 4 ręczne wektory testowe.
- `points` w bazie ma twarde ograniczenie `check (points in (0, 1, 3))` — [supabase/migrations/20260912100000_add_match_results_and_prediction_points.sql:18](supabase/migrations/20260912100000_add_match_results_and_prediction_points.sql).
- Agregacja (nie liczenie) punktów w rankingu: `coalesce(sum(pr.points), 0)` w [supabase/migrations/20260913090000_create_tournament_ranking_function.sql:27](supabase/migrations/20260913090000_create_tournament_ranking_function.sql) — `sum()` naturalnie pomija `NULL` (nieocenione predykcje).

**Oracle dla testów** (żeby uniknąć "asercja skopiowana z implementacji"): niezależne od kodu źródło reguły to opis w [context/changes/admin-enters-result-auto-scoring/plan-brief.md:7](context/changes/admin-enters-result-auto-scoring/plan-brief.md) i `plan.md:33` — "3 pkt dokładny wynik / 1 pkt trafiony kierunek / 0 pkt chybiony typ", oraz PRD (`context/foundation/prd.md`, guardrail "poprawność liczenia punktów"). Test-plan §2 Risk Response Guidance dla #1 formułuje to jako zachowanie biznesowe wprost — to jest oracle, nie kod `calculatePoints`.

**Pełna macierz do pokrycia** (na podstawie kombinacji kierunek×dokładność, 3 kategorie kierunku × exact/inexact):
1. Dokładny wynik, gospodarze wygrywają (np. pred 2:1, actual 2:1) → 3
2. Dokładny wynik, remis (np. pred 1:1, actual 1:1) → 3
3. Dokładny wynik, goście wygrywają (np. pred 0:2, actual 0:2) → 3
4. Trafiony kierunek, gospodarze wygrywają, różny wynik (pred 3:1, actual 2:0) → 1
5. Trafiony kierunek, remis, różny wynik (pred 2:2, actual 1:1) → 1 — **najwyższe ryzyko, jawnie wymagane w historii projektu**
6. Trafiony kierunek, goście wygrywają, różny wynik (pred 0:3, actual 1:2) → 1
7. Chybiony kierunek (pred: gospodarze wygrywają, actual: remis lub goście wygrywają, itd.) → 0 — kilka wariantów krzyżowych (3×3 macierz kierunków minus przekątna = 6 kombinacji "chybiony")

### #2 — Blokada czasowa typowania

**Podwójna, niezależna warstwa (defense-in-depth)**: API + RLS.

**Warstwa API** — [src/pages/api/matches/[id]/predictions.ts:61](src/pages/api/matches/[id]/predictions.ts#L61):
```typescript
if (new Date(match.scheduled_at) <= new Date()) {
  return context.redirect(errorRedirectUrl("Nie można typować po rozpoczęciu spotkania"));
}
```
Zegar: `new Date()` po stronie serwera (Astro API route, Cloudflare Worker) — klient nie przesyła żadnego czasu, brak wektora manipulacji. `match.scheduled_at` jest pobierane z DB tuż przed porównaniem (linie 51-56).

**Warstwa RLS** — [supabase/migrations/20260912090000_create_predictions.sql](supabase/migrations/20260912090000_create_predictions.sql):
```sql
-- insert (linie ~40-51)
create policy "user_insert_own_prediction"
  on public.predictions for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      where m.id = predictions.match_id
        and t.status = 'active'
        and m.scheduled_at > now()
    )
  );

-- update (linie ~53-65) — identyczny WITH CHECK, dodatkowo USING (user_id = auth.uid())
create policy "user_update_own_prediction"
  on public.predictions for update
  using (user_id = auth.uid())
  with check ( ... and m.scheduled_at > now() ... );
```
Zegar: `now()` w PostgreSQL (serwer bazy) — niezależny od zegara API. To jest **prawdziwa, niezależna granica bezpieczeństwa**, nie duplikat: gdyby ktoś ominął endpoint API i uderzył bezpośrednio w Supabase REST API własnym tokenem sesji, `WITH CHECK` i tak odrzuci insert/update (`PGRST` błąd RLS).

**Przechowywanie czasu**: `matches.scheduled_at` to `timestamptz not null` ([supabase/migrations/20260911130000_create_matches.sql](supabase/migrations/20260911130000_create_matches.sql)) — zawsze UTC wewnątrz Postgresa; wejście z `<input type="datetime-local">` jest normalizowane bez konwersji stref (udokumentowane w `context/changes/admin-closes-tournament-and-winners/plan.md` / wcześniejszych planach dot. `matches`).

**Formularz UI** ukrywa formularz typowania, gdy `canPredict` jest `false` (np. `src/pages/dashboard.astro`, warunek `new Date(match.scheduled_at) > now`) — to jest **tylko kosmetyka UX**, nie ochrona. Test integracyjny musi to pominąć i uderzyć bezpośrednio w endpoint/REST API.

**Co musi zweryfikować test integracyjny (żeby nie testować tylko przez UI)**:
1. Bezpośredni `POST /api/matches/{id}/predictions` po starcie meczu → oczekiwany redirect z błędem (warstwa API).
2. Bezpośredni `supabase.from('predictions').insert(...)` / `.upsert(...)` z tokenem sesji zwykłego Usera, dla meczu który już się zaczął → oczekiwane odrzucenie przez RLS (kod błędu RLS), **z pominięciem endpointu API całkowicie** — to jest jedyny sposób, by dowieść, że RLS jest realną, niezależną granicą, a nie duplikatem kodu aplikacji.
3. Analogicznie dla `update` istniejącej predykcji po starcie meczu.

### Istniejąca infrastruktura testowa

- **Brak** skonfigurowanego runnera: brak `vitest.config.*`, `jest.config.*`, `playwright.config.*`, brak `__tests__/`, brak `*.test.ts`/`*.spec.ts`, brak sekcji `"test"` w [package.json](package.json).
- `devDependencies` obecne: ESLint (+ pluginy astro/react/jsx-a11y), Prettier, husky+lint-staged, `supabase` CLI, TypeScript, `wrangler`. Brak jakiejkolwiek biblioteki testowej.
- [src/lib/supabase.ts](src/lib/supabase.ts) eksponuje `createClient()` (cookie-based SSR, per-request) oraz `createAdminClient()` (service-role, bypass RLS — istotne dla setup/teardown danych testowych, ale **nie** do testowania samego RLS, bo omija je z definicji).
- Zmienne env: `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (patrz `.env.example`). Testy integracyjne uderzające w RLS będą potrzebowały klienta zalogowanego jako zwykły `User` (nie admin client), żeby polityki RLS faktycznie się egzekwowały.
- Zgodnie z lekcją w `context/foundation/lessons.md` ("Weryfikuj przez zdalny Supabase i realny deploy, nie przez lokalnego Dockera") — środowisko implementacyjne nie ma Dockera, więc testy integracyjne dotykające Supabase będą musiały działać względem już zalinkowanego **zdalnego** projektu Supabase, nie lokalnego stacku.

## Code References

- [src/pages/api/admin/matches/[id]/result.ts:20-27](src/pages/api/admin/matches/[id]/result.ts) - `outcomeSign`/`calculatePoints`, źródło prawdy reguły 3/1/0
- [src/pages/api/admin/matches/[id]/result.ts:113-127](src/pages/api/admin/matches/[id]/result.ts) - wywołanie `calculatePoints` per-predykcja, równoległy update
- [src/pages/api/matches/[id]/predictions.ts:61-63](src/pages/api/matches/[id]/predictions.ts) - blokada czasowa w API (`new Date(match.scheduled_at) <= new Date()`)
- [src/pages/api/matches/[id]/predictions.ts:66-75](src/pages/api/matches/[id]/predictions.ts) - `upsert` do `predictions`, komentarz o RLS jako defense-in-depth
- [supabase/migrations/20260912090000_create_predictions.sql](supabase/migrations/20260912090000_create_predictions.sql) - polityki RLS `user_insert_own_prediction` / `user_update_own_prediction`, `WITH CHECK (... m.scheduled_at > now())`
- [supabase/migrations/20260912100000_add_match_results_and_prediction_points.sql:18](supabase/migrations/20260912100000_add_match_results_and_prediction_points.sql) - `points integer check (points in (0, 1, 3))`
- [supabase/migrations/20260913090000_create_tournament_ranking_function.sql:27](supabase/migrations/20260913090000_create_tournament_ranking_function.sql) - agregacja `sum(pr.points)` w rankingu
- [src/lib/supabase.ts](src/lib/supabase.ts) - `createClient()` (SSR cookie-based) i `createAdminClient()` (service-role)
- [package.json](package.json) - brak sekcji `test`, brak zależności testowych

## Architecture Insights

- **Podział odpowiedzialności "SQL liczy tylko agregaty, TS liczy logikę biznesową"** jest spójny wzorzec w tym repo (punktacja liczona w TS, ranking agregowany w SQL) — Faza 1 testów powinna to uszanować: unit test dla `calculatePoints` (czysta funkcja TS), integration test dla ścieżki API+RLS.
- **Defense-in-depth jest świadomym, udokumentowanym wzorcem architektonicznym** od momentu, gdy zwykły User zaczął pisać dane (`user-submits-prediction`), nie przypadkową duplikacją — testy powinny to explicite dowieść osobno dla obu warstw, nie zakładać, że jedna implikuje drugą.
- `calculatePoints`/`outcomeSign` nie są eksportowane — plan implementacyjny fazy testów będzie musiał zdecydować: dodać `export` (najmniejsza zmiana) czy testować przez wywołanie całego endpointu (integration-only, droższe, traci unit-test granularność wymaganą przez risk response guidance w test-plan.md).

## Historical Context (from prior changes)

- [context/changes/admin-enters-result-auto-scoring/plan.md](context/changes/admin-enters-result-auto-scoring/plan.md) - oryginalna specyfikacja reguły 3/1/0, jawnie wymienia remis:remis jako najryzykowniejszy przypadek do przetestowania
- [context/changes/admin-enters-result-auto-scoring/reviews/impl-review.md](context/changes/admin-enters-result-auto-scoring/reviews/impl-review.md) - 4 ręcznie zweryfikowane wektory testowe (w tym remis:remis); F1: znany, zaakceptowany risk częściowego niepowodzenia równoległych update'ów (brak transakcji) — nie wymaga naprawy w tej fazie, ale wart odnotowania jako świadomy gap przy integration testach (co się dzieje, gdy jeden z równoległych update'ów zawiedzie)
- [context/changes/user-submits-prediction/plan.md](context/changes/user-submits-prediction/plan.md) - architektoniczna decyzja o podwójnej warstwie (kod + RLS) dla blokady czasowej, z jawnym uzasadnieniem "User mógłby ominąć endpoint"
- [context/changes/user-submits-prediction/reviews/impl-review.md](context/changes/user-submits-prediction/reviews/impl-review.md) - niezależna weryfikacja klauzul RLS `WITH CHECK` przez recenzenta (nie tylko zaufanie opisowi planu) — werdykt PASS
- `context/foundation/test-plan.md` §2 Risk Response Guidance (#1, #2) - już zawiera intencję odpowiedzi na oba ryzyka (patrz change.md Notes) — ten dokument researchu dostarcza brakujące anchory (file:line), których test-plan świadomie unika

## Related Research

- Brak wcześniejszych `research.md` w tym repo dotyczących tego tematu (pierwsze `/10x-research` dla `testing-critical-path-coverage`).

## Open Questions

- Czy `calculatePoints`/`outcomeSign` powinny zostać wyeksportowane z endpointu (lub przeniesione do `src/lib/services/`) na potrzeby czystego unit testu, czy plan ma testować je pośrednio przez wywołanie endpointu? (Do rozstrzygnięcia w `/10x-plan`.)
- Jaki klient testowy uderzy w RLS bezpośrednio (bez service-role) — potrzebny mechanizm logowania testowego Usera (np. dedykowany konto testowe na zdalnym Supabase) zamiast `createAdminClient()`, który z definicji omija RLS.
- Wybór runnera (Vitest wskazany w test-plan.md §4 jako kandydat, natywny dla Vite/Astro) i sposób uruchamiania testów integracyjnych względem zdalnego Supabase w CI (`.github/workflows/ci.yml`) — obecnie CI uruchamia tylko `lint` + `build`.
