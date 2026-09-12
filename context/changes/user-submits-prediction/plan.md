# User typuje wynik spotkania — Implementation Plan

## Overview

Wprowadzamy czwartą tabelę domenową — `predictions` — i pozwalamy Userowi wytypować wynik spotkania (gospodarz/gość) do momentu jego rozpoczęcia, z możliwością wielokrotnej zmiany typu przed startem (upsert). Typ innego użytkownika pozostaje niewidoczny przed startem meczu i odsłania się po jego rozpoczęciu (NFR). To pierwszy plasterek, w którym zwykły User (nie Admin) zapisuje dane — wymaga rozszerzenia RLS `tournaments`/`matches` o dostęp odczytu dla Userów, dotąd całkowicie Admin-only.

## Current State Analysis

- `tournaments` i `matches` mają dziś RLS wyłącznie Admin-only (`admin_select_tournaments`, `admin_select_matches` — `supabase/migrations/20260911100000_create_tournaments.sql`, `supabase/migrations/20260911130000_create_matches.sql`); User nie ma dziś żadnego dostępu do żadnej z tych tabel.
- `/dashboard` (`src/pages/dashboard.astro`) jest dziś placeholderem (powitanie + wylogowanie) — to pierwsza strona z realnym UI dla Usera w tym projekcie.
- Middleware (`src/middleware.ts:17-30`) już wylogowuje dezaktywowane konta przy każdym żądaniu — RLS oparte o `auth.uid() is not null` jest więc wystarczające bez dodatkowego sprawdzania `disabled` w polityce.
- Wzorzec z S-02/S-03 ("reguła biznesowa żyje w kodzie API, RLS jest tylko bramką Admin-only") nie wystarcza tutaj: piszącym jest zwykły User, więc RLS musi samodzielnie egzekwować "tylko aktywny turniej" i "tylko przed startem meczu" — inaczej User mógłby ominąć endpoint i uderzyć bezpośrednio w Supabase REST API własną sesją.
- `requireRole()` (`src/lib/auth.ts`) już obsługuje dowolną rolę parametryzowaną — wywołanie `requireRole(locals, "user")` (odwrotność dotychczasowego `"admin"`) będzie pierwszym takim użyciem w repo.
- Wzorzec normalizacji/formatowania `scheduled_at` (dopisanie `:00Z`, wyświetlanie przez `iso.slice(0, 16).replace("T", " ")`, nigdy `toLocaleString()`) ustalony w S-03 (`src/pages/api/admin/tournaments/[id]/matches.ts`, `src/pages/admin/tournaments/[id]/matches.astro`) ma bezpośrednie zastosowanie tutaj.
- Brak frameworka testowego (potwierdzone w F-01/S-01/S-02/S-03 i `AGENTS.md`) — weryfikacja to lint + build + manualna.

## Desired End State

Po ukończeniu tej zmiany:

- `/dashboard` pokazuje Userowi wszystkie turnieje (aktywne i zamknięte), a dla każdego — jego spotkania posortowane rosnąco wg terminu.
- Dla spotkania należącego do aktywnego turnieju, które jeszcze się nie rozpoczęło, User widzi formularz typowania (gospodarz/gość, liczby całkowite ≥ 0), wstępnie wypełniony jego dotychczasowym typem, jeśli istnieje — może go dowolnie wielokrotnie nadpisywać do startu meczu.
- Dla spotkania już rozpoczętego lub należącego do zamkniętego turnieju, User widzi tylko odczyt: swój zapisany typ albo "Brak typu", bez możliwości edycji.
- Próba zapisania/edycji typu po starcie meczu lub dla zamkniętego turnieju jest odrzucana zarówno przez endpoint (czytelny komunikat), jak i przez RLS (twarda granica, na wypadek ominięcia endpointu).
- Admin ma już przygotowany (nieużywany jeszcze w UI) dostęp select do wszystkich typów — przyszły S-05 (naliczanie punktów) go wykorzysta bez kolejnej migracji.
- Brak nowej tabeli/mechanizmu "przypisania do turnieju" — każdy nie-dezaktywowany User niejawnie uczestniczy we wszystkim, co widzi (spójne z FR-004: jeden aktywny turniej naraz).

### Key Discoveries:

- Unikalne ograniczenie `(user_id, match_id)` w nowej tabeli jest wymagane przez `upsert(..., { onConflict: "user_id,match_id" })` — bez niego Supabase nie ma jak rozstrzygnąć konfliktu przy ponownym typowaniu.
- NFR "typ pozostaje niewidoczny... przed rozpoczęciem spotkania" implikuje odsłonięcie PO starcie — polityka SELECT dla Usera musi to uwzględniać (`user_id = auth.uid() OR mecz już się rozpoczął`), nawet jeśli żadna strona w tym plasterku jeszcze nie renderuje cudzych typów (patrz Critical Implementation Details).
- Supabase JS pozwala na zagnieżdżone selecty przez relację FK (`matches.tournament_id → tournaments.id`) — endpoint może pobrać `scheduled_at` i status turnieju jednym zapytaniem (`.select("scheduled_at, tournament:tournaments(status)")`), respektując RLS obu tabel.

## What We're NOT Doing

- Nie budujemy żadnej tabeli/UI "przypisania użytkownika do turnieju" — niejawne uczestnictwo (patrz Key Discoveries), zgodnie z decyzją z interview.
- Nie budujemy UI pokazującego typy innych użytkowników po starcie meczu — polityka RLS na to pozwala (przyszłościowo), ale w tym plasterku żadna strona z niej nie korzysta.
- Nie liczymy punktów ani nie budujemy rankingu — to S-05/S-06.
- Nie pozwalamy Userowi usuwać/wycofywać raz złożonego typu — tylko nadpisanie (upsert) do startu meczu.
- Nie dodajemy górnego limitu liczbowego dla wytypowanego wyniku — tylko nieujemna liczba całkowita.
- Nie dodajemy frameworka testowego — konwencja repo (lint/build/manual) bez zmian.

## Implementation Approach

Trzy fazy w kolejności zależności: (1) tabela `predictions` + RLS (włącznie z rozszerzeniem dostępu odczytu Usera do `tournaments`/`matches`), (2) endpoint API upsert z regułami biznesowymi w kodzie (czytelne komunikaty) I w RLS (twarda granica — patrz Critical Implementation Details), (3) przebudowa `/dashboard` z placeholdera na widok turniejów/spotkań/formularza typowania.

## Critical Implementation Details

**Podwójna warstwa egzekwowania reguł (kod + RLS), inaczej niż w S-02/S-03.** W S-02/S-03 jedynym piszącym był Admin, więc RLS ograniczał się do bramki `is_admin()`, a reguły biznesowe ("tylko aktywny turniej", "nie po starcie") żyły wyłącznie w kodzie endpointu. Tutaj piszącym jest zwykły User z własną sesją — endpoint sprawdza reguły dla czytelnego komunikatu błędu, ale **RLS musi niezależnie egzekwować te same reguły** w `WITH CHECK` polityk INSERT/UPDATE, bo inaczej User mógłby ominąć endpoint i wysłać żądanie bezpośrednio do Supabase REST API własnym tokenem sesji, z pominięciem walidacji aplikacji.

**RLS SELECT przygotowuje odsłonięcie po starcie meczu, ale żadna strona z tego jeszcze nie korzysta.** Polityka `user_select_own_or_started_predictions` celowo pozwala każdemu zalogowanemu Userowi odczytać cudzy typ, gdy mecz już się rozpoczął (zgodnie z dosłownym brzmieniem NFR) — to świadomie przygotowany grunt pod przyszłe funkcje (np. S-06), nie martwy kod: `admin_select_predictions` jest analogicznym, celowo wyprzedzającym przygotowaniem pod S-05.

**Upsert wymaga jawnego `onConflict`.** `supabase.from("predictions").upsert(row, { onConflict: "user_id,match_id" })` rozstrzyga konflikt po unikalnym ograniczeniu z Fazy 1 — to pierwsze użycie `upsert` w tym repo (S-01/S-02/S-03 używały tylko `insert`/`update`/`delete` osobno).

**Formatowanie `scheduled_at` po ustalonym wzorcu z S-03.** Wyświetlanie terminu spotkania w `/dashboard` używa dokładnie tej samej funkcji `iso.slice(0, 16).replace("T", " ")` (nigdy `toLocaleString()`) co `src/pages/admin/tournaments/[id]/matches.astro` — ta sama uwaga o strefach czasowych z S-03 ma tu zastosowanie bez zmian.

## Phase 1: Model danych — tabela `predictions`, rozszerzone RLS

### Overview

Tworzymy czwartą tabelę domenową i rozszerzamy dostęp odczytu Usera do `tournaments`/`matches`, dotąd Admin-only.

### Changes Required:

#### 1. Migracja SQL

**File**: `supabase/migrations/20260912090000_create_predictions.sql` (nowy plik)

**Intent**: Utworzyć tabelę `predictions` (jeden typ na parę User+spotkanie, edytowalny do startu meczu) z RLS egzekwującym zarówno widoczność (NFR), jak i reguły zapisu (tylko aktywny turniej, tylko przed startem), oraz rozszerzyć istniejące tabele `tournaments`/`matches` o dostęp SELECT dla dowolnego zalogowanego Usera.

**Contract**: Tabela `public.predictions`: `id uuid primary key default gen_random_uuid()`, `match_id uuid not null references public.matches (id) on delete cascade`, `user_id uuid not null references auth.users (id)`, `predicted_home_score integer not null check (predicted_home_score >= 0)`, `predicted_away_score integer not null check (predicted_away_score >= 0)`, `created_at timestamptz not null default now()`, `unique (user_id, match_id)`. RLS włączone; polityki: `admin_select_predictions` (select, `is_admin(auth.uid())`); `user_select_own_or_started_predictions` (select, `user_id = auth.uid() OR EXISTS (mecz o tym match_id ma scheduled_at <= now())`); `user_insert_own_prediction` (insert, `WITH CHECK`: `user_id = auth.uid() AND EXISTS (mecz o tym match_id, join na jego turniej, gdzie tournament.status = 'active' AND match.scheduled_at > now())`); `user_update_own_prediction` (update, `USING user_id = auth.uid()`, `WITH CHECK` identyczny jak insert). Brak polityki DELETE (patrz "What We're NOT Doing"). Dodatkowo w tej samej migracji: `create policy "user_select_tournaments" on public.tournaments for select using (auth.uid() is not null);` i `create policy "user_select_matches" on public.matches for select using (auth.uid() is not null);` (polityki permisywne — sumują się z istniejącymi `admin_select_*`, nie zastępują ich).

#### 2. Typy domenowe

**File**: `src/types.ts`

**Intent**: Dodać typ `Prediction` odzwierciedlający nową tabelę, spójny stylistycznie z `Match`/`Tournament`.

**Contract**: Nowy eksportowany interfejs `Prediction` z polami `id`, `match_id`, `user_id`, `predicted_home_score`, `predicted_away_score` (`number`), `created_at` (`string`).

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się czysto na zalinkowanym zdalnym projekcie Supabase: `npx supabase db push`; `npx supabase migration list` potwierdza zgodność `Local`/`Remote`.
- Type-check + build przechodzą: `npm run build`.

#### Manual Verification:

- W Supabase Studio widoczna jest tabela `predictions` z poprawnymi kolumnami, FK, unikalnym ograniczeniem `(user_id, match_id)`, RLS włączone.
- Zapytanie do `tournaments`/`matches` w kontekście testowego konta User (nie Admin) teraz zwraca wiersze (wcześniej zwracało zero).
- Próba insertu do `predictions` w kontekście User dla meczu w przeszłości lub w zamkniętym turnieju kończy się odrzuceniem przez RLS (SQL Editor, `set role` lub test przez API).

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie RLS (widoczność, insert/update reject), zanim przejdziesz do endpointu, który się na nich opiera.

---

## Phase 2: Endpoint API — zapisanie/aktualizacja typu

### Overview

Dodajemy jedyny endpoint tego plasterka: upsert typu Usera dla wskazanego spotkania, z regułami biznesowymi sprawdzanymi w kodzie przed zapisem.

### Changes Required:

#### 1. Endpoint zapisu typu

**File**: `src/pages/api/matches/[id]/predictions.ts` (nowy plik)

**Intent**: Przyjąć wytypowany wynik (gospodarz/gość) dla wskazanego spotkania, zweryfikować go zod, wymusić rolę Usera (nie Admina), sprawdzić że turniej jest aktywny i mecz się jeszcze nie rozpoczął, zapisać (insert lub update — upsert) i przekierować z powrotem na `/dashboard` — z czytelnym błędem w query param przy porażce dowolnego kroku.

**Contract**: Eksportuje `export const prerender = false;` i `POST: APIRoute`. Pierwsza linia handlera: `requireRole(context.locals, "user")` (odwrotność dotychczasowego `"admin"` — blokuje też Admina, spójnie z PRD: typowanie to działanie Usera). `match_id` z `context.params.id`. Schemat zod: `predicted_home_score`/`predicted_away_score` — `z.coerce.number().int().min(0, ...)`. Dane z `context.request.formData()`. Zwykłym (nie admin) klientem (`createClient`, respektującym RLS z Fazy 1) pobiera `scheduled_at` i status rodzica jednym zapytaniem z zagnieżdżonym selectem (`.select("scheduled_at, tournament:tournaments(status)").eq("id", matchId).single()`) — brak wiersza → redirect `/dashboard?error=Nie znaleziono spotkania`; `tournament.status !== "active"` → redirect z `"Nie można typować w zamkniętym turnieju"`; `new Date(scheduled_at) <= new Date()` → redirect z `"Nie można typować po rozpoczęciu spotkania"`. Błąd walidacji zod → redirect z pierwszym komunikatem błędu. Sukces walidacji i reguł → `.from("predictions").upsert({ match_id: matchId, user_id: context.locals.user.id, predicted_home_score, predicted_away_score }, { onConflict: "user_id,match_id" })`; błąd zapisu (w tym odrzucenie przez RLS, jako defense-in-depth) → redirect z ogólnym komunikatem `"Nie udało się zapisać typu"`. Sukces → `context.redirect("/dashboard")` bez query param.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check + build przechodzą: `npm run build`

#### Manual Verification:

- Zalogowany jako User, poprawny POST dla meczu w aktywnym turnieju, który się jeszcze nie rozpoczął, zapisuje typ; ponowny POST dla tego samego meczu z innymi wartościami nadpisuje poprzedni typ (upsert), nie tworzy drugiego wiersza.
- POST z ujemną liczbą lub nieliczbowym wejściem przekierowuje z czytelnym komunikatem walidacji.
- POST dla meczu należącego do zamkniętego turnieju przekierowuje z komunikatem o zamkniętym turnieju, brak zapisu.
- POST dla meczu z terminem w przeszłości przekierowuje z komunikatem o rozpoczętym meczu, brak zapisu.
- Bezpośredni POST jako Admin zwraca 403.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie wszystkie pięć ścieżek powyżej, zanim przejdziesz do UI, które się na nich opiera.

---

## Phase 3: UI — `/dashboard` jako widok turniejów i typowania

### Overview

Przebudowujemy dotychczasowy placeholder `/dashboard` w widok turniejów Usera: lista turniejów → ich spotkania → formularz typowania lub odczyt, w zależności od statusu turnieju i terminu spotkania.

### Changes Required:

#### 1. Strona dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Dać Userowi jedno miejsce, w którym widzi wszystkie turnieje (aktywne i zamknięte), spotkania każdego z nich posortowane wg terminu, i może wytypować lub zobaczyć swój typ, zgodnie ze statusem turnieju i terminem spotkania.

**Contract**: W frontmatterze: odczyt `error` z `Astro.url.searchParams`; przez zwykły `createClient` (respektujący RLS z Fazy 1) trzy zapytania bez N+1 — `tournaments.select("*")` (wszystkie, posortowane: aktywne przed zamkniętymi, potem `created_at` malejąco — sortowanie w pamięci), `matches.select("*").in("tournament_id", tournamentIds).order("scheduled_at", {ascending: true})`, `predictions.select("*").eq("user_id", user.id).in("match_id", matchIds)` (pominięte, gdy `matchIds` puste) — buduje mapę `match_id → Prediction` w pamięci. Renderuje: komunikat błędu z query param (jeśli obecny); dla każdego turnieju nazwę i status, a dla jego spotkań (lub "Brak spotkań", jeśli pusta lista) — gospodarz vs gość, termin sformatowany przez `iso.slice(0, 16).replace("T", " ")` (patrz Critical Implementation Details), i: jeśli `context.locals.role === "user"` ORAZ `tournament.status === "active"` ORAZ `new Date(match.scheduled_at) > new Date()` → `<form method="POST" action={`/api/matches/${match.id}/predictions`}>` z polami `predicted_home_score`/`predicted_away_score` (`input type="number" min="0"`, wstępnie wypełnione istniejącym typem, jeśli jest w mapie) i przyciskiem "Zapisz typ" (lub "Zaktualizuj typ", jeśli typ już istnieje); w przeciwnym razie odczyt: istniejący typ z mapy ("Twój typ: X:Y") albo "Brak typu". Pusta lista turniejów pokazuje komunikat "Brak turniejów".

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check + build przechodzą: `npm run build`

#### Manual Verification:

- Zalogowany jako User → `/dashboard` pokazuje wszystkie turnieje (aktywne i zamknięte) z ich spotkaniami posortowanymi rosnąco wg terminu.
- Spotkanie w aktywnym turnieju, które się jeszcze nie rozpoczęło, pokazuje formularz; zapisanie typu przez formularz natychmiast pokazuje go po przekierowaniu jako wartość wstępnie wypełnioną (edytowalną ponownie).
- Spotkanie już rozpoczęte lub w zamkniętym turnieju pokazuje tylko odczyt (zapisany typ albo "Brak typu"), bez formularza.
- Turniej bez żadnych spotkań pokazuje "Brak spotkań"; brak turniejów w ogóle pokazuje "Brak turniejów".
- Zalogowany jako Admin → `/dashboard` pokazuje te same dane w trybie tylko-odczyt, bez żadnego formularza typowania.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie wszystkie pięć ścieżek powyżej — to ostatnia faza tej zmiany.

---

## Testing Strategy

### Unit Tests:

- Brak — projekt nie ma frameworka testowego (zgodnie z F-01/S-01/S-02/S-03 i `AGENTS.md`); pokrycie zapewnia lint + build + weryfikacja manualna.

### Integration Tests:

- Brak (jak wyżej).

### Manual Testing Steps:

1. Jako Admin (SQL Editor lub istniejące strony `/admin/tournaments`, `/admin/tournaments/{id}/matches`), przygotować: aktywny turniej z jednym meczem w przyszłości i jednym meczem z terminem w bliskiej przeszłości (wstawionym ręcznie przez SQL Editor, analogicznie do wzorca weryfikacji z S-03).
2. Zalogować się jako User, wejść na `/dashboard`, wytypować wynik meczu przyszłego — potwierdzić zapis i możliwość edycji.
3. Sprawdzić, że mecz z terminem w przeszłości nie ma formularza, tylko "Brak typu" (skoro nie zdążono go wytypować).
4. Spróbować POST bezpośrednio na endpoint dla meczu przeszłego (np. przez zmianę URL w wysłanym formularzu) — potwierdzić odrzucenie z czytelnym komunikatem.
5. Jako Admin, zamknąć turniej ręcznie w SQL Editor (`update tournaments set status = 'closed'`) i odświeżyć `/dashboard` jako User — potwierdzić brak formularza dla jego spotkań.
6. Jako Admin, wejść na `/dashboard` — potwierdzić brak formularza typowania mimo widoczności danych.

## Performance Considerations

Trzy zapytania (turnieje, spotkania, własne typy) niezależnie od liczby turniejów/spotkań — unika N+1 przy budowaniu mapy typów w pamięci. Skala pojedynczego biura (dziesiątki spotkań/typów) nie wymaga paginacji ani dodatkowych indeksów poza unikalnym ograniczeniem z Fazy 1.

## Migration Notes

Nowa tabela, brak istniejących danych do migrowania. Nowe polityki SELECT na `tournaments`/`matches` są addytywne (permisywne polityki RLS się sumują) — nie zmieniają ani nie usuwają istniejących polityk Admin-only.

## References

- Wzorzec formatowania/normalizacji czasu: `context/changes/admin-adds-matches/plan.md` (S-03)
- Wzorzec reguły biznesowej sprawdzanej w kodzie przed zapisem: `context/changes/admin-manages-users/plan.md`, `context/changes/admin-adds-matches/plan.md`
- PRD: `context/foundation/prd.md` (US-01, FR-006, NFR o niewidoczności typu)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Model danych — tabela `predictions`, rozszerzone RLS

#### Automated

- [x] 1.1 Migracja aplikuje się czysto (`npx supabase db push`, `npx supabase migration list`) — 99fb4c1
- [x] 1.2 Type-check + build przechodzą (`npm run build`) — 99fb4c1

#### Manual

- [x] 1.3 Tabela `predictions` widoczna w Supabase Studio z poprawnymi kolumnami, FK, unikalnym ograniczeniem, RLS włączone — 99fb4c1
- [x] 1.4 Testowe konto User widzi wiersze `tournaments`/`matches` (wcześniej zero) — 99fb4c1
- [x] 1.5 Insert do `predictions` dla meczu przeszłego/zamkniętego turnieju odrzucony przez RLS — 99fb4c1

### Phase 2: Endpoint API — zapisanie/aktualizacja typu

#### Automated

- [x] 2.1 Lint przechodzi (`npm run lint`) — 90099aa
- [x] 2.2 Type-check + build przechodzą (`npm run build`) — 90099aa

#### Manual

- [x] 2.3 Poprawny POST zapisuje typ; ponowny POST nadpisuje (upsert, brak duplikatu) — 90099aa
- [x] 2.4 POST z nieprawidłową wartością zwraca czytelny błąd walidacji — 90099aa
- [x] 2.5 POST dla zamkniętego turnieju zwraca błąd, brak zapisu — 90099aa
- [x] 2.6 POST dla meczu przeszłego zwraca błąd, brak zapisu — 90099aa
- [x] 2.7 Bezpośredni POST jako Admin zwraca 403 — 90099aa

### Phase 3: UI — `/dashboard` jako widok turniejów i typowania

#### Automated

- [x] 3.1 Lint przechodzi (`npm run lint`) — 90099aa
- [x] 3.2 Type-check + build przechodzą (`npm run build`) — 90099aa

#### Manual

- [x] 3.3 `/dashboard` pokazuje wszystkie turnieje z posortowanymi spotkaniami — 90099aa
- [x] 3.4 Formularz widoczny i działający dla meczu przyszłego w aktywnym turnieju — 90099aa
- [x] 3.5 Odczyt (bez formularza) dla meczu rozpoczętego lub turnieju zamkniętego — 90099aa
- [x] 3.6 Puste stany ("Brak spotkań"/"Brak turniejów") poprawne — 90099aa
- [x] 3.7 Admin widzi dane tylko-do-odczytu, bez formularza — 90099aa
