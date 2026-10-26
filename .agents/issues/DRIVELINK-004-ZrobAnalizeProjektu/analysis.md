# DRIVELINK-004 — Analiza projektu i bugi

Data: 2026-10-26 · Zakres: cały projekt, priorytet: logika synchronizacji · Tryb: tylko analiza, bez zmian w kodzie.

## Podsumowanie

Synchronizacja w trybie domyślnym (`syncType: 'two-way'`) **nie jest bezpieczna dla danych**. Cztery błędy krytyczne mogą
skasować lokalne notatki, zduplikować pliki na Drive, nadpisać zdalne zmiany albo zaimportować do vaulta pliki z całego
Google Drive. Większość z nich ma wspólny korzeń: `compareWithRemoteFiles` zakłada, że dostaje **pełną** listę plików
zdalnych, a silnik w większości ścieżek (Changes API, fast-timestamp, "no changes") podaje listę **częściową**.

Stan techniczny: `tsc --noEmit` przechodzi, ale `tsconfig` nie jest strict, w projekcie nie ma żadnych testów,
a rozwiązywanie konfliktów to wciąż kod-placeholder ("In a real implementation...").

| Ważność | Liczba |
|---|---|
| Krytyczne | 4 |
| Wysokie | 6 |
| Średnie | 8 |
| Niskie | 8 |

---

## Krytyczne

### K1. Częściowa lista plików zdalnych → masowe usuwanie plików lokalnych
- **Gdzie:** `src/sync/index-manager.ts:305-313`, `src/sync/sync-engine.ts:352-361`, `:331-336`, `:315-320`, `:399-404`, `:743-761`
- **Problem:** `compareWithRemoteFiles` oznacza jako `deletedRemote` każdy plik z indeksu, którego `driveId` nie ma
  w `remoteFiles`. Ale `getRemoteFiles` zwraca pełną listę tylko przy pełnym skanie. Przy Changes API zwraca tylko
  zmienione pliki (`getFilesFromChanges`), przy "no changes" i "bootstrap-skipped" zwraca `[]`, a przy fast-timestamp
  tylko pliki zmienione od `lastSyncTime`. `handleDeletions` następnie wykonuje `vault.delete()` dla każdego takiego pliku.
- **Scenariusz:** sync #1 (pełny skan) zapisuje 100 plików w indeksie. Sync #2 w tej samej sesji: Changes API nie
  widzi zmian, więc `allFiles = []`. Wszystkie 100 plików trafia do `deletedRemote`, `totalOps = 100`, plugin
  usuwa 100 lokalnych notatek. Plików nie da się też odzyskać kolejnym syncem: w trybie przyrostowym nie są
  listowane, więc nie wracają jako `newRemote`.
- **Poprawka:** rozróżnić tryb "pełny snapshot" i "delta". `deletedRemote` liczyć **tylko** z pełnego skanu albo
  z jawnych `change.removed`/`trashed` w Changes API. W trybie delta pliki nieobecne w liście traktować jako niezmienione.

### K2. `saveSettings()` nadpisuje cały `data.json` stanem z chwili startu (indeks i tokeny)
- **Gdzie:** `src/main.ts:73`, `:77`; `src/sync/index-manager.ts:101-110`; `src/auth/token-manager.ts:225-233`;
  wywołania `saveSettings` m.in. w `sync-engine.ts:240`, `change-detection.ts:500`
- **Problem:** `loadSettings` robi `Object.assign({}, DEFAULT_SETTINGS, await this.loadData())`, więc `this.settings`
  zawiera też klucze `drivelink-file-index` i `drivelink-tokens` z momentu startu (albo nie zawiera ich wcale).
  `saveSettings` zapisuje `this.settings` w całości. Każdy zapis ustawień (koniec synca, zapis page tokena, każda
  zmiana w ustawieniach UI) cofa więc indeks i tokeny do stanu ze startu albo je kasuje.
- **Scenariusz:**
  1. Świeża instalacja. Sync wgrywa 50 plików, `saveIndex` je zapisuje. Na końcu `saveSettings` zapisuje obiekt bez
     klucza indeksu, więc indeks na dysku znika.
  2. Po restarcie Obsidiana indeks jest pusty. Wszystkie pliki lokalne są `newLocal` i trafiają na Drive jako
     **nowe duplikaty**, a wszystkie zdalne są `newRemote` i nadpisują pliki lokalne.
  3. Każdy restart dokłada kolejną kopię na Drive.
  - Tokeny zaimportowane po starcie znikają z dysku przy pierwszym `saveSettings`, a po `disconnect` mogą wrócić.
- **Poprawka:** trzymać ustawienia pod osobnym kluczem (`data.settings`) albo w `saveSettings` robić
  `loadData()` i merge tylko pól ustawień. Najlepiej jeden moduł storage z serializowanym zapisem.

### K3. Rozwiązywanie konfliktów gubi zdalną wersję
- **Gdzie:** `src/sync/conflict-resolver.ts:100-103`, `:156-178`, `:249-269`; `src/sync/sync-engine.ts:211-217`
- **Problem:** `analyzeConflict` ustawia `remoteModified = Date.now()` (placeholder), więc "last-writer-wins" zawsze
  wybiera "remote wins" i robi kopię lokalną. Plik pozostaje jednak w `localChanges`, więc `uploadLocalChanges`,
  wykonywany **przed** pobieraniem, nadpisuje plik na Drive wersją lokalną. Zdalna edycja przepada bez kopii.
  W trybie `manual` powstaje plik "(remote)" z treścią-placeholderem, a lokalna wersja i tak jest wgrywana.
- **Scenariusz:** ten sam plik edytowany na laptopie i telefonie. Sync na laptopie tworzy `x (conflict ...).md`
  z wersją lokalną, wgrywa wersję lokalną na Drive i pobiera ją z powrotem. Edycja z telefonu znika.
- **Poprawka:** pobrać rzeczywiste metadane i treść zdalną. Zapisać przegraną wersję jako plik konfliktu,
  a pliki z `conflicts` wyłączyć z `localChanges` i `remoteChanges` po rozwiązaniu.

### K4. Changes API nie jest ograniczone do folderu synchronizacji
- **Gdzie:** `src/sync/sync-engine.ts:510-537`, `:542-586`; `src/drive/change-detection.ts:284-301`, `:352-366`
  (nieużywane `filterChangesForFolder`)
- **Problem:** `getAllChangesSinceLastCheck` pobiera zmiany z **całego** Drive użytkownika, a `getFilesFromChanges`
  bierze wszystkie. `resolveFilePathFromParents` dla pliku spoza folderu wspina się aż do korzenia Drive.
- **Scenariusz:** użytkownik edytuje `Faktury/2026.md` w innym miejscu Drive. Sync pobiera go do vaulta jako
  `Faktury/2026.md` (z filtrem `md` przechodzi), a w trybie two-way wraca potem na Drive do folderu vaulta.
- **Poprawka:** filtrować zmiany po przodkach, czyli sprawdzać, czy łańcuch `parents` dochodzi do `driveFolderId`;
  w przeciwnym razie odrzucić zmianę.

---

## Wysokie

### W1. Wzorce ignorowania nigdy nie działają (zweryfikowane uruchomieniem)
- **Gdzie:** `src/utils/file-utils.ts:26-41`
- **Problem:** najpierw `*` zamieniane jest na `[^/]*`, a potem escapowane są `[`, `]`, `^` i `.`. W efekcie
  `*.tmp` daje regex `\[\^/\]*\.tmp`, a `**` daje `\.*`.
- **Dowód:** `matchesPattern('a.tmp','*.tmp')`, `('private/x.md','private/**')` i `('x.lock','*.lock')` zwracają `false`.
- **Skutek:** pliki, które użytkownik oznaczył do pominięcia (np. `private/**`), są wysyłane na Drive.
- **Poprawka:** najpierw escapować znaki specjalne regexu, potem podstawiać glob (albo użyć `minimatch`/`picomatch`).
  Dodać test jednostkowy.

### W2. Upload spłaszcza strukturę folderów
- **Gdzie:** `src/sync/sync-engine.ts:794-815`
- **Problem:** każdy nowy plik trafia do `parentId: driveFolderId` z nazwą `file.name`, bez ścieżki.
- **Scenariusz:** `Projekty/A/notatka.md` i `Archiwum/notatka.md` lądują w korzeniu Drive jako dwa pliki
  `notatka.md`. Drugie urządzenie pobiera oba do `notatka.md` w korzeniu vaulta, więc jeden nadpisuje drugi.
- **Poprawka:** tworzyć brakujące foldery (`createOrFindFolder` z `parentId`), cache'ować `path → folderId`
  i wgrywać do właściwego rodzica.

### W3. Usuwanie jest permanentne (Drive i lokalnie)
- **Gdzie:** `src/drive/client.ts:224-228` (`DELETE /files/{id}` omija kosz), `src/sync/sync-engine.ts:752` (`vault.delete`)
- **Skutek:** w połączeniu z K1 i W4 utraconych plików nie da się odzyskać z kosza.
- **Poprawka:** na Drive `PATCH {trashed: true}`, lokalnie `app.vault.trash(file, true)` albo `fileManager.trashFile`.

### W4. Zmiana filtrów lub ignorowania usuwa pliki z Drive
- **Gdzie:** `src/sync/index-manager.ts:253-258`
- **Problem:** pliki z indeksu, które przestały przechodzić filtr (np. zawężenie rozszerzeń albo nowy wzorzec
  ignorowania), są traktowane jak usunięte lokalnie, a `handleDeletions` usuwa je z Drive (permanentnie, zob. W3).
- **Scenariusz:** użytkownik zmienia rozszerzenia z `md, pdf` na `md`. Następny sync kasuje wszystkie PDF-y z Drive.
- **Poprawka:** `deletedLocal` tylko dla plików, które fizycznie nie istnieją (`vault.getAbstractFileByPath`).
  Pliki odfiltrowane po prostu usuwać z indeksu.

### W5. Page token przesuwany przed zastosowaniem zmian; `removed` ignorowane
- **Gdzie:** `src/drive/change-detection.ts:337-342`; `src/sync/sync-engine.ts:514-518`
- **Problem:** nowy token zapisywany jest już przy odczycie zmian, a nie po udanym syncu. Jeśli download czy upload
  się wywali, kolejny sync tych zmian nie zobaczy. Zmiany `removed: true` są pomijane, więc zdalne usunięcia
  w trybie przyrostowym nigdy nie są propagowane (a K1 usuwa za dużo).
- **Poprawka:** zwracać `newPageToken` i zapisywać go po sukcesie syncu. Mapować `removed` i `file.trashed`
  na `deletedRemote` przez `driveToLocal`.

### W6. Fast-timestamp pomija podfoldery
- **Gdzie:** `src/sync/sync-engine.ts:458-471`, `:489-494`; `src/drive/client.ts:141-143`
- **Problem:** filtr `modifiedTime > lastSyncTime` stosowany jest także do folderów. Folder, którego metadane się
  nie zmieniły, nie jest listowany, więc rekurencja do niego nie wchodzi. Do tego zwracana lista jest częściowa,
  co prowadzi do K1.
- **Poprawka:** listować foldery bez filtra czasu (osobne zapytanie `mimeType = folder`) albo zrezygnować z tej
  strategii na rzecz poprawionego Changes API.

---

## Średnie

### S1. Wykrywanie zmian zdalnych porównuje zegar Drive z zegarem lokalnym
- **Gdzie:** `src/sync/index-manager.ts:317-320` (`remoteModified > indexEntry.lastSyncTime`, gdzie `lastSyncTime = Date.now()`)
- **Skutek:** przy przesunięciu zegara urządzenia pliki są pobierane przy każdym syncu albo zmiany zdalne są gubione.
  Każdy plik edytowany lokalnie w takim oknie staje się fałszywym konfliktem.
- **Poprawka:** zapisywać w indeksie `remoteModifiedTime` i `md5Checksum` z odpowiedzi Drive i porównywać z nimi.

### S2. `lastSyncTime` ustawiany na końcu synca
- **Gdzie:** `src/sync/sync-engine.ts:237-238`
- **Skutek:** pliki zmienione na Drive w trakcie trwania synca nie zostaną złapane przez fast-timestamp.
- **Poprawka:** użyć czasu startu (z marginesem).

### S3. Odświeżanie tokena: wyścigi i kasowanie tokenów przy błędzie przejściowym
- **Gdzie:** `src/auth/token-manager.ts:130-133`, `:180-184`
- **Skutek:** równoległe uploady i downloady (3–5 naraz) mogą jednocześnie wołać `refreshTokens`. Każdy błąd
  (np. chwilowy brak sieci) wywołuje `clearTokens()`, więc użytkownik musi od nowa autoryzować aplikację.
- **Poprawka:** jedna wspólna obietnica refreshu (single-flight). Kasować tokeny tylko przy `invalid_grant`.

### S4. Brak retry/backoff; usunięcie już nieistniejącego pliku blokuje się na stałe
- **Gdzie:** `src/drive/client.ts:101-121`; `src/drive/file-operations.ts` (wszystkie `fetch`); `src/sync/sync-engine.ts:764-777`
- **Skutek:** 429 i 5xx od razu liczą się jako błąd. `deleteFile` dla pliku usuniętego już na Drive daje 404,
  wpis zostaje w indeksie i błąd powtarza się przy każdym syncu.
- **Poprawka:** exponential backoff dla 429 i 5xx; 404 przy delete traktować jako sukces.

### S5. Brak informacji zwrotnej dla użytkownika
- **Gdzie:** `src/main.ts:108-119`
- **Skutek:** `performSync` zwraca `{success:false}` zamiast rzucać wyjątek, a `syncNow` loguje "Sync completed
  successfully" i nie pokazuje `Notice`. Błędy i konflikty są niewidoczne.
- **Poprawka:** sprawdzać `result.success` i pokazywać `Notice` ze statystykami i błędem.

### S6. Pełny zapis `data.json` po każdym pliku, równolegle
- **Gdzie:** `src/sync/index-manager.ts:166-173`, `:101-110`
- **Skutek:** O(n²) I/O przy dużych vaultach. Równoległe pary `loadData` + `saveData` (batch 3–5) ścigają się
  z `storeTokens` i `saveSettings`.
- **Poprawka:** zapisywać indeks raz na batch i raz na końcu, przez serializowaną kolejkę zapisów.

### S7. Reflected XSS na stronie callback
- **Gdzie:** `callback/drive/index.html:188-191`, `:251-258`
- **Problem:** `error` i `error_description` z query stringa trafiają do `innerHTML`.
- **Skutek:** spreparowany link wykonuje JS w domenie strony. Jeśli formularz tokenów działa w tym samym originie,
  JS ma dostęp do `localStorage` z `client_secret` i `refresh_token` (`token-form/script.js:87-89`, `:170-173`).
- **Poprawka:** `textContent` zamiast `innerHTML`.

### S8. Heurystyka bootstrap/full-scan liczy się błędnie
- **Gdzie:** `src/drive/change-detection.ts:608-614` (`markFullScanCompleted` przekazuje `isBootstrapped: true`,
  więc dopisuje kolejny wpis do `bootstrapHistory`), `:581-603`; `src/sync/sync-engine.ts:332-336`
- **Skutek:** po pełnym skanie następny bootstrap (np. po błędzie 400) prawie zawsze dostaje
  `shouldSkipFullScan = true`, więc `allFiles = []`, co prowadzi do K1.
- **Poprawka:** nie dopisywać historii w `markFullScanCompleted`. Po bootstrapie zawsze robić pełny skan
  albo nie wykonywać synca.

---

## Niskie

- **N1.** Pliki bez rozszerzenia (`Makefile`, `README`) są traktowane jak foldery i przechodzą filtr rozszerzeń.
  Gdzie: `src/utils/extension-filter.ts:19-20`, `:57-62`.
- **N2.** Ustawienie "Auto-sync on file changes" (`syncOnFileChange`) jest w UI, ale nic go nie używa.
  Gdzie: `src/settings.ts:263-272`.
- **N3.** Hałaśliwe i wrażliwe logi:
  - `shouldSyncFile(..., debug=true)` dla każdego pliku: `sync-engine.ts:431-440`, `:679-687`
  - pętla w `getRemoteFiles` liczy wynik i go nie używa
  - pełne odpowiedzi Changes API w `console.log`
  - 20 pierwszych znaków access tokena w logu: `client.ts:70-74`
- **N4.** `createOrFindFolder('ObsidianVault')` szuka po całym Drive (także w udostępnionych). Nazwa nie jest
  escapowana w zapytaniu `q`. Gdzie: `src/drive/client.ts:187-191`.
- **N5.** Kopie konfliktów:
  - `vault.read` psuje pliki binarne
  - dwie kopie w tej samej sekundzie kolidują nazwą
  - kopie są potem wgrywane jako nowe pliki, do korzenia (zob. W2)
  - Gdzie: `src/sync/conflict-resolver.ts:229-236`.
- **N6.** Tryb one-way nadpisuje lokalne edycje zdalną wersją bez wykrywania konfliktu. Wymaga co najmniej
  ostrzeżenia w UI. Gdzie: `src/sync/sync-engine.ts:202-207`.
- **N7.** Martwy kod, który trzeba utrzymywać:
  - `src/utils/cli-integration.ts` (importuje `fs`/`path`, czyli nie zadziała na mobile, gdyby został użyty)
  - `ConflictResolver.getConflictedFiles`, `resolveAllConflicts`, `cleanupOldBackups`
  - `IndexManager.shouldIgnoreFile` i `matchesPattern` (druga, też wadliwa implementacja globów)
  - `DriveChangeDetection.filterChangesForFolder`
- **N8.** Brak testów i `tsconfig` bez `strict`. Błędy K1–K3 i W1 wyłapałyby proste testy jednostkowe
  `IndexManager.compareWithRemoteFiles` i `matchesPattern`.

---

## Architektura i ryzyka

- **Model stanu.** Indeks opiera się na `mtime`/`size` lokalnie i `modifiedTime` na Drive, bez `md5Checksum`
  i bez zapamiętanej wersji zdalnej. Jest to podatne na zegary i nie pozwala odróżnić "zmienione" od "przeniesione".
- **Jeden plik `data.json` dla trzech właścicieli** (ustawienia, indeks, tokeny), zapisywany bez koordynacji.
  To główne źródło K2 i S6.
- **Dwie strategie listowania** (Changes API i timestamp) z różną semantyką ("delta" i "snapshot") przechodzą
  przez to samo porównanie, które zakłada snapshot. To główne źródło K1, S8 i W6.
- **Placeholdery w produkcyjnej ścieżce** (rozwiązywanie konfliktów) i funkcje UI bez implementacji
  (`syncOnFileChange`, tryb `manual`).

## Rekomendowana kolejność napraw

1. **K2:** rozdzielenie storage. Szybkie, a bez tego żadna inna poprawka nie przetrwa restartu.
2. **K1, W5, S8, W6:** jawny tryb delta/snapshot. Usunięcia tylko z pełnego skanu albo z `removed`, token zapisywany po sukcesie.
3. **W3:** kosz zamiast trwałego usuwania, jako siatka bezpieczeństwa na czas napraw.
4. **K4:** ograniczenie zmian do folderu.
5. **W1, W4:** glob i semantyka filtrów, z testami.
6. **K3:** prawdziwe rozwiązywanie konfliktów (pobranie wersji zdalnej, `md5Checksum`).
7. **W2:** zachowanie struktury folderów na Drive.
8. Średnie i niskie.

Do czasu napraw K1–K3 bezpieczniej używać trybu **one-way** albo trzymać kopię zapasową vaulta.
