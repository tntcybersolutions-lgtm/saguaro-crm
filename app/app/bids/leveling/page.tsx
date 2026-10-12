'use client';
/**
 * Bid Leveling (web) — side-by-side sub-quote tabulation with budget compare,
 * award recommendation, CSI scope templates, a color-coded scope matrix, stacked
 * leveled-total bars, normalization adjustments, and a branded bid-tab PDF.
 * All math from the shared deterministic lib/bidleveling engine (same as iOS).
 *
 * INTERNAL GC SCREEN. Subcontractors never reach it: it reads competitor bids
 * and the GC's own adjustments. Nothing here links, shares or exposes to a
 * portal — keep it that way.
 *
 * Layout (Pass 3 #3): one leveling grid — scope rows × bidder columns, scope
 * column pinned left, normalized total pinned bottom, bidder columns scrolling
 * inside their own container so the page never scrolls sideways. Three layers
 * are kept visually apart:
 *   1. Submitted — the base bid as received (read-only for package bids).
 *   2. Internal adjustments — gap allowances, alternates, bond/tax/carry (GC only).
 *   3. Normalized total — submitted + internal adjustments.
 * "Lowest price" and "recommended" are separate, labeled concepts: the engine's
 * recommendation weighs risk and can differ from the lowest number.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { humanError } from '@/lib/errors';
import { levelBids, usd, TRADE_TEMPLATES, type ScopeLine, type Bidder, type ScopeStatus } from '@/lib/bidleveling';
import { PageShell, Card, Button, Badge, StatRow, Tabs, EmptyState, Input, Textarea, Menu, type StatItem } from '@/components/ui/kit';
import { Plus, Trash, Sparkle, Warning, Info, FilePdf, Target, CaretDown, CaretRight, Scales, ArrowRight, Lock, EyeSlash, Trophy } from '@phosphor-icons/react';

import { printHtml } from '@/lib/print-doc';
const uid = () => Math.random().toString(36).slice(2, 9);
const toCents = (s: string) => Math.round((parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0) * 100);
/* Scope status colors — the semantic tokens, never page hex. */
const STC: Record<ScopeStatus, string> = { included: 'var(--success)', excluded: 'var(--danger)', clarify: 'var(--warning)', alternate: 'var(--info)' };
/* Short labels stay for the printed bid tab (unchanged output). */
const STL: Record<ScopeStatus, string> = { included: 'Incl', excluded: 'Excl', clarify: 'Clar', alternate: 'Alt' };
const STL_FULL: Record<ScopeStatus, string> = { included: 'Included', excluded: 'Excluded', clarify: 'Clarify', alternate: 'Alternate' };
const nextStatus = (s: ScopeStatus): ScopeStatus => ({ included: 'excluded', excluded: 'clarify', clarify: 'alternate', alternate: 'included' } as const)[s];

/* Bar segment colors for the normalized-totals chart. */
const SEG = { base: 'var(--status-closed)', gap: 'var(--status-under-contract)', alt: 'var(--status-lead)', adj: 'var(--status-completed)' };

/* Grid + layout rules. Injected with dangerouslySetInnerHTML (never a text
   child) — see tools/check-style-escapes.mjs. Sticky cells use the opaque
   --bg-solid tokens because glass would show the scrolled cells through. */
const CSS = `
.lv-root .lv-stack { display: flex; flex-direction: column; gap: var(--sp-4); min-width: 0; }
.lv-toolbar { display: flex; flex-wrap: wrap; gap: var(--sp-2) var(--sp-3); align-items: center; }
.lv-toolbar label { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); }
.lv-status { font-size: 13px; color: var(--text-secondary); }
.lv-legend { display: flex; flex-wrap: wrap; gap: var(--sp-2) var(--sp-4); font-size: 12px; color: var(--text-tertiary); margin-bottom: var(--sp-3); }
.lv-legend span { display: inline-flex; align-items: center; gap: 6px; }
.lv-swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; border: 1px solid var(--border-default); }
.lv-swatch-sub { background: var(--bg-solid); }
.lv-swatch-int { background: repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0 3px, transparent 3px 6px); }
.lv-swatch-norm { background: var(--bg-solid-2); border-color: var(--border-strong); }
.lv-grid-wrap { overflow: auto; max-height: min(72vh, 960px); border: 1px solid var(--glass-border); border-radius: var(--radius-md); background: var(--bg-solid); -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; }
.lv-grid { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; font-size: 13px; font-variant-numeric: tabular-nums; }
.lv-grid th, .lv-grid td { padding: 0 12px; height: 44px; border-bottom: 1px solid var(--border-subtle); white-space: nowrap; background: var(--bg-solid); color: var(--text-secondary); }
.lv-grid .lv-num { text-align: right; }
.lv-grid thead th { position: sticky; top: 0; z-index: 3; background: var(--bg-solid-2); height: auto; padding: 10px 12px; vertical-align: bottom; text-align: right; color: var(--text-primary); font-weight: 700; border-bottom: 1px solid var(--border-default); min-width: 160px; }
.lv-grid .lv-scope { position: sticky; left: 0; z-index: 2; text-align: left; min-width: 260px; max-width: 380px; white-space: normal; box-shadow: 1px 0 0 var(--border-default); }
.lv-grid thead th.lv-scope { z-index: 5; color: var(--text-tertiary); }
.lv-grid tfoot td { position: sticky; bottom: 0; z-index: 3; background: var(--bg-solid-2); border-top: 2px solid var(--border-strong); border-bottom: none; color: var(--text-primary); font-weight: 800; font-size: 15px; height: 52px; }
.lv-grid tfoot td.lv-scope { z-index: 5; font-size: 13px; }
.lv-grid .lv-sec td { height: 34px; background: var(--bg-solid-2); color: var(--text-primary); font-size: 12px; font-weight: 700; }
.lv-grid .lv-sec .lv-sec-label { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lv-grid .lv-sec .lv-sec-hint { font-weight: 500; color: var(--text-tertiary); }
.lv-grid .lv-int td { background-color: var(--bg-solid); background-image: repeating-linear-gradient(135deg, rgba(255,255,255,0.028) 0 6px, transparent 6px 12px); }
.lv-grid .lv-int td.lv-scope { border-left: 3px dashed var(--border-strong); }
.lv-grid .lv-colhead { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.lv-grid .lv-colhead .k-badge { font-size: 12px; }
.lv-grid .lv-dim { color: var(--text-tertiary); }
.lv-cell-btn { all: unset; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; min-height: 40px; padding: 2px 6px; cursor: pointer; font-size: 12px; font-weight: 700; border-radius: 6px; line-height: 1.25; }
.lv-cell-btn:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: -2px; }
.lv-cell-btn small { font-size: 12px; font-weight: 500; color: var(--text-tertiary); }
.lv-cov { display: inline-block; margin-left: 8px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.lv-decide { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--sp-3); }
.lv-pane { border: 1px solid var(--glass-border); border-radius: var(--radius-md); padding: var(--sp-3) var(--sp-4); background: var(--bg-surface-2); min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.lv-pane-rec { border-color: rgba(74,222,128,0.45); }
.lv-pane-kicker { font-size: 12px; font-weight: 700; color: var(--text-tertiary); display: inline-flex; align-items: center; gap: 6px; }
.lv-pane-name { font-size: 16px; font-weight: 700; color: var(--text-primary); overflow-wrap: anywhere; }
.lv-pane-amt { font-size: 20px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.lv-pane-sub { font-size: 12px; color: var(--text-tertiary); line-height: 1.5; }
.lv-pane-body { font-size: 13px; color: var(--text-secondary); line-height: 1.55; }
.lv-note { font-size: 12px; color: var(--text-tertiary); margin-top: var(--sp-3); line-height: 1.5; }
.lv-flags { margin-top: var(--sp-3); display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.lv-flags div { display: flex; align-items: center; gap: 8px; }
.lv-bars { display: flex; flex-direction: column; gap: 10px; }
.lv-bar-head { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; margin-bottom: 3px; flex-wrap: wrap; }
.lv-bar { position: relative; height: 16px; background: var(--bg-solid); border-radius: 4px; display: flex; overflow: hidden; }
.lv-list-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--border-subtle); min-height: 44px; }
.lv-list-row:last-child { border-bottom: none; }
.lv-bidder { border: 1px solid var(--glass-border); border-radius: var(--radius-md); padding: var(--sp-3); background: var(--bg-surface-2); display: flex; flex-direction: column; gap: var(--sp-2); }
.lv-bidder-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.lv-ro { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px; border: 1px dashed var(--border-default); border-radius: var(--radius-sm); color: var(--text-primary); font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lv-adj { border-left: 3px dashed var(--border-strong); padding: var(--sp-2) var(--sp-3); background-image: repeating-linear-gradient(135deg, rgba(255,255,255,0.028) 0 6px, transparent 6px 12px); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; display: flex; flex-direction: column; gap: 8px; }
.lv-adj-fields { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
.lv-adj-fields label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); }
.lv-adj-fields input[type="checkbox"] { width: 20px; height: 20px; }
.lv-kicker { font-size: 12px; font-weight: 700; color: var(--text-tertiary); display: inline-flex; align-items: center; gap: 6px; }
@media (max-width: 640px) {
  .lv-grid .lv-scope { min-width: 150px; max-width: 190px; }
  .lv-grid thead th { min-width: 128px; }
  .lv-grid-wrap { max-height: 70vh; }
  .lv-root .k-btn { min-height: 44px; }
  .lv-root .k-input { min-height: 44px; }
}
`;

function BidLevelingBoard() {
  const [scopeLines, setScopeLines] = useState<ScopeLine[]>([]);
  const [bidders, setBidders] = useState<Bidder[]>([]);
  const [selAlts, setSelAlts] = useState<string[]>([]);
  const [budget, setBudget] = useState('');
  const [scopeInput, setScopeInput] = useState('');
  const [adjOpen, setAdjOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState<'bidders' | 'scope' | 'paste'>('bidders');

  /* ── Package mode ──────────────────────────────────────────────────────────
     Without ?package= this screen is exactly what it was: a scratchpad where a
     GC types scope lines and bidders by hand. With one, it loads a real bid
     package — its line items become the scope checklist, its submissions become
     the bidders, and Sage's reading (if it has been run) fills the scope grid
     in already. Same board, same deterministic engine; the only difference is
     where the rows come from and that they can be saved back.

     This is the reconciliation of two leveling screens. There was a simpler
     package-scoped one that reimplemented base+gap while this richer board and
     lib/bidleveling already existed — two places to level a bid, giving two
     answers. This is the one board. */
  const packageId = useSearchParams().get('package');
  const [pkgName, setPkgName] = useState<string | null>(null);
  const [pkgBusy, setPkgBusy] = useState(false);
  const [pkgComplete, setPkgComplete] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  /* First load is its own state: a failed query is not an empty package. */
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  /* Bidders that came from real submissions. Their base bid is the amount as
     received — shown read-only; only GC-side adjustments are editable. */
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
  const [awaiting, setAwaiting] = useState<{ company: string; status: string }[]>([]);

  const loadPackage = useCallback(async () => {
    if (!packageId) return;
    setPkgBusy(true);
    try {
      const r = await fetch(`/api/bid-packages/${packageId}/leveling`);
      const d = await r.json();
      if (!r.ok) {
        const m = d.error || 'Could not load that bid package.';
        setMsg(m); setLoadError(m);
        setLoadState((s) => (s === 'ready' ? 'ready' : 'error'));
        return;
      }

      setPkgName(d.package?.trade || d.package?.name || null);
      setPkgComplete(!!d.package?.levelingComplete);
      if (d.package?.budget) setBudget(String(d.package.budget));

      const lines: ScopeLine[] = (d.scopeLines || []).map((l: any) => ({
        id: String(l.id), csi: l.code || undefined,
        description: l.description || 'Scope item', required: true,
      }));
      setScopeLines(lines);

      const suggested = d.analysis?.suggested || {};
      setBidders((d.bids || []).map((b: any) => {
        const ai = suggested[b.id];
        return {
          id: String(b.id),
          name: b.company || 'Bidder',
          /* The board is entirely in cents; the API speaks dollars. */
          baseBidCents: Math.round(Number(b.base || 0) * 100),
          scope: Array.isArray(ai?.scope) && ai.scope.length
            ? ai.scope
            : lines.map((l) => ({ scopeLineId: l.id, status: 'included' as ScopeStatus })),
          adjustments: b.gap ? { carryCents: Math.round(Number(b.gap) * 100), note: 'Scope gap' } : undefined,
          bondIncluded: !!b.bond,
          note: b.exclusions || undefined,
        } as Bidder;
      }));
      setSubmittedIds(new Set((d.bids || []).map((b: any) => String(b.id))));
      setAwaiting(Array.isArray(d.awaiting) ? d.awaiting.map((a: any) => ({ company: String(a.company || 'Invited sub'), status: String(a.status || 'invited') })) : []);
      setAiNote(d.analysis?.recommendation || null);
      setLoadError('');
      setLoadState('ready');
    } catch {
      setMsg('Could not load that bid package.');
      setLoadError('Could not load that bid package.');
      setLoadState((s) => (s === 'ready' ? 'ready' : 'error'));
    } finally {
      setPkgBusy(false);
    }
  }, [packageId]);

  useEffect(() => { loadPackage(); }, [loadPackage]);

  /* Push the levelled figures back onto the real submissions. The carry
     adjustment a GC set on the board IS the scope gap, so it lands in
     scope_gap_amount and the engine's low bid becomes is_low_bid. */
  async function savePackage(markComplete: boolean) {
    if (!packageId) return;
    setPkgBusy(true);
    try {
      for (const b of bidders) {
        const gapDollars = Math.round((b.adjustments?.carryCents || 0) / 100);
        await fetch(`/api/bid-packages/${packageId}/leveling`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bidId: b.id, gap: gapDollars }),
        });
      }
      if (markComplete) {
        await fetch(`/api/bid-packages/${packageId}/leveling`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ complete: true, scopeLines }),
        });
        setPkgComplete(true);
      }
      setMsg(markComplete ? 'Leveling saved and marked complete.' : 'Leveling saved to the bid package.');
    } catch {
      setMsg('Could not save back to the bid package.');
    } finally {
      setPkgBusy(false);
    }
  }

  async function analysePackage() {
    if (!packageId) return;
    setPkgBusy(true);
    setMsg('');
    try {
      const r = await fetch(`/api/bid-packages/${packageId}/leveling/analyze`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (d.configured === false || d.error) { setMsg(d.error || 'The analysis could not be completed.'); return; }
      await loadPackage();
    } finally {
      setPkgBusy(false);
    }
  }

  const result = useMemo(() => levelBids(scopeLines, bidders, { selectedAlternateKeys: selAlts, budgetCents: toCents(budget) || undefined }), [scopeLines, bidders, selAlts, budget]);
  const altKeys = useMemo(() => Array.from(new Set(bidders.flatMap((b) => (b.alternates || []).map((a) => a.key)))), [bidders]);
  const altMeta = useMemo(() => { const m: Record<string, string> = {}; bidders.forEach((b) => (b.alternates || []).forEach((a) => { m[a.key] = a.description; })); return m; }, [bidders]);
  const maxTotal = Math.max(1, ...result.bidders.map((b) => b.leveledTotalCents), toCents(budget) || 0);
  const rec = result.recommendation.bidderId ? result.bidders.find((b) => b.id === result.recommendation.bidderId) : null;
  const low = result.bidders.find((b) => b.isLow) || null;
  /* Lowest SUBMITTED price — the base bid as received, before any leveling.
     Display only; it never feeds the engine. Zero-dollar placeholders are not
     a price, so they are ignored. */
  const lowSubmitted = useMemo(() => {
    let best: (typeof result.bidders)[number] | null = null;
    for (const b of result.bidders) if (b.baseBidCents > 0 && (!best || b.baseBidCents < best.baseBidCents)) best = b;
    return best;
  }, [result]);

  const addScope = () => { const d = scopeInput.trim(); if (!d) return; setScopeLines((x) => [...x, { id: uid(), description: d, required: true }]); setScopeInput(''); };
  const seedTemplate = (t: typeof TRADE_TEMPLATES[number]) => { setScopeLines(t.lines.map((d, i) => ({ id: uid(), csi: t.csi, description: d, required: i < 6 }))); setBidders((bs) => bs.map((b) => ({ ...b, scope: [] }))); setMsg(`Loaded ${t.trade} scope (${t.lines.length} lines).`); };
  const addBidder = () => setBidders((x) => [...x, { id: uid(), name: `Bidder ${x.length + 1}`, baseBidCents: 0, scope: scopeLines.map((s) => ({ scopeLineId: s.id, status: 'included' as ScopeStatus })), alternates: [] }]);
  const patchBidder = (id: string, p: Partial<Bidder>) => setBidders((x) => x.map((b) => b.id === id ? { ...b, ...p } : b));
  const patchAdj = (id: string, k: 'bondCents' | 'taxCents' | 'carryCents', v: string) => setBidders((x) => x.map((b) => b.id === id ? { ...b, adjustments: { ...(b.adjustments || {}), [k]: toCents(v) } } : b));
  const cycleCell = (bid: string, lineId: string) => setBidders((x) => x.map((b) => {
    if (b.id !== bid) return b;
    const cur = b.scope.find((s) => s.scopeLineId === lineId);
    const scope = cur ? b.scope.map((s) => s.scopeLineId === lineId ? { ...s, status: nextStatus(s.status) } : s) : [...b.scope, { scopeLineId: lineId, status: 'excluded' as ScopeStatus }];
    return { ...b, scope };
  }));

  const [aiText, setAiText] = useState(''); const [aiBusy, setAiBusy] = useState(false);
  const extract = async () => {
    if (!scopeLines.length) { setMsg('Define or load a scope checklist first.'); return; }
    if (!aiText.trim()) { setMsg('Paste a bid first.'); return; }
    setAiBusy(true); setMsg('Reading bid…');
    try {
      const r = await fetch('/api/bids/level-extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: aiText, scopeLines: scopeLines.map((s) => ({ id: s.id, description: s.description })) }) });
      const d = await r.json();
      if (d.error) { setMsg(`AI: ${d.error}`); setAiBusy(false); return; }
      setBidders((x) => [...x, { id: uid(), name: d.bidderName || 'Subcontractor', baseBidCents: d.baseBidCents || 0, scope: d.scope || [], alternates: d.alternates || [] }]);
      setAiText(''); setMsg(`Added ${d.bidderName} — review the scope grid.`);
    } catch (e) { console.error(e); setMsg(humanError(e, 'Something went wrong. Please try again.')); }
    setAiBusy(false);
  };

  /* Printed bid tab — print layout, so it keeps its own light print colors. */
  const exportPdf = () => {
    const cell = (t: string, c = '#111') => `<td style="padding:6px 9px;border:1px solid #ccc;text-align:right;color:${c}">${t}</td>`;
    const head = `<th style="padding:6px 9px;border:1px solid #ccc;background:#1B2636;color:var(--c-text)">${''}</th>` + result.bidders.map((b) => `<th style="padding:6px 9px;border:1px solid #ccc;background:${b.id === rec?.id ? 'var(--success)' : 'var(--surface-card)'};color:var(--c-text)">${b.name}${b.id === rec?.id ? ' ★' : ''}</th>`).join('');
    const row = (label: string, fn: (b: typeof result.bidders[number]) => string) => `<tr><td style="padding:6px 9px;border:1px solid #ccc;font-weight:600">${label}</td>${result.bidders.map((b) => cell(fn(b))).join('')}</tr>`;
    const matrix = scopeLines.map((l) => `<tr><td style="padding:5px 9px;border:1px solid #ccc">${l.description}</td>${result.bidders.map((b) => { const it = b.lines.find((s) => s.scopeLineId === l.id); const st: ScopeStatus = (it && it.status !== 'missing') ? it.status : 'excluded'; const col = st === 'included' ? 'var(--success)' : st === 'excluded' ? 'var(--danger)' : st === 'clarify' ? 'var(--brand-primary-strong)' : 'var(--warning)'; return `<td style="padding:5px 9px;border:1px solid #ccc;text-align:center;color:${col};font-weight:600">${STL[st]}${it?.valueCents ? ' · ' + usd(it.valueCents) : ''}</td>`; }).join('')}</tr>`).join('');
    const html = (`<html><head><title>Bid Tabulation</title></head><body style="font-family:Arial;padding:24px;color:#111">
      <h2 style="margin:0">Bid Tabulation</h2><div style="color:#555;font-size:12px;margin-bottom:14px">Leveled — allowances fill scope gaps for apples-to-apples comparison${result.budgetCents ? ` · Budget ${usd(result.budgetCents)}` : ''}</div>
      <table style="border-collapse:collapse;font-size:12px;width:100%"><thead><tr>${head}</tr></thead><tbody>
      ${row('Base Bid', (b) => usd(b.baseBidCents))}${row('+ Gap Allowances', (b) => b.gapAllowanceCents ? '+' + usd(b.gapAllowanceCents) : '—')}${row('+ Alternates', (b) => b.alternatesAdjCents ? usd(b.alternatesAdjCents) : '—')}${row('+ Adjustments', (b) => b.adjustmentsCents ? '+' + usd(b.adjustmentsCents) : '—')}
      <tr style="font-weight:800"><td style="padding:6px 9px;border:1px solid #ccc">Leveled Total</td>${result.bidders.map((b) => cell(usd(b.leveledTotalCents), b.isLow ? 'var(--success)' : '#111')).join('')}</tr>
      ${result.budgetCents ? row('vs Budget', (b) => (b.vsBudgetCents! > 0 ? '+' : '') + usd(b.vsBudgetCents!) + ` (${b.vsBudgetPct}%)`) : ''}
      </tbody></table>
      <h3 style="margin:18px 0 6px">Scope Coverage</h3>
      <table style="border-collapse:collapse;font-size:11px;width:100%"><thead><tr>${head}</tr></thead><tbody>${matrix}</tbody></table>
      ${rec ? `<div style="margin-top:16px;padding:10px 12px;border-left:3px solid #4ADE80;background:#f0faf4"><b>Recommendation:</b> ${result.recommendation.rationale}</div>` : ''}
      </body></html>`);
    printHtml(html, 'Bid Tabulation')
      .catch((e) => { console.error(e); setMsg("Couldn't open the bid tab to print. Try again."); });
  };

  const style = <style dangerouslySetInnerHTML={{ __html: CSS }} />;
  const crumbs = [{ label: 'Bidding', href: '/app/bids' }, { label: 'Bid Leveling' }];

  /* NO PACKAGE, NO SILENCE.
     Everything on this screen levels ONE package and reads its id from
     ?package=. Three loaders open with `if (!packageId) return;`, so arriving
     without one produced a page that loaded nothing, said nothing and offered
     nothing — and the only link to levelling in the product, the tab on the
     company bid board, pointed here with no id at all. Every GC who found the
     feature the intended way met a dead screen.
     Levelling is now linked from each package's own page, where the bids are,
     which is where it should always have been reached from. This says so for
     anyone who still arrives the old way. */
  if (!packageId) {
    return (
      <div className="lv-root">
        {style}
        <PageShell title="Bid Leveling" subtitle="Normalize sub bids to one scope, then compare price and coverage." crumbs={crumbs}>
          <Card>
            <EmptyState
              icon={<Scales size={22} />}
              title="Pick a Package to Level"
              text="Leveling compares the bids on one package — spread, low bid, coverage gaps and who has not answered. Open the package you want to compare and choose Level Bids; its own page is where the bids live."
              action={<Button variant="primary" href="/app/bids" icon={<ArrowRight size={14} weight="bold" />}>Browse Bid Packages</Button>}
            />
          </Card>
        </PageShell>
      </div>
    );
  }

  const title = pkgName ? `${pkgName} — Bid Leveling` : 'Bid Leveling';
  const subtitle = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <EyeSlash size={14} /> Internal to your team — subcontractors never see this tabulation or your adjustments.
    </span>
  );

  if (loadState === 'loading') {
    return (
      <div className="lv-root">
        {style}
        <PageShell title="Bid Leveling" subtitle={subtitle} crumbs={crumbs}>
          <div aria-busy="true" aria-label="Loading leveling" className="lv-stack">
            <div className="k-stats">
              {[0, 1, 2, 3].map((i) => <div key={i} className="k-stat"><span className="k-skel" style={{ width: '50%' }} /><span className="k-skel" style={{ width: '70%', height: 18, marginTop: 6 }} /></div>)}
            </div>
            <Card>
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} style={{ padding: '10px 0' }}><span className="k-skel" style={{ width: i === 0 ? '40%' : '85%' }} /></div>)}
            </Card>
          </div>
        </PageShell>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="lv-root">
        {style}
        <PageShell title="Bid Leveling" subtitle={subtitle} crumbs={crumbs}>
          <Card>
            <EmptyState
              icon={<Warning size={22} />}
              title="Could Not Load This Bid Package"
              text={loadError || 'Something went wrong loading the bids. Nothing was changed.'}
              action={
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Button variant="primary" onClick={() => { setLoadState('loading'); loadPackage(); }}>Try Again</Button>
                  <Button href="/app/bids">Back to Bidding</Button>
                </div>
              }
            />
          </Card>
        </PageShell>
      </div>
    );
  }

  const stats: StatItem[] = [
    { label: 'Bidders', value: String(result.bidders.length), sub: awaiting.length ? `${awaiting.length} invited still to answer` : 'Every invite answered or none pending' },
    { label: 'Scope Lines', value: String(scopeLines.length), sub: `${scopeLines.filter((l) => l.required !== false).length} required` },
    { label: 'Spread', value: usd(result.spreadCents), sub: 'Low to high, normalized' },
    { label: 'Coverage Gaps', value: String(result.uncoveredRequired), tone: result.uncoveredRequired > 0 ? 'bad' : 'good', sub: result.uncoveredRequired > 0 ? 'Required lines no bidder covers' : 'Every required line covered' },
    ...(result.budgetCents ? [{ label: 'Your Budget', value: usd(result.budgetCents), sub: 'Internal estimate' } as StatItem] : []),
  ];

  const colBadges = (id: string) => (
    <>
      {lowSubmitted?.id === id && <Badge tone="neutral">Lowest Submitted</Badge>}
      {low?.id === id && <Badge tone="lead">Lowest Normalized</Badge>}
      {rec?.id === id && <Badge tone="ongoing">Recommended</Badge>}
    </>
  );
  const colCount = result.bidders.length;
  const section = (label: React.ReactNode, hint?: string, internal?: boolean) => (
    <tr className={internal ? 'lv-sec lv-int' : 'lv-sec'}>
      <td className="lv-scope"><span className="lv-sec-label">{label}{hint && <span className="lv-sec-hint">{hint}</span>}</span></td>
      {colCount > 0 && <td colSpan={colCount} />}
    </tr>
  );

  return (
    <div className="lv-root">
      {style}
      <PageShell
        title={title}
        subtitle={subtitle}
        crumbs={crumbs}
        actions={
          <>
            <Button onClick={analysePackage} disabled={pkgBusy} icon={<Sparkle size={15} weight="bold" />}>
              {pkgBusy ? 'Working…' : 'Ask Sage to Find the Gaps'}
            </Button>
            <Button onClick={() => savePackage(false)} disabled={pkgBusy}>Save to Package</Button>
            <Button variant="primary" onClick={() => savePackage(true)} disabled={pkgBusy || pkgComplete}>
              {pkgComplete ? 'Leveling Complete' : 'Save & Mark Complete'}
            </Button>
            {bidders.length > 0 && (
              <Menu label="More leveling actions" actions={[{ label: 'Export Bid Tab', icon: <FilePdf size={15} />, onClick: exportPdf }]} />
            )}
          </>
        }
      >
        {aiNote && (
          <Card title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Sparkle size={16} /> Sage Read the Bids <Badge tone="neutral">AI</Badge></span>}>
            <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-primary)', maxWidth: '75ch' }}>{aiNote}</div>
            <div className="lv-note" style={{ marginTop: 8 }}>
              An AI reading, not a quote and not a decision. The scope grid below is pre-filled from it — every cell is still yours to change.
            </div>
          </Card>
        )}

        {/* Toolbar: budget + CSI template + status line */}
        <div className="lv-toolbar">
          <label>
            <Target size={16} /> Your Budget $
            <Input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Optional" inputMode="decimal" style={{ width: 150 }} aria-label="Your budget in dollars" />
          </label>
          <select
            className="k-select"
            value=""
            aria-label="Load a CSI scope template"
            onChange={(e) => { const t = TRADE_TEMPLATES.find((x) => x.trade === e.target.value); if (t) seedTemplate(t); }}
            style={{ width: 'auto', minWidth: 220, maxWidth: '100%' }}
          >
            <option value="">Load a CSI Scope Template…</option>
            {TRADE_TEMPLATES.map((t) => <option key={t.trade} value={t.trade}>{t.trade} · {t.csi}</option>)}
          </select>
          {msg && <span className="lv-status" role="status" aria-live="polite">{msg}</span>}
        </div>

        {bidders.length > 0 && <StatRow items={stats} />}

        {awaiting.length > 0 && (
          <div className="lv-note" style={{ marginTop: 0 }}>
            Still waiting on {awaiting.map((a) => a.company).join(', ')} — you are comparing {result.bidders.length} of {result.bidders.length + awaiting.length} invited.
          </div>
        )}

        {/* Price vs recommendation — two separate, labeled ideas. */}
        {bidders.length > 0 && (
          <Card title="Price and Recommendation" subtitle="The lowest number and the recommended bidder are different questions. Neither is an award.">
            <div className="lv-decide">
              <div className="lv-pane">
                <span className="lv-pane-kicker"><Lock size={13} /> Lowest Submitted Price</span>
                {lowSubmitted ? (
                  <>
                    <span className="lv-pane-name">{lowSubmitted.name}</span>
                    <span className="lv-pane-amt">{usd(lowSubmitted.baseBidCents)}</span>
                    <span className="lv-pane-sub">Base bid as received, before scope gaps and adjustments.</span>
                  </>
                ) : <span className="lv-pane-sub">No priced bids yet.</span>}
              </div>
              <div className="lv-pane">
                <span className="lv-pane-kicker"><Scales size={13} /> Lowest Normalized Total</span>
                {low ? (
                  <>
                    <span className="lv-pane-name">{low.name}</span>
                    <span className="lv-pane-amt">{usd(low.leveledTotalCents)}</span>
                    <span className="lv-pane-sub">
                      Submitted plus gap allowances, alternates and internal adjustments.
                      {lowSubmitted && lowSubmitted.id !== low.id ? ` Leveling changed the low bidder from ${lowSubmitted.name}.` : ''}
                    </span>
                  </>
                ) : <span className="lv-pane-sub">Nothing to normalize yet.</span>}
              </div>
              <div className="lv-pane lv-pane-rec">
                <span className="lv-pane-kicker"><Trophy size={13} /> Recommended</span>
                {rec ? (
                  <>
                    <span className="lv-pane-name">{rec.name}</span>
                    <span className="lv-pane-amt">{usd(rec.leveledTotalCents)}</span>
                    <span className="lv-pane-sub">
                      {rec.requiredCoveragePct}% required scope coverage · {rec.id === low?.id ? 'also the lowest normalized total' : 'not the lowest normalized total'}
                    </span>
                    <span className="lv-pane-body">{result.recommendation.rationale}</span>
                  </>
                ) : <span className="lv-pane-sub">{result.recommendation.rationale}</span>}
              </div>
            </div>
            <div className="lv-note">
              The recommendation weighs normalized price against scope gaps, clarifications, bond and insurance — it can pick a bidder who is not the lowest. It does not award anything; awarding stays on the bid package page.
            </div>
          </Card>
        )}

        {/* The leveling grid */}
        <Card
          title="Leveling Grid"
          subtitle={scopeLines.length > 0 && bidders.length > 0 ? 'Tap a scope cell to cycle Included → Excluded → Clarify → Alternate.' : undefined}
        >
          {bidders.length === 0 ? (
            <EmptyState
              icon={<Scales size={22} />}
              title={scopeLines.length === 0 ? 'No Bids or Scope Yet' : 'No Bids to Level Yet'}
              text={scopeLines.length === 0
                ? 'This package has no submitted bids and no scope lines. Load a CSI scope template above, then add bidders or paste a proposal below.'
                : 'Add a bidder by hand or paste a proposal for Sage to read. Bids submitted through the package appear here automatically.'}
              action={<Button onClick={() => { addBidder(); setTab('bidders'); }} icon={<Plus size={15} />}>Add Bidder</Button>}
            />
          ) : (
            <>
              <div className="lv-legend" aria-label="Grid legend">
                <span><span className="lv-swatch lv-swatch-sub" /> Submitted — as received, read-only</span>
                <span><span className="lv-swatch lv-swatch-int" /> Internal adjustments — GC only</span>
                <span><span className="lv-swatch lv-swatch-norm" /> Normalized total — submitted + adjustments</span>
              </div>
              <div className="lv-grid-wrap" role="region" aria-label="Leveling grid, scrolls horizontally" tabIndex={0}>
                <table className="lv-grid k-table-skin">
                  <thead>
                    <tr>
                      <th className="lv-scope" scope="col">Scope</th>
                      {result.bidders.map((b) => (
                        <th key={b.id} scope="col">
                          <div className="lv-colhead">
                            <span>{b.name}</span>
                            {colBadges(b.id)}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section(<><Lock size={13} /> Submitted</>, 'As received')}
                    <tr>
                      <td className="lv-scope">Base Bid</td>
                      {result.bidders.map((b) => <td key={b.id} className="lv-num" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{usd(b.baseBidCents)}</td>)}
                    </tr>

                    {section('Scope Coverage', 'Who includes each line')}
                    {scopeLines.length === 0 ? (
                      <tr>
                        <td className="lv-scope lv-dim">No scope lines yet — load a CSI template or add lines in Scope Checklist.</td>
                        <td colSpan={colCount} />
                      </tr>
                    ) : scopeLines.map((l) => {
                      const cov = result.scopeCoverage.find((c) => c.scopeLineId === l.id)!;
                      const covColor = cov.noneCovered ? 'var(--danger)' : cov.singleBid ? 'var(--warning)' : 'var(--success)';
                      return (
                        <tr key={l.id}>
                          <td className="lv-scope">
                            {l.description}
                            {l.required === false && <span className="lv-dim"> (optional)</span>}
                            <span className="lv-cov" style={{ color: covColor }} title="Bidders that include this line">{cov.includedBy} of {colCount}</span>
                          </td>
                          {result.bidders.map((b) => {
                            const it = b.lines.find((s) => s.scopeLineId === l.id);
                            const st = (it && it.status !== 'missing' ? it.status : 'excluded') as ScopeStatus;
                            return (
                              <td key={b.id} style={{ padding: '2px 6px', background: `color-mix(in srgb, ${STC[st]} 9%, var(--bg-solid))` }}>
                                <button
                                  type="button"
                                  className="lv-cell-btn"
                                  style={{ color: STC[st] }}
                                  onClick={() => cycleCell(b.id, l.id)}
                                  aria-label={`${b.name}, ${l.description}: ${STL_FULL[st]}. Change status.`}
                                >
                                  {STL_FULL[st]}
                                  {it?.valueCents ? <small>{usd(it.valueCents)}</small> : null}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}

                    {section(<><EyeSlash size={13} /> Internal Adjustments</>, 'GC only — never shared with bidders', true)}
                    <tr className="lv-int">
                      <td className="lv-scope">+ Gap Allowances</td>
                      {result.bidders.map((b) => <td key={b.id} className={b.gapAllowanceCents ? 'lv-num' : 'lv-num lv-dim'}>{b.gapAllowanceCents ? '+' + usd(b.gapAllowanceCents) : '—'}</td>)}
                    </tr>
                    <tr className="lv-int">
                      <td className="lv-scope">+ Alternates</td>
                      {result.bidders.map((b) => <td key={b.id} className={b.alternatesAdjCents ? 'lv-num' : 'lv-num lv-dim'}>{b.alternatesAdjCents ? (b.alternatesAdjCents > 0 ? '+' : '') + usd(b.alternatesAdjCents) : '—'}</td>)}
                    </tr>
                    <tr className="lv-int">
                      <td className="lv-scope">+ Bond, Tax &amp; Carry</td>
                      {result.bidders.map((b) => <td key={b.id} className={b.adjustmentsCents ? 'lv-num' : 'lv-num lv-dim'}>{b.adjustmentsCents ? '+' + usd(b.adjustmentsCents) : '—'}</td>)}
                    </tr>

                    {section('Comparison')}
                    <tr>
                      <td className="lv-scope">Δ vs Lowest Normalized</td>
                      {result.bidders.map((b) => <td key={b.id} className="lv-num lv-dim">{b.isLow ? '—' : '+' + usd(b.deltaFromLowCents)}</td>)}
                    </tr>
                    {result.budgetCents ? (
                      <tr>
                        <td className="lv-scope">vs Your Budget</td>
                        {result.bidders.map((b) => <td key={b.id} className="lv-num" style={{ color: (b.vsBudgetCents || 0) > 0 ? 'var(--danger)' : 'var(--success)' }}>{(b.vsBudgetCents || 0) > 0 ? '+' : ''}{usd(b.vsBudgetCents || 0)} ({b.vsBudgetPct}%)</td>)}
                      </tr>
                    ) : null}
                    <tr>
                      <td className="lv-scope">Required Scope Coverage</td>
                      {result.bidders.map((b) => <td key={b.id} className="lv-num" style={{ color: b.requiredCoveragePct < 100 ? 'var(--warning)' : 'var(--text-secondary)' }}>{b.requiredCoveragePct}%</td>)}
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="lv-scope">Normalized Total</td>
                      {result.bidders.map((b) => <td key={b.id} className="lv-num">{usd(b.leveledTotalCents)}</td>)}
                    </tr>
                  </tfoot>
                </table>
              </div>
              {result.flags.length > 0 && (
                <div className="lv-flags">
                  {result.flags.map((f, i) => (
                    <div key={i} style={{ color: f.level === 'warn' ? 'var(--warning)' : 'var(--text-tertiary)' }}>
                      {f.level === 'warn' ? <Warning size={15} weight="fill" /> : <Info size={15} />}{f.message}
                    </div>
                  ))}
                </div>
              )}
              {result.uncoveredRequired > 0 && (
                <div className="lv-flags" style={{ color: 'var(--danger)' }}>
                  <div><Warning size={15} weight="fill" />{result.uncoveredRequired} required scope line{result.uncoveredRequired > 1 ? 's have' : ' has'} no coverage — re-solicit or carry.</div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Normalized totals at a glance */}
        {bidders.length > 0 && scopeLines.length > 0 && (
          <Card
            title="Normalized Totals"
            subtitle={`Spread ${usd(result.spreadCents)}${result.budgetCents ? ` · budget ${usd(result.budgetCents)}` : ''} — allowances fill scope gaps for apples-to-apples comparison.`}
          >
            <div className="lv-bars">
              {result.bidders.map((b) => {
                const seg = (v: number, c: string) => v > 0 ? <div style={{ width: `${(v / maxTotal) * 100}%`, background: c }} /> : null;
                return (
                  <div key={b.id}>
                    <div className="lv-bar-head">
                      <span style={{ color: 'var(--text-primary)', fontWeight: 700, display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{b.name}{colBadges(b.id)}</span>
                      <span style={{ color: b.vsBudgetPct != null && b.vsBudgetPct > 0 ? 'var(--danger)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {usd(b.leveledTotalCents)}{b.vsBudgetPct != null ? ` · ${b.vsBudgetPct > 0 ? '+' : ''}${b.vsBudgetPct}% vs budget` : ''}
                      </span>
                    </div>
                    <div className="lv-bar">
                      {seg(b.baseBidCents, SEG.base)}{seg(b.gapAllowanceCents, SEG.gap)}{seg(Math.max(0, b.alternatesAdjCents), SEG.alt)}{seg(b.adjustmentsCents, SEG.adj)}
                      {result.budgetCents ? <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${(result.budgetCents / maxTotal) * 100}%`, width: 2, background: 'var(--text-primary)' }} title="Budget" /> : null}
                    </div>
                  </div>
                );
              })}
              <div className="lv-legend" style={{ marginBottom: 0 }}>
                {([[SEG.base, 'Submitted Base'], [SEG.gap, 'Gap Allowance (internal)'], [SEG.alt, 'Alternates (internal)'], [SEG.adj, 'Adjustments (internal)'], ['var(--text-primary)', 'Your Budget']] as const).map(([c, l]) => (
                  <span key={l}><span className="lv-swatch" style={{ background: c }} />{l}</span>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Alternates */}
        {altKeys.length > 0 && (
          <Card title="Alternates to Apply" subtitle="Toggle an alternate to fold it into every normalized total.">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {altKeys.map((k) => {
                const on = selAlts.includes(k);
                return (
                  <Button key={k} variant={on ? 'secondary' : 'ghost'} aria-pressed={on} onClick={() => setSelAlts((x) => on ? x.filter((y) => y !== k) : [...x, k])} style={on ? { borderColor: 'var(--info)', color: 'var(--info)' } : undefined}>
                    {k} · {altMeta[k]}
                  </Button>
                );
              })}
            </div>
          </Card>
        )}

        {/* Setup: bidders, scope checklist, paste a bid */}
        <div className="lv-stack" style={{ gap: 'var(--sp-3)' }}>
          <Tabs
            value={tab}
            onChange={(k) => setTab(k as typeof tab)}
            tabs={[
              { key: 'bidders', label: 'Bidders', count: bidders.length },
              { key: 'scope', label: 'Scope Checklist', count: scopeLines.length },
              { key: 'paste', label: 'Paste a Bid' },
            ]}
          />

          {tab === 'bidders' && (
            <Card
              title="Bidders"
              subtitle={bidders.length > 0 ? `${bidders.length} in the tabulation. Submitted amounts are read-only; adjustments are internal.` : 'Add bidders by hand or paste a proposal for Sage to read.'}
              actions={<Button onClick={addBidder} icon={<Plus size={15} />}>Add Bidder</Button>}
            >
              {bidders.length === 0 ? (
                <EmptyState title="No Bidders Yet" text="Bids submitted through the package load here. You can also add one by hand or paste a proposal." />
              ) : (
                <div className="lv-stack" style={{ gap: 'var(--sp-2)' }}>
                  {bidders.map((b) => {
                    const lb = result.bidders.find((x) => x.id === b.id);
                    const fromPkg = submittedIds.has(b.id);
                    return (
                      <div key={b.id} className="lv-bidder">
                        <div className="lv-bidder-row">
                          <Input value={b.name} onChange={(e) => patchBidder(b.id, { name: e.target.value })} aria-label="Bidder name" style={{ flex: '2 1 180px', minWidth: 150, width: 'auto', fontWeight: 700 }} />
                          {fromPkg ? (
                            <span className="lv-ro" title="Base bid as submitted — not editable here">
                              <Lock size={13} /> Submitted {usd(b.baseBidCents)}
                            </span>
                          ) : (
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                              Base $
                              <Input value={b.baseBidCents ? (b.baseBidCents / 100).toString() : ''} onChange={(e) => patchBidder(b.id, { baseBidCents: toCents(e.target.value) })} placeholder="0" inputMode="decimal" style={{ width: 130 }} aria-label={`${b.name} base bid in dollars`} />
                            </label>
                          )}
                          {lb && (
                            <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                              Normalized {usd(lb.leveledTotalCents)}
                            </span>
                          )}
                          {colBadges(b.id)}
                          <span style={{ flex: 1 }} />
                          <Button size="sm" variant="ghost" aria-expanded={adjOpen === b.id} onClick={() => setAdjOpen(adjOpen === b.id ? null : b.id)} icon={adjOpen === b.id ? <CaretDown size={12} /> : <CaretRight size={12} />}>
                            Internal Adjustments
                          </Button>
                          <Button size="sm" variant="ghost" aria-label={`Remove ${b.name} from the tabulation`} title="Remove from tabulation" onClick={() => setBidders((x) => x.filter((y) => y.id !== b.id))} icon={<Trash size={16} color="var(--danger)" />} />
                        </div>
                        {b.note && (
                          <div className="lv-pane-sub"><b style={{ color: 'var(--text-secondary)' }}>Exclusions as submitted:</b> {b.note}</div>
                        )}
                        {adjOpen === b.id && (
                          <div className="lv-adj">
                            <span className="lv-kicker"><EyeSlash size={13} /> Internal — GC only, never shared with bidders</span>
                            <div className="lv-adj-fields">
                              {([['bondCents', 'Bond $'], ['taxCents', 'Sales Tax $'], ['carryCents', 'Carry $']] as const).map(([k, lbl]) => (
                                <label key={k}>{lbl}
                                  <Input value={(b.adjustments?.[k] || 0) ? ((b.adjustments![k] as number) / 100).toString() : ''} onChange={(e) => patchAdj(b.id, k, e.target.value)} placeholder="0" inputMode="decimal" style={{ width: 110 }} />
                                </label>
                              ))}
                              <label><input type="checkbox" checked={b.insuranceMeets !== false} onChange={(e) => patchBidder(b.id, { insuranceMeets: e.target.checked })} />Insurance Meets</label>
                              <label><input type="checkbox" checked={b.bondIncluded === true} onChange={(e) => patchBidder(b.id, { bondIncluded: e.target.checked })} />Bond in Base</label>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {tab === 'scope' && (
            <Card title="Scope Checklist" subtitle="Every line every bidder gets leveled against — required lines drive coverage.">
              {scopeLines.length === 0 && (
                <div className="lv-note" style={{ marginTop: 0, marginBottom: 8 }}>No scope lines yet. Load a CSI template from the toolbar or add your own below.</div>
              )}
              {scopeLines.map((l) => (
                <div key={l.id} className="lv-list-row">
                  <Button size="sm" variant="ghost" aria-pressed={l.required !== false} onClick={() => setScopeLines((x) => x.map((s) => s.id === l.id ? { ...s, required: !(s.required !== false) } : s))} style={{ minWidth: 86, color: l.required !== false ? 'var(--text-primary)' : 'var(--text-tertiary)', borderColor: l.required !== false ? 'var(--border-strong)' : 'var(--border-subtle)' }}>
                    {l.required !== false ? 'Required' : 'Optional'}
                  </Button>
                  <span style={{ flex: 1, color: 'var(--text-primary)', fontSize: 13, minWidth: 0, overflowWrap: 'anywhere' }}>{l.description}</span>
                  <Button size="sm" variant="ghost" aria-label={`Remove scope line ${l.description}`} title="Remove line" onClick={() => setScopeLines((x) => x.filter((s) => s.id !== l.id))} icon={<Trash size={16} color="var(--danger)" />} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Input value={scopeInput} onChange={(e) => setScopeInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addScope()} placeholder="Add a scope line — or load a CSI template above" aria-label="New scope line" style={{ flex: '1 1 240px', width: 'auto' }} />
                <Button onClick={addScope} icon={<Plus size={15} />}>Add Line</Button>
              </div>
            </Card>
          )}

          {tab === 'paste' && (
            <Card title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>Paste a Bid <Badge tone="neutral">AI</Badge></span>} subtitle="Sage reads a pasted proposal, maps it onto your scope checklist and adds it as a bidder. Review every cell afterward.">
              <Textarea value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="Paste a subcontractor's proposal here." aria-label="Proposal text" style={{ minHeight: 110, resize: 'vertical' }} />
              <div style={{ marginTop: 8 }}>
                <Button onClick={extract} disabled={aiBusy} icon={<Sparkle size={15} weight="bold" />}>{aiBusy ? 'Reading…' : 'Extract & Add Bidder'}</Button>
              </div>
            </Card>
          )}
        </div>
      </PageShell>
    </div>
  );
}

/* useSearchParams needs a Suspense boundary in a client component under the
   App Router, or the whole route opts out of static rendering with a build
   warning. */
export default function BidLevelingPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: 'var(--text-tertiary)', fontSize: 14 }}>Loading leveling…</div>}>
      <BidLevelingBoard />
    </Suspense>
  );
}
