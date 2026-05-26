# Agent Prompt - Oversight Desktop Project

## Context

I'm working on a standalone Electron desktop application called "Oversight Desktop" that ports the Oversight functionality from an existing web app (AsbTrack) into a completely offline desktop application.

## Project Location

The project is in the `oversight-desktop/` folder (separate from the main `mattrack-app/` folder).

## Current Status

### ✅ Completed
- Electron app structure (main process, preload, package.json)
- IndexedDB local storage system (replaces Firebase)
- Dashboard with full project management (create, edit, delete, archive, export/import)
- Excel export/import functionality for project transfer
- Basic project view structure
- Utility functions (notifications, modals, date formatting)

### 🚧 Partially Done
- Project view: Basic structure exists, but needs full functionality
- Material management: Simple add/edit works, but needs building/space hierarchy

### ❌ Not Done
- Manual space/material entry UI (buildings → spaces → materials)
- Full containment management (creation, editing, stage transitions)
- Air sample management
- Daily log entries
- Visual inspections (Pre-Start, Final)
- Document generation (Word templates)
- Worker roster management

## Your Task

Continue development by implementing the missing features. Start with:

1. **Manual Material/Space Entry** - Create UI for users to manually add:
   - Buildings
   - Spaces within buildings
   - Materials within spaces (with quantities and units)

2. **Full Containment Management** - Port from original code:
   - Containment creation with space/material selection
   - Containment editing
   - Stage transitions (Preparation → Active Abatement → Clearance → Teardown → Completed)
   - Visual inspections when transitioning stages
   - Material assignment to containments

3. **Data Logging Features** - Port from original:
   - Air sample creation/editing
   - Daily log entries (with conditional negative pressure)
   - Visual inspection modals

4. **Document Generation** - Port document generation code:
   - Daily logs
   - Visual inspections
   - Containment summaries
   - Air sample requests

## Key Information

- **Storage**: Uses IndexedDB (see `js/storage.js`) - NO Firebase
- **Original Code**: Reference `mattrack-app/oversight/js/project.js` (4335 lines) and `main.js` (2518 lines)
- **Templates**: Word templates are in `templates/` folder
- **Libraries**: Docxtemplater, PizZip for Word generation; XLSX for Excel

## Important Files

- `HANDOFF.md` - Complete detailed status and implementation guide
- `QUICK_START.md` - Quick reference for getting started
- `js/storage.js` - Storage functions (complete, use as reference)
- `js/main.js` - Dashboard logic (complete, use as reference)
- `js/project.js` - Project view (needs expansion)

## Code Pattern

```javascript
// Always follow this pattern:
// 1. Update currentProjectData
// 2. Save to IndexedDB
// 3. Re-render UI

currentProjectData.newData = value;
await saveProject(currentProjectData);
renderProject();
```

## Next Steps

1. Read `HANDOFF.md` thoroughly for complete details
2. Review original code in `mattrack-app/oversight/js/project.js`
3. Start with manual material/space entry UI
4. Test incrementally
5. Maintain IndexedDB pattern (no Firebase)

## Questions to Answer

- How should buildings/spaces/materials be structured in the data model?
- How should containment creation work with manual material entry?
- How should document generation work with Electron (template reading)?

Refer to `HANDOFF.md` for detailed answers and implementation guidance.
