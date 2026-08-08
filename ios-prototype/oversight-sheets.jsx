// ============================================================================
// OVERSIGHT iOS — working form sheets (create/edit). All save into the store.
// Exports to window: ProjectSheet, SampleSheet, ContainmentSheet, WorkerSheet,
//                    DailyLogSheet, MaterialSheet
// ============================================================================
const S = window.OvsStore;
const TYPE_PREFIX = { Area: 'A', Personal: 'P', Clearance: 'CL', Background: 'BG' };

function nextSuffix(project, type) {
  const pre = TYPE_PREFIX[type] || 'A';
  const re = new RegExp('-' + pre + '-?(\\d+)$');
  const nums = (project.airSamples || []).map(s => { const m = String(s.sampleId || '').match(re); return m ? parseInt(m[1], 10) : 0; });
  return String((Math.max(0, ...nums, 0) + 1)).padStart(2, '0');
}

// — PROJECT -----------------------------------------------------------------
function ProjectSheet({ project, onSave, onClose }) {
  const isEdit = !!project;
  const [f, setF] = React.useState(() => ({
    projectNumber: project?.projectNumber || '', siteName: project?.siteName || '', siteAddress: project?.siteAddress || '',
    clientName: project?.clientName || '', clientPhone: project?.clientPhone || '', clientContactName: project?.clientContactName || '',
    clientContactPhone: project?.clientContactPhone || '', contractor: project?.contractor || '', contractorPhone: project?.contractorPhone || '',
    foremanName: project?.foremanName || '', foremanPhone: project?.foremanPhone || '', dueDate: project?.dueDate || S.addDaysISO(14),
  }));
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = f.projectNumber.trim() && f.siteName.trim();
  return (
    <Sheet title={isEdit ? 'Edit Project' : 'New Project'} onClose={onClose} saveDisabled={!valid}
      saveLabel={isEdit ? 'Save' : 'Create'} onSave={() => { if (valid) onSave(f); }}>
      <FieldGroup label="Project">
        <Field label="Number" req><input value={f.projectNumber} onChange={up('projectNumber')} placeholder="OVS-0000" /></Field>
        <Field label="Due date"><input type="date" value={f.dueDate} onChange={up('dueDate')} /></Field>
      </FieldGroup>
      <FieldGroup label="Site">
        <FieldCol label="Site name" req><input value={f.siteName} onChange={up('siteName')} placeholder="e.g. Riverside Elementary" /></FieldCol>
        <FieldCol label="Address"><input value={f.siteAddress} onChange={up('siteAddress')} placeholder="Street, building" /></FieldCol>
      </FieldGroup>
      <FieldGroup label="Client">
        <Field label="Client"><input value={f.clientName} onChange={up('clientName')} placeholder="Client company" /></Field>
        <Field label="Phone"><input type="tel" value={f.clientPhone} onChange={up('clientPhone')} placeholder="(000) 000-0000" /></Field>
        <Field label="Contact"><input value={f.clientContactName} onChange={up('clientContactName')} placeholder="Site contact name" /></Field>
        <Field label="Contact ph."><input type="tel" value={f.clientContactPhone} onChange={up('clientContactPhone')} placeholder="(000) 000-0000" /></Field>
      </FieldGroup>
      <FieldGroup label="Abatement contractor">
        <Field label="Contractor"><input value={f.contractor} onChange={up('contractor')} placeholder="Contractor name" /></Field>
        <Field label="Phone"><input type="tel" value={f.contractorPhone} onChange={up('contractorPhone')} placeholder="(000) 000-0000" /></Field>
        <Field label="Foreman"><input value={f.foremanName} onChange={up('foremanName')} placeholder="Foreman name" /></Field>
        <Field label="Foreman ph."><input type="tel" value={f.foremanPhone} onChange={up('foremanPhone')} placeholder="(000) 000-0000" /></Field>
      </FieldGroup>
      <div style={{ height: 18 }}></div>
    </Sheet>
  );
}

// — AIR SAMPLE --------------------------------------------------------------
function SampleSheet({ project, sample, onSave, onClose }) {
  const isEdit = !!sample;
  const [f, setF] = React.useState(() => ({
    type: sample?.type || 'Area',
    suffix: sample ? (String(sample.sampleId || '').match(/(\d+)$/)?.[1] || '01') : nextSuffix(project, sample?.type || 'Area'),
    date: sample?.date || S.todayISO(),
    location: sample?.location || '',
    containmentId: sample?.containmentId || '',
    startTime: sample?.startTime || '', stopTime: sample?.stopTime || '',
    startFlowRate: sample?.startFlowRate ?? 2.0, stopFlowRate: sample?.stopFlowRate ?? '',
  }));
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setType = (t) => setF({ ...f, type: t, suffix: isEdit ? f.suffix : nextSuffix(project, t) });

  const elapsed = S.calcElapsed(f.startTime, f.stopTime);
  const sf = parseFloat(f.startFlowRate), ef = parseFloat(f.stopFlowRate);
  const vol = S.calcVolume(isNaN(sf) ? null : sf, isNaN(ef) ? null : ef, elapsed);
  const avg = [sf, ef].filter(x => !isNaN(x));
  const avgFlow = avg.length ? (avg.reduce((a, b) => a + b, 0) / avg.length).toFixed(1) : '—';
  const prefix = `${project.projectNumber}-${TYPE_PREFIX[f.type]}`;

  const save = () => {
    const sampleId = `${prefix}-${f.suffix || '01'}`;
    const cont = (project.containments || []).find(c => c.id === f.containmentId);
    const running = f.startTime && !f.stopTime;
    onSave({
      sampleId, type: f.type, date: f.date, location: f.location.trim(),
      containmentId: f.containmentId, containmentName: cont?.name || '',
      startTime: f.startTime, stopTime: f.stopTime,
      startFlowRate: isNaN(sf) ? null : sf, stopFlowRate: isNaN(ef) ? null : ef,
      timeElapsed: elapsed, sampleVolume: vol,
      startEpoch: running ? (sample?.startEpoch || Date.now()) : null,
    });
  };

  return (
    <Sheet title={isEdit ? 'Edit Air Sample' : 'Add Air Sample'} onClose={onClose} onSave={save} saveLabel={isEdit ? 'Save' : 'Add'} full>
      <div className="ovs-fseg">
        {S.SAMPLE_TYPES.map(t => <button key={t} data-active={f.type === t} onClick={() => setType(t)}>{t}</button>)}
      </div>
      <FieldGroup label="Identity">
        <Field label="Sample ID"><span className="mono" style={{ color: 'var(--text-muted)', fontSize: 15 }}>{prefix}-</span><input value={f.suffix} onChange={up('suffix')} style={{ flex: 'none', width: 64 }} /></Field>
        <Field label="Date"><input type="date" value={f.date} onChange={up('date')} /></Field>
        <Field label="Containment">
          <select value={f.containmentId} onChange={up('containmentId')}>
            <option value="">— None —</option>
            {(project.containments || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </FieldGroup>
      <FieldGroup>
        <FieldCol label="Location"><input value={f.location} onChange={up('location')} placeholder="e.g. Outside containment, N wall" /></FieldCol>
      </FieldGroup>
      <FieldGroup label="Times & flow rates" hint="Leave Stop blank to mark the sample as running.">
        <Field label="Start time"><input type="time" value={f.startTime} onChange={up('startTime')} /></Field>
        <Field label="Start flow"><input type="number" step="0.1" value={f.startFlowRate} onChange={up('startFlowRate')} placeholder="2.0" /></Field>
        <Field label="Stop time"><input type="time" value={f.stopTime} onChange={up('stopTime')} /></Field>
        <Field label="Stop flow"><input type="number" step="0.1" value={f.stopFlowRate} onChange={up('stopFlowRate')} placeholder="2.0" /></Field>
      </FieldGroup>
      <div className="ovs-calc">
        <div><div className="ovs-calc-k">Elapsed</div><div className="ovs-calc-v">{elapsed != null ? S.fmtMin(elapsed) : '—'}</div></div>
        <div><div className="ovs-calc-k">Volume</div><div className="ovs-calc-v">{vol != null ? vol + ' L' : '—'}</div></div>
        <div><div className="ovs-calc-k">Avg flow</div><div className="ovs-calc-v">{avgFlow}{avgFlow !== '—' ? '' : ''}</div></div>
      </div>
      <div style={{ height: 20 }}></div>
    </Sheet>
  );
}

// — CONTAINMENT -------------------------------------------------------------
function ContainmentSheet({ project, onSave, onClose }) {
  const buildings = project.buildings || [];
  const [f, setF] = React.useState({ name: '', buildingId: buildings[0]?.id || '', stage: S.STAGES[0].id, spaceIds: [] });
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const bld = buildings.find(b => b.id === f.buildingId);
  const spaces = bld?.spaces || [];
  const toggleSpace = (id) => setF({ ...f, spaceIds: f.spaceIds.includes(id) ? f.spaceIds.filter(x => x !== id) : [...f.spaceIds, id] });
  const valid = f.name.trim() && f.buildingId;
  return (
    <Sheet title="Add Containment" onClose={onClose} saveDisabled={!valid} saveLabel="Add"
      onSave={() => valid && onSave({
        name: f.name.trim(), buildingId: f.buildingId, stage: f.stage,
        spaces: spaces.filter(s => f.spaceIds.includes(s.id)).map(s => ({ id: s.id, name: s.name })),
      })}>
      <FieldGroup hint="The “Containment” suffix is added automatically in documents.">
        <Field label="Name" req><input value={f.name} onChange={up('name')} placeholder="e.g. North, Boiler Room" /></Field>
        <FieldCol label="Building"><select value={f.buildingId} onChange={(e) => setF({ ...f, buildingId: e.target.value, spaceIds: [] })}>
          {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select></FieldCol>
        <FieldCol label="Stage"><select value={f.stage} onChange={up('stage')}>
          {S.STAGES.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
        </select></FieldCol>
      </FieldGroup>
      <FieldGroup label={'Spaces' + (spaces.length ? '' : ' — none in this building')}>
        {spaces.length === 0 && <div className="ovs-field" style={{ color: 'var(--text-muted)', fontSize: 14 }}>No spaces yet</div>}
        {spaces.map(sp => (
          <button key={sp.id} className="ovs-opt" data-on={f.spaceIds.includes(sp.id)} onClick={() => toggleSpace(sp.id)} style={{ width: '100%' }}>
            <span className="ovs-opt-box">{f.spaceIds.includes(sp.id) && Ic.checkSm}</span>
            <span className="ovs-opt-tx">{sp.name}<span className="ovs-opt-sub">{(sp.materials || []).length} material(s)</span></span>
          </button>
        ))}
      </FieldGroup>
      <div style={{ height: 20 }}></div>
    </Sheet>
  );
}

// — WORKER ------------------------------------------------------------------
function WorkerSheet({ worker, onSave, onClose }) {
  const isEdit = !!worker;
  const [f, setF] = React.useState(() => ({
    name: worker?.name || '', certificationType: worker?.certificationType || 'W',
    aheraExpiration: worker?.aheraExpiration || '', medicalExpiration: worker?.medicalExpiration || '',
    respiratorFitExpiration: worker?.respiratorFitExpiration || '', leadExpiration: worker?.leadExpiration || '',
    leadMedExpiration: worker?.leadMedExpiration || '', respiratorTypes: worker?.respiratorTypes || ['Half-Face'],
  }));
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleResp = (r) => setF({ ...f, respiratorTypes: f.respiratorTypes.includes(r) ? f.respiratorTypes.filter(x => x !== r) : [...f.respiratorTypes, r] });
  const valid = f.name.trim() && f.respiratorTypes.length;
  return (
    <Sheet title={isEdit ? 'Edit Worker' : 'Add Worker'} onClose={onClose} saveDisabled={!valid} saveLabel={isEdit ? 'Save' : 'Add'}
      onSave={() => valid && onSave({ ...f, name: f.name.trim() })}>
      <FieldGroup>
        <Field label="Name" req><input value={f.name} onChange={up('name')} placeholder="Worker name" /></Field>
        <Field label="Role"><select value={f.certificationType} onChange={up('certificationType')}>
          <option value="W">Worker (W)</option><option value="S">Supervisor (S)</option>
        </select></Field>
      </FieldGroup>
      <FieldGroup label="Certification expirations">
        <Field label="AHERA"><input type="date" value={f.aheraExpiration} onChange={up('aheraExpiration')} /></Field>
        <Field label="Medical"><input type="date" value={f.medicalExpiration} onChange={up('medicalExpiration')} /></Field>
        <Field label="Respirator fit"><input type="date" value={f.respiratorFitExpiration} onChange={up('respiratorFitExpiration')} /></Field>
        <Field label="Lead training"><input type="date" value={f.leadExpiration} onChange={up('leadExpiration')} /></Field>
        <Field label="Lead medical"><input type="date" value={f.leadMedExpiration} onChange={up('leadMedExpiration')} /></Field>
      </FieldGroup>
      <div className="ovs-field-glabel">Respirator type</div>
      <div className="ovs-chip-row">
        {S.RESPIRATORS.map(r => <button key={r} className="ovs-chip" data-on={f.respiratorTypes.includes(r)} onClick={() => toggleResp(r)}>{r}</button>)}
      </div>
      <div style={{ height: 20 }}></div>
    </Sheet>
  );
}

// — DAILY LOG ---------------------------------------------------------------
function DailyLogSheet({ project, onSave, onClose }) {
  const stages = Array.from(new Set((project.containments || []).map(c => c.stage)));
  const now = new Date();
  const [f, setF] = React.useState({
    date: S.todayISO(), time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    stage: stages[0] || S.STAGES[0].id, note: '', photos: 0, fail: false,
  });
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = f.note.trim();
  return (
    <Sheet title="Daily Log Entry" onClose={onClose} saveDisabled={!valid} saveLabel="Add"
      onSave={() => valid && onSave(f.date, { id: S.uid(), time: f.time, stage: f.stage, note: f.note.trim(), photos: f.photos, fail: f.fail })}>
      <FieldGroup>
        <Field label="Date"><input type="date" value={f.date} onChange={up('date')} /></Field>
        <Field label="Time"><input type="time" value={f.time} onChange={up('time')} /></Field>
        <FieldCol label="Stage"><select value={f.stage} onChange={up('stage')}>
          {S.STAGES.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
        </select></FieldCol>
      </FieldGroup>
      <FieldGroup label="Notes">
        <div className="ovs-field col"><textarea rows="4" value={f.note} onChange={up('note')} placeholder="What happened on site today…" /></div>
      </FieldGroup>
      <FieldGroup>
        <button className="ovs-field" style={{ width: '100%', color: 'var(--accent)' }} onClick={() => setF({ ...f, photos: f.photos + 1 })}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{Ic.camera}<span style={{ fontSize: 15 }}>Add photo</span></span>
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 14 }}>{f.photos} attached</span>
        </button>
        <button className="ovs-opt" data-on={f.fail} onClick={() => setF({ ...f, fail: !f.fail })} style={{ width: '100%' }}>
          <span className="ovs-opt-box">{f.fail && Ic.checkSm}</span>
          <span className="ovs-opt-tx">Flag as failed inspection<span className="ovs-opt-sub">Marks this entry red on the timeline</span></span>
        </button>
      </FieldGroup>
      <div style={{ height: 20 }}></div>
    </Sheet>
  );
}

// — MATERIAL ----------------------------------------------------------------
function MaterialSheet({ project, onSave, onClose }) {
  const buildings = project.buildings || [];
  const [f, setF] = React.useState({
    buildingId: buildings[0]?.id || '', spaceId: buildings[0]?.spaces?.[0]?.id || '',
    name: '', quantity: '', unit: 'ft²', type: 'Surfacing',
  });
  const bld = buildings.find(b => b.id === f.buildingId);
  const spaces = bld?.spaces || [];
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = f.name.trim() && f.spaceId;
  return (
    <Sheet title="Add Material" onClose={onClose} saveDisabled={!valid} saveLabel="Add"
      onSave={() => valid && onSave(f.buildingId, f.spaceId, { name: f.name.trim(), quantity: parseFloat(f.quantity) || 0, unit: f.unit, type: f.type })}>
      <FieldGroup label="Location">
        <FieldCol label="Building"><select value={f.buildingId} onChange={(e) => { const b = buildings.find(x => x.id === e.target.value); setF({ ...f, buildingId: e.target.value, spaceId: b?.spaces?.[0]?.id || '' }); }}>
          {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select></FieldCol>
        <FieldCol label="Space"><select value={f.spaceId} onChange={up('spaceId')}>
          {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></FieldCol>
      </FieldGroup>
      <FieldGroup label="Material">
        <FieldCol label="Name" req><input value={f.name} onChange={up('name')} placeholder="e.g. Pipe Insulation (TSI)" /></FieldCol>
        <Field label="Quantity"><input type="number" value={f.quantity} onChange={up('quantity')} placeholder="0" /></Field>
        <Field label="Unit"><select value={f.unit} onChange={up('unit')}>{S.UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></Field>
        <Field label="Type"><select value={f.type} onChange={up('type')}>{['Surfacing', 'TSI', 'Misc'].map(t => <option key={t} value={t}>{t}</option>)}</select></Field>
      </FieldGroup>
      <div style={{ height: 20 }}></div>
    </Sheet>
  );
}

// — INSPECTOR PROFILE --------------------------------------------------------
function InspectorSheet({ inspector, onSave, onClose }) {
  const [f, setF] = React.useState({ name: inspector.name || '', license: inspector.license || '', certifications: inspector.certifications || '' });
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = f.name.trim();
  return (
    <Sheet title="Inspector Details" onClose={onClose} saveDisabled={!valid} saveLabel="Save" onSave={() => valid && onSave(f)}>
      <FieldGroup label="Identity">
        <Field label="Name" req><input value={f.name} onChange={up('name')} placeholder="Full name" /></Field>
        <Field label="License"><input value={f.license} onChange={up('license')} placeholder="e.g. CAC #00-0000" /></Field>
      </FieldGroup>
      <FieldGroup label="Certifications" hint="Free text — e.g. AHERA Building Inspector, Contractor/Supervisor, Project Designer.">
        <div className="ovs-field col"><textarea rows="4" value={f.certifications} onChange={up('certifications')} placeholder="List certifications and expirations…" /></div>
      </FieldGroup>
      <div style={{ height: 20 }}></div>
    </Sheet>
  );
}

// — APPEARANCE ----------------------------------------------------------------
function AppearanceSheet({ theme, onClose }) {
  const { dark, accent, setDark, setAccent, ACCENTS } = theme;
  return (
    <Sheet title="Appearance" onClose={onClose}>
      <div className="ovs-field-glabel">Theme</div>
      <div className="ovs-fseg" style={{ margin: '0 16px' }}>
        <button data-active={!dark} onClick={() => setDark(false)}>Light</button>
        <button data-active={dark} onClick={() => setDark(true)}>Dark</button>
      </div>
      <div className="ovs-field-glabel">Accent color</div>
      <div className="ovs-field-group">
        {ACCENTS.map((a, i) => (
          <button key={a.id} className="ovs-opt" data-on={accent === a.id} onClick={() => setAccent(a.id)} style={{ width: '100%' }}>
            <span className="ovs-opt-box" style={{ background: a.val, borderColor: a.val }}>{accent === a.id && Ic.checkSm}</span>
            <span className="ovs-opt-tx">{a.name}</span>
          </button>
        ))}
      </div>
      <div style={{ height: 20 }}></div>
    </Sheet>
  );
}

// — SIGNATURE ------------------------------------------------------------------
function SignatureSheet({ value, onSave, onClose }) {
  const canvasRef = React.useRef(null);
  const drawing = React.useRef(false);
  const has = React.useRef(!!value);
  React.useEffect(() => {
    const c = canvasRef.current; const ctx = c.getContext('2d');
    ctx.strokeStyle = '#14130F'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    if (value) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = value; }
    const pos = (e) => { const r = c.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * c.width / r.width, y: (t.clientY - r.top) * c.height / r.height }; };
    const start = (e) => { drawing.current = true; has.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e) => { if (!drawing.current) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const end = () => { drawing.current = false; };
    c.addEventListener('mousedown', start); c.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    c.addEventListener('touchstart', start); c.addEventListener('touchmove', move); c.addEventListener('touchend', end);
    return () => { c.removeEventListener('mousedown', start); c.removeEventListener('mousemove', move); window.removeEventListener('mouseup', end); c.removeEventListener('touchstart', start); c.removeEventListener('touchmove', move); c.removeEventListener('touchend', end); };
  }, []);
  const clear = () => { const c = canvasRef.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); has.current = false; };
  return (
    <Sheet title="Signature" onClose={onClose} saveLabel="Save" onSave={() => onSave(has.current ? canvasRef.current.toDataURL() : null)}>
      <div style={{ margin: '14px 16px 0', border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface-2)' }}>
        <canvas ref={canvasRef} width={370} height={200} style={{ width: '100%', height: 200, display: 'block', touchAction: 'none' }} />
      </div>
      <div className="ovs-field-hint">Draw your signature above with a finger or mouse.</div>
      <button className="ovs-field" style={{ margin: '10px 16px 0', width: 'calc(100% - 32px)', color: 'var(--accent)', justifyContent: 'center' }} onClick={clear}>Clear</button>
      <div style={{ height: 20 }}></div>
    </Sheet>
  );
}

// — DEFAULT TEMPLATES -----------------------------------------------------------
const TEMPLATES_KEY = 'ovs_ios_default_templates';
function TemplatesSheet({ onClose }) {
  const load = () => { try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY)) || []; } catch { return []; } };
  const [on, setOn] = React.useState(load);
  const toggle = (t) => { const next = on.includes(t) ? on.filter(x => x !== t) : [...on, t]; setOn(next); try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next)); } catch {} };
  return (
    <Sheet title="Default Templates" onClose={onClose}>
      <FieldGroup label="Generate automatically" hint="Selected templates are generated by default when a project reaches Abatement Completed.">
        {(window.DOC_TEMPLATES || []).map(d => (
          <button key={d.t} className="ovs-opt" data-on={on.includes(d.t)} onClick={() => toggle(d.t)} style={{ width: '100%' }}>
            <span className="ovs-opt-box">{on.includes(d.t) && Ic.checkSm}</span>
            <span className="ovs-opt-tx">{d.t}<span className="ovs-opt-sub">{d.d}</span></span>
          </button>
        ))}
      </FieldGroup>
      <div style={{ height: 20 }}></div>
    </Sheet>
  );
}

// — GENERIC INFO SHEET ------------------------------------------------------
function InfoSheet({ title, body, onClose }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div style={{ margin: '16px 20px 4px', fontSize: 15, lineHeight: 1.55, color: 'var(--text-2)' }}>{body}</div>
      <div style={{ height: 20 }}></div>
    </Sheet>
  );
}

Object.assign(window, { ProjectSheet, SampleSheet, ContainmentSheet, WorkerSheet, DailyLogSheet, MaterialSheet, InspectorSheet, AppearanceSheet, SignatureSheet, TemplatesSheet, InfoSheet });
