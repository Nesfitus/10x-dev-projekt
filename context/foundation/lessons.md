# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Use GitHub Copilot in VS Code for this project

- **Context**: w ramach pracy z tym projektem
- **Problem**: jeżeli używane jest inne IDE, reguły (np. konfiguracja uprawnień w `.vscode/settings.json`) nie zawsze działają poprawnie
- **Rule**: Zawsze wykorzystuj Github Copilot w ramach tego projektu
- **Applies to**: all

## Weryfikuj przez zdalny Supabase i realny deploy, nie przez lokalnego Dockera

- **Context**: Każda faza /10x-plan lub /10x-implement, w której automatyczna/manualna weryfikacja dotyczy migracji Supabase lub zmian w kodzie stron/API (Astro SSR na Cloudflare Workers).
- **Problem**: To środowisko implementacyjne nie ma dostępnego Dockera, więc `npx supabase start`/`npx supabase db reset` (lokalny stack) nie mogą zostać uruchomione — agent traci czas na próby, zanim odkryje, że projekt ma już zalinkowany zdalny projekt Supabase (`supabase/.temp/project-ref`), ten sam, co produkcja. Analogicznie, zmiany w kodzie (strony/API) są realnie weryfikowalne dopiero po wypchnięciu na `main`, bo Cloudflare Workers Builds robi auto-deploy, a nie ma lokalnego trybu podglądu działającego względem tego samego zdalnego Supabase.
- **Rule**: Nie instaluj Dockera ani nie uruchamiaj lokalnego stacku Supabase. Migracje weryfikuj przez `npx supabase db push` / `npx supabase migration list` na już zalinkowanym zdalnym projekcie. Zmiany w kodzie commituj i pushuj (`git push origin main`), aby wyzwolić auto-deploy Cloudflare Workers Builds — dopiero potem proś użytkownika o manualną weryfikację na żywej, wdrożonej aplikacji, nie na `localhost`.
- **Applies to**: plan, implement

## Komunikuj się w języku polskim

- **Context**: Cała praca nad tym projektem (rozmowa z użytkownikiem, pytania, podsumowania, plany, briefy).
- **Problem**: Domyślny język agenta to angielski, ale właściciel projektu oczekuje komunikacji po polsku — treść PRD/roadmapy też jest po polsku.
- **Rule**: Prowadź całą komunikację z użytkownikiem (pytania, wyjaśnienia, podsumowania) w języku polskim. Nazwy plików, ścieżek, identyfikatorów kodu (zmienne, tabele, endpointy) oraz technicznych komend pozostają bez zmian (angielskie/techniczne, zgodnie z konwencją repo).
- **Applies to**: all

## Wskaż komendy i sekrety potrzebne do publikacji aplikacji na innym komputerze

- **Context**: Faza /10x-plan lub /10x-implement dotycząca wdrożenia/publikacji aplikacji (deploy na Cloudflare Workers) lub przygotowania projektu do uruchomienia na innym komputerze po sklonowaniu repozytorium.
- **Problem**: Agent kończy implementację/plan bez wskazania, jakie zmienne środowiskowe, sekrety (np. SUPABASE_URL, SUPABASE_KEY), migracje czy komendy (npm install, wrangler secret put, supabase link, wrangler deploy) są potrzebne, aby ktoś inny mógł sklonować repozytorium i uruchomić/opublikować aplikację od zera — użytkownik dowiaduje się o brakach dopiero przy realnej próbie uruchomienia na innym komputerze.
- **Rule**: Przy każdej zmianie dotyczącej wdrożenia/publikacji lub kończąc plan/implementację, dopytaj użytkownika o brakujące zmienne środowiskowe i sekrety, a następnie jawnie wypisz pełną, gotową do wykonania listę komend (instalacja zależności, konfiguracja `.env`/`.dev.vars`, `npx supabase link`, `npx wrangler secret put ...`, `npm run build`, `npx wrangler deploy` itd.) potrzebnych, aby aplikacja zadziałała na innym komputerze po sklonowaniu repozytorium z zerowego stanu.
- **Applies to**: all

## Unikaj gołego `<`/`<=` w wyrażeniach `{}` w plikach `.astro`

- **Context**: Implementacja lub edycja dowolnego pliku `.astro` zawierającego logikę JS wewnątrz wyrażeń `{}` w szablonie (np. warunki na podstawie dat/liczb wewnątrz `.map()` lub bezpośrednio w markupie).
- **Problem**: `npm run build` w tym środowisku implementacyjnym zawsze kończy się znanym artefaktem środowiskowym (`write EOF`), więc realny błąd kompilacji Astro da się złapać wyłącznie na żywym buildzie Cloudflare Workers Builds — nigdy lokalnie i nigdy jako błąd TypeScript/lint. Gołe `<` (np. w `x <= now`) wewnątrz wyrażenia `{}` w szablonie `.astro` bywa błędnie odczytane przez kompilator Astro jako początek tagu JSX, co produkuje mylący błąd `[CompilerError] [astro:build] Unable to assign attributes when using <> Fragment shorthand syntax!` wskazujący na zupełnie inny, niepowiązany tag kilka linii dalej (np. `<li>`) — co prowadzi do prób naprawy niewłaściwego miejsca (np. przebudowy ternary, zamiany `<>` na `<Fragment>`), zanim odkryje się prawdziwą przyczynę.
- **Rule**: W plikach `.astro`, wewnątrz wyrażeń `{}` w szablonie, zawsze formułuj porównania dat/liczb tak, by uniknąć znaku `<` — np. `now >= x` zamiast `x <= now`. Jeśli mimo to pojawi się błąd kompilatora Astro o Fragmentach/atrybutach, w pierwszej kolejności sprawdź, czy w zmienionym pliku `.astro` nie ma gołego `<`/`<=` w wyrażeniu `{}`, zanim zaczniesz przebudowywać strukturę JSX. Loguj się w tym celu na dashboard Cloudflare (Workers & Pages → deployment → build log) i poproś użytkownika o wklejenie logu builda, bo lokalne narzędzia (lint/build/get_errors) tego nie wykryją.
- **Applies to**: implement
