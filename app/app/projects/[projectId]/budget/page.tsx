'use client';
/**
 * Budget — every cost code on the job in one grid: original, approved changes,
 * revised, committed, direct, actual, cost to complete, forecast and over/under,
 * with totals, grouping, saved views and export from the shared DataTable.
 *
 * Reads   GET   /api/projects/:id/budget          (lines + contract)
 * Adds    POST  /api/projects/:id/budget          { cost_code, description, original_budget, project_id }
 * Edits   PATCH /api/projects/:id/budget          { id, original_budget } | { id, _delete: true }
 * Export  POST  /api/reports/generate             { reportType: 'job-cost', projectId } → CSV
 * Money is summed in integer cents (lib/calc) so totals never drift.
 */
import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import {
  WarningCircle, ClipboardText, Handshake, Hourglass, ChartLineUp, Plus, DownloadSimple,
  PencilSimple, ChartBar, Copy, Trash, Package,
} from '@phosphor-icons/react';
import { toCents, toDollars, sumCents, subCents, addCents, scaleCents } from '@/lib/calc';
import {
  PageShell, StatRow, Button, Toolbar, Select, DataTable, EmptyState, Card, ItemList, ItemRow,
  FormModal, FormGrid, Field, Input, Callout, Toast, useToast,
  type Column, type StatItem,
} from '@/components/ui/kit';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';

const fmt = (n: number | null | undefined) => '$' + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSigned = (n: number) => (n >= 0 ? '+' : '') + fmt(n);

interface BudgetLine {
  id: string;
  cost_code: string;
  description: string;
  original_budget: number;
  approved_cos: number;
  revised_budget: number;
  committed_cost: number;
  actual_cost: number;
  pct_complete: number;
  forecast_cost: number;
  category: string;
  /** Rolled up from this job's commitments, POs and bills (budget API). */
  direct_costs?: number;
  projected_cost?: number;
  committed_source?: 'commitments' | 'entered';
}

interface AddLineForm {
  cost_code: string;
  description: string;
  original_budget: string;
}

type LineFilter = 'all' | 'over' | 'watch';

const isOver = (l: BudgetLine) => (l.actual_cost ?? 0) > (l.revised_budget ?? 0);
const isWatch = (l: BudgetLine) => !isOver(l) && (l.revised_budget ?? 0) > 0 && (l.actual_cost ?? 0) / (l.revised_budget ?? 0) > 0.9;

export default function BudgetPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [contract, setContract] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddLineForm>({ cost_code: '', description: '', original_budget: '' });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [search, setSearch] = useState('');
  const [lineFilter, setLineFilter] = useState<LineFilter>('all');

  /* ── Unsaved-work guard: the composer holds real typing, so leaving this
   *    module (sidebar, field nav, ⌘K, breadcrumb, back) confirms first, and
   *    the draft is kept on this device either way. ── */
  const composerDirty = useComposerDirty(showAddForm, addForm);
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `budget:${projectId}`,
    draftData: addForm,
    restoreDraft: (d) => { setAddForm(d as typeof addForm); setShowAddForm(true); },
    onSave: () => addLine(),
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [exporting, setExporting] = useState(false);
  const { toast, show } = useToast(4000);

  // SmartCreate intelligence — one /api/project-context snapshot so the add
  // flow walks in knowing the contract, bid packages, and prior coding.
  const { ctx } = useProjectContext(projectId);
  const [csiDiv, setCsiDiv] = useState('');
  const [autoFill, setAutoFill] = useState<{ code?: boolean; desc?: boolean; amount?: boolean }>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/projects/${projectId}/budget`);
      if (!r.ok) { console.error('budget load failed', r.status); throw new Error('Request failed'); }
      const d = await r.json();
      setLines(Array.isArray(d.lines) ? d.lines : []);
      setContract(Number(d.contract) || 0);
    } catch (e) {
      console.error(e);
      setError(humanError(e, 'Failed to load the budget. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setAddError('');
    setShowAddForm(true);
  }

  // Division pick — the canonical CSI list drives the code + description so
  // the GC never types what the system knows. Both stay fully editable.
  function pickDivision(code: string) {
    setCsiDiv(code);
    if (!code || !CSI_DIVISIONS[code]) return;
    const overwriteDesc = !addForm.description || !!autoFill.desc;
    setAddForm(f => ({
      ...f,
      cost_code: `${code} 00 00`,
      description: overwriteDesc ? CSI_DIVISIONS[code].name : f.description,
    }));
    setAutoFill(a => ({ code: true, desc: overwriteDesc || a.desc, amount: a.amount }));
  }

  // Seed a line straight from bid-package pricing (empty-budget guidance).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function seedFromPackage(pkg: any) {
    const m = String(pkg?.csiDivision ?? '').match(/\d{2}/);
    const div = m && CSI_DIVISIONS[m[0]] ? m[0] : '';
    const amt = Number(pkg?.awardedAmount) || Number(pkg?.budgetEstimate) || 0;
    setCsiDiv(div);
    setAddForm({
      cost_code: div ? `${div} 00 00` : '',
      description: pkg?.name || pkg?.trade || (div ? CSI_DIVISIONS[div].name : ''),
      original_budget: amt > 0 ? String(amt) : '',
    });
    setAutoFill({ code: !!div, desc: true, amount: amt > 0 });
    openAdd();
  }

  async function addLine(): Promise<boolean> {
    const budget = parseFloat(addForm.original_budget) || 0;
    setAdding(true);
    setAddError('');
    try {
      const r = await fetch(`/api/projects/${projectId}/budget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cost_code: addForm.cost_code,
          description: addForm.description,
          original_budget: budget,
          project_id: projectId,
        }),
      });
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      const d = await r.json();
      if (!d.line) throw new Error('save failed');
      setLines(prev => [...prev, d.line as BudgetLine]);
      setAddForm({ cost_code: '', description: '', original_budget: '' });
      setCsiDiv('');
      setAutoFill({});
      setShowAddForm(false);
      show('Budget line added.');
      guard.clearDraft();
      return true;
    } catch (e) {
      console.error(e);
      setAddError('Failed to add the budget line. Please try again.');
      show('Failed to add the budget line. Please try again.', 'bad');
    } finally {
      setAdding(false);
    }
    return false;
  }

  async function saveEdit(id: string) {
    const amount = parseFloat(editAmount) || 0;
    const amountCents = toCents(amount);
    setLines(prev => prev.map(l => l.id === id ? { ...l, original_budget: amount, revised_budget: toDollars(addCents(amountCents, toCents(l.approved_cos ?? 0))), forecast_cost: toDollars(Math.max(toCents(l.actual_cost ?? 0), amountCents)) } : l));
    setEditingId(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/budget`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, original_budget: amount }),
      });
      if (!r.ok) throw new Error('update failed');
      show('Budget line updated.');
    } catch (e) {
      console.error(e);
      show('Could not update the budget line. Please try again.', 'bad');
      load();
    }
  }

  async function handleAdjust(id: string, pct: number) {
    const line = lines.find(l => l.id === id);
    if (!line) return;
    const newAmtCents = scaleCents(toCents(line.original_budget ?? 0), 1 + pct / 100);
    const newAmt = toDollars(newAmtCents);
    setLines(prev => prev.map(l => l.id === id ? { ...l, original_budget: newAmt, revised_budget: toDollars(addCents(newAmtCents, toCents(l.approved_cos ?? 0))), forecast_cost: toDollars(Math.max(toCents(l.actual_cost ?? 0), newAmtCents)) } : l));
    try {
      const r = await fetch(`/api/projects/${projectId}/budget`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, original_budget: newAmt }) });
      if (!r.ok) throw new Error('update failed');
      show(`Adjusted ${pct > 0 ? '+' : ''}${pct}%.`);
    } catch (e) { console.error(e); show('Could not adjust the budget line. Please try again.', 'bad'); load(); }
  }

  function handleCopy(amount: number) {
    navigator.clipboard.writeText(fmt(amount)).then(
      () => show(`Copied ${fmt(amount)}.`),
      () => show("Couldn't copy to the clipboard.", 'bad'),
    );
  }

  async function handleDeleteLine(id: string) {
    setLines(prev => prev.filter(l => l.id !== id));
    try {
      const r = await fetch(`/api/projects/${projectId}/budget`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, _delete: true }) });
      if (!r.ok) throw new Error('delete failed');
      show('Budget line deleted.');
    } catch (e) { console.error(e); show('Could not delete the budget line. Please try again.', 'bad'); load(); }
  }

  function csvCell(v: unknown): string {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  async function exportReport() {
    setExporting(true);
    try {
      const r = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: 'job-cost', projectId }),
      });
      const d = await r.json();
      const columns: string[] = Array.isArray(d.columns) ? d.columns : [];
      const rows: unknown[][] = Array.isArray(d.rows) ? d.rows : [];
      if (!columns.length || !rows.length) {
        show(d.message || d.error || 'No budget data to export.', 'bad');
        return;
      }
      const csv = [columns, ...rows]
        .map(row => (Array.isArray(row) ? row : [row]).map(csvCell).join(','))
        .join('\r\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `job-cost-summary-${projectId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      show('Exported.');
    } catch (e) {
      console.error(e);
      show('Export failed.', 'bad');
    } finally {
      setExporting(false);
    }
  }

  // KPI calculations — exact-cents engine (sum in integer cents, convert back to
  // dollars for display) so totals never drift and match the server.
  const totalOriginalCents = sumCents(lines.map(l => toCents(l.original_budget ?? 0)));
  const totalRevisedCents = sumCents(lines.map(l => toCents(l.revised_budget ?? 0)));
  const totalActualCents = sumCents(lines.map(l => toCents(l.actual_cost ?? 0)));
  const totalForecastCents = sumCents(lines.map(l => toCents(l.forecast_cost ?? 0)));
  const totalCommittedCents = sumCents(lines.map(l => toCents(l.committed_cost ?? 0)));
  const totalVarianceCents = subCents(totalRevisedCents, totalForecastCents);
  const totalOriginal = toDollars(totalOriginalCents);
  const totalRevised = toDollars(totalRevisedCents);
  const totalActual = toDollars(totalActualCents);
  const totalForecast = toDollars(totalForecastCents);
  const totalVariance = toDollars(totalVarianceCents);
  const totalCommitted = toDollars(totalCommittedCents);
  // Remaining committed = committed not yet spent (committed − actual, floored at 0),
  // computed per line then summed so a line already over its commitment can't net
  // against one that is under.
  const remainingCommittedCentsByLine = lines.map(l => Math.max(0, subCents(toCents(l.committed_cost ?? 0), toCents(l.actual_cost ?? 0))));
  // Cost-to-Complete = revised − actual − remaining-committed (budget left to finish
  // that is neither spent nor already locked up in commitments).
  const costToCompleteCentsByLine = lines.map((l, i) => subCents(subCents(toCents(l.revised_budget ?? 0), toCents(l.actual_cost ?? 0)), remainingCommittedCentsByLine[i]));
  const ctcById = new Map(lines.map((l, i) => [l.id, toDollars(costToCompleteCentsByLine[i] ?? 0)]));
  const totalCostToCompleteCents = costToCompleteCentsByLine.reduce((a, b) => a + b, 0);
  const totalCostToComplete = toDollars(totalCostToCompleteCents);

  // SmartCreate derivations — Number() every context figure before math (DB
  // numerics can round-trip as strings; never string-concat dollars).
  const primeContract = Number(ctx?.money?.revisedContract) || 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bidPackages: any[] = Array.isArray(ctx?.bidPackages) ? ctx.bidPackages : [];
  const seedablePackages = bidPackages.filter(p => (Number(p?.awardedAmount) || 0) > 0 || (Number(p?.budgetEstimate) || 0) > 0);
  const seedableTotal = seedablePackages.reduce((s, p) => s + (Number(p?.awardedAmount) || Number(p?.budgetEstimate) || 0), 0);
  const pendingAmt = Number(addForm.original_budget) || 0;
  const newOriginalTotal = (Number(totalOriginal) || 0) + pendingAmt;
  const budgetVsContract = primeContract > 0 ? Math.round((newOriginalTotal / primeContract) * 100) : 0;
  const divLines = csiDiv ? lines.filter(l => String(l.cost_code || '').trim().startsWith(csiDiv)) : [];
  const divLinesTotal = toDollars(sumCents(divLines.map(l => toCents(Number(l.original_budget) || 0))));

  const overLines = lines.filter(isOver);
  const watchLines = lines.filter(isWatch);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter(l => {
      if (lineFilter === 'over' && !isOver(l)) return false;
      if (lineFilter === 'watch' && !isWatch(l)) return false;
      if (!q) return true;
      return [l.cost_code, l.description, l.category].some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [lines, search, lineFilter]);

  /* Over budget lines carry a red wash, lines past 90% of revised an amber one. */
  function rowBg(l: BudgetLine): React.CSSProperties | undefined {
    if (isOver(l)) return { background: 'color-mix(in srgb, var(--danger) 8%, transparent)' };
    if (isWatch(l)) return { background: 'color-mix(in srgb, var(--warning) 8%, transparent)' };
    return undefined;
  }

  const dash = loading ? '—' : null;
  const stats: StatItem[] = [
    { label: 'Revised budget', value: dash ?? fmt(totalRevised), sub: loading ? undefined : `Original ${fmt(totalOriginal)} · contract ${fmt(contract)}`, icon: <ClipboardText size={15} />, onClick: () => setLineFilter('all'), active: lineFilter === 'all' },
    { label: 'Committed', value: dash ?? fmt(totalCommitted), sub: loading ? undefined : `${fmt(totalActual)} actual to date`, icon: <Handshake size={15} /> },
    { label: 'Cost to complete', value: dash ?? fmt(totalCostToComplete), sub: 'Not spent, not committed', tone: !loading && totalCostToComplete < 0 ? 'bad' : 'default', icon: <Hourglass size={15} /> },
    { label: 'Forecast (EAC)', value: dash ?? fmt(totalForecast), sub: loading ? undefined : `${fmtSigned(totalVariance)} variance`, tone: loading ? 'default' : totalForecast > totalRevised ? 'bad' : 'good', icon: <ChartLineUp size={15} /> },
    { label: 'Over budget', value: dash ?? String(overLines.length), sub: loading ? undefined : `${watchLines.length} past 90% of revised`, tone: overLines.length ? 'bad' : watchLines.length ? 'warn' : 'default', icon: <WarningCircle size={15} />, onClick: () => setLineFilter(overLines.length || !watchLines.length ? 'over' : 'watch'), active: lineFilter === 'over' || lineFilter === 'watch' },
  ];

  const columns: Column<BudgetLine>[] = [
    { key: 'cost_code', header: 'Cost code', primary: true, render: l => <span style={{ fontFamily: 'monospace' }}>{l.cost_code}</span> },
    { key: 'description', header: 'Description', render: l => <span style={{ display: 'inline-block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>{l.description}</span> },
    { key: 'division', header: 'Division', accessor: l => { const d = String(l.cost_code || '').trim().slice(0, 2); const name = (CSI_DIVISIONS as Record<string, { name: string }>)[d]?.name; return name ? `${d} · ${name}` : d || '—'; }, hidden: true },
    { key: 'original_budget', header: 'Original', align: 'right', total: 'sum', format: fmt, phone: 'show', render: l => editingId === l.id ? (
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
        <Input value={editAmount} onChange={e => setEditAmount(e.target.value)} type="number" step="0.01" aria-label="Original budget" autoFocus
          onKeyDown={e => { if (e.key === 'Enter') void saveEdit(l.id); if (e.key === 'Escape') setEditingId(null); }}
          style={{ width: 130, textAlign: 'right' }} />
        <Button size="sm" variant="primary" onClick={() => void saveEdit(l.id)}>Save</Button>
        <Button size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
      </span>
    ) : fmt(l.original_budget) },
    { key: 'approved_cos', header: 'Approved changes', align: 'right', total: 'sum', format: fmt, render: l => (l.approved_cos ?? 0) !== 0 ? <span style={{ color: 'var(--warning)' }}>{(l.approved_cos > 0 ? '+' : '') + fmt(l.approved_cos)}</span> : '—' },
    { key: 'revised_budget', header: 'Revised', align: 'right', total: 'sum', format: fmt, phone: 'show', render: l => <strong>{fmt(l.revised_budget)}</strong> },
    { key: 'committed_cost', header: 'Committed', align: 'right', total: 'sum', format: fmt, render: l => <span title={l.committed_source === 'commitments' ? 'From commitments and purchase orders' : 'Entered on the line'}>{fmt(l.committed_cost)}</span> },
    { key: 'direct_costs', header: 'Direct costs', align: 'right', total: 'sum', format: fmt, render: l => (l.direct_costs ?? 0) > 0 ? fmt(l.direct_costs) : '—' },
    { key: 'actual_cost', header: 'Actual', align: 'right', total: 'sum', format: fmt, render: l => <span style={{ color: isOver(l) ? 'var(--danger)' : undefined }}>{fmt(l.actual_cost)}</span> },
    { key: 'pct_complete', header: '% complete', align: 'right', render: l => `${l.pct_complete ?? 0}%` },
    { key: 'projected_cost', header: 'Projected cost', align: 'right', total: 'sum', format: fmt, hidden: true },
    { key: 'cost_to_complete', header: 'Cost to complete', align: 'right', accessor: l => ctcById.get(l.id) ?? 0, total: 'sum', format: fmt, render: l => fmt(ctcById.get(l.id) ?? 0) },
    { key: 'forecast_cost', header: 'Forecast (EAC)', align: 'right', total: 'sum', format: fmt, render: l => <span style={{ color: (l.forecast_cost ?? 0) > (l.revised_budget ?? 0) ? 'var(--danger)' : undefined, fontWeight: 600 }}>{fmt(l.forecast_cost)}</span> },
    { key: 'over_under', header: 'Over / under', align: 'right', phone: 'show', accessor: l => (l.revised_budget ?? 0) - (l.forecast_cost ?? 0), total: 'sum', format: n => fmtSigned(n), render: l => { const v = (l.revised_budget ?? 0) - (l.forecast_cost ?? 0); return <span style={{ color: v >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{fmtSigned(v)}</span>; } },
  ];

  const base = `/app/projects/${projectId}`;
  return (
    <PageShell
      crumbs={[
        { label: 'Projects', href: '/app/projects' },
        { label: ctx?.project?.name || 'Project', href: `${base}/overview` },
        { label: 'Budget' },
      ]}
      title="Budget"
      subtitle="Committed, actual and forecast by CSI cost code."
      actions={
        <>
          <Button icon={<DownloadSimple size={15} />} onClick={exportReport} disabled={exporting || loading || lines.length === 0}>{exporting ? 'Exporting…' : 'Export job cost'}</Button>
          <Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openAdd} disabled={loading || !!error}>Add line</Button>
        </>
      }
    >
      {/* A failed load never shows $0 tiles: on a money page that reads as a real empty budget. */}
      {!error && <StatRow items={stats} />}

      {error ? (
        <EmptyState icon={<WarningCircle size={22} />} title="Couldn't load the budget" text={error} action={<Button onClick={load}>Try again</Button>} />
      ) : !loading && lines.length === 0 ? (
        <>
          <EmptyState
            icon={<ClipboardText size={22} />}
            title="No budget lines yet"
            text="Add the first cost code to start job costing on this project."
            action={<Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={openAdd}>Add line</Button>}
          />
          {seedablePackages.length > 0 ? (
            <Card
              title="Seed from your bid packages"
              subtitle={`${seedablePackages.length} package${seedablePackages.length === 1 ? '' : 's'} · ${fmt(seedableTotal)} in pricing`}
              icon={<Package size={18} />}
              flush
            >
              <ItemList>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {seedablePackages.map((p: any) => {
                  const div = (String(p?.csiDivision ?? '').match(/\d{2}/) || [])[0] || '';
                  const amt = Number(p?.awardedAmount) || Number(p?.budgetEstimate) || 0;
                  const awarded = (Number(p?.awardedAmount) || 0) > 0;
                  return (
                    <ItemRow
                      key={p.id}
                      title={p.name || p.trade}
                      desc={`${div ? `Div ${div}` : 'No division'} · ${awarded ? `Awarded${p.awardedTo ? ` — ${p.awardedTo}` : ''}` : 'Budget estimate'}${p.trade ? ` · ${p.trade}` : ''}`}
                      value={<span style={{ color: awarded ? 'var(--success)' : undefined, fontWeight: 700 }}>{fmt(amt)}</span>}
                      action={<Button size="sm" onClick={() => seedFromPackage(p)}>Seed line</Button>}
                    />
                  );
                })}
              </ItemList>
            </Card>
          ) : ctx ? (
            <Card title="Start by division">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(CSI_DIVISIONS).map(([code, d]) => (
                  <button key={code} type="button" className="k-chip" aria-pressed={false} onClick={() => { pickDivision(code); openAdd(); }}>{code} · {d.name}</button>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      ) : (
        <>
          {!loading && (
            <Toolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search by cost code or description…"
              filters={
                <Select aria-label="Lines" value={lineFilter} onChange={e => setLineFilter(e.target.value as LineFilter)} style={{ width: 'auto', minWidth: 170 }}
                  options={[{ value: 'all', label: 'All lines' }, { value: 'over', label: 'Over budget' }, { value: 'watch', label: 'Past 90% of revised' }]} />
              }
            />
          )}
          <DataTable<BudgetLine>
            tableId="project-budget"
            exportName="budget"
            rows={shown}
            loading={loading}
            rowKey={l => l.id}
            rowStyle={rowBg}
            defaultSort={{ key: 'cost_code', dir: 'asc' }}
            columns={columns}
            rowActions={l => [
              { label: 'Edit amount', icon: <PencilSimple size={15} />, onClick: () => { setEditingId(l.id); setEditAmount(String(l.original_budget)); } },
              { label: 'Raise 5%', icon: <ChartBar size={15} />, onClick: () => void handleAdjust(l.id, 5) },
              { label: 'Raise 10%', icon: <ChartBar size={15} />, onClick: () => void handleAdjust(l.id, 10) },
              { label: 'Lower 5%', icon: <ChartBar size={15} />, onClick: () => void handleAdjust(l.id, -5) },
              { label: 'Lower 10%', icon: <ChartBar size={15} />, onClick: () => void handleAdjust(l.id, -10) },
              { label: 'Copy amount', icon: <Copy size={15} />, onClick: () => handleCopy(l.original_budget) },
              { label: 'Delete line', icon: <Trash size={15} />, tone: 'danger', onClick: () => void (async () => { if (await confirmDialog({ title: `Delete ${l.cost_code}?`, message: 'This budget line comes off the budget.', confirmLabel: 'Delete', danger: true })) await handleDeleteLine(l.id); })() },
            ]}
            empty={<EmptyState title="Nothing matches" text="Change the search or the filter." action={<Button onClick={() => { setSearch(''); setLineFilter('all'); }}>Clear filters</Button>} />}
          />
        </>
      )}

      <FormModal
        open={showAddForm}
        onClose={() => setShowAddForm(false)}
        title="Add budget line"
        subtitle="Pick the CSI division and the code and description fill themselves."
        onSubmit={async () => { await addLine(); }}
        submitLabel="Add line"
        busy={adding}
        error={addError || null}
      >
        <FormGrid cols={2}>
          <Field
            label="CSI division"
            hint={csiDiv
              ? divLines.length > 0
                ? `${divLines.length} line${divLines.length === 1 ? '' : 's'} already in Division ${csiDiv} · ${fmt(Number(divLinesTotal) || 0)} budgeted`
                : `First line in Division ${csiDiv}. Typical trades: ${(CSI_DIVISIONS[csiDiv]?.trades || []).join(', ')}.`
              : undefined}
          >
            <Select value={csiDiv} onChange={e => pickDivision(e.target.value)} placeholder="Select division…"
              options={Object.entries(CSI_DIVISIONS).map(([code, d]) => ({ value: code, label: `${code} — ${d.name}` }))} />
          </Field>
          <Field label="CSI code" required hint={autoFill.code ? `Division ${csiDiv} default — refine to a section code anytime.` : undefined}>
            <Input value={addForm.cost_code} onChange={e => { setAddForm(f => ({ ...f, cost_code: e.target.value })); setAutoFill(a => ({ ...a, code: false })); }} placeholder="e.g. 03 30 00" required />
          </Field>
          <Field label="Description" required hint={autoFill.desc ? 'Division name — rename it to the actual scope.' : undefined}>
            <Input value={addForm.description} onChange={e => { setAddForm(f => ({ ...f, description: e.target.value })); setAutoFill(a => ({ ...a, desc: false })); }} placeholder="e.g. Cast-in-Place Concrete" required />
          </Field>
          <Field label="Budget amount ($)" required
            hint={`${autoFill.amount ? 'From the bid package pricing. ' : ''}New original budget ${fmt(newOriginalTotal)}${primeContract > 0 ? ` · ${budgetVsContract}% of contract` : ''}`}>
            <Input value={addForm.original_budget} onChange={e => { setAddForm(f => ({ ...f, original_budget: e.target.value })); setAutoFill(a => ({ ...a, amount: false })); }} placeholder="0" type="number" min="0" required />
          </Field>
        </FormGrid>
        {primeContract > 0 && budgetVsContract > 100 && (
          <div style={{ marginTop: 16 }}>
            <Callout tone="warning" icon={<WarningCircle size={18} />} title={`Budget would be ${budgetVsContract}% of the contract`} text={`${fmt(newOriginalTotal)} budgeted against a ${fmt(primeContract)} contract.`} />
          </div>
        )}
      </FormModal>

      <div style={{ position: 'relative', zIndex: 10001 }}><UnsavedGuardModal guard={guard} /></div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </PageShell>
  );
}
