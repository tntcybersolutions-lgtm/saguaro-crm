'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';

const GOLD='#C8960F', DARK='#F8F9FB', RAISED='#161f2e', RAISED2='#ffffff',
      BORDER='#E2E5EA', DIM='#6B7280', TEXT='#111827',
      GREEN='#22c55e', RED='#ef4444', ORANGE='#f97316', BLUE='#60a5fa';

const fmt  = (n:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n||0);
const fmt2 = (n:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);
const fmtDate = (s:string|null|undefined) => s ? new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

const STATUS_META: Record<string,{label:string;color:string;bg:string;next?:string;nextLabel?:string}> = {
  draft:     {label:'Draft',     color:'#94a3b8', bg:'rgba(148,163,184,.15)', next:'submitted',  nextLabel:'Submit to Owner'},
  submitted: {label:'Submitted', color:BLUE,      bg:'rgba(96,165,250,.15)',  next:'approved',   nextLabel:'Approve'},
  approved:  {label:'Approved',  color:GREEN,     bg:'rgba(34,197,94,.15)',   next:'certified',  nextLabel:'Certify'},
  certified: {label:'Certified', color:GOLD,      bg:'rgba(212,160,23,.15)', next:'paid',       nextLabel:'Mark Paid'},
  paid:      {label:'Paid',      color:'#a78bfa', bg:'rgba(167,139,250,.15)'},
};

interface SovLine {
  id?: string;
  line_number: number;
  description: string;
  scheduled_value: number;
  work_from_prev: number;
  work_this_period: number;
  materials_stored: number;
  total_completed: number;
  percent_complete: number;
  balance_to_finish: number;
  retainage: number;
  csi_code?: string;
}

interface PayApp {
  id: string;
  application_number: number;
  status: string;
  period_from: string;
  period_to: string;
  contract_sum: number;
  change_orders_total: number;
  contract_sum_to_date: number;
  prev_completed: number;
  this_period: number;
  materials_stored: number;
  total_completed: number;
  percent_complete: number;
  retainage_percent: number;
  retainage_amount: number;
  total_earned_less_retainage: number;
  prev_payments: number;
  current_payment_due: number;
  submitted_date: string;
  approved_date: string;
  certified_date: string;
  owner_name: string;
  architect_name: string;
  notes: string;
  projects?: { name: string; address?: string; contract_amount?: number };
}

function calcLine(l: SovLine, retPct: number): SovLine {
  const total = (l.work_from_prev||0) + (l.work_this_period||0) + (l.materials_stored||0);
  const sv = l.scheduled_value || 0;
  return {
    ...l,
    total_completed: total,
    percent_complete: sv > 0 ? Math.round((total / sv) * 1000) / 10 : 0,
    balance_to_finish: sv - total,
    retainage: Math.round(total * (retPct / 100) * 100) / 100,
  };
}

export default function PayAppDetailPage() {
  const { projectId, id } = useParams() as { projectId: string; id: string };
  const router = useRouter();

  const [payApp, setPayApp]     = useState<PayApp | null>(null);
  const [lines, setLines]       = useState<SovLine[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [actioning, setActioning] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast]       = useState<{msg:string;type:'success'|'error'}|null>(null);
  const [downloading, setDownloading] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const r = await fetch(`/api/pay-apps/${id}`, { headers });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setPayApp(d.payApp);
      setLines((d.lineItems || []).map((l: SovLine) => calcLine(l, d.payApp?.retainage_percent || 10)));
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : 'Failed to load', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const retPct = payApp?.retainage_percent || 10;
  const isDraft = payApp?.status === 'draft';
  const canEdit = isDraft && editMode;

  // Live totals from SOV lines
  const sovScheduled  = lines.reduce((s,l) => s + (l.scheduled_value||0), 0);
  const sovPrev       = lines.reduce((s,l) => s + (l.work_from_prev||0), 0);
  const sovThis       = lines.reduce((s,l) => s + (l.work_this_period||0), 0);
  const sovMats       = lines.reduce((s,l) => s + (l.materials_stored||0), 0);
  const sovCompleted  = sovPrev + sovThis + sovMats;
  const sovRetainage  = Math.round(sovCompleted * (retPct / 100) * 100) / 100;
  const sovEarned     = sovCompleted - sovRetainage;
  const sovPayment    = Math.max(0, sovEarned - sovPrev * (1 - retPct / 100));

  function updateLine(i: number, field: keyof SovLine, val: string) {
    setLines(prev => {
      const next = [...prev];
      const updated = { ...next[i], [field]: field === 'description' || field === 'csi_code' ? val : (parseFloat(val) || 0) };
      next[i] = calcLine(updated, retPct);
      return next;
    });
  }

  function addLine() {
    setLines(prev => [...prev, calcLine({
      line_number: prev.length + 1,
      description: '', scheduled_value: 0, work_from_prev: 0,
      work_this_period: 0, materials_stored: 0, total_completed: 0,
      percent_complete: 0, balance_to_finish: 0, retainage: 0,
    }, retPct)]);
  }

  function removeLine(i: number) {
    setLines(prev => prev.filter((_,idx) => idx !== i).map((l,idx) => ({ ...l, line_number: idx + 1 })));
  }

  async function saveEdits() {
    if (!payApp) return;
    setSaving(true);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const r = await fetch(`/api/pay-apps/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          prevCompleted: sovPrev,
          thisPeriod: sovThis,
          materialsStored: sovMats,
          totalCompleted: sovCompleted,
          percentComplete: payApp.contract_sum_to_date > 0
            ? Math.round((sovCompleted / payApp.contract_sum_to_date) * 100) : 0,
          retainageAmount: sovRetainage,
          totalEarnedLessRetainage: sovEarned,
          currentPaymentDue: sovPayment,
          lineItems: lines.map(l => ({
            id: l.id,
            line_number: l.line_number,
            description: l.description,
            scheduled_value: l.scheduled_value,
            work_from_prev: l.work_from_prev,
            work_this_period: l.work_this_period,
            materials_stored: l.materials_stored,
            total_completed: l.total_completed,
            percent_complete: l.percent_complete,
            balance_to_finish: l.balance_to_finish,
            retainage: l.retainage,
            csi_code: l.csi_code,
          })),
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setToast({ msg: 'Pay application saved', type: 'success' });
      setEditMode(false);
      await load();
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function doAction(action: string) {
    setActioning(true);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const r = await fetch(`/api/pay-apps/${id}/${action}`, { method: 'POST', headers, body: JSON.stringify({ projectId }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const labels: Record<string,string> = { submit:'Submitted to owner', approve:'Approved', certify:'Certified', paid:'Marked as paid' };
      setToast({ msg: labels[action] || 'Updated', type: 'success' });
      await load();
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : 'Action failed', type: 'error' });
    } finally {
      setActioning(false);
    }
  }

  async function downloadPDF() {
    setDownloading(true);
    try {
      const headers = { ...(await getAuthHeaders()), 'Content-Type': 'application/json' };
      const r = await fetch('/api/documents/pay-application', {
        method: 'POST', headers,
        body: JSON.stringify({ payAppId: id, projectId }),
      });
      const d = await r.json();
      const url = d.g702Url || d.url || d.pdfUrl;
      if (url) {
        window.open(url, '_blank');
        if (d.g703Url) window.open(d.g703Url, '_blank');
        setToast({ msg: 'PDF opened in new tab', type: 'success' });
      } else {
        setToast({ msg: d.error || 'PDF generation failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Download failed', type: 'error' });
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, color: DIM }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
        <div>Loading pay application…</div>
      </div>
    </div>
  );

  if (!payApp) return (
    <div style={{ padding: 32, textAlign: 'center', color: DIM }}>
      Pay application not found. <Link href={`/app/projects/${projectId}/pay-apps`} style={{ color: GOLD }}>Back to list</Link>
    </div>
  );

  const meta = STATUS_META[payApp.status] || STATUS_META.draft;
  const contractToDate = payApp.contract_sum_to_date || payApp.contract_sum || 0;
  const completePct = contractToDate > 0 ? Math.round((sovCompleted / contractToDate) * 100) : (payApp.percent_complete || 0);

  const timeline = [
    { label: 'Created', date: null, done: true, icon: '✏️' },
    { label: 'Submitted', date: payApp.submitted_date, done: !!payApp.submitted_date, icon: '📤' },
    { label: 'Approved', date: payApp.approved_date, done: !!payApp.approved_date, icon: '✅' },
    { label: 'Certified', date: payApp.certified_date, done: !!payApp.certified_date, icon: '🔏' },
    { label: 'Paid', date: null, done: payApp.status === 'paid', icon: '💰' },
  ];

  return (
    <div style={{ background: DARK, minHeight: '100%' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 99999, padding: '12px 22px', borderRadius: 10, background: toast.type === 'success' ? 'rgba(34,197,94,.92)' : 'rgba(239,68,68,.92)', color: '#fff', fontWeight: 700, fontSize: 14, boxShadow: '0 4px 24px rgba(0,0,0,.08)', pointerEvents: 'none' }}>
          {toast.type === 'success' ? '✓ ' : '✗ '}{toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: `1px solid ${BORDER}`, background: RAISED, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href={`/app/projects/${projectId}/pay-apps`} style={{ color: DIM, fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
            ← Pay Applications
          </Link>
          <span style={{ color: BORDER }}>|</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>
                Pay App #{payApp.application_number}
              </h2>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: meta.bg, color: meta.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {meta.label}
              </span>
            </div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
              {payApp.projects?.name || 'Project'} · Period: {fmtDate(payApp.period_from)} – {fmtDate(payApp.period_to)}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {isDraft && !editMode && (
            <button onClick={() => setEditMode(true)}
              style={{ padding: '8px 18px', background: 'rgba(255,255,255,.07)', border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              ✏️ Edit SOV
            </button>
          )}
          {canEdit && (
            <>
              <button onClick={() => { setEditMode(false); load(); }}
                style={{ padding: '8px 16px', background: 'none', border: `1px solid ${BORDER}`, borderRadius: 7, color: DIM, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveEdits} disabled={saving}
                style={{ padding: '8px 18px', background: 'rgba(34,197,94,.15)', border: `1px solid rgba(34,197,94,.3)`, borderRadius: 7, color: GREEN, fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? 'Saving…' : '💾 Save Changes'}
              </button>
            </>
          )}
          {meta.next && !editMode && (
            <button onClick={() => doAction(meta.next === 'paid' ? 'paid' : meta.next === 'submitted' ? 'submit' : meta.next === 'approved' ? 'approve' : 'certify')}
              disabled={actioning}
              style={{ padding: '8px 20px', background: `linear-gradient(135deg, ${GOLD}, #F0C040)`, border: 'none', borderRadius: 7, color: DARK, fontWeight: 800, fontSize: 13, cursor: actioning ? 'wait' : 'pointer', opacity: actioning ? 0.7 : 1 }}>
              {actioning ? '…' : `${meta.nextLabel} →`}
            </button>
          )}
          <button onClick={downloadPDF} disabled={downloading}
            style={{ padding: '8px 18px', background: 'rgba(96,165,250,.12)', border: `1px solid rgba(96,165,250,.3)`, borderRadius: 7, color: BLUE, fontWeight: 700, fontSize: 13, cursor: downloading ? 'wait' : 'pointer' }}>
            {downloading ? '…' : '📄 G702/G703 PDF'}
          </button>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {/* Progress bar */}
        <div style={{ background: RAISED2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Project Completion</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>{completePct}%</span>
          </div>
          <div style={{ height: 10, background: 'rgba(255,255,255,.08)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, completePct)}%`, background: `linear-gradient(90deg, ${GOLD}, #22c55e)`, borderRadius: 999, transition: 'width .6s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: DIM }}>
            <span>Contract: {fmt(contractToDate)}</span>
            <span>Completed to date: {fmt(sovCompleted)}</span>
            <span>Balance: {fmt(contractToDate - sovCompleted)}</span>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Contract Sum', value: fmt(contractToDate), color: TEXT },
            { label: 'This Period', value: fmt(sovThis), color: GOLD },
            { label: 'Total Completed', value: fmt(sovCompleted), color: GREEN },
            { label: 'Retainage Held', value: fmt(sovRetainage), color: ORANGE },
            { label: 'Payment Due', value: fmt(sovPayment), color: GREEN, highlight: true },
          ].map(card => (
            <div key={card.label} style={{
              background: card.highlight ? 'rgba(34,197,94,.08)' : RAISED2,
              border: `1px solid ${card.highlight ? 'rgba(34,197,94,.25)' : BORDER}`,
              borderRadius: 10, padding: '14px 16px',
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: DIM, marginBottom: 6, letterSpacing: 0.5 }}>{card.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>

        {/* Main grid: SOV table + sidebar */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'flex-start' }}>

          {/* SOV Table */}
          <div>
            <div style={{ background: RAISED2, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '13px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,.02)' }}>
                <div>
                  <span style={{ fontWeight: 800, fontSize: 15, color: TEXT }}>Schedule of Values</span>
                  <span style={{ fontSize: 11, color: DIM, marginLeft: 10 }}>G703 Continuation Sheet</span>
                </div>
                {canEdit && (
                  <button onClick={addLine}
                    style={{ padding: '5px 14px', background: 'rgba(212,160,23,.12)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 6, color: GOLD, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    + Add Row
                  </button>
                )}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: DARK }}>
                      {['#', 'Description', 'Sched. Value', 'Prev ($)', 'This Period ($)', 'Stored ($)', '% Done', 'Balance', 'Retainage', ...(canEdit ? [''] : [])].map(h => (
                        <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: DIM, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid rgba(38,51,71,.4)`, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.015)' }}>
                        <td style={{ padding: '7px 10px', color: DIM, fontWeight: 700, minWidth: 28 }}>{l.line_number}</td>
                        <td style={{ padding: '4px 6px', minWidth: 180 }}>
                          {canEdit
                            ? <input value={l.description} onChange={e => updateLine(i, 'description', e.target.value)} placeholder="Description"
                                style={{ padding: '5px 8px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 5, color: TEXT, fontSize: 12, outline: 'none', width: '100%' }} />
                            : <span style={{ color: TEXT, paddingLeft: 4 }}>{l.description || <span style={{ color: DIM }}>—</span>}</span>
                          }
                        </td>
                        {canEdit
                          ? (['scheduled_value','work_from_prev','work_this_period','materials_stored'] as const).map(f => (
                              <td key={f} style={{ padding: '4px 6px', minWidth: 100 }}>
                                <input type="number" value={(l as unknown as Record<string,number>)[f] || ''} onChange={e => updateLine(i, f, e.target.value)}
                                  placeholder="0" style={{ padding: '5px 8px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 5, color: TEXT, fontSize: 12, outline: 'none', textAlign: 'right', width: 88 }} />
                              </td>
                            ))
                          : <>
                              <td style={{ padding: '7px 10px', color: GOLD, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(l.scheduled_value)}</td>
                              <td style={{ padding: '7px 10px', color: DIM, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(l.work_from_prev)}</td>
                              <td style={{ padding: '7px 10px', color: GREEN, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{fmt(l.work_this_period)}</td>
                              <td style={{ padding: '7px 10px', color: BLUE, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(l.materials_stored)}</td>
                            </>
                        }
                        {/* Progress mini-bar */}
                        <td style={{ padding: '7px 10px', minWidth: 80 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,.08)', borderRadius: 999, overflow: 'hidden', minWidth: 40 }}>
                              <div style={{ height: '100%', width: `${Math.min(100, l.percent_complete)}%`, background: l.percent_complete >= 100 ? GREEN : GOLD, borderRadius: 999 }} />
                            </div>
                            <span style={{ color: TEXT, fontSize: 11, fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{l.percent_complete.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '7px 10px', color: l.balance_to_finish < 0 ? RED : DIM, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(l.balance_to_finish)}</td>
                        <td style={{ padding: '7px 10px', color: ORANGE, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt2(l.retainage)}</td>
                        {canEdit && (
                          <td style={{ padding: '4px 8px' }}>
                            <button onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}>×</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: DARK, borderTop: `2px solid ${BORDER}` }}>
                      <td colSpan={2} style={{ padding: '10px 10px', fontWeight: 800, fontSize: 11, color: TEXT, textTransform: 'uppercase', letterSpacing: 0.3 }}>TOTALS</td>
                      <td style={{ padding: '10px 10px', fontWeight: 800, color: GOLD, textAlign: 'right' }}>{fmt(sovScheduled)}</td>
                      <td style={{ padding: '10px 10px', fontWeight: 700, color: DIM, textAlign: 'right' }}>{fmt(sovPrev)}</td>
                      <td style={{ padding: '10px 10px', fontWeight: 800, color: GREEN, textAlign: 'right' }}>{fmt(sovThis)}</td>
                      <td style={{ padding: '10px 10px', fontWeight: 700, color: BLUE, textAlign: 'right' }}>{fmt(sovMats)}</td>
                      <td style={{ padding: '10px 10px', fontWeight: 700, color: TEXT }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 36, height: 5, background: 'rgba(255,255,255,.1)', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, completePct)}%`, background: GOLD, borderRadius: 999 }} />
                          </div>
                          <span style={{ fontSize: 11 }}>{completePct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 10px', fontWeight: 700, color: DIM, textAlign: 'right' }}>{fmt(lines.reduce((s,l) => s + (l.balance_to_finish||0), 0))}</td>
                      <td style={{ padding: '10px 10px', fontWeight: 700, color: ORANGE, textAlign: 'right' }}>{fmt2(sovRetainage)}</td>
                      {canEdit && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* G702 Summary section */}
            <div style={{ background: RAISED2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '18px 22px' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: TEXT, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${BORDER}` }}>
                G702 — Application Summary
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 32px' }}>
                {[
                  { label: '1. Original Contract Sum', value: fmt(payApp.contract_sum) },
                  { label: '2. Net Change by Change Orders', value: fmt(payApp.change_orders_total || 0) },
                  { label: '3. Contract Sum to Date (1+2)', value: fmt(contractToDate), bold: true },
                  { label: '4. Total Completed & Stored to Date', value: fmt(sovCompleted), color: GREEN },
                  { label: `5. Retainage (${retPct}%)`, value: fmt(sovRetainage), color: ORANGE },
                  { label: '6. Total Earned Less Retainage (4–5)', value: fmt(sovEarned) },
                  { label: '7. Less Previous Certificates for Payment', value: fmt(sovPrev * (1 - retPct / 100)) },
                  { label: '8. Current Payment Due (6–7)', value: fmt(sovPayment), color: GREEN, bold: true, large: true },
                  { label: '9. Balance to Finish, including Retainage', value: fmt(contractToDate - sovCompleted + sovRetainage) },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid rgba(38,51,71,.4)` }}>
                    <span style={{ fontSize: 12, color: DIM, flex: 1, paddingRight: 16 }}>{row.label}</span>
                    <span style={{ fontSize: row.large ? 18 : 13, fontWeight: row.bold ? 800 : 600, color: row.color || TEXT, whiteSpace: 'nowrap' }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Status timeline */}
            <div style={{ background: RAISED2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 18px' }}>
              <button onClick={() => setShowTimeline(!showTimeline)}
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showTimeline ? 14 : 0 }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: TEXT }}>Status Timeline</span>
                <span style={{ color: DIM, fontSize: 12 }}>{showTimeline ? '▲' : '▼'}</span>
              </button>
              {showTimeline && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {timeline.map((step, i) => (
                    <div key={step.label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: i < timeline.length - 1 ? 14 : 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: step.done ? 'rgba(34,197,94,.15)' : 'rgba(255,255,255,.06)', border: `1px solid ${step.done ? 'rgba(34,197,94,.4)' : BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                          {step.done ? '✓' : step.icon}
                        </div>
                        {i < timeline.length - 1 && (
                          <div style={{ width: 1, flex: 1, background: step.done ? 'rgba(34,197,94,.3)' : BORDER, minHeight: 14 }} />
                        )}
                      </div>
                      <div style={{ paddingTop: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: step.done ? TEXT : DIM }}>{step.label}</div>
                        {step.date && <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{fmtDate(step.date)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Details panel */}
            <div style={{ background: RAISED2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: TEXT, marginBottom: 14 }}>Details</div>
              {[
                { label: 'Owner', value: payApp.owner_name || '—' },
                { label: 'Architect', value: payApp.architect_name || '—' },
                { label: 'Retainage %', value: `${retPct}%` },
                { label: 'Submitted', value: fmtDate(payApp.submitted_date) },
                { label: 'Approved', value: fmtDate(payApp.approved_date) },
                { label: 'Certified', value: fmtDate(payApp.certified_date) },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 9 }}>
                  <span style={{ fontSize: 11, color: DIM }}>{row.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: TEXT, textAlign: 'right', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Retainage breakdown */}
            <div style={{ background: 'rgba(249,115,22,.06)', border: `1px solid rgba(249,115,22,.2)`, borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: ORANGE, marginBottom: 12 }}>Retainage Tracking</div>
              <div style={{ fontSize: 12, color: DIM, marginBottom: 4 }}>Rate</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: ORANGE, marginBottom: 10 }}>{retPct}%</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: DIM }}>Held this app</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: ORANGE }}>{fmt2(sovRetainage)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: DIM }}>Released to date</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: GREEN }}>$0</span>
              </div>
            </div>

            {/* Quick links */}
            <div style={{ background: RAISED2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 18px' }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: TEXT, marginBottom: 12 }}>Related</div>
              {[
                { label: '← All Pay Apps', href: `/app/projects/${projectId}/pay-apps` },
                { label: '📑 Change Orders', href: `/app/projects/${projectId}/change-orders` },
                { label: '🔒 Lien Waivers', href: `/app/projects/${projectId}/lien-waivers` },
                { label: '💰 Project Budget', href: `/app/projects/${projectId}/budget` },
              ].map(link => (
                <Link key={link.href} href={link.href}
                  style={{ display: 'block', fontSize: 12, color: DIM, textDecoration: 'none', padding: '5px 0', borderBottom: `1px solid rgba(38,51,71,.4)` }}
                  onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
                  onMouseLeave={e => (e.currentTarget.style.color = DIM)}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
