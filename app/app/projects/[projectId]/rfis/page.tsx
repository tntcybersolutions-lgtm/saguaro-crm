'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A';

const INP:React.CSSProperties = {padding:'8px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',width:'100%',boxSizing:'border-box'};
const LBL:React.CSSProperties = {display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:6};

function rfiStatusStyle(s:string):{c:string,bg:string}{
  if(s==='open')     return {c:GOLD,    bg:'rgba(212,160,23,.14)'};
  if(s==='answered') return {c:'#3dd68c',bg:'rgba(26,138,74,.14)'};
  if(s==='closed')   return {c:DIM,    bg:'rgba(143,163,192,.12)'};
  return {c:DIM,bg:'rgba(143,163,192,.12)'};
}

export default function RFIsPage() {
  const params    = useParams();
  const projectId = params['projectId'] as string;
  const today     = new Date().toISOString().split('T')[0];

  const [rfis,setRfis]           = useState<any[]>([]);
  const [loading,setLoading]     = useState(true);
  const [error,setError]         = useState('');
  const [showForm,setShowForm]   = useState(false);
  const [saving,setSaving]       = useState(false);
  const [answeringId,setAnsweringId] = useState<string|null>(null);
  const [answerText,setAnswerText]   = useState('');
  const [submittingAnswer,setSubmittingAnswer] = useState(false);
  const [toast,setToast] = useState<{msg:string;type:'success'|'error'}|null>(null);

  useEffect(()=>{ const t=toast?setTimeout(()=>setToast(null),4000):null; return ()=>{ if(t) clearTimeout(t); }; },[toast]);

  // Create form state
  const [fSubject,setFSubject]       = useState('');
  const [fQuestion,setFQuestion]     = useState('');
  const [fSpecSection,setFSpecSection] = useState('');
  const [fDueDate,setFDueDate]       = useState('');

  const load = useCallback(async()=>{
    setLoading(true); setError('');
    try{
      const r = await fetch(`/api/rfis/list?projectId=${projectId}`);
      if(!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setRfis(d.rfis??[]);
    }catch(e:any){
      setError(e.message||'Failed to load RFIs');
    }finally{
      setLoading(false);
    }
  },[projectId]);

  useEffect(()=>{ load(); },[load]);

  async function submitRFI(){
    if(!fSubject.trim()){ setError('Subject is required'); return; }
    setSaving(true); setError('');
    try{
      const r = await fetch('/api/rfis/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        projectId,subject:fSubject,question:fQuestion,specSection:fSpecSection,dueDate:fDueDate||undefined,
      })});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setFSubject(''); setFQuestion(''); setFSpecSection(''); setFDueDate('');
      setShowForm(false);
      await load();
    }catch(e:any){
      setError(e.message||'Failed to create RFI');
    }finally{
      setSaving(false);
    }
  }

  async function submitAnswer(rfiId:string){
    if(!answerText.trim()) return;
    setSubmittingAnswer(true);
    try{
      const r = await fetch(`/api/rfis/${rfiId}/answer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answer:answerText,projectId})});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setAnsweringId(null); setAnswerText('');
      setToast({msg:'Answer submitted successfully.',type:'success'});
      await load();
    }catch(e:any){
      setToast({msg:e.message||'Failed to submit answer',type:'error'});
    }finally{
      setSubmittingAnswer(false);
    }
  }

  const openCount = rfis.filter(r=>r.status==='open').length;
  const overdueCount = rfis.filter(r=>r.is_overdue).length;

  return (
    <div>
      {toast && (
        <div style={{position:'fixed',bottom:'24px',left:'50%',transform:'translateX(-50%)',zIndex:99999,padding:'12px 20px',borderRadius:'8px',background:toast.type==='success'?'rgba(34,197,94,0.9)':'rgba(239,68,68,0.9)',color:'#fff',fontWeight:600,fontSize:'14px',pointerEvents:'none'}}>
          {toast.msg}
        </div>
      )}
      {/* Header */}
      <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>RFIs</h2>
          <div style={{fontSize:12,color:DIM,marginTop:3}}>
            {loading ? 'Loading…' : `${openCount} open · ${rfis.length} total${overdueCount>0?` · ${overdueCount} overdue`:''}`}
          </div>
        </div>
        <button onClick={()=>setShowForm(!showForm)}
          style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:DARK,fontSize:13,fontWeight:800,cursor:'pointer'}}>
          {showForm ? '× Cancel' : '+ Create RFI'}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div style={{margin:'20px 24px',background:RAISED,border:`1px solid rgba(212,160,23,.3)`,borderRadius:12,padding:24}}>
          <div style={{fontWeight:800,fontSize:15,color:TEXT,marginBottom:18,paddingBottom:12,borderBottom:`1px solid ${BORDER}`}}>New Request for Information</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
            <div style={{gridColumn:'1/-1'}}>
              <label style={LBL}>Subject *</label>
              <input value={fSubject} onChange={e=>setFSubject(e.target.value)} placeholder="e.g. Clarify footing depth at grid A-3" style={INP}/>
            </div>
            <div>
              <label style={LBL}>Spec Section</label>
              <input value={fSpecSection} onChange={e=>setFSpecSection(e.target.value)} placeholder="e.g. 03 30 00" style={INP}/>
            </div>
            <div>
              <label style={LBL}>Due Date</label>
              <SaguaroDatePicker value={fDueDate} onChange={setFDueDate} style={INP}/>
            </div>
            <div style={{gridColumn:'1/-1'}}>
              <label style={LBL}>Question / Description</label>
              <textarea value={fQuestion} onChange={e=>setFQuestion(e.target.value)} rows={4} placeholder="Describe the question in detail…"
                style={{...INP,resize:'vertical' as const}}/>
            </div>
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={submitRFI} disabled={saving||!fSubject.trim()}
              style={{padding:'9px 22px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:DARK,fontWeight:800,fontSize:13,cursor:saving?'wait':'pointer',opacity:saving||!fSubject.trim()?.6:1}}>
              {saving ? 'Submitting…' : 'Submit RFI'}
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

        {/* Loading */}
        {loading && <div style={{padding:40,textAlign:'center' as const,color:DIM}}>Loading RFIs…</div>}

        {/* Empty */}
        {!loading && rfis.length===0 && (
          <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:56,textAlign:'center' as const}}>
            <div style={{fontSize:40,marginBottom:14}}>❓</div>
            <div style={{fontWeight:800,fontSize:16,color:TEXT,marginBottom:8}}>No RFIs yet</div>
            <div style={{fontSize:13,color:DIM,marginBottom:24}}>Create your first Request for Information to track clarifications with the design team.</div>
            <button onClick={()=>setShowForm(true)}
              style={{padding:'10px 24px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:DARK,fontSize:13,fontWeight:800,cursor:'pointer'}}>
              + Create First RFI
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && rfis.length>0 && (
          <>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
                <thead>
                  <tr style={{background:DARK}}>
                    {['RFI #','Subject','Status','Spec Section','Due Date','Actions'].map(h=>(
                      <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`}}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rfis.map((rfi:any)=>{
                    const overdue = rfi.is_overdue;
                    const st = rfiStatusStyle(rfi.status||'open');
                    return (
                      <React.Fragment key={rfi.id}>
                        <tr style={{borderBottom:answeringId===rfi.id?'none':`1px solid rgba(38,51,71,.5)`,background:overdue?'rgba(192,48,48,.06)':'transparent'}}>
                          <td style={{padding:'12px 14px',color:GOLD,fontWeight:800}}>
                            #{rfi.rfi_number}
                            {overdue && <span style={{marginLeft:8,fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:3,background:'rgba(192,48,48,.2)',color:RED,textTransform:'uppercase' as const,letterSpacing:.3}}>Overdue</span>}
                          </td>
                          <td style={{padding:'12px 14px',color:TEXT,maxWidth:280}}>
                            <div style={{fontWeight:600}}>{rfi.subject}</div>
                            {rfi.question && <div style={{fontSize:11,color:DIM,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const,maxWidth:260}}>{rfi.question}</div>}
                          </td>
                          <td style={{padding:'12px 14px'}}>
                            <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:4,background:st.bg,color:st.c,textTransform:'uppercase' as const,letterSpacing:.3}}>
                              {(rfi.status||'open').replace(/_/g,' ')}
                            </span>
                          </td>
                          <td style={{padding:'12px 14px',color:DIM}}>{rfi.spec_section||'—'}</td>
                          <td style={{padding:'12px 14px',color:overdue?RED:DIM}}>
                            {rfi.due_date ? new Date(rfi.due_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}
                          </td>
                          <td style={{padding:'12px 14px'}}>
                            {(rfi.status==='open'||rfi.status==='open') && (
                              <button onClick={()=>{setAnsweringId(answeringId===rfi.id?null:rfi.id);setAnswerText('');}}
                                style={{background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:5,color:DARK,fontSize:11,padding:'4px 12px',fontWeight:800,cursor:'pointer'}}>
                                {answeringId===rfi.id ? 'Cancel' : 'Answer'}
                              </button>
                            )}
                            {rfi.status==='answered' && (
                              <span style={{fontSize:11,color:'#3dd68c',fontWeight:700}}>Answered</span>
                            )}
                          </td>
                        </tr>
                        {/* Inline answer form */}
                        {answeringId===rfi.id && (
                          <tr style={{borderBottom:`1px solid rgba(38,51,71,.5)`,background:'rgba(212,160,23,.04)'}}>
                            <td colSpan={6} style={{padding:'12px 14px 16px 14px'}}>
                              <div style={{marginBottom:8}}>
                                <label style={LBL}>Answer / Response</label>
                                <textarea value={answerText} onChange={e=>setAnswerText(e.target.value)} rows={3}
                                  placeholder="Type your answer…"
                                  style={{...INP,resize:'vertical' as const}}/>
                              </div>
                              <div style={{display:'flex',gap:8}}>
                                <button onClick={()=>submitAnswer(rfi.id)} disabled={submittingAnswer||!answerText.trim()}
                                  style={{padding:'7px 18px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:DARK,fontWeight:800,fontSize:12,cursor:'pointer',opacity:submittingAnswer||!answerText.trim()?.6:1}}>
                                  {submittingAnswer ? 'Saving…' : 'Submit Answer'}
                                </button>
                                <button onClick={()=>{setAnsweringId(null);setAnswerText('');}}
                                  style={{padding:'7px 14px',background:'none',border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:12,cursor:'pointer'}}>
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
