'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import { Clipboard, CheckCircle, XCircle, ArrowLeft, ArrowRight, PencilSimple, FloppyDisk, FileText, Plus, X, CaretUp, CaretDown, Export, SealCheck, CurrencyDollar, Files, Lock, Receipt, CalendarBlank, TrendUp, Coins, ClockCounterClockwise, IdentificationCard } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, FlowSteps, InsightRow, goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import { Skeleton, SkeletonKPI, SkeletonRow, SkeletonCard } from '@/components/ui/Skeleton';
import { openPdf } from '@/components/PdfViewer';

const GOLD='#F59E0B', DARK='#0a0a0a',
      BORDER='rgba(255,255,255,0.12)', DIM='#CBD5E1', TEXT='#FFFFFF',
      GREEN='#22c55e', RED='#ef4444', ORANGE='#f97316', BLUE='#FBBF24';

const fmt  = (n:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n||0);
const fmt2 = (n:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);
const fmtDate = (s:string|null|undefined) => s ? new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

const STATUS_META: Record<string,{label:string;color:string;bg:string;next?:string;nextLabel?:string}> = {
  draft:     {label:'Draft',     color:'#CBD5E1', bg:'rgba(148,163,184,.15)', next:'submitted',  nextLabel:'Submit to Owner'},
  submitted: {label:'Submitted', color:BLUE,      bg:'rgba(96,165,250,.15)',  next:'approved',   nextLabel:'Approve'},
  approved:  {label:'Approved',  color:GREEN,     bg:'rgba(34,197,94,.15)',   next:'certified',  nextLabel:'Certify'},
  certified: {label:'Certified', color:GOLD,      bg:'rgba(245, 158, 11,.15)', next:'paid',       nextLabel:'Mark Paid'},
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

  // Project intelligence — the detail walks in knowing the contract, the prior
  // application, and every lien waiver tied to this one (single reads on mount).
  const { ctx } = useProjectContext(projectId);
  const [allApps, setAllApps] = useState<any[]>([]);
  const [waivers, setWaivers] = useState<any[]>([]);
  useEffect(() => {
    // All three enrichment reads race in parallel (Promise.all) — none gates
    // another, and none gates the main pay-app load below.
    Promise.all([
      (async () => {
        try {
          const r = await fetch(`/api/pay-apps/list?projectId=${projectId}`);
          const d = await r.json();
          setAllApps(d.payApps || []);
        } catch {}
      })(),
      (async () => {
        try {
          const r = await fetch(`/api/lien-waivers/list?projectId=${projectId}`);
          const d = await r.json();
          setWaivers((d.lienWaivers || []).filter((w: any) => w.pay_application_id === id));
        } catch {}
      })(),
    ]);
  }, [projectId, id]);

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
      console.error(e); setToast({ msg: humanError(e, 'Failed to load the pay application.'), type: 'error' });
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
      console.error(e); setToast({ msg: humanError(e, 'Save failed. Please try again.'), type: 'error' });
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
      console.error(e); setToast({ msg: humanError(e, 'That action failed. Please try again.'), type: 'error' });
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
        openPdf({ url });
        if (d.g703Url) openPdf({ url: d.g703Url });
        setToast({ msg: 'PDF opened in new tab', type: 'success' });
      } else {
        console.error('pay app PDF error', d.error); setToast({ msg: humanError(d.error, 'PDF generation failed. Please try again.'), type: 'error' });
      }
    } catch {
      setToast({ msg: 'Download failed', type: 'error' });
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return (
    <PremiumSurface maxWidth={1600}>
      {/* Layout-true shell — back link stays live; the SOV table paints its real
          header immediately with skeleton rows underneath (house pattern: rfis). */}
      <Link href={`/app/projects/${projectId}/pay-apps`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.62)', fontSize: 13, textDecoration: 'none', marginBottom: 18 }}>
        <ArrowLeft size={14} weight="bold" /> Pay Applications
      </Link>
      <div style={{ marginBottom: 24 }}>
        <Skeleton width={130} height={11} style={{ marginBottom: 12 }} />
        <Skeleton width={280} height={34} style={{ marginBottom: 10 }} />
        <Skeleton width={420} height={13} style={{ maxWidth: '80%' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <SkeletonKPI /><SkeletonKPI /><SkeletonKPI /><SkeletonKPI /><SkeletonKPI />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'flex-start' }}>
        <SectionCard title="Schedule of Values" subtitle="G703 Continuation Sheet" icon={<FileText size={17} weight="duotone" color={GOLD} />} flush>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {['#', 'Description', 'Sched. Value', 'Prev ($)', 'This Period ($)', 'Stored ($)', '% Done', 'Balance', 'Retainage'].map(h => (
                    <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: DIM, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
          </div>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </SectionCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SkeletonCard height={190} />
          <SkeletonCard height={150} />
          <SkeletonCard height={120} />
        </div>
      </div>
    </PremiumSurface>
  );

  if (!payApp) return (
    <PremiumSurface maxWidth={1600}>
      <PremiumEmpty
        icon={<Clipboard size={30} weight="duotone" color={GOLD} />}
        title="Pay application not found"
        description="We couldn't find this pay application. It may have been removed, or the link is out of date."
        action={<Link href={`/app/projects/${projectId}/pay-apps`} style={goldButtonStyle} className="pmBtn"><ArrowLeft size={15} weight="bold" /> Back to Pay Applications</Link>}
      />
    </PremiumSurface>
  );

  const meta = STATUS_META[payApp.status] || STATUS_META.draft;
  const contractToDate = Number(payApp.contract_sum_to_date) || Number(payApp.contract_sum) || 0;
  const completePct = contractToDate > 0 ? Math.round((sovCompleted / contractToDate) * 100) : (Number(payApp.percent_complete) || 0);

  // Where this app sits in the approval / waiver / payment chain, plus the prior
  // application for period-over-period comparison (from the mount-time snapshots).
  const stageRank = ({ draft: 0, submitted: 1, approved: 2, certified: 3, paid: 4 } as Record<string, number>)[payApp.status] ?? 0;
  const wTotal = waivers.length;
  const wSigned = waivers.filter((w: any) => w.status === 'signed').length;
  const wBlocking = waivers.filter((w: any) => w.blocks_payment !== false && (w.status === 'pending' || w.status === 'sent')).length;
  const subCount = (ctx?.subs || []).length;
  const priorApp = (() => {
    const mine = Number((payApp as any).app_number ?? payApp.application_number) || 0;
    if (!mine) return null;
    let best: any = null;
    for (const a of allApps) {
      const n = Number(a.app_number ?? a.application_number) || 0;
      if (a.id !== id && n > 0 && n < mine && (!best || n > best._n)) best = { ...a, _n: n };
    }
    return best;
  })();
  const priorThis = Number(priorApp?.this_period) || 0;
  const priorDone = Number(priorApp?.total_completed_stored ?? priorApp?.total_completed) || 0;
  const thisDelta = sovThis - priorThis;

  const timeline = [
    { label: 'Created', date: null, done: true, icon: <PencilSimple size={15} color={DIM} weight="regular" /> },
    { label: 'Submitted', date: payApp.submitted_date, done: !!payApp.submitted_date, icon: <Export size={15} color={DIM} weight="regular" /> },
    { label: 'Approved', date: payApp.approved_date, done: !!payApp.approved_date, icon: <CheckCircle size={15} color={DIM} weight="regular" /> },
    { label: 'Certified', date: payApp.certified_date, done: !!payApp.certified_date, icon: <SealCheck size={15} color={DIM} weight="regular" /> },
    { label: 'Paid', date: null, done: payApp.status === 'paid', icon: <CurrencyDollar size={15} color={DIM} weight="regular" /> },
  ];

  return (
    <>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 99999, padding: '12px 22px', borderRadius: 10, background: toast.type === 'success' ? 'rgba(34,197,94,.92)' : 'rgba(239,68,68,.92)', color: '#fff', fontWeight: 700, fontSize: 14, boxShadow: '0 4px 24px rgba(0,0,0,.5)', pointerEvents: 'none' }}>
          {toast.type === 'success'
            ? <CheckCircle size={15} weight="fill" color="#fff" style={{ verticalAlign: 'middle', marginRight: 6 }} />
            : <XCircle size={15} weight="fill" color="#fff" style={{ verticalAlign: 'middle', marginRight: 6 }} />}{toast.msg}
        </div>
      )}

      <PremiumSurface maxWidth={1600}>

        {/* Back link */}
        <Link href={`/app/projects/${projectId}/pay-apps`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.62)', fontSize: 13, textDecoration: 'none', marginBottom: 18 }}>
          <ArrowLeft size={14} weight="bold" /> Pay Applications
        </Link>

        {/* Header */}
        <ModuleHero
          eyebrow="Pay Application"
          eyebrowIcon={<CurrencyDollar size={13} weight="fill" color="#F59E0B" />}
          aux={
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999, background: meta.bg, color: meta.color, border: `1px solid ${meta.color}44`, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {meta.label}
            </span>
          }
          title="Pay App"
          accent={`#${payApp.application_number}`}
          subtitle={`${payApp.projects?.name || 'Project'} · Period ${fmtDate(payApp.period_from)} – ${fmtDate(payApp.period_to)}`}
          actions={<>
            {isDraft && !editMode && (
              <button onClick={() => setEditMode(true)} style={goldOutlineButtonStyle} className="pmBtn">
                <PencilSimple size={15} weight="bold" /> Edit SOV
              </button>
            )}
            {canEdit && (
              <>
                <button onClick={() => { setEditMode(false); load(); }} style={ghostButtonStyle} className="pmBtn">
                  Cancel
                </button>
                <button onClick={saveEdits} disabled={saving}
                  style={{ ...goldButtonStyle, background: 'linear-gradient(135deg, #22c55e, #45B37D)', color: '#08240f', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.75 : 1 }} className="pmBtn">
                  {saving ? 'Saving…' : <><FloppyDisk size={15} weight="bold" /> Save Changes</>}
                </button>
              </>
            )}
            {meta.next && !editMode && (
              <button onClick={() => doAction(meta.next === 'paid' ? 'paid' : meta.next === 'submitted' ? 'submit' : meta.next === 'approved' ? 'approve' : 'certify')}
                disabled={actioning}
                style={{ ...goldButtonStyle, cursor: actioning ? 'wait' : 'pointer', opacity: actioning ? 0.7 : 1 }} className="pmBtn">
                {actioning ? '…' : <>{meta.nextLabel} <ArrowRight size={14} weight="bold" /></>}
              </button>
            )}
            <button onClick={downloadPDF} disabled={downloading} style={ghostButtonStyle} className="pmBtn">
              {downloading ? '…' : <><FileText size={15} weight="bold" /> G702/G703 PDF</>}
            </button>
          </>}
        />

        {/* Progress bar */}
        <SectionCard flat
          title="Project Completion"
          icon={<TrendUp size={17} weight="duotone" color={GOLD} />}
          action={<span style={{ fontSize: 22, fontWeight: 800, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{completePct}%</span>}
          style={{ marginBottom: 20 }}
        >
          <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, completePct)}%`, background: `linear-gradient(90deg, ${GOLD}, #22c55e)`, borderRadius: 999, transition: 'width .6s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: DIM, flexWrap: 'wrap', gap: 8 }}>
            <span>Contract: {fmt(contractToDate)}</span>
            <span>Completed to date: {fmt(sovCompleted)}</span>
            <span>Balance: {fmt(contractToDate - sovCompleted)}</span>
          </div>
        </SectionCard>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          <StatCard icon={<Receipt size={19} weight="duotone" color={GOLD} />} label="Contract Sum" value={fmt(contractToDate)} delay={0.02} />
          <StatCard icon={<CalendarBlank size={19} weight="duotone" color={GOLD} />} label="This Period" value={fmt(sovThis)} accent={GOLD} delay={0.06} />
          <StatCard icon={<CheckCircle size={19} weight="duotone" color={GREEN} />} label="Total Completed" value={fmt(sovCompleted)} accent={GREEN} delay={0.10} />
          <StatCard icon={<Coins size={19} weight="duotone" color={ORANGE} />} label="Retainage Held" value={fmt(sovRetainage)} accent={ORANGE} delay={0.14} />
          <StatCard icon={<CurrencyDollar size={19} weight="duotone" color={GREEN} />} label="Payment Due" value={fmt(sovPayment)} accent={GREEN} delay={0.18} />
        </div>

        {/* Main grid: SOV table + sidebar */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'flex-start' }}>

          {/* SOV Table */}
          <div>
            <SectionCard
              title="Schedule of Values"
              subtitle="G703 Continuation Sheet"
              icon={<FileText size={17} weight="duotone" color={GOLD} />}
              flush
              style={{ marginBottom: 16 }}
              action={canEdit ? (
                <button onClick={addLine}
                  style={{ ...goldOutlineButtonStyle, padding: '7px 14px', fontSize: 12 }} className="pmBtn">
                  <Plus size={13} weight="bold" /> Add Row
                </button>
              ) : undefined}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      {['#', 'Description', 'Sched. Value', 'Prev ($)', 'This Period ($)', 'Stored ($)', '% Done', 'Balance', 'Retainage', ...(canEdit ? [''] : [])].map(h => (
                        <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: DIM, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.06)`, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
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
                            <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden', minWidth: 40 }}>
                              <div style={{ height: '100%', width: `${Math.min(100, l.percent_complete)}%`, background: l.percent_complete >= 100 ? GREEN : GOLD, borderRadius: 999 }} />
                            </div>
                            <span style={{ color: TEXT, fontSize: 11, fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{l.percent_complete.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '7px 10px', color: l.balance_to_finish < 0 ? RED : DIM, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(l.balance_to_finish)}</td>
                        <td style={{ padding: '7px 10px', color: ORANGE, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt2(l.retainage)}</td>
                        {canEdit && (
                          <td style={{ padding: '4px 8px' }}>
                            <button onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}><X size={16} color={RED} weight="bold" style={{ verticalAlign: 'middle' }} /></button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'rgba(255,255,255,0.04)', borderTop: `2px solid ${BORDER}` }}>
                      <td colSpan={2} style={{ padding: '10px 10px', fontWeight: 800, fontSize: 11, color: TEXT, textTransform: 'uppercase', letterSpacing: 0.3 }}>TOTALS</td>
                      <td style={{ padding: '10px 10px', fontWeight: 800, color: GOLD, textAlign: 'right' }}>{fmt(sovScheduled)}</td>
                      <td style={{ padding: '10px 10px', fontWeight: 700, color: DIM, textAlign: 'right' }}>{fmt(sovPrev)}</td>
                      <td style={{ padding: '10px 10px', fontWeight: 800, color: GREEN, textAlign: 'right' }}>{fmt(sovThis)}</td>
                      <td style={{ padding: '10px 10px', fontWeight: 700, color: BLUE, textAlign: 'right' }}>{fmt(sovMats)}</td>
                      <td style={{ padding: '10px 10px', fontWeight: 700, color: TEXT }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 36, height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 999, overflow: 'hidden' }}>
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
            </SectionCard>

            {/* G702 Summary section */}
            <SectionCard flat title="G702 — Application Summary" icon={<FileText size={17} weight="duotone" color={GOLD} />}>
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
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                    <span style={{ fontSize: 12, color: DIM, flex: 1, paddingRight: 16 }}>{row.label}</span>
                    <span style={{ fontSize: row.large ? 18 : 13, fontWeight: row.bold ? 800 : 600, color: row.color || TEXT, whiteSpace: 'nowrap' }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Approval / waiver / payment chain — where this app sits */}
            <SectionCard flat title="Where This App Sits" icon={<SealCheck size={16} weight="duotone" color={GOLD} />}>
              <FlowSteps title="" steps={[
                { title: 'Draft & schedule of values', done: true,
                  desc: `${lines.length} SOV line${lines.length === 1 ? '' : 's'} — ${fmt(sovScheduled)} scheduled.` },
                { title: 'Submitted to owner', done: stageRank >= 1,
                  desc: stageRank >= 1
                    ? `Sent${payApp.submitted_date ? ` ${fmtDate(payApp.submitted_date)}` : ''} with a one-click owner approval link.`
                    : 'Sends the G702/G703 packet with a one-click owner approval link.' },
                { title: 'Owner approval', done: stageRank >= 2,
                  desc: stageRank >= 2
                    ? `Approved${payApp.approved_date ? ` ${fmtDate(payApp.approved_date)}` : ''} — conditional lien waivers generated for the subs.`
                    : 'Approval auto-generates conditional waivers for every sub on the job.' },
                { title: 'Lien waivers signed', done: stageRank >= 2 && wTotal > 0 && wBlocking === 0,
                  desc: wTotal > 0
                    ? `${wSigned} of ${wTotal} signed${wBlocking > 0 ? ` — ${wBlocking} still gate payment` : ' — payment gate clear'}.`
                    : subCount > 0
                      ? `Waivers for ${subCount} sub${subCount === 1 ? '' : 's'} generate at approval.`
                      : 'Waivers generate automatically at approval.' },
                { title: 'Payment received', done: payApp.status === 'paid',
                  desc: payApp.status === 'paid'
                    ? `${fmt(sovPayment)} collected — paid-to-date and the prime contract updated automatically.`
                    : `Mark Paid releases ${fmt(sovPayment)}${wBlocking > 0 ? ` — currently held by ${wBlocking} unsigned waiver${wBlocking === 1 ? '' : 's'}` : ''}. Signed conditionals convert to unconditional waivers.` },
              ]} />
            </SectionCard>

            {/* Prior application comparison */}
            {priorApp && (
              <SectionCard flat title={`Compared to App #${priorApp._n}`} icon={<TrendUp size={16} weight="duotone" color={GOLD} />}>
                <InsightRow label="Prior period" value={`${fmtDate(priorApp.period_from)} – ${fmtDate(priorApp.period_to)}`} />
                <InsightRow label="Prior billed (period)" value={fmt(priorThis)} />
                <InsightRow label="This app (period)" value={fmt(sovThis)} strong />
                <InsightRow label="Period-over-period" value={`${thisDelta < 0 ? '-' : '+'}${fmt(Math.abs(thisDelta))}`} accent={thisDelta >= 0 ? GREEN : ORANGE} />
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
                <InsightRow label="Completed then" value={fmt(priorDone)} />
                <InsightRow label="Completed now" value={fmt(sovCompleted)} accent={GREEN} />
                <InsightRow label="Prior payment due" value={fmt(Number(priorApp.current_payment_due) || 0)} />
                <InsightRow label="This payment due" value={fmt(sovPayment)} accent={GREEN} strong />
              </SectionCard>
            )}

            {/* Status timeline */}
            <SectionCard flat
              title="Status Timeline"
              icon={<ClockCounterClockwise size={16} weight="duotone" color={GOLD} />}
              action={
                <button onClick={() => setShowTimeline(!showTimeline)}
                  style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                  {showTimeline ? <CaretUp size={14} color={DIM} weight="bold" /> : <CaretDown size={14} color={DIM} weight="bold" />}
                </button>
              }
              bodyStyle={showTimeline ? undefined : { padding: 0 }}
            >
              {showTimeline && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {timeline.map((step, i) => (
                    <div key={step.label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: i < timeline.length - 1 ? 14 : 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: step.done ? 'rgba(34,197,94,.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${step.done ? 'rgba(34,197,94,.4)' : BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                          {step.done ? <CheckCircle size={16} weight="fill" color={GREEN} /> : step.icon}
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
            </SectionCard>

            {/* Details panel */}
            <SectionCard flat title="Details" icon={<IdentificationCard size={16} weight="duotone" color={GOLD} />}>
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
            </SectionCard>

            {/* Retainage breakdown */}
            <SectionCard flat title="Retainage Tracking" icon={<Coins size={16} weight="duotone" color={ORANGE} />} accent={ORANGE}>
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
            </SectionCard>

            {/* Quick links */}
            <SectionCard title="Related" icon={<Files size={16} weight="duotone" color={GOLD} />}>
              {[
                { icon: <ArrowLeft size={13} weight="bold" style={{ verticalAlign: 'middle', marginRight: 7 }} />, label: 'All Pay Apps', href: `/app/projects/${projectId}/pay-apps` },
                { icon: <Files size={13} weight="regular" style={{ verticalAlign: 'middle', marginRight: 7 }} />, label: 'Change Orders', href: `/app/projects/${projectId}/change-orders` },
                { icon: <Lock size={13} weight="regular" style={{ verticalAlign: 'middle', marginRight: 7 }} />, label: 'Lien Waivers', href: `/app/projects/${projectId}/lien-waivers` },
                { icon: <CurrencyDollar size={13} weight="regular" style={{ verticalAlign: 'middle', marginRight: 7 }} />, label: 'Project Budget', href: `/app/projects/${projectId}/budget` },
              ].map(link => (
                <Link key={link.href} href={link.href}
                  style={{ display: 'block', fontSize: 12, color: DIM, textDecoration: 'none', padding: '5px 0', borderBottom: `1px solid rgba(255,255,255,0.06)` }}
                  onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
                  onMouseLeave={e => (e.currentTarget.style.color = DIM)}>
                  {link.icon}{link.label}
                </Link>
              ))}
            </SectionCard>
          </div>
        </div>
      </PremiumSurface>
    </>
  );
}
