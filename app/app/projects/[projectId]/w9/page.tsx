'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A';

const INP:React.CSSProperties = {padding:'8px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',width:'100%',boxSizing:'border-box'};
const LBL:React.CSSProperties = {display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:6};

function w9StatusStyle(s:string):{c:string,bg:string}{
  if(s==='submitted') return {c:'#3dd68c',bg:'rgba(26,138,74,.14)'};
  if(s==='pending')   return {c:GOLD,    bg:'rgba(212,160,23,.14)'};
  return {c:DIM,bg:'rgba(143,163,192,.12)'};
}

export default function W9Page() {
  const params    = useParams();
  const projectId = params['projectId'] as string;

  const [requests,setRequests] = useState<any[]>([]);
  const [loading,setLoading]   = useState(true);
  const [error,setError]       = useState('');
  const [success,setSuccess]   = useState('');
  const [showForm,setShowForm] = useState(false);
  const [sending,setSending]   = useState(false);
  const [resendingId,setResendingId] = useState<string|null>(null);

  // Form
  const [fName,setFName]   = useState('');
  const [fEmail,setFEmail] = useState('');

  const load = useCallback(async()=>{
    setLoading(true); setError('');
    try{
      const r = await fetch(`/api/documents/w9-request?projectId=${projectId}`);
      if(!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setRequests(d.w9Requests??[]);
    }catch(e:any){
      setError(e.message||'Failed to load W-9 requests');
    }finally{
      setLoading(false);
    }
  },[projectId]);

  useEffect(()=>{ load(); },[load]);

  async function sendRequest(){
    if(!fName.trim()||!fEmail.trim()){ setError('Vendor name and email are required'); return; }
    setSending(true); setError(''); setSuccess('');
    try{
      const r = await fetch('/api/documents/w9-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        projectId,vendorName:fName,vendorEmail:fEmail,
      })});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setSuccess(`W-9 request sent to ${fEmail}`);
      setFName(''); setFEmail('');
      setShowForm(false);
      await load();
    }catch(e:any){
      setError(e.message||'Failed to send W-9 request');
    }finally{
      setSending(false);
    }
  }

  async function resend(req:any){
    setResendingId(req.id);
    setSuccess(''); setError('');
    try{
      const r = await fetch('/api/documents/w9-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        projectId,vendorName:req.vendor_name,vendorEmail:req.vendor_email,
      })});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setSuccess(`Reminder sent to ${req.vendor_email}`);
    }catch(e:any){
      setError(e.message||'Failed to resend request');
    }finally{
      setResendingId(null);
    }
  }

  const submittedCount = requests.filter(r=>r.status==='submitted').length;
  const pendingCount   = requests.filter(r=>r.status==='pending').length;

  return (
    <div>
      {/* Header */}
      <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>W-9 Requests</h2>
          <div style={{fontSize:12,color:DIM,marginTop:3}}>Collect W-9 forms from vendors and subcontractors via secure portal</div>
        </div>
        <button onClick={()=>setShowForm(!showForm)}
          style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:DARK,fontSize:13,fontWeight:800,cursor:'pointer'}}>
          {showForm ? '× Cancel' : '+ Send W-9 Request'}
        </button>
      </div>

      {/* Send Form */}
      {showForm && (
        <div style={{margin:'20px 24px',background:RAISED,border:`1px solid rgba(212,160,23,.3)`,borderRadius:12,padding:24}}>
          <div style={{fontWeight:800,fontSize:15,color:TEXT,marginBottom:18,paddingBottom:12,borderBottom:`1px solid ${BORDER}`}}>Send W-9 Request</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
            <div>
              <label style={LBL}>Vendor / Sub Name *</label>
              <input value={fName} onChange={e=>setFName(e.target.value)} placeholder="ABC Electrical LLC" style={INP}/>
            </div>
            <div>
              <label style={LBL}>Email Address *</label>
              <input type="email" value={fEmail} onChange={e=>setFEmail(e.target.value)} placeholder="accounting@vendor.com" style={INP}/>
            </div>
          </div>
          <div style={{fontSize:12,color:DIM,marginBottom:16,padding:'10px 14px',background:'rgba(212,160,23,.06)',border:`1px solid rgba(212,160,23,.15)`,borderRadius:7}}>
            The vendor will receive an email with a secure link to submit their W-9 form. You will be notified when complete.
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={sendRequest} disabled={sending||!fName.trim()||!fEmail.trim()}
              style={{padding:'9px 22px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:DARK,fontWeight:800,fontSize:13,cursor:sending?'wait':'pointer',opacity:sending||!fName.trim()||!fEmail.trim()?.6:1}}>
              {sending ? 'Sending…' : 'Send Request'}
            </button>
            <button onClick={()=>{setShowForm(false);setError('');}}
              style={{padding:'9px 18px',background:'none',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontSize:13,cursor:'pointer'}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{padding:24}}>
        {/* Error */}
        {error && (
          <div style={{background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:8,padding:'12px 16px',marginBottom:20,color:RED,fontSize:13}}>
            {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div style={{background:'rgba(26,138,74,.10)',border:'1px solid rgba(61,214,140,.3)',borderRadius:8,padding:'12px 16px',marginBottom:20,color:'#3dd68c',fontSize:13}}>
            ✓ {success}
          </div>
        )}

        {/* KPI Cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:24}}>
          {[
            {l:'Total Requests',v:String(requests.length),c:TEXT},
            {l:'Submitted',v:String(submittedCount),c:'#3dd68c'},
            {l:'Pending',v:String(pendingCount),c:GOLD},
          ].map(k=>(
            <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>{k.l}</div>
              <div style={{fontSize:22,fontWeight:800,color:k.c}}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* Loading */}
        {loading && <div style={{padding:40,textAlign:'center' as const,color:DIM}}>Loading W-9 requests…</div>}

        {/* Empty */}
        {!loading && requests.length===0 && (
          <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:56,textAlign:'center' as const}}>
            <div style={{fontSize:40,marginBottom:14}}>📋</div>
            <div style={{fontWeight:800,fontSize:16,color:TEXT,marginBottom:8}}>No W-9 requests yet</div>
            <div style={{fontSize:13,color:DIM,marginBottom:24}}>Send secure W-9 collection links to vendors and subcontractors.</div>
            <button onClick={()=>setShowForm(true)}
              style={{padding:'10px 24px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:DARK,fontSize:13,fontWeight:800,cursor:'pointer'}}>
              + Send First W-9 Request
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && requests.length>0 && (
          <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden'}}>
            <div style={{padding:'12px 18px',borderBottom:`1px solid ${BORDER}`}}>
              <span style={{fontWeight:800,fontSize:14,color:TEXT}}>W-9 Request Log</span>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
                <thead>
                  <tr style={{background:DARK}}>
                    {['Vendor / Sub','Email','Status','Sent Date','Submitted Date','Actions'].map(h=>(
                      <th key={h} style={{padding:'10px 16px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`}}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req:any,i:number)=>{
                    const st = w9StatusStyle(req.status||'pending');
                    return (
                      <tr key={req.id||i} style={{borderBottom:`1px solid rgba(38,51,71,.4)`,background:i%2===0?'transparent':'rgba(31,44,62,.3)'}}>
                        <td style={{padding:'12px 16px',color:TEXT,fontWeight:600}}>{req.vendor_name||'—'}</td>
                        <td style={{padding:'12px 16px',color:DIM}}>{req.vendor_email||'—'}</td>
                        <td style={{padding:'12px 16px'}}>
                          <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:4,background:st.bg,color:st.c,textTransform:'uppercase' as const,letterSpacing:.3}}>
                            {req.status||'pending'}
                          </span>
                        </td>
                        <td style={{padding:'12px 16px',color:DIM}}>
                          {req.sent_at ? new Date(req.sent_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}
                        </td>
                        <td style={{padding:'12px 16px',color:req.submitted_at?'#3dd68c':DIM}}>
                          {req.submitted_at ? new Date(req.submitted_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}
                        </td>
                        <td style={{padding:'12px 16px'}}>
                          <div style={{display:'flex',gap:8,alignItems:'center'}}>
                            {req.status==='pending' && (
                              <button onClick={()=>resend(req)} disabled={resendingId===req.id}
                                style={{fontSize:11,padding:'4px 12px',background:'rgba(212,160,23,.1)',border:`1px solid rgba(212,160,23,.3)`,borderRadius:5,color:GOLD,cursor:resendingId===req.id?'wait':'pointer',opacity:resendingId===req.id?.5:1}}>
                                {resendingId===req.id ? '…' : 'Resend'}
                              </button>
                            )}
                            {req.status==='submitted' && req.w9_url && (
                              <a href={req.w9_url} target="_blank" rel="noreferrer"
                                style={{fontSize:11,padding:'4px 12px',background:'rgba(26,138,74,.1)',border:'1px solid rgba(61,214,140,.3)',borderRadius:5,color:'#3dd68c',textDecoration:'none',cursor:'pointer'}}>
                                📄 Download
                              </a>
                            )}
                            {req.status==='submitted' && !req.w9_url && (
                              <span style={{fontSize:11,color:'#3dd68c',fontWeight:700}}>✓ Submitted</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
