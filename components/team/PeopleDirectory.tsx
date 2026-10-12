'use client';
/**
 * People / HR (web) — tenant employee roster + full employee record: contact & pay,
 * certifications, specialties, project assignments, and incident/warning history.
 * Reads/writes go through the RLS-scoped browser Supabase client (auto_set_tenant_id
 * trigger stamps the tenant). Mirrors the iOS People module.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { UsersThree, Plus, PencilSimple, Trash, X, SealCheck, Warning, Star, FirstAid, Eye, ChatDots, Folder, CurrencyDollar, Phone, Envelope, MapPin, Briefcase } from '@phosphor-icons/react';
import { ListToolbar } from '@/components/ui/ListToolbar';

const GOLD = 'var(--brand-primary)', DARK = 'var(--bg-base)', RAISED = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.12)';
const DIM = 'var(--text-secondary)', TEXT = 'var(--text-primary)', GREEN = 'var(--success)', RED = 'var(--danger)', AMBER = 'var(--warning)';
/* eslint-disable @typescript-eslint/no-explicit-any */
const nameOf = (e: any) => (e?.full_name || `${e?.first_name ?? ''} ${e?.last_name ?? ''}`).trim() || 'Unnamed';
const initials = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const INC_TYPES = [
  { v: 'warning', l: 'Warning', c: AMBER, I: ChatDots }, { v: 'incident', l: 'Incident', c: RED, I: Warning },
  { v: 'injury', l: 'Injury', c: RED, I: FirstAid }, { v: 'near_miss', l: 'Near Miss', c: AMBER, I: Eye }, { v: 'commendation', l: 'Commendation', c: GREEN, I: Star },
];
const incMeta = (t: string) => INC_TYPES.find((x) => x.v === t) ?? INC_TYPES[1];
// Never show a raw Postgres message (it names tables/columns/constraints). Log the
// real error for support and give the user words they can act on.
const friendlyDbError = (err: { code?: string; message?: string } | null, fallback: string) => {
  if (err) console.error('[people] save failed', err);
  if (err?.code === '23505') return 'Someone with these details is already on your roster.';
  if (err?.code === '42501') return "You don't have permission to change the crew roster.";
  if (err?.code === '23502') return 'A required field is missing — check the name fields and try again.';
  return fallback;
};
const fmtDate = (s: string | null) => { if (!s) return ''; const d = new Date(s); return isNaN(d.getTime()) ? String(s) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };

export function PeopleDirectory() {
  const sb = getSupabaseBrowser();
  const [emps, setEmps] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [q, setQ] = useState('');
  // ListToolbar state — roster search + trade filter (persists via sag_flt_people).
  const [tradeFilter, setTradeFilter] = useState('all');
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [assigns, setAssigns] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [loggingInc, setLoggingInc] = useState(false);
  const [specInput, setSpecInput] = useState('');
  const [f, setF] = useState<any>({});
  const [inc, setInc] = useState<any>({ incident_type: 'incident', severity: 'low', occurred_at: new Date().toISOString().slice(0, 10) });

  const loadRoster = useCallback(async () => {
    const { data } = await sb.from('employees').select('id, first_name, last_name, full_name, title, trade, email, phone, is_active, osha_10_certified, osha_30_certified, forklift_certified').order('first_name');
    setEmps(data ?? []);
  }, [sb]);
  useEffect(() => { loadRoster(); sb.from('projects').select('id, name').order('name').then(({ data }) => setProjects(data ?? [])); }, [loadRoster, sb]);

  const loadDetail = useCallback(async (id: string) => {
    const [{ data: e }, { data: a }, { data: i }] = await Promise.all([
      sb.from('employees').select('*').eq('id', id).maybeSingle(),
      sb.from('employee_project_assignments').select('id, project_id, active').eq('employee_id', id),
      sb.from('employee_incidents').select('*').eq('employee_id', id).order('occurred_at', { ascending: false }),
    ]);
    setDetail(e); setAssigns(a ?? []); setIncidents(i ?? []);
  }, [sb]);
  useEffect(() => { if (selId) loadDetail(selId); }, [selId, loadDetail]);

  const trades = useMemo(() => Array.from(new Set(emps.map((e) => String(e.trade || '').trim()).filter(Boolean))).sort(), [emps]);
  const filtered = useMemo(() => { const ql = q.trim().toLowerCase(); return emps.filter((e) => e.is_active !== false && (tradeFilter === 'all' || String(e.trade || '') === tradeFilter) && (!ql || (nameOf(e) + ' ' + (e.title ?? '') + ' ' + (e.trade ?? '')).toLowerCase().includes(ql))); }, [emps, q, tradeFilter]);
  const projName = (pid: string) => projects.find((p) => p.id === pid)?.name ?? 'Project';
  const specialties: string[] = Array.isArray(detail?.specialties) ? detail.specialties : [];

  // Both writes used to discard the { error } supabase-js returns (it does NOT
  // throw), so "Add employee" closed the dialog on failure and every edit to a
  // title, trade, phone or PAY RATE was silently dropped. Failures are surfaced
  // now, and the dialog stays open so the work is not lost.
  const addEmp = async () => {
    if (!f.first_name?.trim() && !f.last_name?.trim()) { setSaveErr('Enter a first or last name.'); return; }
    setSaveErr(null);
    // full_name is GENERATED ALWAYS (first_name || ' ' || last_name) — never write it.
    // first_name/last_name are NOT NULL, so a missing half is stored as ''.
    // tenant_id is stamped by the auto_set_tenant_id trigger; RLS scopes the rest.
    const { data, error } = await sb.from('employees').insert({ first_name: f.first_name?.trim() || '', last_name: f.last_name?.trim() || '', title: f.title || null, trade: f.trade || null, email: f.email || null, phone: f.phone || null, employment_type: f.employment_type || 'hourly', regular_rate: parseFloat(f.regular_rate) || 0, is_active: true }).select('id').maybeSingle();
    if (error) { setSaveErr(friendlyDbError(error, "Couldn't add this person — nothing was saved. Try again.")); return; }
    setAdding(false); setF({}); await loadRoster(); if (data?.id) setSelId(data.id);
  };
  const patch = async (payload: any): Promise<boolean> => {
    if (!selId) return false;
    setSaveErr(null);
    const { error } = await sb.from('employees').update(payload).eq('id', selId);
    if (error) { setSaveErr(friendlyDbError(error, "Couldn't save that change — nothing was written. Try again.")); return false; }
    await loadDetail(selId); await loadRoster(); return true;
  };
  const saveEdit = async () => { const ok = await patch({ first_name: f.first_name?.trim() || '', last_name: f.last_name?.trim() || '', title: f.title || null, trade: f.trade || null, email: f.email || null, phone: f.phone || null, address: f.address || null, regular_rate: parseFloat(f.regular_rate) || 0, overtime_rate: parseFloat(f.overtime_rate) || 0, emergency_contact_name: f.emergency_contact_name || null, emergency_contact_phone: f.emergency_contact_phone || null }); if (ok) setEditing(false); };
  const addSpec = async () => { const s = specInput.trim(); if (!s) return; await patch({ specialties: [...specialties, s] }); setSpecInput(''); };
  const addAssign = async (pid: string) => { if (!selId) return; await sb.from('employee_project_assignments').insert({ employee_id: selId, project_id: pid, active: true }); loadDetail(selId); };
  const rmAssign = async (aid: string) => { await sb.from('employee_project_assignments').delete().eq('id', aid); if (selId) loadDetail(selId); };
  const saveInc = async () => { if (!selId || (!inc.description?.trim() && !inc.title?.trim())) return; await sb.from('employee_incidents').insert({ employee_id: selId, incident_type: inc.incident_type, title: inc.title || null, description: inc.description || null, severity: inc.severity, equipment_involved: inc.equipment_involved || null, occurred_at: new Date(inc.occurred_at).toISOString(), action_taken: inc.action_taken || null, status: 'open' }); setLoggingInc(false); setInc({ incident_type: 'incident', severity: 'low', occurred_at: new Date().toISOString().slice(0, 10) }); loadDetail(selId); };

  const inp: React.CSSProperties = { background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, padding: '9px 11px', fontSize: 14, width: '100%' };
  const btn: React.CSSProperties = { background: GOLD, color: 'var(--on-brand)', fontWeight: 700, border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 14 };
  const unassigned = projects.filter((p) => !assigns.some((a) => a.project_id === p.id));

  return (
    <div style={{ background: DARK, color: TEXT, minHeight: '100vh', fontFamily: 'system-ui,Segoe UI,sans-serif' }}>
      <div className="k-frame">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <UsersThree size={26} weight="fill" color="var(--text-secondary)" />
          <div style={{ flex: 1 }}><h1 className="k-title" style={{ margin: 0 }}>People</h1><p style={{ color: DIM, margin: 0, fontSize: 14 }}>Your crew — records, certifications, assignments, and incident history.</p></div>
          <button onClick={() => { setF({ employment_type: 'hourly' }); setSaveErr(null); setAdding(true); }} style={{ ...btn, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={15} weight="bold" />Add Employee</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 340px) minmax(0, 1fr)', gap: 16, marginTop: 20, alignItems: 'start' }}>
          {/* roster */}
          <div>
            <div style={{ marginBottom: 10 }}>
              <ListToolbar
                module="people"
                search={q}
                onSearch={setQ}
                searchPlaceholder="Search the crew…"
                filters={[{ key: 'trade', label: 'Trade', value: tradeFilter, onChange: setTradeFilter, allLabel: 'All Trades', options: trades }]}
                count={{ shown: filtered.length, total: emps.length }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '72vh', overflowY: 'auto' }}>
              {filtered.length === 0 ? <div style={{ color: DIM, fontSize: 13, padding: 12 }}>{emps.length ? 'No matches' : 'No employees yet — add your first.'}</div> : filtered.map((e) => (
                <button key={e.id} onClick={() => setSelId(e.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: selId === e.id ? 'var(--brand-primary-12)' : RAISED, border: `1px solid ${selId === e.id ? GOLD : BORDER}`, borderRadius: 10, padding: 10, cursor: 'pointer', color: TEXT }}>
                  <div style={{ width: 38, height: 38, borderRadius: 19, background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)', fontWeight: 800, fontSize: 13 }}>{initials(nameOf(e))}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{nameOf(e)}</div><div style={{ color: DIM, fontSize: 13 }}>{[e.title, e.trade].filter(Boolean).join(' · ') || 'No title'}</div></div>
                  {e.osha_30_certified ? <span style={{ fontSize: 12, color: GREEN, fontWeight: 700 }}>OSHA30</span> : e.osha_10_certified ? <span style={{ fontSize: 12, color: GREEN, fontWeight: 700 }}>OSHA10</span> : null}
                </button>
              ))}
            </div>
          </div>

          {/* detail */}
          <div>
            {!detail ? (
              <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 40, textAlign: 'center', color: DIM }}>Select an employee to view their record.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 28, background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)', fontWeight: 800, fontSize: 19 }}>{initials(nameOf(detail))}</div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 20, fontWeight: 800 }}>{nameOf(detail)}</div><div style={{ color: DIM, fontSize: 14 }}>{[detail.title, detail.trade].filter(Boolean).join(' · ') || 'No title'}</div></div>
                  <button onClick={() => { setF({ first_name: detail.first_name ?? '', last_name: detail.last_name ?? '', title: detail.title ?? '', trade: detail.trade ?? '', email: detail.email ?? '', phone: detail.phone ?? '', address: detail.address ?? '', regular_rate: String(detail.regular_rate ?? ''), overtime_rate: String(detail.overtime_rate ?? ''), emergency_contact_name: detail.emergency_contact_name ?? '', emergency_contact_phone: detail.emergency_contact_phone ?? '' }); setEditing(true); }} style={{ ...btn, background: 'transparent', color: TEXT, border: `1px solid ${BORDER}`, display: 'inline-flex', gap: 6, alignItems: 'center' }}><PencilSimple size={14} />Edit</button>
                  <button onClick={() => patch({ is_active: !(detail.is_active !== false) })} style={{ ...btn, background: 'transparent', color: detail.is_active !== false ? GREEN : DIM, border: `1px solid ${BORDER}` }}>{detail.is_active !== false ? 'Active' : 'Inactive'}</button>
                </div>

                <Section title="Contact & Pay">
                  <Info I={Envelope} k="Email" v={detail.email} /><Info I={Phone} k="Phone" v={detail.phone} /><Info I={MapPin} k="Address" v={detail.address} />
                  <Info I={Briefcase} k="Type" v={detail.employment_type} /><Info I={CurrencyDollar} k="Rate" v={Number(detail.regular_rate) > 0 ? <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{`$${(Number(detail.regular_rate) || 0).toFixed(2)}/hr${Number(detail.overtime_rate) > 0 ? ` · OT $${(Number(detail.overtime_rate) || 0).toFixed(2)}` : ''}`}</span> : null} />
                  <Info I={FirstAid} k="Emergency" v={detail.emergency_contact_name ? `${detail.emergency_contact_name}${detail.emergency_contact_phone ? ` · ${detail.emergency_contact_phone}` : ''}` : null} />
                </Section>

                <Section title="Certifications">
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {[['osha_10_certified', 'OSHA 10'], ['osha_30_certified', 'OSHA 30'], ['forklift_certified', 'Forklift']].map(([col, label]) => (
                      <button key={col} onClick={() => patch({ [col]: !detail[col] })} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: `1px solid ${detail[col] ? GREEN : BORDER}`, background: detail[col] ? 'rgba(74,222,128,0.12)' : 'transparent', color: detail[col] ? GREEN : DIM, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}><SealCheck size={16} weight={detail[col] ? 'fill' : 'regular'} />{label}</button>
                    ))}
                  </div>
                </Section>

                <Section title="Specialties">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {specialties.map((s) => <button key={s} onClick={() => patch({ specialties: specialties.filter((x) => x !== s) })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 10px', color: TEXT, cursor: 'pointer', fontSize: 13 }}>{s}<X size={11} color={DIM} /></button>)}
                    {specialties.length === 0 ? <span style={{ color: DIM, fontSize: 13 }}>None yet.</span> : null}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}><input value={specInput} onChange={(e) => setSpecInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSpec()} placeholder="Add a specialty (e.g. Welding)" style={inp} /><button onClick={addSpec} style={btn}><Plus size={15} weight="bold" /></button></div>
                </Section>

                <Section title="Project Assignments" action={unassigned.length ? <select onChange={(e) => { if (e.target.value) addAssign(e.target.value); e.target.value = ''; }} defaultValue="" style={{ ...inp, width: 'auto', fontSize: 13 }}><option value="">+ Assign to…</option>{unassigned.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : null}>
                  {assigns.length === 0 ? <span style={{ color: DIM, fontSize: 13 }}>Not assigned to any project.</span> : assigns.map((a) => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${BORDER}` }}><Folder size={16} color="var(--text-secondary)" weight="fill" /><span style={{ flex: 1 }}>{projName(a.project_id)}</span><button onClick={() => rmAssign(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={15} color={DIM} /></button></div>
                  ))}
                </Section>

                <Section title="Incidents & Notes" action={<button onClick={() => setLoggingInc(true)} style={{ ...btn, padding: '6px 12px', fontSize: 13 }}>+ Log</button>}>
                  {incidents.length === 0 ? <span style={{ color: DIM, fontSize: 13 }}>No incidents on record.</span> : incidents.map((it) => { const m = incMeta(it.incident_type); const sc = it.severity === 'high' || it.severity === 'critical' ? RED : it.severity === 'medium' ? AMBER : DIM; return (
                    <div key={it.id} style={{ borderLeft: `3px solid ${sc}`, background: DARK, borderRadius: 8, padding: 12, marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><m.I size={15} color={m.c} weight="fill" /><span style={{ color: m.c, fontWeight: 800, fontSize: 12 }}>{m.l}</span><span style={{ marginLeft: 'auto', color: DIM, fontSize: 12 }}>{fmtDate(it.occurred_at)}</span></div>
                      {it.title ? <div style={{ fontWeight: 700, marginTop: 4 }}>{it.title}</div> : null}
                      {it.description ? <div style={{ color: DIM, fontSize: 14, marginTop: 2 }}>{it.description}</div> : null}
                      {(it.equipment_involved || it.action_taken) ? <div style={{ color: DIM, fontSize: 12, marginTop: 4 }}>{it.equipment_involved ? `Equipment: ${it.equipment_involved}. ` : ''}{it.action_taken ? `Action: ${it.action_taken}` : ''}</div> : null}
                    </div>
                  ); })}
                </Section>
              </div>
            )}
          </div>
        </div>
      </div>

      {(adding || editing) && (
        <Modal title={adding ? 'Add Employee' : 'Edit Employee'} onClose={() => { setAdding(false); setEditing(false); }}>
          <div style={{ display: 'flex', gap: 8 }}><input value={f.first_name ?? ''} onChange={(e) => setF({ ...f, first_name: e.target.value })} placeholder="First name" style={inp} /><input value={f.last_name ?? ''} onChange={(e) => setF({ ...f, last_name: e.target.value })} placeholder="Last name" style={inp} /></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><input value={f.title ?? ''} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Title" style={inp} /><input value={f.trade ?? ''} onChange={(e) => setF({ ...f, trade: e.target.value })} placeholder="Trade" style={inp} /></div>
          <input value={f.email ?? ''} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="Email" style={{ ...inp, marginTop: 8 }} />
          <input value={f.phone ?? ''} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Phone" style={{ ...inp, marginTop: 8 }} />
          {editing && <input value={f.address ?? ''} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="Address" style={{ ...inp, marginTop: 8 }} />}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><input value={f.regular_rate ?? ''} onChange={(e) => setF({ ...f, regular_rate: e.target.value })} placeholder="Rate $/hr" style={inp} />{editing && <input value={f.overtime_rate ?? ''} onChange={(e) => setF({ ...f, overtime_rate: e.target.value })} placeholder="OT $/hr" style={inp} />}</div>
          {editing && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><input value={f.emergency_contact_name ?? ''} onChange={(e) => setF({ ...f, emergency_contact_name: e.target.value })} placeholder="Emergency contact" style={inp} /><input value={f.emergency_contact_phone ?? ''} onChange={(e) => setF({ ...f, emergency_contact_phone: e.target.value })} placeholder="Emergency phone" style={inp} /></div>}
          {saveErr && (
            <div role="alert" style={{ marginTop: 12, padding: '9px 11px', borderRadius: 8, background: 'rgba(248,113,113,0.10)', border: `1px solid color-mix(in srgb, ${RED} 33%, transparent)`, color: RED, fontSize: 13, lineHeight: 1.45 }}>
              {saveErr}
            </div>
          )}
          <button onClick={adding ? addEmp : saveEdit} style={{ ...btn, marginTop: 14, width: '100%' }}>{adding ? 'Add Employee' : 'Save'}</button>
        </Modal>
      )}

      {loggingInc && (
        <Modal title="Log Incident / Note" onClose={() => setLoggingInc(false)}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>{INC_TYPES.map((t) => { const on = inc.incident_type === t.v; return <button key={t.v} onClick={() => setInc({ ...inc, incident_type: t.v })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${on ? t.c : BORDER}`, background: on ? `color-mix(in srgb, ${t.c} 13%, transparent)` : 'transparent', color: on ? t.c : DIM, borderRadius: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}><t.I size={14} weight="fill" />{t.l}</button>; })}</div>
          <input value={inc.title ?? ''} onChange={(e) => setInc({ ...inc, title: e.target.value })} placeholder="Title / summary" style={inp} />
          <textarea value={inc.description ?? ''} onChange={(e) => setInc({ ...inc, description: e.target.value })} placeholder="What happened…" style={{ ...inp, marginTop: 8, minHeight: 64, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><SaguaroDatePicker value={inc.occurred_at} onChange={(v) => setInc({ ...inc, occurred_at: v })} style={inp} /><select value={inc.severity} onChange={(e) => setInc({ ...inc, severity: e.target.value })} style={inp}>{['low', 'medium', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <input value={inc.equipment_involved ?? ''} onChange={(e) => setInc({ ...inc, equipment_involved: e.target.value })} placeholder="Equipment involved (opt)" style={{ ...inp, marginTop: 8 }} />
          <input value={inc.action_taken ?? ''} onChange={(e) => setInc({ ...inc, action_taken: e.target.value })} placeholder="Action taken (opt)" style={{ ...inp, marginTop: 8 }} />
          <button onClick={saveInc} style={{ ...btn, marginTop: 14, width: '100%' }}>Log It</button>
        </Modal>
      )}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}><div style={{ fontSize: 12, color: DIM, fontWeight: 700, flex: 1 }}>{title}</div>{action}</div>
      {children}
    </div>
  );
}
function Info({ I, k, v }: { I: any; k: string; v: any }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${BORDER}` }}><I size={15} color={DIM} /><span style={{ color: DIM, fontSize: 13, width: 92 }}>{k}</span><span style={{ color: v ? TEXT : DIM, fontSize: 14 }}>{v || '—'}</span></div>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18, width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}><div style={{ fontWeight: 800, fontSize: 17, flex: 1 }}>{title}</div><button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color={DIM} /></button></div>
        {children}
      </div>
    </div>
  );
}
