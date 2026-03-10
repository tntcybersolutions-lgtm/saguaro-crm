'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
const GOLD='#D4A017',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#3dd68c',RED='#ef4444';

interface ComplianceSub { id:string; name:string; trade:string; contract_amount:number; coi_status:string; coi_expiry:string|null; w9_status:string; lien_waiver_status:string; }

export default function CompliancePage(){
  const params=useParams(); const pid=params['projectId'] as string;
  const [data,setData]=useState<{subs?:ComplianceSub[]}>({});
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    fetch('/api/compliance/'+pid+'?tenantId='+pid)
      .then(r=>r.json()).then(d=>setData(d)).catch(()=>{}).finally(()=>setLoading(false));
  },[pid]);

  const subs:ComplianceSub[] = data.subs ?? [
    {id:'1',name:'Desert Electric LLC',trade:'Electrical',contract_amount:185000,coi_status:'active',coi_expiry:'2026-12-31',w9_status:'on_file',lien_waiver_status:'current'},
    {id:'2',name:'AZ Plumbing & Mech',trade:'Plumbing',contract_amount:122000,coi_status:'expiring',coi_expiry:'2026-03-25',w9_status:'on_file',lien_waiver_status:'pending'},
    {id:'3',name:'Southwest Concrete',trade:'Concrete',contract_amount:98500,coi_status:'active',coi_expiry:'2027-01-15',w9_status:'pending',lien_waiver_status:'current'},
    {id:'4',name:'Mesa Roofing Co',trade:'Roofing',contract_amount:76000,coi_status:'expired',coi_expiry:'2026-02-28',w9_status:'on_file',lien_waiver_status:'missing'},
  ];

  const statusColor=(s:string)=>s==='active'||s==='on_file'||s==='current'?GREEN:s==='expiring'||s==='pending'?GOLD:RED;
  const statusLabel=(s:string)=>({active:'Active',on_file:'On File',current:'Current',expiring:'Expiring Soon',pending:'Pending',expired:'Expired',missing:'Missing'}[s]??s.toUpperCase());

  const issues=subs.filter(s=>s.coi_status==='expired'||s.coi_status==='expiring'||s.w9_status==='pending'||s.lien_waiver_status==='missing');

  return <div>
    <div style={{padding:'16px 24px',borderBottom:'1px solid '+BORDER,display:'flex',alignItems:'center',justifyContent:'space-between',background:'#0d1117'}}>
      <div><h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Compliance Dashboard</h2><div style={{fontSize:12,color:DIM,marginTop:3}}>COI tracking, W-9 status, lien waivers — {subs.length} subcontractors</div></div>
      <button onClick={()=>fetch('/api/insurance/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:pid,tenantId:pid})}).then(()=>alert('COI request emails sent to all subcontractors.'))} style={{padding:'8px 16px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>Request All COIs</button>
    </div>

    {issues.length>0&&<div style={{margin:24,background:'rgba(192,48,48,.08)',border:'1px solid rgba(192,48,48,.25)',borderRadius:10,padding:'14px 18px'}}>
      <div style={{fontWeight:700,color:RED,fontSize:13,marginBottom:10}}>⚠️ {issues.length} Compliance Issue{issues.length>1?'s':''} Require Attention</div>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {issues.map(s=><div key={s.id} style={{fontSize:12,color:TEXT}}>
          <strong>{s.name}</strong> — {s.coi_status==='expired'?'COI expired':s.coi_status==='expiring'?'COI expiring '+s.coi_expiry:s.w9_status==='pending'?'W-9 not on file':s.lien_waiver_status==='missing'?'Lien waiver missing':'Issue'}
        </div>)}
      </div>
    </div>}

    {loading?<div style={{padding:40,textAlign:'center',color:DIM}}>Loading...</div>:(
    <div style={{padding:'0 24px 24px'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24,paddingTop:24}}>
        {[
          {l:'Total Subs',v:subs.length.toString(),color:GOLD},
          {l:'COI Active',v:subs.filter(s=>s.coi_status==='active').length.toString(),color:GREEN},
          {l:'W-9 On File',v:subs.filter(s=>s.w9_status==='on_file').length.toString(),color:GREEN},
          {l:'Issues',v:issues.length.toString(),color:issues.length>0?RED:GREEN},
        ].map(k=><div key={k.l} style={{background:RAISED,border:'1px solid '+BORDER,borderRadius:10,padding:'16px 18px'}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',color:DIM,marginBottom:6}}>{k.l}</div>
          <div style={{fontSize:24,fontWeight:800,color:k.color}}>{k.v}</div>
        </div>)}
      </div>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead><tr style={{background:'#0a1117'}}>
          {['Subcontractor','Trade','Contract','COI Status','COI Expiry','W-9','Lien Waiver','Actions'].map(h=>(
            <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,color:DIM,borderBottom:'1px solid '+BORDER}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>{subs.map(s=>(
          <tr key={s.id} style={{borderBottom:'1px solid rgba(38,51,71,.5)'}}>
            <td style={{padding:'12px 14px',fontWeight:600,color:TEXT}}>{s.name}</td>
            <td style={{padding:'12px 14px',color:DIM}}>{s.trade}</td>
            <td style={{padding:'12px 14px',color:TEXT}}>${s.contract_amount.toLocaleString()}</td>
            <td style={{padding:'12px 14px'}}><span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:statusColor(s.coi_status)+'22',color:statusColor(s.coi_status)}}>{statusLabel(s.coi_status)}</span></td>
            <td style={{padding:'12px 14px',color:s.coi_status==='expired'?RED:s.coi_status==='expiring'?GOLD:DIM}}>{s.coi_expiry??'—'}</td>
            <td style={{padding:'12px 14px'}}><span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:statusColor(s.w9_status)+'22',color:statusColor(s.w9_status)}}>{statusLabel(s.w9_status)}</span></td>
            <td style={{padding:'12px 14px'}}><span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:statusColor(s.lien_waiver_status)+'22',color:statusColor(s.lien_waiver_status)}}>{statusLabel(s.lien_waiver_status)}</span></td>
            <td style={{padding:'12px 14px',display:'flex',gap:6}}>
              {(s.coi_status==='expired'||s.coi_status==='expiring')&&<button onClick={()=>fetch('/api/insurance/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subId:s.id,projectId:pid,tenantId:pid})}).then(()=>alert('COI request sent to '+s.name))} style={{padding:'3px 8px',background:'none',border:'1px solid rgba(212,160,23,.4)',borderRadius:4,color:GOLD,fontSize:10,cursor:'pointer'}}>Request COI</button>}
              {s.w9_status==='pending'&&<button onClick={()=>fetch('/api/documents/w9-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subId:s.id,projectId:pid,tenantId:pid})}).then(()=>alert('W-9 request sent to '+s.name))} style={{padding:'3px 8px',background:'none',border:'1px solid rgba(26,95,168,.4)',borderRadius:4,color:'#4a9de8',fontSize:10,cursor:'pointer'}}>Request W-9</button>}
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>)}
  </div>;
}