'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A';
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

const INP:React.CSSProperties = {padding:'8px 12px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',width:'100%',boxSizing:'border-box'};
const LBL:React.CSSProperties = {display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase',letterSpacing:.5,marginBottom:6};

const POLICY_TYPES = ['GL','WC','Auto','Umbrella','E&O','Professional Liability','Other'];

function daysUntilExpiry(expiryDate:string):number{
  if(!expiryDate) return 9999;
  return Math.round((new Date(expiryDate+'T12:00:00').getTime()-Date.now())/86400000);
}

function certStatus(expiryDate:string):{label:string,c:string,bg:string}{
  const days = daysUntilExpiry(expiryDate);
  if(days<0)   return {label:'Expired',        c:RED,        bg:'rgba(192,48,48,.14)'};
  if(days<30)  return {label:`Exp. in ${days}d`,c:'#f59e0b', bg:'rgba(245,158,11,.14)'};
  return {label:'Active',c:'#3dd68c',bg:'rgba(26,138,74,.14)'};
}

export default function InsurancePage() {
  const params    = useParams();
  const projectId = params['projectId'] as string;

  const [certs,setCerts]       = useState<any[]>([]);
  const [loading,setLoading]   = useState(true);
  const [error,setError]       = useState('');
  const [showForm,setShowForm] = useState(false);
  const [saving,setSaving]     = useState(false);
  const [renewingId,setRenewingId] = useState<string|null>(null);
  const [toast,setToast] = useState<{msg:string;type:'success'|'error'}|null>(null);

  useEffect(()=>{ const t=toast?setTimeout(()=>setToast(null),4000):null; return ()=>{ if(t) clearTimeout(t); }; },[toast]);

  // Form
  const [fSub,setFSub]         = useState('');
  const [fType,setFType]       = useState('GL');
  const [fCarrier,setFCarrier] = useState('');
  const [fPolicy,setFPolicy]   = useState('');
  const [fEff,setFEff]         = useState('');
  const [fExp,setFExp]         = useState('');
  const [fAmt,setFAmt]         = useState('');

  const load = useCallback(async()=>{
    setLoading(true); setError('');
    try{
      const r = await fetch(`/api/insurance/${projectId}`);
      if(!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setCerts(d.certs||d.certificates||d.data||[]);
    }catch(e:any){
      setError(e.message||'Failed to load insurance certificates');
      setCerts([]);
    }finally{
      setLoading(false);
    }
  },[projectId]);

  useEffect(()=>{ load(); },[load]);

  async function addCert(){
    if(!fSub.trim()||!fCarrier.trim()||!fPolicy.trim()||!fEff||!fExp){ setError('All fields except coverage amount are required'); return; }
    setSaving(true); setError('');
    try{
      const r = await fetch('/api/insurance/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        projectId,subName:fSub,policyType:fType,carrier:fCarrier,policyNo:fPolicy,
        effectiveDate:fEff,expiryDate:fExp,coverageAmount:parseFloat(fAmt)||0,
      })});
      const d = await r.json();
      if(d.error) throw new Error(d.error);
      setFSub(''); setFType('GL'); setFCarrier(''); setFPolicy(''); setFEff(''); setFExp(''); setFAmt('');
      setShowForm(false);
      await load();
    }catch(e:any){
      setError(e.message||'Failed to add certificate');
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
      setToast({msg:`Renewal request sent to ${subName}`,type:'success'});
    }catch(e:any){
      setToast({msg:e.message||'Failed to send renewal request',type:'error'});
    }finally{
      setRenewingId(null);
    }
  }

  const totalCount    = certs.length;
  const activeCount   = certs.filter(c=>daysUntilExpiry(c.expiry_date||c.expiryDate)>=30).length;
  const expiringCount = certs.filter(c=>{ const d=daysUntilExpiry(c.expiry_date||c.expiryDate); return d>=0&&d<30; }).length;
  const expiredCount  = certs.filter(c=>daysUntilExpiry(c.expiry_date||c.expiryDate)<0).length;

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
          <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Insurance Certificates</h2>
          <div style={{fontSize:12,color:DIM,marginTop:3}}>COIs for all subcontractors — expiration alerts included</div>
        </div>
        <button onClick={()=>setShowForm(!showForm)}
          style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:DARK,fontSize:13,fontWeight:800,cursor:'pointer'}}>
          {showForm ? '× Cancel' : '+ Add Certificate'}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div style={{margin:'20px 24px',background:RAISED,border:`1px solid rgba(212,160,23,.3)`,borderRadius:12,padding:24}}>
          <div style={{fontWeight:800,fontSize:15,color:TEXT,marginBottom:18,paddingBottom:12,borderBottom:`1px solid ${BORDER}`}}>Add Insurance Certificate</div>
          {error && (
            <div style={{background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:8,padding:'10px 14px',marginBottom:16,color:RED,fontSize:13}}>
              {error}
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14}}>
            <div style={{gridColumn:'1/-1'}}>
              <label style={LBL}>Subcontractor Name *</label>
              <input value={fSub} onChange={e=>setFSub(e.target.value)} placeholder="Desert Electrical Contractors" style={INP}/>
            </div>
            <div>
              <label style={LBL}>Policy Type *</label>
              <select value={fType} onChange={e=>setFType(e.target.value)} style={INP}>
                {POLICY_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Carrier *</label>
              <input value={fCarrier} onChange={e=>setFCarrier(e.target.value)} placeholder="Travelers Insurance" style={INP}/>
            </div>
            <div>
              <label style={LBL}>Policy Number *</label>
              <input value={fPolicy} onChange={e=>setFPolicy(e.target.value)} placeholder="GL-2026-84721" style={INP}/>
            </div>
            <div>
              <label style={LBL}>Effective Date *</label>
              <SaguaroDatePicker value={fEff} onChange={setFEff} style={INP}/>
            </div>
            <div>
              <label style={LBL}>Expiry Date *</label>
              <SaguaroDatePicker value={fExp} onChange={setFExp} style={INP}/>
            </div>
            <div>
              <label style={LBL}>Coverage Amount ($)</label>
              <input type="number" value={fAmt} onChange={e=>setFAmt(e.target.value)} placeholder="2000000" min="0" style={INP}/>
            </div>
          </div>
          <div style={{display:'flex',gap:10}}>
            <button onClick={addCert} disabled={saving}
              style={{padding:'9px 22px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:DARK,fontWeight:800,fontSize:13,cursor:saving?'wait':'pointer',opacity:saving?.6:1}}>
              {saving ? 'Adding…' : 'Add Certificate'}
            </button>
            <button onClick={()=>{setShowForm(false);setError('');}}
              style={{padding:'9px 18px',background:'none',border:`1px solid ${BORDER}`,borderRadius:8,color:DIM,fontSize:13,cursor:'pointer'}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{padding:24}}>
        {/* Error (outside form) */}
        {error && !showForm && (
          <div style={{background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:8,padding:'12px 16px',marginBottom:20,color:RED,fontSize:13}}>
            {error}
          </div>
        )}

        {/* KPI Cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
          {[
            {l:'Total',v:totalCount,c:TEXT},
            {l:'Active',v:activeCount,c:'#3dd68c'},
            {l:'Expiring Soon',v:expiringCount,c:'#f59e0b'},
            {l:'Expired',v:expiredCount,c:RED},
          ].map(k=>(
            <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>{k.l}</div>
              <div style={{fontSize:26,fontWeight:800,color:k.c}}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* Loading */}
        {loading && <div style={{padding:40,textAlign:'center' as const,color:DIM}}>Loading certificates…</div>}

        {/* Empty */}
        {!loading && certs.length===0 && (
          <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:56,textAlign:'center' as const}}>
            <div style={{fontSize:40,marginBottom:14}}>🛡️</div>
            <div style={{fontWeight:800,fontSize:16,color:TEXT,marginBottom:8}}>No certificates yet</div>
            <div style={{fontSize:13,color:DIM,marginBottom:24}}>Upload COIs for all subcontractors to track expiration dates and maintain compliance.</div>
            <button onClick={()=>setShowForm(true)}
              style={{padding:'10px 24px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:DARK,fontSize:13,fontWeight:800,cursor:'pointer'}}>
              + Add First Certificate
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && certs.length>0 && (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
              <thead>
                <tr style={{background:DARK}}>
                  {['Sub Name','Policy Type','Carrier','Policy #','Coverage','Expiry Date','Status','Actions'].map(h=>(
                    <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`,whiteSpace:'nowrap' as const}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {certs.map((c:any,idx:number)=>{
                  const expDate  = c.expiry_date||c.expiryDate||'';
                  const days     = daysUntilExpiry(expDate);
                  const st       = certStatus(expDate);
                  const expired  = days<0;
                  const expiring = days>=0&&days<30;
                  const rowBg    = expired?'rgba(192,48,48,.06)':expiring?'rgba(245,158,11,.04)':'transparent';
                  const cid      = c.id||String(idx);
                  return (
                    <tr key={cid} style={{borderBottom:`1px solid rgba(38,51,71,.5)`,background:rowBg}}>
                      <td style={{padding:'11px 14px',color:TEXT,fontWeight:600}}>{c.sub_name||c.subName||c.vendor_name||'—'}</td>
                      <td style={{padding:'11px 14px'}}>
                        <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:'rgba(212,160,23,.12)',color:GOLD,textTransform:'uppercase' as const}}>
                          {c.policy_type||c.policyType||'—'}
                        </span>
                      </td>
                      <td style={{padding:'11px 14px',color:DIM}}>{c.carrier||'—'}</td>
                      <td style={{padding:'11px 14px',color:DIM,fontFamily:'monospace',fontSize:12}}>{c.policy_number||c.policyNo||'—'}</td>
                      <td style={{padding:'11px 14px',color:TEXT}}>{c.coverage_amount||c.coverageAmount ? fmt(Number(c.coverage_amount||c.coverageAmount||0)) : '—'}</td>
                      <td style={{padding:'11px 14px',color:expired?RED:expiring?'#f59e0b':DIM,fontWeight:expired||expiring?700:400}}>
                        {expDate ? new Date(expDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}
                        {expiring && !expired && <span style={{marginLeft:6,fontSize:10,color:'#f59e0b'}}>({days}d)</span>}
                        {expired && <span style={{marginLeft:6,fontSize:10,color:RED}}>(expired)</span>}
                      </td>
                      <td style={{padding:'11px 14px'}}>
                        <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:4,background:st.bg,color:st.c,textTransform:'uppercase' as const,letterSpacing:.3}}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{padding:'11px 14px'}}>
                        {(expired||expiring) && (
                          <button onClick={()=>requestRenewal(cid,c.sub_name||c.subName||'')} disabled={renewingId===cid}
                            style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:GOLD,fontSize:11,padding:'4px 10px',cursor:renewingId===cid?'wait':'pointer',opacity:renewingId===cid?.5:1}}>
                            {renewingId===cid ? '…' : 'Request Renewal'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
