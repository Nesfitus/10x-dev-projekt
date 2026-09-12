---
change_id: admin-enters-result-auto-scoring
title: "Admin wprowadza wynik, system automatycznie nalicza punkty"
status: implemented
created: 2026-09-12
updated: 2026-09-12
roadmap_id: S-05
---

# Change: admin-enters-result-auto-scoring

Plasterek S-05 z `context/foundation/roadmap.md`, kamień milowy M-1 — **gwiazda przewodnia** projektu. Admin ręcznie wprowadza faktyczny wynik spotkania; system natychmiast i automatycznie nalicza Userom punkty według stałej reguły (3 pkt dokładny wynik, 1 pkt trafiony typ/kierunek, 0 pkt brak trafienia). Najbardziej wrażliwa logika biznesowa w produkcie — błąd tutaj narusza wprost Guardrail PRD "poprawność liczenia punktów".

See `plan.md` for the detailed implementation plan and `plan-brief.md` for a two-page summary.
