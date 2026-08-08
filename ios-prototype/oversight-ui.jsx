// ============================================================================
// OVERSIGHT iOS — shared UI primitives (icons, sheet shell, form fields, badges)
// Exports to window: Ic, Stage, Bar, Sheet, ActionSheet, FieldGroup, Field, FieldCol
// ============================================================================
const Ic = {
  home:  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/></svg>,
  grid:  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  archive: <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="5"/><path d="M4 8v13h16V8"/><path d="M10 12h4"/></svg>,
  user:  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>,
  search: <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>,
  chev:  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>,
  back:  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6"/></svg>,
  plus:  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  plusSm:<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  bell:  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>,
  dots:  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>,
  alert: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>,
  clock: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  shield:<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  check: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>,
  checkSm:<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>,
  doc:   <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>,
  pin:   <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  cal:   <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  person:<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>,
  phone: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>,
  box:   <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>,
  vial:  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6M10 3v7L6 17a3 3 0 0 0 3 4h6a3 3 0 0 0 3-4l-4-7V3"/><path d="M7.5 14h9"/></svg>,
  team:  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 5.5a3.5 3.5 0 0 1 0 6.8M21 20c0-2.6-1.5-4.2-3.8-4.8"/></svg>,
  layers:<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></svg>,
  camera:<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  edit:  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>,
  building:<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/></svg>,
};

function Stage({ stage }) {
  const m = window.OvsStore.stageMeta(stage);
  return <span className={'ovs-stage ' + m.cls}><span className="d"></span>{m.tab}</span>;
}
function Bar({ pct }) { return <div className="ovs-bar"><span style={{ width: pct + '%' }}></span></div>; }

// — Bottom sheet ------------------------------------------------------------
function Sheet({ title, onClose, onSave, saveLabel = 'Save', saveDisabled, children, full }) {
  const [up, setUp] = React.useState(false);
  React.useEffect(() => { setUp(true); }, []);
  return (
    <React.Fragment>
      <div className="ovs-sheet-scrim" style={{ opacity: up ? 1 : 0, transition: 'opacity 220ms ease' }} onClick={onClose}></div>
      <div className={'ovs-sheet' + (full ? ' full' : '')} style={{ transform: up ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 340ms cubic-bezier(.32,.72,0,1)' }}>
        <div className="ovs-sheet-grab"></div>
        <div className="ovs-sheet-head">
          <button className="ovs-sheet-cancel" onClick={onClose}>Cancel</button>
          <h3>{title}</h3>
          {onSave
            ? <button className="ovs-sheet-save" disabled={saveDisabled} onClick={onSave}>{saveLabel}</button>
            : <span style={{ minWidth: 60 }}></span>}
        </div>
        <div className="ovs-sheet-body">{children}</div>
      </div>
    </React.Fragment>
  );
}

// — Action sheet (iOS menu) -------------------------------------------------
function ActionSheet({ title, actions, onClose }) {
  const [up, setUp] = React.useState(false);
  React.useEffect(() => { setUp(true); }, []);
  return (
    <React.Fragment>
      <div className="ovs-sheet-scrim" style={{ opacity: up ? 1 : 0, transition: 'opacity 200ms ease' }} onClick={onClose}></div>
      <div className="ovs-actions" style={{ transform: up ? 'translateY(0)' : 'translateY(16px)', opacity: up ? 1 : 0, transition: 'transform 240ms cubic-bezier(.32,.72,0,1), opacity 200ms ease' }}>
        <div className="ovs-actions-grp">
          {title && <div className="ovs-action-title">{title}</div>}
          {actions.map((a, i) => (
            <button key={i} className={'ovs-action' + (a.danger ? ' danger' : '') + (a.strong ? ' strong' : '')}
              onClick={() => { onClose(); a.onClick && a.onClick(); }}>{a.label}</button>
          ))}
        </div>
        <button className="ovs-action-cancel" onClick={onClose}>Cancel</button>
      </div>
    </React.Fragment>
  );
}

// — Form primitives ---------------------------------------------------------
function FieldGroup({ label, hint, children }) {
  return (
    <React.Fragment>
      {label && <div className="ovs-field-glabel">{label}</div>}
      <div className="ovs-field-group">{children}</div>
      {hint && <div className="ovs-field-hint">{hint}</div>}
    </React.Fragment>
  );
}
function Field({ label, req, children }) {
  return <div className="ovs-field"><span className="ovs-field-lbl">{label}{req && <span className="req"> *</span>}</span>{children}</div>;
}
function FieldCol({ label, req, children }) {
  return <div className="ovs-field col"><span className="ovs-field-lbl">{label}{req && <span className="req"> *</span>}</span>{children}</div>;
}

Object.assign(window, { Ic, Stage, Bar, Sheet, ActionSheet, FieldGroup, Field, FieldCol });
