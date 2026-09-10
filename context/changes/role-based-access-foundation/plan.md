# Model ról Admin/User — fundament kontroli dostępu — Implementation Plan

## Overview

Wprowadzamy rozróżnienie ról Admin/User — dziś całkowicie nieobecne w projekcie — wraz z mechanizmem strażnika (guard) sprawdzającego rolę oraz bezpiecznym wyłączeniem istniejącej, publicznej samorejestracji, która koliduje z wymaganiami PRD (FR-002, FR-003: konta zakłada wyłącznie Admin). To jest fundament F-01 z `context/foundation/roadmap.md` — odblokowuje wszystkie kolejne plasterki (S-01 do S-07) kamienia milowego M-1.

## Current State Analysis

- Uwierzytelnianie już działa: `src/lib/supabase.ts:1-24` tworzy klienta SSR (`@supabase/ssr`); `src/middleware.ts:6-16` pobiera zalogowanego użytkownika i wkłada do `context.locals.user`; endpointy `src/pages/api/auth/{signin,signup,signout}.ts` obsługują logowanie/rejestrację/wylogowanie.
- Baza danych jest pusta: `supabase/migrations/` nie istnieje (to będzie pierwsza migracja w projekcie); `supabase/config.toml:58` ma `schema_paths = []`; `src/types.ts` nie istnieje.
- Publiczna samorejestracja jest w pełni funkcjonalna i domyślnie włączona: `supabase/config.toml:169` (`[auth] enable_signup = true`) i `supabase/config.toml:204` (`[auth.email] enable_signup = true`), z formularzem `src/pages/auth/signup.astro` i endpointem `src/pages/api/auth/signup.ts` — to wprost koliduje z FR-002/FR-003.
- Brak jakiegokolwiek modelu roli: żadna tabela, kolumna ani typ TypeScript nie reprezentuje dziś roli Admin/User.
- `src/env.d.ts:1-5` deklaruje `App.Locals.user`, ale nie `role`.
- Brak skonfigurowanego frameworka testowego w projekcie (potwierdzone w `AGENTS.md`) — weryfikacja automatyczna opiera się na `npm run lint` i `npm run build` (spójne z `.github/workflows/ci.yml:19-21`, który uruchamia `npx astro sync`, `npm run lint`, `npm run build`).

## Desired End State

Po ukończeniu tej zmiany:
- Istnieje tabela `profiles` (1:1 z `auth.users`) z kolumną `role` (`admin` | `user`), chroniona RLS.
- Każdy nowy użytkownik automatycznie dostaje wiersz `profiles` z domyślną rolą `user` (trigger na `auth.users`).
- Istnieje dokładnie jedno konto Admina (ręcznie wypromowane) i jedno przykładowe konto User — obie role możliwe do ręcznego zweryfikowania.
- `context.locals.role` jest dostępne w każdym request (middleware), a helper `requireRole()` pozwala jawnie chronić endpointy API.
- Tymczasowa strona `/admin` demonstruje działanie guarda (dostępna tylko dla roli `admin`).
- Publiczna samorejestracja jest wyłączona zarówno lokalnie (`supabase/config.toml`), jak i na żywym projekcie Supabase (dashboard) — zgodnie z FR-002/FR-003.

### Key Discoveries:

- Middleware już ma dokładnie ten wzorzec, który trzeba rozszerzyć o rolę: `src/middleware.ts:6-16` (pobranie usera) + `:18-22` (bramkowanie tras) — nowa logika roli dokłada się obok, nie zastępuje.
- `supabase/config.toml:266-269` ma zakomentowaną opcję `custom_access_token` hook — potwierdza, że projekt (i Supabase) wspiera też podejście przez JWT claims, ale wybrany model (tabela `profiles`) go nie wymaga.
- Trzy oddzielne flagi `enable_signup` istnieją w `config.toml` (linie 169, 204, 242) — globalna (`[auth]`), email-specific (`[auth.email]`) i SMS-specific (`[auth.sms]`, już `false`). Obie pierwsze trzeba wyłączyć.

## What We're NOT Doing

- Nie budujemy UI do dodawania kolejnych Userów przez Admina — to zakres S-02 (`admin-manages-users`), osobnego plasterka.
- Nie projektujemy ogólnego, reużywalnego wzorca RLS dla przyszłych tabel domenowych (turnieje, spotkania) — zgodnie z zasadą progressive disclosure z roadmapy, każda przyszła tabela dostanie własne polityki, gdy powstanie.
- Nie usuwamy współdzielonych komponentów formularza auth (`FormField.tsx`, `PasswordToggle.tsx`, `ServerError.tsx`, `SubmitButton.tsx`) — nadal używane przez `SignInForm.tsx`.
- Nie dodajemy frameworka testowego — poza zakresem tego fundamentu; weryfikacja pozostaje przez lint/build/manualne testy, zgodnie z obecną konwencją repo.
- Nie zmieniamy zachowania `/dashboard` (istniejąca chroniona strona) poza tym, że `context.locals.role` staje się dodatkowo dostępne tam też.

## Implementation Approach

Cztery fazy w ścisłej kolejności, bo każda zależy od poprzedniej: (1) schemat danych + RLS + trigger, (2) ręczny bootstrap dwóch kont testowych PRZED wyłączeniem samorejestracji, (3) mechanizm guard + strona demo, (4) wyłączenie samorejestracji. Ta kolejność celowo unika potrzeby zaszywania realnego adresu e-mail w wersjonowanej migracji SQL — konta zakłada się ręcznie przez istniejący formularz, a promocja do roli `admin` odbywa się jednym poleceniem SQL po fakcie.

## Critical Implementation Details

**RLS bez rekurencji.** Naiwna polityka "Admin widzi wszystkie profile" napisana jako podzapytanie bezpośrednio na tabeli `profiles` powoduje nieskończoną rekurencję w Postgresie. Rozwiązanie: funkcja SQL `is_admin(uid)` oznaczona `SECURITY DEFINER`, używana jako warunek polityki — to standardowy, udokumentowany wzorzec Supabase, nie autorska konstrukcja.

**`config.toml` a żywy projekt Supabase.** Plik `supabase/config.toml` kontroluje wyłącznie lokalne środowisko deweloperskie (`supabase start`) — **nie ma żadnego wpływu** na już wdrożony, zdalny projekt Supabase używany przez działającą aplikację (`https://typer-sportowy.patrykshon.workers.dev`). Wyłączenie samorejestracji wymaga DWÓCH oddzielnych kroków: edycji `config.toml` (dla lokalnego devu) ORAZ ręcznej zmiany w dashboardzie Supabase (Authentication → Providers → Email → wyłączenie "Allow new users to sign up") dla środowiska produkcyjnego. Pominięcie drugiego kroku zostawia realną, żywą lukę bezpieczeństwa.

**Kolejność bootstrapu kont.** Migracja (Faza 1) musi zostać zastosowana PRZED założeniem dwóch kont testowych (Faza 2) — inaczej trigger auto-tworzący wiersz `profiles` nie zdąży zadziałać i konta trzeba by ręcznie backfillować. Konta testowe muszą z kolei powstać PRZED wyłączeniem samorejestracji (Faza 4) — inaczej nie da się ich w ogóle założyć przez UI.

## Phase 1: Model danych — tabela `profiles`, trigger, RLS

### Overview

Tworzymy jedyną nową tabelę tego fundamentu wraz z automatycznym tworzeniem profilu dla każdego nowego użytkownika i politykami RLS.

### Changes Required:

#### 1. Migracja SQL

**File**: `supabase/migrations/20260908150000_create_profiles_and_roles.sql`

**Intent**: Utworzyć tabelę `profiles` (1:1 z `auth.users`), trigger auto-tworzący wiersz z domyślną rolą `user` przy każdej nowej rejestracji, oraz polityki RLS pozwalające użytkownikowi widzieć własny profil, a Adminowi — wszystkie.

**Contract**: Migracja musi zawierać, w tej kolejności: (a) `CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')), created_at timestamptz NOT NULL DEFAULT now())`; (b) `ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY`; (c) funkcja `is_admin(uid uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND role = 'admin') $$` — `SECURITY DEFINER` jest obowiązkowe, inaczej polityka poniżej rekursywnie zapętli RLS; (d) polityka `CREATE POLICY "select_own_profile" ON public.profiles FOR SELECT USING (auth.uid() = id)`; (e) polityka `CREATE POLICY "admin_select_all_profiles" ON public.profiles FOR SELECT USING (is_admin(auth.uid()))` (obie polityki SELECT łączą się logicznym OR — standardowe zachowanie Postgres RLS dla wielu permissive policies); (f) funkcja triggera `handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN INSERT INTO public.profiles (id) VALUES (new.id); RETURN new; END; $$` (rola domyślna `user` z kolumny DEFAULT — nie trzeba jej podawać jawnie); (g) `CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user()`. Brak polityk INSERT/UPDATE/DELETE dla ról `anon`/`authenticated` — jedyna droga zapisu to trigger (uruchamiany jako `SECURITY DEFINER`, poza RLS) lub bezpośredni dostęp `service_role`/Supabase Studio.

#### 2. Typ domenowy roli

**File**: `src/types.ts` (nowy plik)

**Intent**: Dać projektowi jedno miejsce prawdy dla typu roli, zgodnie z konwencją z `AGENTS.md` ("Shared types (entities, DTOs) go in src/types.ts").

**Contract**: Eksportuje `export type UserRole = "admin" | "user";` oraz `export interface Profile { id: string; role: UserRole; created_at: string; }`.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się czysto lokalnie: `npx supabase db reset`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- W Supabase Studio (lokalnie, `npx supabase start`) widoczna jest pusta tabela `profiles` z poprawnymi kolumnami i włączonym RLS.
- Ręczne dodanie wiersza do `auth.users` (np. przez rejestrację testową) automatycznie tworzy odpowiadający wiersz w `profiles` z rolą `user`.

---

## Phase 2: Bootstrap kont — Admin i przykładowy User

### Overview

Zakładamy ręcznie dwa konta testowe przez istniejący (jeszcze aktywny) formularz rejestracji i promujemy jedno z nich do roli `admin`.

> **Status wznowienia (2026-09-08):** Zawieszone w oczekiwaniu na limit e-maili Supabase (2/godz. na darmowym planie, wyczerpany diagnostyką). Po drodze naprawiono dwa problemy blokujące rejestrację na żywo, niezwiązane z tą fazą, ale odkryte podczas jej testowania:
> 1. Astro `security.checkOrigin` (domyślnie `true`) fałszywie odrzucał POST-y za edge Cloudflare Workers — naprawione w `astro.config.mjs` (`checkOrigin: false`), commit `6f10587`. Znany problem, patrz [astro#12851](https://github.com/withastro/astro/issues/12851).
> 2. Sekrety `SUPABASE_URL`/`SUPABASE_KEY` na żywym Workerze były nieaktualne — zaktualizowane przez `wrangler secret put` na poprawne wartości projektu `uhtpaguekvtnlxhqbjfp`.
>
> **Do zrobienia po wznowieniu:** poczekać na reset limitu e-maili (do godziny), założyć dwa konta przez `/auth/signup` na `https://typer-sportowy.patrykshon.workers.dev`, podać oba adresy e-mail, wykonać promocję SQL roli Admina (patrz Manual Verification poniżej), zweryfikować krok 1.5 z Fazy 1 (trigger tworzy profil automatycznie) jako efekt uboczny tego bootstrapu.

### Changes Required:

Brak zmian w kodzie w tej fazie — wyłącznie operacje manualne.

### Success Criteria:

#### Automated Verification:

- Brak (faza czysto operacyjna).

#### Manual Verification:

- Założono konto przez `/auth/signup` dla przyszłego Admina (np. e-mail zespołowy) — wiersz `profiles` powstał automatycznie z rolą `user`.
- Założono drugie konto przez `/auth/signup` dla przykładowego Usera — analogicznie.
- W Supabase Studio (SQL Editor) wykonano `UPDATE public.profiles SET role = 'admin' WHERE id = (SELECT id FROM auth.users WHERE email = '<adres Admina>');` i potwierdzono zmianę roli zapytaniem `SELECT`.
- To samo powtórzone na żywym (zdalnym) projekcie Supabase używanym przez `https://typer-sportowy.patrykshon.workers.dev`, nie tylko lokalnie.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź z człowiekiem, że oba konta istnieją i mają poprawne role — obie kolejne fazy zakładają ich istnienie.

---

## Phase 3: Mechanizm strażnika (guard) i strona demo

### Overview

Rozszerzamy middleware o rolę, dodajemy helper do ochrony endpointów API i tymczasową stronę demonstrującą działanie guarda.

### Changes Required:

#### 1. Middleware — dodanie roli do kontekstu

**File**: `src/middleware.ts`

**Intent**: Po pobraniu zalogowanego użytkownika, dociągnąć jego rolę z tabeli `profiles` i wystawić ją jako `context.locals.role`. Brak wiersza w `profiles` lub błąd zapytania → `role = null` (fail-closed, zgodnie z decyzją: brak roli = brak dostępu).

**Contract**: Rozszerza istniejący blok `if (supabase) { ... }` (linie 9-16) o zapytanie `supabase.from("profiles").select("role").eq("id", user.id).single()` wykonywane tylko gdy `user` istnieje; wynik (lub `null` przy błędzie/braku wiersza) trafia do `context.locals.role`. Dodaje też nową listę `ADMIN_ROUTES = ["/admin"]` obok istniejącego `PROTECTED_ROUTES` (linia 4); po istniejącym bloku bramkowania (linie 18-22) dokłada analogiczny blok: jeśli ścieżka pasuje do `ADMIN_ROUTES` i `context.locals.role !== "admin"`, przekierowanie na `/dashboard` (jeśli zalogowany) lub `/auth/signin` (jeśli nie) — zachowuje istniejący wzorzec przekierowań, nie wprowadza nowego.

#### 2. Typ `Locals.role`

**File**: `src/env.d.ts`

**Intent**: Rozszerzyć deklarację `App.Locals` o pole `role`, korzystając z nowego typu `UserRole` z `src/types.ts`.

**Contract**: Dodaje `role: import("./types").UserRole | null;` jako kolejne pole interfejsu `Locals` (obok istniejącego `user`).

#### 3. Helper do ochrony endpointów API

**File**: `src/lib/auth.ts` (nowy plik)

**Intent**: Dać endpointom API w `src/pages/api/**` jeden, jawny sposób wymuszenia wymaganej roli, spójny z istniejącym stylem helperów w `src/lib/`.

**Contract**: Eksportuje funkcję `requireRole(locals: App.Locals, role: UserRole): Response | null` — zwraca `Response` ze statusem 403 (i krótkim JSON-em błędu), jeśli `locals.role !== role`; w przeciwnym razie zwraca `null` (endpoint kontynuuje normalnie). Wywołanie w endponcie: `const denied = requireRole(context.locals, "admin"); if (denied) return denied;` — jako pierwsza linia handlera.

#### 4. Tymczasowa strona demo

**File**: `src/pages/admin.astro` (nowy plik)

**Intent**: Dać namacalny, klikalny dowód działania guarda w przeglądarce, zanim S-01 dostarczy realną zawartość panelu Admina. Strona zostanie zastąpiona lub usunięta w S-01.

**Contract**: Struktura analogiczna do istniejącego `src/pages/dashboard.astro` (ten sam `Layout`, ten sam styl karty) — wyświetla statyczny tekst w stylu "Admin area — placeholder, replaced in S-01" oraz e-mail zalogowanego Admina z `Astro.locals.user`. Ochrona dostępu odbywa się wyłącznie przez middleware (Faza 3, punkt 1) — strona sama nie zawiera logiki guard, tak jak `dashboard.astro` nie zawiera jej dla zwykłego uwierzytelnienia.

#### 5. Testowy endpoint API chroniony przez `requireRole()` (dodane podczas implementacji)

**File**: `src/pages/api/admin/ping.ts` (nowy plik)

**Intent**: Success Criteria 3.6 wymaga ręcznego zweryfikowania `requireRole()` na jakimś endpoincie API, ale sekcja Changes Required pierwotnie nie wymieniała żadnego takiego pliku — dopisano go podczas implementacji po zaflagowaniu niespójności użytkownikowi (zaakceptowana opcja "Dostosuj i kontynuuj"). Zostanie usunięty/zastąpiony realnym endpointem w S-01.

**Contract**: `GET` handler wywołujący `requireRole(context.locals, "admin")` jako pierwszą linię; zwraca `{ ok: true }` (200) jeśli przechodzi, w przeciwnym razie odpowiedź z `requireRole()` (403).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check + build przechodzą: `npm run build`

#### Manual Verification:

- Zalogowany jako Admin (konto z Fazy 2) → wejście na `/admin` pokazuje treść strony.
- Zalogowany jako przykładowy User (konto z Fazy 2) → wejście na `/admin` przekierowuje na `/dashboard`.
- Niezalogowany → wejście na `/admin` przekierowuje na `/auth/signin`.
- Ręczne wywołanie chronionego endpointu API (dowolnego testowego, z `requireRole()`) jako User zwraca 403; jako Admin przechodzi dalej.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie wszystkie trzy ścieżki dostępu do `/admin`, zanim przejdziesz do wyłączenia samorejestracji — to ostatni moment, w którym oba konta testowe są łatwo dostępne do porównania.

---

## Phase 4: Wyłączenie publicznej samorejestracji

### Overview

Zamykamy ścieżkę self-signup zgodnie z FR-002/FR-003 — zarówno lokalnie, jak i na żywym projekcie Supabase.

### Changes Required:

#### 1. Lokalna konfiguracja Supabase

**File**: `supabase/config.toml`

**Intent**: Wyłączyć samorejestrację w lokalnym środowisku deweloperskim, żeby zachowanie lokalne odzwierciedlało docelowy model dostępu.

**Contract**: Zmienia `enable_signup = true` na `enable_signup = false` w dwóch miejscach: sekcja `[auth]` (linia 169) i sekcja `[auth.email]` (linia 204). Sekcja `[auth.sms]` (linia 242) pozostaje bez zmian (już `false`).

#### 2. Formularz rejestracji

**File**: `src/pages/auth/signup.astro`

**Intent**: Zastąpić działający formularz komunikatem informującym, że rejestracja jest zamknięta — bez usuwania trasy (unika martwych linków z `signin.astro`).

**Contract**: Usuwa render `<SignUpForm />`; w jego miejsce statyczny komunikat (np. "Rejestracja jest zamknięta — konto zakłada administrator."). Import `SignUpForm` zostaje usunięty z tego pliku (komponent `SignUpForm.tsx` pozostaje w repo, nieużywany — może się przydać, gdyby model dostępu się zmienił, ale to poza zakresem tej zmiany).

#### 3. Endpoint API rejestracji

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Endpoint przestaje wywoływać `supabase.auth.signUp()` i zawsze odrzuca żądanie, na wypadek bezpośredniego POST-a z pominięciem UI.

**Contract**: Handler `POST` zwraca od razu `context.redirect('/auth/signup?error=' + encodeURIComponent('Rejestracja jest zamknięta'))`, bez wywołania `createClient`/`signUp`.

#### 4. Link do rejestracji na stronie logowania

**File**: `src/pages/auth/signin.astro`

**Intent**: Usunąć zachęcający do rejestracji link, skoro ścieżka jest zamknięta.

**Contract**: Usuwa (lub komentuje) fragment linkujący do `/auth/signup`, jeśli taki istnieje na stronie logowania.

#### 5. Wyłączenie na żywym projekcie Supabase

**Manual step, brak pliku**: W dashboardzie Supabase dla projektu produkcyjnego (tego, z którego korzysta `https://typer-sportowy.patrykshon.workers.dev`): Authentication → Providers → Email → wyłączyć "Allow new users to sign up". Patrz "Critical Implementation Details" — `config.toml` nie ma na to żadnego wpływu.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Lokalnie: wejście na `/auth/signup` pokazuje komunikat o zamkniętej rejestracji, nie formularz.
- Lokalnie: bezpośredni `POST /api/auth/signup` (np. przez curl) nie tworzy nowego użytkownika i przekierowuje z komunikatem błędu.
- Na żywym środowisku: dashboard Supabase potwierdza wyłączone "Allow new users to sign up" dla providera Email.
- Strona logowania nie zawiera już linku zachęcającego do rejestracji.

---

## Testing Strategy

### Unit Tests:

- Brak — projekt nie ma skonfigurowanego frameworka testowego (poza zakresem tego fundamentu).

### Integration Tests:

- Brak (jak wyżej) — pokrycie realizowane przez manualną weryfikację per faza.

### Manual Testing Steps:

1. Po Fazie 1: potwierdzić w Supabase Studio strukturę tabeli, RLS i działanie triggera na testowej rejestracji.
2. Po Fazie 2: potwierdzić, że dokładnie jedno konto ma rolę `admin`, a drugie `user` — zarówno lokalnie, jak i na żywym projekcie.
3. Po Fazie 3: przejść przez wszystkie trzy ścieżki dostępu do `/admin` (Admin/User/niezalogowany) opisane w Success Criteria.
4. Po Fazie 4: potwierdzić zamkniętą rejestrację lokalnie i na żywo, oraz brak martwych linków na stronie logowania.

## Performance Considerations

Zapytanie o rolę w middleware (`profiles` SELECT) wykonuje się przy każdym request dla zalogowanego użytkownika — dodaje jeden prosty, indeksowany (PK) SELECT do istniejącej ścieżki, która już i tak woła Supabase Auth (`getUser()`). Przy skali PRD (dziesiątki użytkowników, niskie QPS) to zaniedbywalny narzut; nie wymaga cache'owania na tym etapie.

## Migration Notes

Nie dotyczy — brak istniejących danych do migracji (pierwsza migracja w projekcie). Kolejność bootstrapu kont (Faza 2 przed Fazą 4) jest jedynym wymogiem sekwencyjnym i został udokumentowany w "Critical Implementation Details".

## References

- Roadmap item: `context/foundation/roadmap.md` → `## Foundations` → `F-01`
- PRD refs: `context/foundation/prd.md` → FR-001, FR-002, FR-003, Access Control, Guardrails
- Existing middleware pattern: `src/middleware.ts:6-22`
- Existing Supabase client: `src/lib/supabase.ts:1-24`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Model danych — tabela `profiles`, trigger, RLS

#### Automated

- [x] 1.1 Migracja aplikuje się czysto lokalnie: `npx supabase db reset` — d389d75
- [x] 1.2 Lint przechodzi: `npm run lint` — d389d75
- [x] 1.3 Build przechodzi: `npm run build` — d389d75

#### Manual

- [x] 1.4 Tabela `profiles` widoczna w Supabase Studio z poprawnymi kolumnami i włączonym RLS — d389d75
- [x] 1.5 Testowa rejestracja automatycznie tworzy wiersz w `profiles` z rolą `user` — d389d75

### Phase 2: Bootstrap kont — Admin i przykładowy User

#### Manual

- [x] 2.1 Konto Admina założone przez `/auth/signup`, wiersz `profiles` powstał automatycznie — f1da4b3
- [x] 2.2 Konto przykładowego Usera założone przez `/auth/signup` — f1da4b3
- [x] 2.3 Rola Admina wypromowana przez SQL lokalnie, potwierdzona zapytaniem — f1da4b3
- [x] 2.4 To samo powtórzone na żywym projekcie Supabase — f1da4b3

### Phase 3: Mechanizm strażnika (guard) i strona demo

#### Automated

- [x] 3.1 Lint przechodzi: `npm run lint`
- [x] 3.2 Build przechodzi: `npm run build`

#### Manual

- [x] 3.3 Admin widzi `/admin`
- [x] 3.4 User przekierowany z `/admin` na `/dashboard`
- [x] 3.5 Niezalogowany przekierowany z `/admin` na `/auth/signin`
- [x] 3.6 Chroniony endpoint API zwraca 403 dla User, przechodzi dla Admina

### Phase 4: Wyłączenie publicznej samorejestracji

#### Automated

- [ ] 4.1 Lint przechodzi: `npm run lint`
- [ ] 4.2 Build przechodzi: `npm run build`

#### Manual

- [ ] 4.3 `/auth/signup` pokazuje komunikat o zamkniętej rejestracji lokalnie
- [ ] 4.4 Bezpośredni `POST /api/auth/signup` nie tworzy użytkownika lokalnie
- [ ] 4.5 Dashboard Supabase potwierdza wyłączoną rejestrację na żywym projekcie
- [ ] 4.6 Strona logowania nie zawiera linku do rejestracji
