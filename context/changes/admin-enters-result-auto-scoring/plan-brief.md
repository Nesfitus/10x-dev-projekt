# Admin wprowadza wynik, system automatycznie nalicza punkty — Plan Brief

> Full plan: `context/changes/admin-enters-result-auto-scoring/plan.md`

## What & Why

Admin ręcznie wprowadza faktyczny wynik spotkania; system natychmiast i automatycznie nalicza Userom punkty według stałej reguły (3/1/0). To gwiazda przewodnia produktu — dowodzi kluczowej propozycji wartości (automatyczne liczenie punktów zamiast ręcznego liczenia w Excelu) i jest głównym kryterium sukcesu z PRD.

## Starting Point

`matches` (S-03) ma harmonogram, ale brak kolumny na faktyczny wynik. `predictions` (S-04) ma typy Userów, ale brak kolumny na naliczone punkty. Żadna z tabel nie ma polityki RLS UPDATE dla Admina.

## Desired End State

Na stronie spotkań turnieju, Admin wpisuje wynik rozpoczętego meczu przez formularz; system natychmiast nalicza punkty (3/1/0) każdemu istniejącemu typowi na ten mecz. Wynik jest jednorazowy — druga próba zwraca błąd. User jeszcze nigdzie nie widzi swoich punktów (to S-06).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Przechowywanie wyniku | Kolumny na `matches` | Relacja 1:1, zero nowych tabel/joinów |
| Przechowywanie punktów | Kolumna `points` na `predictions` | Punkty żyją obok typu, którego dotyczą; S-06 sumuje bez joina |
| Zera dla braku typu | Odłożone do S-06 | S-05 zostaje wąsko skupiony na ocenie złożonych typów |
| Zapis Admina | Zwykłe RLS `admin_update_*`, nie service-role | Brak potrzeby Admin API — prostsze niż wzorzec z S-02 |
| Blokada przed startem meczu | Tak | Wynik nie może istnieć przed meczem |
| Zależność od statusu turnieju | Wymaga `active` | Spójne z regułą z S-03/S-04 |
| Ponowna próba wpisania wyniku | Odrzuć z błędem | Zgodne z Non-Goals PRD (brak korekty) |
| Widoczność punktów dla Usera | Brak UI teraz | Wyłączny zakres S-06 |
| Wynik bez żadnych typów | Dozwolony | Wynik meczu istnieje niezależnie od typowania |
| Dezaktywowani Userzy | Nadal liczeni | Ocena historycznego typu, nie stanu konta |
| Zakres testów | 4 przypadki brzegowe reguły 3/1/0 | Guardrail "poprawność liczenia punktów" wymaga pełnego pokrycia |
| UI | Rozbudowa istniejącej strony spotkań | Zero nowego routingu |

## Scope

**In scope:** kolumny `actual_home_score`/`actual_away_score`/`points`; RLS `admin_update_matches`/`admin_update_predictions`; endpoint wpisania wyniku + synchroniczne naliczanie punktów; formularz/odczyt na stronie spotkań.

**Out of scope:** ranking i widoczność punktów dla Usera (S-06); materializacja zer dla nie-typujących; edycja/korekta wyniku; framework testowy.

## Architecture / Approach

Trzy fazy: (1) model danych + RLS (zwykłe polityki Admina, nie service-role — świadome odejście od wzorca S-02, bo tu nie ma potrzeby Admin API), (2) jeden endpoint łączący zapis wyniku z synchronicznym przeliczeniem punktów (select + upsert po `id`, bez N+1), (3) rozszerzenie istniejącej strony Admina o formularz/odczyt.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Model danych | Kolumny + RLS `admin_update_*` | Poprawność nowych polityk RLS |
| 2. Endpoint API | Wpisanie wyniku + naliczenie punktów 3/1/0 | Błąd w regule punktacji (Guardrail!) — zwłaszcza remis:remis |
| 3. UI | Formularz/odczyt wyniku | Poprawne rozróżnienie stanów (brak wyniku + rozpoczęty vs nierozpoczęty vs z wynikiem) |

**Prerequisites:** S-04 (typy istnieją), F-01 (role) — oba ukończone.
**Estimated effort:** ~3 fazy, porównywalne do S-04.

## Open Risks & Assumptions

- Materializacja zer dla nie-typujących pozostaje nierozwiązana — przekazana świadomie do S-06, które musi zdefiniować zbiór "wszystkich Userów" turnieju.
- Reguła punktacji (zwłaszcza remis:remis) to najbardziej ryzykowne miejsce błędu — wymaga jawnego testu manualnego, nie tylko "działa".

## Success Criteria (Summary)

- Wpisanie wyniku natychmiast nalicza poprawne punkty (3/1/0) każdemu złożonemu typowi, w tym poprawnie dla przypadku remis:remis różnymi wynikami.
- Wynik jest jednorazowy — druga próba zwraca czytelny błąd, dane się nie zmieniają.
- User nie ma dostępu do wpisywania wyniku (403); Admin nie może wpisać wyniku przed startem meczu ani dla zamkniętego turnieju.
