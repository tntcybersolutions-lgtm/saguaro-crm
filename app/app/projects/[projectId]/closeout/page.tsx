'use client';
/**
 * Project Closeout — the finish line (close / reopen gate), the twelve-item
 * closeout checklist, and the contract money that closes with it.
 *
 * Reads   GET  /api/projects/:id/closeout/checklist   (saved item states)
 *         GET  /api/projects/:id/close                (gate: blockers, contract)
 * Writes  POST /api/projects/:id/closeout/checklist   { items: [{id,status}] }
 *         POST /api/projects/:id/close                { force, closeout_date }
 *         DELETE /api/projects/:id/close              (reopen)
 * Docs    POST /api/documents/g704 | g706 | closeout  { projectId } → openPdf
 */
import React, { useState, useEffect } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { useParams } from 'next/navigation';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, Select, Menu,
  Callout, DetailList, Timeline, Toast, useToast,
  type Column, type Action, type StatItem,
} from '@/components/ui/kit';
import {
  CheckCircle, Check, ListChecks, FilePdf, Package, Wallet, Scales, Wrench, UsersThree,
  WarningCircle, ArrowCounterClockwise, Circle, Export,
} from '@phosphor-icons/react';
import { openPdf } from '@/components/PdfViewer';

/** YYYY-MM-DD on the user's device clock. */
const localYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface ChecklistItem {
  id: string;
  label: string;
  status: 'complete' | 'incomplete';
  generateEndpoint?: string;
  generateLabel?: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'final_pay_app', label: 'Final Pay App', status: 'incomplete' },
  { id: 'g706_affidavit', label: 'G706 Affidavit', status: 'incomplete', generateEndpoint: '/api/documents/g706', generateLabel: 'Generate G706' },
  { id: 'all_lien_waivers', label: 'All Lien Waivers', status: 'incomplete' },
  { id: 'g704_certificate', label: 'G704 Certificate of Substantial Completion', status: 'incomplete', generateEndpoint: '/api/documents/g704', generateLabel: 'Generate G704' },
  { id: 'bond_rider', label: 'Bond Rider', status: 'incomplete' },
  { id: 'w9_forms', label: 'W-9 Forms', status: 'incomplete' },
  { id: 'wh347_final', label: 'WH-347 Final Certified Payroll', status: 'incomplete' },
  { id: 'as_built_drawings', label: 'As-Built Drawings', status: 'incomplete' },
  { id: 'equipment_warranties', label: 'Equipment Warranties', status: 'incomplete' },
  { id: 'om_manuals', label: 'O&M Manuals', status: 'incomplete' },
  { id: 'final_inspection', label: 'Final Inspection', status: 'incomplete' },
  { id: 'certificate_of_occupancy', label: 'Certificate of Occupancy', status: 'incomplete' },
];
const ORDER = new Map(CHECKLIST_ITEMS.map((c, i) => [c.id, i]));

const CSS = `
.coCq { container: cows / inline-size; min-width: 0; }
.coGrid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
.coGrid > * { min-width: 0; }
@container cows (min-width: 1000px) { .coGrid { grid-template-columns: minmax(0, 1fr) 340px; } }
.coRail { display: flex; flex-direction: column; gap: 16px; }
.coProg { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border-subtle); }
.coProg .k-prog { flex: 1; margin-top: 0; height: 8px; }
.coProg strong { font-variant-numeric: tabular-nums; color: var(--text-primary); }
.coCheck { width: 26px; height: 26px; border-radius: 7px; border: 2px solid var(--border-strong); background: transparent; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: var(--bg-base); }
.coCheck[aria-checked="true"] { border-color: var(--success); background: var(--success); }
.coDone { color: var(--success); text-decoration: line-through; }
.coHint { font-size: 12px; line-height: 1.45; white-space: normal; color: var(--text-tertiary); }
.coHint[data-tone="warn"] { color: var(--warning); }
.coHint[data-tone="ready"] { color: var(--success); }
.coBadges { display: inline-flex; gap: 6px; flex-wrap: wrap; }
.coBlockers { display: flex; flex-wrap: wrap; gap: 8px; }
.coErr { font-size: var(--fs-sm); color: var(--danger); font-weight: 600; }
@media (max-width: 640px) {
  .coWs .k-btn, .coWs .k-stat, .coWs select.k-select, .coWs .k-input { min-height: 44px; }
  .coCheck { width: 32px; height: 32px; }
}
`;

export default function CloseoutPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [items, setItems] = useState<ChecklistItem[]>(CHECKLIST_ITEMS);
  const [generating, setGenerating] = useState<string | null>(null);
  const { toast, show } = useToast(4000);
  const [exporting, setExporting] = useState(false);
  // Project intelligence — punch, billing, retainage, and roster state.
  const { ctx } = useProjectContext(projectId);
  // Toolbar state — checklist search + complete/incomplete filter.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/closeout/checklist`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.items && Array.isArray(data.items)) {
          setItems(prev => prev.map(item => {
            const saved = data.items.find((s: any) => s.id === item.id);
            return saved ? { ...item, status: saved.status } : item;
          }));
        }
      } catch { /* use defaults */ }
    })();
  }, [projectId]);

  /* ── Actually closing the job ────────────────────────────────────────
     This screen tracked twelve documents and then stopped. There was no
     API and no button to set projects.status, so a finished job stayed
     'active' forever and kept turning up in every open-projects count.
     The columns were already on the table, unused. ── */
  const [gate, setGate] = useState<{
    closed: boolean;
    blockers: { key: string; label: string; count: number; href: string }[];
    unchecked: string[];
    project: Record<string, any> | null;
    /** Auto-filed "[Award pending]" waivers with no claimant — not blockers. */
    placeholderWaivers?: number;
    /** Contract sum read across every column it can live in (and the
     *  accepted proposal) — see lib/closeout-doc-data. */
    contract?: { original: number; approvedCoTotal: number; approvedCoCount: number; revised: number; source: string } | null;
  } | null>(null);
  const [closing, setClosing] = useState(false);
  const [confirmOverride, setConfirmOverride] = useState(false);
  const [closeErr, setCloseErr] = useState('');

  const loadGate = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/close`);
      if (!res.ok) { setGate(null); return; }
      setGate(await res.json());
    } catch {
      // Leave the panel unrendered rather than showing a gate we cannot vouch for.
      setGate(null);
    }
  }, [projectId]);

  useEffect(() => { loadGate(); }, [loadGate]);

  async function closeProject(force: boolean) {
    setClosing(true);
    setCloseErr('');
    try {
      const res = await fetch(`/api/projects/${projectId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The user's own calendar day. The server runs in UTC, so its "today"
        // is tomorrow for anyone closing a job on a US evening.
        body: JSON.stringify({ force, closeout_date: localYmd() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.needsConfirmation) {
        // Show what is open and make the override a separate, deliberate click.
        setGate(g => (g ? { ...g, blockers: data.blockers || [], unchecked: data.unchecked || [] } : g));
        setConfirmOverride(true);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Could not close the project.');
      setConfirmOverride(false);
      show('Project closed. It no longer counts as active work.');
      await loadGate();
    } catch (e: any) {
      setCloseErr(e?.message || 'Could not close the project. Please try again.');
    } finally {
      setClosing(false);
    }
  }

  async function reopenProject() {
    setClosing(true);
    setCloseErr('');
    try {
      const res = await fetch(`/api/projects/${projectId}/close`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not reopen the project.');
      show('Project reopened.');
      await loadGate();
    } catch (e: any) {
      setCloseErr(e?.message || 'Could not reopen the project. Please try again.');
    } finally {
      setClosing(false);
    }
  }

  const completed = items.filter(i => i.status === 'complete').length;
  const total = items.length;
  const pct = Math.round((completed / total) * 100);
  const exportDisabled = exporting || pct < 100;

  // Toolbar-driven view of the checklist; progress still reads the full list.
  const q = search.trim().toLowerCase();
  const visibleItems = items.filter(i =>
    (statusFilter === 'all' || i.status === statusFilter) &&
    (!q || i.label.toLowerCase().includes(q))
  );

  // Live figures from the project snapshot (DB numerics may arrive as strings).
  const fmtM = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const money = ctx?.money;
  /* The project snapshot reads only two contract columns, so a job whose
     contract lives on the accepted proposal showed a $0 contract and "fully
     billed". The closeout endpoint reads every place the contract can be;
     prefer it, and recompute the billed % against the same number. */
  const gateRevised = Number(gate?.contract?.revised) || 0;
  const revised = gateRevised || Number(money?.revisedContract) || 0;
  const billed = Number(money?.billedToDate) || 0;
  const billedPct = revised > 0 ? Math.round((billed / revised) * 1000) / 10 : 0;
  const openPunch = Number(ctx?.counts?.openPunch) || 0;
  const openRfis = Number(ctx?.counts?.openRfis) || 0;
  const billCount = Number(ctx?.counts?.bills) || 0;
  const subCount = (ctx?.subs || []).length;
  const lastApp = money?.lastPayApp || null;
  const retainageHeld = billed * ((Number(money?.retainagePct) || 0) / 100);
  const balanceToFinish = Math.max(0, revised - billed);
  // "Fully billed" only when there is a contract and it has been billed out —
  // $0 billed against a $0 contract is "no contract sum", not done.
  const fullyBilled = revised > 0 && billed >= revised;
  const balanceSub = revised <= 0 ? 'No contract sum set' : fullyBilled ? 'Fully billed' : 'Still to bill';
  // Unsigned waivers that actually block the close (placeholders excluded),
  // so the checklist and the gate count the same thing.
  const waiverBlockers = Number(gate?.blockers?.find(b => b.key === 'lien_waivers')?.count) || 0;
  const placeholderWaivers = Number(gate?.placeholderWaivers) || 0;
  const placeholderNote = placeholderWaivers > 0
    ? ` ${placeholderWaivers} placeholder waiver${placeholderWaivers === 1 ? '' : 's'} for unawarded bid packages ${placeholderWaivers === 1 ? 'has' : 'have'} no sub to sign and ${placeholderWaivers === 1 ? 'does' : 'do'} not block the close.`
    : '';
  const waiverHint = subCount > 0
    ? `${subCount} sub${subCount === 1 ? '' : 's'} on the job — each needs an unconditional final waiver before retainage releases.`
    : waiverBlockers > 0
      ? `No subs on the roster, but ${waiverBlockers} unsigned lien waiver${waiverBlockers === 1 ? ' is' : 's are'} on file — get ${waiverBlockers === 1 ? 'it' : 'them'} signed or void ${waiverBlockers === 1 ? 'it' : 'them'} before closing.`
      : 'No subs on the roster — only your own final waiver applies.';
  const pctComplete = Number(ctx?.project?.percentComplete) || 0;
  const docsDone = ['as_built_drawings', 'om_manuals', 'equipment_warranties', 'w9_forms'].every(id => items.find(i => i.id === id)?.status === 'complete');
  const inspectDone = ['final_inspection', 'certificate_of_occupancy'].every(id => items.find(i => i.id === id)?.status === 'complete');
  // What the data says about each checklist item — hints plus ready/attention flags.
  const ITEM_SIGNALS: Record<string, { hint?: string; ready?: boolean; warn?: boolean }> = ctx ? {
    final_pay_app: lastApp
      ? { hint: `App #${lastApp.appNumber} ${String(lastApp.status || '').replace(/_/g, ' ')} — billed ${billedPct}% of ${fmtM(revised)}.`, ready: billedPct >= 100, warn: billedPct > 0 && billedPct < 100 }
      : { hint: 'No pay applications yet — the final app closes out the contract sum.', warn: true },
    all_lien_waivers: { hint: waiverHint + placeholderNote, warn: waiverBlockers > 0 },
    final_inspection: openPunch > 0
      ? { hint: `${openPunch} punch item${openPunch === 1 ? '' : 's'} still open — clear the list before calling the inspection.`, warn: true }
      : { hint: 'Punch list is clear — schedule the final inspection.', ready: true },
    w9_forms: subCount > 0 ? { hint: `Collect a W-9 from each of the ${subCount} subs before final payment.` } : {},
    equipment_warranties: subCount > 0 ? { hint: `Request warranty letters from all ${subCount} subs for the owner's turnover binder.` } : {},
    g704_certificate: pctComplete > 0 ? { hint: `Project is ${pctComplete}% complete — the G704 fixes the substantial completion date.` } : {},
    g706_affidavit: billCount > 0
      ? { hint: `Swears payrolls, bills, and sub debts are settled — ${billCount} bill${billCount === 1 ? '' : 's'} recorded on this project.` }
      : { hint: 'Contractor affidavit that all debts are paid — generate it from live project data.' },
    as_built_drawings: openRfis > 0
      ? { hint: `${openRfis} RFI${openRfis === 1 ? '' : 's'} still open — close them so the as-builts capture the final answers.`, warn: true }
      : { hint: 'Mark up the record set with every field change and closed RFI.' },
    om_manuals: subCount > 0
      ? { hint: `Collect operating and maintenance manuals from equipment subs — ${subCount} on the roster.` }
      : { hint: 'Operating and maintenance manuals for every installed system, in one binder.' },
    wh347_final: { hint: 'Required on prevailing-wage work — the final certified payroll closes the labor record.' },
    bond_rider: { hint: 'Ask your surety to extend the performance bond through the warranty period.' },
    certificate_of_occupancy: items.find(i => i.id === 'final_inspection')?.status === 'complete'
      ? { hint: 'Final inspection passed — request the C of O from the building department.', ready: true }
      : { hint: 'Issued by the building department once the final inspection passes.' },
  } : {};

  async function toggleItem(id: string) {
    const prevItems = items;
    const newItems = items.map(i =>
      i.id === id ? { ...i, status: (i.status === 'complete' ? 'incomplete' : 'complete') as 'complete' | 'incomplete' } : i
    );
    setItems(newItems);
    try {
      const res = await fetch(`/api/projects/${projectId}/closeout/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: newItems.map(i => ({ id: i.id, status: i.status })) }),
      });
      if (!res.ok) throw new Error('save failed');
    } catch {
      // Revert the optimistic toggle so the UI reflects what actually persisted.
      setItems(prevItems);
      show('Could not save the checklist. Please try again.', 'bad');
    }
  }

  async function generateDoc(item: ChecklistItem) {
    if (!item.generateEndpoint) return;
    setGenerating(item.id);
    try {
      const res = await fetch(item.generateEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json().catch(() => ({}));
      const url = data.url || data.pdfUrl || data.downloadUrl;
      if (!res.ok || !url) throw new Error(data.error || 'generation failed');
      openPdf({ url });
      show(`${item.generateLabel} generated successfully.`);
    } catch {
      show(`Could not generate ${item.generateLabel}. Please try again.`, 'bad');
    } finally {
      setGenerating(null);
    }
  }

  async function exportCloseout() {
    setExporting(true);
    try {
      const res = await fetch('/api/documents/closeout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json().catch(() => ({}));
      const url = data.url || data.pdfUrl || data.downloadUrl;
      if (!res.ok || !url) throw new Error(data.error || 'generation failed');
      openPdf({ url });
      show('Closeout package generated.');
    } catch {
      show('Could not generate the closeout package. Please try again.', 'bad');
    } finally {
      setExporting(false);
    }
  }

  const G704: ChecklistItem = { id: 'g704', label: 'G704', status: 'incomplete', generateEndpoint: '/api/documents/g704', generateLabel: 'G704' };
  const G706: ChecklistItem = { id: 'g706', label: 'G706', status: 'incomplete', generateEndpoint: '/api/documents/g706', generateLabel: 'G706' };

  const base = `/app/projects/${projectId}`;
  const remaining = total - completed;
  const blockerCount = gate ? gate.blockers.reduce((s, b) => s + b.count, 0) : 0;

  const stats: StatItem[] = [
    { label: 'Checklist', value: `${pct}%`, tone: pct === 100 ? 'good' : 'default', sub: remaining === 0 ? 'All complete' : `${remaining} still outstanding`, icon: <ListChecks size={15} />, onClick: () => setStatusFilter(statusFilter === 'incomplete' ? 'all' : 'incomplete'), active: statusFilter === 'incomplete' },
    ...(ctx ? [
      { label: 'Balance to finish', value: fmtM(balanceToFinish), tone: fullyBilled ? 'good' : 'default', sub: balanceSub, icon: <Wallet size={15} /> } as StatItem,
      { label: 'Retainage held', value: `≈${fmtM(retainageHeld)}`, sub: `${Number(money?.retainagePct) || 0}% — releases at closeout`, icon: <Scales size={15} /> } as StatItem,
      { label: 'Open punch', value: openPunch, tone: openPunch > 0 ? 'bad' : 'good', sub: openPunch > 0 ? 'Blocks final inspection' : 'List is clear', icon: <Wrench size={15} />, href: `${base}/punch-list` } as StatItem,
      { label: 'Subs to clear', value: subCount, sub: 'Final waivers + W-9s', icon: <UsersThree size={15} /> } as StatItem,
    ] : []),
  ];

  const signalOf = (item: ChecklistItem) => (item.status === 'complete' ? undefined : ITEM_SIGNALS[item.id]);

  const columns: Column<ChecklistItem>[] = [
    {
      key: 'done', header: 'Done', width: 56, sortable: false, groupable: false, accessor: (r) => (r.status === 'complete' ? 1 : 0),
      render: (r) => (
        <button
          type="button"
          role="checkbox"
          aria-checked={r.status === 'complete'}
          aria-label={`${r.label}: ${r.status === 'complete' ? 'complete' : 'incomplete'}`}
          className="coCheck"
          onClick={(e) => { e.stopPropagation(); toggleItem(r.id); }}
        >
          {r.status === 'complete' && <Check size={15} weight="bold" />}
        </button>
      ),
    },
    {
      key: 'label', header: 'Item', primary: true, accessor: (r) => ORDER.get(r.id) ?? 99,
      render: (r) => {
        const sig = signalOf(r);
        return (
          <div className="k-cell-stack">
            <span className={r.status === 'complete' ? 'coDone' : undefined}>{r.label}</span>
            {sig?.hint && <div className="coHint" data-tone={sig.warn ? 'warn' : sig.ready ? 'ready' : undefined}>{sig.hint}</div>}
          </div>
        );
      },
    },
    {
      key: 'status', header: 'Status', phone: 'show', accessor: (r) => (r.status === 'complete' ? 'Complete' : 'Incomplete'),
      render: (r) => {
        const sig = signalOf(r);
        return (
          <span className="coBadges">
            <Badge tone={r.status === 'complete' ? 'ongoing' : 'neutral'} dot>{r.status === 'complete' ? 'Complete' : 'Incomplete'}</Badge>
            {sig?.ready && <Badge tone="ongoing">Ready</Badge>}
            {sig?.warn && <Badge tone="under_contract">Attention</Badge>}
          </span>
        );
      },
    },
  ];

  const rowActions = (r: ChecklistItem): Action[] => [
    { label: generating === r.id ? 'Generating…' : (r.generateLabel || 'Generate'), icon: <FilePdf size={14} />, onClick: () => generateDoc(r), inline: true, hidden: !r.generateEndpoint, disabled: generating === r.id },
    { label: r.status === 'complete' ? 'Mark incomplete' : 'Mark complete', icon: r.status === 'complete' ? <Circle size={15} /> : <CheckCircle size={15} />, onClick: () => toggleItem(r.id) },
  ];

  // The finish line: close / reopen, with the open items named and linked.
  const gatePanel = gate && (() => {
    const clear = gate.blockers.length === 0 && gate.unchecked.length === 0;
    const title = gate.closed
      ? 'This project is closed'
      : clear ? 'Ready to close' : `${blockerCount} item${blockerCount === 1 ? '' : 's'} still open across ${gate.blockers.length} area${gate.blockers.length === 1 ? '' : 's'}`;
    const text = gate.closed ? (
      <>
        Closed {gate.project?.closeout_date || '—'}.
        {gate.project?.substantial_completion_date && <> Substantial completion {gate.project.substantial_completion_date}.</>}
        {gate.project?.final_completion_date && <> Final completion {gate.project.final_completion_date}.</>}
        {' '}Reopening puts it back on the active list and clears the closeout date.
      </>
    ) : clear ? 'Punch list, RFIs, change orders, pay applications and lien waivers are all clear.' : (
      <div className="coBlockers" style={{ marginTop: 8 }}>
        {gate.blockers.map(b => (
          <Button key={b.key} size="sm" href={`${base}/${b.href}`}>{b.label}</Button>
        ))}
        {/* A query that failed is NOT reported as "nothing open" — a closeout
            gate that rubber-stamps on an error is worse than no gate. */}
        {gate.unchecked.length > 0 && <span className="coErr" style={{ alignSelf: 'center' }}>Could not check: {gate.unchecked.join(', ')}</span>}
      </div>
    );
    const actions = gate.closed ? (
      <Button icon={<ArrowCounterClockwise size={15} />} onClick={reopenProject} disabled={closing}>{closing ? 'Reopening…' : 'Reopen project'}</Button>
    ) : confirmOverride ? (
      <>
        <Button variant="danger" onClick={() => closeProject(true)} disabled={closing}>{closing ? 'Closing…' : 'Close anyway'}</Button>
        <Button variant="ghost" onClick={() => setConfirmOverride(false)}>Cancel</Button>
      </>
    ) : (
      <Button icon={<CheckCircle size={15} />} onClick={() => closeProject(false)} disabled={closing}>{closing ? 'Closing…' : 'Close project'}</Button>
    );
    return (
      <>
        <Callout
          tone={gate.closed || clear ? 'success' : 'warning'}
          icon={gate.closed || clear ? <CheckCircle size={18} weight="fill" /> : <WarningCircle size={18} weight="fill" />}
          title={title}
          text={text}
          actions={actions}
        />
        {closeErr && <div className="coErr" role="alert" style={{ marginTop: 8 }}>{closeErr}</div>}
      </>
    );
  })();

  const lienDone = items.find(i => i.id === 'all_lien_waivers')?.status === 'complete';
  const path = [
    { key: 'punch', done: !!ctx && openPunch === 0, title: 'Clear the punch list', meta: openPunch > 0 ? `${openPunch} open` : 'Clear' },
    { key: 'bill', done: fullyBilled, title: 'Bill the contract out', meta: revised > 0 ? `${fmtM(billed)} of ${fmtM(revised)} · ${billedPct}%` : 'No contract sum' },
    { key: 'waivers', done: lienDone, title: 'Collect final waivers', meta: subCount > 0 ? `${subCount} subs` : 'Your own final' },
    { key: 'docs', done: docsDone, title: 'Assemble turnover docs', meta: 'As-builts, O&M, warranties, W-9s' },
    { key: 'inspect', done: inspectDone, title: 'Inspect and certify', meta: 'Final inspection, then C of O' },
    { key: 'export', done: pct === 100, title: 'Export the package', meta: pct === 100 ? 'Ready' : `${remaining} item${remaining === 1 ? '' : 's'} to go` },
  ];

  return (
    <div className="coWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
          { label: 'Closeout' },
        ]}
        title="Closeout"
        badge={gate?.closed ? <Badge tone="closed" dot>Closed</Badge> : undefined}
        subtitle={`${completed} of ${total} items complete — ${pct}% ready for handover.`}
        actions={
          <>
            <Menu
              triggerLabel="Documents"
              triggerIcon={<FilePdf size={15} />}
              actions={[
                { label: 'Generate G704', icon: <FilePdf size={15} />, onClick: () => generateDoc(G704), disabled: !!generating },
                { label: 'Generate G706', icon: <FilePdf size={15} />, onClick: () => generateDoc(G706), disabled: !!generating },
              ]}
            />
            <Button variant="primary" icon={<Export size={15} />} onClick={exportCloseout} disabled={exportDisabled} title={pct < 100 ? 'Unlocks when every checklist item is complete' : undefined}>
              {exporting ? 'Generating…' : 'Export closeout package'}
            </Button>
          </>
        }
      >
        {gatePanel}

        <StatRow items={stats} />

        <Toolbar
          search={search}
          onSearch={setSearch}
          placeholder="Search closeout items…"
          filters={
            <Select aria-label="Status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 'auto', minWidth: 150 }}
              options={[{ value: 'all', label: 'All items' }, { value: 'incomplete', label: 'Incomplete' }, { value: 'complete', label: 'Complete' }]} />
          }
          actions={<span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)' }}>{visibleItems.length} of {items.length}</span>}
        />

        <div className="coCq">
          <div className="coGrid">
            <Card flush>
              <div className="coProg" aria-label={`Closeout ${pct}% complete`}>
                <span className="k-prog" aria-hidden><span style={{ width: `${pct}%`, background: pct === 100 ? 'var(--success)' : 'var(--brand-primary)' }} /></span>
                <strong>{pct}%</strong>
              </div>
              <DataTable<ChecklistItem>
                tableId="project-closeout"
                exportName="closeout-checklist"
                toolbar={false}
                columns={columns}
                rows={visibleItems}
                rowKey={(r) => r.id}
                defaultSort={{ key: 'label', dir: 'asc' }}
                rowActions={rowActions}
                empty={<EmptyState title="No checklist items match" text="Change the search or the filter." action={<Button onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear filters</Button>} />}
              />
            </Card>

            <div className="coRail">
              <Card title="Path to handover" icon={<Package size={16} />}>
                <Timeline items={path.map(p => ({
                  key: p.key,
                  tone: p.done ? 'success' : 'neutral',
                  icon: p.done ? <Check size={12} weight="bold" /> : <Circle size={10} />,
                  title: p.title,
                  meta: p.meta,
                }))} />
              </Card>
              {ctx && (
                <Card title="Contract" icon={<Wallet size={16} />}>
                  <DetailList items={[
                    ['Revised Contract', fmtM(revised)],
                    ['Billed to Date', `${fmtM(billed)} · ${billedPct}%`],
                    ['Balance to Finish', fmtM(balanceToFinish)],
                    ['Retainage Held', `≈${fmtM(retainageHeld)}`],
                    ...(lastApp ? [[`Pay App #${lastApp.appNumber} status`, String(lastApp.status || '—').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())] as [string, React.ReactNode]] : []),
                  ]} />
                </Card>
              )}
            </div>
          </div>
        </div>
      </PageShell>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
