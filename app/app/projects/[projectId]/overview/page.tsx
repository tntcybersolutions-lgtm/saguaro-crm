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
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  useEffect(()=>{
    fetch('/api/projects/'+projectId)
      .then(r=>r.json()).then(d=>setData(d)).catch(()=>{}).finally(()=>setLoading(false));
  },[projectId]);

  async function runAutopilot(){
    setScanning(true); setScanMsg('');
    try {
      const res = await fetch('/api/autopilot/run', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({projectId}) });
      const json = await res.json();
      setScanMsg(json.summary || 'Scan complete.');
      // Refresh data to pick up new alerts
      const r2 = await fetch('/api/projects/'+projectId);
      const d2 = await r2.json();
      setData(d2);
    } catch { setScanMsg('Scan failed. Please try again.'); }
    finally { setScanning(false); }
  }

  if(loading) return <div style={{padding:48,color:DIM,textAlign:'center',fontSize:14}}>Loading project data...</div>;
  if(!data?.project) return <div style={{padding:48,color:RED,textAlign:'center'}}>Project not found.</div>;

  const p = data.project;
  const payApps = data.payApps||[];
  const changeOrders = data.changeOrders||[];
  const rfis = data.rfis||[];
  const subs = data.subs||[];
  const budgetHealth = data.budgetHealth||{originalBudget:0,committedCost:0,actualCost:0,forecastCost:0,lineCount:0};
  const punchSummary = data.punchSummary||{total:0,open:0,complete:0};
  const schedulePhases = data.schedulePhases||[];
  const alerts = data.alerts||[];

  const approvedCOs = changeOrders.filter((c:any)=>c.status==='approved').reduce((s:number,c:any)=>s+(c.cost_impact||0),0);
  const contractToDate = (p.contract_amount||0)+approvedCOs;
  const billedToDate = payApps.length>0?(payApps[0].total_completed_and_stored||0):0;
  const paidToDate = payApps.filter((pa:any)=>pa.status==='paid').reduce((s:number,pa:any)=>s+(pa.current_payment_due||0),0);
  const retainageHeld = payApps.reduce((s:number,pa:any)=>s+(pa.retainage_amount||0),0);
  const daysRemaining = p.end_date?Math.max(0,Math.ceil((new Date(p.end_date).getTime()-Date.now())/86400000)):0;
  const overdueRFIs = rfis.filter((r:any)=>r.status==='open'&&r.due_date&&r.due_date<new Date().toISOString().split('T')[0]);
  const budgetVariance = budgetHealth.forecastCost - budgetHealth.originalBudget;
  const budgetPct = budgetHealth.originalBudget > 0 ? (budgetHealth.actualCost / budgetHealth.originalBudget * 100).toFixed(1) : '0';

  return <div>
    <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:DARK}}>
      <div>
        <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>{p.name}</h2>
        <div style={{fontSize:12,color:DIM,marginTop:3}}>{[p.address,p.city,p.state].filter(Boolean).join(', ')}</div>
      </div>
      <div style={{display:'flex',gap:10,alignItems:'center'}}>
        <button onClick={runAutopilot} disabled={scanning} style={{padding:'9px 16px',background:'rgba(212,160,23,.1)',border:`1px solid rgba(212,160,23,.3)`,borderRadius:7,color:GOLD,fontSize:12,fontWeight:700,cursor:'pointer',opacity:scanning?.6:1}}>{scanning?'Scanning...':'Run Autopilot'}</button>
        <Link href={'/app/projects/'+projectId+'/pay-apps/new'} style={{padding:'9px 16px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',borderRadius:7,color:'#0d1117',fontSize:12,fontWeight:800,textDecoration:'none'}}>+ New Pay App</Link>
      </div>
    </div>
    {scanMsg&&<div style={{margin:'0 24px',marginTop:0,padding:'10px 16px',background:'rgba(212,160,23,.06)',border:'1px solid rgba(212,160,23,.2)',borderRadius:8,fontSize:13,color:GOLD,marginBottom:0}}>{scanMsg}</div>}
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

      {alerts.length>0&&<div style={{background:'rgba(212,160,23,.04)',border:'1px solid rgba(212,160,23,.2)',borderRadius:10,padding:'14px 18px',marginBottom:18}}>
        <div style={{fontWeight:700,fontSize:13,color:GOLD,marginBottom:10}}>Autopilot Alerts</div>
        {alerts.slice(0,3).map((a:any)=>(
          <div key={a.id} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'6px 0',borderBottom:'1px solid rgba(38,51,71,.3)'}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:GOLD,marginTop:5,flexShrink:0}}/>
            <div><div style={{fontSize:13,color:TEXT,fontWeight:600}}>{a.title}</div><div style={{fontSize:11,color:DIM,marginTop:1}}>{a.message}</div></div>
            <div style={{marginLeft:'auto',fontSize:10,color:DIM,whiteSpace:'nowrap' as const}}>{new Date(a.created_at).toLocaleDateString()}</div>
          </div>
        ))}
      </div>}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>
        <div>
          <Card title="Project Details">
            {[['Status',p.status||'active'],['Type',p.project_type||'—'],['State',p.state||'—'],['Owner',p.owner_entity?.name||'—'],['Architect',p.architect_entity?.name||'—'],['Start Date',p.start_date||'—'],['End Date',p.end_date||'—'],['GC License',p.gc_license||'—'],['Prevailing Wage',p.prevailing_wage?'Yes':'No'],['Public Project',p.is_public_project?'Yes':'No']].map(([l,v]:any)=>(
              <div key={l} style={{display:'flex',padding:'7px 0',borderBottom:'1px solid rgba(38,51,71,.4)',fontSize:13}}>
                <span style={{minWidth:150,color:DIM,fontWeight:600}}>{l}</span>
                <span style={{color:TEXT,textTransform:'capitalize' as const}}>{v}</span>
              </div>
            ))}
          </Card>
          {budgetHealth.lineCount>0&&<Card title="Budget Health" action={<Link href={'/app/projects/'+projectId+'/budget'} style={{fontSize:11,color:GOLD,textDecoration:'none'}}>View Budget →</Link>}>
            <div style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6,fontSize:12}}>
                <span style={{color:DIM}}>Actual vs. Budget</span>
                <span style={{color:budgetVariance>0?RED:GREEN,fontWeight:700}}>{budgetPct}% spent</span>
              </div>
              <div style={{height:8,background:'rgba(38,51,71,.6)',borderRadius:4,overflow:'hidden'}}>
                <div style={{height:'100%',background:parseFloat(budgetPct)>90?RED:parseFloat(budgetPct)>75?GOLD:GREEN,width:Math.min(100,parseFloat(budgetPct))+'%',borderRadius:4,transition:'width .3s'}}/>
              </div>
            </div>
            {[['Original Budget',fmt(budgetHealth.originalBudget)],['Committed Cost',fmt(budgetHealth.committedCost)],['Actual Cost',fmt(budgetHealth.actualCost)],['Forecast',fmt(budgetHealth.forecastCost)],['Variance',fmt(Math.abs(budgetVariance))+(budgetVariance>0?' over':' under')]].map(([l,v]:any)=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(38,51,71,.3)',fontSize:12}}>
                <span style={{color:DIM}}>{l}</span>
                <span style={{color:l==='Variance'?(budgetVariance>0?RED:GREEN):TEXT,fontWeight:600}}>{v}</span>
              </div>
            ))}
          </Card>}
        </div>
        <div>
          <Card title="Financial Summary" action={<Link href={'/app/projects/'+projectId+'/pay-apps'} style={{fontSize:11,color:GOLD,textDecoration:'none'}}>All Pay Apps →</Link>}>
            {[['Original Contract',fmt(p.original_contract||p.contract_amount||0)],['Change Orders','+'+fmt(approvedCOs)],['Contract to Date',fmt(contractToDate)],['Billed to Date',fmt(billedToDate)+' ('+fmtPct(billedToDate,contractToDate)+')'],['Retainage Held',fmt(retainageHeld)],['Total Paid',fmt(paidToDate)],['Balance Due',fmt(Math.max(0,billedToDate-retainageHeld-paidToDate))]].map(([l,v]:any)=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid rgba(38,51,71,.4)',fontSize:13}}>
                <span style={{color:DIM}}>{l}</span><span style={{color:TEXT,fontWeight:600}}>{v}</span>
              </div>
            ))}
          </Card>
          {punchSummary.total>0&&<Card title="Punch List" action={<Link href={'/app/projects/'+projectId+'/punch-list'} style={{fontSize:11,color:GOLD,textDecoration:'none'}}>View All →</Link>}>
            <div style={{display:'flex',gap:16,marginBottom:12}}>
              <div style={{flex:1,textAlign:'center' as const,padding:'10px 0',background:'rgba(192,48,48,.06)',borderRadius:8,border:'1px solid rgba(192,48,48,.2)'}}>
                <div style={{fontSize:22,fontWeight:800,color:RED}}>{punchSummary.open}</div>
                <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase' as const,marginTop:3}}>Open</div>
              </div>
              <div style={{flex:1,textAlign:'center' as const,padding:'10px 0',background:'rgba(26,138,74,.06)',borderRadius:8,border:'1px solid rgba(26,138,74,.2)'}}>
                <div style={{fontSize:22,fontWeight:800,color:GREEN}}>{punchSummary.complete}</div>
                <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase' as const,marginTop:3}}>Complete</div>
              </div>
              <div style={{flex:1,textAlign:'center' as const,padding:'10px 0',background:'rgba(38,51,71,.4)',borderRadius:8,border:`1px solid ${BORDER}`}}>
                <div style={{fontSize:22,fontWeight:800,color:TEXT}}>{punchSummary.total}</div>
                <div style={{fontSize:10,fontWeight:700,color:DIM,textTransform:'uppercase' as const,marginTop:3}}>Total</div>
              </div>
            </div>
            {punchSummary.total>0&&<div style={{height:8,background:'rgba(38,51,71,.6)',borderRadius:4,overflow:'hidden'}}>
              <div style={{height:'100%',background:GREEN,width:(punchSummary.complete/punchSummary.total*100).toFixed(1)+'%',borderRadius:4}}/>
            </div>}
          </Card>}
          {schedulePhases.length>0&&<Card title="Schedule" action={<Link href={'/app/projects/'+projectId+'/schedule'} style={{fontSize:11,color:GOLD,textDecoration:'none'}}>Full Schedule →</Link>}>
            {schedulePhases.slice(0,4).map((phase:any)=>{
              const planned = phase.planned_end;
              const actual = phase.actual_end||phase.forecast_end;
              const late = planned&&actual&&actual>planned&&phase.status!=='complete';
              return <div key={phase.id} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:'1px solid rgba(38,51,71,.3)'}}>
                <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,background:phase.status==='complete'?GREEN:late?RED:phase.status==='in_progress'?GOLD:DIM}}/>
                <div style={{flex:1,fontSize:13,color:TEXT,fontWeight:600}}>{phase.name}</div>
                <div style={{fontSize:11,color:late?RED:DIM}}>{phase.planned_end||'—'}</div>
                <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:phase.status==='complete'?'rgba(26,138,74,.15)':phase.status==='in_progress'?'rgba(212,160,23,.12)':'rgba(148,163,184,.1)',color:phase.status==='complete'?GREEN:phase.status==='in_progress'?GOLD:DIM,fontWeight:700,textTransform:'uppercase' as const}}>{phase.status||'pending'}</span>
              </div>;
            })}
          </Card>}
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
