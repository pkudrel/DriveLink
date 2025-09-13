---
issueId: "DRIVELINK-002-CreateGithubActionToMakeReleaseOnCommitToProductionBranch"
humanTitle: "Create GitHub Action to make release on commit to production branch"
issueUrl: ""
createdAt: "2025-09-13T08:05:43.658Z"
tags: [automation, ci-cd, github-actions, release]
---

# Create GitHub Action to make release on commit to production branch

Create a GitHub Actions workflow that automatically creates plugin releases when commits are pushed to a production branch (e.g., `main` or `production`). The workflow should:

1. Build the plugin using the existing build system
2. Create release packages using the release script
3. Generate GitHub releases with proper versioning
4. Upload release artifacts (ZIP files, checksums)
5. Tag the commit with the version number

## Agent Summary
*(added/updated by agent on resume; user text above remains untouched)*
- Goal: Automate release creation for DriveLink plugin when code is pushed to production
- Scope: GitHub Actions workflow that builds, packages, and publishes releases
- Constraints: Must use existing build and release scripts, follow semantic versioning
- Success criteria: Automated releases created on production branch commits with proper artifacts

# ChangeLog
- 2025-09-13 — Issue created
- 2025-09-13 — Triggered scenario via /issue