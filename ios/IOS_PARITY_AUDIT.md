# Oversight iOS — Full Parity Audit & Xcode Implementation Guide

Complete diagnosis of what the iOS app (`ios/Oversight/`) is missing compared to the Windows desktop app (`js/`, `templates/`), plus step-by-step instructions to close every gap.

**Use this file in Xcode** as your single reference while implementing. Swift source files can be edited directly; regenerate the Xcode project after adding files:

```bash
python3 ios/generate_pbxproj.py
```

There is no Swift compiler in the cloud agent VM — build and test locally in Xcode on device or simulator.

---

## How to read this document

| Column / label | Meaning |
|---|---|
| ✅ **Done** | Matches desktop behavior |
| ⚠️ **Partial** | Exists but incomplete or wrong |
| ❌ **Missing** | Not implemented on iOS |
| 🖥️ **Desktop-only** | Intentionally not ported (Windows/Electron hardware) |
| 📱 **iOS-only** | Keep as-is; do not remove |

Each gap entry includes: **what desktop does**, **what iOS does today**, **what to build**, and **source files to read**.

---

## Principles (non-negotiable)

1. **Keep iOS styling** — grouped lists, `SheetScaffold`, `EmptyStateView`, `.groupedListStyle()`, accent colors, `StageBadge`, capsule pills, monospaced project numbers. Do **not** copy desktop HTML/CSS.
2. **Match desktop wording and behavior** — button labels, modal titles, field labels, placeholders, validation toasts, filename patterns, business rules.
3. **Preserve iOS-only features** — inspector QR **import**, document scanner, Excel import/export, appearance settings.
4. **Use real Word templates** — bundle `templates/*.docx` from repo root; fill placeholders; do not hand-build simplified documents.
5. **Additive data only** — never delete inspector data in migrations.

---

## Executive summary

| Area | Completion | Priority |
|---|---|---|
| Core data model | ~90% | Low — mostly done |
| Project CRUD & navigation | ~75% | Medium |
| Containments & stage lifecycle | ~70% | High |
| Samples (air/bulk/wipe) | ~75% | High |
| Daily logs & photos | ~65% | High |
| Materials & spaces | ~80% | Medium |
| Workers & roster | ~70% | High |
| **Document generation** | **~10%** | **Critical** |
| Archive & completion | ~40% | High |
| Excel import/export | ~85% | Low |
| Profile & inspector | ~80% | Low |
| Today / insights | ~70% | Medium |
| Wireless / phone import | 0% (desktop) | 🖥️ Skip |
| Inspector QR share (export) | 0% on iOS | Optional |

**Biggest gaps:** template-based Word export (7 types + ZIP), COC modals, worker roster export, archive gate + download package, several business rules (auto wipe samples, regulated area, per-containment negative pressure UI, material completion archive gate).

---

## Part 1 — Gap matrix by feature area

### 1.1 App shell & navigation

| Feature | Desktop | iOS | Status |
|---|---|---|---|
| Today dashboard | Sidebar **Today** — activity, running samples, KPIs | `TodayView` — attention, running samples, snapshot, 3 projects | ⚠️ Partial |
| All projects list | Table with filters Active/Completed/All | `ProjectsListView` — Active/Overdue/All + search | ⚠️ Partial (no Completed-only filter label) |
| Archive tab | Completed projects + Download/Unarchive/Delete | `ArchiveView` — list only | ⚠️ Partial |
| Profile | Sidebar inspector card + tweaks | `ProfileView` — account, appearance, demo reset | ✅ Done (+ QR import) |
| Global search | Ctrl+K search projects/samples/materials | Project list search only | ❌ Missing global search |
| New project | **New Project** | `+` → New Project | ✅ Done |
| Import Excel | Dashboard **Import** | Projects `+` → Import from Excel | ✅ Done |
| Dark mode | Tweaks panel | Appearance sheet | ✅ Done |

**To do**
- [ ] Archive row actions: **Download project files**, **Unarchive** (desktop `unarchiveProject`)
- [ ] Projects filter: add **Completed** segment or align naming with desktop **Active / Completed / All**
- [ ] Optional: global search across samples/materials (low priority)

---

### 1.2 Project workspace header & Edit menu

| Feature | Desktop | iOS | Status |
|---|---|---|---|
| Edit project | **Edit** → full modal | Edit menu → Edit project details | ✅ Done |
| Export Excel | **Export** | Edit → Export to Excel | ✅ Done |
| Archive | **Archive** with gate + confirm | Edit → Mark completed (no gate) | ⚠️ Partial |
| Delete project | **Delete** | Not in Edit menu | ❌ Missing |
| New log shortcut | **New log** in header | Edit → Add daily log | ⚠️ Partial (different placement) |
| Material progress bar | **Material removed** KPI | `percentComplete` on project row only | ⚠️ Partial |
| Open project folder | Click project number pill | Shows folder label; no open action on iOS | ⚠️ Partial |
| Download Word ZIP | Dashboard/archive icon | Not present | ❌ Missing |

**To do**
- [ ] Implement `projectArchiveGate()` logic before Mark completed (see §1.9)
- [ ] Confirm dialog: `Archive "{name}"? This will mark the project as completed.`
- [ ] Add **Download project files** to Edit menu and Archive rows
- [ ] Add **Delete project** with confirmation (desktop parity)
- [ ] Show material progress bar on `ProjectDetailView` hero (use existing `ProgressBarView`)
- [ ] Add **Due date** field to `ProjectFormSheet` (model has `dueDate`; UI missing)

---

### 1.3 Containments

| Feature | Desktop | iOS | Status |
|---|---|---|---|
| Add/edit containment | Modal with building, spaces, materials qty, stage | `ContainmentFormSheet` — name, building, spaces, stage picker | ⚠️ Partial |
| **Regulated Area** checkbox | Pre-Start VI + containment form; skips neg. pressure & clearance air | Not in model/UI | ❌ Missing |
| Stage gating via VI | Prep→Active, Active→Clearance require VI modals | `GatedStageChangeSheet` on Set stage | ✅ Done |
| Auto 5 clearance air samples | On Final VI pass | `GatedStageChangeSheet.autoCreateClearanceSamples()` | ✅ Done |
| Auto clearance **wipe** sample | On Final VI pass if lead materials | Not implemented | ❌ Missing |
| Auto **pre-start wipe** (Washoe) | On containment create for Washoe CSD + lead | Not implemented | ❌ Missing |
| Stage gate bypass | Edit Containment stage dropdown | `ContainmentFormSheet` Stage picker allows direct change | ⚠️ Bug |
| Add VI standalone | From Edit Containment VI cards | `newVisualInspection` sheet unwired | ❌ Missing |
| Delete VI reverts stage | Desktop rule | Not implemented | ❌ Missing |
| Next action banner | **Next action:** hint text | Not present | ❌ Missing |
| Containment suffix in docs | **" Containment"** auto in documents | Use `containmentDisplayName()` helper when exporting | ⚠️ Partial |

**To do**
- [ ] Add `regulatedArea: Bool` to `Containment` (additive migration)
- [ ] Add **Regulated Area** toggle to `GatedStageChangeSheet` (Pre-Start) and `ContainmentFormSheet`; hint: *"Negative pressure readings will not be required for daily logs, and clearance air samples will not be automatically created."*
- [ ] Skip auto clearance air samples when regulated area
- [ ] Port `createClearanceWipeSample()` and `createPreAbatementWipeSample()` / `isWashoeClient()` from `js/project.js`
- [ ] Remove Stage picker from edit form OR disable it when change requires gate (force **Set stage** flow)
- [ ] Wire **Add Visual Inspection** on containment detail
- [ ] Port `revertContainmentStageAfterInspectionDelete()` when VI deleted

**Desktop source:** `js/project.js` — `openAddContainmentModal`, `openEditContainmentModal`, `openVisualInspectionModal`, `createClearanceAirSamples`, `createClearanceWipeSample`, `createPreAbatementWipeSample`

---

### 1.4 Samples — Air

| Feature | Desktop | iOS | Status |
|---|---|---|---|
| Add/edit/delete | Full modal with calc fields | `AirSampleFormSheet` | ✅ Done |
| Types | Ambient, Personal, Clearance | Area, Personal, Clearance | ⚠️ Naming (`Area` vs `Ambient`) |
| Hazard Asb/Pb | Selector when project has both | Hazard picker + Pb- ID prefix | ✅ Done |
| Sample ID format | `{proj}-{Pb-?}{AS\|PS\|CA}{nn}` | `nextSampleID(for:)` | ✅ Done |
| Running / volume calc | Live elapsed + volume | `isRunning`, `sampleVolume` | ✅ Done |
| Sample set sync | Apply to set checkbox | Apply-to-set toggle in form | ✅ Done |
| Filter bar | All/Bulk/Wipe/Ambient/Personal/Clearance/Pb | All/Running/Clearance segments | ⚠️ Partial |
| **Air COC** button | **Air COC** on Samples tab | Only on Documents tab (wrong label) | ❌ Missing placement |
| COC sample picker modal | Select samples + lab form | Generates all samples, no modal | ❌ Missing |
| Mixed Pb/Asb COC guard | Error toast | Not implemented | ❌ Missing |

**To do**
- [ ] Add **Air COC** to Samples toolbar (see Part 3)
- [ ] Implement `AirCOCFormSheet` with desktop wording (Part 4)
- [ ] Consider renaming **Area** → **Ambient** in UI only if matching desktop labels exactly
- [ ] Add desktop-style type/hazard filters to Samples tab (optional)

---

### 1.5 Samples — Bulk

| Feature | Desktop | iOS | Status |
|---|---|---|---|
| Create from material | Double-click material row | Context menu **New Bulk Sample** (no HMR prefilled) | ⚠️ Partial |
| HMR + letter ID | Auto `01A`, `01B`… | Form computes letter | ✅ Done |
| **Bulk COC** | **Bulk COC** + material picker | Missing | ❌ Missing |
| Hazard-mixed print guard | Blocks mixed Asb/Pb | Missing | ❌ Missing |
| Analysis options | PLM / PCM / TEM vs Flame AA/ICP for lead | Form has PLM/TEM/SEM/XRF/ICP | ⚠️ Verify parity |

**To do**
- [ ] Wire `newBulkSampleFromMaterial` from material context menu with HMR + material name prefilled
- [ ] Add **Bulk COC** button + `BulkCOCFormSheet` + material selection step

---

### 1.6 Samples — Wipe (lead)

| Feature | Desktop | iOS | Status |
|---|---|---|---|
| Tab visibility | Hidden unless Pb materials | Wipe tab always visible | ⚠️ Partial |
| Add/edit | Full modal | `WipeSampleFormSheet` | ✅ Done |
| ID `{proj}-W{nn}` | Auto | Auto | ✅ Done |
| **Wipe COC** | **Wipe COC** | Missing | ❌ Missing |
| Auto-created wipes | Pre-start + clearance | Model supports `autoCreated`; no auto-create rules | ❌ Missing |

**To do**
- [ ] Hide Wipe tab/section when project has no lead materials (desktop `getProjectHazardSummary`)
- [ ] Add **Wipe COC** + `WipeCOCFormSheet`
- [ ] Implement auto wipe creation (§1.3)

---

### 1.7 Daily logs

| Feature | Desktop | iOS | Status |
|---|---|---|---|
| Create/edit log | Date, inspector, worker count, worker checkboxes | `DailyLogFormSheet` — multi-select workers | ✅ Done |
| Log entries | Hour, description, photos, neg. pressure | `LogEntryFormSheet` | ⚠️ Partial |
| Per-containment neg. pressure | Dynamic fields per active containment (inWC) | Single free-text `negativePressureNotes` | ❌ Missing |
| Regulated area skip | No pressure required | Not implemented | ❌ Missing |
| Photos max 5 | File + wireless import | Camera + PhotosPicker, max 5 | ✅ Done |
| Photo viewer in timeline | Show/hide photos inline | Count icon only; no gallery in detail | ❌ Missing |
| Worker count validation | Must match on edit | Not enforced | ❌ Missing |
| Print daily log Word | Legacy hidden Print button | Missing | ❌ Missing |
| `activeContainments` snapshot | Stored on log for work location | Not on `DailyLog` model | ❌ Missing |
| Wireless photo import | Wi-Fi Direct phone upload | 🖥️ Desktop-only | Skip |

**To do**
- [ ] Replace neg. pressure notes with per-containment fields (store JSON or structured child model); aggregate to `{negativePressure}` sentence on export
- [ ] Add photo gallery viewer on `DailyLogDetailView` entry rows
- [ ] Validate worker count vs selected workers on log edit
- [ ] Add `activeContainments: [String]` to `DailyLog` (additive) for document work location
- [ ] Daily log Word export (single log + ZIP bundle)

**Desktop source:** `js/project.js` — `openProjectDailyLogModal`, `openProjectDailyLogEntryModal`, `buildNegativePressureHtml`, `printDailyLog`

---

### 1.8 Materials & spaces

| Feature | Desktop | iOS | Status |
|---|---|---|---|
| Building → Space → Material | Full hierarchy | `MaterialsView` | ✅ Done |
| Site materials master list | Separate from space assignments | Aggregated totals by name | ⚠️ Partial |
| Hazard checkboxes Asb/Pb | On material | Not on `Material` model | ❌ Missing |
| Qty allocation to containment | Validates unallocated qty | Not implemented | ❌ Missing |
| Material progress / archive | % removed drives archive gate | `percentComplete` uses stage index only, not material removal | ❌ Missing |
| Add building standalone | **New building** button | Only via material/space forms | ⚠️ Partial |
| Double-click → bulk sample | Opens bulk with material | Context menu without prefill | ⚠️ Partial |

**To do**
- [ ] Add `hazardTypes` or `isAsbestos`/`isLead` flags to `Material` (additive)
- [ ] Port `calculateMaterialCompletion()` and `projectArchiveGate()` from `js/main.js` / `js/shell.js`
- [ ] Show **Material removed** progress on project detail (not just stage-based %)
- [ ] Fix `showAddBuilding` dead state or add **New building** action

---

### 1.9 Archive & project completion

| Feature | Desktop | iOS | Status |
|---|---|---|---|
| Archive gate | All containments Abatement Completed + 100% materials + assigned | Mark completed toggles status only | ❌ Missing |
| Progress cap 99% | Until archive-ready | Not implemented | ❌ Missing |
| Unarchive | **Unarchive** button | Missing | ❌ Missing |
| Download ZIP | **Download** / folder icon | Missing | ❌ Missing |
| Auto-generate docs on complete | From default templates prefs | `DefaultTemplatesSheet` saves prefs; no hook | ❌ Missing |

**Archive gate rules (port exactly)**

1. Every containment stage = **Abatement Completed**
2. `calculateMaterialCompletion()` = 100% (materials in clearance+ stages)
3. All materials assigned to spaces/containments

Failure toasts (from desktop):
- All containments must reach Abatement Completed
- 100% materials abated message
- Materials not assigned message

**To do**
- [ ] Implement gate in Mark completed flow
- [ ] Add unarchive + download on Archive list
- [ ] Optional: on pass gate, auto-run selected `DefaultTemplatesSheet` templates + ZIP

**Desktop source:** `js/main.js` — `archiveProject`, `projectArchiveGate`, `calculateMaterialCompletion`, `downloadArchivedProject`

---

### 1.10 Workers & team

| Feature | Desktop | iOS | Status |
|---|---|---|---|
| Add/edit/delete worker | Inline form + edit modal | `WorkerFormSheet` | ✅ Done |
| Import workers | **Import workers** — from project or Excel | **Copy from Another Project** only | ⚠️ Partial |
| **Export roster** Word | **Export roster** → DOCX | Missing | ❌ Missing |
| Expired cert warning | Card hint + red dates in export | Card icon; no export red text | ⚠️ Partial |
| Respirator fit required | Validation on save | Validation on save | ✅ Done |
| Lead cert expiry in attention | Today attention items | `hasExpiredCertification` ignores lead | ⚠️ Partial |

**To do**
- [ ] Add **Export roster** toolbar button on `TeamView`
- [ ] Implement worker roster template render + expired date coloring
- [ ] Add **Import workers** from Excel export (read Worker Roster sheet / `_FullData` workers)
- [ ] Include lead cert expiry in `Worker.hasExpiredCertification` / Today attention

---

### 1.11 Documents tab

| Feature | Desktop | iOS | Status |
|---|---|---|---|
| Chain of custody section | 3 cards + subtitle | Single simplified COC row | ❌ Missing |
| Attached documents | Add from Files + Phone | Scanned docs only (camera scanner) | ⚠️ Partial |
| Document preview | In-app preview modal | Scanned viewer only | ⚠️ Partial |
| Rename/delete | Yes | Scanned docs yes | ✅ Done (scans) |
| Generated document list | N/A on desktop Docs tab | `GeneratedDocument` model unused | ⚠️ Dead code |
| Project detail count | — | Counts `documents` not `scannedDocuments` | ⚠️ Bug |

**To do**
- [ ] Restructure `DocumentsView` per Part 3 (COC cards + subtitle)
- [ ] Fix project detail Documents count → `scannedDocuments.count` (or merge concepts)
- [ ] Optional: file importer for PDF/DOCX attachments (desktop **+ Add from Files**)
- [ ] Remove or wire `GeneratedDocument` when export creates records

---

### 1.12 Excel import/export

| Feature | Desktop | iOS | Status |
|---|---|---|---|
| Export all sheets | Yes | `ExcelExportSheet` | ✅ Done |
| `_FullData` JSON round-trip | Yes | Yes | ✅ Done |
| Photo/signature side sheets | Yes | Yes | ✅ Done |
| Import merge/update by project # | Confirm dialog | Creates new project | ⚠️ Partial |
| DEFLATE desktop exports | Desktop uses DEFLATE | Reader supports DEFLATE | ✅ Done |
| Worker import from Excel | Yes | Missing | ❌ Missing |

**To do**
- [ ] Import: offer update existing project when project number matches
- [ ] Worker import sheet (Team tab)

---

### 1.13 Profile, inspector, QR

| Feature | Desktop | iOS | Status |
|---|---|---|---|
| Inspector profile fields | Name, initials, company, certs, signature | Name, company, certs, signature (no initials field) | ⚠️ Partial |
| Profile required on first launch | Yes | `fullScreenCover` onboarding | ✅ Done |
| Signature draw/upload | Both | Draw in profile sheet | ✅ Done |
| **Share** profile QR | Desktop can share | iOS **imports** only via QR | 📱 Import OK; export optional |
| Default templates prefs | Stored | Stored; not wired to generation | ⚠️ Partial |
| Signatures on documents | By inspector name lookup | Excel + future DOCX | ⚠️ Partial |

**To do (optional)**
- [ ] Add **Initials** field to `Inspector` if desktop documents require `{inspectorInitials}`
- [ ] Share inspector profile QR from Profile (if desktop has export — check `js/inspector-profile.js` / remote branch `cursor/inspector-profile-qr-share-d414`)

**Preserve:** `InspectorQRScanSheet` v1 + v2 multipart import unchanged.

---

### 1.14 Today & insights

| Feature | Desktop | iOS | Status |
|---|---|---|---|
| Running samples | Panel with links | `TodayView` + 30s refresh | ✅ Done |
| Attention items | Long-running samples, etc. | `Insights.attentionItems` | ⚠️ Partial |
| Active abatement todo | No log today | Implemented | ✅ Done |
| Clearance ready | — | Volume computed samples | ✅ Done |
| Snapshot KPIs | 4 cards | 4 StatCards | ✅ Done |

**To do**
- [ ] Align attention rules with desktop `getAttentionItems()` if any missing

---

### 1.15 Platform / desktop-only (do not port)

| Feature | Reason |
|---|---|
| Wi-Fi Direct AP + QR | Windows PowerShell + hardware |
| Wireless photo/document upload | Requires desktop AP + local HTTP server |
| USB phone photo import (MTP) | Windows bridge |
| Electron auto-update | N/A |
| Native folder browse (Electron) | iOS uses `fileImporter` — equivalent OK |
| `window.prompt` | Unsupported; iOS uses alerts/sheets ✅ |

---

## Part 2 — Document generation (detailed)

This is the largest gap. The current iOS COC is a **custom-built** document in `DocxKit.swift` and does **not** match the FACS Word templates.

### 2.1 Template inventory

Copy from repo root `templates/` into `ios/Oversight/Oversight/Templates/`:

| File | On-demand (COC tab) | In ZIP export |
|---|---|---|
| `Air Sample Template.docx` | ✅ | ❌ |
| `Bulk Sample Template.docx` | ✅ | ❌ |
| `Lead Wipe Template.docx` | ✅ | ❌ |
| `Daily Log Template.docx` | ❌ | ✅ |
| `Visual Inspection Template.docx` | ❌ | ✅ |
| `Containment Summary Template.docx` | ❌ | ✅ |
| `Worker Roster Template.docx` | Export roster + ZIP | ✅ |

### 2.2 Key Xcode takeaway — replace simplified COC

**Delete** the scratch builder in `DocxGenerator.generateCOC()` (title "CHAIN OF CUSTODY — AIR SAMPLE ANALYSIS", custom tables, etc.) after template rendering works.

**Build instead:**

1. **Bundle** all seven `.docx` files in the app target (Copy Bundle Resources).
2. **`DocxTemplater.swift`** — unzip template, repair split placeholders (port from `js/project.js`), render scalars/loops/images, re-zip STORED.
3. **`DocumentExportData.swift`** — pure functions building data dictionaries (port from `js/project.js` / `js/main.js`).
4. **COC form sheets** — sample picker + lab fields with desktop labels.
5. **Move buttons** to correct tabs (Part 3).

### 2.3 Architecture sketch

```
Views (buttons) → Sheets (forms) → DocumentExportData → DocxTemplater → ShareSheetView
                                      ↑
                              DocumentFormatters
                              Bundle Template.docx
```

### 2.4 Image module sizes

| Tag | Size | Source |
|---|---|---|
| `{%%image}` | 250×80 px | `Inspector.signatureData` as `data:image/png;base64,...` |
| `{%%photo}` | max 336×336 px | `LogEntryPhoto.imageData` |

Lookup signature by **inspector name** on the form/log/inspection.

### 2.5 Placeholder repair

Word splits `{sampleID}` across XML runs. Desktop calls `repairDocxPlaceholderTags()` before render. Port the seven repair passes from `js/project.js:1039–1104` OR ensure your templater merges runs — required if using shipped templates unchanged.

**Template typo:** use key `spectialInstructions` exactly.

### 2.6 Post-processing

| Document | Post-process |
|---|---|
| Daily Log | `removeEmptyPhotoLogCells`, `paginatePhotoLogTable` (2 pairs/page) |
| Worker Roster | Color expired date strings `#EE0000` in XML |

### 2.7 COC form sheets — shared fields

All three COC modals share (from desktop):

| Label | Placeholder |
|---|---|
| Collected By | (default: profile name) |
| Bill 2 / Lab Account Number | `e.g., LAB-001` |
| Send Results To (Email) | `email@example.com` |
| Laboratory | `e.g., FACS, EMSL` |
| Type of Analysis | (dynamic per hazard) |
| Turn Around Time | `e.g., 24-Hour, 5-Day` |
| Special Instructions | `Optional special instructions for the lab...` |

Sample picker: **Select Samples to Print**, **Select All** / **Select None**, **`N` sample(s) selected**, all checked by default.

### 2.8 Modal titles & success toasts

| Flow | Modal title | Success toast |
|---|---|---|
| Air | Print Air Sample Request | Air sample request document generated successfully. |
| Bulk | Print Bulk Sample Chain of Custody | Bulk sample COC document generated successfully. |
| Wipe | Print Lead Wipe Chain of Custody | Lead wipe COC document generated successfully. |
| Roster | — | Worker roster exported. |
| Daily log | — | Daily log document generated successfully. |
| ZIP | — | Project files downloaded successfully (N documents). |

### 2.9 Filename patterns

```
Air_Sample_Request_{projectNumber}_{MM_DD_YYYY}.docx
Bulk_Sample_COC_{projectNumber}_{materialName}_{MM_DD_YYYY}.docx
Lead_Wipe_COC_{projectNumber}_{MM_DD_YYYY}.docx
Daily_Log_{projectNumber}_{MM_DD_YYYY}.docx     (single)
Daily_Log_{MM_DD_YYYY}.docx                   (in ZIP)
{projectNumber}_Worker_Roster.docx
{projectNumber}.zip
```

### 2.10 ZIP folder structure

```
{projectNumber}.zip
├── Daily Logs/
│   └── Daily_Log_{MM_DD_YYYY}.docx
├── Worker Roster/
│   └── Worker_Roster.docx
├── {ContainmentName} Containment/
│   ├── Pre-Start Visual Inspection.docx
│   ├── Final Visual Inspection.docx
│   └── Containment Summary.docx
└── Documents/          (future: attached files)
```

Use `containmentDisplayName()` for folder names; be aware desktop double-suffix quirk — iOS should strip existing " Containment" suffix before appending.

### 2.11 Complete data mapping reference

For every template key, loop structure, date format, and aggregation rule, see the previous detailed sections in git history and desktop sources:

- Air/Bulk/Wipe COC: `js/project.js` — `printAirSampleForm`, `printBulkSampleForm`, `printWipeSampleForm`
- Daily log: `js/project.js` — `printDailyLog`; ZIP variant `js/main.js` ~1658
- Worker roster: `js/project.js` — `buildWorkerRosterTemplateData`, `exportWorkerRosterDoc`
- VI / Summary: `js/main.js` — `downloadArchivedProject` inline blocks

**Date formats**

| Context | Format |
|---|---|
| Most documents | `MM/dd/yyyy` (local calendar) |
| Daily log times | `HHMM` (no colon) |
| Roster header dates | `MM-dd yyyy` |
| Roster cert dates | `MM/dd/yy` |
| Roster expired red | paired `*Exp` / `*Expired` fields |

**Air sample loop fields:** `sampleID`, `sampleDescription`, `sampleDate`, `startTime`, `stopTime`, `startFlow`, `stopFlow`, `timeElapsed`, `averageFlow`, `sampleVolume`

**Negative pressure sentence (Daily Log):**

```
Negative pressure reading in the containments are as follow, {Name} is at {value} inWC, ...
```

---

## Part 3 — UI wording & placement changes

Keep SwiftUI styling; change **text and actions** only.

### 3.1 Samples tab (`SamplesView.swift`)

Add toolbar buttons (secondary/bordered style):

| Button | When enabled |
|---|---|
| **Air COC** | `!airSamples.isEmpty` |
| **Bulk COC** | `!bulkSamples.isEmpty` |
| **Wipe COC** | has lead materials && `!wipeSamples.isEmpty` |

Each presents the corresponding COC form sheet.

### 3.2 Documents tab (`DocumentsView.swift`)

**Section header:** Chain of custody

**Footer/subtitle text:**

> Print lab submission forms during the project. Daily logs, visual inspections, and containment summaries are generated when you export or archive the project.

**Three rows** (icon + title + caption — same list row pattern as today):

| Title | Caption |
|---|---|
| Air sample chain of custody | `{n} air sample(s) · lab submission / pump request.` |
| Bulk chain of custody | `{n} bulk sample(s) · material COC form.` |
| Lead wipe chain of custody | `{n} wipe sample(s) · lead wipe COC form.` |

Remove: **Generate Chain of Custody** (wrong label, wrong behavior).

Keep: **Scanned · N** section and **Scan Document**.

### 3.3 Workers tab (`TeamView.swift`)

Add toolbar button:

- **Export roster** (disabled when roster empty)

### 3.4 Project Edit menu (`ProjectDetailView.swift`)

Add:

- **Download project files**

Reconcile:

- **Mark completed** → run archive gate first; use desktop confirm wording

### 3.5 Label alignment quick reference

| iOS today | Desktop target |
|---|---|
| Generate Chain of Custody | Air sample chain of custody (Documents) / **Air COC** (Samples) |
| Area (sample type) | Ambient (optional rename) |
| Mark completed | Archive (with gate) |
| Copy from Another Project | Import workers (partial — add Excel path) |

---

## Part 4 — New Swift files to create

| File | Responsibility |
|---|---|
| `Support/DocxTemplater.swift` | Template load, unzip, repair, render, images, zip |
| `Support/DocxZipReader.swift` | Shared ZIP read (DEFLATE + STORED) |
| `Support/DocumentExportData.swift` | Build `[String: Any]` / structs per document type |
| `Support/DocumentFormatters.swift` | Dates, initials, containment names, units, COC aliases |
| `Support/ProjectArchiveGate.swift` | `calculateMaterialCompletion`, `projectArchiveGate` |
| `Support/HazardSummary.swift` | `hasLead`, `hasAsbestos` for gating UI |
| `Sheets/AirCOCFormSheet.swift` | Air COC modal |
| `Sheets/BulkCOCFormSheet.swift` | Bulk COC + material picker |
| `Sheets/WipeCOCFormSheet.swift` | Wipe COC modal |
| `Sheets/ProjectFilesExportSheet.swift` | ZIP build + progress + share |

### Files to modify (priority order)

1. `Support/DocxKit.swift` — remove scratch COC; thin wrapper or delete
2. `Views/DocumentsView.swift` — COC cards
3. `Views/SamplesView.swift` — COC buttons
4. `Views/TeamView.swift` — Export roster
5. `Views/ProjectDetailView.swift` — Download ZIP, archive gate, progress bar
6. `Views/ArchiveView.swift` — Download, Unarchive
7. `Sheets/ContainmentFormSheet.swift` — regulated area; fix stage bypass
8. `Sheets/GatedStageChangeSheet.swift` — regulated area; auto wipe samples
9. `Sheets/LogEntryFormSheet.swift` — per-containment neg. pressure
10. `Sheets/ProjectFormSheet.swift` — due date
11. `Sheets/DefaultTemplatesSheet.swift` — wire to auto-generate (optional)
12. `Support/AppState.swift` + `Views/RootView.swift` — new sheet cases
13. `ios/generate_pbxproj.py` — register `.docx` in Resources

---

## Part 5 — Xcode project setup (step by step)

### 5.1 Add templates

1. Create `ios/Oversight/Oversight/Templates/`
2. Copy all 7 `.docx` files from `/templates/`
3. Either drag into Xcode target **Copy Bundle Resources**, or extend `generate_pbxproj.py`:

```python
# In walk_and_register / build_tree — register *.docx like asset catalogs:
elif f.endswith(".docx"):
    register_resource(node)  # → build_files_resources
```

4. Run `python3 ios/generate_pbxproj.py`
5. Verify **Build Phases → Copy Bundle Resources** lists all templates

### 5.2 Add Swift files

1. Create files under `ios/Oversight/Oversight/` (any subfolder)
2. Run `python3 ios/generate_pbxproj.py`
3. Build in Xcode (⌘B)

### 5.3 Share sheet pattern (copy from existing code)

Use `ShareSheetView` from `ExcelExportSheet.swift`:

```swift
let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
try data.write(to: url)
// present UIActivityViewController
// delete temp file on dismiss
```

### 5.4 Inspector initials for documents

Desktop uses `{inspectorInitials}` on Daily Log and Visual Inspection. Add optional `initials: String` to `Inspector` or compute via `DocumentFormatters.initials(from: name)` — verify against desktop (profile has explicit initials field).

---

## Part 6 — Business rules checklist

Port these from `js/project.js` / `js/main.js`:

- [ ] `getContainmentDisplayName` — strip trailing " Containment" before suffixing
- [ ] `calculateTimeElapsed` — wrap past midnight
- [ ] `buildChainOfCustodyTemplateData` — Bill/Bill2/lab/laboratory aliases
- [ ] `formatWipeSampleTypeForCoc` — Pre-Start / Clearance / passthrough
- [ ] `getAirSampleHazardType` — explicit field, else infer from ID pattern
- [ ] Air COC: reject mixed Pb + Asb in one print
- [ ] Bulk COC: reject mixed hazards; dynamic analysis dropdown
- [ ] `isDateExpired` — end of calendar day
- [ ] Worker roster paired exp/expired fields + red XML pass
- [ ] `getActiveContainmentNamesForLog` — snapshot + stage history
- [ ] Clearance sample set: 5 samples, shared `sampleSetId`, `autoCreated`
- [ ] Regulated area: skip neg. pressure + skip auto clearance air
- [ ] Washoe pre-start wipe on containment create
- [ ] Clearance wipe on Final VI pass (lead)
- [ ] `projectArchiveGate` before archive
- [ ] `calculateMaterialCompletion` for true material progress
- [ ] Project number change rewrites sample IDs (if editing project number)

---

## Part 7 — Known iOS bugs to fix

| Bug | Fix |
|---|---|
| `SeedData.populateIfNeeded` never called | Call on first launch in `OversightApp` OR document "Reset demo data" path |
| Documents count on project detail uses `documents` not `scannedDocuments` | Fix count in `ProjectDetailView` |
| `ContainmentFormSheet` stage picker bypasses VI gates | Remove or guard |
| `newBulkSampleFromMaterial` unwired | Wire from material context menu |
| `newVisualInspection` unwired | Add button on containment |
| `ActiveSheet.signature` unwired | OK to leave; signature in profile sheet |
| Log entry `stageRaw` legacy shown in Recent Activity | Remove from meta or stop writing |
| `Worker.hasExpiredCertification` ignores lead certs | Add lead expirations |
| iOS sample type **Area** vs desktop **Ambient** | Align label or mapping on Excel export |

---

## Part 8 — Testing checklist (full app)

### Document export
- [ ] All 3 COC types open in Word/Pages with FACS letterhead
- [ ] Sample subset selection honored
- [ ] Mixed hazard guards show correct toasts
- [ ] Worker roster expired dates red
- [ ] Daily log photos + signature render
- [ ] ZIP contains logs, roster, VI, summaries per containment
- [ ] Filenames match desktop patterns

### Business rules
- [ ] Prep→Active blocked without Pre-Start VI pass
- [ ] Active→Clearance creates 5 clearance air samples on pass
- [ ] Regulated area suppresses auto clearance air
- [ ] Washoe pre-start wipe auto-created
- [ ] Final VI pass creates clearance wipe (lead)
- [ ] Archive blocked until gate passes

### Regression (iOS-only)
- [ ] QR profile import v1 + v2
- [ ] Excel round-trip with photos + signature
- [ ] Document scanner save/rename/delete
- [ ] Appearance/accent unchanged

### Cross-platform
- [ ] Export same project on Windows + iOS; compare field values in generated DOCX

---

## Part 9 — Implementation phases (all work)

| Phase | Scope | Suggested commit |
|---|---|---|
| **1** | Bundle templates + `DocxTemplater` scaffold + formatters | `iOS: bundle Word templates and DocxTemplater` |
| **2** | Placeholder repair + loops + image embedding | `iOS: DocxTemplater render loops and images` |
| **3** | Air COC sheet + Samples/Documents UI + remove scratch COC | `iOS: Air sample COC desktop parity` |
| **4** | Bulk + Wipe COC sheets | `iOS: Bulk and lead wipe COC export` |
| **5** | Export roster + Team button | `iOS: Worker roster Word export` |
| **6** | Daily log export + neg. pressure structure + photo viewer | `iOS: Daily log export and log UX` |
| **7** | VI + Containment summary data builders | `iOS: VI and containment summary export` |
| **8** | Project ZIP + Download project files | `iOS: Download project files ZIP` |
| **9** | Archive gate + unarchive + material completion | `iOS: Archive gate and material progress` |
| **10** | Regulated area + auto wipes + neg. pressure per containment | `iOS: Regulated area and auto sample rules` |
| **11** | Import workers + project import merge + polish | `iOS: Worker import and import merge` |
| **12** | Default templates auto-generate on complete (optional) | `iOS: Auto-generate documents on completion` |

After each phase: `python3 ios/generate_pbxproj.py` → Xcode build → test one happy path.

---

## Part 10 — Desktop source index

| Topic | File | Symbols |
|---|---|---|
| Air COC | `js/project.js` | `openPrintAirSamplesModal`, `printAirSampleForm` |
| Bulk COC | `js/project.js` | `openPrintBulkSamplesModal`, `printBulkSampleForm` |
| Wipe COC | `js/project.js` | `openPrintWipeSamplesModal`, `printWipeSampleForm` |
| Daily log DOCX | `js/project.js` | `printDailyLog` |
| Worker roster | `js/project.js` | `exportWorkerRosterDoc`, `buildWorkerRosterTemplateData` |
| ZIP export | `js/main.js` | `downloadArchivedProject`, `generateDocBlob` |
| Archive gate | `js/main.js`, `js/shell.js` | `archiveProject`, `projectArchiveGate`, `calculateMaterialCompletion` |
| Placeholder repair | `js/project.js` | `repairDocxPlaceholderTags` |
| Signatures/photos | `js/inspector-profile.js` | `createSignatureImageModule`, `processPhotoLogInDocx` |
| Excel | `js/excel.js` | `exportProjectToExcel`, `importProjectFromExcel` |
| Docs tab UI | `js/shell.js` | `renderTabDocs` ~1971 |
| Samples tab UI | `js/shell.js` | `renderTabSamples` ~1396 |
| Workers tab UI | `js/shell.js` | `renderTabTeam` ~1689 |
| Templates | `templates/*.docx` | — |
| Template spec | `DOCUMENT_GENERATION.md` | (partially stale — prefer this audit + JS) |
| iOS existing export doc | `ios/IOS_DOCUMENT_EXPORT_GUIDE.md` | superseded by this file |

---

## Part 11 — What stays iOS-only (do not remove)

| Feature | Files |
|---|---|
| Inspector QR **import** (v1 + v2 multipart) | `InspectorQRScanSheet.swift` |
| Document scanner (VisionKit) | `DocumentScannerSheet.swift` |
| Excel STORED XLSX export/import | `XLSXKit.swift`, `ExcelExportSheet.swift`, `ExcelImportSheet.swift` |
| Appearance / accent picker | `AppearanceFormSheet.swift` |
| Today tab insights | `TodayView.swift`, `Insights.swift` |
| SwiftData offline storage | All `@Model` types |
| macOS paste fallback for QR | `InspectorQRScanSheet.swift` |

---

## Appendix A — `generate_pbxproj.py` resource registration

Current script only registers `.swift` and `.xcassets`. To bundle templates automatically, add handling for `.docx` files in the Resources build phase (mirror `register_asset_catalog`). Manual Xcode drag-drop works without script changes.

---

## Appendix B — Editing from Cursor vs Xcode

| Action | Where |
|---|---|
| Edit Swift logic | Cursor or Xcode |
| Edit `.docx` templates | Replace files in `Templates/` — do not hand-edit XML unless you know Word |
| Register new files | `python3 ios/generate_pbxproj.py` |
| Build & run | Xcode only (Simulator or device) |
| UI iteration | Xcode Previews optional; test share sheet on device |

---

*This audit reflects the repo at `main` with iOS app under `ios/Oversight/`. Re-run gap analysis after each phase by checking off items in Parts 1, 7, and 8.*
