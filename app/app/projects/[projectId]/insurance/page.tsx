'use client';
/**
 * Insurance Certificates — every sub's COI on the job, with expiry alerts and
 * renewal requests, rolled up against the project roster.
 *
 * Reads   GET  /api/insurance/:projectId
 * Create  POST /api/insurance/create    (multipart: projectId, subName, policyType, carrier,
 *                                        policyNo, effectiveDate, expiryDate, coverageAmount, file)
 * Renew   POST /api/insurance/request   { projectId, certId, subName }
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import { useParams } from 'next/navigation';
import { ShieldCheck, Plus, WarningCircle, ShieldWarning, Hourglass, CurrencyDollar, PaperPlaneTilt, UsersThree, CheckCircle, ArrowClockwise } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select,
  FormModal, Field, Input, DateInput, FormGrid, Callout, ItemList, ItemRow, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';

const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));
const fmtDay = (iso:string, year=true) => new Date(iso+'T12:00:00').toLocaleDateString('en-US',year?{month:'short',day:'numeric',year:'numeric'}:{month:'short',day:'numeric'});

const POLICY_TYPES = ['GL','WC','Auto','Umbrella','E&O','Professional Liability','Other'];

function daysUntilExpiry(expiryDate:string):number{
  if(!expiryDate) return 9999;
  return Math.round((new Date(expiryDate+'T12:00:00').getTime()-Date.now())/86400000);
}

function certStatus(expiryDate:string):{label:string,tone:BadgeTone}{
  const days = daysUntilExpiry(expiryDate);
  if(days<0)   return {label:'Expired',tone:'overdue'};
  if(days<30)  return {label:`Exp. in ${days}d`,tone:'lead'};
  return {label:'Active',tone:'ongoing'};
}

const subOf    = (c:any) => c.sub_name||c.subName||c.vendor_name||'';
const typeOf   = (c:any) => c.policy_type||c.policyType||'';
const policyOf = (c:any) => c.policy_number||c.policyNo||'';
const expOf    = (c:any) => c.expiry_date||c.expiryDate||'';
const amtOf    = (c:any) => Number(c.coverage_amount||c.coverageAmount)||0;

const CSS = `
.insAlerts { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; margin-bottom: 16px; }
.insList { margin: 6px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.insList b { color: var(--text-primary); }
.insMore { font-size: 12px; color: var(--text-tertiary); margin-top: 4px; }
.insMono { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; }
.insLate { color: var(--danger); font-weight: 700; white-space: nowrap; }
.insSoon { color: var(--warning); font-weight: 700; white-space: nowrap; }
.insDay { white-space: nowrap; }
.insFile { font-size: 14px; color: var(--text-secondary); }
.insFile::file-selector-button { margin-right: 10px; padding: 6px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--bg-surface-2); color: var(--text-primary); cursor: pointer; font: inherit; }
.insBack { background: none; border: 0; padding: 0; color: var(--link); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
@media (max-width: 640px) {
  .insWs .k-btn, .insWs .k-stat, .insWs select.k-select, .insWs .k-input { min-height: 44px; }
}
`;

export default function InsurancePage() {
  const params    = useParams();
  const projectId = params['projectId'] as string;

  const [certs,setCerts]       = useState<any[]>([]);
  const [loading,setLoading]   = useState(true);
  const [error,setError]       = useState('');
  const [showForm,setShowForm] = useState(false);
  const [saving,setSaving]     = useState(false);
  const [renewingId,setRenewingId] = useState<string|null>(null);
  const { toast, show } = useToast(4000);

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

  // Toolbar state.
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
      show('Certificate added.');
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
      show(`Renewal request sent to ${subName}`);
    }catch(e:any){
      console.error(e); show(humanError(e, 'Failed to send the renewal request. Please try again.'),'bad');
    }finally{
      setRenewingId(null);
    }
  }

  function openForm(sub?:string){
    if(sub!==undefined){ setFCustomSub(false); setFSub(sub); }
    setError('');
    setShowForm(true);
  }
  function closeForm(){ setShowForm(false); setError(''); }

  const totalCount    = certs.length;
  const activeCount   = certs.filter(c=>daysUntilExpiry(expOf(c))>=30).length;
  const expiringCount = certs.filter(c=>{ const d=daysUntilExpiry(expOf(c)); return d>=0&&d<30; }).length;
  const expiredCount  = certs.filter(c=>daysUntilExpiry(expOf(c))<0).length;

  // Per-sub coverage rollup — certificates match to the roster by company name
  // (certs store sub_name text; the roster from project-context is authoritative).
  const subs = (ctx?.subs||[]) as any[];
  const norm = (v:any)=>String(v||'').toLowerCase().trim();
  const subRollup = subs.map(s=>{
    const own  = certs.filter(c=>norm(subOf(c))===norm(s.companyName));
    const days = own.map(c=>daysUntilExpiry(expOf(c)));
    return {
      ...s,
      certCount: own.length,
      state: own.length===0?'missing':!days.some(d=>d>=0)?'expired':days.some(d=>d>=0&&d<30)?'expiring':'covered',
    };
  });
  const coveredSubs  = subRollup.filter(s=>s.state==='covered'||s.state==='expiring').length;
  const missingSubs  = subRollup.filter(s=>s.state==='missing');
  const expiringSoon = certs
    .map(c=>({c,days:daysUntilExpiry(expOf(c))}))
    .filter(x=>x.days>=0&&x.days<30)
    .sort((a,b)=>a.days-b.days);
  const expiredCerts = certs.filter(c=>daysUntilExpiry(expOf(c))<0);
  const totalCoverage = certs.reduce((s,c)=>s+amtOf(c),0);

  // Toolbar-driven view of the certificate table (status derives from expiry).
  const qIns = certSearch.trim().toLowerCase();
  const filteredCerts = certs.filter((c:any)=>{
    const days = daysUntilExpiry(expOf(c));
    const state = days<0?'expired':days<30?'expiring':'active';
    if(certStatusFilter!=='all'&&state!==certStatusFilter) return false;
    if(certTypeFilter!=='all'&&String(typeOf(c))!==certTypeFilter) return false;
    if(!qIns) return true;
    return [subOf(c),c.carrier,policyOf(c)].some(v=>String(v||'').toLowerCase().includes(qIns));
  });
  const filtersActive = !!certSearch||certStatusFilter!=='all'||certTypeFilter!=='all';
  const clearFilters = ()=>{ setCertSearch(''); setCertStatusFilter('all'); setCertTypeFilter('all'); };
  const toggleStatus = (s:string)=>setCertStatusFilter(p=>p===s?'all':s);

  const stats:StatItem[] = [
    ...(ctx && subs.length>0 ? [
      {label:'COI on file',value:`${coveredSubs} of ${subs.length}`,tone:coveredSubs===subs.length?'good':'warn',sub:'Subs covered',icon:<UsersThree size={15}/>} as StatItem,
      ...(missingSubs.length>0 ? [{label:'No COI',value:missingSubs.length,tone:'bad',sub:'Uninsured on site',icon:<ShieldWarning size={15}/>} as StatItem] : []),
    ] : [
      {label:'Active',value:activeCount,tone:'good',sub:'30+ days out',icon:<CheckCircle size={15}/>,onClick:()=>toggleStatus('active'),active:certStatusFilter==='active'} as StatItem,
    ]),
    {label:'Expiring ≤30d',value:expiringCount,tone:expiringCount>0?'warn':'default',sub:'Within 30 days',icon:<Hourglass size={15}/>,onClick:()=>toggleStatus('expiring'),active:certStatusFilter==='expiring'},
    {label:'Expired',value:expiredCount,tone:expiredCount>0?'bad':'default',sub:'Request renewal',icon:<WarningCircle size={15}/>,onClick:()=>toggleStatus('expired'),active:certStatusFilter==='expired'},
    {label:'Coverage tracked',value:fmt(totalCoverage),sub:`Across ${totalCount} certificate${totalCount===1?'':'s'}`,icon:<CurrencyDollar size={15}/>},
  ];

  const columns:Column<any>[] = [
    {key:'sub',header:'Sub name',primary:true,accessor:(c)=>subOf(c),render:(c)=>subOf(c)||'Unnamed sub'},
    {key:'type',header:'Policy type',fit:'full',accessor:(c)=>typeOf(c),render:(c)=>typeOf(c)?<Badge tone="neutral">{typeOf(c)}</Badge>:''},
    {key:'carrier',header:'Carrier',render:(c)=>c.carrier||''},
    {key:'policy',header:'Policy #',accessor:(c)=>policyOf(c),render:(c)=>policyOf(c)?<span className="insMono">{policyOf(c)}</span>:''},
    {key:'coverage',header:'Coverage',align:'right',total:'sum',format:fmt,accessor:(c)=>amtOf(c),render:(c)=>amtOf(c)?fmt(amtOf(c)):''},
    {key:'expiry',header:'Expiry date',phone:'show',accessor:(c)=>expOf(c),render:(c)=>{
      const exp=expOf(c); if(!exp) return '';
      const days=daysUntilExpiry(exp);
      if(days<0) return <span className="insLate">{fmtDay(exp)} (expired)</span>;
      if(days<30) return <span className="insSoon">{fmtDay(exp)} ({days}d)</span>;
      return <span className="insDay">{fmtDay(exp)}</span>;
    }},
    {key:'status',header:'Status',phone:'show',accessor:(c)=>daysUntilExpiry(expOf(c)),render:(c)=>{ const st=certStatus(expOf(c)); return <Badge tone={st.tone} dot>{st.label}</Badge>; }},
  ];

  const rowActions = (c:any):Action[] => {
    const days=daysUntilExpiry(expOf(c));
    const cid=c.id||'';
    return [
      {label:renewingId===cid?'Sending…':'Request renewal',icon:<PaperPlaneTilt size={14}/>,onClick:()=>requestRenewal(cid,subOf(c)),inline:true,hidden:!(days<30),disabled:renewingId===cid},
    ];
  };

  const base = `/app/projects/${projectId}`;
  const showAlerts = !loading && (expiringSoon.length>0 || expiredCerts.length>0);

  return (
    <div className="insWs">
      <style dangerouslySetInnerHTML={{__html:CSS}}/>
      <PageShell
        crumbs={[
          {label:'Projects',href:'/app/projects'},
          {label:ctx?.project?.name||'Project',href:`${base}/overview`},
          {label:'Insurance'},
        ]}
        title="Insurance certificates"
        actions={<Button variant="primary" icon={<Plus size={15} weight="bold"/>} onClick={()=>openForm()}>Add certificate</Button>}
      >
        {!loading && (certs.length>0 || subs.length>0) && <StatRow items={stats}/>}

        {error && !showForm && (
          <div style={{marginBottom:16}}>
            <Callout tone="danger" icon={<WarningCircle size={18}/>} title="Something went wrong" text={error}
              actions={<Button size="sm" icon={<ArrowClockwise size={14}/>} onClick={()=>load()}>Try again</Button>}/>
          </div>
        )}

        {/* Expiry intelligence — what needs action this month */}
        {showAlerts && (
          <div className="insAlerts">
            {expiredCerts.length>0 && (
              <Callout tone="danger" icon={<WarningCircle size={18}/>} title={`${expiredCerts.length} expired — request renewal now`}
                text={<ul className="insList">
                  {expiredCerts.slice(0,4).map((c:any,i:number)=>(
                    <li key={c.id||i}><b>{subOf(c)||'Unnamed sub'}</b>{typeOf(c)?` · ${typeOf(c)}`:''} lapsed {fmtDay(String(expOf(c)),false)}</li>
                  ))}
                  {expiredCerts.length>4 && <li className="insMore">+{expiredCerts.length-4} more in the table below</li>}
                </ul>}
                actions={<Button size="sm" onClick={()=>setCertStatusFilter('expired')}>Show expired</Button>}/>
            )}
            {expiringSoon.length>0 && (
              <Callout tone="warning" icon={<Hourglass size={18}/>} title={`${expiringSoon.length} expiring within 30 days`}
                text={<ul className="insList">
                  {expiringSoon.slice(0,4).map((x:any,i:number)=>(
                    <li key={x.c.id||i}><b>{subOf(x.c)||'Unnamed sub'}</b>{typeOf(x.c)?` · ${typeOf(x.c)}`:''} — {x.days}d left</li>
                  ))}
                  {expiringSoon.length>4 && <li className="insMore">+{expiringSoon.length-4} more in the table below</li>}
                </ul>}
                actions={<Button size="sm" onClick={()=>setCertStatusFilter('expiring')}>Show expiring</Button>}/>
            )}
          </div>
        )}

        {!loading && ctx && missingSubs.length>0 && (
          <Card title="On the roster, no COI on file" subtitle={`${missingSubs.length} of ${subs.length} sub${subs.length===1?'':'s'}`} icon={<ShieldWarning size={16}/>}>
            <ItemList>
              {missingSubs.slice(0,7).map((s:any)=>(
                <ItemRow key={s.id} title={s.companyName} desc={s.trade||undefined}
                  action={<Button size="sm" icon={<Plus size={13} weight="bold"/>} onClick={()=>openForm(s.companyName)}>Add COI</Button>}/>
              ))}
            </ItemList>
            {missingSubs.length>7 && <div className="insMore">+{missingSubs.length-7} more subs</div>}
          </Card>
        )}

        {!loading && certs.length>0 && (
          <Toolbar
            search={certSearch}
            onSearch={setCertSearch}
            placeholder="Search certificates…"
            filters={
              <>
                <Select aria-label="Status" value={certStatusFilter} onChange={e=>setCertStatusFilter(e.target.value)} style={{width:'auto',minWidth:150}}
                  options={[{value:'all',label:'All statuses'},{value:'active',label:'Active'},{value:'expiring',label:'Expiring soon'},{value:'expired',label:'Expired'}]}/>
                <Select aria-label="Policy type" value={certTypeFilter} onChange={e=>setCertTypeFilter(e.target.value)} style={{width:'auto',minWidth:150}}
                  options={[{value:'all',label:'All types'},...POLICY_TYPES]}/>
                {filtersActive && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
              </>
            }
            actions={<span style={{fontSize:'var(--fs-sm)',color:'var(--text-tertiary)'}}>{filteredCerts.length} of {certs.length}</span>}
          />
        )}

        <Card flush>
          <DataTable<any>
            tableId="project-insurance"
            exportName="insurance-certificates"
            columns={columns}
            rows={filteredCerts}
            loading={loading}
            rowKey={(c)=>c.id||`${subOf(c)}:${policyOf(c)}`}
            defaultSort={{key:'expiry',dir:'asc'}}
            rowActions={rowActions}
            empty={certs.length===0 ? (
              <EmptyState
                icon={<ShieldCheck size={22}/>}
                title="No certificates yet"
                action={<Button icon={<Plus size={15} weight="bold"/>} onClick={()=>openForm()}>Add certificate</Button>}
              />
            ) : (
              <EmptyState title="Nothing matches" onClearFilters={clearFilters}/>
            )}
          />
        </Card>
      </PageShell>

      <FormModal
        open={showForm}
        onClose={closeForm}
        title="Add insurance certificate"
        subtitle={subs.length>0?`${subs.length} sub${subs.length===1?'':'s'} on the roster`:undefined}
        onSubmit={addCert}
        submitLabel={saving?'Adding…':'Add certificate'}
        busy={saving}
        error={error}
      >
        <FormGrid cols={3}>
          <Field label="Subcontractor name" required span hint={!fCustomSub && !!fSub && subs.some(s=>s.companyName===fSub) ? 'From the project roster.' : undefined}>
            {subs.length>0 && !fCustomSub ? (
              <Select value={subs.some(s=>s.companyName===fSub)?fSub:''} onChange={e=>{
                if(e.target.value==='__custom'){ setFCustomSub(true); setFSub(''); }
                else setFSub(e.target.value);
              }}
                placeholder="Select a sub from the roster…"
                options={[...subs.map((s:any)=>({value:String(s.companyName),label:`${s.companyName}${s.trade?` — ${s.trade}`:''}`})),{value:'__custom',label:'Other — type a name…'}]}/>
            ) : (
              <Input value={fSub} onChange={e=>setFSub(e.target.value)} placeholder="Desert Electrical Contractors" autoFocus={fCustomSub}/>
            )}
          </Field>
          {fCustomSub && subs.length>0 && (
            <div className="k-span-all" style={{marginTop:-8}}>
              <button type="button" className="insBack" onClick={()=>{setFCustomSub(false);setFSub('');}}>Back to the roster list</button>
            </div>
          )}
          <Field label="Policy type" required>
            <Select value={fType} onChange={e=>setFType(e.target.value)} options={POLICY_TYPES}/>
          </Field>
          <Field label="Carrier" required>
            <Input value={fCarrier} onChange={e=>setFCarrier(e.target.value)} placeholder="Travelers Insurance"/>
          </Field>
          <Field label="Policy number" required>
            <Input value={fPolicy} onChange={e=>setFPolicy(e.target.value)} placeholder="GL-2026-84721"/>
          </Field>
          <Field label="Effective date" required>
            <DateInput value={fEff} onChange={e=>setFEff(e.target.value)}/>
          </Field>
          <Field label="Expiry date" required>
            <DateInput value={fExp} onChange={e=>setFExp(e.target.value)}/>
          </Field>
          <Field label="Coverage amount ($)">
            <Input type="number" inputMode="decimal" value={fAmt} onChange={e=>setFAmt(e.target.value)} placeholder="2000000" min="0"/>
          </Field>
          <Field label="Certificate PDF (COI)" span hint={fFile?`Attached: ${fFile.name}`:undefined}>
            <input className="insFile" type="file" accept="application/pdf,image/png,image/jpeg" onChange={e=>setFFile(e.target.files?.[0]||null)}/>
          </Field>
        </FormGrid>
      </FormModal>
      <Toast message={toast?.message??null} tone={toast?.tone}/>
    </div>
  );
}
