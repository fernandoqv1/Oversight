# Setup Instructions

## Initial Setup

1. **Install Dependencies**
   ```bash
   cd oversight-desktop
   npm install
   ```

2. **Copy Required Files**
   
   The following files need to be copied from the main mattrack-app:
   - `mattrack-app/dist/output.css` → `oversight-desktop/styles.css` (already done)
   - `mattrack-app/oversight/lib/*` → `oversight-desktop/lib/` (already done)
   - `mattrack-app/misc/*.docx` → `oversight-desktop/templates/` (already done)

3. **Create App Icon**
   
   Create an icon file at `oversight-desktop/assets/icon.png` (and `icon.ico` for Windows)

## Running the Application

### Development Mode
```bash
npm start
```

### Building for Distribution
```bash
npm run build:win
```

The built application will be in the `dist` folder.

## Current Status

### ✅ Completed
- Electron app structure and configuration
- IndexedDB local storage system
- Dashboard with project list
- Project creation and editing (basic)
- Excel export/import functionality
- Basic project view

### 🚧 Partially Implemented
- Project view (basic structure, needs full functionality)
- Material management (basic add/edit)
- Containment management (placeholder)
- Air sample management (placeholder)
- Daily log entries (not yet implemented)
- Document generation (templates copied, but generation logic needs to be ported)

### 📝 To Be Implemented
- Full containment creation/editing with spaces and materials
- Air sample tracking with full functionality
- Daily log entry creation and management
- Worker roster management
- Visual inspection modals
- Document generation (daily logs, inspections, containment summaries, air samples)
- Manual space and material entry UI (currently basic)

## Next Steps

1. **Port Full Project View Functionality**
   - Copy and adapt the project view logic from `mattrack-app/oversight/js/project.js`
   - Remove Firebase dependencies
   - Replace with IndexedDB calls

2. **Implement Manual Material/Space Entry**
   - Create UI for adding buildings, spaces, and materials manually
   - Remove dependency on external data parsing

3. **Port Document Generation**
   - Adapt document generation code from the original Oversight app
   - Update template paths to use local files
   - Use Electron's file system APIs for template reading

4. **Testing**
   - Test Excel export/import
   - Test data persistence
   - Test offline functionality

## Notes

- All Firebase dependencies have been removed
- The app is designed to work completely offline
- Data is stored locally in IndexedDB
- Excel export/import allows project transfer between computers
- The codebase is structured to be easily expandable
