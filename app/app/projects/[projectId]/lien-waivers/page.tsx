'use client';
import React, { useState } from 'react';
import { useParams } from 'next/navigation';
const GOLD='#D4A017',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#3dd68c',RED='#ef4444';
const WAIVER_TYPES=['conditional_partial','unconditional_partial','conditional_final','unconditional_final'];
const STATES=['AZ','CA','TX','NV','CO','FL','WA','OR','UT','NM','OTHER'];

export default function LienWaiversPage(){
  const params=useParams(); const pid=params['projectId'] as string;
  const [form,setForm]=useState({waiverType:'conditional_partial',state:'AZ',claimantName:'',claimantAddress:'',amount:'',throughDate:new Date().toISOString().slice(0,10),exceptions:''});
  const [loading,setLoading]=useState(false);
  const [result,setResult]=useState<{documentId:string}|null>(null);
  const [error,setError]=useState('');
  const [showForm,setShowForm]=useState(false);
  const inp={width:'100%',padding:'9px 12px',background:'rgba(255,255,255,.04)',border:'1px solid '+BORDER,borderRadius:7,color:TEXT,fontSize:13,outline:'none'};

  async function generate(){
    if(!form.claimantName||!form.amount||!form.throughDate){setError('Claimant name, amount, and through-date are required.');return;}
    setLoading(true);setError('');
    const res=await fetch('/api/documents/lien-waiver',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenantId:pid,projectId:pid,...form,amount:Number(form.amount)})});
    const d=await res.json();
    setLoading(false);
    if(d.error){setError(d.error);}else{setResult(d);setShowForm(false);}
  }

  return <div>
    <div style={{padding:'16px 24px',borderBottom:'1px solid '+BORDER,display:'flex',alignItems:'center',justifyContent:'space-between',background:'#0d1117'}}>
      <div><h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Lien Waivers</h2><div style={{fontSize:12,color:DIM,marginTop:3}}>State-specific lien waivers — AZ, CA, TX statutory language included</div></div>
      <button onClick={()=>setShowForm(!showForm)} style={{padding:'8px 16px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ Generate Lien Waiver</button>
    </div>

    {showForm&&<div style={{margin:24,background:RAISED,border:'1px solid rgba(212,160,23,.3)',borderRadius:12,padding:24}}>
      <div style={{fontWeight:700,fontSize:15,color:TEXT,marginBottom:16}}>Generate Lien Waiver</div>
      {error&&<div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13,color:RED}}>{error}</div>}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <div><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>Waiver Type</label>
          <select value={form.waiverType} onChange={e=>setForm(p=>({...p,waiverType:e.target.value}))} style={inp as React.CSSProperties}>
            {WAIVER_TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
          </select></div>
        <div><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>State</label>
          <select value={form.state} onChange={e=>setForm(p=>({...p,state:e.target.value}))} style={inp as React.CSSProperties}>
            {STATES.map(s=><option key={s}>{s}</option>)}
          </select></div>
        <div><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>Claimant Name *</label>
          <input value={form.claimantName} onChange={e=>setForm(p=>({...p,claimantName:e.target.value}))} placeholder="ABC Electrical LLC" style={inp as React.CSSProperties}/></div>
        <div><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>Claimant Address</label>
          <input value={form.claimantAddress} onChange={e=>setForm(p=>({...p,claimantAddress:e.target.value}))} placeholder="123 Main St, Phoenix AZ 85001" style={inp as React.CSSProperties}/></div>
        <div><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>Amount ($) *</label>
          <input type="number" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} placeholder="45000" style={inp as React.CSSProperties}/></div>
        <div><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>Through Date *</label>
          <input type="date" value={form.throughDate} onChange={e=>setForm(p=>({...p,throughDate:e.target.value}))} style={inp as React.CSSProperties}/></div>
      </div>
      <div style={{marginBottom:16}}><label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:5}}>Exceptions (optional)</label>
        <textarea value={form.exceptions} onChange={e=>setForm(p=>({...p,exceptions:e.target.value}))} rows={2} placeholder="List any exceptions to this waiver..." style={{...inp as React.CSSProperties,resize:'vertical'}}/></div>
      <div style={{display:'flex',gap:10}}>
        <button onClick={generate} disabled={loading} style={{padding:'10px 22px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:loading?'wait':'pointer',opacity:loading?.7:1}}>{loading?'Generating...':'Generate Lien Waiver PDF'}</button>
        <button onClick={()=>setShowForm(false)} style={{padding:'10px 18px',background:RAISED,border:'1px solid '+BORDER,borderRadius:8,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
      </div>
    </div>}

    {result&&<div style={{margin:24,background:'rgba(26,138,74,.08)',border:'1px solid rgba(26,138,74,.3)',borderRadius:12,padding:20,display:'flex',alignItems:'center',gap:16}}>
      <div style={{fontSize:32}}>✅</div>
      <div style={{flex:1}}>
        <div style={{fontWeight:700,color:GREEN,fontSize:14}}>Lien Waiver Generated</div>
        <div style={{fontSize:12,color:DIM,marginTop:2}}>Document ID: {result.documentId}</div>
      </div>
      <a href={'/api/documents/'+result.documentId+'/download'} style={{padding:'8px 16px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',borderRadius:7,color:'#0d1117',fontSize:12,fontWeight:800,textDecoration:'none'}}>Download PDF</a>
    </div>}

    <div style={{padding:24}}>
      <div style={{background:RAISED,border:'1px solid '+BORDER,borderRadius:10,padding:40,textAlign:'center'}}>
        <div style={{fontSize:36,marginBottom:12}}>📄</div>
        <div style={{fontWeight:700,fontSize:15,color:TEXT,marginBottom:8}}>No lien waivers generated yet</div>
        <div style={{fontSize:13,color:DIM,marginBottom:20,maxWidth:420,margin:'0 auto 20px'}}>Generate state-specific conditional and unconditional lien waivers for your subcontractors. AZ (ARS §33-1008), CA (Civil Code §8132), and TX (Property Code Ch. 53) statutory forms included.</div>
        <button onClick={()=>setShowForm(true)} style={{padding:'10px 22px',background:'linear-gradient(135deg,'+GOLD+',#F0C040)',border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>Generate Your First Lien Waiver →</button>
      </div>
    </div>
  </div>;
}