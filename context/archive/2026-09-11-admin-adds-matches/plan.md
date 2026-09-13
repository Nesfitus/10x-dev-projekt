# Admin dodaje spotkania do turnieju — Implementation Plan

## Overview

Wprowadzamy trzecią tabelę domenową — `matches` — i umożliwiamy Adminowi dodawanie oraz usuwanie spotkań (gospodarz/gość + termin) przypisanych do konkretnego turnieju (FR-005). To ostatni plasterek przygotowawczy przed typowaniem (S-04) — bez terminu spotkania system nie ma jak wyznaczyć momentu blokady typowania. UI jest zagnieżdżone pod turniejem (`/admin/tournaments/[id]/matches`), bo spotkanie zawsze należy do dokładnie jednego turnieju.

## Current State Analysis

- F-01 dostarczył `is_admin(uid)`, `requireRole()`, middleware bramkujące `/admin/*` przez `startsWith("/admin")` (`src/middleware.ts:6`, `:49-58`) — obejmuje też nowe zagnieżdżone trasy bez żadnej zmiany w middleware.
- S-01 dostarczył tabelę `tournaments` (`status`: `active`/`closed`, częściowy unikalny indeks "jeden aktywny naraz") i ustalił wzorzec: natywny `<form method="POST">` + redirect z błędem w query param, zod w endpointach API, RLS oparte o `is_admin()` (`supabase/migrations/20260911100000_create_tournaments.sql`, `src/pages/api/admin/tournaments.ts`, `src/pages/admin/tournaments.astro`).
- S-02 dostarczył wzorzec akcji jednorazowej z app-level regułą biznesową zamiast ograniczenia w RLS: `src/pages/api/admin/users/[id]/disable.ts` pobiera wiersz, sprawdza warunek w kodzie (`role === "admin"` → odmowa), dopiero potem wykonuje operację. Ten sam wzorzec zastosujemy dla reguł "tylko aktywny turniej" i "blokada usuwania po starcie meczu".
- Żadna istniejąca strona ani endpoint API w repo nie używa dynamicznego segmentu trasy (`[id]`) poza `src/pages/api/admin/users/[id]/disable.ts` — to pierwszy przypadek zagnieżdżonej strony Astro (`/admin/tournaments/[id]/matches`). Astro pozwala na współistnienie pliku `tournaments.astro` i katalogu `tournaments/` w tym samym miejscu (odpowiednik Next.js `pages/products.js` + `pages/products/[id].js`) — potwierdzone już w warstwie API (`src/pages/api/admin/tournaments.ts` obok nowego `src/pages/api/admin/tournaments/[id]/matches.ts`).
- `src/pages/admin/tournaments.astro` renderuje listę turniejów bez żadnego linku do podstron — wymaga dodania linku "Spotkania" do każdego wiersza.
- Brak frameworka testowego (potwierdzone w F-01/S-01/S-02 i `AGENTS.md`) — weryfikacja to lint + build + manualna, zgodnie z `.github/workflows/ci.yml`.

## Desired End State

Po ukończeniu tej zmiany:

- Istnieje tabela `matches` (`tournament_id`, `home_team`, `away_team`, `scheduled_at`, `created_by`, `created_at`), chroniona RLS (tylko Admin: select + insert + delete).
- Na `/admin/tournaments` każdy turniej ma link "Spotkania" prowadzący do `/admin/tournaments/[id]/matches`.
- Na `/admin/tournaments/[id]/matches` Admin widzi nazwę/status turnieju, listę jego spotkań posortowaną rosnąco wg terminu (najbliższe na górze) i formularz dodania nowego spotkania (gospodarz, gość, termin).
- Formularz dodawania jest widoczny i aktywny tylko, gdy turniej ma status `active`; dla turnieju `closed` Admin widzi czytelny komunikat zamiast formularza.
- Każde spotkanie ma przycisk usuwania widoczny tylko, gdy jego termin jeszcze nie minął; próba usunięcia spotkania, które już się rozpoczęło, kończy się czytelnym błędem (obrona w głąb — przycisk jest już wtedy ukryty, ale endpoint sam też odmawia).
- User (rola `user`) nie ma żadnego dostępu do tabeli `matches` — ani przez RLS, ani przez UI; to świadomie odłożone do S-04.

### Key Discoveries:

- `is_admin(uid)` (`supabase/migrations/20260908150000_create_profiles_and_roles.sql:18-27`) jest gotowy do reużycia w politykach RLS `matches` bez zmian.
- Middleware bramkuje `ADMIN_ROUTES` przez `startsWith("/admin")` (`src/middleware.ts:6`, `:49-58`) — nowa zagnieżdżona trasa `/admin/tournaments/[id]/matches` jest już objęta bez żadnej zmiany w middleware.
- Wzorzec "app-level reguła biznesowa zamiast ograniczenia w RLS" z `disable.ts` (pobierz wiersz → sprawdź warunek w kodzie → odmów lub wykonaj) jest bezpośrednio reużywalny dla obu nowych reguł tego plasterka (tylko `active`, blokada po starcie).
- `<input type="datetime-local">` nie przekazuje żadnej informacji o strefie czasowej — patrz Critical Implementation Details po dokładny kontrakt normalizacji.

## What We're NOT Doing

- Nie dodajemy rund/kolejek ani żadnego grupowania spotkań — płaska lista w ramach turnieju (świadoma decyzja, PRD nie wymaga grupowania).
- Nie dodajemy edycji spotkania (nazwy drużyn, terminu) — tylko dodawanie i usuwanie, zgodnie z FR-005.
- Nie dodajemy Userom żadnego dostępu (select) do `matches` — to zakres S-04, zgodnie z zasadą progressive disclosure przyjętą w F-01/S-01/S-02.
- Nie walidujemy, że termin spotkania jest w przyszłości względem chwili dodania — świadoma decyzja (prostota, brak wymogu w PRD).
- Nie wprowadzamy pola wyniku spotkania (`home_score`/`away_score`) — to zakres S-05 (Admin wprowadza wynik).
- Nie dodajemy frameworka testowego — konwencja repo (lint/build/manual) pozostaje bez zmian.

## Implementation Approach

Trzy fazy w kolejności zależności: (1) schemat danych `matches` + RLS, (2) dwa endpointy API (dodawanie zagnieżdżone pod turniejem, usuwanie jako akcja na konkretnym meczu) z regułami biznesowymi egzekwowanymi w kodzie (nie w RLS) — zgodnie z wzorcem z S-02, (3) UI zagnieżdżone pod turniejem + link z listy turniejów. Formularz i lista używają dokładnie tego samego wzorca co `/admin/tournaments` i `/admin/users` (natywny `<form method="POST">`, redirect z błędem w query param, zero Reacta).

## Critical Implementation Details

**Reguły biznesowe żyją w kodzie API, nie w RLS.** W przeciwieństwie do "jeden aktywny turniej naraz" z S-01 (współbieżny insert wymagał ochrony na poziomie bazy przez częściowy unikalny indeks), obie reguły tego plasterka — "dodawanie tylko do turnieju `active`" i "blokada usuwania po starcie meczu" — są wyzwalane wyłącznie pojedynczą, sekwencyjną akcją Admina (brak ryzyka race condition), więc żyją w kodzie endpointu jako zwykłe sprawdzenie warunku przed operacją, dokładnie jak sprawdzenie `role === "admin"` w `disable.ts`. Pozwala to też na czytelne komunikaty błędu w query param zamiast surowego błędu naruszenia RLS/constraint.

**Normalizacja `scheduled_at` bez konwersji stref czasowych.** `<input type="datetime-local">` zwraca string bez informacji o strefie (np. `"2026-09-20T18:00"`). Aby uniknąć niejednoznaczności parsowania (zależnej od strefy czasowej środowiska wykonawczego), endpoint API jawnie dokleja `:00Z` do wartości przed zapisem (`"2026-09-20T18:00:00Z"`) — traktując wpisaną wartość jako dosłowny zapis, zawsze interpretowany tak samo, niezależnie od strefy czasowej Cloudflare Workers czy przeglądarki. Konsekwentnie, przy wyświetlaniu terminu w UI **nie** używamy `toLocaleString()` (które zastosowałoby konwersję do strefy czasowej przeglądarki i przesunęłoby wyświetlany czas) — formatowanie odbywa się przez akcesory UTC (`getUTCFullYear`/`getUTCHours` itd. lub `toISOString().slice(0, 16).replace("T", " ")`), tak by Admin zawsze widział dokładnie to, co wpisał. Porównanie "czy spotkanie już się rozpoczęło" (`new Date(match.scheduled_at) <= new Date()`) pozostaje poprawne — to porównanie chwil w czasie, niezależne od sposobu formatowania do wyświetlenia.

**Weryfikacja migracji: zewnętrzny (zdalny) projekt Supabase, nie lokalny Docker.** Zgodnie z `context/foundation/lessons.md` — to środowisko nie ma Dockera; migracje weryfikuje się przez `npx supabase db push` / `npx supabase migration list` na już zalinkowanym zdalnym projekcie, a zmiany w kodzie stron/API dopiero po `git push origin main` (auto-deploy Cloudflare Workers Builds) i manualnej weryfikacji na żywej, wdrożonej aplikacji — nie na `localhost`.

## Phase 1: Model danych — tabela `matches`, RLS

### Overview

Tworzymy trzecią tabelę domenową projektu, powiązaną z `tournaments`, wraz z politykami RLS ograniczonymi do Admina.

### Changes Required:

#### 1. Migracja SQL

**File**: `supabase/migrations/20260911130000_create_matches.sql` (nowy plik)

**Intent**: Utworzyć tabelę `matches` z minimalnym zestawem pól potrzebnych FR-005 (gospodarz, gość, termin), powiązaną z konkretnym turniejem, i włączyć RLS ograniczone do Admina — spójnie z `tournaments` z S-01.

**Contract**: Tabela `public.matches`: `id uuid primary key default gen_random_uuid()`, `tournament_id uuid not null references public.tournaments (id) on delete cascade`, `home_team text not null`, `away_team text not null`, `scheduled_at timestamptz not null`, `created_by uuid not null references auth.users (id)`, `created_at timestamptz not null default now()`. RLS włączone; polityki `admin_select_matches`, `admin_insert_matches`, `admin_delete_matches`, wszystkie używające `public.is_admin(auth.uid())` (funkcja z F-01, bez zmian). Brak polityki UPDATE (edycja poza zakresem — patrz "What We're NOT Doing"). `on delete cascade` na `tournament_id` zapewnia, że usunięcie turnieju (poza zakresem MVP, ale ochronnie) nie zostawi osieroconych spotkań.

#### 2. Typy domenowe

**File**: `src/types.ts`

**Intent**: Dodać typ `Match` odzwierciedlający nową tabelę, spójny stylistycznie z istniejącym `Tournament`.

**Contract**: Nowy eksportowany interfejs `Match` z polami `id`, `tournament_id`, `home_team`, `away_team`, `scheduled_at`, `created_by`, `created_at` (typy jak w `Tournament` — `string` dla uuid/timestamp).

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się czysto na zalinkowanym zdalnym projekcie Supabase: `npx supabase db push`; `npx supabase migration list` potwierdza zgodność `Local`/`Remote`.
- Type-check + build przechodzą: `npm run build` (nowy typ `Match` się kompiluje).

#### Manual Verification:

- W Supabase Studio (zdalny, zalinkowany projekt) widoczna jest tabela `matches` z poprawnymi kolumnami, FK do `tournaments`, RLS włączone.
- Zapytanie do `matches` w kontekście Admina zwraca wiersze (po ręcznym insercie testowym); to samo zapytanie w kontekście User nic nie zwraca (RLS blokuje).
- Ręczne usunięcie turnieju testowego (SQL Editor) kasuje kaskadowo powiązane spotkania.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie RLS i kaskadę, zanim przejdziesz do endpointów API, które się na nich opierają.

---

## Phase 2: Endpointy API — dodawanie i usuwanie spotkania

### Overview

Dodajemy endpoint tworzenia spotkania (zagnieżdżony pod turniejem) i endpoint usuwania spotkania (akcja na konkretnym meczu), oba egzekwujące reguły biznesowe w kodzie.

### Changes Required:

#### 1. Endpoint dodawania spotkania

**File**: `src/pages/api/admin/tournaments/[id]/matches.ts` (nowy plik)

**Intent**: Przyjąć dane formularza (`home_team`, `away_team`, `scheduled_at`) dla turnieju wskazanego w URL, zweryfikować je zod, wymusić rolę Admina i status `active` turnieju, wstawić wiersz do `matches`, i przekierować z powrotem na stronę spotkań tego turnieju — z czytelnym błędem w query param w razie porażki walidacji, turnieju niedostępnego/zamkniętego, lub innego błędu bazy.

**Contract**: Eksportuje `export const prerender = false;` i `POST: APIRoute`. Pierwsza linia handlera: `requireRole(context.locals, "admin")`. `tournament_id` pochodzi z `context.params.id`. Schemat zod: `home_team`/`away_team` — string, przycięty, min. 1 i maks. 200 znaków; `scheduled_at` — string niepusty, transformowany przez doklejenie `:00Z` (patrz Critical Implementation Details) i zweryfikowany jako parsowalna data (`z.coerce.date()` na przetransformowanej wartości). Przed insertem: `select status from tournaments where id = tournament_id` — brak wiersza → redirect z komunikatem "Nie znaleziono turnieju"; `status !== 'active'` → redirect z komunikatem "Nie można dodawać spotkań do zamkniętego turnieju". Błąd walidacji zod → redirect na `/admin/tournaments/${tournament_id}/matches?error=...` z pierwszym komunikatem błędu zod. Sukces → insert do `matches` z `created_by` ustawionym na id zalogowanego Admina → redirect na `/admin/tournaments/${tournament_id}/matches` (bez query param).

#### 2. Endpoint usuwania spotkania

**File**: `src/pages/api/admin/matches/[id]/delete.ts` (nowy plik)

**Intent**: Usunąć wskazane spotkanie, o ile jeszcze się nie rozpoczęło — akcja analogiczna do `disable.ts` z S-02 (pobierz wiersz → sprawdź warunek w kodzie → wykonaj lub odmów).

**Contract**: Eksportuje `export const prerender = false;` i `POST: APIRoute`. Pierwsza linia handlera: `requireRole(context.locals, "admin")`. `match_id` pochodzi z `context.params.id`. Pobiera `tournament_id, scheduled_at` dla wskazanego meczu; brak wiersza → redirect na `/admin/tournaments` z komunikatem "Nie znaleziono spotkania" (brak `tournament_id` do zbudowania dokładniejszego URL powrotu). Jeśli `new Date(scheduled_at) <= new Date()` → redirect na `/admin/tournaments/${tournament_id}/matches?error=...` z komunikatem "Nie można usunąć spotkania, które już się rozpoczęło". W przeciwnym razie: delete → redirect na `/admin/tournaments/${tournament_id}/matches` (bez query param); błąd delete → redirect z ogólnym komunikatem błędu.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check + build przechodzą: `npm run build`

#### Manual Verification:

- Zalogowany jako Admin, poprawny POST na `/api/admin/tournaments/{id}/matches` dla turnieju `active` tworzy wiersz w `matches` i przekierowuje bez błędu.
- POST z pustym `home_team` lub `away_team` przekierowuje z czytelnym komunikatem błędu walidacji.
- POST na turniej ze statusem `closed` przekierowuje z komunikatem "Nie można dodawać spotkań do zamkniętego turnieju", żaden wiersz nie powstaje.
- POST usuwania meczu z terminem w przyszłości usuwa wiersz i przekierowuje bez błędu.
- POST usuwania meczu z terminem w przeszłości przekierowuje z komunikatem błędu, wiersz pozostaje w bazie.
- Bezpośredni POST na oba endpointy jako User (np. przez `curl` z sesją Usera) zwraca 403.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie wszystkie sześć ścieżek powyżej, zanim przejdziesz do UI, które się na tych endpointach opiera.

---

## Phase 3: UI Admina — zagnieżdżona strona spotkań

### Overview

Dodajemy zagnieżdżoną stronę `/admin/tournaments/[id]/matches` (lista + formularz + usuwanie) i link do niej z listy turniejów.

### Changes Required:

#### 1. Link "Spotkania" na liście turniejów

**File**: `src/pages/admin/tournaments.astro`

**Intent**: Dać Adminowi wejście do zarządzania spotkaniami każdego turnieju bezpośrednio z listy, bez znajomości URL.

**Contract**: Każdy element listy turniejów dostaje dodatkowy link `<a href={`/admin/tournaments/${tournament.id}/matches`}>Spotkania</a>` obok istniejącego nazwa/status/opis — ten sam styl wizualny co pozostałe elementy karty (bez importu nowych komponentów).

#### 2. Strona listy i tworzenia spotkań

**File**: `src/pages/admin/tournaments/[id]/matches.astro` (nowy plik)

**Intent**: Dać Adminowi jedno miejsce, w którym widzi nazwę i status turnieju, listę jego spotkań posortowaną wg terminu, i — jeśli turniej jest `active` — formularz dodania nowego spotkania; każde spotkanie z terminem w przyszłości ma przycisk usuwania.

**Contract**: W frontmatterze strony (server-side, Astro): `context.params.id` → zapytanie `supabase.from("tournaments").select("*").eq("id", id).single()`. Brak wiersza lub brak konfiguracji Supabase → strona renderuje inline komunikat błędu "Nie znaleziono turnieju" (bez przekierowania — patrz nota poniżej o ograniczeniu ESLint) zamiast listy/formularza. Gdy turniej znaleziony: zapytanie `supabase.from("matches").select("*").eq("tournament_id", id).order("scheduled_at", { ascending: true })` przez istniejący `createClient` — RLS z Fazy 1 ogranicza wynik do widoku Admina. Renderuje: nazwę i status turnieju, komunikat błędu z query param (jeśli obecny), formularz `<form method="POST" action={`/api/admin/tournaments/${id}/matches`}>` z polami `home_team`, `away_team` (oba wymagane, `input`) i `scheduled_at` (`input type="datetime-local"`, wymagane) — widoczny tylko gdy `tournament.status === "active"`, w przeciwnym razie komunikat "Turniej jest zamknięty — nie można dodawać nowych spotkań"; listę spotkań (gospodarz vs gość, termin sformatowany akcesorami UTC — patrz Critical Implementation Details) — pusta lista pokazuje komunikat "Brak spotkań"; przy każdym spotkaniu z terminem w przyszłości (`new Date(match.scheduled_at) > new Date()`) — `<form method="POST" action={`/api/admin/matches/${match.id}/delete`}>` z przyciskiem "Usuń" i natywnym `confirm()` (spójnie z wzorcem dezaktywacji z S-02).

**Uwaga (odkryta podczas implementacji)**: kontrakt pierwotnie zakładał `Astro.redirect("/admin/tournaments")` przy braku turnieju. `return X()` na najwyższym poziomie frontmattera strony `.astro` powoduje twardy crash `npm run lint` w tym repo (`@typescript-eslint/no-misused-promises` trafia na węzeł bez rodzica — ograniczenie `astro-eslint-parser` w tej wersji zależności), potwierdzone na izolowanym pliku testowym. Zaakceptowana z użytkownikiem alternatywa: brak turnieju renderuje inline komunikat błędu na tej samej stronie zamiast przekierowania — patrz zaktualizowana Success Criteria poniżej.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check + build przechodzą: `npm run build`

#### Manual Verification:

- Zalogowany jako Admin → `/admin/tournaments` pokazuje link "Spotkania" przy każdym turnieju; kliknięcie prowadzi do `/admin/tournaments/{id}/matches`.
- Strona spotkań turnieju `active` pokazuje formularz; dodanie spotkania przez formularz pokazuje nowy wiersz na liście natychmiast po przekierowaniu, posortowany poprawnie względem innych spotkań.
- Strona spotkań turnieju `closed` (jeśli istnieje taki w danych testowych) nie pokazuje formularza, tylko komunikat.
- Spotkanie z terminem w przyszłości ma widoczny przycisk "Usuń"; kliknięcie (po potwierdzeniu) usuwa je z listy.
- Spotkanie z terminem w przeszłości nie ma przycisku "Usuń".
- Wejście na `/admin/tournaments/{nieistniejące-id}/matches` pokazuje czytelny komunikat błędu "Nie znaleziono turnieju" (bez przekierowania — patrz nota w Changes Required, decyzja podjęta podczas implementacji ze względu na crash ESLint przy top-level `return` w Astro).
- Zalogowany jako przykładowy User → wejście na dowolną stronę `/admin/tournaments/{id}/matches` przekierowuje na `/dashboard` (middleware, bez zmian).

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie wszystkie siedem ścieżek powyżej — to ostatnia faza tej zmiany.

---

## Testing Strategy

### Unit Tests:

- Brak — projekt nie ma frameworka testowego (zgodnie z F-01/S-01/S-02 i `AGENTS.md`); pokrycie zapewnia lint + build + weryfikacja manualna.

### Integration Tests:

- Brak (jak wyżej).

### Manual Testing Steps:

1. Zalogować się jako Admin, wejść na `/admin/tournaments`, kliknąć "Spotkania" przy aktywnym turnieju.
2. Dodać spotkanie (gospodarz, gość, termin) — sprawdzić, że pojawia się na liście z poprawnym terminem.
3. Dodać drugie spotkanie z terminem wcześniejszym niż pierwsze — sprawdzić, że lista jest posortowana rosnąco.
4. Spróbować dodać spotkanie z pustym polem gospodarza — sprawdzić komunikat błędu.
5. Usunąć spotkanie z terminem w przyszłości — sprawdzić, że znika z listy.
6. Sprawdzić, że spotkanie z terminem w przeszłości (np. ręcznie wstawione przez SQL Editor) nie ma przycisku usuwania.
7. Jako User, spróbować wejść na `/admin/tournaments/{id}/matches` — sprawdzić przekierowanie na `/dashboard`.

## Performance Considerations

Brak — skala pojedynczego biura (dziesiątki spotkań na turniej), zapytania bez paginacji ani dodatkowych indeksów, spójnie z `tournaments`/`profiles`.

## Migration Notes

Nowa tabela, brak istniejących danych do migrowania. `on delete cascade` na `tournament_id` to jedyny efekt uboczny dla istniejących danych — usunięcie turnieju testowego skasuje też jego spotkania.

## References

- Podobna implementacja (wzorzec RLS + formularz + lista): `context/changes/admin-creates-tournament/plan.md`
- Wzorzec akcji z regułą biznesową w kodzie: `context/changes/admin-manages-users/plan.md`, `src/pages/api/admin/users/[id]/disable.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Model danych — tabela `matches`, RLS

#### Automated

- [x] 1.1 Migracja aplikuje się czysto (`npx supabase db push`, `npx supabase migration list`) — f8e018b
- [x] 1.2 Type-check + build przechodzą (`npm run build`) — f8e018b

#### Manual

- [x] 1.3 Tabela `matches` widoczna w Supabase Studio z poprawnymi kolumnami, FK, RLS włączone — f8e018b
- [x] 1.4 RLS: Admin widzi wiersze, User nie widzi żadnych — f8e018b
- [x] 1.5 Kaskadowe usunięcie spotkań przy usunięciu turnieju — f8e018b

### Phase 2: Endpointy API — dodawanie i usuwanie spotkania

#### Automated

- [x] 2.1 Lint przechodzi (`npm run lint`) — 7b6c5f6
- [x] 2.2 Type-check + build przechodzą (`npm run build`) — 7b6c5f6

#### Manual

- [x] 2.3 Poprawny POST dodawania tworzy wiersz i przekierowuje bez błędu — 7b6c5f6
- [x] 2.4 POST z pustym `home_team`/`away_team` zwraca czytelny błąd walidacji — 7b6c5f6
- [x] 2.5 POST dodawania do turnieju `closed` zwraca błąd, brak nowego wiersza — 7b6c5f6
- [x] 2.6 POST usuwania meczu przyszłego usuwa wiersz — 7b6c5f6
- [x] 2.7 POST usuwania meczu przeszłego zwraca błąd, wiersz pozostaje — 7b6c5f6
- [x] 2.8 Bezpośredni POST jako User na oba endpointy zwraca 403 — 7b6c5f6

### Phase 3: UI Admina — zagnieżdżona strona spotkań

#### Automated

- [x] 3.1 Lint przechodzi (`npm run lint`) — 1a29f17
- [x] 3.2 Type-check + build przechodzą (`npm run build`) — 1a29f17

#### Manual

- [x] 3.3 Link "Spotkania" widoczny przy każdym turnieju na `/admin/tournaments` — 1a29f17
- [x] 3.4 Dodanie spotkania przez formularz pokazuje nowy wiersz, poprawnie posortowany — 1a29f17
- [x] 3.5 Turniej `closed` nie pokazuje formularza, tylko komunikat — 1a29f17
- [x] 3.6 Przycisk "Usuń" widoczny tylko dla spotkań z terminem w przyszłości — 1a29f17
- [x] 3.7 Nieistniejące `id` turnieju pokazuje inline komunikat błędu "Nie znaleziono turnieju" (bez przekierowania) — 1a29f17
- [x] 3.8 User przekierowany na `/dashboard` z dowolnej strony spotkań — 1a29f17
