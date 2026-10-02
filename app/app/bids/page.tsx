'use client';
import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { WarningCircle, Brain, ChartBar, ArrowRight, Tray, CaretDown, PencilSimple, Clipboard, ChatCircle, Trash, CheckCircle, XCircle, Clock, Robot, X, Users, CalendarBlank, CurrencyDollar, Gavel, Plus, TrendUp } from '@phosphor-icons/react';
import { useProjects } from '@/lib/hooks/useProjects';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { Skeleton, SkeletonKPI } from '@/components/ui/Skeleton';
import MarkOutcomeModal from '@/components/bids/MarkOutcomeModal';
import { PremiumSurface, ModuleHero, SectionCard, StatCard, PremiumEmpty, StatStrip, goldButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import { postLearningEvent } from '@/lib/last-used';
import { SUB_TRADES, SUB_TRADES_BY_DIVISION } from '@/lib/construction-intelligence';

const GOLD='#F59E0B',DARK='#0a0a0a',RAISED='#141416',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF',RED='#ef4444',GREEN='#3dd68c';

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

function BidsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as 'active'|'pipeline'|'history'|'score'|null;
  const [tab, setTab] = useState<'active'|'pipeline'|'history'>(
    (tabParam === 'history' || tabParam === 'active' || tabParam === 'pipeline') ? tabParam : 'active'
  );

  // History state
  const [historyBids, setHistoryBids] = useState<BidRecord[]>([]);
  const [historyStats, setHistoryStats] = useState<BidStats|null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all'|'won'|'lost'|'pending'>('all');

  // Money action menu state
  const [menuId, setMenuId] = useState<string|null>(null);
  const [editId, setEditId] = useState<string|null>(null);
  const [editVal, setEditVal] = useState('');
  const [adjustId, setAdjustId] = useState<string|null>(null);
  const [noteId, setNoteId] = useState<string|null>(null);
  const [noteVal, setNoteVal] = useState('');
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [copiedId, setCopiedId] = useState<string|null>(null);
  const [toast, setToast] = useState<string|null>(null);
  const [outcomeBid, setOutcomeBid] = useState<BidRecord|null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500); }
  const fmt = (n: number | null | undefined) => '$' + ((Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }));

  function openMenu(id: string) { setMenuId(id); setEditId(null); setAdjustId(null); setNoteId(null); setDeleteId(null); }
  function closeAll() { setMenuId(null); setEditId(null); setAdjustId(null); setNoteId(null); setDeleteId(null); }

  async function handleSaveEdit(id: string) {
    const amount = parseFloat(editVal);
    if (isNaN(amount) || amount < 0) return;
    try {
      const r = await fetch(`/api/bids/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bid_amount: amount }) });
      if (!r.ok) throw new Error();
      setHistoryBids(prev => prev.map(b => b.id === id ? { ...b, bid_amount: amount } : b));
      showToast('Amount updated');
    } catch { showToast('Failed to update'); }
    setEditId(null);
  }

  async function handleAdjust(id: string, pct: number) {
    const bid = historyBids.find(b => b.id === id);
    if (!bid) return;
    const newAmt = Math.round(bid.bid_amount * (1 + pct / 100));
    try {
      const r = await fetch(`/api/bids/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bid_amount: newAmt }) });
      if (!r.ok) throw new Error();
      setHistoryBids(prev => prev.map(b => b.id === id ? { ...b, bid_amount: newAmt } : b));
      showToast(`Adjusted ${pct > 0 ? '+' : ''}${pct}%`);
    } catch { showToast('Failed to adjust'); }
    setAdjustId(null);
  }

  function handleCopy(id: string, amount: number) {
    navigator.clipboard.writeText(fmt(amount)).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    setMenuId(null);
  }

  async function handleSaveNote(id: string) {
    if (!noteVal.trim()) return;
    try {
      const r = await fetch(`/api/bids/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: noteVal.trim() }) });
      if (!r.ok) throw new Error();
      setHistoryBids(prev => prev.map(b => b.id === id ? { ...b, notes: noteVal.trim() } : b));
      showToast('Note saved');
    } catch { showToast('Failed to save note'); }
    setNoteId(null); setNoteVal('');
  }

  async function handleDelete(id: string) {
    try {
      const r = await fetch(`/api/bids/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      setHistoryBids(prev => prev.filter(b => b.id !== id));
      showToast('Bid deleted');
    } catch { showToast('Failed to delete'); }
    setDeleteId(null);
  }

  // Score modal state
  const [showScore, setShowScore] = useState(tabParam === 'score');
  const [scoreForm, setScoreForm] = useState({projectName:'',bidAmount:'',margin:'',tradeType:'',notes:''});
  const [scoring, setScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<{fitScore:number,winPct:number,recommendation:string}|null>(null);
  const [scoreError, setScoreError] = useState<string|null>(null);
  // Sage auto-fill: pick an existing project → derive every scoring input.
  const { projects: liveProjects } = useProjects();
  const scoreProjects = useMemo(
    () => (liveProjects as any[]).map((p: any) => ({ id: p.id, name: p.name || 'Untitled Project' })).filter((p) => p.id),
    [liveProjects],
  );
  const [pickProject, setPickProject] = useState('');
  const [autofilling, setAutofilling] = useState(false);
  // Hidden richer inputs the auto-fill supplies (used by submitScore + hints).
  const [scoreMeta, setScoreMeta] = useState<{location?:string;dueDate?:string|null;ownerName?:string;projectType?:string;valueSource?:string|null;historyHint?:string}>({});

  /* ── Unsaved-work protection (R14): dirty once the score form has content
   *    and no result yet (scoring persists the bid, so a result = saved). ── */
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
      setScoreForm(f => ({ ...f, ...v.scoreForm }));
      if (v.scoreMeta) setScoreMeta(v.scoreMeta);
      if (v.pickProject) setPickProject(v.pickProject);
      setShowScore(true);
    },
    onSave: () => submitScore(),
  });

  /** Close the score modal through the guard — clean closes immediately,
   *  dirty asks Save / Discard / Stay first. */
  function closeScore() {
    guard.requestClose(() => {
      setShowScore(false); setScoreResult(null); setScoreError(null); setPickProject(''); setScoreMeta({});
    });
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

  // Bid packages — one tenant-scoped fetch (spans all projects) feeds BOTH the
  // Active tab (all live packages) and the Pipeline tab (open/bidding opportunities).
  const [packages, setPackages] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(true);
  const [pipelineError, setPipelineError] = useState(false);
  const [dupPkgId, setDupPkgId] = useState<string|null>(null);
  const [closingId, setClosingId] = useState<string|null>(null);

  /** One-click close: stops a package taking new bids and moves it to history.
   *  Hits the tenant-scoped close endpoint (Projects:Edit), then refreshes. */
  async function handleClosePackage(op: any) {
    if (closingId) return;
    if (typeof window !== 'undefined' &&
        !window.confirm(`Close "${op.name || 'this package'}"? It stops taking new bids and moves to history. You can still award a winner from inside the package.`)) return;
    setClosingId(op.id);
    try {
      const r = await fetch(`/api/bid-packages/${op.id}/close`, { method: 'POST' });
      if (!r.ok) throw new Error();
      showToast('Package closed');
      fetchPackages();
    } catch { showToast('Could not close the package'); }
    setClosingId(null);
  }

  /** One-click repeat: copies a package's real server data — scope, trade,
   *  instructions, CSI codes, line items — into a new draft. Dates and status
   *  regenerate (draft, no due date) so the copy is a fresh solicitation. */
  async function handleDuplicatePackage(op: any) {
    if (dupPkgId) return;
    setDupPkgId(op.id);
    try {
      const r = await fetch(`/api/bid-packages/${op.id}`);
      if (!r.ok) throw new Error('detail failed');
      const d = await r.json();
      const src = d.bidPackage || {};
      const items: any[] = d.items || [];
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
          status: 'draft',        // regenerates — open it when it's ready to bid
          due_date: null,         // regenerates — set a fresh bid due date
          pre_bid_date: null,     // regenerates
          budget_estimate: src.budget_estimate != null ? Number(src.budget_estimate) : null,
          notes: src.notes || null,
          bid_instructions: src.bid_instructions || null,
          csi_codes: Array.isArray(src.csi_codes) ? src.csi_codes : [],
          is_public_project: !!src.is_public_project,
          requires_bond: !!src.requires_bond,
          insurance_requirements: src.insurance_requirements || null,
          lineItems: items.map(it => ({
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            unit_price: it.unit_price,
            total_amount: it.total_amount,
            csi_code: it.csi_code,
            notes: it.notes,
          })),
        }),
      });
      const cd = await cr.json().catch(() => ({}));
      if (!cr.ok || !cd.bidPackage) throw new Error(cd.error || 'create failed');
      postLearningEvent('bid_package_duplicated', { projectId: src.project_id, meta: { fromPackageId: op.id } });
      showToast(`Duplicated as draft — "${cd.bidPackage.name}". Set a due date, then open it for bids.`);
      fetchPackages();
    } catch {
      showToast('Could not duplicate the package');
    } finally {
      setDupPkgId(null);
    }
  }

  async function fetchPackages() {
    setPipelineLoading(true);
    setPipelineError(false);
    try {
      const r = await fetch('/api/bid-packages/list');
      if (!r.ok) throw new Error('Failed to load bid packages');
      const d = await r.json();
      const all: any[] = (d.bidPackages || []).filter((bp: any) => !bp.deleted_at);
      setPackages(all);
      setOpportunities(all.filter((bp: any) => bp.status === 'open' || bp.status === 'bidding').slice(0, 20));
      enrichPackages(all);
    } catch {
      setPipelineError(true);
    } finally {
      setPipelineLoading(false);
    }
  }

  // Leveling intelligence: /api/bid-packages/list returns bare rows, so pull
  // invites + submissions per live package (bounded to 24) and derive invited /
  // responded / low bid / spread. Every dollar is Number()-coerced — DB numerics
  // can round-trip as strings. A failed detail fetch just leaves that row bare.
  async function enrichPackages(all: any[]) {
    const ENRICH_SKIP = ['closed','cancelled','canceled','complete','completed','archived','withdrawn','lost'];
    const targets = all.filter(p => !ENRICH_SKIP.includes(String(p.status || '').toLowerCase())).slice(0, 24);
    if (targets.length === 0) return;
    const results = await Promise.allSettled(targets.map(async p => {
      const r = await fetch(`/api/bid-packages/${p.id}`);
      if (!r.ok) throw new Error('detail failed');
      const d = await r.json();
      const subs: any[] = (d.submissions || []).filter((s: any) => String(s.status || '').toLowerCase() !== 'withdrawn');
      const amts = subs
        .map((s: any) => ({ amt: Number(s.amount ?? s.base_amount ?? s.total_amount) || 0, who: s.company_name || s.sub_name || s.contact_name || '' }))
        .filter(a => a.amt > 0)
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
    const byId: Record<string, any> = {};
    for (const res of results) if (res.status === 'fulfilled') byId[(res.value as any).id] = res.value;
    if (Object.keys(byId).length === 0) return;
    const merge = (list: any[]) => list.map(p => byId[p.id] ? { ...p, ...byId[p.id] } : p);
    setPackages(prev => merge(prev));
    setOpportunities(prev => merge(prev));
  }

  useEffect(() => {
    fetchPackages();
  }, []);

  // Active = live packages across all projects, excluding terminal/awarded states.
  const TERMINAL_STATUSES = ['awarded','closed','cancelled','canceled','complete','completed','archived','withdrawn','lost'];
  const activePackages = packages.filter(p => !TERMINAL_STATUSES.includes(String(p.status || '').toLowerCase()));
  // Bid Center pulse — leveling context across every project. All money passes
  // through Number()||0 because DB numerics can arrive as strings.
  const openNow = activePackages.filter(p => ['open','bidding'].includes(String(p.status||'').toLowerCase()));
  const invitedTotal = activePackages.reduce((s, p) => s + (Number(p.num_invited) || 0), 0);
  const respondedTotal = activePackages.reduce((s, p) => s + (Number(p.num_responded ?? p.bid_count) || 0), 0);
  const lowBidPipeline = activePackages.reduce((s, p) => s + (Number(p.low_bid_amount) || 0), 0);
  const coveredCount = activePackages.filter(p => (Number(p.num_responded ?? p.bid_count) || 0) > 0).length;
  const awardedPkgs = packages.filter(p => String(p.status||'').toLowerCase() === 'awarded');
  const awardedTotal = awardedPkgs.reduce((s, p) => s + (Number(p.awarded_amount) || 0), 0);
  const widestSpread = activePackages.reduce((m: any, p: any) => (p.spread_pct != null && Number.isFinite(Number(p.spread_pct)) && (m == null || Number(p.spread_pct) > Number(m.spread_pct))) ? p : m, null as any);
  const spreadColor = (s: number) => s <= 10 ? GREEN : s <= 25 ? GOLD : '#ff7070';
  const daysUntil = (d?: string|null) => {
    if (!d) return null;
    const t = new Date(String(d).slice(0, 10) + 'T00:00:00').getTime();
    return isNaN(t) ? null : Math.ceil((t - Date.now()) / 86400000);
  };
  const fmtDate = (d?: string|null) => {
    if (!d) return '—';
    const dt = new Date(String(d).length <= 10 ? String(d) + 'T00:00:00' : String(d));
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  };

  // History error state (loading/empty handled below)
  const [historyError, setHistoryError] = useState(false);

  // Load history when tab switches to history
  useEffect(() => {
    if (tab === 'history' && historyBids.length === 0 && !historyError) {
      fetchHistory();
    }
  }, [tab]);

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

  function handleHistoryFilter(f: 'all'|'won'|'lost'|'pending') {
    setHistoryFilter(f);
    fetchHistory(f === 'all' ? undefined : f);
  }

  function recLabel(rec: string): string {
    const r = String(rec || '').toUpperCase();
    if (r === 'BID' || r.includes('STRONG')) return 'BID — strong fit';
    if (r === 'PASS' || r.includes('LOW')) return 'PASS — low fit';
    return 'BID WITH CAUTION — review scope';
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
      const amount = parseFloat(scoreForm.bidAmount.replace(/[^0-9.]/g,'')) || 0;
      const r = await fetch('/api/bids/score', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
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
        // No silent heuristic fallback — surface the real failure so the user can retry.
        setScoreError(d.error || 'Scoring failed. Please try again.');
        return false;
      }
      const label = recLabel(d.recommendation);
      setScoreResult({
        fitScore: d.score,
        winPct: d.winProbability,
        recommendation: d.reasoning ? `${label} — ${d.reasoning}` : label,
      });
      // The score is now persisted as a pending bid. Refresh history so it shows
      // there, and reset the History fetch guard so a switch reloads fresh data.
      setHistoryBids([]);
      if (tab === 'history') fetchHistory(historyFilter === 'all' ? undefined : historyFilter);
      guard.clearDraft();
      return true;
    } catch {
      setScoreError('Network error — could not reach the scoring service. Please try again.');
      return false;
    } finally {
      setScoring(false);
    }
  }

  return (
    <>
    <PremiumSurface maxWidth={1300}>
      <ModuleHero
        eyebrow="Bid Center"
        eyebrowIcon={<Gavel size={13} weight="fill" color={GOLD} />}
        title="Bid"
        accent="Center"
        subtitle="Active bid packages, invites, and awards — all in one board"
        actions={<>
          <Link href="/app/bid-intelligence" style={goldOutlineButtonStyle} className="pmBtn"><Brain size={15} weight="regular" /> Bid Intelligence</Link>
          {/* Score a Bid is de-featured: still reachable at /app/bids?tab=score (and from Bid Intelligence). */}
          <Link href="/app/projects" title="Open a project to start a package." style={goldButtonStyle} className="pmBtn"><Plus size={15} weight="bold" /> New Bid Package</Link>
        </>}
      />

      {/* Bid Center pulse — the page walks in knowing every live package */}
      {!pipelineLoading && !pipelineError && packages.length > 0 && (
        <StatStrip items={[
          {href: '/app/bids',  label: 'Live Packages', value: String(activePackages.length), sub: `${openNow.length} open for bids` },
          {href: '/app/bids',  label: 'Bids In', value: `${respondedTotal} / ${invitedTotal}`, accent: respondedTotal > 0 ? GREEN : undefined, sub: 'responses vs invites' },
          {href: '/app/bids',  label: 'Coverage', value: activePackages.length ? `${coveredCount}/${activePackages.length}` : '—', accent: activePackages.length > 0 && coveredCount === activePackages.length ? GREEN : undefined, sub: activePackages.length - coveredCount > 0 ? `${activePackages.length - coveredCount} awaiting first bid` : 'every package has a bid' },
          {href: '/app/bids',  label: 'Low-Bid Pipeline', value: fmt(lowBidPipeline), sub: 'sum of current low bids' },
          {href: '/app/bids',  label: 'Awarded', value: fmt(awardedTotal), accent: awardedTotal > 0 ? GOLD : undefined, sub: `${awardedPkgs.length} package${awardedPkgs.length === 1 ? '' : 's'} placed` },
          {href: '/app/bids',  label: 'Widest Spread', value: widestSpread ? `${Math.round(Number(widestSpread.spread_pct))}%` : '—', accent: widestSpread ? spreadColor(Number(widestSpread.spread_pct)) : undefined, sub: widestSpread ? `${widestSpread.name || 'package'} — level before award` : 'needs 2+ bids on a package' },
        ]}/>
      )}

      {/* Tabs */}
      <div style={{display:'flex',gap:2,borderBottom:`1px solid ${BORDER}`,marginBottom:24}}>
        {(['active','pipeline','history'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:'10px 18px',border:'none',borderBottom:`2px solid ${tab===t?GOLD:'transparent'}`,background:'transparent',color:tab===t?GOLD:DIM,fontSize:13,fontWeight:tab===t?700:500,cursor:'pointer',textTransform:'capitalize' as const}}>
            {t==='active'?'Active Packages':t==='pipeline'?'Opportunity Pipeline':'Bid History'}
          </button>
        ))}
        <a href="/app/bids/leveling" style={{padding:'10px 18px',borderBottom:'2px solid transparent',color:'var(--brand-primary)',fontSize:13,fontWeight:700,textDecoration:'none',marginLeft:'auto',display:'inline-flex',alignItems:'center',gap:5}}>Bid Leveling <ArrowRight size={13} weight="bold" /></a>
      </div>

      {/* ── Pipeline Tab ──────────────────────────────────────────────────────── */}
      {tab==='pipeline'&&<div>
        {pipelineLoading ? (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {Array.from({length:6}).map((_,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:16,padding:'14px',border:`1px solid rgba(229,229,234,.5)`,borderRadius:8}}>
                <Skeleton width="30%" height={14}/>
                <Skeleton width="15%" height={14}/>
                <Skeleton width="12%" height={14}/>
                <Skeleton width="15%" height={14}/>
                <Skeleton width={64} height={24} borderRadius={5}/>
              </div>
            ))}
          </div>
        ) : pipelineError ? (
          <SectionCard>
            <PremiumEmpty
              tone="error"
              icon={<WarningCircle size={30} weight="duotone" color={RED} />}
              title="Couldn't load opportunity pipeline"
              description="We couldn't reach your bid packages. Check your connection and try again."
              action={<button onClick={fetchPackages} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
            />
          </SectionCard>
        ) : opportunities.length === 0 ? (
          <SectionCard>
            <PremiumEmpty
              icon={<ChartBar size={30} weight="duotone" color={GOLD} />}
              title="No Open Bid Packages"
              description="The pipeline tracks every package with status open or bidding across all projects. Create one on a project — invites go out with portal links, sub bids come back priced against your line items, and the spread flags what to level before you award."
              action={<button onClick={()=>router.push('/app/projects')} style={goldButtonStyle} className="pmBtn">Go to Projects</button>}
            />
          </SectionCard>
        ) : (
          <SectionCard title="Opportunity Pipeline" subtitle={`${opportunities.length} open ${opportunities.length===1?'opportunity':'opportunities'}`} icon={<ChartBar size={17} weight="duotone" color={GOLD} />} flush bodyStyle={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
            <thead><tr style={{background:'#1c1c1e'}}>
              {['Package Name','Trade','Status','Bid Due','Bids In','Low Bid','Spread','Actions'].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{opportunities.map(op=>(
              <tr key={op.id} style={{borderBottom:`1px solid rgba(229,229,234,.5)`}}>
                <td style={{padding:'12px 14px',color:TEXT,fontWeight:600}}>{op.name}</td>
                <td style={{padding:'12px 14px',color:DIM}}>{op.trade}</td>
                <td style={{padding:'12px 14px'}}><span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:'rgba(26,95,168,.12)',color:'#4a9de8',textTransform:'uppercase' as const}}>{op.status}</span></td>
                <td style={{padding:'12px 14px',color:DIM,whiteSpace:'nowrap' as const}}>{(()=>{const dd=daysUntil(op.bid_due_date||op.due_date);return <>{fmtDate(op.bid_due_date||op.due_date)}{dd!=null&&<span style={{marginLeft:6,fontWeight:700,fontSize:11,color:dd<0?'#ff7070':dd<=3?GOLD:DIM}}>{dd<0?`${Math.abs(dd)}d overdue`:dd===0?'due today':`${dd}d left`}</span>}</>;})()}</td>
                <td style={{padding:'12px 14px'}}><span style={{color:(Number(op.num_responded ?? op.bid_count)||0)>0?GREEN:DIM,fontVariantNumeric:'tabular-nums'}}>{Number(op.num_responded ?? op.bid_count)||0}</span><span style={{color:DIM}}> / {Number(op.num_invited)||0} invited</span></td>
                <td style={{padding:'12px 14px',fontVariantNumeric:'tabular-nums',color:op.low_bid_amount?TEXT:DIM}}>{op.low_bid_amount ? fmt(Number(op.low_bid_amount)||0) : '—'}</td>
                <td style={{padding:'12px 14px',fontVariantNumeric:'tabular-nums'}}>{op.spread_pct!=null&&Number.isFinite(Number(op.spread_pct)) ? (<span style={{fontWeight:700,color:spreadColor(Number(op.spread_pct))}}>{Math.round(Number(op.spread_pct))}%<span style={{color:DIM,fontWeight:500,fontSize:11}}> {Number(op.spread_pct)<=10?'tight':Number(op.spread_pct)<=25?'level it':'wide'}</span></span>) : (<span style={{color:DIM,fontSize:11}}>{(Number(op.num_responded ?? op.bid_count)||0)===1?'needs 2 bids':'—'}</span>)}</td>
                <td style={{padding:'12px 14px'}}>
                  <Link href={`/app/projects/${op.project_id}/bid-packages/${op.id}`} style={{display:'inline-block',textDecoration:'none',background:'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))',border:'none',borderRadius:'var(--radius-sm)',color:'#1C1C1E',fontSize:11,padding:'5px 12px',fontWeight:700,cursor:'pointer',boxShadow:'0 2px 8px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)'}}><span style={{display:'inline-flex',alignItems:'center',gap:4}}>View <ArrowRight size={11} weight="regular" /></span></Link>
                </td>
              </tr>
            ))}</tbody>
          </table>
          </SectionCard>
        )}
      </div>}

      {/* ── Active Tab ────────────────────────────────────────────────────────── */}
      {tab==='active'&&<div>
        {pipelineLoading ? (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {Array.from({length:6}).map((_,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:16,padding:'14px',border:`1px solid rgba(229,229,234,.5)`,borderRadius:8}}>
                <Skeleton width="26%" height={14}/>
                <Skeleton width="12%" height={14}/>
                <Skeleton width="10%" height={14}/>
                <Skeleton width="12%" height={14}/>
                <Skeleton width="12%" height={14}/>
                <Skeleton width={64} height={24} borderRadius={5}/>
              </div>
            ))}
          </div>
        ) : pipelineError ? (
          <SectionCard>
            <PremiumEmpty
              tone="error"
              icon={<WarningCircle size={30} weight="duotone" color={RED} />}
              title="Couldn't load active packages"
              description="We couldn't reach your bid packages. Check your connection and try again."
              action={<button onClick={fetchPackages} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
            />
          </SectionCard>
        ) : activePackages.length === 0 ? (
          <SectionCard>
            <PremiumEmpty
              icon={<Tray size={30} weight="duotone" color={GOLD} />}
              title="No Active Bid Packages"
              description="Active packages are every non-awarded solicitation across your projects — invites, responses, low bid, and spread in one table. Create a package on a project to start collecting priced sub bids."
              action={<button onClick={()=>router.push('/app/projects')} style={goldButtonStyle} className="pmBtn">View Projects</button>}
            />
          </SectionCard>
        ) : (
          <SectionCard title="Active Packages" subtitle={`${activePackages.length} live ${activePackages.length===1?'package':'packages'}`} icon={<Tray size={17} weight="duotone" color={GOLD} />} flush bodyStyle={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
            <thead><tr style={{background:'#1c1c1e'}}>
              {['Package','Trade','Status','Bid Due','Invited / Responded','Low Bid','Spread','Actions'].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{activePackages.map(op=>{
              const st = String(op.status||'').toLowerCase();
              const stColor = st==='open'||st==='bidding' ? {bg:'rgba(26,95,168,.12)',c:'#4a9de8'}
                : st==='draft' ? {bg:'rgba(143,163,192,.14)',c:DIM}
                : {bg:'rgba(245, 158, 11,.12)',c:GOLD};
              const invited = op.num_invited ?? 0;
              const responded = op.num_responded ?? op.bid_count ?? 0;
              return (
                <tr key={op.id} style={{borderBottom:`1px solid rgba(229,229,234,.5)`}}>
                  <td style={{padding:'12px 14px',color:TEXT,fontWeight:600,maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{op.name||'Untitled Package'}</td>
                  <td style={{padding:'12px 14px',color:DIM}}>{op.trade||'—'}</td>
                  <td style={{padding:'12px 14px'}}><span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,background:stColor.bg,color:stColor.c,textTransform:'uppercase' as const}}>{op.status||'—'}</span></td>
                  <td style={{padding:'12px 14px',color:DIM}}><span style={{display:'inline-flex',alignItems:'center',gap:5}}><CalendarBlank size={13} weight="regular" color={DIM} />{fmtDate(op.bid_due_date||op.due_date)}</span></td>
                  <td style={{padding:'12px 14px',color:DIM}}><span style={{display:'inline-flex',alignItems:'center',gap:5}}><Users size={13} weight="regular" color={DIM} /><span style={{color:TEXT,fontVariantNumeric:'tabular-nums'}}>{invited}</span> / <span style={{color:responded>0?GREEN:DIM,fontVariantNumeric:'tabular-nums'}}>{responded}</span></span></td>
                  <td style={{padding:'12px 14px',color:op.low_bid_amount?TEXT:DIM,fontVariantNumeric:'tabular-nums'}}>{op.low_bid_amount ? (<span style={{display:'inline-flex',alignItems:'center',gap:4}}><CurrencyDollar size={13} weight="regular" color={GREEN} />{fmt(Number(op.low_bid_amount)||0)}{op.low_bid_company?<span style={{color:DIM,fontSize:11}}> · {op.low_bid_company}</span>:null}</span>) : '—'}</td>
                  <td style={{padding:'12px 14px',fontVariantNumeric:'tabular-nums'}}>{op.spread_pct!=null&&Number.isFinite(Number(op.spread_pct)) ? (<span style={{fontWeight:700,color:spreadColor(Number(op.spread_pct))}}>{Math.round(Number(op.spread_pct))}%<span style={{color:DIM,fontWeight:500,fontSize:11}}> {Number(op.spread_pct)<=10?'tight':Number(op.spread_pct)<=25?'level it':'wide'}</span></span>) : (<span style={{color:DIM,fontSize:11}}>{(Number(responded)||0)===1?'needs 2 bids':'—'}</span>)}</td>
                  <td style={{padding:'12px 14px',whiteSpace:'nowrap' as const}}>
                    <Link href={`/app/projects/${op.project_id}/bid-packages/${op.id}`} style={{display:'inline-block',textDecoration:'none',background:'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))',border:'none',borderRadius:'var(--radius-sm)',color:'#1C1C1E',fontSize:11,padding:'5px 12px',fontWeight:700,cursor:'pointer',boxShadow:'0 2px 8px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)'}}><span style={{display:'inline-flex',alignItems:'center',gap:4}}>View <ArrowRight size={11} weight="regular" /></span></Link>
                    <button
                      onClick={()=>handleDuplicatePackage(op)}
                      disabled={dupPkgId===op.id}
                      title="Copy scope, trade, instructions, and line items into a new draft — dates and status regenerate"
                      style={{marginLeft:6,background:'transparent',border:`1px solid ${BORDER}`,borderRadius:'var(--radius-sm)',color:dupPkgId===op.id?DIM:TEXT,fontSize:11,padding:'5px 10px',fontWeight:700,cursor:dupPkgId===op.id?'wait':'pointer',opacity:dupPkgId===op.id?0.6:1}}
                    >{dupPkgId===op.id?'Duplicating…':'Duplicate'}</button>
                    {op.status!=='closed'&&op.status!=='awarded'&&(
                    <button
                      onClick={()=>handleClosePackage(op)}
                      disabled={closingId===op.id}
                      title="Stop taking new bids and move this package to history. You can still award a winner from inside the package."
                      style={{marginLeft:6,background:'transparent',border:`1px solid ${BORDER}`,borderRadius:'var(--radius-sm)',color:closingId===op.id?DIM:TEXT,fontSize:11,padding:'5px 10px',fontWeight:700,cursor:closingId===op.id?'wait':'pointer',opacity:closingId===op.id?0.6:1}}
                    >{closingId===op.id?'Closing…':'Close'}</button>
                    )}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
          </SectionCard>
        )}
      </div>}

      {/* ── History Tab ───────────────────────────────────────────────────────── */}
      {tab==='history'&&<div>
        {/* Stats — skeletons while loading, real values once loaded (hidden on error) */}
        {historyLoading ? (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:20}}>
            {Array.from({length:6}).map((_,i)=>(<SkeletonKPI key={i}/>))}
          </div>
        ) : (!historyError && historyStats) ? (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:20}}>
            {[
              {l:'Total Bids',v:(historyStats.totalBids ?? 0),c:undefined as string|undefined,icon:<Gavel size={19} weight="duotone" color={GOLD} />},
              {l:'Won',v:(historyStats.wonBids ?? 0),c:'#3dd68c',icon:<CheckCircle size={19} weight="duotone" color={'#3dd68c'} />},
              {l:'Lost',v:(historyStats.lostBids ?? 0),c:'#ff7070',icon:<XCircle size={19} weight="duotone" color={'#ff7070'} />},
              {l:'Win Rate',v:(historyStats.winRate ?? 0)+'%',c:(historyStats.winRate ?? 0)>=50?'#3dd68c':GOLD,icon:<TrendUp size={19} weight="duotone" color={(historyStats.winRate ?? 0)>=50?'#3dd68c':GOLD} />},
              {l:'Avg Margin',v:(Number(historyStats.avgMargin) || 0).toFixed(1)+'%',c:GOLD,icon:<ChartBar size={19} weight="duotone" color={GOLD} />},
              {l:'Total Value',v:fmt(Number(historyStats.totalValue) || 0),c:GOLD,icon:<CurrencyDollar size={19} weight="duotone" color={GOLD} />},
            ].map((k,i)=>(
              <StatCard key={k.l} icon={k.icon} label={k.l} value={k.v} accent={k.c} delay={i*0.04}  href="/app/bids"/>
            ))}
          </div>
        ) : null}
        {/* Filter pills */}
        <div style={{display:'flex',gap:8,marginBottom:16}}>
          {(['all','won','lost','pending'] as const).map(f=>(
            <button key={f} onClick={()=>handleHistoryFilter(f)} style={{padding:'5px 14px',border:`1px solid ${historyFilter===f?GOLD:BORDER}`,borderRadius:20,background:historyFilter===f?'rgba(245, 158, 11,.12)':'transparent',color:historyFilter===f?GOLD:DIM,fontSize:12,fontWeight:historyFilter===f?700:500,cursor:'pointer',textTransform:'capitalize' as const}}>{f}</button>
          ))}
        </div>
        {/* LOADING — skeleton rows, never computed zeros */}
        {historyLoading&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
          {Array.from({length:6}).map((_,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:16,padding:'14px',border:`1px solid rgba(229,229,234,.5)`,borderRadius:8}}>
              <Skeleton width="22%" height={14}/>
              <Skeleton width="12%" height={14}/>
              <Skeleton width="12%" height={14}/>
              <Skeleton width="14%" height={14}/>
              <Skeleton width="10%" height={14}/>
              <Skeleton width={70} height={20} borderRadius={4}/>
            </div>
          ))}
        </div>}
        {/* ERROR — distinct from empty, with Retry */}
        {!historyLoading&&historyError&&<SectionCard>
          <PremiumEmpty
            tone="error"
            icon={<WarningCircle size={30} weight="duotone" color={RED} />}
            title="Couldn't load bid history"
            description="We couldn't reach your bid history. Check your connection and try again."
            action={<button onClick={()=>fetchHistory(historyFilter==='all'?undefined:historyFilter)} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
          />
        </SectionCard>}
        {/* EMPTY — genuine zero results on a successful load */}
        {!historyLoading&&!historyError&&historyBids.length===0&&<SectionCard>
          <PremiumEmpty
            icon={<ChartBar size={30} weight="duotone" color={GOLD} />}
            title={historyFilter==='all'?'No bid history yet':'No '+historyFilter+' bids found'}
            description={historyFilter==='all'
              ? 'Bid outcomes land here. Record a win or loss on any package and your win rate, average margin, and pursued value build themselves.'
              : 'No '+historyFilter+' bids on record. Record outcomes from the All view to see them here.'}
            action={<button onClick={()=>fetchHistory(historyFilter==='all'?undefined:historyFilter)} style={goldOutlineButtonStyle} className="pmBtn">Refresh</button>}
          />
        </SectionCard>}
        {!historyLoading&&!historyError&&historyBids.length>0&&<table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:13}}>
          <thead><tr style={{background:'#1c1c1e'}}>
            {['Project','Type','Bid Date','Bid Amount','Margin %','Location','Outcome','Awarded To','Actions'].map(h=>(
              <th key={h} style={{padding:'10px 14px',textAlign:'left' as const,borderBottom:`1px solid ${BORDER}`}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{historyBids.map(b=>{
            const oc = b.outcome==='won'
              ? {bg:'rgba(26,138,74,.12)',c:'#3dd68c'}
              : b.outcome==='lost'
              ? {bg:'rgba(192,48,48,.12)',c:'#ff7070'}
              : b.outcome==='pending'
              ? {bg:'rgba(245, 158, 11,.12)',c:GOLD}
              : {bg:'rgba(143,163,192,.1)',c:DIM};
            return <tr key={b.id} style={{borderBottom:`1px solid rgba(229,229,234,.5)`}}>
              <td style={{padding:'12px 14px',color:TEXT,fontWeight:600,maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' as const}}>{b.project_name}</td>
              <td style={{padding:'12px 14px',color:DIM}}>{b.project_type}</td>
              <td style={{padding:'12px 14px',color:DIM}}>{b.bid_date}</td>
              {/* ── Money cell with action menu ── */}
              <td style={{padding:'12px 14px',position:'relative' as const}}>
                {deleteId===b.id ? (
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:12,color:RED,fontWeight:600}}>Delete this bid?</span>
                    <button onClick={()=>handleDelete(b.id)} style={{padding:'3px 10px',background:'rgba(239,68,68,.15)',border:`1px solid rgba(239,68,68,.3)`,borderRadius:5,color:RED,fontSize:11,fontWeight:700,cursor:'pointer'}}>Yes</button>
                    <button onClick={()=>setDeleteId(null)} style={{padding:'3px 10px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,cursor:'pointer'}}>Cancel</button>
                  </div>
                ) : editId===b.id ? (
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    <input value={editVal} onChange={e=>setEditVal(e.target.value)} type="number" autoFocus onKeyDown={e=>{if(e.key==='Enter')handleSaveEdit(b.id);if(e.key==='Escape')setEditId(null);}} style={{width:110,padding:'4px 8px',background:DARK,border:`1px solid ${GOLD}`,borderRadius:5,color:TEXT,fontSize:12,outline:'none',textAlign:'right' as const}}/>
                    <button onClick={()=>handleSaveEdit(b.id)} style={{padding:'3px 8px',background:`linear-gradient(135deg,${GOLD},#FBBF24)`,border:'none',borderRadius:5,color:'#1C1C1E',fontSize:11,fontWeight:700,cursor:'pointer'}}>Save</button>
                    <button onClick={()=>setEditId(null)} style={{padding:'3px 8px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,cursor:'pointer'}}>Cancel</button>
                  </div>
                ) : adjustId===b.id ? (
                  <div style={{display:'flex',alignItems:'center',gap:3,flexWrap:'wrap' as const}}>
                    {[-10,-5,5,10].map(p=>(
                      <button key={p} onClick={()=>handleAdjust(b.id,p)} style={{padding:'3px 8px',background:p>0?'rgba(61,214,140,.1)':'rgba(239,68,68,.1)',border:`1px solid ${p>0?'rgba(61,214,140,.25)':'rgba(239,68,68,.25)'}`,borderRadius:5,color:p>0?GREEN:RED,fontSize:11,fontWeight:700,cursor:'pointer'}}>{p>0?'+':''}{p}%</button>
                    ))}
                    <button onClick={()=>setAdjustId(null)} style={{padding:'3px 6px',background:'none',border:'none',color:DIM,fontSize:11,cursor:'pointer'}}>Cancel</button>
                  </div>
                ) : noteId===b.id ? (
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    <input value={noteVal} onChange={e=>setNoteVal(e.target.value)} placeholder="Add a note…" autoFocus onKeyDown={e=>{if(e.key==='Enter')handleSaveNote(b.id);if(e.key==='Escape'){setNoteId(null);setNoteVal('');}}} style={{width:160,padding:'4px 8px',background:DARK,border:`1px solid ${GOLD}`,borderRadius:5,color:TEXT,fontSize:12,outline:'none'}}/>
                    <button onClick={()=>handleSaveNote(b.id)} style={{padding:'3px 8px',background:`linear-gradient(135deg,${GOLD},#FBBF24)`,border:'none',borderRadius:5,color:'#1C1C1E',fontSize:11,fontWeight:700,cursor:'pointer'}}>Save</button>
                    <button onClick={()=>{setNoteId(null);setNoteVal('');}} style={{padding:'3px 8px',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,cursor:'pointer'}}>Cancel</button>
                  </div>
                ) : (
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    <span style={{color:TEXT,fontVariantNumeric:'tabular-nums'}}>{fmt(b.bid_amount)}</span>
                    {copiedId===b.id && <span style={{fontSize:10,color:GREEN,fontWeight:600}}>Copied!</span>}
                    <button onClick={(e)=>{e.stopPropagation();openMenu(b.id);}} style={{background:'none',border:'none',color:DIM,cursor:'pointer',fontSize:10,padding:'2px 4px',lineHeight:1,opacity:0.6}} onMouseEnter={e=>(e.currentTarget.style.opacity='1')} onMouseLeave={e=>(e.currentTarget.style.opacity='0.6')}><CaretDown size={12} weight="regular" /></button>
                    {menuId===b.id&&(
                      <div style={{position:'absolute',top:36,right:14,background:RAISED,border:`1px solid ${BORDER}`,borderRadius:8,padding:4,zIndex:100,minWidth:160,boxShadow:'0 8px 24px rgba(0,0,0,.4)'}}>
                        {[
                          {label:'Edit Amount',icon:<PencilSimple size={14} weight="regular" />,action:()=>{setMenuId(null);setEditId(b.id);setEditVal(String(b.bid_amount));}},
                          {label:'Adjust %',icon:<ChartBar size={14} weight="regular" />,action:()=>{setMenuId(null);setAdjustId(b.id);}},
                          {label:'Copy Amount',icon:<Clipboard size={14} weight="regular" />,action:()=>handleCopy(b.id,b.bid_amount)},
                          {label:'Add Note',icon:<ChatCircle size={14} weight="regular" />,action:()=>{setMenuId(null);setNoteId(b.id);setNoteVal(b.notes||'');}},
                        ].map(item=>(
                          <div key={item.label} onClick={item.action} style={{padding:'7px 12px',fontSize:12,color:TEXT,cursor:'pointer',borderRadius:6,display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>(e.currentTarget.style.background=DARK)} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                            <span style={{fontSize:14}}>{item.icon}</span>{item.label}
                          </div>
                        ))}
                        <div style={{height:1,background:BORDER,margin:'4px 0'}}/>
                        <div onClick={()=>{setMenuId(null);setDeleteId(b.id);}} style={{padding:'7px 12px',fontSize:12,color:RED,cursor:'pointer',borderRadius:6,display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(239,68,68,.08)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                          <span style={{fontSize:14,display:'inline-flex'}}><Trash size={14} weight="regular" /></span>Delete Bid
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </td>
              <td style={{padding:'12px 14px',color:(Number(b.margin_pct)||0)>=15?'#3dd68c':(Number(b.margin_pct)||0)>=10?GOLD:'#ff7070',fontWeight:700}}>{Number(b.margin_pct)||0}%</td>
              <td style={{padding:'12px 14px',color:DIM}}>{b.location}</td>
              <td style={{padding:'12px 14px'}}>
                <span style={{fontSize:10,fontWeight:800,padding:'3px 10px',borderRadius:4,background:oc.bg,color:oc.c,textTransform:'uppercase' as const,display:'inline-flex',alignItems:'center',gap:4}}>
                  {b.outcome==='won'?<><CheckCircle size={11} weight="fill" />WON</>:b.outcome==='lost'?<><XCircle size={11} weight="fill" />LOST</>:b.outcome==='pending'?<><Clock size={11} weight="fill" />PENDING</>:'WITHDRAWN'}
                </span>
              </td>
              <td style={{padding:'12px 14px',color:DIM,fontSize:12}}>{b.awarded_to||b.loss_reason||'—'}</td>
              <td style={{padding:'12px 14px'}}>
                <button onClick={()=>setOutcomeBid(b)} style={{background:'transparent',border:`1px solid ${BORDER}`,borderRadius:5,color:DIM,fontSize:11,padding:'4px 10px',fontWeight:700,cursor:'pointer',whiteSpace:'nowrap' as const}} onMouseEnter={e=>{e.currentTarget.style.borderColor=GOLD;e.currentTarget.style.color=GOLD;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=BORDER;e.currentTarget.style.color=DIM;}}>Set outcome</button>
              </td>
            </tr>;
          })}</tbody>
        </table>}
      </div>}
      </PremiumSurface>

      {/* ── Click-away overlay for money menu ──────────────────────────────── */}
      {menuId&&<div style={{position:'fixed',inset:0,zIndex:50}} onClick={()=>setMenuId(null)}/>}

      {/* ── Toast notification ─────────────────────────────────────────────── */}
      {toast&&<div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',background:RAISED,border:`1px solid ${BORDER}`,borderRadius:10,padding:'10px 20px',color:GREEN,fontSize:13,fontWeight:600,zIndex:1100,boxShadow:'0 8px 24px rgba(0,0,0,.4)',display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:16,display:'inline-flex'}}><CheckCircle size={16} weight="fill" /></span>{toast}
      </div>}

      {/* ── Mark Outcome Modal (win/loss capture → learner funnel) ─────────────── */}
      <MarkOutcomeModal
        open={!!outcomeBid}
        onClose={()=>setOutcomeBid(null)}
        source="bid"
        sourceId={outcomeBid?.id}
        defaultOutcome={outcomeBid?.outcome==='lost'?'lost':outcomeBid?.outcome==='won'?'won':undefined}
        projectName={outcomeBid?.project_name}
        projectType={outcomeBid?.project_type}
        trades={outcomeBid?.trades}
        ourAmount={outcomeBid?.bid_amount ?? undefined}
        onRecorded={()=>{ setOutcomeBid(null); fetchHistory(historyFilter==='all'?undefined:historyFilter); }}
      />

      {/* ── Score a Bid Modal ─────────────────────────────────────────────────── */}
      {showScore&&<div style={{position:'fixed',inset:0,background:'rgba(2,4,8,0.72)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
        <div style={{background:RAISED,border:`1px solid ${BORDER}`,borderRadius:14,padding:28,width:480,maxWidth:'95vw',boxShadow:'0 24px 80px rgba(0,0,0,.6)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <div style={{fontWeight:800,fontSize:17,color:TEXT,display:'inline-flex',alignItems:'center',gap:8}}><Robot size={18} weight="regular" />Score This Bid</div>
            <button onClick={closeScore} style={{background:'none',border:'none',color:DIM,fontSize:20,cursor:'pointer',lineHeight:1}}><X size={20} weight="regular" /></button>
          </div>
          {scoreResult ? (
            <div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
                <div style={{background:DARK,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px',textAlign:'center' as const}}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>Fit Score</div>
                  <div style={{fontSize:36,fontWeight:900,color:scoreResult.fitScore>=70?'#3dd68c':scoreResult.fitScore>=50?GOLD:'#ff7070'}}>{scoreResult.fitScore}</div>
                  <div style={{fontSize:11,color:DIM}}>out of 100</div>
                </div>
                <div style={{background:DARK,border:`1px solid ${BORDER}`,borderRadius:10,padding:'16px 18px',textAlign:'center' as const}}>
                  <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase' as const,color:DIM,marginBottom:6}}>Win Probability</div>
                  <div style={{fontSize:36,fontWeight:900,color:scoreResult.winPct>=60?'#3dd68c':scoreResult.winPct>=40?GOLD:'#ff7070'}}>{scoreResult.winPct}%</div>
                </div>
              </div>
              <div style={{background:'rgba(245, 158, 11,.08)',border:'1px solid rgba(245, 158, 11,.25)',borderRadius:8,padding:'12px 16px',marginBottom:20,fontSize:14,fontWeight:700,color:GOLD,textAlign:'center' as const}}>{scoreResult.recommendation}</div>
              <div style={{fontSize:11,color:DIM,textAlign:'center' as const,marginBottom:12,display:'flex',alignItems:'center',justifyContent:'center',gap:5}}><CheckCircle size={13} weight="fill" color={GREEN} />Saved to your bid history as a pending bid</div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={()=>{setScoreResult(null);setScoreError(null);setScoreForm({projectName:'',bidAmount:'',margin:'',tradeType:'',notes:''});setPickProject('');setScoreMeta({});}} style={{flex:1,padding:'9px 16px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Score Another</button>
                <button onClick={()=>{setShowScore(false);setScoreResult(null);setTab('history');fetchHistory(historyFilter==='all'?undefined:historyFilter);}} style={{flex:1,padding:'9px 16px',background:'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))',border:'none',borderRadius:'var(--radius-md)',color:'#1C1C1E',fontSize:13,fontWeight:800,cursor:'pointer',boxShadow:'0 4px 14px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)'}}>View in History</button>
              </div>
            </div>
          ) : (
            <div>
              {/* Sage auto-fill — pick a project and let AI pull every input from real records. */}
              <div style={{background:'linear-gradient(135deg,rgba(245,158,11,.10),rgba(245,158,11,.03))',border:`1px solid rgba(245,158,11,.28)`,borderRadius:10,padding:'12px 14px',marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:9,fontSize:11.5,fontWeight:800,color:GOLD,textTransform:'uppercase' as const,letterSpacing:.5}}>
                  <Robot size={15} weight="regular" />Let Sage fill this in
                </div>
                <div style={{display:'flex',gap:8}}>
                  <select value={pickProject} onChange={e=>autofillFromProject(e.target.value)} disabled={autofilling} style={{flex:1,padding:'9px 12px',background:'#1c1c1e',border:`1px solid ${BORDER}`,borderRadius:7,color:pickProject?TEXT:DIM,fontSize:13,outline:'none',cursor:'pointer',boxSizing:'border-box' as const}}>
                    <option value="">{scoreProjects.length?'Choose a project to auto-fill…':'No projects found — enter manually'}</option>
                    {scoreProjects.map(p=><option key={p.id} value={p.id} style={{color:'#111'}}>{p.name}</option>)}
                  </select>
                  {autofilling&&<div style={{display:'inline-flex',alignItems:'center',gap:6,padding:'0 12px',fontSize:12,fontWeight:700,color:GOLD,whiteSpace:'nowrap' as const}}><Robot size={14} weight="regular" />Filling…</div>}
                </div>
                {scoreMeta.historyHint&&<div style={{marginTop:9,fontSize:12,color:'#3dd68c',fontWeight:600,display:'flex',alignItems:'center',gap:6}}><CheckCircle size={13} weight="fill" color={GREEN} />{scoreMeta.historyHint}</div>}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
                {([['Project Name','projectName','e.g. Scottsdale Office Buildout'],['Bid Amount ($)','bidAmount','e.g. 2,500,000'],['Target Margin (%)','margin','e.g. 15'],['Trade Type','tradeType','e.g. Commercial']]).map(([lbl,key,ph])=>(
                  <div key={key}>
                    <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>{lbl}</label>
                    {key==='tradeType' ? (
                      <select value={scoreForm.tradeType} onChange={e=>setScoreForm(f=>({...f,tradeType:e.target.value}))} style={{width:'100%',padding:'8px 12px',background:'#1c1c1e',border:`1px solid ${BORDER}`,borderRadius:7,color:scoreForm.tradeType?TEXT:DIM,fontSize:13,outline:'none',cursor:'pointer',boxSizing:'border-box' as const}}>
                        <option value="">Select a trade…</option>
                        {scoreForm.tradeType&&!SUB_TRADES.includes(scoreForm.tradeType)&&<option value={scoreForm.tradeType} style={{color:'#111'}}>{scoreForm.tradeType}</option>}
                        {SUB_TRADES_BY_DIVISION.map(g=>(
                          <optgroup key={g.division} label={g.division+' — '+g.name}>
                            {g.trades.map(t=><option key={t} value={t} style={{color:'#111'}}>{t}</option>)}
                          </optgroup>
                        ))}
                        <optgroup label="Other / Specialty">
                          {SUB_TRADES.filter(t=>!SUB_TRADES_BY_DIVISION.some(g=>g.trades.includes(t))).map(t=><option key={t} value={t} style={{color:'#111'}}>{t}</option>)}
                        </optgroup>
                      </select>
                    ) : (
                      <input value={(scoreForm as any)[key]} onChange={e=>setScoreForm(f=>({...f,[key]:e.target.value}))} placeholder={ph} style={{width:'100%',padding:'8px 12px',background:'#1c1c1e',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',boxSizing:'border-box' as const}}/>
                    )}
                  </div>
                ))}
              </div>
              {scoreMeta.valueSource&&<div style={{margin:'-4px 0 14px',fontSize:11.5,color:DIM,display:'flex',alignItems:'center',gap:5}}><CheckCircle size={12} weight="fill" color={GOLD} />Bid value pulled from {scoreMeta.valueSource}. Adjust anything before scoring.</div>}
              <div style={{marginBottom:16}}>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:DIM,textTransform:'uppercase' as const,letterSpacing:.5,marginBottom:5}}>Notes</label>
                <textarea value={scoreForm.notes} onChange={e=>setScoreForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Any context for the AI…" style={{width:'100%',padding:'8px 12px',background:'#1c1c1e',border:`1px solid ${BORDER}`,borderRadius:7,color:TEXT,fontSize:13,outline:'none',resize:'vertical' as const,boxSizing:'border-box' as const}}/>
              </div>
              {scoreError&&<div style={{display:'flex',alignItems:'flex-start',gap:8,background:'rgba(239,68,68,.1)',border:`1px solid rgba(239,68,68,.35)`,borderRadius:8,padding:'10px 14px',marginBottom:16,color:'#ff9a9a',fontSize:12.5,fontWeight:600}}>
                <span style={{display:'inline-flex',marginTop:1}}><WarningCircle size={15} weight="fill" color={RED} /></span>{scoreError}
              </div>}
              <div style={{display:'flex',gap:10}}>
                <button onClick={submitScore} disabled={scoring||!scoreForm.projectName||!scoreForm.bidAmount} style={{flex:1,padding:'10px 18px',background:'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))',border:'none',borderRadius:'var(--radius-md)',color:'#1C1C1E',fontSize:13,fontWeight:800,cursor:'pointer',boxShadow:'0 4px 14px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)',opacity:scoring||!scoreForm.projectName||!scoreForm.bidAmount?0.6:1}}>
                  {scoring?'Scoring…':<span style={{display:'inline-flex',alignItems:'center',gap:6}}><Robot size={14} weight="regular" />Score This Bid</span>}
                </button>
                <button onClick={closeScore} style={{padding:'10px 16px',background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:DIM,fontSize:13,cursor:'pointer'}}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>}

      <UnsavedGuardModal guard={guard} />
    </>
  );
}

export default function BidsPage() {
  return (
    <Suspense fallback={<div style={{minHeight:'100vh',background:'#0a0a0a'}}/>}>
      <BidsPageInner />
    </Suspense>
  );
}
