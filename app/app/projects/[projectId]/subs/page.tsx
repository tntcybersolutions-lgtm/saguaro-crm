'use client';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { Handshake, Trash, Users, CurrencyDollar, HandCoins, Heartbeat, Plus, ShieldCheck, ShieldWarning, AddressBook } from '@phosphor-icons/react';
import { SUB_TRADES } from '@/lib/construction-intelligence';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, FlowSteps, FlowStrip, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { DataTable, type Column } from '@/components/ui/kit';
import { StatusPill } from '@/components/ui/Status';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';

const GOLD='var(--brand-primary)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='var(--text-secondary)',TEXT='var(--text-primary)';
const cap = (s:string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));
/* The add form was a fixed `1fr 320px` grid with three fields abreast. On a
   390px phone the 320px compliance rail took the row: the form collapsed to a
   sliver and the rail lay over its Add Subcontractor button (the walk's tap
   timed out on it). One column below 900px / 700px; 44px buttons. */
const SUBS_CSS = `
.sbAddGrid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; align-items: start; margin-bottom: 20px; }
.sbFields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.sbAddGrid button { min-height: 44px; }
@media (max-width: 900px) { .sbAddGrid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 700px) { .sbFields { grid-template-columns: minmax(0, 1fr); } }
`;

interface Sub {
  id: string; name: string; trade: string; contact_name: string; contact_email: string;
  contact_phone: string; license_number: string; insurance_expiry: string;
  status: string; contract_amount: number; paid_amount: number; health_score: number;
  created_at: string; w9_on_file?: boolean; w9_status?: string;
}

// The tenant `subcontractors` table stores company_name / email / phone —
// normalize onto the field names this page renders so rows never come back blank.
function normalizeSub(r: any): Sub {
  return {
    ...r,
    name: r.name ?? r.company_name ?? '',
    contact_email: r.contact_email ?? r.email ?? '',
    contact_phone: r.contact_phone ?? r.phone ?? '',
    contract_amount: Number(r.contract_amount) || 0,
    paid_amount: Number(r.paid_amount) || 0,
    health_score: Number(r.health_score) || 0,
  };
}

// Compliance snapshot from fields /api/subs/list already returns (select *).
function w9Ok(s: Sub) { return s.w9_on_file === true || s.w9_status === 'submitted'; }
function coiState(s: Sub): { label: string; color: string; ok: boolean } {
  if (!s.insurance_expiry) return { label: 'COI not on file', color: 'var(--danger)', ok: false };
  const exp = new Date(String(s.insurance_expiry).slice(0, 10) + 'T00:00:00');
  const days = Math.floor((exp.getTime() - Date.now()) / 86400000);
  const d = exp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (days < 0) return { label: `COI expired ${d}`, color: 'var(--danger)', ok: false };
  if (days <= 30) return { label: `COI expires in ${days}d`, color: 'var(--warning)', ok: true };
  return { label: `COI valid through ${d}`, color: 'var(--success)', ok: true };
}
function hasComplianceIssue(s: Sub) { return !w9Ok(s) || !coiState(s).ok; }

function scoreBadge(score: number) {
  const color = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)';
  return <span style={{fontSize:12,fontWeight:800,color,background:`color-mix(in srgb, ${color} 9%, transparent)`,padding:'3px 10px',borderRadius:6}}>{score}</span>;
}

function statusBadge(s: string) {
  const map: Record<string,{c:string,bg:string}> = {
    active:{c:'var(--success)',bg:'rgba(44,255,122,.12)'}, prequalified:{c:'var(--brand-primary-strong)',bg:'var(--brand-primary-12)'},
    invited:{c:GOLD,bg:'var(--brand-primary-12)'}, suspended:{c:'var(--danger)',bg:'rgba(255,59,48,.12)'},
    inactive:{c:DIM,bg:'rgba(163,172,187,.08)'},
  };
  const st = map[s]||{c:DIM,bg:'rgba(163,172,187,.08)'};
  return <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:4,background:st.bg,color:st.c}}>{cap(s)}</span>;
}

export default function SubsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{msg:string;type:'success'|'error'}|null>(null);
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [search, setSearch] = useState('');
  const [filterTrade, setFilterTrade] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [form, setForm] = useState({ name:'', trade:'', contact_name:'', contact_email:'', contact_phone:'', license_number:'', contract_amount:'' });
  /** Why Add Subcontractor refused, said beside the button (role="alert"). */
  const [formErr, setFormErr] = useState('');

  /* ── Unsaved-work guard: the composer holds real typing, so leaving the
   *    page (sidebar, field nav, ⌘K, back) confirms first and the draft is
   *    kept on this device either way. ── */
  const composerDirty = useComposerDirty(showForm, form);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `subs:${projectId}`,
    draftData: form,
    restoreDraft: (d) => { setForm(d as typeof form); setShowForm(true); },
    onSave: () => handleCreate(),
  });

  // SmartCreate: walk in knowing the roster, awards, and compliance standing.
  const { ctx } = useProjectContext(projectId);
  const [pickId, setPickId] = useState('');
  const [auto, setAuto] = useState<{name?:boolean;trade?:boolean;contact?:boolean;license?:boolean;amount?:boolean}>({});

  useEffect(() => { if(toast) { const t=setTimeout(()=>setToast(null),4000); return ()=>clearTimeout(t); } return undefined; }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/subs/list?projectId=${projectId}`);
      if (!r.ok) throw new Error('Failed to load');
      const d = await r.json();
      setSubs(((d.data || d.subs || []) as any[]).map(normalizeSub));
    } catch { setToast({msg:'Failed to load subcontractors',type:'error'}); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Dead-space kill (spec 4.1): an empty directory opens straight into the
  // add composer (directory/award seeding built in). One-shot per visit so
  // Cancel stays cancelled.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!loading && subs.length === 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setShowForm(true);
    }
  }, [loading, subs.length]);

  const handleCreate = async (e?: React.FormEvent): Promise<boolean> => {
    e?.preventDefault();
    // The page owns the rule (the native `required` bubble was easy to miss on a phone).
    if (!form.name.trim()) {
      setFormErr('Enter the company name.');
      document.getElementById('sb-company-name')?.focus();
      return false;
    }
    if (form.contact_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email.trim())) {
      setFormErr('That email doesn’t look right — fix it or leave it blank.');
      document.getElementById('sb-contact-email')?.focus();
      return false;
    }
    setFormErr('');
    try {
      const r = await fetch('/api/subs/create', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        // Alias keys (email/phone/licenseNumber) mirror the columns
        // /api/subs/create actually persists; the original field names stay intact.
        body: JSON.stringify({ ...form, projectId, contract_amount: parseFloat(form.contract_amount)||0, status:'active', email: form.contact_email || undefined, phone: form.contact_phone || undefined, licenseNumber: form.license_number || undefined }),
      });
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error||'Failed'); }
      setShowForm(false);
      setForm({ name:'', trade:'', contact_name:'', contact_email:'', contact_phone:'', license_number:'', contract_amount:'' });
      setPickId(''); setAuto({});
      setToast({msg:'Subcontractor added',type:'success'});
      load();
      guard.clearDraft();
      return true;
    } catch (err: unknown) { console.error(err); setFormErr(humanError(err,'Could not add the subcontractor. Please try again.')); }
    return false;
  };

  const handleDelete = async (id: string) => {
    setSubs(prev => prev.filter(s => s.id !== id));
    setDeleteId(null);
    try {
      const r = await fetch(`/api/subs/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('delete failed');
      setToast({msg:'Subcontractor removed',type:'success'});
    } catch { setToast({msg:'Could not remove the subcontractor. Please try again.',type:'error'}); load(); }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    setSubs(prev => prev.map(s => s.id === id ? {...s, status} : s));
    try {
      const r = await fetch(`/api/subs/${id}`, { method: 'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status}) });
      if (!r.ok) throw new Error('update failed');
    } catch { setToast({msg:'Could not update status. Please try again.',type:'error'}); load(); }
  };

  // Pick from the tenant directory — prefill everything the system knows.
  function pickFromDirectory(id: string) {
    setPickId(id);
    if (!id) {
      setForm({ name:'', trade:'', contact_name:'', contact_email:'', contact_phone:'', license_number:'', contract_amount:'' });
      setAuto({});
      return;
    }
    const s = subs.find(x => x.id === id);
    if (!s) return;
    const rosterRow = ((ctx?.subs || []) as any[]).find(x => x.id === id);
    const award = ((ctx?.bidPackages || []) as any[]).find(b => b.awardedTo && s.name && String(b.awardedTo).toLowerCase() === s.name.toLowerCase());
    const amount = Number(rosterRow?.contractAmount) || Number(award?.awardedAmount) || Number(s.contract_amount) || 0;
    setForm({
      name: s.name, trade: s.trade || '', contact_name: s.contact_name || '',
      contact_email: s.contact_email || '', contact_phone: s.contact_phone || '',
      license_number: s.license_number || '', contract_amount: amount > 0 ? String(amount) : '',
    });
    setAuto({ name: true, trade: !!s.trade, contact: !!(s.contact_name || s.contact_email || s.contact_phone), license: !!s.license_number, amount: amount > 0 });
  }

  const picked = pickId ? subs.find(x => x.id === pickId) : undefined;
  const pickedAward = picked ? ((ctx?.bidPackages || []) as any[]).find(b => b.awardedTo && picked.name && String(b.awardedTo).toLowerCase() === picked.name.toLowerCase()) : undefined;

  // Project roster intelligence (from /api/project-context).
  const roster = ((ctx?.subs || []) as any[]);
  const rosterIds = new Set(roster.map(r => r.id));
  const rosterTotal = roster.reduce((s, r) => s + (Number(r.contractAmount) || 0), 0);
  const complianceScope = rosterIds.size > 0 ? subs.filter(s => rosterIds.has(s.id)) : subs;
  const complianceIssues = complianceScope.filter(hasComplianceIssue).length;
  const awardedPkgs = ((ctx?.bidPackages || []) as any[]).filter(b => b.awardedTo);

  const inpS: React.CSSProperties = {width:'100%',padding:'8px 12px',background:'var(--bg-surface-2)',border:`1px solid ${BORDER}`,borderRadius:6,color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box'};
  const lblS: React.CSSProperties = {display:'block',fontSize:11,color:DIM,marginBottom:4,fontWeight:600};
  const hintS: React.CSSProperties = {fontSize:11,color:'var(--c-text-2)',marginTop:5,lineHeight:1.45};

  const totalContract = subs.reduce((s,sub) => s + (sub.contract_amount||0), 0);
  const totalPaid = subs.reduce((s,sub) => s + (sub.paid_amount||0), 0);
  const avgScore = subs.length > 0 ? Math.round(subs.reduce((s,sub) => s + (sub.health_score||0), 0) / subs.length) : 0;
  const avgScoreColor = avgScore >= 80 ? 'var(--success)' : avgScore >= 60 ? GOLD : subs.length > 0 ? 'var(--danger)' : undefined;

  const subTrades = Array.from(new Set(subs.map(s => s.trade).filter(Boolean))).sort();
  const filteredSubs = subs.filter(s => {
    if (search) {
      const q = search.toLowerCase();
      const hit = (s.name || '').toLowerCase().includes(q)
        || (s.contact_name || '').toLowerCase().includes(q)
        || (s.contact_email || '').toLowerCase().includes(q)
        || (s.license_number || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (filterTrade !== 'all' && s.trade !== filterTrade) return false;
    if (filterStatus !== 'all' && (s.status || 'active') !== filterStatus) return false;
    return true;
  });

  // Sortable columns (R11 sweep) — money columns sort on the same coerced
  // numbers the cells render (contract falls back to the roster commitment).

  return (
    <PremiumSurface maxWidth={2200}>
      <style dangerouslySetInnerHTML={{ __html: SUBS_CSS }} />
      {toast && <div role={toast.type==='error'?'alert':'status'} style={{position:'fixed',bottom:'calc(24px + var(--sag-tabbar-h, 0px))',left:'50%',transform:'translateX(-50%)',zIndex:99999,maxWidth:'calc(100vw - 32px)',padding:'12px 20px',borderRadius:8,background:toast.type==='success'?'rgba(44,255,122,0.9)':'rgba(255,59,48,0.9)',color:'var(--text-primary)',fontWeight:600,fontSize:14}}>{toast.msg}</div>}

      {/* Header */}
      <ModuleHero
        eyebrow="Subcontractors"
        eyebrowIcon={<Handshake size={13} weight="fill" color={GOLD} />}
        title="Subcontractor"
        accent="Management"
        subtitle="Manage subs, track compliance, monitor health scores."
        actions={
          <button onClick={()=>{setShowForm(!showForm);setFormErr('');}} style={goldButtonStyle} className="pmBtn">
            {showForm ? 'Cancel' : <><Plus size={15} weight="bold" /> Add Subcontractor</>}
          </button>
        }
      />

      {/* Roster intelligence — what the system already knows about this job */}
      {ctx && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/subs`,  label: 'Subs on Job', value: String(roster.length), sub: 'On the project roster' },
          {href: `/app/projects/${projectId}/subs`,  label: 'Sub Commitments', value: fmt(rosterTotal), sub: 'Combined sub contracts' },
          {href: `/app/projects/${projectId}/compliance`,  label: 'Compliance Issues', value: String(complianceIssues), accent: complianceIssues > 0 ? 'var(--danger)' : 'var(--success)', sub: complianceIssues > 0 ? 'Missing W-9 or lapsed COI' : rosterIds.size > 0 ? 'Roster is clean' : 'Directory is clean' },
          {href: `/app/projects/${projectId}/subs`,  label: 'Directory', value: String(subs.length), sub: 'Companies tenant-wide' },
          {href: `/app/projects/${projectId}/bid-packages`,  label: 'Awarded Packages', value: String(awardedPkgs.length), sub: `${fmt(awardedPkgs.reduce((s, b) => s + (Number(b.awardedAmount) || 0), 0))} awarded` },
        ]} />
      )}

      {/* KPIs (fallback when the context snapshot is unavailable) */}
      {!ctx && (
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:16,marginBottom:28}}>
        <StatCard icon={<Users size={19} weight="duotone" color={GOLD} />} label="Total Subs" value={String(subs.length)} accent={GOLD} delay={0.02}  href={`/app/projects/${projectId}/subs`}/>
        <StatCard icon={<CurrencyDollar size={19} weight="duotone" color={GOLD} />} label="Total Contract Value" value={fmt(totalContract)} accent={GOLD} delay={0.06}  href={`/app/projects/${projectId}/contracts`}/>
        <StatCard icon={<HandCoins size={19} weight="duotone" color="var(--success)" />} label="Total Paid" value={fmt(totalPaid)} accent="var(--success)" delay={0.10}  href={`/app/projects/${projectId}/subs`}/>
        <StatCard icon={<Heartbeat size={19} weight="duotone" color={avgScoreColor || GOLD} />} label="Avg Health Score" value={String(avgScore)} accent={avgScoreColor} delay={0.14}  href={`/app/projects/${projectId}/subs`}/>
      </div>
      )}

      {/* Create Form — SmartCreate: pick from the directory, the system fills the rest */}
      {showForm && (
        <div className="sbAddGrid">
          <SectionCard title="Add Subcontractor" subtitle="Pick from your directory — or enter a new company" icon={<Handshake size={17} weight="duotone" color={GOLD} />}>
            <form onSubmit={handleCreate}>
              <div style={{marginBottom:14}}>
                <label style={lblS}>Company</label>
                <select value={pickId} onChange={e=>pickFromDirectory(e.target.value)} style={{...inpS,cursor:'pointer'}}>
                  <option value="">New company — type the details below</option>
                  {subs.length>0 && (
                    <optgroup label={`Tenant Directory (${subs.length})`}>
                      {subs.map(s=>(
                        <option key={s.id} value={s.id}>{s.name||'Unnamed'}{s.trade?` — ${s.trade}`:''}{rosterIds.has(s.id)?' (on this job)':''}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <div style={hintS}>Picking a directory company pre-fills contacts, license, and compliance — and pulls their award amount when a bid package names them.</div>
              </div>
              <div className="sbFields">
                <div>
                  <label htmlFor="sb-company-name" style={lblS}>Company Name<span style={{color:'var(--danger)'}}> *</span>{auto.name&&<AutoChip/>}</label>
                  <input id="sb-company-name" type="text" placeholder="ABC Electric LLC" value={form.name} onChange={e=>{const v=e.target.value;setForm(p=>({...p,name:v}));if(formErr)setFormErr('');}} style={inpS} aria-required="true" aria-invalid={formErr && !form.name.trim() ? true : undefined} />
                </div>
                <div>
                  <label style={lblS}>Trade{auto.trade&&<AutoChip/>}</label>
                  <select value={form.trade} onChange={e=>setForm(p=>({...p,trade:e.target.value}))} style={{...inpS,cursor:'pointer'}}>
                    <option value="">Select trade…</option>
                    {form.trade && !SUB_TRADES.includes(form.trade) && <option value={form.trade}>{form.trade}</option>}
                    {SUB_TRADES.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lblS}>Contract Amount{auto.amount&&<AutoChip/>}</label>
                  <input type="number" placeholder="150000" value={form.contract_amount} onChange={e=>setForm(p=>({...p,contract_amount:e.target.value}))} style={inpS} />
                  {auto.amount && <div style={hintS}>{pickedAward?`From their award on "${pickedAward.name}".`:'Their committed amount on this project.'}</div>}
                </div>
                <div>
                  <label style={lblS}>Contact Name{auto.contact&&<AutoChip/>}</label>
                  <input type="text" placeholder="John Smith" value={form.contact_name} onChange={e=>setForm(p=>({...p,contact_name:e.target.value}))} style={inpS} />
                </div>
                <div>
                  <label style={lblS}>Email{auto.contact&&<AutoChip/>}</label>
                  <input id="sb-contact-email" type="email" inputMode="email" placeholder="john@abc.com" value={form.contact_email} onChange={e=>{const v=e.target.value;setForm(p=>({...p,contact_email:v}));if(formErr)setFormErr('');}} style={inpS} />
                  <div style={hintS}>Contracts over $600 auto-send a W-9 request here.</div>
                </div>
                <div>
                  <label style={lblS}>Phone{auto.contact&&<AutoChip/>}</label>
                  <input type="tel" placeholder="(602) 555-1234" value={form.contact_phone} onChange={e=>setForm(p=>({...p,contact_phone:e.target.value}))} style={inpS} />
                </div>
                <div>
                  <label style={lblS}>License #{auto.license&&<AutoChip/>}</label>
                  <input type="text" placeholder="ROC-123456" value={form.license_number} onChange={e=>setForm(p=>({...p,license_number:e.target.value}))} style={inpS} />
                </div>
              </div>
              {formErr && <div role="alert" style={{marginTop:14,padding:'10px 12px',borderRadius:8,background:'rgba(255,59,48,0.10)',border:'1px solid rgba(255,59,48,0.45)',color:'var(--danger)',fontSize:13,lineHeight:1.5}}>{formErr}</div>}
              <div style={{marginTop:16,display:'flex',gap:10,flexWrap:'wrap'}}>
                <button type="submit" style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Add Subcontractor</button>
                <button type="button" onClick={()=>setShowForm(false)} style={ghostButtonStyle} className="pmBtn">Cancel</button>
              </div>
            </form>
          </SectionCard>

          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <SectionCard flat title="Compliance Snapshot" icon={picked ? (hasComplianceIssue(picked) ? <ShieldWarning size={17} weight="duotone" color="var(--danger)" /> : <ShieldCheck size={17} weight="duotone" color="var(--success)" />) : <ShieldCheck size={17} weight="duotone" color={GOLD} />}>
              {picked ? (
                <>
                  <InsightRow label="W-9" value={w9Ok(picked)?'On file':'Missing'} accent={w9Ok(picked)?'var(--success)':'var(--danger)'} strong/>
                  <InsightRow label="Insurance" value={coiState(picked).label} accent={coiState(picked).color}/>
                  <InsightRow label="License" value={picked.license_number||'Not on file'} accent={picked.license_number?undefined:'var(--warning)'}/>
                  <InsightRow label="Directory Status" value={cap(picked.status||'active')}/>
                  {rosterIds.has(picked.id) && <InsightRow label="This Project" value="Already on roster" accent="var(--brand-primary-strong)"/>}
                  {pickedAward && <InsightRow label="Award" value={`${fmt(Number(pickedAward.awardedAmount)||0)} — ${pickedAward.name}`} accent={GOLD} strong/>}
                </>
              ) : (
                <>
                  <InsightRow label="W-9 on File" value={`${complianceScope.filter(w9Ok).length} / ${complianceScope.length}`}/>
                  <InsightRow label="COI Current" value={`${complianceScope.filter(s=>coiState(s).ok).length} / ${complianceScope.length}`}/>
                  <div style={{...hintS,marginTop:8}}>Pick a directory company above to see its full W-9, COI, and license standing before it joins the job.</div>
                </>
              )}
            </SectionCard>
            <SectionCard flat title="After You Add" icon={<AddressBook size={17} weight="duotone" color={GOLD} />}>
              <FlowSteps title="" steps={[
                {title:'Saved to Your Directory',desc:'The company lands in the tenant directory, ready for bid invites and contracts.'},
                {title:'W-9 Request Auto-Sends',desc:'Over $600 with an email on file, a W-9 e-request goes out automatically.'},
                {title:'Preliminary Notice Reminder',desc:'AZ, CA, and TX projects get a 20-day prelim notice task on compliance.'},
                {title:'Compliance Tracking Begins',desc:'COI expiry and W-9 status feed the compliance column and health scores.'},
              ]}/>
            </SectionCard>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <SectionCard flat>
          <div style={{padding:40,textAlign:'center',color:DIM}}>Loading subcontractors…</div>
        </SectionCard>
      )}

      {/* Empty state — the composer above IS the zero state; the strip teaches the flow */}
      {!loading && subs.length === 0 && (
        <SectionCard>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:12}}>
            <div style={{fontSize:13.5,fontWeight:800,color:TEXT}}>
              <Handshake size={16} weight="duotone" color={GOLD} style={{marginRight:7,verticalAlign:'text-bottom'}} />
              No subcontractors yet
              <span style={{fontWeight:400,color:DIM}}>{showForm ? ' — add the first company in the form above.' : ' — add the first company to start the directory.'}</span>
            </div>
            {!showForm && (
              <button onClick={()=>setShowForm(true)} style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Add Subcontractor</button>
            )}
          </div>
          <FlowStrip steps={[
            { title: 'Add the Company', desc: 'Directory pick pre-fills it' },
            { title: 'W-9 Auto-Requests', desc: 'Over $600 with an email' },
            { title: 'Compliance Tracked', desc: 'COI expiry and W-9 status' },
            { title: 'Ready for Bids', desc: 'Invites and contracts' },
          ]} />
        </SectionCard>
      )}

      {/* Toolbar */}
      {!loading && subs.length > 0 && (
        <ListToolbar
          module="subs"
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search subs by company, contact, or license…"
          filters={[
            {key:'trade',label:'Trade',value:filterTrade,onChange:setFilterTrade,allLabel:'All Trades',
              options:subTrades},
            {key:'status',label:'Status',value:filterStatus,onChange:setFilterStatus,allLabel:'All Statuses',
              options:['active','prequalified','invited','suspended','inactive'].map(s=>({value:s,label:cap(s)}))},
          ]}
          count={{shown:filteredSubs.length,total:subs.length}}
          style={{marginBottom:14}}
        />
      )}

      {/* Table */}
      {!loading && subs.length > 0 && (
        <SectionCard title="Subcontractors" subtitle={`${subs.length} ${subs.length === 1 ? 'subcontractor' : 'subcontractors'}`} icon={<Users size={17} weight="duotone" color={GOLD} />} flush>
          <DataTable<any>
            columns={[
              { key: 'name', header: 'Company', primary: true, phone: 'show', accessor: (sub: any) => sub.name || '', render: (sub: any) => (
                <span className="k-name"><span className="k-avatar" aria-hidden>{(sub.name||'?').split(/\s+/).slice(0,2).map((w: string)=>w[0]?.toUpperCase()||'').join('')}</span><span className="k-name-text"><span>{sub.name}</span><span>{sub.contact_email}</span></span></span>
              ) },
              { key: 'trade', header: 'Trade', phone: 'show', accessor: (sub: any) => sub.trade || '', render: (sub: any) => <span style={{color:GOLD,fontWeight:600}}>{sub.trade||'—'}</span> },
              { key: 'contact_name', header: 'Contact', phone: 'hide', accessor: (sub: any) => sub.contact_name || '', render: (sub: any) => <span className="k-cell-stack"><span>{sub.contact_name||'—'}</span>{sub.contact_phone && <span>{sub.contact_phone}</span>}</span> },
              { key: 'license_number', header: 'License', phone: 'hide', accessor: (sub: any) => sub.license_number || '', render: (sub: any) => sub.license_number ? <span style={{fontFamily:'monospace',fontSize:12}}>{sub.license_number}</span> : <StatusPill module="paperwork" status="not_on_file" size="sm" /> },
              { key: 'paper', header: 'W-9 / COI', sortable: false, phone: 'show', render: (sub: any) => { const coi = coiState(sub); return (
                <span style={{display:'inline-flex',gap:4,flexWrap:'wrap'}}>
                  <StatusPill module="paperwork" status={w9Ok(sub)?'on_file':'missing'} label={w9Ok(sub)?'W-9 on file':'W-9 missing'} size="sm" />
                  <StatusPill module="paperwork" status={coi.ok ? 'active' : /expired/i.test(coi.label) ? 'expired' : /missing|none|not on file/i.test(coi.label) ? 'not_on_file' : 'expiring'} label={`COI · ${coi.label}`} size="sm" />
                </span>); } },
              { key: 'contract', header: 'Contract', align: 'right', phone: 'show', accessor: (sub: any) => Number(sub.contract_amount || roster.find(r=>r.id===sub.id)?.contractAmount || 0) || null, render: (sub: any) => <span style={{color:TEXT,fontWeight:600}}>{fmt(sub.contract_amount || Number(roster.find(r=>r.id===sub.id)?.contractAmount || 0))}</span> },
              { key: 'paid', header: 'Paid', align: 'right', phone: 'show', accessor: (sub: any) => Number(sub.paid_amount) || 0, render: (sub: any) => <span style={{color:'var(--success)',fontWeight:600}}>{fmt(sub.paid_amount)}</span> },
              { key: 'score', header: 'Score', phone: 'hide', accessor: (sub: any) => Number(sub.health_score) || 0, render: (sub: any) => scoreBadge(sub.health_score||0) },
              { key: 'status', header: 'Status', phone: 'show', accessor: (sub: any) => sub.status || 'active', render: (sub: any) => (
                <select value={sub.status||'active'} onClick={e=>e.stopPropagation()} onChange={e=>handleUpdateStatus(sub.id,e.target.value)} className="k-input" style={{height:30,fontSize:12,padding:'0 8px',width:'auto'}}>
                  {['active','prequalified','invited','suspended','inactive'].map(s=><option key={s} value={s}>{cap(s)}</option>)}
                </select>) },
              { key: 'actions', header: '', sortable: false, phone: 'show', render: (sub: any) => deleteId===sub.id ? (
                <span style={{display:'inline-flex',gap:4}} onClick={e=>e.stopPropagation()}>
                  <button className="k-btn k-btn-sm" style={{background:'rgba(255,59,48,.15)',border:'1px solid rgba(255,59,48,.3)',color:'var(--danger)'}} onClick={()=>handleDelete(sub.id)}>Delete</button>
                  <button className="k-btn k-btn-secondary k-btn-sm" onClick={()=>setDeleteId(null)}>No</button>
                </span>
              ) : (
                <button onClick={e=>{e.stopPropagation();setDeleteId(sub.id);}} className="k-btn k-btn-ghost k-btn-sm" title="Delete" aria-label={`Remove ${sub.name}`}><Trash size={16} weight="regular" color="rgba(255,59,48,.8)" /></button>
              ) },
            ]}
            rows={filteredSubs}
            rowKey={(sub: any) => sub.id}
            defaultSort={{ key: 'name', dir: 'asc' }}
            empty="No subcontractors match your search or filters."
          />
        </SectionCard>
      )}
    <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
