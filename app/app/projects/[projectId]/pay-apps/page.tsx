'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { DEMO_PROJECT, DEMO_SUBS, DEMO_PAY_APPS, DEMO_RFIS, DEMO_CHANGE_ORDERS, DEMO_BUDGET_LINES, DEMO_AUTOPILOT_ALERTS, DEMO_CONTEXT } from '../../../../../demo-data';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030',BLUE='#1a5fa8';
const fmt = (n:number) => '$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
function Badge({label,color='#94a3b8',bg='rgba(148,163,184,.12)'}:{label:string,color?:string,bg?:string}){
  return <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:bg,color,textTransform:'uppercase' as const,letterSpacing:.3}}>{label}</span>;
}
function Card({title,children,action}:{title:string,children:React.ReactNode,action?:React.ReactNode}){
  return <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden',marginBottom:18}}>
    <div style={{padding:'12px 18px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <span style={{fontWeight:700,fontSize:14,color:TEXT}}>{title}</span>
      {action}
    </div>
    <div style={{padding:18}}>{children}</div>
  </div>;
}
function PageHeader({title,sub,actions}:{title:string,sub?:string,actions?:React.ReactNode}){
  return <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:DARK}}>
    <div><h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>{title}</h2>{sub&&<div style={{fontSize:12,color:DIM,marginTop:3}}>{sub}</div>}</div>
    {actions&&<div style={{display:'flex',gap:10}}>{actions}</div>}
  </div>;
}

export default function PayAppsPage(){
  const params = useParams();
  const router = useRouter();
  const pid = params['projectId'] as string;
  const [creating, setCreating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string|null>(null);

  async function downloadG702(paId:string, paNum:number) {
    setDownloadingId(paId);
    try {
      const r = await fetch('/api/documents/pay-application', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({payAppId:paId, projectId:pid, tenantId:'demo'}),
      });
      const d = await r.json();
      if (d.url || d.pdfUrl || d.g702PdfUrl) {
        window.open(d.url||d.pdfUrl||d.g702PdfUrl, '_blank');
      } else {
        alert(`G702 PDF for Pay App #${paNum} queued. Check Documents section.`);
      }
    } catch {
      alert(`G702 PDF for Pay App #${paNum} queued (demo mode). Check Documents section.`);
    } finally { setDownloadingId(null); }
  }
  return <div>
    <PageHeader title="Pay Applications" sub="AIA G702/G703 — Application and Certificate for Payment" actions={<button onClick={()=>setCreating(!creating)} style={{padding:'8px 16px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ New Pay Application</button>}/>
    {creating&&<div style={{margin:24,background:RAISED,border:`1px solid rgba(212,160,23,.3)`,borderRadius:10,padding:24}}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:4,color:TEXT}}>Create Pay Application #3</div>
      <div style={{fontSize:12,color:DIM,marginBottom:16}}>AI will auto-generate the G702 and G703 PDFs from your budget data</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:16}}>
        {[['Period From','2026-03-01'],['Period To','2026-03-31'],['Contract ID','C-2026-004']].map(f=>(
          <div key={f[0]}><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>{f[0]}</label>
            <input defaultValue={f[1]} style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none'}}/></div>
        ))}
      </div>
      <div style={{background:'rgba(212,160,23,.06)',border:'1px solid rgba(212,160,23,.2)',borderRadius:8,padding:'12px 16px',marginBottom:16,fontSize:12,color:DIM}}>
        🤖 AI will auto-populate the Schedule of Values from your budget line items and generate G702 + G703 PDFs automatically.
      </div>
      <div style={{display:'flex',gap:10}}>
        <button onClick={async()=>{const r=await fetch('/api/pay-apps/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenantId:'demo',projectId:pid,contractId:'demo-contract',periodTo:'2026-03-31',thisPeriod:0})});const d=await r.json();alert(d.g702PdfUrl?'Pay app created! PDF: '+d.g702PdfUrl:'Created (demo mode)');setCreating(false);}} style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>Create Pay App + Generate PDFs</button>
        <button onClick={()=>setCreating(false)} style={{padding:'9px 20px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
      </div>
    </div>}
    <div style={{padding:24}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
        {[{l:'Total Applications',v:'2'},{l:'Total Certified',v:'$385,650'},{l:'Retainage Held',v:'$42,850'},{l:'Next Due',v:'Apr 1, 2026'}].map(k=>(
          <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>{k.l}</div>
            <div style={{fontSize:20,fontWeight:800,color:TEXT}}>{k.v}</div>
          </div>
        ))}
      </div>
      <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
        <thead><tr style={{background:'#0a1117'}}>
          {['App #','Period','Contract Sum','This Period','Total Complete','Retainage','Net Due','Status','PDF','Actions'].map(h=>(
            <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>{DEMO_PAY_APPS.map(pa=>(
          <tr key={pa.id} style={{borderBottom:`1px solid rgba(38,51,71,.5)`}}>
            <td style={{padding:'12px 14px',color:GOLD,fontWeight:700}}>#{pa.application_number}</td>
            <td style={{padding:'12px 14px',color:DIM}}>{pa.period_from} — {pa.period_to}</td>
            <td style={{padding:'12px 14px',color:TEXT}}>{fmt(pa.contract_sum)}</td>
            <td style={{padding:'12px 14px',color:TEXT}}>{fmt(pa.total_completed_and_stored - (DEMO_PAY_APPS[DEMO_PAY_APPS.indexOf(pa)-1]?.total_completed_and_stored||0))}</td>
            <td style={{padding:'12px 14px',color:TEXT}}>{fmt(pa.total_completed_and_stored)}</td>
            <td style={{padding:'12px 14px',color:'#f97316'}}>{fmt(pa.retainage_held)}</td>
            <td style={{padding:'12px 14px',color:TEXT,fontWeight:700}}>{fmt(pa.current_payment_due)}</td>
            <td style={{padding:'12px 14px'}}><Badge label={pa.status} color={pa.status==='paid'?'#3dd68c':pa.status==='approved'?'#4a9de8':GOLD} bg={pa.status==='paid'?'rgba(26,138,74,.12)':pa.status==='approved'?'rgba(26,95,168,.12)':'rgba(212,160,23,.12)'}/></td>
            <td style={{padding:'12px 14px'}}>
              <button
                onClick={()=>downloadG702(pa.id, pa.application_number)}
                disabled={downloadingId===pa.id}
                style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:GOLD,fontSize:11,padding:'3px 8px',cursor:'pointer',opacity:downloadingId===pa.id?0.5:1}}
              >{downloadingId===pa.id?'…':'📄 G702'}</button>
            </td>
            <td style={{padding:'12px 14px'}}>{pa.status==='draft'&&<button onClick={async()=>{const r=await fetch('/api/pay-apps/'+pa.id+'/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenantId:'demo'})});alert('Submitted to owner!');}} style={{background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:5,color:'#0d1117',fontSize:11,padding:'4px 10px',fontWeight:700,cursor:'pointer'}}>Submit to Owner</button>}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  </div>;
}
