# Admin zarządza użytkownikami — Plan Brief

> Full plan: `context/changes/admin-manages-users/plan.md`

## What & Why

Admin musi móc dodawać konta Userów do systemu (FR-003) — jedyna droga zakładania kont, skoro F-01 już zamknęło publiczną samorejestrację (FR-002). Admin może też dezaktywować konta Userów, którzy mieli odejść z zabawy, bez potrzeby ręcznego SQL w Supabase Studio.

## Starting Point

F-01 dostarczył role Admin/User, `requireRole()`, RLS oparte o `is_admin()`, i całkowicie zamknął self-signup (formularz, endpoint, config, dashboard Supabase). S-01 ustaliło wzorzec UI panelu admina (lista + formularz, natywny POST + redirect). Obecny klucz Supabase (`anon`) nie ma jednak uprawnień do tworzenia/listowania kont przez Admin API — potrzebny jest nowy sekret `service_role`.

## Desired End State

Admin na `/admin/users` widzi listę wszystkich kont (e-mail, rola, status) i formularz dodania nowego Usera (e-mail + hasło ustawiane przez Admina). Nowy User loguje się od razu, bez żadnego e-maila. Admin może dezaktywować dowolne konto `user` (nigdy `admin`) — dezaktywowany User traci dostęp natychmiast przy kolejnym żądaniu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Metoda nadania dostępu Userowi | Admin ręcznie ustawia hasło, przekazuje poza aplikacją | Unika znanego limitu 2 e-maile/godz. napotkanego w F-01 | Plan |
| Wymuszona zmiana hasła przy 1. logowaniu | Nie | Brak takiego wymogu w PRD; zero dodatkowej logiki/strony | Plan |
| Źródło listy użytkowników (e-maile) | Żywe zapytanie `auth.admin.listUsers()` (service-role) | Brak duplikacji danych, `profiles` nie musi przechowywać e-maila | Plan |
| Zakres akcji Admina | Dodawanie + dezaktywacja (nie fizyczne usuwanie) | FR-003 wprost wymaga tylko dodawania; dezaktywacja to bezpieczny dodatek | Plan |
| Kogo można dezaktywować | Tylko rolę `user`, nigdy `admin` | Zabezpiecza przed usunięciem jedynego konta Admina (FR-001) | Plan |
| Charakter dezaktywacji | Miękka (`profiles.disabled`), odwracalna | Zachowuje historię, przygotowuje grunt pod przyszłe S-04 | Plan |
| Potwierdzenie przed dezaktywacją | Tak, natywne `confirm()` przeglądarki | Minimalna ochrona przed przypadkowym kliknięciem, zero React | Plan |
| Formularz dodawania Usera | Nowy natywny Astro, nie reużyty `SignUpForm.tsx` | Spójność ze wzorcem panelu admina z S-01; `SignUpForm.tsx` zaprojektowany dla self-signup | Plan |
| Minimalna długość hasła | 6 znaków | Spójne z istniejącym `SignUpForm.tsx` (`MIN_PASSWORD_LENGTH`) | Plan |

## Scope

**In scope:**
- Migracja: kolumna `disabled` w `profiles`
- Nowy sekret `SUPABASE_SERVICE_ROLE_KEY` + klient `createAdminClient()` + aktualizacja `deploy-plan.md`
- Middleware: egzekwowanie dezaktywacji (wylogowanie + komunikat)
- `POST /api/admin/users` (tworzenie) + `POST /api/admin/users/[id]/disable` (dezaktywacja)
- `/admin/users` (lista + formularz + akcja dezaktywacji), link z hubu `/admin`

**Out of scope:**
- Fizyczne usuwanie kont, edycja e-maila/hasła istniejącego konta
- Zmiana roli (promocja do Admina pozostaje ręczną operacją SQL)
- Wymuszona zmiana hasła, e-maile/powiadomienia do nowych Userów
- Paginacja listy użytkowników

## Architecture / Approach

Nowy klient `service_role` (`createAdminClient()`) obsługuje operacje niedostępne dla klucza `anon`: tworzenie konta (`auth.admin.createUser` z `email_confirm: true`, pomijając e-mail), listowanie e-maili (`auth.admin.listUsers`), i zapis `profiles.disabled` (bypass RLS, bo brak polityki UPDATE). Middleware dogrywa `disabled` do istniejącego odczytu `role` i wymusza wylogowanie, gdy flaga jest ustawiona. UI podąża dokładnie za wzorcem `/admin/tournaments` z S-01.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migracja | Kolumna `disabled` w `profiles` | Brak — proste, addytywne `ADD COLUMN` |
| 2. Sekret + klient admin | `SUPABASE_SERVICE_ROLE_KEY`, `createAdminClient()`, `deploy-plan.md` | Pominięcie kroku `wrangler secret put` na żywym Workerze |
| 3. Middleware | Egzekwowanie dezaktywacji (wylogowanie) | Zapomnienie o odczycie `disabled` obok `role` w jednym zapytaniu |
| 4. Endpointy API | Tworzenie + dezaktywacja konta | Brak blokady dezaktywacji roli `admin` |
| 5. UI Admina | `/admin/users` (lista + formularz + akcja) | Przycisk dezaktywacji widoczny przy koncie `admin` |

**Prerequisites:** F-01 (role-based-access-foundation) — już zaimplementowany.
**Estimated effort:** 5 faz, sekwencyjne (Faza 3 zależy tylko od Fazy 1; Faza 4 zależy od Fazy 1 i 2).

## Open Risks & Assumptions

- Zakłada się, że `supabase-js` zwraca rozpoznawalny kod błędu (`error.code === "email_exists"`) przy próbie utworzenia konta z już istniejącym e-mailem — do zweryfikowania manualnie w Fazie 4.
- Hasło ustawione przez Admina przechodzi przez jego ręce poza aplikacją (ustnie, Slack) — zaakceptowane ryzyko dla małego, zaufanego biura; nie nadaje się do skalowania poza ten kontekst.

## Success Criteria (Summary)

- Admin może dodać nowego Usera (e-mail + hasło) i ten User loguje się od razu, bez żadnego e-maila.
- Admin może dezaktywować dowolne konto `user` (nigdy `admin`) — dezaktywowany User traci dostęp natychmiast.
- Nowy sekret `service_role` jest skonfigurowany i udokumentowany zarówno lokalnie, jak i na żywym Workerze.
