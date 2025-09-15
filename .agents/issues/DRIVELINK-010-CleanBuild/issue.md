---
issueId: "DRIVELINK-010-CleanBuild"
humanTitle: "CleanBuild"
issueUrl: ""
createdAt: "2025-09-15T00:00:00Z"
tags: []
---

# CleanBuild

CleanBuild
- one source of true about version is node .\.github\actions\semver-js\index.js
- do not use fallback in build script

## Agent Summary
*(added/updated by agent on resume; user text above remains untouched)*
- Goal: Establish single source of truth for version management using semver-js action, eliminating fallback version calculation
- Scope: Modify build script to rely exclusively on `.github/actions/semver-js/index.js` for version information
- Constraints: Must not use fallback version calculation logic in build script
- Success criteria: Build process uses only semver-js action output, no fallback mechanisms remain active

# ChangeLog
- 2025-09-15 — Issue created
- 2025-09-15 — Added Agent Summary after user edits
- 2025-09-15 — Triggered scenario via /issue