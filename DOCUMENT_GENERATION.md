# Document Generation Guide

## Overview

Document generation uses **Docxtemplater** with **PizZip** to fill Word document templates (.docx files) with project data and download them.

## Libraries Used

1. **PizZip** - Reads/writes ZIP files (Word docs are ZIP archives)
2. **Docxtemplater** - Fills template placeholders with data
3. **docxtemplater-image-module-free** - Inserts signature images (no XML injection)
4. **FileSaver.js** - Triggers file downloads in browser
5. **Electron IPC** - For reading template files from disk

## Template Files

Templates are located in `oversight-desktop/templates/`:
- `Daily Log Template.docx`
- `Visual Inspection Template.docx`
- `Containment Summary Template.docx`
- `Air Sample Template.docx`
- `Worker Roster Template.docx`

## How It Works

### 1. Template Structure

Word templates use placeholder syntax like:
```
{projectNumber}
{siteName}
{date}
{#containments}
  {name}
{/containments}
```

### 2. Signature Placeholder (Required Template Update)

**Important:** If your templates use inspector signatures, they must use this syntax:

Replace `{signature}` with:
```
{#signature}{%%signature}{/signature}
```

- `{#signature}` … `{/signature}` – Renders the block only when the inspector has a signature
- `{%%signature}` – Inserts the signature image (centered, max height ~0.45")

Place this on its **own paragraph** in Word (e.g., in the signature cell of a table). The image module will replace it during rendering without editing the document XML, avoiding corruption.

### 3. Daily Log Template (Photo Log)

**Log entries table:** Add a "Photo #" column. In the `{#logEntries}` row, add a cell with `{photoNumber}`. This displays comma-separated photo numbers (e.g. "1, 2" or "3") for entries that have photos.

**Photo Log section (2-column grid, 3.5" x 3.5" per image):** At the end of the Daily Log document, create a table with 2 columns. Set each column width and row height to 3.5" (Table Properties) so cells do not expand.

**Important – avoid document corruption:**
- Put each `{%%photo}` in its **own paragraph** (press Enter before and after each so it's alone on its line).
- Use **default (left) alignment** for the paragraph containing the photo – do not center the paragraph.

Structure:
```
Photo Log
{#photoLogRows}
Row 1 (labels):  | {#col1}Photo #{number}{/col1} | {#col2}Photo #{number}{/col2} |
Row 2 (images):  | {#col1}

{%%photo}

{/col1} | {#col2}

{%%photo}

{/col2} |
{/photoLogRows}
```

- Each row has `col1` and `col2` (col2 may be empty). Use `{%%photo}` for each image.
- Layout: Photo #1 and #2 side by side, then Photo #3 and #4 on the next row, etc.
- The signature uses `{%%image}`; photo log uses `{%%photo}` for the 3.5" size.

**Negative pressure placeholder:** Use `{negativePressure}` to display aggregated negative pressure readings from all log entries. When inspectors enter readings in their log entries, the app aggregates them (most recent per containment when the same containment appears in multiple entries). Format when populated: "Negative pressure reading in the containments are as follow, Containment 1 is at -0.02 inWC, Containment 2 is at -0.03 inWC." When no readings exist, the placeholder renders blank (nothing is generated).

### 4. Worker Roster Template (Required Updates)

**Daily workers grid (2 columns):** For the daily roster section, use `workerRows` to show one worker per cell in a 2-column grid:
```
{#dailyRoster}
Date: {date}
Worker(s):
{#workerRows}
{cell1} | {cell2}
{/workerRows}
{/dailyRoster}
```
Each `{#workerRows}` iteration creates one table row with two cells. Add more rows as needed when there are more than 2 workers per day.

### 5. Reading Templates

**In Electron:**
```javascript
// Use Electron IPC to read template
const result = await window.electronAPI.readTemplate('Daily Log Template.docx');
const templateBuffer = result.data; // ArrayBuffer

// Or use fetch if templates are in app directory
const response = await fetch('./templates/Daily Log Template.docx');
const templateBuffer = await response.arrayBuffer();
```

**In Original Web App:**
```javascript
// Uses PizZipUtils to load from URL
PizZipUtils.getBinaryContent('../misc/Daily Log Template.docx', (error, content) => {
    if (error) throw error;
    const zip = new PizZip(content);
    // ...
});
```

### 6. Generating Documents

```javascript
async function generateDailyLogDocument(projectId, logDate) {
    try {
        // 1. Get project data
        const project = await getProject(projectId);
        
        // 2. Read template
        let templateBuffer;
        if (window.electronAPI) {
            const result = await window.electronAPI.readTemplate('Daily Log Template.docx');
            templateBuffer = result.data;
        } else {
            // Fallback: use fetch
            const response = await fetch('./templates/Daily Log Template.docx');
            templateBuffer = await response.arrayBuffer();
        }
        
        // 3. Load template into PizZip
        const PizZipClass = window.PizZip || PizZip;
        const zip = new PizZipClass(templateBuffer);
        
        // 4. Create Docxtemplater instance
        const DocxtemplaterClass = window.Docxtemplater || Docxtemplater;
        const doc = new DocxtemplaterClass(zip, {
            paragraphLoop: true,
            linebreaks: true
        });
        
        // 5. Prepare data for template
        const templateData = {
            projectNumber: project.projectNumber,
            siteName: project.siteName,
            siteAddress: project.siteAddress,
            date: formatDate(logDate),
            containments: project.containments?.map(c => ({
                name: c.name,
                stage: c.stage,
                // ... more fields
            })) || [],
            // ... more data
        };
        
        // 6. Render template
        doc.render(templateData);
        
        // 7. Generate document
        const blob = doc.getZip().generate({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        
        // 8. Download
        const fileName = `Daily_Log_${project.projectNumber}_${formatDate(logDate).replace(/\//g, '_')}.docx`;
        
        if (window.electronAPI) {
            // Use Electron file save dialog
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            link.click();
            URL.revokeObjectURL(link.href);
        } else {
            // Use FileSaver.js
            saveAs(blob, fileName);
        }
        
        showNotification('Document generated successfully.', false);
    } catch (error) {
        console.error('Document generation error:', error);
        showNotification('Failed to generate document.', true);
    }
}
```

## Key Functions to Port

From `mattrack-app/oversight/js/project.js`:

1. **`generateDailyLogDocument(projectId, logDate)`** - Lines ~2670-2890
2. **`generateVisualInspectionDocument(projectId, containmentId, type)`** - Lines ~2900-3030
3. **`generateContainmentSummary(projectId, containmentId)`** - Lines ~3050-3270
4. **`generateAirSampleRequest(projectId, sampleIds)`** - Lines ~3500-3680

From `mattrack-app/oversight/js/main.js`:

5. **`downloadProjectFiles(projectId)`** - Lines ~1747-2120
   - Generates multiple documents and packages in ZIP
   - Uses `generateDocBlob()` helper function

## Helper Function Pattern

The original code uses a helper function:

```javascript
async function generateDocBlob(templatePath, templateData) {
    return new Promise((resolve, reject) => {
        PizZipUtils.getBinaryContent(templatePath, (error, content) => {
            if (error) {
                reject(error);
                return;
            }
            
            try {
                const zip = new PizZip(content);
                const doc = new Docxtemplater(zip, {
                    paragraphLoop: true,
                    linebreaks: true
                });
                
                doc.render(templateData);
                
                const blob = doc.getZip().generate({
                    type: 'blob',
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                });
                
                resolve(blob);
            } catch (err) {
                reject(err);
            }
        });
    });
}
```

**For Electron, adapt to:**
```javascript
async function generateDocBlob(templatePath, templateData) {
    // Read template via Electron IPC or fetch
    let templateBuffer;
    if (window.electronAPI) {
        const result = await window.electronAPI.readTemplate(templatePath);
        templateBuffer = result.data;
    } else {
        const response = await fetch(`./templates/${templatePath}`);
        templateBuffer = await response.arrayBuffer();
    }
    
    const PizZipClass = window.PizZip || PizZip;
    const zip = new PizZipClass(templateBuffer);
    
    const DocxtemplaterClass = window.Docxtemplater || Docxtemplater;
    const doc = new DocxtemplaterClass(zip, {
        paragraphLoop: true,
        linebreaks: true
    });
    
    doc.render(templateData);
    
    const blob = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    
    return blob;
}
```

## Template Data Structures

### Daily Log Template Data
```javascript
{
    projectNumber: string,
    siteName: string,
    siteAddress: string,
    date: string, // MM/DD/YYYY
    contractor: string,
    foremanName: string,
    foremanPhone: string,
    clientContactName: string,
    clientContactPhone: string,
    containments: Array<{
        name: string,
        stage: string,
        negativePressure: string,
        comments: string
    }>
}
```

### Visual Inspection Template Data
```javascript
{
    projectNumber: string,
    siteName: string,
    containmentName: string,
    inspectionType: string, // "Pre-Start" or "Final"
    date: string,
    inspectorName: string,
    inspectorCert: string,
    passed: boolean,
    comments: string,
    regulatedArea: boolean,
    // ... inspection-specific fields
}
```

### Containment Summary Template Data
```javascript
{
    projectNumber: string,
    siteName: string,
    containmentName: string,
    buildingName: string,
    stage: string,
    regulatedArea: boolean,
    spaces: Array<{
        name: string,
        materials: Array<{
            name: string,
            quantity: number,
            unit: string
        }>
    }>,
    materials: Array<{
        name: string,
        totalQuantity: number,
        unit: string
    }>,
    // ... more fields
}
```

### Air Sample Request Template Data
```javascript
{
    projectNumber: string,
    siteName: string,
    date: string,
    samples: Array<{
        id: string,
        type: string,
        location: string,
        startTime: string,
        stopTime: string
    }>
}
```

## Error Handling

The original code handles:
- Missing Docxtemplater/PizZip libraries
- Template file not found
- Template rendering errors
- Invalid template data

Always wrap in try/catch and show user-friendly notifications.

## Testing

1. Test with valid project data
2. Test with missing data (should handle gracefully)
3. Test template file reading (both Electron IPC and fetch)
4. Test document download
5. Test with different template data structures

## Notes

- Templates must use Docxtemplater syntax (not just simple placeholders)
- Complex templates may use loops, conditionals, etc.
- Word templates are ZIP files, so PizZip is required
- In Electron, use IPC for template reading (more secure than fetch)
- FileSaver.js works in both browser and Electron contexts
