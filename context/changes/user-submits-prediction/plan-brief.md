# User typuje wynik spotkania — Plan Brief

> Full plan: `context/changes/user-submits-prediction/plan.md`

## What & Why

User może wytypować wynik spotkania (gospodarz/gość) do momentu jego rozpoczęcia, z możliwością wielokrotnej zmiany typu przed startem. To ostatni krok przed gwiazdą przewodnią (S-05, automatyczne naliczanie punktów) — bez zebranych typów system nie ma czego oceniać.

## Starting Point

`tournaments` i `matches` istnieją, ale RLS obu tabel jest dziś czysto Admin-only — User nie ma żadnego dostępu odczytu. `/dashboard` to pusty placeholder (powitanie + wylogowanie), pierwsza prawdziwa strona UI dla Usera w tym projekcie.

## Desired End State

`/dashboard` pokazuje Userowi wszystkie turnieje i ich spotkania; dla spotkań w aktywnym turnieju, które się jeszcze nie rozpoczęły, User widzi formularz typowania (edytowalny wielokrotnie do startu); dla pozostałych — tylko odczyt swojego typu lub "Brak typu".

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Przypisanie do turnieju | Niejawne uczestnictwo, brak nowej tabeli | FR-004 ogranicza MVP do jednego aktywnego turnieju naraz — nie ma czego przypisywać | Plan |
| Edycja typu | Upsert, edytowalny do startu meczu | FR-006 "do momentu rozpoczęcia" dopuszcza zmianę zdania | Plan |
| Widoczność cudzego typu | Odsłania się po starcie meczu | Dosłowne brzmienie NFR ("niewidoczny... przed rozpoczęciem") | Plan |
| Zakres turniejów widocznych Userowi | Wszystkie (aktywne + zamknięte) | Użytkownik chciał wglądu w historię, nie tylko bieżący turniej | Plan |
| Walidacja wyniku | Nieujemna liczba całkowita, bez górnego limitu | Prostota, pokrywa realistyczne wyniki sportowe | Plan |
| Umiejscowienie UI | Rozbudowa `/dashboard` | Strona już istnieje jako wejście Usera, zero nowego routingu | Plan |
| RLS select dla Admina | Dodane już teraz (nieużywane w UI) | S-05 wykorzysta bez kolejnej migracji | Plan |
| Reguły zapisu | Sprawdzane w kodzie ORAZ w RLS (dual-layer) | Pierwszy przypadek, gdy zwykły User (nie Admin) zapisuje dane — RLS to jedyna twarda granica | Plan |

## Scope

**In scope:** tabela `predictions` + RLS; rozszerzenie SELECT na `tournaments`/`matches` dla Usera; endpoint upsert typu; przebudowa `/dashboard` (lista turniejów/spotkań, formularz lub odczyt).

**Out of scope:** naliczanie punktów i ranking (S-05/S-06); UI pokazujący cudze typy po starcie meczu (RLS na to pozwala, ale nic z tego nie korzysta w tym plasterku); usuwanie/wycofywanie typu; górny limit wyniku; framework testowy.

## Architecture / Approach

Trzy fazy: (1) model danych + RLS z regułami czasowymi/statusowymi wbudowanymi bezpośrednio w polityki INSERT/UPDATE (nie tylko w kodzie, jak w poprzednich plasterkach Admin-only), (2) jeden endpoint `POST /api/matches/{id}/predictions` z upsertem i czytelnymi komunikatami błędu, (3) `/dashboard` renderujący formularz lub odczyt zależnie od roli/statusu/terminu, bez N+1 (trzy zapytania niezależnie od skali).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Model danych | Tabela `predictions` + RLS (select/insert/update z regułami czasu/statusu) | Polityki RLS z podzapytaniami do `matches`/`tournaments` — łatwo o błąd logiczny w warunku |
| 2. Endpoint API | Upsert typu z walidacją zod i regułami biznesowymi | Duplikacja logiki reguł między kodem a RLS musi pozostać spójna |
| 3. UI `/dashboard` | Lista turniejów/spotkań, formularz lub odczyt | Poprawne rozróżnienie stanów (rola/status/termin) dla każdego spotkania |

**Prerequisites:** S-02 (Users istnieją), S-03 (spotkania z terminem istnieją), F-01 (role Admin/User) — wszystkie ukończone.
**Estimated effort:** ~3 fazy, porównywalne do S-03 (podobny rozmiar: 1 migracja + 1 endpoint + 1 strona).

## Open Risks & Assumptions

- Zakłada się, że Admin nigdy nie potrzebuje typować (endpoint blokuje Admina 403) — zgodne z PRD Access Control, ale warto potwierdzić przy pierwszym użyciu produkcyjnym.
- RLS z podzapytaniami (join `matches`+`tournaments`) nie był dotąd używany w tym repo — wymaga starannej manualnej weryfikacji w Fazie 1 przed zbudowaniem na nim endpointu.

## Success Criteria (Summary)

- User może wytypować i wielokrotnie zmienić typ przed startem meczu w aktywnym turnieju.
- Typ jest zablokowany do edycji (i w UI, i przez RLS) po starcie meczu lub zamknięciu turnieju.
- Admin nie może typować; User nie widzi cudzych typów przed startem meczu.
