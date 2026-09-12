# Admin wprowadza wynik, system automatycznie nalicza punkty — Implementation Plan

## Overview

Admin ręcznie wprowadza faktyczny wynik spotkania (gospodarz/gość) na stronie, na której już zarządza spotkaniami turnieju. System natychmiast i synchronicznie nalicza punkty każdemu Userowi, który wytypował ten mecz, według stałej reguły: 3 pkt za dokładny wynik, 1 pkt za trafiony kierunek rozstrzygnięcia (wygrana gospodarzy / remis / wygrana gości) przy innym dokładnym wyniku, 0 pkt w przeciwnym razie. Wynik jest jednorazowy i nieedytowalny (zgodnie z Non-Goals PRD).

## Current State Analysis

- `matches` (S-03) nie ma dziś żadnej kolumny na faktyczny wynik; RLS ma tylko `admin_select_matches`, `admin_insert_matches`, `admin_delete_matches`, `user_select_matches` — brak jakiejkolwiek polityki UPDATE (`supabase/migrations/20260911130000_create_matches.sql`, `supabase/migrations/20260912090000_create_predictions.sql`).
- `predictions` (S-04) nie ma kolumny na naliczone punkty; RLS ma `admin_select_predictions`, `user_select_own_or_started_predictions`, `user_insert_own_prediction`, `user_update_own_prediction` (`WITH CHECK user_id = auth.uid()`) — żadna polityka nie pozwala Adminowi zapisać wartości do cudzego wiersza.
- Ustalony wzorzec z S-02 (`createAdminClient()`, service-role) był konieczny tam, gdzie trzeba było albo wywołać Supabase Admin API (`auth.admin.*`), albo zapisać do tabeli świadomie pozbawionej jakiejkolwiek polityki UPDATE (`profiles`). Tutaj żadna z tych przesłanek nie występuje — prostszym i spójniejszym rozwiązaniem są dwie nowe, zwykłe polityki RLS UPDATE dla Admina (`is_admin(auth.uid())`), analogiczne do istniejących `admin_select_*`/`admin_insert_*`, bez sięgania po klienta service-role.
- Wzorzec "reguła biznesowa sprawdzana w kodzie przed zapisem" (pobierz wiersz → sprawdź warunek → wykonaj lub odmów) ustalony w `src/pages/api/admin/matches/[id]/delete.ts` (S-03) i `src/pages/api/matches/[id]/predictions.ts` (S-04) ma tu bezpośrednie zastosowanie.
- `src/pages/admin/tournaments/[id]/matches.astro` (S-03) już listuje spotkania turnieju z formatowaniem `scheduled_at` przez `iso.slice(0, 16).replace("T", " ")` — ten sam wzorzec ma zastosowanie do wyświetlania wyniku.
- PRD Non-Goals: "Nie udostępniamy możliwości korekty raz wprowadzonego wyniku spotkania" — wpisanie wyniku musi być jednorazowe; druga próba dla tego samego meczu musi zostać jawnie odrzucona, nie cicho zignorowana.
- Roadmap S-04 odkłada "brak typu = 0 pkt" do egzekwowania w S-05 — ale bez tabeli uczestnictwa w turnieju (niejawne uczestnictwo, decyzja z S-04) nie ma dziś jednoznacznego zbioru "wszystkich Userów" turnieju. Ta zmiana świadomie NIE rozwiązuje tej niejednoznaczności: nalicza punkty wyłącznie dla istniejących wierszy `predictions` (realnie złożonych typów) i zostawia "materializację zer dla nie-typujących" jako decyzję przyszłego S-06 (ranking), które będzie miało pełny obraz potrzebny do agregacji.
- Dezaktywowanie konta (`profiles.disabled`, S-02) nie usuwa ani nie unieważnia istniejących wierszy `predictions` — naliczanie punktów w tej zmianie celowo ignoruje `disabled`, bo ocenia historyczny typ, nie bieżący stan konta.

## Desired End State

Po ukończeniu tej zmiany:

- Na `/admin/tournaments/[id]/matches`, dla spotkania które już się rozpoczęło (`scheduled_at <= now`) i nie ma jeszcze wpisanego wyniku, Admin widzi formularz wpisania wyniku (gospodarz/gość, liczby całkowite ≥ 0).
- Po wpisaniu wyniku: `matches.actual_home_score`/`actual_away_score` zostają ustawione; każdy istniejący wiersz `predictions` dla tego meczu dostaje `points` (3, 1 lub 0) obliczone natychmiast, synchronicznie, w tym samym żądaniu.
- Dla spotkania z już wpisanym wynikiem, Admin widzi wynik ("Wynik: X:Y") zamiast formularza — bez możliwości edycji.
- Próba ponownego POST dla meczu z już wpisanym wynikiem jest jawnie odrzucona z czytelnym komunikatem, bez zmiany danych.
- Wpisanie wyniku wymaga: turniej `active`, mecz już rozpoczęty (`scheduled_at <= now`); żadna z tych reguł nie zależy od liczby złożonych typów (0 typów jest dozwolone — wynik meczu istnieje niezależnie od tego, czy ktoś typował).
- User NIE widzi jeszcze swoich punktów nigdzie w UI — to celowo pozostaje w zakresie S-06.

### Key Discoveries:

- `admin_update_matches`/`admin_update_predictions` (nowe polityki RLS, `is_admin(auth.uid())`) wystarczają — nie ma potrzeby `createAdminClient()`/service-role dla tej zmiany, w przeciwieństwie do S-02.
- Naliczanie punktów dla wielu wierszy `predictions` jednym zapytaniem: `upsert` pełnych wierszy (z już istniejącymi `id`, `match_id`, `user_id`, `predicted_home_score`, `predicted_away_score` pobranymi selectem, plus obliczone `points`) z `onConflict: "id"` — analogiczny wzorzec do `upsert` z S-04, tym razem po kluczu głównym zamiast unikalnego ograniczenia złożonego.
- Reguła punktacji: dokładny wynik (`predicted_home == actual_home && predicted_away == actual_away`) → 3; w przeciwnym razie trafiony kierunek (`sign(predicted_home - predicted_away) == sign(actual_home - actual_away)`, gdzie `sign` mapuje na wygrana-gospodarzy/remis/wygrana-gości) → 1; w przeciwnym razie → 0. Remis:remis różnymi wynikami liczy się jako 1 pkt (trafiony kierunek), nie 3 — to najbardziej ryzykowny przypadek brzegowy do jawnego przetestowania.

## What We're NOT Doing

- Nie materializujemy wierszy `predictions` z `points = 0` dla Userów, którzy nie złożyli typu — to decyzja przyszłego S-06 (ranking), które zna właściwy zbiór "wszystkich Userów" do agregacji.
- Nie pokazujemy Userowi jego punktów nigdzie w UI w tym plasterku — wyłączny zakres S-06.
- Nie pozwalamy Adminowi edytować/korygować raz wprowadzonego wyniku — zgodnie z Non-Goals PRD.
- Nie blokujemy wpisania wyniku ze względu na liczbę złożonych typów (0 typów jest dozwolone).
- Nie pomijamy dezaktywowanych Userów przy naliczaniu punktów.
- Nie dodajemy frameworka testowego — konwencja repo (lint/build/manual) bez zmian.

## Implementation Approach

Trzy fazy w kolejności zależności: (1) kolumny `matches.actual_*`/`predictions.points` + dwie nowe polityki RLS UPDATE dla Admina, (2) endpoint API wpisania wyniku z regułami biznesowymi w kodzie (turniej aktywny, mecz rozpoczęty, wynik jeszcze nie istnieje) i synchronicznym naliczeniem punktów wszystkim złożonym typom, (3) rozbudowa istniejącej strony `/admin/tournaments/[id]/matches` o formularz/odczyt wyniku.

## Critical Implementation Details

**Reguła punktacji — dokładna definicja "trafionego kierunku".** `sign(predicted_home - predicted_away)` i `sign(actual_home - actual_away)` porównane jako liczby (dodatnia = wygrana gospodarzy, zero = remis, ujemna = wygrana gości). Najbardziej mylący przypadek: predykcja 2:2 (remis) przy faktycznym wyniku 1:1 (też remis) — to 1 pkt (trafiony kierunek, remis), NIE 3 pkt (wynik się różni). Testy manualne w Fazie 2 muszą jawnie pokryć ten przypadek, bo to najbardziej prawdopodobne miejsce błędu implementacji wobec Guardrail "poprawność liczenia punktów".

**RLS zamiast service-role — świadome odejście od wzorca S-02.** S-02 użyło `createAdminClient()`, bo `profiles` celowo nie ma żadnej polityki UPDATE i potrzebny był dostęp do `auth.admin.*`. Tutaj żadna z tych przesłanek nie zachodzi — `matches`/`predictions` dostają zwykłe polityki `admin_update_*` (`is_admin(auth.uid())`), spójne z istniejącymi `admin_select_*`/`admin_insert_*`/`admin_delete_*` na tych samych tabelach. Endpoint używa zwykłego `createClient()`, nie service-role.

## Phase 1: Model danych — wynik meczu, punkty typu, RLS

### Overview

Rozszerzamy `matches` o faktyczny wynik i `predictions` o naliczone punkty, oraz dodajemy polityki RLS pozwalające Adminowi je zapisać.

### Changes Required:

#### 1. Migracja SQL

**File**: `supabase/migrations/20260912100000_add_match_results_and_prediction_points.sql` (nowy plik)

**Intent**: Dodać kolumny na faktyczny wynik meczu i naliczone punkty typu, oraz umożliwić Adminowi ich zapis przez RLS.

**Contract**: `ALTER TABLE public.matches ADD COLUMN actual_home_score integer CHECK (actual_home_score >= 0), ADD COLUMN actual_away_score integer CHECK (actual_away_score >= 0);` (nullable — `NULL` oznacza "wynik jeszcze nie wprowadzony"). `ALTER TABLE public.predictions ADD COLUMN points integer CHECK (points IN (0, 1, 3));` (nullable — `NULL` oznacza "jeszcze nie ocenione"). Nowe polityki: `create policy "admin_update_matches" on public.matches for update using (public.is_admin(auth.uid()));` i `create policy "admin_update_predictions" on public.predictions for update using (public.is_admin(auth.uid()));` (obie bez dodatkowego `WITH CHECK` — `USING` wystarcza, bo jedyny pisze-do-cudzych-wierszy aktor to Admin, weryfikowany przez `is_admin()`).

#### 2. Typy domenowe

**File**: `src/types.ts`

**Intent**: Odzwierciedlić nowe kolumny w typach `Match` i `Prediction`.

**Contract**: `Match` dostaje `actual_home_score: number | null` i `actual_away_score: number | null`. `Prediction` dostaje `points: number | null`.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się czysto na zalinkowanym zdalnym projekcie Supabase: `npx supabase db push`; `npx supabase migration list` potwierdza zgodność `Local`/`Remote`.
- Type-check + build przechodzą: `npm run build`.

#### Manual Verification:

- W Supabase Studio widoczne nowe kolumny na `matches` i `predictions`, wszystkie istniejące wiersze mają `NULL`.
- Testowe konto Admina może zaktualizować `actual_home_score` na istniejącym meczu i `points` na istniejącym typie (SQL Editor lub REST); testowe konto User nie może zaktualizować żadnego z nich (RLS blokuje).

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie RLS, zanim przejdziesz do endpointu, który się na nich opiera.

---

## Phase 2: Endpoint API — wprowadzenie wyniku i naliczenie punktów

### Overview

Jedyny endpoint tego plasterka: wpisuje faktyczny wynik meczu i synchronicznie nalicza punkty każdemu istniejącemu typowi dla tego meczu.

### Changes Required:

#### 1. Endpoint wprowadzenia wyniku

**File**: `src/pages/api/admin/matches/[id]/result.ts` (nowy plik)

**Intent**: Przyjąć faktyczny wynik meczu, zweryfikować regułami biznesowymi (turniej aktywny, mecz rozpoczęty, wynik jeszcze nie istnieje), zapisać go, pobrać wszystkie istniejące typy dla tego meczu, obliczyć i zapisać każdemu punkty (3/1/0), i przekierować z powrotem na stronę spotkań tego turnieju.

**Contract**: Eksportuje `export const prerender = false;` i `POST: APIRoute`. Pierwsza linia: `requireRole(context.locals, "admin")`. `match_id` z `context.params.id`. Zod: `actual_home_score`/`actual_away_score` — `z.coerce.number().int().min(0, ...)` (te same reguły co w S-04). Zwykłym `createClient()` pobiera jednym zapytaniem `actual_home_score, actual_away_score, scheduled_at, tournament_id, tournament:tournaments(status)` dla `match_id` — brak wiersza → redirect `/admin/tournaments?error=Nie znaleziono spotkania`; `actual_home_score !== null` (wynik już wprowadzony) → redirect na `/admin/tournaments/${tournament_id}/matches?error=...` z "Wynik już wprowadzony"; `tournament.status !== "active"` → redirect z "Nie można wprowadzić wyniku dla zamkniętego turnieju"; `new Date(scheduled_at) > new Date()` → redirect z "Nie można wprowadzić wyniku przed rozpoczęciem meczu". Błąd walidacji zod → redirect z pierwszym komunikatem błędu. Sukces walidacji i reguł: (a) `update({ actual_home_score, actual_away_score }).eq("id", match_id)` na `matches`; (b) `select("id, predicted_home_score, predicted_away_score").eq("match_id", match_id)` na `predictions`; (c) dla każdego wiersza oblicza `points` wg reguły z Critical Implementation Details; (d) dla każdego wiersza osobne `update({ points }).eq("id", prediction.id)` na `predictions` (równolegle, `Promise.all`) — **nie** `upsert` (patrz uwaga poniżej). Błąd na dowolnym z kroków (a)-(d) → redirect z ogólnym komunikatem "Nie udało się zapisać wyniku". Sukces → `context.redirect(`/admin/tournaments/${tournament_id}/matches`)` bez query param.

**Uwaga (odkryta podczas implementacji)**: kontrakt pierwotnie zakładał `upsert` po `id` do zapisu punktów (patrz Key Discoveries). W praktyce Postgres RLS sprawdza politykę INSERT dla wiersza proponowanego przez `upsert`, nawet jeśli zawsze trafi w `ON CONFLICT` — a Admin ma na `predictions` tylko politykę UPDATE, nie INSERT. Efekt: `matches.update(...)` zapisywał się poprawnie, ale `predictions.upsert(...)` był odrzucany przez RLS, więc wynik meczu zapisywał się, a punkty nie. Naprawione zamianą na zwykły `update({ points }).eq("id", ...)` per wiersz — ściślejsze uprawnienie (nigdy nie tworzymy tu nowych typów, tylko oceniamy istniejące), bez dodawania Adminowi zbędnej polityki INSERT na `predictions`.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check + build przechodzą: `npm run build`

#### Manual Verification:

- Zalogowany jako Admin, poprawny POST dla rozpoczętego meczu w aktywnym turnieju zapisuje wynik i przekierowuje bez błędu.
- Typ z dokładnie trafionym wynikiem dostaje 3 pkt.
- Typ z trafionym kierunkiem (w tym remis:remis różnymi wynikami, np. predykcja 2:2 przy wyniku 1:1) ale innym dokładnym wynikiem dostaje 1 pkt.
- Typ ze złym kierunkiem (np. predykcja wygranej gospodarzy, faktyczna wygrana gości) dostaje 0 pkt.
- Mecz bez żadnych złożonych typów: POST się udaje, brak błędu, brak wierszy `predictions` do zaktualizowania.
- Drugi POST dla tego samego meczu (wynik już wprowadzony) przekierowuje z czytelnym błędem, dane się nie zmieniają.
- POST dla meczu, który się jeszcze nie rozpoczął, przekierowuje z błędem.
- POST dla meczu w zamkniętym turnieju przekierowuje z błędem.
- Bezpośredni POST jako User zwraca 403.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie wszystkie dziewięć ścieżek powyżej — zwłaszcza przypadek remis:remis różnymi wynikami — zanim przejdziesz do UI.

---

## Phase 3: UI — formularz i odczyt wyniku na stronie spotkań

### Overview

Rozbudowujemy istniejącą stronę `/admin/tournaments/[id]/matches` o formularz wpisania wyniku (dla rozpoczętych meczów bez wyniku) i odczyt wyniku (dla meczów z już wpisanym wynikiem).

### Changes Required:

#### 1. Formularz/odczyt wyniku

**File**: `src/pages/admin/tournaments/[id]/matches.astro`

**Intent**: Dać Adminowi możliwość wpisania wyniku bezpośrednio przy każdym rozpoczętym meczu bez wyniku, i zobaczyć już wpisany wynik przy pozostałych.

**Contract**: Przy każdym elemencie listy spotkań: jeśli `match.actual_home_score !== null` → renderuje "Wynik: {actual_home_score}:{actual_away_score}" (odczyt, bez formularza); w przeciwnym razie, jeśli `new Date(match.scheduled_at) <= now` (mecz się rozpoczął) → renderuje `<form method="POST" action={`/api/admin/matches/${match.id}/result`}>` z polami `actual_home_score`/`actual_away_score` (`input type="number" min="0" required`) i przyciskiem "Zapisz wynik"; w przeciwnym razie (mecz się jeszcze nie rozpoczął) nie renderuje nic dodatkowego (jak dziś).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check + build przechodzą: `npm run build`

#### Manual Verification:

- Rozpoczęty mecz bez wyniku pokazuje formularz; wpisanie wyniku przez formularz natychmiast pokazuje "Wynik: X:Y" po przekierowaniu, bez formularza.
- Mecz z już wpisanym wynikiem nigdy nie pokazuje formularza (brak możliwości edycji).
- Mecz, który się jeszcze nie rozpoczął, nie pokazuje ani formularza, ani wyniku.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie wszystkie trzy ścieżki powyżej — to ostatnia faza tej zmiany.

---

## Testing Strategy

### Unit Tests:

- Brak — projekt nie ma frameworka testowego (zgodnie z F-01…S-04 i `AGENTS.md`); pokrycie zapewnia lint + build + weryfikacja manualna.

### Integration Tests:

- Brak (jak wyżej).

### Manual Testing Steps:

1. Przygotować aktywny turniej z co najmniej jednym meczem, którego termin już minął (wstawionym ręcznie przez SQL Editor, wzorem weryfikacji z S-03/S-04).
2. Jako co najmniej dwóch różnych Userów, złożyć różne typy na ten mecz: jeden z dokładnie trafionym przyszłym wynikiem, jeden z trafionym kierunkiem ale innym wynikiem (w tym wariant remis:remis różnymi liczbami), jeden ze złym kierunkiem.
3. Jako Admin, wejść na `/admin/tournaments/{id}/matches`, wpisać faktyczny wynik przez formularz.
4. Potwierdzić w Supabase Studio, że każdy typ dostał poprawną liczbę punktów (3, 1, 0) zgodnie z regułą.
5. Spróbować wpisać wynik ponownie dla tego samego meczu — potwierdzić czytelny błąd, brak zmiany danych.
6. Spróbować wpisać wynik dla meczu, który się jeszcze nie rozpoczął — potwierdzić błąd.

## Performance Considerations

Naliczanie punktów to jeden `select` + N równoległych `update` (jeden na wiersz `predictions`, nie `upsert` — patrz uwaga w Fazie 2) niezależnie od liczby typów (dziesiątki, zgodnie z NFR skali pojedynczego biura) — brak N+1 w sensie zapytań sekwencyjnych (równoległe przez `Promise.all`), brak potrzeby kolejki/asynchroniczności przy tej skali.

## Migration Notes

Migracja jest addytywna (`ADD COLUMN` nullable) — brak backfillu, wszystkie istniejące wiersze `matches`/`predictions` dostają `NULL` (spójne z "wynik/punkty jeszcze nieustalone").

## References

- Wzorzec reguły biznesowej w kodzie przed zapisem: `context/changes/admin-adds-matches/plan.md` (S-03), `context/changes/user-submits-prediction/plan.md` (S-04)
- Wzorzec upsert po kluczu: `context/changes/user-submits-prediction/plan.md` (S-04, `onConflict: "user_id,match_id"`)
- PRD: `context/foundation/prd.md` (US-01, FR-007, FR-008, Business Logic, Guardrails, Non-Goals)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Model danych — wynik meczu, punkty typu, RLS

#### Automated

- [x] 1.1 Migracja aplikuje się czysto (`npx supabase db push`, `npx supabase migration list`) — ccd46c2
- [x] 1.2 Type-check + build przechodzą (`npm run build`) — ccd46c2

#### Manual

- [x] 1.3 Nowe kolumny widoczne w Supabase Studio, wszystkie istniejące wiersze mają `NULL` — ccd46c2
- [x] 1.4 Admin może zaktualizować `actual_home_score`/`points`; User nie może (RLS blokuje) — ccd46c2

### Phase 2: Endpoint API — wprowadzenie wyniku i naliczenie punktów

#### Automated

- [x] 2.1 Lint przechodzi (`npm run lint`) — f271769
- [x] 2.2 Type-check + build przechodzą (`npm run build`) — f271769

#### Manual

- [x] 2.3 Poprawny POST zapisuje wynik i przekierowuje bez błędu — 32d86f7
- [x] 2.4 Dokładny wynik → 3 pkt — 32d86f7
- [x] 2.5 Trafiony kierunek (w tym remis:remis różnymi wynikami) → 1 pkt — 32d86f7
- [x] 2.6 Zły kierunek → 0 pkt — 32d86f7
- [x] 2.7 Mecz bez typów: POST się udaje, brak błędu — 32d86f7
- [x] 2.8 Drugi POST dla tego samego meczu zwraca błąd, brak zmiany danych — 32d86f7
- [x] 2.9 POST dla meczu nierozpoczętego zwraca błąd — 32d86f7
- [x] 2.10 POST dla zamkniętego turnieju zwraca błąd — 32d86f7
- [x] 2.11 Bezpośredni POST jako User zwraca 403 — 32d86f7

### Phase 3: UI — formularz i odczyt wyniku na stronie spotkań

#### Automated

- [x] 3.1 Lint przechodzi (`npm run lint`) — f271769
- [x] 3.2 Type-check + build przechodzą (`npm run build`) — f271769

#### Manual

- [x] 3.3 Rozpoczęty mecz bez wyniku pokazuje formularz; zapis pokazuje wynik bez formularza — 32d86f7
- [x] 3.4 Mecz z wynikiem nigdy nie pokazuje formularza — 32d86f7
- [x] 3.5 Mecz nierozpoczęty nie pokazuje ani formularza, ani wyniku — 32d86f7
