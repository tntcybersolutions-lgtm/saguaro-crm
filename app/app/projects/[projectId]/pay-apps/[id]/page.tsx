'use client';
/**
 * Pay Application detail — Pass 4, on the RFIs reference layout (record + rail).
 *
 * Anatomy: crumbs → title (Pay App #N) + the ONE workflow primary (Submit to
 * Owner / Approve / Certify / Mark Paid — whichever is next) with PDF and Edit
 * SOV as secondaries → StatRow (contract / this period / completed / retainage
 * / payment due) → workspace: the G703 schedule of values and the G702 summary
 * on the left, a 320–384px rail (status, where it sits in the approval /
 * waiver / payment chain, prior-app comparison, details, retainage, related)
 * on the right. Phone: stacked.
 *
 * Money: aligned, tabular, two decimals, never truncated. Approval and
 * record-payment stay the explicit existing POST workflows.
 *
 * API surface (unchanged):
 *   GET  /api/pay-apps/[id] -> { payApp, lineItems }
 *   PUT  /api/pay-apps/[id] -> { success }   (draft SOV edits)
 *   POST /api/pay-apps/[id]/{submit|approve|certify|paid}
 *   POST /api/documents/pay-application  (G702 / G703 PDF)
 *   GET  /api/pay-apps/list, /api/lien-waivers/list (rail enrichment)
 *
 * Note: the daily_logs-style column drift applies here too — the table's SOV
 * columns are prev_completed / this_period / stored_materials; the old
 * work_* names stay optional so a payload using them still works.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import { useParams, useRouter } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import {
  Clipboard, ArrowLeft, ArrowRight, PencilSimple, FloppyDisk, FileText, Plus, X,
  Files, Lock, CurrencyDollar, WarningCircle,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, EmptyState, DetailList, Input, Toast, useToast,
  type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { FlowSteps, InsightRow } from '@/components/ui/premium';
import { openPdf } from '@/components/PdfViewer';
import { layout } from '@/lib/design-tokens';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n:number) => money.format(Number(n)||0);
/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC. */
const fmtDate = (s:string|null|undefined) => s ? new Date(String(s).slice(0,10)+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';

const STATUS_META: Record<string,{label:string;tone:BadgeTone;next?:string;nextLabel?:string;action?:string}> = {
  draft:     {label:'Draft',     tone:'neutral',        next:'submitted',  nextLabel:'Submit to Owner', action:'submit'},
  submitted: {label:'Submitted', tone:'under_contract', next:'approved',   nextLabel:'Approve',         action:'approve'},
  approved:  {label:'Approved',  tone:'ongoing',        next:'certified',  nextLabel:'Certify',         action:'certify'},
  certified: {label:'Certified', tone:'ongoing',        next:'paid',       nextLabel:'Mark Paid',       action:'paid'},
  paid:      {label:'Paid',      tone:'completed'},
};

interface SovLine {
  id?: string;
  line_number: number;
  description: string;
  scheduled_value: number;
  prev_completed?: number;
  this_period?: number;
  stored_materials?: number;
  work_from_prev?: number;
  work_this_period?: number;
  materials_stored?: number;
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
  const total = (l.prev_completed ?? l.work_from_prev ?? 0)
              + (l.this_period ?? l.work_this_period ?? 0)
              + (l.stored_materials ?? l.materials_stored ?? 0);
  const sv = l.scheduled_value || 0;
  return {
    ...l,
    total_completed: total,
    percent_complete: sv > 0 ? Math.round((total / sv) * 1000) / 10 : 0,
    balance_to_finish: sv - total,
    retainage: Math.round(total * (retPct / 100) * 100) / 100,
  };
}

const CSS = `
.pdWs > .k-page { max-width: none; }
.pdCq { container: pdws / inline-size; min-width: 0; }
.pdSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.pdSplit > * { min-width: 0; }
.pdMain { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.pdRail { order: -1; display: flex; flex-direction: column; gap: 16px; }
@container pdws (min-width: 960px) {
  .pdSplit { grid-template-columns: minmax(0, 1fr) clamp(${layout.detailRailMin}px, 28%, ${layout.detailRailMax}px); }
  .pdRail { order: 0; }
}
.pdBar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--border-subtle); font-size: var(--fs-sm); color: var(--text-tertiary); }
.pdBarTrack { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.08); overflow: hidden; min-width: 80px; }
.pdBarFill { height: 100%; border-radius: 3px; background: var(--status-ongoing); transition: width .4s; }
.pdBar b { color: var(--text-primary); font-variant-numeric: tabular-nums; }
.pdTableWrap { overflow-x: auto; }
.pdTable { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.pdTable th { position: sticky; top: 0; z-index: 1; background: rgba(21,23,28,0.88); text-align: left; padding: 8px 10px; font-size: 12px; font-weight: 700; color: var(--text-tertiary); border-bottom: 1px solid var(--border-default); white-space: nowrap; }
.pdTable td { padding: 6px 10px; height: 44px; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary); white-space: nowrap; font-variant-numeric: tabular-nums; vertical-align: middle; }
.pdTable th:first-child, .pdTable td:first-child { padding-left: var(--sp-4); position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.pdTable th:first-child { background: var(--bg-solid-2); z-index: 3; }
.pdTable th[data-align="right"], .pdTable td[data-align="right"] { text-align: right; }
.pdTable td[data-desc] { white-space: normal; min-width: 200px; color: var(--text-primary); }
.pdTable tfoot td { font-weight: 800; color: var(--text-primary); background: var(--bg-surface-2); border-top: 2px solid var(--border-default); }
.pdTable .k-input { min-height: 32px; padding: 4px 8px; font-size: 13px; }
.pdTable .k-input[data-num] { text-align: right; width: 110px; }
.pdPct { display: inline-flex; align-items: center; gap: 6px; min-width: 90px; }
.pdPctTrack { flex: 1; height: 5px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; min-width: 40px; }
.pdPctFill { height: 100%; border-radius: 999px; background: var(--status-under-contract); }
.pdPctFill[data-done="true"] { background: var(--status-ongoing); }
.pdPct > b { color: var(--text-primary); font-size: var(--fs-xs); min-width: 36px; text-align: right; }
.pdNeg { color: var(--status-overdue); }
.pdStrong { color: var(--text-primary); font-weight: 700; }
.pdSummary { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 0 32px; }
.pdRow { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--border-subtle); font-size: var(--fs-sm); }
.pdRow > span:first-child { color: var(--text-tertiary); }
.pdRow > span + span { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--text-primary); font-weight: 600; }
.pdRow[data-strong="true"] > span + span { font-weight: 800; }
.pdRow[data-large="true"] > span + span { font-size: var(--fs-lg); }
.pdSection { display: flex; flex-direction: column; gap: 8px; }
.pdSection + .pdSection { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
.pdBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pdNext { font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.5; }
.pdActions { display: flex; flex-direction: column; gap: 8px; }
.pdActions .k-btn { width: 100%; justify-content: flex-start; }
.pdRule { height: 1px; background: var(--border-subtle); margin: 8px 0; }
.pdMuted { color: var(--text-tertiary); }
.pdSkel { height: 14px; border-radius: 4px; background: var(--border-subtle); }
@media (max-width: 640px) {
  .pdWs .k-btn, .pdWs .k-stat, .pdWs .k-input { min-height: 44px; }
}
`;

export default function PayAppDetailPage() {
  const { projectId, id } = useParams() as { projectId: string; id: string };
  const router = useRouter();

  const [payApp, setPayApp]     = useState<PayApp | null>(null);
  const [lines, setLines]       = useState<SovLine[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [actioning, setActioning] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const { toast, show } = useToast(4000);
  const setToast = (t:{msg:string;type:'success'|'error'}) => show(t.msg, t.type==='success'?'good':'bad');
  const [downloading, setDownloading] = useState(false);
  const [loadError, setLoadError] = useState('');

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

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const headers = await getAuthHeaders();
      const r = await fetch(`/api/pay-apps/${id}`, { headers });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setPayApp(d.payApp);
      setLines((d.lineItems || []).map((l: SovLine) => calcLine(l, d.payApp?.retainage_percent || 10)));
    } catch (e: unknown) {
      console.error(e);
      const msg = humanError(e, 'Failed to load the pay application.');
      setLoadError(msg);
      setToast({ msg, type: 'error' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const retPct = payApp?.retainage_percent || 10;
  const isDraft = payApp?.status === 'draft';
  const canEdit = isDraft && editMode;

  // Live totals from SOV lines
  const sovScheduled  = lines.reduce((s,l) => s + (l.scheduled_value||0), 0);
  const sovPrev       = lines.reduce((s,l) => s + (l.prev_completed ?? l.work_from_prev ?? 0), 0);
  const sovThis       = lines.reduce((s,l) => s + (l.this_period ?? l.work_this_period ?? 0), 0);
  const sovMats       = lines.reduce((s,l) => s + (l.stored_materials ?? l.materials_stored ?? 0), 0);
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
            /* Resolved, not raw. A row loaded from the database carries
               prev_completed / this_period / stored_materials; sending the
               work_* names straight through meant a sheet that was merely
               opened and saved was written back as zeros. The API accepts
               these names and maps them onto the real columns. */
            work_from_prev: l.prev_completed ?? l.work_from_prev ?? 0,
            work_this_period: l.this_period ?? l.work_this_period ?? 0,
            materials_stored: l.stored_materials ?? l.materials_stored ?? 0,
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
      setToast({ msg: 'Pay application saved.', type: 'success' });
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
      const labels: Record<string,string> = { submit:'Submitted to owner.', approve:'Approved.', certify:'Certified.', paid:'Marked as paid.' };
      setToast({ msg: labels[action] || 'Updated.', type: 'success' });
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
        setToast({ msg: 'PDF opened in a new tab.', type: 'success' });
      } else {
        console.error('pay app PDF error', d.error); setToast({ msg: humanError(d.error, 'PDF generation failed. Please try again.'), type: 'error' });
      }
    } catch {
      setToast({ msg: 'Download failed.', type: 'error' });
    } finally {
      setDownloading(false);
    }
  }

  const crumbsBase = [
    { label: 'Projects', href: '/app/projects' },
    { label: ctx?.project?.name || payApp?.projects?.name || 'Project', href: `/app/projects/${projectId}/overview` },
    { label: 'Pay Applications', href: `/app/projects/${projectId}/pay-apps` },
  ];

  if (loading) return (
    <div className="pdWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell crumbs={[...crumbsBase, { label: 'Loading…' }]} title="Pay Application" subtitle="Loading the G702 / G703…">
        <Card flush>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }} aria-busy="true">
            {[0,1,2,3,4,5].map(i => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 110px 110px 110px 110px', gap: 14, alignItems: 'center' }}>
                <div className="pdSkel" /><div className="pdSkel" style={{ width: '70%' }} /><div className="pdSkel" /><div className="pdSkel" /><div className="pdSkel" /><div className="pdSkel" />
              </div>
            ))}
          </div>
        </Card>
      </PageShell>
    </div>
  );

  if (!payApp) return (
    <div className="pdWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell crumbs={[...crumbsBase, { label: loadError ? 'Error' : 'Not Found' }]} title="Pay Application">
        <Card flush>
          <EmptyState
            icon={loadError ? <WarningCircle size={22} /> : <Clipboard size={22} />}
            title={loadError ? "Couldn't load the pay application" : 'Pay application not found'}
            text={loadError ? `${loadError} Nothing has been lost — try again.` : "We couldn't find this pay application. It may have been removed, or the link is out of date."}
            action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>{loadError && <Button onClick={load}>Retry</Button>}<Button icon={<ArrowLeft size={15} />} href={`/app/projects/${projectId}/pay-apps`}>Back to Pay Applications</Button></div>}
          />
        </Card>
      </PageShell>
    </div>
  );

  const meta = STATUS_META[payApp.status] || STATUS_META.draft;
  const appNum = (payApp as any).app_number ?? payApp.application_number ?? '';
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

  const stats: StatItem[] = [
    { label: 'Contract Sum', value: fmt(contractToDate), sub: `${fmt(Number(payApp.contract_sum)||0)} original ${Number(payApp.change_orders_total||0)>=0?'+':'-'} ${fmt(Math.abs(Number(payApp.change_orders_total)||0))} COs` },
    { label: 'This Period', value: fmt(sovThis), sub: `${fmtDate(payApp.period_from)} – ${fmtDate(payApp.period_to)}` },
    { label: 'Total Completed', value: fmt(sovCompleted), tone: 'good', sub: `${completePct}% of contract` },
    { label: 'Retainage Held', value: fmt(sovRetainage), sub: `${retPct}% on completed to date` },
    { label: 'Payment Due', value: fmt(sovPayment), tone: 'good', sub: wBlocking > 0 ? `Held by ${wBlocking} unsigned waiver${wBlocking===1?'':'s'}` : 'Line 8 of the G702' },
  ];

  const nextAction = meta.action;

  return (
    <div className="pdWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[...crumbsBase, { label: `#${appNum}` }]}
        /* app_number is the column; application_number does not exist on
           pay_applications, so the older read gave "Pay App #undefined". */
        title={`Pay App #${appNum}`}
        subtitle={`${payApp.projects?.name || ctx?.project?.name || 'Project'} · Period ${fmtDate(payApp.period_from)} – ${fmtDate(payApp.period_to)}`}
        actions={<>
          <Button icon={<FileText size={15} />} onClick={downloadPDF} disabled={downloading}>{downloading ? 'Generating…' : 'G702 / G703 PDF'}</Button>
          {isDraft && !editMode && (
            <Button icon={<PencilSimple size={15} />} onClick={() => setEditMode(true)}>Edit SOV</Button>
          )}
          {canEdit && (
            <>
              <Button variant="ghost" onClick={() => { setEditMode(false); load(); }} disabled={saving}>Cancel</Button>
              <Button variant="primary" icon={<FloppyDisk size={15} />} onClick={saveEdits} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
            </>
          )}
          {meta.next && nextAction && !editMode && (
            <Button variant="primary" icon={<ArrowRight size={15} />} onClick={() => doAction(nextAction)} disabled={actioning}>
              {actioning ? 'Working…' : meta.nextLabel}
            </Button>
          )}
        </>}
      >
        <StatRow items={stats} />

        <div className="pdCq">
          <div className="pdSplit">
            <div className="pdMain">
              {/* SOV — G703 continuation sheet */}
              <Card
                title="Schedule of Values"
                subtitle="G703 Continuation Sheet"
                flush
                actions={canEdit ? <Button size="sm" icon={<Plus size={13} weight="bold" />} onClick={addLine}>Add Row</Button> : undefined}
              >
                <div className="pdBar" aria-label="Project completion">
                  <span>Completed to date</span>
                  <div className="pdBarTrack"><div className="pdBarFill" style={{ width: `${Math.min(100, completePct)}%` }} /></div>
                  <b>{completePct}%</b>
                  <span>{fmt(sovCompleted)} of {fmt(contractToDate)} · balance {fmt(contractToDate - sovCompleted)}</span>
                </div>
                <div className="pdTableWrap">
                  <table className="pdTable k-table-skin">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Description</th>
                        <th data-align="right">Scheduled Value</th>
                        <th data-align="right">Previous</th>
                        <th data-align="right">This Period</th>
                        <th data-align="right">Stored</th>
                        <th>% Done</th>
                        <th data-align="right">Balance</th>
                        <th data-align="right">Retainage</th>
                        {canEdit && <th aria-label="Remove" />}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.length === 0 && (
                        <tr><td colSpan={canEdit ? 10 : 9} className="pdMuted" style={{ textAlign: 'center', height: 64 }}>No schedule of values lines on this application.</td></tr>
                      )}
                      {lines.map((l, i) => (
                        <tr key={i}>
                          <td className="pdStrong">{l.line_number}</td>
                          <td data-desc="true">
                            {canEdit
                              ? <Input value={l.description} onChange={e => updateLine(i, 'description', e.target.value)} placeholder="Description" aria-label={`Line ${l.line_number} description`} />
                              : (l.description || <span className="pdMuted">—</span>)}
                          </td>
                          {canEdit
                            ? (['scheduled_value','work_from_prev','work_this_period','materials_stored'] as const).map(f => (
                                <td key={f} data-align="right">
                                  <Input type="number" data-num="true" value={(l as unknown as Record<string,number>)[f] || ''} onChange={e => updateLine(i, f, e.target.value)} placeholder="0" aria-label={`Line ${l.line_number} ${f.replace(/_/g,' ')}`} />
                                </td>
                              ))
                            : <>
                                <td data-align="right" className="pdStrong">{fmt(l.scheduled_value)}</td>
                                <td data-align="right">{fmt(l.prev_completed ?? l.work_from_prev ?? 0)}</td>
                                <td data-align="right" className="pdStrong">{fmt(l.this_period ?? l.work_this_period ?? 0)}</td>
                                <td data-align="right">{fmt(l.stored_materials ?? l.materials_stored ?? 0)}</td>
                              </>
                          }
                          <td>
                            <span className="pdPct">
                              <span className="pdPctTrack"><span className="pdPctFill" data-done={l.percent_complete >= 100 ? 'true' : undefined} style={{ display: 'block', width: `${Math.min(100, l.percent_complete)}%` }} /></span>
                              <b>{l.percent_complete.toFixed(0)}%</b>
                            </span>
                          </td>
                          <td data-align="right" className={l.balance_to_finish < 0 ? 'pdNeg' : undefined}>{fmt(l.balance_to_finish)}</td>
                          <td data-align="right">{fmt(l.retainage)}</td>
                          {canEdit && (
                            <td><Button variant="ghost" size="sm" icon={<X size={14} weight="bold" />} aria-label={`Remove line ${l.line_number}`} onClick={() => removeLine(i)} /></td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2}>Totals</td>
                        <td data-align="right">{fmt(sovScheduled)}</td>
                        <td data-align="right">{fmt(sovPrev)}</td>
                        <td data-align="right">{fmt(sovThis)}</td>
                        <td data-align="right">{fmt(sovMats)}</td>
                        <td><span className="pdPct"><span className="pdPctTrack"><span className="pdPctFill" data-done={completePct >= 100 ? 'true' : undefined} style={{ display: 'block', width: `${Math.min(100, completePct)}%` }} /></span><b>{completePct}%</b></span></td>
                        <td data-align="right">{fmt(lines.reduce((s,l) => s + (l.balance_to_finish||0), 0))}</td>
                        <td data-align="right">{fmt(sovRetainage)}</td>
                        {canEdit && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>

              {/* G702 Summary */}
              <Card title="G702 — Application Summary" subtitle="Application and Certificate for Payment">
                <div className="pdSummary">
                  {[
                    { label: '1. Original Contract Sum', value: fmt(payApp.contract_sum) },
                    { label: '2. Net Change by Change Orders', value: fmt(payApp.change_orders_total || 0) },
                    { label: '3. Contract Sum to Date (1+2)', value: fmt(contractToDate), strong: true },
                    { label: '4. Total Completed & Stored to Date', value: fmt(sovCompleted) },
                    { label: `5. Retainage (${retPct}%)`, value: fmt(sovRetainage) },
                    { label: '6. Total Earned Less Retainage (4–5)', value: fmt(sovEarned) },
                    { label: '7. Less Previous Certificates for Payment', value: fmt(sovPrev * (1 - retPct / 100)) },
                    { label: '8. Current Payment Due (6–7)', value: fmt(sovPayment), strong: true, large: true },
                    { label: '9. Balance to Finish, Including Retainage', value: fmt(contractToDate - sovCompleted + sovRetainage) },
                  ].map(row => (
                    <div key={row.label} className="pdRow" data-strong={row.strong ? 'true' : undefined} data-large={row.large ? 'true' : undefined}>
                      <span>{row.label}</span>
                      <span>{row.value}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <aside className="pdRail" aria-label="Pay application details and actions">
              <Card title="Details">
                <div className="pdSection">
                  <div className="pdBadges">
                    <Badge tone={meta.tone} dot>{meta.label}</Badge>
                    {wTotal > 0 && <Badge tone={wBlocking > 0 ? 'under_contract' : 'ongoing'}>{wSigned} of {wTotal} waivers signed</Badge>}
                  </div>
                  <div className="pdNext">
                    {payApp.status === 'draft' && 'Draft — edit the schedule of values, then submit the G702/G703 packet to the owner.'}
                    {payApp.status === 'submitted' && 'With the owner. Approval generates conditional lien waivers for the subs.'}
                    {payApp.status === 'approved' && 'Approved by the owner. Certify once the architect signs off.'}
                    {payApp.status === 'certified' && `Certified. Mark Paid releases ${fmt(sovPayment)}${wBlocking > 0 ? ` — currently held by ${wBlocking} unsigned waiver${wBlocking===1?'':'s'}` : ''}.`}
                    {payApp.status === 'paid' && `${fmt(sovPayment)} collected — paid-to-date and the prime contract updated automatically.`}
                  </div>
                </div>
                <div className="pdSection">
                  <DetailList items={[
                    ['Owner', payApp.owner_name || ''],
                    ['Architect', payApp.architect_name || ''],
                    ['Retainage', `${retPct}%`],
                    ['Submitted', fmtDate(payApp.submitted_date)],
                    ['Approved', fmtDate(payApp.approved_date)],
                    ['Certified', fmtDate(payApp.certified_date)],
                    ['Paid', payApp.status === 'paid' ? 'Yes' : '—'],
                  ]} />
                </div>
                <div className="pdSection">
                  <div className="pdActions">
                    <Button icon={<ArrowLeft size={16} />} onClick={() => router.push(`/app/projects/${projectId}/pay-apps`)}>All Pay Apps</Button>
                    <Button icon={<Files size={16} />} href={`/app/projects/${projectId}/change-orders`}>Change Orders</Button>
                    <Button icon={<Lock size={16} />} href={`/app/projects/${projectId}/lien-waivers`}>Lien Waivers</Button>
                    <Button icon={<CurrencyDollar size={16} />} href={`/app/projects/${projectId}/budget`}>Project Budget</Button>
                  </div>
                </div>
              </Card>

              <Card title="Where This App Sits">
                <FlowSteps title="" steps={[
                  { title: 'Draft & Schedule of Values', done: true,
                    desc: `${lines.length} SOV line${lines.length === 1 ? '' : 's'} — ${fmt(sovScheduled)} scheduled.` },
                  { title: 'Submitted to Owner', done: stageRank >= 1,
                    desc: stageRank >= 1
                      ? `Sent${payApp.submitted_date ? ` ${fmtDate(payApp.submitted_date)}` : ''} with a one-click owner approval link.`
                      : 'Sends the G702/G703 packet with a one-click owner approval link.' },
                  { title: 'Owner Approval', done: stageRank >= 2,
                    desc: stageRank >= 2
                      ? `Approved${payApp.approved_date ? ` ${fmtDate(payApp.approved_date)}` : ''} — conditional lien waivers generated for the subs.`
                      : 'Approval auto-generates conditional waivers for every sub on the job.' },
                  { title: 'Lien Waivers Signed', done: stageRank >= 2 && wTotal > 0 && wBlocking === 0,
                    desc: wTotal > 0
                      ? `${wSigned} of ${wTotal} signed${wBlocking > 0 ? ` — ${wBlocking} still gate payment` : ' — payment gate clear'}.`
                      : subCount > 0
                        ? `Waivers for ${subCount} sub${subCount === 1 ? '' : 's'} generate at approval.`
                        : 'Waivers generate automatically at approval.' },
                  { title: 'Payment Received', done: payApp.status === 'paid',
                    desc: payApp.status === 'paid'
                      ? `${fmt(sovPayment)} collected — paid-to-date and the prime contract updated automatically.`
                      : `Mark Paid releases ${fmt(sovPayment)}${wBlocking > 0 ? ` — currently held by ${wBlocking} unsigned waiver${wBlocking === 1 ? '' : 's'}` : ''}. Signed conditionals convert to unconditional waivers.` },
                ]} />
              </Card>

              {priorApp && (
                <Card title={`Compared to App #${priorApp._n}`}>
                  <InsightRow label="Prior Period" value={`${fmtDate(priorApp.period_from)} – ${fmtDate(priorApp.period_to)}`} />
                  <InsightRow label="Prior Billed (Period)" value={fmt(priorThis)} />
                  <InsightRow label="This App (Period)" value={fmt(sovThis)} strong />
                  <InsightRow label="Period-over-Period" value={`${thisDelta < 0 ? '-' : '+'}${fmt(Math.abs(thisDelta))}`} />
                  <div className="pdRule" />
                  <InsightRow label="Completed Then" value={fmt(priorDone)} />
                  <InsightRow label="Completed Now" value={fmt(sovCompleted)} />
                  <InsightRow label="Prior Payment Due" value={fmt(Number(priorApp.current_payment_due) || 0)} />
                  <InsightRow label="This Payment Due" value={fmt(sovPayment)} strong />
                </Card>
              )}

              <Card title="Retainage Tracking">
                <InsightRow label="Rate" value={`${retPct}%`} strong />
                <InsightRow label="Held This App" value={fmt(sovRetainage)} />
                <InsightRow label="Released to Date" value={fmt(0)} />
                <div className="pdNext" style={{ marginTop: 8 }}>Retainage is released at closeout; nothing has been released on this application.</div>
              </Card>
            </aside>
          </div>
        </div>
      </PageShell>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
