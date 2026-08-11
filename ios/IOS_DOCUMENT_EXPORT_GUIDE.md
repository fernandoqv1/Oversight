# iOS Document Export — Xcode Implementation Guide

Reference for bringing Oversight iOS document generation to **full parity** with the Windows desktop app (`js/project.js`, `js/main.js`, `templates/*.docx`).

**Principles for this port**

- **Keep iOS styling** — grouped lists, `SheetScaffold`, `EmptyStateView`, `.groupedListStyle()`, accent colors, capsule badges, monospaced project numbers. Do not copy the desktop HTML layout.
- **Match desktop wording and behavior** — button labels, modal titles, field labels, placeholders, validation messages, success/error toasts, filename patterns, and data logic must match Windows.
- **Preserve iOS-only features** — inspector profile QR import (`InspectorQRScanSheet`), document scanning (`DocumentScannerSheet`), Excel import/export (`XLSXKit`), appearance settings. Do not remove these.
- **Use the real Word templates** — the current `DocxGenerator.generateCOC()` builds a simplified custom document. Replace it with template filling so output matches what Word produces on Windows.

---

## Table of contents

1. [Current state vs target](#1-current-state-vs-target)
2. [Recommended architecture](#2-recommended-architecture)
3. [Xcode project setup](#3-xcode-project-setup)
4. [Files to add or change](#4-files-to-add-or-change)
5. [UI placement and exact wording](#5-ui-placement-and-exact-wording)
6. [Shared export infrastructure](#6-shared-export-infrastructure)
7. [Document type specifications](#7-document-type-specifications)
8. [Project ZIP export](#8-project-zip-export)
9. [Styling rules (do not change)](#9-styling-rules-do-not-change)
10. [Features to preserve](#10-features-to-preserve)
11. [Testing checklist](#11-testing-checklist)
12. [Implementation phases](#12-implementation-phases)
13. [Desktop source index](#13-desktop-source-index)

---

## 1. Current state vs target

### What iOS has today

| Feature | Status | Location |
|---|---|---|
| Simplified air COC (.docx from scratch) | Partial — wrong layout | `Support/DocxKit.swift`, `Views/DocumentsView.swift` |
| Bulk / wipe COC | Missing | — |
| Daily log Word export | Missing | — |
| Visual inspection Word export | Missing | — |
| Containment summary Word export | Missing | — |
| Worker roster Word export | Missing | — |
| Project files ZIP | Missing | — |
| COC sample-picker modals | Missing | — |
| Excel export/import | Done | `Sheets/ExcelExportSheet.swift`, `Support/XLSXKit.swift` |
| Document scanning | Done | `Sheets/DocumentScannerSheet.swift` |
| Profile QR import | Done | `Sheets/InspectorQRScanSheet.swift` |
| Default templates prefs UI | UI only — not wired to generation | `Sheets/DefaultTemplatesSheet.swift` |

### What Windows has (the target)

| Document | Template file | Trigger (desktop) |
|---|---|---|
| Air sample COC | `Air Sample Template.docx` | Samples tab → **Air COC**; Docs tab → **Air sample chain of custody** |
| Bulk sample COC | `Bulk Sample Template.docx` | Samples tab → **Bulk COC**; Docs tab → **Bulk chain of custody** |
| Lead wipe COC | `Lead Wipe Template.docx` | Samples tab → **Wipe COC**; Docs tab → **Lead wipe chain of custody** |
| Daily log | `Daily Log Template.docx` | ZIP export only (legacy Print button exists but is hidden) |
| Visual inspection | `Visual Inspection Template.docx` | ZIP export only (passed Pre-Start / Final) |
| Containment summary | `Containment Summary Template.docx` | ZIP export only (one per containment) |
| Worker roster | `Worker Roster Template.docx` | Workers tab → **Export roster**; ZIP export |
| Project ZIP | — | Dashboard/archive → **Download project files** |

Desktop Docs tab subtitle (use this on iOS Documents screen):

> Print lab submission forms during the project. Daily logs, visual inspections, and containment summaries are generated when you export or archive the project.

---

## 2. Recommended architecture

### Do not keep building documents from scratch

Delete or replace the body of `DocxGenerator.generateCOC()` once template rendering works. The desktop app fills pre-authored `.docx` files; iOS should do the same.

### Template engine (pure Swift, no third-party deps)

Implement in `Support/DocxTemplater.swift` (new file):

1. **Load template** from app bundle (`Bundle.main.url(forResource:withExtension:subdirectory:)`).
2. **Unzip** the `.docx` (ZIP with DEFLATE or STORED — templates from repo use DEFLATE; your writer can emit STORED like `XLSXKit`).
3. **Repair split placeholders** (optional if you rewrite XML cleanly; required if you keep shipped templates unchanged). Port the seven repair passes from `js/project.js` lines ~1039–1104 (`repairDocxPlaceholderTags`).
4. **Render** scalar tags `{key}`, loops `{#items}…{/items}`, conditionals `{#key}…{/key}`, and image tags `{%%image}` / `{%%photo}`.
5. **Post-process** for Daily Log (photo pagination, empty cell removal) and Worker Roster (red expired dates).
6. **Re-zip** and return `Data`.

### Image embedding

Match `js/inspector-profile.js` → `createSignatureImageModule()`:

| Tag | Max size (px) | Notes |
|---|---|---|
| `{%%image}` | 250 × 80 | Inspector signature PNG from `Inspector.signatureData` |
| `{%%photo}` | 336 × 336 (3.5″) | Preserve aspect ratio; daily log photos from `LogEntryPhoto.imageData` |

Signature lookup: use the inspector named on the form / log / inspection. Encode as `data:image/png;base64,…` before passing to the image module.

### Share pattern (already established)

Follow `ExcelExportSheet` + `DocumentsView.generateCOC()`:

1. Write temp file under `FileManager.default.temporaryDirectory`.
2. Present `ShareSheetView` (`UIActivityViewController`).
3. Delete temp file on sheet dismiss.

For multi-step flows (building ZIP), show `ProgressView` + status text like Excel export (“Building spreadsheet…” → “Spreadsheet ready”).

---

## 3. Xcode project setup

### Copy templates into the app bundle

1. Create folder: `ios/Oversight/Oversight/Templates/`
2. Copy all seven files from repo root `templates/`:

   ```
   Air Sample Template.docx
   Bulk Sample Template.docx
   Containment Summary Template.docx
   Daily Log Template.docx
   Lead Wipe Template.docx
   Visual Inspection Template.docx
   Worker Roster Template.docx
   ```

3. Register them as **bundle resources**.

### Option A — Manual in Xcode (simplest)

1. Drag `Templates/` into the Oversight target in Xcode.
2. Check **Copy items if needed** and **Add to targets: Oversight**.
3. Verify **Build Phases → Copy Bundle Resources** lists all seven `.docx` files.

### Option B — Extend `generate_pbxproj.py` (recommended for repo consistency)

The script at `ios/generate_pbxproj.py` currently registers only `.swift` and `.xcassets`. Extend it to also register `.docx` under a `Templates` folder in the **Resources** build phase (mirror `register_asset_catalog`).

After adding Swift files or templates:

```bash
python3 ios/generate_pbxproj.py
```

Then reopen the project in Xcode.

### Loading templates in code

```swift
enum DocumentTemplateFile: String, CaseIterable {
    case airSample = "Air Sample Template"
    case bulkSample = "Bulk Sample Template"
    case containmentSummary = "Containment Summary Template"
    case dailyLog = "Daily Log Template"
    case leadWipe = "Lead Wipe Template"
    case visualInspection = "Visual Inspection Template"
    case workerRoster = "Worker Roster Template"

    var bundleURL: URL? {
        Bundle.main.url(forResource: rawValue, withExtension: "docx", subdirectory: "Templates")
    }
}
```

---

## 4. Files to add or change

### New Swift files (suggested)

| File | Purpose |
|---|---|
| `Support/DocxTemplater.swift` | Unzip, placeholder repair, render, image embed, re-zip |
| `Support/DocxZipReader.swift` | Read DEFLATE/STORED ZIP (can share logic with `XLSXKit.ZipKit`) |
| `Support/DocumentExportData.swift` | Pure functions: build template data dictionaries for each doc type |
| `Support/DocumentFormatters.swift` | `formatDateMMDDYYYY`, `formatTimeHHMM`, initials, containment display name, etc. |
| `Sheets/AirCOCFormSheet.swift` | Sample picker + lab form modal |
| `Sheets/BulkCOCFormSheet.swift` | Material picker (if needed) + sample picker + lab form |
| `Sheets/WipeCOCFormSheet.swift` | Sample picker + lab form |
| `Sheets/ProjectFilesExportSheet.swift` | ZIP builder + progress + share |

### Existing files to modify

| File | Changes |
|---|---|
| `Support/DocxKit.swift` | Replace `generateCOC` with template-based API, or delete generator and keep only ZIP helpers |
| `Views/DocumentsView.swift` | Restructure to match desktop Docs tab (COC cards + subtitle); remove simplified COC |
| `Views/SamplesView.swift` | Add filter-bar COC buttons (Air / Bulk / Wipe) |
| `Views/TeamView.swift` | Add **Export roster** button |
| `Views/DailyLogsView.swift` | Optional: per-log export if you want parity with hidden desktop Print |
| `Views/ProjectDetailView.swift` | Add **Download project files** to Edit menu |
| `Views/ArchiveView.swift` | Optional: download action on completed projects |
| `Support/AppState.swift` | New `ActiveSheet` cases for COC modals and project ZIP export |
| `Views/RootView.swift` | Wire new sheets |
| `Models/Enums.swift` | Align `DocumentTemplate.summary` strings with desktop Docs cards if desired |

### Do not edit by hand

`Oversight.xcodeproj/project.pbxproj` — regenerate with `generate_pbxproj.py` after file changes.

---

## 5. UI placement and exact wording

Use **SwiftUI list/section patterns already in the app**. Only change **text and actions**.

### 5.1 Samples tab (`SamplesView.swift`)

Add a toolbar or section above the segmented control mirroring desktop filter bar (`js/shell.js` ~1396):

| Button | Visibility | Action |
|---|---|---|
| **Air COC** | Always; disabled if `project.airSamples.isEmpty` | Present `AirCOCFormSheet` |
| **Bulk COC** | If `!project.bulkSamples.isEmpty` | Present `BulkCOCFormSheet` (may need material picker first) |
| **Wipe COC** | If project has lead materials AND wipe samples | Present `WipeCOCFormSheet` |

Style: use `.buttonStyle(.bordered)` or a `Section` with horizontal `Button`s — match existing ghost-button feel (secondary label, not primary filled).

### 5.2 Documents tab (`DocumentsView.swift`)

Replace the single “Generate Chain of Custody” row with a **Chain of custody** section matching desktop:

**Page header subtitle** (below navigation title or as section footer):

> Print lab submission forms during the project. Daily logs, visual inspections, and containment summaries are generated when you export or archive the project.

**Three template cards** (use existing list row pattern — icon + title + caption, not prototype CSS grid):

| Title | Caption pattern | Disabled when |
|---|---|---|
| Air sample chain of custody | `{n} air sample(s) · lab submission / pump request.` | No air samples |
| Bulk chain of custody | `{n} bulk sample(s) · material COC form.` | No bulk samples |
| Lead wipe chain of custody | `{n} wipe sample(s) · lead wipe COC form.` | No wipe samples OR no lead materials |

Keep the **Scanned · N** section unchanged.

Remove toolbar menu item “Generate Chain of Custody”; keep **Scan Document**.

### 5.3 Workers tab (`TeamView.swift`)

Add toolbar button (desktop: filter bar right side):

- Label: **Export roster**
- Icon: `doc.text` (desktop uses doc icon)
- Disabled when `project.workerRoster.isEmpty`
- Action: generate `Worker Roster Template.docx` and share

Optional footer on worker cards with expired certs (desktop `js/shell.js` ~1958):

> Expired: {labels} — expired dates export in **red** on the roster document.

### 5.4 Project Edit menu (`ProjectDetailView.swift`)

Add after **Export to Excel**:

- **Download project files** — opens `ProjectFilesExportSheet` (ZIP)

Match desktop tooltip: “Download project files (Word documents ZIP)”.

### 5.5 Toasts (`AppState.showToast`)

Use desktop strings verbatim where listed in [§7](#7-document-type-specifications). iOS already uses short toast capsules — keep that styling.

---

## 6. Shared export infrastructure

### 6.1 Date/time formatters

Port to `DocumentFormatters.swift`. All dates use **local calendar**, not UTC.

```swift
/// MM/dd/yyyy — desktop standard for COC and most docs
static func formatDateMMDDYYYY(_ date: Date) -> String

/// From "YYYY-MM-DD" string or Date; append local midnight for string parsing
static func formatDateMMDDYYYY(from dateString: String) -> String

/// "HH:MM" → "HHMM" for daily log times (no colon)
static func formatTimeHHMM(_ time: String) -> String

/// First + last initial; middle names ignored
static func initials(from name: String) -> String

/// Today as yyyy-MM-dd (for dateCollected ranges)
static func todayLocalYYYYMMDD() -> String
```

**Critical:** Desktop parses date-only strings with `new Date(dateString + 'T00:00:00')` (local). Swift equivalent:

```swift
Calendar.current.date(from: DateComponents(...)) // or
ISO8601DateFormatter with local timezone for yyyy-MM-dd input
```

### 6.2 Containment display name

Use **suffix-stripping** logic (`js/project.js:70`), not the dashboard double-suffix bug (`js/main.js:44`):

```swift
static func containmentDisplayName(_ name: String?) -> String {
    let base = (name ?? "Containment").trimmingCharacters(in: .whitespaces)
        .replacingOccurrences(of: "\\s+Containment$", with: "", options: .regularExpression)
    return base.isEmpty ? "Containment" : "\(base) Containment"
}
```

### 6.3 Unit display

```swift
// SF → ft², CF → ft³, LF → LF, EA → EA
static func displayUnit(_ unit: MaterialUnit) -> String
```

### 6.4 Chain-of-custody alias block

One lab account fans out to multiple template keys (`js/project.js:1002`):

```swift
struct ChainOfCustodyFormData {
    var inspectorName: String
    var labNumber: String      // Bill / lab account
    var lab: String            // laboratory name
    var analysisType: String
    var turnAroundTime: String
    var specialInstructions: String
    var inspectorEmail: String

    var templateAliases: [String: String] {
        [
            "labNumber": labNumber,
            "lab": lab,
            "Bill": labNumber,
            "Bill2": labNumber,
            "Laboratory": lab,
            "laboratory": lab,  // Lead Wipe template spelling
        ]
    }
}
```

**Preserve template typo:** key must be `spectialInstructions` (not “special”).

### 6.5 Expired credential logic (worker roster)

```swift
/// Expired = end of that calendar day already passed
static func isDateExpired(_ date: Date?) -> Bool {
    guard let date else { return false }
    let endOfDay = Calendar.current.date(bySettingHour: 23, minute: 59, second: 59, of: date)!
    return endOfDay < Date()
}
```

Roster row uses **paired fields** — only one populated per credential:

- Valid date → `aheraExp` filled, `aheraExpired` empty
- Expired date → `aheraExpired` filled, `aheraExp` empty

Then post-render: color matching date strings `#EE0000` in document XML (or set red run directly in native writer).

### 6.6 Elapsed minutes (air COC)

```swift
static func calculateTimeElapsed(start: String, stop: String) -> Int? {
    // "HH:MM" → minutes; wrap past midnight if stop < start
}
```

### 6.7 Sample volume (air COC)

```swift
averageFlow = (startFlow + stopFlow) / 2
sampleVolume = averageFlow * timeElapsed  // liters, 2 decimal places, only if timeElapsed > 0
```

### 6.8 Share + filename helper

```swift
enum DocumentExport {
    static func share(data: Data, fileName: String) -> URL { ... }
    static func sanitizeFileName(_ name: String) -> String { ... }
}
```

---

## 7. Document type specifications

For each type: **modal → template → data → filename → toasts**.

Desktop reference functions are in `js/project.js` unless noted.

---

### 7.1 Air Sample Chain of Custody

**Modal title:** `Print Air Sample Request`

**Intro:** Select samples and complete the form to generate the lab submission.

**Sample picker**

- Label: **Select Samples to Print**
- Links: **Select All** / **Select None**
- Count: **`N` sample(s) selected**
- All checkboxes **checked by default**
- Row title: `sampleId`
- Row subtitle: `{type} · {startTime} - {stopTime} ({elapsed} min)` or `--:--` if missing

**Form fields**

| Label | Default |
|---|---|
| Collected By | First air sample’s inspector, else profile name |
| Bill 2 / Lab Account Number | empty, placeholder `e.g., LAB-001` |
| Send Results To (Email) | profile email, placeholder `email@example.com` |
| Laboratory | empty, placeholder `e.g., FACS, EMSL` |
| Type of Analysis | dynamic (below) |
| Turn Around Time | empty, placeholder `e.g., 24-Hour, 5-Day` |
| Special Instructions | textarea, placeholder `Optional special instructions for the lab...` |

**Analysis dropdown**

- All selected samples lead → `Flame AA`, `ICP`, `ICP M/S` (default `Flame AA`)
- Otherwise asbestos → `PCM: NIOSH 7400`, `TEM: NIOSH 7402` (default `PCM: NIOSH 7400`)

**Validation toasts**

- `No air samples to print.`
- `Please select at least one sample to print.`
- `Print Pb air samples separately from Asb air samples.`

**Template:** `Air Sample Template.docx`

**Header/footer scalars**

| Key | Value |
|---|---|
| `date` | `formatDateMMDDYYYY(today)` |
| `projectNumber` | project number |
| `inspectorName` | form Collected By |
| `labNumber` | form lab account |
| `datesCollected` | unique sample dates sorted; one date or `MM/DD/YYYY - MM/DD/YYYY` |
| `analysisType` | form value, default `PCM: NIOSH 7400` |
| `lab` | form laboratory name |
| `turnAroundTime` | form value |
| `siteName` | site name |
| `spectialInstructions` | form special instructions |
| `inspectorEmail` | form email |

**Loop `{#samples}`** — one 3-row group per sample, **project.airSamples filter order** (selection order):

| Key | Source |
|---|---|
| `sampleID` | `sampleId` |
| `sampleDescription` | comments, else `{containmentDisplayName} \| {location}` fallback chain |
| `sampleDate` | `formatDateMMDDYYYY(sample.date)` |
| `startTime` / `stopTime` | raw `HH:MM` strings |
| `startFlow` / `stopFlow` | flow rates as strings |
| `timeElapsed` | minutes as string |
| `averageFlow` | 2 dp |
| `sampleVolume` | 2 dp liters |

**Filename**

```
Air_Sample_Request_{projectNumber}_{MM_DD_YYYY}.docx
```

(slashes in date → underscores)

**Toasts**

- Loading: `Loading Air Sample template...`
- Success: `Air sample request document generated successfully.`
- Failure: `Failed to generate document. Check the console for details.`

---

### 7.2 Bulk Sample Chain of Custody

**Pre-step:** If no `materialId` and multiple materials have bulk samples → modal **Select Material** with copy:

> Select the material whose bulk samples you want to print.

**Modal title:** `Print Bulk Sample Chain of Custody`

**Intro:** Material: **{name}**. Select samples and complete the form...

**Sample row subtitle:** `Bulk {Asb|Pb|Asb+Pb} · {location}`

**Analysis dropdown**

- All lead → Flame AA / ICP / ICP M/S
- All asbestos → `PLM - Standard`, `PCM: NIOSH 7400`, `TEM: NIOSH 7402`
- Mixed hazards → disabled; toast `Select samples with the same hazard (asbestos or lead) before printing.`

**Template:** `Bulk Sample Template.docx`

**Loop `{#samplesBulk}`** — one row per sample:

| Key | Value |
|---|---|
| `projectNumber` | literal in cell before `{sampleID}` |
| `sampleID` | `sampleId` |
| `sampleDescription` | `{location} — {comments}` (em dash) joined non-empty parts |

**Default analysisType:** `PLM - Standard`

**Filename**

```
Bulk_Sample_COC_{projectNumber}_{sanitizedMaterialName}_{MM_DD_YYYY}.docx
```

(non-alphanumeric in material name → `_`)

**Toasts**

- `No bulk samples to print.` / `No bulk samples for this material.`
- Success: `Bulk sample COC document generated successfully.`

---

### 7.3 Lead Wipe Chain of Custody

**Modal title:** `Print Lead Wipe Chain of Custody`

**Template:** `Lead Wipe Template.docx`

Note: template header title still reads **Bulk Material Analysis Request Form** — reproduce literally.

**Scalars (Lead-specific names)**

| Key | Value |
|---|---|
| `dateCollected` | date range (not `datesCollected`) |
| `Bill2` | lab account (capital B) |
| `laboratory` | lab name (not `lab`) |
| `clientName` / `siteName` | Job Site cell: `{clientName} – {siteName}` (en dash) |
| `projectNumber` | under **Job ID:** |

**Loop `{#samplesWipe}`** — two rows per sample:

| Key | Value |
|---|---|
| `sampleID` | sample id |
| `quantity` | square feet |
| `sampleType` | Pre-Start / Clearance / Custom via `formatWipeSampleTypeForCoc` |
| `substrate`, `component` | fields |
| `containmentName`, `buildingName`, `spaceName`, `locationComment` | row 2: `{containment} \| {building} \| {space} – {comment}` |

**Default analysisType:** `Flame AA`

**Filename**

```
Lead_Wipe_COC_{projectNumber}_{MM_DD_YYYY}.docx
```

**Special error toast** (placeholder corruption):

> Lead wipe template has broken placeholders (often in the footer). Restart the app, then try again. If it persists, re-save templates/Lead Wipe Template.docx from the repo copy.

---

### 7.4 Daily Log

**Template:** `Daily Log Template.docx`

**Trigger on iOS:** Include in project ZIP; optionally add **Print** on `DailyLogDetailView` for single-log export.

**Key scalars**

| Key | Source |
|---|---|
| `date`, `projectNumber`, `inspectorInitials` | log + project |
| `client`, `contact` | `clientName`, `clientContactName` |
| `clientPhone` | `clientContactPhone` fallback `clientPhone` (use ZIP path logic) |
| `clientFax`, `contractorFax` | `""` |
| `projectSite`, `workLocation` | site name; active containments or `No active containments` |
| `contractor`, `personnelCount` | contractor; `workersOnSite` |
| `contractorPhone` | `foremanPhone` fallback `contractorPhone` |
| `negativePressure` | aggregated prose sentence (see desktop `js/project.js` ~7661) |
| `inspectorName`, `{%%image}` | log inspector + signature |

**Loop `{#logEntries}`**

| Key | Value |
|---|---|
| `time` | `formatTimeHHMM(entry.time)` |
| `description` | `entry.note` |
| `photoNumber` | `""`, `"3"`, `"3, 4"`, or `"3-7"` range |

**Loop `{#samples}`** (air samples that day)

| Key | Value |
|---|---|
| `sampleNumber` | `sampleId` |
| `sampleDescription` | location display |
| `sampleType` | type raw value |
| `start` / `stop` | `HHMM` or `-` |
| Placeholder row if none | `No Samples Taken` |

**Loop `{#photoLogRows}`**

- Pair photos 2 per row: `{ col1: {number, photo}, col2?: … }`
- Omit `col2` key entirely when odd count
- Photos: JPEG/PNG → `data:image/jpeg;base64,…` prefix (required)

**Post-process:** `removeEmptyPhotoLogCells`, `paginatePhotoLogTable` (2 pairs / page)

**Filename (single log)**

```
Daily_Log_{projectNumber}_{MM_DD_YYYY}.docx
```

**ZIP filename**

```
Daily_Log_{MM_DD_YYYY}.docx
```

**Toasts**

- `Loading template...`
- `Daily log document generated successfully.`

---

### 7.4 Visual Inspection

**Template:** `Visual Inspection Template.docx`

**Trigger:** ZIP only — when containment has **passed** inspection.

**Data**

| Key | Value |
|---|---|
| `typeOfInspection` | `Pre-Start` or `Final` |
| `finding` | `Pass` or `Fail` (ZIP only exports passed → effectively `Pass`) |
| `containmentLocation` | `containmentDisplayName` |
| `comments` | inspection notes |
| `{%%image}` | signature for `inspectorName` |

**ZIP filenames**

- `Pre-Start Visual Inspection.docx`
- `Final Visual Inspection.docx`

---

### 7.5 Containment Summary

**Template:** `Containment Summary Template.docx`

**One per containment** in ZIP.

**Stage dates** from first matching `stageHistory` entry:

| Template key | Stage |
|---|---|
| `date` | Active Abatement |
| `prestartVisualDate` | passed Pre-Start VI |
| `finalVisualDate` | passed Final VI |
| `containmentTeardownDate` | Containment Teardown (= clearance air passed) |
| `abatementCompletionDate` | Abatement Completed |

**Loops**

- `{#matRemList}` from `containment.spaces[].materials[]`
- `{#totalMatList}` aggregated from `containment.materials[]`

Quantity format: locale thousands + 2 dp + unit, e.g. `1,234.5 ft²`

**ZIP filename:** `Containment Summary.docx` inside `{name} Containment/` folder

---

### 7.6 Worker Roster

**Template:** `Worker Roster Template.docx` (landscape)

**Header:** `{client}`, `{pjNumber}` (not `projectNumber`)

**Columns `{date1}`…`{date10}`:** oldest 10 distinct daily log dates as `MM-dd yyyy`

**Loop `{#roster}`**

| Key | Logic |
|---|---|
| `workerName` | name |
| `mark1`…`mark10` | `X` if worker present that day (match id or case-insensitive name) |
| `aheraExp` / `aheraExpired` | paired expired logic |
| `sOrW` | `S` or `W` |
| same pattern | medical, respirator, lead, leadMed |

**Filename**

```
{projectNumber}_Worker_Roster.docx
```

(non-word chars → `_`, collapsed)

**Toasts**

- `Add workers to the roster before exporting.`
- `Generating worker roster…`
- `Worker roster exported.`

---

## 8. Project ZIP export

Port `downloadArchivedProject` from `js/main.js` (~1348–2155).

### ZIP structure

```
{projectNumber}.zip
├── Daily Logs/
│   └── Daily_Log_{MM_DD_YYYY}.docx          (each log)
├── Worker Roster/
│   └── Worker_Roster.docx                   (if roster non-empty)
├── {ContainmentName} Containment/
│   ├── Pre-Start Visual Inspection.docx     (if passed)
│   ├── Final Visual Inspection.docx         (if passed)
│   └── Containment Summary.docx             (always)
└── Documents/                               (attached scanned docs — future)
    └── index.json
```

### Generation order

1. All daily logs
2. Worker roster
3. Per containment: Pre-Start VI, Final VI, Containment Summary

Skip null blobs silently (desktop behavior).

### iOS UI (`ProjectFilesExportSheet`)

1. `Preparing project files for download...`
2. Progress while building
3. `Creating ZIP with N files...`
4. Share sheet
5. Success: `Project files downloaded successfully (N documents).`
6. Empty: `No documents found to download.`

Implement ZIP with pure Swift (no third-party) — store entries STORED like XLSX.

---

## 9. Styling rules (do not change)

When adding buttons, sheets, and sections:

| Pattern | Where used |
|---|---|
| `.groupedListStyle()` | All list screens |
| `.inlineNavTitle()` | Navigation titles |
| `EmptyStateView` | Zero-state with optional action |
| `SheetScaffold` | Form sheets (Cancel / Save toolbar) |
| `Section("Title")` | Uppercase-style section headers via SwiftUI |
| `.font(.subheadline.weight(.medium))` | Row titles |
| `.font(.caption).foregroundStyle(.secondary)` | Subtitles |
| `.monospaced()` / `.monospacedDigit()` | Project numbers, counts |
| `StageBadge`, `StatCard`, `SampleTypeTag` | Existing components |
| Toast via `appState.showToast` | `.thinMaterial` capsule in `RootView` |

**Do not** port desktop CSS classes (`btn-ghost`, `doc-tpl`, `ovs-doc-grid`).

**Do** match desktop **strings** for labels, placeholders, validation, and success messages.

---

## 10. Features to preserve

Do not regress these iOS capabilities while porting documents:

| Feature | Files |
|---|---|
| Inspector QR import (v1 + v2 multipart) | `InspectorQRScanSheet.swift`, `InspectorFormSheet.swift` |
| Signature capture | `SignatureFormSheet.swift`, `Inspector.signatureData` |
| Excel export (STORED XLSX) | `ExcelExportSheet.swift`, `XLSXKit.swift` |
| Excel import (STORED only; warn on desktop DEFLATE) | `ExcelImportSheet.swift` |
| Document scanner | `DocumentScannerSheet.swift` |
| Appearance / accent colors | `AppearanceFormSheet.swift`, `RootView` |
| Default templates preference storage | `DefaultTemplatesSheet.swift`, `Inspector.defaultTemplates` |

Excel `_InspectorSignatures` sheet must continue to round-trip signatures for cross-device transfer.

---

## 11. Testing checklist

Test each item on device or simulator with **Share → Save to Files**, then open in **Pages or Word**.

### Chain of custody

- [ ] Air COC with 0 samples → disabled + toast
- [ ] Air COC mixed asbestos/lead selection → error toast
- [ ] Air COC asbestos only → PCM/TEM options
- [ ] Air COC lead only → Flame AA/ICP/ICP M/S
- [ ] Partial sample selection respected
- [ ] Bulk COC material picker when multiple materials
- [ ] Bulk mixed hazard selection blocked
- [ ] Wipe COC only when lead materials exist
- [ ] Output opens in Word/Pages and matches Windows layout (logo, header table, sample table)
- [ ] Filenames match patterns in §7

### Archive documents

- [ ] Daily log with 0, 1, 3, 4+ photos (odd photo count drops empty cell)
- [ ] Daily log signature image appears
- [ ] Negative pressure sentence when readings exist
- [ ] Worker roster: attendance X marks, expired dates red
- [ ] Visual inspection signature
- [ ] Containment summary material lists

### ZIP

- [ ] Multi-log project produces `Daily Logs/` folder
- [ ] Multi-containment folders named correctly
- [ ] Empty project shows error toast with counts

### Regression

- [ ] Profile QR still imports signature
- [ ] Excel export/import still works
- [ ] Scan document still works
- [ ] No change to tab bar or accent appearance

### Cross-platform

- [ ] Generate same project on Windows and iOS; compare `.docx` field values (layout should match; minor font rendering differences OK)

---

## 12. Implementation phases

Suggested commit order (one feature per commit):

| Phase | Work | Commit message example |
|---|---|---|
| 1 | Bundle templates + `DocxTemplater` skeleton + load/render scalar tags | `iOS: bundle Word templates and DocxTemplater scaffold` |
| 2 | Placeholder repair + loop rendering + image module | `iOS: DocxTemplater loops and signature images` |
| 3 | `DocumentExportData` + Air COC sheet + Samples/Documents UI | `iOS: Air sample COC parity with desktop` |
| 4 | Bulk COC + material picker | `iOS: Bulk sample COC export` |
| 5 | Wipe COC | `iOS: Lead wipe COC export` |
| 6 | Worker roster export + Team tab button | `iOS: Worker roster Word export` |
| 7 | Daily log export + photo post-process | `iOS: Daily log document export` |
| 8 | VI + Containment summary for ZIP | `iOS: Visual inspection and containment summary export` |
| 9 | Project ZIP + Edit menu entry | `iOS: Download project files ZIP` |
| 10 | Remove old `DocxGenerator.generateCOC` scratch builder | `iOS: Remove simplified COC generator` |

After each phase: run in Xcode, fix build errors, test one happy path.

---

## 13. Desktop source index

| Topic | File | Lines (approx) |
|---|---|---|
| Air COC modal + render | `js/project.js` | 7237–7525 |
| Bulk COC | `js/project.js` | 2392–2668 |
| Wipe COC | `js/project.js` | 2868–3066 |
| Daily log print | `js/project.js` | 7531–7765 |
| Worker roster export | `js/project.js` | 8381–8446 |
| ZIP export | `js/main.js` | 1348–2155 |
| Placeholder repair | `js/project.js` | 1014–1117 |
| Signature / photos | `js/inspector-profile.js` | 131–353 |
| Docs tab UI wording | `js/shell.js` | 1971–1989 |
| Samples COC buttons | `js/shell.js` | 1396–1398 |
| Export roster button | `js/shell.js` | 1689 |
| Template files | `templates/*.docx` | — |
| Template placeholder spec | `DOCUMENT_GENERATION.md` | (partially stale — prefer this guide + `js/project.js`) |

---

## Appendix: Remove the simplified COC

After template-based Air COC works, delete from `DocxKit.swift`:

- `buildDocumentXml` custom layout (“CHAIN OF CUSTODY — AIR SAMPLE ANALYSIS”, etc.)
- `generateCOC(project:inspector:samples:)` scratch builder

Replace with:

```swift
DocxTemplater.render(template: .airSample, data: AirSampleCOCData.build(...))
```

The simplified document does **not** match the FACS letterhead template and will confuse inspectors who use Windows-generated forms.

---

## Appendix: `generate_pbxproj.py` resource hook (sketch)

In `walk_and_register`, add after `.swift` handling:

```python
elif f.endswith(".docx"):
    register_resource(node)  # new helper → build_files_resources
```

Ensure `Templates/` is walked like any other subdirectory. Re-run script after adding files so Xcode picks them up without manual pbx editing.

---

*Last updated to match repo `main` @ iOS sample sets / materials overhaul commit. Desktop reference: Oversight Electron app `js/project.js` + `templates/`.*
