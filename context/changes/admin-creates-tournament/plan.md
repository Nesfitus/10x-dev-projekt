# Admin zakłada nowy turniej — Implementation Plan

## Overview

Wprowadzamy pierwszą tabelę domenową — `tournaments` — i umożliwiamy Adminowi założenie nowego turniej (FR-004). To pierwszy plasterek domenowy po fundamencie F-01 (role Admin/User); wykorzystuje istniejący `requireRole()` i wzorzec RLS oparty o `is_admin()`. Reguła "jeden aktywny turniej naraz" jest wymuszona na poziomie bazy danych (częściowy unikalny indeks), nie tylko w kodzie aplikacji.

## Current State Analysis

- F-01 dostarczył kompletny fundament ról: tabela `profiles` z kolumną `role`, funkcja `is_admin(uid)` (`SECURITY DEFINER`, unika rekurencji RLS) w `supabase/migrations/20260908150000_create_profiles_and_roles.sql`, middleware wystawiające `context.locals.role` (`src/middleware.ts:17-30`) i bramkujące `/admin/*` przez `startsWith` (`src/middleware.ts:5-6`, `:38-42`), oraz helper `requireRole()` w `src/lib/auth.ts`.
- `src/pages/admin.astro` i `src/pages/api/admin/ping.ts` to jawnie oznaczone tymczasowe placeholdery z komentarzem "placeholder, replaced in S-01" / "Replaced by a real admin API endpoint in S-01" — ten plasterek je zastępuje.
- Brak jakiejkolwiek tabeli domenowej poza `profiles` — `tournaments` będzie drugą migracją w projekcie.
- Zod nie jest zainstalowany (brak w `package.json`), mimo że `AGENTS.md` wymaga walidacji zod na endpointach API — istniejące `signin.ts`/`signup.ts` powstały przed tą zasadą i jej nie stosują (`context.request.formData()` bez walidacji). Ten endpoint będzie pierwszym zgodnym z zasadą.
- Wzorzec formularza z przekierowaniem i błędem w query param jest już ustalony: `src/pages/api/auth/signin.ts` (redirect z `?error=`) + `src/pages/auth/signin.astro` (`Astro.url.searchParams.get("error")`).
- Żaden istniejący endpoint API w repo nie eksportuje jawnie `prerender = false` (nie jest to potrzebne przy `output: "server"`, ale `AGENTS.md` tego wymaga jako twardej zasady) — ten endpoint będzie pierwszym, który to robi.
- Brak frameworka testowego (potwierdzone w F-01 i `AGENTS.md`) — weryfikacja automatyczna to `npm run lint` + `npm run build`, spójne z `.github/workflows/ci.yml`.

## Desired End State

Po ukończeniu tej zmiany:

- Istnieje tabela `tournaments` (`name`, opcjonalny `description`, `status` — `active`/`closed`, `created_by`, `created_at`), chroniona RLS (tylko Admin: insert + select).
- Baza danych wymusza, że co najwyżej jeden turniej może mieć status `active` w danym momencie — próba utworzenia kolejnego aktywnego turnieju kończy się jasnym błędem, nie ciszą ani niespójnymi danymi.
- Zalogowany jako Admin widzi na `/admin/tournaments` listę wszystkich dotychczasowych turniejów i może założyć nowy przez formularz (nazwa + opcjonalny opis).
- `/admin` to prosty hub linkujący do `/admin/tournaments`, gotowy na kolejne sekcje z przyszłych plasterków (S-02, S-03) bez przebudowy.
- Tymczasowy `src/pages/api/admin/ping.ts` (diagnostyczny endpoint z F-01) został usunięty — zastąpiony realnym endpointem.
- Duplikaty nazw turniejów są dozwolone (świadoma decyzja — brak ograniczenia unikalności nazwy).
- User (rola `user`) nie ma żadnego dostępu do tabeli `tournaments` — ani przez RLS, ani przez UI; to świadomie odłożone do przyszłych S-04/S-06.

### Key Discoveries:

- `is_admin(uid)` z F-01 (`supabase/migrations/20260908150000_create_profiles_and_roles.sql:18-27`) jest gotowy do reużycia w politykach RLS `tournaments` — nie trzeba go duplikować ani pisać od nowa.
- Middleware bramkuje `ADMIN_ROUTES` przez `startsWith` (`src/middleware.ts:5-6`, `:38-42`) — `/admin/tournaments` jest już objęte istniejącym wpisem `"/admin"` bez żadnej zmiany w middleware.
- `requireRole()` (`src/lib/auth.ts`) ma dokładnie kontrakt potrzebny nowemu endpointowi — brak potrzeby zmian w tym pliku.
- Standardowy idiom Postgresa na "co najwyżej jeden wiersz spełniający warunek" to unikalny indeks na kolumnie ze stałą wartością pod filtrem `WHERE` (patrz Critical Implementation Details) — prostszy i bardziej niezawodny niż trigger.

## What We're NOT Doing

- Nie budujemy zamykania turnieju (status → `closed`) ani wyłaniania zwycięzców — to FR-009/FR-011, zakres S-07.
- Nie dodajemy Userom żadnego dostępu (select) do `tournaments` — to zakres przyszłych S-04 (typowanie) / S-06 (ranking), zgodnie z zasadą progressive disclosure przyjętą w F-01.
- Nie wymuszamy unikalności nazwy turnieju — świadomie zaakceptowana decyzja (duplikaty dozwolone).
- Nie dodajemy edycji ani usuwania turnieju po utworzeniu — poza zakresem FR-004.
- Nie budujemy ogólnego, reużywalnego komponentu formularza/listy dla przyszłych zasobów Admina (S-02/S-03 dostaną własne, gdy powstaną).
- Nie dodajemy frameworka testowego — konwencja repo (lint/build/manual) pozostaje bez zmian.

## Implementation Approach

Trzy fazy w kolejności zależności: (1) schemat danych + RLS + reguła jednego aktywnego turnieju, (2) endpoint API tworzenia turnieju (zod + `requireRole`) zastępujący placeholder `ping.ts`, (3) UI Admina (hub + strona z listą i formularzem) zastępujące placeholder `admin.astro`. Formularz używa natywnego `<form method="POST">` z przekierowaniem i błędem w query param — ten sam, ustalony już wzorzec co `signin.astro`/`signup.astro` — więc strona `/admin/tournaments` jest czystym komponentem Astro (bez wyspy React), zgodnie z zasadą repo "React tylko gdy potrzebna interaktywność".

## Critical Implementation Details

**Wymuszenie "jednego aktywnego turnieju" bez triggera.** Standardowy idiom Postgresa: `create unique index tournaments_one_active_idx on public.tournaments (status) where status = 'active';` — indeks obejmuje wyłącznie wiersze ze statusem `active`, a ponieważ każdy taki wiersz ma tę samą wartość kolumny (`'active'`), unikalność indeksu ogranicza liczbę takich wierszy do jednego. To prostszy i bardziej niezawodny mechanizm niż trigger sprawdzający istnienie aktywnego turnieju przed insertem — działa poprawnie nawet przy współbieżnych insertach.

**Mapowanie błędu unikalności na komunikat dla Admina.** `supabase-js` przy naruszeniu unikalnego indeksu zwraca błąd z polem `error.code === "23505"` (kod Postgresa `unique_violation`, przekazywany przez PostgREST). Endpoint musi rozpoznać ten konkretny kod i zamienić go na czytelny komunikat ("Istnieje już aktywny turniej — zamknij go, zanim utworzysz kolejny."), zamiast pokazywać surowy błąd bazy danych.

**Weryfikacja migracji: zewnętrzny (zdalny) projekt Supabase, nie lokalny Docker.** To środowisko implementacyjne nie ma dostępnego Dockera, więc `npx supabase start`/`npx supabase db reset` (lokalny stack) nie mogą zostać uruchomione — decyzja świadoma: nie instalujemy Dockera na potrzeby tego plasterka. Projekt ma już zalinkowany zdalny projekt Supabase używany do wdrożenia (`supabase/.temp/project-ref` → `uhtpaguekvtnlxhqbjfp`, ten sam, co w `context/deployment/deploy-plan.md` i w Fazie 2 planu F-01). Weryfikacja migracji odbywa się więc przez `npx supabase db push` (aplikuje migrację bezpośrednio na zdalny Postgres, bez Dockera) oraz `npx supabase migration list` (potwierdza zgodność `Local`/`Remote`); manualna weryfikacja RLS/indeksu odbywa się w Supabase Studio zdalnego projektu (dashboard), nie lokalnie. Ten sam zdalny projekt jest już używany przez działającą aplikację (`https://typer-sportowy.patrykshon.workers.dev`), więc migracja od razu obowiązuje produkcyjnie — bez osobnego kroku "wdróż na żywo" jak w Fazie 4 planu F-01.

## Phase 1: Model danych — tabela `tournaments`, RLS, reguła jednego aktywnego turnieju

### Overview

Tworzymy drugą tabelę domenową projektu wraz z politykami RLS ograniczonymi do Admina i regułą wymuszającą maksymalnie jeden aktywny turniej.

### Changes Required:

#### 1. Migracja SQL

**File**: `supabase/migrations/20260911100000_create_tournaments.sql` (nowy plik)

**Intent**: Utworzyć tabelę `tournaments` z minimalnym zestawem pól potrzebnych FR-004, włączyć RLS ograniczone do Admina (insert + select — brak update/delete, bo żadna funkcja jeszcze tego nie potrzebuje), i wymusić na poziomie bazy, że co najwyżej jeden wiersz może mieć status `active`.

**Contract**: Tabela `public.tournaments`: `id uuid primary key default gen_random_uuid()`, `name text not null`, `description text`, `status text not null default 'active' check (status in ('active', 'closed'))`, `created_by uuid not null references auth.users (id)`, `created_at timestamptz not null default now()`. RLS włączone; polityki `admin_select_tournaments` i `admin_insert_tournaments` używające `public.is_admin(auth.uid())` (funkcja z F-01, bez zmian). Częściowy unikalny indeks wymuszający regułę "jeden aktywny turniej naraz" — patrz Critical Implementation Details po dokładną definicję.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się czysto na zalinkowanym zdalnym projekcie Supabase: `npx supabase db push` (patrz Critical Implementation Details — brak Dockera w tym środowisku, lokalny `db reset` pominięty świadomie); `npx supabase migration list` potwierdza zgodność `Local`/`Remote`.

#### Manual Verification:

- W Supabase Studio (zdalny, zalinkowany projekt) widoczna jest tabela `tournaments` z poprawnymi kolumnami, RLS włączone.
- Ręczny insert drugiego wiersza ze statusem `active` przez SQL Editor kończy się błędem naruszenia unikalności (`23505`); insert ze statusem `closed` jako drugi wiersz się udaje.
- Zapytanie do `tournaments` w kontekście Admina zwraca wiersze; to samo zapytanie w kontekście User nic nie zwraca (RLS blokuje).

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie zachowanie unikalnego indeksu i RLS, zanim przejdziesz do endpointu API, który się na nich opiera.

---

## Phase 2: Endpoint API tworzenia turnieju

### Overview

Dodajemy pierwszy w repo endpoint z walidacją zod i zastępujemy nim tymczasowy diagnostyczny endpoint z F-01.

### Changes Required:

#### 1. Zależność zod

**File**: `package.json`

**Intent**: Dodać `zod` jako zależność produkcyjną — wymagane przez `AGENTS.md` dla walidacji endpointów API, pierwszy taki przypadek w repo.

**Contract**: `npm install zod` dodaje wpis do `dependencies`.

#### 2. Endpoint tworzenia turnieju

**File**: `src/pages/api/admin/tournaments.ts` (nowy plik)

**Intent**: Przyjąć dane formularza (`name`, opcjonalny `description`), zweryfikować je zod, wymusić rolę Admina, wstawić wiersz do `tournaments`, i przekierować z powrotem na `/admin/tournaments` — z czytelnym błędem w query param w razie porażki walidacji, konfliktu unikalności aktywnego turnieju, lub innego błędu bazy.

**Contract**: Eksportuje `export const prerender = false;` (hard rule z `AGENTS.md`) i `POST: APIRoute`. Pierwsza linia handlera: `requireRole(context.locals, "admin")` — przy odmowie zwraca bezpośrednio jej wynik. Schemat zod: `name` — string, przycięty, min. 1 i maks. 200 znaków; `description` — string, przycięty, maks. 2000 znaków, pusty ciąg traktowany jako brak wartości. Dane wejściowe pochodzą z `context.request.formData()` (spójne z natywnym formularzem z Fazy 3, nie z JSON). Błąd walidacji zod → `context.redirect('/admin/tournaments?error=' + encodeURIComponent(<pierwszy komunikat błędu zod>))`. Sukces walidacji → insert do `tournaments` z `created_by` ustawionym na id zalogowanego Admina; błąd insertu z `error.code === "23505"` → redirect z komunikatem o istniejącym aktywnym turnieju (patrz Critical Implementation Details); inny błąd insertu → redirect z ogólnym komunikatem błędu. Sukces insertu → `context.redirect("/admin/tournaments")` (bez query param).

#### 3. Usunięcie tymczasowego endpointu diagnostycznego

**File**: `src/pages/api/admin/ping.ts` (usunięty)

**Intent**: Endpoint istniał wyłącznie jako dowód działania `requireRole()` w F-01, z jawnym komentarzem "Replaced by a real admin API endpoint in S-01" — ten plasterek dostarcza ten realny endpoint, więc placeholder jest usuwany.

**Contract**: Plik usunięty w całości; brak innych referencji do niego w kodzie (potwierdzić wyszukaniem `admin/ping`).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check + build przechodzą: `npm run build`

#### Manual Verification:

- Zalogowany jako Admin, poprawny POST tworzy wiersz w `tournaments` i przekierowuje na `/admin/tournaments` bez błędu.
- POST bez `name` (lub samymi białymi znakami) przekierowuje z czytelnym komunikatem błędu walidacji.
- Drugi POST (przy istniejącym aktywnym turnieju) przekierowuje z komunikatem o istniejącym aktywnym turnieju, nie z surowym błędem bazy.
- Bezpośredni POST jako User (np. przez `curl` z sesją Usera) zwraca 403.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie wszystkie cztery ścieżki powyżej, zanim przejdziesz do UI, które się na tym endponcie opiera.

---

## Phase 3: UI Admina — hub i strona turniejów

### Overview

Zastępujemy tymczasowy placeholder `/admin` hubem sekcji administracyjnych i dodajemy `/admin/tournaments` z listą oraz formularzem tworzenia.

### Changes Required:

#### 1. Hub admina

**File**: `src/pages/admin.astro` (zastąpiony)

**Intent**: Zastąpić placeholder demo z F-01 minimalnym hubem — na razie z jednym linkiem do sekcji turniejów, gotowym na kolejne sekcje (przyszłe S-02 — użytkownicy, S-03 — spotkania) bez przebudowy w przyszłości.

**Contract**: Ten sam `Layout` i styl karty co pozostałe strony (`dashboard.astro`, dotychczasowy `admin.astro`). Zawiera link do `/admin/tournaments` ("Turnieje"). Ochrona dostępu pozostaje wyłącznie przez middleware (bez zmian w `src/middleware.ts` — już pokrywa `/admin/tournaments` przez `startsWith`).

#### 2. Strona listy i tworzenia turniejów

**File**: `src/pages/admin/tournaments.astro` (nowy plik)

**Intent**: Dać Adminowi jedno miejsce, w którym widzi wszystkie dotychczasowe turnieje i może założyć nowy — bez osobnej podstrony na sukces (redirect po sukcesie wraca na tę samą stronę).

**Contract**: W frontmatterze strony (server-side, Astro): odczyt `error` z `Astro.url.searchParams`; zapytanie `supabase.from("tournaments").select("*").order("created_at", { ascending: false })` przez istniejący `createClient` (`src/lib/supabase.ts`) — RLS z Fazy 1 ogranicza wynik do widoku Admina, bez dodatkowego filtrowania w kodzie. Renderuje: komunikat błędu (jeśli `error` obecny — statyczny markup Astro w stylu wizualnym `ServerError.tsx`, bez importu komponentu React, bo brak potrzeby interaktywności), formularz `<form method="POST" action="/api/admin/tournaments">` z polami `name` (wymagane, `input`) i `description` (opcjonalne, `textarea`) oraz przyciskiem submit, oraz listę turniejów (nazwa, status, opis jeśli obecny, data utworzenia) — pusta lista pokazuje komunikat "Brak turniejów" zamiast pustej tabeli.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check + build przechodzą: `npm run build`

#### Manual Verification:

- Zalogowany jako Admin → `/admin` pokazuje hub z linkiem do turniejów; `/admin/tournaments` pokazuje pusty stan przed pierwszym turniejem.
- Utworzenie turnieju przez formularz → strona pokazuje nowy wiersz na liście natychmiast po przekierowaniu.
- Próba utworzenia drugiego turnieju → czytelny komunikat błędu widoczny na stronie, żaden nowy wiersz nie pojawia się na liście.
- Zalogowany jako przykładowy User → wejście na `/admin` i `/admin/tournaments` przekierowuje na `/dashboard` (middleware, bez zmian).
- Niezalogowany → wejście na `/admin/tournaments` przekierowuje na `/auth/signin`.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie wszystkie pięć ścieżek powyżej — to ostatnia faza tej zmiany.

---

## Testing Strategy

### Unit Tests:

- Brak — projekt nie ma frameworka testowego (zgodnie z F-01 i `AGENTS.md`); pokrycie zapewnia lint + build + weryfikacja manualna.

### Integration Tests:

- Brak (jak wyżej).

### Manual Testing Steps:

1. Zalogować się jako Admin, utworzyć pierwszy turniej przez `/admin/tournaments` — sprawdzić, że pojawia się na liście.
2. Spróbować utworzyć drugi turniej — potwierdzić czytelny komunikat błędu (nie surowy błąd bazy).
3. Wysłać POST z pustym `name` — potwierdzić komunikat walidacji zod.
4. Zalogować się jako przykładowy User (konto z F-01) — potwierdzić przekierowanie z `/admin` i `/admin/tournaments` na `/dashboard`.
5. Wylogować się i wejść na `/admin/tournaments` — potwierdzić przekierowanie na `/auth/signin`.
6. W Supabase Studio potwierdzić, że User nie widzi żadnych wierszy `tournaments` przy zapytaniu w jego kontekście auth (RLS).

## Performance Considerations

Brak istotnych implikacji — pojedyncza tabela, mała skala (dziesiątki wierszy zgodnie z NFR "skala pojedynczego biura"), zapytanie listy bez paginacji jest wystarczające na tym etapie.

## Migration Notes

Pierwsza migracja po `profiles` z F-01 — brak istniejących danych `tournaments` do przeniesienia. `is_admin()` z F-01 jest reużywane bez zmian.

## References

- Related roadmap item: `context/foundation/roadmap.md` (S-01: admin-creates-tournament)
- Fundament ról: `context/changes/role-based-access-foundation/plan.md`
- Wzorzec redirect+error: `src/pages/api/auth/signin.ts`, `src/pages/auth/signin.astro`
- Wzorzec RLS bez rekurencji: `supabase/migrations/20260908150000_create_profiles_and_roles.sql:18-27`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Model danych — tabela `tournaments`, RLS, reguła jednego aktywnego turnieju

#### Automated

- [x] 1.1 Migracja aplikuje się czysto na zalinkowanym zdalnym projekcie Supabase: `npx supabase db push` — a3660e0

#### Manual

- [x] 1.2 Tabela `tournaments` widoczna w Supabase Studio z poprawnymi kolumnami, RLS włączone — a3660e0
- [x] 1.3 Drugi insert ze statusem `active` kończy się błędem `23505`; insert ze statusem `closed` się udaje — a3660e0
- [x] 1.4 Admin widzi wiersze `tournaments`; User nic nie widzi (RLS) — a3660e0

### Phase 2: Endpoint API tworzenia turnieju

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — 63da366
- [x] 2.2 Build przechodzi: `npm run build` — 63da366

#### Manual

- [x] 2.3 Poprawny POST jako Admin tworzy wiersz i przekierowuje bez błędu — 5965b1e
- [x] 2.4 POST bez `name` przekierowuje z komunikatem walidacji — 5965b1e
- [x] 2.5 Drugi POST (aktywny turniej już istnieje) przekierowuje z czytelnym komunikatem, nie surowym błędem bazy — 5965b1e
- [x] 2.6 Bezpośredni POST jako User zwraca 403 — 5965b1e

### Phase 3: UI Admina — hub i strona turniejów

#### Automated

- [x] 3.1 Lint przechodzi: `npm run lint` — 5965b1e
- [x] 3.2 Build przechodzi: `npm run build` — 5965b1e

#### Manual

- [x] 3.3 Admin: `/admin` pokazuje hub, `/admin/tournaments` pokazuje pusty stan przed pierwszym turniejem — 5965b1e
- [x] 3.4 Utworzenie turnieju przez formularz pokazuje nowy wiersz na liście — 5965b1e
- [x] 3.5 Próba drugiego turnieju pokazuje czytelny błąd, brak nowego wiersza na liście — 5965b1e
- [x] 3.6 User przekierowany z `/admin` i `/admin/tournaments` na `/dashboard` — 5965b1e
- [x] 3.7 Niezalogowany przekierowany z `/admin/tournaments` na `/auth/signin` — 5965b1e
