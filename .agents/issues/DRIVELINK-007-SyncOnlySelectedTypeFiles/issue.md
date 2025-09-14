---
issueId: "DRIVELINK-007-SyncOnlySelectedTypeFiles"
humanTitle: "sync only selected type files"
issueUrl: ""
createdAt: "2025-09-14T19:15:00Z"
tags: [sync, filtering, file-types, selective-sync]
---

# sync only selected type files

Implement functionality to allow users to sync only specific file types to Google Drive, providing granular control over which files are included in synchronization operations.
- obsydian plugin should sync only files with extension that users choose
- in settings should be list of extensions to prcesss
- default: .md, .pdf
 

## Agent Summary
*(added/updated by agent on resume; user text above remains untouched)*
- Goal: Implement file extension filtering in DriveLink plugin for selective synchronization
- Scope: Add settings UI for extension selection, modify sync engine to filter by extensions, set default extensions
- Constraints: Maintain backward compatibility with existing sync functionality
- Success criteria: Users can configure list of file extensions in settings (default: .md, .pdf), and plugin syncs only files with selected extensions

# ChangeLog
- 2025-09-14 — Issue created
- 2025-09-14 — Updated Agent Summary after user clarifications on extension filtering
- 2025-09-14 — Issue finalized via /issue-create end