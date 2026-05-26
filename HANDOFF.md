# Oversight Desktop - Project Handoff Document

## Project Overview

This is a **standalone Electron desktop application** that ports the Oversight functionality from the AsbTrack web app into a completely offline, desktop application. The app uses IndexedDB for local storage instead of Firebase, and allows manual entry of spaces and materials (no external data parsing required).

**Key Requirements:**
- Completely offline functionality
- Data logging (containments, air samples, daily logs)
- Document download/generation (Word templates)
- Manual space and material entry (no parsing from external sources)
- Excel export/import for project transfer between computers
- Built with Electron for installation

## Project Location

The project is located in: `oversight-desktop/` (separate from the main `mattrack-app/` folder)

## Current Status Summary

### ✅ Fully Implemented

1. **Electron App Structure**
   - Main process (`main.js`) with window management
   - Preload script (`preload.js`) for secure IPC
   - Package configuration (`package.json`) with build settings
   - IPC handlers for file operations (export/import, template reading)

2. **Local Data Storage (IndexedDB)**
   - Complete storage layer in `js/storage.js`
   - Functions: `initDB()`, `getAllProjects()`, `getProject()`, `saveProject()`, `deleteProject()`
   - Stores projects and inspectors in IndexedDB
   - No Firebase dependencies

3. **Dashboard (Main View)**
   - Project list with filtering (active/archived)
   - Create new project modal
   - Edit project functionality
   - Archive/unarchive projects
   - Delete projects with confirmation
   - Export projects to Excel
   - Import projects from Excel
   - Material completion percentage calculation

4. **Excel Export/Import**
   - Full export functionality in `js/excel.js`
   - Exports all project data to Excel with multiple sheets:
     - Overview
     - Materials
     - Containments
     - Containment Materials
     - Containment Spaces
     - Air Samples
     - Daily Logs
     - Visual Inspections
     - Worker Rosters
     - Full JSON data (for reliable import)
   - Import functionality that reconstructs projects from Excel
   - Uses XLSX library (loaded via CDN)

5. **Basic Project View**
   - Project header with project number and site info
   - Basic material display and add/edit
   - Placeholder sections for containments and air samples
   - Project info sidebar

6. **Utilities**
   - Notification system
   - Date formatting
   - Confirmation modals
   - ID generation
   - Pacific timezone helpers

### 🚧 Partially Implemented

1. **Project View (`project.html` / `js/project.js`)**
   - Basic structure is in place
   - Material add/edit works
   - Containment and air sample sections are placeholders
   - Needs full functionality ported from original Oversight app

2. **Material Management**
   - Basic add/edit works
   - No building/space structure yet
   - Needs manual entry UI for buildings → spaces → materials

### ❌ Not Yet Implemented

1. **Full Containment Management**
   - Create/edit containments with spaces and materials
   - Containment stages (Preparation, Active Abatement, Clearance, Teardown, Completed)
   - Visual inspections (Pre-Start, Final)
   - Stage history tracking
   - Regulated area designation
   - Worker roster per containment
   - Daily log entries per containment

2. **Air Sample Management**
   - Create/edit air samples
   - Sample types (Background, Personal, Area, Clearance)
   - Flow rate tracking
   - Start/stop times
   - Inspector assignment
   - Auto-creation of clearance samples

3. **Daily Log Entries**
   - Create daily logs for containments
   - Negative pressure readings (conditional based on stage)
   - Inspector assignment
   - Comments
   - Date tracking

4. **Manual Space/Material Entry**
   - UI for adding buildings
   - UI for adding spaces within buildings
   - UI for adding materials to spaces
   - Quantity and unit tracking
   - Material selection when creating containments

5. **Document Generation**
   - Daily Log Word document generation
   - Visual Inspection Word document generation (Pre-Start, Final)
   - Containment Summary Word document generation
   - Air Sample Request Word document generation
   - Template file reading (templates are copied but generation logic needs porting)

6. **Worker Roster**
   - Add/edit workers per containment
   - Company, certification tracking
   - Date-based entries

7. **Visual Inspections**
   - Pre-Start inspection modal (when moving to Active Abatement)
   - Final inspection modal (when moving to Clearance)
   - Pass/fail tracking
   - Comments
   - Regulated area determination
   - Auto-creation of clearance samples for non-regulated areas

## File Structure

```
oversight-desktop/
├── main.js                 # Electron main process
├── preload.js              # Preload script for IPC
├── package.json            # NPM configuration and build settings
├── index.html              # Dashboard HTML
├── project.html            # Project view HTML
├── styles.css              # Tailwind CSS (copied from mattrack-app/dist/output.css)
├── README.md               # User-facing documentation
├── SETUP.md                # Setup instructions
├── HANDOFF.md              # This file
├── js/
│   ├── main.js             # Dashboard logic (✅ Complete)
│   ├── project.js           # Project view logic (🚧 Partial)
│   ├── storage.js          # IndexedDB storage layer (✅ Complete)
│   ├── excel.js            # Excel export/import (✅ Complete)
│   └── utils.js            # Utility functions (✅ Complete)
├── lib/                    # Third-party libraries
│   ├── pizzip.min.js       # For Word document generation
│   ├── pizzip-utils.js     # PizZip utilities
│   └── docxtemplater.js    # Word template processing
├── templates/               # Word document templates
│   ├── Daily Log Template.docx
│   ├── Visual Inspection Template.docx
│   ├── Containment Summary Template.docx
│   └── Air Sample Template.docx
└── assets/                  # App icons (needs icon files)
```

## Key Technical Decisions

1. **Storage**: IndexedDB instead of Firebase
   - All data stored locally
   - No network dependencies
   - Fast local access

2. **No External Data Parsing**: 
   - Materials and spaces must be entered manually
   - No dependency on AsbTrack database structure
   - Self-contained data model

3. **Excel for Transfer**:
   - Projects can be exported as Excel files
   - Excel files can be imported to recreate projects
   - Allows transfer between computers/instances

4. **Electron IPC**:
   - File dialogs handled in main process
   - Template reading via IPC
   - Secure context isolation

## Dependencies

**Production:**
- `xlsx` (v0.18.5) - For Excel export/import

**Development:**
- `electron` (v28.3.3) - Electron framework
- `electron-builder` (v24.13.3) - Building installers

**Runtime (via CDN):**
- JSZip (v3.10.1) - For ZIP file creation
- FileSaver.js (v2.0.5) - For file downloads
- XLSX (v0.18.5) - For Excel operations
- PizZip, Docxtemplater - For Word document generation

## Source Code Reference

The original Oversight implementation is in:
- `mattrack-app/oversight/js/main.js` - Dashboard (2518 lines)
- `mattrack-app/oversight/js/project.js` - Project view (4335 lines)
- `mattrack-app/oversight/index.html` - Dashboard HTML
- `mattrack-app/oversight/project.html` - Project view HTML

**Key functions to port:**
- Containment creation/editing (from `project.js`)
- Air sample management (from `project.js`)
- Daily log entry creation (from `project.js`)
- Visual inspection modals (from `project.js`)
- Document generation functions (from `project.js` and `main.js`)
- Material/space selection UI (from `main.js`)

## Implementation Notes

### Storage Schema

**Projects:**
```javascript
{
  id: string,
  projectNumber: string,
  siteName: string,
  siteAddress: string,
  officeName: string,
  clientName: string,
  materials: Array<{
    materialName: string,
    name: string,
    quantity: number,
    totalQuantity: number,
    unit: string,
    buildings?: Array<{
      name: string,
      spaces: Array<{
        name: string,
        quantity: number,
        unit?: string
      }>
    }>
  }>,
  containments: Array<{
    id: string,
    name: string,
    buildingName: string,
    stage: string,
    regulatedArea: boolean,
    spaces: Array<{
      spaceName: string,
      materials: Array<{
        name: string,
        quantity: number,
        unit: string
      }>
    }>,
    materials: Array<{
      materialName: string,
      name: string,
      totalQuantity: number,
      quantity: number,
      unit: string
    }>,
    dailyLogs: Array<{...}>,
    visualInspections: Array<{...}>,
    workerRoster: Array<{...}>,
    stageHistory: Array<{...}>
  }>,
  airSamples: Array<{...}>,
  archived: boolean,
  archivedAt: number,
  createdAt: number,
  updatedAt: number
}
```

### Key Functions to Implement

1. **Manual Material/Space Entry**
   - `openAddBuildingModal()` - Add building
   - `openAddSpaceModal(buildingName)` - Add space to building
   - `openAddMaterialToSpaceModal(spaceName, buildingName)` - Add material to space
   - Update material structure to include buildings/spaces hierarchy

2. **Containment Management**
   - `openNewContainmentModal()` - Full containment creation
   - `openEditContainmentModal(containmentId)` - Edit containment
   - `saveContainment(projectId, containment)` - Save containment
   - `deleteContainment(projectId, containmentId)` - Delete containment
   - Stage transition logic with visual inspections
   - Material assignment to containments

3. **Air Sample Management**
   - `openNewAirSampleModal()` - Create air sample
   - `openEditAirSampleModal(sampleId)` - Edit air sample
   - `saveAirSample(projectId, sample)` - Save air sample
   - `deleteAirSample(projectId, sampleId)` - Delete air sample
   - Auto-creation of clearance samples

4. **Daily Log Management**
   - `openDailyLogModal(containmentId)` - Create daily log
   - `saveDailyLog(projectId, containmentId, log)` - Save daily log
   - Conditional negative pressure requirement (only for Active Abatement stage)

5. **Visual Inspections**
   - `openVisualInspectionModal(type, containmentName)` - Pre-Start or Final inspection
   - Pass/fail logic
   - Regulated area determination
   - Stage transition on pass

6. **Document Generation**
   - `generateDailyLogDocument(projectId, logDate)` - Generate daily log Word doc
   - `generateVisualInspectionDocument(projectId, containmentId, type)` - Generate inspection doc
   - `generateContainmentSummary(projectId, containmentId)` - Generate summary doc
   - `generateAirSampleRequest(projectId, sampleIds)` - Generate air sample request
   - Use Electron IPC to read templates from `templates/` folder
   - Use Docxtemplater to fill templates
   - Trigger download via Electron or FileSaver

7. **Worker Roster**
   - `openWorkerRosterModal(containmentId)` - Manage workers
   - Add/edit/delete workers
   - Date-based entries

## Next Steps (Priority Order)

### Phase 1: Core Functionality
1. **Implement Manual Material/Space Entry**
   - Create UI for adding buildings
   - Create UI for adding spaces to buildings
   - Create UI for adding materials to spaces
   - Update material data structure

2. **Implement Full Containment Management**
   - Port containment creation modal from original
   - Port containment editing
   - Implement stage transitions
   - Implement material assignment

### Phase 2: Data Logging
3. **Implement Air Sample Management**
   - Port air sample creation/editing
   - Implement sample types
   - Implement flow rate tracking

4. **Implement Daily Log Entries**
   - Port daily log modal
   - Implement conditional negative pressure
   - Link to containments

5. **Implement Visual Inspections**
   - Port Pre-Start inspection modal
   - Port Final inspection modal
   - Implement pass/fail logic
   - Implement clearance sample auto-creation

### Phase 3: Document Generation
6. **Port Document Generation**
   - Port daily log document generation
   - Port visual inspection document generation
   - Port containment summary generation
   - Port air sample request generation
   - Update template paths to use Electron IPC
   - **See `DOCUMENT_GENERATION.md` for detailed guide on using Docxtemplater**

### Phase 4: Polish
7. **Worker Roster**
   - Implement worker management per containment

8. **Testing & Bug Fixes**
   - Test Excel export/import thoroughly
   - Test data persistence
   - Test offline functionality
   - Test document generation

## Important Code Patterns

### Saving Data
```javascript
// Always update updatedAt timestamp
project.updatedAt = Date.now();
await saveProject(project);
```

### Loading Data
```javascript
const project = await getProject(projectId);
if (!project) {
    showNotification('Project not found.', true);
    return;
}
```

### Rendering After Changes
```javascript
// After any data modification, re-render
await saveProject(currentProjectData);
renderProject(); // or renderMaterials(), etc.
```

### Modal Pattern
```javascript
const modal = document.createElement('div');
modal.className = 'modal active';
modal.innerHTML = `...`;
modal.addEventListener('click', async (e) => {
    if (e.target.dataset.action === 'save') {
        // Save logic
        await saveProject(currentProjectData);
        modal.remove();
        renderProject();
    }
});
document.body.appendChild(modal);
```

## Testing Checklist

- [ ] Create new project
- [ ] Edit project
- [ ] Delete project
- [ ] Archive/unarchive project
- [ ] Export project to Excel
- [ ] Import project from Excel
- [ ] Add material manually
- [ ] Edit material
- [ ] Create containment (when implemented)
- [ ] Edit containment (when implemented)
- [ ] Create air sample (when implemented)
- [ ] Create daily log (when implemented)
- [ ] Generate documents (when implemented)
- [ ] Data persists after app restart
- [ ] Works completely offline

## Known Issues / TODOs

1. **Project View is Simplified**
   - Only basic material add/edit works
   - Containment and air sample sections are placeholders
   - Need to port full functionality

2. **Material Structure**
   - Currently flat structure
   - Need to implement building → space → material hierarchy
   - Need UI for manual entry

3. **Document Generation**
   - Templates are copied but generation logic not ported
   - Need to use Electron IPC for template reading
   - Need to adapt from original code

4. **Missing Features**
   - Visual inspections
   - Worker roster
   - Full containment management
   - Daily log entries

## Resources

- **Original Oversight Code**: `mattrack-app/oversight/js/`
- **Original HTML**: `mattrack-app/oversight/*.html`
- **Templates**: `mattrack-app/misc/*.docx` (copied to `oversight-desktop/templates/`)
- **Libraries**: `mattrack-app/oversight/lib/` (copied to `oversight-desktop/lib/`)
- **Document Generation Guide**: `DOCUMENT_GENERATION.md` - Complete guide on using Docxtemplater

## Contact / Questions

When picking up this project:
1. Read this document thoroughly
2. Review the original Oversight code in `mattrack-app/oversight/`
3. Start with Phase 1 (Manual Material/Space Entry)
4. Test incrementally as you add features
5. Maintain the IndexedDB storage pattern (no Firebase)

Good luck! 🚀
