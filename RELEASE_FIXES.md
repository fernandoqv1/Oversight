# Oversight Desktop — Release fixes (1.0.6 → 1.0.10)

This document summarizes problems encountered while shipping updates, what was changed in the repo, and why. It is meant for anyone rebuilding installers or debugging OTA (over-the-air) updates via GitHub Releases.

---

## 1. Crash after update: `Cannot find module 'electron-updater'`

### Symptom

After updating from **1.0.6** to **1.0.9**, the app showed:

```text
A JavaScript error occurred in the main process
Error: Cannot find module 'electron-updater'
```

The updater had run, but the installed app would not start.

### Cause

`package.json` used a `build.files` pattern that **excluded all of `node_modules`**:

```json
"**/*",
"!node_modules/**/*"
```

That kept the packaged `app.asar` small, but it also **removed production dependencies** that only live in `node_modules`—including `electron-updater`. Most other runtime libraries are copied into `lib/` by `scripts/postinstall.js`, so the app looked fine in development but failed when packaged.

`main.js` previously did a top-level `require('electron-updater')`, so a missing module crashed the process immediately.

### Fix

1. **`package.json` `build.files`** — Switched to **exclusion-only** patterns (electron-builder defaults). Production dependencies are packed again; build output, sample projects, logs, and dev docs are excluded instead.
2. **`main.js`** — Load `electron-updater` only when `app.isPackaged`, inside `getAutoUpdater()` with try/catch. If the module is missing, the app can still open (OTA disabled) instead of crashing.
3. **Version **1.0.10**** — New release number because **1.0.9 installers on GitHub were not safe to reuse**; users on broken 1.0.9 must **run the installer manually** once (OTA cannot run if the app does not start).

### Verify a build

After `npm run build:win`, confirm the asar contains the updater:

```powershell
npx asar list "dist\win-unpacked\resources\app.asar" | Select-String "electron-updater"
```

`app.asar` should be on the order of **~20 MB**, not multi‑gigabyte.

---

## 2. Huge `app.asar` (~4 GB)

### Symptom

Windows builds were extremely slow; `app.asar` grew to roughly **4 GB**.

### Cause

A broad `"**/*"` include without excluding `node_modules` bundled **the entire `node_modules` tree** into the asar.

### Fix

Same `build.files` change as in §1: rely on electron-builder’s default dependency pruning and **exclude** `node_modules` only indirectly (do not use `!node_modules/**/*` together with a pattern that blocks production deps). Exclude `dist/**`, `dist-release*/**`, etc., so build artifacts are not packaged.

---

## 3. Junk files inside `app.asar`

### Symptom

Inspecting **1.0.9**’s asar showed paths like `dist-nsis-only/`, `build-log*.txt`, and markdown docs bundled into the app.

### Cause

`"**/*"` included everything in the project root that was not explicitly excluded.

### Fix

Additional exclusions in `build.files`: `!dist-nsis-only/**`, `!build-log*.txt`, `!scripts/**`, and common doc filenames (`README.md`, `UPDATES.md`, etc.).

---

## 4. OTA update check: `sha512 checksum mismatch`

### Symptom

In the packaged app:

```text
Update check failed: sha512 checksum mismatch, expected Gnk/1Ph1nnN2KDx7f9yjI/..., got fj4glUy97mwyPS9oYjxgGmCSUcE452YsVp+goJZMV1j+...
```

### Cause

**`latest.yml` and `Oversight-Desktop-Setup-1.0.10.exe` on the GitHub release did not come from the same build.**  
`latest.yml` was generated from one installer; a **different** `.exe` (rebuilt or re-uploaded later) was on the release. `electron-updater` downloads the exe, hashes it, and compares to `latest.yml`—any mismatch fails.

### Fix

Regenerate or edit `latest.yml` so `sha512` and `size` match the **exact** `.exe` on the release, then re-upload **only** `latest.yml` (or upload **both** files together after every rebuild):

```powershell
node -e "const fs=require('fs'),c=require('crypto');const p='dist-release-1010/Oversight-Desktop-Setup-1.0.10.exe';const b=fs.readFileSync(p);console.log('size',b.length);console.log('sha512',c.createHash('sha512').update(b).digest('base64'));"
```

Correct values for the build in `dist-release-1010` (as of the fix):

| Field   | Value |
|---------|--------|
| `size`  | `107343268` |
| `sha512` | `fj4glUy97mwyPS9oYjxgGmCSUcE452YsVp+goJZMV1j+Hbnh9vy9QLgLXLlIBtkVD0J8PllLD1ekL70IFo7y/A==` |

**Rule:** After every `npm run build:win`, upload **`Oversight-Desktop-Setup-<version>.exe` and `latest.yml` from the same output folder in one step.**

---

## 5. OTA 404 / wrong installer filename (1.0.9)

### Symptom

Update checks failed with **404** or could not find the asset.

### Cause

`electron-builder` publishes `latest.yml` with a `url` that must match the uploaded asset name. The release used a mismatched name (e.g. `Oversight.Desktop.Setup.1.0.9.exe` vs expected `Oversight-Desktop-Setup-1.0.9.exe`).

### Fix

Set in `package.json`:

```json
"artifactName": "Oversight-Desktop-Setup-${version}.${ext}"
```

Upload the installer under **exactly** that name plus `latest.yml` from the build output directory.

---

## 6. Local build errors (`app-update.yml` ENOENT)

### Symptom

`electron-builder` failed when building locally with publish config enabled.

### Cause

Publish metadata expects release publishing context; local builds do not have `app-update.yml` in the same way.

### Fix

Use **`build:win`** with `--publish never`:

```json
"build:win": "electron-builder --win --publish never --config.win.signAndEditExecutable=false"
```

Use **`release`** (or `--publish always`) only when intentionally publishing to GitHub.

---

## 7. Development / install environment (D: drive, Windows)

### Problems

- PowerShell blocking `npm.ps1` → use **`npm.cmd`** or relax execution policy.
- Partial Electron extract on **D:** → missing `electron.exe` / `path.txt`.
- `postinstall` font copy failures (`UNKNOWN` errors) on flaky I/O.

### Fixes (scripts)

| Script | Purpose |
|--------|---------|
| `scripts/ensure-electron.js` | Ensures Electron binary is present after install. |
| `scripts/install-electron-binary.js` | Re-extracts Electron using **adm-zip** (more reliable than default extract on D:). |
| `scripts/start-dev.js` | Dev entry used by `npm start`. |
| `scripts/postinstall.js` | Copies libs/fonts into `lib/` and `fonts/`; calls `ensureElectron()`; uses safer `copyFileSafe`. |

`adm-zip` is a **devDependency** used only at install/build time, not required inside the packaged asar for runtime.

---

## 8. UI and copy tweaks (non-crash)

Restored modal/shell styling aligned with **1.0.7** where the UI had regressed, and adjusted overview KPI labels in `js/shell.js` for clearer wording (e.g. pending → running / queued where appropriate). These do not affect the updater; they improve consistency with the intended 1.0.7 look and terminology.

---

## 9. Auto-update behavior in `main.js`

- Updates run only when **`app.isPackaged`** (not in `npm start` dev mode).
- **`quitAndInstall(false, true)`** — install after quit; `isAdmin` / run-after-finish flags per electron-updater docs for Windows NSIS.
- IPC handlers `check-for-updates` and `install-update` return clear errors if the updater module is unavailable.

GitHub OTA is configured in `package.json`:

```json
"publish": [{
  "provider": "github",
  "owner": "fernandoqv1",
  "repo": "Oversight",
  "releaseType": "release"
}]
```

---

## Publishing checklist (1.0.10+)

1. Bump `version` in `package.json`.
2. Build:

   ```powershell
   Set-Location D:\oversight-desktop
   npm.cmd run build:win -- --config.directories.output=dist-release-<version>
   ```

3. Confirm `electron-updater` in asar and reasonable asar size.
4. Create GitHub release with **`Oversight-Desktop-Setup-<version>.exe`** and **`latest.yml`** from **that same folder** (never mix yml from an older build).
5. If only `latest.yml` was wrong: `gh release upload v<version> dist-release-<version>\latest.yml --repo fernandoqv1/Oversight --clobber`  
   Use full path if needed: `"C:\Program Files\GitHub CLI\gh.exe"`.
6. Users stuck on **broken 1.0.9** must run the **1.0.10+ installer manually** once; OTA cannot recover a app that will not launch.

---

## Files touched (reference)

| Area | Files |
|------|--------|
| Packaging | `package.json` (`build.files`, `artifactName`, `build:win`, version) |
| Updater runtime | `main.js` (`getAutoUpdater`, guarded IPC) |
| Install / dev | `scripts/postinstall.js`, `ensure-electron.js`, `install-electron-binary.js`, `start-dev.js` |
| UI | `index.html`, `project.html`, `js/shell.js` (as applicable per release) |
| Release metadata | `dist-release-*/latest.yml` (generated per build; must match exe on GitHub) |

---

## Related docs

- `UPDATES.md` — OTA overview for the project  
- `RELEASE_GUIDE.md` — release process (step-by-step publish)

---

## Markdown files in this repo (what to keep vs remove)

| File | Verdict | Why |
|------|---------|-----|
| **`README.md`** | **Keep** | Main entry point: features, `npm start`, build, structure. Still accurate at a high level. |
| **`RELEASE_FIXES.md`** | **Keep** | This file — incident log and packaging/OTA pitfalls (1.0.6–1.0.10). |
| **`RELEASE_GUIDE.md`** | **Keep** | Practical GitHub + Windows release workflow (templates, `git push`, upload assets). Complements this doc (fixes vs process). |
| **`UPDATES.md`** | **Keep** (refresh optional) | How OTA behaves in the app (`main.js`, schema migrations). Some examples still say `1.0.3` and old installer names — update to match `artifactName` (`Oversight-Desktop-Setup-*.exe`). |
| **`DOCUMENT_GENERATION.md`** | **Keep** if you use Word export | Docxtemplater/templates guide; still relevant for maintainers working on `.docx` output. |
| **`HANDOFF.md`** | **Remove or archive** | Large early-port handoff (~485 lines). Status is wrong (lists containments, daily logs, doc gen as “not done” though much exists now). Misleading for new devs. |
| **`QUICK_START.md`** | **Remove or archive** | Duplicates `README` install steps; sends readers to stale `HANDOFF.md`; “what needs to be done” is outdated. |
| **`SETUP.md`** | **Remove or archive** | Duplicates README setup; “copy from mattrack-app” steps marked done; “Current Status” section is obsolete (IndexedDB-era snapshot). |
| **`AGENT_PROMPT.md`** | **Remove** (unless you use Cursor agents) | One-shot AI onboarding prompt from initial port. Not used by the app; content is stale. Safe to delete from the product repo. |
| **`EXPORT_FIXES.md`** | **Remove** | Scratch notes for a one-time modal/export patch (“manual fixes needed” with paste-in code). Historical only; not a user or release guide. |

### Overlap (not useless, but could merge later)

- **`README.md`** vs **`SETUP.md`** / **`QUICK_START.md`** — same “install and run” story; keep README only if you delete the other two.
- **`RELEASE_GUIDE.md`** vs **`UPDATES.md`** vs **`RELEASE_FIXES.md`** — three angles: *how to publish*, *how OTA works in-app*, *what broke and how we fixed it*. Worth keeping all three until you merge into one “Releases” doc.

### Not packaged in the installer

`package.json` `build.files` excludes several markdown names from `app.asar` (docs are dev-only). `RELEASE_FIXES.md` is **not** in that exclude list; add it to the exclude glob if you do not want it inside the built app.

### Suggested cleanup command (optional)

Only run if you agree to delete the obsolete files:

```powershell
Set-Location D:\oversight-desktop
Remove-Item AGENT_PROMPT.md, HANDOFF.md, QUICK_START.md, SETUP.md, EXPORT_FIXES.md
```
