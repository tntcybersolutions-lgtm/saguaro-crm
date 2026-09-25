'use client';
import React, { useCallback, useState, useEffect } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  WarningCircle, Wallet, Scroll, ClipboardText, Handshake, Receipt,
  Hourglass, ChartLineUp, TrendUp, Plus, DownloadSimple, Package, Lightning, Stack,
  PencilSimple, ChartBar, Copy, Trash, type Icon,
} from '@phosphor-icons/react';
import { Skeleton, SkeletonKPI } from '../../../../../components/ui/Skeleton';
import { toCents, toDollars, sumCents, subCents, addCents, scaleCents } from '@/lib/calc';
import {
  CinematicPage, ModuleHero, HeroButton, StatCard, SectionCard, EmptyStatePremium, CIN,
} from '@/components/ui/cinematic';
import { StatStrip, FlowSteps, InsightRow, AutoChip, goldButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import { CSI_DIVISIONS } from '@/lib/construction-intelligence';
import { moduleAccent } from '@/lib/module-identity';
import { useUnsavedGuard, useComposerDirty } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';

const GOLD='#F59E0B',DARK='#0a0a0a',RAISED='#141416',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF',RED='#c03030';
const fmt = (n: number | null | undefined) => '$' + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (a: number | null | undefined, b: number | null | undefined) => (b ?? 0) > 0 ? (((a ?? 0) / (b as number)) * 100).toFixed(1) + '%' : '0%';

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
}

interface AddLineForm {
  cost_code: string;
  description: string;
  original_budget: string;
}

export default function BudgetPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddLineForm>({ cost_code: '', description: '', original_budget: '' });

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
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteVal, setNoteVal] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // SmartCreate intelligence — one /api/project-context snapshot so the add
  // flow walks in knowing the contract, bid packages, and prior coding.
  const { ctx } = useProjectContext(projectId);
  const [csiDiv, setCsiDiv] = useState('');
  const [autoFill, setAutoFill] = useState<{ code?: boolean; desc?: boolean; amount?: boolean }>({});

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/projects/${projectId}/budget`);
      if (!r.ok) { console.error('budget load failed', r.status); throw new Error('Request failed'); }
      const d = await r.json();
      setLines(Array.isArray(d.lines) ? d.lines : []);
    } catch (e: any) {
      console.error(e);
      setError(humanError(e, 'Failed to load the budget. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

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
    setShowAddForm(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function addLine(e?: React.FormEvent): Promise<boolean> {
    e?.preventDefault();
    const budget = parseFloat(addForm.original_budget) || 0;
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
      showToast('Budget line added.');
      guard.clearDraft();
      return true;
    } catch (e) {
      console.error(e);
      showToast('Failed to add the budget line. Please try again.', false);
    }
    return false;
  }

  async function saveEdit(id: string) {
    const amount = parseFloat(editAmount) || 0;
    const amountCents = toCents(amount);
    setLines(prev => prev.map(l => l.id === id ? { ...l, original_budget: amount, revised_budget: toDollars(addCents(amountCents, toCents(l.approved_cos))), forecast_cost: toDollars(Math.max(toCents(l.actual_cost), amountCents)) } : l));
    setEditingId(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/budget`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, original_budget: amount }),
      });
      if (!r.ok) throw new Error('update failed');
      showToast('Budget line updated.');
    } catch {
      showToast('Could not update the budget line. Please try again.', false);
      load();
    }
  }

  function openMenu(id: string) { setMenuId(id); setEditingId(null); setAdjustId(null); setNoteId(null); setDeleteId(null); }

  async function handleAdjust(id: string, pct: number) {
    const line = lines.find(l => l.id === id);
    if (!line) return;
    const newAmtCents = scaleCents(toCents(line.original_budget), 1 + pct / 100);
    const newAmt = toDollars(newAmtCents);
    setLines(prev => prev.map(l => l.id === id ? { ...l, original_budget: newAmt, revised_budget: toDollars(addCents(newAmtCents, toCents(l.approved_cos))), forecast_cost: toDollars(Math.max(toCents(l.actual_cost), newAmtCents)) } : l));
    setAdjustId(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/budget`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, original_budget: newAmt }) });
      if (!r.ok) throw new Error('update failed');
      showToast(`Adjusted ${pct > 0 ? '+' : ''}${pct}%`);
    } catch { showToast('Could not adjust the budget line. Please try again.', false); load(); }
  }

  function handleCopy(id: string, amount: number) {
    navigator.clipboard.writeText(fmt(amount)).catch(() => {});
    setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
    setMenuId(null);
  }

  async function handleDeleteLine(id: string) {
    setLines(prev => prev.filter(l => l.id !== id));
    setDeleteId(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/budget`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, _delete: true }) });
      if (!r.ok) throw new Error('delete failed');
      showToast('Budget line deleted.');
    } catch { showToast('Could not delete the budget line. Please try again.', false); load(); }
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
        showToast(d.message || d.error || 'No budget data to export.', false);
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
      showToast('Exported');
    } catch {
      showToast('Export failed.', false);
    } finally {
      setExporting(false);
    }
  }

  // KPI calculations — exact-cents engine (sum in integer cents, convert back to
  // dollars for display) so totals never drift and match the server.
  const totalOriginalCents = sumCents(lines.map(l => toCents(l.original_budget ?? 0)));
  const totalApprovedCOsCents = sumCents(lines.map(l => toCents(l.approved_cos ?? 0)));
  const totalRevisedCents = sumCents(lines.map(l => toCents(l.revised_budget ?? 0)));
  const totalActualCents = sumCents(lines.map(l => toCents(l.actual_cost ?? 0)));
  const totalForecastCents = sumCents(lines.map(l => toCents(l.forecast_cost ?? 0)));
  const totalCommittedCents = sumCents(lines.map(l => toCents(l.committed_cost ?? 0)));
  const totalVarianceCents = subCents(totalRevisedCents, totalForecastCents);
  const totalOriginal = toDollars(totalOriginalCents);
  const totalApprovedCOs = toDollars(totalApprovedCOsCents);
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
  const totalCostToCompleteCents = costToCompleteCentsByLine.reduce((a, b) => a + b, 0);
  const totalCostToComplete = toDollars(totalCostToCompleteCents);
  const totalRemaining = toDollars(subCents(totalRevisedCents, totalActualCents));

  // SmartCreate derivations — Number() every context figure before math (DB
  // numerics can round-trip as strings; never string-concat dollars).
  const primeContract = Number(ctx?.money?.revisedContract) || 0;
  const approvedCoCount = Number(ctx?.money?.approvedCoCount) || 0;
  const approvedCoTotal = Number(ctx?.money?.approvedCoTotal) || 0;
  const subsOnJob = Array.isArray(ctx?.subs) ? ctx.subs.length : 0;
  const bidPackages: any[] = Array.isArray(ctx?.bidPackages) ? ctx.bidPackages : [];
  const seedablePackages = bidPackages.filter(p => (Number(p?.awardedAmount) || 0) > 0 || (Number(p?.budgetEstimate) || 0) > 0);
  const seedableTotal = seedablePackages.reduce((s, p) => s + (Number(p?.awardedAmount) || Number(p?.budgetEstimate) || 0), 0);
  const divisionsUsed = new Set(lines.map(l => String(l.cost_code || '').trim().slice(0, 2))).size;
  const pendingAmt = Number(addForm.original_budget) || 0;
  const newOriginalTotal = (Number(totalOriginal) || 0) + pendingAmt;
  const budgetVsContract = primeContract > 0 ? Math.round((newOriginalTotal / primeContract) * 100) : 0;
  const divLines = csiDiv ? lines.filter(l => String(l.cost_code || '').trim().startsWith(csiDiv)) : [];
  const divLinesTotal = toDollars(sumCents(divLines.map(l => toCents(Number(l.original_budget) || 0))));
  const hintStyle: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5, lineHeight: 1.45 };

  function rowBg(l: BudgetLine) {
    const actual = l.actual_cost ?? 0;
    const revised = l.revised_budget ?? 0;
    if (actual > revised) return 'rgba(239,68,68,.08)';
    if (revised > 0 && actual / revised > 0.9) return 'rgba(245, 158, 11,.06)';
    return 'transparent';
  }

  const inputStyle: React.CSSProperties = {
    padding: '9px 11px', background: '#1c1c1e', border: `1px solid ${BORDER}`,
    borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box', width: '100%',
  };

  const hero = (
    <ModuleHero
      eyebrow="Cost Control"
      eyebrowIcon={<Wallet size={12} weight="fill" color={moduleAccent('budget').hex} />}
      icon={<Wallet size={26} weight="duotone" color={moduleAccent('budget').hex} />}
      title="Project Budget"
      subtitle="Committed, actual, and forecast by CSI cost code."
      note="this is where the money truth lives"
      actions={<>
        <HeroButton variant="ghost" onClick={() => setShowAddForm(v => !v)} icon={<Plus size={15} weight="bold" color={CIN.goldHi} />}>Add Line</HeroButton>
        <HeroButton onClick={exportReport} disabled={exporting} icon={<DownloadSimple size={15} weight="bold" color="#241a05" />}>{exporting ? 'Exporting…' : 'Export'}</HeroButton>
      </>}
    />
  );

  // LOADING — skeletons that mirror the KPI row + table, never computed zeros.
  if (loading) {
    return (
      <CinematicPage soft>
        <div style={{ marginBottom: 26 }}>
          <Skeleton width={120} height={26} style={{ marginBottom: 14, borderRadius: 999 }} />
          <Skeleton width={280} height={40} style={{ marginBottom: 10 }} />
          <Skeleton width={360} height={14} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          {Array.from({ length: 5 }).map((_, i) => <SkeletonKPI key={i} />)}
        </div>
        <div style={{ background: CIN.surface, border: `1px solid ${CIN.border}`, borderRadius: 18, padding: 20 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < 5 ? `1px solid ${CIN.border}` : 'none' }}>
              <Skeleton width={70} height={14} />
              <Skeleton width="32%" height={14} />
              <div style={{ flex: 1 }} />
              <Skeleton width={90} height={14} />
              <Skeleton width={90} height={14} />
              <Skeleton width={70} height={14} />
            </div>
          ))}
        </div>
      </CinematicPage>
    );
  }

  // ERROR — distinct, actionable block. NEVER render $0 KPIs / "no data" on a
  // failed load, which on a financial page is indistinguishable from a real
  // empty project. Reuse a premium empty state with a Retry action.
  if (error) {
    return (
      <CinematicPage soft>
        {hero}
        <div style={{ background: 'rgba(239,68,68,.1)', border: `1px solid rgba(239,68,68,.3)`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, color: '#ff7070', fontSize: 13 }}>
          {error}
        </div>
        <EmptyStatePremium
          icon={<WarningCircle size={38} weight="duotone" color="#ff7070" />}
          title="Couldn't load budget"
          description="Something went wrong while loading the job-cost budget. Your data is safe — this is a loading error, not an empty project."
          actionLabel="Retry"
          onAction={load}
        />
      </CinematicPage>
    );
  }

  return (
    <CinematicPage>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, padding: '12px 20px', borderRadius: 12, background: toast.ok ? 'rgba(34,197,94,.92)' : 'rgba(239,68,68,.92)', color: '#fff', fontWeight: 700, fontSize: 14, boxShadow: '0 12px 40px -10px rgba(0,0,0,.6)' }}>
          {toast.msg}
        </div>
      )}

      {hero}

      {/* KPI stat tiles — forecasting rollup */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 22 }}>
        {[
          { l: 'Total Contract', v: fmt(totalRevised), c: TEXT, ac: CIN.gold, icon: <Scroll size={17} weight="duotone" color={CIN.goldHi} /> },
          { l: 'Original Budget', v: fmt(totalOriginal), c: TEXT, ac: CIN.gold, icon: <ClipboardText size={17} weight="duotone" color={CIN.goldHi} /> },
          { l: 'Committed', v: fmt(totalCommitted), c: '#4a9de8', ac: '#4a9de8', icon: <Handshake size={17} weight="duotone" color={CIN.goldHi} /> },
          { l: 'Actual to Date', v: fmt(totalActual), c: '#f97316', ac: '#f97316', icon: <Receipt size={17} weight="duotone" color={CIN.goldHi} /> },
          { l: 'Cost to Complete', v: fmt(totalCostToComplete), c: totalCostToComplete < 0 ? '#ff7070' : TEXT, ac: CIN.gold, icon: <Hourglass size={17} weight="duotone" color={CIN.goldHi} /> },
          { l: 'Forecast (EAC)', v: fmt(totalForecast), c: totalForecast > totalRevised ? '#ff7070' : '#3dd68c', ac: totalForecast > totalRevised ? '#ff7070' : '#3dd68c', icon: <ChartLineUp size={17} weight="duotone" color={CIN.goldHi} /> },
          { l: 'Variance', v: (totalVariance >= 0 ? '+' : '') + fmt(totalVariance), c: totalVariance >= 0 ? '#3dd68c' : '#ff7070', ac: totalVariance >= 0 ? '#3dd68c' : '#ff7070', icon: <TrendUp size={17} weight="duotone" color={CIN.goldHi} /> },
        ].map((k, i) => (
          <StatCard key={k.l} delay={0.02 + i * 0.04} icon={k.icon} label={k.l} value={k.v} valueColor={k.c} accentColor={k.ac} />
        ))}
      </div>

      {/* Add Line Form */}
      {showAddForm && (
        <div style={{ marginBottom: 20 }}>
          <StatStrip items={[
            { label: 'Budget Lines', value: String(lines.length), sub: lines.length > 0 ? `across ${divisionsUsed} CSI division${divisionsUsed === 1 ? '' : 's'}` : 'first line on this project' },
            { label: 'Original Budget', value: fmt(Number(totalOriginal) || 0), sub: 'sum of all lines' },
            { label: 'Committed', value: fmt(Number(totalCommitted) || 0), accent: '#4a9de8', sub: 'subcontracts + POs' },
            { label: 'Actual to Date', value: fmt(Number(totalActual) || 0), accent: '#f97316', sub: 'approved bills' },
            { label: 'Variance', value: ((Number(totalVariance) || 0) >= 0 ? '+' : '') + fmt(Number(totalVariance) || 0), accent: (Number(totalVariance) || 0) >= 0 ? '#3dd68c' : '#ff7070', sub: 'revised vs forecast' },
            ...(primeContract > 0 ? [{ label: 'Prime Contract', value: fmt(primeContract), sub: `incl. ${approvedCoCount} approved CO${approvedCoCount === 1 ? '' : 's'}` }] : []),
          ]} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 16, alignItems: 'start' }}>
          <SectionCard title="Add Budget Line" subtitle="Pick the CSI division — code and description fill themselves" icon={<Plus size={18} weight="bold" color={CIN.goldHi} />}>
            <form onSubmit={addLine}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px,1.2fr) minmax(120px,0.9fr) minmax(200px,1.6fr) minmax(130px,0.9fr) auto', gap: 12, alignItems: 'start' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: CIN.faint, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.06em' }}>CSI Division</label>
                  <select value={csiDiv} onChange={e => pickDivision(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">Select division…</option>
                    {Object.entries(CSI_DIVISIONS).map(([code, d]) => (
                      <option key={code} value={code}>{code} — {d.name}</option>
                    ))}
                  </select>
                  <div style={hintStyle}>MasterFormat — the same canonical list bid packages use.</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: CIN.faint, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.06em' }}>CSI Code{autoFill.code && <AutoChip />}</label>
                  <input value={addForm.cost_code} onChange={e => { setAddForm(f => ({ ...f, cost_code: e.target.value })); setAutoFill(a => ({ ...a, code: false })); }} placeholder="e.g. 03 30 00" required style={inputStyle} />
                  <div style={hintStyle}>{autoFill.code ? `Division ${csiDiv} default — refine to a section code anytime.` : 'Pick a division to fill this automatically.'}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: CIN.faint, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.06em' }}>Description{autoFill.desc && <AutoChip />}</label>
                  <input value={addForm.description} onChange={e => { setAddForm(f => ({ ...f, description: e.target.value })); setAutoFill(a => ({ ...a, desc: false })); }} placeholder="e.g. Cast-in-Place Concrete" required style={inputStyle} />
                  <div style={hintStyle}>{autoFill.desc ? 'Division name — rename to the actual scope of work.' : 'What this line pays for.'}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: CIN.faint, textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.06em' }}>Budget Amount ($){autoFill.amount && <AutoChip />}</label>
                  <input value={addForm.original_budget} onChange={e => { setAddForm(f => ({ ...f, original_budget: e.target.value })); setAutoFill(a => ({ ...a, amount: false })); }} placeholder="0" type="number" min="0" required style={inputStyle} />
                  <div style={hintStyle}>{autoFill.amount ? 'Pulled from the bid package pricing.' : 'Original budget — approved COs revise it, never overwrite it.'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 23 }}>
                  <button type="submit" style={{ padding: '10px 18px', background: `linear-gradient(135deg,${GOLD},#FBBF24)`, border: 'none', borderRadius: 10, color: '#241a05', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Add</button>
                  <button type="button" onClick={() => setShowAddForm(false)} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${CIN.border}`, borderRadius: 10, color: CIN.faint, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
              <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.22)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: CIN.faint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Live Totals Preview</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0 24px' }}>
                  <InsightRow label="Original budget today" value={fmt(Number(totalOriginal) || 0)} />
                  <InsightRow label="This line" value={'+' + fmt(pendingAmt)} accent={CIN.goldHi} />
                  <InsightRow label="New original budget" value={fmt(newOriginalTotal)} strong />
                  {primeContract > 0 && <InsightRow label="Contract allocated" value={`${budgetVsContract}%`} accent={budgetVsContract > 100 ? '#ff7070' : '#3dd68c'} />}
                </div>
              </div>
            </form>
          </SectionCard>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {csiDiv !== '' && (
              <SectionCard flat title={`Division ${csiDiv} — ${CSI_DIVISIONS[csiDiv]?.name || ''}`} icon={<Stack size={16} weight="duotone" color={CIN.goldHi} />}>
                {divLines.length > 0 ? (
                  <>
                    <InsightRow label="Existing lines" value={String(divLines.length)} />
                    <InsightRow label="Budgeted so far" value={fmt(Number(divLinesTotal) || 0)} strong />
                    <div style={{ fontSize: 11.5, color: CIN.muted, lineHeight: 1.5, marginTop: 8 }}>This line joins {divLines.length} existing line{divLines.length === 1 ? '' : 's'} coded to Division {csiDiv}.</div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: CIN.muted, lineHeight: 1.55 }}>First budget line in Division {csiDiv}. Typical trades: {(CSI_DIVISIONS[csiDiv]?.trades || []).join(', ')}.</div>
                )}
              </SectionCard>
            )}
            <SectionCard flat title="After You Add" icon={<Lightning size={16} weight="duotone" color={CIN.goldHi} />}>
              <FlowSteps title="" steps={[
                { title: 'Committed fills itself', desc: 'Awarded subcontracts and POs coded to this line book as committed cost.' },
                { title: 'Actuals flow from bills', desc: 'Approved invoices land on the line — nothing re-typed.' },
                { title: 'COs revise, never overwrite', desc: 'Approved change orders adjust the revised budget; the original stays.' },
                { title: 'Forecast rolls up live', desc: 'EAC and variance update here and on the command center.' },
              ]} />
            </SectionCard>
          </div>
          </div>
        </div>
      )}

      {/* EMPTY — genuine zero results (only reaches here when !loading && !error). */}
      {lines.length === 0 ? ctx ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 16, alignItems: 'start' }}>
          <SectionCard
            title={seedablePackages.length > 0 ? 'Seed the Budget from Your Estimate' : 'Start the Budget by CSI Division'}
            subtitle={seedablePackages.length > 0
              ? `${seedablePackages.length} bid package${seedablePackages.length === 1 ? '' : 's'} carry ${fmt(seedableTotal)} in pricing — pull each in as a budget line`
              : 'No bid-package pricing yet — one tap on a division opens a pre-coded line'}
            icon={<Package size={18} weight="duotone" color={CIN.goldHi} />}
          >
            {seedablePackages.length > 0 ? (
              <div>
                {seedablePackages.map((p: any) => {
                  const div = (String(p?.csiDivision ?? '').match(/\d{2}/) || [])[0] || '';
                  const amt = Number(p?.awardedAmount) || Number(p?.budgetEstimate) || 0;
                  const awarded = (Number(p?.awardedAmount) || 0) > 0;
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: `1px solid ${CIN.border}` }}>
                      <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: CIN.goldHi, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', borderRadius: 6, padding: '3px 7px', fontFamily: 'monospace' }}>{div ? `DIV ${div}` : 'CSI —'}</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || p.trade}</div>
                        <div style={{ fontSize: 11.5, color: CIN.faint }}>{awarded ? `Awarded${p.awardedTo ? ` — ${p.awardedTo}` : ''}` : 'Budget estimate'}{p.trade ? ` · ${p.trade}` : ''}</div>
                      </div>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: awarded ? '#3dd68c' : TEXT, whiteSpace: 'nowrap' }}>{fmt(amt)}</span>
                      <button onClick={() => seedFromPackage(p)} className="sgBtn" style={{ ...goldOutlineButtonStyle, padding: '7px 12px', fontSize: 12, borderRadius: 9 }}>Seed Line</button>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: CIN.muted }}>Seeding fills division, code, description, and amount — you just press Add.</div>
                  <button onClick={() => setShowAddForm(true)} className="sgBtn" style={{ ...goldButtonStyle, padding: '9px 16px', fontSize: 12.5 }}>Blank Budget Line</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12.5, color: CIN.muted, lineHeight: 1.6, marginBottom: 12 }}>
                  Every line codes to a MasterFormat division, so committed costs, bills, and change orders find it automatically. Price bid packages and they become one-tap seeds here.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(CSI_DIVISIONS).map(([code, d]) => (
                    <button key={code} onClick={() => { pickDivision(code); setShowAddForm(true); }} className="sgBtn" style={{ padding: '6px 11px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: `1px solid ${CIN.border}`, color: CIN.muted, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{code} · {d.name}</button>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SectionCard flat title="What the System Knows" icon={<Wallet size={16} weight="duotone" color={CIN.goldHi} />}>
              <InsightRow label="Prime contract" value={primeContract > 0 ? fmt(primeContract) : '—'} strong />
              <InsightRow label="Approved COs" value={approvedCoCount > 0 ? `${approvedCoCount} · +${fmt(approvedCoTotal)}` : 'none yet'} accent={approvedCoCount > 0 ? '#3dd68c' : undefined} />
              <InsightRow label="Bid packages" value={String(bidPackages.length)} />
              <InsightRow label="Subs on the job" value={String(subsOnJob)} />
              {primeContract > 0 && (
                <div style={{ fontSize: 11.5, color: CIN.muted, lineHeight: 1.55, marginTop: 8 }}>A complete budget allocates the full {fmt(primeContract)} contract across divisions.</div>
              )}
            </SectionCard>
            <SectionCard flat title="How Money Flows In" icon={<Lightning size={16} weight="duotone" color={CIN.goldHi} />}>
              <FlowSteps title="" steps={[
                { title: 'Seed lines by division', desc: 'From bid-package pricing or a blank line — CSI-coded either way.' },
                { title: 'Committed books automatically', desc: 'Awarded subcontracts and POs land on their coded lines.' },
                { title: 'Actuals flow from bills', desc: 'Approved invoices hit the line — never re-typed.' },
                { title: 'Variance rolls up live', desc: 'EAC and variance feed this page and the command center.' },
              ]} />
            </SectionCard>
          </div>
        </div>
      ) : (
        <EmptyStatePremium
          icon={<Wallet size={38} weight="duotone" color={CIN.goldHi} />}
          title="No budget lines yet"
          description="Add your first budget line to start job costing by CSI cost code for this project."
          actionLabel="Add Budget Line"
          onAction={() => setShowAddForm(true)}
        />
      ) : (
      /* Budget Table */
      <SectionCard title="Cost Breakdown" subtitle={`${lines.length} line item${lines.length !== 1 ? 's' : ''}`} icon={<ChartLineUp size={18} weight="duotone" color={CIN.goldHi} />} noPad>
        <div style={{ overflowX: 'auto', borderRadius: '0 0 18px 18px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                {['Cost Code', 'Description', 'Orig. Budget', 'Approved COs', 'Revised Budget', 'Committed', 'Actual Cost', '% Complete', 'Remaining', 'Cost to Complete', 'Forecast (EAC)', 'Variance', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: h === 'Cost Code' || h === 'Description' || h === 'Actions' ? 'left' : 'right', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: CIN.faint, borderBottom: `1px solid ${CIN.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, li) => {
                const remaining = toDollars(subCents(toCents(l.revised_budget ?? 0), toCents(l.actual_cost ?? 0)));
                const costToComplete = toDollars(costToCompleteCentsByLine[li]);
                const forecast = l.forecast_cost ?? 0;
                const lineVariance = toDollars(subCents(toCents(l.revised_budget ?? 0), toCents(forecast)));
                const pct = l.pct_complete ?? 0;
                const isEditing = editingId === l.id;
                return (
                  <tr key={l.id} style={{ borderBottom: `1px solid ${CIN.border}`, background: rowBg(l) }}>
                    <td style={{ padding: '11px 14px', color: GOLD, fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{l.cost_code}</td>
                    <td style={{ padding: '11px 14px', color: TEXT, fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.description}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: TEXT }}>
                      {isEditing ? (
                        <input
                          value={editAmount}
                          onChange={e => setEditAmount(e.target.value)}
                          type="number"
                          style={{ width: 110, padding: '4px 8px', background: '#1c1c1e', border: `1px solid ${GOLD}`, borderRadius: 5, color: TEXT, fontSize: 12, outline: 'none', textAlign: 'right' }}
                          autoFocus
                        />
                      ) : fmt(l.original_budget)}
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: (l.approved_cos ?? 0) > 0 ? '#4a9de8' : CIN.faint }}>{(l.approved_cos ?? 0) > 0 ? '+' + fmt(l.approved_cos) : '—'}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: TEXT, fontWeight: 600 }}>{fmt(l.revised_budget)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: '#4a9de8' }}>{fmt(l.committed_cost)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: (l.actual_cost ?? 0) > (l.revised_budget ?? 0) ? '#ff7070' : (l.actual_cost ?? 0) > 0 ? '#f97316' : CIN.faint }}>{fmt(l.actual_cost)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        <div style={{ width: 40, height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 999 }}>
                          <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: pct >= 100 ? '#3dd68c' : GOLD, borderRadius: 999 }} />
                        </div>
                        <span style={{ color: pct >= 100 ? '#3dd68c' : TEXT, fontWeight: 600, whiteSpace: 'nowrap' }}>{pct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: remaining >= 0 ? '#3dd68c' : '#ff7070', fontWeight: 600 }}>{fmt(remaining)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: costToComplete < 0 ? '#ff7070' : TEXT }}>{fmt(costToComplete)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: forecast > (l.revised_budget ?? 0) ? '#ff7070' : TEXT, fontWeight: 600 }}>{fmt(forecast)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', color: lineVariance >= 0 ? '#3dd68c' : '#ff7070', fontWeight: 700 }}>{(lineVariance >= 0 ? '+' : '') + fmt(lineVariance)}</td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', position: 'relative' as const }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button onClick={() => saveEdit(l.id)} style={{ padding: '3px 8px', background: `linear-gradient(135deg,${GOLD},#FBBF24)`, border: 'none', borderRadius: 4, color: '#241a05', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                          <button onClick={() => setEditingId(null)} style={{ padding: '3px 8px', background: 'none', border: `1px solid ${CIN.border}`, borderRadius: 4, color: CIN.faint, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                        </div>
                      ) : adjustId === l.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          {[-10, -5, 5, 10].map(p => (
                            <button key={p} onClick={() => handleAdjust(l.id, p)} style={{ padding: '3px 7px', background: p > 0 ? 'rgba(61,214,140,.1)' : 'rgba(239,68,68,.1)', border: `1px solid ${p > 0 ? 'rgba(61,214,140,.25)' : 'rgba(239,68,68,.25)'}`, borderRadius: 4, color: p > 0 ? '#3dd68c' : '#ff7070', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{p > 0 ? '+' : ''}{p}%</button>
                          ))}
                          <button onClick={() => setAdjustId(null)} style={{ padding: '3px 6px', background: 'none', border: 'none', color: CIN.faint, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                        </div>
                      ) : deleteId === l.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: '#ff7070', fontWeight: 600 }}>Delete?</span>
                          <button onClick={() => handleDeleteLine(l.id)} style={{ padding: '3px 8px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 4, color: '#ff7070', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Yes</button>
                          <button onClick={() => setDeleteId(null)} style={{ padding: '3px 8px', background: 'none', border: `1px solid ${CIN.border}`, borderRadius: 4, color: CIN.faint, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {copiedId === l.id && <span style={{ fontSize: 10, color: '#3dd68c', fontWeight: 600 }}>Copied!</span>}
                          <button onClick={() => openMenu(l.id)} style={{ padding: '3px 8px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${CIN.border}`, borderRadius: 6, color: CIN.faint, fontSize: 11, cursor: 'pointer' }}>Actions &#9662;</button>
                          {menuId === l.id && (
                            <div style={{ position: 'absolute', top: 36, right: 14, background: '#101826', border: `1px solid ${CIN.border}`, borderRadius: 10, padding: 4, zIndex: 100, minWidth: 150, boxShadow: '0 16px 44px rgba(0,0,0,.6)' }}>
                              {([
                                { label: 'Edit Amount', icon: PencilSimple, action: () => { setMenuId(null); setEditingId(l.id); setEditAmount(String(l.original_budget)); } },
                                { label: 'Adjust %', icon: ChartBar, action: () => { setMenuId(null); setAdjustId(l.id); } },
                                { label: 'Copy Amount', icon: Copy, action: () => handleCopy(l.id, l.original_budget) },
                              ] as { label: string; icon: Icon; action: () => void }[]).map(item => (
                                <div key={item.label} onClick={item.action} style={{ padding: '8px 12px', fontSize: 12, color: TEXT, cursor: 'pointer', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 8 }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                  <item.icon size={14} weight="duotone" color={CIN.faint} />{item.label}
                                </div>
                              ))}
                              <div style={{ height: 1, background: CIN.border, margin: '4px 0' }} />
                              <div onClick={() => { setMenuId(null); setDeleteId(l.id); }} style={{ padding: '8px 12px', fontSize: 12, color: '#ff7070', cursor: 'pointer', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 8 }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,.08)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                <Trash size={14} weight="duotone" color="#ff7070" />Delete Line
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'rgba(245,158,11,0.06)', fontWeight: 800 }}>
                <td colSpan={2} style={{ padding: '13px 14px', color: TEXT, fontWeight: 800 }}>TOTALS</td>
                <td style={{ padding: '13px 14px', textAlign: 'right', color: TEXT }}>{fmt(totalOriginal)}</td>
                <td style={{ padding: '13px 14px', textAlign: 'right', color: totalApprovedCOs > 0 ? '#4a9de8' : CIN.faint }}>{totalApprovedCOs > 0 ? '+' + fmt(totalApprovedCOs) : '—'}</td>
                <td style={{ padding: '13px 14px', textAlign: 'right', color: TEXT }}>{fmt(totalRevised)}</td>
                <td style={{ padding: '13px 14px', textAlign: 'right', color: '#4a9de8' }}>{fmt(totalCommitted)}</td>
                <td style={{ padding: '13px 14px', textAlign: 'right', color: '#f97316' }}>{fmt(totalActual)}</td>
                <td style={{ padding: '13px 14px', textAlign: 'right', color: CIN.faint }}>{fmtPct(totalActual, totalRevised)}</td>
                <td style={{ padding: '13px 14px', textAlign: 'right', color: totalRemaining >= 0 ? '#3dd68c' : '#ff7070' }}>{fmt(totalRemaining)}</td>
                <td style={{ padding: '13px 14px', textAlign: 'right', color: totalCostToComplete < 0 ? '#ff7070' : TEXT }}>{fmt(totalCostToComplete)}</td>
                <td style={{ padding: '13px 14px', textAlign: 'right', color: totalForecast > totalRevised ? '#ff7070' : '#3dd68c' }}>{fmt(totalForecast)}</td>
                <td style={{ padding: '13px 14px', textAlign: 'right', color: totalVariance >= 0 ? '#3dd68c' : '#ff7070', fontWeight: 800 }}>{(totalVariance >= 0 ? '+' : '') + fmt(totalVariance)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>
      )}
      {menuId && <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setMenuId(null)} />}
      <UnsavedGuardModal guard={guard} />
    </CinematicPage>
  );
}
