# Admin zamyka turniej, system wyłania zwycięzców — Plan Brief

> Full plan: `context/changes/admin-closes-tournament-and-winners/plan.md`

## What & Why

Admin może jawnie zamknąć aktywny turniej (jednokierunkowo); system wyłania zwycięzcę/zwycięzców (dopuszczalny remis/ex aequo, także przy 0 pkt) na już istniejącej stronie rankingu z S-06. To domyka główny łańcuch M-1: typowanie → punktacja → ranking → zamknięcie, realizując FR-009 i FR-011.

## Starting Point

`tournaments.status` (`active`/`closed`) istnieje od S-01, ale żadna polityka RLS nie pozwala go zmienić — dziś nikt (nawet Admin) nie może zamknąć turnieju. `tournament_ranking()` (S-06) już działa identycznie dla `active` i `closed`, świadomie zaprojektowane pod reużycie przez ten plasterek. Po zamknięciu, zapis do meczów/typów/wyników jest już dziś blokowany na poziomie aplikacji (S-03/S-04/S-05) — zamknięcie samo w sobie zamraża dane.

## Desired End State

Admin klika "Zamknij turniej" na `/admin/tournaments` (z potwierdzeniem i licznikiem meczów bez wyniku), turniej przechodzi `active` → `closed` jednokierunkowo. Na `/tournaments/[id]/ranking` zamkniętego turnieju pojawia się banner "🏆 Zwycięzca(y)" i oznaczenie 🏆 przy właściwych wierszach, liczone na żywo — bez nowej tabeli.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Blokada zamknięcia | Brak blokady, tylko informacyjny licznik nierozegranych meczów | FR-011 nie wymaga blokady; decyzja należy do Admina | Plan |
| Odwracalność | Zamknięcie jednokierunkowe, bez "otwórz ponownie" | Spójne z Non-Goals PRD (brak korekt) i minimalnym zakresem MVP | Plan |
| Umiejscowienie zwycięzców | Na tej samej stronie rankingu (S-06), nie osobna strona | Reużywa dokładnie infrastrukturę S-06, zero nowych tras | Plan |
| Remis przy 0 pkt | Wszyscy z 0 pkt są zwycięzcami, bez wyjątku | Spójne z PRD ("remis jest akceptowalnym wynikiem") bez specjalnego przypadku | Plan |
| Potwierdzenie zamknięcia | JS `confirm()` przed submitem | Spójne z istniejącym wzorcem "Dezaktywuj" w `users.astro` | Plan |
| Umiejscowienie przycisku | Na liście `/admin/tournaments`, nie na stronie rankingu | Spójne z tym, że inne akcje zapisu Admina żyją w `/admin/*` | Plan |
| Ostrzeżenie o nierozegranych meczach | Konkretny licznik przy przycisku, nie ogólny tekst | Admin widzi realną skalę ryzyka przed kliknięciem | Plan |
| Przechowywanie zwycięzców | Liczeni na żywo z `tournament_ranking()`, brak nowej tabeli | Dane już zamrożone po zamknięciu (brak zapisu); prostsze niż snapshot | Plan |

## Scope

**In scope:**
- Polityka RLS `admin_update_tournaments` (UPDATE)
- Endpoint `POST /api/admin/tournaments/[id]/close`
- Przycisk "Zamknij turniej" + licznik na `/admin/tournaments`
- Banner + oznaczenie zwycięzców na `/tournaments/[id]/ranking`

**Out of scope:**
- Ponowne otwarcie zamkniętego turnieju
- Blokowanie zamknięcia przy nierozegranych meczach
- Nowa tabela/kolumna na zwycięzców
- Zmiany w `tournament_ranking()` samej w sobie

## Architecture / Approach

Trzy fazy: RLS (wzorem S-05, zwykłe `is_admin()`, bez service-role) → endpoint zamknięcia (wzorem `disable.ts`, bez ciała żądania) → UI (rozbudowa dwóch istniejących stron, zero nowych tras). Zwycięzcy wyliczani w pamięci ze strony rankingu: pierwszy wiersz posortowanego wyniku `tournament_ranking()` daje maksimum punktów, wszystkie wiersze z tym maksimum to zwycięzcy.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. RLS | Polityka `admin_update_tournaments` | Brak — jednowierszowa polityka wzorem istniejących |
| 2. Endpoint zamknięcia | `POST /api/admin/tournaments/[id]/close` | Musi poprawnie odrzucić drugi POST na już zamknięty turniej |
| 3. UI | Przycisk + licznik, banner + oznaczenie zwycięzców | Poprawne wyznaczenie zwycięzców przy remisie (w tym przy 0 pkt) |

**Prerequisites:** S-06 (gotowe), F-01 (gotowe)
**Estimated effort:** ~1 sesja, 3 fazy

## Open Risks & Assumptions

- Zakładamy, że Admin świadomie akceptuje ryzyko przedwczesnego zamknięcia (mecze bez wyniku) — brak twardej blokady, tylko licznik informacyjny.
- Brak persystencji zwycięzców oznacza, że wynik jest zawsze przeliczany na żywo — jeśli Admin dezaktywuje Usera po zamknięciu turnieju, zniknie on z rankingu/zwycięzców (spójne z zachowaniem `tournament_ranking()` z S-06, nie nowe ryzyko).

## Success Criteria (Summary)

- Admin może zamknąć aktywny turniej jednym kliknięciem (z potwierdzeniem), jednokierunkowo.
- Strona rankingu zamkniętego turnieju pokazuje poprawnych zwycięzców (w tym przy remisie i przy 0 pkt), bez zmian dla turniejów aktywnych.
