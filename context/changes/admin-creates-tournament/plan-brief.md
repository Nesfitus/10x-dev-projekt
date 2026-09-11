# Admin zakłada nowy turniej — Plan Brief

> Full plan: `context/changes/admin-creates-tournament/plan.md`

## What & Why

Admin potrzebuje móc założyć nowy turniej (FR-004) — to pierwszy plasterek domenowy po fundamencie ról (F-01) i punkt wejścia do całego łańcucha MVP (spotkania → typowanie → punktacja → ranking → zamknięcie). Bez tabeli `tournaments` żaden kolejny plasterek nie ma do czego się odnieść.

## Starting Point

F-01 dostarczył kompletny fundament: role Admin/User, `requireRole()`, middleware bramkujące `/admin/*`, oraz dwa jawnie oznaczone placeholdery — `src/pages/admin.astro` i `src/pages/api/admin/ping.ts` — z komentarzem "replaced in S-01". Baza danych ma tylko tabelę `profiles`; zod nie jest jeszcze zainstalowany, mimo że `AGENTS.md` wymaga go do walidacji API.

## Desired End State

Admin loguje się, wchodzi na `/admin/tournaments`, widzi listę dotychczasowych turniejów i formularz do założenia nowego (nazwa + opcjonalny opis). Próba założenia drugiego aktywnego turnieju kończy się czytelnym komunikatem błędu, nie cichym niepowodzeniem. `/admin` to hub gotowy na kolejne sekcje panelu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Egzekwowanie "jeden aktywny turniej naraz" | Częściowy unikalny indeks w DB (`WHERE status = 'active'`) | Wymuszone na poziomie danych, zgodne z Guardrails PRD i wzorcem `is_admin()`/constraint z F-01 | Plan |
| Pola formularza | `name` (wymagane) + `description` (opcjonalny) | FR-004/FR-005 nie wymagają dat na poziomie turnieju — tylko na poziomie spotkań | Plan |
| Unikalność nazwy | Brak wymogu — duplikaty dozwolone | Zero dodatkowej logiki/ograniczeń, zaakceptowane ryzyko pomyłki | Plan |
| Struktura strony admina | `/admin` jako hub + dedykowana `/admin/tournaments` | Skalowalny wzorzec — S-02/S-03 dostaną własne podstrony bez przebudowy | Plan |
| Komunikacja formularza z API | Natywny `<form method="POST">` + redirect z błędem w query param | Spójne z istniejącym wzorcem `signin.ts`/`signin.astro`, mniej kodu React | Plan |
| Wyświetlanie błędów | Redirect z komunikatem w query param (nie inline React) | Spójne z wybranym mechanizmem submission — brak potrzeby wyspy React | Plan |
| Zakres RLS | Tylko Admin (insert + select) na razie | Zgodne z zasadą progressive disclosure z F-01 — przyszłe S-04/S-06 dodadzą dostęp Usera, gdy będzie potrzebny | Plan |

## Scope

**In scope:**
- Migracja: tabela `tournaments` + RLS (Admin-only) + częściowy unikalny indeks "jeden aktywny turniej"
- `zod` jako nowa zależność + `POST /api/admin/tournaments` z walidacją i obsługą błędu konfliktu
- Usunięcie tymczasowego `src/pages/api/admin/ping.ts`
- Hub `/admin` + strona `/admin/tournaments` (lista + formularz)

**Out of scope:**
- Zamykanie turnieju i wyłanianie zwycięzców (S-07)
- Dostęp Usera (select) do `tournaments` (S-04/S-06)
- Unikalność nazwy, edycja/usuwanie turnieju
- Framework testowy

## Architecture / Approach

Tabela `tournaments` (status `active`/`closed`, domyślnie `active`) chroniona RLS przez reużyty `is_admin()` z F-01. Reguła "jeden aktywny turniej" żyje w bazie jako częściowy unikalny indeks — nie w kodzie aplikacji — więc jest odporna na race condition. Endpoint API (pierwszy z walidacją zod w repo) mapuje błąd naruszenia indeksu (`23505`) na czytelny komunikat. UI to czysty Astro (bez Reacta) — formularz z natywnym POST + redirect, zgodnie z ustalonym wzorcem auth.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Model danych | Tabela `tournaments`, RLS, unikalny indeks "jeden aktywny" | Błędna definicja indeksu częściowego pozwalająca na dwa aktywne turnieje |
| 2. Endpoint API | `POST /api/admin/tournaments` z zod, usunięcie `ping.ts` | Pominięcie mapowania błędu `23505` — Admin widzi surowy błąd bazy |
| 3. UI Admina | Hub `/admin` + `/admin/tournaments` (lista + formularz) | Zapomnienie o pustym stanie listy przed pierwszym turniejem |

**Prerequisites:** F-01 (role-based-access-foundation) — już zaimplementowany.
**Estimated effort:** 3 fazy, sekwencyjne (każda zależy od poprzedniej).

## Open Risks & Assumptions

- Dopóki S-07 (zamykanie turnieju) nie powstanie, Admin nie będzie mógł utworzyć drugiego turnieju po pierwszym — zaakceptowany, świadomy koszt tej kolejności plasterków.
- Zakłada się, że `supabase-js` konsekwentnie przekazuje kod błędu Postgresa (`error.code === "23505"`) przy naruszeniu unikalnego indeksu — do zweryfikowania manualnie w Fazie 1/2.

## Success Criteria (Summary)

- Admin może założyć turniej (nazwa + opcjonalny opis) i widzi go natychmiast na liście.
- Próba założenia drugiego aktywnego turnieju kończy się czytelnym komunikatem błędu, nie cichym niepowodzeniem ani duplikatem w danych.
- User i niezalogowany nie mają dostępu do `/admin/tournaments` ani do danych `tournaments` (RLS + middleware).
