---
issueId: "DRIVELINK-013-OnlyOneScenrio"
humanTitle: "Only one scenrio"
issueUrl: ""
createdAt: "2025-09-17T12:00:00Z"
tags: []
---

# Only one scenrio

Ther will be only one scenario:
- on the intilization user use SimpleToken to get all nececry data
- after the SimpleToken is not used 
- plugin use data from SimpleToken: access token, refresh token
- remove code for other scanrios from plugin



## Agent Summary
*(added/updated by agent on resume; user text above remains untouched)*
- Goal: Simplify authentication flow to use only SimpleToken scenario
- Scope: Remove all alternative authentication scenarios from plugin, keep only SimpleToken-based flow
- Constraints: Must preserve access token and refresh token functionality from SimpleToken
- Success criteria: Plugin uses only SimpleToken for initialization, no other authentication scenarios remain in codebase

# ChangeLog
- 2025-09-17 — Issue created
- 2025-09-17 — Added Agent Summary after user edits
- 2025-09-17 — Triggered scenario via /issue