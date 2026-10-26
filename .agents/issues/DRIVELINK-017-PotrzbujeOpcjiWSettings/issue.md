---
issueId: "DRIVELINK-017-PotrzbujeOpcjiWSettings"
humanTitle: "Potrzbuje opcji w settings ktora sprawdza czy polacznie dzila; oraz okna do logu gdzie moge kopiwac last log"
issueUrl: ""
createdAt: "2026-10-26T19:18:53Z"
tags: [settings, ui, diagnostics, logging]
---

# Potrzbuje opcji w settings ktora sprawdza czy polacznie dzila; oraz okna do logu gdzie moge kopiwac last log

Potrzebuję opcji w ustawieniach, która sprawdza, czy połączenie działa, oraz okna z logiem, z którego mogę skopiować ostatni log.

## Agent Summary
*(added/updated by agent on resume; user text above remains untouched)*
- Goal: Diagnostyka bez konsoli deweloperskiej (szczególnie na iPhonie): test połączenia w ustawieniach i okno z logiem, z którego można skopiować ostatni log.
- Scope:
  1. **Test connection** (przycisk w sekcji Google Drive), kroki po kolei, każdy ✅/❌ z czasem i przy ❌ komunikatem + wskazówką:
     - Token: obecny i odświeżalny (np. „wygasa za 42 min”)
     - Drive API: `/about` → „Połączono jako j***@…”
     - Folder synchronizacji: istnieje, nie w koszu, liczba plików
     - Changes API: pobranie start page token
     - Bez zapisu pliku testowego na Drive
  2. **Log**:
     - Bufor w pamięci: ostatnie 500 wpisów
     - Każdy sync z nagłówkiem: start, tryb (full scan / incremental / timestamp), statystyki, czas trwania
     - Log ostatniego synca zapisywany do pliku w folderze pluginu (przetrwa restart / ubicie aplikacji przez iOS)
     - Poziom szczegółowości według istniejącego „Debug Level”
     - Rozproszone `console.log` w `sync-engine.ts` i `change-detection.ts` przekierowane do `Logger`, żeby trafiały do bufora
  3. **Okno logu**:
     - Ustawienia → „Show log” oraz komenda „DriveLink: Show log”
     - Przyciski: „Copy last sync”, „Copy all”, „Clear”; przewijane pole monospace
     - Nagłówek: wersja pluginu, platforma (iOS/desktop), czas i wynik ostatniego synca
     - Po nieudanym syncu `Notice` z przyciskiem „Show log” (pokrywa S5 z analizy DRIVELINK-004)
  4. **Redakcja** (zawsze włączona): access/refresh token, client secret, nagłówki `Authorization` → `***`; usunąć logowanie prefiksu tokena (`client.ts`); e-mail skracany do `j***@domena`; ścieżki i nazwy plików bez zmian
- Constraints: Działa na mobile (bez `fs`/Node API — zapis przez `vault.adapter`); kopiowanie przez `navigator.clipboard` z fallbackiem (zaznaczenie tekstu) na iOS; testy jednostkowe dla bufora, redakcji i kroków testu połączenia (fake Drive).
- Success criteria: Na iPhonie test połączenia pokazuje wynik każdego kroku; po nieudanym syncu można jednym przyciskiem otworzyć log i skopiować ostatni sync; log ostatniego synca jest dostępny po restarcie Obsidiana; w skopiowanym logu nie ma tokenów ani sekretów.

# ChangeLog
- 2026-10-26 — Issue created
- 2026-10-26 — Added Agent Summary: test połączenia (wariant b), bufor logu 500 + plik ostatniego synca, okno logu z kopiowaniem, redakcja
- 2026-10-26 — GitHub issue skipped by user
- 2026-10-26 — Triggered scenario via /issue
- 2026-10-26 — Implemented: Logger buffer (500) + sync sections + last-sync.log, redaction, LogModal (copy last sync / all / clear), Test connection (4 steps), failure Notice with Show log; console.* in sync path routed to Logger; 14 new tests
