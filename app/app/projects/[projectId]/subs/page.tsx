'use client';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { Handshake, Trash, Users, CurrencyDollar, HandCoins, Heartbeat, Plus, ShieldCheck, ShieldWarning, AddressBook } from '@phosphor-icons/react';
import { SUB_TRADES } from '@/lib/construction-intelligence';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, FlowSteps, FlowStrip, InsightRow, AutoChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { SortableTh, usePersistedSort, useSortedRows } from '@/app/app/_shared/table-sort';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';

const GOLD='var(--brand-primary)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF';
const cap = (s:string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

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
  if (!s.insurance_expiry) return { label: 'COI not on file', color: '#FF3B30', ok: false };
  const exp = new Date(String(s.insurance_expiry).slice(0, 10) + 'T00:00:00');
  const days = Math.floor((exp.getTime() - Date.now()) / 86400000);
  const d = exp.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (days < 0) return { label: `COI expired ${d}`, color: '#FF3B30', ok: false };
  if (days <= 30) return { label: `COI expires in ${days}d`, color: 'var(--warning)', ok: true };
  return { label: `COI valid through ${d}`, color: '#2CFF7A', ok: true };
}
function hasComplianceIssue(s: Sub) { return !w9Ok(s) || !coiState(s).ok; }

function scoreBadge(score: number) {
  const color = score >= 80 ? '#2CFF7A' : score >= 60 ? 'var(--warning)' : '#FF3B30';
  return <span style={{fontSize:12,fontWeight:800,color,background:`color-mix(in srgb, ${color} 9%, transparent)`,padding:'3px 10px',borderRadius:6}}>{score}</span>;
}

function statusBadge(s: string) {
  const map: Record<string,{c:string,bg:string}> = {
    active:{c:'#2CFF7A',bg:'rgba(44,255,122,.12)'}, prequalified:{c:'var(--brand-primary-strong)',bg:'var(--brand-primary-12)'},
    invited:{c:GOLD,bg:'var(--brand-primary-12)'}, suspended:{c:'#FF3B30',bg:'rgba(255,59,48,.12)'},
    inactive:{c:DIM,bg:'rgba(143,163,192,.08)'},
  };
  const st = map[s]||{c:DIM,bg:'rgba(143,163,192,.08)'};
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
    try {
      const r = await fetch('/api/subs/create', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        // Alias keys (email/phone/licenseNumber) mirror the columns
        // /api/subs/create actually persists; the original field names stay intact.
        body: JSON.stringify({ ...form, projectId, contract_amount: parseFloat(form.contract_amount)||0, status:'active', email: form.contact_email || undefined, phone: form.contact_phone || undefined, licenseNumber: form.license_number || undefined }),
      });
      if (!r.ok) { const b = await r.json(); throw new Error(b.error||'Failed'); }
      setShowForm(false);
      setForm({ name:'', trade:'', contact_name:'', contact_email:'', contact_phone:'', license_number:'', contract_amount:'' });
      setPickId(''); setAuto({});
      setToast({msg:'Subcontractor added',type:'success'});
      load();
      guard.clearDraft();
      return true;
    } catch (err: unknown) { console.error(err); setToast({msg:humanError(err,'Something went wrong. Please try again.'),type:'error'}); }
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
  const hintS: React.CSSProperties = {fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:5,lineHeight:1.45};

  const totalContract = subs.reduce((s,sub) => s + (sub.contract_amount||0), 0);
  const totalPaid = subs.reduce((s,sub) => s + (sub.paid_amount||0), 0);
  const avgScore = subs.length > 0 ? Math.round(subs.reduce((s,sub) => s + (sub.health_score||0), 0) / subs.length) : 0;
  const avgScoreColor = avgScore >= 80 ? '#2CFF7A' : avgScore >= 60 ? GOLD : subs.length > 0 ? '#FF3B30' : undefined;

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
  const { sort, cycleSort } = usePersistedSort('project-subs', { key: 'name', dir: 'asc' });
  const sortedSubs = useSortedRows(filteredSubs, sort, (s, key) => {
    switch (key) {
      case 'contract': return s.contract_amount || Number(roster.find(r => r.id === s.id)?.contractAmount || 0);
      case 'paid': return s.paid_amount;
      case 'score': return s.health_score || 0;
      case 'status': return s.status || 'active';
      default: return (s as unknown as Record<string, unknown>)[key];
    }
  });

  return (
    <PremiumSurface maxWidth={2200}>
      {toast && <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:99999,padding:'12px 20px',borderRadius:8,background:toast.type==='success'?'rgba(44,255,122,0.9)':'rgba(255,59,48,0.9)',color:'#fff',fontWeight:600,fontSize:14}}>{toast.msg}</div>}

      {/* Header */}
      <ModuleHero
        eyebrow="Subcontractors"
        eyebrowIcon={<Handshake size={13} weight="fill" color={GOLD} />}
        title="Subcontractor"
        accent="Management"
        subtitle="Manage subs, track compliance, monitor health scores."
        actions={
          <button onClick={()=>setShowForm(!showForm)} style={goldButtonStyle} className="pmBtn">
            {showForm ? 'Cancel' : <><Plus size={15} weight="bold" /> Add Subcontractor</>}
          </button>
        }
      />

      {/* Roster intelligence — what the system already knows about this job */}
      {ctx && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/subs`,  label: 'Subs on Job', value: String(roster.length), sub: 'On the project roster' },
          {href: `/app/projects/${projectId}/subs`,  label: 'Sub Commitments', value: fmt(rosterTotal), sub: 'Combined sub contracts' },
          {href: `/app/projects/${projectId}/compliance`,  label: 'Compliance Issues', value: String(complianceIssues), accent: complianceIssues > 0 ? '#FF3B30' : '#2CFF7A', sub: complianceIssues > 0 ? 'Missing W-9 or lapsed COI' : rosterIds.size > 0 ? 'Roster is clean' : 'Directory is clean' },
          {href: `/app/projects/${projectId}/subs`,  label: 'Directory', value: String(subs.length), sub: 'Companies tenant-wide' },
          {href: `/app/projects/${projectId}/bid-packages`,  label: 'Awarded Packages', value: String(awardedPkgs.length), sub: `${fmt(awardedPkgs.reduce((s, b) => s + (Number(b.awardedAmount) || 0), 0))} awarded` },
        ]} />
      )}

      {/* KPIs (fallback when the context snapshot is unavailable) */}
      {!ctx && (
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:16,marginBottom:28}}>
        <StatCard icon={<Users size={19} weight="duotone" color={GOLD} />} label="Total Subs" value={String(subs.length)} accent={GOLD} delay={0.02}  href={`/app/projects/${projectId}/subs`}/>
        <StatCard icon={<CurrencyDollar size={19} weight="duotone" color={GOLD} />} label="Total Contract Value" value={fmt(totalContract)} accent={GOLD} delay={0.06}  href={`/app/projects/${projectId}/contracts`}/>
        <StatCard icon={<HandCoins size={19} weight="duotone" color="#2CFF7A" />} label="Total Paid" value={fmt(totalPaid)} accent="#2CFF7A" delay={0.10}  href={`/app/projects/${projectId}/subs`}/>
        <StatCard icon={<Heartbeat size={19} weight="duotone" color={avgScoreColor || GOLD} />} label="Avg Health Score" value={String(avgScore)} accent={avgScoreColor} delay={0.14}  href={`/app/projects/${projectId}/subs`}/>
      </div>
      )}

      {/* Create Form — SmartCreate: pick from the directory, the system fills the rest */}
      {showForm && (
        <div style={{marginBottom:20,display:'grid',gridTemplateColumns:'minmax(0,1fr) 320px',gap:18,alignItems:'start'}}>
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
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                <div>
                  <label style={lblS}>Company Name<span style={{color:'#FF3B30'}}> *</span>{auto.name&&<AutoChip/>}</label>
                  <input required type="text" placeholder="ABC Electric LLC" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} style={inpS} />
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
                  <input type="email" placeholder="john@abc.com" value={form.contact_email} onChange={e=>setForm(p=>({...p,contact_email:e.target.value}))} style={inpS} />
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
              <div style={{marginTop:16,display:'flex',gap:10}}>
                <button type="submit" style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> Add Subcontractor</button>
                <button type="button" onClick={()=>setShowForm(false)} style={ghostButtonStyle} className="pmBtn">Cancel</button>
              </div>
            </form>
          </SectionCard>

          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <SectionCard flat title="Compliance Snapshot" icon={picked ? (hasComplianceIssue(picked) ? <ShieldWarning size={17} weight="duotone" color="#FF3B30" /> : <ShieldCheck size={17} weight="duotone" color="#2CFF7A" />) : <ShieldCheck size={17} weight="duotone" color={GOLD} />}>
              {picked ? (
                <>
                  <InsightRow label="W-9" value={w9Ok(picked)?'On file':'Missing'} accent={w9Ok(picked)?'#2CFF7A':'#FF3B30'} strong/>
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
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr>
                  {([
                    ['Company','name'],['Trade','trade'],['Contact','contact_name'],['Phone','contact_phone'],
                    ['License','license_number'],['W-9 / COI',undefined],['Contract','contract'],['Paid','paid'],
                    ['Score','score'],['Status','status'],['',undefined],
                  ] as [string, string|undefined][]).map(([h,k],i)=>(
                    <SortableTh key={h||`th-${i}`} label={h} sortKey={k} sort={sort} onSort={cycleSort} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedSubs.length === 0 && (
                  <tr><td colSpan={11} style={{padding:'26px 14px',textAlign:'center',color:DIM,fontSize:13}}>No subcontractors match your search or filters.</td></tr>
                )}
                {sortedSubs.map(sub=>(
                  <tr key={sub.id} style={{borderBottom:`1px solid rgba(255,255,255,0.08)`}} onMouseEnter={e=>(e.currentTarget.style.background='color-mix(in srgb, var(--brand-primary) 4%, transparent)')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                    <td style={{padding:'12px 14px'}}>
                      <div style={{color:TEXT,fontWeight:700}}>{sub.name}</div>
                      <div style={{color:DIM,fontSize:11}}>{sub.contact_email}</div>
                    </td>
                    <td style={{padding:'12px 14px',color:GOLD,fontWeight:600}}>{sub.trade||'—'}</td>
                    <td style={{padding:'12px 14px',color:DIM}}>{sub.contact_name||'—'}</td>
                    <td style={{padding:'12px 14px',color:DIM}}>{sub.contact_phone||'—'}</td>
                    <td style={{padding:'12px 14px',color:DIM,fontFamily:'monospace',fontSize:11}}>{sub.license_number||'—'}</td>
                    <td style={{padding:'12px 14px',whiteSpace:'nowrap'}}>
                      <span title={w9Ok(sub)?'W-9 on file':'W-9 missing'} style={{fontSize:10,fontWeight:800,padding:'2px 7px',borderRadius:4,marginRight:4,background:w9Ok(sub)?'rgba(44,255,122,.12)':'rgba(255,59,48,.12)',color:w9Ok(sub)?'#2CFF7A':'#FF3B30'}}>W-9</span>
                      <span title={coiState(sub).label} style={{fontSize:10,fontWeight:800,padding:'2px 7px',borderRadius:4,background:`color-mix(in srgb, ${coiState(sub).color} 12%, transparent)`,color:coiState(sub).color}}>COI</span>
                    </td>
                    <td style={{padding:'12px 14px',color:TEXT,fontWeight:600}}>{fmt(sub.contract_amount || Number(roster.find(r=>r.id===sub.id)?.contractAmount || 0))}</td>
                    <td style={{padding:'12px 14px',color:'#2CFF7A',fontWeight:600}}>{fmt(sub.paid_amount)}</td>
                    <td style={{padding:'12px 14px'}}>{scoreBadge(sub.health_score||0)}</td>
                    <td style={{padding:'12px 14px'}}>
                      <select value={sub.status||'active'} onChange={e=>handleUpdateStatus(sub.id,e.target.value)}
                        style={{background:'var(--bg-surface-2)',border:`1px solid ${BORDER}`,borderRadius:5,color:TEXT,fontSize:11,padding:'4px 8px',cursor:'pointer'}}>
                        {['active','prequalified','invited','suspended','inactive'].map(s=><option key={s} value={s}>{cap(s)}</option>)}
                      </select>
                    </td>
                    <td style={{padding:'12px 14px'}}>
                      {deleteId===sub.id ? (
                        <div style={{display:'flex',gap:4}}>
                          <button onClick={()=>handleDelete(sub.id)} style={{padding:'3px 8px',background:'rgba(255,59,48,.15)',border:'1px solid rgba(255,59,48,.3)',borderRadius:5,color:'#FF3B30',fontSize:11,fontWeight:700,cursor:'pointer'}}>Yes</button>
                          <button onClick={()=>setDeleteId(null)} style={{padding:'3px 8px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,cursor:'pointer'}}>No</button>
                        </div>
                      ) : (
                        <button onClick={()=>setDeleteId(sub.id)} style={{background:'none',border:'none',color:'rgba(255,59,48,.6)',cursor:'pointer',fontSize:14}} title="Delete"><Trash size={16} weight="regular" color="rgba(255,59,48,.6)" /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    <UnsavedGuardModal guard={guard} />
    </PremiumSurface>
  );
}
