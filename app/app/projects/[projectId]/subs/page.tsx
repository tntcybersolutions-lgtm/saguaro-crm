'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#C8960F',RAISED='#ffffff',BORDER='#E2E5EA',DIM='#6B7280',TEXT='#111827';
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

interface Sub {
  id: string; name: string; trade: string; contact_name: string; contact_email: string;
  contact_phone: string; license_number: string; insurance_expiry: string;
  status: string; contract_amount: number; paid_amount: number; health_score: number;
  created_at: string;
}

function scoreBadge(score: number) {
  const color = score >= 80 ? '#22C55E' : score >= 60 ? '#F59E0B' : '#EF4444';
  return <span style={{fontSize:12,fontWeight:800,color,background:`${color}18`,padding:'3px 10px',borderRadius:6}}>{score}</span>;
}

function statusBadge(s: string) {
  const map: Record<string,{c:string,bg:string}> = {
    active:{c:'#22C55E',bg:'rgba(34,197,94,.12)'}, prequalified:{c:'#60A5FA',bg:'rgba(96,165,250,.12)'},
    invited:{c:GOLD,bg:'rgba(212,160,23,.12)'}, suspended:{c:'#EF4444',bg:'rgba(239,68,68,.12)'},
    inactive:{c:DIM,bg:'rgba(143,163,192,.08)'},
  };
  const st = map[s]||{c:DIM,bg:'rgba(143,163,192,.08)'};
  return <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:4,background:st.bg,color:st.c,textTransform:'uppercase',letterSpacing:'.3px'}}>{s}</span>;
}

export default function SubsPage() {
  const { projectId } = useParams() as { projectId: string };
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{msg:string;type:'success'|'error'}|null>(null);
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [form, setForm] = useState({ name:'', trade:'', contact_name:'', contact_email:'', contact_phone:'', license_number:'', contract_amount:'' });

  useEffect(() => { if(toast) { const t=setTimeout(()=>setToast(null),4000); return ()=>clearTimeout(t); } return undefined; }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/subs/list?projectId=${projectId}`);
      if (!r.ok) throw new Error('Failed to load');
      const d = await r.json();
      setSubs(d.data || d.subs || []);
    } catch { setToast({msg:'Failed to load subcontractors',type:'error'}); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await fetch('/api/subs/create', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ ...form, projectId, contract_amount: parseFloat(form.contract_amount)||0, status:'active' }),
      });
      if (!r.ok) { const b = await r.json(); throw new Error(b.error||'Failed'); }
      setShowForm(false);
      setForm({ name:'', trade:'', contact_name:'', contact_email:'', contact_phone:'', license_number:'', contract_amount:'' });
      setToast({msg:'Subcontractor added',type:'success'});
      load();
    } catch (err: unknown) { setToast({msg:err instanceof Error?err.message:'Failed',type:'error'}); }
  };

  const handleDelete = async (id: string) => {
    setSubs(prev => prev.filter(s => s.id !== id));
    setDeleteId(null);
    try {
      await fetch(`/api/subs/${id}`, { method: 'DELETE' });
      setToast({msg:'Subcontractor removed',type:'success'});
    } catch { setToast({msg:'Removed locally',type:'success'}); }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    setSubs(prev => prev.map(s => s.id === id ? {...s, status} : s));
    try {
      await fetch(`/api/subs/${id}`, { method: 'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status}) });
    } catch { /* optimistic */ }
  };

  const totalContract = subs.reduce((s,sub) => s + (sub.contract_amount||0), 0);
  const totalPaid = subs.reduce((s,sub) => s + (sub.paid_amount||0), 0);
  const avgScore = subs.length > 0 ? Math.round(subs.reduce((s,sub) => s + (sub.health_score||0), 0) / subs.length) : 0;

  return (
    <div>
      {toast && <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',zIndex:99999,padding:'12px 20px',borderRadius:8,background:toast.type==='success'?'rgba(34,197,94,0.9)':'rgba(239,68,68,0.9)',color:'#fff',fontWeight:600,fontSize:14}}>{toast.msg}</div>}

      {/* Header */}
      <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Subcontractors</h2>
          <div style={{fontSize:12,color:DIM,marginTop:3}}>Manage subs, track compliance, monitor health scores</div>
        </div>
        <button onClick={()=>setShowForm(!showForm)} style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>
          {showForm ? 'Cancel' : '+ Add Subcontractor'}
        </button>
      </div>

      <div style={{padding:24}}>
        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
          {[
            {l:'Total Subs',v:String(subs.length)},
            {l:'Total Contract Value',v:fmt(totalContract)},
            {l:'Total Paid',v:fmt(totalPaid)},
            {l:'Avg Health Score',v:String(avgScore)},
          ].map(k=>(
            <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',color:DIM,marginBottom:6}}>{k.l}</div>
              <div style={{fontSize:20,fontWeight:800,color:TEXT}}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* Create Form */}
        {showForm && (
          <form onSubmit={handleCreate} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:20,marginBottom:20}}>
            <div style={{fontSize:14,fontWeight:700,color:TEXT,marginBottom:14}}>New Subcontractor</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
              {[
                {k:'name',l:'Company Name',ph:'ABC Electric LLC',req:true},
                {k:'trade',l:'Trade',ph:'Electrical'},
                {k:'contact_name',l:'Contact Name',ph:'John Smith'},
                {k:'contact_email',l:'Email',ph:'john@abc.com',type:'email'},
                {k:'contact_phone',l:'Phone',ph:'(602) 555-1234',type:'tel'},
                {k:'license_number',l:'License #',ph:'ROC-123456'},
                {k:'contract_amount',l:'Contract Amount',ph:'150000',type:'number'},
              ].map(f=>(
                <div key={f.k}>
                  <label style={{display:'block',fontSize:11,color:DIM,marginBottom:4,fontWeight:600}}>{f.l}{f.req&&<span style={{color:'#EF4444'}}> *</span>}</label>
                  <input required={f.req} type={f.type||'text'} placeholder={f.ph} value={(form as Record<string,string>)[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))}
                    style={{width:'100%',padding:'8px 12px',background:'#ffffff',border:`1px solid ${BORDER}`,borderRadius:6,color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box'}} />
                </div>
              ))}
            </div>
            <div style={{marginTop:14,display:'flex',gap:10}}>
              <button type="submit" style={{padding:'9px 22px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>Add Subcontractor</button>
              <button type="button" onClick={()=>setShowForm(false)} style={{padding:'9px 22px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
            </div>
          </form>
        )}

        {/* Loading */}
        {loading && <div style={{padding:40,textAlign:'center',color:DIM}}>Loading subcontractors…</div>}

        {/* Empty State */}
        {!loading && subs.length === 0 && !showForm && (
          <div style={{background:RAISED,border:`1px dashed ${BORDER}`,borderRadius:12,padding:56,textAlign:'center'}}>
            <div style={{fontSize:48,marginBottom:14}}>🤝</div>
            <div style={{fontWeight:800,fontSize:18,color:TEXT,marginBottom:8}}>No subcontractors yet</div>
            <div style={{fontSize:13,color:DIM,marginBottom:24,maxWidth:400,margin:'0 auto 24px'}}>Add your project subcontractors to track contracts, compliance, insurance, and performance scores.</div>
            <button onClick={()=>setShowForm(true)} style={{padding:'10px 24px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>+ Add First Subcontractor</button>
          </div>
        )}

        {/* Table */}
        {!loading && subs.length > 0 && (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{background:'#ffffff'}}>
                  {['Company','Trade','Contact','Phone','License','Contract','Paid','Score','Status',''].map(h=>(
                    <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subs.map(sub=>(
                  <tr key={sub.id} style={{borderBottom:`1px solid rgba(38,51,71,.5)`}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(212,160,23,.04)')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                    <td style={{padding:'12px 14px'}}>
                      <div style={{color:TEXT,fontWeight:700}}>{sub.name}</div>
                      <div style={{color:DIM,fontSize:11}}>{sub.contact_email}</div>
                    </td>
                    <td style={{padding:'12px 14px',color:GOLD,fontWeight:600}}>{sub.trade||'—'}</td>
                    <td style={{padding:'12px 14px',color:DIM}}>{sub.contact_name||'—'}</td>
                    <td style={{padding:'12px 14px',color:DIM}}>{sub.contact_phone||'—'}</td>
                    <td style={{padding:'12px 14px',color:DIM,fontFamily:'monospace',fontSize:11}}>{sub.license_number||'—'}</td>
                    <td style={{padding:'12px 14px',color:TEXT,fontWeight:600}}>{fmt(sub.contract_amount)}</td>
                    <td style={{padding:'12px 14px',color:'#22C55E',fontWeight:600}}>{fmt(sub.paid_amount)}</td>
                    <td style={{padding:'12px 14px'}}>{scoreBadge(sub.health_score||0)}</td>
                    <td style={{padding:'12px 14px'}}>
                      <select value={sub.status||'active'} onChange={e=>handleUpdateStatus(sub.id,e.target.value)}
                        style={{background:'#ffffff',border:`1px solid ${BORDER}`,borderRadius:5,color:TEXT,fontSize:11,padding:'4px 8px',cursor:'pointer'}}>
                        {['active','prequalified','invited','suspended','inactive'].map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{padding:'12px 14px'}}>
                      {deleteId===sub.id ? (
                        <div style={{display:'flex',gap:4}}>
                          <button onClick={()=>handleDelete(sub.id)} style={{padding:'3px 8px',background:'rgba(239,68,68,.15)',border:'1px solid rgba(239,68,68,.3)',borderRadius:5,color:'#EF4444',fontSize:11,fontWeight:700,cursor:'pointer'}}>Yes</button>
                          <button onClick={()=>setDeleteId(null)} style={{padding:'3px 8px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,cursor:'pointer'}}>No</button>
                        </div>
                      ) : (
                        <button onClick={()=>setDeleteId(sub.id)} style={{background:'none',border:'none',color:'rgba(239,68,68,.6)',cursor:'pointer',fontSize:14}} title="Delete">🗑️</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
