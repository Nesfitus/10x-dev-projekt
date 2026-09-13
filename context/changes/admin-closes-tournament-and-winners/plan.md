# Admin zamyka turniej, system wyłania zwycięzców — Implementation Plan

## Overview

Admin może jawnie zamknąć aktywny turniej (jednokierunkowo — `active` → `closed`, bez możliwości ponownego otwarcia). Zamknięcie jest zwykłą zmianą statusu przez RLS (wzorem S-05, bez service-role); nie wymaga blokowania na nierozegranych meczach — Admin widzi tylko informacyjny licznik przed kliknięciem. Zwycięzca/zwycięzcy (dopuszczalny remis/ex aequo, także przy 0 pkt) są wyliczani na żywo z już istniejącej funkcji `tournament_ranking()` (S-06) i wyróżniani na tej samej stronie rankingu — bez nowej tabeli/kolumny.

## Current State Analysis

- `tournaments.status` (`'active'`/`'closed'`, wzajemnie wykluczające się przez `CHECK`) istnieje od S-01, ale **żadna polityka RLS nie pozwala na UPDATE** tej tabeli — ani Admin, ani nikt inny (`supabase/migrations/20260911100000_create_tournaments.sql` ma tylko `admin_select_tournaments`/`admin_insert_tournaments`; `20260912090000_create_predictions.sql` dokłada `user_select_tournaments`, wciąż brak UPDATE).
- Wzorzec `admin_update_matches`/`admin_update_predictions` (S-05, `supabase/migrations/20260912100000_add_match_results_and_prediction_points.sql`) — zwykła polityka `is_admin(auth.uid())`, bez `WITH CHECK`, bez service-role — ma tu bezpośrednie zastosowanie: nie ma przesłanki do `createAdminClient()` (w przeciwieństwie do `profiles.disabled`, gdzie w ogóle brak polityki UPDATE i trzeba było Supabase Admin API).
- Po zamknięciu turnieju zapis jest już dziś blokowany na poziomie aplikacji, niezależnie od tej zmiany: `src/pages/api/admin/tournaments/[id]/matches.ts` odrzuca dodawanie meczów gdy `status !== "active"`; `src/pages/api/admin/matches/[id]/result.ts` odrzuca wpisanie wyniku gdy `tournament.status !== "active"`; `user_insert_own_prediction`/`user_update_own_prediction` (RLS) wymagają `t.status = 'active'`. Zamknięcie turnieju samo w sobie "zamraża" dane bez dodatkowej pracy w tej zmianie.
- `tournament_ranking(p_tournament_id uuid)` (S-06, `supabase/migrations/20260913090000_create_tournament_ranking_function.sql`, zmodyfikowana w `20260913100000_mask_tournament_ranking_email_domain.sql`) już działa identycznie dla turniejów `active` i `closed` — S-06 świadomie to zaprojektowało z myślą o reużyciu przez ten plasterek — i już zwraca wiersze posortowane malejąco po `points`.
- `src/pages/tournaments/[id]/ranking.astro` (S-06) renderuje tę listę; pierwszy wiersz (`ranking[0]`) ma zawsze najwyższą liczbę punktów dzięki istniejącemu `ORDER BY` w funkcji SQL — zwycięzcy to każdy wiersz z `points` równym `ranking[0].points`.
- `src/pages/admin/tournaments.astro` (S-01/S-03) listuje turnieje z linkami "Spotkania"/"Ranking" per turniej, ale nie pobiera dziś żadnych danych o meczach tego turnieju — potrzebne dodatkowe zapytanie do policzenia meczów bez wyniku.
- Wzorzec przycisku z potwierdzeniem JS (`onsubmit="return confirm(...)"`) istnieje w `src/pages/admin/users.astro` ("Dezaktywuj") i wzorzec prostego endpointu bez ciała żądania (tylko `id` ze ścieżki) istnieje w `src/pages/api/admin/users/[id]/disable.ts` — oba mają tu bezpośrednie zastosowanie.

## Desired End State

Po ukończeniu tej zmiany:

- Na `/admin/tournaments`, przy każdym turnieju ze statusem `active`, Admin widzi przycisk "Zamknij turniej" wymagający potwierdzenia (JS `confirm()`), z widocznym licznikiem meczów bez wprowadzonego wyniku, gdy taki istnieje (np. "2 mecze bez wyniku").
- Po potwierdzeniu: `tournaments.status` zmienia się na `closed`. Nie ma żadnej akcji "otwórz ponownie" — to jednokierunkowe.
- Turniej ze statusem `closed` nie pokazuje już przycisku "Zamknij turniej" na liście (już zamknięty).
- Na `/tournaments/[id]/ranking`, dla turnieju `closed` z co najmniej jednym Userem w rankingu, nad listą pojawia się banner "🏆 Zwycięzca(y): …" wymieniający wszystkich Userów z maksymalną liczbą punktów (w tym gdy maksimum wynosi 0 — bez wyjątku), a ich wiersze na liście są dodatkowo oznaczone (🏆).
- Dla turnieju `active` strona rankingu wygląda identycznie jak przed tą zmianą (bez bannera/oznaczeń zwycięzcy).
- Próba POST do endpointu zamknięcia dla już zamkniętego turnieju jest jawnie odrzucona (nie cichnie, nie duplikuje zamknięcia).

### Key Discoveries:

- Zamknięcie nie wymaga żadnej nowej kolumny/tabeli — `tournaments.status` już istnieje, `tournament_ranking()` już działa dla obu statusów, zwycięzcy liczeni na żywo z pierwszego wiersza posortowanego wyniku.
- Endpoint zamknięcia nie przyjmuje żadnego ciała żądania (jak `disable.ts`) — jedyny input to `id` ze ścieżki.
- Licznik "meczów bez wyniku" na liście turniejów wymaga jednego dodatkowego zapytania o `matches` (id, tournament_id, actual_home_score) dla wszystkich turniejów naraz, analogicznie do wzorca z `dashboard.astro` (jedno zapytanie z `.in("tournament_id", ids)`, potem agregacja w JS przez `Map`).

## What We're NOT Doing

- Nie dodajemy akcji "otwórz ponownie zamknięty turniej" — zamknięcie jest jednokierunkowe.
- Nie blokujemy zamknięcia turnieju z meczami bez wprowadzonego wyniku — tylko informacyjny licznik przed kliknięciem, decyzja należy do Admina.
- Nie dodajemy nowej tabeli/kolumny na "zwycięzców" — liczeni na żywo z `tournament_ranking()` przy każdym wejściu na stronę rankingu.
- Nie zmieniamy niczego w `tournament_ranking()` (funkcja z S-06 pozostaje bez zmian) — tylko strona rankingu dostaje nową logikę wyświetlania.
- Nie dodajemy osobnej strony/sekcji "wyniki końcowe" — zwycięzcy pokazywani na tej samej stronie rankingu, dla turniejów `closed`.
- Nie dodajemy frameworka testowego — konwencja repo (lint/build/manual) bez zmian.

## Implementation Approach

Trzy fazy w kolejności zależności: (1) migracja SQL z polityką RLS `admin_update_tournaments`, (2) endpoint API zamknięcia turnieju z walidacją (rola Admin, turniej istnieje i jest `active`), (3) UI — przycisk zamknięcia z licznikiem na `/admin/tournaments`, banner + oznaczenie zwycięzców na `/tournaments/[id]/ranking`.

## Phase 1: RLS — Admin może zamknąć turniej

### Overview

Nowa migracja dodaje jedyną brakującą politykę UPDATE na `tournaments`, wzorem `admin_update_matches`/`admin_update_predictions` z S-05.

### Changes Required:

#### 1. Migracja SQL

**File**: `supabase/migrations/20260913110000_add_tournament_close_policy.sql` (nowy plik)

**Intent**: Pozwolić Adminowi zmienić `tournaments.status` (jedyny dziś brakujący fragment RLS na tej tabeli).

**Contract**: `create policy "admin_update_tournaments" on public.tournaments for update using (public.is_admin(auth.uid()));` — bez `WITH CHECK` (spójne z `admin_update_matches`/`admin_update_predictions`, jedyny piszący-do-cudzych-wierszy aktor to Admin, weryfikowany przez `is_admin()`). Brak zmian w `src/types.ts` — `Tournament.status: TournamentStatus` już istnieje.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się czysto na zalinkowanym zdalnym projekcie Supabase: `npx supabase db push`; `npx supabase migration list` potwierdza zgodność `Local`/`Remote`.
- Type-check przechodzi (`get_errors`; `npm run build` jako dodatkowa próba — znany artefakt środowiskowy `write EOF` nie blokuje).

#### Manual Verification:

- Testowe konto Admina może zaktualizować `tournaments.status` na istniejącym turnieju (SQL Editor lub REST); testowe konto User nie może (RLS blokuje).

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie RLS, zanim przejdziesz do endpointu, który się na tym opiera.

---

## Phase 2: Endpoint API — zamknięcie turnieju

### Overview

Jedyny endpoint tego plasterka: zamyka turniej, jednokierunkowo, z walidacją że jest dziś `active`.

### Changes Required:

#### 1. Endpoint zamknięcia turnieju

**File**: `src/pages/api/admin/tournaments/[id]/close.ts` (nowy plik)

**Intent**: Zmienić status turnieju na `closed`, odrzucając próbę dla turnieju już zamkniętego lub nieistniejącego.

**Contract**: Eksportuje `export const prerender = false;` i `POST: APIRoute`. Pierwsza linia: `requireRole(context.locals, "admin")`. `tournament_id` z `context.params.id`. Brak ciała żądania do parsowania (wzorem `src/pages/api/admin/users/[id]/disable.ts`). Zwykłym `createClient()` (nie admin) pobiera `status` turnieju; brak wiersza → redirect `/admin/tournaments?error=Nie znaleziono turnieju`; `status !== "active"` → redirect `/admin/tournaments?error=Turniej jest już zamknięty`. Sukces walidacji: `update({ status: "closed" }).eq("id", tournament_id)`; błąd → redirect z ogólnym komunikatem "Nie udało się zamknąć turnieju"; sukces → `context.redirect("/admin/tournaments")` bez query param.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check przechodzi (`get_errors`; `npm run build` jako dodatkowa próba)

#### Manual Verification:

- Zalogowany jako Admin, POST dla aktywnego turnieju zamyka go i przekierowuje bez błędu.
- Drugi POST dla tego samego (teraz zamkniętego) turnieju przekierowuje z czytelnym błędem, status się nie zmienia.
- POST dla nieistniejącego `id` przekierowuje z błędem "Nie znaleziono turnieju".
- Bezpośredni POST jako User zwraca 403.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie wszystkie cztery ścieżki powyżej, zanim przejdziesz do UI.

---

## Phase 3: UI — przycisk zamknięcia i wyróżnienie zwycięzców

### Overview

Rozbudowujemy `/admin/tournaments` o przycisk zamknięcia z licznikiem meczów bez wyniku, i `/tournaments/[id]/ranking` o banner + oznaczenie zwycięzców dla turniejów `closed`.

### Changes Required:

#### 1. Przycisk zamknięcia + licznik na liście turniejów

**File**: `src/pages/admin/tournaments.astro`

**Intent**: Dać Adminowi możliwość zamknięcia aktywnego turnieju wprost z listy, z widocznym ostrzeżeniem o nierozegranych meczach przed kliknięciem.

**Contract**: Frontmatter dokłada jedno zapytanie `supabase.from("matches").select("id, tournament_id, actual_home_score").in("tournament_id", tournamentIds)` (wzorem agregacji z `dashboard.astro`), z którego budowana jest `Map<tournament_id, liczba meczów z actual_home_score === null>`. Przy każdym turnieju ze `status === "active"`: obok istniejących linków "Spotkania"/"Ranking", `<form method="POST" action={`/api/admin/tournaments/${tournament.id}/close`} onsubmit="return confirm('Na pewno zamknąć ten turniej? Tej operacji nie można cofnąć.')">` z przyciskiem "Zamknij turniej" (styl analogiczny do "Dezaktywuj" w `users.astro` — obramowanie/tło w odcieniu ostrzegawczym); jeśli licznik meczów bez wyniku dla tego turnieju > 0, obok przycisku tekst "{N} mecz(e/ów) bez wyniku". Turniej ze `status === "closed"` nie renderuje ani formularza, ani licznika.

#### 2. Banner i oznaczenie zwycięzców na stronie rankingu

**File**: `src/pages/tournaments/[id]/ranking.astro`

**Intent**: Dla zamkniętego turnieju, wyróżnić na żywo Userów z maksymalną liczbą punktów jako zwycięzców (dopuszczalny remis, także przy 0 pkt).

**Contract** (non-obvious — wyznaczenie zwycięzców z już posortowanej listy):

```
const maxPoints = ranking.length > 0 ? ranking[0].points : null;
const winners = tournament?.status === "closed" && maxPoints !== null
  ? ranking.filter((row) => row.points === maxPoints)
  : [];
```

Nad listą, gdy `winners.length > 0`: banner (np. obramowanie/tło w odcieniu złotym) "🏆 Zwycięzca{winners.length > 1 ? "y" : ""}: {winners.map(w => w.email ?? w.user_id).join(", ")} ({maxPoints} pkt)". Na liście, każdy wiersz z `row.points === maxPoints` (gdy `winners.length > 0`) dostaje dopisany "🏆" obok e-maila — niezależnie od istniejącego wyróżnienia "to ja" (`cn()` z S-06 pozostaje bez zmian, oznaczenie zwycięzcy to dodatkowy tekst, nie konkurujący kolor tła).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Type-check przechodzi (`get_errors`; `npm run build` jako dodatkowa próba)

#### Manual Verification:

- Aktywny turniej z meczami bez wyniku pokazuje przycisk "Zamknij turniej" z poprawnym licznikiem; kliknięcie i potwierdzenie zamyka turniej i przekierowuje.
- Po zamknięciu, ten sam turniej na liście nie pokazuje już przycisku "Zamknij turniej".
- Strona rankingu zamkniętego turnieju pokazuje banner zwycięzcy(ów) i oznaczenie 🏆 przy właściwych wierszach; przy remisie wielu Userów wszyscy są wymienieni.
- Turniej zamknięty z maksimum 0 pkt (nikt nie trafił / nikt nie typował) nadal pokazuje wszystkich z 0 pkt jako zwycięzców — bez wyjątku.
- Strona rankingu aktywnego turnieju nie pokazuje bannera ani oznaczeń zwycięzcy.
- Anulowanie potwierdzenia (`confirm()` → Anuluj) nie wysyła żądania, status się nie zmienia.

**Implementation Note**: Po zakończeniu tej fazy zatrzymaj się i potwierdź manualnie wszystkie sześć ścieżek powyżej — to ostatnia faza tej zmiany.

---

## Testing Strategy

### Unit Tests:

- Brak — projekt nie ma frameworka testowego (zgodnie z F-01…S-06 i `AGENTS.md`); pokrycie zapewnia lint + build + weryfikacja manualna.

### Integration Tests:

- Brak (jak wyżej).

### Manual Testing Steps:

1. Przygotować aktywny turniej z co najmniej dwoma meczami: jednym z wprowadzonym wynikiem i typami o różnych punktach (w tym remis na maksimum), jednym bez wyniku.
2. Na `/admin/tournaments`, potwierdzić licznik "1 mecz bez wyniku" przy tym turnieju.
3. Kliknąć "Zamknij turniej", potwierdzić w `confirm()` — turniej znika z listy aktywnych do zamknięcia (przycisk nie renderuje się już).
4. Wejść na `/tournaments/{id}/ranking` — potwierdzić banner zwycięzcy(ów) i oznaczenie 🏆 przy właściwych wierszach (w tym remis, jeśli przygotowany).
5. Powtórzyć scenariusz z turniejem zamkniętym bez żadnego wprowadzonego wyniku (wszyscy 0 pkt) — potwierdzić że wszyscy Userzy są oznaczeni jako zwycięzcy.

## Performance Considerations

Jedno dodatkowe zapytanie o `matches` na wejście na `/admin/tournaments` (liczba turniejów × meczów w skali pojedynczego biura — dziesiątki) — bez wpływu na wydajność przy tej skali. Wyznaczenie zwycięzców na stronie rankingu to operacja w pamięci na już pobranej (małej) liście — bez dodatkowego zapytania.

## Migration Notes

Migracja jest addytywna (nowa polityka RLS, brak zmian w kolumnach/danych) — brak backfillu, brak ryzyka dla istniejących danych.

## References

- Wzorzec RLS UPDATE dla Admina: `supabase/migrations/20260912100000_add_match_results_and_prediction_points.sql` (S-05, `admin_update_matches`/`admin_update_predictions`)
- Wzorzec endpointu bez ciała żądania + przycisku z potwierdzeniem: `src/pages/api/admin/users/[id]/disable.ts`, `src/pages/admin/users.astro` (S-02)
- Ranking na żywo, reużywalny dla `closed`: `context/changes/live-tournament-ranking/plan.md` (S-06)
- PRD: `context/foundation/prd.md` (FR-009, FR-011)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: RLS — Admin może zamknąć turniej

#### Automated

- [x] 1.1 Migracja aplikuje się czysto (`npx supabase db push`, `npx supabase migration list`) — cb36c7c
- [x] 1.2 Type-check przechodzi — cb36c7c

#### Manual

- [x] 1.3 Admin może zaktualizować `tournaments.status`; User nie może (RLS blokuje) — cb36c7c

### Phase 2: Endpoint API — zamknięcie turnieju

#### Automated

- [x] 2.1 Lint przechodzi (`npm run lint`)
- [x] 2.2 Type-check przechodzi

#### Manual

- [ ] 2.3 Poprawny POST zamyka aktywny turniej i przekierowuje bez błędu
- [ ] 2.4 Drugi POST dla już zamkniętego turnieju zwraca błąd, status się nie zmienia
- [ ] 2.5 POST dla nieistniejącego turnieju zwraca błąd
- [ ] 2.6 Bezpośredni POST jako User zwraca 403

### Phase 3: UI — przycisk zamknięcia i wyróżnienie zwycięzców

#### Automated

- [x] 3.1 Lint przechodzi (`npm run lint`)
- [x] 3.2 Type-check przechodzi

#### Manual

- [ ] 3.3 Przycisk "Zamknij turniej" z poprawnym licznikiem; zamknięcie działa
- [ ] 3.4 Po zamknięciu przycisk znika z listy
- [ ] 3.5 Banner + oznaczenie 🏆 poprawne na stronie rankingu zamkniętego turnieju, w tym przy remisie
- [ ] 3.6 Maksimum 0 pkt nadal wyłania zwycięzców bez wyjątku
- [ ] 3.7 Aktywny turniej nie pokazuje bannera/oznaczeń
- [ ] 3.8 Anulowanie `confirm()` nie wysyła żądania
