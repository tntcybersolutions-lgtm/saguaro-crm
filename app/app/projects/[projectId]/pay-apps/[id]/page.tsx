'use client';
/**
 * Pay Application detail — kit record page (record + rail).
 *
 * Anatomy: crumbs (Projects › Job › Pay Applications › #N) → title + the ONE
 * workflow primary (Submit to
 * Owner / Approve / Certify / Mark Paid — whichever is next) with PDF and Edit
 * SOV as secondaries → StatRow (contract / this period / completed / retainage
 * / payment due) → workspace: the G703 schedule of values and the G702 summary
 * on the left, a 320–384px rail (status, where it sits in the approval /
 * waiver / payment chain, prior-app comparison, details, retainage, related)
 * on the right. Phone: stacked. The G703 is the shared DataTable — totals row,
 * columns, CSV export — with inputs in its cells while a draft is edited.
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
 * work_* names stay optional so a payload using them still works. An edit to
 * Previous / This Period / Stored writes BOTH names on the line, so the value
 * typed is the value the totals use and the value the PUT sends (the PUT body
 * shape is unchanged: resolved work_* names per line).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import { useParams, useRouter } from 'next/navigation';
import { getAuthHeaders } from '@/lib/supabase-browser';
import {
  Clipboard, ArrowLeft, ArrowRight, PencilSimple, FloppyDisk, FileText, Plus, X,
  Files, Lock, CurrencyDollar, WarningCircle, Scales, CalendarBlank, ChartBar, Vault, Wallet,
  CheckCircle, Circle,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, EmptyState, DetailList, Input, Toast, useToast,
  DataTable, Timeline,
  type BadgeTone, type StatItem, type Column,
} from '@/components/ui/kit';
import { openPdf } from '@/components/PdfViewer';
import { layout } from '@/lib/design-tokens';
import { retainageRate, type RetainageLedger } from '@/lib/retainage';
import RelatedItems from '@/components/related/RelatedItems';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n:number) => money.format(Number(n)||0);
/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC;
 *  a full timestamp (submitted_at / approved_at) is read as the instant it is. */
const fmtDate = (s:string|null|undefined) => s
  ? (String(s).length > 10 ? new Date(String(s)) : new Date(String(s).slice(0,10)+'T12:00:00')).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
  : '—';

const STATUS_META: Record<string,{label:string;tone:BadgeTone;next?:string;nextLabel?:string;action?:string}> = {
  draft:     {label:'Draft',     tone:'neutral',        next:'submitted',  nextLabel:'Submit to Owner', action:'submit'},
  submitted: {label:'Submitted', tone:'under_contract', next:'approved',   nextLabel:'Approve',         action:'approve'},
  approved:  {label:'Approved',  tone:'ongoing',        next:'certified',  nextLabel:'Certify',         action:'certify'},
  certified: {label:'Certified', tone:'ongoing',        next:'paid',       nextLabel:'Mark Paid',       action:'paid'},
  paid:      {label:'Paid',      tone:'completed'},
  /* Returned by the owner (or the approvals inbox): edit the SOV, resubmit. */
  rejected:  {label:'Returned',  tone:'overdue',        next:'submitted',  nextLabel:'Resubmit to Owner', action:'submit'},
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
  cost_code?: string | null;
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
  less_previous_certificates?: number | string | null;
  total_retainage?: number | string | null;
  current_payment_due: number;
  /* The columns are submitted_at / approved_at / certified_at; there are no
     *_date columns on pay_applications, so the rail read '—' for every
     date. The *_date names stay optional for an older payload. */
  submitted_at?: string | null;
  approved_at?: string | null;
  certified_at?: string | null;
  submitted_date?: string | null;
  approved_date?: string | null;
  certified_date?: string | null;
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

/* The three money columns of a G703 line, each with its live column name and
   its older alias. Reads resolve live-name-first (as calcLine does); edits
   write both, so neither name can hold a stale figure. */
const MONEY_FIELDS = {
  prev:   { live: 'prev_completed',   alias: 'work_from_prev',   label: 'previous' },
  this:   { live: 'this_period',      alias: 'work_this_period', label: 'this period' },
  stored: { live: 'stored_materials', alias: 'materials_stored', label: 'stored' },
} as const;
type MoneyKey = keyof typeof MONEY_FIELDS;
const moneyOf = (l: SovLine, k: MoneyKey) => {
  const f = MONEY_FIELDS[k];
  return Number(l[f.live] ?? l[f.alias] ?? 0) || 0;
};

/** One label / value line in a rail ladder (prior-app comparison, retainage). */
function LadderRow({ label, value, strong }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean }) {
  return <div className="pdRow" data-strong={strong ? 'true' : undefined}><span>{label}</span><span>{value}</span></div>;
}

type SovRow = { l: SovLine; i: number };

/** A number input in a DataTable cell keeps ↑/↓ for itself (step the value)
 *  instead of letting the row's keyboard navigation take them. */
const keepArrows = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.stopPropagation();
};

const CSS = `
.pdWs > .k-page { max-width: none; }
.pdCq { container: pdws / inline-size; min-width: 0; }
.pdSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.pdSplit > * { min-width: 0; }
.pdMain { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.pdRelated { padding: 4px 4px 0; }
.pdRail { order: -1; display: flex; flex-direction: column; gap: 16px; }
@container pdws (min-width: 960px) {
  .pdSplit { grid-template-columns: minmax(0, 1fr) clamp(${layout.detailRailMin}px, 28%, ${layout.detailRailMax}px); }
  .pdRail { order: 0; }
}
.pdBar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--border-subtle); font-size: var(--fs-sm); color: var(--text-tertiary); }
.pdBarTrack { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.08); overflow: hidden; min-width: 80px; }
.pdBarFill { height: 100%; border-radius: 3px; background: var(--status-ongoing); transition: width .4s; }
.pdBar b { color: var(--text-primary); font-variant-numeric: tabular-nums; }
.pdSov .k-table td .k-input { min-height: 32px; padding: 4px 8px; font-size: 13px; }
.pdSov .k-table td .k-input[data-num] { text-align: right; width: 110px; }
.pdSov [data-desc] .k-input { min-width: 200px; }
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
  .pdSov .k-table td .k-input[data-num], .pdSov [data-desc] .k-input { width: 100%; min-width: 0; }
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
  /** Server-read retainage ledger: held on the prior app, released before this
   *  one, and G702 line 7 (lib/retainage). Null until the app loads. */
  const [ledger, setLedger] = useState<RetainageLedger | null>(null);

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
        } catch (e) {
          // Enrichment only (prior-app comparison) — the page renders without it.
          console.error('pay app list', e);
        }
      })(),
      (async () => {
        try {
          const r = await fetch(`/api/lien-waivers/list?projectId=${projectId}`);
          const d = await r.json();
          setWaivers((d.lienWaivers || []).filter((w: any) => w.pay_application_id === id));
        } catch (e) {
          // Enrichment only (waiver chain) — the page renders without it.
          console.error('lien waivers', e);
        }
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
      setLedger(d.retainage ?? null);
      setLines((d.lineItems || []).map((l: SovLine) => calcLine(l, retainageRate(d.payApp?.retainage_percent))));
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

  // A 0 % release app stays 0 % — never the 10 % default (lib/retainage).
  const retPct = retainageRate(payApp?.retainage_percent);
  const isDraft = payApp?.status === 'draft' || payApp?.status === 'rejected';
  const canEdit = isDraft && editMode;

  // Live totals from SOV lines
  const sovScheduled  = lines.reduce((s,l) => s + (l.scheduled_value||0), 0);
  const sovPrev       = lines.reduce((s,l) => s + (l.prev_completed ?? l.work_from_prev ?? 0), 0);
  const sovThis       = lines.reduce((s,l) => s + (l.this_period ?? l.work_this_period ?? 0), 0);
  const sovMats       = lines.reduce((s,l) => s + (l.stored_materials ?? l.materials_stored ?? 0), 0);
  const sovCompleted  = sovPrev + sovThis + sovMats;
  const sovRetainage  = Math.round(sovCompleted * (retPct / 100) * 100) / 100;
  const sovEarned     = sovCompleted - sovRetainage;
  /* G702 line 7 = line 6 of the previous application, as certified. Re-deriving
     it from this app's rate (sovPrev × (1 − rate)) was right only while the
     rate never changed: on a release app at 0 % it swallowed the release and
     under-stated the payment due by the whole retainage. */
  const storedPrev    = Number(payApp?.less_previous_certificates);
  const lessPrevCerts = ledger ? ledger.previousCertificates
    : Number.isFinite(storedPrev) && payApp?.less_previous_certificates != null ? storedPrev
    : Math.round(sovPrev * (1 - retPct / 100) * 100) / 100;
  const sovPayment    = Math.max(0, Math.round((sovEarned - lessPrevCerts) * 100) / 100);
  // Released on this app = the drop from what the prior app held (live while a draft is edited).
  const heldBefore      = ledger?.heldBefore ?? 0;
  const releasedThisApp = ledger && ledger.priorAppNumber != null ? Math.max(0, Math.round((heldBefore - sovRetainage) * 100) / 100) : 0;
  const releasedToDate  = (ledger?.releasedBefore ?? 0) + releasedThisApp;

  function updateLine(i: number, field: keyof SovLine, val: string) {
    setLines(prev => {
      const next = [...prev];
      const updated = { ...next[i], [field]: field === 'description' || field === 'csi_code' ? val : (parseFloat(val) || 0) };
      next[i] = calcLine(updated, retPct);
      return next;
    });
  }

  /** Previous / This Period / Stored: the typed number lands on the live column
   *  name AND its alias, so calcLine, the totals and the PUT all see it. */
  function updateMoney(i: number, k: MoneyKey, val: string) {
    const n = parseFloat(val) || 0;
    const f = MONEY_FIELDS[k];
    setLines(prev => {
      const next = [...prev];
      next[i] = calcLine({ ...next[i], [f.live]: n, [f.alias]: n }, retPct);
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
            // The column is cost_code; a loaded row never carries csi_code.
            cost_code: l.cost_code ?? l.csi_code ?? null,
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
  const submittedOn = payApp.submitted_at ?? payApp.submitted_date ?? null;
  const approvedOn = payApp.approved_at ?? payApp.approved_date ?? null;
  const certifiedOn = payApp.certified_at ?? payApp.certified_date ?? null;
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
    { label: 'Contract Sum', value: fmt(contractToDate), icon: <Scales size={15} />, sub: `${fmt(Number(payApp.contract_sum)||0)} original ${Number(payApp.change_orders_total||0)>=0?'+':'-'} ${fmt(Math.abs(Number(payApp.change_orders_total)||0))} COs` },
    { label: 'This Period', value: fmt(sovThis), icon: <CalendarBlank size={15} />, sub: `${fmtDate(payApp.period_from)} – ${fmtDate(payApp.period_to)}` },
    { label: 'Total Completed', value: fmt(sovCompleted), tone: 'good', icon: <ChartBar size={15} />, sub: `${completePct}% of contract` },
    { label: 'Retainage Held', value: fmt(sovRetainage), icon: <Vault size={15} />, sub: `${retPct}% on completed to date` },
    { label: 'Payment Due', value: fmt(sovPayment), tone: wBlocking > 0 ? 'warn' : 'good', icon: <Wallet size={15} />, sub: wBlocking > 0 ? `Held by ${wBlocking} unsigned waiver${wBlocking===1?'':'s'}` : 'Line 8 of the G702' },
  ];

  // ── G703 columns: read-only figures, or inputs while a draft is edited ──
  const pctCell = (pct: number) => (
    <span className="pdPct">
      <span className="pdPctTrack"><span className="pdPctFill" data-done={pct >= 100 ? 'true' : undefined} style={{ display: 'block', width: `${Math.min(100, Math.max(0, pct))}%` }} /></span>
      <b>{pct.toFixed(0)}%</b>
    </span>
  );
  const completedOf = (list: SovRow[]) => list.reduce((a, r) => a + moneyOf(r.l, 'prev') + moneyOf(r.l, 'this') + moneyOf(r.l, 'stored'), 0);
  const moneyCol = (k: MoneyKey, header: string, strong?: boolean): Column<SovRow> => ({
    key: k, header, align: 'right', total: 'sum', format: fmt, phone: canEdit || k === 'this' ? 'show' : 'hide',
    accessor: (r) => moneyOf(r.l, k),
    render: (r) => canEdit
      ? <Input type="number" data-num="true" onKeyDown={keepArrows} value={moneyOf(r.l, k) || ''} onChange={e => updateMoney(r.i, k, e.target.value)} placeholder="0" aria-label={`Line ${r.l.line_number} ${MONEY_FIELDS[k].label}`} />
      : <span className={strong ? 'pdStrong' : undefined}>{fmt(moneyOf(r.l, k))}</span>,
  });
  const sovColumns: Column<SovRow>[] = [
    { key: 'line_number', header: '#', width: 56, groupable: false, accessor: (r) => r.l.line_number, render: (r) => <span className="pdStrong">{r.l.line_number}</span> },
    {
      key: 'description', header: 'Description', primary: true, phone: 'show', accessor: (r) => r.l.description || '',
      render: (r) => canEdit
        ? <span data-desc="true"><Input value={r.l.description} onChange={e => updateLine(r.i, 'description', e.target.value)} placeholder="Description" aria-label={`Line ${r.l.line_number} description`} /></span>
        : (r.l.description || <span className="pdMuted">—</span>),
    },
    {
      key: 'scheduled_value', header: 'Scheduled Value', align: 'right', total: 'sum', format: fmt, phone: 'show',
      accessor: (r) => Number(r.l.scheduled_value) || 0,
      render: (r) => canEdit
        ? <Input type="number" data-num="true" onKeyDown={keepArrows} value={r.l.scheduled_value || ''} onChange={e => updateLine(r.i, 'scheduled_value', e.target.value)} placeholder="0" aria-label={`Line ${r.l.line_number} scheduled value`} />
        : <span className="pdStrong">{fmt(r.l.scheduled_value)}</span>,
    },
    moneyCol('prev', 'Previous'),
    moneyCol('this', 'This Period', true),
    moneyCol('stored', 'Stored'),
    {
      key: 'percent_complete', header: '% Done', phone: 'hide', groupable: false, accessor: (r) => r.l.percent_complete,
      total: (list) => { const sv = list.reduce((a, r) => a + (Number(r.l.scheduled_value) || 0), 0); return pctCell(sv > 0 ? Math.round((completedOf(list) / sv) * 1000) / 10 : 0); },
      render: (r) => pctCell(r.l.percent_complete),
    },
    {
      key: 'balance_to_finish', header: 'Balance', align: 'right', total: 'sum', format: fmt, phone: 'hide',
      accessor: (r) => r.l.balance_to_finish,
      render: (r) => <span className={r.l.balance_to_finish < 0 ? 'pdNeg' : undefined}>{fmt(r.l.balance_to_finish)}</span>,
    },
    {
      key: 'retainage', header: 'Retainage', align: 'right', phone: 'hide', accessor: (r) => r.l.retainage, format: fmt,
      // Same rounding as the G702 line 5: retainage on the summed completed figure.
      total: (list) => fmt(Math.round(completedOf(list) * (retPct / 100) * 100) / 100),
      render: (r) => fmt(r.l.retainage),
    },
    { key: 'csi_code', header: 'CSI', hidden: true, phone: 'hide', accessor: (r) => r.l.cost_code || r.l.csi_code || '' },
  ];
  const sovRows: SovRow[] = lines.map((l, i) => ({ l, i }));

  // Where this app sits in the approval / waiver / payment chain.
  const chain = [
    { title: 'Draft & Schedule of Values', done: true,
      body: `${lines.length} SOV line${lines.length === 1 ? '' : 's'} — ${fmt(sovScheduled)} scheduled.` },
    { title: 'Submitted to Owner', done: stageRank >= 1,
      body: stageRank >= 1 ? `Sent${submittedOn ? ` ${fmtDate(submittedOn)}` : ''}.` : 'Not sent yet.' },
    { title: 'Owner Approval', done: stageRank >= 2,
      body: stageRank >= 2 ? `Approved${approvedOn ? ` ${fmtDate(approvedOn)}` : ''} — conditional waivers generated.` : 'Waiting on the owner.' },
    { title: 'Lien Waivers Signed', done: stageRank >= 2 && wTotal > 0 && wBlocking === 0,
      body: wTotal > 0
        ? `${wSigned} of ${wTotal} signed${wBlocking > 0 ? ` — ${wBlocking} still gate payment` : ' — payment gate clear'}.`
        : subCount > 0 ? `${subCount} sub${subCount === 1 ? '' : 's'} on the job — waivers generate at approval.` : 'Waivers generate at approval.' },
    { title: 'Payment Received', done: payApp.status === 'paid',
      body: payApp.status === 'paid'
        ? `${fmt(sovPayment)} collected.`
        : `${fmt(sovPayment)} due${wBlocking > 0 ? ` — held by ${wBlocking} unsigned waiver${wBlocking === 1 ? '' : 's'}` : ''}.` },
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
        badge={<span className="pdBadges"><Badge tone={meta.tone} dot>{meta.label}</Badge>{wTotal > 0 && <Badge tone={wBlocking > 0 ? 'under_contract' : 'ongoing'}>{wSigned} of {wTotal} waivers signed</Badge>}</span>}
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
                <div className="pdSov">
                  <DataTable<SovRow>
                    tableId="project-pay-app-sov"
                    exportName={`pay-app-${appNum}-g703`}
                    columns={sovColumns}
                    rows={sovRows}
                    rowKey={(r) => r.i}
                    defaultSort={{ key: 'line_number', dir: 'asc' }}
                    rowActions={canEdit ? (r) => [{ label: 'Remove', icon: <X size={14} weight="bold" />, onClick: () => removeLine(r.i), tone: 'danger', inline: true }] : undefined}
                    empty={<EmptyState title="No schedule of values lines on this application" action={canEdit ? <Button icon={<Plus size={15} weight="bold" />} onClick={addLine}>Add Row</Button> : undefined} />}
                  />
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
                    { label: '7. Less Previous Certificates for Payment', value: fmt(lessPrevCerts) },
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

              {/* Related items: the change orders, invoices and commitments this application bills */}
              <div className="pdRelated">
                <RelatedItems type="pay_app" id={id} projectId={projectId} />
              </div>
            </div>

            <aside className="pdRail" aria-label="Pay application details and actions">
              <Card title="Details">
                <div className="pdSection">
                  <div className="pdNext">
                    {payApp.status === 'draft' && 'Draft — edit the schedule of values, then submit the G702/G703 packet to the owner.'}
                    {payApp.status === 'rejected' && `Returned for revision${(payApp as any).rejection_reason ? `: “${(payApp as any).rejection_reason}”` : ''}. Fix the schedule of values, then resubmit.`}
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
                    ['Submitted', fmtDate(submittedOn)],
                    ['Approved', fmtDate(approvedOn)],
                    ['Certified', fmtDate(certifiedOn)],
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
                <Timeline items={chain.map((c) => ({
                  key: c.title,
                  icon: c.done ? <CheckCircle size={16} weight="fill" /> : <Circle size={16} />,
                  tone: c.done ? 'success' : 'neutral',
                  title: c.title,
                  body: c.body,
                }))} />
              </Card>

              {priorApp && (
                <Card title={`Compared to App #${priorApp._n}`}>
                  <LadderRow label="Prior Period" value={`${fmtDate(priorApp.period_from)} – ${fmtDate(priorApp.period_to)}`} />
                  <LadderRow label="Prior Billed (Period)" value={fmt(priorThis)} />
                  <LadderRow label="This App (Period)" value={fmt(sovThis)} strong />
                  <LadderRow label="Period-over-Period" value={`${thisDelta < 0 ? '-' : '+'}${fmt(Math.abs(thisDelta))}`} />
                  <div className="pdRule" />
                  <LadderRow label="Completed Then" value={fmt(priorDone)} />
                  <LadderRow label="Completed Now" value={fmt(sovCompleted)} />
                  <LadderRow label="Prior Payment Due" value={fmt(Number(priorApp.current_payment_due) || 0)} />
                  <LadderRow label="This Payment Due" value={fmt(sovPayment)} strong />
                </Card>
              )}

              <Card title="Retainage Tracking">
                <LadderRow label="Rate" value={`${retPct}%`} strong />
                {ledger?.priorAppNumber != null && <LadderRow label={`Held on App #${ledger.priorAppNumber}`} value={fmt(heldBefore)} />}
                <LadderRow label="Held This App" value={fmt(sovRetainage)} />
                <LadderRow label="Released This App" value={fmt(releasedThisApp)} />
                <LadderRow label="Released to Date" value={ledger ? fmt(releasedToDate) : '—'} strong />
                <div className="pdNext" style={{ marginTop: 8 }}>
                  {!ledger ? 'Loading the retainage history for this job.'
                    : releasedThisApp > 0 ? `${fmt(releasedThisApp)} released on this application — it is part of the ${fmt(sovPayment)} payment due.`
                    : releasedToDate > 0 ? `${fmt(releasedToDate)} released on earlier applications. Nothing released on this one.`
                    : retPct > 0 ? `Held at ${retPct}% — released when an application bills a lower rate.`
                    : 'Billed at 0% — no retainage held.'}
                </div>
              </Card>
            </aside>
          </div>
        </div>
      </PageShell>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
