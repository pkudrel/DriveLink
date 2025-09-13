
# PROJECT.md — DriveLink Obsidian Plugin

## Goal
Create a private Obsidian plugin named **DriveLink** that allows **manual synchronization between a Vault and a Google Drive folder**.  

The plugin is **for personal use only**, not published in the Community Plugins catalog. It must work on **desktop** and **mobile (iOS/Android)** without requiring a paid Apple developer account.  

---

## Functional Requirements

1. **Google Drive Authorization**
   - Use OAuth 2.0 PKCE (no backend).
   - Static callback page hosted on free hosting (e.g. GitHub Pages, Cloudflare Pages).
   - Plugin registers handler:  
     `obsidian://plugin-drivelink/callback?action=callback&code=...&state=...`
   - Store tokens locally (`access_token`, `refresh_token`, `expires_at`) in `this.saveData()`.

2. **Configuration**
   - `clientId` — Google OAuth Client ID.
   - `driveFolderId` — Google Drive folder ID for sync.
   - `ignoreGlobs` — list of ignored paths (default: `.obsidian/**`, `.trash/**`, `*.tmp`, `*.lock`).

3. **File Synchronization**
   - Triggered manually by a command “Sync now”.
   - **Push**: upload new/modified files from Vault to Drive.
   - **Pull**: download new/modified files from Drive into Vault.
   - Upload methods:
     - ≤5 MB: multipart upload.
     - >5 MB: resumable upload (308 flow).
   - Download with `files.get(...?alt=media)` using ETag (`If-None-Match`).
   - Handle conflicts:
     - Last-writer-wins + backup copy as `filename (conflict @YYYYMMDD-HHmm).md`.

4. **File Index**
   - Maintain a local index (`index.json` stored via `this.saveData()`).
   - Example entry:
     ```json
     {
       "path": "Notes/A.md",
       "size": 1234,
       "mtime": 1690000000,
       "etag": "xyz",
       "driveId": "1AbC..."
     }
     ```
   - Compare Vault vs index vs Drive to detect changes.

5. **Drive Change Detection**
   - Use `changes.getStartPageToken` + `changes.list` API.
   - Avoid full folder scans where possible.
   - Sync only supported file types (Markdown `.md`, optionally images `.png`, `.jpg`).

6. **Commands in Obsidian**
   - `Connect to Google Drive` — start OAuth flow.
   - `Set up Drive folder` — create or assign Drive folder.
   - `Sync now` — perform manual sync.

---

## Non-Functional Requirements

- **No backend** — all logic runs inside Obsidian plugin.
- **Local token storage only** — no external servers.
- **Simplicity** — built for a single user, minimal UI.
- **Cross-platform** — works on Obsidian Desktop and Mobile (iOS/Android).
- **No paid Apple developer account required** — plugin runs as standard Obsidian plugin, not an App Store app.
- **Performance** — batch requests where possible, handle pagination, exponential backoff on `429/5xx`.

---

## Deliverables

- Plugin directory `.obsidian/plugins/drivelink/` containing:
  - `manifest.json`
  - `main.ts` (compiled to `main.js`)
  - `package.json`
  - `tsconfig.json`
  - `styles.css` (optional)
- Static callback HTML: `/callback/drive/index.html`.
- Build instructions (`npm run build`) to generate `main.js`.

---

## Implementation Tasks

### 1. Project Setup
- [ ] Create plugin skeleton with `manifest.json`, `main.ts`, `package.json`, `tsconfig.json`.
- [ ] Configure `esbuild` to compile `main.ts → main.js`.

### 2. Google Cloud OAuth Setup
- [ ] Create Google Cloud project.
- [ ] Add **OAuth Client ID** of type *Web application*.
- [ ] Configure redirect URI: `https://<your-host>/callback/drive`.
- [ ] Copy `client_id` into plugin code.

### 3. Callback Page
- [ ] Implement `/callback/drive/index.html`:
  ```html
  <!doctype html><meta charset="utf-8">
  <script>
    const p = new URLSearchParams(location.search);
    const code = p.get("code"), state = p.get("state");
    if (code && state) {
      location.href = `obsidian://plugin-drivelink/callback?action=callback&code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
    } else {
      document.body.textContent = "Missing code/state";
    }
  </script>
  ```
- [ ] Deploy to GitHub Pages / Cloudflare Pages.

### 4. OAuth PKCE Flow
- [ ] Generate `code_verifier` and `code_challenge`.
- [ ] Build authorization URL with PKCE parameters.
- [ ] Open external browser with `window.open()`.
- [ ] Handle redirect via Obsidian protocol handler.
- [ ] Exchange `code` for tokens (`/token` endpoint).
- [ ] Save tokens in plugin storage.

### 5. Token Management
- [ ] Implement `ensureToken()` to return valid access token.
- [ ] Refresh token if expired using `refresh_token`.
- [ ] Handle missing `refresh_token` case (re-prompt consent).

### 6. Drive Folder Management
- [ ] Command: “Set up Drive folder”.
- [ ] If no folder configured, create `ObsidianVault` folder on Drive.
- [ ] Save `driveFolderId` to settings.

### 7. Indexing
- [ ] Store local file metadata (path, size, mtime, etag, driveId).
- [ ] Compare Vault state against index and Drive.

### 8. Synchronization
- [ ] **Pull**: use `changes.list` to detect remote changes, download modified files.
- [ ] **Push**: detect local changes, upload to Drive.
- [ ] Handle both multipart and resumable uploads.
- [ ] Conflict resolution: save conflict copies.

### 9. Ignore Rules
- [ ] Default: `.obsidian/**`, `.trash/**`, `*.tmp`, `*.lock`.
- [ ] Implement `isIgnored(path)` helper.
- [ ] Allow custom patterns.

### 10. Optional Enhancements
- [ ] Settings UI for `clientId`, `driveFolderId`, ignore patterns.
- [ ] Auto-sync on startup or file save.
- [ ] Log panel for sync results.
- [ ] Optional local token encryption.

---

## Success Criteria

- User can connect DriveLink to Google Drive via OAuth.
- User can select or create a Drive folder for sync.
- “Sync now” command uploads/downloads changes correctly.
- Conflicts handled by creating backup copies.
- Works on Obsidian desktop and iOS/Android mobile apps.
