---
change_id: testing-critical-path-coverage
title: Critical-path coverage: scoring rule (3/1/0) and match-lock timing tests
status: implementing
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Critical-path coverage". Risks covered: #1 (regula punktacji 3/1/0), #2 (blokada czasowa typowania). Test types planned: unit + integration. Risk response intent: - #1: prove pelna macierz predykcja x wynik (w tym remis:remis roznymi wynikami) daje 3/1/0; challenge zalozenie ze "raz przetestowane = generalizuje"; avoid oracle problem (asercja skopiowana z implementacji). - #2: prove zapis po starcie meczu odrzucony na warstwie API/RLS niezaleznie od UI; challenge zalozenie ze "UI chowa formularz = chronione"; avoid testowanie wylacznie przez UI.
