// ============================================================================
// OVERSIGHT iOS — data store, model & business logic
// Mirrors the desktop app's model: projects → buildings → spaces → materials,
// containments (staged), air samples (flow/volume calc), worker roster, logs.
// State lives in React, persisted to localStorage. Exposes window.OvsStore.
// ============================================================================
(function () {
  const LS_KEY = 'oversight_ios_store_v2';

  // — helpers ----------------------------------------------------------------
  let _id = Date.now();
  const uid = () => 'x' + (_id++).toString(36) + Math.random().toString(36).slice(2, 6);
  const pad = n => String(n).padStart(2, '0');
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const addDaysISO = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fmtDate = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  const fmtDateFull = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); };

  const timeToMin = (t) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const calcElapsed = (start, stop) => { const a = timeToMin(start), b = timeToMin(stop); if (a == null || b == null) return null; let d = b - a; if (d < 0) d += 24 * 60; return d; };
  const calcVolume = (sf, ef, min) => { if (min == null) return null; const f = [sf, ef].filter(x => x != null && !isNaN(x)); if (!f.length) return null; const avg = f.reduce((s, x) => s + Number(x), 0) / f.length; return Math.round(avg * min); };
  const fmtMin = (min) => { if (min == null) return '—'; const h = Math.floor(min / 60), m = min % 60; return h > 0 ? `${h}h ${pad(m)}m` : `${m}m`; };
  const fmtClock = (min) => { if (min == null) return '—'; const h = Math.floor(min / 60), m = min % 60; return `${h}:${pad(m)}`; };

  // — stages -----------------------------------------------------------------
  const STAGES = [
    { id: 'Containment Preparation', short: 'Prep', cls: 'stage-prep', tab: 'Containment Prep' },
    { id: 'Active Abatement', short: 'Abate', cls: 'stage-active', tab: 'Active Abatement' },
    { id: 'Containment Clearance', short: 'Clear', cls: 'stage-clear', tab: 'Clearance' },
    { id: 'Containment Teardown', short: 'Tear-\ndown', cls: 'stage-down', tab: 'Teardown' },
    { id: 'Abatement Completed', short: 'Done', cls: 'stage-done', tab: 'Completed' },
  ];
  const stageIdx = (s) => Math.max(0, STAGES.findIndex(x => x.id === s));
  const stageMeta = (s) => STAGES[stageIdx(s)] || STAGES[0];

  const SAMPLE_TYPES = ['Area', 'Personal', 'Clearance', 'Background'];
  const SAMPLE_TAG = { Area: 'tag-area', Personal: 'tag-personal', Clearance: 'tag-clearance', Background: 'tag-background' };
  const RESPIRATORS = ['Half-Face', 'Full-Face', 'PAPR'];
  const UNITS = ['ft²', 'LF', 'EA', 'ft³'];

  // — derived ----------------------------------------------------------------
  const projectPct = (p) => {
    const cs = p.containments || [];
    if (!cs.length) return 0;
    const sum = cs.reduce((s, c) => s + stageIdx(c.stage) / (STAGES.length - 1), 0);
    return Math.round((sum / cs.length) * 100);
  };
  const projectOverdue = (p) => p.status === 'active' && p.dueDate && p.dueDate < todayISO();
  const dueLabel = (p) => {
    if (p.status === 'completed') return 'Done';
    if (!p.dueDate) return 'No date';
    if (p.dueDate < todayISO()) { const days = Math.round((new Date(todayISO()) - new Date(p.dueDate)) / 86400000); return `${days}d overdue`; }
    return fmtDate(p.dueDate);
  };
  const daysLeft = (p) => p.dueDate ? Math.round((new Date(p.dueDate) - new Date(todayISO())) / 86400000) : null;
  const sampleRunning = (s) => !!s.startEpoch && !s.stopTime;
  const runningElapsedMin = (s) => s.startEpoch ? Math.floor((Date.now() - s.startEpoch) / 60000) : (s.timeElapsed || 0);

  // — seed -------------------------------------------------------------------
  function seed() {
    const insp = { name: 'Marcus Hale', license: 'CAC #14-5821', initials: 'MH' };

    const mkSpace = (name, mats) => ({ id: uid(), name, materials: mats.map(m => ({ id: uid(), name: m[0], quantity: m[1], unit: m[2], type: m[3] || 'Surfacing' })) });
    const mkWorker = (name, type, offsets, resp) => ({
      id: uid(), name, certificationType: type,
      aheraExpiration: addDaysISO(offsets[0]), medicalExpiration: addDaysISO(offsets[1]),
      respiratorFitExpiration: addDaysISO(offsets[2]), leadExpiration: addDaysISO(offsets[3] ?? 200),
      leadMedExpiration: addDaysISO(offsets[4] ?? 220), respiratorTypes: resp,
    });

    // Project 1 — Riverside (overdue, active abatement)
    const b1 = { id: uid(), name: 'Building C', spaces: [
      mkSpace('Room 104 — Classroom', [['9×9 Floor Tile & Mastic', 880, 'ft²', 'Misc'], ['Window Glazing', 64, 'LF', 'Misc']]),
      mkSpace('Boiler Room', [['Pipe Insulation (TSI)', 220, 'LF', 'TSI'], ['Boiler Breeching', 40, 'ft²', 'TSI']]),
      mkSpace('Corridor C-1', [['Drywall Joint Compound', 1200, 'ft²', 'Surfacing']]),
    ]};
    const c1a = { id: uid(), name: 'Boiler Room', buildingId: b1.id, stage: 'Active Abatement', spaces: [{ id: b1.spaces[1].id, name: 'Boiler Room' }] };
    const c1b = { id: uid(), name: 'Corridor', buildingId: b1.id, stage: 'Active Abatement', spaces: [{ id: b1.spaces[2].id, name: 'Corridor C-1' }] };
    const c1c = { id: uid(), name: 'Room 104', buildingId: b1.id, stage: 'Containment Preparation', spaces: [{ id: b1.spaces[0].id, name: 'Room 104' }] };
    const p1 = {
      id: uid(), projectNumber: 'OVS-2041', siteName: 'Riverside Elementary', name: 'Riverside Elementary',
      siteAddress: '1820 Riverside Dr, Building C', clientName: 'Hartman Abatement', clientPhone: '(916) 555-0142',
      clientContactName: 'Dana Cole', clientContactPhone: '(916) 555-0177', contractor: 'Hartman Abatement Inc.',
      contractorPhone: '(916) 555-0142', foremanName: 'Luis Romero', foremanPhone: '(916) 555-0190',
      status: 'active', dueDate: addDaysISO(-2), createdAt: Date.now() - 18 * 864e5,
      buildings: [b1], materials: [],
      containments: [c1a, c1b, c1c],
      airSamples: [
        { id: uid(), sampleId: 'OVS-2041-BG-11', type: 'Background', location: 'Outside Containment, Corridor C-1', containmentId: c1b.id, date: todayISO(), startTime: '07:40', stopTime: '', startFlowRate: 4.0, stopFlowRate: null, startEpoch: Date.now() - 98 * 60000 },
        { id: uid(), sampleId: 'OVS-2041-A-08', type: 'Area', location: 'Boiler Room — North', containmentId: c1a.id, date: todayISO(), startTime: '08:05', stopTime: '11:35', startFlowRate: 2.0, stopFlowRate: 2.0, timeElapsed: 210, sampleVolume: 420 },
        { id: uid(), sampleId: 'OVS-2041-P-03', type: 'Personal', location: 'Worker — R. Mota', containmentId: c1a.id, date: addDaysISO(-1), startTime: '08:15', stopTime: '12:05', startFlowRate: 2.0, stopFlowRate: 1.9, timeElapsed: 230, sampleVolume: 449 },
      ],
      workerRoster: [
        mkWorker('Luis Romero', 'S', [120, 90, 200, 240, 260], ['Full-Face', 'PAPR']),
        mkWorker('Rafael Mota', 'W', [80, 60, -4, 180, 200], ['Half-Face']),
        mkWorker('J. Okafor', 'W', [150, 30, -1, 220, 240], ['Half-Face']),
      ],
      dailyLogs: [
        { id: uid(), date: todayISO(), workers: [], entries: [{ id: uid(), time: '09:18', stage: 'Active Abatement', note: 'Gross removal of TSI in Boiler Room ongoing. Negative pressure verified at -0.04" wc across 2 machines.', photos: 2 }], negativePressure: { [c1a.id]: '-0.04' } },
        { id: uid(), date: addDaysISO(-1), workers: [], entries: [{ id: uid(), time: '15:30', stage: 'Active Abatement', note: 'Visual inspection failed — debris remaining along east wall. Crew to re-clean.', photos: 4, fail: true }] },
      ],
    };

    // Project 2 — Mercy General (clearance)
    const b2 = { id: uid(), name: 'Wing C', spaces: [
      mkSpace('OR Suite 3', [['Vinyl Sheet Flooring', 540, 'ft²', 'Misc']]),
      mkSpace('Mechanical 2', [['Pipe Fitting Insulation', 95, 'LF', 'TSI']]),
    ]};
    const c2a = { id: uid(), name: 'OR Suite 3', buildingId: b2.id, stage: 'Containment Clearance', spaces: [{ id: b2.spaces[0].id, name: 'OR Suite 3' }] };
    const c2b = { id: uid(), name: 'Mechanical', buildingId: b2.id, stage: 'Containment Teardown', spaces: [{ id: b2.spaces[1].id, name: 'Mechanical 2' }] };
    const p2 = {
      id: uid(), projectNumber: 'OVS-2038', siteName: 'Mercy General Hospital', name: 'Mercy General Hospital',
      siteAddress: '400 Medical Center Blvd, Wing C', clientName: 'Hartman Abatement', clientPhone: '(916) 555-0142',
      clientContactName: 'Priya Shah', clientContactPhone: '(916) 555-0211', contractor: 'Hartman Abatement Inc.',
      contractorPhone: '(916) 555-0142', foremanName: 'Luis Romero', foremanPhone: '(916) 555-0190',
      status: 'active', dueDate: addDaysISO(3), createdAt: Date.now() - 26 * 864e5,
      buildings: [b2], materials: [], containments: [c2a, c2b],
      airSamples: [
        { id: uid(), sampleId: 'OVS-2038-A-204', type: 'Personal', location: 'Worker — Wing C', containmentId: c2a.id, date: todayISO(), startTime: '06:30', stopTime: '', startFlowRate: 2.0, stopFlowRate: null, startEpoch: Date.now() - 252 * 60000 },
        { id: uid(), sampleId: 'OVS-2038-CL-01', type: 'Clearance', location: 'OR Suite 3 — center', containmentId: c2a.id, date: addDaysISO(-1), startTime: '13:00', stopTime: '17:10', startFlowRate: 10.0, stopFlowRate: 10.0, timeElapsed: 250, sampleVolume: 2500 },
      ],
      workerRoster: [ mkWorker('Sara Kim', 'S', [200, 140, 90, 260, 280], ['Full-Face']), mkWorker('Tom Reyes', 'W', [60, 90, 120, 180, 200], ['Half-Face', 'Full-Face']) ],
      dailyLogs: [ { id: uid(), date: todayISO(), workers: [], entries: [{ id: uid(), time: '07:05', stage: 'Containment Clearance', note: 'Final clearance air sampling started in OR Suite 3 after visual pass.', photos: 1 }] } ],
    };

    // Project 3 — Pinewood (active)
    const b3 = { id: uid(), name: 'Plant 2', spaces: [ mkSpace('Press Line A', [['Transite Panel', 320, 'ft²', 'Misc'], ['Gasket Material', 18, 'EA', 'Misc']]) ] };
    const c3 = { id: uid(), name: 'Press Line A', buildingId: b3.id, stage: 'Active Abatement', spaces: [{ id: b3.spaces[0].id, name: 'Press Line A' }] };
    const p3 = {
      id: uid(), projectNumber: 'OVS-2061', siteName: 'Pinewood Manufacturing', name: 'Pinewood Manufacturing',
      siteAddress: '1200 Industrial Pkwy, Plant 2', clientName: 'Delta Environmental', clientPhone: '(209) 555-0120',
      clientContactName: 'Bea Lutz', clientContactPhone: '(209) 555-0166', contractor: 'Delta Environmental',
      contractorPhone: '(209) 555-0120', foremanName: 'Hector Diaz', foremanPhone: '(209) 555-0145',
      status: 'active', dueDate: addDaysISO(6), createdAt: Date.now() - 9 * 864e5,
      buildings: [b3], materials: [], containments: [c3],
      airSamples: [ { id: uid(), sampleId: 'OVS-2061-A-01', type: 'Area', location: 'Press Line A — south', containmentId: c3.id, date: addDaysISO(-1), startTime: '09:00', stopTime: '12:30', startFlowRate: 2.0, stopFlowRate: 2.0, timeElapsed: 210, sampleVolume: 420 } ],
      workerRoster: [ mkWorker('Hector Diaz', 'S', [180, 120, 100, 260, 280], ['PAPR']) ],
      dailyLogs: [],
    };

    // Project 4 — Lincoln (prep)
    const b4 = { id: uid(), name: 'Building 4', spaces: [ mkSpace('Unit 4B', [['Popcorn Ceiling Texture', 740, 'ft²', 'Surfacing']]) ] };
    const c4 = { id: uid(), name: 'Unit 4B', buildingId: b4.id, stage: 'Containment Preparation', spaces: [{ id: b4.spaces[0].id, name: 'Unit 4B' }] };
    const p4 = {
      id: uid(), projectNumber: 'OVS-2055', siteName: 'Lincoln Court Apartments', name: 'Lincoln Court Apartments',
      siteAddress: '55 Lincoln Ave, Building 4', clientName: 'Cityline Builders', clientPhone: '(415) 555-0133',
      clientContactName: 'Owen Pratt', clientContactPhone: '(415) 555-0188', contractor: 'Cityline Builders',
      contractorPhone: '(415) 555-0133', foremanName: 'Marco Vela', foremanPhone: '(415) 555-0150',
      status: 'active', dueDate: addDaysISO(11), createdAt: Date.now() - 4 * 864e5,
      buildings: [b4], materials: [], containments: [c4], airSamples: [],
      workerRoster: [ mkWorker('Marco Vela', 'S', [220, 160, 130, 260, 280], ['Full-Face']) ], dailyLogs: [],
    };

    // Project 5 — Westfield (completed)
    const b5 = { id: uid(), name: 'Floors 8–10', spaces: [ mkSpace('Floor 9 Core', [['Fireproofing', 2400, 'ft²', 'Surfacing']]) ] };
    const c5 = { id: uid(), name: 'Floor 9 Core', buildingId: b5.id, stage: 'Abatement Completed', spaces: [{ id: b5.spaces[0].id, name: 'Floor 9 Core' }] };
    const p5 = {
      id: uid(), projectNumber: 'OVS-2029', siteName: 'Westfield Office Tower', name: 'Westfield Office Tower',
      siteAddress: '90 Market St, Floors 8–10', clientName: 'Westfield Group', clientPhone: '(415) 555-0100',
      clientContactName: 'Nina Foss', clientContactPhone: '(415) 555-0102', contractor: 'Summit Abatement',
      contractorPhone: '(415) 555-0109', foremanName: 'Dale Knox', foremanPhone: '(415) 555-0111',
      status: 'completed', dueDate: addDaysISO(-12), createdAt: Date.now() - 60 * 864e5,
      buildings: [b5], materials: [], containments: [c5],
      airSamples: [ { id: uid(), sampleId: 'OVS-2029-CL-07', type: 'Clearance', location: 'Floor 9 Core', containmentId: c5.id, date: addDaysISO(-13), startTime: '10:00', stopTime: '14:15', startFlowRate: 10.0, stopFlowRate: 10.0, timeElapsed: 255, sampleVolume: 2550 } ],
      workerRoster: [], dailyLogs: [],
      documents: [ { id: uid(), name: 'Final Clearance Report', date: addDaysISO(-12) }, { id: uid(), name: 'Project Closeout Summary', date: addDaysISO(-11) } ],
    };

    return { inspector: insp, projects: [p1, p2, p3, p4, p5] };
  }

  // — persistence ------------------------------------------------------------
  function loadState() {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch {}
    return seed();
  }
  function persist(state) { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {} }
  function reset() { try { localStorage.removeItem(LS_KEY); } catch {} }

  window.OvsStore = {
    LS_KEY, uid, todayISO, addDaysISO, fmtDate, fmtDateFull, timeToMin, calcElapsed, calcVolume,
    fmtMin, fmtClock, STAGES, stageIdx, stageMeta, SAMPLE_TYPES, SAMPLE_TAG, RESPIRATORS, UNITS,
    projectPct, projectOverdue, dueLabel, daysLeft, sampleRunning, runningElapsedMin,
    seed, loadState, persist, reset,
  };
})();
