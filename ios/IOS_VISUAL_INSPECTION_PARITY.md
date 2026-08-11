# iOS Visual Inspection Parity — Audit + Claude Fix Guide

**Audience:** Claude (or another agent) implementing fixes in Xcode.  
**Goal:** Make iOS **log and edit visual inspections the same way** as the Windows desktop app so Excel `_FullData` / human sheets round-trip cleanly, and so stage-gated create/edit/delete behavior matches Windows (including regulated area and auto samples).

**Related docs**
- `ios/IOS_PARITY_AUDIT.md` — broader feature gaps  
- `ios/IOS_DAILY_LOG_PARITY.md` — daily log + Excel logging (same style as this file)

**Principles**

1. Keep iOS SwiftUI styling (`SheetScaffold`, grouped lists, toasts).
2. Match Windows **data shapes** and Excel keys (`comments`, `type`, `passed`, containment `regulatedArea`).
3. Additive SwiftData changes only.
4. After adding Swift files: `python3 ios/generate_pbxproj.py`.
5. Desktop source of truth: `js/project.js` (`openVisualInspectionModal`, Edit Containment VI cards, stage save gates), `js/shell.js` (containment detail history), `js/excel.js` (Visual Inspections sheet + `_FullData`).

---

## Part A — Audit summary (what’s wrong today)

### A.1 UX — Windows vs iOS

| Capability | Windows | iOS today | Verdict |
|---|---|---|---|
| Create VI | Only via stage change Prep→Active (Pre-Start) or Active→Clearance (Final) inside **Edit Containment** save | `GatedStageChangeSheet` on **Set stage** for those two transitions | ✅ Exists (different entry point, same gates) |
| Manual “Add VI” | None | `ActiveSheet.newVisualInspection` wired in RootView but **never presented** | ⚠️ Dead code (OK to leave unwired — matches desktop) |
| Edit after create | **Edit** on VI card inside Edit Containment | Tap VI row + swipe Edit → `VisualInspectionFormSheet` | ✅ Exists (good; keep) |
| Delete VI | Confirm mentions stage revert; passed VI can revert stage | Delete only — **no stage revert** | ❌ Missing |
| View VI details | Cards show type, Pass/Fail, date, inspector, comments | Rows show type, Pass/Fail, inspector, date, notes | ✅ Adequate |
| Regulated Area | Containment checkbox + Pre-Start VI checkbox | **Not modeled** | ❌ Missing |
| Type locked on edit | Always `vi.type` | Form allows changing Pre-Start ↔ Final | ❌ Bug |
| Stage bypass | Edit Containment stage change still gates VI | `ContainmentFormSheet` Stage picker can jump without VI | ❌ Bug |
| Fail VI | Saved; stage stays; toast | Saved; stage unchanged | ✅ Done |
| Auto clearance air on Final pass | 5 samples if asbestos && !regulated; date = tomorrow | Always 5 air samples; no asbestos/regulated check; date = now | ⚠️ Partial / wrong |
| Auto clearance wipe on Final pass | 1 wipe if lead materials | Missing | ❌ Missing |

### A.2 Data model / Excel mismatch

| Concept | Windows | iOS | Excel impact |
|---|---|---|---|
| Field for text | `comments` | `notes` | iOS export writes `notes` only → desktop may miss text unless dual-write |
| Type key | `type` (`Pre-Start` \| `Final`) | `inspectionTypeRaw` → JSON `type` | Soft OK if encoder uses `type` |
| `createdAt` | epoch ms on create | Missing | Lost on round-trip; Word ZIP uses as date fallback |
| `regulatedArea` | On **containment** (boolean) | Missing | Containments sheet + FullData incomplete; NP/clearance rules break |
| Human sheet columns | `Containment ID`, `Containment Name`, `Type`, `Date`, `Passed`, `Comments`, `Inspector Name` | `Containment`, `Type`, `Date`, `Passed`, `Inspector`, `Notes` | Human sheet not cross-compatible |
| Import | Prefers `_FullData`; sheet fallback leaves VIs empty | `_FullData` only; reads `notes ?? comments` | Import OK if dual keys; export must write `comments` |

### A.3 Windows canonical VI object

```json
{
  "type": "Pre-Start",
  "passed": true,
  "comments": "...",
  "inspectorName": "...",
  "date": "YYYY-MM-DD",
  "createdAt": 1723392000000
}
```

Nested under `containment.visualInspections[]`. Containment also has `"regulatedArea": false`.

### A.4 iOS JSON today (`VIJSON` encode)

```json
{
  "type": "Pre-Start",
  "date": "<ISO8601>",
  "passed": true,
  "notes": "...",
  "inspectorName": "..."
}
```

Missing: `comments` (dual), `createdAt`. Date should prefer `yyyy-MM-dd` for desktop parity.

---

## Part B — Target data model (iOS after fix)

### B.1 `VisualInspection` (additive)

```swift
@Model final class VisualInspection {
    var inspectionTypeRaw: String      // keep; maps to type
    var date: Date
    var inspectorName: String
    var passed: Bool
    /// Keep for legacy UI; prefer syncing with comments semantics
    var notes: String = ""
    /// Desktop field — store same text as notes OR use notes as storage and map in Excel only
    // Prefer: single storage `notes`, Excel dual-write comments+notes
    var createdAt: Date = .now
    var containment: Containment?
}
```

**Recommendation:** Keep `notes` as the Swift property (minimal churn). Excel encode/decode **dual-write/read** `comments` ↔ `notes`. Do not rename the Swift property unless necessary.

Add `createdAt` with default `.now`; set only on insert (not on edit).

### B.2 `Containment` (additive)

```swift
var regulatedArea: Bool = false
```

Also needed for daily-log NP eligibility (`IOS_DAILY_LOG_PARITY.md`) and clearance-air skip.

### B.3 Optional `stageHistory` (for delete-revert fidelity)

Windows stores:

```json
{ "stage": "Active Abatement", "changedAt": 123, "previousStage": "Containment Preparation", "inspectorName": "..." }
```

If not already modeled, add additive:

```swift
@Model final class StageHistoryEntry {
    var stageRaw: String
    var previousStageRaw: String
    var changedAt: Date
    var inspectorName: String
    var containment: Containment?
}
```

Append on gated **pass** advance. On delete of passed VI, remove last matching after-stage entry and revert stage (port `revertContainmentStageAfterInspectionDelete`).

If stageHistory is deferred, still implement stage revert using simple rules:
- Delete passed Pre-Start → if stage ≥ Active Abatement → set Preparation
- Delete passed Final → if stage ≥ Clearance → set Active Abatement

---

## Part C — Excel encode/decode contract

### C.1 `_FullData` under each containment

```json
{
  "name": "...",
  "regulatedArea": false,
  "stage": "Active Abatement",
  "visualInspections": [
    {
      "type": "Pre-Start",
      "passed": true,
      "comments": "...",
      "notes": "...",
      "inspectorName": "...",
      "date": "2026-08-11",
      "createdAt": 1723392000000
    }
  ],
  "stageHistory": [ ... ]
}
```

**Encode rules**

| Key | Rule |
|---|---|
| `type` | `inspectionType.rawValue` |
| `comments` | `notes` text |
| `notes` | same text (iOS↔iOS / legacy) |
| `date` | `yyyy-MM-dd` local |
| `createdAt` | epoch ms |
| `passed` | Bool |
| `inspectorName` | String |
| `regulatedArea` | on **containment** object, not VI |

**Decode rules**

```swift
notes = json.comments ?? json.notes ?? ""
date = parseYYYYMMDD(json.date) ?? parseISO(json.date)
createdAt = fromEpoch(json.createdAt) ?? date
regulatedArea = containmentJSON.regulatedArea ?? false
```

### C.2 Human **Visual Inspections** sheet — match Windows

```
Containment ID | Containment Name | Type | Date | Passed | Comments | Inspector Name
```

- `Passed` = `Yes` / `No`
- Date = `yyyy-MM-dd`
- Containment ID = stable export id on containment (add `exportId: String = UUID().uuidString` if missing)
- Include header row even when empty if project has containments (Windows behavior)

### C.3 Containments sheet

Add **Regulated Area** column (`Yes`/`No`) to match Windows.

### C.4 Acceptance

1. iOS → Excel → Windows: VI comments appear; regulatedArea on containment; createdAt present.
2. Windows → Excel → iOS: VIs restore with correct type/pass/comments; regulatedArea restores.
3. Human sheet columns match Windows order/names.

---

## Part D — UX & business-rule fixes

### D.1 Lock inspection type on edit

In `VisualInspectionFormSheet` when `inspection != nil`:
- Hide Type picker OR show read-only type.
- Gated sheet already fixes type — good.

### D.2 Remove stage bypass

In `ContainmentFormSheet`:
- **Remove Stage picker** from edit form, OR
- Disable it with footer: *Use Set stage on the containment card to change stage.*

All Prep→Active and Active→Clearance changes must go through `GatedStageChangeSheet`.

### D.3 Delete + stage revert

Port `revertContainmentStageAfterInspectionDelete` (`js/project.js`):

```
Confirm: "Delete this {type} inspection? The containment stage will be reverted if this inspection advanced it."

On delete of passed VI:
  if Pre-Start && stage >= Active Abatement → stage = Containment Preparation
  if Final && stage >= Containment Clearance → stage = Active Abatement
  trim stageHistory if present
Toast: "Visual inspection deleted. Stage reverted to {stage}." 
    or "Visual inspection deleted."
```

Do **not** auto-delete clearance air/wipe samples (Windows also leaves them).

### D.4 Regulated Area UI

1. Toggle on `ContainmentFormSheet`: **Regulated Area**  
   Subtitle (desktop): *Check this if the containment is a regulated area. Negative pressure readings will not be required for daily logs, and clearance air samples will not be automatically created.*
2. On `GatedStageChangeSheet` when `viType == .preStart`: same Toggle; on **Pass**, write `containment.regulatedArea = value` (overrides form).
3. Final gated sheet: **no** regulated control.

### D.5 Auto samples on Final pass (match Windows)

In `GatedStageChangeSheet` after Final **pass**:

```swift
if !containment.regulatedArea && projectHasAsbestos(project) {
    createClearanceAirSamples(...)  // 5 samples, autoCreated, shared sampleSetId
    // Desktop sets sample date to tomorrow — match that
}
if projectHasLead(project) {
    createClearanceWipeSample(...)  // ignore regulatedArea
}
```

Port helpers from `js/project.js`: `createClearanceAirSamples`, `createClearanceWipeSample`, `getProjectHazardSummary`.

### D.6 Form wording (desktop labels)

| Context | Title | Primary button |
|---|---|---|
| Gated Pre-Start | Pre-Start Visual Inspection | Save Inspection (or keep Pass — Advance Stage) |
| Gated Final | Final Visual Inspection | Save Inspection / Pass — Advance Stage |
| Edit existing | Edit {type} Visual Inspection | Save Changes |
| Findings | Pass / Fail | — |
| Text field | Comments (map to `notes`) | placeholder: Enter inspection comments... |
| Inspector | Inspector Name | — |
| Date | Inspection Date | — |

Prefer renaming the Notes section label to **Comments** in UI while keeping the property name `notes`.

### D.7 Containment card badges (optional polish)

Desktop list badges: `Pre-Start ✓`, `Final ✓`, `{n} Failed`, `Regulated`.  
Optional: show small badges on `containmentCard` in addition to nested rows.

### D.8 Keep edit/view paths

Tap-to-edit and swipe Edit/Delete are fine (better than desktop’s modal-only cards). Do not remove them — they satisfy “edit after entered.” Ensure comments are fully visible (expandable or detail) — currently 2-line limit is OK if tap opens edit with full text.

---

## Part E — Agent build instructions

### E.0 Preamble

**Read first**

| Purpose | Path |
|---|---|
| VI modal + stage gates + delete revert | `js/project.js` — `openVisualInspectionModal`, `openEditContainmentModal`, `revertContainmentStageAfterInspectionDelete`, `createClearanceAirSamples`, `createClearanceWipeSample` |
| Containment detail history | `js/shell.js` — `renderContainmentDetail` |
| Excel | `js/excel.js` — Visual Inspections sheet |
| iOS model | `Models/VisualInspection.swift`, `Models/Containment.swift` |
| iOS UI | `Views/ContainmentsView.swift`, `Sheets/GatedStageChangeSheet.swift`, `Sheets/VisualInspectionFormSheet.swift`, `Sheets/ContainmentFormSheet.swift` |
| iOS Excel | `Sheets/ExcelExportSheet.swift`, `Sheets/ExcelImportSheet.swift` |

**Do not** break daily-log work, QR import, scanner, appearance.

### E.1 Phase VI-1 — Model + Excel keys

1. Add `Containment.regulatedArea: Bool = false`.
2. Add `VisualInspection.createdAt: Date = .now` (set on insert only).
3. Add `Containment.exportId` if needed for Excel Containment ID column.
4. Optional: `StageHistoryEntry` model + relationship.
5. Update `VIJSON` / `ContainmentJSON`:
   - Encode `comments` + `notes` (same text)
   - Encode `createdAt` epoch ms
   - Encode containment `regulatedArea`
   - Decode `comments ?? notes`
   - Date as `yyyy-MM-dd` on encode
6. Human Visual Inspections sheet → Windows columns (§C.2).
7. Containments sheet → add Regulated Area.

**Acceptance:** Round-trip Excel preserves comments text under `comments`; regulatedArea restores.

### E.2 Phase VI-2 — Gate integrity + type lock + delete revert

1. Remove/disable Stage picker in `ContainmentFormSheet`.
2. Lock Type on edit in `VisualInspectionFormSheet`.
3. Implement delete confirm + stage revert (§D.3) in `ContainmentsView`.
4. Align gated sheet titles/labels with desktop Comments wording.

**Acceptance:** Cannot bypass VI via Edit Containment; deleting passed Pre-Start from Active reverts to Preparation.

### E.3 Phase VI-3 — Regulated Area + auto samples

1. Regulated toggle on containment form + Pre-Start gated sheet (§D.4).
2. Fix `autoCreateClearanceSamples` gates (asbestos + !regulated); date = tomorrow.
3. Add clearance wipe creation for lead (§D.5).
4. Wire NP eligibility in daily log form to skip regulated containments (coordinate with `IOS_DAILY_LOG_PARITY.md`).

**Acceptance:** Regulated Final pass creates no auto air samples; lead Final pass creates wipe; non-regulated asbestos Final pass creates 5 air samples.

### E.4 Phase VI-4 — Polish

1. Optional containment card badges.
2. Toast strings match desktop where practical.
3. Fail path toast: `"{type} Visual Inspection failed. Stage reverted to {previous}."` when applicable (gated fail already keeps stage).
4. Manual test checklist (§F).

---

## Part F — Testing checklist

### UX / rules
- [ ] Prep → Active prompts Pre-Start VI; Fail keeps Preparation; Pass advances + optional regulated
- [ ] Active → Clearance prompts Final VI; Pass advances + auto samples per rules
- [ ] Edit Containment cannot change stage without Set stage / gates
- [ ] Edit VI cannot change Type
- [ ] Tap VI → edit Comments / inspector / date / Pass-Fail → Save Changes
- [ ] Delete passed Pre-Start from Active → stage back to Preparation + toast
- [ ] Delete failed VI → no stage change
- [ ] Regulated toggle visible on containment + Pre-Start sheet only

### Excel
- [ ] iOS → Windows: `comments` populated; `regulatedArea` on containment; sheet columns match
- [ ] Windows → iOS: VIs restore; notes show desktop comments; regulatedArea restored
- [ ] iOS → iOS: no regression
- [ ] `_FullData` date format `yyyy-MM-dd` for VI `date`

### Regression
- [ ] Daily logs, QR, Excel other sheets, document scanner still work
- [ ] Set stage for non-gated transitions (e.g. Clearance → Teardown) still applies directly

---

## Part G — Desktop → Swift map

| Desktop | Swift target |
|---|---|
| `openVisualInspectionModal` | `GatedStageChangeSheet` + `VisualInspectionFormSheet` |
| `vi.comments` | `VisualInspection.notes` + Excel `comments`/`notes` |
| `vi.type` | `inspectionType` / `inspectionTypeRaw` |
| `containment.regulatedArea` | `Containment.regulatedArea` |
| `revertContainmentStageAfterInspectionDelete` | `ContainmentsView` delete handler |
| `createClearanceAirSamples` | `GatedStageChangeSheet` / `AutoSampleCreation` |
| `createClearanceWipeSample` | `AutoSampleCreation.clearanceWipe` |
| Excel Visual Inspections sheet | `ExcelExportSheet.visualInspectionsRows` |
| Edit Containment VI **Edit** / **Delete** | Tap row / swipe on `ContainmentsView` |

---

## Part H — Suggested commits

| Commit | Scope |
|---|---|
| 1 | `regulatedArea` + `createdAt` + Excel dual `comments`/`notes` + sheet columns |
| 2 | Stage picker lock + type lock + delete stage revert |
| 3 | Regulated UI + clearance air/wipe auto-sample rules |

---

## Part I — Out of scope

- Word Visual Inspection `.docx` generation (`IOS_PARITY_AUDIT.md` Phase 7)
- Washoe pre-start wipe on containment create (parity audit Phase 10)
- Wireless flows

---

## Part J — Relationship to daily-log parity

Both docs require `Containment.regulatedArea`:
- **VI doc:** set via Pre-Start / containment form; Excel round-trip
- **Daily log doc:** skip NP fields for regulated Active Abatement containments

Implement VI-1 regulatedArea before daily-log structured NP eligibility is complete.

---

*Audit date: 2026-08-11. Sources: `js/project.js`, `js/shell.js`, `js/excel.js`, `ios/.../VisualInspection.swift`, `ContainmentsView.swift`, `GatedStageChangeSheet.swift`, `VisualInspectionFormSheet.swift`, `ExcelExportSheet.swift`, `ExcelImportSheet.swift`.*
