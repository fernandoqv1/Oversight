// Main Dashboard Logic

let showingArchivedProjects = false;

// Convert stored unit codes to user-facing display strings ('SF' -> 'ft\u00b2').
function displayUnit(u, fallback) {
    if (u === 'SF') return 'ft\u00b2';
    return u || fallback || '';
}

/**
 * Format a phone number as (XXX) XXX-XXXX
 * @param {string} value - The input value to format
 * @returns {string} - Formatted phone number
 */
function formatPhoneNumber(value) {
    if (!value) return '';
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    
    // Limit to 10 digits
    const limited = digits.slice(0, 10);
    
    // Format based on length
    if (limited.length === 0) return '';
    if (limited.length <= 3) return `(${limited}`;
    if (limited.length <= 6) return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
    return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
}

/** Returns containment name with " Containment" suffix for document display (matches folder naming). */
function getContainmentDisplayName(name) {
    return `${(name || 'Containment').trim()} Containment`;
}

/**
 * Apply phone number formatting to an input element
 * @param {HTMLInputElement} input - The input element to format
 */
function applyPhoneFormatting(input) {
    if (!input) return;
    
    // Format on input
    input.addEventListener('input', (e) => {
        const cursorPosition = e.target.selectionStart;
        const oldValue = e.target.value;
        const oldLength = oldValue.length;
        const formatted = formatPhoneNumber(e.target.value);
        e.target.value = formatted;
        
        // Adjust cursor position to account for formatting characters
        const newLength = formatted.length;
        const lengthDiff = newLength - oldLength;
        
        // Calculate new cursor position
        let newPosition = cursorPosition + lengthDiff;
        
        // If we're in the middle of typing, try to keep cursor in a logical position
        if (cursorPosition === oldLength) {
            // Cursor was at the end, keep it at the end
            newPosition = formatted.length;
        } else {
            // Cursor was in the middle, try to maintain relative position
            // Count digits before cursor in old value
            const digitsBefore = oldValue.slice(0, cursorPosition).replace(/\D/g, '').length;
            // Find position in new value where we have the same number of digits
            let digitCount = 0;
            for (let i = 0; i < formatted.length; i++) {
                if (/\d/.test(formatted[i])) {
                    digitCount++;
                    if (digitCount === digitsBefore) {
                        newPosition = i + 1;
                        break;
                    }
                }
            }
        }
        
        e.target.setSelectionRange(newPosition, newPosition);
    });
    
    // Format existing value if any
    if (input.value) {
        input.value = formatPhoneNumber(input.value);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Defensive: scrub any stale modal markup on initial load. Belt-and-
    // suspenders against a recurring bug where leftover modal nodes block
    // text input on the next modal that opens.
    cleanupOrphanedModals();

    // Escape always closes the topmost active modal and clears orphans.
    // Gives the inspector a recovery path if anything ever feels stuck.
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const modals = document.querySelectorAll('.modal.active');
        if (modals.length > 0) {
            modals[modals.length - 1].remove();
        }
        cleanupOrphanedModals();
    });

    // Migrate any older project data before the dashboard reads it. This is
    // the guarantee behind "updating won't delete your projects": new app
    // versions add missing fields with safe defaults instead of throwing
    // out the record. Runs once per app start; fast no-op when nothing to do.
    migrateAllProjects();

    loadProjects();
    setupEventListeners();
});

const STORAGE_KEY_PREFIX = 'oversight_project_';
const INDEX_KEY = 'oversight_project_index';

// =====================================================================
// SCHEMA MIGRATION
// ---------------------------------------------------------------------
// `DATA_SCHEMA_VERSION` is the shape this build of the app understands.
// Bump it when project JSON gains a new required field or changes shape,
// and add a step to `PROJECT_MIGRATIONS` that upgrades from the previous
// version to the new one. Migrations MUST be additive — never delete
// inspector data; fall back to safe defaults if a field is missing.
// =====================================================================
const DATA_SCHEMA_VERSION = 1;
const SCHEMA_VERSION_KEY = 'oversight_data_schema_version';

const PROJECT_MIGRATIONS = {
    // Example for future use:
    // 1: (p) => { p.someNewField = p.someNewField ?? []; return p; },
};

function migrateProject(project) {
    if (!project || typeof project !== 'object') return project;
    const fromVersion = Number(project.schemaVersion) || 0;
    let v = fromVersion;
    while (v < DATA_SCHEMA_VERSION) {
        const step = PROJECT_MIGRATIONS[v + 1];
        if (typeof step === 'function') {
            try { step(project); } catch (e) {
                console.warn('Migration step', v + 1, 'failed; keeping project as-is.', e);
                break;
            }
        }
        v += 1;
    }
    project.schemaVersion = DATA_SCHEMA_VERSION;
    // Belt-and-suspenders: guarantee the collections the UI iterates exist,
    // so older exports that pre-date a feature still render cleanly.
    if (!Array.isArray(project.buildings)) project.buildings = [];
    if (!Array.isArray(project.materials)) project.materials = [];
    if (!Array.isArray(project.containments)) project.containments = [];
    if (!Array.isArray(project.airSamples)) project.airSamples = [];
    if (!Array.isArray(project.dailyLogs)) project.dailyLogs = [];
    if (!Array.isArray(project.workerRoster)) project.workerRoster = [];
    return project;
}

function migrateAllProjects() {
    try {
        const storedVersion = Number(localStorage.getItem(SCHEMA_VERSION_KEY)) || 0;
        if (storedVersion === DATA_SCHEMA_VERSION) return; // nothing to do
        const index = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
        let migrated = 0;
        for (const id of index) {
            const key = STORAGE_KEY_PREFIX + id;
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            try {
                const project = JSON.parse(raw);
                migrateProject(project);
                localStorage.setItem(key, JSON.stringify(project));
                migrated += 1;
            } catch (e) {
                console.warn('Could not migrate project', id, e);
            }
        }
        localStorage.setItem(SCHEMA_VERSION_KEY, String(DATA_SCHEMA_VERSION));
        if (migrated > 0) {
            console.log(`[migrate] Updated ${migrated} project(s) to schema v${DATA_SCHEMA_VERSION}.`);
        }
    } catch (e) {
        console.warn('Schema migration skipped:', e);
    }
}

function setupEventListeners() {
    const newProjectBtn = document.getElementById('new-oversight-project-btn');
    if (newProjectBtn) {
        newProjectBtn.addEventListener('click', createNewProject);
    }

    const importBtn = document.getElementById('import-project-btn');
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            document.getElementById('import-file-input')?.click();
        });
    }
    
    const importFileInput = document.getElementById('import-file-input');
    if (importFileInput) {
        importFileInput.addEventListener('change', handleImportFile);
    }
    
    // Archived toggle
    const viewArchivedBtn = document.getElementById('view-archived-btn');
    if (viewArchivedBtn) {
        viewArchivedBtn.addEventListener('click', () => {
            showingArchivedProjects = !showingArchivedProjects;
            loadProjects();
        });
    }
    
    // Check for offline banner
    if (!navigator.onLine) {
        const banner = document.getElementById('offline-banner');
        if (banner) banner.classList.add('visible');
    }
}

function loadProjects() {
    // Rendering is owned by js/shell.js (redesigned shell). This helper
    // is now a thin re-render trigger used by archive/delete/import handlers.
    if (window.OverShell && typeof window.OverShell.refreshDashboard === 'function') {
        window.OverShell.refreshDashboard();
    }
}

function getAllProjects() {
    const projects = [];
    
    // Strategy 1: Look for specific index key
    try {
        const index = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
        if (Array.isArray(index) && index.length > 0) {
            // We have an index, load these specific projects
            index.forEach(id => {
                const data = localStorage.getItem(STORAGE_KEY_PREFIX + id);
                if (data) {
                    try {
                        projects.push(JSON.parse(data));
                    } catch (e) {
                        console.error('Error parsing project', id, e);
      }
    }
  });
            return projects;
        }
    } catch (e) {
        console.warn('Error reading project index', e);
    }

    // Strategy 2: Scan all keys (fallback)
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_KEY_PREFIX) && key !== INDEX_KEY) {
            try {
                const data = JSON.parse(localStorage.getItem(key));
                if (data && data.id) {
                    if (!projects.find(p => p.id === data.id)) {
                        projects.push(data);
                    }
                }
            } catch (e) {
                // Ignore non-json or bad data
            }
        }
    }
    
    return projects;
}

// Stages that count as "abated" for percentage (material removal completed, after Active Abatement)
const ABATED_STAGES = [
    'Containment Clearance',
    'Containment Teardown',
    'Abatement Completed'
];

// Stages required for archive - ALL containments must be at Abatement Completed
const ARCHIVE_REQUIRED_STAGES = ['Abatement Completed'];

function isAbatedStage(stage) {
    if (!stage) return false;
    if (ABATED_STAGES.includes(stage)) return true;
    // Fallback for old abbreviated names
    const s = stage.toLowerCase();
    return s.includes('clearance') || s.includes('teardown') || s.includes('completed');
}

function isAllContainmentsCompleted(stage) {
    if (!stage) return false;
    if (ARCHIVE_REQUIRED_STAGES.includes(stage)) return true;
    const s = stage.toLowerCase();
    return s.includes('completed');
}

function calculateMaterialCompletion(project) {
    const materials = project.materials || [];
    const containments = project.containments || [];
    
    if (!materials.length) return { percent: 0, allAbated: false };
    
    // Build a map of material IDs to normalized names for reliable matching
    const materialIdToName = new Map();
    materials.forEach(m => {
        if (m.id) materialIdToName.set(m.id, (m.name || '').trim().toLowerCase());
    });
    
    // Build a map of total project materials by normalized name
    const projectTotals = new Map();
    materials.forEach(material => {
        const matName = (material.name || '').trim().toLowerCase();
        if (!matName) return;
        const prev = projectTotals.get(matName) || 0;
        projectTotals.set(matName, prev + (Number(material.totalQuantity) || 0));
    });
    
    // Build maps of materials: assigned to containments, and abated (in containments past Active Abatement)
    const assignedTotals = new Map();
    const abatedTotals = new Map();
    
    containments.forEach(containment => {
        const stageIsAbated = isAbatedStage(containment.stage);
        const contMats = containment.materials || [];
        
        const processMaterial = (cmName, cmMaterialId, qty) => {
            // Resolve name: prefer materialId lookup for latest name, fall back to stored name
            let resolvedName = cmName;
            if (cmMaterialId && materialIdToName.has(cmMaterialId)) {
                resolvedName = materialIdToName.get(cmMaterialId);
            }
            if (!resolvedName) return;
            
            if (!isNaN(qty) && qty > 0) {
                // Track assigned
                const prevAssigned = assignedTotals.get(resolvedName) || 0;
                assignedTotals.set(resolvedName, prevAssigned + qty);
                
                // Track abated (only if containment stage is past Active Abatement)
                if (stageIsAbated) {
                    const prevAbated = abatedTotals.get(resolvedName) || 0;
                    abatedTotals.set(resolvedName, prevAbated + qty);
                }
            }
        };
        
        if (contMats.length > 0) {
            contMats.forEach(cm => {
                const cmName = (cm.materialName || cm.name || '').trim().toLowerCase();
                const cmMaterialId = cm.materialId || null;
                let qty = 0;
                if (cm.totalQuantity !== null && cm.totalQuantity !== undefined) {
                    qty = Number(cm.totalQuantity);
                } else if (cm.quantity !== null && cm.quantity !== undefined) {
                    qty = Number(cm.quantity);
                }
                processMaterial(cmName, cmMaterialId, qty);
            });
        } else {
            // Fallback: aggregate from containment spaces
            (containment.spaces || []).forEach(space => {
                (space.materials || []).forEach(sm => {
                    const smName = (sm.name || '').trim().toLowerCase();
                    const smMaterialId = sm.materialId || null;
                    const qty = Number(sm.quantity) || 0;
                    processMaterial(smName, smMaterialId, qty);
                });
            });
        }
    });
    
    // Calculate totals
    let totalProjectQty = 0;
    let totalAbatedQty = 0;
    let totalAssignedQty = 0;
    
    projectTotals.forEach((totalQty, matName) => {
        totalProjectQty += totalQty;
        const abated = abatedTotals.get(matName) || 0;
        totalAbatedQty += Math.min(abated, totalQty);
        const assigned = assignedTotals.get(matName) || 0;
        totalAssignedQty += Math.min(assigned, totalQty);
    });
    
    const rawPercent = totalProjectQty > 0
        ? Math.min(100, Math.round((totalAbatedQty / totalProjectQty) * 100))
        : 0;
    const materialsFullyAbated = totalProjectQty > 0 && totalAbatedQty >= totalProjectQty;
    const allAssigned = totalProjectQty > 0 && totalAssignedQty >= totalProjectQty;

    // Archive requires: 100% materials abated AND all containments at Abatement Completed
    const allContainmentsCompleted = containments.length === 0 ||
        containments.every(c => isAllContainmentsCompleted(c.stage));
    const allAbated = materialsFullyAbated && allContainmentsCompleted;

    // Display 100% only when truly ready to archive; otherwise cap at 99
    const percent = rawPercent === 100 && !allAbated ? 99 : rawPercent;

    return { percent, allAbated, allAssigned };
}

// Retained for backwards compatibility; the redesigned shell renders project
// rows directly via js/shell.js (renderTodayView / renderProjectsView /
// renderArchiveView). This stub is unused but kept so older call sites do
// not throw.
function createProjectCard(project) {
    const div = document.createElement('div');
    div.style.display = 'none';
    return div;
}
function _legacy_createProjectCard_unused(project) {
    const div = document.createElement('div');
    div.className = 'list-item-card hover-reveal-card animate-fade-in';
    div.onclick = (e) => {
        // Don't trigger if clicking a button
        if (e.target.closest('button') || e.target.closest('a')) return;
        openProject(project.id);
    };
    div.style.cursor = 'pointer';
    
    if (project.archived) {
        div.classList.add('bg-gray-50');
        div.style.borderColor = '#d1d5db';
    }
    
    const lastMod = new Date(project.lastModified).toLocaleDateString();
    const { percent, allAbated, allAssigned } = calculateMaterialCompletion(project);
    const projName = project.projectNumber || project.siteName || 'Project';
    
    div.innerHTML = `
        <div class="flex justify-between items-start">
            <div>
                <div class="flex items-center gap-2 mb-1">
                    <h3 class="font-semibold text-lg text-gray-900">${escapeHtml(project.name || 'Untitled Project')}</h3>
                    ${project.archived ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700">Archived</span>' : ''}
                </div>
                <p class="text-sm text-gray-600">${escapeHtml(project.siteAddress || 'No address provided')}</p>
                <div class="flex gap-2 mt-2 flex-wrap">
                    <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">ID: ${project.projectNumber || '---'}</span>
                    <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Updated: ${lastMod}</span>
                    ${!project.archived ? `<span class="text-xs ${allAbated ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'} px-2 py-0.5 rounded">${percent}% Abated</span>` : ''}
                </div>
                ${project.archived && project.archivedAt ? `<p class="text-xs text-green-600 font-medium mt-2">✓ Archived on ${new Date(project.archivedAt).toLocaleDateString()}</p>` : ''}
            </div>
            <div class="action-buttons flex gap-2 flex-wrap items-center">
                ${project.archived ? `
                    <button class="btn btn-primary btn-sm" title="Download Project Files" onclick="event.stopPropagation(); downloadArchivedProject('${project.id}', '${escapeHtml(projName)}')">
                        📥 Download
                    </button>
                    <button class="btn btn-secondary btn-sm" title="Unarchive Project" onclick="event.stopPropagation(); unarchiveProject('${project.id}', '${escapeHtml(projName)}')">
                        Unarchive
                    </button>
                ` : `
                    <button class="btn ${allAbated ? 'btn-primary' : 'btn-secondary'} btn-sm ${!allAbated ? 'opacity-50' : ''}" title="${allAbated ? 'Archive this project' : 'All containments must be at Abatement Completed to archive'}" onclick="event.stopPropagation(); archiveProject('${project.id}', '${escapeHtml(projName)}')" ${!allAbated ? 'disabled' : ''}>
                        Archive
                    </button>
                    <button class="btn btn-secondary btn-sm" title="Export to Excel" onclick="event.stopPropagation(); handleExportProject('${project.id}')">
                        <svg xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px;" viewBox="0 0 20 20" aria-hidden="true">
                            <rect x="1.5" y="1.5" width="17" height="17" rx="2.5" fill="#107C41"/>
                            <rect x="4.5" y="5" width="11" height="10" rx="0.5" fill="#ffffff"/>
                            <rect x="4.5" y="5" width="11" height="2.4" fill="#0E6A39"/>
                            <g stroke="#107C41" stroke-width="0.7" stroke-linecap="square">
                                <line x1="4.5" y1="10" x2="15.5" y2="10"/>
                                <line x1="4.5" y1="12.5" x2="15.5" y2="12.5"/>
                                <line x1="8.2" y1="7.4" x2="8.2" y2="15"/>
                                <line x1="11.8" y1="7.4" x2="11.8" y2="15"/>
                            </g>
                        </svg>
                    </button>
                    <button class="btn btn-secondary btn-sm" title="Edit Project Details" onclick="event.stopPropagation(); editProjectFromDashboard('${project.id}')">
                        <svg xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px;" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                        </svg>
                    </button>
                `}
                <button class="btn btn-danger btn-sm" title="Delete Project" onclick="event.stopPropagation(); deleteProject('${project.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px;" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" />
                    </svg>
                </button>
            </div>
        </div>
    `;
    return div;
}

function openProject(id) {
    window.location.href = `project.html?id=${id}`;
}

async function createNewProject() {
    openNewProjectModal();
}

function openNewProjectModal(existingProject = null) {
    const isEdit = !!existingProject;
    
    // Build content HTML efficiently
    const projNum = isEdit ? (existingProject.projectNumber || '') : '';
    const siteName = isEdit ? (existingProject.siteName || existingProject.name || '') : '';
    const siteAddr = isEdit ? (existingProject.siteAddress || '') : '';
    const contractor = isEdit ? (existingProject.contractor || '') : '';
    const foremanName = isEdit ? (existingProject.foremanName || '') : '';
    const foremanPhone = isEdit ? (existingProject.foremanPhone || '') : '';
    const clientName = isEdit ? (existingProject.clientName || '') : '';
    const contactName = isEdit ? (existingProject.clientContactName || '') : '';
    const contactPhone = isEdit ? (existingProject.clientContactPhone || '') : '';
    const clientPhone = isEdit ? (existingProject.clientPhone || '') : '';
    const clientFax = isEdit ? (existingProject.clientFax || '') : '';
    const contractorPhone = isEdit ? (existingProject.contractorPhone || '') : '';
    const contractorFax = isEdit ? (existingProject.contractorFax || '') : '';
    const projectFolderPath = isEdit ? (existingProject.projectFolderPath || '') : '';
    
    const content = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-0.5">Project Number *</label>
                    <input type="text" id="np-project-number" class="w-full py-2 px-3 text-sm border rounded-lg" placeholder="e.g., 25-001" value="${escapeHtml(projNum)}">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-0.5">Site Name *</label>
                    <input type="text" id="np-site-name" class="w-full py-2 px-3 text-sm border rounded-lg" placeholder="e.g., Lincoln Elementary" value="${escapeHtml(siteName)}">
                </div>
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-700 mb-0.5">Site Address *</label>
                <input type="text" id="np-site-address" class="w-full py-2 px-3 text-sm border rounded-lg" placeholder="e.g., 123 Main St, City, State" value="${escapeHtml(siteAddr)}">
            </div>
            <div>
                <label class="block text-xs font-medium text-gray-700 mb-0.5">Project Folder Location</label>
                <div class="flex gap-2">
                    <input type="text" id="np-project-folder" class="flex-1 py-2 px-3 text-sm border rounded-lg" placeholder="e.g., C:\\Projects\\24-001" value="${escapeHtml(projectFolderPath)}" ${typeof window !== 'undefined' && window.electronAPI ? 'readonly' : ''}>
                    ${typeof window !== 'undefined' && window.electronAPI ? `
                    <button type="button" id="np-project-folder-browse" class="btn btn-secondary px-3 py-1.5 text-sm whitespace-nowrap">Browse</button>
                    ` : ''}
                </div>
                <p class="text-xs text-gray-500 mt-0.5">Optional. Select a folder to store project files.</p>
            </div>
            <!-- Client -->
            <div>
                <label class="block text-xs font-medium text-gray-700 mb-0.5">Client Name</label>
                <input type="text" id="np-client-name" class="w-full py-2 px-3 text-sm border rounded-lg" placeholder="Client / Owner name" value="${escapeHtml(clientName)}">
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-0.5">Client Phone</label>
                    <input type="tel" id="np-client-phone" class="w-full py-2 px-3 text-sm border rounded-lg" placeholder="(555) 123-4567" value="${escapeHtml(clientPhone)}">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-0.5">Client Fax</label>
                    <input type="tel" id="np-client-fax" class="w-full py-2 px-3 text-sm border rounded-lg" placeholder="(555) 123-4567" value="${escapeHtml(clientFax)}">
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-0.5">Site Contact Name</label>
                    <input type="text" id="np-contact-name" class="w-full py-2 px-3 text-sm border rounded-lg" placeholder="Site contact name" value="${escapeHtml(contactName)}">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-0.5">Site Contact Phone Number</label>
                    <input type="tel" id="np-contact-phone" class="w-full py-2 px-3 text-sm border rounded-lg" placeholder="(555) 123-4567" value="${escapeHtml(contactPhone)}">
                </div>
            </div>
            <!-- Contractor -->
            <div>
                <label class="block text-xs font-medium text-gray-700 mb-0.5">Contractor Name</label>
                <input type="text" id="np-contractor" class="w-full py-2 px-3 text-sm border rounded-lg" placeholder="Contractor company name" value="${escapeHtml(contractor)}">
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-0.5">Contractor Phone Number</label>
                    <input type="tel" id="np-contractor-phone" class="w-full py-2 px-3 text-sm border rounded-lg" placeholder="(555) 123-4567" value="${escapeHtml(contractorPhone)}">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-0.5">Contractor Fax</label>
                    <input type="tel" id="np-contractor-fax" class="w-full py-2 px-3 text-sm border rounded-lg" placeholder="(555) 123-4567" value="${escapeHtml(contractorFax)}">
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-0.5">Foreman Name</label>
                    <input type="text" id="np-foreman-name" class="w-full py-2 px-3 text-sm border rounded-lg" placeholder="Foreman name" value="${escapeHtml(foremanName)}">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-700 mb-0.5">Foreman Phone Number</label>
                    <input type="tel" id="np-foreman-phone" class="w-full py-2 px-3 text-sm border rounded-lg" placeholder="(555) 123-4567" value="${escapeHtml(foremanPhone)}">
                </div>
            </div>
        </div>
    `;
    
    const modal = createModal(isEdit ? 'Edit Project' : 'New Oversight Project', content, () => {
        const projectNumber = document.getElementById('np-project-number').value.trim();
        const siteName = document.getElementById('np-site-name').value.trim();
        const siteAddress = document.getElementById('np-site-address').value.trim();
        
        if (!projectNumber) {
            alert('Please enter a project number');
            return false;
        }
        if (!siteName) {
            alert('Please enter a site name');
            return false;
        }
        if (!siteAddress) {
            alert('Please enter a site address');
            return false;
        }
        
        // When editing, spread existing project first to preserve all data (worker roster, logs, etc.)
        const projectData = {
            ...(isEdit ? existingProject : {}),
            id: isEdit ? existingProject.id : Date.now().toString(36) + Math.random().toString(36).substr(2),
            projectNumber: projectNumber,
            name: siteName,
            siteName: siteName,
            siteAddress: siteAddress,
            clientName: document.getElementById('np-client-name').value.trim(),
            contractor: document.getElementById('np-contractor').value.trim(),
            foremanName: document.getElementById('np-foreman-name').value.trim(),
            foremanPhone: document.getElementById('np-foreman-phone').value.trim(),
            contractorPhone: document.getElementById('np-contractor-phone').value.trim(),
            contractorFax: document.getElementById('np-contractor-fax').value.trim(),
            clientContactName: document.getElementById('np-contact-name').value.trim(),
            clientContactPhone: document.getElementById('np-contact-phone').value.trim(),
            clientPhone: document.getElementById('np-client-phone').value.trim(),
            clientFax: document.getElementById('np-client-fax').value.trim(),
            projectFolderPath: document.getElementById('np-project-folder')?.value.trim() || undefined,
            created: isEdit ? existingProject.created : new Date().toISOString(),
            lastModified: new Date().toISOString(),
            containments: isEdit ? existingProject.containments : [],
            buildings: isEdit ? existingProject.buildings : [],
            materials: isEdit ? existingProject.materials : [],
            airSamples: isEdit ? existingProject.airSamples : [],
            bulkSamples: isEdit ? (existingProject.bulkSamples || []) : []
        };
        
        saveProject(projectData);
        
        if (isEdit) {
            loadProjects();
        } else {
            openProject(projectData.id);
        }
    });
    
    // Focus first input
    setTimeout(() => {
        document.getElementById('np-project-number')?.focus();
    }, 50);

    // Browse button for project folder (Electron only)
    document.getElementById('np-project-folder-browse')?.addEventListener('click', async () => {
        if (window.electronAPI?.selectFolder) {
            const result = await window.electronAPI.selectFolder();
            if (result?.success && result.folderPath) {
                const input = document.getElementById('np-project-folder');
                if (input) input.value = result.folderPath;
            }
        }
    });
}

/**
 * Remove stuck/orphaned modal elements from the DOM.
 * Redundancy against a recurring bug where text inputs in modals become
 * un-editable because a previous modal failed to clean up, leaving an
 * invisible overlay intercepting clicks.
 */
function cleanupOrphanedModals() {
    document.querySelectorAll('.modal').forEach(m => {
        const hasContent = !!m.querySelector('.modal-content');
        const isActive = m.classList.contains('active');
        if (!isActive || !hasContent) {
            m.remove();
        }
    });
}

// Simple modal creator for main.js
function createModal(title, content, onSave) {
    // Defensive: clean up any orphaned modals before opening a new one.
    cleanupOrphanedModals();

    const modal = document.createElement('div');
    modal.className = 'modal active';
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.maxWidth = '600px';
    modalContent.innerHTML = `
        <h3>${escapeHtml(title)}</h3>
        ${content}
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary modal-cancel-btn">Cancel</button>
            <button type="button" class="btn btn-primary modal-save-btn">Save</button>
        </div>
    `;
    modal.appendChild(modalContent);
    
    // Track mouse down position to prevent closing when dragging from inside modal
    let mouseDownOnBackdrop = false;
    
    modal.addEventListener('mousedown', (e) => {
        // Only track if mousedown was on the backdrop itself
        mouseDownOnBackdrop = (e.target === modal);
    });
    
    modal.addEventListener('click', (e) => {
        // Only close if the click started AND ended on the backdrop
        if (e.target === modal && mouseDownOnBackdrop) {
            modal.remove();
        }
        // Reset the flag
        mouseDownOnBackdrop = false;
    });
    
    modalContent.querySelector('.modal-cancel-btn')?.addEventListener('click', () => modal.remove());
    modalContent.querySelector('.modal-save-btn')?.addEventListener('click', () => {
        const result = onSave();
        if (result !== false) {
            modal.remove();
        }
    });
    
    document.body.appendChild(modal);
    
    // Apply phone formatting to all phone inputs
    setTimeout(() => {
        const phoneInputs = modal.querySelectorAll('input[type="tel"]');
        phoneInputs.forEach(input => applyPhoneFormatting(input));
    }, 50);
    
    return modal;
}

function saveProject(project) {
    // Save individual project
    localStorage.setItem(STORAGE_KEY_PREFIX + project.id, JSON.stringify(project));
    
    // Update index
    const index = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
    if (!index.includes(project.id)) {
        index.push(project.id);
        localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    }
}

async function deleteProject(id) {
    if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;
    
    localStorage.removeItem(STORAGE_KEY_PREFIX + id);
    
    const index = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
    const newIndex = index.filter(i => i !== id);
    localStorage.setItem(INDEX_KEY, JSON.stringify(newIndex));
    
    loadProjects();
}

function handleExportProject(projectId) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_PREFIX + projectId);
        if (!raw) {
            alert('Project not found.');
            return;
        }
        const projectData = JSON.parse(raw);
        exportProjectToExcel(projectData);
    } catch (e) {
        console.error('Export failed', e);
        alert('Failed to export project: ' + e.message);
    }
}

function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const projectData = importProjectFromExcel(data);
            
            if (!projectData.name && projectData.siteName) {
                projectData.name = projectData.siteName;
            }
            if (!projectData.created) {
                projectData.created = projectData.lastModified || new Date().toISOString();
            }
            if (!projectData.lastModified) {
                projectData.lastModified = new Date().toISOString();
            }
            
            saveProject(projectData);
            loadProjects();
            
            showNotification('Project imported successfully!', 'success');
        } catch (err) {
            console.error('Import failed', err);
            alert('Failed to import project: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
    
    // Reset input so the same file can be re-imported
    event.target.value = '';
}

function showNotification(message, type = 'info') {
    const area = document.getElementById('notification-area');
    if (!area) { alert(message); return; }
    const note = document.createElement('div');
    const bgColor = type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#2563eb';
    note.style.cssText = `padding: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); color: white; font-size: 14px; font-weight: 500; background: ${bgColor}; margin-bottom: 8px; animation: notifSlideIn 0.3s ease-out;`;
    note.textContent = message;
    // Ensure animation keyframes exist
    if (!document.getElementById('notif-anim-styles')) {
        const style = document.createElement('style');
        style.id = 'notif-anim-styles';
        style.textContent = `@keyframes notifSlideIn { from { opacity:0; transform:translateX(100%); } to { opacity:1; transform:translateX(0); } } @keyframes notifSlideOut { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(100%); } }`;
        document.head.appendChild(style);
    }
    area.appendChild(note);
    setTimeout(() => {
        note.style.animation = 'notifSlideOut 0.3s ease-in forwards';
        setTimeout(() => note.remove(), 300);
    }, 4000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    // Also escape double quotes for safe use in HTML attributes (e.g. value="...")
    return div.innerHTML.replace(/"/g, '&quot;');
}

function showInputModal(message) {
    return new Promise((resolve) => {
        // Defensive: clean up any orphaned modals before opening a new one.
        cleanupOrphanedModals();
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.zIndex = '10000';
        modal.style.pointerEvents = 'auto';
        
        // Track mouse down position to prevent closing when dragging from inside modal
        let mouseDownOnBackdrop = false;
        
        modal.addEventListener('mousedown', (e) => {
            mouseDownOnBackdrop = (e.target === modal);
        });
        
        // Close modal when clicking backdrop
        modal.addEventListener('click', (e) => {
            if (e.target === modal && mouseDownOnBackdrop) {
                document.body.removeChild(modal);
                resolve(null);
            }
            mouseDownOnBackdrop = false;
        });
        
        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.position = 'relative';
        content.style.zIndex = '10001';
        content.style.pointerEvents = 'auto';
        content.style.minWidth = '300px';
        content.style.maxWidth = '500px';
        
        const label = document.createElement('p');
        label.textContent = message;
        label.style.marginBottom = '1rem';
        label.style.fontSize = '1rem';
        label.style.color = '#374151';
        label.style.fontWeight = '500';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.style.width = '100%';
        input.style.padding = '0.75rem';
        input.style.marginBottom = '1.5rem';
        input.style.border = '1px solid #e5e7eb';
        input.style.borderRadius = '0.5rem';
        input.style.fontSize = '1rem';
        input.style.boxSizing = 'border-box';
        input.style.pointerEvents = 'auto';
        input.style.backgroundColor = 'white';
        input.style.color = '#1f2937';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('spellcheck', 'false');
        input.removeAttribute('readonly');
        input.removeAttribute('disabled');
        input.readOnly = false;
        input.disabled = false;
        
        // Focus styles
        input.addEventListener('focus', () => {
            input.style.borderColor = '#4f46e5';
            input.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.15)';
            input.style.outline = 'none';
        });
        input.addEventListener('blur', () => {
            input.style.borderColor = '#e5e7eb';
            input.style.boxShadow = 'none';
        });
        
        const btnContainer = document.createElement('div');
        btnContainer.style.display = 'flex';
        btnContainer.style.justifyContent = 'flex-end';
        btnContainer.style.gap = '0.75rem';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'btn btn-secondary btn-sm';
        cancelBtn.style.pointerEvents = 'auto';
        cancelBtn.onclick = (e) => {
            e.stopPropagation();
            document.body.removeChild(modal);
            resolve(null);
        };
        
        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.className = 'btn btn-primary btn-sm';
        okBtn.style.pointerEvents = 'auto';
        okBtn.onclick = (e) => {
            e.stopPropagation();
            const val = input.value.trim();
            document.body.removeChild(modal);
            resolve(val);
        };
        
        btnContainer.appendChild(cancelBtn);
        btnContainer.appendChild(okBtn);
        
        content.appendChild(label);
        content.appendChild(input);
        content.appendChild(btnContainer);
        modal.appendChild(content);
        
        document.body.appendChild(modal);
        
        // Focus input after a short delay to ensure it's rendered
        setTimeout(() => {
            input.focus();
            input.select();
        }, 50);
        
        // Handle Enter key
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                okBtn.click();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancelBtn.click();
            }
        });
    });
}

// ============================================
// ARCHIVE / UNARCHIVE / DOWNLOAD
// ============================================

function editProjectFromDashboard(projectId) {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + projectId);
    if (!raw) {
        showNotification('Project not found.', 'error');
        return;
    }
    const project = JSON.parse(raw);
    openNewProjectModal(project);
}

function archiveProject(projectId, projectName) {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + projectId);
    if (!raw) {
        showNotification('Project not found.', 'error');
        return;
    }
    
    const project = JSON.parse(raw);
    const { allAbated } = calculateMaterialCompletion(project);
    
    if (!allAbated) {
        const { percent, allAssigned } = calculateMaterialCompletion(project);
        const conts = project.containments || [];
        const allContDone = conts.length === 0 || conts.every(c => isAllContainmentsCompleted(c.stage));
        let msg = `All site materials must be 100% abated to archive (${percent}% removed).`;
        if (!allContDone) msg = 'All containments must be at Abatement Completed to archive.';
        else if (!allAssigned) msg = 'Assign all materials to containments before archiving.';
        showNotification(msg, 'error');
        return;
    }
    
    if (!confirm(`Archive "${projectName}"? This will mark the project as completed.`)) return;
    
    project.archived = true;
    project.archivedAt = Date.now();
    project.lastModified = new Date().toISOString();
    
    localStorage.setItem(STORAGE_KEY_PREFIX + projectId, JSON.stringify(project));
    showNotification(`${projectName} archived successfully.`, 'success');
    loadProjects();
}

function unarchiveProject(projectId, projectName) {
    if (!confirm(`Unarchive "${projectName}"? It will return to the active projects list.`)) return;
    
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + projectId);
    if (!raw) {
        showNotification('Project not found.', 'error');
        return;
    }
    
    const project = JSON.parse(raw);
    project.archived = false;
    project.unarchivedAt = Date.now();
    project.lastModified = new Date().toISOString();
    
    localStorage.setItem(STORAGE_KEY_PREFIX + projectId, JSON.stringify(project));
    showNotification(`${projectName} unarchived successfully.`, 'success');
    loadProjects();
}

async function downloadArchivedProject(projectId, projectName) {
    try {
        showNotification('Preparing project files for download...', 'info');
        
        const raw = localStorage.getItem(STORAGE_KEY_PREFIX + projectId);
        if (!raw) {
            showNotification('Project not found.', 'error');
            return;
        }
        
        const project = JSON.parse(raw);
        const projectNumber = project.projectNumber || projectName || 'Project';
        
        // Check JSZip
        if (typeof JSZip === 'undefined') {
            showNotification('ZIP library not loaded. Please refresh the page.', 'error');
            return;
        }
        
        // Check docxtemplater
        const DocxtemplaterClass = window.Docxtemplater || (typeof Docxtemplater !== 'undefined' ? Docxtemplater : null);
        const PizZipClass = window.PizZip || (typeof PizZip !== 'undefined' ? PizZip : null);
        
        if (!DocxtemplaterClass || !PizZipClass) {
            showNotification('Document generation libraries not loaded. Please refresh the page.', 'error');
            return;
        }
        
        const zip = new JSZip();
        let filesAdded = 0;
        
        // Helper to get signature by inspector name
        const getSignatureForInspector = (inspectorName) => {
            if (!inspectorName) return '';
            if (typeof getInspectorSignatureByName === 'function') {
                return getInspectorSignatureByName(inspectorName);
            }
            // Fallback: try to get from registry manually
            try {
                const raw = localStorage.getItem('inspector_signatures_registry');
                if (raw) {
                    const registry = JSON.parse(raw);
                    return registry[inspectorName] || '';
                }
            } catch (e) {
                return '';
            }
            return '';
        };
        
        // Helpers
        const formatDate = (dateValue) => {
            if (!dateValue) return '';
            let date;
            if (typeof dateValue === 'number') {
                date = new Date(dateValue);
            } else if (typeof dateValue === 'string') {
                date = new Date(dateValue + (dateValue.includes('T') ? '' : 'T00:00:00'));
        } else {
                return '';
            }
            if (isNaN(date.getTime())) return '';
            return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
        };
        
        const formatTime = (timeString) => {
            if (!timeString) return '';
            const [hours, minutes] = timeString.split(':');
            return `${hours}${minutes}`;
        };
        
        const getInitials = (name) => {
            if (!name) return '';
            const parts = name.trim().split(/\s+/);
            if (parts.length === 0) return '';
            if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
            return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
        };

        const isDateExpired = (dateStr) => {
            if (!dateStr) return false;
            const date = new Date(dateStr + 'T23:59:59');
            return date < new Date();
        };

        const removeEmptyPhotoLogCells = (zip) => {
            const docFile = zip?.file?.('word/document.xml');
            if (!docFile) return;

            const getCellText = (cellXml) => (cellXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
                .map(t => t.replace(/<[^>]+>/g, ''))
                .join('')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .trim();
            const hasImage = (cellXml) => /<w:(?:drawing|pict|object)\b|<a:blip\b/.test(cellXml);
            const isEmptyCell = (cellXml) => !hasImage(cellXml) && getCellText(cellXml) === '';

            const cellPattern = /<w:tc\b[\s\S]*?<\/w:tc>/g;
            let removeNextPhotoImageCell = false;
            const updatedXml = docFile.asText().replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (rowXml) => {
                const cells = rowXml.match(cellPattern);
                if (!cells || cells.length !== 2 || !isEmptyCell(cells[1])) {
                    removeNextPhotoImageCell = false;
                    return rowXml;
                }

                const firstText = getCellText(cells[0]);
                if (/Photo\s*#/.test(firstText)) {
                    removeNextPhotoImageCell = true;
                    return rowXml.replace(cells[1], '');
                }

                if (removeNextPhotoImageCell && hasImage(cells[0])) {
                    removeNextPhotoImageCell = false;
                    return rowXml.replace(cells[1], '');
                }

                removeNextPhotoImageCell = false;
                return rowXml;
            });

            zip.file('word/document.xml', updatedXml);
        };

        // Template document generator - uses ImageModule for {%image}/{%%image} signatures
        const generateDocBlob = async (templatePath, templateData) => {
            try {
                const cacheBuster = `?t=${Date.now()}`;
                const response = await fetch(templatePath + cacheBuster, {
                    cache: 'no-store',
                    headers: { 'Cache-Control': 'no-cache' }
                });
                if (!response.ok) {
                    console.error(`Failed to load template: ${templatePath}`, response.status);
                    return null;
                }
                const arrayBuffer = await response.arrayBuffer();
                const docZip = new PizZipClass(arrayBuffer);
                const docOptions = {
                    paragraphLoop: true,
                    linebreaks: true,
                    delimiters: { start: '{', end: '}' }
                };
                const signatureImageModule = typeof createSignatureImageModule === 'function' ? createSignatureImageModule() : null;
                if (signatureImageModule) docOptions.modules = [signatureImageModule];
                const docTemplate = new DocxtemplaterClass(docZip, docOptions);
                docTemplate.render(templateData);
                if (/Daily Log Template\.docx/i.test(templatePath)) {
                    removeEmptyPhotoLogCells(docTemplate.getZip());
                }
                return docTemplate.getZip().generate({
                    type: 'blob',
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                });
            } catch (error) {
                console.error(`Error generating document from ${templatePath}:`, error);
                return null;
            }
        };
        
        // 1. Generate Daily Logs
        const dailyLogs = project.dailyLogs || [];
        if (dailyLogs.length > 0) {
            const dailyLogsFolder = zip.folder('Daily Logs');
            
            for (const dailyLog of dailyLogs) {
                const activeContainmentNames = dailyLog.activeContainments || [];
                const workLocation = activeContainmentNames.length > 0
                    ? activeContainmentNames.map(n => getContainmentDisplayName(n)).join(', ')
                    : 'No active containments';
                
                // Build log entries with photo numbers and photo log (2-column grid)
                const logEntries = [];
                const photoLogFlat = [];
                let photoCounter = 1;
                if (dailyLog.entries && dailyLog.entries.length > 0) {
                    const sortedEntries = [...dailyLog.entries].sort((a, b) => (a.hour || '').localeCompare(b.hour || ''));
                    sortedEntries.forEach(entry => {
                        const entryPhotoNums = [];
                        (entry.photos || []).forEach(p => {
                            const base64 = (p.base64 || '').trim();
                            if (!base64) return; // Skip empty photos - don't create empty cells
                            entryPhotoNums.push(photoCounter);
                            photoLogFlat.push({ number: photoCounter, photo: base64 });
                            photoCounter++;
                        });
                        logEntries.push({
                            time: formatTime(entry.hour),
                            description: entry.description || entry.notes || '',
                            photoNumber: entryPhotoNums.length === 0 ? '' : entryPhotoNums.length <= 2 ? entryPhotoNums.join(', ') : `${entryPhotoNums[0]}-${entryPhotoNums[entryPhotoNums.length - 1]}`
                        });
                    });
                }
                const photoLogRows = [];
                for (let i = 0; i < photoLogFlat.length; i += 2) {
                    const col1 = photoLogFlat[i];
                    const col2 = photoLogFlat[i + 1] || null;
                    photoLogRows.push(col2 ? { col1, col2 } : { col1 }); // Omit col2 when empty - template can use {#col2} to skip empty cell
                }
                
                // Get air samples for this daily log date
                const logDate = dailyLog.date;
                const airSamplesForDay = (project.airSamples || []).filter(s => s.date === logDate);
                const getSampleLocationDisplay = (s) => {
                    const cName = s.containmentName || (s.containmentId ? (project.containments || []).find(c => c.id === s.containmentId)?.name : null) || '';
                    const loc = (s.location || s.description || '').trim();
                    const displayName = cName ? getContainmentDisplayName(cName) : '';
                    if (displayName && loc) return `${displayName} | ${loc}`;
                    if (displayName) return displayName;
                    if (loc) return loc;
                    return s.type || '';
                };
                const samples = airSamplesForDay.length > 0
                    ? airSamplesForDay.map(s => ({
                        sampleNumber: s.sampleId || s.id || '',
                        sampleDescription: getSampleLocationDisplay(s),
                        sampleType: s.type || 'Area',
                        start: s.startTime ? formatTime(s.startTime) : '-',
                        stop: s.stopTime ? formatTime(s.stopTime) : '-'
                    }))
                    : [{ sampleNumber: '-', sampleType: '-', start: '-', stop: '-', sampleDescription: 'No Samples Taken' }];
                
                const formattedDate = formatDate(dailyLog.date);

                // Aggregate negative pressure from all entries (most recent per containment wins)
                const pressureMap = new Map();
                const sortedEntriesForPressure = [...(dailyLog.entries || [])].sort((a, b) => (a.hour || '').localeCompare(b.hour || ''));
                sortedEntriesForPressure.forEach(entry => {
                    (entry.negativePressure || []).forEach(np => {
                        pressureMap.set(np.containmentId, { containmentName: np.containmentName || 'Unknown', pressure: np.pressure });
                    });
                });
                const negativePressure = pressureMap.size > 0
                    ? 'Negative pressure reading in the containments are as follow, ' +
                        [...pressureMap.values()].map(np => `${getContainmentDisplayName(np.containmentName)} is at ${np.pressure} inWC`).join(', ') + '.'
                    : '';

                // Get signature for the inspector who created this daily log
                const logInspectorName = dailyLog.inspectorName || '';
                const logSignatureBase64 = getSignatureForInspector(logInspectorName);
                
                const templateData = {
                    date: formattedDate,
                    projectNumber: project.projectNumber || '',
                    inspectorName: logInspectorName,
                    inspectorInitials: getInitials(logInspectorName),
                    client: project.clientName || '',
                    contact: project.clientContactName || '',
                    clientPhone: project.clientContactPhone || project.clientPhone || '',
                    clientFax: project.clientFax || '',
                    projectSite: project.siteName || '',
                    workLocation: workLocation,
                    contractor: project.contractor || '',
                    personnelCount: String(dailyLog.workersTotal || (dailyLog.workers || []).length || 0),
                    contractorPhone: project.foremanPhone || project.contractorPhone || '',
                    contractorFax: project.contractorFax || '',
                    negativePressure: negativePressure,
                    samples: samples,
                    logEntries: logEntries,
                    photoLog: photoLogFlat,
                    photoLogRows: photoLogRows,
                    image: logSignatureBase64 || null
                };
                
                const blob = await generateDocBlob('templates/Daily Log Template.docx', templateData);
                if (blob) {
                    const fileName = `Daily_Log_${formattedDate.replace(/\//g, '_')}.docx`;
                    dailyLogsFolder.file(fileName, blob);
                    filesAdded++;
                }
            }
        }
        
        // 2. Generate Worker Roster (if workers exist)
        const workerRoster = project.workerRoster || [];
        if (workerRoster.length > 0) {
            const workerRosterFolder = zip.folder('Worker Roster');

            // ----- Roster-specific date formatters -----
            // The roster template uses tighter column widths than the rest of
            // the document set, so dates are formatted differently here.
            // Header dates (date1..date10):  MM-DD YYYY
            // Cert/medical/fit dates:        MM/DD/YY
            const parseDate = (dateValue) => {
                if (!dateValue) return null;
                let date;
                if (typeof dateValue === 'number') {
                    date = new Date(dateValue);
                } else if (typeof dateValue === 'string') {
                    date = new Date(dateValue + (dateValue.includes('T') ? '' : 'T00:00:00'));
                } else {
                    return null;
                }
                return isNaN(date.getTime()) ? null : date;
            };
            const formatHeaderDate = (dateValue) => {
                const date = parseDate(dateValue);
                if (!date) return '';
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                const yyyy = date.getFullYear();
                return `${mm}-${dd} ${yyyy}`;
            };
            const formatCertDate = (dateValue) => {
                const date = parseDate(dateValue);
                if (!date) return '';
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                const yy = String(date.getFullYear()).slice(-2);
                return `${mm}/${dd}/${yy}`;
            };

            // ----- Attendance matrix (date1..date10 + mark1..mark10) -----
            // Template has 10 fixed date columns. We use the first 10 distinct
            // daily-log dates (oldest first) and mark "X" for each worker who
            // was selected on that day's daily log(s). Match by worker.id with
            // a name fallback for legacy logs.
            const ATTENDANCE_COLS = 10;
            const sortedLogs = (project.dailyLogs || [])
                .slice()
                .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

            const distinctDates = [];
            const workersByDate = new Map(); // dateStr -> { ids:Set, names:Set }
            for (const log of sortedLogs) {
                const d = log.date || '';
                if (!d) continue;
                if (!workersByDate.has(d)) {
                    workersByDate.set(d, { ids: new Set(), names: new Set() });
                    distinctDates.push(d);
                }
                const bucket = workersByDate.get(d);
                for (const w of (log.workers || [])) {
                    if (w && w.id) bucket.ids.add(String(w.id));
                    if (w && w.name) bucket.names.add(String(w.name).trim().toLowerCase());
                }
            }
            if (distinctDates.length > ATTENDANCE_COLS) {
                console.warn(`Worker Roster: ${distinctDates.length} daily-log dates exceed ${ATTENDANCE_COLS} columns; only the first ${ATTENDANCE_COLS} dates will be shown.`);
            }
            const usedDates = distinctDates.slice(0, ATTENDANCE_COLS);
            const dateHeaders = {};
            for (let i = 0; i < ATTENDANCE_COLS; i++) {
                dateHeaders['date' + (i + 1)] = formatHeaderDate(usedDates[i]);
            }

            const buildMarks = (worker) => {
                const idStr = worker && worker.id ? String(worker.id) : '';
                const nameKey = (worker && worker.name) ? String(worker.name).trim().toLowerCase() : '';
                const marks = {};
                for (let i = 0; i < ATTENDANCE_COLS; i++) {
                    const d = usedDates[i];
                    let present = false;
                    if (d) {
                        const bucket = workersByDate.get(d);
                        if (bucket) {
                            present = (idStr && bucket.ids.has(idStr)) ||
                                      (!!nameKey && bucket.names.has(nameKey));
                        }
                    }
                    marks['mark' + (i + 1)] = present ? 'X' : '';
                }
                return marks;
            };

            // ----- Worker rows (cert pairs + attendance marks) -----
            const roster = workerRoster.map(w => {
                const dateOrBlank = (dateVal, exp) => {
                    const fmt = formatCertDate(dateVal);
                    return exp ? fmt : '';
                };
                const dateOrBlankRed = (dateVal, exp) => {
                    const fmt = formatCertDate(dateVal);
                    return exp ? '' : fmt;
                };
                const aheraExpired = isDateExpired(w.aheraExpiration);
                const medicalExpired = isDateExpired(w.medicalExpiration);
                const respiratorExpired = isDateExpired(w.respiratorFitExpiration);
                const leadExpired = isDateExpired(w.leadExpiration);
                const leadMedExpired = isDateExpired(w.leadMedExpiration);
                return {
                    workerName: w.name || '',
                    ...buildMarks(w),
                    aheraExp: dateOrBlankRed(w.aheraExpiration, aheraExpired),
                    aheraExpired: dateOrBlank(w.aheraExpiration, aheraExpired),
                    sOrW: w.certificationType === 'S' ? 'S' : 'W',
                    medicalExp: dateOrBlankRed(w.medicalExpiration, medicalExpired),
                    medicalExpired: dateOrBlank(w.medicalExpiration, medicalExpired),
                    respiratorExp: dateOrBlankRed(w.respiratorFitExpiration, respiratorExpired),
                    respiratorExpired: dateOrBlank(w.respiratorFitExpiration, respiratorExpired),
                    leadExp: dateOrBlankRed(w.leadExpiration, leadExpired),
                    leadExpired: dateOrBlank(w.leadExpiration, leadExpired),
                    leadMedExp: dateOrBlankRed(w.leadMedExpiration, leadMedExpired),
                    leadMedExpired: dateOrBlank(w.leadMedExpiration, leadMedExpired)
                };
            });

            // Legacy second-table data (kept so older templates don't break).
            // The current template doesn't reference these; they're a no-op.
            const COLS_PER_ROW = 2;
            const dailyRoster = sortedLogs.map(log => {
                const workers = log.workers || [];
                const names = workers.map(w => w.name || 'Worker');
                const rows = [];
                for (let i = 0; i < names.length; i += COLS_PER_ROW) {
                    const chunk = names.slice(i, i + COLS_PER_ROW);
                    rows.push({ cell1: chunk[0] || '', cell2: chunk[1] || '' });
                }
                if (rows.length === 0) rows.push({ cell1: '', cell2: '' });
                return {
                    date: formatDate(log.date) || '',
                    workerList: workers.map((w, i) => ({ dailyWorkersName: (w.name || 'Worker') + (i < workers.length - 1 ? '\n' : '') })),
                    workerRows: rows
                };
            });

            const templateData = {
                client: project.clientName || '',
                pjNumber: project.projectNumber || '',
                ...dateHeaders,
                roster,
                dailyRoster
            };
            const rosterBlob = await generateDocBlob('templates/Worker Roster Template.docx', templateData);
            if (rosterBlob) {
                workerRosterFolder.file('Worker_Roster.docx', rosterBlob);
                filesAdded++;
            }
        }
        
        // 3. Generate Containment Documents
        const containments = project.containments || [];
        for (const containment of containments) {
            const containmentFolderName = `${containment.name || 'Containment'} Containment`;
            const containmentFolder = zip.folder(containmentFolderName);
            
            const visualInspections = containment.visualInspections || [];
            const stageHistory = containment.stageHistory || [];
            
            const prestartInspection = visualInspections.find(v => v.type === 'Pre-Start' && v.passed);
            const finalInspection = visualInspections.find(v => v.type === 'Final' && v.passed);
            
            // Pre-Start Visual Inspection
            if (prestartInspection) {
                const formattedDate = formatDate(prestartInspection.date || prestartInspection.createdAt);
                const inspectionInspectorName = prestartInspection.inspectorName || '';
                const inspectionSignatureBase64 = getSignatureForInspector(inspectionInspectorName);
                
                const templateData = {
                    date: formattedDate,
                    projectNumber: project.projectNumber || '',
                    inspectorInitials: getInitials(inspectionInspectorName),
                    client: project.clientName || '',
                    contractor: project.contractor || '',
                    containmentLocation: getContainmentDisplayName(containment.name),
                    typeOfInspection: 'Pre-Start',
                    finding: prestartInspection.passed ? 'Pass' : 'Fail',
                    comments: prestartInspection.comments || '',
                    inspectorName: inspectionInspectorName,
                    image: inspectionSignatureBase64 || null
                };

                const blob = await generateDocBlob('templates/Visual Inspection Template.docx', templateData);
                if (blob) {
                    containmentFolder.file('Pre-Start Visual Inspection.docx', blob);
                    filesAdded++;
                }
            }
            
            // Final Visual Inspection
            if (finalInspection) {
                const formattedDate = formatDate(finalInspection.date || finalInspection.createdAt);
                const inspectionInspectorName = finalInspection.inspectorName || '';
                const inspectionSignatureBase64 = getSignatureForInspector(inspectionInspectorName);
                
                const templateData = {
                    date: formattedDate,
                    projectNumber: project.projectNumber || '',
                    inspectorInitials: getInitials(inspectionInspectorName),
                    client: project.clientName || '',
                    contractor: project.contractor || '',
                    containmentLocation: getContainmentDisplayName(containment.name),
                    typeOfInspection: 'Final',
                    finding: finalInspection.passed ? 'Pass' : 'Fail',
                    comments: finalInspection.comments || '',
                    inspectorName: inspectionInspectorName,
                    image: inspectionSignatureBase64 || null
                };

                const blob = await generateDocBlob('templates/Visual Inspection Template.docx', templateData);
                if (blob) {
                    containmentFolder.file('Final Visual Inspection.docx', blob);
                    filesAdded++;
                }
            }
            
            // Containment Summary
            const findStageInfo = (stageName) => {
                const entry = stageHistory.find(h => h.stage === stageName);
                return entry ? {
                    date: formatDate(entry.changedAt),
                    initials: getInitials(entry.inspectorName)
                } : { date: '', initials: '' };
            };
            
            const activeAbatementInfo = findStageInfo('Active Abatement');
            const clearanceInfo = findStageInfo('Containment Clearance');
            const teardownInfo = findStageInfo('Containment Teardown');
            const completedInfo = findStageInfo('Abatement Completed');
            
            // Build Material Removal List from spaces
            const matRemList = [];
            (containment.spaces || []).forEach(space => {
                const spaceName = space.spaceName || space.name || 'Unknown Space';
                const spaceMaterials = space.materials || [];
                
                spaceMaterials.forEach(material => {
                    const materialName = material.name || material.materialName || 'Unknown Material';
                    const quantity = material.quantity !== undefined
                        ? `${Number(Number(material.quantity).toFixed(2)).toLocaleString()} ${displayUnit(material.unit)}`.trim()
                        : 'N/A';
                    
                    matRemList.push({
                        spaceName: spaceName,
                        materialRemName: materialName,
                        totalSpaceMaterialRemoved: quantity
                    });
                });
            });
            
            // Build Total Materials List
            const materialTotals = {};
            (containment.materials || []).forEach(m => {
                const name = m.name || m.materialName || 'Unknown Material';
                const unit = m.unit || '';
                const key = `${name}|${unit}`;
                
                if (!materialTotals[key]) {
                    materialTotals[key] = { name, unit, total: 0 };
                }
                materialTotals[key].total += (m.quantity || 0);
            });
            
            const totalMatList = Object.values(materialTotals).map(m => ({
                materialRemNameTotal: m.name,
                materialRemAmountTotal: `${Number(m.total.toFixed(2)).toLocaleString()} ${displayUnit(m.unit)}`.trim()
            }));
            
            // Collect comments from visual inspections
            const allComments = visualInspections
                .filter(v => v.comments)
                .map(v => `${v.type}: ${v.comments}`)
                .join('\n') || '';
            
            const summaryTemplateData = {
                client: project.clientName || '',
                siteName: project.siteName || '',
                projectNumber: project.projectNumber || '',
                containmentName: getContainmentDisplayName(containment.name),
                date: activeAbatementInfo.date,
                building: containment.buildingName || '',
                prestartVisualDate: prestartInspection ? formatDate(prestartInspection.date || prestartInspection.createdAt) : '',
                prestartVisualInspectorInitials: prestartInspection ? getInitials(prestartInspection.inspectorName) : '',
                finalVisualDate: finalInspection ? formatDate(finalInspection.date || finalInspection.createdAt) : '',
                finalVisualInspectorInitials: finalInspection ? getInitials(finalInspection.inspectorName) : '',
                // Clearance Air Samples Passed = when stage moved to Teardown (means clearance passed)
                clearanceAirSamplesPassedDate: teardownInfo.date,
                clearanceAirSamplesPassedInitials: teardownInfo.initials,
                // Also provide alternate placeholder names
                containmentTeardownDate: teardownInfo.date,
                containmentTeardownInspectorInitials: teardownInfo.initials,
                // Containment Torn Down, Contractor Released = when stage moved to Completed
                contractorReleasedDate: completedInfo.date,
                contractorReleasedInitials: completedInfo.initials,
                abatementCompletionDate: completedInfo.date,
                abatementCompletionInitials: completedInfo.initials,
                comments: allComments,
                matRemList: matRemList,
                totalMatList: totalMatList
            };
            
            const summaryBlob = await generateDocBlob('templates/Containment Summary Template.docx', summaryTemplateData);
            if (summaryBlob) {
                containmentFolder.file('Containment Summary.docx', summaryBlob);
                filesAdded++;
            }
        }
        
        if (filesAdded === 0) {
            const dailyLogsCount = (project.dailyLogs || []).length;
            const containmentsCount = (project.containments || []).length;
            const workerRosterCount = (project.workerRoster || []).length;
            
            let message = 'No documents found to download. ';
            if (dailyLogsCount === 0 && containmentsCount === 0 && workerRosterCount === 0) {
                message += 'This project has no daily logs, containments with visual inspections, or worker roster.';
            } else {
                message += `Found ${dailyLogsCount} daily logs, ${containmentsCount} containments, ${workerRosterCount} workers. Check console for details.`;
            }
            showNotification(message, 'error');
            return;
        }
        
        // Generate and download ZIP
        showNotification(`Creating ZIP with ${filesAdded} files...`, 'info');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        const zipFileName = `${projectNumber}.zip`;
        if (typeof saveAs !== 'undefined') {
            saveAs(zipBlob, zipFileName);
        } else {
            const url = window.URL.createObjectURL(zipBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = zipFileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        }
        
        showNotification(`Project files downloaded successfully (${filesAdded} documents).`, 'success');
    } catch (error) {
        console.error('Failed to download project files', error);
        showNotification('Failed to download project files. Please try again.', 'error');
    }
}

window.deleteProject = deleteProject;
window.handleExportProject = handleExportProject;
window.editProjectFromDashboard = editProjectFromDashboard;
window.calculateMaterialCompletion = calculateMaterialCompletion;
window.archiveProject = archiveProject;
window.unarchiveProject = unarchiveProject;
window.downloadArchivedProject = downloadArchivedProject;