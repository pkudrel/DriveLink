---
issueId: "DRIVELINK-016-DoWyznaczniaWersjiUse"
humanTitle: "Do wyznacznia wersji use https://github.com/deneblab/abcversion"
issueUrl: ""
createdAt: "2026-10-26T18:42:24Z"
tags: [versioning, ci, build]
---

# Do wyznacznia wersji use https://github.com/deneblab/abcversion

Do wyznaczania wersji użyć https://github.com/deneblab/abcversion.

## Agent Summary
*(added/updated by agent on resume; user text above remains untouched)*
- Goal: Wersja pluginu wyznaczana przez abcversion (deneblab/abcversion) — w CI i lokalnie — zamiast własnej akcji `semver-js` i `version.txt`.
- Scope:
  - Dodać `.abcversion.json` w root repo z `BaseVersion` (nowa wersja bazowa — bump po stronie użytkownika, patrz Constraints)
  - CI (`.github/workflows/release.yml`): zastąpić krok `./.github/actions/semver-js` instalacją natywnego binarium abcversion (`abcversion-linux-x64` z GitHub Releases) i `abcversion -p semversion`; wynik → `version`/`tag` (`v<version>`), dalej jak teraz (sprawdzenie tagu, build, release z `main.js`/`manifest.json`/`styles.css` dla BRAT)
  - Lokalnie (`scripts/build.js`, `npm run version`/`prebuild`): wersja z abcversion zamiast z `version.txt` + liczby commitów; zapis do `manifest.json`, `package.json`, `versions.json`, `build-info.json` jak obecnie
  - Trigger workflow: `paths` zawiera `version.txt` → zamienić na `.abcversion.json`
  - Sprzątanie: usunąć `.github/actions/semver-js` i `version.txt`, gdy nic z nich nie korzysta
- Constraints:
  - Numeracja nie musi kontynuować 0.1.x — użytkownik zrobi bump wersji (nowe `BaseVersion`), ale nowa wersja musi być **wyższa niż 0.1.94**, bo BRAT/Obsidian aktualizuje tylko do wyższej wersji
  - abcversion musi być dostępny lokalnie (`install.sh` → `~/.local/bin`, albo `dotnet tool`); gdy brak — build ma dać czytelny błąd z instrukcją, nie cichy fallback
  - Natywne binaria tylko `linux-x64`, `osx-arm64`, `win-x64` (Intel Mac / linux-arm64 → `dotnet tool`)
  - W CI przypiąć wersję abcversion (`ABCVERSION_VERSION` / konkretny release), nie `latest`
- Success criteria:
  - Push na `production` tworzy release z wersją z abcversion; tag `v<version>` zgodny z `manifest.json` w release
  - `npm run build:local` lokalnie daje tę samą wersję co CI dla tego samego commita
  - BRAT na iPhonie widzi nową wersję jako aktualizację względem 0.1.94
  - Brak odwołań do `semver-js` i `version.txt` w repo

# ChangeLog
- 2026-10-26 — Issue created
- 2026-10-26 — Added Agent Summary: abcversion w CI i lokalnie, bump wersji po stronie użytkownika
- 2026-10-26 — GitHub issue not created: token lacks Issues write (createIssue: Resource not accessible by integration)
- 2026-10-26 — Triggered scenario via /issue
- 2026-10-26 — Implemented: .abcversion.json (BaseVersion 0.2.0 → 0.2.91), build.js/release.js read abcversion JSON, release.yml installs pinned abcversion v1.2.19 (sha256 checked); semver-js and version.txt removed
