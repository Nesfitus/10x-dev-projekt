# Critical-Path Test Coverage — Plan Brief

> Full plan: `context/changes/testing-critical-path-coverage/plan.md`
> Research: `context/changes/testing-critical-path-coverage/research.md`

## What & Why

Faza 1 rolloutu testów (`test-plan.md`): założyć infrastrukturę testową od zera i pokryć dwa najwyżej ocenione ryzyka projektu — regułę punktacji 3/1/0 oraz blokadę czasową typowania po starcie meczu — dowodząc obu zachowań niezależnymi, nietautologicznymi testami, nie asercjami skopiowanymi z implementacji.

## Starting Point

Obie reguły są już zaimplementowane i ręcznie zweryfikowane w code review, ale bez żadnych zautomatyzowanych testów — projekt nie ma dziś skonfigurowanego runnera testowego. Punktacja żyje w czystej funkcji TS w endpoincie admina; blokada czasowa jest zaimplementowana podwójnie (API + RLS `WITH CHECK`), ale RLS nigdy nie była przetestowana z pominięciem endpointu.

## Desired End State

`npm run test` uruchamia szybkie testy jednostkowe reguły punktacji; `npm run test:integration` uruchamia testy dowodzące, że zapis po starcie meczu jest odrzucany zarówno przez API, jak i — niezależnie — przez RLS, gdy ktoś ominie endpoint i uderzy bezpośrednio w Supabase własnym tokenem sesji. Testy integracyjne sprzątają po sobie w całości na współdzielonym, zdalnym projekcie Supabase.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Środowisko testów integracyjnych | Zdalny, już zalinkowany projekt Supabase | Zero nowej infrastruktury, spójne z istniejącą konwencją "weryfikuj przez zdalny Supabase, nie Dockera" | Plan |
| Autentykacja RLS w testach | Dynamiczne tworzenie/kasowanie testowego Usera per run przez Admin API | Pełna izolacja, wykorzystuje już istniejący wzorzec `createAdminClient()` | Plan |
| Izolacja danych testowych | Fixture per test (turniej/mecz), cascade delete w teardown | Brak trwałych śladów, wykorzystuje istniejące `ON DELETE CASCADE` | Plan |
| Lokalizacja reguły punktacji | Wydzielona do `src/lib/services/scoring.ts` | Zgodne z konwencją `AGENTS.md`, czysty unit test bez I/O | Plan |
| Rola MSW | Pominięta w tej fazie | RLS wymaga realnej bazy — mock niczego by nie zweryfikował na poziomie DB | Plan |
| Precyzja granicy czasowej | Wyraźny margines (±1h), nie dokładna sekunda | Odporność na clock skew między testem a serwerem DB | Plan |
| Zasięg CI | Tylko lokalnie, CI bez zmian w tej fazie | Zgodne z fazowaniem `test-plan.md` (Faza 4 = quality-gates wiring); brak `SERVICE_ROLE_KEY` w sekretach CI | Plan |

## Scope

**In scope:** Vitest setup, wydzielenie i unit-testy `calculatePoints`/`outcomeSign`, harness integracyjny (testowy User + fixture'y), testy integracyjne blokady czasowej (negatywne API + negatywne RLS-bypass + pozytywna ścieżka).

**Out of scope:** wpięcie testów w CI, MSW, e2e/Playwright, osobny projekt Supabase testowy, ryzyka #3–#7 z test-plan.md, zmiany w agregacji punktów SQL.

## Architecture / Approach

Trzy fazy rosnącej złożoności: (1) tooling + unit test czystej funkcji, (2) reużywalny harness Supabase (User + fixture'y, pełne sprzątanie), (3) właściwe testy integracyjne blokady czasowej wykorzystujące harness — w tym bezpośrednie wywołanie prawdziwego handlera API przez fake `APIContext` (bez żywego serwera) oraz bezpośrednie żądanie `supabase-js` z pominięciem endpointu, żeby dowieść niezależności RLS.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Test tooling + unit tests dla punktacji | Vitest, `scoring.ts`, pełna macierz 3/1/0 | Refaktor endpointu (przeniesienie funkcji) może wprowadzić regresję — pokryte manualną weryfikacją |
| 2. Harness integracyjny Supabase | Testowy User + fixture'y turniej/mecz z pełnym cleanupem | Niepełne sprzątanie zanieczyszcza współdzielony zdalny projekt |
| 3. Testy integracyjne blokady czasowej | Testy negatywne (API + RLS-bypass) i pozytywne | Fake `APIContext`/mock transportu auth musi wiernie odzwierciedlać realne zachowanie, inaczej test nic nie dowodzi |

**Prerequisites:** lokalny `.env`/`.dev.vars` z `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` (do tworzenia/kasowania testowego Usera i fixture'ów).
**Estimated effort:** ~3 sesje implementacyjne, po jednej na fazę.

## Open Risks & Assumptions

- Testy integracyjne piszą do współdzielonego, zdalnego projektu Supabase (tego samego co realny deploy) — dyscyplina sprzątania jest krytyczna, nie tylko "nice to have".
- Fake `APIContext` i zmockowany transport uwierzytelniania muszą dokładnie odzwierciedlać to, co Astro realnie przekazuje do handlera — błąd tutaj dałby fałszywe poczucie bezpieczeństwa (test przechodzi, ale nie testuje tego, co powinien).

## Success Criteria (Summary)

- `npm run test` i `npm run test:integration` przechodzą lokalnie, bez regresji w `npm run lint`/`npm run build`.
- Zapis/edycja predykcji po starcie meczu jest odrzucana niezależnie na warstwie API i RLS (dowiedzione osobnymi asercjami, nie tylko przez UI).
- Reguła punktacji 3/1/0 pokryta pełną macierzą, w tym najwyżej ocenionym przypadkiem brzegowym remis:remis różnymi wynikami.
