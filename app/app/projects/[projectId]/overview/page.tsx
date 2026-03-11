'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030';
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));
const fmtPct = (a:number,b:number) => b>0?((a/b)*100).toFixed(1)+'%':'0%';

function KPI({label,value,sub}:{label:string,value:string,sub?:string}){
  return <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
    <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:1,color:DIM,marginBottom:6}}>{label}</div>
    <div style={{fontSize:22,fontWeight:800,color:TEXT,lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:DIM,marginTop:4}}>{sub}</div>}
  </div>;
}
function Card({title,children,action}:{title:string,children:React.ReactNode,action?:React.ReactNode}){
  return <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden',marginBottom:18}}>
    <div style={{padding:'12px 18px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <span style={{fontWeight:700,fontSize:14,color:TEXT}}>{title}</span>{action}
    </div>
    <div style={{padding:18}}>{children}</div>
  </div>;
}

export default function OverviewPage(){
  const { projectId } = useParams<{projectId:string}>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    fetch('/api/projects/'+projectId)
      .then(r=>r.json()).then(d=>setData(d)).catch(()=>{}).finally(()=>setLoading(false));
  },[projectId]);

  if(loading) return <div style={{padding:48,color:DIM,textAlign:'center',fontSize:14}}>Loading project data...</div>;
  if(!data?.project) return <div style={{padding:48,color:RED,textAlign:'center'}}>Project not found.</div>;

  const p = data.project;
  const payApps = data.payApps||[];
  const changeOrders = data.changeOrders||[];
  const rfis = data.rfis||[];
  const subs = data.subs||[];

  const approvedCOs = changeOrders.filter((c:any)=>c.status==='approved').reduce((s:number,c:any)=>s+(c.cost_impact||0),0);
  const contractToDate = (p.contract_amount||0)+approvedCOs;
  const billedToDate = payApps.length>0?(payApps[0].prev_completed||0)+(payApps[0].this_period||0):0;
  const paidToDate = payApps.filter((pa:any)=>pa.status==='paid').reduce((s:number,pa:any)=>s+(pa.current_payment_due||0),0);
  const retainageHeld = payApps.reduce((s:number,pa:any)=>s+(pa.retainage_amount||0),0);
  const daysRemaining = p.end_date?Math.max(0,Math.ceil((new Date(p.end_date).getTime()-Date.now())/86400000)):0;
  const overdueRFIs = rfis.filter((r:any)=>r.status==='open'&&r.due_date&&r.due_date<new Date().toISOString().split('T')[0]);

  return <div>
    <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:DARK}}>
      <div>
        <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>{p.name}</h2>
        <div style={{fontSize:12,color:DIM,marginTop:3}}>{[p.address,p.city,p.state].filter(Boolean).join(', ')}</div>
      </div>
      <div style={{display:'flex',gap:10}}>
        <Link href={'/app/projects/'+projectId+'/pay-apps/new'} style={{padding:'9px 16px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',borderRadius:7,color:'#0d1117',fontSize:12,fontWeight:800,textDecoration:'none'}}>+ New Pay App</Link>
      </div>
    </div>
    <div style={{padding:24}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:14,marginBottom:24}}>
        <KPI label="Contract to Date" value={fmt(contractToDate)} sub={approvedCOs>0?'+'+fmt(approvedCOs)+' in COs':'No change orders'}/>
        <KPI label="Billed to Date" value={fmt(billedToDate)} sub={fmtPct(billedToDate,contractToDate)+' complete'}/>
        <KPI label="Paid to Date" value={fmt(paidToDate)} sub={payApps.filter((pa:any)=>pa.status==='paid').length+' payment(s)'}/>
        <KPI label="Retainage Held" value={fmt(retainageHeld)} sub={(p.retainage_percent||10)+'% retained'}/>
        <KPI label="Days Remaining" value={daysRemaining>0?String(daysRemaining):'—'} sub={p.end_date?'Due '+p.end_date:'No end date set'}/>
      </div>

      {overdueRFIs.length>0&&<div style={{background:'rgba(192,48,48,.06)',border:'1px solid rgba(192,48,48,.25)',borderRadius:10,padding:'14px 18px',marginBottom:18,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontWeight:700,color:TEXT,fontSize:14}}>⚠ {overdueRFIs.length} overdue RFI(s) need a response</span>
        <Link href={'/app/projects/'+projectId+'/rfis'} style={{fontSize:12,color:GOLD,textDecoration:'none',fontWeight:700}}>View RFIs →</Link>
      </div>}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>
        <Card title="Project Details">
          {[['Status',p.status||'active'],['Type',p.project_type||'—'],['State',p.state||'—'],['Owner',p.owner_entity?.name||'—'],['Architect',p.architect_entity?.name||'—'],['Start Date',p.start_date||'—'],['End Date',p.end_date||'—'],['GC License',p.gc_license||'—'],['Prevailing Wage',p.prevailing_wage?'Yes':'No'],['Public Project',p.is_public_project?'Yes':'No']].map(([l,v]:any)=>(
            <div key={l} style={{display:'flex',padding:'7px 0',borderBottom:'1px solid rgba(38,51,71,.4)',fontSize:13}}>
              <span style={{minWidth:150,color:DIM,fontWeight:600}}>{l}</span>
              <span style={{color:TEXT,textTransform:'capitalize' as const}}>{v}</span>
            </div>
          ))}
        </Card>
        <div>
          <Card title="Financial Summary" action={<Link href={'/app/projects/'+projectId+'/pay-apps'} style={{fontSize:11,color:GOLD,textDecoration:'none'}}>All Pay Apps →</Link>}>
            {[['Original Contract',fmt(p.original_contract||p.contract_amount||0)],['Change Orders','+'+fmt(approvedCOs)],['Contract to Date',fmt(contractToDate)],['Billed to Date',fmt(billedToDate)+' ('+fmtPct(billedToDate,contractToDate)+')'],['Retainage Held',fmt(retainageHeld)],['Total Paid',fmt(paidToDate)],['Balance Due',fmt(Math.max(0,billedToDate-retainageHeld-paidToDate))]].map(([l,v]:any)=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid rgba(38,51,71,.4)',fontSize:13}}>
                <span style={{color:DIM}}>{l}</span><span style={{color:TEXT,fontWeight:600}}>{v}</span>
              </div>
            ))}
          </Card>
          <Card title="Subcontractors" action={<Link href={'/app/projects/'+projectId+'/team'} style={{fontSize:11,color:GOLD,textDecoration:'none'}}>Manage →</Link>}>
            {subs.length===0
              ?<div style={{color:DIM,fontSize:13,textAlign:'center',padding:'12px 0'}}>No subs yet. <Link href={'/app/projects/'+projectId+'/team'} style={{color:GOLD}}>Add subs →</Link></div>
              :subs.slice(0,4).map((sub:any)=>(
                <div key={sub.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid rgba(38,51,71,.3)'}}>
                  <div style={{width:30,height:30,borderRadius:'50%',background:'rgba(212,160,23,.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0,color:GOLD}}>{sub.name?.[0]||'?'}</div>
                  <div style={{flex:1}}><div style={{fontSize:13,color:TEXT,fontWeight:600}}>{sub.name}</div><div style={{fontSize:11,color:DIM}}>{sub.trade} — {fmt(sub.contract_amount||0)}</div></div>
                  <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:sub.status==='active'?'rgba(26,138,74,.15)':'rgba(148,163,184,.1)',color:sub.status==='active'?GREEN:DIM,fontWeight:700}}>{sub.status}</span>
                </div>
              ))
            }
          </Card>
        </div>
      </div>
    </div>
  </div>;
}
