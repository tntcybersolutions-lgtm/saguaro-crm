'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { IntelligenceIndicator } from '@/app/app/components/IntelligenceIndicator';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import DocumentVersionHistory from '@/components/DocumentVersionHistory';

const BG = '#0d1117', CARD = '#161b22', BORDER = '#30363d', GOLD = '#d4a017';
const GREEN = '#2ea043', RED = '#f85149', WHITE = '#e6edf3', DIM = '#8b949e';
const BLUE = '#388bfd';

const fmt$ = (n: number) => '$' + Math.round(n || 0).toLocaleString();
const fmtDate = (s: string | null) =>
  s ? new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

interface PayApp {
  id: string; app_number: number; status: string;
  period_from: string | null; period_to: string | null; application_date: string | null;
  original_contract_sum: number; net_change_by_change_orders: number; contract_sum_to_date: number;
  total_completed_stored: number; retainage_held: number; total_earned_less_retainage: number;
  less_previous_certificates: number; current_payment_due: number; balance_to_finish: number;
  percent_complete: number; retainage_percent: number; pdf_url: string | null;
  created_at: string;
}

interface SovItem {
  id: string; item_no: string; description: string;
  scheduled_value: number; work_from_previous: number; work_this_period: number;
  materials_presently_stored: number; total_completed_stored: number;
  pct_complete: number; balance_to_finish: number; retainage: number;
  sort_order: number;
}

type View = 'list' | 'edit';

const STATUS_BADGE: Record<string, { c: string; bg: string }> = {
  draft: { c: DIM, bg: 'rgba(139,148,158,.12)' },
  submitted: { c: BLUE, bg: 'rgba(56,139,253,.12)' },
  approved: { c: GREEN, bg: 'rgba(46,160,67,.12)' },
  paid: { c: '#a78bfa', bg: 'rgba(167,139,250,.12)' },
  rejected: { c: RED, bg: 'rgba(248,81,73,.12)' },
};

export default function PayApplicationsPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [view, setView] = useState<View>('list');
  const [payApps, setPayApps] = useState<PayApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeApp, setActiveApp] = useState<PayApp | null>(null);
  const [sovItems, setSovItems] = useState<SovItem[]>([]);
  const [sovLoading, setSovLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [genPdf, setGenPdf] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Lien waivers state
  interface LienWaiver { id: string; claimant_name: string; waiver_type: string; amount: number; payment_amount?: number; through_date: string; status: string }
  const [waivers, setWaivers] = useState<LienWaiver[]>([])
  const [missingWaivers, setMissingWaivers] = useState<string[]>([])
  const [waiversLoading, setWaiversLoading] = useState(true)

  const fetchWaivers = useCallback(async () => {
    try {
      const r = await fetch(`/api/lien-waivers/list?projectId=${projectId}`)
      if (r.ok) {
        const { lienWaivers, missing_waivers } = await r.json()
        setWaivers(lienWaivers || [])
        setMissingWaivers(missing_waivers || [])
      }
    } catch { /* */ }
    setWaiversLoading(false)
  }, [projectId])

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); } return undefined; }, [toast]);

  // ── Load list ──────────────────────────────────────────────────
  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/pay-applications/list?projectId=${projectId}`);
      const j = await r.json();
      setPayApps((j.data || []) as PayApp[]);
    } catch { /* */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadApps(); fetchWaivers(); }, [loadApps, fetchWaivers]);

  // ── Load single app + SOV items ────────────────────────────────
  const loadApp = useCallback(async (id: string) => {
    setSovLoading(true);
    try {
      const r = await fetch(`/api/pay-applications/${id}`);
      const j = await r.json();
      if (j.data) setActiveApp(j.data as PayApp);
      setSovItems((j.lineItems || []) as SovItem[]);
    } catch { /* */ }
    setSovLoading(false);
  }, []);

  // ── Create new application ─────────────────────────────────────
  const handleCreate = async () => {
    setCreating(true);
    try {
      const r = await fetch('/api/pay-applications/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const j = await r.json();
      if (j.data?.payAppId) {
        await loadApps();
        await loadApp(j.data.payAppId);
        setView('edit');
        setToast(`Application #${j.data.appNumber} created with ${j.data.lineItemCount} SOV lines`);
      }
    } catch { setToast('Failed to create'); }
    setCreating(false);
  };

  // ── Open for editing ───────────────────────────────────────────
  const openEdit = async (app: PayApp) => {
    setActiveApp(app);
    await loadApp(app.id);
    setView('edit');
  };

  // ── Save SOV item (PATCH) ──────────────────────────────────────
  const saveItem = async (itemId: string, field: 'work_this_period' | 'materials_presently_stored', value: number) => {
    if (!activeApp) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/pay-applications/${activeApp.id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, [field]: value }),
      });
      const j = await r.json();
      if (j.totals) {
        setActiveApp(prev => prev ? {
          ...prev,
          total_completed_stored: j.totals.completedToDate,
          retainage_held: j.totals.retainageAmount,
          total_earned_less_retainage: j.totals.totalEarnedLessRetainage,
          current_payment_due: j.totals.currentPaymentDue,
          balance_to_finish: j.totals.balanceToFinish,
          percent_complete: j.totals.percentComplete,
        } : prev);
      }
      // Reload items for updated calcs
      const ir = await fetch(`/api/pay-applications/${activeApp.id}/items`);
      const ij = await ir.json();
      setSovItems((ij.data || []) as SovItem[]);
    } catch { /* */ }
    setSaving(false);
  };

  // ── Generate PDF ───────────────────────────────────────────────
  const handleGenPdf = async () => {
    if (!activeApp) return;
    setGenPdf(true);
    try {
      const r = await fetch(`/api/pay-applications/${activeApp.id}/generate-pdf`, { method: 'POST' });
      const j = await r.json();
      if (j.data?.pdf_url) {
        setActiveApp(prev => prev ? { ...prev, pdf_url: j.data.pdf_url } : prev);
        window.open(j.data.pdf_url, '_blank');
        setToast('G702/G703 PDF generated');
      }
    } catch { setToast('PDF generation failed'); }
    setGenPdf(false);
  };

  // ── Generate G702/G703 HTML — opens preview modal for approval ────
  const [genG702, setGenG702] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewMeta, setPreviewMeta] = useState<{
    appNumber: number; currentPaymentDue: number; pctComplete: number; ownerName: string; gcName: string;
  } | null>(null);

  const handleGenerateG702 = async () => {
    if (!activeApp) return;
    setGenG702(true);
    try {
      const r = await fetch(`/api/pay-applications/${activeApp.id}/generate-g702`, { method: 'POST' });
      const j = await r.json();
      if (j.success && j.g702_html) {
        setPreviewHtml(j.g702_html);
        setPreviewMeta({
          appNumber: j.appNumber,
          currentPaymentDue: j.currentPaymentDue,
          pctComplete: j.pctComplete,
          ownerName: j.ownerName || '',
          gcName: j.gcName || '',
        });
        setPreviewOpen(true);
      } else {
        setToast(j.error || 'G702 generation failed');
      }
    } catch { setToast('G702 generation failed'); }
    setGenG702(false);
  };

  const viewG702 = (doc: 'g702' | 'g703') => {
    if (!activeApp) return;
    window.open(`/api/pay-applications/${activeApp.id}/generate-g702?doc=${doc}`, '_blank');
  };

  // ── Submit ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!activeApp) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/pay-applications/${activeApp.id}/submit`, { method: 'POST' });
      const j = await r.json();
      if (j.success) {
        setActiveApp(prev => prev ? { ...prev, status: 'submitted' } : prev);
        setToast('Application submitted');
        loadApps();
      }
    } catch { /* */ }
    setSubmitting(false);
  };

  // ── KPI helpers ────────────────────────────────────────────────
  const totalDue = payApps.reduce((s, a) => s + (a.current_payment_due || 0), 0);
  const totalCertified = payApps
    .filter(a => a.status === 'approved' || a.status === 'paid')
    .reduce((s, a) => s + (a.current_payment_due || 0), 0);

  // ── RENDER ─────────────────────────────────────────────────────
  return (
    <div style={{ background: BG, minHeight: '100vh', color: WHITE }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, padding: '10px 22px', borderRadius: 8, background: 'rgba(46,160,67,.9)', color: '#fff', fontWeight: 700, fontSize: 13 }}>
          {toast}
        </div>
      )}

      {/* ── HEADER ─────────────────────────────────────────── */}
      <div style={{ padding: '18px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: WHITE }}>
            {view === 'edit' && activeApp ? `Application #${activeApp.app_number}` : 'Payment Applications'}
          </h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>AIA G702/G703 — Application and Certificate for Payment</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {view === 'edit' && (
            <button onClick={() => { setView('list'); loadApps(); }} style={{ padding: '8px 16px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 7, color: DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              ← Back to List
            </button>
          )}
          {view === 'list' && (
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{ padding: '9px 20px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 7, color: '#000', fontSize: 13, fontWeight: 800, cursor: creating ? 'wait' : 'pointer', opacity: creating ? 0.6 : 1 }}
            >
              {creating ? 'Creating…' : '+ New Application'}
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {/* ══════════════════════ LIST VIEW ══════════════════════ */}
        {view === 'list' && (
          <>
            {/* KPI Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
              {[
                { l: 'Applications', v: String(payApps.length) },
                { l: 'Current Due', v: fmt$(totalDue) },
                { l: 'Total Certified', v: fmt$(totalCertified) },
              ].map(k => (
                <div key={k.l} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 18px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: DIM, marginBottom: 6 }}>{k.l}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: WHITE }}>{k.v}</div>
                </div>
              ))}
            </div>

            {loading && <IntelligenceIndicator variant="loading" size="lg" message="Loading pay applications..." />}

            {!loading && payApps.length === 0 && (
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 60, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>No pay applications yet</div>
                <div style={{ fontSize: 13, color: DIM, marginBottom: 24 }}>Create your first AIA G702/G703 pay application to bill the owner.</div>
                <button onClick={handleCreate} disabled={creating}
                  style={{ padding: '10px 24px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 8, color: '#000', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                  {creating ? 'Creating…' : '+ Create First Application'}
                </button>
              </div>
            )}

            {/* Pay App Cards */}
            {!loading && payApps.map(app => {
              const pct = app.contract_sum_to_date > 0 ? (app.total_completed_stored / app.contract_sum_to_date) * 100 : 0;
              const st = STATUS_BADGE[app.status] || STATUS_BADGE.draft;
              return (
                <div key={app.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '20px 24px', marginBottom: 12, cursor: 'pointer' }} onClick={() => openEdit(app)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontWeight: 800, fontSize: 15 }}>Application #{app.app_number}</span>
                      {app.period_to && <span style={{ fontSize: 12, color: DIM }}>Period Ending {fmtDate(app.period_to)}</span>}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 4, background: st.bg, color: st.c, textTransform: 'uppercase', letterSpacing: 0.3 }}>{app.status}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 14 }}>
                    <div><div style={{ fontSize: 11, color: DIM }}>Contract Sum</div><div style={{ fontWeight: 700, fontSize: 15 }}>{fmt$(app.contract_sum_to_date)}</div></div>
                    <div><div style={{ fontSize: 11, color: DIM }}>Completed to Date</div><div style={{ fontWeight: 700, fontSize: 15 }}>{fmt$(app.total_completed_stored)} <span style={{ fontSize: 11, color: DIM }}>({pct.toFixed(1)}%)</span></div></div>
                    <div><div style={{ fontSize: 11, color: DIM }}>Current Payment Due</div><div style={{ fontWeight: 800, fontSize: 15, color: GOLD }}>{fmt$(app.current_payment_due)}</div></div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: 6, background: BORDER, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: GOLD, borderRadius: 3, width: `${Math.min(pct, 100)}%`, transition: 'width .4s' }} />
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button onClick={e => { e.stopPropagation(); openEdit(app); }} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: WHITE, cursor: 'pointer' }}>Edit</button>
                    <button onClick={e => { e.stopPropagation(); setActiveApp(app); handleGenPdf(); }} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: GOLD, cursor: 'pointer' }}>Generate PDF</button>
                    {app.pdf_url && <a href={app.pdf_url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: GREEN, textDecoration: 'none', cursor: 'pointer' }}>Download G702/G703</a>}
                  </div>
                  <div onClick={e => e.stopPropagation()}>
                    <DocumentVersionHistory compact sourceType="pay_application" sourceId={app.id} />
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ══════════════════════ EDIT VIEW ══════════════════════ */}
        {view === 'edit' && activeApp && (
          <>
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <button onClick={handleGenPdf} disabled={genPdf} style={{ padding: '8px 18px', fontSize: 12, fontWeight: 700, background: GOLD + '20', border: `1px solid ${GOLD}44`, borderRadius: 6, color: GOLD, cursor: genPdf ? 'wait' : 'pointer' }}>
                {genPdf ? 'Generating…' : '📄 Generate G702/G703 PDF'}
              </button>
              <button onClick={handleGenerateG702} disabled={genG702} style={{ padding: '8px 18px', fontSize: 12, fontWeight: 700, background: '#1f6feb20', border: '1px solid #1f6feb44', borderRadius: 6, color: '#58a6ff', cursor: genG702 ? 'wait' : 'pointer' }}>
                {genG702 ? 'Generating…' : '✨ Generate G702/G703 HTML'}
              </button>
              <button onClick={() => viewG702('g702')} style={{ padding: '8px 18px', fontSize: 12, fontWeight: 700, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: WHITE, cursor: 'pointer' }}>
                👁 View G702
              </button>
              <button onClick={() => viewG702('g703')} style={{ padding: '8px 18px', fontSize: 12, fontWeight: 700, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: WHITE, cursor: 'pointer' }}>
                👁 View G703
              </button>
              {activeApp.status === 'draft' && (
                <button onClick={handleSubmit} disabled={submitting} style={{ padding: '8px 18px', fontSize: 12, fontWeight: 700, background: GREEN + '20', border: `1px solid ${GREEN}44`, borderRadius: 6, color: GREEN, cursor: submitting ? 'wait' : 'pointer' }}>
                  {submitting ? 'Submitting…' : '📤 Submit to Owner'}
                </button>
              )}
              {activeApp.pdf_url && (
                <a href={activeApp.pdf_url} target="_blank" rel="noopener" style={{ padding: '8px 18px', fontSize: 12, fontWeight: 700, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: WHITE, textDecoration: 'none' }}>⬇ Download PDF</a>
              )}
              <button
                onClick={async () => {
                  if (!activeApp?.id) return
                  setToast('Calculating percent complete from project data...')
                  try {
                    const r = await fetch(`/api/pay-applications/${activeApp.id}/auto-fill`, { method: 'POST' })
                    if (r.ok) {
                      const { data } = await r.json()
                      setToast(`Auto-filled: ${data.lines_updated} SOV lines · ${data.overall_pct}% complete`)
                      if (activeApp) openEdit(activeApp)
                    } else {
                      const j = await r.json()
                      setToast(j.error || 'Auto-fill failed')
                    }
                  } catch { setToast('Auto-fill failed') }
                }}
                style={{ padding: '8px 18px', fontSize: 12, fontWeight: 700,
                  background: 'rgba(163,113,247,0.1)', border: '1px solid rgba(163,113,247,0.3)',
                  borderRadius: 6, color: '#a371f7', cursor: 'pointer' }}>
                ✨ Auto-Fill G703
              </button>
            </div>

            {/* ── SOV TABLE (G703) ──────────────────────────── */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Schedule of Values — Application #{activeApp.app_number}</span>
                {saving && <span style={{ fontSize: 11, color: DIM }}>Saving…</span>}
              </div>

              {sovLoading ? (
                <div style={{ padding: 30, textAlign: 'center', color: DIM }}>Loading SOV…</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
                    <thead>
                      <tr style={{ background: BG }}>
                        {['#', 'Description', 'Sched Value', 'Previous', 'This Period', 'Mat Stored', 'Total', '%', 'Balance', 'Retainage'].map(h => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Description' ? 'left' : 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: DIM, borderBottom: `1px solid ${BORDER}` }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sovItems.map(item => (
                        <tr key={item.id} style={{ borderBottom: `1px solid ${BORDER}22` }}>
                          <td style={{ padding: '10px 12px', color: DIM, textAlign: 'center' }}>{item.item_no}</td>
                          <td style={{ padding: '10px 12px', color: WHITE, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: WHITE }}>{fmt$(item.scheduled_value)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: DIM }}>{fmt$(item.work_from_previous)}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                            <input
                              type="number"
                              defaultValue={item.work_this_period || 0}
                              onBlur={e => {
                                const v = parseFloat(e.target.value) || 0;
                                if (v !== item.work_this_period) saveItem(item.id, 'work_this_period', v);
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              style={{ width: 80, padding: '6px 8px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: GOLD, fontSize: 12, textAlign: 'right', outline: 'none' }}
                            />
                          </td>
                          <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                            <input
                              type="number"
                              defaultValue={item.materials_presently_stored || 0}
                              onBlur={e => {
                                const v = parseFloat(e.target.value) || 0;
                                if (v !== item.materials_presently_stored) saveItem(item.id, 'materials_presently_stored', v);
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              style={{ width: 80, padding: '6px 8px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: GOLD, fontSize: 12, textAlign: 'right', outline: 'none' }}
                            />
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: WHITE, fontWeight: 600 }}>{fmt$(item.total_completed_stored)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: item.pct_complete >= 100 ? GREEN : DIM }}>{item.pct_complete.toFixed(1)}%</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: DIM }}>{fmt$(item.balance_to_finish)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: DIM }}>{fmt$(item.retainage)}</td>
                        </tr>
                      ))}
                      {/* TOTALS ROW */}
                      {sovItems.length > 0 && (
                        <tr style={{ background: BG, fontWeight: 700 }}>
                          <td style={{ padding: '12px' }} />
                          <td style={{ padding: '12px', color: WHITE }}>TOTALS</td>
                          <td style={{ padding: '12px', textAlign: 'right', color: GOLD }}>{fmt$(sovItems.reduce((s, i) => s + i.scheduled_value, 0))}</td>
                          <td style={{ padding: '12px', textAlign: 'right', color: DIM }}>{fmt$(sovItems.reduce((s, i) => s + i.work_from_previous, 0))}</td>
                          <td style={{ padding: '12px', textAlign: 'right', color: GOLD }}>{fmt$(sovItems.reduce((s, i) => s + i.work_this_period, 0))}</td>
                          <td style={{ padding: '12px', textAlign: 'right', color: GOLD }}>{fmt$(sovItems.reduce((s, i) => s + i.materials_presently_stored, 0))}</td>
                          <td style={{ padding: '12px', textAlign: 'right', color: WHITE }}>{fmt$(sovItems.reduce((s, i) => s + i.total_completed_stored, 0))}</td>
                          <td style={{ padding: '12px' }} />
                          <td style={{ padding: '12px', textAlign: 'right', color: DIM }}>{fmt$(sovItems.reduce((s, i) => s + i.balance_to_finish, 0))}</td>
                          <td style={{ padding: '12px', textAlign: 'right', color: DIM }}>{fmt$(sovItems.reduce((s, i) => s + i.retainage, 0))}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── G702 SUMMARY ──────────────────────────────── */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>G702 — Application Summary</span>
              </div>
              <div style={{ padding: '0' }}>
                {[
                  { label: 'Original Contract Sum', value: activeApp.original_contract_sum, bold: false },
                  { label: 'Net Change by Change Orders', value: activeApp.net_change_by_change_orders || 0, bold: false },
                  { label: 'Contract Sum to Date', value: activeApp.contract_sum_to_date, bold: true },
                  { label: `Total Completed & Stored (${activeApp.percent_complete?.toFixed(1) || 0}%)`, value: activeApp.total_completed_stored, bold: false },
                  { label: `Retainage (${activeApp.retainage_percent || 10}%)`, value: activeApp.retainage_held, bold: false, negative: true },
                  { label: 'Total Earned Less Retainage', value: activeApp.total_earned_less_retainage, bold: true },
                  { label: 'Less Previous Certificates', value: activeApp.less_previous_certificates, bold: false, negative: true },
                  { label: 'CURRENT PAYMENT DUE', value: activeApp.current_payment_due, bold: true, gold: true },
                  { label: 'Balance to Finish (incl retainage)', value: (activeApp.balance_to_finish || 0) + (activeApp.retainage_held || 0), bold: false },
                ].map(row => (
                  <div key={row.label} style={{
                    padding: '14px 20px', borderBottom: `1px solid ${BORDER}22`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: row.bold ? BG : 'transparent',
                  }}>
                    <span style={{ fontSize: 13, color: row.gold ? GOLD : row.bold ? WHITE : DIM, fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                    <span style={{
                      fontSize: row.gold ? 20 : 14,
                      fontWeight: row.bold ? 800 : 600,
                      color: row.gold ? GOLD : row.negative ? RED : WHITE,
                    }}>
                      {row.negative ? `(${fmt$(Math.abs(row.value))})` : fmt$(row.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* LIEN WAIVERS SECTION */}
      <div style={{ marginTop: 24 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: DIM,
            textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Lien Waivers
          </div>
        </div>

        {missingWaivers.length > 0 && (
          <div style={{
            background: 'rgba(248,81,73,0.07)', border: '1px solid rgba(248,81,73,0.25)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 12,
            fontSize: 12, color: RED, display: 'flex', gap: 10, alignItems: 'center',
          }}>
            <span>⚠️</span>
            <span>
              <strong>{missingWaivers.length} pay period{missingWaivers.length !== 1 ? 's' : ''}</strong>
              {' '}missing lien waivers.
            </span>
          </div>
        )}

        {waiversLoading ? (
          <IntelligenceIndicator variant="loading" size="sm" message="Loading waivers..." />
        ) : waivers.length === 0 ? (
          <div style={{ color: DIM, fontSize: 12, padding: '12px 0' }}>
            No waivers generated yet.
          </div>
        ) : (
          waivers.map(waiver => (
            <div key={waiver.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 0', borderBottom: '1px solid rgba(48,54,61,0.4)',
            }}>
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: waiver.status === 'signed' ? GREEN
                  : waiver.status === 'overdue' ? RED
                  : '#e3b341',
              }}>
                {waiver.status === 'signed' ? '✓ SIGNED'
                  : waiver.status === 'overdue' ? '⚠ OVERDUE'
                  : waiver.status === 'sent' ? '📧 SENT'
                  : '📋 DRAFT'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: WHITE }}>
                  {waiver.claimant_name}
                </div>
                <div style={{ fontSize: 11, color: DIM }}>
                  {(waiver.waiver_type || '').replace(/_/g, ' ')} · ${Number(waiver.amount || waiver.payment_amount || 0).toLocaleString()}
                  · Through {waiver.through_date}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {waiver.status === 'sent' && (
                  <button
                    onClick={async () => {
                      const r = await fetch(`/api/lien-waivers/${waiver.id}/mark-signed`,
                        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
                      if (r.ok) { fetchWaivers(); setToast('Waiver marked as signed') }
                    }}
                    style={{
                      background: 'rgba(46,160,67,0.1)', border: '1px solid rgba(46,160,67,0.3)',
                      color: GREEN, borderRadius: 5, padding: '4px 10px',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}>Mark Signed</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {previewOpen && previewMeta && activeApp && (
        <DocumentPreviewModal
          isOpen={previewOpen}
          onClose={() => setPreviewOpen(false)}
          onApprove={async () => {
            setPreviewOpen(false);
            setToast(`G702 #${previewMeta.appNumber} approved · $${Math.round(previewMeta.currentPaymentDue).toLocaleString()} due`);
          }}
          onRegenerate={handleGenerateG702}
          htmlContent={previewHtml}
          title={`G702 Application #${previewMeta.appNumber}`}
          docType="g702"
          sourceType="pay_application"
          sourceId={activeApp.id}
          projectId={projectId}
          emailLabel="Send G702 to Owner"
          emailSubject={`G702 Application #${previewMeta.appNumber} — ${previewMeta.gcName}`}
          keyFields={[
            { label: 'Application Number', value: String(previewMeta.appNumber || '') },
            { label: 'Current Payment Due', value: previewMeta.currentPaymentDue ? `$${Math.round(previewMeta.currentPaymentDue).toLocaleString()}` : '' },
            { label: 'Percent Complete',   value: previewMeta.pctComplete ? `${previewMeta.pctComplete}%` : '' },
            { label: 'Owner',              value: previewMeta.ownerName },
            { label: 'Contractor',         value: previewMeta.gcName },
          ]}
        />
      )}
    </div>
  );
}
