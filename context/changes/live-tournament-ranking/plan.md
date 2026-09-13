# User widzi bieżący ranking turnieju — Implementation Plan

## Overview

User (i Admin) może zobaczyć pełny ranking dowolnego turnieju (aktywnego lub zamkniętego) — wszyscy aktywni Userzy systemu, posortowani malejąco po sumie punktów, z 0 pkt dla tych, którzy nie złożyli żadnego typu. Dane liczy nowa funkcja SQL `SECURITY DEFINER`, wywoływana przez zwykłą sesję (User lub Admin) przez `.rpc()` — bez zmian RLS na `profiles`/`predictions` i bez rozszerzania istniejącej konwencji `createAdminClient()` (service-role) poza strony zabezpieczone rolą Admina.

## Current State Analysis

- S-05 (`admin-enters-result-auto-scoring`) jest funkcjonalnie ukończony: `matches.actual_home_score/actual_away_score` i `predictions.points` istnieją i są naliczane synchronicznie przy wpisaniu wyniku (`supabase/migrations/20260912100000_add_match_results_and_prediction_points.sql`, `src/pages/api/admin/matches/[id]/result.ts`). Roadmap dalej pokazuje S-05 jako `in-progress` (nie zarchiwizowane), ale wszystkie kroki `## Progress` w jego `plan.md` są odhaczone — traktowany jako gotowy fundament.
- Brak tabeli "uczestnictwa w turnieju" — S-05 świadomie zostawił "materializację zer dla nie-typujących" jako otwartą decyzję S-06 (`context/changes/admin-enters-result-auto-scoring/plan.md`, sekcja Current State Analysis).
- RLS na `profiles` (`supabase/migrations/20260908150000_create_profiles_and_roles.sql`) pozwala Userowi widzieć wyłącznie własny wiersz (`select_own_profile`); tylko Admin widzi wszystkie (`admin_select_all_profiles`). Zwykła sesja Usera nie może dziś pobrać listy innych Userów.
- RLS na `predictions` (`supabase/migrations/20260912090000_create_predictions.sql`, `user_select_own_or_started_predictions`) już pozwala każdemu zalogowanemu widzieć cudze wiersze dla meczów, które się rozpoczęły — a to dokładnie warunek, pod którym `points` w ogóle istnieje (Admin wpisuje wynik dopiero po starcie meczu). Agregacja cudzych punktów byłaby więc możliwa przez zwykłego klienta, ale **nie** rozwiązuje to problemu identyfikacji (e-mail) ani "wszyscy Userzy, także ci bez typów".
- Jedyny dziś dostępny czytelny identyfikator Usera (e-mail) żyje w `auth.users`, niedostępnym przez zwykłą sesję PostgREST. Jedyne miejsce, gdzie kod dziś go rozwiązuje, to `createAdminClient()` (service-role) w `src/pages/admin/users.astro`, a komentarz przy tej funkcji w `src/lib/supabase.ts` explicite ogranicza jej użycie do stron zabezpieczonych `requireRole("admin")`/trasą `/admin*`. Ranking dla Usera złamałby tę konwencję, gdyby użył service-role wprost na stronie Usera.
- Wzorzec `SECURITY DEFINER` już istnieje w bazie: `public.is_admin(uid uuid)` (`supabase/migrations/20260908150000_create_profiles_and_roles.sql`) — funkcja SQL z `set search_path` i ograniczoną, celową ekspozycją danych, wywoływana z poziomu polityk RLS. Ten sam wzorzec rozszerzamy na funkcję zwracającą zagregowany ranking, wywoływaną bezpośrednio przez `.rpc()` z frontendu (Astro SSR), a nie tylko z wnętrza innej polityki.
- `PROTECTED_ROUTES` w `src/middleware.ts` dziś zawiera tylko `/dashboard` (i osobno `ADMIN_ROUTES = ["/admin"]`) — nowa trasa rankingu poza tymi dwoma nie jest dziś chroniona.
- Istniejący wzorzec linkowania z listy turniejów do zagnieżdżonej strony (`/admin/tournaments/[id]/matches`, link "Spotkania" w `src/pages/admin/tournaments.astro`) i wzorzec renderowania "nie znaleziono turnieju" bez przekierowania (`src/pages/admin/tournaments/[id]/matches.astro`) mają tu bezpośrednie zastosowanie.

## Desired End State

Po ukończeniu tej zmiany:

- Pod adresem `/tournaments/[id]/ranking` (chronionym przez middleware — wymaga zalogowania, bez ograniczenia roli) każdy zalogowany User i Admin widzi pełną listę wszystkich aktywnych (nie-dezaktywowanych) Userów systemu wraz z ich sumą punktów w danym turnieju, posortowaną malejąco po punktach, a przy remisie — rosnąco po e-mailu.
- Ranking działa identycznie dla turnieju `active` i `closed` — nie ma osobnego "widoku końcowego".
- User bez żadnego złożonego typu w danym turnieju widnieje na liście z 0 pkt (nigdy nie jest pominięty).
- Wiersz odpowiadający zalogowanemu użytkownikowi jest wizualnie wyróżniony (spełnia "swoje punkty" z FR-010).
- Z `/dashboard` (przy każdym turnieju) i z `/admin/tournaments` (przy każdym turnieju) prowadzi link "Ranking" do tej strony.
- Nieistniejący `id` turnieju renderuje czytelny stan "nie znaleziono turnieju" (ten sam wzorzec co `matches.astro`), bez wywołania funkcji rankingu.

### Key Discoveries:

- Punkty pobierane są przez pojedynczą funkcję SQL `public.tournament_ranking(p_tournament_id uuid)` — `SECURITY DEFINER`, `LEFT JOIN` do `predictions` (żeby Userzy bez typów też się pojawili), `JOIN` do `auth.users` (dostępne wewnątrz funkcji dzięki `SECURITY DEFINER`, mimo że niedostępne przez zwykłą sesję PostgREST), filtr `profiles.role = 'user' AND profiles.disabled = false`, `GROUP BY`, `ORDER BY points DESC, email ASC`. `GRANT EXECUTE ... TO authenticated` — brak potrzeby żadnej nowej polityki RLS na `profiles`/`predictions`, bo funkcja sama definiuje dokładnie to, co wolno zwrócić.
- `SUM(pr.points)` w SQL naturalnie pomija wiersze `NULL` (typy jeszcze nieocenione) — nie trzeba osobnego `WHERE points IS NOT NULL`; `COALESCE(..., 0)` obsługuje przypadek "brak jakichkolwiek typów" (cały `LEFT JOIN` pusty dla danego Usera).
- Strona `/tournaments/[id]/ranking` używa zwykłego `createClient()` (sesja Usera/Admina), nie `createAdminClient()` — zarówno do pobrania turnieju (już dziś dostępne każdemu zalogowanemu przez `user_select_tournaments`/`admin_select_tournaments`), jak i do wywołania `.rpc("tournament_ranking", ...)`.

## What We're NOT Doing

- Nie zmieniamy żadnej istniejącej polityki RLS na `profiles`/`predictions`/`matches`/`tournaments` — cała nowa ekspozycja danych przechodzi wyłącznie przez nową funkcję `SECURITY DEFINER`.
- Nie rozszerzamy `createAdminClient()`/service-role na strony spoza `/admin*` — konwencja z komentarza w `src/lib/supabase.ts` pozostaje nienaruszona.
- Nie pokazujemy rozbicia punktów per-mecz ani cudzych konkretnych typów — tylko zagregowana suma punktów per User (zgodnie z FR-010).
- Nie budujemy w tym plasterku wyłaniania zwycięzcy/obsługi zamknięcia turnieju — to S-07; ranking jedynie musi działać także dla turniejów `closed`, żeby S-07 mogło go reużyć.
- Nie dodajemy dezaktywowanych Userów do rankingu (świadomie wykluczeni, `profiles.disabled = false` w warunku funkcji).
- Nie dodajemy odświeżania w locie (polling/WebSocket) — Astro SSR liczy ranking na nowo przy każdym wejściu/odświeżeniu strony, co wystarcza na NFR "kilka sekund od wprowadzenia wyniku".
- Nie dodajemy frameworka testowego — konwencja repo (lint/build/manual) bez zmian.

## Implementation Approach

Dwie fazy w kolejności zależności: (1) migracja SQL z funkcją `tournament_ranking` (`SECURITY DEFINER`) i uprawnieniem `EXECUTE` dla `authenticated`, (2) nowa strona `/tournaments/[id]/ranking` (dodana do `PROTECTED_ROUTES`) plus linki nawigacyjne z `/dashboard` i `/admin/tournaments`.

## Critical Implementation Details

**`SECURITY DEFINER` + `auth.users` — dlaczego to bezpieczne i wystarczające.** W przeciwieństwie do `is_admin()` (który tylko sprawdza rolę wywołującego), ta funkcja celowo zwraca dane o **innych** użytkownikach (e-mail, punkty) osobie, która sama nie ma do tego dostępu przez RLS. To jest zamierzone i jedyne miejsce w bazie, gdzie to się dzieje — dopuszczalne, bo (a) funkcja przyjmuje jeden parametr (`tournament_id`) i nie pozwala wywołującemu skonstruować dowolnego zapytania, (b) zwraca wyłącznie `user_id`, `email`, `points` — nic ponad to, (c) `GRANT EXECUTE` jest ograniczony do roli `authenticated` (wymaga zalogowania), (d) `set search_path = public` chroni przed podmianą schematu (ten sam wzorzec co `handle_new_user()`). Migracja musi jawnie to uzasadnić komentarzem, bo to świadome odejście od zasady "profile/przewidywania widoczne tylko przez RLS" ustalonej we wcześniejszych migracjach.

## Phase 1: Funkcja SQL rankingu

### Overview

Nowa migracja dodaje jedną funkcję agregującą pełny ranking turnieju, wywoływalną przez dowolnego zalogowanego Usera lub Admina.

### Changes Required:

#### 1. Migracja SQL

**File**: `supabase/migrations/20260913090000_create_tournament_ranking_function.sql` (nowy plik)

**Intent**: Policzyć pełny ranking turnieju (wszyscy aktywni Userzy + suma ich punktów, 0 dla bez typów) w jednym wywołaniu, bez potrzeby nowych polityk RLS ani service-role po stronie klienta.

**Contract**: Funkcja `public.tournament_ranking(p_tournament_id uuid) returns table(user_id uuid, email text, points integer)`, `language sql`, `security definer`, `stable`, `set search_path = public`. Treść (non-obvious — dołączona w całości, bo to jedyne miejsce w bazie łączące `profiles` z `auth.users` i celowo ujawniające cudze dane):

```sql
create or replace function public.tournament_ranking(p_tournament_id uuid)
returns table (user_id uuid, email text, points integer)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id as user_id,
    u.email::text as email,
    coalesce(sum(pr.points), 0)::integer as points
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.predictions pr
    on pr.user_id = p.id
    and pr.match_id in (
      select m.id from public.matches m where m.tournament_id = p_tournament_id
    )
  where p.role = 'user' and p.disabled = false
  group by p.id, u.email
  order by points desc, u.email asc;
$$;

grant execute on function public.tournament_ranking(uuid) to authenticated;
```

#### 2. Typy domenowe

**File**: `src/types.ts`

**Intent**: Odzwierciedlić kształt wiersza zwracanego przez `tournament_ranking`.

**Contract**: Nowy `export interface RankingRow { user_id: string; email: string | null; points: number; }`.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się czysto na zalinkowanym zdalnym projekcie Supabase: `npx supabase db push`; `npx supabase migration list` potwierdza zgodność `Local`/`Remote`.
- Type-check + build przechodzą: `npm run build`.

#### Manual Verification:

- W SQL Editor (Supabase Studio), wywołanie `select * from public.tournament_ranking('<istniejący-tournament-id>')` jako `postgres`/service-role zwraca wiersz dla każdego aktywnego Usera, w tym tych bez żadnego typu (0 pkt).
- Testowe konto User (przez `supabase.rpc("tournament_ranking", { p_tournament_id: "..." })` w konsoli/kliencie z jego własną sesją) dostaje ten sam pełny wynik — mimo że ten sam User nie może zrobić `select * from profiles` na cudze wiersze.
- Dezaktywowany testowy User nie pojawia się w wyniku.
- Wywołanie z nieistniejącym `tournament_id` zwraca pełną listę Userów z 0 pkt (brak błędu) — potwierdza że strona (Faza 2) musi sama sprawdzić istnienie turnieju przed wywołaniem funkcji.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie powyższe cztery przypadki (zwłaszcza że zwykła sesja Usera dostaje pełne dane), zanim przejdziesz do strony, która się na tym opiera.

---

## Phase 2: Strona rankingu i nawigacja

### Overview

Nowa strona renderuje wynik `tournament_ranking`; linki do niej dochodzą z `/dashboard` i `/admin/tournaments`.

### Changes Required:

#### 1. Ochrona trasy

**File**: `src/middleware.ts`

**Intent**: Chronić nową trasę tak samo jak `/dashboard` — wymaga zalogowania, bez ograniczenia roli (dostępna Userowi i Adminowi).

**Contract**: `PROTECTED_ROUTES` rozszerzone o `"/tournaments"`.

#### 2. Strona rankingu

**File**: `src/pages/tournaments/[id]/ranking.astro` (nowy plik)

**Intent**: Pokazać pełny ranking turnieju (dowolny status) z wyróżnieniem wiersza zalogowanego użytkownika; dla nieistniejącego turnieju pokazać stan "nie znaleziono" bez wywoływania funkcji rankingu.

**Contract**: Frontmatter pobiera `id` z `Astro.params`; `createClient()` (zwykła sesja, nie admin); `supabase.from("tournaments").select("*").eq("id", id).single<Tournament>()` — brak wiersza → ten sam wzorzec inline-error co `src/pages/admin/tournaments/[id]/matches.astro` (bez przekierowania, `!tournament` gałąź w markupie). Gdy turniej istnieje: `supabase.rpc("tournament_ranking", { p_tournament_id: id }).overrideTypes<RankingRow[], { merge: false }>()`; wynik już posortowany przez funkcję (`ORDER BY` w SQL) — strona nie sortuje ponownie. Renderuje listę/tabelę: pozycja (indeks + 1), `email ?? user_id`, `points`; wiersz z `row.user_id === Astro.locals.user?.id` dostaje wyróżniającą klasę (np. obramowanie/tło w innym odcieniu, wzorem istniejącego stylu kart).

#### 3. Link z dashboardu Usera

**File**: `src/pages/dashboard.astro`

**Intent**: Dać Userowi dojście do rankingu każdego turnieju, który widzi na liście.

**Contract**: W pętli renderującej kartę turnieju, obok nagłówka `tournament.name`, dodany link `<a href={`/tournaments/${tournament.id}/ranking`}>Ranking</a>`, stylowany jak istniejące linki nawigacyjne na tej stronie.

#### 4. Link z listy turniejów Admina

**File**: `src/pages/admin/tournaments.astro`

**Intent**: Dać Adminowi dojście do tego samego rankingu bez logowania się jako User.

**Contract**: Obok istniejącego linku "Spotkania" (`/admin/tournaments/${tournament.id}/matches`), dodany analogiczny link "Ranking" → `/tournaments/${tournament.id}/ranking`, tym samym stylem (`class` identyczna z linkiem "Spotkania").

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check + build przechodzą: `npm run build`

#### Manual Verification:

- Zalogowany jako User, klik "Ranking" przy turnieju na `/dashboard` prowadzi do pełnej listy wszystkich aktywnych Userów z poprawnymi punktami, własny wiersz wyróżniony.
- Zalogowany jako Admin, klik "Ranking" przy turnieju na `/admin/tournaments` prowadzi do tej samej strony z tymi samymi danymi.
- User bez żadnego złożonego typu w turnieju widnieje na liście z 0 pkt.
- Ranking działa identycznie dla turnieju `active` i turnieju `closed`.
- Wejście na `/tournaments/<nieistniejący-id>/ranking` pokazuje stan "nie znaleziono turnieju", bez błędu 500.
- Wejście na `/tournaments/<id>/ranking` bez zalogowania przekierowuje na `/auth/signin` (middleware).
- Kolejność przy remisie punktowym jest alfabetyczna po e-mailu (weryfikacja na dwóch testowych kontach z tą samą liczbą punktów).

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie wszystkie siedem ścieżek powyżej — to ostatnia faza tej zmiany.

---

## Testing Strategy

### Unit Tests:

- Brak — projekt nie ma frameworka testowego (zgodnie z F-01…S-05 i `AGENTS.md`); pokrycie zapewnia lint + build + weryfikacja manualna.

### Integration Tests:

- Brak (jak wyżej).

### Manual Testing Steps:

1. Przygotować turniej (aktywny) z co najmniej trzema testowymi Userami: jeden z kilkoma ocenionymi typami, jeden bez żadnego typu, jeden dezaktywowany.
2. Jako pierwszy User, wejść na `/tournaments/{id}/ranking` z `/dashboard` — potwierdzić że widnieją wszyscy trzej aktywni Userzy (nie dezaktywowany), z poprawnymi punktami, User bez typów ma 0.
3. Jako Admin, wejść na tę samą stronę z `/admin/tournaments` — potwierdzić identyczne dane.
4. Zamknąć turniej (ręcznie w Supabase Studio, `status = 'closed'`, S-07 jeszcze nie istnieje) i ponownie odwiedzić stronę rankingu — potwierdzić że nadal działa identycznie.
5. Wejść na nieistniejący `id` turnieju — potwierdzić czytelny stan błędu.

## Performance Considerations

Jedno wywołanie SQL (`GROUP BY` po `profiles`/`predictions` przefiltrowanych po `tournament_id`) na wejście na stronę — skala pojedynczego biura (dziesiątki Userów, dziesiątki meczów) nie wymaga indeksów dodatkowych ponad istniejące klucze obce.

## Migration Notes

Migracja jest addytywna (nowa funkcja, brak zmian w istniejących tabelach/kolumnach) — brak backfillu, brak ryzyka dla istniejących danych.

## References

- Wzorzec `SECURITY DEFINER`: `supabase/migrations/20260908150000_create_profiles_and_roles.sql` (`is_admin()`, `handle_new_user()`)
- Wzorzec linkowania z listy do zagnieżdżonej strony i stanu "nie znaleziono": `context/changes/admin-adds-matches/plan.md` (S-03), `src/pages/admin/tournaments/[id]/matches.astro`
- Otwarta decyzja pozostawiona przez S-05: `context/changes/admin-enters-result-auto-scoring/plan.md` (Current State Analysis)
- PRD: `context/foundation/prd.md` (FR-010, NFR widoczności rankingu w ciągu kilku sekund)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Funkcja SQL rankingu

#### Automated

- [x] 1.1 Migracja aplikuje się czysto (`npx supabase db push`, `npx supabase migration list`)
- [x] 1.2 Type-check + build przechodzą (`npm run build`)

#### Manual

- [x] 1.3 SQL Editor: pełny ranking zwraca wszystkich aktywnych Userów, w tym bez typów (0 pkt)
- [x] 1.4 Zwykła sesja Usera przez `.rpc()` dostaje ten sam pełny wynik
- [x] 1.5 Dezaktywowany User nie pojawia się w wyniku
- [x] 1.6 Nieistniejący `tournament_id` zwraca pełną listę z 0 pkt, bez błędu

### Phase 2: Strona rankingu i nawigacja

#### Automated

- [ ] 2.1 Lint przechodzi (`npm run lint`)
- [ ] 2.2 Type-check + build przechodzą (`npm run build`)

#### Manual

- [ ] 2.3 Link z `/dashboard` prowadzi do poprawnego rankingu, własny wiersz wyróżniony
- [ ] 2.4 Link z `/admin/tournaments` prowadzi do tej samej strony z tymi samymi danymi
- [ ] 2.5 User bez typów widnieje z 0 pkt
- [ ] 2.6 Ranking działa identycznie dla turnieju `active` i `closed`
- [ ] 2.7 Nieistniejący `id` turnieju pokazuje stan "nie znaleziono", bez błędu 500
- [ ] 2.8 Brak sesji → przekierowanie na `/auth/signin`
- [ ] 2.9 Remis punktowy sortowany alfabetycznie po e-mailu
