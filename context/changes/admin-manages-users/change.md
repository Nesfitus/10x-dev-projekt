---
change_id: admin-manages-users
title: "Admin zarządza użytkownikami (bez samorejestracji)"
status: implemented
created: 2026-09-11
updated: 2026-09-11
roadmap_id: S-02
---

# Change: admin-manages-users

Plasterek S-02 z `context/foundation/roadmap.md`, kamień milowy M-1. Admin dodaje nowe konta Userów (ręcznie ustawione hasło, bez samorejestracji ani e-maila) i dezaktywuje istniejące konta Userów (nigdy Admina). Wymaga nowego sekretu `service_role` Supabase do wywołań Admin API.

See `plan.md` for the detailed implementation plan and `plan-brief.md` for a two-page summary.
