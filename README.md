# Oversight Desktop

A standalone, offline-first desktop application for project oversight and data logging. Built with Electron.

## Features

- **Completely Offline**: Works without internet connection
- **Local Data Storage**: All data stored locally using IndexedDB
- **Manual Data Entry**: Add spaces and materials manually (no external parsing required)
- **Data Logging**: Track containments, air samples, and daily logs
- **Document Generation**: Generate Word documents (daily logs, inspections, containment summaries)
- **Excel Export/Import**: Export projects to Excel for transfer between computers
- **Project Management**: Create, edit, archive, and delete oversight projects

## Installation

### Development

1. Install dependencies:
```bash
npm install
```

2. Run the application:
```bash
npm start
```

### Building

Build for Windows:
```bash
npm run build:win
```

The built application will be in the `dist` folder.

## Project Structure

```
oversight-desktop/
├── main.js              # Electron main process
├── preload.js           # Preload script for secure IPC
├── index.html           # Main dashboard
├── project.html         # Project detail view
├── js/
│   ├── main.js          # Dashboard logic
│   ├── project.js       # Project view logic
│   ├── storage.js       # IndexedDB storage layer
│   ├── excel.js         # Excel export/import
│   └── utils.js         # Utility functions
├── lib/                 # Third-party libraries (docxtemplater, pizzip)
├── templates/           # Word document templates
└── assets/              # App icons and assets
```

## Usage

### Creating a Project

1. Click "New Oversight Project"
2. Enter project details (project number, site name, address, etc.)
3. Add materials and spaces manually
4. Create containments and assign materials
5. Track air samples and daily logs

### Exporting/Importing Projects

- **Export**: Click the "📥 Export" button on any project to save it as an Excel file
- **Import**: Click "📥 Import Project" on the dashboard to load a project from an Excel file

This allows you to transfer projects between different computers or create backups.

### Document Generation

Documents can be generated from the project view:
- Daily Logs
- Visual Inspections (Pre-Start and Final)
- Containment Summaries
- Air Sample Requests

## Data Storage

All data is stored locally in IndexedDB. No data is sent to external servers. The database is stored in the Electron app's user data directory.

## Requirements

- Node.js 16+ 
- Windows 10+ (for built application)

## Development Notes

- The app uses IndexedDB for local storage instead of Firebase
- All Firebase dependencies have been removed
- Space and material data must be entered manually (no automatic parsing)
- Document templates are stored in the `templates/` folder
