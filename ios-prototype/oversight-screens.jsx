// ============================================================================
// OVERSIGHT iOS — data-driven screens. Each takes `app` (state + actions + nav).
// Exports to window: OvsTabBar, TodayScreen, ProjectsScreen, ProjectScreen,
//   ContainmentsScreen, SamplesScreen, MaterialsScreen, TeamScreen, DocsScreen,
//   ArchiveScreen, ProfileScreen
// ============================================================================
const St = window.OvsStore;

// — helpers -----------------------------------------------------------------
function avatarInit(name) { return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(); }
function certExpired(iso) { return iso && iso < St.todayISO(); }

function buildAttention(state) {
  const items = [];
  state.projects.filter(p => p.status === 'active').forEach(p => {
    if (St.projectOverdue(p)) items.push({ sev: 'alert', ic: Ic.alert, label: 'Project overdue', meta: `${p.siteName} · ${St.dueLabel(p)}`, project: p });
    (p.airSamples || []).forEach(s => { if (St.sampleRunning(s) && St.runningElapsedMin(s) > 240) items.push({ sev: 'warn', ic: Ic.clock, label: `Sample ${s.sampleId.split('-').slice(-2).join('-')} over target volume`, meta: `${p.siteName} · running ${St.fmtMin(St.runningElapsedMin(s))}`, project: p }); });
    (p.workerRoster || []).forEach(w => { if (certExpired(w.respiratorFitExpiration)) items.push({ sev: 'warn', ic: Ic.shield, label: 'Respirator fit-test expired', meta: `${w.name} · ${p.siteName}`, project: p }); });
    const hasLogToday = (p.dailyLogs || []).some(l => l.date === St.todayISO());
    if (!hasLogToday && (p.containments || []).some(c => c.stage === 'Active Abatement')) items.push({ sev: 'todo', ic: Ic.doc, label: 'Daily log not submitted', meta: `${p.siteName} · today`, project: p });
  });
  state.projects.forEach(p => (p.airSamples || []).forEach(s => { if (s.type === 'Clearance' && s.sampleVolume) items.push({ sev: 'ready', ic: Ic.check, label: 'Clearance results ready', meta: `${p.siteName} · ${s.sampleId.split('-').slice(-2).join('-')}` }); }));
  return items.slice(0, 6);
}
function allRunning(state) {
  const out = [];
  state.projects.forEach(p => (p.airSamples || []).forEach(s => { if (St.sampleRunning(s)) out.push({ s, p }); }));
  return out;
}
function projectActivity(p) {
  const acts = [];
  (p.dailyLogs || []).forEach(l => (l.entries || []).forEach(e => acts.push({ dot: e.fail ? 'fail' : 'log', tx: e.note, meta: `${St.fmtDate(l.date)} ${e.time} · ${St.stageMeta(e.stage).tab}`, t: l.date + e.time })));
  (p.airSamples || []).forEach(s => acts.push({ dot: 'sample', tx: `Air sample ${s.sampleId} — ${s.type}${s.sampleVolume ? `, ${s.sampleVolume} L` : ' running'}`, meta: `${St.fmtDate(s.date)} ${s.startTime || ''}`, t: s.date + (s.startTime || '') }));
  return acts.sort((a, b) => (a.t < b.t ? 1 : -1)).slice(0, 6);
}

// — Tab bar -----------------------------------------------------------------
function OvsTabBar({ active, onTab }) {
  const tabs = [['today', 'Today', Ic.home], ['projects', 'Projects', Ic.grid], ['archive', 'Archive', Ic.archive], ['profile', 'Profile', Ic.user]];
  return (
    <div className="ovs-tabbar">
      {tabs.map(([id, label, ic]) => (
        <button key={id} className="ovs-tab" data-active={active === id} onClick={() => onTab(id)}>
          <span className="ovs-tab-ic">{ic}</span>{label}
        </button>
      ))}
    </div>
  );
}

// — generic section header --------------------------------------------------
function Sec({ title, action, onAction }) {
  return <div className="ovs-sec-head"><span className="ovs-sec-title">{title}</span>{action && <span className="ovs-sec-action" onClick={onAction}>{action}</span>}</div>;
}

// — TODAY -------------------------------------------------------------------
function TodayScreen({ app }) {
  const { state } = app;
  const attention = buildAttention(state);
  const running = allRunning(state);
  const active = state.projects.filter(p => p.status === 'active');
  const samplesToday = state.projects.reduce((n, p) => n + (p.airSamples || []).filter(s => s.date === St.todayISO()).length, 0);
  const pendingClear = state.projects.reduce((n, p) => n + (p.containments || []).filter(c => c.stage === 'Containment Clearance').length, 0);
  const stats = [
    { label: 'Active Projects', num: active.length, sub: `${active.filter(p => St.daysLeft(p) != null && St.daysLeft(p) <= 7).length} due this week` },
    { label: 'Samples Today', num: samplesToday, sub: `${running.length} running now` },
    { label: 'Pending Clearance', num: pendingClear, sub: pendingClear ? 'in clearance' : 'none', subCls: '' },
    { label: 'Open Items', num: attention.length, sub: `${attention.filter(a => a.sev === 'alert').length} high priority`, subCls: attention.some(a => a.sev === 'alert') ? 'alert' : '' },
  ];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div className="ovs-screen">
      <div className="ovs-scroll">
        <div className="ovs-lt">
          <div className="ovs-lt-eyebrow">{today}</div>
          <div className="ovs-lt-row">
            <h1 className="ovs-lt-title">Today</h1>
            <div style={{ display: 'flex', gap: 9 }}>
              <button className="ovs-lt-btn" onClick={() => app.toast('No new notifications')}>{Ic.bell}</button>
              <button className="ovs-lt-avatar" onClick={() => app.setTab('profile')}>{state.inspector.initials}</button>
            </div>
          </div>
        </div>

        {attention.length > 0 && <React.Fragment>
          <Sec title="Needs Attention" />
          <div className="ovs-group">
            {attention.map((a, i) => (
              <button key={i} className="ovs-attn ovs-row-press" style={{ width: '100%' }} onClick={() => a.project && app.open({ kind: 'project', id: a.project.id })}>
                <div className="ovs-attn-ic" data-sev={a.sev}>{a.ic}</div>
                <div className="ovs-attn-tx"><div className="ovs-attn-label">{a.label}</div><div className="ovs-attn-meta">{a.meta}</div></div>
                <span className="ovs-chev">{Ic.chev}</span>
              </button>
            ))}
          </div>
        </React.Fragment>}

        {running.length > 0 && <React.Fragment>
          <Sec title="Running Samples" />
          <div className="ovs-group">
            {running.map(({ s, p }, i) => {
              const el = St.runningElapsedMin(s);
              const vol = Math.round((s.startFlowRate || 2) * el);
              const target = s.type === 'Clearance' ? 2500 : 1200;
              const pct = Math.min(100, Math.round((vol / target) * 100));
              return (
                <button key={i} className="ovs-run ovs-row-press" style={{ width: '100%', textAlign: 'left' }} onClick={() => app.open({ kind: 'samples', id: p.id })}>
                  <div className="ovs-run-top">
                    <span className="ovs-run-id">{s.sampleId.split('-').slice(-2).join('-')}</span>
                    <span className={'ovs-tag ' + St.SAMPLE_TAG[s.type]}>{s.type}</span>
                    <span className="ovs-run-spacer"></span>
                    <span className="ovs-run-pip"><span className="ovs-run-dot"></span>Running</span>
                  </div>
                  <div className="ovs-run-site">{p.siteName}</div>
                  <div className="ovs-run-meta">
                    <div><span className="k">Flow</span><b>{(s.startFlowRate || 0).toFixed(1)}</b> L/min</div>
                    <div><span className="k">Volume</span><b>{vol}</b> L</div>
                    <div><span className="k">Elapsed</span><b>{St.fmtClock(el)}</b></div>
                  </div>
                  <div className="ovs-run-prog"><Bar pct={pct} /><span className="ovs-run-elapsed">{pct}%</span></div>
                </button>
              );
            })}
          </div>
        </React.Fragment>}

        <Sec title="Snapshot" />
        <div className="ovs-stats">
          {stats.map((s, i) => (
            <div key={i} className="ovs-stat">
              <div className="ovs-stat-top"><span className="ovs-stat-label">{s.label}</span></div>
              <div className="ovs-stat-val"><span className="ovs-stat-num">{s.num}</span></div>
              <div className={'ovs-stat-sub ' + (s.subCls || '')}>{s.sub}</div>
            </div>
          ))}
        </div>

        <Sec title="Active Projects" action="See All" onAction={() => app.setTab('projects')} />
        <div className="ovs-group">
          {active.slice(0, 3).map(p => <ProjRow key={p.id} p={p} onClick={() => app.open({ kind: 'project', id: p.id })} compact />)}
        </div>
        <div style={{ height: 8 }}></div>
      </div>
      <OvsTabBar active="today" onTab={app.setTab} />
    </div>
  );
}

// — project list row --------------------------------------------------------
function ProjRow({ p, onClick, compact }) {
  return (
    <button className="ovs-proj ovs-row-press" onClick={onClick}>
      <div className="ovs-proj-top">
        <span className="ovs-proj-dot" data-overdue={St.projectOverdue(p)} data-status={p.status}></span>
        <span className="ovs-proj-num">{p.projectNumber}</span>
        <span className={'ovs-proj-due' + (St.projectOverdue(p) ? ' overdue' : p.status === 'completed' ? ' done' : '')}>{St.dueLabel(p)}</span>
      </div>
      <div className="ovs-proj-site">{p.siteName}</div>
      {!compact && <div className="ovs-proj-addr">{p.siteAddress}</div>}
      <div className="ovs-proj-foot"><Stage stage={(p.containments || [])[0]?.stage || 'Containment Preparation'} /><Bar pct={St.projectPct(p)} /><span className="ovs-proj-pct">{St.projectPct(p)}%</span></div>
    </button>
  );
}

// — PROJECTS ----------------------------------------------------------------
function ProjectsScreen({ app }) {
  const { state } = app;
  const [seg, setSeg] = React.useState('active');
  const [q, setQ] = React.useState('');
  let list = state.projects.filter(p => seg === 'all' ? true : seg === 'overdue' ? St.projectOverdue(p) : p.status === 'active');
  if (q.trim()) { const t = q.toLowerCase(); list = list.filter(p => (p.siteName + p.projectNumber + p.siteAddress).toLowerCase().includes(t)); }
  return (
    <div className="ovs-screen">
      <div className="ovs-scroll">
        <div className="ovs-lt"><div className="ovs-lt-row"><h1 className="ovs-lt-title">Projects</h1>
          <button className="ovs-lt-btn" onClick={() => app.sheet({ kind: 'project' })}>{Ic.plus}</button></div></div>
        <div className="ovs-search">{Ic.search}<input value={q} onChange={e => setQ(e.target.value)} placeholder="Search projects, sites, samples…" /></div>
        <div className="ovs-seg">{[['active', 'Active'], ['overdue', 'Overdue'], ['all', 'All']].map(([k, l]) => <button key={k} data-active={seg === k} onClick={() => setSeg(k)}>{l}</button>)}</div>
        <Sec title={`${list.length} ${seg === 'overdue' ? 'overdue' : seg} ${list.length === 1 ? 'project' : 'projects'}`} />
        {list.length ? <div className="ovs-group">{list.map(p => <ProjRow key={p.id} p={p} onClick={() => app.open({ kind: 'project', id: p.id })} />)}</div>
          : <div className="ovs-empty"><div className="t">No projects</div><div className="s">Tap + to add one.</div></div>}
        <div style={{ height: 8 }}></div>
      </div>
      <OvsTabBar active="projects" onTab={app.setTab} />
    </div>
  );
}

// — navbar (sub-screens / detail) ------------------------------------------
function NavBar({ title, sub, backLabel, onBack, right }) {
  return (
    <div className="ovs-navbar">
      <button className="ovs-navbar-back" onClick={onBack}>{Ic.back}<span>{backLabel}</span></button>
      <div className="ovs-navbar-title">{title}{sub && <span className="sub">{sub}</span>}</div>
      <div className="ovs-navbar-act">{right}</div>
    </div>
  );
}

// — PROJECT DETAIL ----------------------------------------------------------
function ProjectScreen({ app, project }) {
  const p = project;
  const curIdx = Math.round(((p.containments || []).reduce((s, c) => s + St.stageIdx(c.stage), 0) / Math.max(1, (p.containments || []).length)));
  const statusCls = St.projectOverdue(p) ? 'overdue' : p.status === 'completed' ? 'done' : 'active';
  const statusLbl = St.projectOverdue(p) ? 'Overdue' : p.status === 'completed' ? 'Completed' : 'Active';
  const dl = St.daysLeft(p);
  const sections = [
    { kind: 'containments', ic: Ic.box, color: '#015dab', label: 'Containments', count: (p.containments || []).length },
    { kind: 'samples', ic: Ic.vial, color: '#1E40AF', label: 'Air Samples', count: (p.airSamples || []).length },
    { kind: 'materials', ic: Ic.layers, color: '#5B21B6', label: 'Materials', count: (p.buildings || []).reduce((n, b) => n + (b.spaces || []).reduce((m, s) => m + (s.materials || []).length, 0), 0) },
    { kind: 'team', ic: Ic.team, color: '#92400E', label: 'Team', count: (p.workerRoster || []).length },
    { kind: 'docs', ic: Ic.doc, color: '#15803D', label: 'Documents', count: (p.documents || []).length },
  ];
  const activity = projectActivity(p);
  const editMenu = () => app.menu({
    title: `${p.projectNumber} · ${p.siteName}`,
    actions: [
      { label: 'Edit project details', onClick: () => app.sheet({ kind: 'project', project: p }) },
      { label: 'Add air sample', onClick: () => app.sheet({ kind: 'sample', project: p }) },
      { label: 'Add daily log entry', onClick: () => app.sheet({ kind: 'log', project: p }) },
      { label: p.status === 'completed' ? 'Reopen project' : 'Mark completed', onClick: () => app.actions.toggleComplete(p.id) },
    ],
  });
  return (
    <div className="ovs-screen">
      <NavBar title={p.siteName.split(' ').slice(0, 2).join(' ')} sub={p.projectNumber} backLabel="Projects" onBack={app.back}
        right={<button className="ovs-detail-edit" onClick={editMenu}>Edit</button>} />
      <div className="ovs-scroll">
        <div className="ovs-hero">
          <div className="ovs-hero-pills"><span className="ovs-pill-num">{p.projectNumber}</span><span className={'ovs-status-pill ' + statusCls}><span className="d"></span>{statusLbl}</span></div>
          <h1 className="ovs-hero-title">{p.siteName}</h1>
          <div className="ovs-hero-meta">
            <div className="r">{Ic.pin}{p.siteAddress}</div>
            {p.contractor && <div className="r">{Ic.person}{p.contractor}</div>}
            <div className="r">{Ic.cal}Due {St.fmtDateFull(p.dueDate)}{St.projectOverdue(p) ? ` · ${St.dueLabel(p)}` : ''}</div>
          </div>
        </div>
        <div className="ovs-kpis">
          <div className="ovs-kpi"><div className="ovs-kpi-l">Complete</div><div className="ovs-kpi-v"><span className="ovs-kpi-num">{St.projectPct(p)}</span><span className="ovs-kpi-unit">%</span></div></div>
          <div className="ovs-kpi"><div className="ovs-kpi-l">Containments</div><div className="ovs-kpi-v"><span className="ovs-kpi-num">{(p.containments || []).length}</span></div></div>
          <div className="ovs-kpi"><div className="ovs-kpi-l">Samples</div><div className="ovs-kpi-v"><span className="ovs-kpi-num">{(p.airSamples || []).length}</span></div></div>
          <div className="ovs-kpi"><div className="ovs-kpi-l">Workers</div><div className="ovs-kpi-v"><span className="ovs-kpi-num">{(p.workerRoster || []).length}</span></div></div>
          <div className="ovs-kpi"><div className="ovs-kpi-l">Days Left</div><div className="ovs-kpi-v"><span className={'ovs-kpi-num' + (dl != null && dl >= 0 ? ' ok' : '')}>{dl == null ? '—' : dl}</span></div></div>
        </div>

        <Sec title="Lifecycle" />
        <div className="ovs-lc"><div className="ovs-lc-track">
          {St.STAGES.map((s, i) => {
            const stt = i < curIdx ? 'done' : i === curIdx ? 'active' : 'pending';
            return <React.Fragment key={s.id}>
              <div className="ovs-lc-step"><div className="ovs-lc-dot" data-state={stt}>{stt === 'done' ? Ic.check : i + 1}</div>
                <div className="ovs-lc-label">{s.short.split('\n').map((l, j) => <div key={j}>{l}</div>)}</div></div>
              {i < St.STAGES.length - 1 && <div className="ovs-lc-bar" data-done={i < curIdx}></div>}
            </React.Fragment>;
          })}
        </div></div>

        <Sec title="Sections" />
        <div className="ovs-group">
          {sections.map(s => (
            <button key={s.kind} className="ovs-navrow ovs-row-press" style={{ width: '100%' }} onClick={() => app.open({ kind: s.kind, id: p.id })}>
              <div className="ovs-navrow-ic" style={{ background: s.color }}>{s.ic}</div>
              <span className="ovs-navrow-tx">{s.label}</span><span className="ovs-navrow-count">{s.count}</span><span className="ovs-chev">{Ic.chev}</span>
            </button>
          ))}
        </div>

        {activity.length > 0 && <React.Fragment>
          <Sec title="Recent Activity" action="Log" onAction={() => app.sheet({ kind: 'log', project: p })} />
          <div className="ovs-group">
            {activity.map((a, i) => (
              <div key={i} className="ovs-act">
                <div className="ovs-act-rail"><span className={'ovs-act-dot ' + a.dot}></span>{i < activity.length - 1 && <span className="ovs-act-line"></span>}</div>
                <div className="ovs-act-bd"><div className="ovs-act-tx">{a.tx}</div><div className="ovs-act-meta">{a.meta}</div></div>
              </div>
            ))}
          </div>
        </React.Fragment>}
        <div style={{ height: 8 }}></div>
      </div>
      <button className="ovs-fab" onClick={editMenu}>{Ic.plus}</button>
      <OvsTabBar active="projects" onTab={app.setTab} />
    </div>
  );
}

// — CONTAINMENTS ------------------------------------------------------------
function ContainmentsScreen({ app, project }) {
  const p = project;
  const cs = p.containments || [];
  const advance = (c) => app.menu({
    title: `${c.name} — set stage`,
    actions: St.STAGES.map(s => ({ label: s.id, strong: s.id === c.stage, onClick: () => app.actions.setStage(p.id, c.id, s.id) })),
  });
  return (
    <div className="ovs-screen">
      <NavBar title="Containments" sub={p.projectNumber} backLabel={p.siteName.split(' ')[0]} onBack={app.back} />
      <div className="ovs-scroll">
        <div style={{ height: 112 }}></div>
        <Sec title={`${cs.length} containment${cs.length === 1 ? '' : 's'}`} />
        {cs.length ? cs.map(c => {
          const bld = (p.buildings || []).find(b => b.id === c.buildingId);
          const samples = (p.airSamples || []).filter(s => s.containmentId === c.id);
          return (
            <div key={c.id} className="ovs-ccard">
              <div className="ovs-ccard-top"><span className="ovs-ccard-name">{c.name}</span><Stage stage={c.stage} /></div>
              <div className="ovs-ccard-bld">{Ic.building} {bld?.name || '—'} · {(c.spaces || []).length} space(s)</div>
              <div className="ovs-ccard-foot">
                <span className="ovs-ccard-stat">{Ic.vial}<b>{samples.length}</b> samples</span>
                <button className="ovs-ccard-advance" onClick={() => advance(c)}>Set stage {Ic.chev}</button>
              </div>
            </div>
          );
        }) : <div className="ovs-empty"><div className="t">No containments</div><div className="s">Add the first work area.</div>
          <button className="add" onClick={() => app.sheet({ kind: 'containment', project: p })}>{Ic.plusSm} Add containment</button></div>}
        <div style={{ height: 12 }}></div>
      </div>
      <button className="ovs-fab" onClick={() => app.sheet({ kind: 'containment', project: p })}>{Ic.plus}</button>
      <OvsTabBar active="projects" onTab={app.setTab} />
    </div>
  );
}

// — SAMPLES -----------------------------------------------------------------
function SamplesScreen({ app, project }) {
  const p = project;
  const [seg, setSeg] = React.useState('all');
  let samples = (p.airSamples || []).slice().reverse();
  if (seg === 'running') samples = samples.filter(St.sampleRunning);
  else if (seg === 'clearance') samples = samples.filter(s => s.type === 'Clearance');
  const runningCount = (p.airSamples || []).filter(St.sampleRunning).length;
  const totalVol = (p.airSamples || []).reduce((n, s) => n + (s.sampleVolume || 0), 0);
  return (
    <div className="ovs-screen">
      <NavBar title="Air Samples" sub={p.projectNumber} backLabel={p.siteName.split(' ')[0]} onBack={app.back} />
      <div className="ovs-scroll">
        <div style={{ height: 112 }}></div>
        <div className="ovs-stats">
          <div className="ovs-stat"><div className="ovs-stat-label">Total Samples</div><div className="ovs-stat-val"><span className="ovs-stat-num">{(p.airSamples || []).length}</span></div></div>
          <div className="ovs-stat"><div className="ovs-stat-label">Running</div><div className="ovs-stat-val"><span className="ovs-stat-num">{runningCount}</span></div><div className={'ovs-stat-sub' + (runningCount ? ' ' : '')}>{totalVol} L logged</div></div>
        </div>
        <div className="ovs-seg">{[['all', 'All'], ['running', 'Running'], ['clearance', 'Clearance']].map(([k, l]) => <button key={k} data-active={seg === k} onClick={() => setSeg(k)}>{l}</button>)}</div>
        <Sec title={`${samples.length} sample${samples.length === 1 ? '' : 's'}`} />
        {samples.length ? <div className="ovs-group">
          {samples.map(s => {
            const running = St.sampleRunning(s);
            const el = running ? St.runningElapsedMin(s) : s.timeElapsed;
            return (
              <button key={s.id} className="ovs-srow ovs-row-press" onClick={() => app.sheet({ kind: 'sample', project: p, sample: s })}>
                <div className="ovs-srow-top">
                  <span className="ovs-srow-id">{s.sampleId}</span>
                  <span className={'ovs-tag ' + St.SAMPLE_TAG[s.type]}>{s.type}</span>
                  <span style={{ flex: 1 }}></span>
                  <span className={'ovs-status-tag ' + (running ? 'status-running' : 'status-complete')}>{running ? 'Running' : 'Complete'}</span>
                </div>
                {s.location && <div className="ovs-srow-loc">{s.location}</div>}
                <div className="ovs-srow-meta">
                  <div><span className="k">Date</span><b>{St.fmtDate(s.date)}</b></div>
                  <div><span className="k">Elapsed</span><b>{St.fmtClock(el)}</b></div>
                  <div><span className="k">Volume</span><b>{s.sampleVolume ? s.sampleVolume + ' L' : '—'}</b></div>
                </div>
              </button>
            );
          })}
        </div> : <div className="ovs-empty"><div className="t">No samples</div><div className="s">Log the first air sample.</div>
          <button className="add" onClick={() => app.sheet({ kind: 'sample', project: p })}>{Ic.plusSm} Add air sample</button></div>}
        <div style={{ height: 12 }}></div>
      </div>
      <button className="ovs-fab" onClick={() => app.sheet({ kind: 'sample', project: p })}>{Ic.plus}</button>
      <OvsTabBar active="projects" onTab={app.setTab} />
    </div>
  );
}

// — MATERIALS ---------------------------------------------------------------
function MaterialsScreen({ app, project }) {
  const p = project;
  const buildings = p.buildings || [];
  const total = buildings.reduce((n, b) => n + (b.spaces || []).reduce((m, s) => m + (s.materials || []).length, 0), 0);
  return (
    <div className="ovs-screen">
      <NavBar title="Materials" sub={p.projectNumber} backLabel={p.siteName.split(' ')[0]} onBack={app.back} />
      <div className="ovs-scroll">
        <div style={{ height: 112 }}></div>
        <Sec title={`${total} material${total === 1 ? '' : 's'} · ${buildings.length} building(s)`} />
        {total ? buildings.map(b => (
          <div key={b.id} className="ovs-group" style={{ marginBottom: 12 }}>
            <div className="ovs-mtree-head">{Ic.building} {b.name}</div>
            {(b.spaces || []).map(sp => (
              <React.Fragment key={sp.id}>
                <div className="ovs-mtree-space">{sp.name}</div>
                {(sp.materials || []).map(m => (
                  <div key={m.id} className="ovs-mrow"><div className="ovs-mrow-name">{m.name}</div>
                    <div className="ovs-mrow-meta">{m.quantity} {m.unit} · {m.type}</div></div>
                ))}
              </React.Fragment>
            ))}
          </div>
        )) : <div className="ovs-empty"><div className="t">No materials</div><div className="s">Add ACM by space.</div>
          <button className="add" onClick={() => app.sheet({ kind: 'material', project: p })}>{Ic.plusSm} Add material</button></div>}
        <div style={{ height: 12 }}></div>
      </div>
      <button className="ovs-fab" onClick={() => app.sheet({ kind: 'material', project: p })}>{Ic.plus}</button>
      <OvsTabBar active="projects" onTab={app.setTab} />
    </div>
  );
}

// — TEAM --------------------------------------------------------------------
function TeamScreen({ app, project }) {
  const p = project;
  const roster = p.workerRoster || [];
  const cert = (label, iso) => <div><div className="ovs-wcert-l">{label}</div><div className={'ovs-wcert-v' + (certExpired(iso) ? ' expired' : '')}>{iso ? St.fmtDate(iso) : '—'}</div></div>;
  return (
    <div className="ovs-screen">
      <NavBar title="Team" sub={p.projectNumber} backLabel={p.siteName.split(' ')[0]} onBack={app.back} />
      <div className="ovs-scroll">
        <div style={{ height: 112 }}></div>
        <Sec title={`${roster.length} worker${roster.length === 1 ? '' : 's'}`} />
        {roster.length ? roster.map(w => {
          const exp = certExpired(w.respiratorFitExpiration) || certExpired(w.aheraExpiration) || certExpired(w.medicalExpiration);
          return (
            <button key={w.id} className={'ovs-wcard' + (exp ? ' warn' : '')} style={{ display: 'block', width: 'calc(100% - 32px)', textAlign: 'left' }} onClick={() => app.sheet({ kind: 'worker', project: p, worker: w })}>
              <div className="ovs-wcard-top">
                <div className="ovs-wcard-av">{avatarInit(w.name)}</div>
                <div style={{ flex: 1 }}><span className="ovs-wcard-name">{w.name}</span><span className={'ovs-wcard-badge badge-' + w.certificationType}>{w.certificationType === 'S' ? 'Supervisor' : 'Worker'}</span>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>{(w.respiratorTypes || []).join(', ')}</div></div>
                <span className="ovs-chev">{Ic.chev}</span>
              </div>
              <div className="ovs-wcard-certs">{cert('AHERA', w.aheraExpiration)}{cert('Medical', w.medicalExpiration)}{cert('Respirator fit', w.respiratorFitExpiration)}{cert('Lead', w.leadExpiration)}</div>
            </button>
          );
        }) : <div className="ovs-empty"><div className="t">No workers</div><div className="s">Add the crew roster.</div>
          <button className="add" onClick={() => app.sheet({ kind: 'worker', project: p })}>{Ic.plusSm} Add worker</button></div>}
        <div style={{ height: 12 }}></div>
      </div>
      <button className="ovs-fab" onClick={() => app.sheet({ kind: 'worker', project: p })}>{Ic.plus}</button>
      <OvsTabBar active="projects" onTab={app.setTab} />
    </div>
  );
}

// — DOCS --------------------------------------------------------------------
const DOC_TEMPLATES = [
  { t: 'Daily Log Report', d: 'Compiled site logs with photos' },
  { t: 'Air Monitoring Summary', d: 'All sample results & volumes' },
  { t: 'Clearance Report', d: 'Final clearance documentation' },
  { t: 'Worker Roster', d: 'Crew certifications snapshot' },
];
function DocsScreen({ app, project }) {
  const p = project;
  const docs = p.documents || [];
  return (
    <div className="ovs-screen">
      <NavBar title="Documents" sub={p.projectNumber} backLabel={p.siteName.split(' ')[0]} onBack={app.back} />
      <div className="ovs-scroll">
        <div style={{ height: 112 }}></div>
        <Sec title="Generate" />
        <div className="ovs-doc-grid">
          {DOC_TEMPLATES.map((d, i) => (
            <button key={i} className="ovs-doc-tpl ovs-row-press" onClick={() => app.actions.generateDoc(p.id, d.t)}>
              <div className="ic">{Ic.doc}</div><div className="t">{d.t}</div><div className="d">{d.d}</div>
            </button>
          ))}
        </div>
        <Sec title={`Generated · ${docs.length}`} />
        {docs.length ? <div className="ovs-group">
          {docs.map(d => (
            <div key={d.id} className="ovs-navrow">
              <div className="ovs-navrow-ic" style={{ background: '#15803D' }}>{Ic.doc}</div>
              <span className="ovs-navrow-tx" style={{ fontSize: 15 }}>{d.name}</span>
              <span className="ovs-navrow-count">{St.fmtDate(d.date)}</span>
            </div>
          ))}
        </div> : <div className="ovs-empty"><div className="s">No documents generated yet. Tap a template above.</div></div>}
        <div style={{ height: 12 }}></div>
      </div>
      <OvsTabBar active="projects" onTab={app.setTab} />
    </div>
  );
}

// — ARCHIVE -----------------------------------------------------------------
function ArchiveScreen({ app }) {
  const done = app.state.projects.filter(p => p.status === 'completed');
  return (
    <div className="ovs-screen">
      <div className="ovs-scroll">
        <div className="ovs-lt"><div className="ovs-lt-row"><h1 className="ovs-lt-title">Archive</h1></div></div>
        <Sec title={`Completed · ${done.length}`} />
        {done.length ? <div className="ovs-group">{done.map(p => <ProjRow key={p.id} p={p} onClick={() => app.open({ kind: 'project', id: p.id })} />)}</div>
          : <div className="ovs-empty"><div className="s">No completed projects yet.</div></div>}
        <div style={{ height: 8 }}></div>
      </div>
      <OvsTabBar active="archive" onTab={app.setTab} />
    </div>
  );
}

// — PROFILE -----------------------------------------------------------------
function ProfileScreen({ app }) {
  const ins = app.state.inspector;
  const row = (label, onClick) => <button className="ovs-navrow ovs-row-press" style={{ width: '100%' }} onClick={onClick}><span className="ovs-navrow-tx" style={{ fontSize: 16 }}>{label}</span><span className="ovs-chev">{Ic.chev}</span></button>;
  const info = (title, body) => app.sheet({ kind: 'info', title, body });
  return (
    <div className="ovs-screen">
      <div className="ovs-scroll">
        <div className="ovs-lt"><div className="ovs-lt-row"><h1 className="ovs-lt-title">Profile</h1></div></div>
        <div className="ovs-prof-card"><div className="ovs-prof-av">{ins.initials}</div>
          <div><div className="ovs-prof-name">{ins.name}</div><div className="ovs-prof-meta">{ins.license}</div></div></div>
        <Sec title="Account" />
        <div className="ovs-group">
          {row('Inspector details', () => app.sheet({ kind: 'inspector' }))}
          {row('Signature', () => app.sheet({ kind: 'signature' }))}
          {row('Certifications', () => info('Certifications', ins.certifications || 'No certifications on file yet. Add them from Inspector details.'))}
          {row('Default templates', () => app.sheet({ kind: 'templates' }))}
        </div>
        <Sec title="App" />
        <div className="ovs-group">
          {row('Sync & offline', () => info('Sync & Offline', 'Oversight stores every project on this device only — there is no cloud sync. Data persists across app restarts and works fully offline, matching the desktop app.'))}
          {row('Appearance', () => app.sheet({ kind: 'appearance' }))}
          {row('About Oversight', () => info('About Oversight', 'Oversight — asbestos abatement project oversight for field inspectors. iOS companion to the Oversight desktop app.'))}
        </div>
        <div className="ovs-sheet-danger" style={{ marginTop: 24 }} onClick={() => { if (confirm('Reset all demo data to the seeded sample projects?')) app.actions.resetDemo(); }}>Reset demo data</div>
        <div style={{ height: 8 }}></div>
      </div>
      <OvsTabBar active="profile" onTab={app.setTab} />
    </div>
  );
}

window.DOC_TEMPLATES = DOC_TEMPLATES;
Object.assign(window, {
  OvsTabBar, TodayScreen, ProjectsScreen, ProjectScreen, ContainmentsScreen,
  SamplesScreen, MaterialsScreen, TeamScreen, DocsScreen, ArchiveScreen, ProfileScreen, ProjRow,
});
