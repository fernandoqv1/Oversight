# Oversight Desktop — Release & GitHub Guide

End-to-end steps to update templates, push source code, build the Windows installer, and publish OTA updates to [fernandoqv1/Oversight](https://github.com/fernandoqv1/Oversight).

For how OTA behaves in the app, see [UPDATES.md](./UPDATES.md).

---

## Before you start

| Item | Detail |
|------|--------|
| **Project folder** | `D:\oversight-desktop` (keep the repo on **D:**) |
| **Git remote** | `https://github.com/fernandoqv1/Oversight.git` |
| **OTA target** | GitHub repo `fernandoqv1/Oversight` (configured in `package.json` → `build.publish`) |
| **Templates** | `templates\` — `.docx` files, bundled into the installer at build time |

Open PowerShell in the project folder:

```powershell
D:
cd D:\oversight-desktop
```

---

## Two things go to GitHub (different places)

| What | Where | How |
|------|--------|-----|
| App source (`main.js`, `js/`, `templates/`, `package.json`, etc.) | Branch `main` | `git push` |
| Installer + OTA metadata | **GitHub Releases** | Build locally, then upload `.exe` + `latest.yml` |

The `dist\` folder is in `.gitignore`. The `.exe` is **not** committed to git. OTA uses **Release assets**, not files on `main`.

---

## Step 1 — Open the project

```powershell
D:
cd D:\oversight-desktop
npm install
```

Use this **D:** folder in Cursor for all steps below. Do not build from a different copy (e.g. Downloads on C:) unless you intend to — pick one folder and stick to it.

---

## Step 2 — Update templates

1. Edit Word files in `templates\`:
   - `Daily Log Template.docx`
   - `Visual Inspection Template.docx`
   - `Containment Summary Template.docx`
   - `Air Sample Template.docx`
   - `Bulk Sample Template.docx`
   - `Worker Roster Template.docx`
2. **Close Word** before testing or committing (avoids `~$*.docx` lock files).
3. Placeholder and signature rules: see [DOCUMENT_GENERATION.md](./DOCUMENT_GENERATION.md).

---

## Step 3 — Test locally

```powershell
npm start
```

Generate each document type you changed and open the outputs in Word.

Optional:

```powershell
npm run build:win
```

Install or run from `dist\` and test again.

---

## Step 4 — Bump version (required for OTA)

Edit `package.json` and set a version **higher** than what inspectors already have:

```json
"version": "1.0.4"
```

OTA only offers updates when the GitHub release version is **newer** than the installed app.

---

## Step 5 — Commit

```powershell
git add templates/
git add .
git status
```

Confirm:

- Your `.docx` changes are listed.
- No `~$*.docx` lock files.
- `package.json` / lockfile if you changed version or dependencies.

```powershell
git commit -m "Release 1.0.4 — updated templates and app changes"
```

---

## Step 6 — Push source code to GitHub

```powershell
git push origin main
```

This updates **code** on GitHub only. It does **not** ship the installer or enable OTA.

Use `git push origin main --force` only if you intentionally want to replace remote history (destructive).

---

## Step 7 — Build the installer

You need roughly **2–4 GB free** on **D:** (where the project lives). Builds fail with **“There is not enough space on the disk”** if the drive is full. Electron may also use Windows temp on **C:** — free a little space there if builds fail mysteriously.

### Prepare

```powershell
D:
cd D:\oversight-desktop

taskkill /IM electron.exe /F 2>$null
taskkill /IM "Oversight Desktop.exe" /F 2>$null

# Remove old build output (safe to delete)
Remove-Item -Recurse -Force dist, dist-build-104, dist-v104-*, dist-nsis-only, dist-release-103, dist-final-103, dist-output-v103 -ErrorAction SilentlyContinue
```

### Build (recommended: separate output folder)

Replace `104` in the folder name with your version digits (e.g. `105` for `1.0.5`).

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$out = "dist-release-104"
Remove-Item -Recurse -Force $out -ErrorAction SilentlyContinue

npx electron-builder --win --config.directories.output=$out --config.win.signAndEditExecutable=false
```

**Success:** in `$out` you should see:

- `Oversight Desktop Setup 1.0.4.exe` (version matches `package.json`)
- `latest.yml`
- (optional) portable `.exe`

If the build fails:

| Error | Fix |
|-------|-----|
| **There is not enough space on the disk** | Free space on **D:** (and optionally **C:** for temp). Delete old `dist-*` folders in the project. |
| **app.asar: being used by another process** | Close Oversight, `npm start`, and Electron; delete the output folder; retry. |
| Only `win-unpacked`, no Setup `.exe` | Build did not finish — check the last lines of output; usually disk space or a lock. |

Alternative (uses default `dist\` output):

```powershell
npm run build:win
```

---

## Step 8 — Upload to GitHub Release

OTA requires a **published** release with **both**:

- `Oversight Desktop Setup X.Y.Z.exe`
- `latest.yml`

Without `latest.yml`, installed apps cannot see an update.

### Option A — Manual upload (no token)

1. Open https://github.com/fernandoqv1/Oversight/releases
2. Create or edit release **v1.0.4** (tag must match `package.json` with a `v` prefix)
3. Upload from your build folder (e.g. `D:\oversight-desktop\dist-release-104\`):
   - `Oversight Desktop Setup 1.0.4.exe`
   - `latest.yml`
4. Click **Publish release**

### Option B — Automated upload

Create a GitHub [Personal Access Token](https://github.com/settings/tokens) with **`repo`** scope:

```powershell
D:
cd D:\oversight-desktop

$env:GH_TOKEN = "ghp_yourTokenHere"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

npx electron-builder --win --publish always --config.directories.output=dist-release-104 --config.win.signAndEditExecutable=false
```

Or, if `dist\` is clean and the default output is fine:

```powershell
$env:GH_TOKEN = "ghp_yourTokenHere"
npm run release
```

Then on GitHub → **Releases** → open the **draft** → add notes → **Publish release**.

---

## Step 9 — What users get

| User | Result |
|------|--------|
| **New install** | Download the `.exe` from the GitHub Release and run the installer (default: Program Files on C:). |
| **Already installed** | On next launch, app checks GitHub once (~3 s after load). If a newer release exists, they can install the update. New templates ship inside that update. |
| **Dev (`npm start`) or portable build** | No auto-update. |

Project data in `localStorage` is preserved across updates.

---

## Full checklist

```text
[ ] Working in D:\oversight-desktop
[ ] Several GB free on D: (and some free on C: if temp fills up)
[ ] Edit templates\*.docx — close Word
[ ] npm start — test each changed export
[ ] Bump version in package.json
[ ] git add . && git commit && git push origin main
[ ] Close Electron / Oversight Desktop
[ ] npx electron-builder ... → Setup .exe + latest.yml exist
[ ] Upload both to GitHub Release vX.Y.Z
[ ] Publish release
```

---

## Quick reference

```powershell
D:
cd D:\oversight-desktop

# After template/code edits and version bump:
git add .
git commit -m "Release 1.0.4 — templates and updates"
git push origin main

$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$out = "dist-release-104"
npx electron-builder --win --config.directories.output=$out --config.win.signAndEditExecutable=false

# Then upload D:\oversight-desktop\dist-release-104\ Setup .exe and latest.yml to GitHub Releases
```

---

## Common mistakes

1. **Publishing before updating templates** — Templates are baked in at **build** time. Edit `templates\`, commit, then build.
2. **Only `git push`, no Release** — OTA needs Release assets, not just `main`.
3. **Release without `latest.yml`** — Updates will not work.
4. **Same version as an existing release** — Bump version or replace that release’s files consistently.
5. **Full D: drive (or full C: temp)** — Keep several GB free on D: where the project lives.
6. **Empty GitHub release** — If the build failed, there is no `.exe` to upload. `git push` does not upload installers.
7. **Two copies of the repo** — Build and release from `D:\oversight-desktop` only, not an old folder on C:.

---

## Why a release might have no `.exe`

- `npm run release` can create or update a release only **after** the installer builds successfully.
- A failed build (disk full, locked `app.asar`, app still running) leaves only `win-unpacked` and no `Oversight Desktop Setup *.exe`.
- Pushing source with `git push` alone never uploads the installer.

Fix: free disk space on D:, close the app, delete old `dist-*` folders, rebuild, then upload **both** the Setup `.exe` and `latest.yml`.
