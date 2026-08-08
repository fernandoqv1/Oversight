// ============================================================================
// OVERSIGHT iOS — app: store hook (state + actions), router, sheet host, shell
// Exports to window: OversightApp  (mount with <OversightApp/>)
// ============================================================================
const Z = window.OvsStore;
const { useState, useEffect, useRef } = React;

const ACCENTS = [
  { id: 'blue', name: 'AsbTrack Blue', val: '#015dab' },
  { id: 'teal', name: 'Field Teal', val: '#0E7C7B' },
  { id: 'slate', name: 'Graphite', val: '#3F4756' },
];
const PREFS = 'ovs_ios_prefs';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS)) || {}; } catch { return {}; } };
const savePrefs = (o) => { try { localStorage.setItem(PREFS, JSON.stringify(o)); } catch {} };

// — store hook --------------------------------------------------------------
function useOversightStore() {
  const [state, setState] = useState(() => Z.loadState());
  useEffect(() => { Z.persist(state); }, [state]);

  const mutProject = (pid, fn) => setState(s => ({ ...s, projects: s.projects.map(p => p.id === pid ? fn(p) : p) }));

  const actions = {
    addProject: (data) => {
      const np = { id: Z.uid(), ...data, status: 'active', createdAt: Date.now(), buildings: [], materials: [], containments: [], airSamples: [], workerRoster: [], dailyLogs: [], documents: [] };
      setState(s => ({ ...s, projects: [np, ...s.projects] }));
      return np;
    },
    updateProject: (pid, data) => mutProject(pid, p => ({ ...p, ...data, name: data.siteName || p.name })),
    toggleComplete: (pid) => mutProject(pid, p => ({ ...p, status: p.status === 'completed' ? 'active' : 'completed' })),
    addSample: (pid, data) => mutProject(pid, p => ({ ...p, airSamples: [...(p.airSamples || []), { id: Z.uid(), ...data }] })),
    updateSample: (pid, sid, data) => mutProject(pid, p => ({ ...p, airSamples: (p.airSamples || []).map(s => s.id === sid ? { ...s, ...data } : s) })),
    deleteSample: (pid, sid) => mutProject(pid, p => ({ ...p, airSamples: (p.airSamples || []).filter(s => s.id !== sid) })),
    addContainment: (pid, data) => mutProject(pid, p => ({ ...p, containments: [...(p.containments || []), { id: Z.uid(), ...data }] })),
    setStage: (pid, cid, stage) => mutProject(pid, p => ({ ...p, containments: (p.containments || []).map(c => c.id === cid ? { ...c, stage } : c) })),
    addWorker: (pid, data) => mutProject(pid, p => ({ ...p, workerRoster: [...(p.workerRoster || []), { id: Z.uid(), ...data }] })),
    updateWorker: (pid, wid, data) => mutProject(pid, p => ({ ...p, workerRoster: (p.workerRoster || []).map(w => w.id === wid ? { ...w, ...data } : w) })),
    addLogEntry: (pid, date, entry) => mutProject(pid, p => {
      const logs = (p.dailyLogs || []).slice();
      let log = logs.find(l => l.date === date);
      if (log) log.entries = [...(log.entries || []), entry];
      else logs.unshift({ id: Z.uid(), date, workers: [], entries: [entry] });
      return { ...p, dailyLogs: logs };
    }),
    addMaterial: (pid, bid, sid, data) => mutProject(pid, p => ({
      ...p, buildings: (p.buildings || []).map(b => b.id !== bid ? b : ({
        ...b, spaces: (b.spaces || []).map(sp => sp.id !== sid ? sp : ({ ...sp, materials: [...(sp.materials || []), { id: Z.uid(), ...data }] })),
      })),
    })),
    generateDoc: (pid, name) => mutProject(pid, p => ({ ...p, documents: [{ id: Z.uid(), name, date: Z.todayISO() }, ...(p.documents || [])] })),
    updateInspector: (data) => setState(s => ({ ...s, inspector: { ...s.inspector, ...data } })),
    resetDemo: () => { Z.reset(); setState(Z.seed()); },
  };
  return { state, actions };
}

// — sheet host --------------------------------------------------------------
function SheetHost({ spec, app }) {
  if (!spec) return null;
  const close = () => app.closeSheet();
  const p = spec.project;
  switch (spec.kind) {
    case 'project':
      return <ProjectSheet project={spec.project} onClose={close} onSave={(data) => {
        if (spec.project) { app.actions.updateProject(spec.project.id, data); app.toast('Project updated'); }
        else { const np = app.actions.addProject(data); app.toast('Project created'); app.open({ kind: 'project', id: np.id }); }
        close();
      }} />;
    case 'sample':
      return <SampleSheet project={p} sample={spec.sample} onClose={close} onSave={(data) => {
        if (spec.sample) app.actions.updateSample(p.id, spec.sample.id, data); else app.actions.addSample(p.id, data);
        app.toast(spec.sample ? 'Sample updated' : 'Sample added'); close();
      }} />;
    case 'containment':
      return <ContainmentSheet project={p} onClose={close} onSave={(data) => { app.actions.addContainment(p.id, data); app.toast('Containment added'); close(); }} />;
    case 'worker':
      return <WorkerSheet worker={spec.worker} onClose={close} onSave={(data) => {
        if (spec.worker) app.actions.updateWorker(p.id, spec.worker.id, data); else app.actions.addWorker(p.id, data);
        app.toast(spec.worker ? 'Worker updated' : 'Worker added'); close();
      }} />;
    case 'log':
      return <DailyLogSheet project={p} onClose={close} onSave={(date, entry) => { app.actions.addLogEntry(p.id, date, entry); app.toast('Log entry added'); close(); }} />;
    case 'material':
      return <MaterialSheet project={p} onClose={close} onSave={(bid, sid, data) => { app.actions.addMaterial(p.id, bid, sid, data); app.toast('Material added'); close(); }} />;
    case 'inspector':
      return <InspectorSheet inspector={app.state.inspector} onClose={close} onSave={(data) => { app.actions.updateInspector(data); app.toast('Profile updated'); close(); }} />;
    case 'appearance':
      return <AppearanceSheet theme={app.theme} onClose={close} />;
    case 'signature':
      return <SignatureSheet value={app.state.inspector.signature} onClose={close} onSave={(data) => { app.actions.updateInspector({ signature: data }); app.toast('Signature saved'); close(); }} />;
    case 'templates':
      return <TemplatesSheet onClose={close} />;
    case 'info':
      return <InfoSheet title={spec.title} body={spec.body} onClose={close} />;
    default: return null;
  }
}

// — screen router -----------------------------------------------------------
function CurrentScreen({ app }) {
  const route = app.route;
  const findP = (id) => app.state.projects.find(p => p.id === id);
  if (route) {
    const p = findP(route.id);
    if (!p) { return <ProjectsScreen app={app} />; }
    switch (route.kind) {
      case 'project': return <ProjectScreen app={app} project={p} />;
      case 'containments': return <ContainmentsScreen app={app} project={p} />;
      case 'samples': return <SamplesScreen app={app} project={p} />;
      case 'materials': return <MaterialsScreen app={app} project={p} />;
      case 'team': return <TeamScreen app={app} project={p} />;
      case 'docs': return <DocsScreen app={app} project={p} />;
    }
  }
  if (app.tab === 'today') return <TodayScreen app={app} />;
  if (app.tab === 'projects') return <ProjectsScreen app={app} />;
  if (app.tab === 'archive') return <ArchiveScreen app={app} />;
  return <ProfileScreen app={app} />;
}

// — main app ----------------------------------------------------------------
function OversightApp() {
  const { state, actions } = useOversightStore();
  const prefs = loadPrefs();
  const [dark, setDark] = useState(prefs.dark || false);
  const [accent, setAccent] = useState(prefs.accent || 'blue');
  const [tab, setTabRaw] = useState(prefs.tab || 'today');
  const [stack, setStack] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [menu, setMenu] = useState(null);
  const [toast, setToastMsg] = useState(null);
  const [pushAnim, setPushAnim] = useState(false);
  const [, setTick] = useState(0);
  const [scale, setScale] = useState(1);
  const wrapRef = useRef(null);
  const toastT = useRef(0);

  useEffect(() => { savePrefs({ dark, accent, tab }); }, [dark, accent, tab]);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const fit = () => { const el = wrapRef.current; if (!el) return; setScale(Math.min((el.clientWidth - 40) / 402, (el.clientHeight - 40) / 874, 1.15)); };
    fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit);
  }, []);

  const route = stack[stack.length - 1] || null;
  const setTab = (t) => { setStack([]); setSheet(null); setMenu(null); setTabRaw(t); };
  const open = (r) => { setStack(s => [...s, r]); setPushAnim(true); setTimeout(() => setPushAnim(false), 340); };
  const back = () => setStack(s => s.slice(0, -1));
  const showToast = (m) => { setToastMsg(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToastMsg(null), 2400); };

  const app = {
    state, actions, tab, setTab, route, open, back,
    sheet: (spec) => setSheet(spec), closeSheet: () => setSheet(null),
    menu: (spec) => setMenu(spec), toast: showToast,
    theme: { dark, accent, setDark, setAccent, ACCENTS },
  };

  const accentVal = ACCENTS.find(a => a.id === accent).val;
  const routeKey = route ? route.kind + route.id : tab;

  return (
    <div className="stage">
      <div className="pbar">
        <div className="brand"><span className="bmark"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>Oversight · iOS</div>
        <div className="spacer"></div>
        <span className="lbl">Accent</span>
        <div style={{ display: 'flex', gap: 7 }}>{ACCENTS.map(a => <button key={a.id} className="sw" data-active={accent === a.id} style={{ background: a.val }} title={a.name} onClick={() => setAccent(a.id)}></button>)}</div>
        <div className="ctl"><button data-active={!dark} onClick={() => setDark(false)}>Light</button><button data-active={dark} onClick={() => setDark(true)}>Dark</button></div>
      </div>

      <div className="device-wrap" ref={wrapRef}>
        <div className="device-scale" style={{ transform: `scale(${scale})` }}>
          <IOSDevice dark={dark}>
            <div className="ovs" data-theme={dark ? 'dark' : 'light'} style={{ height: '100%', position: 'relative', '--accent': accentVal }}>
              <div className="view-stack">
                <div key={routeKey} className={'view-layer ' + (route && pushAnim ? 'slide-enter' : '')}>
                  <CurrentScreen app={app} />
                </div>
              </div>
              <SheetHost spec={sheet} app={app} />
              {menu && <ActionSheet title={menu.title} actions={menu.actions} onClose={() => setMenu(null)} />}
              {toast && <div className="ovs-toast">{toast}</div>}
            </div>
          </IOSDevice>
        </div>
      </div>
      <div className="hint">A working prototype — create &amp; edit projects, log air samples, advance containment stages. Data persists locally.</div>
    </div>
  );
}

window.OversightApp = OversightApp;
