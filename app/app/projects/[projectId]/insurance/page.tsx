'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { ShieldCheck, Plus, X, CheckCircle, Warning, WarningCircle, Users } from '@phosphor-icons/react';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, StatStrip, AutoChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { SortableTh, usePersistedSort, useSortedRows } from '@/app/app/_shared/table-sort';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF',GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A';
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

const INP:React.CSSProperties = {padding:'8px 12px',background:'var(--bg-surface-2)',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',width:'100%',boxSizing:'border-box'};
const LBL:React.CSSProperties = {display:'block',fontSize:11,fontWeight:700,color:DIM,marginBottom:6};
const HINT:React.CSSProperties = {fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:5,lineHeight:1.45};

const POLICY_TYPES = ['GL','WC','Auto','Umbrella','E&O','Professional Liability','Other'];

function daysUntilExpiry(expiryDate:string):number{
  if(!expiryDate) return 9999;
  return Math.round((new Date(expiryDate+'T12:00:00').getTime()-Date.now())/86400000);
}

function certStatus(expiryDate:string):{label:string,c:string,bg:string}{
  const days = daysUntilExpiry(expiryDate);
  if(days<0)   return {label:'Expired',        c:RED,        bg:'rgba(192,48,48,.14)'};
  if(days<30)  return {label:`Exp. in ${days}d`,c:'var(--warning)', bg:'color-mix(in srgb, var(--warning) 14%, transparent)'};
  return {label:'Active',c:'#3dd68c',bg:'rgba(26,138,74,.14)'};
}

export default function InsurancePage() {
  const params    = useParams();
  const projectId = params['projectId'] as string;

  const [certs,setCerts]       = useState<any[]>([]);
  const [loading,setLoading]   = useState(true);
  const [error,setError]       = useState('');
  const [showForm,setShowForm] = useState(false);
  const [saving,setSaving]     = useState(false);
  const [renewingId,setRenewingId] = useState<string|null>(null);
  const [toast,setToast] = useState<{msg:string;type:'success'|'error'}|null>(null);

  useEffect(()=>{ const t=toast?setTimeout(()=>setToast(null),4000):null; return ()=>{ if(t) clearTimeout(t); }; },[toast]);

  // Form
  const [fSub,setFSub]         = useState('');
  const [fType,setFType]       = useState('GL');
  const [fCarrier,setFCarrier] = useState('');
  const [fPolicy,setFPolicy]   = useState('');
  const [fEff,setFEff]         = useState('');
  const [fExp,setFExp]         = useState('');
  const [fAmt,setFAmt]         = useState('');
  const [fFile,setFFile]       = useState<File|null>(null);
  const [fCustomSub,setFCustomSub] = useState(false);

  // ListToolbar state — filters persist per module via sag_flt_insurance.
  const [certSearch,setCertSearch] = useState('');
  const [certStatusFilter,setCertStatusFilter] = useState('all');
  const [certTypeFilter,setCertTypeFilter] = useState('all');

  // Project intelligence — the roster from /api/project-context drives the
  // per-sub coverage rollup and the sub picker in the add form.
  const { ctx } = useProjectContext(projectId);

  const load = useCallback(async()=>{
    setLoading(true); setError('');
    try{
      const r = await fetch(`/api/insurance/${projectId}`);
      if(!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setCerts(d.certs||d.certificates||d.data||[]);
    }catch(e:any){
      console.error(e); setError(humanError(e, 'Failed to load insurance certificates. Please try again.'));
      setCerts([]);
    }finally{
      setLoading(false);
    }
  },[projectId]);

  useEffect(()=>{ load(); },[load]);

  async function addCert(){
    if(!fSub.trim()||!fCarrier.trim()||!fPolicy.trim()||!fEff||!fExp){ setError('All fields except coverage amount are required.'); return; }
    setSaving(true); setError('');
    try{
      // Multipart so the COI PDF is actually uploaded (the old JSON POST never
      // sent the file). The browser sets the multipart boundary — do not set
      // Content-Type manually.
      const fd = new FormData();
      fd.append('projectId',projectId);
      fd.append('subName',fSub);
      fd.append('policyType',fType);
      fd.append('carrier',fCarrier);
      fd.append('policyNo',fPolicy);
      fd.append('effectiveDate',fEff);
      fd.append('expiryDate',fExp);
      fd.append('coverageAmount',String(parseFloat(fAmt)||0));
      if(fFile) fd.append('file',fFile);
      const r = await fetch('/api/insurance/create',{method:'POST',body:fd});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setFSub(''); setFType('GL'); setFCarrier(''); setFPolicy(''); setFEff(''); setFExp(''); setFAmt(''); setFFile(null);
      setShowForm(false);
      await load();
    }catch(e:any){
      console.error(e); setError(humanError(e, 'Failed to add the certificate. Please try again.'));
    }finally{
      setSaving(false);
    }
  }

  async function requestRenewal(certId:string,subName:string){
    setRenewingId(certId);
    try{
      const r = await fetch('/api/insurance/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId,certId,subName})});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setToast({msg:`Renewal request sent to ${subName}`,type:'success'});
    }catch(e:any){
      console.error(e); setToast({msg:humanError(e, 'Failed to send the renewal request. Please try again.'),type:'error'});
    }finally{
      setRenewingId(null);
    }
  }

  const totalCount    = certs.length;
  const activeCount   = certs.filter(c=>daysUntilExpiry(c.expiry_date||c.expiryDate)>=30).length;
  const expiringCount = certs.filter(c=>{ const d=daysUntilExpiry(c.expiry_date||c.expiryDate); return d>=0&&d<30; }).length;
  const expiredCount  = certs.filter(c=>daysUntilExpiry(c.expiry_date||c.expiryDate)<0).length;

  // Per-sub coverage rollup — certificates match to the roster by company name
  // (certs store sub_name text; the roster from project-context is authoritative).
  const subs = (ctx?.subs||[]) as any[];
  const norm = (v:any)=>String(v||'').toLowerCase().trim();
  const subRollup = subs.map(s=>{
    const own  = certs.filter(c=>norm(c.sub_name||c.subName||c.vendor_name)===norm(s.companyName));
    const days = own.map(c=>daysUntilExpiry(c.expiry_date||c.expiryDate));
    return {
      ...s,
      certCount: own.length,
      state: own.length===0?'missing':!days.some(d=>d>=0)?'expired':days.some(d=>d>=0&&d<30)?'expiring':'covered',
    };
  });
  const coveredSubs  = subRollup.filter(s=>s.state==='covered'||s.state==='expiring').length;
  const missingSubs  = subRollup.filter(s=>s.state==='missing');
  const expiringSoon = certs
    .map(c=>({c,days:daysUntilExpiry(c.expiry_date||c.expiryDate)}))
    .filter(x=>x.days>=0&&x.days<30)
    .sort((a,b)=>a.days-b.days);
  const expiredCerts = certs.filter(c=>daysUntilExpiry(c.expiry_date||c.expiryDate)<0);
  const totalCoverage = certs.reduce((s,c)=>s+(Number(c.coverage_amount||c.coverageAmount)||0),0);

  // Toolbar-driven view of the certificate table (status derives from expiry).
  const qIns = certSearch.trim().toLowerCase();
  const filteredCerts = certs.filter((c:any)=>{
    const days = daysUntilExpiry(c.expiry_date||c.expiryDate);
    const state = days<0?'expired':days<30?'expiring':'active';
    if(certStatusFilter!=='all'&&state!==certStatusFilter) return false;
    if(certTypeFilter!=='all'&&String(c.policy_type||c.policyType||'')!==certTypeFilter) return false;
    if(!qIns) return true;
    return [c.sub_name||c.subName||c.vendor_name,c.carrier,c.policy_number||c.policyNo].some(v=>String(v||'').toLowerCase().includes(qIns));
  });

  // Sortable columns (R11 sweep) — expiry sorts on the raw ISO date (soonest
  // lapse first by default), coverage on the coerced number, status on urgency.
  const { sort, cycleSort } = usePersistedSort('project-insurance', { key: 'expiry', dir: 'asc' });
  const sortedCerts = useSortedRows(filteredCerts, sort, (c:any, key:string) => {
    switch (key) {
      case 'sub':      return c.sub_name||c.subName||c.vendor_name||null;
      case 'type':     return c.policy_type||c.policyType||null;
      case 'carrier':  return c.carrier||null;
      case 'policy':   return c.policy_number||c.policyNo||null;
      case 'coverage': return Number(c.coverage_amount||c.coverageAmount)||0;
      case 'expiry':   return c.expiry_date||c.expiryDate||null;
      case 'status':   return daysUntilExpiry(c.expiry_date||c.expiryDate);
      default:         return c[key];
    }
  });

  return (
    <>
      {toast && (
        <div style={{position:'fixed',bottom:'24px',left:'50%',transform:'translateX(-50%)',zIndex:99999,padding:'12px 20px',borderRadius:'8px',background:toast.type==='success'?'rgba(34,197,94,0.9)':'rgba(239,68,68,0.9)',color:'#fff',fontWeight:600,fontSize:'14px',pointerEvents:'none'}}>
          {toast.msg}
        </div>
      )}

      <PremiumSurface maxWidth={2200}>

        {/* Header */}
        <ModuleHero
          eyebrow="Insurance"
          eyebrowIcon={<ShieldCheck size={13} weight="fill" color={GOLD} />}
          title="Insurance"
          accent="Certificates"
          subtitle="COIs for all subcontractors — expiration alerts included"
          actions={
            <button onClick={()=>setShowForm(!showForm)} className="pmBtn"
              style={showForm ? ghostButtonStyle : goldButtonStyle}>
              {showForm ? <><X size={15} weight="bold" /> Cancel</> : <><Plus size={15} weight="bold" /> Add Certificate</>}
            </button>
          }
        />

        {/* Sub-coverage strip — who on the roster is covered, lapsing, or bare */}
        {ctx && subs.length>0 && (
          <StatStrip items={[
            {href: `/app/projects/${projectId}/subs`, label:'Subs on Roster', value:String(subs.length), icon:<Users size={12} color={GOLD} />, sub:'Active on this project'},
            {href: `/app/projects/${projectId}/insurance`, label:'COI on File', value:`${coveredSubs} of ${subs.length}`, accent:coveredSubs===subs.length?'#3dd68c':'var(--warning)', sub:'Subs holding a current certificate'},
            {href: `/app/projects/${projectId}/insurance`, label:'No COI', value:String(missingSubs.length), accent:missingSubs.length>0?'#ff7070':'#3dd68c', sub:missingSubs.length>0?'Uninsured exposure on site':'Every sub is covered'},
            {href: `/app/projects/${projectId}/insurance`, label:'Expiring ≤30d', value:String(expiringCount), accent:expiringCount>0?'var(--warning)':undefined, sub:'Renewal window open'},
            {href: `/app/projects/${projectId}/insurance`, label:'Expired', value:String(expiredCount), accent:expiredCount>0?'#ff7070':undefined, sub:'Past expiry — request renewal'},
            {href: `/app/projects/${projectId}/insurance`, label:'Coverage Tracked', value:fmt(totalCoverage), sub:`Across ${totalCount} certificate${totalCount===1?'':'s'}`},
          ]}/>
        )}

        {/* Add Form */}
        {showForm && (
          <SectionCard
            title="Add Insurance Certificate"
            icon={<ShieldCheck size={17} weight="duotone" color={GOLD} />}
            style={{ marginBottom: 24 }}
          >
            {error && (
              <div style={{background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:8,padding:'10px 14px',marginBottom:16,color:RED,fontSize:13}}>
                {error}
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14}}>
              <div style={{gridColumn:'1/-1'}}>
                <label style={LBL}>Subcontractor Name *{!fCustomSub && !!fSub && subs.some(s=>s.companyName===fSub) && <AutoChip label="Roster"/>}</label>
                {subs.length>0 && !fCustomSub ? (
                  <select value={subs.some(s=>s.companyName===fSub)?fSub:''} onChange={e=>{
                    if(e.target.value==='__custom'){ setFCustomSub(true); setFSub(''); }
                    else setFSub(e.target.value);
                  }} style={INP}>
                    <option value="">Select a sub from the roster…</option>
                    {subs.map((s:any)=><option key={s.id} value={s.companyName}>{s.companyName}{s.trade?` — ${s.trade}`:''}</option>)}
                    <option value="__custom">Other — type a name…</option>
                  </select>
                ) : (
                  <input value={fSub} onChange={e=>setFSub(e.target.value)} placeholder="Desert Electrical Contractors" style={INP}/>
                )}
                <div style={HINT}>
                  {fCustomSub && subs.length>0
                    ? <span onClick={()=>{setFCustomSub(false);setFSub('');}} style={{color:'var(--brand-primary-strong)',fontWeight:700,cursor:'pointer'}}>Back to the Roster List</span>
                    : subs.length>0
                      ? `${subs.length} sub${subs.length===1?'':'s'} on the project roster — certificates match to subs by company name.`
                      : 'Certificates match to roster subs by company name.'}
                </div>
              </div>
              <div>
                <label style={LBL}>Policy Type *</label>
                <select value={fType} onChange={e=>setFType(e.target.value)} style={INP}>
                  {POLICY_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Carrier *</label>
                <input value={fCarrier} onChange={e=>setFCarrier(e.target.value)} placeholder="Travelers Insurance" style={INP}/>
              </div>
              <div>
                <label style={LBL}>Policy Number *</label>
                <input value={fPolicy} onChange={e=>setFPolicy(e.target.value)} placeholder="GL-2026-84721" style={INP}/>
              </div>
              <div>
                <label style={LBL}>Effective Date *</label>
                <SaguaroDatePicker value={fEff} onChange={setFEff} style={INP}/>
              </div>
              <div>
                <label style={LBL}>Expiry Date *</label>
                <SaguaroDatePicker value={fExp} onChange={setFExp} style={INP}/>
              </div>
              <div>
                <label style={LBL}>Coverage Amount ($)</label>
                <input type="number" value={fAmt} onChange={e=>setFAmt(e.target.value)} placeholder="2000000" min="0" style={INP}/>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label style={LBL}>Certificate PDF (COI)</label>
                <input type="file" accept="application/pdf,image/png,image/jpeg"
                  onChange={e=>setFFile(e.target.files?.[0]||null)}
                  style={{...INP,padding:'7px 10px'}}/>
                {fFile && <div style={{marginTop:6,fontSize:11,color:DIM}}>Attached: {fFile.name}</div>}
              </div>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={addCert} disabled={saving} className="pmBtn"
                style={{...goldButtonStyle,cursor:saving?'wait':'pointer',opacity:saving?.6:1}}>
                {saving ? 'Adding…' : 'Add Certificate'}
              </button>
              <button onClick={()=>{setShowForm(false);setError('');}} className="pmBtn" style={ghostButtonStyle}>
                Cancel
              </button>
            </div>
          </SectionCard>
        )}

        {/* Error (outside form) */}
        {error && !showForm && (
          <div style={{background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:8,padding:'12px 16px',marginBottom:20,color:RED,fontSize:13}}>
            {error}
          </div>
        )}

        {/* KPI Cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
          <StatCard icon={<ShieldCheck size={19} weight="duotone" color={GOLD} />}    label="Total"         value={totalCount}    sub="Certificates"    delay={0.02}  href={`/app/projects/${projectId}/insurance`}/>
          <StatCard icon={<CheckCircle size={19} weight="duotone" color="#3dd68c" />} label="Active"        value={activeCount}   accent="#3dd68c" sub="30+ days out"  delay={0.06}  href={`/app/projects/${projectId}/insurance`}/>
          <StatCard icon={<Warning size={19} weight="duotone" color="var(--warning)" />}     label="Expiring Soon" value={expiringCount} accent="var(--warning)" sub="Under 30 days" delay={0.10}  href={`/app/projects/${projectId}/insurance`}/>
          <StatCard icon={<WarningCircle size={19} weight="duotone" color={RED} />}   label="Expired"       value={expiredCount}  accent={RED}     sub="Past due"      delay={0.14}  href={`/app/projects/${projectId}/insurance`}/>
        </div>

        {/* Expiry & gap intelligence — what needs action this month */}
        {!loading && (expiringSoon.length>0 || expiredCerts.length>0 || (ctx && missingSubs.length>0)) && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:12,marginBottom:24}}>
            {expiredCerts.length>0 && (
              <div style={{padding:'12px 16px',borderRadius:12,background:'rgba(192,48,48,.08)',border:'1px solid rgba(192,48,48,.35)'}}>
                <div style={{fontSize:11,fontWeight:800,color:'#ff7070',marginBottom:6}}>Expired — Request Renewal Now</div>
                {expiredCerts.slice(0,4).map((c:any,i:number)=>(
                  <div key={c.id||i} style={{fontSize:12.5,color:DIM,padding:'2px 0'}}>
                    <b style={{color:TEXT}}>{c.sub_name||c.subName||'—'}</b> · {c.policy_type||c.policyType||'—'} lapsed {new Date(String(c.expiry_date||c.expiryDate)+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                  </div>
                ))}
                {expiredCerts.length>4 && <div style={{fontSize:11.5,color:DIM,marginTop:4}}>+{expiredCerts.length-4} more in the table below</div>}
              </div>
            )}
            {expiringSoon.length>0 && (
              <div style={{padding:'12px 16px',borderRadius:12,background:'color-mix(in srgb, var(--warning) 7%, transparent)',border:'1px solid color-mix(in srgb, var(--warning) 35%, transparent)'}}>
                <div style={{fontSize:11,fontWeight:800,color:'var(--warning)',marginBottom:6}}>Expiring Within 30 Days</div>
                {expiringSoon.slice(0,4).map((x:any,i:number)=>(
                  <div key={x.c.id||i} style={{fontSize:12.5,color:DIM,padding:'2px 0'}}>
                    <b style={{color:TEXT}}>{x.c.sub_name||x.c.subName||'—'}</b> · {x.c.policy_type||x.c.policyType||'—'} — <b style={{color:'var(--warning)'}}>{x.days}d left</b>
                  </div>
                ))}
                {expiringSoon.length>4 && <div style={{fontSize:11.5,color:DIM,marginTop:4}}>+{expiringSoon.length-4} more in the table below</div>}
              </div>
            )}
            {ctx && missingSubs.length>0 && (
              <div style={{padding:'12px 16px',borderRadius:12,background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.12)'}}>
                <div style={{fontSize:11,fontWeight:800,color:DIM,marginBottom:6}}>On the Roster, No COI on File</div>
                {missingSubs.slice(0,4).map((s:any)=>(
                  <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,padding:'2px 0',fontSize:12.5,color:DIM}}>
                    <span style={{minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}><b style={{color:TEXT}}>{s.companyName}</b>{s.trade?` · ${s.trade}`:''}</span>
                    <span onClick={()=>{setFCustomSub(false);setFSub(s.companyName);setShowForm(true);}} style={{color:'var(--brand-primary-strong)',fontWeight:700,fontSize:11.5,cursor:'pointer',whiteSpace:'nowrap' as const}}>Add COI</span>
                  </div>
                ))}
                {missingSubs.length>4 && <div style={{fontSize:11.5,color:DIM,marginTop:4}}>+{missingSubs.length-4} more subs</div>}
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <SectionCard flat>
            <div style={{padding:'28px 8px',textAlign:'center' as const,color:DIM,fontSize:13}}>Loading certificates…</div>
          </SectionCard>
        )}

        {/* Empty */}
        {!loading && certs.length===0 && (
          <SectionCard flush>
            <div style={{display:'grid',gridTemplateColumns:ctx&&subs.length>0?'minmax(0,1fr) 340px':'1fr',alignItems:'stretch'}}>
              <PremiumEmpty
                icon={<ShieldCheck size={30} weight="duotone" color={GOLD} />}
                title="No certificates yet"
                description={subs.length>0
                  ? `${subs.length} sub${subs.length===1?'':'s'} on the roster and no COI on file for any of them. Every sub should carry current GL and WC coverage — expiry alerts and renewal requests run from here, and coverage is checked at bid award.`
                  : 'Upload COIs for your subcontractors to track expiration dates. Certificates are checked at bid award and flagged here 30 days before they lapse.'}
                action={
                  <button onClick={()=>setShowForm(true)} className="pmBtn" style={goldButtonStyle}>
                    <Plus size={15} weight="bold" /> Add First Certificate
                  </button>
                }
              />
              {ctx && subs.length>0 && (
                <div style={{borderLeft:'1px solid rgba(255,255,255,0.08)',padding:'22px 24px'}}>
                  <div style={{fontSize:10.5,fontWeight:900,color:'rgba(255,255,255,0.45)',marginBottom:10}}>Roster Awaiting COIs</div>
                  {subs.slice(0,7).map((s:any)=>(
                    <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,padding:'5px 0'}}>
                      <span style={{fontSize:12.5,color:TEXT,fontWeight:600,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{s.companyName}</span>
                      <span onClick={()=>{setFCustomSub(false);setFSub(s.companyName);setShowForm(true);}} style={{color:'var(--brand-primary-strong)',fontWeight:700,fontSize:11.5,cursor:'pointer',whiteSpace:'nowrap' as const}}>Add COI</span>
                    </div>
                  ))}
                  {subs.length>7 && <div style={{fontSize:11.5,color:DIM,marginTop:6}}>+{subs.length-7} more on the roster</div>}
                  <div style={{marginTop:12,fontSize:11.5,color:DIM,lineHeight:1.55}}>Pick subs from the roster in the form — certificates match by company name and the coverage rollup tracks itself.</div>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* Table */}
        {!loading && certs.length>0 && (<>
          <ListToolbar
            module="insurance"
            search={certSearch}
            onSearch={setCertSearch}
            searchPlaceholder="Search certificates…"
            filters={[
              { key: 'status', label: 'Status', value: certStatusFilter, onChange: setCertStatusFilter, allLabel: 'All Statuses', options: [
                { value: 'active', label: 'Active' },
                { value: 'expiring', label: 'Expiring Soon' },
                { value: 'expired', label: 'Expired' },
              ] },
              { key: 'type', label: 'Policy Type', value: certTypeFilter, onChange: setCertTypeFilter, allLabel: 'All Types', options: [...POLICY_TYPES] },
            ]}
            count={{ shown: filteredCerts.length, total: certs.length }}
            style={{ marginBottom: 16 }}
          />
          <SectionCard
            title="Certificates"
            icon={<ShieldCheck size={17} weight="duotone" color={GOLD} />}
            flush
          >
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
                <thead>
                  <tr>
                    {([
                      ['Sub Name','sub'],['Policy Type','type'],['Carrier','carrier'],['Policy #','policy'],
                      ['Coverage','coverage'],['Expiry Date','expiry'],['Status','status'],['Actions',undefined],
                    ] as [string, string|undefined][]).map(([h,k])=>(
                      <SortableTh key={h} label={h} sortKey={k} sort={sort} onSort={cycleSort} style={{padding:'10px 16px'}} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedCerts.map((c:any,idx:number)=>{
                    const expDate  = c.expiry_date||c.expiryDate||'';
                    const days     = daysUntilExpiry(expDate);
                    const st       = certStatus(expDate);
                    const expired  = days<0;
                    const expiring = days>=0&&days<30;
                    const rowBg    = expired?'rgba(192,48,48,.06)':expiring?'color-mix(in srgb, var(--warning) 4%, transparent)':'transparent';
                    const cid      = c.id||String(idx);
                    return (
                      <tr key={cid} style={{borderBottom:`1px solid rgba(255,255,255,0.06)`,background:rowBg}}>
                        <td style={{padding:'11px 16px',color:TEXT,fontWeight:600}}>{c.sub_name||c.subName||c.vendor_name||'—'}</td>
                        <td style={{padding:'11px 16px'}}>
                          <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:'var(--brand-primary-12)',color:GOLD}}>
                            {c.policy_type||c.policyType||'—'}
                          </span>
                        </td>
                        <td style={{padding:'11px 16px',color:DIM}}>{c.carrier||'—'}</td>
                        <td style={{padding:'11px 16px',color:DIM,fontFamily:'monospace',fontSize:12}}>{c.policy_number||c.policyNo||'—'}</td>
                        <td style={{padding:'11px 16px',color:TEXT}}>{c.coverage_amount||c.coverageAmount ? fmt(Number(c.coverage_amount||c.coverageAmount||0)) : '—'}</td>
                        <td style={{padding:'11px 16px',color:expired?RED:expiring?'var(--warning)':DIM,fontWeight:expired||expiring?700:400}}>
                          {expDate ? new Date(expDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}
                          {expiring && !expired && <span style={{marginLeft:6,fontSize:10,color:'var(--warning)'}}>({days}d)</span>}
                          {expired && <span style={{marginLeft:6,fontSize:10,color:RED}}>(expired)</span>}
                        </td>
                        <td style={{padding:'11px 16px'}}>
                          <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:4,background:st.bg,color:st.c}}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{padding:'11px 16px'}}>
                          {(expired||expiring) && (
                            <button onClick={()=>requestRenewal(cid,c.sub_name||c.subName||'')} disabled={renewingId===cid}
                              style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:GOLD,fontSize:11,padding:'4px 10px',cursor:renewingId===cid?'wait':'pointer',opacity:renewingId===cid?.5:1}}>
                              {renewingId===cid ? '…' : 'Request Renewal'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>)}

      </PremiumSurface>
    </>
  );
}
