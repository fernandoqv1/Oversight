# iOS Daily Log & Data Logging Parity — Audit + Claude Fix Guide

**Audience:** Claude (or another agent) implementing fixes in Xcode.  
**Goal:** Make iOS **log data the same way** as the Windows desktop app so Excel export/import round-trips cleanly across platforms — and fix daily-log UX so photos can be **viewed** and entries/headers **edited** the same way as Windows.

**Related docs:** `ios/IOS_PARITY_AUDIT.md` (broader feature gaps). This file is the **daily-log + Excel logging** deep dive.

**Principles**

1. Keep iOS SwiftUI styling (`SheetScaffold`, grouped lists, toasts).
2. Match Windows **data shapes** and **Excel `_FullData` / `_DailyLogPhotos` keys** exactly for cross-platform transfer.
3. Additive SwiftData changes only (new fields with defaults).
4. After adding Swift files: `python3 ios/generate_pbxproj.py`.
5. Desktop source of truth: `js/project.js` (modals), `js/shell.js` (Logs tab UI), `js/excel.js` (export/import).

---

## Part A — Audit summary (what’s wrong today)

### A.1 Daily log UX — Windows vs iOS

| Capability | Windows | iOS today | Verdict |
|---|---|---|---|
| Create daily log (header) | **New daily log** — Date, Inspector, Workers Onsite Total, worker checkboxes | `DailyLogFormSheet` — Date, Inspector, multi-select roster | ⚠️ Partial (workersTotal can diverge on desktop; iOS forces count = selection) |
| Edit log header after create | **Edit Header** → Edit Daily Log | Toolbar **Edit Log** + list swipe Edit | ✅ Exists |
| Add entry | **+ Entry** — Hour, Description, NP readings, Photos (max 5) | `LogEntryFormSheet` — Time, Notes, free-text NP, Photos | ⚠️ Partial (NP shape wrong) |
| Edit entry after create | **Edit** button on timeline card | **Swipe-only** Edit (easy to miss; row not tappable) | ⚠️ Partial UX |
| **View photos after save** | **Show photos (N)** / **Hide photos** inline on entry | Detail shows **count badge only** — must open Edit Entry to see images | ❌ Missing |
| Photo gallery / lightbox | Inline thumbnails (no lightbox) | None in detail | ❌ Missing |
| Delete entry / log | Yes | Swipe + confirm | ✅ Done |
| Negative pressure UI | Per-containment numeric fields (Active Abatement, not regulated) | Free-text `TextEditor` | ❌ Wrong model |
| Workers gap warning | `N of M workers identified` + assign via Header | Not shown | ❌ Missing |
| Active containments / Work Location | Snapshot `activeContainments[]` on log | Not stored | ❌ Missing |

### A.2 Data model mismatch (breaks Excel transfer)

| Concept | Windows storage | iOS storage | Excel impact |
|---|---|---|---|
| Log id | UUID string `generateId()` | No stable id — Excel uses ISO date of `log.date` | Photo merge + Log ID columns mismatch across platforms |
| Workers | `workers: [{id, name, certificationType}]` + `workersTotal: number` | `workerNames: [String]` + `workersOnSite: Int` | Desktop→iOS: worker identities lost; iOS→desktop: no `workers[]` |
| Active containments | `activeContainments: string[]` (names) | Missing | Desktop sheet/JSON field empty on iOS export |
| Entry description | `description` (legacy `notes`) | `note` → JSON encodes as `notes` | Soft-compat if both keys read; prefer dual-write |
| Negative pressure | `negativePressure: [{containmentId, containmentName, pressure}]` | `negativePressureNotes: String` | **Structured NP does not survive** desktop↔iOS |
| Photos | `photos: [{id, fileId?\|base64?}]` | `LogEntryPhoto.imageData` → export as `photoBase64s` + `_DailyLogPhotos` | Round-trip works if Log ID + Hour match; iOS Log ID ≠ Windows UUID |
| Entry id / createdAt | Present | Not exported | Minor |

### A.3 Excel sheet / FullData mismatch

**Windows Daily Logs human sheet columns:**

```
Log ID | Date | Inspector Name | Workers Total | Active Containments | Entry Hour | Entry Description | Photo # | Negative Pressure
```

**iOS Daily Logs human sheet columns today:**

```
Date | Inspector | Workers Total | Worker Names | Entry Time | Description | Negative Pressure | Photos
```

These are **not compatible**. Cross-platform transfer relies on `_FullData` JSON + `_DailyLogPhotos`. Human sheet should still be aligned for inspectors opening files in Excel.

**Windows `_FullData` dailyLogs shape (canonical):**

```json
{
  "id": "uuid",
  "date": "YYYY-MM-DD",
  "inspectorName": "...",
  "workers": [{ "id": "...", "name": "...", "certificationType": "W" }],
  "workersTotal": 4,
  "activeContainments": ["North", "South"],
  "entries": [
    {
      "id": "uuid",
      "hour": "HH:MM",
      "description": "...",
      "negativePressure": [
        { "containmentId": "...", "containmentName": "North", "pressure": -0.02 }
      ],
      "photos": [{ "id": "...", "base64": "..." }],
      "createdAt": 1234567890
    }
  ],
  "createdAt": 1234567890
}
```

**iOS `_FullData` today (incompatible keys):**

```json
{
  "id": "<ISO8601 of date>",
  "date": "<ISO8601>",
  "inspectorName": "...",
  "workersOnSite": 4,
  "workerNames": ["Alice", "Bob"],
  "entries": [
    {
      "hour": "HH:mm",
      "notes": "...",
      "negativePressureNotes": "Rm A: -0.05",
      "photoBase64s": ["..."],
      "photoCount": 1
    }
  ]
}
```

**`_DailyLogPhotos` columns (both platforms):**

```
Log ID | Entry Hour | Photo Index | Chunk Index | Base64
```

Match key on import: `"${logId}|${hour}|${photoIdx}"`. Hours must be `HH:mm`. Log ID must be stable and shared between `_FullData` and this sheet.

### A.4 Other logging fields that affect Excel (brief)

Fix these in the same pass if touching Excel JSON (details also in `IOS_PARITY_AUDIT.md`):

| Area | Issue |
|---|---|
| Air samples | iOS encodes `hazardType`; desktop may use `comments` / `inspectorName` — dual-read/write |
| Materials | Desktop `hazardTypes[]` vs iOS friable-only — needed for wipe/COC gating |
| Visual inspections | Desktop `comments` vs iOS `notes` — dual-write |
| Containment `stageHistory` | Desktop-only in FullData; needed for active-containment-on-date |

---

## Part B — Target data model (iOS after fix)

### B.1 `DailyLog` (additive)

```swift
@Model final class DailyLog {
    var date: Date
    var inspectorName: String
    /// Desktop: workersTotal — can differ from workers.count until Header assigned
    var workersTotal: Int          // rename or alias workersOnSite → keep both for migration
    /// Desktop: workers[] snapshot
    var workersJSON: Data?         // encode [LogWorkerSnapshot] OR use @Model child
    var activeContainments: [String] = []
    /// Stable id for Excel Log ID + photo merge (UUID string). Generate on create.
    var exportId: String = UUID().uuidString
    var createdAt: Date = .now
    // keep workerNames temporarily for migration; prefer deriving from workers[]
}
```

Preferred child model (cleaner than JSON blob):

```swift
@Model final class DailyLogWorker {
    var workerId: String = ""      // roster persistent ID string or generated
    var name: String
    var certificationType: String = "W"  // "S" | "W"
    var dailyLog: DailyLog?
}
```

Migration: on load, if `workers` empty and `workerNames` non-empty, synthesize `DailyLogWorker` rows with `certificationType = "W"` and `workersTotal = max(workersTotal, workerNames.count)`.

### B.2 `LogEntry` (additive)

```swift
@Model final class LogEntry {
    var time: Date
    var note: String                 // UI "Entry Description"
    var exportId: String = UUID().uuidString
    var createdAt: Date = .now
    /// Structured NP — desktop shape
    @Relationship(deleteRule: .cascade) var negativePressureReadings: [NegativePressureReading] = []
    // Keep negativePressureNotes for reading old data; stop writing new free-text when structured UI ships
    var photoCount: Int              // always sync to photos.count on save
    @Relationship var photos: [LogEntryPhoto]
}

@Model final class NegativePressureReading {
    var containmentId: String = ""   // containment persistentModelID description or name key
    var containmentName: String
    var pressure: Double             // ≤ 0
    var logEntry: LogEntry?
}
```

### B.3 `LogEntryPhoto` (additive)

```swift
var exportId: String = UUID().uuidString
var takenAt: Date
var imageData: Data
```

Preserve `takenAt` on edit (only new photos get `.now`).

---

## Part C — Excel encode/decode contract (must match Windows)

### C.1 `_FullData` encode (`ProjectJSONEncoder` / `DailyLogJSON`)

When writing JSON for each log:

| Key | Source |
|---|---|
| `id` | `log.exportId` (UUID) — **not** date string |
| `date` | `yyyy-MM-dd` local |
| `inspectorName` | header |
| `workers` | `[{id, name, certificationType}]` |
| `workersTotal` | Int (also write `workersOnSite` = same for old iOS readers) |
| `activeContainments` | `[String]` |
| `createdAt` | epoch ms |
| `entries[]` | see below |

Each entry:

| Key | Source |
|---|---|
| `id` | `entry.exportId` |
| `hour` | `HH:mm` |
| `description` | `entry.note` (**also** write `notes` same value for compat) |
| `negativePressure` | array of `{containmentId, containmentName, pressure}` (omit if empty) |
| `photos` | Prefer writing into `_DailyLogPhotos`; FullData may omit bytes or include `photoBase64s` for iOS↔iOS |
| `createdAt` | epoch ms |

**Decode (import)** — accept both shapes:

```swift
workersTotal = json.workersTotal ?? json.workersOnSite ?? json.workers?.count ?? 0
workerSnapshots = json.workers ?? json.workerNames.map { LogWorker(id:"", name:$0, certificationType:"W") }
entryNote = json.description ?? json.notes ?? ""
np = json.negativePressure /* structured */ 
     ?? parseLegacyNotes(json.negativePressureNotes)
```

### C.2 Human **Daily Logs** sheet — match Windows columns

```swift
["Log ID", "Date", "Inspector Name", "Workers Total", "Active Containments",
 "Entry Hour", "Entry Description", "Photo #", "Negative Pressure"]
```

- One row per entry; empty-entry logs get one blank entry row (Windows behavior).
- `Entry Hour` = `HH:mm` (fix).
- `Photo #` = global sequential numbers like Windows (`"1, 2"` or `"1-3"`), not raw count.
- `Negative Pressure` display string: `"Name: value; Name: value"`.

### C.3 `_DailyLogPhotos`

Keep columns identical. Use `log.exportId` as Log ID and `HH:mm` as Entry Hour. Chunk at ~32667 chars (desktop: `EXCEL_CELL_LIMIT - 100`).

### C.4 Acceptance for Excel

1. Create project + daily log + entry + NP + 2 photos on **iOS** → Export Excel → Import on **Windows** → workers, NP values, photos, active containments present.
2. Reverse: Windows export → iOS import → same fields restored; photos visible in detail UI.
3. iOS→iOS still works.

---

## Part D — Daily log UX fixes (Windows parity)

Keep SwiftUI styling; match **behavior and wording**.

### D.1 Photo viewing on `DailyLogDetailView`

**Problem:** `entryRow` only shows `Label("\(entry.photoCount)", systemImage: "photo")`.

**Fix:**

1. Add **Show photos (N)** / **Hide photos** control on each entry that has photos (desktop button labels).
2. When shown, display a horizontal `ScrollView` of thumbnails from `entry.photos` (`UIImage(data:)`).
3. Tap thumbnail → full-screen gallery (optional but recommended) — Windows uses inline only; thumbnails are the minimum bar.
4. Do **not** require opening Edit Entry to view.

Suggested implementation:

```swift
@State private var expandedPhotoEntryIds: Set<PersistentIdentifier> = []

// In entryRow:
if entry.photos.count > 0 {
    Button(expanded ? "Hide photos" : "Show photos (\(entry.photos.count))") {
        // toggle expandedPhotoEntryIds
    }
    if expanded {
        ScrollView(.horizontal) { HStack { ForEach(entry.photos) { … Image } } }
    }
}
```

Sync `entry.photoCount = entry.photos.count` whenever photos change.

### D.2 Edit entry — make it discoverable

Windows has an **Edit** button on the card. iOS only has swipe.

**Fix (do both):**

1. Keep swipe Edit/Delete.
2. Make the entry row a `Button` (or add trailing **Edit** text button) that presents `.editLogEntry(log, entry)`.
3. Sheet titles: create **Add Entry** / **Log Entry**; edit **Edit Log Entry** (align with desktop **Edit Log Entry** / **Save Changes**).

`SheetScaffold` save labels: create **Add Entry**, edit **Save Changes** (desktop wording).

### D.3 Edit header wording

- Toolbar: **Edit Header** (match desktop) instead of/in addition to **Edit Log**.
- Sheet title: **Edit Daily Log** / create **Create Daily Log**.
- Fields: **Date**, **Inspector Name**, **Workers Onsite Total**, **Workers on site** (checkboxes/multi-select).

Allow `workersTotal` to differ from selected worker count on create (desktop allows gap). On edit, if total > 0 and selected count ≠ total, toast like desktop: require match or show warning **N of M workers identified**.

### D.4 Negative pressure UI (structured)

Replace free-text editor with per-containment fields:

1. Compute eligible containments: stage == **Active Abatement** AND `regulatedArea != true` (when regulated area exists — see parity audit).
2. Section title: **Negative Pressure Readings (Optional)**
3. One `TextField` per containment, numeric, unit hint **inWC**, must be ≤ 0 if non-empty.
4. Save as `NegativePressureReading` rows.
5. Detail view display: `Name: value` joined by `; ` (same as Excel human sheet).

Until regulated area ships, show fields for all Active Abatement containments on the project.

### D.5 Snapshot `activeContainments` on save

On create/edit header:

```swift
log.activeContainments = ActiveContainmentNames.forLog(project: project, date: log.date)
// Port getActiveContainmentNamesForLog from js/project.js
// Stages: Containment Preparation, Active Abatement, Containment Clearance
```

Show read-only **Work Location** on detail as joined names (or “No active containments”).

---

## Part E — Agent build instructions (step-by-step)

### E.0 Preamble

**Files to read first**

| Purpose | Path |
|---|---|
| Windows create/edit log | `js/project.js` — `openProjectDailyLogModal`, `openProjectDailyLogEntryModal`, `openProjectDailyLogEntryEditModal` |
| Windows Logs UI | `js/shell.js` — `renderTabLogs`, `renderLogEntryCard` |
| Windows Excel | `js/excel.js` — Daily Logs sheet, `_DailyLogPhotos`, `_FullData` |
| iOS models | `Models/DailyLog.swift` |
| iOS list/detail | `Views/DailyLogsView.swift` |
| iOS forms | `Sheets/DailyLogFormSheet.swift`, `Sheets/LogEntryFormSheet.swift` |
| iOS Excel | `Sheets/ExcelExportSheet.swift`, `Sheets/ExcelImportSheet.swift` |

**Do not** break QR import, document scanner, or appearance.

### E.1 Phase DL-1 — Model + migration (additive)

1. Add `exportId`, `createdAt`, `workersTotal`, `activeContainments` to `DailyLog`.
2. Add `DailyLogWorker` model (or equivalent) + relationship.
3. Add `NegativePressureReading` model + relationship on `LogEntry`.
4. Add `exportId` / preserve `takenAt` on photos.
5. Register new `@Model` types in `OversightApp` `Schema`.
6. Migration helper `DailyLogMigration.upgradeInPlace(context:)`:
   - Assign `exportId` if empty
   - Copy `workersOnSite` → `workersTotal`
   - Build workers from `workerNames`
   - Leave `negativePressureNotes` intact; structured readings empty until re-edited

**Acceptance:** Existing installs open without crash; old logs still display.

### E.2 Phase DL-2 — Excel FullData + sheets parity

1. Update `DailyLogJSON` / `LogEntryJSON` in `ExcelImportSheet.swift` (or shared types file):

```swift
struct DailyLogJSON: Codable {
    var id: String?
    var date: String?
    var inspectorName: String?
    var workersTotal: Int?
    var workersOnSite: Int?              // legacy iOS
    var workers: [DailyLogWorkerJSON]?   // desktop shape
    var workerNames: [String]?           // legacy iOS
    var activeContainments: [String]?
    var entries: [LogEntryJSON]?
    var createdAt: Double?
}
struct DailyLogWorkerJSON: Codable {
    var id: String?
    var name: String?
    var certificationType: String?
}
struct LogEntryJSON: Codable {
    var id: String?
    var hour: String?
    var description: String?
    var notes: String?
    var negativePressure: [NegativePressureJSON]?
    var negativePressureNotes: String?   // legacy
    var photoBase64s: [String]?          // still write for iOS↔iOS
    var photos: [PhotoRefJSON]?          // optional
    var createdAt: Double?
    var photoCount: Int?
}
struct NegativePressureJSON: Codable {
    var containmentId: String?
    var containmentName: String?
    var pressure: Double?
}
```

2. Encoder: emit desktop keys; dual-write `notes`+`description`, `workersTotal`+`workersOnSite`.
3. Decoder: accept both; merge `_DailyLogPhotos` by `id` + `hour`.
4. Human Daily Logs sheet: Windows column order and Photo # logic.
5. Date format in FullData for logs: `yyyy-MM-dd` (not full ISO timestamp) for `date` field to match desktop.

**Acceptance:** Round-trip test matrix in §C.4.

### E.3 Phase DL-3 — Photo viewer + edit affordances

1. Implement Show/Hide photos on `DailyLogDetailView` (§D.1).
2. Make entry rows tappable → edit sheet; keep swipe actions (§D.2).
3. Rename **Edit Log** → **Edit Header**; align sheet titles/save labels (§D.3).
4. On photo edit save: preserve `takenAt` for existing photos; set `photoCount = photos.count`.

**Acceptance:** Inspector can view all photos without editing; can tap entry to edit; header editable.

### E.4 Phase DL-4 — Structured NP + workers + active containments UI

1. Rewrite NP section in `LogEntryFormSheet` (§D.4).
2. Update `DailyLogFormSheet` for `workersTotal` + worker multi-select + gap warning (§D.3).
3. Snapshot `activeContainments` on header save (§D.5).
4. Detail header shows Work Location + worker list from `DailyLogWorker`.
5. Stop writing new free-text-only NP (still display legacy notes if readings empty).

**Acceptance:** New entries export structured `negativePressure` array; Windows import shows readings; Work Location populated.

### E.5 Phase DL-5 — Polish

1. Empty-state / button labels match desktop where reasonable (**New daily log**, **Add Entry**, **Edit Header**).
2. Ensure Excel export includes header-only logs (no entries) as one blank row.
3. Document in commit message: “Daily log Excel parity with Windows `_FullData`”.
4. Manual test checklist (§F).

---

## Part F — Testing checklist

### UX
- [ ] Create log → add entry with 3 photos → detail **Show photos (3)** reveals thumbnails
- [ ] **Hide photos** collapses
- [ ] Tap entry → Edit Log Entry → change description → Save Changes → detail updates
- [ ] Edit Header → change inspector / workers → saves
- [ ] NP fields per active-abatement containment; invalid positive pressure rejected
- [ ] Workers gap warning when total ≠ selected (create allowed; edit validates)

### Excel cross-platform
- [ ] iOS → Excel → Windows: log id stable; workers array; NP array; photos via `_DailyLogPhotos`; activeContainments
- [ ] Windows → Excel → iOS: same fields restore; Show photos works
- [ ] iOS → Excel → iOS: no regression
- [ ] Human Daily Logs sheet columns match Windows order
- [ ] Entry Hour is `HH:mm` everywhere (sheet + photos + JSON)

### Regression
- [ ] Document scanner, QR import, Excel non-log sheets still work
- [ ] Old iOS projects without `exportId` migrate on open

---

## Part G — Desktop → Swift map

| Desktop | Swift target |
|---|---|
| `openProjectDailyLogModal` | `DailyLogFormSheet` |
| `openProjectDailyLogEntryModal` / Edit | `LogEntryFormSheet` |
| `renderLogEntryCard` Show photos | `DailyLogDetailView` photo expand |
| `log.workers` / `workersTotal` | `DailyLogWorker` + `workersTotal` |
| `log.activeContainments` | `DailyLog.activeContainments` |
| `entry.negativePressure[]` | `NegativePressureReading` |
| `entry.description` | `LogEntry.note` (+ JSON dual keys) |
| `entry.photos[]` | `LogEntryPhoto` + Excel `_DailyLogPhotos` |
| `js/excel.js` Daily Logs export | `ExcelExportSheet.dailyLogsRows` |
| `_mergeDailyLogPhotosFromWorkbook` | `ExcelImportSheet` photo merge |
| `getActiveContainmentNamesForLog` | new `ActiveContainmentNames.forLog` |

---

## Part H — Suggested commits

| Commit | Scope |
|---|---|
| 1 | Additive DailyLog/LogEntry models + migration |
| 2 | Excel FullData + Daily Logs sheet + photo Log ID parity |
| 3 | Detail photo viewer + tappable Edit + Edit Header wording |
| 4 | Structured NP UI + workers snapshot + activeContainments |

---

## Part I — Out of scope (do not block this work)

- Wireless phone photo import (Windows-only)
- Word Daily Log document generation (covered in `IOS_PARITY_AUDIT.md` Part 12 Phase 6)
- Regulated area model (needed for NP eligibility; stub “all Active Abatement” until Phase 10 of parity audit)

---

*Audit date: 2026-08-11. Sources: `js/project.js`, `js/shell.js`, `js/excel.js`, `ios/Oversight/Oversight/Models/DailyLog.swift`, `Views/DailyLogsView.swift`, `Sheets/LogEntryFormSheet.swift`, `Sheets/ExcelExportSheet.swift`, `Sheets/ExcelImportSheet.swift`.*
