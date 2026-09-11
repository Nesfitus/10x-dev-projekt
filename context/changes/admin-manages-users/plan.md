# Admin zarządza użytkownikami (bez samorejestracji) — Implementation Plan

## Overview

Admin dodaje nowe konta Userów (FR-003) z ręcznie ustawionym hasłem, bez samorejestracji ani wysyłki e-maili, i może dezaktywować (nie fizycznie usunąć) istniejące konta Userów — nigdy konta Admina. Publiczna samorejestracja jest już zamknięta od F-01; ten plasterek dostarcza jedyną pozostałą drogę zakładania kont, zgodną z FR-002/FR-003. Tworzenie i listowanie kont wymaga nowego sekretu Supabase (`service_role`), bo `auth.admin.*` nie działa na dotychczasowym kluczu `anon`.

## Current State Analysis

- F-01 w pełni zamknął samorejestrację: formularz (`src/pages/auth/signup.astro`), endpoint (`src/pages/api/auth/signup.ts`, zawsze redirect z błędem) i flagi `enable_signup` w `supabase/config.toml` oraz w dashboardzie Supabase produkcyjnego projektu — więc nie ma dziś żadnej drogi założenia konta poza ręczną operacją w Supabase Studio.
- `SUPABASE_KEY` (`astro.config.mjs:27-28`, `src/lib/supabase.ts`) to klucz **anon** używany przez `@supabase/ssr` do sesji per-request respektującej RLS — potwierdzone przez to, że polityki RLS z F-01/S-01 (`is_admin(auth.uid())`) w ogóle mają sens tylko przy kluczu, który przenosi tożsamość zalogowanego użytkownika. Ten klucz nie ma uprawnień do `supabase.auth.admin.*` (Admin API wymaga klucza `service_role`).
- `context/deployment/deploy-plan.md` śledzi dziś dokładnie dwa sekrety produkcyjne: `SUPABASE_URL`, `SUPABASE_KEY` (`wrangler secret put`) — `service_role` nie jest jeszcze nigdzie skonfigurowany, ani lokalnie (`.env`), ani na żywym Workerze.
- Trigger `handle_new_user` (`supabase/migrations/20260908150000_create_profiles_and_roles.sql:42-52`) uruchamia się przy KAŻDYM insercie do `auth.users` — niezależnie od tego, czy wiersz powstał przez self-signup czy Admin API — więc profil (`role='user'`) powstanie automatycznie bez dodatkowej logiki.
- Podczas implementacji F-01 napotkano twardy limit Supabase: **2 rejestracje/godzinę na darmowym planie** (`context/changes/role-based-access-foundation/plan.md:97`) — dowolna droga wysyłająca e-mail transakcyjny (np. zaproszenie) uderza w ten sam limit.
- `profiles` (F-01) ma dziś kolumny `id`, `role`, `created_at`; brak `email` (żyje wyłącznie w `auth.users`) i brak jakiejkolwiek flagi aktywności/dezaktywacji.
- Middleware (`src/middleware.ts:17-30`) dziś pobiera tylko `role` z `profiles`; nie ma pojęcia o dezaktywowanych kontach.
- Zainstalowany `zod` (`^4.6.2`) oznacza `.string().email()` jako **deprecated** na rzecz top-level `z.email()` — repo ma aktywną regułę lint `@typescript-eslint/no-deprecated`, która złapałaby użycie starej metody (potwierdzone w `node_modules/zod/v4/classic/schemas.d.ts:113-114`).
- Ustalony wzorzec z S-01 do naśladowania: dedykowana strona Astro (lista + formularz) pod `/admin/<zasób>`, natywny `<form method="POST">` + redirect z błędem w query param, endpoint z `requireRole("admin")` + walidacją zod, hub `/admin` linkujący do sekcji.
- `context/foundation/lessons.md` ("Weryfikuj przez zdalny Supabase i realny deploy") — migracje weryfikować przez `npx supabase db push` na zalinkowanym zdalnym projekcie; zmiany w kodzie wymagają `git push` + auto-deploy Cloudflare Workers Builds przed manualną weryfikacją na żywej aplikacji, nie lokalnie.

## Desired End State

Po ukończeniu tej zmiany:

- Admin na `/admin/users` widzi listę wszystkich kont (e-mail, rola, status aktywny/dezaktywowany) i formularz dodania nowego Usera (e-mail + hasło, ustawiane przez Admina).
- Nowy User może natychmiast zalogować się podanym przez Admina hasłem — bez e-maila weryfikacyjnego, bez samodzielnej rejestracji.
- Admin może dezaktywować dowolne konto z rolą `user` (nigdy `admin`) — dezaktywowany User przestaje mieć dostęp przy najbliższym żądaniu (wylogowanie wymuszone przez middleware), z czytelnym komunikatem przy próbie wejścia na chronioną trasę.
- Nowy sekret `SUPABASE_SERVICE_ROLE_KEY` jest skonfigurowany lokalnie (`.env`) i na żywym Workerze (`wrangler secret put`), udokumentowany w `context/deployment/deploy-plan.md`.
- `/admin` linkuje też do `/admin/users`, obok istniejącego linku do turniejów.

### Key Discoveries:

- `email_confirm: true` w `supabase.auth.admin.createUser()` oznacza konto jako od razu zweryfikowane — omija całkowicie limit 2 e-maile/godz. napotkany w F-01, bo Supabase nie wysyła żadnego e-maila w tej ścieżce.
- Brak polityk RLS INSERT/UPDATE/DELETE na `profiles` (F-01, celowo) oznacza, że jedyną drogą do ustawienia `disabled = true` jest klient `service_role` (bypassuje RLS) — nie trzeba dodawać nowej polityki RLS dla tego zapisu.
- `auth.admin.listUsers()` (klient `service_role`) jest jedynym źródłem adresów e-mail — `profiles` ich nie przechowuje i nie musi zacząć, unikając duplikacji danych.

## What We're NOT Doing

- Nie fizycznie usuwamy kont (`auth.admin.deleteUser`) — tylko miękka dezaktywacja (`profiles.disabled`), odwracalna ręcznie przez Supabase Studio.
- Nie pozwalamy dezaktywować ani promować/degradować roli żadnego konta z rolą `admin` przez to UI — promocja do `admin` pozostaje ręczną operacją SQL poza aplikacją (ustalone w F-01).
- Nie wymuszamy zmiany hasła przy pierwszym logowaniu Usera — brak takiego wymogu w PRD, brak dodatkowej flagi/strony w tym plasterku.
- Nie wysyłamy żadnego e-maila (zaproszenia, powiadomienia) do nowo utworzonego Usera — Admin przekazuje hasło poza aplikacją.
- Nie budujemy edycji istniejących kont (zmiana e-maila, resetu hasła przez Admina) — poza zakresem FR-003.
- Nie dodajemy paginacji do listy użytkowników — skala pojedynczego biura (NFR: rząd dziesiątek) mieści się w domyślnej stronie `listUsers()`.
- Nie dodajemy frameworka testowego — konwencja repo (lint/build/manual) bez zmian.

## Implementation Approach

Pięć faz w kolejności zależności: (1) migracja dodająca `profiles.disabled`, (2) nowy sekret `service_role` + klient administracyjny (`createAdminClient()`) + dokumentacja wdrożenia, (3) middleware egzekwujący dezaktywację (zależy tylko od kolumny z Fazy 1), (4) dwa endpointy API (tworzenie, dezaktywacja — zależą od Fazy 1 i 2), (5) UI Admina (lista + formularz + przycisk dezaktywacji). Formularz i lista używają natywnego Astro (bez wyspy React), zgodnie z ustalonym wzorcem S-01 — reużycie istniejącego `SignUpForm.tsx` odrzucone, bo ten komponent jest zaprojektowany dla self-signup (`action="/api/auth/signup"`), nie dla akcji "Admin dodaje kogoś innego".

## Critical Implementation Details

**Unikanie limitu e-maili Supabase.** `supabase.auth.admin.createUser({ email, password, email_confirm: true })` — flaga `email_confirm: true` oznacza konto jako od razu zweryfikowane i **nie wysyła żadnego e-maila**. To jedyny sposób ominięcia twardego limitu 2 rejestracje/godzinę napotkanego przy bootstrapie F-01; pominięcie tej flagi wysłałoby e-mail weryfikacyjny i odtworzyłoby ten sam problem.

**`z.email()`, nie `.string().email()`.** Zainstalowany zod v4 oznacza `.string().email()` jako `@deprecated` na rzecz top-level `z.email()`. Repo ma aktywną regułę ESLint `@typescript-eslint/no-deprecated` (już raz złapała podobny przypadek z `.returns()` w S-01) — użycie starej metody nie przejdzie lintu.

**Dyscyplina klienta `service_role`.** Nowy `createAdminClient()` bypassuje RLS całkowicie. Wolno go wywoływać wyłącznie w kodzie server-side już chronionym przez `requireRole("admin")` (endpointy) lub przez middleware `ADMIN_ROUTES` (strona `/admin/users`) — nigdy w kodzie dostępnym dla ról innych niż Admin, i nigdy do niczego poza: tworzeniem konta, listowaniem kont, przełączaniem `profiles.disabled`.

**Egzekwowanie dezaktywacji w middleware.** Middleware musi teraz odczytać `role` ORAZ `disabled` w jednym zapytaniu do `profiles`. Jeśli `disabled === true`: wywołaj `supabase.auth.signOut()` (unieważnia sesję/cookie), ustaw `context.locals.user = null` i `context.locals.role = null` — dokładnie tak, jakby użytkownik nigdy się nie zalogował. Dzięki temu każde kolejne żądanie (nie tylko chronione trasy) natychmiast kończy sesję dezaktywowanego konta, bez potrzeby jawnego śledzenia "kto jest aktualnie zalogowany". Przy próbie wejścia na `PROTECTED_ROUTES`/`ADMIN_ROUTES` przez świeżo-wylogowane w ten sposób konto, redirect na `/auth/signin` niesie dodatkowo `?error=` z komunikatem o dezaktywacji (ten sam wzorzec query-param co istniejące redirecty).

## Phase 1: Migracja — kolumna `disabled` w `profiles`

### Overview

Dodajemy jedyną zmianę schematu potrzebną do miękkiej dezaktywacji kont.

### Changes Required:

#### 1. Migracja SQL

**File**: `supabase/migrations/20260911120000_add_profiles_disabled.sql` (nowy plik)

**Intent**: Dodać flagę dezaktywacji do istniejącej tabeli `profiles`, domyślnie `false` dla wszystkich (w tym już istniejących) kont.

**Contract**: `ALTER TABLE public.profiles ADD COLUMN disabled boolean NOT NULL DEFAULT false;`. Brak zmian w RLS — istniejące polityki SELECT (`select_own_profile`, `admin_select_all_profiles`) automatycznie obejmują nową kolumnę; brak nowej polityki UPDATE (zapis wyłącznie przez `service_role`, patrz Critical Implementation Details).

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się czysto na zalinkowanym zdalnym projekcie Supabase: `npx supabase db push`; `npx supabase migration list` potwierdza zgodność `Local`/`Remote` (zgodnie z `context/foundation/lessons.md` — brak Dockera w tym środowisku).

#### Manual Verification:

- W Supabase Studio (zdalny projekt) kolumna `disabled` widoczna w `profiles`, wszystkie istniejące wiersze mają `false`.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie obecność kolumny, zanim przejdziesz do middleware, który się na niej opiera.

---

## Phase 2: Sekret `service_role` i klient administracyjny

### Overview

Wprowadzamy nowy sekret Supabase i klienta korzystającego z niego do operacji Admin API, wraz z dokumentacją wdrożeniową.

### Changes Required:

#### 1. Schemat zmiennych środowiskowych

**File**: `astro.config.mjs`

**Intent**: Zarejestrować nowy sekret analogicznie do istniejących `SUPABASE_URL`/`SUPABASE_KEY`.

**Contract**: Dodaje `SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true })` do `env.schema`, obok dwóch istniejących wpisów.

#### 2. Przykładowa konfiguracja lokalna

**File**: `.env.example`

**Intent**: Udokumentować nowy wymagany sekret dla każdego, kto konfiguruje projekt lokalnie.

**Contract**: Dodaje linię `SUPABASE_SERVICE_ROLE_KEY=` obok istniejących `SUPABASE_URL=`/`SUPABASE_KEY=`.

#### 3. Klient administracyjny

**File**: `src/lib/supabase.ts`

**Intent**: Dać server-side kodowi jeden, jawny sposób wywołania Supabase Admin API (`auth.admin.*`) oraz zapisów bypassujących RLS na `profiles`, odseparowany od istniejącego klienta sesyjnego opartego o cookies.

**Contract**: Nowy eksport `createAdminClient()` — buduje klienta plain `@supabase/supabase-js` (`createClient` z tego pakietu, nie `@supabase/ssr`) z `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, opcje `{ auth: { autoRefreshToken: false, persistSession: false } }` (brak potrzeby zarządzania sesją — to klient service-to-service). Zwraca `null`, jeśli któryś z sekretów brakuje, tak jak istniejący `createClient()`.

#### 4. Banner konfiguracji

**File**: `src/lib/config-status.ts`

**Intent**: Rozszerzyć istniejący mechanizm bannera o brakującej konfiguracji, żeby brak `service_role` też był widoczny, nie tylko cichym `null` w kodzie.

**Contract**: Zmienia warunek `configured` wpisu `"Supabase"` na `Boolean(SUPABASE_URL && SUPABASE_KEY && SUPABASE_SERVICE_ROLE_KEY)`; import rozszerzony o `SUPABASE_SERVICE_ROLE_KEY` z `astro:env/server`.

#### 5. Dokumentacja wdrożenia

**File**: `context/deployment/deploy-plan.md`

**Intent**: Utrzymać ten plik jako źródło prawdy o skonfigurowanych sekretach produkcyjnych (zgodnie z jego własnym opisem "ground truth for ... which secrets are already wired").

**Contract**: Dodaje `SUPABASE_SERVICE_ROLE_KEY` do listy sekretów w sekcji "Current operational state" i do wiersza "Production secrets" w "What was done", z notatką, że wartość pochodzi z Supabase Dashboard → Project Settings → API → `service_role` secret.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check + build przechodzą: `npm run build`

#### Manual Verification:

- Sekret `SUPABASE_SERVICE_ROLE_KEY` ustawiony lokalnie w `.env` (wartość z Supabase Dashboard → Project Settings → API).
- Sekret ustawiony na żywym Workerze: `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`.
- `context/deployment/deploy-plan.md` odzwierciedla trzeci skonfigurowany sekret.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź, że sekret jest ustawiony w OBU miejscach (lokalnie i na żywo) — Faza 4 (endpointy) nie da się w pełni zweryfikować bez tego, zgodnie z `context/foundation/lessons.md`.

---

## Phase 3: Middleware — egzekwowanie dezaktywacji konta

### Overview

Middleware zaczyna odczytywać `disabled` obok `role` i wymusza natychmiastowe wylogowanie dezaktywowanych kont.

### Changes Required:

#### 1. Middleware

**File**: `src/middleware.ts`

**Intent**: Po pobraniu profilu zalogowanego użytkownika, jeśli konto jest dezaktywowane, unieważnić jego sesję i traktować dalej jak niezalogowanego — z czytelnym komunikatem przy próbie dostępu do trasy chronionej.

**Contract**: Rozszerza zapytanie `.select("role")` (linia 20) na `.select("role, disabled")` z typem `{ role: UserRole; disabled: boolean }`. Jeśli `profile?.disabled` jest `true`: wywołuje `await supabase.auth.signOut()`, ustawia `context.locals.user = null` i `context.locals.role = null`, i zapamiętuje lokalną zmienną (np. `disabledMessage`) z komunikatem "Twoje konto zostało dezaktywowane." Istniejące bloki gatingu `PROTECTED_ROUTES`/`ADMIN_ROUTES` (linie 32-42) doklejają `disabledMessage` jako `?error=` do redirectu na `/auth/signin`, gdy jest ustawiony (w przeciwnym razie zachowanie identyczne jak dziś).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check + build przechodzą: `npm run build`

#### Manual Verification:

- Ręczne ustawienie `disabled = true` dla testowego konta Usera w Supabase Studio, a następnie próba wejścia na `/dashboard` przez to konto → redirect na `/auth/signin` z komunikatem o dezaktywacji.
- To samo konto nie ma już aktywnej sesji po odświeżeniu dowolnej strony (wylogowane).
- Zwykłe (nie dezaktywowane) konto nadal loguje się i porusza po aplikacji bez zmian.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie zachowanie dezaktywacji, zanim przejdziesz do endpointów, które będą ją ustawiać automatycznie.

---

## Phase 4: Endpointy API — tworzenie i dezaktywacja konta

### Overview

Dwa endpointy chronione rolą Admina: tworzenie nowego Usera i dezaktywacja istniejącego.

### Changes Required:

#### 1. Endpoint tworzenia użytkownika

**File**: `src/pages/api/admin/users.ts` (nowy plik)

**Intent**: Przyjąć e-mail i hasło z formularza, zweryfikować je zod, wymusić rolę Admina, utworzyć konto przez Supabase Admin API z ominięciem e-maila weryfikacyjnego, i przekierować z powrotem na `/admin/users` — z czytelnym błędem w query param przy porażce walidacji lub duplikacie e-maila.

**Contract**: Eksportuje `export const prerender = false;` i `POST: APIRoute`. Pierwsza linia handlera: `requireRole(context.locals, "admin")`. Schemat zod: `email` — `z.email(...)` (patrz Critical Implementation Details — nie `.string().email()`), przycięty; `password` — string, min. 6 (spójnie z `SignUpForm.tsx`), maks. 72 znaków (limit bcrypt/GoTrue). Dane z `context.request.formData()`. Błąd walidacji → redirect z pierwszym komunikatem błędu zod. Sukces walidacji → `createAdminClient().auth.admin.createUser({ email, password, email_confirm: true })`; błąd z `error.code === "email_exists"` → redirect z komunikatem "Konto z tym adresem e-mail już istnieje"; inny błąd → redirect z ogólnym komunikatem "Nie udało się utworzyć konta". Sukces → `context.redirect("/admin/users")` bez query param. Brak dodatkowego insertu do `profiles` — trigger z F-01 tworzy wiersz automatycznie.

#### 2. Endpoint dezaktywacji użytkownika

**File**: `src/pages/api/admin/users/[id]/disable.ts` (nowy plik)

**Intent**: Dezaktywować istniejące konto z rolą `user`, blokując jawnie próbę dezaktywacji jakiegokolwiek konta `admin`.

**Contract**: Eksportuje `export const prerender = false;` i `POST: APIRoute`. Pierwsza linia handlera: `requireRole(context.locals, "admin")`. Odczytuje `context.params.id`; przez `createAdminClient()` pobiera wiersz `profiles` dla tego `id` (`select("role")`) — jeśli `role === "admin"` lub wiersz nie istnieje, redirect na `/admin/users` z błędem ("Nie można dezaktywować konta Admina" / "Nie znaleziono konta"), bez wykonania update. W przeciwnym razie `update({ disabled: true }).eq("id", id)` przez `createAdminClient()` (bypass RLS — brak polityki UPDATE, patrz Faza 1). Sukces lub błąd update → `context.redirect("/admin/users")` (błąd update → z ogólnym komunikatem błędu, przypadek brzegowy, nieoczekiwany w normalnym działaniu).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check + build przechodzą: `npm run build`

#### Manual Verification:

- Zalogowany jako Admin, poprawny POST na `/api/admin/users` tworzy konto Usera; nowy User może się od razu zalogować podanym hasłem bez żadnego e-maila.
- POST z już istniejącym e-mailem przekierowuje z czytelnym komunikatem o duplikacie.
- POST z nieprawidłowym e-mailem lub za krótkim hasłem przekierowuje z komunikatem walidacji.
- POST na `/api/admin/users/[id]/disable` dla konta `user` ustawia `disabled = true`; ta sama próba dla konta `admin` (np. własnego) kończy się błędem i NIE zmienia jego statusu.
- Bezpośredni POST na oba endpointy jako User (nie Admin) zwraca 403.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie wszystkie pięć ścieżek powyżej, zanim przejdziesz do UI, które się na nich opiera.

---

## Phase 5: UI Admina — strona zarządzania użytkownikami

### Overview

Dodajemy stronę `/admin/users` (lista + formularz + akcja dezaktywacji) i link z hubu `/admin`.

### Changes Required:

#### 1. Link z hubu admina

**File**: `src/pages/admin.astro`

**Intent**: Dodać drugi wpis nawigacji obok istniejącego linku do turniejów.

**Contract**: Dodaje `<a href="/admin/users">Użytkownicy</a>` do istniejącej listy `<nav>` (ten sam styl co link "Turnieje" z S-01).

#### 2. Strona zarządzania użytkownikami

**File**: `src/pages/admin/users.astro` (nowy plik)

**Intent**: Dać Adminowi jedno miejsce z listą wszystkich kont (e-mail, rola, status) i formularzem dodania nowego Usera; przycisk dezaktywacji widoczny wyłącznie przy wierszach z rolą `user`.

**Contract**: W frontmatterze: odczyt `error` z `Astro.url.searchParams`; przez `createAdminClient()` (jeśli dostępny) pobiera `auth.admin.listUsers()` (źródło e-maili) oraz `profiles.select("id, role, disabled, created_at")` (bez RLS — bezpieczne, strona już chroniona przez `ADMIN_ROUTES` w middleware), łączy oba zbiory w pamięci po `id`, sortuje po `created_at` malejąco. Renderuje: komunikat błędu (jeśli `error` obecny, statyczny markup jak w `/admin/tournaments`), formularz `<form method="POST" action="/api/admin/users">` z polami `email` i `password` (oba wymagane, `input`), oraz listę kont (e-mail, rola, status "aktywny"/"dezaktywowany") — przy wierszach z rolą `user` i `disabled === false` renderuje `<form method="POST" action="/api/admin/users/{id}/disable">` z przyciskiem "Dezaktywuj" i inline `onsubmit="return confirm('Na pewno dezaktywować to konto?')"` (patrz decyzja o potwierdzeniu); wiersze `admin` lub już dezaktywowane nie mają przycisku. Pusta lista pokazuje komunikat "Brak użytkowników" (w praktyce nieosiągalne — co najmniej konto Admina zawsze istnieje, ale zachowuje spójność ze wzorcem `/admin/tournaments`).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check + build przechodzą: `npm run build`

#### Manual Verification:

- Zalogowany jako Admin → `/admin` pokazuje link "Użytkownicy"; `/admin/users` pokazuje listę istniejących kont z poprawnymi e-mailami, rolami i statusem.
- Dodanie Usera przez formularz → nowy wiersz pojawia się na liście natychmiast po przekierowaniu.
- Kliknięcie "Dezaktywuj" przy koncie `user` → okno potwierdzenia przeglądarki, po akceptacji wiersz pokazuje status "dezaktywowany", przycisk znika.
- Wiersz z rolą `admin` nigdy nie pokazuje przycisku "Dezaktywuj".
- Zalogowany jako przykładowy User → wejście na `/admin` i `/admin/users` przekierowuje na `/dashboard` (middleware, bez zmian).
- Nowo utworzone (i nie dezaktywowane) konto Usera loguje się poprawnie podanym przez Admina hasłem.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie wszystkie sześć ścieżek powyżej — to ostatnia faza tej zmiany.

---

## Testing Strategy

### Unit Tests:

- Brak — projekt nie ma frameworka testowego (zgodnie z F-01/S-01 i `AGENTS.md`); pokrycie zapewnia lint + build + weryfikacja manualna.

### Integration Tests:

- Brak (jak wyżej).

### Manual Testing Steps:

1. Ustawić sekret `SUPABASE_SERVICE_ROLE_KEY` lokalnie i na żywym Workerze (Faza 2).
2. Zalogować się jako Admin, dodać nowego Usera przez `/admin/users` z testowym e-mailem i hasłem.
3. Wylogować się, zalogować się jako ten nowy User podanym hasłem — potwierdzić natychmiastowy, bezproblemowy dostęp (brak e-maila weryfikacyjnego).
4. Jako Admin, dezaktywować to konto — potwierdzić okno potwierdzenia, zniknięcie przycisku, zmianę statusu na liście.
5. Spróbować zalogować się ponownie jako dezaktywowany User — potwierdzić redirect z komunikatem o dezaktywacji.
6. Spróbować dezaktywować konto Admina (np. własne) — potwierdzić błąd i brak zmiany statusu.
7. Spróbować dodać Usera z już istniejącym e-mailem — potwierdzić czytelny komunikat o duplikacie.

## Performance Considerations

Brak istotnych implikacji — mała skala (dziesiątki kont, NFR "skala pojedynczego biura"), `listUsers()` bez własnej paginacji jest wystarczające na tym etapie.

## Migration Notes

Migracja z Fazy 1 jest addytywna (`ADD COLUMN ... DEFAULT false`) — nie wymaga backfillu, wszystkie istniejące konta (Admin + przykładowy User z F-01) automatycznie dostają `disabled = false`.

## References

- Related roadmap item: `context/foundation/roadmap.md` (S-02: admin-manages-users)
- Fundament ról: `context/changes/role-based-access-foundation/plan.md`
- Wzorzec lista+formularz+redirect: `context/changes/admin-creates-tournament/plan.md` (S-01)
- Lekcja o weryfikacji przez zdalny Supabase/deploy: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migracja — kolumna `disabled` w `profiles`

#### Automated

- [x] 1.1 Migracja aplikuje się czysto na zalinkowanym zdalnym projekcie Supabase: `npx supabase db push` — 27b1806

#### Manual

- [x] 1.2 Kolumna `disabled` widoczna w `profiles` w Supabase Studio, wszystkie istniejące wiersze mają `false` — 27b1806

### Phase 2: Sekret `service_role` i klient administracyjny

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — 9edb8e9
- [x] 2.2 Build przechodzi: `npm run build` — 9edb8e9

#### Manual

- [x] 2.3 Sekret `SUPABASE_SERVICE_ROLE_KEY` ustawiony lokalnie w `.env` — 9edb8e9
- [x] 2.4 Sekret ustawiony na żywym Workerze: `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY` — 9edb8e9
- [x] 2.5 `context/deployment/deploy-plan.md` odzwierciedla trzeci skonfigurowany sekret — 9edb8e9

### Phase 3: Middleware — egzekwowanie dezaktywacji konta

#### Automated

- [x] 3.1 Lint przechodzi: `npm run lint` — 53789a6
- [x] 3.2 Build przechodzi: `npm run build` — 53789a6

#### Manual

- [x] 3.3 Ręczne ustawienie `disabled = true` dla testowego konta → redirect z `/dashboard` na `/auth/signin` z komunikatem — 53789a6
- [x] 3.4 To konto nie ma już aktywnej sesji po odświeżeniu strony — 53789a6
- [x] 3.5 Zwykłe konto nadal działa bez zmian — 53789a6

### Phase 4: Endpointy API — tworzenie i dezaktywacja konta

#### Automated

- [x] 4.1 Lint przechodzi: `npm run lint` — 6067667
- [x] 4.2 Build przechodzi: `npm run build` — 6067667

#### Manual

- [x] 4.3 Poprawny POST jako Admin tworzy konto Usera, logowalne od razu bez e-maila — 6067667
- [x] 4.4 POST z istniejącym e-mailem przekierowuje z komunikatem o duplikacie — 6067667
- [x] 4.5 POST z nieprawidłowym e-mailem/za krótkim hasłem przekierowuje z komunikatem walidacji — 6067667
- [x] 4.6 Dezaktywacja konta `user` ustawia `disabled = true`; próba dla `admin` kończy się błędem bez zmiany — 6067667
- [x] 4.7 Bezpośredni POST jako User na oba endpointy zwraca 403 — 6067667

### Phase 5: UI Admina — strona zarządzania użytkownikami

#### Automated

- [x] 5.1 Lint przechodzi: `npm run lint` — adc92d9
- [x] 5.2 Build przechodzi: `npm run build` — adc92d9

#### Manual

- [x] 5.3 `/admin` pokazuje link "Użytkownicy"; `/admin/users` pokazuje listę z poprawnymi e-mailami/rolami/statusem — adc92d9
- [x] 5.4 Dodanie Usera przez formularz pokazuje nowy wiersz na liście — adc92d9
- [x] 5.5 Dezaktywacja konta `user` przez UI (z potwierdzeniem) zmienia status i ukrywa przycisk — adc92d9
- [x] 5.6 Wiersz `admin` nigdy nie pokazuje przycisku "Dezaktywuj" — adc92d9
- [x] 5.7 User przekierowany z `/admin` i `/admin/users` na `/dashboard` — adc92d9
- [x] 5.8 Nowo utworzone, nie dezaktywowane konto loguje się poprawnie — adc92d9
