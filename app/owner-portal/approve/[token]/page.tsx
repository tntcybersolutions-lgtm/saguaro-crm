'use client';
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8';

export default function OwnerApprovePage() {
  const params = useParams();
  const token = params['token'] as string;
  const [data, setData] = useState<Record<string,unknown>|null>(null);
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/portals/owner/${token}`).then(r=>r.json()).then(d=>{ setData(d); setLoading(false); }).catch(()=>setLoading(false));
  }, [token]);

  async function submit(dec: string) {
    setSubmitting(true);
    const res = await fetch(`/api/portals/owner/${token}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ decision: dec, notes }) });
    const result = await res.json();
    if (result.success) setDone(true);
    setSubmitting(false);
  }

  if (loading) return <div style={{minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',color:DIM}}>Loading approval request...</div>;

  if (done) return <div style={{minHeight:'100vh',background:DARK,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
    <div style={{fontSize:52,marginBottom:16}}>{decision==='approved'?'✅':'❌'}</div>
    <div style={{fontSize:22,fontWeight:800,color:TEXT,marginBottom:8}}>{decision==='approved'?'Payment Approved':'Payment Rejected'}</div>
    <div style={{fontSize:14,color:DIM}}>The contractor has been notified.</div>
  </div>;

  const approvalData = (data as any)?.approval || {};
  const amount = approvalData?.amount || 257400;
  const title = approvalData?.title || 'Pay Application #2 — Riverdale Medical Pavilion';
  const project = approvalData?.project || 'Riverdale Medical Pavilion';

  return (
    <div style={{minHeight:'100vh',background:DARK,padding:40}}>
      <div style={{maxWidth:640,margin:'0 auto'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:32}}>
          <span style={{fontSize:24}}>🌵</span>
          <span style={{fontWeight:900,fontSize:18,letterSpacing:2,color:GOLD}}>SAGUARO</span>
          <span style={{fontSize:10,background:GOLD,color:'#0d1117',padding:'2px 8px',borderRadius:4,fontWeight:700}}>OWNER PORTAL</span>
        </div>

        <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:14,overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,.5)'}}>
          <div style={{background:'#0a1117',padding:'20px 24px',borderBottom:`1px solid ${BORDER}`}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>Approval Required</div>
            <h2 style={{fontSize:20,fontWeight:800,color:TEXT,margin:0}}>{title}</h2>
          </div>

          <div style={{padding:24}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:24}}>
              {[['Project',project],['Contractor','Copper State Developments'],['Period','Feb 1 – Feb 28, 2026'],['Amount Due','$'+amount.toLocaleString()]].map(r=>(
                <div key={r[0]} style={{background:'#0d1117',borderRadius:8,padding:'12px 16px'}}>
                  <div style={{fontSize:11,color:DIM,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:4}}>{r[0]}</div>
                  <div style={{fontSize:15,fontWeight:700,color:r[0]==='Amount Due'?GOLD:TEXT}}>{r[1]}</div>
                </div>
              ))}
            </div>

            <div style={{background:'rgba(212,160,23,.06)',border:'1px solid rgba(212,160,23,.2)',borderRadius:10,padding:'16px 20px',marginBottom:24,fontSize:13,color:DIM,lineHeight:1.7}}>
              <strong style={{color:TEXT}}>What you&apos;re approving:</strong> Payment Application #2 for work completed through February 28, 2026. This represents 14.8% completion of the total contract value of $2,895,000. Conditional lien waivers from all 6 subcontractors are attached.
            </div>

            <div style={{marginBottom:24}}>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:8}}>Notes (optional)</label>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Add any notes about this approval..." style={{width:'100%',padding:'10px 14px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:8,color:TEXT,fontSize:13,outline:'none',resize:'vertical' as const}}/>
            </div>

            <div style={{display:'flex',gap:12}}>
              <button onClick={()=>{setDecision('approved');submit('approved');}} disabled={submitting} style={{flex:1,padding:14,background:'linear-gradient(135deg,#1a8a4a,#22a85e)',border:'none',borderRadius:8,color:'#fff',fontSize:15,fontWeight:800,cursor:'pointer',opacity:submitting?.7:1}}>
                ✅ Approve — ${amount.toLocaleString()}
              </button>
              <button onClick={()=>{setDecision('rejected');submit('rejected');}} disabled={submitting} style={{flex:1,padding:14,background:'rgba(192,48,48,.12)',border:'1px solid rgba(192,48,48,.3)',borderRadius:8,color:'#ff7070',fontSize:15,fontWeight:800,cursor:'pointer'}}>
                ❌ Reject
              </button>
            </div>

            <div style={{marginTop:16,fontSize:11,color:'#4a5f7a',textAlign:'center' as const}}>
              This approval is legally binding. By clicking Approve you certify the work has been performed per the contract documents.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
