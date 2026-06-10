/**
 * Excel export/import functionality for project transfer
 * Uses the XLSX library loaded via CDN in index.html
 */

/**
 * Export a project to Excel format and trigger download
 */
const EXCEL_CELL_LIMIT = 32767;
const EXCEL_PROTECT_PASSWORD = 'HMS';

/** Parse date value from Excel (ISO string, Excel serial number, or Date object) to ISO string */
function parseExcelDate(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val;
  const d = typeof val === 'number' ? new Date((val - 25569) * 86400 * 1000) : new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function protectSheet(ws) {
  if (ws) ws['!protect'] = { password: EXCEL_PROTECT_PASSWORD };
}

/** Convert stored unit code to display form for Excel export ('SF' -> 'ft\u00b2'). */
function exportUnit(u) {
  return u === 'SF' ? 'ft\u00b2' : (u || '');
}

/** Normalize a unit cell from Excel back to internal storage code ('ft\u00b2' / 'ft^2' -> 'SF'). */
function importUnit(u) {
  if (u == null) return '';
  const s = String(u).trim();
  if (s === 'ft\u00b2' || s === 'ft^2' || s.toLowerCase() === 'sq ft' || s.toLowerCase() === 'square feet') return 'SF';
  return s;
}

function exportProjectToExcel(projectData) {
  try {
    if (!window.XLSX) {
      alert('Excel library not loaded. Please refresh the page.');
      return;
    }
    const XLSX = window.XLSX;
    const workbook = XLSX.utils.book_new();

    // Project Overview Sheet
    const overviewData = [
      ['Oversight Project ID', projectData.id || ''],
      ['Project Number', projectData.projectNumber || ''],
      ['Site Name', projectData.siteName || projectData.name || ''],
      ['Site Address', projectData.siteAddress || ''],
      ['Project Folder Path', projectData.projectFolderPath || ''],
      ['Client Name', projectData.clientName || ''],
      ['Client Phone', projectData.clientPhone || ''],
      ['Client Fax', projectData.clientFax || ''],
      ['Client Contact Name', projectData.clientContactName || ''],
      ['Client Contact Phone', projectData.clientContactPhone || ''],
      ['Contractor', projectData.contractor || ''],
      ['Contractor Phone', projectData.contractorPhone || ''],
      ['Contractor Fax', projectData.contractorFax || ''],
      ['Foreman Name', projectData.foremanName || ''],
      ['Foreman Phone', projectData.foremanPhone || ''],
      ['Created At', projectData.created ? new Date(projectData.created).toISOString() : (projectData.createdAt ? new Date(projectData.createdAt).toISOString() : '')],
      ['Last Modified', projectData.lastModified ? new Date(projectData.lastModified).toISOString() : ''],
      ['Archived', projectData.archived ? 'Yes' : 'No']
    ];
    const overviewSheet = XLSX.utils.aoa_to_sheet(overviewData);
    XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');
    protectSheet(overviewSheet);

    // Materials Master List Sheet
    if (projectData.materials && projectData.materials.length > 0) {
      const materialsListData = [['Material ID', 'Material Name', 'Total Quantity', 'Unit', 'Hazard']];
      projectData.materials.forEach(material => {
        const hazard = (material.hazardType || 'asbestos').toLowerCase() === 'lead' ? 'Pb' : 'Asb';
        materialsListData.push([
          material.id || '',
          material.name || material.materialName || '',
          material.totalQuantity || 0,
          exportUnit(material.unit),
          hazard
        ]);
      });
      const materialsListSheet = XLSX.utils.aoa_to_sheet(materialsListData);
      XLSX.utils.book_append_sheet(workbook, materialsListSheet, 'Materials');
      protectSheet(materialsListSheet);
    }

    // Buildings Sheet
    if (projectData.buildings && projectData.buildings.length > 0) {
      const buildingsData = [['Building ID', 'Building Name', 'Spaces Count']];
      projectData.buildings.forEach(building => {
        buildingsData.push([
          building.id || '',
          building.name || '',
          (building.spaces || []).length
        ]);
      });
      const buildingsSheet = XLSX.utils.aoa_to_sheet(buildingsData);
      XLSX.utils.book_append_sheet(workbook, buildingsSheet, 'Buildings');
      protectSheet(buildingsSheet);
    }

    // Spaces with Materials Sheet
    if (projectData.buildings && projectData.buildings.length > 0) {
      const spaceMaterialsData = [['Building Name', 'Space ID', 'Space Name', 'Material Name', 'Quantity', 'Unit']];
      projectData.buildings.forEach(building => {
        (building.spaces || []).forEach(space => {
          const materials = space.materials || [];
          if (materials.length === 0) {
            spaceMaterialsData.push([building.name || '', space.id || '', space.name || '', '', 0, '']);
          } else {
            materials.forEach(mat => {
              spaceMaterialsData.push([
                building.name || '', space.id || '', space.name || '',
                mat.name || mat.materialName || '', mat.quantity || 0, exportUnit(mat.unit)
              ]);
            });
          }
        });
      });
      const spaceMaterialsSheet = XLSX.utils.aoa_to_sheet(spaceMaterialsData);
      XLSX.utils.book_append_sheet(workbook, spaceMaterialsSheet, 'Space Materials');
      protectSheet(spaceMaterialsSheet);
    }

    // Containments Sheet
    if (projectData.containments && projectData.containments.length > 0) {
      const containmentsData = [['ID', 'Name', 'Building', 'Stage', 'Regulated Area', 'Created At']];
      projectData.containments.forEach(c => {
        containmentsData.push([c.id || '', c.name || '', c.buildingName || '', c.stage || '', c.regulatedArea ? 'Yes' : 'No', c.createdAt ? new Date(c.createdAt).toISOString() : '']);
      });
      const containmentsSheet = XLSX.utils.aoa_to_sheet(containmentsData);
      XLSX.utils.book_append_sheet(workbook, containmentsSheet, 'Containments');
      protectSheet(containmentsSheet);
    }

    // Containment Spaces Sheet
    if (projectData.containments && projectData.containments.length > 0) {
      const cSpacesData = [['Containment ID', 'Containment Name', 'Space Name', 'Material Name', 'Quantity', 'Unit']];
      projectData.containments.forEach(c => {
        (c.spaces || []).forEach(space => {
          (space.materials || []).forEach(mat => {
            cSpacesData.push([c.id || '', c.name || '', space.spaceName || space.name || '', mat.name || '', mat.quantity || 0, exportUnit(mat.unit)]);
          });
        });
      });
      const cSpacesSheet = XLSX.utils.aoa_to_sheet(cSpacesData);
      XLSX.utils.book_append_sheet(workbook, cSpacesSheet, 'Containment Spaces');
      protectSheet(cSpacesSheet);
    }

    // Air Samples Sheet
    if (projectData.airSamples && projectData.airSamples.length > 0) {
      const getLocationDisplay = (s) => {
        const cName = s.containmentName || (s.containmentId ? (projectData.containments || []).find(c => c.id === s.containmentId)?.name : null) || '';
        const loc = (s.location || '').trim();
        if (cName && loc) return `${cName} | ${loc}`;
        if (cName) return cName;
        return loc || '';
      };
      const airData = [['Sample ID', 'Type', 'Date', 'Start Time', 'Stop Time', 'Start Flow Rate', 'Stop Flow Rate', 'Location', 'Comments', 'Inspector Name', 'Set ID']];
      projectData.airSamples.forEach(s => {
        airData.push([s.sampleId || s.id || '', s.type || '', s.date || '', s.startTime || '', s.stopTime || '', s.startFlowRate || '', s.stopFlowRate || '', getLocationDisplay(s), s.comments || '', s.inspectorName || '', s.sampleSetId || '']);
      });
      const airSheet = XLSX.utils.aoa_to_sheet(airData);
      XLSX.utils.book_append_sheet(workbook, airSheet, 'Air Samples');
      protectSheet(airSheet);
    }

    // Bulk Samples Sheet
    if (projectData.bulkSamples && projectData.bulkSamples.length > 0) {
      const bulkData = [['Sample ID', 'Material ID', 'Material Name', 'HMR#', 'Location', 'Date', 'Inspector Name', 'Comments']];
      projectData.bulkSamples.forEach(s => {
        bulkData.push([s.sampleId || s.id || '', s.materialId || '', s.materialName || '', s.hmrNumber || '', s.location || '', s.date || '', s.inspectorName || '', s.comments || '']);
      });
      const bulkSheet = XLSX.utils.aoa_to_sheet(bulkData);
      XLSX.utils.book_append_sheet(workbook, bulkSheet, 'Bulk Samples');
      protectSheet(bulkSheet);
    }

    // Wipe Samples Sheet
    if (projectData.wipeSamples && projectData.wipeSamples.length > 0) {
      const wipeData = [['Sample ID', 'Type', 'Containment ID', 'Containment Name', 'Building', 'Space', 'Substrate', 'Component', 'ft²', 'Date', 'Inspector Name', 'Location/Comments', 'Auto-Created']];
      projectData.wipeSamples.forEach(s => {
        wipeData.push([
          s.sampleId || s.id || '', s.type || '', s.containmentId || '', s.containmentName || '',
          s.buildingName || '', s.spaceName || '', s.substrate || '', s.component || '',
          s.squareFeet || '', s.date || '', s.inspectorName || '', s.locationComment || '',
          s.autoCreated ? 'Yes' : 'No'
        ]);
      });
      const wipeSheet = XLSX.utils.aoa_to_sheet(wipeData);
      XLSX.utils.book_append_sheet(workbook, wipeSheet, 'Wipe Samples');
      protectSheet(wipeSheet);
    }

    // Daily Logs Sheet
    if (projectData.dailyLogs && projectData.dailyLogs.length > 0) {
      let globalPhotoNum = 1;
      const logsData = [['Log ID', 'Date', 'Inspector Name', 'Workers Total', 'Active Containments', 'Entry Hour', 'Entry Description', 'Photo #', 'Negative Pressure']];
      projectData.dailyLogs.forEach(log => {
        const ac = (log.activeContainments || []).join('; ');
        const entries = (log.entries || []).sort((a, b) => (a.hour || '').localeCompare(b.hour || ''));
        if (entries.length === 0) {
          logsData.push([log.id || '', log.date || '', log.inspectorName || '', log.workersTotal || 0, ac, '', '', '', '']);
        } else {
          entries.forEach(entry => {
            const np = entry.negativePressure && Array.isArray(entry.negativePressure)
              ? entry.negativePressure.map(p => `${p.containmentName || ''}: ${p.pressure || ''}`).join('; ')
              : '';
            const photoNums = (entry.photos || []).map(() => globalPhotoNum++);
            const photoCol = photoNums.length === 0 ? '' : photoNums.length <= 2 ? photoNums.join(', ') : `${photoNums[0]}-${photoNums[photoNums.length - 1]}`;
            logsData.push([log.id || '', log.date || '', log.inspectorName || '', log.workersTotal || 0, ac, entry.hour || '', entry.description || entry.notes || '', photoCol, np]);
          });
        }
      });
      const logsSheet = XLSX.utils.aoa_to_sheet(logsData);
      XLSX.utils.book_append_sheet(workbook, logsSheet, 'Daily Logs');
      protectSheet(logsSheet);
    }

    // Daily Log Photos sheet - backup for photo transfer (Excel cell limit forces chunking)
    const photosData = [['Log ID', 'Entry Hour', 'Photo Index', 'Chunk Index', 'Base64']];
    (projectData.dailyLogs || []).forEach(log => {
      (log.entries || []).sort((a, b) => (a.hour || '').localeCompare(b.hour || '')).forEach(entry => {
        (entry.photos || []).forEach((p, photoIdx) => {
          const b64 = p.base64 || '';
          if (b64.length <= EXCEL_CELL_LIMIT) {
            photosData.push([log.id || '', entry.hour || '', photoIdx, 0, b64]);
          } else {
            let chunkIdx = 0;
            for (let i = 0; i < b64.length; i += EXCEL_CELL_LIMIT - 100) {
              photosData.push([log.id || '', entry.hour || '', photoIdx, chunkIdx++, b64.slice(i, i + EXCEL_CELL_LIMIT - 100)]);
            }
          }
        });
      });
    });
    if (photosData.length > 1) {
      const photosSheet = XLSX.utils.aoa_to_sheet(photosData);
      XLSX.utils.book_append_sheet(workbook, photosSheet, '_DailyLogPhotos');
      protectSheet(photosSheet);
    }

    // Visual Inspections Sheet
    if (projectData.containments && projectData.containments.length > 0) {
      const viData = [['Containment ID', 'Containment Name', 'Type', 'Date', 'Passed', 'Comments', 'Inspector Name']];
      projectData.containments.forEach(c => {
        (c.visualInspections || []).forEach(vi => {
          viData.push([c.id || '', c.name || '', vi.type || '', vi.date || '', vi.passed ? 'Yes' : 'No', vi.comments || '', vi.inspectorName || '']);
        });
      });
      const viSheet = XLSX.utils.aoa_to_sheet(viData);
      XLSX.utils.book_append_sheet(workbook, viSheet, 'Visual Inspections');
      protectSheet(viSheet);
    }

    // Worker Roster Sheet
    if (projectData.workerRoster && projectData.workerRoster.length > 0) {
      const wrData = [['Worker ID', 'Name', 'Certification Type', 'AHERA Expiration', 'Medical Expiration', 'Respirator Fit Expiration', 'Lead Training Expiration', 'Lead Medical Expiration', 'Respirator Types']];
      projectData.workerRoster.forEach(w => {
        wrData.push([w.id || '', w.name || '', w.certificationType || '', w.aheraExpiration || '', w.medicalExpiration || '', w.respiratorFitExpiration || '', w.leadExpiration || '', w.leadMedExpiration || '', (w.respiratorTypes || []).join('; ')]);
      });
      const wrSheet = XLSX.utils.aoa_to_sheet(wrData);
      XLSX.utils.book_append_sheet(workbook, wrSheet, 'Worker Roster');
      protectSheet(wrSheet);
    }

    // Inspector Signatures Sheet - include signatures of inspectors who worked on this project
    const inspectorSignatures = {};
    if (typeof getInspectorSignaturesRegistry === 'function') {
      const registry = getInspectorSignaturesRegistry();
      // Collect inspector names from daily logs, visual inspections, air samples
      const inspectorNames = new Set();
      (projectData.dailyLogs || []).forEach(log => {
        if (log.inspectorName) inspectorNames.add(log.inspectorName);
      });
      (projectData.containments || []).forEach(containment => {
        (containment.visualInspections || []).forEach(vi => {
          if (vi.inspectorName) inspectorNames.add(vi.inspectorName);
        });
      });
      (projectData.airSamples || []).forEach(sample => {
        if (sample.inspectorName) inspectorNames.add(sample.inspectorName);
      });
      (projectData.bulkSamples || []).forEach(sample => {
        if (sample.inspectorName) inspectorNames.add(sample.inspectorName);
      });
      
      // Add signatures for inspectors who worked on this project
      inspectorNames.forEach(name => {
        if (registry[name]) {
          inspectorSignatures[name] = registry[name];
        }
      });
    }
    
    if (Object.keys(inspectorSignatures).length > 0) {
      const signaturesData = [['Inspector Name', 'Chunk Index', 'Signature Base64']];
      Object.entries(inspectorSignatures).forEach(([name, signature]) => {
        if (signature.length <= EXCEL_CELL_LIMIT) {
          signaturesData.push([name, 0, signature]);
        } else {
          let chunkIdx = 0;
          for (let i = 0; i < signature.length; i += EXCEL_CELL_LIMIT - 100) {
            signaturesData.push([name, chunkIdx++, signature.slice(i, i + EXCEL_CELL_LIMIT - 100)]);
          }
        }
      });
      const signaturesSheet = XLSX.utils.aoa_to_sheet(signaturesData);
      XLSX.utils.book_append_sheet(workbook, signaturesSheet, '_InspectorSignatures');
      protectSheet(signaturesSheet);
    }

    // Full Project Data (JSON) - for complete round-trip import
    // Excel cell limit is 32,767 chars; split into chunks if needed (photos/signatures are base64)
    const fullJson = JSON.stringify(projectData);
    let fullDataSheet;
    if (fullJson.length <= EXCEL_CELL_LIMIT) {
      fullDataSheet = XLSX.utils.json_to_sheet([{ data: fullJson }]);
    } else {
      const chunks = [];
      for (let i = 0; i < fullJson.length; i += EXCEL_CELL_LIMIT - 100) {
        chunks.push({ chunkIndex: chunks.length, data: fullJson.slice(i, i + EXCEL_CELL_LIMIT - 100) });
      }
      fullDataSheet = XLSX.utils.json_to_sheet(chunks);
    }
    XLSX.utils.book_append_sheet(workbook, fullDataSheet, '_FullData');
    protectSheet(fullDataSheet);

    // Generate and download
    const fileName = `${projectData.projectNumber || 'project'}_${projectData.siteName || 'export'}.xlsx`.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    XLSX.writeFile(workbook, fileName);
    return true;
  } catch (error) {
    console.error('Error exporting project to Excel:', error);
    alert('Failed to export project: ' + error.message);
    return false;
  }
}

/**
 * Import a project from an Excel file buffer
 * Returns the reconstructed project data object
 */
function importProjectFromExcel(fileBuffer) {
  try {
    if (!window.XLSX) {
      throw new Error('Excel library not loaded. Please refresh the page.');
    }
    const XLSX = window.XLSX;
    const workbook = XLSX.read(fileBuffer, { type: 'array' });

    // Import inspector signatures if available
    if (workbook.SheetNames.includes('_InspectorSignatures') && typeof getInspectorSignaturesRegistry === 'function') {
      const signaturesSheet = workbook.Sheets['_InspectorSignatures'];
      const signaturesData = XLSX.utils.sheet_to_json(signaturesSheet);
      if (signaturesData.length > 0) {
        const registry = getInspectorSignaturesRegistry();
        const sigByInspector = new Map();
        signaturesData.forEach(row => {
          const name = row['Inspector Name'];
          const chunk = row['Signature Base64'];
          const chunkIdx = row['Chunk Index'];
          if (!name || chunk === undefined) return;
          if (chunkIdx !== undefined) {
            if (!sigByInspector.has(name)) sigByInspector.set(name, []);
            sigByInspector.get(name).push({ idx: chunkIdx, data: String(chunk) });
          } else {
            sigByInspector.set(name, [{ idx: 0, data: String(chunk) }]);
          }
        });
        sigByInspector.forEach((chunks, name) => {
          chunks.sort((a, b) => a.idx - b.idx);
          registry[name] = chunks.map(c => c.data).join('');
        });
        localStorage.setItem('inspector_signatures_registry', JSON.stringify(registry));
      }
    }
    
    // Try full data sheet first (most reliable round-trip)
    if (workbook.SheetNames.includes('_FullData')) {
      const fullDataSheet = workbook.Sheets['_FullData'];
      const fullData = XLSX.utils.sheet_to_json(fullDataSheet);
      if (fullData.length > 0) {
        let jsonStr;
        if (fullData.some(r => r.chunkIndex !== undefined)) {
          // Chunked format: concatenate chunks in order
          fullData.sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));
          jsonStr = fullData.map(r => r.data || '').join('');
        } else {
          jsonStr = fullData[0].data || '';
        }
        if (jsonStr) {
          try {
            const projectData = JSON.parse(jsonStr);
            // Preserve stable Oversight Project ID so re-import updates instead of duplicating
            if (!projectData.id) {
              projectData.id = _genId('prj');
            }
            projectData.created = parseExcelDate(projectData.created) || new Date().toISOString();
            projectData.lastModified = parseExcelDate(projectData.lastModified) || new Date().toISOString();
            delete projectData.archived;
            delete projectData.archivedAt;
            return _finalizeImportedProject(projectData, workbook);
          } catch (e) {
            console.warn('Failed to parse _FullData, falling back to sheet reconstruction', e);
          }
        }
      }
    }

    // Fallback: Reconstruct from individual sheets
    const projectData = {
      id: _genId('prj'),
      created: new Date().toISOString(),
      lastModified: new Date().toISOString()
    };

    // Overview
    if (workbook.SheetNames.includes('Overview')) {
      const overview = XLSX.utils.sheet_to_json(workbook.Sheets['Overview'], { header: 1 });
      const fieldMap = {
        'Oversight Project ID': 'id',
        'Project Number': 'projectNumber',
        'Site Name': 'siteName',
        'Site Address': 'siteAddress',
        'Project Folder Path': 'projectFolderPath',
        'Client Name': 'clientName',
        'Client Phone': 'clientPhone',
        'Client Fax': 'clientFax',
        'Client Contact Name': 'clientContactName',
        'Client Contact Phone': 'clientContactPhone',
        'Contractor': 'contractor',
        'Contractor Phone': 'contractorPhone',
        'Contractor Fax': 'contractorFax',
        'Foreman Name': 'foremanName',
        'Foreman Phone': 'foremanPhone',
        'Created At': 'created',
        'Last Modified': 'lastModified'
      };
      const dateFields = ['created', 'lastModified'];
      overview.forEach(row => {
        if (row.length >= 2 && fieldMap[row[0]]) {
          const key = fieldMap[row[0]];
          const val = dateFields.includes(key) ? (parseExcelDate(row[1]) || row[1]) : row[1];
          if (val != null && val !== '') projectData[key] = val;
        }
      });
      // Also set name from siteName
      if (projectData.siteName) projectData.name = projectData.siteName;
    }

    // Materials
    if (workbook.SheetNames.includes('Materials')) {
      const materials = XLSX.utils.sheet_to_json(workbook.Sheets['Materials'], { header: 1 });
      projectData.materials = [];
      materials.slice(1).forEach(row => {
        if (row.length >= 2) {
          const hazardRaw = (row[4] || 'Asb').toString().trim().toLowerCase();
          const hazardType = hazardRaw === 'pb' || hazardRaw === 'lead' ? 'lead' : 'asbestos';
          projectData.materials.push({
            id: row[0] || _genId('mat'),
            name: row[1] || '',
            materialName: row[1] || '',
            totalQuantity: parseFloat(row[2]) || 0,
            unit: importUnit(row[3]),
            hazardType
          });
        }
      });
    }

    // Buildings & Space Materials
    if (workbook.SheetNames.includes('Buildings')) {
      const buildings = XLSX.utils.sheet_to_json(workbook.Sheets['Buildings'], { header: 1 });
      projectData.buildings = [];
      buildings.slice(1).forEach(row => {
        if (row.length >= 2) {
          projectData.buildings.push({ id: row[0] || _genId('bld'), name: row[1] || '', spaces: [] });
        }
      });
    }

    if (workbook.SheetNames.includes('Space Materials')) {
      if (!projectData.buildings) projectData.buildings = [];
      const spaceMaterials = XLSX.utils.sheet_to_json(workbook.Sheets['Space Materials'], { header: 1 });
      spaceMaterials.slice(1).forEach(row => {
        if (row.length >= 3) {
          const buildingName = row[0] || '';
          const spaceName = row[2] || '';
          let building = projectData.buildings.find(b => b.name === buildingName);
          if (!building) {
            building = { id: _genId('bld'), name: buildingName, spaces: [] };
            projectData.buildings.push(building);
          }
          let space = building.spaces.find(s => s.name === spaceName);
          if (!space && spaceName) {
            space = { id: row[1] || _genId('spc'), name: spaceName, materials: [] };
            building.spaces.push(space);
          }
          if (space && row[3]) {
            space.materials.push({ name: row[3], quantity: parseFloat(row[4]) || 0, unit: importUnit(row[5]) });
          }
        }
      });
    }

    // Containments
    if (workbook.SheetNames.includes('Containments')) {
      const containments = XLSX.utils.sheet_to_json(workbook.Sheets['Containments'], { header: 1 });
      projectData.containments = [];
      containments.slice(1).forEach(row => {
        if (row.length >= 4) {
          projectData.containments.push({
            id: row[0] || _genId('cnt'),
            name: row[1] || '',
            buildingName: row[2] || '',
            stage: row[3] || 'Containment Preparation',
            regulatedArea: row[4] === 'Yes',
            createdAt: row[5] ? new Date(row[5]).getTime() : Date.now(),
            materials: [], spaces: [], dailyLogs: [], visualInspections: [], workerRoster: [], stageHistory: []
          });
        }
      });
    }

    // Containment Spaces
    if (workbook.SheetNames.includes('Containment Spaces') && projectData.containments) {
      const cSpaces = XLSX.utils.sheet_to_json(workbook.Sheets['Containment Spaces'], { header: 1 });
      const spacesMap = new Map();
      cSpaces.slice(1).forEach(row => {
        if (row.length >= 4) {
          const key = `${row[0]}-${row[2]}`;
          if (!spacesMap.has(key)) spacesMap.set(key, { containmentId: row[0], spaceName: row[2], materials: [] });
          if (row[3]) spacesMap.get(key).materials.push({ name: row[3], quantity: parseFloat(row[4]) || 0, unit: importUnit(row[5]) });
        }
      });
      spacesMap.forEach(sp => {
        const c = projectData.containments.find(c => c.id === sp.containmentId);
        if (c) c.spaces.push({ spaceName: sp.spaceName, materials: sp.materials });
      });
    }

    // Daily Logs (fallback - metadata only; photos come from _DailyLogPhotos)
    if (workbook.SheetNames.includes('Daily Logs')) {
      const logsSheet = XLSX.utils.sheet_to_json(workbook.Sheets['Daily Logs'], { header: 1 });
      const logsMap = new Map(); // key: logId
      logsSheet.slice(1).forEach(row => {
        if (row.length < 6) return;
        const logId = row[0] || _genId('log');
        if (!logsMap.has(logId)) {
          logsMap.set(logId, {
            id: logId,
            date: row[1] || '',
            inspectorName: row[2] || '',
            workersTotal: Number(row[3]) || 0,
            activeContainments: (row[4] || '').split('; ').filter(Boolean),
            entries: []
          });
        }
        const log = logsMap.get(logId);
        log.entries.push({
          id: _genId('ent'),
          hour: row[5] || '',
          description: row[6] || row[7] || '',
          notes: row[6] || row[7] || '',
          photos: []
        });
      });
      projectData.dailyLogs = Array.from(logsMap.values());
    }

    // Merge photos from _DailyLogPhotos into dailyLogs
    if (workbook.SheetNames.includes('_DailyLogPhotos') && projectData.dailyLogs) {
      const photosSheet = XLSX.utils.sheet_to_json(workbook.Sheets['_DailyLogPhotos'], { header: 1 });
      const photoChunks = new Map(); // key: "logId|hour|photoIdx"
      photosSheet.slice(1).forEach(row => {
        if (row.length < 5) return;
        const key = `${row[0]}|${row[1]}|${row[2]}`;
        const chunkIdx = row[3];
        const chunk = row[4] || '';
        if (!photoChunks.has(key)) photoChunks.set(key, []);
        photoChunks.get(key).push({ idx: chunkIdx, data: String(chunk) });
      });
      photoChunks.forEach((chunks, key) => {
        const [logId, hour, photoIdx] = key.split('|');
        chunks.sort((a, b) => a.idx - b.idx);
        const base64 = chunks.map(c => c.data).join('');
        const log = projectData.dailyLogs.find(l => l.id === logId);
        if (log) {
          const entry = (log.entries || []).find(e => (e.hour || '') === hour);
          if (entry) {
            if (!entry.photos) entry.photos = [];
            while (entry.photos.length <= parseInt(photoIdx, 10)) entry.photos.push({ id: _genId('ph'), base64: '' });
            const idx = parseInt(photoIdx, 10);
            entry.photos[idx] = { id: (entry.photos[idx] && entry.photos[idx].id) || _genId('ph'), base64 };
          }
        }
      });
    }

    // Air Samples
    if (workbook.SheetNames.includes('Air Samples')) {
      const samples = XLSX.utils.sheet_to_json(workbook.Sheets['Air Samples'], { header: 1 });
      projectData.airSamples = [];
      samples.slice(1).forEach(row => {
        if (row.length >= 2) {
          const sampleObj = {
            id: _genId('as'), sampleId: row[0] || '', type: row[1] || '', date: row[2] || '',
            startTime: row[3] || '', stopTime: row[4] || '', startFlowRate: row[5] || null,
            stopFlowRate: row[6] || null, location: row[7] || '', comments: row[8] || '',
            inspectorName: row[9] || '', createdAt: Date.now()
          };
          if (row[10]) sampleObj.sampleSetId = row[10];
          projectData.airSamples.push(sampleObj);
        }
      });
    }

    // Wipe Samples
    if (workbook.SheetNames.includes('Wipe Samples')) {
      const wipeRows = XLSX.utils.sheet_to_json(workbook.Sheets['Wipe Samples'], { header: 1 });
      projectData.wipeSamples = [];
      wipeRows.slice(1).forEach(row => {
        if (row.length >= 2) {
          projectData.wipeSamples.push({
            id: _genId('ws'),
            sampleId: row[0] || '',
            type: row[1] || '',
            containmentId: row[2] || '',
            containmentName: row[3] || '',
            buildingName: row[4] || '',
            spaceName: row[5] || '',
            substrate: row[6] || '',
            component: row[7] || '',
            squareFeet: row[8] || '',
            date: row[9] || '',
            inspectorName: row[10] || '',
            locationComment: row[11] || '',
            autoCreated: String(row[12] || '').toLowerCase() === 'yes',
            createdAt: Date.now()
          });
        }
      });
    }

    // Bulk Samples
    if (workbook.SheetNames.includes('Bulk Samples')) {
      const bulkRows = XLSX.utils.sheet_to_json(workbook.Sheets['Bulk Samples'], { header: 1 });
      projectData.bulkSamples = [];
      bulkRows.slice(1).forEach(row => {
        if (row.length >= 2) {
          projectData.bulkSamples.push({
            id: _genId('bs'),
            sampleId: row[0] || '',
            materialId: row[1] || '',
            materialName: row[2] || '',
            hmrNumber: row[3] || '',
            location: row[4] || '',
            date: row[5] || '',
            inspectorName: row[6] || '',
            comments: row[7] || ''
          });
        }
      });
    }

    // Worker Roster
    if (workbook.SheetNames.includes('Worker Roster')) {
      const roster = XLSX.utils.sheet_to_json(workbook.Sheets['Worker Roster'], { header: 1 });
      projectData.workerRoster = [];
      roster.slice(1).forEach(row => {
        if (row.length >= 2) {
          projectData.workerRoster.push({
            id: row[0] || _genId('wkr'), name: row[1] || '', certificationType: row[2] || 'W',
            aheraExpiration: row[3] || '', medicalExpiration: row[4] || '',
            respiratorFitExpiration: row[5] || '', leadExpiration: row[6] || '', leadMedExpiration: row[7] || '',
            respiratorTypes: row[8] ? row[8].split('; ').filter(t => t) : [],
            createdAt: Date.now()
          });
        }
      });
    }

    projectData.bulkSamples = projectData.bulkSamples || [];
    projectData.wipeSamples = projectData.wipeSamples || [];
    (projectData.materials || []).forEach(m => {
      if (!m.hazardType) m.hazardType = 'asbestos';
    });
    return _finalizeImportedProject(projectData, workbook);
  } catch (error) {
    console.error('Error importing project from Excel:', error);
    throw error;
  }
}

/** Read Oversight Project ID from Overview when missing; ensure id is always set. */
function _finalizeImportedProject(projectData, workbook) {
  if ((!projectData.id || projectData.id === '') && workbook.SheetNames.includes('Overview')) {
    const overview = XLSX.utils.sheet_to_json(workbook.Sheets['Overview'], { header: 1 });
    const idRow = overview.find(row => row[0] === 'Oversight Project ID');
    if (idRow && idRow[1]) projectData.id = String(idRow[1]).trim();
  }
  if (!projectData.id) projectData.id = _genId('prj');
  if (projectData.siteName && !projectData.name) projectData.name = projectData.siteName;
  return projectData;
}

function _genId(prefix) {
  return crypto.randomUUID ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
