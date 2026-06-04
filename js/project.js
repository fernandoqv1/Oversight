// Project Details Logic - Oversight Desktop
// Following HANDOFF.md guidelines for building → space → material hierarchy
// STORAGE_KEY_PREFIX is defined in js/main.js (loaded before this file on project.html)

let currentProject = null;
let currentSubview = null; // null = main, 'workerRoster', 'dailyLog'

// Expose currentProject to window so the redesigned shell (js/shell.js)
// can read the latest state for tab rendering after mutations.
function _publishCurrentProject() {
    try { window.currentProject = currentProject; } catch (e) {}
}
function _shellRefresh() {
    _publishCurrentProject();
    if (window.OverShell && typeof window.OverShell.renderAll === 'function') {
        window.OverShell.renderAll();
    }
}

// Convert stored unit codes to user-facing display strings.
// Storage values stay as legacy codes for backwards compatibility.
function displayUnit(u, fallback) {
    if (u === 'SF') return 'ft\u00b2';
    return u || fallback || '';
}

// Stage name constants matching example_oversight
const STAGE_CONTAINMENT_PREPARATION = 'Containment Preparation';
const STAGE_ACTIVE_ABATEMENT = 'Active Abatement';
const STAGE_CONTAINMENT_CLEARANCE = 'Containment Clearance';
const STAGE_CONTAINMENT_TEARDOWN = 'Containment Teardown';
const STAGE_ABATEMENT_COMPLETED = 'Abatement Completed';

const ALL_STAGES = [
    STAGE_CONTAINMENT_PREPARATION,
    STAGE_ACTIVE_ABATEMENT,
    STAGE_CONTAINMENT_CLEARANCE,
    STAGE_CONTAINMENT_TEARDOWN,
    STAGE_ABATEMENT_COMPLETED
];

// Stages considered "active" for daily log work location (prior to teardown)
const ACTIVE_CONTAINMENT_STAGES = [
    STAGE_CONTAINMENT_PREPARATION,
    STAGE_ACTIVE_ABATEMENT,
    STAGE_CONTAINMENT_CLEARANCE
];

const respiratorOptions = ['Half-Face', 'Full-Face', 'PAPR'];

/** Returns containment name with " Containment" suffix for document display (matches folder naming). */
function getContainmentDisplayName(name) {
    const base = (name || 'Containment').trim().replace(/\s+Containment$/i, '');
    return base ? `${base} Containment` : 'Containment';
}

const LS_LAST_BUILDING_PREFIX = 'oversight_last_building_';

function getLastBuildingId(projectId) {
    if (!projectId) return '';
    try {
        return localStorage.getItem(LS_LAST_BUILDING_PREFIX + projectId) || '';
    } catch {
        return '';
    }
}

function setLastBuildingId(projectId, buildingId) {
    if (!projectId || !buildingId) return;
    try {
        localStorage.setItem(LS_LAST_BUILDING_PREFIX + projectId, buildingId);
    } catch {
        /* ignore */
    }
}

function applyLastBuildingSelection(selectEl) {
    if (!selectEl || !currentProject?.id) return;
    const last = getLastBuildingId(currentProject.id);
    if (last && Array.from(selectEl.options).some(o => o.value === last)) {
        selectEl.value = last;
    }
}

const LS_PROJECT_DETAILS_HIDDEN_PREFIX = 'oversightDesktop_pdHidden_';

function projectDetailsHiddenStorageKey() {
    return LS_PROJECT_DETAILS_HIDDEN_PREFIX + (currentProject?.id || 'default');
}

function isProjectDetailsHidden() {
    return localStorage.getItem(projectDetailsHiddenStorageKey()) === '1';
}

function setProjectDetailsHidden(hidden) {
    localStorage.setItem(projectDetailsHiddenStorageKey(), hidden ? '1' : '0');
    applyProjectDetailsVisibility();
}

function applyProjectDetailsVisibility() {
    const content = document.getElementById('project-details-content');
    const toggleBtn = document.getElementById('project-details-toggle-btn');
    const collapsedRow = document.getElementById('project-details-collapsed-actions');
    if (!content || !toggleBtn) return;

    const hidden = isProjectDetailsHidden();
    content.classList.toggle('hidden', hidden);
    toggleBtn.textContent = hidden ? 'Show' : 'Hide';

    const canFolder = !!(currentProject?.projectFolderPath && typeof window !== 'undefined' && window.electronAPI?.openFolder);
    if (collapsedRow) {
        if (hidden && canFolder) {
            collapsedRow.classList.remove('hidden');
        } else {
            collapsedRow.classList.add('hidden');
        }
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

    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('id');

    if (!projectId) {
        showError('No project ID specified');
        return;
    }

    loadProject(projectId);
    setupEventListeners();
});

function setupEventListeners() {
    // The redesigned shell (js/shell.js) owns the project workspace chrome
    // (sidebar, topbar, tabs, tab-level action buttons). All button IDs
    // referenced here belonged to the legacy DOM, which no longer exists,
    // so the optional chaining short-circuits safely. Modal builders that
    // these handlers point at remain available as global functions and
    // are wired by the shell where appropriate.
}

function loadProject(id) {
    const data = localStorage.getItem(STORAGE_KEY_PREFIX + id);
    if (!data) {
        showError('Project not found');
        return;
    }
    
    try {
        currentProject = JSON.parse(data);
        // Ensure arrays exist
        if (!currentProject.buildings) currentProject.buildings = [];
        if (!currentProject.materials) currentProject.materials = [];
        if (!currentProject.containments) currentProject.containments = [];
        if (!currentProject.airSamples) currentProject.airSamples = [];
        if (!currentProject.bulkSamples) currentProject.bulkSamples = [];
        if (!currentProject.workerRoster) currentProject.workerRoster = [];
        if (!currentProject.dailyLogs) currentProject.dailyLogs = [];
        currentProject.workerRoster = normalizeWorkerRoster(currentProject.workerRoster);
        _publishCurrentProject();
        renderProject();
    } catch (e) {
        console.error(e);
        showError('Error loading project data');
    }
}

function renderProject() {
    if (!currentProject) return;
    // The redesigned shell (js/shell.js) renders the project workspace.
    _shellRefresh();
}

function renderProjectInfo() {
    _shellRefresh();
    const container = document.getElementById('project-info');
    const card = document.getElementById('project-info-card');
    if (!container || !card) return;

    if (!card.dataset.folderHandlerSet) {
        card.dataset.folderHandlerSet = '1';
        card.addEventListener('click', async (e) => {
            const btn = e.target.closest('.open-project-folder-btn');
            if (!btn || !currentProject?.projectFolderPath) return;
            e.preventDefault();
            if (!window.electronAPI?.openFolder) return;
            const result = await window.electronAPI.openFolder(currentProject.projectFolderPath);
            if (!result?.success && result?.error) {
                showNotification(result.error || 'Folder not found or not accessible', true);
            }
        });
    }
    
    container.innerHTML = `
        <!-- Project & Site -->
        <div class="col-span-2 md:col-span-4 border-b border-gray-100 pb-4 mb-4">
            <h4 class="text-sm font-semibold text-gray-700 mb-3">Project & Site</h4>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
                <div>
                    <span class="text-xs text-gray-500 block mb-0.5">Project Number</span>
                    <span class="font-medium text-gray-900">${escapeHtml(currentProject.projectNumber || '-')}</span>
                </div>
                <div>
                    <span class="text-xs text-gray-500 block mb-0.5">Site Name</span>
                    <span class="font-medium text-gray-900">${escapeHtml(currentProject.siteName || currentProject.name || '-')}</span>
                </div>
                <div class="col-span-2">
                    <span class="text-xs text-gray-500 block mb-0.5">Site Address</span>
                    <span class="font-medium text-gray-900">${escapeHtml(currentProject.siteAddress || '-')}</span>
                </div>
                ${currentProject.projectFolderPath && typeof window !== 'undefined' && window.electronAPI?.openFolder ? `
                <div class="col-span-2 md:col-span-4" style="display: flex; flex-direction: row; align-items: center; flex-wrap: nowrap; gap: 0.5rem;">
                    <span class="text-xs text-gray-500" style="flex-shrink: 0;">Project Folder:</span>
                    <button type="button" class="open-project-folder-btn text-sm text-indigo-600 hover:text-indigo-800 hover:underline font-medium" style="flex-shrink: 0; display: inline-flex; flex-direction: row; flex-wrap: nowrap; align-items: center; gap: 0.375rem; white-space: nowrap;" title="${escapeHtml(currentProject.projectFolderPath)}">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" style="flex-shrink: 0; display: inline-block; vertical-align: middle;" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M3.75 3A1.75 1.75 0 002 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-8.5A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75z"/>
                        </svg>
                        <span style="white-space: nowrap;">Open folder</span>
                    </button>
                </div>
                ` : ''}
            </div>
        </div>
        
        <!-- Contractor & Client -->
        <div class="col-span-2 md:col-span-4 grid grid-cols-2 gap-4 md:gap-6">
            <div class="border-b border-gray-100 pb-4 mb-4 md:mb-0">
                <h4 class="text-sm font-semibold text-gray-700 mb-2">Abatement Contractor</h4>
                <div class="space-y-1.5">
                    <div><span class="text-xs text-gray-500">Contractor:</span> <span class="font-medium text-gray-900">${escapeHtml(currentProject.contractor || '-')}</span></div>
                    <div><span class="text-xs text-gray-500">Foreman:</span> <span class="font-medium text-gray-900">${escapeHtml(currentProject.foremanName || '-')}</span>${currentProject.foremanPhone ? ` <span class="text-gray-500 text-sm">${escapeHtml(currentProject.foremanPhone)}</span>` : ''}</div>
                </div>
            </div>
            <div class="border-b border-gray-100 pb-4 mb-4 md:mb-0">
                <h4 class="text-sm font-semibold text-gray-700 mb-2">Site Contact</h4>
                <div class="space-y-1.5">
                    <div><span class="text-xs text-gray-500">Client:</span> <span class="font-medium text-gray-900">${escapeHtml(currentProject.clientName || '-')}</span></div>
                    <div><span class="text-xs text-gray-500">Site Contact:</span> <span class="font-medium text-gray-900">${escapeHtml(currentProject.clientContactName || '-')}</span>${currentProject.clientContactPhone ? ` <span class="text-gray-500 text-sm">${escapeHtml(currentProject.clientContactPhone)}</span>` : ''}</div>
                </div>
            </div>
        </div>
        
        <!-- Dates -->
        <div class="col-span-2 md:col-span-4">
            <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
                <span><span class="text-xs">Created:</span> ${currentProject.created ? new Date(currentProject.created).toLocaleDateString() : '-'}</span>
                <span><span class="text-xs">Modified:</span> ${currentProject.lastModified ? new Date(currentProject.lastModified).toLocaleDateString() : '-'}</span>
            </div>
        </div>
    `;

    const headerFolderBtn = document.getElementById('project-details-open-folder-header');
    if (headerFolderBtn) {
        if (currentProject.projectFolderPath) {
            headerFolderBtn.title = currentProject.projectFolderPath;
        } else {
            headerFolderBtn.removeAttribute('title');
        }
    }
    applyProjectDetailsVisibility();
}

function renderBuildings() {
    _shellRefresh();
    const container = document.getElementById('project-buildings');
    if (!container) return;
    
    if (!currentProject.buildings || currentProject.buildings.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No buildings added. Add site materials first, then add buildings and spaces.</p>';
        return;
    }
    
    container.innerHTML = currentProject.buildings.map((building, bIndex) => `
        <div class="list-item-card hover-reveal-card relative" data-building-id="${building.id}">
            <div class="flex justify-between items-start mb-3 gap-3">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="bg-indigo-100 text-indigo-700 rounded-lg p-2 flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clip-rule="evenodd" />
                        </svg>
                    </div>
                    <div class="min-w-0">
                        <h3 class="font-semibold text-lg text-gray-900">${escapeHtml(building.name)}</h3>
                        <p class="text-sm text-gray-500">${(building.spaces || []).length} space(s) · ${countMaterialsInBuilding(building)} material assignment(s)</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <div class="action-buttons flex gap-2">
                        <button class="btn btn-secondary btn-sm text-xs px-2" onclick="openEditBuildingModal('${building.id}')" title="Edit Building">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                        </button>
                        <button class="btn btn-danger btn-sm text-xs px-2" onclick="deleteBuilding('${building.id}')" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="space-y-2" id="spaces-${building.id}">
                ${renderSpaces(building)}
            </div>
        </div>
    `).join('');
}

function countMaterialsInBuilding(building) {
    let count = 0;
    (building.spaces || []).forEach(space => {
        count += (space.materials || []).length;
    });
    return count;
}

function renderSpaces(building) {
    if (!building.spaces || building.spaces.length === 0) {
        return '<p class="text-gray-400 text-sm">No spaces yet. Use <span class="font-medium text-gray-600">+ Add Space</span> next to Add Building to add one.</p>';
    }
    
    return building.spaces.map(space => {
        const totalMaterialQty = (space.materials || []).reduce((sum, m) => sum + (parseFloat(m.quantity) || 0), 0);
        
        return `
            <div class="border rounded-lg p-3 bg-gray-50 hover-reveal-card relative" data-space-id="${space.id}">
                <div class="flex justify-between items-start mb-2 gap-3">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="bg-indigo-100 text-indigo-700 rounded px-2 py-0.5 text-sm font-medium">${escapeHtml(space.name)}</span>
                            ${space.description ? `<span class="text-xs text-gray-400">${escapeHtml(space.description)}</span>` : ''}
                        </div>
                        <span class="text-xs text-gray-500">${(space.materials || []).length} material(s) assigned</span>
                    </div>
                    <div class="action-buttons flex gap-1 flex-shrink-0">
                        <button class="btn btn-secondary btn-sm text-xs px-2" onclick="openEditSpaceModal('${building.id}', '${space.id}')" title="Edit Space & Materials">
                            Edit
                        </button>
                        <button class="text-gray-400 hover:text-red-600 p-1" onclick="deleteSpace('${building.id}', '${space.id}')" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                            </svg>
                        </button>
                    </div>
                </div>
                
                ${space.materials && space.materials.length > 0 ? `
                    <div class="space-y-1">
                        ${space.materials.map(mat => `
                            <div class="flex justify-between items-center text-sm bg-white rounded px-2 py-1.5 border">
                                <span class="text-gray-700 text-xs font-medium">${escapeHtml(mat.name)}</span>
                                <span class="text-gray-500 text-xs">${mat.quantity || 0} ${displayUnit(mat.unit)}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : '<p class="text-gray-400 text-xs">No materials assigned. Click Edit to assign materials.</p>'}
            </div>
        `;
    }).join('');
}

function renderMaterials() {
    _shellRefresh();
    const container = document.getElementById('project-materials');
    if (!container) return;
    
    // Enable Print button when there are bulk samples
    const printBulkBtn = document.getElementById('print-bulk-samples-btn');
    if (printBulkBtn) {
        const hasBulkSamples = (currentProject.bulkSamples || []).length > 0;
        if (hasBulkSamples) {
            printBulkBtn.removeAttribute('disabled');
        } else {
            printBulkBtn.setAttribute('disabled', 'true');
        }
    }
    
    if (!currentProject.materials || currentProject.materials.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No materials added. Add site materials first to track quantities.</p>';
        return;
    }
    
    container.innerHTML = currentProject.materials.map(material => {
        const assigned = getAssignedQuantity(material.id);
        const remaining = (material.totalQuantity || 0) - assigned;
        const isFullyAssigned = remaining <= 0 && (material.totalQuantity || 0) > 0;
        return `
            <div class="list-item-card hover-reveal-card relative cursor-pointer" data-material-id="${material.id}" ondblclick="if(!event.target.closest('button'))openBulkSampleModal('${material.id}')" title="Double-click to add bulk sample">
                <div class="flex justify-between items-start gap-3">
                    <div class="flex-1 min-w-0">
                        <span class="font-medium text-gray-800">${escapeHtml(material.name)}</span>
                        ${material.friable ? '<span class="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded">Friable</span>' : ''}
                        <div class="text-sm mt-1 space-x-3">
                            <span class="text-gray-500">Total: <strong>${material.totalQuantity || 0}</strong> ${displayUnit(material.unit, 'units')}</span>
                            <span class="text-blue-600">Assigned: <strong>${assigned}</strong></span>
                            <span class="${remaining > 0 ? 'text-amber-600' : 'text-green-600'}">Remaining: <strong>${Math.max(0, remaining)}</strong></span>
                        </div>
                        ${isFullyAssigned ? '<span class="inline-block mt-1 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">✓ Fully Assigned</span>' : ''}
                    </div>
                    <div class="action-buttons flex gap-1 flex-shrink-0">
                        <button class="btn btn-secondary btn-sm text-xs" onclick="event.stopPropagation(); openEditMaterialModal('${material.id}')">Edit</button>
                        <button class="btn btn-danger btn-sm text-xs" onclick="event.stopPropagation(); deleteMaterial('${material.id}')">Del</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
}

// Calculate how much of a material has been assigned to spaces
function getAssignedQuantity(materialId) {
    let total = 0;
    const material = currentProject.materials?.find(m => m.id === materialId);
    if (!material) return 0;
    
    // Search through all buildings and spaces
    (currentProject.buildings || []).forEach(building => {
        (building.spaces || []).forEach(space => {
            (space.materials || []).forEach(sm => {
                // Match by ID or by name (for backwards compatibility)
                if (sm.materialId === materialId || sm.name === material.name) {
                    total += parseFloat(sm.quantity) || 0;
                }
            });
        });
    });
    
    return total;
}

function renderContainments() {
    _shellRefresh();
    const container = document.getElementById('oversight-project-containments');
    if (!container) return;
    
    if (!currentProject.containments || currentProject.containments.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No containments defined.</p>';
        return;
    }
    
    container.innerHTML = currentProject.containments.map(containment => {
        const spacesCount = (containment.spaces || []).length;
        const spacesList = (containment.spaces || []).slice(0, 3).map(s => escapeHtml(s.spaceName || s.name || 'Unnamed')).join(', ');
        const moreSpaces = spacesCount > 3 ? ` and ${spacesCount - 3} more` : '';
        const stage = normalizeStage(containment.stage);
        
        // Regulated area badge
        const regulatedBadge = containment.regulatedArea 
            ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 ml-1">Regulated</span>'
            : '';
        
        // Visual inspections summary
        const inspections = containment.visualInspections || [];
        const preStart = inspections.find(v => v.type === 'Pre-Start' && v.passed);
        const final = inspections.find(v => v.type === 'Final' && v.passed);
        let inspectionBadges = '';
        if (preStart) {
            inspectionBadges += '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Pre-Start ✓</span>';
        }
        if (final) {
            inspectionBadges += '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 ml-1">Final ✓</span>';
        }
        // Show failed inspections count
        const failedCount = inspections.filter(v => !v.passed).length;
        if (failedCount > 0) {
            inspectionBadges += `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 ml-1">${failedCount} Failed</span>`;
        }
        
        return `
        <div class="list-item-card hover-reveal-card relative min-h-[6rem]" data-containment-id="${containment.id}">
            <div class="flex justify-between items-stretch gap-3">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap mb-1">
                        <span class="font-medium text-gray-800">${escapeHtml(getContainmentDisplayName(containment.name))}</span>
                        <span class="text-sm text-gray-500">${containment.buildingName || ''}</span>
                        ${regulatedBadge}
                    </div>
                    ${spacesCount > 0 ? `
                        <div class="text-xs text-gray-600 mt-1">
                            <span class="font-medium">Spaces:</span> ${spacesList}${moreSpaces}
                        </div>
                    ` : '<div class="text-xs text-gray-400 mt-1">No spaces assigned</div>'}
                    ${inspectionBadges ? `<div class="flex items-center gap-1 flex-wrap mt-1">${inspectionBadges}</div>` : ''}
                </div>
                <div class="flex flex-col items-end justify-between gap-2 flex-shrink-0 self-stretch">
                    <span class="overview-item-stage ${getStageClass(stage)}">${stage}</span>
                    <div class="action-buttons flex gap-2">
                        <button class="btn btn-secondary btn-sm text-xs" onclick="openEditContainmentModal('${containment.id}')">Edit</button>
                        <button class="btn btn-danger btn-sm text-xs" onclick="deleteContainment('${containment.id}')">Delete</button>
                    </div>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function renderAirSamples() {
    _shellRefresh();
    const container = document.getElementById('oversight-project-air-samples');
    if (!container) return;
    
    // Enable the print button if we have samples
    const printBtn = document.getElementById('print-air-samples-btn');
    if (printBtn) {
        if (currentProject.airSamples && currentProject.airSamples.length > 0) {
            printBtn.removeAttribute('disabled');
        } else {
            printBtn.setAttribute('disabled', 'true');
        }
    }
    
    if (!currentProject.airSamples || currentProject.airSamples.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm col-span-full">No air samples recorded.</p>';
        return;
    }
    
    // Sort samples by ID
    const sortedSamples = [...currentProject.airSamples].sort((a, b) => 
        (a.sampleId || '').localeCompare(b.sampleId || '')
    );
    
    container.innerHTML = sortedSamples.map(sample => {
        const isCollected = !!sample.stopTime;
        const statusClass = isCollected 
            ? 'bg-green-50 text-green-700 border-green-200' 
            : 'bg-yellow-50 text-yellow-700 border-yellow-200';
        const statusText = isCollected ? 'Collected' : 'Being Collected';
        
        // Calculate time elapsed if we have start and stop times
        let timeElapsed = null;
        let samplingVolume = null;
        
        if (sample.startTime && sample.stopTime && sample.startFlowRate && sample.stopFlowRate) {
            timeElapsed = calculateTimeElapsed(sample.startTime, sample.stopTime);
            if (timeElapsed !== null) {
                samplingVolume = calculateSamplingVolume(sample.startFlowRate, sample.stopFlowRate, timeElapsed);
            }
        }
        
        const setBadge = sample.sampleSetId ? '<span class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Set</span>' : '';

        return `
            <div class="list-item-card hover-reveal-card relative" data-sample-id="${sample.id}">
                <div class="flex justify-between items-start gap-3">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <h4 class="font-bold text-gray-900">${escapeHtml(sample.sampleId || 'No ID')}</h4>
                            ${setBadge}
                        </div>
                        <p class="text-xs text-gray-500 font-medium uppercase tracking-wide mt-0.5">${sample.type || 'Area'}</p>
                    </div>
                    <div class="flex flex-col items-end gap-2">
                        <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${statusClass}">
                            ${statusText}
                        </span>
                        <div class="action-buttons flex gap-1">
                            <button class="btn btn-secondary btn-sm text-xs px-2 py-1" onclick="openEditAirSampleModal('${sample.id}')">Edit</button>
                            <button class="btn btn-danger btn-sm text-xs px-2 py-1" onclick="deleteAirSample('${sample.id}')">Delete</button>
                        </div>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-2">
                    <div>
                        <span class="text-gray-500 text-xs">Start:</span>
                        <span class="font-medium text-gray-800">${sample.startTime || '--:--'}</span>
                    </div>
                    <div>
                        <span class="text-gray-500 text-xs">Stop:</span>
                        <span class="font-medium text-gray-800">${sample.stopTime || '--:--'}</span>
                    </div>
                    <div>
                        <span class="text-gray-500 text-xs">Start Flow:</span>
                        <span class="font-medium text-gray-800">${sample.startFlowRate ? sample.startFlowRate + ' L/min' : '--'}</span>
                    </div>
                    <div>
                        <span class="text-gray-500 text-xs">Stop Flow:</span>
                        <span class="font-medium text-gray-800">${sample.stopFlowRate ? sample.stopFlowRate + ' L/min' : '--'}</span>
                    </div>
                    ${timeElapsed !== null ? `
                    <div>
                        <span class="text-gray-500 text-xs">Time Elapsed:</span>
                        <span class="font-medium text-gray-800">${timeElapsed} min</span>
                    </div>
                    ` : ''}
                    ${samplingVolume !== null ? `
                    <div>
                        <span class="text-gray-500 text-xs">Sampling Volume:</span>
                        <span class="font-medium text-gray-800">${samplingVolume.toFixed(2)} L</span>
                    </div>
                    ` : ''}
                </div>
                
                ${(sample.containmentName || sample.location) ? `<p class="text-xs text-gray-600 mt-2 border-t pt-2 border-gray-100"><span class="text-gray-400">Location:</span> ${escapeHtml([sample.containmentName, sample.location].filter(Boolean).join(' | '))}</p>` : ''}
                ${sample.comments ? `<p class="text-xs text-gray-500 italic mt-1">${escapeHtml(sample.comments)}</p>` : ''}
            </div>
        `;
    }).join('');
}

function calculateTimeElapsed(startTime, stopTime) {
    if (!startTime || !stopTime) return null;
    try {
        const [startH, startM] = startTime.split(':').map(Number);
        const [stopH, stopM] = stopTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const stopMinutes = stopH * 60 + stopM;
        const elapsed = stopMinutes - startMinutes;
        return elapsed < 0 ? elapsed + (24 * 60) : elapsed;
    } catch (e) {
        return null;
    }
}

function calculateSamplingVolume(startFlowRate, stopFlowRate, timeElapsed) {
    if (!startFlowRate || !stopFlowRate || !timeElapsed) return null;
    const avgFlowRate = (parseFloat(startFlowRate) + parseFloat(stopFlowRate)) / 2;
    return avgFlowRate * timeElapsed;
}

// Live calculation preview for air sample modals
function updateSampleCalc(prefix) {
    const startTime = document.getElementById(`${prefix}-sample-start-time`)?.value;
    const stopTime = document.getElementById(`${prefix}-sample-stop-time`)?.value;
    const startFlow = parseFloat(document.getElementById(`${prefix}-sample-start-flow`)?.value) || 0;
    const stopFlow = parseFloat(document.getElementById(`${prefix}-sample-stop-flow`)?.value) || 0;
    
    const preview = document.getElementById(`${prefix}-sample-calc-preview`);
    const timeEl = document.getElementById(`${prefix}-sample-time-elapsed`);
    const volumeEl = document.getElementById(`${prefix}-sample-volume`);
    const avgFlowEl = document.getElementById(`${prefix}-sample-avg-flow`);
    
    if (!preview) return;
    
    // Calculate time elapsed
    const timeElapsed = calculateTimeElapsed(startTime, stopTime);
    
    if (timeElapsed !== null && timeElapsed > 0) {
        preview.classList.remove('hidden');
        
        // Time elapsed
        const hours = Math.floor(timeElapsed / 60);
        const mins = timeElapsed % 60;
        if (timeEl) {
            timeEl.textContent = hours > 0 ? `${hours}h ${mins}m (${timeElapsed} min)` : `${timeElapsed} min`;
        }
        
        // Average flow rate
        if (startFlow > 0 && stopFlow > 0) {
            const avgFlow = (startFlow + stopFlow) / 2;
            if (avgFlowEl) avgFlowEl.textContent = `${avgFlow.toFixed(2)} L/min`;
            
            // Sampling volume
            const volume = avgFlow * timeElapsed;
            if (volumeEl) volumeEl.textContent = `${volume.toFixed(2)} L`;
        } else if (startFlow > 0) {
            if (avgFlowEl) avgFlowEl.textContent = `${startFlow.toFixed(2)} L/min (start only)`;
            const volume = startFlow * timeElapsed;
            if (volumeEl) volumeEl.textContent = `~${volume.toFixed(2)} L (estimated)`;
        } else {
            if (avgFlowEl) avgFlowEl.textContent = '--';
            if (volumeEl) volumeEl.textContent = '--';
        }
    } else {
        preview.classList.add('hidden');
    }
}

function getAirSampleTypePrefix(type) {
    const normalized = String(type || '').toLowerCase();
    if (normalized === 'personal') return 'PS';
    if (normalized === 'clearance') return 'CA';
    return 'AS';
}

function getNextAirSampleId(type, currentSampleId = null) {
    const projectNum = currentProject?.projectNumber || 'PJ';
    const typePrefix = getAirSampleTypePrefix(type);
    const prefix = `${projectNum}-${typePrefix}`;
    let nextNum = 1;
    (currentProject?.airSamples || []).forEach(sample => {
        const id = sample.sampleId || '';
        if (currentSampleId && id === currentSampleId) return;
        if (!id.startsWith(prefix)) return;
        const suffix = id.slice(prefix.length);
        if (/^\d+$/.test(suffix)) {
            nextNum = Math.max(nextNum, parseInt(suffix, 10) + 1);
        }
    });
    return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

function isAutoAirSampleId(value) {
    const projectNum = currentProject?.projectNumber || 'PJ';
    const escapedProject = projectNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escapedProject}-(AS|PS|CA)\\d{3}$`, 'i').test(String(value || ''));
}

// Export for onclick handlers
window.updateSampleCalc = updateSampleCalc;

// ============================================
// MODAL FUNCTIONS
// ============================================

function openEditProjectModal() {
    // Create a larger modal for all fields
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 650px; max-height: 90vh; overflow-y: auto;">
            <h3 class="text-lg font-semibold mb-2">Edit Project Details</h3>
            
            <div class="space-y-2">
                <!-- Project Info Section -->
                <div class="border-b pb-2">
                    <h4 class="font-medium text-gray-800 text-sm mb-1.5">Project Information</h4>
                    <div>
                        <label class="block text-xs font-medium text-gray-700 mb-0.5">Project Number *</label>
                        <input type="text" id="edit-project-number" class="w-full py-2 px-3 text-sm border rounded-lg" value="${escapeHtml(currentProject.projectNumber || '')}">
                    </div>
                </div>
                
                <!-- Site Info Section -->
                <div class="border-b pb-2">
                    <h4 class="font-medium text-gray-800 text-sm mb-1.5">Site Information</h4>
                    <div class="space-y-1.5">
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-0.5">Site Name *</label>
                            <input type="text" id="edit-site-name" class="w-full py-2 px-3 text-sm border rounded-lg" value="${escapeHtml(currentProject.siteName || currentProject.name || '')}">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-0.5">Site Address *</label>
                            <input type="text" id="edit-site-address" class="w-full py-2 px-3 text-sm border rounded-lg" value="${escapeHtml(currentProject.siteAddress || '')}">
                        </div>
                    </div>
                </div>
                
                <!-- Client Section -->
                <div class="border-b pb-2">
                    <h4 class="font-medium text-gray-800 text-sm mb-1.5">Client</h4>
                    <div class="space-y-1.5">
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-0.5">Client Name</label>
                            <input type="text" id="edit-client-name" class="w-full py-2 px-3 text-sm border rounded-lg" value="${escapeHtml(currentProject.clientName || '')}">
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-xs font-medium text-gray-700 mb-0.5">Client Phone</label>
                                <input type="tel" id="edit-client-phone" class="w-full py-2 px-3 text-sm border rounded-lg" value="${escapeHtml(currentProject.clientPhone || '')}">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-700 mb-0.5">Client Fax</label>
                                <input type="tel" id="edit-client-fax" class="w-full py-2 px-3 text-sm border rounded-lg" value="${escapeHtml(currentProject.clientFax || '')}">
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Site Contact Section -->
                <div class="border-b pb-2">
                    <h4 class="font-medium text-gray-800 text-sm mb-1.5">Site Contact</h4>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-0.5">Site Contact Name</label>
                            <input type="text" id="edit-contact-name" class="w-full py-2 px-3 text-sm border rounded-lg" value="${escapeHtml(currentProject.clientContactName || '')}">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-0.5">Site Contact Phone Number</label>
                            <input type="tel" id="edit-contact-phone" class="w-full py-2 px-3 text-sm border rounded-lg" value="${escapeHtml(currentProject.clientContactPhone || '')}">
                        </div>
                    </div>
                </div>
                
                <!-- Contractor Section -->
                <div class="border-b pb-2">
                    <h4 class="font-medium text-gray-800 text-sm mb-1.5">Abatement Contractor</h4>
                    <div class="space-y-1.5">
                        <div>
                            <label class="block text-xs font-medium text-gray-700 mb-0.5">Contractor Name</label>
                            <input type="text" id="edit-contractor" class="w-full py-2 px-3 text-sm border rounded-lg" placeholder="Contractor company name" value="${escapeHtml(currentProject.contractor || '')}">
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-xs font-medium text-gray-700 mb-0.5">Contractor Phone Number</label>
                                <input type="tel" id="edit-contractor-phone" class="w-full py-2 px-3 text-sm border rounded-lg" value="${escapeHtml(currentProject.contractorPhone || '')}">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-700 mb-0.5">Contractor Fax</label>
                                <input type="tel" id="edit-contractor-fax" class="w-full py-2 px-3 text-sm border rounded-lg" value="${escapeHtml(currentProject.contractorFax || '')}">
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label class="block text-xs font-medium text-gray-700 mb-0.5">Foreman Name</label>
                                <input type="text" id="edit-foreman-name" class="w-full py-2 px-3 text-sm border rounded-lg" value="${escapeHtml(currentProject.foremanName || '')}">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-gray-700 mb-0.5">Foreman Phone Number</label>
                                <input type="tel" id="edit-foreman-phone" class="w-full py-2 px-3 text-sm border rounded-lg" value="${escapeHtml(currentProject.foremanPhone || '')}">
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Project Folder Section -->
                <div class="border-b pb-2">
                    <h4 class="font-medium text-gray-800 text-sm mb-1.5">Project Folder Location</h4>
                    <div class="flex gap-2">
                        <input type="text" id="edit-project-folder" class="flex-1 py-2 px-3 text-sm border rounded-lg" placeholder="e.g., C:\\Projects\\24-001" value="${escapeHtml(currentProject.projectFolderPath || '')}" ${typeof window !== 'undefined' && window.electronAPI ? 'readonly' : ''}>
                        ${typeof window !== 'undefined' && window.electronAPI ? `
                        <button type="button" id="edit-project-folder-browse" class="btn btn-secondary px-3 py-1.5 text-sm whitespace-nowrap">Browse</button>
                        ` : ''}
                    </div>
                    <p class="text-xs text-gray-500 mt-0.5">Optional. Click to open in file explorer after saving.</p>
                </div>
            </div>
            
            <div class="modal-footer flex justify-end gap-3 mt-4 pt-5 border-t">
                <button class="btn btn-secondary modal-cancel-btn py-2.5 px-5">Cancel</button>
                <button class="btn btn-primary modal-save-btn py-2.5 px-5">Save Changes</button>
            </div>
        </div>
    `;
    
    // Track mouse down position to prevent closing when dragging from inside modal
    let mouseDownOnBackdrop = false;
    
    modal.addEventListener('mousedown', (e) => {
        mouseDownOnBackdrop = (e.target === modal);
    });
    
    // Handle backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal && mouseDownOnBackdrop) {
            modal.remove();
        }
        mouseDownOnBackdrop = false;
    });
    
    // Handle Cancel
    modal.querySelector('.modal-cancel-btn').addEventListener('click', () => modal.remove());

    // Browse button for project folder (Electron only)
    modal.querySelector('#edit-project-folder-browse')?.addEventListener('click', async () => {
        if (window.electronAPI?.selectFolder) {
            const result = await window.electronAPI.selectFolder();
            if (result?.success && result.folderPath) {
                const input = modal.querySelector('#edit-project-folder');
                if (input) input.value = result.folderPath;
            }
        }
    });
    
    // Handle Save
    modal.querySelector('.modal-save-btn').addEventListener('click', () => {
        const projectNumber = document.getElementById('edit-project-number').value.trim();
        const siteName = document.getElementById('edit-site-name').value.trim();
        const siteAddress = document.getElementById('edit-site-address').value.trim();
        
        if (!projectNumber) {
            alert('Please enter a project number');
            return;
        }
        if (!siteName) {
            alert('Please enter a site name');
            return;
        }
        
        // Update all fields
        currentProject.projectNumber = projectNumber;
        currentProject.siteName = siteName;
        currentProject.name = siteName;
        currentProject.siteAddress = siteAddress;
        currentProject.clientName = document.getElementById('edit-client-name').value.trim();
        currentProject.contractor = document.getElementById('edit-contractor').value.trim();
        currentProject.foremanName = document.getElementById('edit-foreman-name').value.trim();
        currentProject.foremanPhone = document.getElementById('edit-foreman-phone').value.trim();
        currentProject.contractorPhone = document.getElementById('edit-contractor-phone').value.trim();
        currentProject.contractorFax = document.getElementById('edit-contractor-fax').value.trim();
        currentProject.clientContactName = document.getElementById('edit-contact-name').value.trim();
        currentProject.clientContactPhone = document.getElementById('edit-contact-phone').value.trim();
        currentProject.clientPhone = document.getElementById('edit-client-phone').value.trim();
        currentProject.clientFax = document.getElementById('edit-client-fax').value.trim();
        currentProject.projectFolderPath = document.getElementById('edit-project-folder')?.value.trim() || undefined;
        
        modal.remove();
        saveCurrentProject();
        renderProject();
    });
    
    document.body.appendChild(modal);
    
    // Focus first input and apply phone formatting
    setTimeout(() => {
        document.getElementById('edit-project-number')?.focus();
        // Apply phone formatting to all phone inputs
        const phoneInputs = modal.querySelectorAll('input[type="tel"]');
        phoneInputs.forEach(input => applyPhoneFormatting(input));
    }, 50);
}

function openAddBuildingModal() {
    const modal = createModal('Add Building', `
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Building Name</label>
                <input type="text" id="new-building-name" class="w-full p-3 border rounded-lg" placeholder="e.g., Main Building, Building A">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Comments (optional)</label>
                <textarea id="new-building-comments" class="w-full p-3 border rounded-lg" rows="2" placeholder="Additional notes"></textarea>
            </div>
        </div>
    `, () => {
        const name = document.getElementById('new-building-name').value.trim();
        if (!name) {
            alert('Please enter a building name');
            return false;
        }
        const comments = document.getElementById('new-building-comments').value.trim();
        
        if (!currentProject.buildings) currentProject.buildings = [];
        currentProject.buildings.push({
            id: generateId(),
            name,
            comments,
            spaces: []
        });
        saveCurrentProject();
        renderProject();
    });
}

function openEditBuildingModal(buildingId) {
    const building = currentProject.buildings?.find(b => b.id === buildingId);
    if (!building) return;
    
    const modal = createModal('Edit Building', `
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Building Name</label>
                <input type="text" id="edit-building-name" class="w-full p-3 border rounded-lg" value="${escapeHtml(building.name)}">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Comments (optional)</label>
                <textarea id="edit-building-comments" class="w-full p-3 border rounded-lg" rows="2">${escapeHtml(building.comments || '')}</textarea>
            </div>
        </div>
    `, () => {
        const name = document.getElementById('edit-building-name').value.trim();
        if (!name) {
            alert('Please enter a building name');
            return false;
        }
        building.name = name;
        building.comments = document.getElementById('edit-building-comments').value.trim();
        saveCurrentProject();
        renderProject();
    });
}

function deleteBuilding(buildingId) {
    if (!confirm('Delete this building and all its spaces? This cannot be undone.')) return;
    currentProject.buildings = currentProject.buildings.filter(b => b.id !== buildingId);
    saveCurrentProject();
    renderProject();
}

/** Add Space from Buildings & Spaces card header (next to + Add Building). */
function openAddSpaceFromHeader() {
    const buildings = currentProject.buildings || [];
    if (buildings.length === 0) {
        showNotification('Add a building before adding spaces.', true);
        return;
    }
    if (buildings.length === 1) {
        openAddSpaceModal(buildings[0].id);
        return;
    }
    const selectId = 'add-space-building-select-' + Date.now();
    const optionsHtml = buildings.map(b =>
        `<option value="${escapeHtml(String(b.id))}">${escapeHtml(b.name || 'Building')}</option>`
    ).join('');
    createModal(
        'Add space — choose building',
        `<div>
            <label for="${selectId}" class="block text-sm font-medium text-gray-700 mb-1">Building</label>
            <select id="${selectId}" class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">${optionsHtml}</select>
        </div>`,
        () => {
            const sel = document.getElementById(selectId);
            if (sel) applyLastBuildingSelection(sel);
            const id = sel && sel.value;
            if (!id) return false;
            setLastBuildingId(currentProject.id, id);
            setTimeout(() => openAddSpaceModal(id), 0);
            return true;
        }
    );
}

function openAddSpaceModal(buildingId) {
    const building = currentProject.buildings?.find(b => b.id === buildingId);
    if (!building) return;
    
    openSpaceMaterialModal(building, null);
}

// Combined modal for adding/editing space with material assignment
function openSpaceMaterialModal(building, existingSpace) {
    const isEdit = !!existingSpace;
    const projectMaterials = currentProject.materials || [];
    
    // Build material rows HTML
    const buildMaterialRows = (spaceMaterials = []) => {
        if (projectMaterials.length === 0) {
            return '<p class="text-amber-600 text-sm">⚠ Add site materials first before creating spaces.</p>';
        }
        
        return projectMaterials.map(pm => {
            const assigned = spaceMaterials.find(sm => sm.materialId === pm.id || sm.name === pm.name);
            const qty = assigned ? assigned.quantity : '';
            const remaining = (pm.totalQuantity || 0) - getAssignedQuantity(pm.id) + (assigned ? parseFloat(assigned.quantity) || 0 : 0);
            
            return `
                <div class="modal-material-row">
                    <input type="checkbox" id="mat-check-${pm.id}" class="h-4 w-4 rounded border-gray-300 text-indigo-600"
                           ${assigned ? 'checked' : ''} onchange="toggleMaterialRow('${pm.id}')">
                    <label for="mat-check-${pm.id}" class="modal-check-label" style="flex:1;">
                        <span class="modal-check-title">${escapeHtml(pm.name)}</span>
                        <span class="modal-check-subtitle">(${remaining > 0 ? remaining : 0} ${displayUnit(pm.unit)} remaining)</span>
                    </label>
                    <div class="flex items-center gap-2" id="mat-qty-row-${pm.id}" style="${assigned ? '' : 'opacity: 0.4'}">
                        <input type="number" id="mat-qty-${pm.id}" class="p-2 border rounded text-sm"
                               style="width: 6.5rem;" maxlength="6" max="999999"
                               placeholder="Qty" value="${qty}" ${assigned ? '' : 'disabled'} min="0" step="any">
                        <span class="text-xs text-gray-500 w-8">${displayUnit(pm.unit)}</span>
                    </div>
                </div>
            `;
        }).join('');
    };
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <h3>${isEdit ? 'Edit Space' : `Add Space to ${escapeHtml(building.name)}`}</h3>
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Space Name *</label>
                        <input type="text" id="space-name" class="w-full p-3 border rounded-lg" placeholder="e.g., Room 101" 
                               value="${isEdit ? escapeHtml(existingSpace.name) : ''}">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <input type="text" id="space-description" class="w-full p-3 border rounded-lg" placeholder="e.g., First Floor"
                               value="${isEdit ? escapeHtml(existingSpace.description || '') : ''}">
                    </div>
                </div>
                
                <div class="border-t pt-4">
                    <h4 class="font-medium text-gray-800 mb-2">Assign Materials to This Space</h4>
                    <p class="text-xs text-gray-500 mb-3">Check materials and enter quantities found in this space.</p>
                    <div id="space-materials-list" class="modal-selection-box max-h-64 overflow-y-auto">
                        ${buildMaterialRows(isEdit ? existingSpace.materials : [])}
                    </div>
                    <div id="space-new-materials" class="space-y-2 mt-2"></div>
                    <button type="button" id="add-inline-material-btn"
                            class="text-sm font-medium text-indigo-600 hover:text-indigo-800 mt-2"
                            style="background: transparent; border: none; padding: 0; cursor: pointer;">
                        + Add Material
                    </button>
                </div>
            </div>
            
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary modal-cancel-btn">Cancel</button>
                <button type="button" class="btn btn-primary modal-save-btn">Save Space</button>
            </div>
        </div>
    `;
    
    // Toggle material row
    window.toggleMaterialRow = (materialId) => {
        const checkbox = document.getElementById(`mat-check-${materialId}`);
        const qtyInput = document.getElementById(`mat-qty-${materialId}`);
        const qtyRow = document.getElementById(`mat-qty-row-${materialId}`);
        
        if (checkbox.checked) {
            qtyInput.disabled = false;
            qtyRow.style.opacity = '1';
            qtyInput.focus();
        } else {
            qtyInput.disabled = true;
            qtyRow.style.opacity = '0.4';
            qtyInput.value = '';
        }
    };
    
    // Track mouse down position to prevent closing when dragging from inside modal
    let mouseDownOnBackdrop = false;
    
    modal.addEventListener('mousedown', (e) => {
        mouseDownOnBackdrop = (e.target === modal);
    });
    
    // Handle backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal && mouseDownOnBackdrop) {
            modal.remove();
        }
        mouseDownOnBackdrop = false;
    });
    
    // Handle Cancel
    modal.querySelector('.modal-cancel-btn').addEventListener('click', () => modal.remove());
    
    // Handle Save
    modal.querySelector('.modal-save-btn').addEventListener('click', () => {
        const name = document.getElementById('space-name').value.trim();
        if (!name) {
            alert('Please enter a space name');
            return;
        }
        
        const description = document.getElementById('space-description').value.trim();
        
        // Collect assigned materials
        const assignedMaterials = [];
        projectMaterials.forEach(pm => {
            const checkbox = document.getElementById(`mat-check-${pm.id}`);
            const qtyInput = document.getElementById(`mat-qty-${pm.id}`);
            if (checkbox?.checked) {
                const qty = parseFloat(qtyInput?.value) || 0;
                if (qty > 0) {
                    assignedMaterials.push({
                        id: generateId(),
                        materialId: pm.id,
                        name: pm.name,
                        quantity: qty,
                        unit: pm.unit || 'units'
                    });
                    
                    // Update total quantity if assigned exceeds total
                    const newAssigned = getAssignedQuantity(pm.id) - (isEdit ? 
                        ((existingSpace.materials || []).find(m => m.materialId === pm.id)?.quantity || 0) : 0) + qty;
                    if (newAssigned > (pm.totalQuantity || 0)) {
                        pm.totalQuantity = newAssigned;
                    }
                }
            }
        });

        // Collect inline new materials, persist them to site materials, and assign to this space
        modal.querySelectorAll('.new-mat-row').forEach(row => {
            const newName = row.querySelector('.new-mat-name')?.value.trim();
            if (!newName) return;
            const newQty = parseFloat(row.querySelector('.new-mat-qty')?.value) || 0;

            if (!currentProject.materials) currentProject.materials = [];
            const newMatId = generateId();
            currentProject.materials.push({
                id: newMatId,
                name: newName,
                totalQuantity: newQty,
                unit: 'SF',
                friable: false
            });

            if (newQty > 0) {
                assignedMaterials.push({
                    id: generateId(),
                    materialId: newMatId,
                    name: newName,
                    quantity: newQty,
                    unit: 'SF'
                });
            }
        });
        
        if (isEdit) {
            existingSpace.name = name;
            existingSpace.description = description;
            existingSpace.materials = assignedMaterials;
        } else {
            if (!building.spaces) building.spaces = [];
            building.spaces.push({
                id: generateId(),
                name,
                description,
                materials: assignedMaterials
            });
        }
        
        modal.remove();
        saveCurrentProject();
        renderProject();
    });
    
    document.body.appendChild(modal);

    const newMatContainer = modal.querySelector('#space-new-materials');
    const addInlineMatBtn = modal.querySelector('#add-inline-material-btn');
    const buildNewMatRow = () => `
        <div class="new-mat-row flex items-center gap-3 p-2 border rounded-lg bg-gray-50">
            <button type="button" class="new-mat-remove text-red-600 hover:text-red-800 font-bold text-lg leading-none"
                    style="background:transparent;border:none;cursor:pointer;width:1.25rem;" title="Remove">&times;</button>
            <input type="text" class="new-mat-name flex-1 p-2 border rounded text-sm"
                   placeholder="Material Name">
            <div class="flex items-center gap-2">
                <input type="number" class="new-mat-qty p-2 border rounded text-sm"
                       style="width: 6.5rem;" maxlength="6" max="999999" min="0" step="any"
                       placeholder="Quantity in ft\u00b2">
                <span class="text-xs text-gray-500 w-8">ft\u00b2</span>
            </div>
        </div>
    `;
    if (addInlineMatBtn && newMatContainer) {
        addInlineMatBtn.addEventListener('click', () => {
            newMatContainer.insertAdjacentHTML('beforeend', buildNewMatRow());
            const rows = newMatContainer.querySelectorAll('.new-mat-row .new-mat-name');
            rows[rows.length - 1]?.focus();
        });
        newMatContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.new-mat-remove');
            if (!btn) return;
            btn.closest('.new-mat-row')?.remove();
        });
    }
    
    setTimeout(() => document.getElementById('space-name')?.focus(), 50);
}

function openEditSpaceModal(buildingId, spaceId) {
    const building = currentProject.buildings?.find(b => b.id === buildingId);
    const space = building?.spaces?.find(s => s.id === spaceId);
    if (!space) return;
    
    openSpaceMaterialModal(building, space);
}

function deleteSpace(buildingId, spaceId) {
    if (!confirm('Delete this space and all its materials? This cannot be undone.')) return;
    const building = currentProject.buildings?.find(b => b.id === buildingId);
    if (building) {
        building.spaces = building.spaces.filter(s => s.id !== spaceId);
        saveCurrentProject();
        renderProject();
    }
}

function openAddMaterialModal() {
    const modal = createModal('Add Site Material', `
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Material Name</label>
                <input type="text" id="new-material-name" class="w-full p-3 border rounded-lg" placeholder="e.g., 9x9 VAT, Pipe Insulation">
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Total Quantity</label>
                    <input type="number" id="new-material-quantity" class="w-full p-3 border rounded-lg" placeholder="0">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                    <select id="new-material-unit" class="w-full p-3 border rounded-lg bg-white">
                        <option value="SF">Square Feet (ft\u00b2)</option>
                        <option value="LF">Linear Feet (LF)</option>
                        <option value="EA">Each (EA)</option>
                        <option value="CF">Cubic Feet (CF)</option>
                    </select>
                </div>
            </div>
            ${buildModalCheckboxRow('new-material-friable', '', '', '<span class="modal-check-title">Friable Material</span>')}
        </div>
    `, () => {
        const name = document.getElementById('new-material-name').value.trim();
        if (!name) {
            alert('Please enter a material name');
            return false;
        }
        
        if (!currentProject.materials) currentProject.materials = [];
        currentProject.materials.push({
            id: generateId(),
            name,
            totalQuantity: parseFloat(document.getElementById('new-material-quantity').value) || 0,
            unit: document.getElementById('new-material-unit').value,
            friable: document.getElementById('new-material-friable').checked
        });
        saveCurrentProject();
        renderProject();
    });
}

function openEditMaterialModal(materialId) {
    const material = currentProject.materials?.find(m => m.id === materialId);
    if (!material) return;
    
    const oldName = material.name;
    
    const modal = createModal('Edit Material', `
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Material Name</label>
                <input type="text" id="edit-material-name" class="w-full p-3 border rounded-lg" value="${escapeHtml(material.name)}">
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Total Quantity</label>
                    <input type="number" id="edit-material-quantity" class="w-full p-3 border rounded-lg" value="${material.totalQuantity || 0}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                    <select id="edit-material-unit" class="w-full p-3 border rounded-lg bg-white">
                        <option value="SF" ${material.unit === 'SF' ? 'selected' : ''}>Square Feet (ft\u00b2)</option>
                        <option value="LF" ${material.unit === 'LF' ? 'selected' : ''}>Linear Feet (LF)</option>
                        <option value="EA" ${material.unit === 'EA' ? 'selected' : ''}>Each (EA)</option>
                        <option value="CF" ${material.unit === 'CF' ? 'selected' : ''}>Cubic Feet (CF)</option>
                    </select>
                </div>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">HMR# (optional)</label>
                <input type="text" id="edit-material-hmr" class="w-full p-3 border rounded-lg" placeholder="e.g., 01" value="${escapeHtml(material.hmrNumber || '')}">
            </div>
            ${buildModalCheckboxRow('edit-material-friable', '', material.friable ? 'checked' : '', '<span class="modal-check-title">Friable Material</span>')}
        </div>
    `, () => {
        const name = document.getElementById('edit-material-name').value.trim();
        if (!name) {
            alert('Please enter a material name');
            return false;
        }
        
        const newName = name;
        const newUnit = document.getElementById('edit-material-unit').value;
        
        // If the name changed, propagate to all spaces and containments
        if (oldName !== newName) {
            propagateMaterialNameChange(materialId, oldName, newName);
        }
        
        material.name = newName;
        material.totalQuantity = parseFloat(document.getElementById('edit-material-quantity').value) || 0;
        material.unit = newUnit;
        material.hmrNumber = (document.getElementById('edit-material-hmr').value || '').trim() || undefined;
        material.friable = document.getElementById('edit-material-friable').checked;
        saveCurrentProject();
        renderProject();
    });
}

/**
 * Propagate a material name change across all spaces (in buildings) and containments.
 * Matches by materialId first, then falls back to old name matching.
 */
function propagateMaterialNameChange(materialId, oldName, newName) {
    // Update in building spaces
    (currentProject.buildings || []).forEach(building => {
        (building.spaces || []).forEach(space => {
            (space.materials || []).forEach(sm => {
                if (sm.materialId === materialId || sm.name === oldName) {
                    sm.name = newName;
                }
            });
        });
    });
    
    // Update in containment materials and containment spaces
    (currentProject.containments || []).forEach(containment => {
        // Update aggregated containment materials
        (containment.materials || []).forEach(cm => {
            if (cm.materialId === materialId || cm.name === oldName || cm.materialName === oldName) {
                cm.name = newName;
                cm.materialName = newName;
            }
        });
        
        // Update containment space materials
        (containment.spaces || []).forEach(space => {
            (space.materials || []).forEach(sm => {
                if (sm.materialId === materialId || sm.name === oldName) {
                    sm.name = newName;
                }
            });
        });
    });
}

function deleteMaterial(materialId) {
    if (!confirm('Delete this material? This cannot be undone.')) return;
    currentProject.materials = currentProject.materials.filter(m => m.id !== materialId);
    saveCurrentProject();
    renderProject();
}

// ============================================
// BULK SAMPLING
// ============================================

function getNextBulkSampleLetter(materialId, hmrNumber) {
    const existing = (currentProject.bulkSamples || []).filter(
        s => s.materialId === materialId && (s.hmrNumber || '').trim() === (hmrNumber || '').trim()
    );
    const count = existing.length;
    if (count >= 26) return String.fromCharCode(65 + 25); // Z
    return String.fromCharCode(65 + count);
}

function openBulkSampleModal(materialId) {
    const material = currentProject.materials?.find(m => m.id === materialId);
    if (!material) return;

    const existingHmr = material.hmrNumber || (() => {
        const existing = (currentProject.bulkSamples || []).find(s => s.materialId === materialId);
        return existing?.hmrNumber || (existing?.sampleId ? String(existing.sampleId).replace(/[A-Z]$/i, '') : '') || '';
    })();
    const hmrValue = escapeHtml(existingHmr);

    const modal = createModal('Add Bulk Sample', `
        <p class="text-sm text-gray-600 mb-4">Material: <strong>${escapeHtml(material.name)}</strong></p>
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Date Sampled</label>
                <input type="date" id="bulk-sample-date" class="w-full p-3 border rounded-lg" value="${getTodayLocal()}">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">HMR#</label>
                <input type="text" id="bulk-sample-hmr" class="w-full p-3 border rounded-lg" placeholder="e.g., 01" value="${hmrValue}">
            </div>
            <div id="bulk-sample-id-preview" class="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-sm">
                <span class="font-medium text-indigo-800">Sample ID:</span> <span id="bulk-sample-id-value" class="font-mono font-semibold text-indigo-900">—</span>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Description / Location</label>
                <textarea id="bulk-sample-location" class="w-full p-3 border rounded-lg" rows="2" placeholder="Where the material was sampled"></textarea>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Comments (optional)</label>
                <input type="text" id="bulk-sample-comments" class="w-full p-3 border rounded-lg" placeholder="Optional">
            </div>
        </div>
    `, () => {
        const hmrNumber = (document.getElementById('bulk-sample-hmr').value || '').trim();
        const location = (document.getElementById('bulk-sample-location').value || '').trim();
        const comments = (document.getElementById('bulk-sample-comments').value || '').trim();

        if (!hmrNumber) {
            alert('Please enter an HMR#');
            return false;
        }
        if (!location) {
            alert('Please enter a description/location');
            return false;
        }

        const letter = getNextBulkSampleLetter(materialId, hmrNumber);
        const sampleId = hmrNumber + letter;

        if (!currentProject.bulkSamples) currentProject.bulkSamples = [];
        currentProject.bulkSamples.push({
            id: generateId(),
            materialId,
            materialName: material.name,
            hmrNumber,
            location,
            sampleId,
            date: document.getElementById('bulk-sample-date').value || getTodayLocal(),
            inspectorName: typeof getInspectorProfile === 'function' ? (getInspectorProfile().name || '') : '',
            comments
        });
        if (!material.hmrNumber) material.hmrNumber = hmrNumber;
        saveCurrentProject();
        renderProject();
    });
    setTimeout(() => {
        const hmrInput = document.getElementById('bulk-sample-hmr');
        const previewEl = document.getElementById('bulk-sample-id-value');
        const updatePreview = () => {
            const hmr = (hmrInput?.value || '').trim();
            if (!hmr) {
                if (previewEl) previewEl.textContent = '—';
                return;
            }
            const letter = getNextBulkSampleLetter(materialId, hmr);
            if (previewEl) previewEl.textContent = hmr + letter;
        };
        updatePreview();
        hmrInput?.addEventListener('input', updatePreview);
        hmrInput?.focus();
    }, 50);
}

function openPrintBulkSamplesModal(materialId) {
    // When called from header button (no materialId), show material selector if multiple materials have bulk samples
    if (!materialId) {
        const materialsWithBulk = (currentProject.materials || []).filter(m =>
            (currentProject.bulkSamples || []).some(s => s.materialId === m.id)
        );
        if (materialsWithBulk.length === 0) {
            showNotification('No bulk samples to print.', true);
            return;
        }
        if (materialsWithBulk.length === 1) {
            openPrintBulkSamplesModal(materialsWithBulk[0].id);
            return;
        }
        const optionsHtml = materialsWithBulk.map(m =>
            `<option value="${m.id}">${escapeHtml(m.name)}</option>`
        ).join('');
        createModal('Select Material', `
            <p class="text-sm text-gray-600 mb-4">Select the material whose bulk samples you want to print.</p>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Material</label>
                <select id="print-bulk-material-select" class="w-full p-3 border rounded-lg bg-white">
                    ${optionsHtml}
                </select>
            </div>
        `, () => {
            const selectedId = document.getElementById('print-bulk-material-select').value;
            if (selectedId) openPrintBulkSamplesModal(selectedId);
            return true;
        });
        return;
    }

    const material = currentProject.materials?.find(m => m.id === materialId);
    const bulkSamples = (currentProject.bulkSamples || []).filter(s => s.materialId === materialId);
    if (!material || bulkSamples.length === 0) {
        showNotification('No bulk samples for this material.', true);
        return;
    }

    const primarySample = bulkSamples[0] || {};
    const inspectorName = primarySample.inspectorName || (typeof getInspectorProfile === 'function' ? getInspectorProfile().name : '') || '';
    const inspectorEmail = (typeof getInspectorProfile === 'function' ? getInspectorProfile().email : '') || '';

    const sampleCheckboxesHtml = bulkSamples.map(sample => buildModalSelectionOption(
        `print-bulk-sample-${sample.id}`,
        'print-bulk-sample-checkbox',
        sample.id,
        true,
        escapeHtml(sample.sampleId || sample.id || 'No ID'),
        `Bulk Asbestos · ${escapeHtml(sample.location || '')}`
    )).join('');

    const modal = createModal('Print Bulk Sample Chain of Custody', `
        <p class="text-sm text-gray-600 mb-4">Material: <strong>${escapeHtml(material.name)}</strong>. Select samples and complete the form to generate the lab submission.</p>
        <div class="space-y-4">
            <div>
                <div class="flex items-center justify-between mb-2">
                    <label class="block text-sm font-medium text-gray-700">Select Samples to Print</label>
                    <div class="flex gap-2">
                        <button type="button" id="print-bulk-select-all" class="text-xs font-medium" style="color:#4f46e5;">Select All</button>
                        <span class="text-gray-300">|</span>
                        <button type="button" id="print-bulk-select-none" class="text-xs font-medium" style="color:#4f46e5;">Select None</button>
                    </div>
                </div>
                <div id="print-bulk-samples-list" class="modal-selection-box max-h-48 overflow-y-auto">
                    ${sampleCheckboxesHtml}
                </div>
                <p id="print-bulk-sample-count" class="text-xs text-gray-500 mt-2"><strong>${bulkSamples.length}</strong> sample${bulkSamples.length > 1 ? 's' : ''} selected</p>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Collected By</label>
                    <input type="text" id="print-bulk-inspector" class="w-full p-2.5 border rounded-lg" value="${escapeHtml(inspectorName)}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Lab Account Number</label>
                    <input type="text" id="print-bulk-lab-number" class="w-full p-2.5 border rounded-lg" placeholder="e.g., LAB-001">
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Send Results To (Email)</label>
                    <input type="email" id="print-bulk-email" class="w-full p-2.5 border rounded-lg" value="${escapeHtml(inspectorEmail)}" placeholder="email@example.com">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Laboratory</label>
                    <input type="text" id="print-bulk-lab" class="w-full p-2.5 border rounded-lg" placeholder="e.g., FACS, EMSL">
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Type of Analysis</label>
                    <select id="print-bulk-analysis" class="w-full p-2.5 border rounded-lg bg-white">
                        <option value="PLM - Standard" selected>PLM - Standard</option>
                        <option value="PCM: NIOSH 7400">PCM: NIOSH 7400</option>
                        <option value="TEM: NIOSH 7402">TEM: NIOSH 7402</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Turn Around Time</label>
                    <input type="text" id="print-bulk-turnaround" class="w-full p-2.5 border rounded-lg" placeholder="e.g., 24-Hour, 5-Day">
                </div>
            </div>

            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
                <textarea id="print-bulk-instructions" rows="2" class="w-full p-2.5 border rounded-lg" placeholder="Optional special instructions for the lab..."></textarea>
            </div>
        </div>
    `, async () => {
        const selectedSampleIds = Array.from(document.querySelectorAll('.print-bulk-sample-checkbox:checked')).map(cb => cb.value);
        if (selectedSampleIds.length === 0) {
            showNotification('Please select at least one sample to print.', true);
            return false;
        }
        const selectedSamples = bulkSamples.filter(s => selectedSampleIds.includes(s.id));
        const formData = {
            inspectorName: document.getElementById('print-bulk-inspector').value.trim(),
            inspectorEmail: document.getElementById('print-bulk-email').value.trim(),
            labNumber: document.getElementById('print-bulk-lab-number').value.trim(),
            lab: document.getElementById('print-bulk-lab').value.trim(),
            analysisType: document.getElementById('print-bulk-analysis').value,
            turnAroundTime: document.getElementById('print-bulk-turnaround').value.trim(),
            specialInstructions: document.getElementById('print-bulk-instructions').value.trim()
        };
        await printBulkSampleForm(currentProject, material, selectedSamples, formData);
    });

    setTimeout(() => {
        const sampleCheckboxes = document.querySelectorAll('.print-bulk-sample-checkbox');
        const sampleCountEl = document.getElementById('print-bulk-sample-count');
        const selectAllBtn = document.getElementById('print-bulk-select-all');
        const selectNoneBtn = document.getElementById('print-bulk-select-none');
        const updateSampleCount = () => {
            const checkedCount = document.querySelectorAll('.print-bulk-sample-checkbox:checked').length;
            if (sampleCountEl) sampleCountEl.innerHTML = `<strong>${checkedCount}</strong> sample${checkedCount !== 1 ? 's' : ''} selected`;
        };
        sampleCheckboxes.forEach(cb => cb.addEventListener('change', updateSampleCount));
        selectAllBtn?.addEventListener('click', () => { sampleCheckboxes.forEach(cb => cb.checked = true); updateSampleCount(); });
        selectNoneBtn?.addEventListener('click', () => { sampleCheckboxes.forEach(cb => cb.checked = false); updateSampleCount(); });
    }, 50);
}

async function printBulkSampleForm(project, material, bulkSamples, formData = {}) {
    try {
        const DocxtemplaterClass = window.Docxtemplater || (typeof Docxtemplater !== 'undefined' ? Docxtemplater : null);
        const PizZipClass = window.PizZip || (typeof PizZip !== 'undefined' ? PizZip : null);
        if (!DocxtemplaterClass || !PizZipClass) {
            showNotification('Document generation library is not loaded. Please refresh the page.', true);
            return;
        }

        const formatDate = (dateString) => {
            if (!dateString) return '';
            const date = new Date(dateString + (dateString.includes('T') ? '' : 'T00:00:00'));
            if (isNaN(date.getTime())) return '';
            return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
        };

        const formInspectorName = formData.inspectorName || '';
        const signatureBase64 = getInspectorSignatureBase64(formInspectorName);

        const sampleDates = bulkSamples.map(s => s.date).filter(Boolean);
        const uniqueDates = [...new Set(sampleDates)].sort();
        const datesCollected = uniqueDates.length > 1
            ? `${formatDate(uniqueDates[0])} - ${formatDate(uniqueDates[uniqueDates.length - 1])}`
            : (uniqueDates.length === 1 ? formatDate(uniqueDates[0]) : '');

        const samplesData = bulkSamples.map((sample, idx) => {
            const loc = sample.location || '';
            const cmt = sample.comments || '';
            const descParts = [loc, cmt].filter(Boolean);
            const sampleDescription = descParts.join(' — ') || '';
            return {
            sampleNumber: idx + 1,
            sampleID: sample.sampleId || sample.id || '',
            sampleDescription,
            sampleLocation: loc,
            sampleComments: cmt,
            sampleDate: formatDate(sample.date || getTodayLocal()),
            startTime: '',
            stopTime: '',
            timeElapsed: '',
            startFlow: '',
            stopFlow: '',
            averageFlow: '',
            sampleVolume: ''
        };
        });

        const templateData = {
            date: formatDate(getTodayLocal()),
            projectNumber: project.projectNumber || '',
            inspectorName: formInspectorName,
            labNumber: formData.labNumber || '',
            datesCollected: datesCollected,
            analysisType: formData.analysisType || 'PLM - Standard',
            lab: formData.lab || '',
            turnAroundTime: formData.turnAroundTime || '',
            siteName: project.siteName || '',
            spectialInstructions: formData.specialInstructions || '',
            inspectorEmail: formData.inspectorEmail || '',
            materialName: material.name,
            samplesBulk: samplesData,
            samples: samplesData,
            image: signatureBase64 || '',
            signature: signatureBase64 || ''
        };

        showNotification('Loading Bulk Sample template...');
        const TEMPLATE_VERSION = '1.0';
        const templatePath = './templates/Bulk Sample Template.docx';
        const cacheBuster = `?v=${TEMPLATE_VERSION}&t=${Date.now()}`;
        const templateUrl = templatePath + cacheBuster;

        let arrayBuffer;
        if (window.electronAPI) {
            const result = await window.electronAPI.readTemplate('Bulk Sample Template.docx');
            if (!result.success) throw new Error(result.error || 'Failed to read template');
            const buf = result.data;
            arrayBuffer = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        } else {
            const response = await fetch(templateUrl, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
            if (!response.ok) throw new Error(`Failed to load template: ${response.statusText}`);
            arrayBuffer = await response.arrayBuffer();
        }

        const zip = new PizZipClass(arrayBuffer);
        const docOptions = {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '{', end: '}' },
            nullGetter: () => ''
        };
        let doc;
        try {
            doc = new DocxtemplaterClass(zip, docOptions);
            doc.render({ ...templateData, image: '', signature: '' });
        } catch (renderErr) {
            throw renderErr;
        }

        const blob = doc.getZip().generate({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });

        const fileName = `Bulk_Sample_COC_${project.projectNumber || 'Project'}_${(material.name || '').replace(/[^a-zA-Z0-9]/g, '_')}_${formatDate(getTodayLocal()).replace(/\//g, '_')}.docx`;
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        showNotification('Bulk sample COC document generated successfully.');
    } catch (error) {
        console.error('Error generating bulk sample document:', error);
        showNotification('Failed to generate document. Check the console for details.', true);
    }
}

function openAddMaterialToSpaceModal(buildingId, spaceId) {
    const building = currentProject.buildings?.find(b => b.id === buildingId);
    const space = building?.spaces?.find(s => s.id === spaceId);
    if (!space) return;
    
    // Get available materials from site materials
    const materialOptions = (currentProject.materials || []).map(m => 
        `<option value="${m.id}">${escapeHtml(m.name)} (${displayUnit(m.unit, 'units')})</option>`
    ).join('');
    
    const modal = createModal(`Add Material to ${escapeHtml(space.name)}`, `
        <div class="space-y-4">
            ${materialOptions ? `
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Select Material</label>
                    <select id="space-material-select" class="w-full p-3 border rounded-lg bg-white">
                        <option value="">-- Select a site material --</option>
                        ${materialOptions}
                    </select>
                </div>
            ` : '<p class="text-gray-500">No site materials defined. Add site materials first.</p>'}
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Or Enter Custom Material Name</label>
                <input type="text" id="space-material-name" class="w-full p-3 border rounded-lg" placeholder="e.g., 9x9 VAT">
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                    <input type="number" id="space-material-quantity" class="w-full p-3 border rounded-lg" placeholder="0">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                    <select id="space-material-unit" class="w-full p-3 border rounded-lg bg-white">
                        <option value="SF">Square Feet (ft\u00b2)</option>
                        <option value="LF">Linear Feet (LF)</option>
                        <option value="EA">Each (EA)</option>
                        <option value="CF">Cubic Feet (CF)</option>
                    </select>
                </div>
            </div>
        </div>
    `, () => {
        const selectedId = document.getElementById('space-material-select')?.value;
        let name = document.getElementById('space-material-name').value.trim();
        let unit = document.getElementById('space-material-unit').value;
        
        if (selectedId) {
            const siteMaterial = currentProject.materials?.find(m => m.id === selectedId);
            if (siteMaterial) {
                name = siteMaterial.name;
                unit = siteMaterial.unit || unit;
            }
        }
        
        if (!name) {
            alert('Please select or enter a material');
            return false;
        }
        
        const quantity = parseFloat(document.getElementById('space-material-quantity').value) || 0;
        
        if (!space.materials) space.materials = [];
        space.materials.push({
            id: generateId(),
            materialId: selectedId || null,
            name,
            quantity,
            unit
        });
        saveCurrentProject();
        renderProject();
    });
}

function deleteMaterialFromSpace(buildingId, spaceId, materialId) {
    const building = currentProject.buildings?.find(b => b.id === buildingId);
    const space = building?.spaces?.find(s => s.id === spaceId);
    if (space) {
        space.materials = space.materials.filter(m => m.id !== materialId);
        saveCurrentProject();
        renderProject();
    }
}

// ============================================
// VISUAL INSPECTION MODAL
// ============================================

/**
 * Opens a Visual Inspection Modal for Pre-Start or Final inspections
 * @param {string} inspectionType - 'Pre-Start' or 'Final'
 * @param {string} containmentName - Name of the containment
 * @returns {Promise<{passed: boolean, comments: string, inspectorName: string, regulatedArea?: boolean}|null>}
 */
function openVisualInspectionModal(inspectionType, containmentName) {
    const isPreStartInspection = inspectionType === 'Pre-Start';
    const inspectionTitle = inspectionType === 'Pre-Start'
        ? 'Pre-Start Visual Inspection'
        : 'Final Visual Inspection';

    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal active';

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 640px;">
                <h3>${inspectionTitle}</h3>
                <form id="visual-inspection-form" class="space-y-4">
                    <p class="text-sm text-gray-600" style="margin-top:0;">Containment: ${escapeHtml(getContainmentDisplayName(containmentName || 'Containment'))}</p>
                    <div>
                        <label for="visual-inspection-inspector" class="block text-sm font-medium text-gray-700 mb-1">Inspector Name</label>
                        <input type="text" id="visual-inspection-inspector" class="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500" placeholder="Enter inspector name" value="${escapeHtml((typeof getInspectorProfile === 'function' ? getInspectorProfile() : {}).name || '')}" required>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Findings</label>
                        <div class="space-y-2 mt-2">
                            ${buildModalRadioRow('visual-inspection-pass', 'visual-inspection-finding', 'pass', '<span class="text-sm font-medium text-green-700">Pass</span>')}
                            ${buildModalRadioRow('visual-inspection-fail', 'visual-inspection-finding', 'fail', '<span class="text-sm font-medium text-red-700">Fail</span>')}
                        </div>
                    </div>
                    ${isPreStartInspection ? `
                    <div class="notice-box notice-box--warn">
                        ${buildModalCheckboxRow(
                            'visual-inspection-regulated-area',
                            '',
                            '',
                            '<span class="modal-check-title">Regulated Area</span><span class="modal-check-subtitle">Check this if the containment is a regulated area. Negative pressure readings will not be required for daily logs, and clearance air samples will not be automatically created.</span>'
                        )}
                    </div>
                    ` : ''}
                    <div>
                        <label for="visual-inspection-comments" class="block text-sm font-medium text-gray-700 mb-1">Comments</label>
                        <textarea id="visual-inspection-comments" rows="4" class="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500" placeholder="Enter inspection comments..."></textarea>
                    </div>
                </form>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary modal-cancel-btn" id="visual-inspection-cancel-btn">Cancel</button>
                    <button type="submit" form="visual-inspection-form" class="btn btn-primary modal-save-btn">Save Inspection</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const cancelBtn = modal.querySelector('#visual-inspection-cancel-btn');
        const form = modal.querySelector('#visual-inspection-form');

        const closeModal = () => modal.remove();

        const handleCancel = () => {
            resolve(null); // null indicates cancellation
            closeModal();
        };

        cancelBtn.addEventListener('click', handleCancel);
        // Track mouse down position to prevent closing when dragging from inside modal
        let mouseDownOnBackdrop = false;
        
        modal.addEventListener('mousedown', (e) => {
            mouseDownOnBackdrop = (e.target === modal);
        });
        
        modal.addEventListener('click', (event) => {
            if (event.target === modal && mouseDownOnBackdrop) {
                handleCancel();
            }
            mouseDownOnBackdrop = false;
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const finding = form.querySelector('input[name="visual-inspection-finding"]:checked')?.value;
            const comments = form.querySelector('#visual-inspection-comments').value.trim();
            const inspectorName = form.querySelector('#visual-inspection-inspector').value.trim();
            const regulatedAreaCheckbox = form.querySelector('#visual-inspection-regulated-area');
            const isRegulatedArea = regulatedAreaCheckbox ? regulatedAreaCheckbox.checked : false;

            if (!finding) {
                showNotification('Please select a finding (Pass or Fail).', true);
                return;
            }
            if (!inspectorName) {
                showNotification('Please enter an inspector name.', true);
                return;
            }

            resolve({
                passed: finding === 'pass',
                comments: comments || '',
                inspectorName: inspectorName,
                regulatedArea: isRegulatedArea
            });
            closeModal();
        });
    });
}

// ============================================
// CLEARANCE AIR SAMPLES
// ============================================

/**
 * Create 5 clearance air samples for a containment when transitioning to Containment Clearance
 * Only for non-regulated areas. Sets containmentId (dropdown) instead of location text.
 */
function createClearanceAirSamples(containment, inspectionData) {
    const projectNumber = currentProject.projectNumber || 'PJ00000';
    const existingSamples = currentProject.airSamples || [];

    // Find the next sequence number for clearance samples
    const prefix = `${projectNumber}-CA`;
    let maxSeq = 0;
    existingSamples.forEach(s => {
        const sId = s.sampleId || s.id || '';
        if (sId.startsWith(prefix)) {
            const part = sId.replace(prefix, '');
            if (/^\d+$/.test(part)) {
                const num = parseInt(part, 10);
                if (num > maxSeq) maxSeq = num;
            }
        }
    });

    // Auto-generated samples: default date to day after creation (inspector can change in sample details)
    const defaultSampleDate = getTomorrowLocal();
    const containmentId = containment?.id || '';
    const containmentName = (containment?.name && containment.name.trim()) ? containment.name.trim() : 'Unknown Containment';

    // Create 5 clearance samples - use containment dropdown, not location text
    for (let i = 1; i <= 5; i++) {
        const sampleId = `${prefix}${String(maxSeq + i).padStart(3, '0')}`;
        const newSample = {
            id: generateId(),
            sampleId: sampleId,
            type: 'Clearance',
            date: defaultSampleDate,
            startTime: '',
            stopTime: '',
            startFlowRate: '',
            stopFlowRate: '',
            containmentId: containmentId,
            containmentName: containmentName,
            location: '',
            comments: '',
            inspectorName: inspectionData?.inspectorName || '',
            createdAt: Date.now(),
            autoCreated: true
        };
        existingSamples.push(newSample);
    }

    currentProject.airSamples = existingSamples;
    console.log(`Created 5 clearance air samples for containment: ${containmentName}`);
}

function buildModalCheckboxRow(id, inputClass, extraAttrs, labelHtml, rowClass = '', labelClass = '') {
    const inputCls = inputClass ? ` class="${inputClass}"` : '';
    return `<div class="modal-check-row ${rowClass}">
        <input type="checkbox" id="${id}"${inputCls} ${extraAttrs}>
        <label for="${id}" class="modal-check-label ${labelClass}">${labelHtml}</label>
    </div>`;
}

function buildModalRadioRow(id, name, value, labelHtml, checked = false, rowClass = '') {
    return `<div class="modal-check-row ${rowClass}">
        <input type="radio" id="${id}" name="${name}" value="${value}" class="h-4 w-4" ${checked ? 'checked' : ''}>
        <label for="${id}" class="modal-check-label">${labelHtml}</label>
    </div>`;
}

function buildModalSelectionOption(id, checkboxClass, valueAttr, checked, titleHtml, subtitleHtml = '') {
    const sub = subtitleHtml ? `<span class="modal-check-subtitle">${subtitleHtml}</span>` : '';
    const label = `<span class="modal-check-title">${titleHtml}</span>${sub}`;
    const attrs = valueAttr !== undefined && valueAttr !== null && valueAttr !== ''
        ? `value="${escapeHtml(String(valueAttr))}" ${checked ? 'checked' : ''}`
        : (checked ? 'checked' : '');
    return `<div class="modal-selection-option">${buildModalCheckboxRow(id, checkboxClass, attrs, label)}</div>`;
}

function buildContainmentSpacePickerCard(space, options = {}) {
    const {
        isInOther = false,
        otherContainments = [],
        isSpaceChecked = false,
        preselMatNames = null,
        defaultAllMaterialsChecked = true
    } = options;

    const warningBadge = isInOther
        ? `<span class="modal-check-warn" title="Already in: ${escapeHtml(otherContainments.join(', '))}">⚠️ In ${otherContainments.length} containment${otherContainments.length > 1 ? 's' : ''}</span>`
        : '';

    const spaceCbId = `containment-space-cb-${space.id}`;
    const spaceLabel = `<span class="modal-check-title">${escapeHtml(space.name)}</span>${warningBadge}`;

    let materialsHtml;
    if (!(space.materials || []).length) {
        materialsHtml = '<p class="modal-check-sublist-empty">No materials assigned</p>';
    } else {
        materialsHtml = `<div class="modal-check-sublist" data-space-id="${escapeHtml(space.id)}">${
            (space.materials || []).map((m, idx) => {
                const isMatChecked = isSpaceChecked && preselMatNames
                    ? preselMatNames.has(m.name)
                    : defaultAllMaterialsChecked;
                const matCbId = `containment-mat-cb-${space.id}-${idx}`;
                const pill = `<span class="modal-check-pill">${escapeHtml(m.name)} \u00b7 ${parseFloat(m.quantity || 0).toLocaleString()} ${escapeHtml(displayUnit(m.unit))}</span>`;
                return buildModalCheckboxRow(
                    matCbId,
                    'containment-material-cb',
                    `data-space-id="${escapeHtml(space.id)}" data-material-index="${idx}" ${isMatChecked ? 'checked' : ''}`,
                    pill
                );
            }).join('')
        }</div>`;
    }

    return `
        <div class="modal-selection-item${isInOther ? ' modal-selection-item--warn' : ''}">
            ${buildModalCheckboxRow(
                spaceCbId,
                'containment-space-cb',
                `data-space-id="${escapeHtml(space.id)}" data-space-name="${escapeHtml(space.name)}" ${isSpaceChecked ? 'checked' : ''}`,
                spaceLabel,
                '',
                'modal-check-label--strong'
            )}
            ${materialsHtml}
        </div>`;
}

function wireContainmentSpacePickerList(spacesList) {
    spacesList.querySelectorAll('.containment-space-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const sid = cb.dataset.spaceId;
            spacesList.querySelectorAll(`.containment-material-cb[data-space-id="${sid}"]`).forEach(mc => {
                mc.checked = cb.checked;
            });
        });
    });
}

function openAddContainmentModal() {
    // Get all buildings and spaces for selection
    const buildingOptions = (currentProject.buildings || []).map(b => 
        `<option value="${b.id}">${escapeHtml(b.name)}</option>`
    ).join('');
    
    const modalContent = `
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Containment Name</label>
                <div class="containment-name-wrap">
                    <span id="new-containment-mirror" class="absolute whitespace-pre pointer-events-none" style="visibility:hidden;left:-9999px;top:0" aria-hidden="true"></span>
                    <input type="text" id="new-containment-name" class="containment-name-input" placeholder="e.g., North" autocomplete="off">
                    <span id="new-containment-suffix" class="containment-name-suffix" style="display:none;"> Containment</span>
                </div>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Building</label>
                <select id="new-containment-building" class="w-full p-3 border rounded-lg bg-white">
                    <option value="">-- Select a building --</option>
                    ${buildingOptions}
                </select>
            </div>
            <div id="new-containment-spaces-section" class="hidden">
                <label class="block text-sm font-medium text-gray-700 mb-2">Select Spaces</label>
                <div id="new-containment-spaces-list" class="modal-selection-box max-h-64 overflow-y-auto">
                    <p class="text-sm text-gray-500">Select a building first</p>
                </div>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Stage</label>
                <select id="new-containment-stage" class="w-full p-3 border rounded-lg bg-white">
                    <option value="Containment Preparation">Containment Preparation</option>
                    <option value="Active Abatement">Active Abatement</option>
                    <option value="Containment Clearance">Containment Clearance</option>
                    <option value="Containment Teardown">Containment Teardown</option>
                    <option value="Abatement Completed">Abatement Completed</option>
                </select>
            </div>
        </div>
    `;
    
    const modal = createModal('Add Containment', modalContent, () => {
        const name = document.getElementById('new-containment-name').value.trim();
        if (!name) {
            alert('Please enter a containment name');
            return false;
        }
        
        const buildingId = document.getElementById('new-containment-building').value;
        const building = currentProject.buildings?.find(b => b.id === buildingId);
        
        if (!building) {
            alert('Please select a building');
            return false;
        }
        setLastBuildingId(currentProject.id, buildingId);
        
        // Get selected spaces and the inspector-selected materials within each
        const selectedSpaceCheckboxes = document.querySelectorAll('#new-containment-spaces-list .containment-space-cb:checked');
        const selectedSpaces = [];
        
        selectedSpaceCheckboxes.forEach(checkbox => {
            const spaceId = checkbox.dataset.spaceId;
            const space = building.spaces?.find(s => s.id === spaceId);
            if (!space) return;
            
            // Only include materials whose checkbox is checked for this space
            const matCbs = document.querySelectorAll(
                `#new-containment-spaces-list .containment-material-cb[data-space-id="${CSS.escape(spaceId)}"]:checked`
            );
            const selectedMaterials = [];
            matCbs.forEach(mc => {
                const idx = parseInt(mc.dataset.materialIndex, 10);
                const m = (space.materials || [])[idx];
                if (m) {
                    selectedMaterials.push({
                        materialId: m.materialId || null,
                        name: m.name,
                        quantity: m.quantity || 0,
                        unit: m.unit || ''
                    });
                }
            });
            
            selectedSpaces.push({
                id: space.id,
                spaceName: space.name,
                name: space.name,
                materials: selectedMaterials
            });
        });
        
        // Aggregate materials from selected spaces (only the ones the inspector kept checked)
        const materialsMap = new Map();
        selectedSpaces.forEach(space => {
            (space.materials || []).forEach(mat => {
                const key = `${mat.name}_${mat.unit}`;
                if (!materialsMap.has(key)) {
                    materialsMap.set(key, {
                        materialId: mat.materialId || null,
                        materialName: mat.name,
                        name: mat.name,
                        totalQuantity: 0,
                        quantity: 0,
                        unit: mat.unit
                    });
                }
                const existing = materialsMap.get(key);
                existing.totalQuantity += parseFloat(mat.quantity) || 0;
                existing.quantity += parseFloat(mat.quantity) || 0;
                if (mat.materialId && !existing.materialId) {
                    existing.materialId = mat.materialId;
                }
            });
        });
        
        const initialStage = document.getElementById('new-containment-stage').value;
        
        if (!currentProject.containments) currentProject.containments = [];
        currentProject.containments.push({
            id: generateId(),
            name,
            buildingId,
            buildingName: building.name || '',
            stage: initialStage,
            regulatedArea: false,
            spaces: selectedSpaces,
            materials: Array.from(materialsMap.values()),
            dailyLogs: [],
            visualInspections: [],
            workerRoster: [],
            stageHistory: [{
                stage: initialStage,
                changedAt: Date.now(),
                previousStage: null
            }],
            createdAt: Date.now()
        });
        saveCurrentProject();
        renderProject();
    });
    
    // Add event listener for building selection and ghost suffix (inline, next to typed text)
    setTimeout(() => {
        const nameInput = document.getElementById('new-containment-name');
        const suffixSpan = document.getElementById('new-containment-suffix');
        const mirrorSpan = document.getElementById('new-containment-mirror');
        if (nameInput && suffixSpan && mirrorSpan) {
            const updateSuffix = () => {
                const raw = nameInput.value;
                if (!raw.trim()) {
                    suffixSpan.style.display = 'none';
                    return;
                }
                mirrorSpan.textContent = raw;
                mirrorSpan.style.font = window.getComputedStyle(nameInput).font;
                mirrorSpan.style.fontSize = window.getComputedStyle(nameInput).fontSize;
                mirrorSpan.style.lineHeight = window.getComputedStyle(nameInput).lineHeight;
                const pad = parseFloat(window.getComputedStyle(nameInput).paddingLeft) || 12;
                suffixSpan.style.left = `${pad + mirrorSpan.offsetWidth}px`;
                suffixSpan.style.font = window.getComputedStyle(nameInput).font;
                suffixSpan.style.fontSize = window.getComputedStyle(nameInput).fontSize;
                suffixSpan.textContent = ' Containment';
                suffixSpan.style.display = 'inline';
            };
            nameInput.addEventListener('input', updateSuffix);
            nameInput.addEventListener('focus', updateSuffix);
            updateSuffix();
        }
        const buildingSelect = document.getElementById('new-containment-building');
        if (buildingSelect) {
            applyLastBuildingSelection(buildingSelect);
            buildingSelect.addEventListener('change', function() {
                if (this.value) setLastBuildingId(currentProject.id, this.value);
                const buildingId = this.value;
                const spacesSection = document.getElementById('new-containment-spaces-section');
                const spacesList = document.getElementById('new-containment-spaces-list');
                
                if (!buildingId) {
                    spacesSection.classList.add('hidden');
                    return;
                }
                
                const building = currentProject.buildings?.find(b => b.id === buildingId);
                if (!building || !building.spaces || building.spaces.length === 0) {
                    spacesList.innerHTML = '<p class="text-sm text-gray-500">No spaces available for this building.</p>';
                    spacesSection.classList.remove('hidden');
                    return;
                }
                
                // Check which spaces are already in other containments
                const spacesInOtherContainments = new Map();
                (currentProject.containments || []).forEach(containment => {
                    if (containment.buildingId === buildingId) {
                        (containment.spaces || []).forEach(space => {
                            const spaceName = space.spaceName || space.name;
                            if (spaceName) {
                                if (!spacesInOtherContainments.has(spaceName)) {
                                    spacesInOtherContainments.set(spaceName, []);
                                }
                                spacesInOtherContainments.get(spaceName).push(containment.name || 'Unnamed');
                            }
                        });
                    }
                });
                
                spacesList.innerHTML = building.spaces.map(space => {
                    const isInOther = spacesInOtherContainments.has(space.name);
                    const otherContainments = isInOther ? spacesInOtherContainments.get(space.name) : [];
                    return buildContainmentSpacePickerCard(space, {
                        isInOther,
                        otherContainments,
                        isSpaceChecked: false,
                        defaultAllMaterialsChecked: true
                    });
                }).join('');

                wireContainmentSpacePickerList(spacesList);
                
                spacesSection.classList.remove('hidden');
            });
        }
    }, 100);
}

function openEditContainmentModal(containmentId) {
    const containment = currentProject.containments?.find(c => c.id === containmentId);
    if (!containment) return;
    
    // Normalize old abbreviated stage to full name
    const currentStage = normalizeStage(containment.stage);
    
    // Get preselected space names
    const preselectedSpaceNames = new Set((containment.spaces || []).map(s => s.spaceName || s.name || s.id));
    // Map of space name -> Set of currently-included material names for that space
    const preselectedMaterialsBySpace = new Map();
    (containment.spaces || []).forEach(s => {
        const key = s.spaceName || s.name || s.id;
        if (!key) return;
        const matNames = new Set((s.materials || []).map(m => m.name).filter(Boolean));
        preselectedMaterialsBySpace.set(key, matNames);
    });
    
    const buildingOptions = (currentProject.buildings || []).map(b => 
        `<option value="${b.id}" ${b.id === containment.buildingId ? 'selected' : ''}>${escapeHtml(b.name)}</option>`
    ).join('');
    
    // Show regulated area status (read-only, set via Pre-Start inspection)
    const regulatedBadge = containment.regulatedArea 
        ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">⚠️ Regulated Area</span>' 
        : '';
    
    // Show visual inspection history
    const inspectionsHtml = (containment.visualInspections || []).length > 0
        ? `<div class="mt-2 space-y-1">
            <label class="block text-xs font-medium text-gray-500 uppercase tracking-wide">Visual Inspections</label>
            ${(containment.visualInspections || []).map(vi => {
                const passClass = vi.passed ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200';
                const passText = vi.passed ? 'Pass' : 'Fail';
                return `<div class="text-xs border rounded p-2 ${passClass}">
                    <span class="font-medium">${escapeHtml(vi.type || '')} Visual:</span> ${passText}
                    ${vi.inspectorName ? ` — ${escapeHtml(vi.inspectorName)}` : ''}
                    ${vi.date ? ` (${vi.date})` : ''}
                    ${vi.comments ? `<br><span class="italic">${escapeHtml(vi.comments)}</span>` : ''}
                </div>`;
            }).join('')}
        </div>`
        : '';
    
    const modalContent = `
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Containment Name</label>
                <div class="relative w-full border border-gray-300 rounded-lg bg-white overflow-hidden" style="min-height: 2.75rem;">
                    <input type="text" id="edit-containment-name" class="w-full p-3 border-0 focus:ring-0 bg-transparent" value="${escapeHtml(containment.name)}" style="box-shadow: none;">
                </div>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Building</label>
                <select id="edit-containment-building" class="w-full p-3 border rounded-lg bg-white">
                    <option value="">-- Select a building --</option>
                    ${buildingOptions}
                </select>
            </div>
            <div id="edit-containment-spaces-section" class="${containment.buildingId ? '' : 'hidden'}">
                <label class="block text-sm font-medium text-gray-700 mb-2">Select Spaces</label>
                <div id="edit-containment-spaces-list" class="modal-selection-box max-h-64 overflow-y-auto">
                    ${containment.buildingId ? '<p class="text-sm text-gray-500">Loading spaces...</p>' : '<p class="text-sm text-gray-500">Select a building first</p>'}
                </div>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Stage</label>
                <select id="edit-containment-stage" class="w-full p-3 border rounded-lg bg-white">
                    <option value="${STAGE_CONTAINMENT_PREPARATION}" ${currentStage === STAGE_CONTAINMENT_PREPARATION ? 'selected' : ''}>Containment Preparation</option>
                    <option value="${STAGE_ACTIVE_ABATEMENT}" ${currentStage === STAGE_ACTIVE_ABATEMENT ? 'selected' : ''}>Active Abatement</option>
                    <option value="${STAGE_CONTAINMENT_CLEARANCE}" ${currentStage === STAGE_CONTAINMENT_CLEARANCE ? 'selected' : ''}>Containment Clearance</option>
                    <option value="${STAGE_CONTAINMENT_TEARDOWN}" ${currentStage === STAGE_CONTAINMENT_TEARDOWN ? 'selected' : ''}>Containment Teardown</option>
                    <option value="${STAGE_ABATEMENT_COMPLETED}" ${currentStage === STAGE_ABATEMENT_COMPLETED ? 'selected' : ''}>Abatement Completed</option>
                </select>
            </div>
            ${regulatedBadge ? `<div class="flex items-center gap-2">${regulatedBadge}</div>` : ''}
            ${inspectionsHtml}
            <div id="edit-containment-status-msg" class="hidden text-sm font-medium p-2 rounded"></div>
        </div>
    `;
    
    // We use createModal but override the save to handle async visual inspection flow
    // createModal's onSave returning false keeps modal open
    let modalElement = null;
    
    const modal = createModal('Edit Containment', modalContent, async () => {
        // This save callback handles the complex async stage-change + inspection flow
        const name = document.getElementById('edit-containment-name')?.value.trim();
        if (!name) {
            showEditContainmentStatus('Please enter a containment name.', true);
            return false; // Keep modal open
        }
        
        const buildingId = document.getElementById('edit-containment-building')?.value;
        const building = currentProject.buildings?.find(b => b.id === buildingId);
        
        if (!building) {
            showEditContainmentStatus('Please select a building.', true);
            return false;
        }
        setLastBuildingId(currentProject.id, buildingId);
        
        // Get selected spaces and the inspector-selected materials within each
        const selectedSpaceCheckboxes = document.querySelectorAll('#edit-containment-spaces-list .containment-space-cb:checked');
        const selectedSpaces = [];
        
        selectedSpaceCheckboxes.forEach(checkbox => {
            const spaceId = checkbox.dataset.spaceId;
            const space = building.spaces?.find(s => s.id === spaceId);
            if (!space) return;
            
            // Only include materials whose checkbox is checked for this space
            const matCbs = document.querySelectorAll(
                `#edit-containment-spaces-list .containment-material-cb[data-space-id="${CSS.escape(spaceId)}"]:checked`
            );
            const selectedMaterials = [];
            matCbs.forEach(mc => {
                const idx = parseInt(mc.dataset.materialIndex, 10);
                const m = (space.materials || [])[idx];
                if (m) {
                    selectedMaterials.push({
                        materialId: m.materialId || null,
                        name: m.name,
                        quantity: m.quantity || 0,
                        unit: m.unit || ''
                    });
                }
            });
            
            selectedSpaces.push({
                id: space.id,
                spaceName: space.name,
                name: space.name,
                materials: selectedMaterials
            });
        });
        
        // Aggregate materials from selected spaces (only the ones the inspector kept checked)
        const materialsMap = new Map();
        selectedSpaces.forEach(space => {
            (space.materials || []).forEach(mat => {
                const key = `${mat.name}_${mat.unit}`;
                if (!materialsMap.has(key)) {
                    materialsMap.set(key, {
                        materialId: mat.materialId || null,
                        materialName: mat.name,
                        name: mat.name,
                        totalQuantity: 0,
                        quantity: 0,
                        unit: mat.unit
                    });
                }
                const existing = materialsMap.get(key);
                existing.totalQuantity += parseFloat(mat.quantity) || 0;
                existing.quantity += parseFloat(mat.quantity) || 0;
                if (mat.materialId && !existing.materialId) {
                    existing.materialId = mat.materialId;
                }
            });
        });
        const aggregatedMaterials = Array.from(materialsMap.values());
        
        const newStage = document.getElementById('edit-containment-stage')?.value;
        const previousStage = currentStage; // normalized at modal open time
        
        // --- Stage change detection & visual inspection logic ---
        let requiresInspection = false;
        let inspectionType = null;
        
        if (previousStage && previousStage !== newStage) {
            // Pre-Start Visual Inspection: Containment Preparation -> Active Abatement
            if (previousStage === STAGE_CONTAINMENT_PREPARATION && newStage === STAGE_ACTIVE_ABATEMENT) {
                requiresInspection = true;
                inspectionType = 'Pre-Start';
            }
            // Final Visual Inspection: Active Abatement -> Containment Clearance
            else if (previousStage === STAGE_ACTIVE_ABATEMENT && newStage === STAGE_CONTAINMENT_CLEARANCE) {
                requiresInspection = true;
                inspectionType = 'Final';
            }
        }
        
        let visualInspectionData = null;
        
        if (requiresInspection) {
            // Close the edit containment modal before opening inspection modal
            const existingModal = document.querySelector('.modal.active');
            if (existingModal) existingModal.remove();
            
            // Open visual inspection modal (returns a promise)
            const inspectionResult = await openVisualInspectionModal(inspectionType, name);
            
            // If user cancelled, stop everything (modal is already closed)
            if (inspectionResult === null) {
                // Re-render to restore state
                renderProject();
                return; // Don't return false since modal is already removed
            }
            
            visualInspectionData = inspectionResult;
            
            // If inspection FAILED, revert stage and save the failed inspection
            if (!inspectionResult.passed) {
                // Save the failed inspection record
                if (!containment.visualInspections) containment.visualInspections = [];
                containment.visualInspections.push({
                    type: inspectionType,
                    passed: false,
                    comments: inspectionResult.comments || '',
                    inspectorName: inspectionResult.inspectorName || '',
                    date: getTodayLocal(),
                    createdAt: Date.now()
                });
                
                // Update containment with other changes but revert stage
                containment.name = name;
                containment.buildingId = buildingId;
                containment.buildingName = building.name || '';
                containment.stage = previousStage; // REVERT stage
                containment.spaces = selectedSpaces;
                containment.materials = aggregatedMaterials;
                containment.updatedAt = Date.now();
                
                saveCurrentProject();
                showNotification(`${inspectionType} Visual Inspection failed. Stage reverted to ${previousStage}.`, true);
                renderProject();
                return; // Modal already removed
            }
        }
        
        // If we get here: no inspection needed OR inspection passed
        
        // Build stage history
        let stageHistory = containment.stageHistory ? [...containment.stageHistory] : [];
        
        if (previousStage && previousStage !== newStage) {
            // Get inspector name from visual inspection data, or fallback to inspector profile
            let stageInspectorName = visualInspectionData?.inspectorName || '';
            if (!stageInspectorName && typeof getInspectorProfile === 'function') {
                stageInspectorName = (getInspectorProfile().name || '');
            }
            stageHistory.push({
                stage: newStage,
                changedAt: Date.now(),
                previousStage: previousStage,
                inspectorName: stageInspectorName
            });
        }
        
        // Save visual inspection if inspection was required and passed
        let visualInspections = containment.visualInspections ? [...containment.visualInspections] : [];
        if (requiresInspection && visualInspectionData && visualInspectionData.passed) {
            visualInspections.push({
                type: inspectionType,
                passed: true,
                comments: visualInspectionData.comments || '',
                inspectorName: visualInspectionData.inspectorName || '',
                date: getTodayLocal(),
                createdAt: Date.now()
            });
        }
        
        // Determine regulatedArea status
        // Set via Pre-Start inspection; otherwise keep existing value
        let regulatedArea = containment.regulatedArea || false;
        if (inspectionType === 'Pre-Start' && visualInspectionData?.passed) {
            regulatedArea = visualInspectionData.regulatedArea || false;
        }
        
        // Update the containment
        containment.name = name;
        containment.buildingId = buildingId;
        containment.buildingName = building.name || '';
        containment.stage = newStage;
        containment.stageHistory = stageHistory;
        containment.spaces = selectedSpaces;
        containment.materials = aggregatedMaterials;
        containment.visualInspections = visualInspections;
        containment.regulatedArea = regulatedArea;
        containment.updatedAt = Date.now();
        
        // Create clearance air samples if transitioning to Containment Clearance
        // and NOT a regulated area (Final inspection passed)
        if (inspectionType === 'Final' &&
            newStage === STAGE_CONTAINMENT_CLEARANCE &&
            visualInspectionData?.passed &&
            !containment.regulatedArea) {
            createClearanceAirSamples(containment, visualInspectionData);
            console.log('Auto-created 5 clearance air samples for:', containment.name);
        }
        
        saveCurrentProject();
        
        if (requiresInspection) {
            // Modal was already closed for inspection flow
            const message = (inspectionType === 'Final' && !containment.regulatedArea)
                ? 'Containment saved. 5 clearance air samples created.'
                : 'Containment saved and stage updated.';
            showNotification(message, false);
            renderProject();
            return; // Modal already removed
        } else {
            // Normal save (no inspection needed) - modal still open
            renderProject();
            // Return true so createModal closes the modal
        }
    });
    
    // Helper to show status messages inside the modal
    function showEditContainmentStatus(message, isError) {
        const statusEl = document.getElementById('edit-containment-status-msg');
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.className = `text-sm font-medium p-2 rounded ${isError ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`;
        statusEl.classList.remove('hidden');
    }
    
    // Function to render spaces for a building
    const renderSpacesForBuilding = (buildingId, preselectedNames, preselectedMatsMap) => {
        const spacesSection = document.getElementById('edit-containment-spaces-section');
        const spacesList = document.getElementById('edit-containment-spaces-list');
        
        if (!buildingId) {
            spacesSection.classList.add('hidden');
            return;
        }
        
        const building = currentProject.buildings?.find(b => b.id === buildingId);
        if (!building || !building.spaces || building.spaces.length === 0) {
            spacesList.innerHTML = '<p class="text-sm text-gray-500">No spaces available for this building.</p>';
            spacesSection.classList.remove('hidden');
            return;
        }
        
        // Check which spaces are already in other containments
        const spacesInOtherContainments = new Map();
        (currentProject.containments || []).forEach(c => {
            if (c.id === containmentId) return; // Skip current containment
            if (c.buildingId === buildingId) {
                (c.spaces || []).forEach(space => {
                    const spaceName = space.spaceName || space.name;
                    if (spaceName) {
                        if (!spacesInOtherContainments.has(spaceName)) {
                            spacesInOtherContainments.set(spaceName, []);
                        }
                        spacesInOtherContainments.get(spaceName).push(c.name || 'Unnamed');
                    }
                });
            }
        });
        
        spacesList.innerHTML = building.spaces.map(space => {
            const isInOther = spacesInOtherContainments.has(space.name);
            const otherContainments = isInOther ? spacesInOtherContainments.get(space.name) : [];
            const isPreselected = preselectedNames.has(space.name) || preselectedNames.has(space.id);
            const preselMatNames = preselectedMatsMap?.get(space.name) || preselectedMatsMap?.get(space.id);
            return buildContainmentSpacePickerCard(space, {
                isInOther,
                otherContainments,
                isSpaceChecked: isPreselected,
                preselMatNames: isPreselected ? preselMatNames : null,
                defaultAllMaterialsChecked: true
            });
        }).join('');

        wireContainmentSpacePickerList(spacesList);
        
        spacesSection.classList.remove('hidden');
    };
    
    // Add event listener for building selection
    setTimeout(() => {
        const buildingSelect = document.getElementById('edit-containment-building');
        if (buildingSelect) {
            // Initial render if building is already selected
            if (containment.buildingId) {
                renderSpacesForBuilding(containment.buildingId, preselectedSpaceNames, preselectedMaterialsBySpace);
            }
            
            applyLastBuildingSelection(buildingSelect);
            buildingSelect.addEventListener('change', function() {
                if (this.value) setLastBuildingId(currentProject.id, this.value);
                renderSpacesForBuilding(this.value, preselectedSpaceNames, preselectedMaterialsBySpace);
            });
        }
    }, 100);
}

function deleteContainment(containmentId) {
    if (!confirm('Delete this containment? This cannot be undone.')) return;
    currentProject.containments = currentProject.containments.filter(c => c.id !== containmentId);
    saveCurrentProject();
    renderProject();
}

function openAddAirSampleModal() {
    const containmentOptions = (currentProject.containments || []).map(c => 
        `<option value="${c.id}">${escapeHtml(getContainmentDisplayName(c.name))}</option>`
    ).join('');
    
    const suggestedId = getNextAirSampleId('Area');
    
    const modal = createModal('Add Air Sample', `
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Date Sampled</label>
                <input type="date" id="new-sample-date" class="w-full p-3 border rounded-lg" value="${getTodayLocal()}">
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Sample ID</label>
                    <input type="text" id="new-sample-id" class="w-full p-3 border rounded-lg" value="${suggestedId}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Sample Type</label>
                    <select id="new-sample-type" class="w-full p-3 border rounded-lg bg-white">
                        <option value="Area" selected>Area</option>
                        <option value="Personal">Personal</option>
                        <option value="Clearance">Clearance</option>
                    </select>
                </div>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Location / Comments</label>
                <input type="text" id="new-sample-location" class="w-full p-3 border rounded-lg" placeholder="e.g., Outside Containment 1, North Wall">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Containment (optional)</label>
                <select id="new-sample-containment" class="w-full p-3 border rounded-lg bg-white">
                    <option value="">-- None --</option>
                    ${containmentOptions}
                </select>
            </div>
            
            <div class="border-t pt-4 mt-4">
                <h4 class="font-medium text-gray-800 mb-3">Sampling Times & Flow Rates</h4>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                        <input type="time" id="new-sample-start-time" class="w-full p-3 border rounded-lg" onchange="updateSampleCalc('new')">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Start Flow Rate (L/min)</label>
                        <input type="number" id="new-sample-start-flow" class="w-full p-3 border rounded-lg" placeholder="2.0" step="0.1" value="2.0" onchange="updateSampleCalc('new')">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Stop Time</label>
                        <input type="time" id="new-sample-stop-time" class="w-full p-3 border rounded-lg" onchange="updateSampleCalc('new')">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Stop Flow Rate (L/min)</label>
                        <input type="number" id="new-sample-stop-flow" class="w-full p-3 border rounded-lg" placeholder="2.0" step="0.1" onchange="updateSampleCalc('new')">
                    </div>
                </div>
                
                <!-- Live Calculation Preview -->
                <div id="new-sample-calc-preview" class="mt-4 p-3 bg-indigo-50 rounded-lg hidden">
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span class="text-indigo-600 font-medium">Time Elapsed:</span>
                            <span id="new-sample-time-elapsed" class="text-indigo-800 font-bold ml-1">--</span>
                        </div>
                        <div>
                            <span class="text-indigo-600 font-medium">Sampling Volume:</span>
                            <span id="new-sample-volume" class="text-indigo-800 font-bold ml-1">--</span>
                        </div>
                        <div>
                            <span class="text-indigo-600 font-medium">Avg Flow Rate:</span>
                            <span id="new-sample-avg-flow" class="text-indigo-800 font-bold ml-1">--</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `, () => {
        const sampleId = document.getElementById('new-sample-id').value.trim();
        if (!sampleId) {
            alert('Please enter a sample ID');
            return false;
        }
        
        if (!currentProject.airSamples) currentProject.airSamples = [];
        const containmentIdVal = document.getElementById('new-sample-containment').value;
        const containment = containmentIdVal ? currentProject.containments?.find(c => c.id === containmentIdVal) : null;
        const startTime = document.getElementById('new-sample-start-time').value;
        const stopTime = document.getElementById('new-sample-stop-time').value;
        const startFlowRate = parseFloat(document.getElementById('new-sample-start-flow').value) || null;
        const stopFlowRate = parseFloat(document.getElementById('new-sample-stop-flow').value) || null;
        const timeElapsed = calculateTimeElapsed(startTime, stopTime);
        const samplingVolume = calculateSamplingVolume(startFlowRate, stopFlowRate, timeElapsed);
        currentProject.airSamples.push({
            id: generateId(),
            sampleId,
            type: document.getElementById('new-sample-type').value,
            location: document.getElementById('new-sample-location').value.trim(),
            containmentId: containmentIdVal,
            containmentName: containment?.name || '',
            date: document.getElementById('new-sample-date').value,
            startTime,
            stopTime,
            startFlowRate,
            stopFlowRate,
            timeElapsed: timeElapsed || null,
            sampleVolume: samplingVolume ? Number(samplingVolume.toFixed(2)) : null,
            samplingVolume: samplingVolume ? Number(samplingVolume.toFixed(2)) : null
        });
        saveCurrentProject();
        renderProject();
    });

    const sampleTypeSelect = modal.querySelector('#new-sample-type');
    const sampleIdInput = modal.querySelector('#new-sample-id');
    sampleTypeSelect?.addEventListener('change', () => {
        if (!sampleIdInput) return;
        if (!sampleIdInput.value.trim() || isAutoAirSampleId(sampleIdInput.value.trim())) {
            sampleIdInput.value = getNextAirSampleId(sampleTypeSelect.value);
        }
    });
}

function openEditAirSampleModal(sampleId) {
    const sample = currentProject.airSamples?.find(s => s.id === sampleId);
    if (!sample) return;
    
    const containmentOptions = (currentProject.containments || []).map(c => 
        `<option value="${c.id}" ${c.id === sample.containmentId ? 'selected' : ''}>${escapeHtml(getContainmentDisplayName(c.name))}</option>`
    ).join('');

    const hasSetAlready = !!sample.sampleSetId;
    const otherSamples = (currentProject.airSamples || []).filter(s => {
        if (s.id === sampleId) return false;
        if (!s.sampleSetId) return true;
        if (hasSetAlready && s.sampleSetId === sample.sampleSetId) return true;
        return false;
    });
    const sampleSetPickerRows = otherSamples.sort((a, b) => (a.sampleId || '').localeCompare(b.sampleId || '')).map(s => {
        const inSet = hasSetAlready && s.sampleSetId === sample.sampleSetId;
        const cbId = `sample-set-cb-${s.id}`;
        return `<div class="sample-set-row modal-selection-option" data-sample-id="${s.id}">
            ${buildModalCheckboxRow(
                cbId,
                'sample-set-cb',
                `value="${escapeHtml(s.id)}" ${inSet ? 'checked' : ''}`,
                `<span class="modal-check-title">${escapeHtml(s.sampleId || s.id)}</span><span class="modal-check-subtitle">${escapeHtml(s.type || 'Area')}</span>`
            )}
            <input type="text" class="sample-set-location border rounded ${inSet ? '' : 'hidden'}" data-sample-id="${s.id}" value="${escapeHtml(s.location || '')}" placeholder="Location / Comments" style="padding:0.3rem 0.5rem; font-size:0.875rem;">
        </div>`;
    }).join('');
    
    const hasSampleSetPanel = otherSamples.length > 0;
    // Form column constraints apply only while the set panel is visible (toggled on).
    // When the panel is hidden, the form fills the modal width.
    const formColExpandedCss = 'flex: 0 0 390px; max-width: none;';
    const formColStyle = (hasSampleSetPanel && hasSetAlready)
        ? `${formColExpandedCss} min-width: 0; display: flex; flex-direction: column; gap: 0.35rem;`
        : 'flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.35rem;';

    const modal = createModal('Edit Air Sample', `
        <div id="edit-air-sample-layout" style="display: flex; gap: 1rem; align-items: flex-start; min-width:0;">
            <div id="edit-air-sample-form-col" style="${formColStyle}">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem 0.75rem;">
                    <div>
                        <label class="block text-xs font-medium text-gray-700" style="margin-bottom:2px;">Sample ID</label>
                        <input type="text" id="edit-sample-id" class="w-full border rounded" style="padding:0.3rem 0.5rem; font-size:0.875rem;" value="${escapeHtml(sample.sampleId || '')}">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-700" style="margin-bottom:2px;">Sample Type</label>
                        <select id="edit-sample-type" class="w-full border rounded bg-white" style="padding:0.3rem 0.5rem; font-size:0.875rem;">
                            <option value="Area" ${sample.type !== 'Personal' && sample.type !== 'Clearance' ? 'selected' : ''}>Area</option>
                            <option value="Personal" ${sample.type === 'Personal' ? 'selected' : ''}>Personal</option>
                            <option value="Clearance" ${sample.type === 'Clearance' ? 'selected' : ''}>Clearance</option>
                        </select>
                    </div>
                </div>
                
                <div>
                    <label class="block text-xs font-medium text-gray-700" style="margin-bottom:2px;">Location / Comments</label>
                    <input type="text" id="edit-sample-location" class="w-full border rounded" style="padding:0.3rem 0.5rem; font-size:0.875rem;" value="${escapeHtml(sample.location || '')}">
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem 0.75rem;">
                    <div>
                        <label class="block text-xs font-medium text-gray-700" style="margin-bottom:2px;">Containment (optional)</label>
                        <select id="edit-sample-containment" class="w-full border rounded bg-white" style="padding:0.3rem 0.5rem; font-size:0.875rem;">
                            <option value="">-- None --</option>
                            ${containmentOptions}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-700" style="margin-bottom:2px;">Date Sampled</label>
                        <input type="date" id="edit-sample-date" class="w-full border rounded" style="padding:0.3rem 0.5rem; font-size:0.875rem;" value="${sample.date || ''}">
                    </div>
                </div>
                
                <div style="border-top: 1px solid #e5e7eb; padding-top: 0.35rem; margin-top: 0.15rem;">
                    <h4 style="font-size:0.85rem; font-weight:600; color:#1f2937; margin-bottom:0.25rem;">Sampling Times & Flow Rates</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem 0.75rem;">
                        <div>
                            <label class="block text-xs font-medium text-gray-700" style="margin-bottom:2px;">Start Time</label>
                            <input type="time" id="edit-sample-start-time" class="w-full border rounded" style="padding:0.3rem 0.5rem; font-size:0.875rem;" value="${sample.startTime || ''}" onchange="updateSampleCalc('edit')">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-700" style="margin-bottom:2px;">Start Flow Rate (L/min)</label>
                            <input type="number" id="edit-sample-start-flow" class="w-full border rounded" style="padding:0.3rem 0.5rem; font-size:0.875rem;" value="${sample.startFlowRate || ''}" step="0.1" onchange="updateSampleCalc('edit')">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-700" style="margin-bottom:2px;">Stop Time</label>
                            <input type="time" id="edit-sample-stop-time" class="w-full border rounded" style="padding:0.3rem 0.5rem; font-size:0.875rem;" value="${sample.stopTime || ''}" onchange="updateSampleCalc('edit')">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-700" style="margin-bottom:2px;">Stop Flow Rate (L/min)</label>
                            <input type="number" id="edit-sample-stop-flow" class="w-full border rounded" style="padding:0.3rem 0.5rem; font-size:0.875rem;" value="${sample.stopFlowRate || ''}" step="0.1" onchange="updateSampleCalc('edit')">
                        </div>
                    </div>
                    
                    <div id="edit-sample-calc-preview" class="bg-indigo-50 rounded ${sample.startTime && sample.stopTime ? '' : 'hidden'}" style="margin-top:0.3rem; padding:0.3rem 0.5rem;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.25rem; font-size:0.8rem;">
                            <div>
                                <span class="text-indigo-600 font-medium">Elapsed:</span>
                                <span id="edit-sample-time-elapsed" class="text-indigo-800 font-bold ml-1">--</span>
                            </div>
                            <div>
                                <span class="text-indigo-600 font-medium">Volume:</span>
                                <span id="edit-sample-volume" class="text-indigo-800 font-bold ml-1">--</span>
                            </div>
                            <div>
                                <span class="text-indigo-600 font-medium">Avg Flow:</span>
                                <span id="edit-sample-avg-flow" class="text-indigo-800 font-bold ml-1">--</span>
                            </div>
                        </div>
                    </div>
                </div>

                ${otherSamples.length > 0 ? `
                <div style="border-top: 1px solid #e5e7eb; padding-top: 0.3rem; margin-top: 0.15rem;">
                    ${buildModalCheckboxRow(
                        'edit-sample-set-toggle',
                        '',
                        hasSetAlready ? 'checked' : '',
                        '<span class="modal-check-title" style="font-size:0.8rem;">Apply to Sample Set</span><span class="modal-check-subtitle" style="font-size:0.7rem;">Sync date, times, and flow rates to selected samples.</span>'
                    )}
                </div>
                ` : ''}
            </div>

            ${otherSamples.length > 0 ? `
            <div id="edit-sample-set-panel" class="${hasSetAlready ? '' : 'hidden is-collapsed'}" style="flex: 1 1 440px; min-width: 380px; border-left: 1px solid #e5e7eb; padding-left: 1rem;">
                <h4 style="font-size:0.85rem; font-weight:600; color:#1f2937; margin-bottom:0.35rem;">Sample Set</h4>
                <div id="edit-sample-set-picker" class="modal-selection-box max-h-80 overflow-y-auto">
                    ${sampleSetPickerRows}
                </div>
            </div>
            ` : ''}
        </div>
    `, () => {
        const sampleIdVal = document.getElementById('edit-sample-id').value.trim();
        if (!sampleIdVal) {
            alert('Please enter a sample ID');
            return false;
        }
        
        sample.sampleId = sampleIdVal;
        sample.type = document.getElementById('edit-sample-type').value;
        sample.location = document.getElementById('edit-sample-location').value.trim();
        const containmentIdVal = document.getElementById('edit-sample-containment').value;
        sample.containmentId = containmentIdVal;
        const containment = containmentIdVal ? currentProject.containments?.find(c => c.id === containmentIdVal) : null;
        sample.containmentName = containment?.name || '';
        sample.date = document.getElementById('edit-sample-date').value;
        sample.startTime = document.getElementById('edit-sample-start-time').value;
        sample.stopTime = document.getElementById('edit-sample-stop-time').value;
        sample.startFlowRate = parseFloat(document.getElementById('edit-sample-start-flow').value) || null;
        sample.stopFlowRate = parseFloat(document.getElementById('edit-sample-stop-flow').value) || null;
        const editTimeElapsed = calculateTimeElapsed(sample.startTime, sample.stopTime);
        const editSamplingVolume = calculateSamplingVolume(sample.startFlowRate, sample.stopFlowRate, editTimeElapsed);
        sample.timeElapsed = editTimeElapsed || null;
        sample.sampleVolume = editSamplingVolume ? Number(editSamplingVolume.toFixed(2)) : null;
        sample.samplingVolume = editSamplingVolume ? Number(editSamplingVolume.toFixed(2)) : null;

        const setToggle = document.getElementById('edit-sample-set-toggle');
        if (setToggle && setToggle.checked) {
            const checkedIds = Array.from(document.querySelectorAll('.sample-set-cb:checked')).map(cb => cb.value);
            if (checkedIds.length > 0) {
                const setId = sample.sampleSetId || ('set_' + generateId());
                sample.sampleSetId = setId;
                const syncFields = {
                    date: sample.date,
                    startTime: sample.startTime,
                    stopTime: sample.stopTime,
                    startFlowRate: sample.startFlowRate,
                    stopFlowRate: sample.stopFlowRate,
                    timeElapsed: sample.timeElapsed,
                    sampleVolume: sample.sampleVolume,
                    samplingVolume: sample.samplingVolume
                };
                checkedIds.forEach(id => {
                    const linked = currentProject.airSamples.find(s => s.id === id);
                    if (linked) {
                        linked.sampleSetId = setId;
                        Object.assign(linked, syncFields);
                        const locInput = document.querySelector(`.sample-set-location[data-sample-id="${id}"]`);
                        if (locInput) linked.location = locInput.value.trim();
                    }
                });
                (currentProject.airSamples || []).forEach(s => {
                    if (s.sampleSetId === setId && s.id !== sample.id && !checkedIds.includes(s.id)) {
                        delete s.sampleSetId;
                    }
                });
            } else {
                delete sample.sampleSetId;
            }
        } else if (setToggle) {
            const oldSetId = sample.sampleSetId;
            delete sample.sampleSetId;
            if (oldSetId) {
                const remaining = (currentProject.airSamples || []).filter(s => s.sampleSetId === oldSetId);
                if (remaining.length < 2) {
                    remaining.forEach(s => { delete s.sampleSetId; });
                }
            }
        }
        
        saveCurrentProject();
        renderProject();
    });

    modal.querySelector('.modal-content')?.classList.add('air-sample-edit-modal');
    const editSampleTypeSelect = modal.querySelector('#edit-sample-type');
    const editSampleIdInput = modal.querySelector('#edit-sample-id');
    editSampleTypeSelect?.addEventListener('change', () => {
        if (!editSampleIdInput) return;
        const currentValue = editSampleIdInput.value.trim();
        if (!currentValue || isAutoAirSampleId(currentValue)) {
            editSampleIdInput.value = getNextAirSampleId(editSampleTypeSelect.value, sample.sampleId || '');
        }
    });

    setTimeout(() => {
        updateSampleCalc('edit');

        const modalContentEl = modal.querySelector('.modal-content');
        if (modalContentEl) {
            modalContentEl.style.padding = '0';
            const titleEl = modalContentEl.querySelector('h3');
            if (titleEl) { titleEl.style.marginBottom = '0'; titleEl.style.fontSize = '1.05rem'; }
            const footerEl = modalContentEl.querySelector('.modal-footer');
            if (footerEl) { footerEl.style.marginTop = '0'; footerEl.style.paddingTop = '0'; }
            modalContentEl.querySelectorAll('input, select').forEach(el => {
                el.style.paddingLeft = '0.5rem';
                el.style.paddingRight = '0.5rem';
            });
        }

        // Show/hide per-row Location/Comments input alongside each sample-set checkbox.
        // Width = 70% of main Location input, then +20% (i.e. 84%). Inputs sit right next to
        // each sample's name/type pair (no auto-right alignment) so they hug the label.
        const sizeSetLocationInputs = () => {
            document.querySelectorAll('.sample-set-location').forEach(inp => {
                inp.style.width = 'auto';
                inp.style.flex = '1 1 auto';
                inp.style.marginLeft = '0';
            });
        };
        sizeSetLocationInputs();
        document.querySelectorAll('.sample-set-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                const row = cb.closest('.sample-set-row');
                const loc = row?.querySelector('.sample-set-location');
                if (loc) {
                    loc.classList.toggle('hidden', !cb.checked);
                    if (cb.checked) {
                        sizeSetLocationInputs();
                        loc.focus();
                    }
                }
            });
        });

        const toggle = document.getElementById('edit-sample-set-toggle');
        const panel = document.getElementById('edit-sample-set-panel');
        const formCol = document.getElementById('edit-air-sample-form-col');
        if (toggle && panel) {
            const mcEl = modalContentEl || panel.closest('.modal-content');
            const applyFormColLayout = (expanded) => {
                if (!formCol) return;
                if (expanded) {
                    formCol.style.flex = '0 0 390px';
                    formCol.style.maxWidth = 'none';
                } else {
                    formCol.style.flex = '1';
                    formCol.style.maxWidth = 'none';
                }
            };
            const applyWidth = (expanded) => {
                if (mcEl) {
                    mcEl.style.width = expanded ? 'calc(100vw - 48px)' : '100%';
                    mcEl.style.maxWidth = expanded ? '940px' : '600px';
                    mcEl.style.transition = 'max-width 0.2s ease';
                }
                applyFormColLayout(expanded);
                requestAnimationFrame(sizeSetLocationInputs);
            };
            if (panel) panel.classList.toggle('is-collapsed', !hasSetAlready);
            applyWidth(hasSetAlready);
            toggle.addEventListener('change', () => {
                const show = toggle.checked;
                panel.classList.toggle('hidden', !show);
                panel.classList.toggle('is-collapsed', !show);
                applyWidth(show);
            });
        }
    }, 100);
}

function deleteAirSample(sampleId) {
    if (!confirm('Delete this air sample? This cannot be undone.')) return;
    currentProject.airSamples = currentProject.airSamples.filter(s => s.id !== sampleId);
    saveCurrentProject();
    renderProject();
}

// ============================================
// OVERVIEW CARD
// ============================================

function getStageClass(stage) {
    const stageClasses = {
        'Containment Preparation': 'stage-preparation',
        'Active Abatement': 'stage-active',
        'Containment Clearance': 'stage-clearance',
        'Containment Teardown': 'stage-teardown',
        'Abatement Completed': 'stage-completed'
    };
    if (stageClasses[stage]) return stageClasses[stage];
    // Fallback for old abbreviated names
    const s = (stage || 'Preparation').toLowerCase();
    if (s.includes('preparation')) return 'stage-preparation';
    if (s.includes('active')) return 'stage-active';
    if (s.includes('clearance')) return 'stage-clearance';
    if (s.includes('teardown')) return 'stage-teardown';
    if (s.includes('completed')) return 'stage-completed';
    return 'stage-preparation';
}

// Normalize old abbreviated stage names to full names
function normalizeStage(stage) {
    const map = {
        'Preparation': STAGE_CONTAINMENT_PREPARATION,
        'Active': STAGE_ACTIVE_ABATEMENT,
        'Clearance': STAGE_CONTAINMENT_CLEARANCE,
        'Teardown': STAGE_CONTAINMENT_TEARDOWN,
        'Completed': STAGE_ABATEMENT_COMPLETED
    };
    return map[stage] || stage || STAGE_CONTAINMENT_PREPARATION;
}

function renderOverviewCard() {
    _shellRefresh();
    const overviewText = document.getElementById('oversight-project-overview');
    if (overviewText) {
        const siteName = currentProject.siteName || currentProject.name || '';
        const addr = currentProject.siteAddress || '';
        overviewText.textContent = siteName ? `${siteName}${addr ? ' — ' + addr : ''}` : (addr || 'No site details');
    }
    
    // Active Containments column
    const containmentsCol = document.getElementById('overview-containments-col');
    const containmentsList = document.getElementById('overview-containments-list');
    if (containmentsCol && containmentsList) {
        const activeContainments = (currentProject.containments || []).filter(c => {
            const stage = normalizeStage(c.stage);
            return ACTIVE_CONTAINMENT_STAGES.includes(stage);
        });
        
        if (activeContainments.length > 0) {
            containmentsCol.classList.remove('hidden');
            containmentsList.innerHTML = activeContainments.map(c => `
                <div class="overview-item">
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex-1 min-w-0">
                            <div class="overview-item-name">${escapeHtml(getContainmentDisplayName(c.name))}</div>
                            <div class="overview-item-detail">${escapeHtml(c.buildingName || '')}</div>
                            <span class="overview-item-stage ${getStageClass(normalizeStage(c.stage))}">${normalizeStage(c.stage)}</span>
                        </div>
                        <button class="btn btn-secondary btn-sm text-xs flex-shrink-0" style="padding: 0.25rem 0.5rem; min-height: auto; font-size: 0.6875rem;" onclick="openEditContainmentModal('${c.id}')">Edit Stage</button>
                    </div>
                </div>
            `).join('');
        } else {
            containmentsCol.classList.add('hidden');
        }
    }
    
    // Active Sample Collection column
    const airCol = document.getElementById('overview-airmonitoring-col');
    const airList = document.getElementById('overview-airmonitoring-list');
    if (airCol && airList) {
        const collectingSamples = (currentProject.airSamples || []).filter(s => s.startTime && !s.stopTime);
        
        if (collectingSamples.length > 0) {
            airCol.classList.remove('hidden');
            airList.innerHTML = collectingSamples.map(s => `
                <div class="overview-item">
                    <div class="flex items-start justify-between gap-2">
                        <div class="flex-1 min-w-0">
                            <div class="overview-item-name">${escapeHtml(s.sampleId || s.id)}</div>
                            <div class="overview-item-detail">${escapeHtml(s.type || 'Area')} · Started ${s.startTime || '--:--'}</div>
                        </div>
                        <button class="btn btn-secondary btn-sm text-xs flex-shrink-0" style="padding: 0.25rem 0.5rem; min-height: auto; font-size: 0.6875rem;" onclick="openEditAirSampleModal('${s.id}')">Edit Sample</button>
                    </div>
                </div>
            `).join('');
        } else {
            airCol.classList.add('hidden');
        }
    }
    
    // Update column layout
    const columnsEl = document.getElementById('overview-columns');
    if (columnsEl) {
        const visibleCols = columnsEl.querySelectorAll('.overview-column:not(.hidden)');
        if (visibleCols.length === 1) {
            columnsEl.classList.add('single-column');
        } else {
            columnsEl.classList.remove('single-column');
        }
    }
}

// ============================================
// SUBVIEW NAVIGATION
// ============================================

function navigateToSubview(view) {
    // The redesigned shell uses tabs instead of subviews. Map the legacy
    // names so existing call sites continue to work.
    currentSubview = view;
    const tabMap = { workerRoster: 'team', dailyLog: 'logs' };
    const tab = view ? (tabMap[view] || 'overview') : 'overview';
    if (window.OverShell && typeof window.OverShell.switchTab === 'function') {
        window.OverShell.switchTab(tab);
    }
}

// ============================================
// WORKER ROSTER
// ============================================

function isDateExpired(dateStr) {
    if (!dateStr) return false;
    // Compare dates in local timezone
    const date = new Date(dateStr + 'T23:59:59');
    return date < new Date();
}

function formatDateText(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

/** Ensure roster rows match Worker Roster Template.docx fields (legacy imports). */
function normalizeWorkerRoster(workers) {
    return (workers || []).map(w => {
        const copy = { ...w };
        if (!copy.certificationType) {
            copy.certificationType = (copy.role && /supervisor/i.test(copy.role)) ? 'S' : 'W';
        }
        if (!copy.aheraExpiration && copy.certificationExpiration) {
            copy.aheraExpiration = copy.certificationExpiration;
        }
        if (!Array.isArray(copy.respiratorTypes)) {
            copy.respiratorTypes = copy.respiratorTypes ? [].concat(copy.respiratorTypes) : [];
        }
        return copy;
    });
}

function renderWorkerRosterView(project) {
    _shellRefresh();
    const workerRosterView = document.getElementById('worker-roster-view');
    if (!workerRosterView) return;

    const workers = project.workerRoster || [];
    const workerCards = workers.length
        ? workers.map(worker => {
            const expiredLabels = [];
            if (isDateExpired(worker.aheraExpiration)) expiredLabels.push('AHERA');
            if (isDateExpired(worker.medicalExpiration)) expiredLabels.push('Medical');
            if (isDateExpired(worker.respiratorFitExpiration)) expiredLabels.push('Respirator Fit');
            if (isDateExpired(worker.leadExpiration)) expiredLabels.push('Lead');
            if (isDateExpired(worker.leadMedExpiration)) expiredLabels.push('Lead Med');
            const respirators = (worker.respiratorTypes || []).join(', ') || 'N/A';
            const hasExpired = expiredLabels.length > 0;
            const certType = worker.certificationType === 'S' ? 'Supervisor' : 'Worker';
            const certBadgeClass = worker.certificationType === 'S'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-blue-100 text-blue-700';
            return `
                <div class="list-item-card hover-reveal-card ${hasExpired ? 'border-red-200 bg-red-50/50' : ''}">
                    <div class="flex items-start justify-between gap-4">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                                <h4 class="font-semibold text-gray-900 ${hasExpired ? 'text-red-900' : ''}">${escapeHtml(worker.name)}</h4>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${certBadgeClass}">${certType}</span>
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm text-gray-600 mt-2">
                                <div>
                                    <span class="text-gray-400">AHERA:</span>
                                    <span class="${isDateExpired(worker.aheraExpiration) ? 'text-red-600 font-medium' : ''}">${formatDateText(worker.aheraExpiration)}</span>
                                </div>
                                <div>
                                    <span class="text-gray-400">Medical:</span>
                                    <span class="${isDateExpired(worker.medicalExpiration) ? 'text-red-600 font-medium' : ''}">${formatDateText(worker.medicalExpiration)}</span>
                                </div>
                                <div>
                                    <span class="text-gray-400">Respirator Fit:</span>
                                    <span class="${isDateExpired(worker.respiratorFitExpiration) ? 'text-red-600 font-medium' : ''}">${formatDateText(worker.respiratorFitExpiration)}</span>
                                </div>
                                <div>
                                    <span class="text-gray-400">Lead:</span>
                                    <span class="${isDateExpired(worker.leadExpiration) ? 'text-red-600 font-medium' : ''}">${formatDateText(worker.leadExpiration)}</span>
                                </div>
                                <div>
                                    <span class="text-gray-400">Lead Med:</span>
                                    <span class="${isDateExpired(worker.leadMedExpiration) ? 'text-red-600 font-medium' : ''}">${formatDateText(worker.leadMedExpiration)}</span>
                                </div>
                            </div>
                            <p class="text-sm text-gray-500 mt-2">
                                <span class="text-gray-400">Respirator:</span> ${escapeHtml(respirators)}
                            </p>
                            ${hasExpired ? `<p class="text-xs text-red-600 mt-1.5">Expired: ${expiredLabels.join(', ')}</p>` : ''}
                        </div>
                        <div class="action-buttons flex gap-2 flex-shrink-0">
                            <button type="button" class="edit-worker-btn btn btn-secondary btn-sm" data-worker-id="${worker.id}">Edit</button>
                            <button type="button" class="delete-worker-btn btn btn-danger btn-sm" data-worker-id="${worker.id}">Delete</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('')
        : '<div class="text-center py-8 text-gray-500"><p>No workers have been added to this project yet.</p><p class="text-sm mt-1">Use the form above to add your first worker.</p></div>';

    workerRosterView.innerHTML = `
        <div class="card rounded-2xl">
            <div class="section-header flex justify-between items-center" style="background: transparent;">
                <div>
                    <h2 class="text-2xl font-semibold text-gray-900">Worker Roster</h2>
                    <p class="text-sm text-gray-600 mt-1">Manage workers for ${escapeHtml(project.projectNumber || 'this project')}</p>
                </div>
                <button class="btn btn-secondary btn-sm" id="worker-roster-back-btn">← Back to Project</button>
            </div>
            <div class="section-content space-y-6">
                <div class="bg-gray-50 rounded-xl p-6">
                    <h3 class="font-semibold text-lg text-gray-900 mb-4">Add New Worker</h3>
                    <form id="worker-roster-form" class="space-y-5">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label for="worker-name" class="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                                <input type="text" id="worker-name" placeholder="Enter worker's full name" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" required>
                            </div>
                            <div>
                                <label for="worker-type" class="block text-sm font-medium text-gray-700 mb-1.5">AHERA Certification Type</label>
                                <select id="worker-type" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" required>
                                    <option value="W">Worker (W)</option>
                                    <option value="S">Supervisor (S)</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Expiration Dates</label>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label for="worker-ahera-exp" class="block text-xs text-gray-500 mb-1">AHERA</label>
                                    <input type="date" id="worker-ahera-exp" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" required>
                                </div>
                                <div>
                                    <label for="worker-medical-exp" class="block text-xs text-gray-500 mb-1">Medical</label>
                                    <input type="date" id="worker-medical-exp" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" required>
                                </div>
                                <div>
                                    <label for="worker-respirator-exp" class="block text-xs text-gray-500 mb-1">Respirator Fit Test</label>
                                    <input type="date" id="worker-respirator-exp" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" required>
                                </div>
                                <div>
                                    <label for="worker-lead-exp" class="block text-xs text-gray-500 mb-1">Lead Training Expires</label>
                                    <input type="date" id="worker-lead-exp" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors">
                                </div>
                                <div>
                                    <label for="worker-lead-med-exp" class="block text-xs text-gray-500 mb-1">Lead Medical Expires</label>
                                    <input type="date" id="worker-lead-med-exp" class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors">
                                </div>
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Respirator Type</label>
                            <div class="flex flex-wrap gap-4">
                                ${respiratorOptions.map(option => `
                                    <label class="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900 transition-colors">
                                        <input type="checkbox" value="${option}" class="respirator-type-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer">
                                        <span>${option}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>

                        <div class="pt-2">
                            <button type="submit" class="btn btn-primary">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                                Add Worker
                            </button>
                        </div>
                    </form>
                </div>

                <div>
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-900">${workers.length > 0 ? `Workers (${workers.length})` : 'Workers'}</h3>
                    </div>
                    <div id="worker-roster-list" class="space-y-3">${workerCards}</div>
                </div>
            </div>
        </div>
    `;

    // Back button
    workerRosterView.querySelector('#worker-roster-back-btn')?.addEventListener('click', () => navigateToSubview(null));

    // Add worker form
    const rosterForm = workerRosterView.querySelector('#worker-roster-form');
    rosterForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = rosterForm.querySelector('#worker-name').value.trim();
        const type = rosterForm.querySelector('#worker-type').value;
        const aheraExp = rosterForm.querySelector('#worker-ahera-exp').value;
        const medicalExp = rosterForm.querySelector('#worker-medical-exp').value;
        const respiratorExp = rosterForm.querySelector('#worker-respirator-exp').value;
        const leadExp = rosterForm.querySelector('#worker-lead-exp').value;
        const leadMedExp = rosterForm.querySelector('#worker-lead-med-exp').value;
        const respiratorSelections = Array.from(rosterForm.querySelectorAll('.respirator-type-checkbox:checked')).map(cb => cb.value);
        if (!name) {
            showNotification('Enter a worker name.', true);
            return;
        }
        if (!respiratorSelections.length) {
            showNotification('Select at least one respirator type.', true);
            return;
        }

        const newWorker = {
            id: generateId(),
            name,
            certificationType: type,
            aheraExpiration: aheraExp,
            medicalExpiration: medicalExp,
            respiratorFitExpiration: respiratorExp,
            leadExpiration: leadExp,
            leadMedExpiration: leadMedExp,
            respiratorTypes: respiratorSelections,
            createdAt: Date.now()
        };

        if (!currentProject.workerRoster) currentProject.workerRoster = [];
        currentProject.workerRoster.push(newWorker);
        saveCurrentProject();
        showNotification('Worker added.');
        renderWorkerRosterView(currentProject);
    });

    // Delete worker buttons
    workerRosterView.querySelectorAll('.delete-worker-btn').forEach(button => {
        button.addEventListener('click', () => {
            const workerId = button.dataset.workerId;
            if (!workerId) return;
            const worker = workers.find(w => w.id === workerId);
            if (!confirm(`Remove ${worker?.name || 'this worker'}?`)) return;
            currentProject.workerRoster = (currentProject.workerRoster || []).filter(w => w.id !== workerId);
            saveCurrentProject();
            showNotification('Worker removed.');
            renderWorkerRosterView(currentProject);
        });
    });

    // Edit worker buttons
    workerRosterView.querySelectorAll('.edit-worker-btn').forEach(button => {
        button.addEventListener('click', () => {
            const workerId = button.dataset.workerId;
            if (!workerId) return;
            const worker = workers.find(w => w.id === workerId);
            if (worker) openEditWorkerModal(worker);
        });
    });
}

function openEditWorkerModal(worker) {
    const modal = document.createElement('div');
    modal.className = 'modal active';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <h3>Edit Worker</h3>
            <form id="edit-worker-form" class="space-y-4">
                <p class="text-sm text-gray-600" style="margin-top:0;">Update information for ${escapeHtml(worker.name)}</p>
                <div>
                    <label for="edit-worker-name" class="block text-sm font-medium text-gray-700 mb-1">Worker Name</label>
                    <input type="text" id="edit-worker-name" class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500" value="${escapeHtml(worker.name)}" required>
                </div>
                <div>
                    <label for="edit-worker-type" class="block text-sm font-medium text-gray-700 mb-1">AHERA Certification Type</label>
                    <select id="edit-worker-type" class="w-full border border-gray-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-indigo-500" required>
                        <option value="W" ${worker.certificationType === 'W' ? 'selected' : ''}>Worker (W)</option>
                        <option value="S" ${worker.certificationType === 'S' ? 'selected' : ''}>Supervisor (S)</option>
                    </select>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label for="edit-worker-ahera-exp" class="block text-sm font-medium text-gray-700 mb-1">AHERA Training</label>
                        <input type="date" id="edit-worker-ahera-exp" class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500" value="${worker.aheraExpiration || ''}" required>
                    </div>
                    <div>
                        <label for="edit-worker-medical-exp" class="block text-sm font-medium text-gray-700 mb-1">Asbestos Medical</label>
                        <input type="date" id="edit-worker-medical-exp" class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500" value="${worker.medicalExpiration || ''}" required>
                    </div>
                    <div>
                        <label for="edit-worker-respirator-exp" class="block text-sm font-medium text-gray-700 mb-1">Respirator Fit Test</label>
                        <input type="date" id="edit-worker-respirator-exp" class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500" value="${worker.respiratorFitExpiration || ''}" required>
                    </div>
                    <div>
                        <label for="edit-worker-lead-exp" class="block text-sm font-medium text-gray-700 mb-1">Lead Training</label>
                        <input type="date" id="edit-worker-lead-exp" class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500" value="${worker.leadExpiration || ''}">
                    </div>
                    <div>
                        <label for="edit-worker-lead-med-exp" class="block text-sm font-medium text-gray-700 mb-1">Lead Medical</label>
                        <input type="date" id="edit-worker-lead-med-exp" class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500" value="${worker.leadMedExpiration || ''}">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Respirator Type</label>
                    <div class="modal-check-group">
                        ${respiratorOptions.map(option => {
                            const rid = `edit-resp-${option.replace(/[^a-zA-Z0-9]+/g, '-')}`;
                            return buildModalCheckboxRow(
                                rid,
                                'edit-respirator-type-checkbox',
                                `value="${escapeHtml(option)}" ${worker.respiratorTypes?.includes(option) ? 'checked' : ''}`,
                                escapeHtml(option)
                            );
                        }).join('')}
                    </div>
                </div>
            </form>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary modal-cancel-btn" id="edit-worker-cancel-btn">Cancel</button>
                <button type="submit" form="edit-worker-form" class="btn btn-primary modal-save-btn">Save Changes</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    
    // Track mouse down position to prevent closing when dragging from inside modal
    let mouseDownOnBackdrop = false;
    
    modal.addEventListener('mousedown', (e) => {
        mouseDownOnBackdrop = (e.target === modal);
    });
    
    modal.addEventListener('click', (event) => {
        if (event.target === modal && mouseDownOnBackdrop) {
            closeModal();
        }
        mouseDownOnBackdrop = false;
    });
    modal.querySelector('#edit-worker-cancel-btn')?.addEventListener('click', closeModal);

    modal.querySelector('#edit-worker-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = modal.querySelector('#edit-worker-name').value.trim();
        const type = modal.querySelector('#edit-worker-type').value;
        const aheraExp = modal.querySelector('#edit-worker-ahera-exp').value;
        const medicalExp = modal.querySelector('#edit-worker-medical-exp').value;
        const respiratorExp = modal.querySelector('#edit-worker-respirator-exp').value;
        const leadExp = modal.querySelector('#edit-worker-lead-exp').value;
        const leadMedExp = modal.querySelector('#edit-worker-lead-med-exp').value;
        const respiratorSelections = Array.from(modal.querySelectorAll('.edit-respirator-type-checkbox:checked')).map(cb => cb.value);

        if (!name) { showNotification('Enter a worker name.', true); return; }
        if (!respiratorSelections.length) { showNotification('Select at least one respirator type.', true); return; }

        const updatedWorker = {
            ...worker,
            name,
            certificationType: type,
            aheraExpiration: aheraExp,
            medicalExpiration: medicalExp,
            respiratorFitExpiration: respiratorExp,
            leadExpiration: leadExp,
            leadMedExpiration: leadMedExp,
            respiratorTypes: respiratorSelections,
            updatedAt: Date.now()
        };

        currentProject.workerRoster = (currentProject.workerRoster || []).map(w => w.id === worker.id ? updatedWorker : w);
        saveCurrentProject();
        showNotification('Worker updated.');
        closeModal();
        renderWorkerRosterView(currentProject);
    });
}

// ============================================
// DAILY LOG SYSTEM
// ============================================

function getTodayLocal() {
    const now = new Date();
    // Use local timezone instead of UTC to get correct date
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getTomorrowLocal() {
    const now = new Date();
    now.setDate(now.getDate() + 1);
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function renderDailyLogWorkerCheckboxList(workerRoster, selectedIds) {
    const selected = new Set(selectedIds || []);
    if (!workerRoster.length) {
        return '<p class="text-sm text-gray-500">No workers in the roster. Add workers on the Workers tab, or set the onsite total below and assign names later via Header.</p>';
    }
    return workerRoster.map(worker => {
        const expiredItems = [];
        if (isDateExpired(worker.aheraExpiration)) expiredItems.push('AHERA');
        if (isDateExpired(worker.medicalExpiration)) expiredItems.push('Asbestos Med');
        if (isDateExpired(worker.respiratorFitExpiration)) expiredItems.push('Resp. Fit');
        if (isDateExpired(worker.leadExpiration)) expiredItems.push('Lead Trn');
        if (isDateExpired(worker.leadMedExpiration)) expiredItems.push('Lead Med');
        const expiredWarning = expiredItems.length > 0
            ? `<span class="text-red-600 text-xs font-medium ml-1">(Expired: ${expiredItems.join(', ')})</span>`
            : '';
        return buildModalSelectionOption(
            `daily-log-worker-${worker.id}`,
            'daily-log-worker-checkbox',
            worker.id,
            selected.has(worker.id),
            `${escapeHtml(worker.name)} (${worker.certificationType || 'W'})${expiredWarning}`
        );
    }).join('');
}

function openProjectDailyLogModal(logId) {
    if (!currentProject) {
        showNotification('Project data unavailable.', true);
        return;
    }

    const workerRoster = currentProject.workerRoster || [];
    const existingLog = logId ? (currentProject.dailyLogs || []).find(l => l.id === logId) : null;
    const isEdit = !!existingLog;
    const today = getTodayLocal();
    const selectedIds = (existingLog?.workers || []).map(w => w.id);
    const defaultTotal = existingLog?.workersTotal ?? (selectedIds.length || workerRoster.length || 0);

    const modal = document.createElement('div');
    modal.className = 'modal active';

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 640px;">
            <h3>${isEdit ? 'Edit Daily Log' : 'Create Daily Log'}</h3>
            <form id="daily-log-form" class="space-y-4">
                <p class="text-sm text-gray-600" style="margin-top:0;">Project: ${escapeHtml(currentProject.projectNumber || 'Oversight Project')}</p>
                ${isEdit ? '<p class="text-xs text-gray-500">Selected workers should match the onsite total.</p>' : '<p class="text-xs text-gray-500">You may set the onsite total first and assign workers later via Header.</p>'}
                <div>
                    <label for="daily-log-date" class="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input type="date" id="daily-log-date" class="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500" value="${existingLog?.date || today}" required>
                </div>
                <div>
                    <label for="daily-log-inspector" class="block text-sm font-medium text-gray-700 mb-1">Inspector Name</label>
                    <input type="text" id="daily-log-inspector" class="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500" placeholder="Enter inspector name" value="${escapeHtml(existingLog?.inspectorName || (typeof getInspectorProfile === 'function' ? getInspectorProfile() : {}).name || '')}" required>
                </div>
                <div>
                    <label for="daily-log-workers-total" class="block text-sm font-medium text-gray-700 mb-1">Workers Onsite Total</label>
                    <input type="number" id="daily-log-workers-total" class="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500" min="0" value="${defaultTotal}" required>
                </div>
                <div>
                    <p class="block text-sm font-medium text-gray-700 mb-2">Workers on site (names)</p>
                    <div class="modal-selection-box max-h-48 overflow-y-auto">
                        ${renderDailyLogWorkerCheckboxList(workerRoster, selectedIds)}
                    </div>
                </div>
            </form>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary modal-cancel-btn" id="daily-log-cancel-btn">Cancel</button>
                <button type="submit" form="daily-log-form" class="btn btn-primary modal-save-btn">${isEdit ? 'Save Changes' : 'Create Daily Log'}</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    let mouseDownOnBackdrop = false;
    modal.addEventListener('mousedown', (e) => { mouseDownOnBackdrop = (e.target === modal); });
    modal.addEventListener('click', (event) => {
        if (event.target === modal && mouseDownOnBackdrop) closeModal();
        mouseDownOnBackdrop = false;
    });
    modal.querySelector('#daily-log-cancel-btn')?.addEventListener('click', closeModal);

    const workerCheckboxes = Array.from(modal.querySelectorAll('.daily-log-worker-checkbox'));
    const workersTotalInput = modal.querySelector('#daily-log-workers-total');
    workerCheckboxes.forEach(cb => cb.addEventListener('change', () => {
        const count = workerCheckboxes.filter(c => c.checked).length;
        if (count && document.activeElement !== workersTotalInput) {
            workersTotalInput.value = count;
        }
    }));

    modal.querySelector('#daily-log-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const dateValue = modal.querySelector('#daily-log-date').value;
        const inspectorName = modal.querySelector('#daily-log-inspector').value.trim();
        if (!dateValue) { showNotification('Select a date for the daily log.', true); return; }
        if (!inspectorName) { showNotification('Enter an inspector name.', true); return; }

        const selectedWorkerIds = workerCheckboxes.filter(cb => cb.checked).map(cb => cb.value);
        const workersTotal = parseInt(workersTotalInput.value, 10) || 0;
        const selectedCount = selectedWorkerIds.length;

        if (isEdit && workersTotal > 0 && selectedCount !== workersTotal) {
            showNotification(`Select exactly ${workersTotal} worker${workersTotal === 1 ? '' : 's'} to match the onsite total (${selectedCount} selected).`, true);
            return;
        }

        const workersOnsite = selectedWorkerIds.map(id => workerRoster.find(w => w.id === id)).filter(Boolean).map(w => ({
            id: w.id,
            name: w.name,
            certificationType: w.certificationType
        }));

        if (isEdit) {
            existingLog.date = dateValue;
            existingLog.inspectorName = inspectorName;
            existingLog.workers = workersOnsite;
            existingLog.workersTotal = workersTotal;
            saveCurrentProject();
            showNotification('Daily log updated.');
            closeModal();
            renderProject();
            return;
        }

        const activeContainmentNames = (currentProject.containments || [])
            .filter(c => ACTIVE_CONTAINMENT_STAGES.includes(normalizeStage(c.stage)))
            .map(c => c.name || 'Unnamed');

        const dailyLog = {
            id: generateId(),
            date: dateValue,
            inspectorName,
            workers: workersOnsite,
            workersTotal: workersTotal || workersOnsite.length,
            activeContainments: activeContainmentNames,
            entries: [],
            createdAt: Date.now()
        };

        if (!currentProject.dailyLogs) currentProject.dailyLogs = [];
        currentProject.dailyLogs.push(dailyLog);
        saveCurrentProject();
        if (workersTotal > 0 && selectedCount !== workersTotal) {
            showNotification('Daily log created. Use Header to assign worker names until the count matches the onsite total.');
        } else {
            showNotification('Daily log created.');
        }
        closeModal();
        navigateToSubview('dailyLog');
    });
}

function buildNegativePressureHtml(containments, readingsById) {
    if (!containments.length) return '';
    const readings = readingsById || {};
    return `
        <div class="notice-box notice-box--info" style="display:flex;flex-direction:column;gap:10px;">
            <div>
                <p style="margin:0;font-weight:600;color:var(--text);text-transform:none;letter-spacing:0;">Negative Pressure Readings (Optional)</p>
                <p style="margin:6px 0 0;">Record negative pressure in Inches of Water Column (inWC) for each containment in Active Abatement.</p>
            </div>
            ${containments.map(c => {
                const val = readings[c.id];
                const valueAttr = val !== undefined && val !== null && val !== '' ? ` value="${val}"` : '';
                return `
                <div class="np-row">
                    <label class="np-name">${escapeHtml(getContainmentDisplayName(c.name || 'Containment'))}</label>
                    <input type="number"
                        class="negative-pressure-input np-input"
                        data-containment-id="${c.id}"
                        data-containment-name="${escapeHtml(c.name || 'Containment')}"
                        step="0.0001"
                        max="0"
                        placeholder="-0.00"${valueAttr}>
                    <span class="np-unit">inWC</span>
                </div>`;
            }).join('')}
        </div>
    `;
}

async function preparePhotoFilesForUpload(files) {
    const out = [];
    for (const file of files) {
        let useFile = file;
        const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
        const isHeic = ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif';
        if (isHeic && window.electronAPI?.convertImageForUpload) {
            try {
                const buf = await file.arrayBuffer();
                const converted = await window.electronAPI.convertImageForUpload(Array.from(new Uint8Array(buf)), file.name);
                if (converted?.success && converted.base64) {
                    const mime = converted.mimeType || 'image/jpeg';
                    useFile = await fetch(`data:${mime};base64,${converted.base64}`).then(r => r.blob());
                } else {
                    showNotification(converted?.error || 'HEIC could not be converted; save as JPEG from Photos and retry.', true);
                    continue;
                }
            } catch {
                showNotification('HEIC could not be converted; save as JPEG from Photos and retry.', true);
                continue;
            }
        }
        out.push(useFile);
    }
    return out;
}

function bindLogPhotoPreviews(container, getFiles, setFiles) {
    const render = () => {
        const files = getFiles();
        container.innerHTML = files.map((f, i) => `
            <div class="relative inline-block">
                <img src="${URL.createObjectURL(f)}" class="log-photo-preview" alt="Preview">
                <button type="button" class="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs leading-none hover:bg-red-600" data-photo-index="${i}">&times;</button>
            </div>
        `).join('');
        container.querySelectorAll('[data-photo-index]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.photoIndex, 10);
                const next = getFiles().slice();
                next.splice(idx, 1);
                setFiles(next);
                render();
            });
        });
    };
    return render;
}

function openProjectDailyLogEntryModal(logId) {
    if (!currentProject) { showNotification('Project data unavailable.', true); return; }

    // Only Active Abatement stage requires negative pressure readings
    const STAGES_REQUIRING_PRESSURE = [STAGE_ACTIVE_ABATEMENT];

    const containmentsRequiringPressure = (currentProject.containments || []).filter(c => {
        const stage = normalizeStage(c.stage);
        return STAGES_REQUIRING_PRESSURE.includes(stage) && !c.regulatedArea;
    });

    const negativePressureHtml = buildNegativePressureHtml(containmentsRequiringPressure);

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <h3>Add Log Entry</h3>
            <form id="daily-log-entry-form" class="space-y-4">
                <p class="text-sm text-gray-600" style="margin-top:0;">Project: ${escapeHtml(currentProject.projectNumber || 'Oversight Project')}</p>
                <div>
                    <label for="daily-log-entry-hour" class="block text-sm font-medium text-gray-700 mb-1">Hour</label>
                    <input type="time" id="daily-log-entry-hour" class="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500" required>
                </div>
                ${negativePressureHtml}
                <div>
                    <label for="daily-log-entry-notes" class="block text-sm font-medium text-gray-700 mb-1">Entry Description</label>
                    <textarea id="daily-log-entry-notes" rows="3" class="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500" required></textarea>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Photos (max 5)</label>
                    <input type="file" id="daily-log-entry-photos" accept="image/*,.heic,.heif" multiple class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100">
                    <div id="daily-log-entry-photo-previews" class="mt-2 flex flex-wrap gap-2"></div>
                </div>
            </form>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary modal-cancel-btn" id="daily-log-entry-cancel">Cancel</button>
                <button type="submit" form="daily-log-entry-form" class="btn btn-primary modal-save-btn">Add Entry</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    
    // Track mouse down position to prevent closing when dragging from inside modal
    let mouseDownOnBackdrop = false;
    
    modal.addEventListener('mousedown', (e) => {
        mouseDownOnBackdrop = (e.target === modal);
    });
    
    modal.addEventListener('click', (event) => {
        if (event.target === modal && mouseDownOnBackdrop) {
            closeModal();
        }
        mouseDownOnBackdrop = false;
    });
    modal.querySelector('#daily-log-entry-cancel')?.addEventListener('click', closeModal);

    const MAX_PHOTOS = 5;
    let selectedPhotoFiles = [];

    const fileInput = modal.querySelector('#daily-log-entry-photos');
    const previewsEl = modal.querySelector('#daily-log-entry-photo-previews');
    const renderPhotoPreviews = bindLogPhotoPreviews(
        previewsEl,
        () => selectedPhotoFiles,
        (next) => { selectedPhotoFiles = next; }
    );

    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        const prepared = await preparePhotoFilesForUpload(files);
        selectedPhotoFiles = [...selectedPhotoFiles, ...prepared].slice(0, MAX_PHOTOS);
        fileInput.value = '';
        renderPhotoPreviews();
    });

    modal.querySelector('#daily-log-entry-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const hourValue = modal.querySelector('#daily-log-entry-hour').value;
        const notesValue = modal.querySelector('#daily-log-entry-notes').value.trim();
        if (!hourValue) { showNotification('Specify the hour of the log entry.', true); return; }
        if (!notesValue) { showNotification('Enter a description for the log entry.', true); return; }

        // Collect negative pressure readings
        const pressureInputs = modal.querySelectorAll('.negative-pressure-input');
        const negativePressureReadings = [];
        for (const input of pressureInputs) {
            const inputValue = input.value.trim();
            if (inputValue) {
                const value = parseFloat(inputValue);
                if (isNaN(value)) { showNotification(`Enter a valid negative pressure reading for ${input.dataset.containmentName}.`, true); return; }
                if (value > 0) { showNotification(`Negative pressure must be 0 or below for ${input.dataset.containmentName}.`, true); return; }
                negativePressureReadings.push({
                    containmentId: input.dataset.containmentId,
                    containmentName: input.dataset.containmentName,
                    pressure: value
                });
            }
        }

        const photos = [];
        for (const file of selectedPhotoFiles) {
            try {
                const base64 = await compressImageToBase64(file);
                photos.push({ id: generateId(), base64 });
            } catch (err) {
                showNotification(`Failed to process image: ${file.name}`, true);
                return;
            }
        }

        const entry = {
            id: generateId(),
            hour: hourValue,
            description: notesValue,
            negativePressure: negativePressureReadings.length > 0 ? negativePressureReadings : undefined,
            photos: photos.length > 0 ? photos : undefined,
            createdAt: Date.now()
        };

        currentProject.dailyLogs = (currentProject.dailyLogs || []).map(log => {
            if (log.id === logId) {
                const entries = Array.isArray(log.entries) ? [...log.entries] : [];
                entries.push(entry);
                return { ...log, entries };
            }
            return log;
        });

        saveCurrentProject();
        showNotification('Log entry added.');
        closeModal();
        renderDailyLogView(currentProject);
    });
}

function openProjectDailyLogEntryEditModal(logId, entryId) {
    if (!currentProject) { showNotification('Project data unavailable.', true); return; }
    const log = (currentProject.dailyLogs || []).find(l => l.id === logId);
    const entry = (log?.entries || []).find(e => e.id === entryId);
    if (!log || !entry) { showNotification('Entry not found.', true); return; }

    const STAGES_REQUIRING_PRESSURE = [STAGE_ACTIVE_ABATEMENT];
    const containmentsRequiringPressure = (currentProject.containments || []).filter(c => {
        const stage = normalizeStage(c.stage);
        return STAGES_REQUIRING_PRESSURE.includes(stage) && !c.regulatedArea;
    });

    const readingsById = {};
    (entry.negativePressure || []).forEach(np => {
        if (np.containmentId) readingsById[np.containmentId] = np.pressure;
    });
    const negativePressureHtml = buildNegativePressureHtml(containmentsRequiringPressure, readingsById);

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <h3>Edit Log Entry</h3>
            <form id="daily-log-entry-edit-form" class="space-y-4">
                <p class="text-sm text-gray-600" style="margin-top:0;">Project: ${escapeHtml(currentProject.projectNumber || 'Oversight Project')}</p>
                <div>
                    <label for="daily-log-entry-edit-hour" class="block text-sm font-medium text-gray-700 mb-1">Hour</label>
                    <input type="time" id="daily-log-entry-edit-hour" class="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500" value="${escapeHtml(entry.hour || '')}" required>
                </div>
                ${negativePressureHtml}
                <div>
                    <label for="daily-log-entry-edit-notes" class="block text-sm font-medium text-gray-700 mb-1">Entry Description</label>
                    <textarea id="daily-log-entry-edit-notes" rows="3" class="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500" required>${escapeHtml(entry.description || entry.notes || '')}</textarea>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Photos (max 5)</label>
                    <input type="file" id="daily-log-entry-edit-photos" accept="image/*,.heic,.heif" multiple class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100">
                    <div id="daily-log-entry-edit-photo-previews" class="mt-2 flex flex-wrap gap-2"></div>
                </div>
            </form>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary modal-cancel-btn" id="daily-log-entry-edit-cancel">Cancel</button>
                <button type="submit" form="daily-log-entry-edit-form" class="btn btn-primary modal-save-btn">Save Changes</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    let mouseDownOnBackdrop = false;
    modal.addEventListener('mousedown', (e) => { mouseDownOnBackdrop = (e.target === modal); });
    modal.addEventListener('click', (e) => {
        if (e.target === modal && mouseDownOnBackdrop) closeModal();
        mouseDownOnBackdrop = false;
    });
    modal.querySelector('#daily-log-entry-edit-cancel')?.addEventListener('click', closeModal);

    const MAX_PHOTOS = 5;
    let existingPhotos = [...(entry.photos || [])];
    let newPhotoFiles = [];

    const previewsEl = modal.querySelector('#daily-log-entry-edit-photo-previews');

    const renderEditPhotoPreviews = () => {
        const items = [];
        existingPhotos.forEach((p, i) => {
            items.push(`<div class="relative inline-block">
                <img src="${safeImageSrc(p.base64)}" class="log-photo-preview" alt="Photo">
                <button type="button" class="remove-existing-photo absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs leading-none hover:bg-red-600" data-index="${i}">&times;</button>
            </div>`);
        });
        newPhotoFiles.forEach((f, i) => {
            items.push(`<div class="relative inline-block">
                <img src="${URL.createObjectURL(f)}" class="log-photo-preview" alt="Preview">
                <button type="button" class="remove-new-photo absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs leading-none hover:bg-red-600" data-index="${i}">&times;</button>
            </div>`);
        });
        previewsEl.innerHTML = items.join('');
        previewsEl.querySelectorAll('.remove-existing-photo').forEach(btn => {
            btn.addEventListener('click', () => {
                existingPhotos.splice(parseInt(btn.dataset.index, 10), 1);
                renderEditPhotoPreviews();
            });
        });
        previewsEl.querySelectorAll('.remove-new-photo').forEach(btn => {
            btn.addEventListener('click', () => {
                newPhotoFiles.splice(parseInt(btn.dataset.index, 10), 1);
                renderEditPhotoPreviews();
            });
        });
    };

    modal.querySelector('#daily-log-entry-edit-photos').addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        const total = existingPhotos.length + newPhotoFiles.length;
        const remaining = Math.max(0, MAX_PHOTOS - total);
        const prepared = await preparePhotoFilesForUpload(files.slice(0, remaining));
        newPhotoFiles = [...newPhotoFiles, ...prepared].slice(0, MAX_PHOTOS - existingPhotos.length);
        e.target.value = '';
        renderEditPhotoPreviews();
    });

    renderEditPhotoPreviews();

    modal.querySelector('#daily-log-entry-edit-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const hourValue = modal.querySelector('#daily-log-entry-edit-hour').value;
        const notesValue = modal.querySelector('#daily-log-entry-edit-notes').value.trim();
        if (!hourValue) { showNotification('Specify the hour of the log entry.', true); return; }
        if (!notesValue) { showNotification('Enter a description for the log entry.', true); return; }

        const pressureInputs = modal.querySelectorAll('.negative-pressure-input');
        const negativePressureReadings = [];
        for (const input of pressureInputs) {
            const inputValue = input.value.trim();
            if (inputValue) {
                const value = parseFloat(inputValue);
                if (isNaN(value)) { showNotification(`Enter a valid negative pressure reading for ${input.dataset.containmentName}.`, true); return; }
                if (value > 0) { showNotification(`Negative pressure must be 0 or below for ${input.dataset.containmentName}.`, true); return; }
                negativePressureReadings.push({
                    containmentId: input.dataset.containmentId,
                    containmentName: input.dataset.containmentName,
                    pressure: value
                });
            }
        }

        const photos = [...existingPhotos];
        for (const file of newPhotoFiles) {
            try {
                const base64 = await compressImageToBase64(file);
                photos.push({ id: generateId(), base64 });
            } catch (err) {
                showNotification(`Failed to process image: ${file.name}`, true);
                return;
            }
        }

        const updatedEntry = {
            ...entry,
            hour: hourValue,
            description: notesValue,
            negativePressure: negativePressureReadings.length > 0 ? negativePressureReadings : undefined,
            photos: photos.length > 0 ? photos : undefined
        };

        currentProject.dailyLogs = (currentProject.dailyLogs || []).map(l => {
            if (l.id === logId) {
                return {
                    ...l,
                    entries: (l.entries || []).map(ent => ent.id === entryId ? updatedEntry : ent)
                };
            }
            return l;
        });

        saveCurrentProject();
        showNotification('Entry updated.');
        closeModal();
        renderDailyLogView(currentProject);
    });
}

function renderDailyLogView(project) {
    _shellRefresh();
    const dailyLogView = document.getElementById('daily-log-view');
    if (!dailyLogView) return;

    const dailyLogs = [...(project.dailyLogs || [])].sort((a, b) => {
        const dateCompare = (b.date || '').localeCompare(a.date || '');
        if (dateCompare !== 0) return dateCompare;
        return (b.createdAt || 0) - (a.createdAt || 0);
    });

    const logsHtml = dailyLogs.length
        ? dailyLogs.map(log => {
            const workersList = (log.workers || []).map(w => `${w.name || 'Worker'}${w.certificationType ? ` (${w.certificationType})` : ''}`).join(', ') || 'No workers listed';
            const workLocation = (log.activeContainments || []).length > 0
                ? log.activeContainments.map(n => getContainmentDisplayName(n)).join(', ')
                : 'N/A';
            const entriesHtml = (log.entries || []).length
                ? log.entries.map(entry => `
                    <div class="bg-white border border-gray-100 rounded-lg p-4 mt-2">
                        <div class="flex items-center justify-between gap-2 mb-1">
                            <span class="inline-flex items-center px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs font-medium">${entry.hour || '--:--'}</span>
                            <button type="button" class="edit-log-entry-btn text-xs text-indigo-600 hover:text-indigo-800" data-log-id="${log.id}" data-entry-id="${entry.id}">Edit</button>
                        </div>
                        <p class="text-sm text-gray-700 whitespace-pre-wrap">${escapeHtml(entry.description || entry.notes || '')}</p>
                        ${entry.negativePressure && entry.negativePressure.length > 0 ? `
                            <div class="mt-2 text-xs text-blue-700">
                                ${entry.negativePressure.map(np => `<span class="mr-3">${escapeHtml(getContainmentDisplayName(np.containmentName))}: ${np.pressure} inWC</span>`).join('')}
                            </div>
                        ` : ''}
                        ${entry.photos && entry.photos.length > 0 ? `
                            <div class="mt-2">
                                <button type="button" class="toggle-photos-btn text-xs text-indigo-600 hover:text-indigo-800">Show Photos</button>
                                <div class="entry-photos-container hidden mt-2 flex gap-2 flex-wrap">
                                    ${entry.photos.map(p => `<img src="${safeImageSrc(p.base64)}" alt="Photo" class="rounded border border-gray-200" style="max-width:3.5in;max-height:3.5in;width:auto;height:auto;object-fit:contain">`).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `).join('')
                : '<p class="text-sm text-gray-400 mt-3 italic">No log entries yet. Click "Add Entry" to add one.</p>';
            const entryCount = (log.entries || []).length;
            return `
                <div class="list-item-card hover-reveal-card">
                    <div class="flex items-start justify-between gap-4">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-3 mb-2">
                                <h4 class="font-semibold text-lg text-gray-900">${formatDateText(log.date)}</h4>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}</span>
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                <div>
                                    <span class="text-gray-400">Inspector:</span>
                                    <span class="text-gray-700">${escapeHtml(log.inspectorName || 'N/A')}</span>
                                </div>
                                <div>
                                    <span class="text-gray-400">Workers Onsite:</span>
                                    <span class="text-gray-700">${log.workersTotal ?? (log.workers?.length || 0)}</span>
                                </div>
                                <div class="sm:col-span-2">
                                    <span class="text-gray-400">Work Location:</span>
                                    <span class="text-gray-700">${escapeHtml(workLocation)}</span>
                                </div>
                                <div class="sm:col-span-2">
                                    <span class="text-gray-400">Workers:</span>
                                    <span class="text-gray-600">${escapeHtml(workersList)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="action-buttons flex gap-2 flex-shrink-0">
                            <button type="button" class="print-daily-log-btn btn btn-primary btn-sm" data-log-id="${log.id}">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                                Print
                            </button>
                            <button type="button" class="add-log-entry-btn btn btn-secondary btn-sm" data-log-id="${log.id}">Add Entry</button>
                            <button type="button" class="delete-daily-log-btn btn btn-danger btn-sm" data-log-id="${log.id}">Delete</button>
                        </div>
                    </div>
                    <div class="border-t border-gray-100 mt-4 pt-3">
                        <button type="button" class="toggle-entries-btn flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors" data-log-id="${log.id}">
                            <svg class="toggle-icon w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                            </svg>
                            <span>View Log Entries</span>
                        </button>
                        <div class="log-entries-content hidden mt-3 pl-6 border-l-2 border-indigo-100">
                            ${entriesHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('')
        : '<div class="text-center py-8 text-gray-500"><p>No daily logs have been created for this project yet.</p><p class="text-sm mt-1">Click "Create Daily Log" to add your first log.</p></div>';

    dailyLogView.innerHTML = `
        <div class="card rounded-2xl">
            <div class="section-header flex justify-between items-center" style="background: transparent;">
                <div>
                    <h2 class="text-2xl font-semibold text-gray-900">Daily Logs</h2>
                    <p class="text-sm text-gray-600 mt-1">Project logs for ${escapeHtml(project.projectNumber || 'this project')}</p>
                </div>
                <div class="flex gap-2">
                    <button class="btn btn-secondary btn-sm" id="daily-log-back-btn">← Back to Project</button>
                    <button class="btn btn-primary btn-sm" id="daily-log-create-btn">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                        Create Daily Log
                    </button>
                </div>
            </div>
            <div class="section-content">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="font-semibold text-gray-900">${dailyLogs.length > 0 ? `Logs (${dailyLogs.length})` : 'Logs'}</h3>
                </div>
                <div id="daily-log-list" class="space-y-3">${logsHtml}</div>
            </div>
        </div>
    `;

    // Wire up buttons
    dailyLogView.querySelector('#daily-log-back-btn')?.addEventListener('click', () => navigateToSubview(null));
    dailyLogView.querySelector('#daily-log-create-btn')?.addEventListener('click', () => openProjectDailyLogModal());

    dailyLogView.querySelectorAll('.add-log-entry-btn').forEach(button => {
        button.addEventListener('click', () => {
            const logId = button.dataset.logId;
            if (logId) openProjectDailyLogEntryModal(logId);
        });
    });

    // Use a single delegated handler; remove any previous one to avoid duplicate modals when renderDailyLogView is called again
    if (dailyLogView._dailyLogClickHandler) {
        dailyLogView.removeEventListener('click', dailyLogView._dailyLogClickHandler);
    }
    dailyLogView._dailyLogClickHandler = (e) => {
        const editBtn = e.target.closest('.edit-log-entry-btn');
        if (editBtn) {
            const logId = editBtn.dataset.logId;
            const entryId = editBtn.dataset.entryId;
            if (logId && entryId) openProjectDailyLogEntryEditModal(logId, entryId);
            return;
        }
        const togglePhotosBtn = e.target.closest('.toggle-photos-btn');
        if (togglePhotosBtn) {
            const container = togglePhotosBtn.nextElementSibling;
            if (container && container.classList.contains('entry-photos-container')) {
                const isHidden = container.classList.contains('hidden');
                container.classList.toggle('hidden', !isHidden);
                togglePhotosBtn.textContent = isHidden ? 'Hide Photos' : 'Show Photos';
            }
        }
    };
    dailyLogView.addEventListener('click', dailyLogView._dailyLogClickHandler);

    dailyLogView.querySelectorAll('.print-daily-log-btn').forEach(button => {
        button.addEventListener('click', () => {
            const logId = button.dataset.logId;
            if (!logId || !currentProject) return;
            const log = dailyLogs.find(l => l.id === logId);
            if (!log) { showNotification('Daily log not found.', true); return; }
            printDailyLog(currentProject, log);
        });
    });

    dailyLogView.querySelectorAll('.delete-daily-log-btn').forEach(button => {
        button.addEventListener('click', () => {
            const logId = button.dataset.logId;
            if (!logId) return;
            if (!confirm('Delete this daily log? This action cannot be undone.')) return;
            currentProject.dailyLogs = (currentProject.dailyLogs || []).filter(log => log.id !== logId);
            saveCurrentProject();
            showNotification('Daily log deleted.');
            renderDailyLogView(currentProject);
        });
    });

    // Toggle log entries visibility
    dailyLogView.querySelectorAll('.toggle-entries-btn').forEach(button => {
        button.addEventListener('click', () => {
            const card = button.closest('.list-item-card');
            const content = card.querySelector('.log-entries-content');
            const icon = button.querySelector('.toggle-icon');
            if (content.classList.contains('hidden')) {
                content.classList.remove('hidden');
                icon.style.transform = 'rotate(90deg)';
            } else {
                content.classList.add('hidden');
                icon.style.transform = 'rotate(0deg)';
            }
        });
    });
}

// ============================================
// SIGNATURE (image module kept but not used - ensures docs generate without corruption)
// ============================================

/**
 * Get the inspector's signature base64 string from their profile, if available.
 * @param {string} inspectorName - Optional inspector name. If provided, looks up that inspector's signature.
 * @returns {string} base64 data URL or empty string
 */
function getInspectorSignatureBase64(inspectorName = null) {
    // If inspector name is provided, look it up in the registry
    if (inspectorName && typeof getInspectorSignatureByName === 'function') {
        return getInspectorSignatureByName(inspectorName);
    }
    
    // Otherwise, use current inspector's profile
    if (typeof getInspectorProfile === 'function') {
        const profile = getInspectorProfile();
        return profile.signatureBase64 || '';
    }
    return '';
}

// ============================================
// AIR SAMPLE PRINT (CHAIN OF CUSTODY)
// ============================================

function openPrintAirSamplesModal() {
    if (!currentProject || !currentProject.airSamples || currentProject.airSamples.length === 0) {
        showNotification('No air samples to print.', true);
        return;
    }

    const airSamples = currentProject.airSamples;
    const primaryInspector = airSamples[0] || {};
    const inspectorName = primaryInspector.inspectorName || (typeof getInspectorProfile === 'function' ? getInspectorProfile().name : '') || '';
    const inspectorEmail = (typeof getInspectorProfile === 'function' ? getInspectorProfile().email : '') || '';

    const sampleCheckboxesHtml = airSamples.map(sample => {
        const timeEl = calculateTimeElapsed(sample.startTime, sample.stopTime);
        return buildModalSelectionOption(
            `print-air-sample-${sample.id}`,
            'print-sample-checkbox',
            sample.id,
            true,
            escapeHtml(sample.sampleId || sample.id || 'No ID'),
            `${sample.type || 'Unknown'} · ${sample.startTime || '--:--'} - ${sample.stopTime || '--:--'}${timeEl !== null ? ` (${timeEl} min)` : ''}`
        );
    }).join('');

    const modal = createModal('Print Air Sample Request', `
        <p class="text-sm text-gray-600 mb-4">Select samples and complete the form to generate the lab submission.</p>
        <div class="space-y-4">
            <div>
                <div class="flex items-center justify-between mb-2">
                    <label class="block text-sm font-medium text-gray-700">Select Samples to Print</label>
                    <div class="flex gap-2">
                        <button type="button" id="print-air-select-all" class="text-xs font-medium" style="color:#4f46e5;">Select All</button>
                        <span class="text-gray-300">|</span>
                        <button type="button" id="print-air-select-none" class="text-xs font-medium" style="color:#4f46e5;">Select None</button>
                    </div>
                </div>
                <div id="print-air-samples-list" class="modal-selection-box max-h-48 overflow-y-auto">
                    ${sampleCheckboxesHtml}
                </div>
                <p id="print-air-sample-count" class="text-xs text-gray-500 mt-2"><strong>${airSamples.length}</strong> sample${airSamples.length > 1 ? 's' : ''} selected</p>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Collected By</label>
                    <input type="text" id="print-air-inspector" class="w-full p-2.5 border rounded-lg" value="${escapeHtml(inspectorName)}">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Lab Account Number</label>
                    <input type="text" id="print-air-lab-number" class="w-full p-2.5 border rounded-lg" placeholder="e.g., LAB-001">
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Send Results To (Email)</label>
                    <input type="email" id="print-air-email" class="w-full p-2.5 border rounded-lg" value="${escapeHtml(inspectorEmail)}" placeholder="email@example.com">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Laboratory</label>
                    <input type="text" id="print-air-lab" class="w-full p-2.5 border rounded-lg" placeholder="e.g., FACS, EMSL">
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Type of Analysis</label>
                    <select id="print-air-analysis" class="w-full p-2.5 border rounded-lg bg-white">
                        <option value="PCM: NIOSH 7400">PCM: NIOSH 7400</option>
                        <option value="TEM: NIOSH 7402">TEM: NIOSH 7402</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Turn Around Time</label>
                    <input type="text" id="print-air-turnaround" class="w-full p-2.5 border rounded-lg" placeholder="e.g., 24-Hour, 5-Day">
                </div>
            </div>

            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
                <textarea id="print-air-instructions" rows="2" class="w-full p-2.5 border rounded-lg" placeholder="Optional special instructions for the lab..."></textarea>
            </div>
        </div>
    `, async () => {
        // Get selected sample IDs
        const selectedSampleIds = Array.from(document.querySelectorAll('.print-sample-checkbox:checked')).map(cb => cb.value);
        if (selectedSampleIds.length === 0) {
            showNotification('Please select at least one sample to print.', true);
            return false;
        }

        const selectedSamples = airSamples.filter(s => selectedSampleIds.includes(s.id));

        const formData = {
            inspectorName: document.getElementById('print-air-inspector').value.trim(),
            inspectorEmail: document.getElementById('print-air-email').value.trim(),
            labNumber: document.getElementById('print-air-lab-number').value.trim(),
            lab: document.getElementById('print-air-lab').value.trim(),
            analysisType: document.getElementById('print-air-analysis').value,
            turnAroundTime: document.getElementById('print-air-turnaround').value.trim(),
            specialInstructions: document.getElementById('print-air-instructions').value.trim()
        };

        await printAirSampleForm(currentProject, selectedSamples, formData);
    });

    // Wire up select all/none
    setTimeout(() => {
        const sampleCheckboxes = document.querySelectorAll('.print-sample-checkbox');
        const sampleCountEl = document.getElementById('print-air-sample-count');
        const selectAllBtn = document.getElementById('print-air-select-all');
        const selectNoneBtn = document.getElementById('print-air-select-none');

        const updateSampleCount = () => {
            const checkedCount = document.querySelectorAll('.print-sample-checkbox:checked').length;
            if (sampleCountEl) sampleCountEl.innerHTML = `<strong>${checkedCount}</strong> sample${checkedCount !== 1 ? 's' : ''} selected`;
        };

        sampleCheckboxes.forEach(cb => cb.addEventListener('change', updateSampleCount));
        selectAllBtn?.addEventListener('click', () => { sampleCheckboxes.forEach(cb => cb.checked = true); updateSampleCount(); });
        selectNoneBtn?.addEventListener('click', () => { sampleCheckboxes.forEach(cb => cb.checked = false); updateSampleCount(); });
    }, 50);
}

async function printAirSampleForm(project, airSamples, formData = {}) {
    try {
        let DocxtemplaterClass = window.Docxtemplater || (typeof Docxtemplater !== 'undefined' ? Docxtemplater : null);
        let PizZipClass = window.PizZip || (typeof PizZip !== 'undefined' ? PizZip : null);

        if (!DocxtemplaterClass || !PizZipClass) {
            showNotification('Document generation library is not loaded. Please refresh the page.', true);
            return;
        }

        const formatDate = (dateString) => {
            if (!dateString) return '';
            let date;
            if (typeof dateString === 'number') {
                date = new Date(dateString);
            } else {
                date = new Date(dateString + (dateString.includes('T') ? '' : 'T00:00:00'));
            }
            if (isNaN(date.getTime())) return '';
            return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
        };

        const cleanValue = (val) => (val !== null && val !== undefined) ? String(val) : '';

        // Determine date range from samples
        const sampleDates = airSamples.map(s => s.date).filter(Boolean);
        const uniqueDates = [...new Set(sampleDates)].sort();
        const datesCollected = uniqueDates.length > 1
            ? `${formatDate(uniqueDates[0])} - ${formatDate(uniqueDates[uniqueDates.length - 1])}`
            : (uniqueDates.length === 1 ? formatDate(uniqueDates[0]) : '');

        // Build samples array for the template
        const getSampleLocationDisplay = (s) => {
            const cName = s.containmentName || (s.containmentId ? (project.containments || []).find(c => c.id === s.containmentId)?.name : null) || '';
            const loc = (s.location || '').trim();
            const displayName = cName ? getContainmentDisplayName(cName) : '';
            if (displayName && loc) return `${displayName} | ${loc}`;
            if (displayName) return displayName;
            if (loc) return loc;
            return s.type || '';
        };
        const samplesData = airSamples.map(sample => {
            const startTimeVal = cleanValue(sample.startTime);
            const stopTimeVal = cleanValue(sample.stopTime);
            const startFlowVal = cleanValue(sample.startFlowRate);
            const stopFlowVal = cleanValue(sample.stopFlowRate);

            let timeElapsed = null;
            let averageFlow = null;
            if (startTimeVal && stopTimeVal) timeElapsed = calculateTimeElapsed(startTimeVal, stopTimeVal);
            if (startFlowVal && stopFlowVal) averageFlow = (parseFloat(startFlowVal) + parseFloat(stopFlowVal)) / 2;

            const sampleVolume = (averageFlow !== null && timeElapsed !== null && timeElapsed > 0)
                ? (averageFlow * timeElapsed).toFixed(2)
                : '';

            return {
                sampleID: sample.sampleId || sample.id || '',
                sampleDescription: sample.comments || getSampleLocationDisplay(sample) || '',
                sampleDate: formatDate(sample.date || getTodayLocal()),
                startTime: startTimeVal,
                stopTime: stopTimeVal,
                timeElapsed: timeElapsed !== null ? String(timeElapsed) : '',
                startFlow: startFlowVal,
                stopFlow: stopFlowVal,
                averageFlow: averageFlow !== null ? averageFlow.toFixed(2) : '',
                sampleVolume: sampleVolume
            };
        });

        // Signature handling - use the inspector name from form data
        const formInspectorName = formData.inspectorName || '';
        const signatureBase64 = getInspectorSignatureBase64(formInspectorName);

        const templateData = {
            date: formatDate(getTodayLocal()),
            projectNumber: project.projectNumber || '',
            inspectorName: formInspectorName,
            labNumber: formData.labNumber || '',
            datesCollected: datesCollected,
            analysisType: formData.analysisType || 'PCM: NIOSH 7400',
            lab: formData.lab || '',
            turnAroundTime: formData.turnAroundTime || '',
            siteName: project.siteName || '',
            spectialInstructions: formData.specialInstructions || '',
            inspectorEmail: formData.inspectorEmail || '',
            samples: samplesData,
            image: signatureBase64 || '',
            signature: signatureBase64 || ''
        };

        showNotification('Loading Air Sample template...');
        const TEMPLATE_VERSION = '1.0';
        const templatePath = './templates/Air Sample Template.docx';
        const cacheBuster = `?v=${TEMPLATE_VERSION}&t=${Date.now()}`;
        const templateUrl = templatePath + cacheBuster;

        const response = await fetch(templateUrl, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
        if (!response.ok) throw new Error(`Failed to load template: ${response.statusText}`);

        const arrayBuffer = await response.arrayBuffer();
        const zip = new PizZipClass(arrayBuffer);
        const docOptions = {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '{', end: '}' }
        };
        let doc;
        try {
            const signatureImageModule = typeof createSignatureImageModule === 'function' ? createSignatureImageModule() : null;
            if (signatureImageModule) docOptions.modules = [signatureImageModule];
            doc = new DocxtemplaterClass(zip, docOptions);
            doc.render(templateData);
        } catch (renderErr) {
            if (docOptions.modules && docOptions.modules.length > 0) {
                docOptions.modules = [];
                const zip2 = new PizZipClass(arrayBuffer);
                doc = new DocxtemplaterClass(zip2, docOptions);
                doc.render({ ...templateData, image: '', signature: '' });
            } else {
                throw renderErr;
            }
        }

        const blob = doc.getZip().generate({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });

        const fileName = `Air_Sample_Request_${project.projectNumber || 'Project'}_${formatDate(getTodayLocal()).replace(/\//g, '_')}.docx`;
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        showNotification('Air sample request document generated successfully.');
    } catch (error) {
        console.error('Error generating air sample document:', error);
        showNotification('Failed to generate document. Check the console for details.', true);
    }
}

// ============================================
// DAILY LOG DOCUMENT GENERATION
// ============================================

function removeEmptyPhotoLogCells(zip) {
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
}

function printDailyLog(project, dailyLog) {
    try {
        let DocxtemplaterClass = window.Docxtemplater || (typeof Docxtemplater !== 'undefined' ? Docxtemplater : null);
        let PizZipClass = window.PizZip || (typeof PizZip !== 'undefined' ? PizZip : null);

        if (!DocxtemplaterClass || !PizZipClass) {
            showNotification('Document generation library is not loaded. Please refresh the page.', true);
            return;
        }

        // Format date for display (MM/DD/YYYY)
        const formatDate = (dateString) => {
            if (!dateString) return '';
            const date = new Date(dateString + 'T00:00:00');
            if (isNaN(date.getTime())) return '';
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const year = date.getFullYear();
            return `${month}/${day}/${year}`;
        };

        // Format time from HH:MM to HHMM
        const formatTime = (timeString) => {
            if (!timeString) return '';
            const [hours, minutes] = timeString.split(':');
            return `${hours}${minutes}`;
        };

        // Get initials from name
        const getInitials = (name) => {
            if (!name) return '';
            const parts = name.trim().split(/\s+/);
            if (parts.length === 0) return '';
            if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
            return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
        };

        const clientName = project.clientName || '';
        const clientContact = project.clientContactName || '';
        const clientPhone = project.clientPhone || '';
        const clientFax = project.clientFax || '';
        const siteName = project.siteName || '';
        const contractor = project.contractor || '';
        const personnelCount = dailyLog.workersTotal || dailyLog.workers?.length || 0;
        const contractorPhone = project.contractorPhone || '';
        const contractorFax = project.contractorFax || '';
        const projectNumber = project.projectNumber || '';
        const inspectorName = dailyLog.inspectorName || '';
        const inspectorInitials = getInitials(inspectorName);

        // Work location from active containments stored at log creation time
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

        // Build samples array - air samples collected on that date
        const logDate = dailyLog.date;
        const airSamplesForDate = (project.airSamples || []).filter(s => s.date === logDate);
        const getSampleLocationDisplay = (s) => {
            const cName = s.containmentName || (s.containmentId ? (project.containments || []).find(c => c.id === s.containmentId)?.name : null) || '';
            const loc = (s.location || '').trim();
            const displayName = cName ? getContainmentDisplayName(cName) : '';
            if (displayName && loc) return `${displayName} | ${loc}`;
            if (displayName) return displayName;
            if (loc) return loc;
            return s.type || '';
        };
        const samples = airSamplesForDate.length > 0
            ? airSamplesForDate.map(s => ({
                sampleNumber: s.sampleId || '',
                sampleDescription: getSampleLocationDisplay(s),
                sampleType: s.type || '',
                start: s.startTime ? formatTime(s.startTime) : '-',
                stop: s.stopTime ? formatTime(s.stopTime) : '-'
            }))
            : [{ sampleNumber: '-', sampleType: '-', start: '-', stop: '-', sampleDescription: 'No Samples Taken' }];

        // Determine start/end times from air samples
        let startTime = '-';
        let endTime = '-';
        if (airSamplesForDate.length > 0) {
            const starts = airSamplesForDate.map(s => s.startTime).filter(Boolean).sort();
            const stops = airSamplesForDate.map(s => s.stopTime).filter(Boolean).sort();
            if (starts.length > 0) startTime = formatTime(starts[0]);
            if (stops.length > 0) endTime = formatTime(stops[stops.length - 1]);
        }

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

        // Signature handling - use the inspector who created this daily log
        const signatureBase64 = getInspectorSignatureBase64(inspectorName);

        const templateData = {
            date: formattedDate,
            projectNumber: projectNumber,
            inspectorName: inspectorName,
            inspectorInitials: inspectorInitials,
            client: clientName,
            contact: clientContact,
            clientPhone: clientPhone,
            clientFax: clientFax,
            projectSite: siteName,
            workLocation: workLocation,
            contractor: contractor,
            personnelCount: String(personnelCount),
            contractorPhone: contractorPhone,
            contractorFax: contractorFax,
            startTime: startTime,
            endTime: endTime,
            negativePressure: negativePressure,
            samples: samples,
            logEntries: logEntries,
            photoLog: photoLogFlat,
            photoLogRows: photoLogRows,
            image: signatureBase64 || null
        };

        // Load the Word template
        showNotification('Loading template...');
        const TEMPLATE_VERSION = '2.0';
        const templatePath = './templates/Daily Log Template.docx';
        const cacheBuster = `?v=${TEMPLATE_VERSION}&t=${Date.now()}`;
        const templateUrl = templatePath + cacheBuster;

        fetch(templateUrl, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
            .then(response => {
                if (!response.ok) throw new Error(`Failed to load template: ${response.statusText}`);
                return response.arrayBuffer();
            })
            .then(arrayBuffer => {
                const zip = new PizZipClass(arrayBuffer);
                const docOptions = {
                    paragraphLoop: true,
                    linebreaks: true,
                    delimiters: { start: '{', end: '}' }
                };
                const signatureImageModule = typeof createSignatureImageModule === 'function' ? createSignatureImageModule() : null;
                if (signatureImageModule) docOptions.modules = [signatureImageModule];
                const doc = new DocxtemplaterClass(zip, docOptions);

                try {
                    doc.render(templateData);
                    removeEmptyPhotoLogCells(doc.getZip());
                } catch (error) {
                    console.error('Docxtemplater render error:', error);
                    if (error.properties && error.properties.errors) {
                        const errorMessages = error.properties.errors.map(e => e.message || e).join('; ');
                        showNotification(`Template error: ${errorMessages}`, true);
                    } else {
                        showNotification(`Template rendering failed: ${error.message}`, true);
                    }
                    throw error;
                }

                const blob = doc.getZip().generate({
                    type: 'blob',
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                });

                const fileName = `Daily_Log_${projectNumber}_${formattedDate.replace(/\//g, '_')}.docx`;
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);

                showNotification('Daily log document generated successfully.');
            })
            .catch(error => {
                console.error('Error generating daily log document:', error);
                showNotification('Failed to generate document. Check the console for details.', true);
            });
    } catch (error) {
        console.error('Error generating daily log:', error);
        showNotification('Failed to generate document. Please try again.', true);
    }
}

// ============================================
// NOTIFICATION HELPER
// ============================================

function showNotification(message, isError = false) {
    const area = document.getElementById('notification-area');
    if (!area) {
        if (isError) console.error(message);
        else console.log(message);
        return;
    }
    
    const bgColor = isError ? '#dc2626' : '#16a34a';
    const notification = document.createElement('div');
    notification.style.cssText = `padding: 12px 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); color: white; font-size: 14px; font-weight: 500; background: ${bgColor}; margin-bottom: 8px; animation: notifSlideIn 0.3s ease-out;`;
    notification.textContent = message;
    // Ensure animation keyframes exist
    if (!document.getElementById('notif-anim-styles')) {
        const style = document.createElement('style');
        style.id = 'notif-anim-styles';
        style.textContent = `@keyframes notifSlideIn { from { opacity:0; transform:translateX(100%); } to { opacity:1; transform:translateX(0); } } @keyframes notifSlideOut { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(100%); } }`;
        document.head.appendChild(style);
    }
    area.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'notifSlideOut 0.3s ease-in forwards';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

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

function createModal(title, content, onSave) {
    // Defensive: clean up any orphaned modals first. This is a redundancy
    // against a recurring bug where a stuck modal (one that lost its `active`
    // state but stayed in the DOM, or one that was double-spawned) intercepts
    // pointer events on the new modal's text inputs.
    cleanupOrphanedModals();

    const modal = document.createElement('div');
    modal.className = 'modal active';
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.maxWidth = '600px';
    modalContent.innerHTML = `
        <h3 class="text-xl font-semibold mb-4">${title}</h3>
        ${content}
        <div class="modal-footer flex justify-end gap-3 mt-6">
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
    
    // Handle backdrop click to close (only closes if both mousedown and mouseup happened on backdrop)
    modal.addEventListener('click', (e) => {
        // Only close if the click started AND ended on the backdrop
        if (e.target === modal && mouseDownOnBackdrop) {
            modal.remove();
        }
        // Reset the flag
        mouseDownOnBackdrop = false;
    });
    
    // Handle Cancel button
    const cancelBtn = modalContent.querySelector('.modal-cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            modal.remove();
        });
    }
    
    // Handle Save button (supports both sync and async onSave callbacks)
    const saveBtn = modalContent.querySelector('.modal-save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const result = onSave();
            // Handle async callbacks (Promises)
            if (result && typeof result.then === 'function') {
                const asyncResult = await result;
                if (asyncResult !== false) {
                    // Only remove if modal is still in DOM (async flow may have removed it)
                    if (modal.parentNode) modal.remove();
                }
            } else if (result !== false) {
                modal.remove();
            }
        });
    }
    
    document.body.appendChild(modal);
    
    // Focus first input and apply phone formatting
    setTimeout(() => {
        const firstInput = modalContent.querySelector('input:not([type="checkbox"]), select, textarea');
        if (firstInput) {
            firstInput.focus();
        }
        // Apply phone formatting to all phone inputs
        const phoneInputs = modalContent.querySelectorAll('input[type="tel"]');
        phoneInputs.forEach(input => applyPhoneFormatting(input));
    }, 50);
    
    return modal;
}

function saveCurrentProject() {
    if (!currentProject) return;
    
    // Sync material totalQuantity with actual building space assignments
    // This prevents totalQuantity from being stale (bumped up but never reduced)
    syncMaterialTotals();
    
    currentProject.lastModified = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY_PREFIX + currentProject.id, JSON.stringify(currentProject));
    _publishCurrentProject();
}

// Ensure each project material's totalQuantity is at least as large as the sum of
// building space assignments. This catches edge cases where the bump in 
// openSpaceMaterialModal didn't fire (e.g., materials added via quick-add modal).
// Only bumps UP, never reduces — preserves user-declared totals.
function syncMaterialTotals() {
    if (!currentProject || !currentProject.materials) return;
    
    const buildings = currentProject.buildings || [];
    
    currentProject.materials.forEach(material => {
        const matName = (material.name || '').trim().toLowerCase();
        let buildingTotal = 0;
        
        buildings.forEach(building => {
            (building.spaces || []).forEach(space => {
                (space.materials || []).forEach(sm => {
                    const smName = (sm.name || '').trim().toLowerCase();
                    if (sm.materialId === material.id || smName === matName) {
                        buildingTotal += Number(sm.quantity) || 0;
                    }
                });
            });
        });
        
        // Only bump UP — never reduce the user's declared total
        if (buildingTotal > (Number(material.totalQuantity) || 0)) {
            material.totalQuantity = buildingTotal;
        }
    });
}

function showError(msg) {
    const el = document.getElementById('oversight-project-error');
    if (el) {
        el.textContent = msg;
        el.classList.remove('hidden');
    }
    const content = document.getElementById('oversight-project-content');
    if (content) content.classList.add('hidden');
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    // Also escape double quotes for safe use in HTML attributes (e.g. value="...")
    return div.innerHTML.replace(/"/g, '&quot;');
}

/**
 * Remove stuck/orphaned modal elements from the DOM.
 * Redundancy against a recurring bug where text inputs in modals become
 * un-editable because a previous modal failed to clean up, leaving an
 * invisible overlay intercepting clicks. Safe to call any time; only
 * removes modals that are clearly broken or have already been visually
 * dismissed (no .active class).
 */
function cleanupOrphanedModals() {
    document.querySelectorAll('.modal').forEach(m => {
        const hasContent = !!m.querySelector('.modal-content');
        const isActive = m.classList.contains('active');
        // Remove anything that is either inactive (stale) or has no content
        // (broken state). Active, well-formed modals are left alone so async
        // multi-modal flows continue to work.
        if (!isActive || !hasContent) {
            m.remove();
        }
    });
}

// Safe-image-src helper. Photos stored in projects round-trip through Excel and
// could in principle be tampered (e.g. javascript: or data:text/html). Only
// allow well-formed data:image/* base64 URLs; anything else collapses to a
// 1x1 transparent PNG placeholder so a malicious string can never reach
// an <img src=...> attribute as code.
const SAFE_IMAGE_FALLBACK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';
function safeImageSrc(value) {
    if (typeof value !== 'string') return SAFE_IMAGE_FALLBACK;
    // Strip surrounding whitespace and any HTML attribute terminators.
    const trimmed = value.trim();
    if (!/^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(trimmed)) {
        return SAFE_IMAGE_FALLBACK;
    }
    // Quote-escape just in case; the regex above already disallows quotes, but
    // belt-and-suspenders for any future change.
    return trimmed.replace(/"/g, '');
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Resize and compress image to base64 (max 1200px, JPEG 0.8)
 * @param {File} file - Image file
 * @returns {Promise<string>} Base64 data URL
 */
function compressImageToBase64(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const MAX_DIM = 1200;
            let w = img.width, h = img.height;
            if (w > MAX_DIM || h > MAX_DIM) {
                if (w > h) {
                    h = Math.round(h * MAX_DIM / w);
                    w = MAX_DIM;
                } else {
                    w = Math.round(w * MAX_DIM / h);
                    h = MAX_DIM;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            try {
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                resolve(dataUrl);
            } catch (e) {
                reject(e);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };
        img.src = url;
    });
}

// ============================================
// WORKER ROSTER DOCUMENT EXPORT
// ============================================

function buildWorkerRosterTemplateData(project) {
    const workerRoster = project.workerRoster || [];
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
    const formatDate = (dateValue) => {
        if (!dateValue) return '';
        const date = parseDate(dateValue);
        if (!date) return '';
        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
    };

    const ATTENDANCE_COLS = 10;
    const sortedLogs = (project.dailyLogs || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const distinctDates = [];
    const workersByDate = new Map();
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

    return {
        client: project.clientName || '',
        pjNumber: project.projectNumber || '',
        ...dateHeaders,
        roster,
        dailyRoster
    };
}

async function exportWorkerRosterDoc(project) {
    project = project || currentProject;
    if (!project) {
        showNotification('No project loaded.', true);
        return;
    }
    const workers = project.workerRoster || [];
    if (workers.length === 0) {
        showNotification('Add workers to the roster before exporting.', true);
        return;
    }

    const DocxtemplaterClass = window.Docxtemplater || (typeof Docxtemplater !== 'undefined' ? Docxtemplater : null);
    const PizZipClass = window.PizZip || (typeof PizZip !== 'undefined' ? PizZip : null);
    if (!DocxtemplaterClass || !PizZipClass) {
        showNotification('Document generation library is not loaded. Please refresh the page.', true);
        return;
    }

    try {
        showNotification('Generating worker roster…');
        const templateData = buildWorkerRosterTemplateData(project);
        const cacheBuster = `?t=${Date.now()}`;
        const response = await fetch('templates/Worker Roster Template.docx' + cacheBuster, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' }
        });
        if (!response.ok) {
            showNotification('Worker Roster template not found.', true);
            return;
        }
        const arrayBuffer = await response.arrayBuffer();
        const zip = new PizZipClass(arrayBuffer);
        const docOptions = {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '{', end: '}' }
        };
        const signatureImageModule = typeof createSignatureImageModule === 'function' ? createSignatureImageModule() : null;
        if (signatureImageModule) docOptions.modules = [signatureImageModule];
        const doc = new DocxtemplaterClass(zip, docOptions);
        doc.render(templateData);
        const blob = doc.getZip().generate({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        const fileName = `${(project.projectNumber || 'Project').replace(/[^\w\-]+/g, '_')}_Worker_Roster.docx`;
        if (typeof saveAs !== 'undefined') {
            saveAs(blob, fileName);
        } else {
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        }
        showNotification('Worker roster exported.');
    } catch (e) {
        console.error('Worker roster export failed', e);
        showNotification('Failed to export worker roster. Check the console.', true);
    }
}

// Export functions for onclick handlers and shell.js (js/shell.js calls window.*Modal)
window.openEditProjectModal = openEditProjectModal;
window.openAddBuildingModal = openAddBuildingModal;
window.openAddMaterialModal = openAddMaterialModal;
window.openAddContainmentModal = openAddContainmentModal;
window.openAddAirSampleModal = openAddAirSampleModal;
window.openProjectDailyLogModal = openProjectDailyLogModal;
window.openProjectDailyLogEntryModal = openProjectDailyLogEntryModal;
window.openProjectDailyLogEntryEditModal = openProjectDailyLogEntryEditModal;
window.saveCurrentProject = saveCurrentProject;
window.openAddSpaceFromHeader = openAddSpaceFromHeader;
window.openAddSpaceModal = openAddSpaceModal;
window.openEditBuildingModal = openEditBuildingModal;
window.deleteBuilding = deleteBuilding;
window.openEditSpaceModal = openEditSpaceModal;
window.deleteSpace = deleteSpace;
window.openAddMaterialToSpaceModal = openAddMaterialToSpaceModal;
window.deleteMaterialFromSpace = deleteMaterialFromSpace;
window.openEditMaterialModal = openEditMaterialModal;
window.deleteMaterial = deleteMaterial;
window.openBulkSampleModal = openBulkSampleModal;
window.openPrintBulkSamplesModal = openPrintBulkSamplesModal;
window.openEditContainmentModal = openEditContainmentModal;
window.deleteContainment = deleteContainment;
window.openEditAirSampleModal = openEditAirSampleModal;
window.deleteAirSample = deleteAirSample;
window.openPrintAirSamplesModal = openPrintAirSamplesModal;
window.openEditWorkerModal = openEditWorkerModal;
window.exportWorkerRosterDoc = exportWorkerRosterDoc;
window.getContainmentDisplayName = getContainmentDisplayName;
