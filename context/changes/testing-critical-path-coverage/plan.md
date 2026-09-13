# Critical-Path Test Coverage (Scoring Rule + Match-Lock Timing) Implementation Plan

## Overview

Faza 1 rolloutu testów (`context/foundation/test-plan.md` §3) — założyć od zera infrastrukturę testową (Vitest) i pokryć dwa najwyżej ocenione ryzyka: regułę punktacji 3/1/0 (unit) oraz blokadę czasową typowania po starcie meczu, zweryfikowaną niezależnie na warstwie API i RLS (integration).

## Current State Analysis

- Reguła punktacji (`calculatePoints`/`outcomeSign`) żyje jako niewyeksportowane funkcje wewnątrz [src/pages/api/admin/matches/[id]/result.ts:20-27](src/pages/api/admin/matches/[id]/result.ts#L20-L27) — czysta logika, zero I/O, ale niedostępna do importu.
- Blokada czasowa jest zaimplementowana podwójnie i niezależnie: API ([src/pages/api/matches/[id]/predictions.ts:61-63](src/pages/api/matches/[id]/predictions.ts#L61-L63)) i RLS `WITH CHECK` ([supabase/migrations/20260912090000_create_predictions.sql](supabase/migrations/20260912090000_create_predictions.sql), `user_insert_own_prediction` / `user_update_own_prediction`).
- Brak jakiejkolwiek infrastruktury testowej: brak `vitest.config.*`, brak sekcji `test` w `package.json`, brak `src/lib/services/` (katalog zapowiedziany w `AGENTS.md`, ale jeszcze pusty).
- `src/lib/supabase.ts`'s `createClient()` czyta sekrety przez `astro:env/server` (Astro-specific) — niedostępne poza runtime'em Astro/Cloudflare, więc testy integracyjne muszą budować własne klienty Supabase z `process.env`.
- CI (`.github/workflows/ci.yml`) ma tylko `SUPABASE_URL`/`SUPABASE_KEY` (anon) jako sekrety — brak `SUPABASE_SERVICE_ROLE_KEY`. Testy z tej fazy pozostają lokalne (`npm run test` / `npm run test:integration`), zgodnie z `test-plan.md` §5 (wpięcie w CI to Faza 4).
- `predictions.user_id references auth.users(id)` bez `on delete cascade` (w przeciwieństwie do `match_id`, który ma cascade) — kolejność sprzątania fixture'ów w testach integracyjnych ma znaczenie (patrz Critical Implementation Details).

## Desired End State

- `npm run test` uruchamia szybkie testy jednostkowe (`src/**/*.test.ts`), w tym pełną macierz reguły 3/1/0 dla `src/lib/services/scoring.ts`.
- `npm run test:integration` uruchamia testy integracyjne (`tests/integration/**/*.test.ts`) względem już zalinkowanego, zdalnego projektu Supabase, dowodząc, że zapis/edycja predykcji po starcie meczu jest odrzucana zarówno przez endpoint API, jak i niezależnie przez RLS (z pominięciem endpointu) — oraz że zapis przed startem meczu nadal przechodzi.
- Testy integracyjne tworzą i w pełni sprzątają własne dane (testowy User w Supabase Auth, turniej, mecz) — brak trwałych śladów w zdalnym projekcie po zakończeniu przebiegu.
- Weryfikacja: `npm run test && npm run test:integration` kończy się sukcesem lokalnie; `npm run lint` i `npm run build` nadal przechodzą bez regresji.

### Key Discoveries:

- [src/lib/supabase.ts:29-36](src/lib/supabase.ts#L29-L36) — `createAdminClient()` już używa `@supabase/supabase-js` bezpośrednio (nie cookie-based SSR) i czyta z `astro:env/server` — wzorzec do naśladowania dla testowych klientów, ale testy muszą czytać z `process.env` zamiast `astro:env/server`.
- [src/lib/auth.ts:3-10](src/lib/auth.ts#L3-L10) — `requireRole(locals, role)` sprawdza wyłącznie `locals.role` — pozwala to na lekki, ręcznie skonstruowany fake `APIContext` w testach integracyjnych endpointu, bez przechodzenia przez `src/middleware.ts`.
- `predictions.ts`'s `POST` handler wywołuje `createClient(context.request.headers, context.cookies)` — w testach integracyjnych ten import zostanie zamockowany (`vi.mock`), żeby zwrócić realnego, zalogowanego klienta Supabase (przez `Authorization` header z tokenu sesji), z pominięciem plumbingu cookie/SSR, który jest specyficzny dla Astro, a nie dla logiki biznesowej pod testem.

## What We're NOT Doing

- Wpinanie testów jako bramki jakości w CI (`.github/workflows/ci.yml`) — to Faza 4 rolloutu (`test-plan.md` §3/§5).
- MSW / mockowanie Supabase w testach integracyjnych — RLS wymaga realnej bazy, a mock nie zweryfikowałby odrzucenia na poziomie DB.
- Testy e2e/przeglądarkowe (Playwright) — żadne z dwóch ryzyk tego nie wymaga.
- Dedykowany, osobny projekt Supabase tylko do testów — używamy już zalinkowanego projektu zdalnego.
- Pokrycie ryzyk #3–#7 z `test-plan.md` §3 (ranking/remisy, kontrola dostępu, sesje, unikalność turnieju, maskowanie e-maila) — to kolejne fazy rolloutu.
- Zmiany w logice agregacji punktów w SQL (`tournament_ranking()`) — poza zakresem tych dwóch ryzyk.

## Implementation Approach

Trzy fazy, rosnąco od najprostszej (czysta funkcja, zero zależności) do najbardziej złożonej (realny Supabase, realny RLS):

1. Założyć Vitest + wydzielić i przetestować jednostkowo regułę punktacji (najtańszy, najszybszy sygnał najpierw).
2. Zbudować reużywalny harness integracyjny (testowy User + fixture'y z pełnym sprzątaniem) — infrastruktura, zero asercji biznesowych jeszcze.
3. Użyć harnessu do właściwych testów blokady czasowej — negatywne ścieżki (API + bezpośrednie ominięcie API przez RLS) i pozytywna ścieżka (zapis przed startem).

## Critical Implementation Details

- **Fake `APIContext` zamiast żywego serwera.** Astro API routes to zwykłe funkcje przyjmujące obiekt zgodny z kształtem `APIContext` — nie trzeba uruchamiać `astro dev`/`preview`, żeby przetestować `predictions.ts`'s `POST` integracyjnie. Test konstruuje minimalny obiekt: `{ params: { id: matchId }, request: new Request(url, { method: "POST", body: formData }), cookies: { set: () => {} }, locals: { user: { id: testUserId }, role: "user" }, redirect: (url) => new Response(null, { status: 302, headers: { Location: url } }) }` i wywołuje wyeksportowany `POST(fakeContext)` bezpośrednio.
- **Mockowanie `createClient` z `@/lib/supabase`, nie logiki biznesowej.** `predictions.ts` importuje `createClient` z `@/lib/supabase`, który w runtime Astro używa cookie-based SSR i `astro:env/server` — obu niedostępnych w Vitest. Test integracyjny robi `vi.mock("@/lib/supabase", ...)` zwracający funkcję, która ignoruje cookies i zwraca zwykłego `createClient()` z `@supabase/supabase-js` z nagłówkiem `Authorization: Bearer <access_token>` testowego Usera (token z `signInWithPassword`/`signInWithOtp` po stronie testu). To podmienia wyłącznie transport uwierzytelniania (Astro-specific plumbing) — cała reszta (walidacja zod, sprawdzenie `scheduled_at`, wywołanie RLS) pozostaje realna.
- **Kolejność sprzątania fixture'ów.** `predictions.user_id` odwołuje się do `auth.users(id)` BEZ `on delete cascade` (w przeciwieństwie do `match_id`, który ma cascade). Teardown musi najpierw skasować fixture turnieju (cascade usuwa mecze i predykcje), a dopiero potem skasować testowego Usera przez `admin.deleteUser()` — odwrotna kolejność zakończy się błędem FK.
- **Ładowanie zmiennych środowiskowych w Vitest.** `vitest.config.ts` używa `loadEnv` z `vite` (już tranzytywna zależność przez Astro), żeby wstrzyknąć `.env`/`.dev.vars`-owe zmienne (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) do `process.env` testów przez opcję `test.env` — bez nowej zależności (`dotenv`).
- **Margines czasowy zamiast dokładnej granicy.** Testy blokady czasowej używają dat wyraźnie przesuniętych (np. `now + 1h` / `now - 1h`), nie granicy co-do-sekundy — unika flakiness z clock skew między maszyną testową a serwerem Postgresa.

## Phase 1: Test tooling foundation + unit tests for scoring rule (#1)

### Overview

Zainstalować Vitest, dodać konfigurację i skrypty, wydzielić `calculatePoints`/`outcomeSign` do testowalnego modułu i pokryć pełną macierz predykcja×wynik.

### Changes Required:

#### 1. Zależności i skrypty testowe

**File**: `package.json`

**Intent**: Dodać Vitest jako jedyną nową zależność deweloperską tej fazy i dwa skrypty rozdzielające szybkie testy jednostkowe od (wolniejszych, dotykających realnego Supabase) testów integracyjnych.

**Contract**: `devDependencies` zyskuje `vitest` (najnowsza stabilna wersja 3.x). Nowe skrypty: `"test": "vitest run src"`, `"test:integration": "vitest run tests/integration"`.

#### 2. Konfiguracja Vitest

**File**: `vitest.config.ts` (nowy, root repo)

**Intent**: Dopasować rozwiązywanie modułów do aliasu `@/*` z `tsconfig.json` i wstrzyknąć zmienne środowiskowe z `.env`/`.dev.vars` do `process.env` na potrzeby testów integracyjnych.

**Contract**:

```typescript
import { defineConfig, loadEnv } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    env: loadEnv("test", process.cwd(), ""),
  },
});
```

#### 3. Wydzielenie reguły punktacji

**File**: `src/lib/services/scoring.ts` (nowy)

**Intent**: Przenieść `outcomeSign`/`calculatePoints` z endpointu do samodzielnego, eksportowanego modułu zgodnie z konwencją `src/lib/services/` z `AGENTS.md` — czysta logika, zero zależności od Supabase/Astro.

**Contract**: Eksportuje `outcomeSign(home: number, away: number): 1 | 0 | -1` i `calculatePoints(predictedHome: number, predictedAway: number, actualHome: number, actualAway: number): 0 | 1 | 3`, identyczne co do zachowania z obecną implementacją.

#### 4. Aktualizacja endpointu

**File**: `src/pages/api/admin/matches/[id]/result.ts`

**Intent**: Usunąć lokalne definicje `outcomeSign`/`calculatePoints`, importować je z `@/lib/services/scoring`. Zero zmian w zachowaniu.

**Contract**: `import { calculatePoints } from "@/lib/services/scoring";` zastępuje definicje w liniach 20-27; wywołanie w liniach 113-127 bez zmian.

#### 5. Testy jednostkowe reguły punktacji

**File**: `src/lib/services/scoring.test.ts` (nowy)

**Intent**: Pokryć pełną macierz kierunek×dokładność dla `calculatePoints`, z oracle wywodzącym się z opisu reguły biznesowej (3 pkt dokładny wynik / 1 pkt trafiony kierunek / 0 pkt chybiony), nie z kopii kodu pod testem.

**Contract**: Co najmniej 9 przypadków — dla każdej z 3 kategorii kierunku (wygrana gospodarzy, remis, wygrana gości) po jednym dokładnym trafieniu (3 pkt) i jednym trafionym kierunku z innym wynikiem liczbowym (1 pkt, w tym jawnie remis:remis różnymi wynikami np. predykcja 2:2 / wynik 1:1), plus reprezentatywne przypadki chybionego kierunku między wszystkimi trzema kategoriami (0 pkt).

### Success Criteria:

#### Automated Verification:

- [ ] `npm run test` przechodzi (wszystkie przypadki macierzy 3/1/0 zielone)
- [ ] `npm run lint` przechodzi bez nowych błędów/ostrzeżeń
- [ ] `npm run build` przechodzi bez regresji

#### Manual Verification:

- [ ] Ręczny przegląd `scoring.test.ts` potwierdza pokrycie wszystkich 9 kombinacji kierunek×dokładność, w tym remis:remis różnymi wynikami
- [ ] Po wdrożeniu (push na `main` → Cloudflare Workers Builds) admin nadal poprawnie wprowadza wynik meczu i punkty naliczają się bez zmian względem stanu przed refaktorem

---

## Phase 2: Integration test harness (test user + fixtures)

### Overview

Zbudować reużywalny moduł pomocniczy tworzący i sprzątający dane potrzebne testom integracyjnym: testowego Usera w Supabase Auth oraz turniej/mecz jako fixture.

### Changes Required:

#### 1. Klient administracyjny dla testów

**File**: `tests/integration/helpers/supabase-test-clients.ts` (nowy)

**Intent**: Dostarczyć klienta Supabase z `SUPABASE_SERVICE_ROLE_KEY` (analogiczny do `createAdminClient()` z `src/lib/supabase.ts`, ale czytający z `process.env` zamiast `astro:env/server`) do tworzenia/kasowania fixture'ów i testowych Userów.

**Contract**: `createTestAdminClient()` zwraca klienta `@supabase/supabase-js` skonfigurowanego z `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` z `process.env`, rzuca czytelny błąd jeśli brakuje zmiennych (test suite fail-fast zamiast cichego pominięcia).

#### 2. Cykl życia testowego Usera

**File**: `tests/integration/helpers/test-user.ts` (nowy)

**Intent**: Utworzyć jednorazowego Usera przez Admin API i zwrócić klienta uwierzytelnionego jego tokenem (do testów RLS), z funkcją czyszczącą.

**Contract**: `createTestUser(adminClient)` → `{ userId, accessToken }` przez `adminClient.auth.admin.createUser({ email, password, email_confirm: true })` + `signInWithPassword` na zwykłym (anon-key) kliencie. `deleteTestUser(adminClient, userId)` → `adminClient.auth.admin.deleteUser(userId)`, wywoływane PO usunięciu fixture'ów turnieju (patrz Critical Implementation Details).

#### 3. Fixture'y turniej/mecz

**File**: `tests/integration/helpers/tournament-fixtures.ts` (nowy)

**Intent**: Tworzyć i kasować turniej + mecz(e) o kontrolowanym `scheduled_at`, izolowane per test (żaden trwały stan między przebiegami).

**Contract**: `createLockedMatchFixture(adminClient)` → turniej `status: 'active'` + mecz z `scheduled_at` w przeszłości (`now - 1h`); `createOpenMatchFixture(adminClient)` → analogiczny mecz z `scheduled_at` w przyszłości (`now + 1h`); `deleteTournamentFixture(adminClient, tournamentId)` → `delete from tournaments where id = ...` (cascade usuwa mecze i predykcje).

### Success Criteria:

#### Automated Verification:

- [ ] `npm run lint` przechodzi dla nowych plików w `tests/integration/helpers/`
- [ ] `npm run test:integration` przechodzi dla testu dymnego harnessu (utworzenie + skasowanie testowego Usera i fixture'u turnieju kończy się bez błędów)

#### Manual Verification:

- [ ] Po uruchomieniu testu dymnego, w dashboardzie Supabase (Auth Users + Table Editor `tournaments`) nie ma śladu utworzonego testowego Usera ani turnieju

---

## Phase 3: Integration tests for match-lock timing (#2)

### Overview

Użyć harnessu z Fazy 2 do udowodnienia, że zapis/edycja predykcji po starcie meczu jest odrzucana niezależnie na warstwie API i RLS, a zapis przed startem nadal działa.

### Changes Required:

#### 1. Mock warstwy transportu uwierzytelniania

**File**: `tests/integration/prediction-lock.test.ts` (nowy)

**Intent**: Podmienić `createClient` z `@/lib/supabase` na wariant zwracający klienta uwierzytelnionego tokenem testowego Usera (patrz Critical Implementation Details), żeby móc wywołać prawdziwy handler `POST` z `src/pages/api/matches/[id]/predictions.ts` bez żywego serwera Astro.

**Contract**: `vi.mock("@/lib/supabase", () => ({ createClient: () => testAuthedClient }))` ustawiony przed importem testowanego modułu.

#### 2. Testy negatywne — zapis po starcie meczu

**File**: `tests/integration/prediction-lock.test.ts`

**Intent**: Dowieść, że (a) wywołanie endpointu `POST` po starcie meczu kończy się redirectem z błędem, oraz (b) bezpośrednie `supabase.from('predictions').insert()`/`.upsert()` tym samym, zalogowanym klientem — z całkowitym pominięciem importu i wywołania endpointu — jest odrzucane przez RLS. Oba muszą być osobnymi asercjami, żeby (b) faktycznie dowodziło niezależności od warstwy API/UI, a nie tylko duplikować (a).

**Contract**: Fixture z Fazy 2 (`createLockedMatchFixture`) dostarcza mecz z `scheduled_at = now - 1h`. Test (a) asertuje status redirectu/komunikat błędu ze zwróconej `Response`. Test (b) asertuje obecność `error` (kod naruszenia RLS) w wyniku bezpośredniego wywołania `supabase.from(...)`, bez importu `POST`.

#### 3. Test pozytywny — zapis przed startem

**File**: `tests/integration/prediction-lock.test.ts`

**Intent**: Dowieść, że blokada nie jest nadmiarowa (fałszywie pozytywna) — zapis wciąż przechodzi, gdy mecz jeszcze się nie zaczął, zarówno przez endpoint, jak i bezpośrednio.

**Contract**: Fixture `createOpenMatchFixture` (`scheduled_at = now + 1h`). Asercja: `POST` zwraca redirect sukcesu (`/dashboard`, bez `error=`) i wiersz w `predictions` istnieje z oczekiwanymi wartościami; równolegle bezpośredni `upsert()` tym samym klientem kończy się bez błędu.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run test:integration` przechodzi dla wszystkich przypadków `prediction-lock.test.ts` (negatywne API, negatywne RLS-bypass, pozytywna ścieżka)
- [ ] `npm run lint` przechodzi

#### Manual Verification:

- [ ] Po przebiegu testów, w Supabase dashboardzie brak osieroconych rekordów `tournaments`/`matches`/`predictions` ani testowych kont Auth
- [ ] Brak wpływu na regułę "jeden aktywny turniej naraz" — po testach admin nadal może utworzyć nowy turniej bez konfliktu z pozostawionym fixture'em

---

## Testing Strategy

### Unit Tests:

- Pełna macierz `calculatePoints` (9+ przypadków kierunek×dokładność, w tym remis:remis różnymi wynikami)

### Integration Tests:

- Blokada czasowa: negatywna ścieżka API, negatywna ścieżka RLS (pominięcie API), pozytywna ścieżka (przed startem) — insert i update

### Manual Testing Steps:

1. Po Fazie 1: wejść jako Admin na `/admin/tournaments/{id}/matches`, wprowadzić wynik meczu, potwierdzić że punkty naliczają się identycznie jak przed refaktorem.
2. Po Fazie 2 i 3: sprawdzić w Supabase dashboardzie (Auth + Table Editor), że żadne dane testowe nie pozostały po przebiegu `npm run test:integration`.

## Performance Considerations

Brak — testy jednostkowe są natychmiastowe (brak I/O); testy integracyjne wykonują niewielką, stałą liczbę żądań do zdalnego Supabase (kilka sekund na przebieg), bez wpływu na produkcyjne obciążenie.

## Migration Notes

Brak zmian schematu/migracji w tej fazie.

## References

- Related research: `context/changes/testing-critical-path-coverage/research.md`
- Reguła punktacji: [src/pages/api/admin/matches/[id]/result.ts:20-27](src/pages/api/admin/matches/[id]/result.ts#L20-L27)
- Blokada czasowa (API): [src/pages/api/matches/[id]/predictions.ts:61-63](src/pages/api/matches/[id]/predictions.ts#L61-L63)
- Blokada czasowa (RLS): [supabase/migrations/20260912090000_create_predictions.sql](supabase/migrations/20260912090000_create_predictions.sql)
- Wzorzec klienta service-role: [src/lib/supabase.ts:29-36](src/lib/supabase.ts#L29-L36)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Test tooling foundation + unit tests for scoring rule (#1)

#### Automated

- [x] 1.1 `npm run test` przechodzi (wszystkie przypadki macierzy 3/1/0 zielone) — 52b25e9
- [x] 1.2 `npm run lint` przechodzi bez nowych błędów/ostrzeżeń — 52b25e9
- [x] 1.3 `npm run build` przechodzi bez regresji — 52b25e9

#### Manual

- [x] 1.4 Ręczny przegląd `scoring.test.ts` potwierdza pokrycie wszystkich 9 kombinacji kierunek×dokładność, w tym remis:remis różnymi wynikami — 52b25e9
- [x] 1.5 Po wdrożeniu admin nadal poprawnie wprowadza wynik meczu i punkty naliczają się bez zmian względem stanu przed refaktorem — 52b25e9

### Phase 2: Integration test harness (test user + fixtures)

#### Automated

- [ ] 2.1 `npm run lint` przechodzi dla nowych plików w `tests/integration/helpers/`
- [ ] 2.2 `npm run test:integration` przechodzi dla testu dymnego harnessu

#### Manual

- [ ] 2.3 Brak śladu testowego Usera/turnieju w Supabase dashboardzie po teście dymnym

### Phase 3: Integration tests for match-lock timing (#2)

#### Automated

- [ ] 3.1 `npm run test:integration` przechodzi dla wszystkich przypadków `prediction-lock.test.ts`
- [ ] 3.2 `npm run lint` przechodzi

#### Manual

- [ ] 3.3 Brak osieroconych rekordów/kont testowych w Supabase po przebiegu
- [ ] 3.4 Brak wpływu na regułę "jeden aktywny turniej naraz" po testach
