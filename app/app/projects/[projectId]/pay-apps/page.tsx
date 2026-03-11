'use client';
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getAuthHeaders, getTenantId } from '../../../../../lib/supabase-browser';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',RED='#c03030';
const fmt = (n: number) => '$' + n.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2});

function Badge({label,color='#94a3b8',bg='rgba(148,163,184,.12)'}:{label:string,color?:string,bg?:string}){
  return <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:bg,color,textTransform:'uppercase' as const,letterSpacing:.3}}>{label}</span>;
}

interface PayApp {
  id: string;
  application_number: number;
  period_from: string;
  period_to: string;
  contract_sum: number;
  net_change_orders: number;
  total_completed_and_stored: number;
  retainage_pct: number;
  retainage_held: number;
  total_previous_payments: number;
  current_payment_due: number;
  status: string;
  submitted_at: string | null;
  paid_at: string | null;
}

export default function PayAppsPage() {
  const params = useParams();
  const pid = params['projectId'] as string;

  const [payApps, setPayApps] = useState<PayApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creating2, setCreating2] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string|null>(null);
  const [submittingId, setSubmittingId] = useState<string|null>(null);
  const [error, setError] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [thisPeriod, setThisPeriod] = useState('');

  useEffect(() => {
    loadPayApps();
  }, [pid]);

  async function loadPayApps() {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const r = await fetch(`/api/pay-apps/list?projectId=${pid}`, { headers });
      const d = await r.json();
      setPayApps(d.payApps ?? []);
    } catch {
      // keep empty
    } finally {
      setLoading(false);
    }
  }

  async function createPayApp() {
    setCreating2(true); setError('');
    try {
      const tenantId = await getTenantId();
      const headers = await getAuthHeaders();
      const r = await fetch('/api/pay-apps/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          tenantId,
          projectId: pid,
          periodFrom: periodFrom || undefined,
          periodTo: periodTo || undefined,
          thisPeriod: Number(thisPeriod) || 0,
        }),
      });
      const d = await r.json();
      if (d.error) {
        setError(d.error);
      } else {
        setCreating(false);
        await loadPayApps();
        if (d.g702PdfUrl) window.open(d.g702PdfUrl, '_blank');
      }
    } catch (e) {
      setError('Failed to create pay application. Please try again.');
    } finally {
      setCreating2(false);
    }
  }

  async function submitPayApp(paId: string) {
    setSubmittingId(paId);
    try {
      const tenantId = await getTenantId();
      const headers = await getAuthHeaders();
      const r = await fetch(`/api/pay-apps/${paId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ tenantId, requireAllWaivers: false }),
      });
      const d = await r.json();
      if (d.error) alert(d.error);
      else {
        alert(d.ownerEmailed ? 'Submitted to owner! Approval email sent.' : 'Submitted to owner!');
        await loadPayApps();
      }
    } catch {
      alert('Submit failed. Please try again.');
    } finally {
      setSubmittingId(null);
    }
  }

  async function downloadG702(paId: string, paNum: number) {
    setDownloadingId(paId);
    try {
      const tenantId = await getTenantId();
      const headers = await getAuthHeaders();
      const r = await fetch('/api/documents/pay-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ payAppId: paId, projectId: pid, tenantId }),
      });
      const d = await r.json();
      const url = d.url || d.pdfUrl || d.g702PdfUrl;
      if (url) window.open(url, '_blank');
      else alert(`G702 for Pay App #${paNum} queued. Check Documents section.`);
    } catch {
      alert(`Download error. Check Documents section.`);
    } finally {
      setDownloadingId(null); }
  }

  const totalCertified = payApps.filter(p => p.status === 'approved' || p.status === 'paid')
    .reduce((s, p) => s + (p.current_payment_due ?? 0), 0);
  const totalRetainage = payApps.reduce((s, p) => s + (p.retainage_held ?? 0), 0);

  return (
    <div>
      <div style={{padding:'18px 24px',borderBottom:`1px solid ${BORDER}`,display:'flex',alignItems:'center',justifyContent:'space-between',background:DARK,flexWrap:'wrap',gap:12}}>
        <div>
          <h2 style={{margin:0,fontSize:20,fontWeight:800,color:TEXT}}>Pay Applications</h2>
          <div style={{fontSize:12,color:DIM,marginTop:3}}>AIA G702/G703 — Application and Certificate for Payment</div>
        </div>
        <button
          onClick={() => setCreating(!creating)}
          style={{padding:'8px 16px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}
        >
          + New Pay Application
        </button>
      </div>

      {creating && (
        <div style={{margin:24,background:RAISED,border:`1px solid rgba(212,160,23,.3)`,borderRadius:10,padding:24}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:4,color:TEXT}}>Create Pay Application #{(payApps.length + 1)}</div>
          <div style={{fontSize:12,color:DIM,marginBottom:16}}>AI will auto-generate the G702 and G703 PDFs from your budget data</div>
          {error && (
            <div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13,color:RED}}>
              {error}
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:16}}>
            {[
              {l:'Period From',v:periodFrom,setter:setPeriodFrom,type:'date'},
              {l:'Period To',v:periodTo,setter:setPeriodTo,type:'date'},
              {l:'This Period ($)',v:thisPeriod,setter:setThisPeriod,type:'number'},
            ].map(f => (
              <div key={f.l}>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>{f.l}</label>
                <input
                  type={f.type}
                  value={f.v}
                  onChange={e => f.setter(e.target.value)}
                  style={{width:'100%',padding:'8px 12px',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box' as const}}
                />
              </div>
            ))}
          </div>
          <div style={{background:'rgba(212,160,23,.06)',border:'1px solid rgba(212,160,23,.2)',borderRadius:8,padding:'12px 16px',marginBottom:16,fontSize:12,color:DIM}}>
            🤖 AI auto-populates the Schedule of Values from your budget and generates G702 + G703 PDFs automatically.
          </div>
          <div style={{display:'flex',gap:10}}>
            <button
              onClick={createPayApp}
              disabled={creating2}
              style={{padding:'9px 20px',background:creating2?'rgba(212,160,23,.5)':`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:7,color:'#0d1117',fontSize:13,fontWeight:800,cursor:creating2?'wait':'pointer'}}
            >
              {creating2 ? 'Creating…' : 'Create Pay App + Generate PDFs'}
            </button>
            <button onClick={() => {setCreating(false); setError('');}} style={{padding:'9px 20px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{padding:24}}>
        {/* KPI Row */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24}}>
          {[
            {l:'Total Applications',v:String(payApps.length)},
            {l:'Total Certified',v:fmt(totalCertified)},
            {l:'Retainage Held',v:fmt(totalRetainage)},
            {l:'Pending Approval',v:String(payApps.filter(p=>p.status==='submitted').length)},
          ].map(k => (
            <div key={k.l} style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px'}}>
              <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>{k.l}</div>
              <div style={{fontSize:20,fontWeight:800,color:TEXT}}>{k.v}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{padding:40,textAlign:'center',color:DIM}}>Loading pay applications…</div>
        ) : payApps.length === 0 ? (
          <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:40,textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:12}}>📋</div>
            <div style={{fontWeight:700,fontSize:15,color:TEXT,marginBottom:8}}>No pay applications yet</div>
            <div style={{fontSize:13,color:DIM,marginBottom:20}}>Create your first AIA G702/G703 pay application to get started</div>
            <button onClick={() => setCreating(true)} style={{padding:'10px 22px',background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:8,color:'#0d1117',fontSize:13,fontWeight:800,cursor:'pointer'}}>
              + Create First Pay Application
            </button>
          </div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
              <thead>
                <tr style={{background:'#0a1117'}}>
                  {['App #','Period','Contract Sum','This Period','Total Complete','Retainage','Net Due','Status','PDF','Actions'].map(h => (
                    <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,fontSize:11,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:.5,color:DIM,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payApps.map((pa, idx) => {
                  const prevTotal = payApps[idx + 1]?.total_completed_and_stored ?? 0;
                  const thisPeriodAmt = (pa.total_completed_and_stored ?? 0) - prevTotal;
                  return (
                    <tr key={pa.id} style={{borderBottom:`1px solid rgba(38,51,71,.5)`}}>
                      <td style={{padding:'12px 14px',color:GOLD,fontWeight:700}}>#{pa.application_number}</td>
                      <td style={{padding:'12px 14px',color:DIM}}>{pa.period_from} — {pa.period_to}</td>
                      <td style={{padding:'12px 14px',color:TEXT}}>{fmt(pa.contract_sum ?? 0)}</td>
                      <td style={{padding:'12px 14px',color:TEXT}}>{fmt(thisPeriodAmt)}</td>
                      <td style={{padding:'12px 14px',color:TEXT}}>{fmt(pa.total_completed_and_stored ?? 0)}</td>
                      <td style={{padding:'12px 14px',color:'#f97316'}}>{fmt(pa.retainage_held ?? 0)}</td>
                      <td style={{padding:'12px 14px',color:TEXT,fontWeight:700}}>{fmt(pa.current_payment_due ?? 0)}</td>
                      <td style={{padding:'12px 14px'}}>
                        <Badge
                          label={pa.status}
                          color={pa.status==='paid'?'#3dd68c':pa.status==='approved'?'#4a9de8':GOLD}
                          bg={pa.status==='paid'?'rgba(26,138,74,.12)':pa.status==='approved'?'rgba(26,95,168,.12)':'rgba(212,160,23,.12)'}
                        />
                      </td>
                      <td style={{padding:'12px 14px'}}>
                        <button
                          onClick={() => downloadG702(pa.id, pa.application_number)}
                          disabled={downloadingId === pa.id}
                          style={{background:'none',border:`1px solid ${BORDER}`,borderRadius:5,color:GOLD,fontSize:11,padding:'3px 8px',cursor:'pointer',opacity:downloadingId===pa.id?0.5:1}}
                        >
                          {downloadingId === pa.id ? '…' : '📄 G702'}
                        </button>
                      </td>
                      <td style={{padding:'12px 14px'}}>
                        {pa.status === 'draft' && (
                          <button
                            onClick={() => submitPayApp(pa.id)}
                            disabled={submittingId === pa.id}
                            style={{background:`linear-gradient(135deg,${GOLD},#F0C040)`,border:'none',borderRadius:5,color:'#0d1117',fontSize:11,padding:'4px 10px',fontWeight:700,cursor:'pointer',opacity:submittingId===pa.id?0.5:1}}
                          >
                            {submittingId === pa.id ? '…' : 'Submit to Owner'}
                          </button>
                        )}
                        {pa.status === 'approved' && (
                          <span style={{fontSize:11,color:'#4a9de8',fontWeight:700}}>Awaiting Payment</span>
                        )}
                        {pa.status === 'paid' && (
                          <span style={{fontSize:11,color:'#3dd68c',fontWeight:700}}>Paid {pa.paid_at ? new Date(pa.paid_at).toLocaleDateString() : ''}</span>
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
