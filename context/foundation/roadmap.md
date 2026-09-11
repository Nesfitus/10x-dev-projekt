---
project: Typer Sportowy
version: 1
status: draft
created: 2026-09-08
updated: 2026-09-11
prd_version: 1
main_goal: speed
top_blocker: capacity
milestone_id: mvp-core-flow
milestone_seq: 1
milestone_status: open
---

# Roadmap: Typer Sportowy

> Derived from context/foundation/prd.md (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Podstawowy przepływ MVP (typowanie → punktacja → ranking → zamknięcie turnieju)** — Status: open

- **Intent:** Dostarczyć w pełni działający, end-to-end przepływ z Success Criteria PRD: Admin zakłada turniej i dodaje userów/spotkania, User typuje wyniki, Admin wprowadza faktyczne wyniki, system automatycznie i bezbłędnie liczy punkty (3/1/0), a po jawnym zamknięciu turnieju pokazuje ranking i wyłania zwycięzców.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001 – FR-011, US-01.

## Vision recap

Pracownicy biura, którzy dziś ręcznie typują wyniki sportowe i liczą punkty w arkuszu kalkulacyjnym, dostają prostą aplikację webową, która automatycznie i bezbłędnie liczy punkty według stałej reguły (3 pkt za dokładny wynik, 1 pkt za trafiony typ, 0 pkt za brak trafienia) i pokazuje bieżący ranking turnieju — bez kosztu płatnych narzędzi.

## North star

**S-05: Admin wprowadza faktyczny wynik spotkania, a system automatycznie i bezbłędnie nalicza punkty Userowi** — to najmniejszy fragment przepływu, który dowodzi kluczowej propozycji wartości produktu (automatyczne liczenie punktów zamiast ręcznego liczenia w Excelu); jest wprost głównym kryterium sukcesu z PRD.

> "Gwiazda przewodnia" (north star) oznacza tu: najmniejszy kompletny fragment przepływu, którego udane dostarczenie dowodzi, że produkt realnie rozwiązuje problem użytkownika — umieszczony tak wcześnie, jak pozwalają na to jego zależności, bo reszta funkcji ma sens tylko, jeśli ten fragment działa poprawnie.

## At a glance

| ID   | Change ID                             | Outcome (user can …)                                                          | Prerequisites | PRD refs             | Status   |
| ---- | -------------------------------------- | ------------------------------------------------------------------------------ | -------------- | --------------------- | -------- |
| F-01 | role-based-access-foundation           | (foundation) role Admin/User rozróżnialne w sesji; kontrola dostępu wg roli    | —              | FR-001                | in-progress |
| S-01 | admin-creates-tournament                | Admin może założyć nowy turniej                                              | F-01            | FR-004                | in-progress |
| S-02 | admin-manages-users                     | Admin może dodać konta Userów do systemu (bez samorejestracji)                | F-01            | FR-002, FR-003        | in-progress |
| S-03 | admin-adds-matches                      | Admin może dodać spotkania do turnieju z terminem                             | S-01, F-01      | FR-005                | proposed |
| S-04 | user-submits-prediction                 | User może wytypować wynik spotkania do jego rozpoczęcia                       | S-02, S-03, F-01 | US-01, FR-006         | proposed |
| S-05 | admin-enters-result-auto-scoring        | Admin wprowadza faktyczny wynik; system automatycznie nalicza punkty Userowi   | S-04, F-01      | US-01, FR-007, FR-008 | proposed |
| S-06 | live-tournament-ranking                 | User widzi pełny, bieżący ranking turnieju                                   | S-05            | FR-010                | proposed |
| S-07 | admin-closes-tournament-and-winners     | Admin jawnie zamyka turniej; system wyłania zwycięzców (dopuszczalny remis)   | S-06, F-01      | FR-009, FR-011        | proposed |

## Streams

Nawigacyjna pomoc — grupuje elementy dzielące ten sam łańcuch zależności. Kanoniczna kolejność nadal żyje w grafie zależności poniżej; ta tabela to proponowana kolejność czytania po równoległych ścieżkach.

| Stream | Theme                                                | Chain                                                        | Note                                                                                       |
| ------ | ----------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A      | Rdzeń turnieju: konfiguracja → typowanie → punktacja → zamknięcie | `F-01` → `S-01` → `S-03` → `S-04` → `S-05` → `S-06` → `S-07` | Główna ścieżka must-have; zawiera gwiazdę przewodnią `S-05`.                                 |
| B      | Zarządzanie użytkownikami                             | `S-02`                                                          | Równoległe z `S-01`/`S-03` (po `F-01`); dołącza do Stream A w `S-04` (wymaga też `S-03`). |

## Baseline

What's already in place in the codebase as of `2026-09-08` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Astro 6 + React 19 + Tailwind 4 skonfigurowane (`astro.config.mjs`); shadcn/ui skonfigurowane (`components.json`), ale zaimplementowany tylko `button.tsx`.
- **Backend / API:** partial — Astro SSR (`output: "server"`) + endpointy auth (`src/pages/api/auth/{signin,signup,signout}.ts`); brak jakichkolwiek endpointów domenowych (turnieje/spotkania/typy/punktacja).
- **Data:** absent — klient Supabase skonfigurowany (`src/lib/supabase.ts`), ale brak migracji (`supabase/migrations` nie istnieje) i brak modelu domenowego (brak `src/types.ts`).
- **Auth:** partial — logowanie/rejestracja/wylogowanie i middleware sesji działają (`src/middleware.ts`); rola Admin/User całkowicie nieobecna (brak RBAC).
- **Deploy / infra:** present — Cloudflare Workers, auto-deploy przez Workers Builds, aplikacja żywa pod `https://typer-sportowy.patrykshon.workers.dev` (`context/deployment/deploy-plan.md`).
- **Observability:** partial — natywny observability Cloudflare włączony (`wrangler.jsonc`), brak strukturalnego logowania/error trackingu w kodzie aplikacji.

## Foundations

### F-01: Model ról Admin/User

- **Outcome:** (foundation) Użytkownicy mają przypisaną rolę (Admin | User) rozróżnialną na poziomie sesji/serwera; istnieje wielokrotnego użytku mechanizm sprawdzający rolę, gotowy do bramkowania tras/endpointów tylko-dla-Admina i tylko-dla-Usera.
- **Change ID:** role-based-access-foundation
- **PRD refs:** FR-001, Access Control ("dokładnie dwie role, płaski model"), Guardrails ("dostęp do turniejów musi być poprawnie ograniczony zgodnie z rolą")
- **Unlocks:** S-01, S-02, S-03, S-04, S-05, S-07 (wszystkie plasterki wymagające rozróżnienia Admin/User); weryfikowalna ścieżka "dostęp ograniczony wg roli" wymagana przez Guardrails.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sekwencjonowane jako pierwsze, bo niemal każdy kolejny plasterek wymaga rozróżnienia Admin/User, by mógł zostać poprawnie zaplanowany lub zweryfikowany; pominięcie tego wymusiłoby niewygodne doklejanie kontroli dostępu później, w wielu miejscach naraz.
- **Status:** in-progress

## Slices

### S-01: Admin zakłada turniej

- **Outcome:** Admin może założyć nowy turniej (jeden aktywny naraz, kolejne niezależnie przechowywane).
- **Change ID:** admin-creates-tournament
- **PRD refs:** FR-004
- **Prerequisites:** F-01
- **Parallel with:** S-02 (po F-01, żaden z nich nie zależy od drugiego)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Najprostszy możliwy punkt startowy po F-01 — tworzy wyłącznie rekord turnieju, zero zależności od innych danych domenowych; ryzyko niskie.
- **Status:** in-progress

### S-02: Admin zarządza użytkownikami (bez samorejestracji)

- **Outcome:** Admin może dodać konto Usera do systemu; nie istnieje żadna ścieżka samodzielnej rejestracji dla Usera ani Admina.
- **Change ID:** admin-manages-users
- **PRD refs:** FR-002, FR-003
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-03 (po ukończeniu S-01 dla S-03)
- **Blockers:** —
- **Unknowns:**
  - Istniejący w starterze publiczny flow samorejestracji (`src/pages/api/auth/signup.ts`, `src/pages/auth/signup.astro`) koliduje z FR-002/FR-003 (brak samorejestracji — konta zakłada wyłącznie Admin). Czy tę ścieżkę należy usunąć, czy przerobić na akcję "Admin dodaje Usera"? — Owner: user. Block: no (decyzja implementacyjna dla `/10x-plan`, docelowy model dostępu jest już jednoznaczny).
- **Risk:** Koliduje z istniejącym publicznym flow rejestracji w starterze (patrz Unknowns) — trzeba świadomie zamknąć/przerobić self-signup, inaczej model dostępu z PRD zostanie naruszony.
- **Status:** in-progress

### S-03: Admin dodaje spotkania do turnieju

- **Outcome:** Admin może dodać spotkanie (element turnieju) wraz z terminem (data i godzina) rozegrania.
- **Change ID:** admin-adds-matches
- **PRD refs:** FR-005
- **Prerequisites:** S-01, F-01
- **Parallel with:** S-02 (po ukończeniu S-01)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zależy tylko od istnienia turnieju (S-01); ryzyko niskie, ale to ostatni krok przygotowawczy przed typowaniem — jego opóźnienie opóźnia całą resztę łańcucha.
- **Status:** proposed

### S-04: User typuje wynik spotkania

- **Outcome:** User może wytypować wynik spotkania do momentu jego rozpoczęcia; typ innego użytkownika pozostaje niewidoczny przed startem spotkania; brak typu liczy się jak nietrafiony (0 pkt, egzekwowane w S-05).
- **Change ID:** user-submits-prediction
- **PRD refs:** US-01, FR-006, NFR (niewidoczność typu wyniku przed startem spotkania)
- **Prerequisites:** S-02, S-03, F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Musi poprawnie wymuszać blokadę czasową (typowanie tylko do startu spotkania) oraz niewidoczność cudzych typów — błąd tutaj bezpośrednio narusza Guardrails PRD.
- **Status:** proposed

### S-05: Admin wprowadza wynik, system automatycznie nalicza punkty

- **Outcome:** Admin ręcznie wprowadza faktyczny wynik spotkania; system natychmiast i automatycznie nalicza Userowi punkty według stałej reguły (3 pkt za dokładny wynik, 1 pkt za trafiony typ, 0 pkt za brak trafienia).
- **Change ID:** admin-enters-result-auto-scoring
- **PRD refs:** US-01, FR-007, FR-008, Business Logic, Guardrails (poprawność liczenia punktów)
- **Prerequisites:** S-04, F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** To jest gwiazda przewodnia — najbardziej wrażliwa logika biznesowa (naliczanie punktów) musi być bezbłędna zgodnie z Guardrails; błąd tutaj podważa całą propozycję wartości produktu wobec ręcznego liczenia w Excelu.
- **Status:** proposed

### S-06: User widzi bieżący ranking turnieju

- **Outcome:** User może zobaczyć pełny ranking (wszystkich uczestników) i swoje punkty w turnieju na bieżąco, w trakcie jego trwania.
- **Change ID:** live-tournament-ranking
- **PRD refs:** FR-010, NFR (ranking widoczny w ciągu kilku sekund od wprowadzenia wyniku)
- **Prerequisites:** S-05
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zależy od realnych, poprawnie naliczonych punktów z S-05; ryzyko głównie w dotrzymaniu NFR czasu odświeżenia rankingu (kilka sekund) przy prostym podejściu do agregacji.
- **Status:** proposed

### S-07: Admin zamyka turniej, system wyłania zwycięzców

- **Outcome:** Admin może jawnie zakończyć (zamknąć) turniej, co wyzwala wyłonienie zwycięzcy/zwycięzców (dopuszczalny remis / ex aequo) i finalizuje ranking.
- **Change ID:** admin-closes-tournament-and-winners
- **PRD refs:** FR-009, FR-011
- **Prerequisites:** S-06, F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Ostatni krok w łańcuchu — musi poprawnie obsłużyć remisy (ex aequo, zgodnie z rundą Sokratesa w PRD) i być wyzwalany wyłącznie jawną akcją Admina, nie automatycznie.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                           | Suggested issue title                                              | Ready for `/10x-plan` | Notes                                                                 |
| ---------- | ------------------------------------- | ---------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| F-01       | role-based-access-foundation          | Add Admin/User role model and server-side role guard                   | yes                     | Run `/10x-plan role-based-access-foundation`                             |
| S-01       | admin-creates-tournament               | Admin can create a new tournament                                       | no                      | Waits on F-01                                                             |
| S-02       | admin-manages-users                    | Admin can add User accounts (no self-registration)                     | no                      | Waits on F-01; existing public signup flow needs disposal decision       |
| S-03       | admin-adds-matches                     | Admin can add matches with a scheduled date/time to a tournament        | no                      | Waits on S-01, F-01                                                       |
| S-04       | user-submits-prediction                | User can submit a match prediction before kickoff                       | no                      | Waits on S-02, S-03, F-01                                                 |
| S-05       | admin-enters-result-auto-scoring       | Admin enters actual result; system auto-scores predictions             | no                      | Waits on S-04, F-01 — this is the north star                             |
| S-06       | live-tournament-ranking                | User can view the live, full tournament ranking                        | no                      | Waits on S-05                                                             |
| S-07       | admin-closes-tournament-and-winners    | Admin can close a tournament and reveal winners (ties allowed)          | no                      | Waits on S-06, F-01                                                       |

## Open Roadmap Questions

1. **Czy pełny zakres MVP (11 FR, wszystkie must-have) rzeczywiście mieści się w 3 tygodniach pracy wyłącznie po godzinach, biorąc pod uwagę, że główne ryzyko sekwencjonowania to dostępność/przepustowość solo-developera?** — Owner: user. Block: none — element do monitorowania, nie blokuje planowania żadnego konkretnego plasterka teraz; rewizja zalecana po ukończeniu S-03 (połowa łańcucha przygotowawczego), jeśli tempo okaże się wolniejsze niż zakładane.

## Parked

- **W pełni konfigurowalne typy rywalizacji/sposoby punktacji** — Why parked: PRD Non-Goals — MVP ma jeden zaszyty na sztywno sposób liczenia punktów (3/1/0); konfigurowalność świadomie odłożona jako dług techniczny MVP.
- **Automatyczna integracja z zewnętrznym źródłem wyników sportowych** — Why parked: PRD Non-Goals — MVP ma wyłącznie ręczne wprowadzanie wyników przez Admina.
- **Wspólny ranking między wieloma turniejami** — Why parked: PRD Non-Goals — w MVP turnieje są od siebie niezależne.
- **Samodzielna rejestracja użytkowników/administratorów** — Why parked: PRD Non-Goals — konta zakłada wyłącznie Admin / proces konfiguracyjny.
- **Możliwość korekty raz wprowadzonego wyniku spotkania** — Why parked: PRD Non-Goals — świadomie odłożone jako możliwe rozszerzenie post-MVP.
- **Ładna, czytelna prezentacja rankingu (wizualny polish)** — Why parked: Success Criteria → Secondary, brak powiązanego FR-NNN; S-06 dostarczy funkcjonalny, ale nie dopieszczony wizualnie ranking.
- **Powiadomienia o nowych turniejach / zbliżających się meczach** — Why parked: Success Criteria → Secondary, brak powiązanego FR-NNN.
- **Historia typowań użytkownika i analiza jak typowali inni** — Why parked: Success Criteria → Secondary, brak powiązanego FR-NNN.

## Milestone History

## Done
