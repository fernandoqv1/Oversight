# AGENTS.md

## Cursor Cloud specific instructions

Oversight Desktop is a **standalone offline Electron desktop app** (no backend server, no database service). All data lives client-side in the renderer's `localStorage` (project records under the `oversight_project_*` keys) plus photo/document files on disk in the Electron user-data dir. There is nothing to "deploy" — you run the single Electron app in dev mode.

### Running the app (headless cloud VM)

- A virtual X display is available at `DISPLAY=:1` (used by the computer-use tools). Electron must be launched against it.
- The bundled Chromium sandbox cannot run in this container (chrome-sandbox is not root-owned), so launch with the sandbox disabled:
  - `DISPLAY=:1 ELECTRON_DISABLE_SANDBOX=1 npm start`
- `npm start` runs `scripts/start-dev.js` (dev mode). Do NOT use `npm run build:win` / `release` for testing — those are Windows packaging targets and require Windows-only tooling.
- Harmless noise on Linux at startup: `dbus` connection errors, `spawn powershell.exe ENOENT` (the Windows wifi/photo bridges), and GPU `kTransientFailure` messages. These do not affect functionality.
- The Electron binary at `node_modules/electron/dist/electron` may need the execute bit set after a fresh install (`chmod +x`). The update script handles this.

### Dev workflow gotchas

- The renderer does not hot-reload. After editing `js/*.js` or the HTML, reload the window (Ctrl+R) or restart `npm start` to pick up changes.
- HTML pages load the `js/*.js` files (e.g. `js/shell.js`, `js/project.js`, `js/main.js`, `js/excel.js`). The root-level `main.js` is the Electron **main process**; the root-level `project.js` is a stale duplicate that is NOT loaded by any page — edit the copies under `js/`.
- UI is split: `js/shell.js` renders the dashboard + project workspace shell and the active tabs (including the **Workers** tab / roster add form and worker import). `js/project.js` holds modal builders/business logic (e.g. `window.openEditWorkerModal`). `js/main.js` owns dashboard data + schema migration.

### Data schema migrations

- `js/main.js` defines `DATA_SCHEMA_VERSION` and `PROJECT_MIGRATIONS`. On renderer load, `migrateAllProjects()` upgrades stored projects to the current version (tracked via the `oversight_data_schema_version` localStorage key). Migrations must be **additive/safe** — never delete inspector data. To force a re-run during testing, clear that key in DevTools.

### Phone upload / document scanner (wireless import)

- The wireless import (photo + document) hosts a local website and a Wi-Fi Direct AP created by `scripts/wifi-direct-bridge.ps1`. The AP + `check-wireless-client-connected` (ARP-based) are **Windows-only** and cannot run on the Linux dev VM — the `start-wireless-*-import` handlers fail here with `spawn powershell.exe ENOENT`.
- The mobile scanner page is a static HTML string returned by `getMobileDocumentUploadHtml()` in `main.js` (no interpolation). Document auto-detection uses **self-hosted OpenCV.js + jscanify** (served from `node_modules/jscanify/src` via the `/opencv.js` and `/jscanify.min.js` routes) so the phone needs no internet; it falls back to a built-in Sobel detector until OpenCV finishes loading.
- To test the scanner page's detection + crop/loupe UI without the Windows AP: serve that HTML string plus the two asset files from a tiny local HTTP server and open it in a browser (the page is self-contained; only the `/upload` POST needs the real app). OpenCV.js (~9 MB) takes a few seconds to initialize before jscanify detection works.
- Wi-Fi Direct credentials are **stable/persisted per inspector**: `getStableWifiCredentials()` generates a random SSID/password once and stores them in `wifi-direct-credentials.json` under the user-data folder (falling back to a hostname-derived value if that file can't be written), so the QR never changes between sessions. AP start-up is retried via `startWifiDirectBridgeWithRetry()`, and `attachBridgeWatchdog()` auto-restarts the AP (same credentials) if it drops mid-session. None of this can be exercised on the Linux VM (no PowerShell/AP) — the pure JS (credential persistence, retry) is unit-testable in isolation; the boot log will show `[wifi-direct] start attempt …` retrying and failing here, which is expected.
- The AP is **always-on and shared**: it is pre-started on app launch (`preStartWifiDirect` in `app.whenReady`) and both the daily-log photo flow (`start-wireless-import`) and the document flow (`start-wireless-document-import`) acquire/return it via `acquireSharedAp()` / `parkSharedAp()`. Each upload only regenerates the per-session upload URL + URL-QR; the Wi-Fi network QR stays constant. Do not add code that kills the bridge on stop — park it instead so the next upload is instant.
- Document naming happens **on the PC** in `openWirelessDocumentImportModal` (`js/project.js`): each received document gets an editable name field. Do not use `window.prompt()` — it is unsupported in Electron (returns null) and `native-dialogs.js` only shims `alert`/`confirm`.

### Lint / test / build

- There is no configured linter or automated test runner (no `lint`/`test` npm scripts; the files in `scripts/test-*.js` are ad-hoc node scripts, not a suite). Verify JS edits with `node --check <file>` and validate behavior by running the app.
