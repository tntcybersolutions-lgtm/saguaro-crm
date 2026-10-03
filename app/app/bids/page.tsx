'use client';
/**
 * Bid Board — the Phase 1 canonical page (docs/DESIGN-SYSTEM-FIX-PLAN.md).
 * Built only from components/ui/kit: PageShell, StatRow, Tabs, Toolbar,
 * DataTable with the entity's standard row actions, FormModal. Every other
 * page migrates to this shape.
 */
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Brain, ArrowRight, Eye, Copy, Trash, Archive, Trophy, PencilSimple, Robot, Plus, WarningCircle, Clipboard, CheckCircle } from '@phosphor-icons/react';
import { useProjects } from '@/lib/hooks/useProjects';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import MarkOutcomeModal from '@/components/bids/MarkOutcomeModal';
import { postLearningEvent } from '@/lib/last-used';
import { SUB_TRADES, SUB_TRADES_BY_DIVISION } from '@/lib/construction-intelligence';
import {
  PageShell, Card, StatRow, Badge, Button, Tabs, Toolbar, DataTable, EmptyState,
  FormModal, Field, Input, Textarea, FormGrid, Toast, useToast,
  type Column, type BadgeTone, type StatItem,
} from '@/components/ui/kit';

interface BidRecord {
  id: string;
  project_name: string;
  project_type: string;
  bid_date: string;
  bid_amount: number;
  actual_cost: number | null;
  margin_pct: number;
  outcome: 'won' | 'lost' | 'pending' | 'withdrawn';
  loss_reason: string | null;
  awarded_to: string | null;
  location: string;
  trades: string[];
  notes: string | null;
}
interface BidStats {
  totalBids: number; wonBids: number; lostBids: number; pendingBids: number;
  winRate: number; avgMargin: number; totalValue: number;
}
type Tab = 'active' | 'pipeline' | 'history';
type HistoryFilter = 'all' | 'won' | 'lost' | 'pending';
// Bid packages come back as loose rows enriched client-side (see enrichPackages).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pkg = any;

const TERMINAL_STATUSES = ['awarded', 'closed', 'cancelled', 'canceled', 'complete', 'completed', 'archived', 'withdrawn', 'lost'];

const fmt = (n: number | null | undefined) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const daysUntil = (d?: string | null) => {
  if (!d) return null;
  const t = new Date(String(d).slice(0, 10) + 'T00:00:00').getTime();
  return isNaN(t) ? null : Math.ceil((t - Date.now()) / 86400000);
};
const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  const dt = new Date(String(d).length <= 10 ? String(d) + 'T00:00:00' : String(d));
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const spreadTone = (s: number) => (s <= 10 ? '#34D399' : s <= 25 ? 'var(--warning)' : '#F87171');

function packageTone(status: string): BadgeTone {
  const st = status.toLowerCase();
  if (st === 'open' || st === 'bidding') return 'lead';
  if (st === 'awarded') return 'under_contract';
  if (TERMINAL_STATUSES.includes(st)) return 'closed';
  return 'neutral';
}
const OUTCOME_TONE: Record<BidRecord['outcome'], BadgeTone> = { won: 'under_contract', lost: 'closed', pending: 'lead', withdrawn: 'neutral' };

function BidsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(tabParam === 'history' || tabParam === 'pipeline' ? tabParam : 'active');
  const [q, setQ] = useState('');
  const { toast, show: showToast } = useToast();

  // ── History ──────────────────────────────────────────────────────────────
  const [historyBids, setHistoryBids] = useState<BidRecord[]>([]);
  const [historyStats, setHistoryStats] = useState<BidStats | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [outcomeBid, setOutcomeBid] = useState<BidRecord | null>(null);

  // Edit bid (amount + note) — replaces the old inline cell editors.
  const [editBid, setEditBid] = useState<BidRecord | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // One delete confirmation for both packages and history bids.
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'package' | 'bid'; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Close confirmation (from claude/finish-crm-app-McOeo): closing stops new bids.
  const [confirmClose, setConfirmClose] = useState<Pkg | null>(null);

  async function fetchHistory(outcome?: string) {
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const params = new URLSearchParams();
      if (outcome && outcome !== 'all') params.set('outcome', outcome);
      params.set('limit', '50');
      const r = await fetch('/api/bids/history?' + params.toString());
      if (!r.ok) throw new Error('Failed to load bid history');
      const d = await r.json();
      setHistoryBids(d.bids || []);
      setHistoryStats(d.stats || null);
    } catch {
      setHistoryError(true);
      setHistoryBids([]);
      setHistoryStats(null);
    } finally {
      setHistoryLoading(false);
    }
  }
  const refreshHistory = () => fetchHistory(historyFilter === 'all' ? undefined : historyFilter);

  useEffect(() => {
    if (tab === 'history' && historyBids.length === 0 && !historyError) fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function openEdit(b: BidRecord) {
    setEditBid(b);
    setEditAmount(String(b.bid_amount ?? ''));
    setEditNote(b.notes || '');
    setEditError(null);
  }

  async function saveEdit() {
    if (!editBid) return;
    const amount = parseFloat(editAmount.replace(/[^0-9.]/g, ''));
    if (isNaN(amount) || amount < 0) { setEditError('Enter a bid amount of $0 or more.'); return; }
    setEditBusy(true);
    setEditError(null);
    try {
      const patch: Record<string, unknown> = { bid_amount: amount };
      if (editNote.trim() !== (editBid.notes || '')) patch.notes = editNote.trim();
      const r = await fetch(`/api/bids/${editBid.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      if (!r.ok) throw new Error('update failed');
      setHistoryBids((prev) => prev.map((b) => (b.id === editBid.id ? { ...b, bid_amount: amount, notes: (patch.notes as string | undefined) ?? b.notes } : b)));
      showToast('Bid updated.');
      setEditBid(null);
    } catch {
      setEditError('Could not save the bid. Try again.');
    } finally {
      setEditBusy(false);
    }
  }

  function copyAmount(b: BidRecord) {
    navigator.clipboard.writeText(fmt(b.bid_amount)).then(
      () => showToast(`Copied ${fmt(b.bid_amount)}.`),
      () => showToast('Clipboard unavailable.', 'bad'),
    );
  }

  // ── Score a bid ─────────────────────────────────────────────────────────
  const [showScore, setShowScore] = useState(tabParam === 'score');
  const [scoreForm, setScoreForm] = useState({ projectName: '', bidAmount: '', margin: '', tradeType: '', notes: '' });
  const [scoring, setScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<{ fitScore: number; winPct: number; recommendation: string } | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const { projects: liveProjects } = useProjects();
  const scoreProjects = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (liveProjects as any[]).map((p: any) => ({ id: p.id, name: p.name || 'Untitled Project' })).filter((p) => p.id),
    [liveProjects],
  );
  const [pickProject, setPickProject] = useState('');
  const [autofilling, setAutofilling] = useState(false);
  const [scoreMeta, setScoreMeta] = useState<{ location?: string; dueDate?: string | null; ownerName?: string; projectType?: string; valueSource?: string | null; historyHint?: string }>({});

  const scoreDirty = showScore && !scoreResult && (
    !!scoreForm.projectName || !!scoreForm.bidAmount || !!scoreForm.margin || !!scoreForm.tradeType || !!scoreForm.notes
  );
  const scoreDraft = useMemo(() => ({ scoreForm, scoreMeta, pickProject }), [scoreForm, scoreMeta, pickProject]);
  const guard = useUnsavedGuard({
    dirty: scoreDirty,
    draftKey: 'bid-score',
    draftData: scoreDraft,
    restoreDraft: (d) => {
      const v = d as Partial<typeof scoreDraft>;
      if (!v || !v.scoreForm) return;
      setScoreForm((f) => ({ ...f, ...v.scoreForm }));
      if (v.scoreMeta) setScoreMeta(v.scoreMeta);
      if (v.pickProject) setPickProject(v.pickProject);
      setShowScore(true);
    },
    onSave: () => submitScore(),
  });

  function resetScore() {
    setScoreResult(null); setScoreError(null); setPickProject(''); setScoreMeta({});
    setScoreForm({ projectName: '', bidAmount: '', margin: '', tradeType: '', notes: '' });
  }
  function closeScore() {
    guard.requestClose(() => { setShowScore(false); resetScore(); });
  }

  async function autofillFromProject(id: string) {
    setPickProject(id);
    if (!id) return;
    setAutofilling(true);
    setScoreError(null);
    try {
      const r = await fetch(`/api/bids/score/autofill?projectId=${encodeURIComponent(id)}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setScoreError(d.error || 'Auto-fill failed. Enter the details manually.'); return; }
      const f = d.fields || {};
      setScoreForm({
        projectName: f.projectName || '',
        bidAmount: f.bidAmount ? Number(f.bidAmount).toLocaleString('en-US') : '',
        margin: f.margin || '',
        tradeType: f.tradeType || f.projectType || '',
        notes: f.notes || '',
      });
      setScoreMeta({
        location: f.location || undefined,
        dueDate: f.dueDate || undefined,
        ownerName: f.ownerName || undefined,
        projectType: f.projectType || undefined,
        valueSource: d.sources?.value ?? null,
        historyHint: d.historyHint || undefined,
      });
    } catch {
      setScoreError('Network error during auto-fill. Enter the details manually.');
    } finally {
      setAutofilling(false);
    }
  }

  function recLabel(rec: string): string {
    const r = String(rec || '').toUpperCase();
    if (r === 'BID' || r.includes('STRONG')) return 'Bid — strong fit';
    if (r === 'PASS' || r.includes('LOW')) return 'Pass — low fit';
    return 'Bid with caution — review scope';
  }

  async function submitScore(): Promise<boolean> {
    if (!scoreForm.projectName || !scoreForm.bidAmount) {
      setScoreError('Project name and bid amount are required to score.');
      return false;
    }
    setScoring(true);
    setScoreResult(null);
    setScoreError(null);
    try {
      const margin = parseFloat(scoreForm.margin) || 0;
      const amount = parseFloat(scoreForm.bidAmount.replace(/[^0-9.]/g, '')) || 0;
      const r = await fetch('/api/bids/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: scoreForm.projectName,
          estimatedValue: amount,
          targetMargin: margin,
          projectType: scoreMeta.projectType || scoreForm.tradeType || 'commercial',
          trade: scoreForm.tradeType || undefined,
          location: scoreMeta.location || undefined,
          dueDate: scoreMeta.dueDate || undefined,
          ownerName: scoreMeta.ownerName || undefined,
          notes: scoreForm.notes,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setScoreError(d.error || 'Scoring failed. Please try again.');
        return false;
      }
      const label = recLabel(d.recommendation);
      setScoreResult({ fitScore: d.score, winPct: d.winProbability, recommendation: d.reasoning ? `${label} — ${d.reasoning}` : label });
      // Scoring persists a pending bid — make History reload.
      setHistoryBids([]);
      if (tab === 'history') refreshHistory();
      guard.clearDraft();
      return true;
    } catch {
      setScoreError('Network error — could not reach the scoring service. Please try again.');
      return false;
    } finally {
      setScoring(false);
    }
  }

  // ── Bid packages ────────────────────────────────────────────────────────
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [pkgLoading, setPkgLoading] = useState(true);
  const [pkgError, setPkgError] = useState(false);
  const [busyPkg, setBusyPkg] = useState<string | null>(null);

  async function fetchPackages() {
    setPkgLoading(true);
    setPkgError(false);
    try {
      const r = await fetch('/api/bid-packages/list');
      if (!r.ok) throw new Error('Failed to load bid packages');
      const d = await r.json();
      const all: Pkg[] = (d.bidPackages || []).filter((bp: Pkg) => !bp.deleted_at);
      setPackages(all);
      enrichPackages(all);
    } catch {
      setPkgError(true);
    } finally {
      setPkgLoading(false);
    }
  }

  // /api/bid-packages/list returns bare rows, so pull invites + submissions per
  // live package (bounded to 24) and derive invited / responded / low bid /
  // spread. A failed detail fetch just leaves that row bare.
  async function enrichPackages(all: Pkg[]) {
    const targets = all.filter((p) => !TERMINAL_STATUSES.includes(String(p.status || '').toLowerCase())).slice(0, 24);
    if (targets.length === 0) return;
    const results = await Promise.allSettled(targets.map(async (p) => {
      const r = await fetch(`/api/bid-packages/${p.id}`);
      if (!r.ok) throw new Error('detail failed');
      const d = await r.json();
      const subs: Pkg[] = (d.submissions || []).filter((s: Pkg) => String(s.status || '').toLowerCase() !== 'withdrawn');
      const amts = subs
        .map((s: Pkg) => ({ amt: Number(s.amount ?? s.base_amount ?? s.total_amount) || 0, who: s.company_name || s.sub_name || s.contact_name || '' }))
        .filter((a) => a.amt > 0)
        .sort((a, b) => a.amt - b.amt);
      const low = amts[0];
      const high = amts[amts.length - 1];
      return {
        id: p.id,
        num_invited: (d.invites || []).length,
        num_responded: subs.length,
        bid_count: subs.length,
        low_bid_amount: low ? low.amt : null,
        low_bid_company: low ? low.who : null,
        spread_pct: amts.length >= 2 && low.amt > 0 ? ((high.amt - low.amt) / low.amt) * 100 : null,
      };
    }));
    const byId: Record<string, Pkg> = {};
    for (const res of results) if (res.status === 'fulfilled') byId[res.value.id] = res.value;
    if (Object.keys(byId).length === 0) return;
    setPackages((prev) => prev.map((p) => (byId[p.id] ? { ...p, ...byId[p.id] } : p)));
  }

  useEffect(() => { fetchPackages(); }, []);

  /** Copies a package's real server data into a new draft; dates + status regenerate. */
  async function duplicatePackage(op: Pkg) {
    if (busyPkg) return;
    setBusyPkg(op.id);
    try {
      const r = await fetch(`/api/bid-packages/${op.id}`);
      if (!r.ok) throw new Error('detail failed');
      const d = await r.json();
      const src = d.bidPackage || {};
      const items: Pkg[] = d.items || [];
      const cr = await fetch('/api/bid-packages/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: src.project_id,
          name: `${src.name || 'Bid Package'} (copy)`,
          trade: src.trade || null,
          description: src.description || null,
          scope_of_work: src.scope_of_work || null,
          scope_summary: src.scope_summary || null,
          scope_narrative: src.scope_narrative || null,
          status: 'draft',
          due_date: null,
          pre_bid_date: null,
          budget_estimate: src.budget_estimate != null ? Number(src.budget_estimate) : null,
          notes: src.notes || null,
          bid_instructions: src.bid_instructions || null,
          csi_codes: Array.isArray(src.csi_codes) ? src.csi_codes : [],
          is_public_project: !!src.is_public_project,
          requires_bond: !!src.requires_bond,
          insurance_requirements: src.insurance_requirements || null,
          lineItems: items.map((it) => ({
            description: it.description, quantity: it.quantity, unit: it.unit, unit_price: it.unit_price,
            total_amount: it.total_amount, csi_code: it.csi_code, notes: it.notes,
          })),
        }),
      });
      const cd = await cr.json().catch(() => ({}));
      if (!cr.ok || !cd.bidPackage) throw new Error(cd.error || 'create failed');
      postLearningEvent('bid_package_duplicated', { projectId: src.project_id, meta: { fromPackageId: op.id } });
      showToast(`Duplicated as draft — "${cd.bidPackage.name}". Set a due date, then open it for bids.`);
      fetchPackages();
    } catch {
      showToast('Could not duplicate the package.', 'bad');
    } finally {
      setBusyPkg(null);
    }
  }

  async function closePackage(op: Pkg) {
    if (busyPkg) return;
    setBusyPkg(op.id);
    try {
      const r = await fetch(`/api/bid-packages/${op.id}/close`, { method: 'POST' });
      if (!r.ok) throw new Error('close failed');
      showToast(`Closed "${op.name || 'package'}" — it's no longer taking bids.`);
      setConfirmClose(null);
      fetchPackages();
    } catch {
      showToast('Could not close the package.', 'bad');
    } finally {
      setBusyPkg(null);
    }
  }

  async function runDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    const { kind, id } = confirmDelete;
    try {
      const r = await fetch(kind === 'package' ? `/api/bid-packages/${id}` : `/api/bids/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('delete failed');
      if (kind === 'package') setPackages((prev) => prev.filter((p) => p.id !== id));
      else setHistoryBids((prev) => prev.filter((b) => b.id !== id));
      showToast(kind === 'package' ? 'Bid package deleted.' : 'Bid deleted.');
      setConfirmDelete(null);
    } catch {
      showToast(kind === 'package' ? 'Could not delete — you may need Full access to Projects.' : 'Could not delete the bid.', 'bad');
    } finally {
      setDeleting(false);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────
  const activePackages = packages.filter((p) => !TERMINAL_STATUSES.includes(String(p.status || '').toLowerCase()));
  const openNow = activePackages.filter((p) => ['open', 'bidding'].includes(String(p.status || '').toLowerCase()));
  const invitedTotal = activePackages.reduce((s, p) => s + (Number(p.num_invited) || 0), 0);
  const respondedTotal = activePackages.reduce((s, p) => s + (Number(p.num_responded ?? p.bid_count) || 0), 0);
  const lowBidPipeline = activePackages.reduce((s, p) => s + (Number(p.low_bid_amount) || 0), 0);
  const coveredCount = activePackages.filter((p) => (Number(p.num_responded ?? p.bid_count) || 0) > 0).length;
  const awardedPkgs = packages.filter((p) => String(p.status || '').toLowerCase() === 'awarded');
  const awardedTotal = awardedPkgs.reduce((s, p) => s + (Number(p.awarded_amount) || 0), 0);
  const widestSpread = activePackages.reduce<Pkg | null>(
    (m, p) => (p.spread_pct != null && Number.isFinite(Number(p.spread_pct)) && (m == null || Number(p.spread_pct) > Number(m.spread_pct)) ? p : m),
    null,
  );

  const needle = q.trim().toLowerCase();
  const pkgRows = (tab === 'pipeline' ? openNow : activePackages).filter(
    (p) => !needle || `${p.name || ''} ${p.trade || ''}`.toLowerCase().includes(needle),
  );
  const historyRows = historyBids.filter(
    (b) => !needle || `${b.project_name || ''} ${b.project_type || ''} ${b.location || ''}`.toLowerCase().includes(needle),
  );

  const packageStats: StatItem[] = [
    { label: 'Live Packages', value: activePackages.length, sub: `${openNow.length} open for bids` },
    { label: 'Bids In', value: `${respondedTotal} / ${invitedTotal}`, sub: 'Responses vs invites', tone: respondedTotal > 0 ? 'good' : 'default' },
    { label: 'Coverage', value: activePackages.length ? `${coveredCount}/${activePackages.length}` : '—', sub: activePackages.length - coveredCount > 0 ? `${activePackages.length - coveredCount} awaiting first bid` : 'Every package has a bid' },
    { label: 'Low-Bid Pipeline', value: fmt(lowBidPipeline), sub: 'Sum of current low bids' },
    { label: 'Awarded', value: fmt(awardedTotal), sub: `${awardedPkgs.length} package${awardedPkgs.length === 1 ? '' : 's'} placed` },
    {
      label: 'Widest Spread',
      value: widestSpread ? `${Math.round(Number(widestSpread.spread_pct))}%` : '—',
      sub: widestSpread ? `${widestSpread.name || 'package'} — level before award` : 'Needs 2+ bids on a package',
      tone: widestSpread ? (Number(widestSpread.spread_pct) <= 10 ? 'good' : Number(widestSpread.spread_pct) <= 25 ? 'warn' : 'bad') : 'default',
    },
  ];
  const historyStatItems: StatItem[] = historyStats ? [
    { label: 'Total Bids', value: historyStats.totalBids ?? 0 },
    { label: 'Won', value: historyStats.wonBids ?? 0, tone: 'good' },
    { label: 'Lost', value: historyStats.lostBids ?? 0, tone: 'bad' },
    { label: 'Win Rate', value: `${historyStats.winRate ?? 0}%`, tone: (historyStats.winRate ?? 0) >= 50 ? 'good' : 'warn' },
    { label: 'Avg Margin', value: `${(Number(historyStats.avgMargin) || 0).toFixed(1)}%` },
    { label: 'Total Value', value: fmt(Number(historyStats.totalValue) || 0) },
  ] : [];

  const pkgHref = (p: Pkg) => `/app/projects/${p.project_id}/bid-packages/${p.id}`;

  const pkgColumns: Column<Pkg>[] = [
    { key: 'name', header: 'Package', primary: true, accessor: (p) => p.name || 'Untitled Package' },
    { key: 'trade', header: 'Trade' },
    { key: 'status', header: 'Status', render: (p) => <Badge tone={packageTone(String(p.status || ''))} dot><span style={{ textTransform: 'capitalize' }}>{String(p.status || '—').replace(/_/g, ' ')}</span></Badge> },
    {
      key: 'due', header: 'Bid Due', accessor: (p) => p.bid_due_date || p.due_date,
      render: (p) => {
        const due = p.bid_due_date || p.due_date;
        const dd = daysUntil(due);
        return (
          <>
            {fmtDate(due)}
            {dd != null && (
              <span style={{ marginLeft: 6, fontSize: 'var(--fs-xs)', fontWeight: 700, color: dd < 0 ? '#F87171' : dd <= 3 ? 'var(--warning)' : 'var(--text-tertiary)' }}>
                {dd < 0 ? `${Math.abs(dd)}d overdue` : dd === 0 ? 'due today' : `${dd}d left`}
              </span>
            )}
          </>
        );
      },
    },
    {
      key: 'responses', header: 'Bids In', align: 'right', accessor: (p) => Number(p.num_responded ?? p.bid_count) || 0,
      render: (p) => {
        const n = Number(p.num_responded ?? p.bid_count) || 0;
        return <><span style={{ color: n > 0 ? '#34D399' : undefined, fontWeight: 700 }}>{n}</span> / {Number(p.num_invited) || 0}</>;
      },
    },
    {
      key: 'low', header: 'Low Bid', align: 'right', accessor: (p) => Number(p.low_bid_amount) || null,
      render: (p) => (p.low_bid_amount ? (
        <span title={p.low_bid_company || undefined}>{fmt(p.low_bid_amount)}</span>
      ) : '—'),
    },
    {
      key: 'spread', header: 'Spread', align: 'right', accessor: (p) => (p.spread_pct != null ? Number(p.spread_pct) : null),
      render: (p) => {
        const s = p.spread_pct != null && Number.isFinite(Number(p.spread_pct)) ? Number(p.spread_pct) : null;
        if (s == null) return <span style={{ color: 'var(--text-tertiary)' }}>{(Number(p.num_responded ?? p.bid_count) || 0) === 1 ? 'Needs 2 bids' : '—'}</span>;
        return <span style={{ fontWeight: 700, color: spreadTone(s) }}>{Math.round(s)}%</span>;
      },
    },
  ];

  const historyColumns: Column<BidRecord>[] = [
    { key: 'project_name', header: 'Project', primary: true },
    { key: 'project_type', header: 'Type' },
    { key: 'bid_date', header: 'Bid Date', render: (b) => fmtDate(b.bid_date) },
    { key: 'bid_amount', header: 'Bid Amount', align: 'right', render: (b) => fmt(b.bid_amount) },
    {
      key: 'margin_pct', header: 'Margin', align: 'right', accessor: (b) => Number(b.margin_pct) || 0,
      render: (b) => {
        const m = Number(b.margin_pct) || 0;
        return <span style={{ fontWeight: 700, color: m >= 15 ? '#34D399' : m >= 10 ? 'var(--warning)' : '#F87171' }}>{m}%</span>;
      },
    },
    { key: 'location', header: 'Location' },
    { key: 'outcome', header: 'Outcome', render: (b) => <Badge tone={OUTCOME_TONE[b.outcome] ?? 'neutral'} dot><span style={{ textTransform: 'capitalize' }}>{b.outcome}</span></Badge> },
    { key: 'awarded_to', header: 'Awarded to / Reason', accessor: (b) => b.awarded_to || b.loss_reason },
  ];

  const historyLabel: Record<HistoryFilter, string> = { all: 'All', won: 'Won', lost: 'Lost', pending: 'Pending' };

  return (
    <PageShell
      title="Bid Board"
      subtitle="Active bid packages, invites, and awards — all in one board"
      actions={
        <>
          <Button href="/app/bid-intelligence" icon={<Brain size={15} />}>Bid Intelligence</Button>
          <Button href="/app/bids/leveling" icon={<ArrowRight size={15} />}>Bid Leveling</Button>
          {/* Score a Bid is de-featured: still reachable at /app/bids?tab=score (Bid Intelligence has its own scorer). */}
          <Button variant="primary" href="/app/projects" title="Open a project to start a package." icon={<Plus size={15} weight="bold" />}>New Bid Package</Button>
        </>
      }
    >
      {tab !== 'history' && !pkgLoading && !pkgError && packages.length > 0 && <StatRow items={packageStats} />}
      {tab === 'history' && !historyLoading && !historyError && historyStatItems.length > 0 && <StatRow items={historyStatItems} />}

      <Card flush>
        <div style={{ padding: '4px 16px 0' }}>
          <Tabs
            value={tab}
            onChange={(k) => setTab(k as Tab)}
            tabs={[
              { key: 'active', label: 'Active Packages', count: pkgLoading || pkgError ? undefined : activePackages.length },
              { key: 'pipeline', label: 'Open for Bids', count: pkgLoading || pkgError ? undefined : openNow.length },
              { key: 'history', label: 'Bid History', count: historyStats?.totalBids },
            ]}
          />
        </div>
        <div style={{ padding: 12 }}>
          <Toolbar
            search={q}
            onSearch={setQ}
            placeholder={tab === 'history' ? 'Search projects, types, locations…' : 'Search packages or trades…'}
            filters={tab === 'history' ? (
              <div className="k-row-actions" role="group" aria-label="Outcome filter">
                {(['all', 'won', 'lost', 'pending'] as const).map((f) => (
                  <Button key={f} size="sm" variant={historyFilter === f ? 'primary' : 'secondary'} onClick={() => { setHistoryFilter(f); fetchHistory(f === 'all' ? undefined : f); }}>
                    {historyLabel[f]}
                  </Button>
                ))}
              </div>
            ) : undefined}
          />
        </div>

        {tab === 'history' ? (
          historyError ? (
            <EmptyState
              icon={<WarningCircle size={22} />}
              title="Couldn't load bid history"
              text="Check your connection and try again."
              action={<Button onClick={refreshHistory}>Retry</Button>}
            />
          ) : (
            <DataTable
              columns={historyColumns}
              rows={historyRows}
              rowKey={(b) => b.id}
              loading={historyLoading}
              onRowClick={openEdit}
              rowActions={(b) => [
                { label: 'Set Outcome', icon: <Trophy size={14} />, inline: true, onClick: () => setOutcomeBid(b) },
                { label: 'Edit Amount & Note', icon: <PencilSimple size={14} />, onClick: () => openEdit(b) },
                { label: 'Copy Amount', icon: <Clipboard size={14} />, onClick: () => copyAmount(b) },
                { label: 'Delete', icon: <Trash size={14} />, tone: 'danger', onClick: () => setConfirmDelete({ kind: 'bid', id: b.id, name: b.project_name }) },
              ]}
              empty={
                <EmptyState
                  title={needle ? 'No bids match your search' : historyFilter === 'all' ? 'No bid history yet' : `No ${historyFilter} bids`}
                  text={historyFilter === 'all' && !needle
                    ? 'Bid outcomes land here. Record a win or loss on any package and your win rate, average margin, and pursued value build themselves.'
                    : 'Try a different filter or clear the search.'}
                  action={<Button onClick={refreshHistory}>Refresh</Button>}
                />
              }
            />
          )
        ) : pkgError ? (
          <EmptyState
            icon={<WarningCircle size={22} />}
            title="Couldn't load bid packages"
            text="Check your connection and try again."
            action={<Button onClick={fetchPackages}>Retry</Button>}
          />
        ) : (
          <DataTable
            columns={pkgColumns}
            rows={pkgRows}
            rowKey={(p) => p.id}
            loading={pkgLoading}
            defaultSort={{ key: 'due', dir: 'asc' }}
            onRowClick={(p) => router.push(pkgHref(p))}
            rowActions={(p) => {
              const st = String(p.status || '').toLowerCase();
              const busy = busyPkg === p.id;
              return [
                { label: 'View', icon: <Eye size={14} />, inline: true, href: pkgHref(p) },
                { label: 'Level & Award', icon: <Trophy size={14} />, href: pkgHref(p), hidden: (Number(p.num_responded ?? p.bid_count) || 0) === 0 },
                { label: busy ? 'Working…' : 'Duplicate', icon: <Copy size={14} />, onClick: () => duplicatePackage(p), disabled: busy },
                { label: 'Close', icon: <Archive size={14} />, onClick: () => setConfirmClose(p), disabled: busy, hidden: st === 'closed' || st === 'awarded' },
                { label: 'Delete', icon: <Trash size={14} />, tone: 'danger', onClick: () => setConfirmDelete({ kind: 'package', id: p.id, name: p.name || 'this package' }) },
              ];
            }}
            empty={
              <EmptyState
                title={needle ? 'No packages match your search' : tab === 'pipeline' ? 'Nothing open for bids' : 'No active bid packages'}
                text={needle
                  ? 'Clear the search to see every package.'
                  : 'Create a bid package on a project. Invites go out with portal links, and sub bids come back priced against your line items.'}
                action={<Button variant="primary" onClick={() => router.push('/app/projects')}>Go to Projects</Button>}
              />
            }
          />
        )}
      </Card>

      {/* ── Score a bid ── */}
      <FormModal
        open={showScore}
        onClose={closeScore}
        title="Score a Bid"
        subtitle="Fit score and win probability from your own bid history. The result is saved to Bid History as pending."
        busy={scoring}
        error={scoreError}
        onSubmit={scoreResult ? undefined : async () => { await submitScore(); }}
        submitLabel="Score This Bid"
        footer={scoreResult ? (
          <>
            <Button variant="ghost" onClick={resetScore}>Score Another</Button>
            <Button variant="primary" onClick={() => { setShowScore(false); resetScore(); setTab('history'); refreshHistory(); }}>View in History</Button>
          </>
        ) : undefined}
      >
        {scoreResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <StatRow items={[
              { label: 'Fit Score', value: `${scoreResult.fitScore} / 100`, tone: scoreResult.fitScore >= 70 ? 'good' : scoreResult.fitScore >= 50 ? 'warn' : 'bad' },
              { label: 'Win Probability', value: `${scoreResult.winPct}%`, tone: scoreResult.winPct >= 60 ? 'good' : scoreResult.winPct >= 40 ? 'warn' : 'bad' },
            ]} />
            <Card><strong>{scoreResult.recommendation}</strong></Card>
            <span className="k-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle size={14} weight="fill" color="#34D399" /> Saved to your bid history as a pending bid.
            </span>
          </div>
        ) : (
          <FormGrid cols={2}>
            <Field
              label="Auto-Fill from a Project"
              span
              hint={autofilling ? 'Filling from the project…' : scoreMeta.historyHint || 'Sage pulls value, trade, location and due date from the project record.'}
            >
              <select className="k-select" value={pickProject} onChange={(e) => autofillFromProject(e.target.value)} disabled={autofilling}>
                <option value="">{scoreProjects.length ? 'Choose a project…' : 'No projects found — enter manually'}</option>
                {scoreProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Project Name" required>
              <Input value={scoreForm.projectName} onChange={(e) => setScoreForm((f) => ({ ...f, projectName: e.target.value }))} placeholder="e.g. Scottsdale Office Buildout" />
            </Field>
            <Field label="Bid Amount" required hint={scoreMeta.valueSource ? `Pulled from ${scoreMeta.valueSource}. Adjust before scoring.` : undefined}>
              <Input inputMode="decimal" value={scoreForm.bidAmount} onChange={(e) => setScoreForm((f) => ({ ...f, bidAmount: e.target.value }))} placeholder="$2,500,000" />
            </Field>
            <Field label="Target Margin (%)">
              <Input inputMode="decimal" value={scoreForm.margin} onChange={(e) => setScoreForm((f) => ({ ...f, margin: e.target.value }))} placeholder="15" />
            </Field>
            <Field label="Trade">
              <select className="k-select" value={scoreForm.tradeType} onChange={(e) => setScoreForm((f) => ({ ...f, tradeType: e.target.value }))}>
                <option value="">Select a trade…</option>
                {scoreForm.tradeType && !SUB_TRADES.includes(scoreForm.tradeType) && <option value={scoreForm.tradeType}>{scoreForm.tradeType}</option>}
                {SUB_TRADES_BY_DIVISION.map((g) => (
                  <optgroup key={g.division} label={`${g.division} — ${g.name}`}>
                    {g.trades.map((t) => <option key={t} value={t}>{t}</option>)}
                  </optgroup>
                ))}
                <optgroup label="Other / Specialty">
                  {SUB_TRADES.filter((t) => !SUB_TRADES_BY_DIVISION.some((g) => g.trades.includes(t))).map((t) => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              </select>
            </Field>
            <Field label="Notes" span>
              <Textarea value={scoreForm.notes} onChange={(e) => setScoreForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Owner, scope, competition — anything the score should weigh" />
            </Field>
            {scoring && <span className="k-hint k-span-all" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Robot size={14} /> Scoring…</span>}
          </FormGrid>
        )}
      </FormModal>

      {/* ── Edit bid ── */}
      <FormModal
        open={!!editBid}
        onClose={() => setEditBid(null)}
        title={`Edit Bid — ${editBid?.project_name ?? ''}`}
        busy={editBusy}
        error={editError}
        onSubmit={saveEdit}
        submitLabel="Save Bid"
      >
        <FormGrid cols={2}>
          <Field label="Bid Amount" required>
            <Input inputMode="decimal" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} autoFocus />
          </Field>
          <Field label="Quick Adjust" hint="Applies to the amount above. Saved when you click Save Bid.">
            <div className="k-row-actions" style={{ justifyContent: 'flex-start' }}>
              {[-10, -5, 5, 10].map((pct) => (
                <Button key={pct} size="sm" onClick={() => {
                  const base = parseFloat(editAmount.replace(/[^0-9.]/g, '')) || 0;
                  setEditAmount(String(Math.round(base * (1 + pct / 100))));
                }}>{pct > 0 ? '+' : ''}{pct}%</Button>
              ))}
            </div>
          </Field>
          <Field label="Note" span>
            <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Why this number, what changed…" />
          </Field>
        </FormGrid>
      </FormModal>

      {/* ── Close confirmation ── */}
      <FormModal
        open={!!confirmClose}
        onClose={() => setConfirmClose(null)}
        size="sm"
        busy={!!confirmClose && busyPkg === confirmClose.id}
        title="Close Bid Package?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClose(null)} disabled={!!busyPkg}>Cancel</Button>
            <Button variant="primary" icon={<Archive size={15} />} onClick={() => confirmClose && closePackage(confirmClose)} disabled={!!busyPkg}>
              {confirmClose && busyPkg === confirmClose.id ? 'Closing…' : 'Close Package'}
            </Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)' }}>
          {confirmClose?.name || 'This package'} stops taking new bids and moves to history. You can still award a winner from inside the package.
        </p>
      </FormModal>

      {/* ── Delete confirmation ── */}
      <FormModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        size="sm"
        busy={deleting}
        title={confirmDelete?.kind === 'package' ? 'Delete Bid Package?' : 'Delete Bid?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" icon={<Trash size={15} />} onClick={runDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button>
          </>
        }
      >
        <p style={{ color: 'var(--text-secondary)' }}>
          {confirmDelete?.name} will be permanently removed{confirmDelete?.kind === 'package' ? ', along with its invitations and submitted bids' : ''}. This can’t be undone.
        </p>
      </FormModal>

      <MarkOutcomeModal
        open={!!outcomeBid}
        onClose={() => setOutcomeBid(null)}
        source="bid"
        sourceId={outcomeBid?.id}
        defaultOutcome={outcomeBid?.outcome === 'lost' ? 'lost' : outcomeBid?.outcome === 'won' ? 'won' : undefined}
        projectName={outcomeBid?.project_name}
        projectType={outcomeBid?.project_type}
        trades={outcomeBid?.trades}
        ourAmount={outcomeBid?.bid_amount ?? undefined}
        onRecorded={() => { setOutcomeBid(null); refreshHistory(); }}
      />

      <Toast message={toast?.message ?? null} tone={toast?.tone} />
      <UnsavedGuardModal guard={guard} />
    </PageShell>
  );
}

export default function BidsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg-base)' }} />}>
      <BidsPageInner />
    </Suspense>
  );
}
