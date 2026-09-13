# Admin dodaje spotkania do turnieju — Plan Brief

> Full plan: `context/changes/admin-adds-matches/plan.md`

## What & Why

Admin musi móc dodawać spotkania (elementy turnieju) wraz z terminem rozegrania (FR-005) — bez tego S-04 (typowanie) nie ma jak wyznaczyć momentu blokady typowania. To ostatni plasterek przygotowawczy przed właściwym typowaniem wyników.

## Starting Point

S-01 dostarczyło tabelę `tournaments` i ustaliło wzorzec UI (lista + formularz, natywny POST + redirect, zod, RLS przez `is_admin()`). S-02 dodało wzorzec akcji z regułą biznesową egzekwowaną w kodzie endpointu (nie w RLS) — reużyjemy go dla nowych reguł tego plasterka. Nie istnieje jeszcze żadna zagnieżdżona trasa Astro (`[id]/...`) w UI, tylko w warstwie API.

## Desired End State

Admin na `/admin/tournaments` klika "Spotkania" przy dowolnym turnieju i trafia na `/admin/tournaments/{id}/matches`, gdzie widzi listę spotkań (gospodarz vs gość, termin) posortowaną rosnąco wg terminu oraz formularz dodania nowego — aktywny tylko dla turnieju `active`. Każde nierozegrane jeszcze spotkanie ma przycisk usuwania.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Pola spotkania | `home_team` + `away_team` (dwa pola tekstowe) | Naturalnie pasuje do przyszłego `home_score`/`away_score` w S-05 | Plan |
| Wybór turnieju w UI | Zagnieżdżona strona `/admin/tournaments/[id]/matches` | Naturalny podział zasobów, brak selektora w formularzu | Plan |
| Walidacja terminu | Wymagany, bez wymogu bycia w przyszłości | Prostota, brak wymogu w PRD | Plan |
| Grupowanie spotkań | Płaska lista (bez rund/kolejek) | PRD nie wspomina o rundach | Plan |
| Edycja/usuwanie | Tylko usuwanie (bez edycji) | FR-005 mówi tylko o dodawaniu; usuwanie naprawia pomyłki bez SQL | Plan |
| Dodawanie do zamkniętego turnieju | Zablokowane | Zamknięty turniej to zamknięty rozdział, zapobiega martwym danym | Plan |
| Usuwanie po starcie meczu | Zablokowane | Chroni integralność danych przed przyszłymi typami/wynikami (S-04/S-05) | Plan |
| Sortowanie listy | Rosnąco wg terminu spotkania | Najbardziej użyteczne dla Admina zarządzającego harmonogramem | Plan |
| Egzekwowanie reguł biznesowych | W kodzie endpointu (nie w RLS) | Reguły to pojedyncze, sekwencyjne akcje Admina — brak ryzyka race condition, jak w `disable.ts` z S-02 | Plan |
| Strefa czasowa terminu | Doklejenie `:00Z`, wyświetlanie akcesorami UTC (bez `toLocaleString()`) | `datetime-local` nie niesie strefy czasowej — ta konwencja daje spójny, deterministyczny round-trip niezależnie od strefy środowiska | Plan |

## Scope

**In scope:**
- Migracja: tabela `matches` (FK do `tournaments`, `on delete cascade`) + RLS (Admin-only: select/insert/delete)
- `POST /api/admin/tournaments/[id]/matches` (dodawanie, tylko gdy turniej `active`) + `POST /api/admin/matches/[id]/delete` (usuwanie, tylko gdy termin jeszcze nie minął)
- Zagnieżdżona strona `/admin/tournaments/[id]/matches` (lista + formularz + usuwanie) + link "Spotkania" z listy turniejów

**Out of scope:**
- Rundy/kolejki, edycja spotkania, pole wyniku (`home_score`/`away_score` — to S-05)
- Dostęp Usera (select) do `matches` (S-04)
- Walidacja terminu względem "teraz", framework testowy

## Architecture / Approach

Trzecia tabela domenowa (`matches`) powiązana FK z `tournaments`, chroniona RLS przez reużyty `is_admin()`. Obie reguły biznesowe tego plasterka (tylko `active`, blokada usuwania po starcie) żyją w kodzie endpointu — nie w RLS/constraint — bo dotyczą pojedynczej, sekwencyjnej akcji Admina, nie współbieżności (w przeciwieństwie do "jednego aktywnego turnieju" z S-01). UI podąża dokładnie za wzorcem z S-01/S-02, ale wprowadza pierwszą zagnieżdżoną trasę Astro w tym repo.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Model danych | Tabela `matches`, RLS, typ `Match` | Brak kaskadowego usunięcia przy skasowaniu turnieju |
| 2. Endpointy API | Dodawanie (tylko `active`) + usuwanie (tylko przed startem) | Pominięcie sprawdzenia statusu turnieju/terminu — martwe dane lub błędne kasowanie |
| 3. UI Admina | Zagnieżdżona strona spotkań + link z listy turniejów | Błędne formatowanie terminu (`toLocaleString()` zamiast akcesorów UTC) przesuwające wyświetlany czas |

**Prerequisites:** S-01 (admin-creates-tournament), F-01 (role-based-access-foundation) — oba już zaimplementowane.
**Estimated effort:** 3 fazy, sekwencyjne (każda zależy od poprzedniej).

## Open Risks & Assumptions

- Zakłada się, że doklejenie `:00Z` do wartości `datetime-local` i spójne odczytywanie akcesorami UTC wystarczy jako uproszczenie strefy czasowej na skalę pojedynczego biura — jeśli w przyszłości pojawi się wymóg wielostrefowy, ten mechanizm będzie wymagał przeprojektowania.
- Zakłada się, że zagnieżdżona trasa Astro (`[id]/matches.astro` obok istniejącego pliku `tournaments.astro`) działa bez konfliktu — potwierdzone już analogicznie w warstwie API, ale to pierwszy przypadek w warstwie UI, do zweryfikowania w Fazie 3.

## Success Criteria (Summary)

- Admin może dodać spotkanie (gospodarz, gość, termin) do aktywnego turnieju i widzi je natychmiast na posortowanej liście.
- Admin nie może dodać spotkania do zamkniętego turnieju ani usunąć spotkania, które już się rozpoczęło — oba przypadki kończą się czytelnym komunikatem błędu.
- User i niezalogowany nie mają dostępu do żadnej strony/danych `matches` (RLS + middleware).
