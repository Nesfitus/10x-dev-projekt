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
