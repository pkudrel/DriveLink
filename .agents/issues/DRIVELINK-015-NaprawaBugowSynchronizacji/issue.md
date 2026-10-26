---
issueId: "DRIVELINK-015-NaprawaBugowSynchronizacji"
humanTitle: "Naprawa bugow synchronizacji"
issueUrl: ""
createdAt: "2026-10-26T17:48:17Z"
tags: [sync, bugfix, data-loss, storage]
---

# Naprawa bugow synchronizacji

Naprawa błędów z analizy DRIVELINK-004, zaczynając od K2.

Źródło: `.agents/issues/DRIVELINK-004-ZrobAnalizeProjektu/analysis.md`

## Agent Summary
*(added/updated by agent on resume; user text above remains untouched)*
- Goal: Usunąć błędy synchronizacji grożące utratą lub duplikacją danych (K1–K4, W1–W6 z analizy DRIVELINK-004).
- Scope (kolejność):
  1. K2 — rozdzielić storage `data.json` (ustawienia / indeks / tokeny), serializowany zapis; `saveSettings` nie może nadpisywać indeksu ani tokenów
  2. K1, W5, S8, W6 — jawny tryb delta vs snapshot; `deletedRemote` tylko z pełnego skanu lub `removed`/`trashed`; page token zapisywany po udanym syncu
  3. W3 — kosz zamiast trwałego usuwania (Drive `trashed: true`, lokalnie `trash`)
  4. K4 — ograniczenie zmian z Changes API do folderu synchronizacji
  5. W1, W4 — poprawny glob (escape przed podstawieniem) i semantyka filtrów (odfiltrowany ≠ usunięty)
  6. K3 — prawdziwe rozwiązywanie konfliktów (pobranie wersji zdalnej, `md5Checksum`), bez nadpisywania zdalnej wersji
  7. W2 — zachowanie struktury folderów przy uploadzie
- Constraints: Każdy krok osobno, z testem jednostkowym dla zmienionej logiki (projekt nie ma jeszcze testów — dodać framework). Zachować kompatybilność z istniejącym `data.json` (migracja). Średnie/niskie poza zakresem, chyba że blokują powyższe.
- Success criteria: Po restarcie Obsidiana indeks i tokeny są zachowane; sync bez zmian na Drive nie usuwa żadnego pliku; zmiana filtrów nie usuwa plików z Drive; konflikt zachowuje obie wersje; struktura folderów taka sama na Drive i w vaulcie; testy przechodzą.

# ChangeLog
- 2026-10-26 — Issue created
- 2026-10-26 — Added Agent Summary from DRIVELINK-004 analysis
- 2026-10-26 — GitHub issue not created: token lacks Issues write (createIssue: Resource not accessible by integration)
- 2026-10-26 — Triggered scenario via /issue
- 2026-10-26 — K2 done: serialized data.json writes (updateData), saveSettings writes settings keys only; test runner (node:test + esbuild) with 5 tests
- 2026-10-26 — K1/W5/S8/W6 + W3 done: delta vs full listing (RemoteScope), token committed after successful sync, full scan when no usable token, fast sync walks all subfolders, trash instead of delete; 11 new tests
- 2026-10-26 — K4 done: Changes API results limited to the sync folder (resolveFolderPath with per-sync cache); files moved out are treated as removed; 4 new tests
