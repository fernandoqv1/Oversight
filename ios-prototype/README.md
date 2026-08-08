# Oversight — iOS Mockup

An interactive iOS mockup of the Oversight desktop app (asbestos abatement project oversight for field inspectors), built as a single HTML prototype running in a phone frame. All data lives in `localStorage`; no backend, fully offline, matching the desktop app's storage model.

## Files

| File | Purpose |
|---|---|
| `Oversight iOS - Prototype.html` | Entry point — the running, clickable app in an iPhone frame |
| `Oversight iOS - Screens.html` | Static canvas showing all screens side by side |
| `oversight-store.jsx` | Data model, seed data, persistence, business logic |
| `oversight-app.jsx` | App shell — routing, tab state, sheet/menu/toast dispatch, theme |
| `oversight-screens.jsx` | All screen components |
| `oversight-sheets.jsx` | All create/edit modal sheets |
| `oversight-ui.jsx` | Shared primitives — Sheet, ActionSheet, Field, FieldGroup, icons |
| `oversight-ios.css` | iOS-adapted styling for the whole app |
| `ios-frame.jsx` | Device bezel and status bar |

Open `Oversight iOS - Prototype.html` in a browser. No build step.

## Navigation

Five tabs: **Today**, **Projects**, **Archive**, **Profile**, plus a project workspace reachable from any project row.

```
Today ──── running air samples, items needing attention, activity feed
Projects ─ searchable list ──► Project detail
                                ├── Containments
                                ├── Air Samples
                                ├── Materials
                                ├── Team
                                └── Documents
Archive ── completed projects
Profile ── inspector details, signature, templates, appearance
```

## Data model

```
Project
├── Buildings
│   └── Spaces
│       └── Materials        (type, quantity, condition, assessment)
├── Containments             (name, building, spaces, stage)
├── Air Samples              (pump, flow rate, duration → volume, result)
├── Roster                   (workers + certifications w/ expirations)
├── Daily Logs               (date, stage, notes, fail flags)
└── Documents                (generated from templates)
```

Projects move through the abatement stages tracked by the stepper on the project screen; progress percentage is derived from stage completion.

## What's wired

Every function is live, not a static image:

- **Create/edit** — projects, containments, air samples, workers, daily logs, materials
- **Air sample logging** — flow rate and duration calculate sampled volume inline; running samples show elapsed time on Today
- **Containments** — assign to a building and one or more spaces, advance through stages
- **Team** — worker cards with certification badges; expired certs flagged
- **Documents** — generate from templates, set defaults in Profile
- **Profile** — inspector details, drawable signature capture, appearance (light/dark + accent), reset demo data
- **Archive** — completed projects moved out of the active list

Not ported from desktop: Excel import/export.

## Visual system

- iOS large-title headers, grouped inset lists, bottom sheets with drag handles, tab bar
- Light and dark themes with a selectable accent color, controlled in-app from Profile → Appearance or from the preview toolbar
- Monospace for numeric/identifier data (project numbers, dates, sample volumes)
- Minimum 44px hit targets throughout
