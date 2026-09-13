# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-13

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic check that already catches the
   regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in area Y"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Reguła punktacji (3 pkt dokładny wynik / 1 pkt trafiony kierunek / 0 pkt) liczy błędnie, zwłaszcza remis:remis różnymi wynikami | High | Medium | PRD Guardrail "poprawność liczenia punktów"; US-01 acceptance criteria; interview Q1 (główna obawa użytkownika) |
| 2 | Typ wyniku daje się złożyć lub edytować po starcie meczu (blokada czasowa omijalna) | High | Medium | PRD FR-006; PRD NFR "typ niewidoczny przed startem"; US-01 acceptance criteria; roadmap S-04 risk note |
| 3 | Ranking/zwycięzcy pomijają usera bez typu (powinien mieć 0 pkt) lub błędnie rozstrzygają remis (w tym remis na 0 pkt) | High | Medium | PRD FR-009/FR-010/FR-011; roadmap S-06/S-07 (status impl_reviewed) |
| 4 | Luka w kontroli dostępu Admin/User — trasa lub endpoint panelu admina dostępny dla Usera | High | Medium | PRD Guardrail "dostęp ograniczony wg roli"; interview Q3 ("strona admina"); hot-spot dir `src/pages/admin` (11 commits/30d) |
| 5 | Dezaktywowane konto nie zostaje natychmiast wylogowane w trakcie już aktywnej sesji | High | Medium | PRD Guardrail "logowanie musi działać niezawodnie"; hot-spot dir `src/components/auth` (6 commits/30d); archive/2026-09-11-admin-manages-users/plan.md |
| 6 | Naruszenie reguły "jeden aktywny turniej naraz" lub zapis do już zamkniętego turnieju | Medium | Low | PRD FR-004/FR-011; archive/2026-09-11-admin-creates-tournament/plan.md (partial unique index) |
| 7 | Funkcja rankingu ujawnia pełny (niezamaskowany) e-mail innego Usera | Medium | Low | roadmap S-06 (ranking widoczny dla wszystkich zalogowanych); abuse-lens: Secret/PII leakage |

**Impact × Likelihood rubric** (High/Medium/Low, coarse by design — see schema).

**Abuse / security lens applied**: produkt ma auth + role Admin/User → risk #4 (authorization/IDOR) i risk #7 (PII leakage) są wprost pozycjami z tego obiektywu, nie tylko z wywiadu/PRD.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Pełna macierz predykcja×wynik (dokładny/kierunek/chybiony) daje 3/1/0, w tym remis:remis różnymi wynikami | "Raz przetestowane = generalizuje" — remis:remis jest najbardziej podatny na błąd znaku/delty | Dokładna formuła porównania (znak różnicy vs delta), gdzie liczone (SQL vs kod aplikacji) | unit | Oracle problem — asercja skopiowana z bieżącej implementacji zamiast z reguły 3/1/0 |
| #2 | Zapis po starcie meczu odrzucony niezależnie od warstwy (API i RLS); zapis przed startem przechodzi do ostatniej sekundy | "UI chowa formularz = chronione" — liczy się odrzucenie przy bezpośrednim zapisie z pominięciem UI | Gdzie żyje sprawdzenie granicy czasowej, jaki zegar (serwer vs klient), strefa czasowa `scheduled_at` | integration | Testowanie wyłącznie przez formularz UI |
| #3 | Ranking zawiera wszystkich uprawnionych (w tym 0 pkt), poprawnie wyłania WSZYSTKICH remisujących na maksimum (także przy samych zerach) | "Wygląda dobrze dla typujących" — trudniejszy przypadek to brak typu i remis wieloosobowy | Zapytanie/funkcja agregująca punkty; kryterium "kto jest uprawniony" | integration | Testowanie tylko scenariusza "jeden jasny zwycięzca" |
| #4 | Każda trasa/endpoint admina odrzuca sesję User (401/403), nie tylko chowa link w UI | "Prefiks trasy w middleware wystarczy" — nowy endpoint może zostać pominięty przez listę prefiksów | Pełna lista tras/endpointów admina; mechanizm bramkowania per-endpoint (middleware vs `requireRole`) | integration/contract | Testowanie tylko "Admin może X" bez równoległego "User nie może X" |
| #5 | Aktywna sesja dezaktywowanego konta odrzucona przy najbliższym żądaniu, nie tylko blokada nowego logowania | "Dezaktywacja wiersza profilu wystarczy" — sesja/cookie może przetrwać bez jawnego sprawdzenia | Gdzie żyje sprawdzenie `disabled` + wymuszone wylogowanie (middleware) | integration | Testowanie tylko "dezaktywowany nie może się zalogować" |
| #6 | Współbieżne tworzenie dwóch aktywnych turniejów odrzucone; zapis do zamkniętego turnieju odrzucony na dowolnej warstwie | "Sprawdzenie w kodzie aplikacji wystarczy" — realna gwarancja musi trzymać się na poziomie bazy | Dokładna definicja ograniczenia DB (partial unique index); które RLS/kod się na nim opierają | integration | Testowanie tylko przez formularz UI (przycisk już wyłączony) |
| #7 | Funkcja/endpoint rankingu nigdy nie zwraca pełnego e-maila niedopuszczonemu wywołującemu, zwraca dokładnie zamierzone pola | "Obecna maskująca transformacja wystarczy" — przyszła edycja funkcji może przypadkiem cofnąć maskowanie | Dokładna funkcja/endpoint; model autoryzacji wywołania; transformacja maskująca | integration/contract | Snapshot renderowanego HTML zamiast asercji na kształcie zwracanych danych |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Critical-path coverage | Bronić reguły punktacji i blokady czasowej typowania na całej macierzy przypadków | #1, #2 | unit + integration | change opened | `context/changes/testing-critical-path-coverage/` |
| 2 | Access control & session integrity | Uszczelnić trasy/endpointy admina i cykl życia sesji (w tym dezaktywację w trakcie sesji) | #4, #5 | integration/contract | not started | — |
| 3 | Ranking & tournament lifecycle integrity | Poprawność rankingu/zwycięzców przy remisach i braku typów; niezmiennik statusu turnieju na poziomie DB | #3, #6 | integration | not started | — |
| 4 | Data exposure & quality-gates wiring | Brak wycieku pełnego e-maila; testy wpięte jako brama jakości w CI | #7 | integration/contract + gates | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | none yet — see Phase 1 | Nie zainstalowany; natywny dla Vite/Astro, spójny z istniejącym TS/ESLint |
| API mocking | MSW (mock service worker) | none yet — see Phase 1 | Dla zewnętrznych granic HTTP; wywołania Supabase w testach integracyjnych wymagają decyzji test-projekt vs mock (do rozstrzygnięcia w Phase 1) |
| e2e | Playwright | not currently planned | Brak ryzyka w §2 wymagającego pełnego e2e; MCP Playwright dostępny w bieżącej sesji do eksploracji, nieużyty jako formalna warstwa testowa |
| accessibility | none yet | — | Poza zakresem tego rollout — żadne ryzyko §2 tego nie uzasadnia |

**Stack grounding tools (current session):**
- Docs: brak (Context7/dedykowany MCP dokumentacji niedostępny); checked: 2026-09-13
- Search: brak (Exa/dedykowany MCP wyszukiwania niedostępny; dostępny tylko ogólny `fetch_webpage`); checked: 2026-09-13
- Runtime/browser: Playwright dostępny (`run_playwright_code`) — możliwa przyszła warstwa, nieużyta teraz; checked: 2026-09-13
- Provider/platform: GitHub (`github_repo`/`github_text_search`) dostępne — nieużyte teraz; brak Supabase/Cloudflare MCP; checked: 2026-09-13

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI (`.github/workflows/ci.yml`) | required (już wpięte) | dryf składniowy/typów |
| unit + integration | local + CI | required after §3 Phase 1 | regresje logiki (reguła punktacji, blokada czasowa) |
| test step w CI | CI (`.github/workflows/ci.yml`) | required after §3 Phase 4 | brak bramki jakości dla testów w pipeline |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

- TBD — see §3 Phase 1.

### 6.2 Adding an integration test

- TBD — see §3 Phase 1.

### 6.3 Adding an e2e test

- Not currently in rollout scope — żadne ryzyko §2 tego nie wymaga. Re-ocenić przy `--refresh`, jeśli pojawi się ryzyko wymagające pełnego e2e.

### 6.4 Adding a test for a new admin API endpoint

- TBD — see §3 Phase 2 (wzorzec kontroli dostępu Admin/User).

### 6.5 Adding a test for a new Supabase RLS policy / migration

- TBD — see §3 Phase 2 lub Phase 3 (wzorzec testowania niezmienników na poziomie DB).

### 6.6 Per-rollout-phase notes

(Puste — wypełniane po zakończeniu każdej fazy rolloutu.)

## 7. What We Deliberately Don't Test

Brak zebranych wykluczeń — pytanie 5 wywiadu Fazy 2 zostało pominięte
("skip"). Nie wymyślam wykluczeń bez dowodu. Rewizja przy najbliższym
`--refresh` lub gdy z doświadczenia rolloutu wyłoni się naturalny obszar
niskiej wartości testowej.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-13
- Stack versions last verified: 2026-09-13
- AI-native tool references last verified: 2026-09-13

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
