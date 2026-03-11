'use client';
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030';
const fmt=(n:number)=>'$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));

export default function OwnerApprovalPortal() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<'approved'|'rejected'|null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    fetch('/api/owner-portal/approve/' + token)
      .then(r => r.json())
      .then(d => { setData(d); if (d.payApp?.status==='certified'||d.payApp?.status==='approved') setAction('approved'); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAction(act: 'approved'|'rejected') {
    setSaving(true);
    try {
      const res = await fetch('/api/owner-portal/approve/' + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act, note }),
      });
      const d = await res.json();
      if (d.success) setAction(act);
      else alert(d.error || 'Failed to process. Please try again.');
    } catch { alert('Network error. Please try again.'); }
    setSaving(false);
  }

  if (loading) return <div style={{ minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',color:DIM,fontFamily:'system-ui,sans-serif' }}>Loading...</div>;

  if (!data?.payApp) return (
    <div style={{ minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif' }}>
      <div style={{ textAlign:'center',color:RED }}>
        <div style={{ fontSize:48,marginBottom:16 }}>⚠</div>
        <div style={{ fontSize:20,fontWeight:700 }}>Invalid or Expired Link</div>
        <div style={{ fontSize:14,color:DIM,marginTop:8 }}>This pay application link is no longer valid. Please contact your contractor.</div>
      </div>
    </div>
  );

  const pa = data.payApp;
  const project = data.project || {};
  const lineItems = data.lineItems || [];

  if (action) return (
    <div style={{ minHeight:'100vh',background:DARK,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'system-ui,sans-serif' }}>
      <div style={{ textAlign:'center',color:action==='approved'?GREEN:RED }}>
        <div style={{ fontSize:64,marginBottom:16 }}>{action==='approved'?'✓':'✗'}</div>
        <div style={{ fontSize:24,fontWeight:800,color:TEXT }}>
          Pay Application {action==='approved'?'Approved':'Rejected'}
        </div>
        <div style={{ fontSize:14,color:DIM,marginTop:12,maxWidth:440,lineHeight:1.6 }}>
          {action==='approved'
            ? `Payment Application #${pa.app_number} for ${fmt(pa.current_payment_due||0)} has been approved. The contractor has been notified and will process payment accordingly.`
            : `Payment Application #${pa.app_number} has been returned for revision. The contractor has been notified.`
          }
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh',background:DARK,fontFamily:'system-ui,sans-serif',color:TEXT }}>
      <div style={{ background:'rgba(13,17,23,.96)',borderBottom:`1px solid ${BORDER}`,padding:'16px 24px',display:'flex',alignItems:'center',gap:12 }}>
        <span style={{ fontSize:22 }}>🌵</span>
        <span style={{ fontWeight:800,fontSize:16,color:GOLD,letterSpacing:1 }}>SAGUARO CRM</span>
        <span style={{ fontSize:11,color:DIM,marginLeft:8 }}>Owner Pay Application Review Portal</span>
      </div>

      <div style={{ maxWidth:900,margin:'0 auto',padding:'32px 24px' }}>
        {/* Banner */}
        <div style={{ background:'rgba(212,160,23,.06)',border:`1px solid rgba(212,160,23,.2)`,borderRadius:10,padding:'16px 20px',marginBottom:24 }}>
          <div style={{ fontWeight:800,fontSize:18,color:GOLD,marginBottom:4 }}>
            Pay Application #{pa.app_number} — Review &amp; Approval
          </div>
          <div style={{ fontSize:13,color:DIM }}>
            Project: <strong style={{ color:TEXT }}>{project.name||'—'}</strong> ·
            Period: <strong style={{ color:TEXT }}>{pa.period_from||'—'} to {pa.period_to||'—'}</strong>
          </div>
        </div>

        {/* KPI Row */}
        <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24 }}>
          {[
            ['Contract Sum to Date', fmt(pa.contract_sum_to_date||0)],
            ['This Period', fmt(pa.this_period||0)],
            ['Retainage', fmt(pa.retainage_amount||0)],
            ['Current Payment Due', fmt(pa.current_payment_due||0)],
          ].map(([l,v]:any)=>(
            <div key={l} style={{ background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'14px 16px' }}>
              <div style={{ fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:1,color:DIM,marginBottom:5 }}>{l}</div>
              <div style={{ fontSize:20,fontWeight:800,color:l==='Current Payment Due'?GOLD:TEXT }}>{v}</div>
            </div>
          ))}
        </div>

        {/* G702 Summary */}
        <div style={{ background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden',marginBottom:20 }}>
          <div style={{ padding:'12px 20px',borderBottom:`1px solid ${BORDER}`,fontWeight:700,fontSize:14 }}>AIA G702 — Application Summary</div>
          <div style={{ padding:20 }}>
            {[
              ['Original Contract Sum', fmt(pa.contract_sum||0)],
              ['Net Change by Change Orders', fmt(pa.change_orders_total||0)],
              ['Contract Sum to Date', fmt(pa.contract_sum_to_date||0)],
              ['Total Completed &amp; Stored to Date', fmt(pa.total_completed||0)],
              ['Retainage ('+(pa.retainage_percent||10)+'%)', '(' + fmt(pa.retainage_amount||0) + ')'],
              ['Total Earned Less Retainage', fmt(pa.total_earned_less_retainage||0)],
              ['Less Previous Certificates', '(' + fmt(pa.prev_payments||0) + ')'],
              ['Current Payment Due', fmt(pa.current_payment_due||0)],
              ['Balance to Finish (incl. Retainage)', fmt(Math.max(0,(pa.contract_sum_to_date||0)-(pa.total_earned_less_retainage||0)))],
            ].map(([l,v]:any)=>(
              <div key={l} style={{ display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid rgba(38,51,71,.4)',fontSize:13 }}>
                <span style={{ color:DIM }} dangerouslySetInnerHTML={{ __html:l }} />
                <span style={{ color:l.includes('Current Payment')?(GOLD):TEXT,fontWeight:700 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* G703 Line Items */}
        {lineItems.length>0 && (
          <div style={{ background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden',marginBottom:20 }}>
            <div style={{ padding:'12px 20px',borderBottom:`1px solid ${BORDER}`,fontWeight:700,fontSize:14 }}>AIA G703 — Schedule of Values</div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12 }}>
                <thead>
                  <tr style={{ background:'rgba(0,0,0,.3)' }}>
                    {['#','Description','Sched Value','From Prev','This Period','Materials Stored','Total Completed','%','Balance'].map(h=>(
                      <th key={h} style={{ padding:'8px 10px',textAlign:'right',color:DIM,fontWeight:700,whiteSpace:'nowrap',borderBottom:`1px solid ${BORDER}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item:any,i:number)=>(
                    <tr key={i} style={{ borderBottom:'1px solid rgba(38,51,71,.3)' }}>
                      <td style={{ padding:'7px 10px',color:DIM,textAlign:'right' }}>{item.line_number||i+1}</td>
                      <td style={{ padding:'7px 10px',color:TEXT,maxWidth:200 }}>{item.description}</td>
                      <td style={{ padding:'7px 10px',textAlign:'right',color:TEXT }}>{fmt(item.scheduled_value||0)}</td>
                      <td style={{ padding:'7px 10px',textAlign:'right',color:DIM }}>{fmt(item.work_from_prev||0)}</td>
                      <td style={{ padding:'7px 10px',textAlign:'right',color:TEXT }}>{fmt(item.work_this_period||0)}</td>
                      <td style={{ padding:'7px 10px',textAlign:'right',color:DIM }}>{fmt(item.materials_stored||0)}</td>
                      <td style={{ padding:'7px 10px',textAlign:'right',color:TEXT }}>{fmt(item.total_completed||0)}</td>
                      <td style={{ padding:'7px 10px',textAlign:'right',color:GOLD }}>{(item.percent_complete||0).toFixed(0)}%</td>
                      <td style={{ padding:'7px 10px',textAlign:'right',color:DIM }}>{fmt(item.balance_to_finish||0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PDF Links */}
        {(pa.g702_pdf_url||pa.g703_pdf_url) && (
          <div style={{ background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 20px',marginBottom:20,display:'flex',gap:12,flexWrap:'wrap' }}>
            <div style={{ fontSize:13,fontWeight:700,color:TEXT,marginBottom:8,width:'100%' }}>Download Official AIA Documents</div>
            {pa.g702_pdf_url && <a href={pa.g702_pdf_url} target="_blank" rel="noreferrer" style={{ padding:'9px 18px',background:'rgba(212,160,23,.12)',border:`1px solid rgba(212,160,23,.3)`,borderRadius:7,color:GOLD,fontSize:13,fontWeight:700,textDecoration:'none' }}>📄 Download G702</a>}
            {pa.g703_pdf_url && <a href={pa.g703_pdf_url} target="_blank" rel="noreferrer" style={{ padding:'9px 18px',background:'rgba(212,160,23,.12)',border:`1px solid rgba(212,160,23,.3)`,borderRadius:7,color:GOLD,fontSize:13,fontWeight:700,textDecoration:'none' }}>📄 Download G703</a>}
          </div>
        )}

        {/* Approval Action */}
        <div style={{ background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,overflow:'hidden',marginBottom:20 }}>
          <div style={{ padding:'12px 20px',borderBottom:`1px solid ${BORDER}`,fontWeight:700,fontSize:14 }}>Owner Action Required</div>
          <div style={{ padding:20 }}>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block',fontSize:12,fontWeight:700,color:DIM,marginBottom:5,textTransform:'uppercase',letterSpacing:.5 }}>Notes / Comments (optional)</label>
              <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Add any notes, conditions, or comments for the contractor..." rows={3}
                style={{ width:'100%',background:'#0d1117',border:`1px solid ${BORDER}`,borderRadius:7,padding:'10px 14px',color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box',resize:'vertical' }} />
            </div>
            <div style={{ display:'flex',gap:12 }}>
              <button onClick={()=>handleAction('approved')} disabled={saving}
                style={{ flex:1,padding:'14px',background:saving?'#4a5f7a':`linear-gradient(135deg,${GREEN},#22a85a)`,border:'none',borderRadius:9,color:'#fff',fontWeight:800,fontSize:15,cursor:saving?'not-allowed':'pointer' }}>
                ✓ Approve Payment — {fmt(pa.current_payment_due||0)}
              </button>
              <button onClick={()=>handleAction('rejected')} disabled={saving}
                style={{ padding:'14px 24px',background:'rgba(192,48,48,.1)',border:`1px solid rgba(192,48,48,.3)`,borderRadius:9,color:RED,fontWeight:700,fontSize:15,cursor:saving?'not-allowed':'pointer' }}>
                Return for Revision
              </button>
            </div>
            <div style={{ textAlign:'center',marginTop:14,fontSize:11,color:DIM }}>
              Your approval constitutes authorization for the contractor to invoice for the amount shown. · Powered by Saguaro CRM
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
