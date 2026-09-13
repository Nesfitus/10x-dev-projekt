# User widzi bieżący ranking turnieju — Plan Brief

> Full plan: `context/changes/live-tournament-ranking/plan.md`

## What & Why

User (i Admin) mogą zobaczyć pełny, bieżący ranking dowolnego turnieju — wszyscy aktywni Userzy z sumą ich punktów, w tym ci bez złożonych typów (0 pkt). To domyka przepływ zapoczątkowany przez S-05 (automatyczne naliczanie punktów), realizując FR-010: "User może zobaczyć pełny ranking (wszystkich uczestników) i swoje punkty w turnieju na bieżąco".

## Starting Point

S-05 jest funkcjonalnie ukończony: `matches.actual_*` i `predictions.points` istnieją i są naliczane synchronicznie po wpisaniu wyniku przez Admina. Nie ma jednak dziś żadnego sposobu, by User zobaczył zagregowane punkty — ani swoje, ani cudze — bo RLS na `profiles` ogranicza widoczność do własnego wiersza, a jedyny sposób rozwiązania e-maili (service-role `createAdminClient()`) jest konwencyjnie zarezerwowany dla stron Admina.

## Desired End State

Pod `/tournaments/[id]/ranking` każdy zalogowany User i Admin widzi tabelę wszystkich aktywnych Userów posortowaną malejąco po punktach (remis → alfabetycznie po e-mailu), z wyróżnionym własnym wierszem. Działa identycznie dla turniejów `active` i `closed`. Linki prowadzą tam z `/dashboard` (User) i `/admin/tournaments` (Admin).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Dostęp do danych innych Userów | Nowa funkcja SQL `SECURITY DEFINER` (`tournament_ranking`), wywoływana przez `.rpc()` | Nie narusza istniejącej konwencji "service-role tylko dla stron Admina" ani nie wymaga nowych, szerszych polityk RLS | Plan |
| Zbiór uczestników rankingu | Wszyscy aktywni (nie-dezaktywowani) Userzy, także bez złożonych typów (0 pkt) | Wprost zgodne z FR-006 ("brak typu = 0 pkt") i FR-010 ("wszyscy uczestnicy"); domyka decyzję zostawioną przez S-05 | Plan |
| Zakres widoku | Tylko zagregowana suma punktów per User (bez rozbicia per-mecz) | Dokładnie to, czego wymaga FR-010; mniejszy zakres, mniejsze ryzyko | Plan |
| Zakres turniejów | Ranking działa dla `active` i `closed` | Ten sam widok reużyje przyszłe S-07 (zamknięcie turnieju), bez dodatkowej pracy | Plan |
| Nawigacja | Link "Ranking" przy każdym turnieju na `/dashboard` i `/admin/tournaments` | Spójne z istniejącym wzorcem linku "Spotkania"; brak nowego layoutu | Plan |
| Sortowanie przy remisie | Punkty malejąco, remis: e-mail rosnąco | W pełni deterministyczne, bez sugerowania ukrytego znaczenia kolejności | Plan |
| Stan pusty | Zawsze pełna lista z 0 pkt (nigdy "brak danych") | Naturalny wynik tej samej agregacji, brak specjalnego przypadku w kodzie | Plan |
| Dostęp Admina | Ta sama strona dostępna też z `/admin/tournaments` | Admin naturalnie chce zweryfikować własną pracę (wpisane wyniki) | Plan |

## Scope

**In scope:**
- Funkcja SQL `public.tournament_ranking(p_tournament_id uuid)` (SECURITY DEFINER, GRANT EXECUTE authenticated)
- Strona `/tournaments/[id]/ranking.astro` + rejestracja trasy w `PROTECTED_ROUTES`
- Linki nawigacyjne z `/dashboard` i `/admin/tournaments`

**Out of scope:**
- Zmiany RLS na `profiles`/`predictions`/`matches`/`tournaments`
- Rozbicie punktów per-mecz / podgląd cudzych konkretnych typów
- Wyłanianie zwycięzcy / zamknięcie turnieju (S-07)
- Odświeżanie w locie (polling/WebSocket)

## Architecture / Approach

Jedna nowa funkcja SQL `SECURITY DEFINER` liczy cały ranking (JOIN `profiles` + `auth.users`, LEFT JOIN `predictions` filtrowane po `tournament_id`, GROUP BY, ORDER BY) i jest jedynym miejscem w bazie, które celowo ujawnia cudze dane (e-mail, punkty) — ograniczona do jednego parametru wejściowego i trzech pól wyjściowych. Strona Astro wywołuje ją przez zwykłą sesję (`createClient()`, nie service-role) przez `.rpc()`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Funkcja SQL rankingu | `tournament_ranking()` + typ `RankingRow` | Funkcja musi poprawnie ujawniać dane wyłącznie w zamierzonym, wąskim zakresie (3 pola) — błąd tutaj byłby wyciekiem danych |
| 2. Strona rankingu i nawigacja | `/tournaments/[id]/ranking` + linki z dashboardu i panelu Admina + ochrona trasy | Strona musi sama sprawdzić istnienie turnieju przed wywołaniem funkcji (funkcja nie zwraca błędu dla nieistniejącego id) |

**Prerequisites:** S-05 (ukończone funkcjonalnie)
**Estimated effort:** ~1 sesja, 2 fazy

## Open Risks & Assumptions

- Zakładamy, że `SECURITY DEFINER` w Supabase (funkcja właściciela `postgres`) ma dostęp do `auth.users` niezależnie od RLS — spójne z istniejącym `is_admin()`, ale to pierwsza funkcja w tym projekcie łącząca `public` i `auth` w jednym zapytaniu; wymaga potwierdzenia manualnego w Fazie 1 (SQL Editor + wywołanie z sesji User).
- Roadmap S-05 wciąż formalnie `in-progress` (nie zarchiwizowany) — plan traktuje go jako gotowy fundament na podstawie w pełni odhaczonego `## Progress`.

## Success Criteria (Summary)

- User i Admin widzą tę samą, pełną listę wszystkich aktywnych Userów z poprawnymi punktami dla dowolnego turnieju (aktywnego i zamkniętego).
- User bez złożonych typów widnieje z 0 pkt — nigdy nie jest pominięty.
- Żadna istniejąca polityka RLS nie została rozluźniona; jedyna nowa ekspozycja danych przechodzi przez jedną, wąską funkcję SQL.
