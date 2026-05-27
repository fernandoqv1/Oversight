# Oversight Desktop — Live Updates (OTA)

This app supports **opt-in over-the-air updates** through GitHub Releases.

It is intentionally minimal:

- **Checked once per session, at startup.** Never polls in the background.
- **Inspector decides.** A dialog appears only when a newer release exists; the inspector picks "Install Update" or "Not Now".
- **Offline-safe.** If the computer has no internet, the check silently fails and the app runs normally.
- **Project data is preserved.** Updates do not touch projects stored in `localStorage` (`oversight_project_*`). The app also runs a schema-migration pass at startup so newer versions adapt older data instead of discarding it.

## How it works

1. On launch, the renderer first runs `migrateAllProjects()` (in `js/main.js`). It bumps any older project records up to the current `DATA_SCHEMA_VERSION` and guarantees the collections the UI iterates exist.
2. About **3 seconds after the window finishes loading**, `setupOneTimeUpdateCheck()` (in `main.js`) calls `autoUpdater.checkForUpdates()` **once**.
3. If a newer GitHub Release exists for the repo `fernandoqv1/Oversight`, the inspector sees an "Update Available" dialog.
4. If accepted, the update downloads in the background. A small purple pill appears in the lower right showing progress (`Downloading update 42%`).
5. When the download finishes, the app asks one more time before restarting to install.

A failed check (no internet, GitHub down, etc.) is logged in DevTools and never shown to the inspector.

## Files involved

| File | Role |
|------|------|
| `main.js` | One-time check, dialog prompts, install. |
| `preload.js` | Exposes `electronAPI.checkForUpdates`, `installUpdate`, `onUpdateStatus`. |
| `js/main.js` | Migrates project schema and shows the update-status pill. |
| `package.json` | Version + `build.publish` (GitHub Releases). |

## Shipping a new version

> **You only need to do this once per release.** Inspectors will see the update next time they open the app.

### 1. Bump the version

Edit `package.json`:

```json
"version": "1.0.3"
```

Use semantic versioning. The version **must be greater** than what users have installed, or `electron-updater` will skip it.

### 2. Commit and push

```powershell
git add .
git commit -m "Release 1.0.3 — short description"
git push
```

### 3. Build and publish

You need a GitHub **Personal Access Token** with `repo` scope, set as an environment variable so `electron-builder` can upload artifacts:

```powershell
$env:GH_TOKEN = "ghp_yourTokenHere"
npm run release
```

`npm run release` runs `electron-builder --win --publish always`, which:

- Builds the NSIS installer (`.exe`)
- Generates `latest.yml` (the update metadata `electron-updater` looks for)
- Uploads both to a new **draft** GitHub Release tagged `v1.0.3`

### 4. Publish the GitHub Release

- Open the repo on github.com → **Releases**
- Edit the draft created by step 3
- Add release notes if you want
- Click **Publish release**

That's it. The next time any installed copy of Oversight Desktop opens, it will see the new version and prompt the inspector.

### Manual upload alternative

If you don't want to set up the GH token:

1. `npm run build:win`
2. Go to your repo on github.com → **Releases** → **Draft a new release**
3. Tag it `v1.0.3` (matching `package.json` version, prefixed with `v`)
4. Upload **both** files from `dist/`:
   - `Oversight Desktop Setup 1.0.3.exe`
   - `latest.yml`
5. Publish

`electron-updater` needs **both** files; without `latest.yml` clients can't see the update.

## Adding a schema change later

When a future release adds or renames project fields:

1. Bump `DATA_SCHEMA_VERSION` in `js/main.js`.
2. Add a step to `PROJECT_MIGRATIONS` that upgrades from the previous version to the new one. Migrations must be **additive only** — never delete inspector data, fall back to safe defaults.
3. Ship the release.

Example:

```javascript
const DATA_SCHEMA_VERSION = 2;
const PROJECT_MIGRATIONS = {
    2: (p) => {
        // 1 -> 2: per-worker leadMedExpiration added.
        p.workerRoster = (p.workerRoster || []).map(w => ({
            leadMedExpiration: '',
            ...w
        }));
    }
};
```

Older projects will pick up the new field automatically the next time the app opens, with no data loss.

## Caveats

- **OTA only works in packaged builds** installed via the NSIS installer. Running `npm start` (dev) or the `portable` build won't auto-update.
- **Code signing is optional but recommended.** Without a code-signing certificate Windows SmartScreen may warn on installation. The update still works.
- **Pre-releases are skipped.** `allowPrerelease = false`. If you want beta testers to update from pre-release tags, flip that flag.
- **No background polling.** Inspectors update by closing and reopening the app. This is by design.
