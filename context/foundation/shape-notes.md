---
project: "Typer Sportowy"
context_type: greenfield
created: 2026-09-07
updated: 2026-09-07
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "kategoria bólu"
      decision: "utrudnienie w przepływie pracy (workflow friction)"
    - topic: "insight / przewaga nad status quo"
      decision: "automatyczne liczenie punktów wg konfigurowalnego typu rywalizacji + docelowo wspólny ranking wielu turniejów, bez kosztu płatnego narzędzia"
    - topic: "zakres primary persony"
      decision: "pracownicy jednej organizacji/biura (nie wiele organizacji, nie ogólna nisza hobbystyczna)"
    - topic: "sposób logowania"
      decision: "email + hasło"
    - topic: "model ról"
      decision: "dokładnie dwie role, płaski model: Admin i User"
    - topic: "zakres MVP / typy rywalizacji"
      decision: "scoped down — 1 zaszyty na sztywno sposób liczenia punktów (3/1/0) zamiast w pełni konfigurowalnych typów rywalizacji; 3 tygodnie pracy wieczorno-weekendowej"
    - topic: "runda Sokratesa FR-001..FR-011"
      decision: "brak samorejestracji Admina i Usera (konta zakłada Admin/konfiguracja); jeden aktywny turniej naraz; wymagany termin spotkania; blokada typowania w momencie startu; dodano FR-011 (jawne zamknięcie turnieju); pełny ranking widoczny na bieżąco; remis (ex aequo) akceptowalny"
  frs_drafted: 11
  quality_check_status: accepted
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
---

# Shape Notes

## Vision & Problem Statement

Pracownicy jednej firmy/biura, którzy dla zabawy typują wyniki spotkań w trakcie trwania turniejów sportowych (np. mistrzostw piłkarskich), dziś robią to ręcznie w arkuszu kalkulacyjnym (Excel/Google Sheets) — ręcznie zbierając typy i ręcznie licząc punkty według wybranego sposobu punktacji. Jest to czasochłonne i podatne na błędy, a staje się jeszcze bardziej uciążliwe, gdy różne turnieje wymagają różnych sposobów liczenia punktów.

Kluczowe spostrzeżenie: to nieformalna, biurowa zabawa bez budżetu na płatne narzędzia — firma nie planuje jej kupować, a użytkownicy nie chcą płacić za coś, co jest tylko rozrywką. Prosta aplikacja, która automatycznie liczy punkty według konfigurowalnego typu rywalizacji i docelowo pozwala budować wspólny ranking między wieloma turniejami, daje wartość, której arkusz kalkulacyjny wygodnie nie oferuje, bez kosztu gotowych płatnych rozwiązań.

**Kategoria bólu:** utrudnienie w przepływie pracy (workflow friction) — da się to zrobić w Excelu, ale jest to męczące i podatne na błędy.

## User & Persona

**Primary persona:** Pracownik firmy/biura (User) — bierze udział w biurowej zabawie, typuje wyniki spotkań (elementów turnieju) i śledzi swoją pozycję w rankingu.

### Secondary persona

Admin (organizator zabawy) — pracownik biura, który zakłada turnieje, dodaje użytkowników, wybiera typ rywalizacji (sposób liczenia punktów) i ręcznie wprowadza wyniki spotkań.

**Zakres person (scope):** Konkretna rola/grupa w jednej organizacji — pracownicy jednego biura/firmy grają razem (nie wiele niezależnych organizacji, nie ogólna nisza hobbystyczna — na start).

## Access Control

Logowanie za pomocą email + hasło. Dokładnie dwie role, płaski model:

- **Admin** — zakłada turnieje, wybiera typ rywalizacji (sposób liczenia punktów), dodaje/zarządza użytkownikami, ręcznie wprowadza wyniki spotkań, może wyłonić zwycięzców i zamknąć turniej.
- **User** — typuje wyniki spotkań (elementów turnieju), widzi swoje punkty i ranking.

Brak dodatkowych ról (np. moderator, tylko-podgląd) w MVP — najmniejszy model dostępu, który wystarcza do działania produktu.

## Success Criteria

### Primary
- Działający przepływ end-to-end: admin dodaje użytkowników i zakłada turniej (niezależnie od siebie), dodaje spotkania do turnieju, użytkownicy typują wyniki spotkań, admin ręcznie wprowadza faktyczny wynik, system automatycznie liczy punkty według jednego, zaszytego na sztywno sposobu punktacji (3 pkt za trafiony dokładny wynik, 1 pkt za trafiony typ wyniku, 0 pkt za brak trafienia), a po zakończeniu turnieju system pokazuje ranking i wyłania zwycięzcę.

### Secondary
- Ładna, czytelna prezentacja rankingu (nie tylko surowe dane).
- Powiadomienia o nowych turniejach lub zbliżających się meczach/zawodach.
- Historia typowań użytkownika i analiza tego, jak typowali inni użytkownicy.

### Guardrails
- Poprawność liczenia punktów — punkty muszą być naliczane zgodnie z ustalonym sposobem punktacji bez pomyłek.
- Logowanie musi działać niezawodnie (email + hasło).
- Dostęp do turniejów musi być poprawnie ograniczony zgodnie z rolą (Admin/User) i przypisaniem użytkownika do turnieju.

## Functional Requirements

### Uwierzytelnianie
- FR-001: System ma jednego predefiniowanego Admina (konto zakładane poza samodzielną rejestracją, np. przy wdrożeniu/konfiguracji); Admin loguje się email + hasło. Priority: must-have
  > Socrates: Counter-argument considered: "dla jednej firmy wystarczy jeden predefiniowany admin — rejestracja admina w ogóle niepotrzebna w MVP". Resolution: przyjęto — brak samodzielnej rejestracji Admina w MVP.
- FR-002: User loguje się do systemu (email + hasło) na koncie założonym przez Admina — bez samodzielnej rejestracji. Priority: must-have
  > Socrates: Counter-argument considered: "otwarta samorejestracja pozwoliłaby obcym osobom spoza biura dołączyć do zabawy". Resolution: przyjęto — brak samorejestracji Usera; konto tworzy wyłącznie Admin (patrz FR-003).

### Zarządzanie turniejem
- FR-003: Admin może dodawać użytkowników do systemu. Priority: must-have
  > Socrates: Counter-argument considered: "ręczne dodawanie userów przez admina nie skaluje się przy większej liczbie osób w biurze". Resolution: zaakceptowane ograniczenie na MVP — skala pojedynczego biura jest mała, ręczne dodawanie wystarcza; masowe zapraszanie to możliwe rozszerzenie na przyszłość.
- FR-004: Admin może założyć nowy turniej. W MVP obsługiwany jest jeden aktywny turniej naraz; kolejne turnieje mogą być tworzone sekwencyjnie, każdy zachowany jako osobny rekord z myślą o przyszłym wspólnym rankingu. Priority: must-have
  > Socrates: Counter-argument considered: "jeden turniej naraz może wystarczyć na MVP — wielo-turniejowość niepotrzebnie komplikuje". Resolution: przyjęte — MVP ogranicza się do jednego aktywnego turnieju naraz, ale dane każdego turnieju są przechowywane niezależnie, by nie blokować przyszłego wspólnego rankingu.
- FR-005: Admin może dodać spotkania (elementy turnieju) do turnieju wraz z terminem (data i godzina) rozegrania. Priority: must-have
  > Socrates: Counter-argument considered: "bez zdefiniowanego terminu spotkania system nie wie, kiedy zablokować typowanie". Resolution: przyjęte — termin (data/godzina) spotkania jest wymaganym polem przy dodawaniu spotkania.

### Typowanie i wyniki
- FR-006: User może wytypować wynik spotkania do momentu jego rozpoczęcia (wg terminu z FR-005); brak wytypowania traktowany jest jak nietrafiony typ (0 punktów). Priority: must-have
  > Socrates: Counter-argument considered: "brak jasnego momentu blokady typowania może powodować spory" oraz "brak typu wpływa niejasno na punktację". Resolution: oba przyjęte — typowanie blokowane dokładnie w momencie startu spotkania (godzina z FR-005); brak typu = 0 punktów, tak jak nietrafiony typ.
- FR-007: Admin może ręcznie wprowadzić faktyczny wynik spotkania. Priority: must-have
  > Socrates: Counter-argument considered: "ręczne wprowadzanie jest podatne na pomyłki; brak możliwości korekty błędnego wyniku to ryzyko". Resolution: zaakceptowane na MVP bez przekombinowywania — możliwość korekty wyniku odłożona jako potencjalne rozszerzenie po MVP.

### Punktacja i ranking
- FR-008: System automatycznie nalicza punkty użytkownikowi za typ wg stałej reguły (3 pkt za trafiony dokładny wynik, 1 pkt za trafiony typ wyniku, 0 pkt za brak trafienia). Priority: must-have
  > Socrates: Counter-argument considered: "zaszyta na sztywno reguła utrudni w przyszłości dodanie innych sposobów punktacji bez zmiany kodu". Resolution: przyjęte świadomie jako dług techniczny MVP — konfigurowalność sposobów punktacji to celowo odłożona funkcja post-MVP (patrz Vision).
- FR-009: System wyłania zwycięzcę/zwycięzców i buduje ranking po zakończeniu turnieju. Priority: must-have
  > Socrates: Counter-argument considered: "brak jawnego kroku zamknięcia turnieju przez admina — kto decyduje, że turniej się zakończył?" oraz "remis punktowy (ex aequo) między userami". Resolution: dodano FR-011 (jawne zamknięcie turnieju przez Admina) jako wyzwalacz wyłonienia zwycięzcy; remis (ex aequo) jest akceptowalnym wynikiem — możliwych jest kilku zwycięzców.
- FR-010: User może zobaczyć pełny ranking (wszystkich uczestników) i swoje punkty w turnieju na bieżąco, w trakcie jego trwania. Priority: must-have
  > Socrates: Counter-argument considered: "ranking powinien być widoczny dopiero po zakończeniu turnieju, żeby nie zdradzać przewagi w trakcie typowania" vs "user powinien widzieć pełny ranking wszystkich w trakcie trwania". Resolution: przyjęto drugą opcję — pełny ranking widoczny na bieżąco, nie tylko po zakończeniu.
- FR-011: Admin może jawnie zakończyć (zamknąć) turniej, co wyzwala wyłonienie zwycięzcy/zwycięzców (dopuszczalny remis / ex aequo) i finalizuje ranking. Priority: must-have

## User Stories

### US-01: User typuje wynik spotkania i otrzymuje punkty po jego rozegraniu

**PL:**
- **Given** zalogowany User przypisany do turnieju, z otwartym do typowania spotkaniem
- **When** wpisze swój typ wyniku przed rozpoczęciem spotkania, a Admin później wprowadzi faktyczny wynik
- **Then** system automatycznie naliczy Userowi punkty zgodnie z regułą punktacji (3 pkt za trafiony dokładny wynik, 1 pkt za trafiony typ wyniku, 0 pkt za brak trafienia) i zaktualizuje ranking turnieju

**EN:**
- **Given** a logged-in User assigned to a tournament, with a match open for predictions
- **When** they submit their result prediction before the match starts, and the Admin later enters the actual result
- **Then** the system automatically awards the User points according to the scoring rule (3 pts for an exact score match, 1 pt for a correct outcome type, 0 pts for no match) and updates the tournament ranking

#### Acceptance Criteria
- Typ musi zostać zablokowany do edycji po rozpoczęciu spotkania (nie można typować po fakcie).
- Punkty muszą zostać naliczone automatycznie natychmiast po wprowadzeniu przez Admina faktycznego wyniku.
- Ranking turnieju musi odzwierciedlać zaktualizowaną liczbę punktów każdego użytkownika bez ręcznej interwencji.

## Business Logic

Aplikacja automatycznie ocenia trafność typu wyniku spotkania sportowego wpisanego przez użytkownika i przyznaje mu punkty według stałej skali: najwięcej za dokładne trafienie wyniku, mniej za trafienie samego typu rozstrzygnięcia (wygrana/remis/przegrana), zero za brak trafienia.

Regułą rządzą dwa wejścia — typ wyniku podany przez użytkownika przed spotkaniem oraz faktyczny wynik wprowadzony przez admina po spotkaniu; wyjściem jest liczba punktów przypisana użytkownikowi, widoczna natychmiast po wprowadzeniu wyniku oraz odzwierciedlona w bieżącym rankingu turnieju.

## Non-Functional Requirements

- Dane typów i wyników spotkań są przechowywane co najmniej 4 lata, by wspierać przyszły wspólny ranking między turniejami.
- Produkt jest w pełni użyteczny w przeglądarce internetowej i czytelnie skaluje się (responsywny układ) na ekranie telefonu komórkowego.
- Produkt płynnie obsługuje skalę pojedynczego biura — małą liczbę jednocześnie aktywnych użytkowników (rząd dziesiątek) bez degradacji działania.
- Zaktualizowany ranking i naliczone punkty są widoczne dla użytkownika w ciągu kilku sekund od wprowadzenia przez Admina faktycznego wyniku spotkania.
- Typ wyniku wpisany przez jednego użytkownika pozostaje niewidoczny dla innych użytkowników przed rozpoczęciem spotkania.

## Non-Goals

- Nie budujemy w pełni konfigurowalnych typów rywalizacji/sposobów punktacji — MVP ma 1 zaszyty na sztywno sposób liczenia punktów (3/1/0).
- Nie integrujemy się automatycznie z zewnętrznym API wyników sportowych — MVP ma wyłącznie ręczne wprowadzanie wyników przez Admina.
- Nie budujemy wspólnego rankingu między wieloma turniejami — w MVP turnieje są od siebie niezależne.
- Nie udostępniamy samodzielnej rejestracji użytkowników ani administratorów — konta zakłada wyłącznie Admin / proces konfiguracyjny.
- Nie udostępniamy możliwości korekty raz wprowadzonego wyniku spotkania.
