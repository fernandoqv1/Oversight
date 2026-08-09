# Oversight iOS/macOS — Porting Plan

Goal: native SwiftUI multiplatform app (iPhone + Mac from one codebase), ported from the
interactive prototype in `../ios-prototype/`. The prototype is the spec — every screen,
sheet, and business rule already exists there and should be matched.

## Prerequisites (done once, by hand in Xcode)

1. Xcode → File → New → Project → **Multiplatform → App**
2. Product name: `Oversight`, Interface: SwiftUI, Storage: **SwiftData**
3. Save into this `ios/` folder. Uncheck "Create Git repository" (repo already exists).
4. Result: `ios/Oversight/Oversight.xcodeproj` — open it, press ⌘R, confirm the
   template app runs in the iPhone simulator.

## Source of truth

| Prototype file | Contains | Ports to |
|---|---|---|
| `ios-prototype/oversight-store.jsx` | Data model, seed data, business logic (volume calc, stage progress, cert expiry) | SwiftData `@Model` classes + logic in model extensions |
| `ios-prototype/oversight-app.jsx` | Tab routing, sheet dispatch, theme | `TabView`, app state `@Observable` class |
| `ios-prototype/oversight-screens.jsx` | All screens | One SwiftUI View file per screen |
| `ios-prototype/oversight-sheets.jsx` | Create/edit modal sheets | `.sheet` presentations with `Form` |
| `ios-prototype/oversight-ui.jsx` | Shared primitives | Reusable SwiftUI components |
| `ios-prototype/oversight-ios.css` | Visual system (colors, accents, dark mode) | `Color` assets + view modifiers |

## Phases (one commit each)

1. **Data model** — port `oversight-store.jsx` schema to SwiftData:
   Project → Buildings → Spaces → Materials; Containments; AirSamples; Roster
   (workers + certifications); DailyLogs; Documents. Include seed/demo data.
   Unit-test the derived logic: sample volume = flow rate × duration, stage
   progress %, cert-expiry flagging.
2. **Shell** — 5-tab `TabView` (Today, Projects, Archive, Profile + project
   workspace navigation), light/dark + accent theme.
3. **Projects list + Project detail** — searchable list, stage stepper,
   navigation to Containments / Air Samples / Materials / Team / Documents.
4. **Today** — running air samples with elapsed time, attention items, activity feed.
5. **Sheets** — create/edit for projects, containments, air samples, workers,
   daily logs, materials. Inline volume calculation while typing.
6. **Team & certifications** — worker cards, cert badges, expired flagged red.
7. **Profile** — inspector details, signature capture (Canvas drawing),
   default templates, appearance settings. First-launch onboarding should
   offer scanning the desktop inspector-profile QR (see
   `INSPECTOR_PROFILE_TRANSFER.md`) before falling back to manual entry.
8. **Documents** — generate from templates (see desktop `DOCUMENT_GENERATION.md`).
9. **Archive** — completed projects.
10. **macOS pass** — `NavigationSplitView` sidebar layout on Mac, keyboard
    shortcuts, window sizing.

## Conventions

- iOS 17+ / macOS 14+, SwiftUI + SwiftData, no third-party dependencies.
- Match the prototype's iOS idioms: large-title navigation, grouped inset lists,
  bottom sheets, 44pt hit targets, monospaced digits for numbers/dates/IDs.
- Offline-first: SwiftData local store only (mirrors desktop localStorage model).
  CloudKit sync is a later phase, not now.
- Excel import/export stays desktop-only (not ported, per prototype README).
