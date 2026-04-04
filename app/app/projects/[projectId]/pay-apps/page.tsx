'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import DragHandle, { useDragReorder } from '../../../../../components/DragHandle';

const GOLD='#C8960F',DARK='#F8F9FB',RAISED='#ffffff',BORDER='#E2E5EA',DIM='#6B7280',TEXT='#111827',GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A';
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
  const router = useRouter();

  const [payApps,setPayApps]   = useState<any[]>([]);
  const [loading,setLoading]   = useState(true);
  const [error,setError]       = useState('');
  const [downloading,setDownloading] = useState<string|null>(null);
  const [toast,setToast] = useState<{msg:string;type:'success'|'error'}|null>(null);
  const [menuId, setMenuId] = useState<string|null>(null);
  const [editId, setEditId] = useState<string|null>(null);
  const [editVal, setEditVal] = useState('');
  const [copiedId, setCopiedId] = useState<string|null>(null);
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

  const { dragHandlers, draggingIndex } = useDragReorder(payApps, (reordered) => {
    setPayApps(reordered);
    // Persist new order to DB
    reordered.forEach((pa: any, idx: number) => {
      fetch(`/api/pay-apps/${pa.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: idx }),
      }).catch(() => {});
    });
  });

  const toggleBulk = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkApprove = async () => {
    for (const id of bulkSelected) {
      await fetch(`/api/pay-apps/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      }).catch(() => {});
    }
    setPayApps(prev => prev.map(p => bulkSelected.has(p.id) ? { ...p, status: 'approved' } : p));
    setBulkSelected(new Set());
    setToast({ msg: `${bulkSelected.size} pay app(s) approved`, type: 'success' });
  };

  const handleBulkExport = async () => {
    for (const id of bulkSelected) {
      const pa = payApps.find((p: any) => p.id === id);
      if (pa) await downloadG702(pa);
    }
    setBulkSelected(new Set());
  };

  useEffect(()=>{ const t=toast?setTimeout(()=>setToast(null),4000):null; return ()=>{ if(t) clearTimeout(t); }; },[toast]);

  const load = useCallback(async()=>{
    setLoading(true);
    setError('');
    try{
      const r = await fetch(`/api/pay-apps/list?projectId=${projectId}`);
      if(!r.ok) throw new Error(await r.text());
      const d = await r.json();
      setPayApps((d.payApps??[]).sort((a:any,b:any)=>(b.application_number||0)-(a.application_number||0)));
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

  function openPayMenu(id: string) { setMenuId(id); setEditId(null); setDeleteId(null); }

  async function handleEditPayAmt(id: string) {
    const amount = parseFloat(editVal);
    if (isNaN(amount) || amount < 0) return;
    setPayApps(prev => prev.map(p => p.id === id ? { ...p, current_payment_due: amount } : p));
    setEditId(null);
    try { await fetch(`/api/pay-apps/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_payment_due: amount }) }); setToast({ msg: 'Amount updated', type: 'success' }); } catch { setToast({ msg: 'Updated locally', type: 'success' }); }
  }

  function handleCopyPay(id: string, amount: number) {
    navigator.clipboard.writeText(fmt(amount)).catch(() => {});
    setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
    setMenuId(null);
  }

  async function handleDeletePayApp(id: string) {
    setPayApps(prev => prev.filter(p => p.id !== id));
    setDeleteId(null);
    try { await fetch(`/api/pay-apps/${id}`, { method: 'DELETE' }); setToast({ msg: 'Pay app deleted', type: 'success' }); } catch { setToast({ msg: 'Deleted locally', type: 'success' }); }
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
            {/* Bulk action bar */}
            {bulkSelected.size > 0 && (
              <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',background:'rgba(212,160,23,0.08)',border:`1px solid rgba(212,160,23,0.2)`,borderRadius:8,marginBottom:12}}>
                <span style={{color:GOLD,fontWeight:700,fontSize:13}}>{bulkSelected.size} selected</span>
                <button onClick={handleBulkApprove} style={{padding:'6px 14px',background:'rgba(34,197,94,0.15)',border:'1px solid rgba(34,197,94,0.3)',borderRadius:6,color:'#22C55E',fontSize:12,fontWeight:700,cursor:'pointer'}}>✓ Approve All</button>
                <button onClick={handleBulkExport} style={{padding:'6px 14px',background:'rgba(212,160,23,0.15)',border:`1px solid rgba(212,160,23,0.3)`,borderRadius:6,color:GOLD,fontSize:12,fontWeight:700,cursor:'pointer'}}>📄 Export All PDFs</button>
                <button onClick={()=>setBulkSelected(new Set())} style={{padding:'6px 14px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:6,color:DIM,fontSize:12,cursor:'pointer'}}>Clear</button>
              </div>
            )}
            <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
              <thead>
                <tr style={{background:DARK}}>
                  <th style={{padding:'10px 8px',width:28,borderBottom:`1px solid ${BORDER}`}}/>
                  <th style={{padding:'10px 8px',width:28,borderBottom:`1px solid ${BORDER}`}}>
                    <input type="checkbox" checked={bulkSelected.size === payApps.length && payApps.length > 0} onChange={() => { if (bulkSelected.size === payApps.length) setBulkSelected(new Set()); else setBulkSelected(new Set(payApps.map((p:any) => p.id))); }} style={{accentColor:GOLD,cursor:'pointer'}} />
                  </th>
                  {['App #','Period From','Period To','Status','Contract Sum','This Period','Retainage','Payment Due','G702 PDF'].map(h=>(
                    <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`}}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payApps.map((pa:any,idx:number)=>{
                  const handlers = dragHandlers(idx);
                  return (
                  <tr
                    key={pa.id}
                    onClick={()=>router.push(`/app/projects/${projectId}/pay-apps/${pa.id}`)}
                    style={{borderBottom:`1px solid rgba(38,51,71,.5)`,cursor:'pointer',transition:'background .15s',opacity:draggingIndex===idx?0.5:1}}
                    onMouseEnter={e=>(e.currentTarget.style.background='rgba(212,160,23,.06)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='')}
                    {...handlers}
                  >
                    <td style={{padding:'4px 4px'}} onClick={e=>e.stopPropagation()}>
                      <DragHandle {...handlers} index={idx} isDragging={draggingIndex===idx} />
                    </td>
                    <td style={{padding:'4px 8px'}} onClick={e=>e.stopPropagation()}>
                      <input type="checkbox" checked={bulkSelected.has(pa.id)} onChange={()=>toggleBulk(pa.id)} style={{accentColor:GOLD,cursor:'pointer'}} />
                    </td>
                    <td style={{padding:'12px 14px',color:GOLD,fontWeight:800}}>#{pa.application_number}</td>
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
                    <td style={{padding:'12px 14px',position:'relative' as const}} onClick={e=>e.stopPropagation()}>
                      {deleteId===pa.id ? (
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <span style={{fontSize:11,color:RED,fontWeight:600}}>Delete?</span>
                          <button onClick={()=>handleDeletePayApp(pa.id)} style={{padding:'3px 8px',background:'rgba(192,48,48,.15)',border:'1px solid rgba(192,48,48,.3)',borderRadius:5,color:RED,fontSize:11,fontWeight:700,cursor:'pointer'}}>Yes</button>
                          <button onClick={()=>setDeleteId(null)} style={{padding:'3px 8px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,cursor:'pointer'}}>Cancel</button>
                        </div>
                      ) : editId===pa.id ? (
                        <div style={{display:'flex',alignItems:'center',gap:4}}>
                          <input value={editVal} onChange={e=>setEditVal(e.target.value)} type="number" autoFocus onKeyDown={e=>{if(e.key==='Enter')handleEditPayAmt(pa.id);if(e.key==='Escape')setEditId(null);}} style={{width:100,padding:'4px 8px',background:DARK,border:`1px solid ${GOLD}`,borderRadius:5,color:TEXT,fontSize:12,outline:'none',textAlign:'right' as const}}/>
                          <button onClick={()=>handleEditPayAmt(pa.id)} style={{padding:'3px 8px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:5,color:'#0d1117',fontSize:11,fontWeight:700,cursor:'pointer'}}>Save</button>
                          <button onClick={()=>setEditId(null)} style={{padding:'3px 8px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,cursor:'pointer'}}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{display:'flex',alignItems:'center',gap:4}}>
                          <span style={{color:TEXT,fontWeight:700}}>{fmt(pa.current_payment_due||0)}</span>
                          {copiedId===pa.id&&<span style={{fontSize:10,color:'#3dd68c',fontWeight:600}}>Copied!</span>}
                          <button onClick={()=>openPayMenu(pa.id)} style={{background:'none',border:'none',color:DIM,cursor:'pointer',fontSize:10,padding:'2px 4px',lineHeight:1,opacity:0.6}} onMouseEnter={e=>(e.currentTarget.style.opacity='1')} onMouseLeave={e=>(e.currentTarget.style.opacity='0.6')}>&#9662;</button>
                          {menuId===pa.id&&(
                            <div style={{position:'absolute',top:36,right:14,background:RAISED,border:`1px solid ${BORDER}`,borderRadius:8,padding:4,zIndex:100,minWidth:150,boxShadow:'0 8px 24px rgba(0,0,0,.4)'}}>
                              {[
                                {label:'Edit Amount',icon:'\u270F\uFE0F',action:()=>{setMenuId(null);setEditId(pa.id);setEditVal(String(pa.current_payment_due||0));}},
                                {label:'Copy Amount',icon:'\uD83D\uDCCB',action:()=>handleCopyPay(pa.id,pa.current_payment_due||0)},
                              ].map(item=>(
                                <div key={item.label} onClick={item.action} style={{padding:'7px 12px',fontSize:12,color:TEXT,cursor:'pointer',borderRadius:6,display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>(e.currentTarget.style.background=DARK)} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                                  <span style={{fontSize:14}}>{item.icon}</span>{item.label}
                                </div>
                              ))}
                              <div style={{height:1,background:BORDER,margin:'4px 0'}}/>
                              <div onClick={()=>{setMenuId(null);setDeleteId(pa.id);}} style={{padding:'7px 12px',fontSize:12,color:RED,cursor:'pointer',borderRadius:6,display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(192,48,48,.08)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                                <span style={{fontSize:14}}>{'\uD83D\uDDD1\uFE0F'}</span>Delete Pay App
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
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
                  );
                })}
              </tbody>
              {menuId&&<div style={{position:'fixed',inset:0,zIndex:50}} onClick={()=>setMenuId(null)}/>}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
