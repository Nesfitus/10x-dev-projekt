# Model ról Admin/User — fundament kontroli dostępu — Plan Brief

> Full plan: `context/changes/role-based-access-foundation/plan.md`

## What & Why

Budujemy fundament kontroli dostępu wg roli (Admin/User) — dziś całkowicie nieobecny w projekcie. Bez niego żaden kolejny plasterek MVP (zarządzanie turniejem, typowanie, punktacja) nie może zostać poprawnie zbudowany ani zweryfikowany, bo wszystkie zakładają rozróżnienie, kto jest Adminem, a kto Userem.

## Starting Point

Uwierzytelnianie (logowanie/rejestracja/wylogowanie) już działa przez Supabase Auth, a middleware (`src/middleware.ts`) już chroni `/dashboard` dla dowolnego zalogowanego użytkownika. Baza danych jest jednak zupełnie pusta — brak migracji, brak typów domenowych — i publiczna samorejestracja jest wciąż w pełni aktywna, mimo że koliduje z wymaganiami PRD (konta ma zakładać wyłącznie Admin).

## Desired End State

Istnieje tabela `profiles` z rolą każdego użytkownika, chroniona politykami RLS. Dokładnie jedno konto ma rolę Admina, jedno — rolę User (obie założone ręcznie w ramach tej zmiany). Middleware i helper API potrafią sprawdzić rolę i zablokować dostęp niezgodny z rolą; tymczasowa strona `/admin` to widocznie demonstruje. Publiczna rejestracja jest zamknięta — zarówno lokalnie, jak i na żywym środowisku produkcyjnym.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Gdzie żyje rola | Tabela `profiles` (nie custom JWT claim) | Prostszy model, standardowy wzorzec Supabase, łatwy do rozszerzenia | Plan |
| Bootstrap pierwszego Admina | Ręczna rejestracja + promocja SQL po fakcie | Zero dodatkowego UI, zgodne z FR-001 ("konto zakładane poza samodzielną rejestracją") | Plan |
| Kiedy wyłączyć self-signup | Od razu w tym fundamencie (Faza 4) | Zero okna czasowego, w którym ktokolwiek z zewnątrz mógłby się zarejestrować | Plan |
| Zakres RLS | Tylko dla `profiles`, bez ogólnego wzorca na przyszłość | Zgodne z zasadą progressive disclosure z roadmapy — przyszłe tabele dostaną własne polityki | Plan |
| Kształt guarda | Middleware (role w `context.locals`) + jawny helper `requireRole()` dla API | Spójne z istniejącym wzorcem middleware dla `user` | Plan |
| Brak profilu = ? | Fail-closed — traktowane jak brak dostępu | Bezpieczne domyślnie, zgodne z Guardrails PRD | Plan |
| Weryfikacja ścieżki User | Migracja + trigger tworzą też drugie, przykładowe konto User | Można od razu ręcznie zweryfikować obie role, bez czekania na S-02 | Plan |
| Dowód działania w przeglądarce | Tymczasowa strona `/admin`, zastąpiona w S-01 | Namacalny dowód działania guarda bez czekania na S-01 | Plan |

## Scope

**In scope:**
- Tabela `profiles` + trigger auto-tworzący profil + polityki RLS
- Ręczny bootstrap jednego konta Admin i jednego konta User
- Middleware rozszerzone o `context.locals.role`, helper `requireRole()` dla API
- Tymczasowa strona demo `/admin`
- Wyłączenie publicznej samorejestracji (lokalnie i na żywo)

**Out of scope:**
- UI do dodawania kolejnych Userów przez Admina (to S-02)
- Ogólny, reużywalny wzorzec RLS dla przyszłych tabel domenowych
- Framework testowy (projekt go dziś nie ma; poza zakresem tego fundamentu)

## Architecture / Approach

Rola żyje w tabeli `profiles` (1:1 z `auth.users`), wypełnianej automatycznie przez trigger przy każdej rejestracji (domyślnie `user`). RLS pozwala użytkownikowi widzieć własny profil, a Adminowi — wszystkie (przez funkcję `is_admin()` z `SECURITY DEFINER`, unikającą rekurencji RLS). Middleware dociąga rolę obok istniejącego usera; helper `requireRole()` daje endpointom API jawny, jednolinijkowy sposób wymuszenia roli.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Model danych | Tabela `profiles`, trigger, RLS bez rekurencji | Błąd w SECURITY DEFINER powodujący rekurencję RLS |
| 2. Bootstrap kont | Jedno konto Admin, jedno User, obie role potwierdzone | Pominięcie promocji na żywym (nie tylko lokalnym) projekcie |
| 3. Guard + demo | `context.locals.role`, `requireRole()`, strona `/admin` | Błędna gałąź przekierowania dla roli innej niż wymagana |
| 4. Zamknięcie rejestracji | Self-signup wyłączony lokalnie i na żywo | `config.toml` nie wpływa na żywy projekt — łatwo pominąć krok w dashboardzie |

**Prerequisites:** Brak — to pierwszy fundament kamienia milowego M-1, brak zależności od innych zmian.
**Estimated effort:** 4 fazy, sekwencyjne (każda zależy od poprzedniej); brak równoległości między fazami tej zmiany.

## Open Risks & Assumptions

- Zakłada się, że wybrany na potrzeby Admina adres e-mail jest realnie dostępny do rejestracji na żywym projekcie Supabase (nie jest to sprawdzane automatycznie).
- Pominięcie kroku wyłączenia rejestracji w dashboardzie Supabase (nie tylko w `config.toml`) zostawiłoby realną lukę bezpieczeństwa na produkcji — wymaga świadomej, ręcznej weryfikacji.

## Success Criteria (Summary)

- Dokładnie dwa konta istnieją (Admin, User) z poprawnie przypisanymi rolami, zweryfikowane zarówno lokalnie, jak i na żywym środowisku.
- Strona `/admin` poprawnie odróżnia wszystkie trzy przypadki dostępu (Admin/User/niezalogowany).
- Nikt nowy nie może się samodzielnie zarejestrować — ani lokalnie, ani na żywo.
