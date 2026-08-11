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

**For AI implementers:** jump to **[Part 12 — Agent build instructions](#part-12--agent-build-instructions-for-claude--ai-implementers)** for step-by-step recipes (files to create, code patterns, acceptance tests).

**Daily logs + Excel logging shape:** see **[`IOS_DAILY_LOG_PARITY.md`](./IOS_DAILY_LOG_PARITY.md)** — photo viewing, edit UX, and `_FullData` / `_DailyLogPhotos` cross-platform contract.

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

## Part 12 — Agent build instructions (for Claude / AI implementers)

This section tells a coding agent **exactly how to build** each missing feature. Read Parts 1–11 first for context. Execute phases in order unless a task says otherwise.

### 12.0 Agent preamble — read before writing code

**Repo layout**

```
ios/Oversight/Oversight/
├── Models/          SwiftData @Model types
├── Views/           Screens (List + NavigationLink)
├── Sheets/          Modal forms (SheetScaffold pattern)
├── Support/         DocxKit, XLSXKit, Formatting, AppState, …
└── Templates/       ← CREATE: copy templates/*.docx here
templates/           ← Desktop Word templates (source of truth)
js/project.js        ← Desktop business logic + DOCX data (8788 lines)
js/main.js           ← ZIP export + archive gate
js/inspector-profile.js ← Signature/image sizes
```

**Mandatory constraints**

1. **No third-party Swift packages** — pure Foundation + SwiftUI + SwiftData + Compression (zlib).
2. **Keep existing UI styling** — copy patterns from neighboring views; use `SheetScaffold`, `EmptyStateView`, `.groupedListStyle()`.
3. **Match desktop strings verbatim** for labels, toasts, filenames (see Part 3).
4. **Additive schema only** — new model fields get defaults; never delete inspector data.
5. After adding/removing `.swift` or `.docx` files, run:
   ```bash
   python3 ios/generate_pbxproj.py
   ```
6. **Do not edit** `project.pbxproj` by hand.
7. **Remove** scratch COC code in `DocxKit.generateCOC` only after template-based Air COC works.

**Standard patterns to copy**

| Pattern | Copy from |
|---|---|
| Modal form | `Sheets/AirSampleFormSheet.swift` + `SheetScaffold` |
| Share exported file | `Sheets/ExcelExportSheet.swift` → `ShareSheetView`, temp URL, cleanup on dismiss |
| Present sheet | `AppState.present(.case)` + add case to `ActiveSheet` + `RootView.sheetView` |
| Toast | `appState.showToast("exact desktop string")` |
| Async build + progress | `ExcelExportSheet.buildXLSX()` — `Task.detached` then `MainActor.run` |
| Date MM/dd/yyyy local | See §12.1 `DocumentFormatters` |

**Definition of done (every phase)**

- [ ] Code compiles in Xcode (agent verifies structure; human builds if no Swift on CI)
- [ ] `python3 ios/generate_pbxproj.py` run if files added
- [ ] One happy-path manual test step documented in commit message
- [ ] No regression to QR import, Excel, scanner, appearance

---

### 12.1 Phase 1 — Bundle templates + formatters + DocxTemplater scaffold

#### Step 1.1 — Copy templates

```bash
mkdir -p ios/Oversight/Oversight/Templates
cp templates/*.docx ios/Oversight/Oversight/Templates/
```

Register in Xcode **or** extend `ios/generate_pbxproj.py`:

```python
# In the filename loop inside walk_and_register's parent (build_tree file loop):
elif f.endswith(".docx"):
    parent.children.append(Node(f, path=f, is_group=False))
    # In walk_and_register else branch, before register_file:
elif node.name.endswith(".docx"):
    register_resource(node)  # NEW: like register_asset_catalog → build_files_resources
```

Add `register_resource` mirroring `register_asset_catalog` (file ref + resource build phase entry).

Run `python3 ios/generate_pbxproj.py`.

#### Step 1.2 — Create `Support/DocumentFormatters.swift`

Port these functions from desktop (see `js/project.js` / `js/main.js`). Use `Calendar.current` (local timezone), never UTC `Date()` parsing for date-only strings.

```swift
enum DocumentFormatters {
    /// MM/dd/yyyy from Date
    static func formatDateMMDDYYYY(_ date: Date) -> String

    /// Parse "yyyy-MM-dd" or Date at local midnight
    static func formatDateMMDDYYYY(from dateString: String) -> String

    /// "HH:MM" input → "HHMM" for daily log
    static func formatTimeHHMM(_ hhmmColon: String) -> String

    /// First + last initial (desktop getInitials)
    static func initials(from name: String) -> String

    /// Strip trailing " Containment" then append — js/project.js getContainmentDisplayName
    static func containmentDisplayName(_ name: String?) -> String

    /// SF→ft² etc. — mirror displayUnit in js/project.js
    static func displayUnit(_ unit: MaterialUnit) -> String

    /// today as yyyy-MM-dd
    static func todayLocalYYYYMMDD() -> String

    /// Elapsed minutes; wrap past midnight
    static func calculateTimeElapsed(start: String, stop: String) -> Int?

    /// End of calendar day passed
    static func isDateExpired(_ date: Date?) -> Bool

    /// Roster: MM-dd yyyy, MM/dd/yy, etc.
    static func formatRosterHeaderDate(_ date: Date?) -> String
    static func formatRosterCertDate(_ date: Date?) -> String
}
```

#### Step 1.3 — Create `Support/DocumentTemplateFile.swift`

```swift
enum DocumentTemplateFile: String, CaseIterable {
    case airSample = "Air Sample Template"
    case bulkSample = "Bulk Sample Template"
    case leadWipe = "Lead Wipe Template"
    case dailyLog = "Daily Log Template"
    case visualInspection = "Visual Inspection Template"
    case containmentSummary = "Containment Summary Template"
    case workerRoster = "Worker Roster Template"

    func loadData() throws -> Data {
        guard let url = Bundle.main.url(forResource: rawValue, withExtension: "docx", subdirectory: "Templates")
        else { throw DocumentExportError.templateMissing(rawValue) }
        return try Data(contentsOf: url)
    }
}
```

#### Step 1.4 — Create `Support/DocxZipReader.swift`

Extract ZIP read from `XLSXKit.swift` private `ZipKit.read` into a shared internal enum, or duplicate minimally:

- Support **method 0 (STORED)** and **method 8 (DEFLATE)** — templates from repo use DEFLATE.
- Return `[String: Data]` keyed by normalized forward-slash paths.

Reuse CRC/inflate logic from `XLSXKit.swift` lines ~347–500.

#### Step 1.5 — Create `Support/DocxTemplater.swift` (scaffold)

Public API:

```swift
enum DocxTemplater {
    /// Render template with scalar + loop data. Returns finished .docx Data (STORED zip).
    static func render(template: DocumentTemplateFile, data: DocxTemplateData) throws -> Data
}

struct DocxTemplateData {
    var scalars: [String: String] = [:]
    var loops: [String: [[String: String]]] = [:]   // loopName → rows of tag→value
    var images: [String: Data] = [:]                 // tag without %% → PNG/JPEG data
    var conditionals: [String: Bool] = [:]           // #tag present or absent
}
```

**Render pipeline (implement in order):**

1. `let entries = try DocxZipReader.read(template.loadData())`
2. `repairPlaceholderTags(in: &entries)` — port `repairDocxPlaceholderTags` from `js/project.js:1106–1104` for parts matching `word/(document|header\d+|footer\d+).xml`
3. For each XML part in entries, run placeholder substitution:
   - Scalars: replace `{key}` with escaped XML text (escape `& < > "`)
   - Loops: find `{#loopName}...{/loopName}` blocks, duplicate inner XML per row in `loops[loopName]`
   - Images `{%%tag}`: inject drawingML + add `word/media/image_generated_N.png` + relationship entries (see §12.2)
4. Optional post-process hooks by template name
5. `DocxZipWriter.build(entries)` — STORED zip (reuse `DocxWriter` from `DocxKit.swift` or generalize to write `[String: Data]`)

**Phase 1 acceptance:** Unit-style smoke test function (or debug button) loads Air Sample template, sets `{date}` and `{projectNumber}`, writes temp file, opens in Word without corruption.

---

### 12.2 Phase 2 — Loops, images, post-processing

#### Step 2.1 — Loop expansion algorithm

Desktop uses Docxtemplater; you must replicate loop semantics:

1. Parse XML as string (templates are small enough).
2. Regex or scan for `{#name}` … `{/name}` — handle Air Sample 3-row sample groups as one loop iteration spanning multiple `<w:tr>` rows (read template structure in Part 2 of audit / subagent template dump).
3. For each row dictionary in `loops["samples"]`, clone the loop body and replace inner `{tag}` values.
4. Missing keys → empty string (desktop `nullGetter: () => ''` on ZIP path).

#### Step 2.2 — Image embedding

Port sizes from `js/inspector-profile.js`:

| partValue | Max px | Notes |
|---|---|---|
| `photo` | 336×336 | fit aspect, no upscale |
| `image` (signature) | 250×80 | `{%%image}` in Daily Log / VI |

Steps per image:

1. Add PNG bytes to `word/media/image_generated_{n}.png`
2. Add relationship in `word/_rels/document.xml.rels` (or header/footer rels)
3. Replace `{%%tag}` paragraph with `w:drawing` inline anchor — generate minimal OOXML (copy structure from a rendered desktop doc once, or use known snippet)

Signature input: `Inspector.signatureData` → prefix `data:image/png;base64,` if missing.

Photo input: `LogEntryPhoto.imageData` → detect PNG magic (`0x89 0x50`) vs JPEG.

#### Step 2.3 — Post-processors

Create `Support/DocxPostProcessor.swift`:

```swift
enum DocxPostProcessor {
    static func apply(template: DocumentTemplateFile, zip: inout [String: Data], context: DocxPostContext)
}
```

| Template | Function | Port from |
|---|---|---|
| Daily Log | removeEmptyPhotoLogCells + paginatePhotoLogTable | `js/inspector-profile.js:277–348` |
| Worker Roster | colorExpiredDates red `#EE0000` | `js/project.js:1123–1150` |

#### Step 2.4 — Placeholder repair (critical)

Port verbatim from `js/project.js` `repairDocxPlaceholderXml` — seven regex passes. Without this, Bulk/Lead Wipe/Containment templates throw duplicate-tag errors. Test by running desktop `scripts/scan-template-tags.js` equivalents against bundled templates.

**Phase 2 acceptance:** Render Air Sample template with 2 loop rows + footer `{inspectorName}`; render Daily Log with one `{%%photo}`; open in Word.

---

### 12.3 Phase 3 — Air COC end-to-end

#### Step 3.1 — Create `Support/DocumentExportData.swift`

```swift
enum DocumentExportData {
    static func airSampleCOC(
        project: Project,
        samples: [AirSample],
        form: ChainOfCustodyFormData,
        inspector: Inspector?
    ) -> DocxTemplateData
}
```

Port logic from `js/project.js` `printAirSampleForm` (~7380–7525):

- Build `datesCollected` from unique sorted sample dates → one date or range string.
- Map each sample to loop row keys: `sampleID`, `sampleDescription`, `sampleDate`, `startTime`, `stopTime`, `startFlow`, `stopFlow`, `timeElapsed`, `averageFlow`, `sampleVolume`.
- `sampleDescription` = comments else location display (containment + location).
- Merge `form.templateAliases` into scalars: `labNumber`, `lab`, `spectialInstructions` (**typo**), etc.

#### Step 3.2 — Create `Support/ChainOfCustodyFormData.swift`

```swift
struct ChainOfCustodyFormData {
    var inspectorName: String
    var labNumber: String
    var lab: String
    var analysisType: String
    var turnAroundTime: String
    var specialInstructions: String
    var inspectorEmail: String

    var templateAliases: [String: String] { /* Bill, Bill2, Laboratory, laboratory */ }
}
```

#### Step 3.3 — Create `Sheets/AirCOCFormSheet.swift`

Structure (copy `AirSampleFormSheet` + checkbox list pattern):

```swift
struct AirCOCFormSheet: View {
    let project: Project
    @Query private var inspectors: [Inspector]
    @State private var selectedIds: Set<PersistentIdentifier> = []
    @State private var form = ChainOfCustodyFormData(...)
    @State private var isExporting = false
    @State private var shareURL: URL?
    // ...
}
```

**UI sections (exact labels):**

1. Navigation title: **Print Air Sample Request**
2. Footer text: *Select samples and complete the form to generate the lab submission.*
3. **Select Samples to Print** — `Select All` / `Select None` buttons; `Toggle` per sample; subtitle `{type} · {start}-{stop} ({min} min)`; count **N sample(s) selected**.
4. Form fields (see Part 2 §2.7).
5. Analysis `Picker` — rebuild when selection changes:
   - All lead → Flame AA, ICP, ICP M/S
   - Else → PCM: NIOSH 7400, TEM: NIOSH 7402
6. Toolbar: **Cancel** / **Save** (use `SheetScaffold` saveLabel: **Save**)

**On Save validation:**

```swift
guard !selectedSamples.isEmpty else {
    appState.showToast("Please select at least one sample to print.")
    return
}
// If mixed hazards:
appState.showToast("Print Pb air samples separately from Asb air samples.")
```

**On success:**

```swift
appState.showToast("Loading Air Sample template...")  // before render
let data = try DocxTemplater.render(template: .airSample, data: exportData)
let name = "Air_Sample_Request_\(project.projectNumber)_\(dateUnderscored).docx"
// write temp + share sheet
appState.showToast("Air sample request document generated successfully.")
```

Default all samples **selected** on appear.

#### Step 3.4 — Wire `ActiveSheet` + views

**`AppState.swift`:**

```swift
case printAirCOC(Project)
// id: "printAirCOC-\(project.persistentModelID)"
```

**`RootView.swift`:** `case .printAirCOC(let p): AirCOCFormSheet(project: p)`

**`SamplesView.swift`** — add toolbar leading/secondary buttons:

```swift
ToolbarItem(placement: .topBarLeading) {
    HStack {
        Button("Air COC") { appState.present(.printAirCOC(project)) }
            .disabled(project.airSamples.isEmpty)
        // Bulk/Wipe in phases 4
    }
}
```

**`DocumentsView.swift`** — replace single COC row with three rows (Part 3.2). Remove `generateCOC()` scratch path.

#### Step 3.5 — Delete scratch COC

Remove `DocxGenerator.generateCOC` body and helpers used only by it (`buildDocumentXml`, `sampleTable`, etc.) from `DocxKit.swift`. Keep `DocxWriter` ZIP utilities.

**Phase 3 acceptance:** Samples tab **Air COC** → modal → select 1 sample → Share → open in Word → matches desktop field values for same project data.

---

### 12.4 Phase 4 — Bulk and Wipe COC

#### Step 4.1 — Bulk material picker sheet

If `openPrintBulkSamplesModal()` called without material and multiple materials have bulk samples, show **`Select Material`** sheet first (port `js/project.js:2392–2422`):

- Title: **Select Material**
- Text: *Select the material whose bulk samples you want to print.*
- Picker of material names → on Save, open bulk COC with that material's samples filtered.

#### Step 4.2 — `DocumentExportData.bulkSampleCOC`

- Filter `project.bulkSamples` where `materialName` matches and `selectedIds` contains sample.
- Loop `{#samplesBulk}`: `{projectNumber}-{sampleID}`, `{sampleDescription}` = `{location} — {comments}`.
- Default `analysisType`: `PLM - Standard` (asbestos) or lead list.

**Mixed hazard guard:** disable analysis + toast `Select samples with the same hazard (asbestos or lead) before printing.`

#### Step 4.3 — `Sheets/BulkCOCFormSheet.swift`

- Title: **Print Bulk Sample Chain of Custody**
- Intro includes **Material: {name}**.
- Filename: `Bulk_Sample_COC_{projectNumber}_{sanitizedMaterial}_{date}.docx`

#### Step 4.4 — Wipe COC

- Title: **Print Lead Wipe Chain of Custody**
- Loop `{#samplesWipe}` two-row structure — port `formatWipeSampleTypeForCoc`, `resolveWipeContainmentName`.
- Scalars use `dateCollected`, `Bill2`, `laboratory`, `clientName`, `siteName`.
- Hide Wipe COC when no lead materials (`HazardSummary.projectHasLead(project)`).

#### Step 4.5 — Wire buttons

- `ActiveSheet.printBulkCOC(Project, materialName?)`, `printWipeCOC(Project)`
- Samples toolbar **Bulk COC** / **Wipe COC**
- Documents three cards tap → same sheets

**Phase 4 acceptance:** Bulk and Wipe DOCX open in Word; filenames correct.

---

### 12.5 Phase 5 — Worker roster export

#### Step 5.1 — `DocumentExportData.workerRoster`

Port `buildWorkerRosterTemplateData` (`js/project.js:8245–8379`):

1. Collect distinct daily log dates (sorted), take first **10** → `date1`…`date10` formatted `MM-dd yyyy`.
2. For each worker, compute `mark1`…`mark10` = `"X"` or `""` by presence on that date (match worker id or case-insensitive name in `log.workerNames`).
3. Paired exp/expired fields with `isDateExpired` — only one populated per cert column.
4. Include header scalars: `{client}`, `{pjNumber}`.

#### Step 5.2 — Export function

```swift
static func exportWorkerRoster(project: Project) throws -> Data {
    var data = DocumentExportData.workerRoster(project: project)
    var zip = try DocxTemplater.renderRaw(...) // or render + post-process
    DocxPostProcessor.apply(template: .workerRoster, zip: &zip, context: ...)
    return DocxZipWriter.build(zip)
}
```

#### Step 5.3 — `TeamView.swift`

Add toolbar button:

```swift
Button("Export roster") {
    // guard !roster.isEmpty else { showToast("Add workers to the roster before exporting."); return }
    appState.showToast("Generating worker roster…")
    // async export → share
    appState.showToast("Worker roster exported.")
}
.disabled(project.workerRoster.isEmpty)
```

Filename: `{projectNumber}_Worker_Roster.docx` with non-word chars → `_`.

**Phase 5 acceptance:** Expired cert dates appear red in Word; X marks on attendance columns.

---

### 12.6 Phase 6 — Daily log export + log UX

#### Step 6.1 — Model addition (additive)

```swift
// DailyLog.swift — add optional field with default
var activeContainments: [String] = []  // snapshot at log save time
```

On save in `DailyLogFormSheet`, populate via `ActiveContainmentNames.forLog(project, log)` (port `getActiveContainmentNamesForLog`).

#### Step 6.2 — Per-containment negative pressure (optional structured)

Either:

- **A)** Extend `LogEntry` with `@Relationship` child `NegativePressureReading(containmentName, pressure)`, or
- **B)** Keep `negativePressureNotes` but build UI as dynamic fields per active containment (port `buildNegativePressureHtml`).

Export aggregates to `{negativePressure}` sentence (Part 2 §2.11).

#### Step 6.3 — `DocumentExportData.dailyLog`

Port `printDailyLog` (`js/project.js:7531–7765`) + ZIP fixes from `js/main.js:1683` for photos:

- Photos: JPEG/PNG → `data:image/jpeg;base64,...` prefix mandatory.
- `logEntries` loop: `{time}` HHMM, `{description}`, `{photoNumber}` range logic.
- `photoLogRows`: pair `{number}` + `{%%photo}` in col1/col2; omit `col2` key when odd count.
- `{%%image}` from signature lookup by log inspector name.

#### Step 6.4 — Photo gallery on `DailyLogDetailView`

Add navigation or sheet: tap entry photo count → scroll `LogEntryPhoto` images (reuse `ScannedDocumentViewer` pattern).

#### Step 6.5 — Export entry point

- Optional: swipe action **Print** on log row → single log export.
- Required for phase 8: callable from ZIP builder.

Filename single: `Daily_Log_{projectNumber}_{MM_DD_YYYY}.docx`

**Phase 6 acceptance:** Daily log with 3 photos exports; photo log grid paginates; signature appears.

---

### 12.7 Phase 7 — Visual Inspection + Containment Summary (ZIP-only builders)

#### Step 7.1 — `DocumentExportData.visualInspection`

Input: `Project`, `Containment`, `VisualInspection` (passed Pre-Start or Final only).

Scalars: `{typeOfInspection}`, `{finding}` Pass/Fail, `{containmentLocation}`, `{comments}`, `{inspectorInitials}`, `{inspectorName}`, `{date}`, `{client}`, `{contractor}`, `{projectNumber}`, `{%%image}`.

Output filenames:

- `Pre-Start Visual Inspection.docx`
- `Final Visual Inspection.docx`

#### Step 7.2 — `DocumentExportData.containmentSummary`

Port `js/main.js:2006–2094`:

- Stage history → dates/initials for milestone columns.
- `matRemList` from spaces/materials quantities with locale number format.
- `totalMatList` aggregated from containment materials.

**Phase 7 acceptance:** Functions return Data; tested via Phase 8 ZIP.

---

### 12.8 Phase 8 — Project ZIP export

#### Step 8.1 — Create `Support/ProjectZipExporter.swift`

```swift
enum ProjectZipExporter {
    static func export(project: Project, inspector: Inspector?) async throws -> (data: Data, fileCount: Int)
}
```

Algorithm (mirror `downloadArchivedProject` in `js/main.js:1348+`):

```
filesAdded = 0
for each dailyLog in project.dailyLogs (array order):
    blob = dailyLogDocx(log) → add "Daily Logs/Daily_Log_{date}.docx"

if !project.workerRoster.isEmpty:
    blob = workerRosterDocx → add "Worker Roster/Worker_Roster.docx"

for each containment in project.containments:
    folder = "\(containment.name) Containment/"  // use containmentDisplayName stripping
    if passed Pre-Start VI exists: add "Pre-Start Visual Inspection.docx"
    if passed Final VI exists: add "Final Visual Inspection.docx"
    always: add "Containment Summary.docx"

if filesAdded == 0: throw noDocuments

return STORED zip named "{projectNumber}.zip"
```

Use shared `ZipKit.write` pattern from `XLSXKit.swift`.

Skip null blobs silently (desktop behavior).

#### Step 8.2 — Create `Sheets/ProjectFilesExportSheet.swift`

Clone structure from `ExcelExportSheet`:

1. Title: **Download project files** (or navigation title matching Edit menu)
2. States: `Preparing project files for download...` → progress → share
3. Toasts: `Creating ZIP with N files...`, `Project files downloaded successfully (N documents).`
4. Empty error: `No documents found to download.`

#### Step 8.3 — Wire entry points

**`ProjectDetailView` Edit menu:** `Button("Download project files") { appState.present(.downloadProjectFiles(project)) }`

**`ArchiveView`:** swipe or context menu **Download** on each row.

**`ActiveSheet`:** `case downloadProjectFiles(Project)`

**Phase 8 acceptance:** Project with 1 log + 1 containment produces ZIP; extracts open in Word.

---

### 12.9 Phase 9 — Archive gate + unarchive + material progress

#### Step 9.1 — Create `Support/ProjectArchiveGate.swift`

Port:

- `calculateMaterialCompletion(project)` — `js/main.js` / `js/shell.js`
- `projectArchiveGate(project) -> Result<Void, ArchiveGateFailure>` with messages:
  - All containments must be Abatement Completed
  - 100% materials abated
  - Materials assigned

#### Step 9.2 — Update `ProjectDetailView` Mark completed

Replace direct toggle:

```swift
Button(project.status == .completed ? "Reopen project" : "Mark completed") {
    if project.status == .completed {
        project.status = .active  // or use unarchive flow
    } else {
        switch ProjectArchiveGate.validate(project) {
        case .success:
            // confirmationDialog: Archive "{siteName}"? This will mark the project as completed.
            project.status = .completed
        case .failure(let reason):
            appState.showToast(reason.localizedDescription)
        }
    }
}
```

#### Step 9.3 — `ArchiveView` unarchive

```swift
Button("Unarchive") {
    project.status = .active
    try? modelContext.save()
}
```

#### Step 9.4 — Material progress UI

On `ProjectDetailView`, add `ProgressBarView(percent: materialCompletion)` using gate calculation (not only stage-based `percentComplete`).

**Phase 9 acceptance:** Cannot complete project until gate passes; progress bar reflects materials.

---

### 12.10 Phase 10 — Regulated area + auto wipes + neg. pressure

#### Step 10.1 — Model

```swift
// Containment.swift
var regulatedArea: Bool = false
```

#### Step 10.2 — UI

- `GatedStageChangeSheet`: when `viType == .preStart`, add Toggle **Regulated Area** + hint text from desktop VI modal.
- `ContainmentFormSheet`: show read-only regulated flag or toggle if editing.

#### Step 10.3 — Business logic changes

**`GatedStageChangeSheet.save()`:**

```swift
if passed && targetStage == .containmentClearance && !containment.regulatedArea {
    autoCreateClearanceSamples()  // existing
}
// Skip samples when regulatedArea == true
```

**Create `Support/AutoSampleCreation.swift`:**

Port from `js/project.js`:

- `createClearanceWipeSample(containment:project:inspection:)` — on Final VI pass + lead materials
- `createPreAbatementWipeSample(containment:project:)` — on containment create if `isWashoeClient(project.clientName)` + lead

Call pre-abatement wipe from `ContainmentFormSheet` save when stage is Preparation.

**Washoe detection:** port `isWashoeClient` — match client name contains "Washoe" / "Washoe County School District" per desktop.

#### Step 10.4 — Fix stage bypass

In `ContainmentFormSheet`, **remove** Stage picker OR disable it with footer: *Use Set stage on the containment card to change stage.*

**Phase 10 acceptance:** Regulated containment gets no auto air samples; Washoe project gets pre-start wipe; clearance wipe on Final pass.

---

### 12.11 Phase 11 — Polish and remaining gaps

| Task | Instructions |
|---|---|
| Wire `newBulkSampleFromMaterial` | In `MaterialsView` context menu, call `appState.present(.newBulkSampleFromMaterial(project, name, hmr))` |
| Wire `newVisualInspection` | Add **Add inspection** on containment card → `newVisualInspection` |
| Fix Documents count | `ProjectDetailView` section link count = `scannedDocuments.count` |
| Call `SeedData.populateIfNeeded` | In `OversightApp.init` or `.onAppear` in `RootView` when projects empty and first launch |
| Due date field | Add `DatePicker` optional to `ProjectFormSheet`; bind `project.dueDate` |
| Import workers from Excel | New sheet reads Worker Roster sheet from exported xlsx |
| Excel import merge | If project number exists, confirm update vs create new |
| Lead cert expiry | Extend `Worker.hasExpiredCertification` + Today attention |
| Hide Wipe tab | In `SamplesView`, if `!HazardSummary.projectHasLead(project)` hide wipe segment |

---

### 12.12 Phase 12 (optional) — Default templates auto-generate

In `ProjectDetailView` when archive succeeds:

```swift
let templates = inspectors.first?.defaultTemplates ?? []
if templates.contains(.dailyLog) { /* generate all logs */ }
// etc. — or call ProjectZipExporter directly
```

Read selections from `Inspector.defaultTemplates` (already saved by `DefaultTemplatesSheet`).

---

### 12.13 Hazard summary helper

Create `Support/HazardSummary.swift`:

```swift
enum HazardSummary {
    static func projectHasLead(_ project: Project) -> Bool
    static func projectHasAsbestos(_ project: Project) -> Bool
    static func hazardLabel(for sample: BulkSample) -> String  // Asb / Pb / Asb+Pb
}
```

Port rules from `getProjectHazardSummary` / material hazard flags in `js/project.js`. Until material hazard fields exist, infer from wipe samples / air sample hazard types / material names heuristic (match desktop fallback).

---

### 12.14 Document export share helper (reuse everywhere)

Add to `Support/DocumentExport.swift`:

```swift
enum DocumentExport {
    static func writeTemporary(data: Data, fileName: String) throws -> URL
    static func sanitizeFileName(_ s: String) -> String
}

struct DocumentShareSheet: View {
    let url: URL
    let onDismiss: () -> Void
    // wraps ShareSheetView + onDisappear delete temp file
}
```

Every COC/roster/log export uses this — never duplicate temp file logic.

---

### 12.15 Testing script for agents without Xcode

If Swift compiler unavailable:

1. Verify all new files exist under `ios/Oversight/Oversight/`.
2. Run `python3 ios/generate_pbxproj.py` — must succeed.
3. Grep new symbols referenced from `RootView` / `AppState`.
4. Cross-check exported JSON field names against desktop template tag list (Part 2 §2.11 / `js/project.js`).
5. Human tester runs Xcode build on device.

---

### 12.16 Commit strategy

One commit per phase (§Part 9 table). PR description lists which checklist items from Part 8 are now passable.

**Do not** mix phase 3 UI with phase 8 ZIP in one commit — reviewers cannot bisect failures.

---

### 12.17 Quick reference — desktop function → Swift home

| Desktop (`js/project.js` / `js/main.js`) | Swift destination |
|---|---|
| `printAirSampleForm` | `DocumentExportData.airSampleCOC` + `AirCOCFormSheet` |
| `printBulkSampleForm` | `DocumentExportData.bulkSampleCOC` + `BulkCOCFormSheet` |
| `printWipeSampleForm` | `DocumentExportData.wipeSampleCOC` + `WipeCOCFormSheet` |
| `printDailyLog` | `DocumentExportData.dailyLog` |
| `exportWorkerRosterDoc` | `DocumentExportData.workerRoster` + Team export |
| `downloadArchivedProject` | `ProjectZipExporter.export` |
| `generateDocBlob` | `DocxTemplater.render` |
| `repairDocxPlaceholderTags` | `DocxTemplater.repairPlaceholderTags` |
| `buildWorkerRosterTemplateData` | `DocumentExportData.workerRoster` |
| `getActiveContainmentNamesForLog` | `ActiveContainmentNames.forLog` |
| `projectArchiveGate` | `ProjectArchiveGate.validate` |
| `calculateMaterialCompletion` | `ProjectArchiveGate.materialCompletion` |
| `createClearanceWipeSample` | `AutoSampleCreation.clearanceWipe` |
| `createPreAbatementWipeSample` | `AutoSampleCreation.preAbatementWipe` |
| `openPrintAirSamplesModal` | `AirCOCFormSheet` UI |
| `createSignatureImageModule` | `DocxTemplater` image embedding sizes |

---

*This audit reflects the repo at `main` with iOS app under `ios/Oversight/`. Re-run gap analysis after each phase by checking off items in Parts 1, 7, and 8.*
