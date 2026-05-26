# Export and Modal Fixes

## Changes Made:

1. **Modal Performance Fixed** - The createNewProjectModal now uses the same `createModal` pattern as other modals, making it faster and consistent.

2. **XLSX Library Added** - Added XLSX library to index.html for Excel export/import.

3. **Export Functionality** - Need to add:
   - Export button to project cards
   - Export function that uses excel.js
   - Project completion check (100% materials removed)
   - Auto-download when project is complete

## Manual Fixes Needed:

### In `js/main.js`:

1. **Fix project card HTML** (around line 122):
   - Change closing `</div>` to proper structure
   - Add export button before delete button

2. **Add export function** (before `window.deleteProject`):
```javascript
async function exportProject(projectId) {
    try {
        const data = localStorage.getItem(STORAGE_KEY_PREFIX + projectId);
        if (!data) {
            alert('Project not found');
            return;
        }
        
        const project = JSON.parse(data);
        
        if (typeof XLSX === 'undefined') {
            alert('Excel export library not loaded. Please refresh the page.');
            return;
        }
        
        const { exportProjectToExcel } = await import('./excel.js');
        const excelBuffer = await exportProjectToExcel(project);
        
        const blob = new Blob([excelBuffer], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = (project.siteName || 'export').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.download = `${project.projectNumber || 'project'}_${safeName}_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert('Project exported successfully!');
    } catch (error) {
        console.error('Export failed:', error);
        alert('Failed to export project: ' + error.message);
    }
}

window.exportProject = exportProject;
```

### In `js/project.js`:

Add project completion check function:
```javascript
function checkProjectCompletion() {
    if (!currentProject.materials || currentProject.materials.length === 0) return false;
    
    // Check if all materials are 100% assigned/removed
    const allComplete = currentProject.materials.every(material => {
        const assigned = getAssignedQuantity(material.id);
        const remaining = (material.totalQuantity || 0) - assigned;
        return remaining <= 0 && (material.totalQuantity || 0) > 0;
    });
    
    if (allComplete && currentProject.materials.length > 0) {
        // Auto-export when complete
        setTimeout(() => {
            if (confirm('Project is 100% complete! Would you like to export the project now?')) {
                exportProject(currentProject.id);
            }
        }, 500);
    }
    
    return allComplete;
}
```

Then call `checkProjectCompletion()` after `saveCurrentProject()` in relevant functions.
