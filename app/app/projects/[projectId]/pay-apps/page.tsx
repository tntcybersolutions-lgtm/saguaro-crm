'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A';
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

function statusBadge(s:string){
  const map:Record<string,{c:string,bg:string}> = {
    draft:      {c:'#94a3b8',bg:'rgba(148,163,184,.14)'},
    submitted:  {c:'#4a9de8',bg:'rgba(74,157,232,.14)'},
    approved:   {c:'#3dd68c',bg:'rgba(26,138,74,.14)'},
    certified:  {c:GOLD,    bg:'rgba(212,160,23,.14)'},
    paid:       {c:'#3dd68c',bg:'rgba(26,138,74,.14)'},
  };
  const st = map[s]||{c:DIM,bg:'rgba(143,163,192,.12)'};
  return (
    <span style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:4,background:st.bg,color:st.c,textTransform:'uppercase' as const,letterSpacing:.3}}>
      {s}
    </span>
  );
}

export default function PayAppsPage() {
  const params = useParams();
  const projectId = params['projectId'] as string;

  const [payApps,setPayApps]   = useState<any[]>([]);
  const [loading,setLoading]   = useState(true);
  const [error,setError]       = useState('');
  const [downloading,setDownloading] = useState<string|null>(null);
  const [toast,setToast] = useState<{msg:string;type:'success'|'error'}|null>(null);

  useEffect(()=>{ const t=toast?setTimeout(()=>setToast(null),4000):null; return ()=>{ if(t) clearTimeout(t); }; },[toast]);

  const load = useCallback(async()=>{
    setLoading(true);
    setError('');
    try{
      const r = await fetch(`/api/pay-apps/list?projectId=${projectId}`);
      if(!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setPayApps((d.payApps??[]).sort((a:any,b:any)=>(b.app_number||0)-(a.app_number||0)));
    }catch(e:any){
      setError(e.message||'Failed to load pay applications');
    }finally{
      setLoading(false);
    }
  },[projectId]);

  useEffect(()=>{ load(); },[load]);

  async function downloadG702(pa:any){
    setDownloading(pa.id);
    try{
      const r = await fetch('/api/documents/pay-application',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({payAppId:pa.id,projectId}),
      });
      const d = await r.json();
      const url = d.g702Url || d.url || d.pdfUrl;
      if(url) {
        window.open(url,'_blank');
        if(d.g703Url) window.open(d.g703Url,'_blank');
      } else setToast({msg:d.error||'PDF generation failed — check Documents section.',type:d.error?'error':'success'});
    }catch{
      setToast({msg:'Failed to generate PDF.',type:'error'});
    }finally{
      setDownloading(null);
    }
  }

  const totalCertified = payApps.filter(p=>p.status==='approved'||p.status==='certified'||p.status==='paid').reduce((s:number,p:any)=>s+(p.current_payment_due||0),0);
  const retainageHeld  = payApps.reduce((s:number,p:any)=>s+(p.retainage_amount||0),0);

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
          <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Pay Applications</h2>
          <div style={{fontSize:12,color:DIM,marginTop:3}}>AIA G702/G703 — Application and Certificate for Payment</div>
        </div>
        <Link
          href={`/app/projects/${projectId}/pay-apps/new`}
          style={{padding:'9px 20px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,textDecoration:'none'}}
        >
          + New Pay Application
        </Link>
      </div>

      <div style={{padding:24}}>
        {/* Error */}
        {error && (
          <div style={{background:'rgba(192,48,48,.12)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:8,padding:'12px 16px',marginBottom:20,color:RED,fontSize:13}}>
            {error}
          </div>
        )}

        {/* KPI Row */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
          {[
            {l:'Total Apps',v:String(payApps.length)},
            {l:'Total Certified',v:fmt(totalCertified)},
            {l:'Retainage Held',v:fmt(retainageHeld)},
            {l:'Pending Approval',v:String(payApps.filter((p:any)=>p.status==='submitted').length)},
          ].map(k=>(
            <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>{k.l}</div>
              <div style={{fontSize:20,fontWeight:800,color:TEXT}}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{padding:40,textAlign:'center',color:DIM}}>Loading pay applications…</div>
        )}

        {/* Empty */}
        {!loading && payApps.length===0 && (
          <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:56,textAlign:'center'}}>
            <div style={{fontSize:40,marginBottom:14}}>📋</div>
            <div style={{fontWeight:800,fontSize:16,color:TEXT,marginBottom:8}}>No pay applications yet</div>
            <div style={{fontSize:13,color:DIM,marginBottom:24}}>Create your first AIA G702/G703 pay application to bill the owner.</div>
            <Link
              href={`/app/projects/${projectId}/pay-apps/new`}
              style={{padding:'10px 24px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,textDecoration:'none'}}
            >
              + Create First Pay Application
            </Link>
          </div>
        )}

        {/* Table */}
        {!loading && payApps.length>0 && (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
              <thead>
                <tr style={{background:DARK}}>
                  {['App #','Period From','Period To','Status','Contract Sum','This Period','Retainage','Payment Due','G702 PDF'].map(h=>(
                    <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payApps.map((pa:any)=>(
                  <tr key={pa.id} style={{borderBottom:`1px solid rgba(38,51,71,.5)`}}>
                    <td style={{padding:'12px 14px',color:GOLD,fontWeight:800}}>#{pa.app_number}</td>
                    <td style={{padding:'12px 14px',color:DIM}}>
                      {pa.period_from ? new Date(pa.period_from+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}
                    </td>
                    <td style={{padding:'12px 14px',color:DIM}}>
                      {pa.period_to ? new Date(pa.period_to+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}
                    </td>
                    <td style={{padding:'12px 14px'}}>{statusBadge(pa.status||'draft')}</td>
                    <td style={{padding:'12px 14px',color:TEXT}}>{fmt(pa.contract_sum||0)}</td>
                    <td style={{padding:'12px 14px',color:TEXT}}>{fmt(pa.this_period||0)}</td>
                    <td style={{padding:'12px 14px',color:ORANGE}}>{fmt(pa.retainage_amount||0)}</td>
                    <td style={{padding:'12px 14px',color:TEXT,fontWeight:700}}>{fmt(pa.current_payment_due||0)}</td>
                    <td style={{padding:'12px 14px'}}>
                      <button
                        onClick={()=>downloadG702(pa)}
                        disabled={downloading===pa.id}
                        style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:GOLD,fontSize:11,padding:'4px 10px',cursor:'pointer',opacity:downloading===pa.id?.5:1}}
                      >
                        {downloading===pa.id ? '…' : '📄 Download'}
                      </button>
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
