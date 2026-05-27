// Oversight redesigned shell - renderer + sidebar + tweaks
// Renders dashboard views (Today/Projects/Archive) on index.html and
// the project workspace (head + 7 tabs) on project.html. Modal builders
// and business logic stay in js/main.js and js/project.js.
"use strict";

(function () {
  const IS_PROJECT_PAGE = /project\.html$/i.test(location.pathname);

  // ============================================================
  // ICONS
  // ============================================================
  const ICONS = {
    home: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    bell: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
    alert: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>',
    clock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    user: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    pencil: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    doc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    bldg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20"/><path d="M9 22v-4h6v4"/><line x1="8" y1="6" x2="8.01" y2="6"/><line x1="16" y1="6" x2="16.01" y2="6"/><line x1="8" y1="10" x2="8.01" y2="10"/><line x1="16" y1="10" x2="16.01" y2="10"/><line x1="8" y1="14" x2="8.01" y2="14"/><line x1="16" y1="14" x2="16.01" y2="14"/></svg>',
    arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    folder: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  };

  // ============================================================
  // HELPERS
  // ============================================================
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function displayUnit(u, fallback) {
    if (u === 'SF') return 'ft\u00b2';
    return u || fallback || '';
  }
  function formatQty(n) {
    const v = parseFloat(n);
    if (Number.isNaN(v)) return '0';
    return Number.isInteger(v) ? String(v) : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  function photoSrc(photo) {
    if (!photo) return '';
    const raw = typeof photo === 'string' ? photo : photo.base64;
    if (!raw || typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (/^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml);base64,/i.test(trimmed)) {
      return trimmed.replace(/"/g, '');
    }
    if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 40) {
      return `data:image/jpeg;base64,${trimmed.replace(/\s/g, '')}`;
    }
    return '';
  }
  function entryDescription(entry) {
    return String(entry.description || entry.notes || '').trim();
  }
  function formatEntryHour(entry) {
    if (entry.hour) {
      const parts = String(entry.hour).split(':');
      if (parts.length >= 2) {
        const hr = parseInt(parts[0], 10);
        const min = parts[1];
        if (!Number.isNaN(hr)) {
          const ampm = hr >= 12 ? 'PM' : 'AM';
          const h12 = hr % 12 || 12;
          return `${h12}:${min} ${ampm}`;
        }
      }
      return entry.hour;
    }
    if (entry.timestamp) return fmtTime(entry.timestamp);
    return '';
  }
  function renderLogEntryCard(entry, logId) {
    const desc = entryDescription(entry);
    const hourLabel = formatEntryHour(entry);
    const photos = (entry.photos || []).map(photoSrc).filter(Boolean);
    const npBlock = (entry.negativePressure && entry.negativePressure.length)
      ? `<div class="tl-pressure">${entry.negativePressure.map(np =>
          `<span class="muted small">${esc(np.containmentName || 'Containment')}: <b>${esc(np.pressure)}</b> inWC</span>`
        ).join(' ')}</div>`
      : '';
    const photosBlock = photos.length
      ? `<div class="tl-photos-wrap">
          <button type="button" class="btn-link small toggle-photos-btn">Show photos (${photos.length})</button>
          <div class="tl-photos hidden">
            ${(entry.photos || []).map((p, i) => {
              const src = photoSrc(p);
              return src ? `<img class="tl-photo" src="${src}" alt="Log photo ${i + 1}">` : '';
            }).join('')}
          </div>
        </div>`
      : '';
    return `<div class="tl-entry">
      <div class="tl-marker"></div>
      <div class="tl-card">
        <div class="tl-card-head">
          <span class="tl-hour-badge mono">${esc(hourLabel || '—')}</span>
          <button type="button" class="btn-link small" data-action="edit-entry" data-log-id="${esc(logId)}" data-entry-id="${esc(entry.id)}">Edit</button>
        </div>
        <div class="tl-note">${desc ? esc(desc) : '<span class="muted">No description</span>'}</div>
        ${npBlock}
        ${photosBlock}
      </div>
    </div>`;
  }
  function unitForSpaceMaterial(sm, siteMaterials) {
    if (sm.unit) return displayUnit(sm.unit);
    const id = sm.materialId;
    const site = (siteMaterials || []).find(m => m.id === id);
    return displayUnit(site?.unit, 'units');
  }
  function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString(undefined, { month:'short', day:'numeric' }); } catch (e) { return '—'; }
  }
  function fmtDateFull(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString(); } catch (e) { return '—'; }
  }
  function fmtTime(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' }); } catch (e) { return ''; }
  }
  function toActivityDate(dateValue, timeValue) {
    if (dateValue && timeValue && timeToMinutes(timeValue) !== null) {
      const d = new Date(`${dateValue}T${String(timeValue).slice(0, 5)}:00`);
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (dateValue) {
      const d = new Date(String(dateValue).includes('T') ? dateValue : `${dateValue}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (timeValue && timeToMinutes(timeValue) !== null) {
      const today = new Date();
      const mins = timeToMinutes(timeValue);
      today.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
      return today;
    }
    return null;
  }
  function activitySortValue(value) {
    const d = value instanceof Date ? value : new Date(value || 0);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  function sampleDisplayId(sample) {
    return sample.sampleId || sample.sampleID || sample.sampleNumber || sample.id || '—';
  }
  function timeToMinutes(value) {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return (parseInt(match[1], 10) * 60) + parseInt(match[2], 10);
  }
  function formatClockTime(value) {
    const mins = timeToMinutes(value);
    if (mins === null) return value ? esc(value) : '—';
    const h24 = Math.floor(mins / 60) % 24;
    const min = String(mins % 60).padStart(2, '0');
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    return `${h12}:${min} ${ampm}`;
  }
  function addDays(dateStr, days) {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    return d;
  }
  function formatSampleTime(sample, field) {
    const value = sample[field];
    if (!value) return '—';
    const start = timeToMinutes(sample.startTime);
    const stop = timeToMinutes(sample.stopTime);
    const overnight = start !== null && stop !== null && stop < start;
    const time = formatClockTime(value);
    if (overnight) {
      const date = addDays(sample.date, field === 'stopTime' ? 1 : 0);
      if (date) return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
    }
    return time;
  }
  function sampleElapsedMinutes(sample) {
    const start = timeToMinutes(sample.startTime);
    const stop = timeToMinutes(sample.stopTime);
    if (start === null || stop === null) return null;
    const elapsed = stop - start;
    return elapsed < 0 ? elapsed + (24 * 60) : elapsed;
  }
  function sampleVolume(sample) {
    const existing = sample.sampleVolume ?? sample.samplingVolume;
    if (existing !== undefined && existing !== null && existing !== '') return existing;
    const elapsed = sampleElapsedMinutes(sample);
    const startFlow = parseFloat(sample.startFlowRate);
    const stopFlow = parseFloat(sample.stopFlowRate);
    if (!elapsed || Number.isNaN(startFlow) || Number.isNaN(stopFlow)) return null;
    return Number((((startFlow + stopFlow) / 2) * elapsed).toFixed(2));
  }
  function entrySortValue(entry) {
    if (entry.timestamp) {
      const d = new Date(entry.timestamp);
      if (!Number.isNaN(d.getTime())) return d.getTime();
    }
    const mins = timeToMinutes(entry.hour || entry.startTime || entry.time);
    if (mins !== null) return mins;
    return Number(entry.createdAt || 0);
  }
  function stageClass(stage) {
    if (!stage) return 'stage-prep';
    const s = String(stage).toLowerCase();
    if (s.includes('preparation')) return 'stage-prep';
    if (s.includes('active')) return 'stage-active';
    if (s.includes('clearance')) return 'stage-clear';
    if (s.includes('teardown')) return 'stage-down';
    if (s.includes('completed')) return 'stage-done';
    return 'stage-prep';
  }
  function getProjects() {
    if (typeof window.getAllProjects === 'function') {
      try { return window.getAllProjects() || []; } catch (e) {}
    }
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('oversight_project_') || key === 'oversight_project_index') continue;
        try { out.push(JSON.parse(localStorage.getItem(key))); } catch (e) {}
      }
    } catch (e) {}
    return out;
  }
  function projectStatus(p) {
    if (!p) return 'active';
    if (p.archived) return 'done';
    const conts = Array.isArray(p.containments) ? p.containments : [];
    const allDone = conts.length > 0 && conts.every(c => /completed/i.test(c.stage || ''));
    if (allDone) return 'done';
    return 'active';
  }
  function projectProgress(p) {
    if (typeof window.calculateMaterialCompletion === 'function') {
      try {
        const r = window.calculateMaterialCompletion(p);
        if (r && typeof r.percent === 'number') return r.percent;
      } catch (e) {}
    }
    const materials = p?.materials || [];
    const containments = p?.containments || [];
    if (!materials.length) return 0;

    const materialIdToName = new Map();
    const projectTotals = new Map();
    materials.forEach(material => {
      const name = String(material.name || '').trim().toLowerCase();
      if (!name) return;
      if (material.id) materialIdToName.set(material.id, name);
      projectTotals.set(name, (projectTotals.get(name) || 0) + (Number(material.totalQuantity) || 0));
    });

    const removedTotals = new Map();
    const removedStage = stage => {
      const s = String(stage || '').toLowerCase();
      return s.includes('clearance') || s.includes('teardown') || s.includes('completed');
    };
    const addRemoved = (name, materialId, qty) => {
      const resolved = materialId && materialIdToName.has(materialId)
        ? materialIdToName.get(materialId)
        : String(name || '').trim().toLowerCase();
      const amount = Number(qty) || 0;
      if (!resolved || amount <= 0) return;
      removedTotals.set(resolved, (removedTotals.get(resolved) || 0) + amount);
    };

    containments.forEach(containment => {
      if (!removedStage(containment.stage)) return;
      const contMats = containment.materials || [];
      if (contMats.length) {
        contMats.forEach(m => addRemoved(m.materialName || m.name, m.materialId, m.totalQuantity ?? m.quantity));
      } else {
        (containment.spaces || []).forEach(space => {
          (space.materials || []).forEach(m => addRemoved(m.name || m.materialName, m.materialId, m.quantity ?? m.totalQuantity));
        });
      }
    });

    let total = 0;
    let removed = 0;
    projectTotals.forEach((qty, name) => {
      total += qty;
      removed += Math.min(removedTotals.get(name) || 0, qty);
    });
    return total > 0 ? Math.min(100, Math.round((removed / total) * 100)) : 0;
  }
  function siteName(p) {
    return p.siteName || p.name || p.projectNumber || 'Untitled';
  }
  function projInitials(p) {
    const txt = (p.projectNumber || siteName(p) || 'P').trim();
    return txt.slice(0, 2).toUpperCase();
  }

  // ============================================================
  // SIDEBAR
  // ============================================================
  function renderSidebarProjects(activeProjectId) {
    const wrap = document.getElementById('sidebar-projects');
    if (!wrap) return;
    const all = getProjects().filter(p => !p.archived);
    all.sort((a, b) => new Date(b.lastModified || 0) - new Date(a.lastModified || 0));
    if (all.length === 0) {
      wrap.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--side-text-faint);">No active projects</div>';
    } else {
      wrap.innerHTML = all.slice(0, 12).map(p => {
        const status = projectStatus(p);
        return `<a href="project.html?id=${esc(p.id)}" class="proj-item" data-active="${activeProjectId === p.id ? 'true' : 'false'}" title="${esc(siteName(p))}">
          <span class="proj-dot" data-status="${status}"></span>
          <span class="proj-text">
            <span class="proj-num">${esc(p.projectNumber || 'No #')}</span>
            <span class="proj-site">${esc(siteName(p))}</span>
          </span>
        </a>`;
      }).join('');
    }
    const navProjCount = document.getElementById('nav-projects-count');
    if (navProjCount) navProjCount.textContent = String(getProjects().filter(p => !p.archived).length);
    const navArchCount = document.getElementById('nav-archive-count');
    if (navArchCount) navArchCount.textContent = String(getProjects().filter(p => p.archived).length);
  }

  function wireSidebarToggle() {
    const btn = document.getElementById('sidebar-collapse-btn');
    const sidebar = document.getElementById('app-sidebar');
    if (!btn || !sidebar) return;
    const saved = localStorage.getItem('oversight_sidebar_collapsed') === 'true';
    if (saved) sidebar.setAttribute('data-collapsed', 'true');
    btn.addEventListener('click', () => {
      const v = sidebar.getAttribute('data-collapsed') === 'true';
      if (v) { sidebar.removeAttribute('data-collapsed'); localStorage.setItem('oversight_sidebar_collapsed', 'false'); }
      else { sidebar.setAttribute('data-collapsed', 'true'); localStorage.setItem('oversight_sidebar_collapsed', 'true'); }
    });
  }

  function wireInspectorBtn() {
    // Click handler is wired by js/inspector-profile.js. We only refresh the
    // visible badge on initial paint (name + avatar initials), and let
    // updateProfileButton() from inspector-profile.js
    // handle subsequent re-paints after save.
    refreshInspectorBadge();
  }
  function refreshInspectorBadge() {
    try {
      const raw = localStorage.getItem('inspector_profile');
      const name = document.getElementById('inspector-profile-name');
      const av = document.getElementById('ins-avatar');
      if (!raw) {
        if (name) name.textContent = 'Set profile';
        if (av) av.textContent = '?';
        return;
      }
      const p = JSON.parse(raw);
      const fullName = p.name || p.fullName || 'Inspector';
      if (name) name.textContent = fullName;
      if (av) {
        const parts = fullName.split(/\s+/).filter(Boolean);
        const initials = (parts[0]?.[0] || '?') + (parts[1]?.[0] || '');
        av.textContent = initials.toUpperCase();
      }
    } catch (e) {}
  }

  // ============================================================
  // TWEAKS PANEL
  // ============================================================
  const TWEAKS_KEY = 'oversight_tweaks';
  function loadTweaks() {
    try { return JSON.parse(localStorage.getItem(TWEAKS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveTweaks(t) { localStorage.setItem(TWEAKS_KEY, JSON.stringify(t)); }
  function applyTweaks(t) {
    const html = document.documentElement;
    html.setAttribute('data-theme', t.theme === 'dark' ? 'dark' : 'light');
    html.setAttribute('data-density', 'comfortable');
    html.setAttribute('data-mono-num', 'on');
    html.style.setProperty('--accent', '#015dab');
  }
  function wireTweaks() {
    const saved = loadTweaks();
    const t = { theme: saved.theme === 'dark' ? 'dark' : 'light' };
    applyTweaks(t);
    const fab = document.getElementById('tweaks-fab');
    const panel = document.getElementById('tweaks-panel');
    if (!fab || !panel) return;
    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
    });
    document.addEventListener('click', (e) => {
      if (panel.hidden) return;
      if (panel.contains(e.target) || fab.contains(e.target)) return;
      panel.hidden = true;
    });
    const dark = document.getElementById('tweak-dark');
    if (dark) {
      dark.setAttribute('data-on', t.theme === 'dark' ? 'true' : 'false');
      dark.addEventListener('click', () => {
        t.theme = t.theme === 'dark' ? 'light' : 'dark';
        dark.setAttribute('data-on', t.theme === 'dark' ? 'true' : 'false');
        applyTweaks(t); saveTweaks(t);
      });
    }
  }

  // ============================================================
  // DASHBOARD (index.html)
  // ============================================================
  let currentDashView = 'today';
  let projectsViewFilter = 'all';
  let dashboardSearchQuery = '';

  function setActiveCrumb(label) {
    const c = document.getElementById('topbar-crumbs');
    if (c) c.innerHTML = `<span class="crumb-current">${esc(label)}</span>`;
  }
  function switchDashView(name) {
    currentDashView = name;
    ['today','projects','archive'].forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.hidden = (v !== name);
    });
    document.querySelectorAll('.nav-item[data-nav]').forEach(b => {
      b.setAttribute('data-active', b.dataset.nav === name ? 'true' : 'false');
    });
    setActiveCrumb(name === 'today' ? 'Today' : name === 'projects' ? 'All Projects' : 'Archive');
    if (name === 'today') renderTodayView();
    else if (name === 'projects') renderProjectsView();
    else renderArchiveView();
  }

  function projectMatchesSearch(p, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    const parts = [
      p.projectNumber, p.siteName, p.name, p.siteAddress, p.clientName,
      p.clientContactName, p.contractor, p.foremanName
    ];
    (p.materials || []).forEach(m => parts.push(m.name, m.unit));
    (p.containments || []).forEach(c => {
      parts.push(c.name, c.containmentNumber, c.stage, c.buildingName);
      (c.materials || []).forEach(m => parts.push(m.name, m.materialName, m.location));
      (c.spaces || []).forEach(s => {
        parts.push(s.name, s.spaceName);
        (s.materials || []).forEach(m => parts.push(m.name, m.materialName));
      });
    });
    (p.airSamples || []).forEach(s => {
      parts.push(s.sampleId, s.sampleNumber, s.type, s.location, s.containmentName, s.materialName);
    });
    (p.dailyLogs || []).forEach(l => {
      parts.push(l.date, l.inspectorName);
      (l.entries || []).forEach(e => parts.push(e.description, e.notes, e.shift));
    });
    return parts.some(value => String(value || '').toLowerCase().includes(q));
  }

  function wireDashboardSearch() {
    const input = document.getElementById('topbar-search');
    if (!input) return;
    input.value = dashboardSearchQuery;
    input.addEventListener('input', () => {
      dashboardSearchQuery = input.value.trim();
      if (dashboardSearchQuery && currentDashView === 'today') {
        switchDashView('projects');
      } else if (currentDashView === 'projects') {
        renderProjectsView();
      } else if (currentDashView === 'archive') {
        renderArchiveView();
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        input.value = '';
        dashboardSearchQuery = '';
        if (currentDashView === 'projects') renderProjectsView();
        else if (currentDashView === 'archive') renderArchiveView();
      }
    });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
  }

  function getRunningAirSamples() {
    const out = [];
    getProjects().filter(p => !p.archived).forEach(p => {
      (p.airSamples || []).forEach(s => {
        if (s.startTime && !s.stopTime) out.push({ project: p, sample: s });
      });
    });
    return out;
  }
  function getAttentionItems() {
    const items = [];
    const today = new Date(); today.setHours(0,0,0,0);
    getProjects().filter(p => !p.archived).forEach(p => {
      (p.airSamples || []).forEach(s => {
        if (s.startTime && !s.stopTime) {
          const started = new Date(s.startTime);
          const hrs = (Date.now() - started.getTime()) / 36e5;
          if (hrs > 12) items.push({ sev:'warn', label:`Sample ${sampleDisplayId(s)} still running`, meta:`${p.projectNumber || siteName(p)} · ${hrs.toFixed(1)}h elapsed`, href:`project.html?id=${p.id}&tab=samples` });
        }
      });
      (p.containments || []).forEach(c => {
        if (/active abatement/i.test(c.stage || '')) {
          items.push({ sev:'todo', label:`Active abatement: ${c.name || c.containmentNumber || ''}`, meta:p.projectNumber || siteName(p), href:`project.html?id=${p.id}&tab=containments` });
        }
      });
    });
    return items.slice(0, 6);
  }
  function getRecentActivity() {
    const acts = [];
    getProjects().filter(p => !p.archived).forEach(p => {
      (p.airSamples || []).forEach(s => {
        if (s.stopTime) acts.push({ when: toActivityDate(s.date, s.stopTime), who:'AIR', type:'sample', text:`Sample ${sampleDisplayId(s)} stopped (${p.projectNumber || siteName(p)})` });
      });
      (p.dailyLogs || []).forEach(l => {
        if (l.date) acts.push({ when:l.date, who:'LOG', type:'log', text:`Daily log entered (${p.projectNumber || siteName(p)})` });
      });
      (p.containments || []).forEach(c => {
        (c.stageHistory || []).forEach(h => {
          if (h.date) acts.push({ when:h.date, who:'STG', type:'stage', text:`${c.name || ''} → ${h.stage} (${p.projectNumber || siteName(p)})` });
        });
        (c.visualInspections || []).forEach(v => {
          acts.push({
            when: v.createdAt || v.date,
            who: 'VIS',
            type: 'inspection',
            status: v.passed ? 'pass' : 'fail',
            text: `${c.name || ''} ${v.type || 'Visual'} inspection ${v.passed ? 'passed' : 'failed'} (${p.projectNumber || siteName(p)})`
          });
        });
      });
    });
    acts.sort((a, b) => activitySortValue(b.when) - activitySortValue(a.when));
    return acts.slice(0, 12);
  }

  function renderTodayView() {
    const view = document.getElementById('view-today');
    if (!view) return;
    const projs = getProjects().filter(p => !p.archived);
    const attn = getAttentionItems();
    const running = getRunningAirSamples();
    const acts = getRecentActivity();
    const totalSamples = projs.reduce((n, p) => n + ((p.airSamples || []).length), 0);
    const totalLogs = projs.reduce((n, p) => n + ((p.dailyLogs || []).length), 0);
    const totalConts = projs.reduce((n, p) => n + ((p.containments || []).length), 0);
    view.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">Today</h1>
          <p class="page-sub">${new Date().toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' })} · ${projs.length} active project${projs.length === 1 ? '' : 's'}</p>
        </div>
        <div class="head-actions">
          <button class="btn-ghost" data-shell-action="new-log">+ Log entry</button>
          <button class="btn-primary" data-shell-action="new-project">${ICONS.plus} New project</button>
        </div>
      </div>
      <div class="today-grid">
        <section class="panel attn-panel">
          <div class="panel-head"><h2 class="panel-title">Needs attention</h2><span class="muted small">${attn.length} item${attn.length === 1 ? '' : 's'}</span></div>
          ${attn.length === 0
            ? '<ul class="attn-list"><li class="empty-row">Nothing urgent. Good work.</li></ul>'
            : `<ul class="attn-list">${attn.map(a => `<li class="attn-row" data-href="${esc(a.href)}"><div class="attn-sev" data-sev="${esc(a.sev)}">${ICONS.alert}</div><div class="attn-text"><div class="attn-label">${esc(a.label)}</div><div class="attn-meta">${esc(a.meta)}</div></div></li>`).join('')}</ul>`}
        </section>
        <section class="panel running-panel">
          <div class="panel-head"><h2 class="panel-title">Running samples</h2><span class="muted small">${running.length}</span></div>
          ${running.length === 0
            ? '<ul class="running-list"><li class="empty-row">No samples currently running.</li></ul>'
            : `<ul class="running-list">${running.map(r => {
                const elapsed = ((Date.now() - new Date(r.sample.startTime).getTime()) / 36e5).toFixed(1);
                return `<li class="running-row" data-href="project.html?id=${esc(r.project.id)}&tab=samples"><div class="run-head"><span class="code mono">${esc(sampleDisplayId(r.sample))}</span><span class="muted small">${esc(r.project.projectNumber || siteName(r.project))}</span></div><div class="run-meta"><span>Elapsed <b>${elapsed}h</b></span><span class="muted">${esc(r.sample.type || '')}</span></div><div class="progress"><span style="width:${Math.min(100, elapsed * 12)}%"></span></div></li>`;
              }).join('')}</ul>`}
        </section>
        <section class="panel activity-panel">
          <div class="panel-head"><h2 class="panel-title">Recent activity</h2></div>
          ${acts.length === 0
            ? '<ul class="activity-list"><li class="empty-row">Nothing yet today.</li></ul>'
            : `<ul class="activity-list">${acts.map(a => `<li class="activity-row"><span class="act-marker act-${esc(a.type)}${a.status ? ` act-${esc(a.status)}` : ''}"></span><span class="act-time">${fmtDate(a.when)} ${fmtTime(a.when)}</span><span class="act-who">${esc(a.who)}</span><span class="act-text">${esc(a.text)}</span></li>`).join('')}</ul>`}
        </section>
        <section class="panel snap-panel">
          <div class="panel-head"><h2 class="panel-title">Snapshot</h2></div>
          <div class="snap-grid">
            <div class="stat stat-hl"><div class="stat-label">Active projects</div><div class="stat-value"><span class="stat-num">${projs.length}</span></div><div class="stat-sub">Across all sites</div></div>
            <div class="stat"><div class="stat-label">Containments</div><div class="stat-value"><span class="stat-num">${totalConts}</span></div></div>
            <div class="stat"><div class="stat-label">Air samples</div><div class="stat-value"><span class="stat-num">${totalSamples}</span></div></div>
            <div class="stat"><div class="stat-label">Daily logs</div><div class="stat-value"><span class="stat-num">${totalLogs}</span></div></div>
          </div>
          <div class="snap-projects">
            ${projs.length === 0 ? '<div class="empty-row">No projects yet.</div>' : projs.slice(0, 6).map(p => {
              const prog = projectProgress(p);
              return `<a class="proj-row" href="project.html?id=${esc(p.id)}"><span class="proj-dot" data-status="${projectStatus(p)}"></span><div class="proj-row-main"><div class="proj-row-num mono">${esc(p.projectNumber || '—')}</div><div class="proj-row-site">${esc(siteName(p))}</div></div><div class="proj-row-meta"><div class="bar"><span style="width:${prog}%"></span></div><span class="due-pill mono">${prog}%</span></div></a>`;
            }).join('')}
          </div>
        </section>
      </div>
    `;
    view.querySelectorAll('[data-href]').forEach(el => {
      el.addEventListener('click', () => { location.href = el.dataset.href; });
    });
    view.querySelectorAll('[data-shell-action="new-project"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openNewProjectModal === 'function') window.openNewProjectModal();
    }));
    view.querySelectorAll('[data-shell-action="new-log"]').forEach(b => b.addEventListener('click', () => {
      if (projs.length === 0) { showShellNote('Create a project first.'); return; }
      // Open the most recently modified project's daily log
      const p = projs.slice().sort((a, b) => new Date(b.lastModified || 0) - new Date(a.lastModified || 0))[0];
      location.href = `project.html?id=${p.id}&tab=logs&new=1`;
    }));
  }

  function renderProjectsView() {
    const view = document.getElementById('view-projects');
    if (!view) return;
    const all = getProjects().filter(p => !p.archived);
    const bySegment = projectsViewFilter === 'all' ? all : all.filter(p => projectsViewFilter === 'active' ? projectStatus(p) === 'active' : projectStatus(p) === 'done');
    const filtered = bySegment.filter(p => projectMatchesSearch(p, dashboardSearchQuery));
    filtered.sort((a, b) => new Date(b.lastModified || 0) - new Date(a.lastModified || 0));
    view.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">All Projects</h1>
          <p class="page-sub">${filtered.length} of ${all.length} project${all.length === 1 ? '' : 's'}${dashboardSearchQuery ? ` matching "${esc(dashboardSearchQuery)}"` : ''}</p>
        </div>
        <div class="head-actions">
          <div class="seg" id="proj-filter">
            <button class="seg-btn" data-value="active" data-active="${projectsViewFilter === 'active' ? 'true' : 'false'}">Active</button>
            <button class="seg-btn" data-value="done" data-active="${projectsViewFilter === 'done' ? 'true' : 'false'}">Completed</button>
            <button class="seg-btn" data-value="all" data-active="${projectsViewFilter === 'all' ? 'true' : 'false'}">All</button>
          </div>
          <button class="btn-primary" data-shell-action="new-project">${ICONS.plus} New project</button>
        </div>
      </div>
      ${filtered.length === 0 ? '<div class="empty-state"><div class="title">No projects to show</div><div class="sub">Use the New Project button to get started.</div></div>' : `
      <div class="proj-table">
        <div class="proj-th"><span>Project / Site</span><span>Project #</span><span>Address</span><span>Cont.</span><span>Samples</span><span>Progress</span><span></span></div>
        ${filtered.map(p => {
          const prog = projectProgress(p);
          return `<div class="proj-tr" data-href="project.html?id=${esc(p.id)}">
            <div class="proj-cell-main"><span class="proj-dot" data-status="${projectStatus(p)}"></span><div><div class="proj-cell-site">${esc(siteName(p))}</div><div class="proj-cell-addr muted small">${esc(p.siteAddress || '—')}</div></div></div>
            <div class="proj-cell mono">${esc(p.projectNumber || '—')}</div>
            <div class="proj-cell">${esc(p.siteAddress || '—')}</div>
            <div class="proj-cell mono">${(p.containments || []).length}</div>
            <div class="proj-cell mono">${(p.airSamples || []).length}</div>
            <div class="proj-cell"><div class="bar"><span style="width:${prog}%"></span></div><span class="due-pill mono">${prog}%</span></div>
            <div class="proj-cell" style="justify-content:flex-end;gap:4px;">
              <button class="icon-btn small" title="Edit" data-action="edit" data-id="${esc(p.id)}">${ICONS.pencil}</button>
              <button class="icon-btn small" title="Export" data-action="export" data-id="${esc(p.id)}">${ICONS.download}</button>
              <button class="icon-btn small" title="Archive" data-action="archive" data-id="${esc(p.id)}" data-name="${esc(siteName(p))}">${ICONS.folder}</button>
              <button class="icon-btn small" title="Delete" data-action="delete" data-id="${esc(p.id)}">${ICONS.trash}</button>
            </div>
          </div>`;
        }).join('')}
      </div>`}
    `;
    view.querySelectorAll('.proj-tr[data-href]').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        location.href = row.dataset.href;
      });
    });
    view.querySelectorAll('[data-action="edit"]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.editProjectFromDashboard === 'function') window.editProjectFromDashboard(b.dataset.id);
    }));
    view.querySelectorAll('[data-action="export"]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.handleExportProject === 'function') window.handleExportProject(b.dataset.id);
    }));
    view.querySelectorAll('[data-action="archive"]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.archiveProject === 'function') {
        window.archiveProject(b.dataset.id, b.dataset.name);
      } else {
        const p = getProjects().find(project => project.id === b.dataset.id);
        if (!p || !confirm(`Archive "${siteName(p)}"? This will move it to the Archive list.`)) return;
        p.archived = true;
        p.archivedAt = new Date().toISOString();
        p.lastModified = new Date().toISOString();
        localStorage.setItem('oversight_project_' + p.id, JSON.stringify(p));
        renderSidebarProjects(null);
        renderProjectsView();
      }
    }));
    view.querySelectorAll('[data-action="delete"]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof window.deleteProject === 'function') {
        window.deleteProject(b.dataset.id);
      } else {
        showShellNote('Delete is not available in this build.');
      }
    }));
    const seg = view.querySelector('#proj-filter');
    if (seg) seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      projectsViewFilter = b.dataset.value;
      renderProjectsView();
    }));
    view.querySelectorAll('[data-shell-action="new-project"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openNewProjectModal === 'function') window.openNewProjectModal();
    }));
  }

  function renderArchiveView() {
    const view = document.getElementById('view-archive');
    if (!view) return;
    const all = getProjects().filter(p => p.archived).filter(p => projectMatchesSearch(p, dashboardSearchQuery));
    all.sort((a, b) => new Date(b.archivedAt || b.lastModified || 0) - new Date(a.archivedAt || a.lastModified || 0));
    view.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-title">Archive</h1>
          <p class="page-sub">${all.length} archived project${all.length === 1 ? '' : 's'}</p>
        </div>
      </div>
      ${all.length === 0 ? '<div class="empty-state"><div class="title">No archived projects</div><div class="sub">Completed projects show here after archiving.</div></div>' : `
      <div class="archive-list">
        ${all.map(p => `<div class="arc-row">
          <div><div class="proj-cell-site">${esc(siteName(p))}</div><div class="muted small mono">${esc(p.projectNumber || '—')}</div></div>
          <div class="proj-cell">${esc(p.siteAddress || '')}</div>
          <div class="muted small">Archived ${fmtDateFull(p.archivedAt)}</div>
          <div class="head-actions">
            <button class="btn-ghost small" data-action="download" data-id="${esc(p.id)}" data-name="${esc(siteName(p))}">${ICONS.folder} Download</button>
            <button class="btn-ghost small" data-action="unarchive" data-id="${esc(p.id)}" data-name="${esc(siteName(p))}">Unarchive</button>
            <button class="btn-ghost small danger" data-action="delete" data-id="${esc(p.id)}">${ICONS.trash}</button>
          </div>
        </div>`).join('')}
      </div>`}
    `;
    view.querySelectorAll('[data-action="unarchive"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.unarchiveProject === 'function') window.unarchiveProject(b.dataset.id, b.dataset.name);
    }));
    view.querySelectorAll('[data-action="download"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.downloadArchivedProject === 'function') window.downloadArchivedProject(b.dataset.id, b.dataset.name);
    }));
    view.querySelectorAll('[data-action="delete"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.deleteProject === 'function') window.deleteProject(b.dataset.id);
    }));
  }

  function showShellNote(msg) {
    if (typeof window.showNotification === 'function') window.showNotification(msg);
  }
  function archiveCurrentProject() {
    const p = getCurrentProject();
    if (!p?.id) return;
    if (!confirm(`Archive "${siteName(p)}"? It will move to the Archive list.`)) return;
    p.archived = true;
    p.archivedAt = new Date().toISOString();
    p.lastModified = new Date().toISOString();
    localStorage.setItem('oversight_project_' + p.id, JSON.stringify(p));
    try { window.currentProject = p; } catch (e) {}
    showShellNote(`${siteName(p)} archived.`);
    location.href = 'index.html?view=archive';
  }
  function deleteCurrentProject() {
    const p = getCurrentProject();
    if (!p?.id) return;
    if (typeof window.deleteProject === 'function') {
      window.deleteProject(p.id);
      return;
    }
    if (!confirm(`Delete "${siteName(p)}"? This cannot be undone.`)) return;
    localStorage.removeItem('oversight_project_' + p.id);
    showShellNote(`${siteName(p)} deleted.`);
    location.href = 'index.html';
  }

  function initDashboard() {
    wireSidebarToggle();
    wireInspectorBtn();
    wireTweaks();
    wireDashboardSearch();
    renderSidebarProjects(null);
    document.querySelectorAll('.nav-item[data-nav]').forEach(b => {
      b.addEventListener('click', () => switchDashView(b.dataset.nav));
    });
    const params = new URLSearchParams(location.search);
    const initView = params.get('view') || 'today';
    switchDashView(['today','projects','archive'].includes(initView) ? initView : 'today');
  }

  // ============================================================
  // PROJECT WORKSPACE (project.html)
  // ============================================================
  let currentTab = 'overview';

  function getCurrentProject() {
    if (window.currentProject) return window.currentProject;
    const id = new URLSearchParams(location.search).get('id');
    if (!id) return null;
    try {
      return JSON.parse(localStorage.getItem('oversight_project_' + id) || 'null');
    } catch (e) { return null; }
  }

  function renderProjectHead(p) {
    const num = document.getElementById('proj-head-num');
    const title = document.getElementById('oversight-project-number');
    const meta = document.getElementById('proj-head-meta');
    const crumb = document.getElementById('crumb-project');
    const statusPill = document.getElementById('proj-head-status');
    const statusLabel = document.getElementById('proj-head-status-label');
    const progBar = document.getElementById('proj-head-progress-bar');
    const progVal = document.getElementById('proj-head-progress-val');
    if (num) num.textContent = p.projectNumber || '—';
    if (title) title.textContent = siteName(p);
    if (crumb) crumb.textContent = siteName(p);
    const status = projectStatus(p);
    if (statusPill) {
      statusPill.className = 'status-pill ' + status;
      if (statusLabel) statusLabel.textContent = status === 'done' ? 'Completed' : status === 'overdue' ? 'Overdue' : 'Active';
    }
    if (meta) {
      const parts = [];
      if (p.siteAddress) parts.push(`<span>${ICONS.bldg} ${esc(p.siteAddress)}</span>`);
      if (p.contractor) parts.push(`<span>${ICONS.user} ${esc(p.contractor)}</span>`);
      if (p.clientName) parts.push(`<span>${esc(p.clientName)}</span>`);
      meta.innerHTML = parts.join('');
    }
    const prog = projectProgress(p);
    if (progBar) progBar.style.width = prog + '%';
    if (progVal) progVal.textContent = prog + '%';
    // Tab counts
    setCount('tabcount-containments', (p.containments || []).length);
    setCount('tabcount-samples', (p.airSamples || []).length);
    setCount('tabcount-logs', (p.dailyLogs || []).length);
    setCount('tabcount-materials', (p.materials || []).length);
    setCount('tabcount-workers', (p.workerRoster || []).length);
  }
  function setCount(id, n) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(n);
  }

  function switchTab(name) {
    if (!['overview','containments','samples','logs','materials','team','docs'].includes(name)) name = 'overview';
    currentTab = name;
    document.querySelectorAll('.proj-tab[data-tab]').forEach(b => b.setAttribute('data-active', b.dataset.tab === name ? 'true' : 'false'));
    document.querySelectorAll('.tab-pane[data-tab]').forEach(el => { el.hidden = (el.dataset.tab !== name); });
    const p = getCurrentProject();
    if (!p) return;
    if (name === 'overview') renderTabOverview(p);
    else if (name === 'containments') renderTabContainments(p);
    else if (name === 'samples') renderTabSamples(p);
    else if (name === 'logs') renderTabLogs(p);
    else if (name === 'materials') renderTabMaterials(p);
    else if (name === 'team') renderTabTeam(p);
    else if (name === 'docs') renderTabDocs(p);
  }

  // ---------- OVERVIEW TAB ----------
  function renderTabOverview(p) {
    const wrap = document.getElementById('tab-overview');
    if (!wrap) return;
    const conts = p.containments || [];
    const samples = p.airSamples || [];
    const logs = p.dailyLogs || [];
    const workers = p.workerRoster || [];
    const materials = p.materials || [];
    const pendingSamples = samples.filter(s => s.startTime && !s.stopTime).length;
    const recent = getProjectActivity(p).slice(0, 10);
    const STAGES = ['Preparation','Active','Clearance','Teardown','Completed'];
    wrap.innerHTML = `
      <div class="kpi-row">
        <div class="kpi"><div class="kpi-l">Containments</div><div class="kpi-v"><span class="kpi-num">${conts.length}</span></div><div class="kpi-s">${conts.filter(c => /active/i.test(c.stage || '')).length} active</div></div>
        <div class="kpi ${pendingSamples > 0 ? 'kpi-warn' : ''}"><div class="kpi-l">Samples</div><div class="kpi-v"><span class="kpi-num">${samples.length}</span></div><div class="kpi-s">${pendingSamples} pending</div></div>
        <div class="kpi"><div class="kpi-l">Daily logs</div><div class="kpi-v"><span class="kpi-num">${logs.length}</span></div></div>
        <div class="kpi"><div class="kpi-l">Workers</div><div class="kpi-v"><span class="kpi-num">${workers.length}</span></div></div>
        <div class="kpi"><div class="kpi-l">Materials</div><div class="kpi-v"><span class="kpi-num">${materials.length}</span></div></div>
        <div class="kpi"><div class="kpi-l">Documents</div><div class="kpi-v"><span class="kpi-num">${(p.documents || []).length}</span></div></div>
      </div>
      <div class="ovr-grid">
        <section class="panel">
          <div class="panel-head"><h2 class="panel-title">Containment lifecycle</h2><button class="btn-link small" data-action="new-cont">+ New containment</button></div>
          ${conts.length === 0
            ? '<div class="empty-row" style="padding:24px;">No containments yet.</div>'
            : `<div class="lifecycle">${conts.map(c => {
                const cur = (c.stage || '').toLowerCase();
                let stIdx = 0;
                if (cur.includes('active')) stIdx = 1;
                else if (cur.includes('clearance')) stIdx = 2;
                else if (cur.includes('teardown')) stIdx = 3;
                else if (cur.includes('completed')) stIdx = 4;
                return `<div class="lifecycle-row">
                  <div class="lc-head">
                    <span class="lc-code mono">${esc(c.containmentNumber || c.code || '—')}</span>
                    <span class="lc-name">${esc(c.name || 'Unnamed')}</span>
                    <span class="stage-badge ${stageClass(c.stage)}"><span class="stage-dot"></span>${esc(c.stage || '—')}</span>
                  </div>
                  <div class="lc-track">${STAGES.map((s, i) => {
                    const state = i < stIdx ? 'done' : i === stIdx ? 'active' : 'pending';
                    const bar = i < STAGES.length - 1 ? `<div class="lc-bar" data-done="${i < stIdx ? 'true' : 'false'}"></div>` : '';
                    return `<div class="lc-step"><div class="lc-dot" data-state="${state}">${i + 1}</div><div class="lc-label">${esc(s)}</div></div>${bar}`;
                  }).join('')}</div>
                </div>`;
              }).join('')}</div>`}
        </section>
        <section class="panel">
          <div class="panel-head"><h2 class="panel-title">Recent activity</h2></div>
          ${recent.length === 0 ? '<div class="empty-row" style="padding:24px;">Nothing yet.</div>'
            : `<ul class="activity-list">${recent.map(a => `<li class="activity-row"><span class="act-marker act-${esc(a.type)}${a.status ? ` act-${esc(a.status)}` : ''}"></span><span class="act-time">${fmtDate(a.when)} ${fmtTime(a.when)}</span><span class="act-who">${esc(a.who)}</span><span class="act-text">${esc(a.text)}</span></li>`).join('')}</ul>`}
        </section>
      </div>
    `;
    wrap.querySelectorAll('[data-action="new-cont"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openAddContainmentModal === 'function') window.openAddContainmentModal();
    }));
  }

  function getProjectActivity(p) {
    const out = [];
    (p.airSamples || []).forEach(s => {
      if (s.stopTime) out.push({ when: toActivityDate(s.date, s.stopTime), who:'AIR', type:'sample', text:`Sample ${sampleDisplayId(s)} stopped` });
      else if (s.startTime) out.push({ when: toActivityDate(s.date, s.startTime), who:'AIR', type:'sample', text:`Sample ${sampleDisplayId(s)} started` });
    });
    (p.dailyLogs || []).forEach(l => {
      (l.entries || []).forEach(e => {
        out.push({ when:e.timestamp || l.date, who:'LOG', type:'log', text:`Log entry: ${(e.notes || '').slice(0, 60)}` });
      });
    });
    (p.containments || []).forEach(c => {
      (c.stageHistory || []).forEach(h => out.push({ when:h.date, who:'STG', type:'stage', text:`${c.name || ''} → ${h.stage}` }));
      (c.visualInspections || []).forEach(v => out.push({
        when: v.createdAt || v.date,
        who: 'VIS',
        type: 'inspection',
        status: v.passed ? 'pass' : 'fail',
        text: `${c.name || ''} ${v.type || 'Visual'} inspection ${v.passed ? 'passed' : 'failed'}`
      }));
    });
    out.sort((a, b) => activitySortValue(b.when) - activitySortValue(a.when));
    return out;
  }

  // ---------- CONTAINMENTS TAB ----------
  let containSelectedId = null;
  function renderTabContainments(p) {
    const wrap = document.getElementById('tab-containments');
    if (!wrap) return;
    const conts = (p.containments || []).slice();
    if (conts.length > 0 && !conts.find(c => c.id === containSelectedId)) {
      containSelectedId = conts[0].id;
    }
    const sel = conts.find(c => c.id === containSelectedId);
    wrap.innerHTML = `
      <div class="masterdetail">
        <aside class="md-list">
          <div class="md-list-head"><div class="md-list-title">Containments · ${conts.length}</div><button class="btn-ghost small" data-action="add-cont">+ Add</button></div>
          <div class="md-list-body">
            ${conts.length === 0 ? '<div class="empty-row" style="padding:24px;">No containments yet.</div>'
              : conts.map(c => `<button class="md-row" data-active="${c.id === containSelectedId ? 'true' : 'false'}" data-id="${esc(c.id)}">
                  <div class="md-row-top"><span class="md-code mono">${esc(c.containmentNumber || c.code || '—')}</span><span class="stage-badge ${stageClass(c.stage)}"><span class="stage-dot"></span>${esc((c.stage || '').replace(/^Containment /, ''))}</span></div>
                  <div class="md-row-name">${esc(c.name || 'Unnamed')}</div>
                  <div class="md-row-stats">
                    <span class="mini-stat">${ICONS.doc} ${(c.materials || []).length} mat</span>
                    <span class="mini-stat">${ICONS.bell} ${(c.airSamples || []).length} samp</span>
                  </div>
                </button>`).join('')}
          </div>
        </aside>
        <div class="cdetail">${sel ? renderContainmentDetail(p, sel) : '<div class="empty-state"><div class="title">Select a containment</div><div class="sub">Choose from the list to see details.</div></div>'}</div>
      </div>
    `;
    wrap.querySelectorAll('.md-row[data-id]').forEach(b => b.addEventListener('click', () => {
      containSelectedId = b.dataset.id;
      renderTabContainments(getCurrentProject());
    }));
    wrap.querySelectorAll('[data-action="add-cont"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openAddContainmentModal === 'function') window.openAddContainmentModal();
    }));
    wrap.querySelectorAll('[data-action="edit-cont"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openEditContainmentModal === 'function') window.openEditContainmentModal(b.dataset.id);
    }));
    wrap.querySelectorAll('[data-action="advance-cont"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openEditContainmentModal === 'function') window.openEditContainmentModal(b.dataset.id);
    }));
    wrap.querySelectorAll('[data-action="del-cont"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.deleteContainment === 'function') window.deleteContainment(b.dataset.id);
    }));
  }

  function renderContainmentDetail(p, c) {
    const samples = (p.airSamples || []).filter(s => s.containmentId === c.id || s.containmentName === c.name);
    const logs = (p.dailyLogs || []).flatMap(l => (l.entries || []).filter(e => e.containmentId === c.id || e.containmentName === c.name).map(e => ({ entry:e, date:l.date })));
    const mats = c.materials || [];
    const completed = samples.filter(s => s.stopTime).length;
    const historyItems = [
      ...(c.stageHistory || []).map(h => ({ kind:'stage', when:h.date, label:h.stage || 'Stage updated', meta:h.inspectorName || '' })),
      ...(c.visualInspections || []).map(v => ({
        kind:'inspection',
        when:v.createdAt || v.date,
        label:`${v.type || 'Visual'} Visual: ${v.passed ? 'Pass' : 'Fail'}`,
        meta:v.inspectorName || v.comments || '',
        passed: !!v.passed
      }))
    ].sort((a, b) => activitySortValue(b.when) - activitySortValue(a.when));
    return `
      <header class="cdetail-head">
        <div>
          <div class="cdetail-row">
            <span class="pill-num mono">${esc(c.containmentNumber || '—')}</span>
            <span class="stage-badge ${stageClass(c.stage)}"><span class="stage-dot"></span>${esc(c.stage || '—')}</span>
          </div>
          <h2 class="cdetail-title">${esc(c.name || 'Unnamed')}</h2>
          <div class="cdetail-meta">${c.location ? `<span>${ICONS.bldg} ${esc(c.location)}</span>` : ''}${c.contractor ? `<span>${ICONS.user} ${esc(c.contractor)}</span>` : ''}</div>
        </div>
        <div class="cdetail-actions">
          <button class="btn-ghost" data-action="edit-cont" data-id="${esc(c.id)}">${ICONS.pencil} Edit</button>
          <button class="btn-primary" data-action="advance-cont" data-id="${esc(c.id)}">${ICONS.arrow} Advance stage</button>
        </div>
      </header>
      <div class="cdetail-kpis">
        <div class="cdet-kpi"><div class="cdet-kpi-l">Materials</div><div class="cdet-kpi-v">${mats.length}</div></div>
        <div class="cdet-kpi"><div class="cdet-kpi-l">Samples</div><div class="cdet-kpi-v">${samples.length}</div></div>
        <div class="cdet-kpi"><div class="cdet-kpi-l">Complete</div><div class="cdet-kpi-v kpi-ok">${completed}</div></div>
        <div class="cdet-kpi"><div class="cdet-kpi-l">Daily logs</div><div class="cdet-kpi-v">${logs.length}</div></div>
        <div class="cdet-kpi"><div class="cdet-kpi-l">Stage</div><div class="cdet-kpi-v" style="font-size:12px;">${esc(c.stage || '—')}</div></div>
      </div>
      <div class="cdetail-next">
        ${ICONS.alert}
        <span class="cnext-label">Next action:</span>
        <span><b>${esc(nextActionFor(c))}</b></span>
        <span class="cnext-due muted small">${esc(c.dueDate ? 'Due ' + fmtDateFull(c.dueDate) : '')}</span>
      </div>
      <div class="cdetail-cols">
        <section class="panel">
          <div class="panel-head"><h2 class="panel-title">Recent logs</h2></div>
          ${logs.length === 0 ? '<div class="empty-row" style="padding:18px;">No log entries yet.</div>'
            : `<ul class="log-list">${logs.slice(0, 6).map(L => `<li class="log-row"><div class="log-date"><div class="log-day mono">${new Date(L.date || L.entry.timestamp || Date.now()).getDate()}</div><div class="log-mon">${new Date(L.date || L.entry.timestamp || Date.now()).toLocaleString(undefined, { month:'short' })}</div></div><div><div class="log-meta"><span class="muted">${esc(L.entry.shift || '')}</span><span class="muted">${esc(L.entry.crewCount ? L.entry.crewCount + ' workers' : '')}</span></div><div class="log-note">${esc((L.entry.notes || '').slice(0, 180))}</div></div></li>`).join('')}</ul>`}
        </section>
        <section class="panel">
          <div class="panel-head"><h2 class="panel-title">Samples</h2></div>
          ${samples.length === 0 ? '<div class="empty-row" style="padding:18px;">No samples.</div>'
            : `<div class="samp-mini">${samples.slice(0, 6).map(s => `<div class="samp-row-mini"><div class="samp-l"><span class="mono">${esc(sampleDisplayId(s))}</span></div><div class="muted small">${esc(s.type || '')}</div><div class="samp-r"><span class="samp-status ${s.stopTime ? 'status-complete' : s.startTime ? 'status-running' : 'status-collected'}">${s.stopTime ? 'Done' : s.startTime ? 'Running' : 'Queued'}</span></div></div>`).join('')}</div>`}
        </section>
        <section class="panel">
          <div class="panel-head"><h2 class="panel-title">Materials in this containment</h2></div>
          ${mats.length === 0 ? '<div class="empty-row" style="padding:18px;">No materials linked.</div>'
            : `<ul class="mat-list">${mats.map(m => `<li class="mat-row"><div class="mat-name">${esc(m.name || m.materialName || '—')}</div><div class="muted small">${esc(m.location || '')}</div></li>`).join('')}</ul>`}
        </section>
        <section class="panel">
          <div class="panel-head"><h2 class="panel-title">History</h2></div>
          ${historyItems.length === 0 ? '<div class="empty-row" style="padding:18px;">No history yet.</div>'
            : `<ul class="history-list">${historyItems.map((h, i) => `<li class="hist-row"><span class="hist-dot" data-active="${i === 0 ? 'true' : 'false'}" style="${h.kind === 'inspection' && !h.passed ? 'background:#dc2626;' : ''}"></span><span class="hist-stage">${esc(h.label)}${h.meta ? `<span class="muted small"> · ${esc(h.meta)}</span>` : ''}</span><span class="muted small mono">${fmtDateFull(h.when)}</span></li>`).join('')}</ul>`}
        </section>
      </div>
    `;
  }
  function nextActionFor(c) {
    const s = (c.stage || '').toLowerCase();
    if (!s || s.includes('preparation')) return 'Complete pre-abatement visual inspection';
    if (s.includes('active')) return 'Daily monitoring + collect personal/area samples';
    if (s.includes('clearance')) return 'Run clearance samples + visual inspection';
    if (s.includes('teardown')) return 'Tear down containment and document';
    return 'Containment complete';
  }

  // ---------- SAMPLES TAB ----------
  let samplesFilterType = 'all';
  let samplesFilterCont = 'all';
  function renderTabSamples(p) {
    const wrap = document.getElementById('tab-samples');
    if (!wrap) return;
    if (samplesFilterType === 'background') samplesFilterType = 'all';
    let samples = (p.airSamples || []).slice();
    if (samplesFilterType !== 'all') samples = samples.filter(s => (s.type || '').toLowerCase().includes(samplesFilterType));
    if (samplesFilterCont !== 'all') samples = samples.filter(s => s.containmentId === samplesFilterCont || s.containmentName === samplesFilterCont);
    samples.sort((a, b) => new Date(b.collectionDate || b.startTime || 0) - new Date(a.collectionDate || a.startTime || 0));
    const running = samples.filter(s => s.startTime && !s.stopTime).length;
    const complete = samples.filter(s => s.stopTime).length;
    const conts = p.containments || [];
    wrap.innerHTML = `
      <div class="filter-bar">
        <div class="seg" id="samp-type">
          <button class="seg-btn" data-value="all" data-active="${samplesFilterType === 'all'}">All</button>
          <button class="seg-btn" data-value="area" data-active="${samplesFilterType === 'area'}">Area</button>
          <button class="seg-btn" data-value="personal" data-active="${samplesFilterType === 'personal'}">Personal</button>
          <button class="seg-btn" data-value="clearance" data-active="${samplesFilterType === 'clearance'}">Clearance</button>
        </div>
        <select class="select" id="samp-cont">
          <option value="all">All containments</option>
          ${conts.map(c => `<option value="${esc(c.id)}" ${samplesFilterCont === c.id ? 'selected' : ''}>${esc(c.name || c.containmentNumber || '—')}</option>`).join('')}
        </select>
        <div class="filter-spacer"></div>
        <button class="btn-ghost" id="print-air-samples-btn">${ICONS.doc} Print request</button>
        <button class="btn-primary" id="new-air-sample-btn">${ICONS.plus} Add sample</button>
      </div>
      <div class="samples-table">
        <div class="samp-th"><span>Sample #</span><span>Type</span><span>Cont.</span><span>Material</span><span>Flow</span><span>Start</span><span>Stop</span><span class="r">Vol (L)</span><span>Status</span></div>
        ${samples.length === 0 ? '<div class="empty-row" style="padding:32px;">No samples match the filter.</div>'
          : samples.map(s => {
              const running = s.startTime && !s.stopTime;
              const done = !!s.stopTime;
              const vol = sampleVolume(s);
              return `<div class="samp-tr" data-id="${esc(s.id)}">
                <span class="mono">${esc(sampleDisplayId(s))}</span>
                <span>${esc(s.type || '—')}</span>
                <span class="muted small">${esc(s.containmentName || (conts.find(c => c.id === s.containmentId)?.name) || '—')}</span>
                <span class="muted small">${esc(s.materialName || '—')}</span>
                <span class="mono small">${esc(s.startFlowRate ? s.startFlowRate + ' L/min' : '—')}</span>
                <span class="mono small">${formatSampleTime(s, 'startTime')}</span>
                <span class="mono small">${formatSampleTime(s, 'stopTime')}</span>
                <span class="r mono">${vol === null ? '—' : esc(vol)}</span>
                <span>${done ? '<span class="samp-status status-complete">Done</span>' : running ? '<span class="running-pip"><span class="run-dot"></span>Running</span>' : '<span class="samp-status status-collected">Queued</span>'}</span>
              </div>`;
            }).join('')}
      </div>
      <div class="samp-summary">
        <div class="samp-sum"><div class="samp-sum-l">Total</div><div class="samp-sum-v">${samples.length}</div></div>
        <div class="samp-sum samp-sum-info"><div class="samp-sum-l">Running</div><div class="samp-sum-v">${running}</div></div>
        <div class="samp-sum"><div class="samp-sum-l">Complete</div><div class="samp-sum-v">${complete}</div></div>
        <div class="samp-sum samp-sum-warn"><div class="samp-sum-l">Pending</div><div class="samp-sum-v">${samples.length - running - complete}</div></div>
      </div>
    `;
    wrap.querySelectorAll('.samp-tr[data-id]').forEach(r => r.addEventListener('click', () => {
      if (typeof window.openEditAirSampleModal === 'function') window.openEditAirSampleModal(r.dataset.id);
    }));
    wrap.querySelectorAll('#samp-type button').forEach(b => b.addEventListener('click', () => { samplesFilterType = b.dataset.value; renderTabSamples(getCurrentProject()); }));
    wrap.querySelector('#samp-cont')?.addEventListener('change', (e) => { samplesFilterCont = e.target.value; renderTabSamples(getCurrentProject()); });
    wrap.querySelector('#new-air-sample-btn')?.addEventListener('click', () => {
      if (typeof window.openAddAirSampleModal === 'function') window.openAddAirSampleModal();
    });
    wrap.querySelector('#print-air-samples-btn')?.addEventListener('click', () => {
      if (typeof window.openPrintAirSamplesModal === 'function') window.openPrintAirSamplesModal();
    });
  }

  // ---------- LOGS TAB ----------
  function renderTabLogs(p) {
    const wrap = document.getElementById('tab-logs');
    if (!wrap) return;
    const logs = (p.dailyLogs || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    wrap.innerHTML = `
      <div class="filter-bar">
        <div class="filter-spacer"></div>
        <button class="btn-primary" id="new-daily-log-btn">${ICONS.plus} New daily log</button>
      </div>
      ${logs.length === 0 ? '<div class="empty-state"><div class="title">No daily logs yet</div><div class="sub">Create the first log entry for this project.</div></div>'
        : `<div class="timeline">${logs.map(L => {
            const d = new Date(L.date);
            const entries = (L.entries || []).slice().sort((a, b) => entrySortValue(b) - entrySortValue(a));
            return `<div class="tl-day"><div class="tl-day-head"><div class="tl-date"><div class="tl-d mono">${d.getDate()}</div><div class="tl-m">${d.toLocaleString(undefined, { month:'short' })}</div></div><div class="tl-rule"></div><button class="btn-ghost small" data-action="add-entry" data-log-id="${esc(L.id)}">+ Entry</button><button class="btn-ghost small" data-action="edit-log" data-log-id="${esc(L.id)}">${ICONS.pencil} Header</button></div>
              <div class="tl-day-body">
                ${entries.length === 0 ? '<div class="muted small" style="padding:8px 0;">No entries.</div>'
                  : entries.map(e => renderLogEntryCard(e, L.id)).join('')}
              </div></div>`;
          }).join('')}</div>`}
    `;
    wrap.querySelector('#new-daily-log-btn')?.addEventListener('click', () => {
      if (typeof window.openProjectDailyLogModal === 'function') window.openProjectDailyLogModal();
    });
    wrap.querySelectorAll('[data-action="add-entry"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openProjectDailyLogEntryModal === 'function') window.openProjectDailyLogEntryModal(b.dataset.logId);
    }));
    wrap.querySelectorAll('[data-action="edit-log"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openProjectDailyLogModal === 'function') window.openProjectDailyLogModal(b.dataset.logId);
    }));
    wrap.querySelectorAll('[data-action="edit-entry"]').forEach(b => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (typeof window.openProjectDailyLogEntryEditModal === 'function') window.openProjectDailyLogEntryEditModal(b.dataset.logId, b.dataset.entryId);
    }));
    wrap.querySelectorAll('.toggle-photos-btn').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const container = btn.nextElementSibling;
        if (!container || !container.classList.contains('tl-photos')) return;
        const count = container.querySelectorAll('img').length;
        const willShow = container.classList.contains('hidden');
        container.classList.toggle('hidden', !willShow);
        btn.textContent = willShow ? 'Hide photos' : `Show photos (${count})`;
      });
    });
  }

  // ---------- MATERIALS TAB ----------
  function renderTabMaterials(p) {
    const wrap = document.getElementById('tab-materials');
    if (!wrap) return;
    const blds = p.buildings || [];
    const allMats = p.materials || [];
    wrap.innerHTML = `
      <div class="filter-bar">
        <div class="filter-spacer"></div>
        <button class="btn-ghost" id="add-material-btn">${ICONS.plus} New material</button>
        <button class="btn-primary" id="add-building-btn">${ICONS.plus} New building</button>
      </div>
      ${(blds.length === 0 && allMats.length === 0)
        ? '<div class="empty-state"><div class="title">No buildings or materials yet</div><div class="sub">Add a building and then assign materials to its spaces.</div></div>'
        : `${allMats.length > 0 ? `<section class="panel" style="margin-bottom:16px;"><div class="panel-head"><h2 class="panel-title">Site materials · ${allMats.length}</h2><span class="muted small">Double-click a material to take a bulk sample</span></div><ul class="mat-list">${allMats.map(m => `<li class="mat-row" data-material-id="${esc(m.id)}" title="Double-click to add bulk sample"><div class="mat-name">${esc(m.name)}</div><div class="mat-qty-line muted small mono">${formatQty(m.totalQuantity || 0)} ${esc(displayUnit(m.unit, 'units'))}${m.type ? ` <span class="mat-type-tag">${esc(m.type)}</span>` : ''}</div><div class="mat-row-actions"><button class="btn-ghost small" data-action="edit-mat" data-id="${esc(m.id)}">Edit</button><button class="btn-ghost small danger" data-action="del-mat" data-id="${esc(m.id)}">Delete</button></div></li>`).join('')}</ul></section>` : ''}
        <div class="tree">${blds.map(b => `<div class="tree-bldg" data-bldg-id="${esc(b.id)}">
          <div class="tree-bldg-head">${ICONS.bldg}<div class="name">${esc(b.name)}</div><button class="btn-ghost small" data-action="edit-bldg" data-id="${esc(b.id)}">${ICONS.pencil}</button><button class="btn-ghost small danger" data-action="del-bldg" data-id="${esc(b.id)}">${ICONS.trash}</button></div>
          <div class="tree-bldg-body">
            ${(b.spaces || []).length === 0 ? '<div class="muted small">No spaces.</div>'
              : (b.spaces || []).map(sp => `<div class="tree-space"><div class="tree-space-head"><div class="tree-space-name">${esc(sp.name)}</div><button class="btn-ghost small" data-action="edit-space" data-bldg-id="${esc(b.id)}" data-id="${esc(sp.id)}">${ICONS.pencil}</button><button class="btn-ghost small danger" data-action="del-space" data-bldg-id="${esc(b.id)}" data-id="${esc(sp.id)}">${ICONS.trash}</button></div><div class="tree-mats">${(sp.materials || []).length === 0 ? '<div class="muted small">No materials assigned.</div>' : (sp.materials || []).map(sm => `<div class="tree-mat" data-material-id="${esc(sm.materialId || sm.id)}" title="Double-click to add bulk sample"><span class="tree-mat-name">${esc(sm.name || sm.materialName || 'Material')}</span><span class="tree-mat-qty mono small">${formatQty(sm.quantity || 0)} ${esc(unitForSpaceMaterial(sm, allMats))}</span><button class="btn-link small" data-action="rm-mat-from-space" data-bldg-id="${esc(b.id)}" data-space-id="${esc(sp.id)}" data-mat-id="${esc(sm.materialId || sm.id)}">Remove</button></div>`).join('')}<button class="btn-link small tree-mat-add" data-action="add-mat-to-space" data-bldg-id="${esc(b.id)}" data-space-id="${esc(sp.id)}">+ Add material to space</button></div></div>`).join('')}
            <div class="tree-bldg-foot"><button class="btn-ghost small" data-action="add-space" data-bldg-id="${esc(b.id)}">+ Add space</button></div>
          </div>
        </div>`).join('')}</div>`}
    `;
    wrap.querySelector('#add-building-btn')?.addEventListener('click', () => {
      if (typeof window.openAddBuildingModal === 'function') window.openAddBuildingModal();
    });
    wrap.querySelector('#add-material-btn')?.addEventListener('click', () => {
      if (typeof window.openAddMaterialModal === 'function') window.openAddMaterialModal();
    });
    wrap.querySelectorAll('[data-action="edit-bldg"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openEditBuildingModal === 'function') window.openEditBuildingModal(b.dataset.id);
    }));
    wrap.querySelectorAll('[data-action="del-bldg"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.deleteBuilding === 'function') window.deleteBuilding(b.dataset.id);
    }));
    wrap.querySelectorAll('[data-action="add-space"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openAddSpaceModal === 'function') window.openAddSpaceModal(b.dataset.bldgId);
    }));
    wrap.querySelectorAll('[data-action="edit-space"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openEditSpaceModal === 'function') window.openEditSpaceModal(b.dataset.bldgId, b.dataset.id);
    }));
    wrap.querySelectorAll('[data-action="del-space"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.deleteSpace === 'function') window.deleteSpace(b.dataset.bldgId, b.dataset.id);
    }));
    wrap.querySelectorAll('[data-action="edit-mat"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openEditMaterialModal === 'function') window.openEditMaterialModal(b.dataset.id);
    }));
    wrap.querySelectorAll('[data-material-id]').forEach(row => row.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      if (typeof window.openBulkSampleModal === 'function') window.openBulkSampleModal(row.dataset.materialId);
    }));
    wrap.querySelectorAll('[data-action="del-mat"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.deleteMaterial === 'function') window.deleteMaterial(b.dataset.id);
    }));
    wrap.querySelectorAll('[data-action="add-mat-to-space"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openAddMaterialToSpaceModal === 'function') window.openAddMaterialToSpaceModal(b.dataset.bldgId, b.dataset.spaceId);
    }));
    wrap.querySelectorAll('[data-action="rm-mat-from-space"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.deleteMaterialFromSpace === 'function') window.deleteMaterialFromSpace(b.dataset.bldgId, b.dataset.spaceId, b.dataset.matId);
    }));
  }

  // ---------- WORKERS TAB ----------
  const RESPIRATOR_OPTIONS = ['Half-Face', 'Full-Face', 'PAPR'];
  let workerAddOpen = false;

  function isWorkerDateExpired(dateStr) {
    if (!dateStr) return false;
    const date = new Date(dateStr + 'T23:59:59');
    return date < new Date();
  }
  function formatWorkerDateText(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  }
  function workerExpiredLabels(w) {
    const labels = [];
    if (isWorkerDateExpired(w.aheraExpiration)) labels.push('AHERA');
    if (isWorkerDateExpired(w.medicalExpiration)) labels.push('Medical');
    if (isWorkerDateExpired(w.respiratorFitExpiration)) labels.push('Respirator Fit');
    if (isWorkerDateExpired(w.leadExpiration)) labels.push('Lead');
    if (isWorkerDateExpired(w.leadMedExpiration)) labels.push('Lead Med');
    return labels;
  }
  function workerDateCell(label, dateStr) {
    const exp = isWorkerDateExpired(dateStr);
    return `<div class="worker-date-cell"><span class="worker-date-lbl">${label}</span><span class="${exp ? 'expired' : ''}">${formatWorkerDateText(dateStr)}</span></div>`;
  }
  function readWorkerFromForm(form, prefix) {
    const p = prefix || '';
    const name = form.querySelector(`#${p}worker-name`)?.value.trim();
    const type = form.querySelector(`#${p}worker-type`)?.value || 'W';
    const aheraExp = form.querySelector(`#${p}worker-ahera-exp`)?.value;
    const medicalExp = form.querySelector(`#${p}worker-medical-exp`)?.value;
    const respiratorExp = form.querySelector(`#${p}worker-respirator-exp`)?.value;
    const leadExp = form.querySelector(`#${p}worker-lead-exp`)?.value || '';
    const leadMedExp = form.querySelector(`#${p}worker-lead-med-exp`)?.value || '';
    const respiratorSelections = Array.from(form.querySelectorAll(`.${p}respirator-type-checkbox:checked`)).map(cb => cb.value);
    return { name, type, aheraExp, medicalExp, respiratorExp, leadExp, leadMedExp, respiratorSelections };
  }
  function validateWorkerFields(fields) {
    if (!fields.name) { showShellNote('Enter a worker name.'); return false; }
    if (!fields.aheraExp || !fields.medicalExp || !fields.respiratorExp) {
      showShellNote('AHERA, Medical, and Respirator Fit expiration dates are required.');
      return false;
    }
    if (!fields.respiratorSelections.length) {
      showShellNote('Select at least one respirator type.');
      return false;
    }
    return true;
  }
  function buildWorkerRecord(fields, existing) {
    const base = existing ? { ...existing } : {
      id: 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      createdAt: Date.now()
    };
    base.name = fields.name;
    base.certificationType = fields.type === 'S' ? 'S' : 'W';
    base.aheraExpiration = fields.aheraExp;
    base.medicalExpiration = fields.medicalExp;
    base.respiratorFitExpiration = fields.respiratorExp;
    base.leadExpiration = fields.leadExp;
    base.leadMedExpiration = fields.leadMedExp;
    base.respiratorTypes = fields.respiratorSelections;
    if (existing) base.updatedAt = Date.now();
    return base;
  }

  function renderTabTeam(p) {
    const wrap = document.getElementById('tab-team');
    if (!wrap) return;
    const ws = (p.workerRoster || []).slice();
    const certOpts = RESPIRATOR_OPTIONS.map(opt => `
      <label class="worker-resp-check"><input type="checkbox" class="respirator-type-checkbox" value="${esc(opt)}"><span>${esc(opt)}</span></label>
    `).join('');

    wrap.innerHTML = `
      <div class="filter-bar">
        <span class="muted small">${ws.length} worker${ws.length === 1 ? '' : 's'} on roster</span>
        <div class="filter-spacer"></div>
        <button class="btn-ghost" id="export-worker-roster-btn" type="button" ${ws.length === 0 ? 'disabled' : ''}>${ICONS.doc} Export roster</button>
        <button class="btn-primary" id="toggle-add-worker-btn" type="button">${ICONS.plus} ${workerAddOpen ? 'Cancel' : 'Add worker'}</button>
      </div>
      ${workerAddOpen ? `
      <section class="panel worker-roster-form-panel">
        <div class="panel-head"><h2 class="panel-title">Add worker</h2></div>
        <form id="worker-roster-form" class="worker-roster-form panel-body">
          <div class="worker-form-row">
            <div class="worker-field"><label for="worker-name">Full name</label><input type="text" id="worker-name" required placeholder="Worker full name"></div>
            <div class="worker-field"><label for="worker-type">AHERA certification type</label>
              <select id="worker-type" required><option value="W">Worker (W)</option><option value="S">Supervisor (S)</option></select>
            </div>
          </div>
          <div class="worker-field"><span class="worker-section-lbl">Expiration dates</span>
            <div class="worker-dates-grid">
              <div class="worker-field"><label for="worker-ahera-exp">AHERA</label><input type="date" id="worker-ahera-exp" required></div>
              <div class="worker-field"><label for="worker-medical-exp">Medical</label><input type="date" id="worker-medical-exp" required></div>
              <div class="worker-field"><label for="worker-respirator-exp">Respirator fit test</label><input type="date" id="worker-respirator-exp" required></div>
              <div class="worker-field"><label for="worker-lead-exp">Lead training</label><input type="date" id="worker-lead-exp"></div>
              <div class="worker-field"><label for="worker-lead-med-exp">Lead medical</label><input type="date" id="worker-lead-med-exp"></div>
            </div>
          </div>
          <div class="worker-field"><span class="worker-section-lbl">Respirator type</span><div class="worker-resp-checks">${certOpts}</div></div>
          <div class="worker-form-actions"><button type="submit" class="btn-primary">${ICONS.plus} Add worker</button></div>
        </form>
      </section>` : ''}
      ${ws.length === 0 && !workerAddOpen
        ? '<div class="empty-state"><div class="title">No workers on the roster</div><div class="sub">Add workers with AHERA type (S/W), certification expirations, and respirator types for document export.</div></div>'
        : `<div class="worker-roster-list">${ws.map(w => renderWorkerRosterCard(w)).join('')}</div>`}
    `;

    wrap.querySelector('#toggle-add-worker-btn')?.addEventListener('click', () => {
      workerAddOpen = !workerAddOpen;
      renderTabTeam(getCurrentProject());
    });
    wrap.querySelector('#export-worker-roster-btn')?.addEventListener('click', () => {
      const proj = getCurrentProject();
      if (typeof window.exportWorkerRosterDoc === 'function') {
        window.exportWorkerRosterDoc(proj);
      } else {
        showShellNote('Export is not available on this page.');
      }
    });
    wrap.querySelector('#worker-roster-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const fields = readWorkerFromForm(form, '');
      if (!validateWorkerFields(fields)) return;
      const proj = getCurrentProject();
      proj.workerRoster = proj.workerRoster || [];
      proj.workerRoster.push(buildWorkerRecord(fields));
      saveAndRefresh(proj);
      workerAddOpen = false;
      showShellNote('Worker added.');
      renderTabTeam(getCurrentProject());
    });
    wrap.querySelectorAll('[data-action="edit-worker"]').forEach(b => b.addEventListener('click', () => {
      const proj = getCurrentProject();
      const w = (proj.workerRoster || []).find(x => x.id === b.dataset.id);
      if (w && typeof window.openEditWorkerModal === 'function') {
        window.openEditWorkerModal(w);
      }
    }));
    wrap.querySelectorAll('[data-action="del-worker"]').forEach(b => b.addEventListener('click', () => {
      const proj = getCurrentProject();
      const w = (proj.workerRoster || []).find(x => x.id === b.dataset.id);
      if (!confirm(`Remove ${w?.name || 'this worker'} from the roster?`)) return;
      proj.workerRoster = (proj.workerRoster || []).filter(x => x.id !== b.dataset.id);
      saveAndRefresh(proj);
      showShellNote('Worker removed.');
      renderTabTeam(getCurrentProject());
    }));
  }

  function renderWorkerRosterCard(w) {
    const expiredLabels = workerExpiredLabels(w);
    const hasExpired = expiredLabels.length > 0;
    const certShort = w.certificationType === 'S' ? 'S' : 'W';
    const badgeClass = w.certificationType === 'S' ? 'worker-badge-supervisor' : 'worker-badge-worker';
    const respirators = (w.respiratorTypes || []).join(', ') || '—';
    const initials = (w.name || 'W').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
    return `<article class="worker-card ${hasExpired ? 'worker-card-warn' : ''}">
      <div class="head">
        <div class="avatar">${esc(initials)}</div>
        <div class="worker-card-title">
          <div class="name-row">
            <span class="name">${esc(w.name)}</span>
            <span class="worker-badge ${badgeClass}" title="${certShort === 'S' ? 'Supervisor' : 'Worker'}">${esc(certShort)}</span>
          </div>
        </div>
        <div class="actions">
          <button class="btn-ghost small" type="button" data-action="edit-worker" data-id="${esc(w.id)}">${ICONS.pencil} Edit</button>
          <button class="btn-ghost small danger" type="button" data-action="del-worker" data-id="${esc(w.id)}">${ICONS.trash}</button>
        </div>
      </div>
      <div class="worker-dates-grid compact">
        ${workerDateCell('AHERA', w.aheraExpiration)}
        ${workerDateCell('Medical', w.medicalExpiration)}
        ${workerDateCell('Respirator fit', w.respiratorFitExpiration)}
        ${workerDateCell('Lead training', w.leadExpiration)}
        ${workerDateCell('Lead medical', w.leadMedExpiration)}
      </div>
      <div class="worker-resp-line"><span class="lbl">Respirator</span> ${esc(respirators)}</div>
      ${hasExpired ? `<p class="worker-expired-note">Expired: ${esc(expiredLabels.join(', '))} — expired dates export in <span class="expired">red</span> on the roster document.</p>` : ''}
    </article>`;
  }

  // ---------- DOCS TAB ----------
  function renderTabDocs(p) {
    const wrap = document.getElementById('tab-docs');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="page-head"><div><h2 class="panel-title" style="font-size:14px;">Document templates</h2><p class="page-sub">Generate Word documents from project data.</p></div></div>
      <div class="doc-template-grid">
        <button class="doc-tpl" data-tpl="daily-log"><div class="icon">${ICONS.doc}</div><div class="title">Daily log</div><div class="desc">Per-day field log with crew, activities, photos.</div></button>
        <button class="doc-tpl" data-tpl="visual-inspection"><div class="icon">${ICONS.check}</div><div class="title">Visual inspection</div><div class="desc">Pre / post / clearance inspection form.</div></button>
        <button class="doc-tpl" data-tpl="containment-summary"><div class="icon">${ICONS.bldg}</div><div class="title">Containment summary</div><div class="desc">Complete summary for a containment.</div></button>
        <button class="doc-tpl" data-tpl="air-sample-request"><div class="icon">${ICONS.bell}</div><div class="title">Air sample request</div><div class="desc">Chain of custody / lab submission.</div></button>
        <button class="doc-tpl" data-tpl="bulk-coc"><div class="icon">${ICONS.doc}</div><div class="title">Bulk chain of custody</div><div class="desc">Print the bulk sample Chain of Custody.</div></button>
      </div>
    `;
    wrap.querySelectorAll('[data-tpl="daily-log"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openProjectDailyLogModal === 'function') window.openProjectDailyLogModal();
    }));
    wrap.querySelectorAll('[data-tpl="air-sample-request"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openPrintAirSamplesModal === 'function') window.openPrintAirSamplesModal();
    }));
    wrap.querySelectorAll('[data-tpl="bulk-coc"]').forEach(b => b.addEventListener('click', () => {
      if (typeof window.openPrintBulkSamplesModal === 'function') {
        window.openPrintBulkSamplesModal();
      } else {
        showShellNote('Bulk Chain of Custody print is not available on this page.');
      }
    }));
    wrap.querySelectorAll('[data-tpl="containment-summary"]').forEach(b => b.addEventListener('click', () => {
      switchTab('containments');
    }));
    wrap.querySelectorAll('[data-tpl="visual-inspection"]').forEach(b => b.addEventListener('click', () => {
      switchTab('containments');
    }));
  }

  function saveAndRefresh(p) {
    if (typeof window.saveCurrentProject === 'function') {
      window.currentProject = p;
      window.saveCurrentProject();
    } else {
      try {
        p.lastModified = new Date().toISOString();
        localStorage.setItem('oversight_project_' + p.id, JSON.stringify(p));
      } catch (e) {}
    }
  }

  // Public API for legacy renderers to call after a save
  function renderAll() {
    const p = getCurrentProject();
    if (!p) return;
    renderProjectHead(p);
    switchTab(currentTab);
    renderSidebarProjects(p.id);
  }

  function initProjectPage() {
    wireSidebarToggle();
    wireInspectorBtn();
    wireTweaks();
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab) currentTab = tab;
    document.querySelectorAll('.proj-tab[data-tab]').forEach(b => {
      b.addEventListener('click', () => switchTab(b.dataset.tab));
    });
    document.getElementById('header-edit-project-btn')?.addEventListener('click', () => {
      if (typeof window.openEditProjectModal === 'function') window.openEditProjectModal();
    });
    document.getElementById('header-export-project-btn')?.addEventListener('click', () => {
      const p = getCurrentProject();
      if (p?.id && typeof window.handleExportProject === 'function') window.handleExportProject(p.id);
      else showShellNote('Export is only available from the dashboard in this build.');
    });
    document.getElementById('header-archive-project-btn')?.addEventListener('click', archiveCurrentProject);
    document.getElementById('header-delete-project-btn')?.addEventListener('click', deleteCurrentProject);
    document.getElementById('header-new-log-btn')?.addEventListener('click', () => {
      if (typeof window.openProjectDailyLogModal === 'function') window.openProjectDailyLogModal();
    });
    // Initial render: project.js has likely already loaded currentProject;
    // if not, poll briefly.
    let tries = 0;
    function tick() {
      const p = getCurrentProject();
      if (p) {
        renderAll();
        if (params.get('new') === '1' && typeof window.openProjectDailyLogModal === 'function') {
          setTimeout(() => window.openProjectDailyLogModal(), 100);
        }
        return;
      }
      if (tries++ < 20) setTimeout(tick, 50);
    }
    tick();
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  window.OverShell = {
    refreshDashboard() { if (!IS_PROJECT_PAGE) { renderSidebarProjects(null); if (currentDashView === 'today') renderTodayView(); else if (currentDashView === 'projects') renderProjectsView(); else renderArchiveView(); } },
    renderAll() { renderAll(); },
    switchTab(name) { switchTab(name); },
    refreshInspector() { refreshInspectorBadge(); },
  };

  function wireUpdateNotifications() {
    if (!window.electronAPI?.onUpdateStatus) return;
    let lastDownloadNote = 0;
    window.electronAPI.onUpdateStatus((payload) => {
      const status = payload?.status;
      if (!status) return;
      if (status === 'checking') {
        showShellNote('Checking for updates...');
      } else if (status === 'available') {
        showShellNote(`Update ${payload.version || ''} available. Downloading...`.trim());
      } else if (status === 'downloading') {
        const now = Date.now();
        if (now - lastDownloadNote > 10000 || payload.percent >= 100) {
          lastDownloadNote = now;
          showShellNote(`Downloading update: ${payload.percent || 0}%`);
        }
      } else if (status === 'downloaded') {
        const version = payload.version ? ` ${payload.version}` : '';
        if (confirm(`Update${version} downloaded. Restart and install now?`)) {
          window.electronAPI.installUpdate?.();
        } else {
          showShellNote('Update will install when the app closes.');
        }
      } else if (status === 'not-available') {
        showShellNote('Oversight is up to date.');
      } else if (status === 'error') {
        showShellNote(`Update check failed: ${payload.message || 'unknown error'}`);
      }
    });
  }

  // ============================================================
  // BOOT
  // ============================================================
  document.addEventListener('DOMContentLoaded', () => {
    wireUpdateNotifications();
    if (IS_PROJECT_PAGE) initProjectPage();
    else initDashboard();
  });
})();
