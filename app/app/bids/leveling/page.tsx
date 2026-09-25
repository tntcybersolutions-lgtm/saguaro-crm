'use client';
/**
 * Bid Leveling (web) — side-by-side sub-quote tabulation with budget compare,
 * award recommendation, CSI scope templates, a color-coded scope matrix, stacked
 * leveled-total bars, normalization adjustments, and a branded bid-tab PDF.
 * All math from the shared deterministic lib/bidleveling engine (same as iOS).
 * Full premium anatomy: aurora surface, module hero, stat strip over the matrix,
 * machined table material with sticky first columns — zero behavior changes.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { humanError } from '@/lib/errors';
import { levelBids, usd, TRADE_TEMPLATES, type ScopeLine, type Bidder, type ScopeStatus } from '@/lib/bidleveling';
import {
  PremiumSurface, ModuleHero, SectionCard, StatStrip, FlowStrip,
  goldButtonStyle, ghostButtonStyle,
} from '@/components/ui/premium';
import { moduleAccent } from '@/lib/module-identity';
import { Plus, Trash, Sparkle, Trophy, Warning, Info, FilePdf, Target, CaretDown, CaretRight, Scales, ChartBar, ListChecks, Stack, Users } from '@phosphor-icons/react';

const GOLD = '#F59E0B', DARK = '#0a0a0a', RAISED = '#141416', BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1', TEXT = '#FFFFFF', GREEN = '#3dd68c', RED = '#ef4444', HEAD = '#1c1c1e', BLUE = '#FBBF24';

// Module accent — bids family (desert rose). Chips / eyebrows / badges ONLY.
const BIDS = moduleAccent('bids');

const uid = () => Math.random().toString(36).slice(2, 9);
const toCents = (s: string) => Math.round((parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0) * 100);
const STC: Record<ScopeStatus, string> = { included: GREEN, excluded: RED, clarify: GOLD, alternate: BLUE };
const STL: Record<ScopeStatus, string> = { included: 'Incl', excluded: 'Excl', clarify: 'Clar', alternate: 'Alt' };
const nextStatus = (s: ScopeStatus): ScopeStatus => ({ included: 'excluded', excluded: 'clarify', clarify: 'alternate', alternate: 'included' } as const)[s];

function BidLevelingBoard() {
  const [scopeLines, setScopeLines] = useState<ScopeLine[]>([]);
  const [bidders, setBidders] = useState<Bidder[]>([]);
  const [selAlts, setSelAlts] = useState<string[]>([]);
  const [budget, setBudget] = useState('');
  const [scopeInput, setScopeInput] = useState('');
  const [tplOpen, setTplOpen] = useState(false);
  const [adjOpen, setAdjOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

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

  const loadPackage = useCallback(async () => {
    if (!packageId) return;
    setPkgBusy(true);
    try {
      const r = await fetch(`/api/bid-packages/${packageId}/leveling`);
      const d = await r.json();
      if (!r.ok) { setMsg(d.error || 'Could not load that bid package.'); return; }

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
      setAiNote(d.analysis?.recommendation || null);
    } catch {
      setMsg('Could not load that bid package.');
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
      setMsg(markComplete ? 'Levelling saved and marked complete.' : 'Levelling saved to the bid package.');
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

  const addScope = () => { const d = scopeInput.trim(); if (!d) return; setScopeLines((x) => [...x, { id: uid(), description: d, required: true }]); setScopeInput(''); };
  const seedTemplate = (t: typeof TRADE_TEMPLATES[number]) => { setScopeLines(t.lines.map((d, i) => ({ id: uid(), csi: t.csi, description: d, required: i < 6 }))); setBidders((bs) => bs.map((b) => ({ ...b, scope: [] }))); setTplOpen(false); setMsg(`Loaded ${t.trade} scope (${t.lines.length} lines)`); };
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
    if (!scopeLines.length) { setMsg('Define or load a scope checklist first'); return; }
    if (!aiText.trim()) { setMsg('Paste a bid'); return; }
    setAiBusy(true); setMsg('Reading bid…');
    try {
      const r = await fetch('/api/bids/level-extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: aiText, scopeLines: scopeLines.map((s) => ({ id: s.id, description: s.description })) }) });
      const d = await r.json();
      if (d.error) { setMsg(`AI: ${d.error}`); setAiBusy(false); return; }
      setBidders((x) => [...x, { id: uid(), name: d.bidderName || 'Subcontractor', baseBidCents: d.baseBidCents || 0, scope: d.scope || [], alternates: d.alternates || [] }]);
      setAiText(''); setMsg(`Added ${d.bidderName} — review the scope grid`);
    } catch (e) { console.error(e); setMsg(humanError(e, 'Something went wrong. Please try again.')); }
    setAiBusy(false);
  };

  const exportPdf = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const cell = (t: string, c = '#111') => `<td style="padding:6px 9px;border:1px solid #ccc;text-align:right;color:${c}">${t}</td>`;
    const head = `<th style="padding:6px 9px;border:1px solid #ccc;background:#141416;color:#fff">${''}</th>` + result.bidders.map((b) => `<th style="padding:6px 9px;border:1px solid #ccc;background:${b.id === rec?.id ? '#1a8a4a' : '#141416'};color:#fff">${b.name}${b.id === rec?.id ? ' ★' : ''}</th>`).join('');
    const row = (label: string, fn: (b: typeof result.bidders[number]) => string) => `<tr><td style="padding:6px 9px;border:1px solid #ccc;font-weight:600">${label}</td>${result.bidders.map((b) => cell(fn(b))).join('')}</tr>`;
    const matrix = scopeLines.map((l) => `<tr><td style="padding:5px 9px;border:1px solid #ccc">${l.description}</td>${result.bidders.map((b) => { const it = b.lines.find((s) => s.scopeLineId === l.id); const st: ScopeStatus = (it && it.status !== 'missing') ? it.status : 'excluded'; const col = st === 'included' ? '#1a8a4a' : st === 'excluded' ? '#c03030' : st === 'clarify' ? '#b8860b' : '#D97706'; return `<td style="padding:5px 9px;border:1px solid #ccc;text-align:center;color:${col};font-weight:600">${STL[st]}${it?.valueCents ? ' · ' + usd(it.valueCents) : ''}</td>`; }).join('')}</tr>`).join('');
    w.document.write(`<html><head><title>Bid Tabulation</title></head><body style="font-family:Arial;padding:24px;color:#111">
      <h2 style="margin:0">Bid Tabulation</h2><div style="color:#555;font-size:12px;margin-bottom:14px">Leveled — allowances fill scope gaps for apples-to-apples comparison${result.budgetCents ? ` · Budget ${usd(result.budgetCents)}` : ''}</div>
      <table style="border-collapse:collapse;font-size:12px;width:100%"><thead><tr>${head}</tr></thead><tbody>
      ${row('Base bid', (b) => usd(b.baseBidCents))}${row('+ Gap allowances', (b) => b.gapAllowanceCents ? '+' + usd(b.gapAllowanceCents) : '—')}${row('+ Alternates', (b) => b.alternatesAdjCents ? usd(b.alternatesAdjCents) : '—')}${row('+ Adjustments', (b) => b.adjustmentsCents ? '+' + usd(b.adjustmentsCents) : '—')}
      <tr style="font-weight:800"><td style="padding:6px 9px;border:1px solid #ccc">LEVELED TOTAL</td>${result.bidders.map((b) => cell(usd(b.leveledTotalCents), b.isLow ? '#1a8a4a' : '#111')).join('')}</tr>
      ${result.budgetCents ? row('vs Budget', (b) => (b.vsBudgetCents! > 0 ? '+' : '') + usd(b.vsBudgetCents!) + ` (${b.vsBudgetPct}%)`) : ''}
      </tbody></table>
      <h3 style="margin:18px 0 6px">Scope Coverage</h3>
      <table style="border-collapse:collapse;font-size:11px;width:100%"><thead><tr>${head}</tr></thead><tbody>${matrix}</tbody></table>
      ${rec ? `<div style="margin-top:16px;padding:10px 12px;border-left:3px solid #1a8a4a;background:#f0faf4"><b>Recommendation:</b> ${result.recommendation.rationale}</div>` : ''}
      </body></html>`);
    w.document.close(); w.focus(); w.print();
  };

  const inp: React.CSSProperties = { background: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, padding: '9px 11px', fontSize: 14, outline: 'none' };
  const btn: React.CSSProperties = { ...goldButtonStyle, padding: '9px 16px', fontSize: 13.5 };
  const ghost: React.CSSProperties = { ...ghostButtonStyle, padding: '8px 12px', fontSize: 13 };
  const th: React.CSSProperties = { padding: '9px 10px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' };

  return (
    <PremiumSurface maxWidth={1240}>
      <ModuleHero
        eyebrow="Bid Tabulation · Deterministic"
        eyebrowIcon={<Scales size={13} weight="fill" color={BIDS.hex} />}
        title={pkgName ? `${pkgName} —` : 'Bid'}
        accent="Leveling"
        subtitle="Normalize sub bids to one scope, then award on price and coverage."
        actions={
          <>
            {/* Package mode only: these push the levelled figures back onto the
                real submissions. In scratchpad mode they are simply absent —
                there is nothing to save to. */}
            {packageId && (
              <>
                <button onClick={analysePackage} disabled={pkgBusy} style={ghostButtonStyle} className="pmBtn">
                  <Sparkle size={15} weight="bold" /> {pkgBusy ? 'Working…' : 'Ask Sage to find the gaps'}
                </button>
                <button onClick={() => savePackage(false)} disabled={pkgBusy} style={ghostButtonStyle} className="pmBtn">
                  Save to package
                </button>
                <button onClick={() => savePackage(true)} disabled={pkgBusy || pkgComplete} style={goldButtonStyle} className="pmBtn">
                  {pkgComplete ? 'Levelling complete' : 'Save &amp; mark complete'}
                </button>
              </>
            )}
            {bidders.length > 0 && (
              <button onClick={exportPdf} style={ghostButtonStyle} className="pmBtn"><FilePdf size={15} weight="bold" /> Export bid tab</button>
            )}
          </>
        }
      />

      {aiNote && (
        <SectionCard flat title="Sage read the bids" icon={<Sparkle size={17} weight="duotone" color={GOLD} />}>
          <div style={{ fontSize: 14, lineHeight: 1.65, color: TEXT, maxWidth: '72ch' }}>{aiNote}</div>
          <div style={{ fontSize: 12, color: DIM, marginTop: 8 }}>
            A reading, not a quote. The scope grid below is pre-filled from it — every cell is still yours to change.
          </div>
        </SectionCard>
      )}

      {/* toolbar: budget + template */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: DIM, fontSize: 13 }}><Target size={16} color={GOLD} />Your budget $<input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="optional" style={{ ...inp, width: 140 }} /></label>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setTplOpen((o) => !o)} style={ghost} className="pmBtn">CSI scope template <CaretDown size={13} /></button>
          {tplOpen && <div style={{ position: 'absolute', zIndex: 20, top: 42, left: 0, background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 6, width: 240, maxHeight: 320, overflowY: 'auto', boxShadow: '0 22px 44px -20px rgba(245,158,11,0.2)' }}>{TRADE_TEMPLATES.map((t) => <button key={t.trade} onClick={() => seedTemplate(t)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: TEXT, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>{t.trade}<span style={{ color: DIM, fontSize: 11 }}> · {t.csi}</span></button>)}</div>}
        </div>
        {msg && <span style={{ fontSize: 13, color: DIM }}>{msg}</span>}
      </div>

      {/* Stat strip — the tabulation at a glance, all from the deterministic engine */}
      {bidders.length > 0 && scopeLines.length > 0 && (
        <StatStrip items={[
          { label: 'Bidders', value: String(result.bidders.length), icon: <Users size={11} weight="bold" color={BIDS.hex} /> },
          { label: 'Scope Lines', value: String(scopeLines.length), sub: `${scopeLines.filter((l) => l.required !== false).length} required`, icon: <ListChecks size={11} weight="bold" color={BIDS.hex} /> },
          ...(low ? [{ label: 'Low Leveled', value: usd(low.leveledTotalCents), accent: GOLD, sub: low.name, icon: <Trophy size={11} weight="bold" color={GOLD} /> }] : []),
          { label: 'Spread', value: usd(result.spreadCents), sub: 'low to high, leveled', icon: <ChartBar size={11} weight="bold" color={BIDS.hex} /> },
          ...(result.budgetCents ? [{ label: 'Your Budget', value: usd(result.budgetCents), icon: <Target size={11} weight="bold" color={BIDS.hex} /> }] : []),
          { label: 'Coverage Gaps', value: String(result.uncoveredRequired), accent: result.uncoveredRequired > 0 ? RED : GREEN, sub: result.uncoveredRequired > 0 ? 'required lines uncovered' : 'every required line covered', icon: <Warning size={11} weight="bold" color={result.uncoveredRequired > 0 ? RED : GREEN} /> },
        ]} />
      )}

      {/* First-run teach strip — the module flow before any data exists */}
      {bidders.length === 0 && scopeLines.length === 0 && (
        <FlowStrip style={{ marginBottom: 20 }} steps={[
          { title: 'Load a scope', desc: 'CSI template or your own lines' },
          { title: 'Add sub bids', desc: 'manual or AI-extracted from proposals' },
          { title: 'Level to the same scope', desc: 'gap allowances fill exclusions' },
          { title: 'Award with confidence', desc: 'price + coverage, budget-checked' },
        ]} />
      )}

      {/* recommendation */}
      {rec && (
        <div style={{ background: 'linear-gradient(180deg,rgba(61,214,140,0.12),rgba(61,214,140,0.03))', border: `1px solid rgba(61,214,140,0.4)`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}><Trophy size={18} weight="fill" color={GREEN} /><span style={{ fontWeight: 800, color: GREEN }}>Recommend: {rec.name}</span><span style={{ color: DIM, fontSize: 13 }}>· {usd(rec.leveledTotalCents)} leveled · {rec.requiredCoveragePct}% scope coverage</span></div>
          <div style={{ color: DIM, fontSize: 13.5, lineHeight: 1.5 }}>{result.recommendation.rationale}</div>
        </div>
      )}

      {/* leveled totals + stacked bars */}
      {bidders.length > 0 && scopeLines.length > 0 && (
        <SectionCard
          title="Leveled Totals"
          subtitle={`Spread ${usd(result.spreadCents)}${result.budgetCents ? ` · budget ${usd(result.budgetCents)}` : ''} — allowances fill scope gaps for apples-to-apples comparison`}
          icon={<ChartBar size={17} weight="duotone" color={BIDS.hex} />}
          accent={BIDS.hex}
          style={{ marginBottom: 14 }}
        >
          {/* stacked bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {result.bidders.map((b) => { const seg = (v: number, c: string) => v > 0 ? <div style={{ width: `${(v / maxTotal) * 100}%`, background: c }} /> : null; return (
              <div key={b.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}><span style={{ color: b.isLow ? GREEN : TEXT, fontWeight: 700 }}>{b.isLow && <Trophy size={12} weight="fill" color={GREEN} style={{ verticalAlign: 'middle', marginRight: 4 }} />}{b.name}</span><span style={{ color: b.vsBudgetPct != null && b.vsBudgetPct > 0 ? RED : DIM, fontVariantNumeric: 'tabular-nums' }}>{usd(b.leveledTotalCents)}{b.vsBudgetPct != null ? ` · ${b.vsBudgetPct > 0 ? '+' : ''}${b.vsBudgetPct}% vs budget` : ''}</span></div>
                <div style={{ position: 'relative', height: 16, background: DARK, borderRadius: 4, display: 'flex', overflow: 'hidden' }}>
                  {seg(b.baseBidCents, '#334155')}{seg(b.gapAllowanceCents, GOLD)}{seg(Math.max(0, b.alternatesAdjCents), BLUE)}{seg(b.adjustmentsCents, '#7c5cff')}
                  {result.budgetCents ? <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${(result.budgetCents / maxTotal) * 100}%`, width: 2, background: '#fff' }} title="budget" /> : null}
                </div>
              </div>
            ); })}
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: DIM, flexWrap: 'wrap' }}>{[['#334155', 'Base'], [GOLD, 'Gap allowance'], [BLUE, 'Alternates'], ['#7c5cff', 'Adjustments'], ['#fff', 'Your budget']].map(([c, l]) => <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, background: c, borderRadius: 2, display: 'inline-block' }} />{l}</span>)}</div>
          </div>
          {/* totals table — machined: micro-caps headers, hairlines, sticky first column */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, minWidth: 520 }}>
              <thead><tr style={{ background: HEAD }}><th style={{ ...th, textAlign: 'left', padding: '9px 10px', color: DIM, position: 'sticky', left: 0, background: HEAD }}>Line</th>{result.bidders.map((b) => <th key={b.id} style={{ ...th, padding: '9px 10px', color: b.isLow ? GREEN : TEXT, textAlign: 'right' }}>{b.name}</th>)}</tr></thead>
              <tbody>
                <tr><td style={cellL}>Base bid</td>{result.bidders.map((b) => <td key={b.id} style={cell}>{usd(b.baseBidCents)}</td>)}</tr>
                <tr><td style={cellL}>+ Gap allowances</td>{result.bidders.map((b) => <td key={b.id} style={{ ...cell, color: b.gapAllowanceCents ? GOLD : DIM }}>{b.gapAllowanceCents ? '+' + usd(b.gapAllowanceCents) : '—'}</td>)}</tr>
                <tr><td style={cellL}>+ Alternates</td>{result.bidders.map((b) => <td key={b.id} style={{ ...cell, color: b.alternatesAdjCents ? BLUE : DIM }}>{b.alternatesAdjCents ? (b.alternatesAdjCents > 0 ? '+' : '') + usd(b.alternatesAdjCents) : '—'}</td>)}</tr>
                <tr><td style={cellL}>+ Adjustments</td>{result.bidders.map((b) => <td key={b.id} style={{ ...cell, color: b.adjustmentsCents ? '#a78bfa' : DIM }}>{b.adjustmentsCents ? '+' + usd(b.adjustmentsCents) : '—'}</td>)}</tr>
                <tr style={{ borderTop: `2px solid ${BORDER}` }}><td style={{ ...cellL, fontWeight: 800 }}>Leveled total</td>{result.bidders.map((b) => <td key={b.id} style={{ ...cell, fontWeight: 800, fontSize: 15, color: b.isLow ? GREEN : GOLD, background: b.isLow ? 'rgba(61,214,140,0.10)' : 'transparent' }}>{usd(b.leveledTotalCents)}</td>)}</tr>
                <tr><td style={cellL}>Δ vs low</td>{result.bidders.map((b) => <td key={b.id} style={{ ...cell, color: DIM }}>{b.isLow ? '—' : '+' + usd(b.deltaFromLowCents)}</td>)}</tr>
                {result.budgetCents ? <tr><td style={cellL}>vs Budget</td>{result.bidders.map((b) => <td key={b.id} style={{ ...cell, color: (b.vsBudgetCents || 0) > 0 ? RED : GREEN }}>{(b.vsBudgetCents || 0) > 0 ? '+' : ''}{usd(b.vsBudgetCents || 0)} ({b.vsBudgetPct}%)</td>)}</tr> : null}
                <tr><td style={cellL}>Scope coverage</td>{result.bidders.map((b) => <td key={b.id} style={{ ...cell, color: b.requiredCoveragePct < 100 ? GOLD : DIM }}>{b.requiredCoveragePct}%</td>)}</tr>
              </tbody>
            </table>
          </div>
          {result.flags.length > 0 && <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>{result.flags.map((f, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: f.level === 'warn' ? GOLD : DIM }}>{f.level === 'warn' ? <Warning size={15} weight="fill" color={GOLD} /> : <Info size={15} color={DIM} />}{f.message}</div>)}</div>}
        </SectionCard>
      )}

      {/* scope matrix */}
      {bidders.length > 0 && scopeLines.length > 0 && (
        <SectionCard
          title="Scope Matrix"
          subtitle="Click a cell to cycle Incl → Excl → Clarify → Alt"
          icon={<ListChecks size={17} weight="duotone" color={BIDS.hex} />}
          accent={BIDS.hex}
          style={{ marginBottom: 14 }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, minWidth: 560 }}>
              <thead><tr style={{ background: HEAD }}><th style={{ ...th, textAlign: 'left', padding: '8px 10px', color: DIM, position: 'sticky', left: 0, background: HEAD }}>Scope line</th><th style={{ ...th, padding: '8px 6px', color: DIM }}>Cov</th>{result.bidders.map((b) => <th key={b.id} style={{ ...th, padding: '8px 8px', color: TEXT }}>{b.name}</th>)}</tr></thead>
              <tbody>{scopeLines.map((l) => { const cov = result.scopeCoverage.find((c) => c.scopeLineId === l.id)!; return (
                <tr key={l.id} style={{ borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                  <td style={{ ...cellL, fontWeight: 500 }}>{l.description}{l.required === false && <span style={{ color: DIM, fontSize: 11 }}> (opt)</span>}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'center', color: cov.noneCovered ? RED : cov.singleBid ? GOLD : GREEN, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{cov.includedBy}</td>
                  {result.bidders.map((b) => { const it = b.lines.find((s) => s.scopeLineId === l.id); const st = (it && it.status !== 'missing' ? it.status : 'excluded') as ScopeStatus; return (
                    <td key={b.id} onClick={() => cycleCell(b.id, l.id)} title="click to cycle" style={{ padding: '5px 8px', textAlign: 'center', cursor: 'pointer', color: STC[st], background: `${STC[st]}14`, borderLeft: `1px solid ${BORDER}` }}>{STL[st]}{it?.valueCents ? <div style={{ fontSize: 10.5, color: DIM, fontVariantNumeric: 'tabular-nums' }}>{usd(it.valueCents)}</div> : null}</td>
                  ); })}
                </tr>
              ); })}</tbody>
            </table>
          </div>
          {result.uncoveredRequired > 0 && <div style={{ marginTop: 8, fontSize: 12.5, color: RED, display: 'flex', alignItems: 'center', gap: 6 }}><Warning size={14} weight="fill" color={RED} />{result.uncoveredRequired} required scope line{result.uncoveredRequired > 1 ? 's have' : ' has'} no coverage — re-solicit or carry.</div>}
        </SectionCard>
      )}

      {/* alternates */}
      {altKeys.length > 0 && (
        <SectionCard
          title="Alternates to Apply"
          subtitle="Toggle an alternate to fold it into every leveled total"
          icon={<Stack size={17} weight="duotone" color={BIDS.hex} />}
          accent={BIDS.hex}
          style={{ marginBottom: 14 }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{altKeys.map((k) => { const on = selAlts.includes(k); return <button key={k} onClick={() => setSelAlts((x) => on ? x.filter((y) => y !== k) : [...x, k])} style={{ ...ghost, borderColor: on ? BLUE : BORDER, color: on ? BLUE : TEXT, background: on ? 'rgba(56,189,248,0.12)' : 'transparent' }}>{k} · {altMeta[k]}</button>; })}</div>
        </SectionCard>
      )}

      {/* AI extract */}
      <SectionCard
        title="AI extract a bid"
        subtitle="Paste a proposal; it maps onto your scope checklist."
        icon={<Sparkle size={17} weight="duotone" color={BLUE} />}
        accent={BLUE}
        style={{ marginBottom: 16 }}
      >
        <textarea value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="Paste a subcontractor's proposal — AI maps it onto your scope checklist and adds it as a bidder." style={{ ...inp, width: '100%', minHeight: 70, resize: 'vertical', boxSizing: 'border-box' }} />
        <button onClick={extract} disabled={aiBusy} className="pmBtn" style={{ ...btn, marginTop: 8, opacity: aiBusy ? 0.6 : 1, cursor: aiBusy ? 'wait' : 'pointer' }}><Sparkle size={15} weight="bold" />{aiBusy ? 'Reading…' : 'Extract & add bidder'}</button>
      </SectionCard>

      {/* scope checklist */}
      <SectionCard
        title="Scope Checklist"
        subtitle="Every line every bidder gets leveled against — required lines drive coverage"
        icon={<ListChecks size={17} weight="duotone" color={BIDS.hex} />}
        accent={BIDS.hex}
        style={{ marginBottom: 16 }}
      >
        {scopeLines.map((l) => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid rgba(255,255,255,0.07)` }}>
            <button onClick={() => setScopeLines((x) => x.map((s) => s.id === l.id ? { ...s, required: !(s.required !== false) } : s))} style={{ ...ghost, padding: '3px 8px', fontSize: 11, borderColor: l.required !== false ? GOLD : BORDER, color: l.required !== false ? GOLD : DIM }}>{l.required !== false ? 'Required' : 'Optional'}</button>
            <span style={{ flex: 1, color: TEXT, fontSize: 13 }}>{l.description}</span>
            <button onClick={() => setScopeLines((x) => x.filter((s) => s.id !== l.id))} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Trash size={16} color={RED} /></button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input value={scopeInput} onChange={(e) => setScopeInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addScope()} placeholder="Add a scope line — or load a CSI template above" style={{ ...inp, flex: 1 }} />
          <button onClick={addScope} style={btn} className="pmBtn"><Plus size={15} />Add</button>
        </div>
      </SectionCard>

      {/* bidders */}
      <SectionCard
        title="Bidders"
        subtitle={bidders.length > 0 ? `${bidders.length} in the tabulation` : 'Add bidders manually or extract them from bid text above'}
        icon={<Users size={17} weight="duotone" color={BIDS.hex} />}
        accent={BIDS.hex}
        action={<button onClick={addBidder} style={btn} className="pmBtn"><Plus size={15} />Add bidder</button>}
      >
        {bidders.length === 0 ? <div style={{ color: DIM, fontSize: 13 }}>Add bidders manually or extract them from bid text above.</div> : bidders.map((b) => {
          const lb = result.bidders.find((x) => x.id === b.id);
          return (
            <div key={b.id} style={{ background: RAISED, border: `1px solid ${lb?.isLow ? 'rgba(61,214,140,0.4)' : BORDER}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={b.name} onChange={(e) => patchBidder(b.id, { name: e.target.value })} style={{ ...inp, flex: 2, minWidth: 150, fontWeight: 700 }} />
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ color: DIM, fontSize: 13 }}>Base $</span><input value={b.baseBidCents ? (b.baseBidCents / 100).toString() : ''} onChange={(e) => patchBidder(b.id, { baseBidCents: toCents(e.target.value) })} placeholder="0" style={{ ...inp, width: 120 }} /></div>
                {lb && <span style={{ color: lb.isLow ? GREEN : GOLD, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>= {usd(lb.leveledTotalCents)}</span>}
                <button onClick={() => setAdjOpen(adjOpen === b.id ? null : b.id)} style={{ ...ghost, padding: '5px 9px', fontSize: 12 }}>Adjust {adjOpen === b.id ? <CaretDown size={12} /> : <CaretRight size={12} />}</button>
                <button onClick={() => setBidders((x) => x.filter((y) => y.id !== b.id))} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Trash size={17} color={RED} /></button>
              </div>
              {adjOpen === b.id && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {([['bondCents', 'Bond $'], ['taxCents', 'Sales tax $'], ['carryCents', 'Carry $']] as const).map(([k, lbl]) => <label key={k} style={{ fontSize: 12, color: DIM }}>{lbl}<input value={(b.adjustments?.[k] || 0) ? ((b.adjustments![k] as number) / 100).toString() : ''} onChange={(e) => patchAdj(b.id, k, e.target.value)} placeholder="0" style={{ ...inp, width: 100, marginLeft: 6 }} /></label>)}
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: DIM }}><input type="checkbox" checked={b.insuranceMeets !== false} onChange={(e) => patchBidder(b.id, { insuranceMeets: e.target.checked })} />Insurance meets</label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: DIM }}><input type="checkbox" checked={b.bondIncluded === true} onChange={(e) => patchBidder(b.id, { bondIncluded: e.target.checked })} />Bond in base</label>
                </div>
              )}
              {scopeLines.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {scopeLines.map((l) => { const it = b.scope.find((s) => s.scopeLineId === l.id); const st = (it?.status || 'excluded') as ScopeStatus; return (
                    <button key={l.id} onClick={() => cycleCell(b.id, l.id)} title="click to cycle Incl → Excl → Clarify → Alt" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${STC[st]}55`, background: `${STC[st]}18`, color: STC[st], borderRadius: 7, padding: '5px 9px', cursor: 'pointer', fontSize: 12 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 4, background: STC[st] }} />{l.description}<span style={{ opacity: 0.7 }}>{STL[st]}</span>
                    </button>
                  ); })}
                </div>
              )}
            </div>
          );
        })}
      </SectionCard>

      <div style={{ marginTop: 20, fontSize: 12 }}><a href="/app/bids" style={{ color: DIM }}>← Back to Bid Center</a></div>
    </PremiumSurface>
  );
}
const cell: React.CSSProperties = { padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const cellL: React.CSSProperties = { padding: '7px 10px', textAlign: 'left', color: '#CBD5E1', position: 'sticky', left: 0, background: '#141416' };


/* useSearchParams needs a Suspense boundary in a client component under the
   App Router, or the whole route opts out of static rendering with a build
   warning. */
export default function BidLevelingPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: DIM }}>Loading leveling…</div>}>
      <BidLevelingBoard />
    </Suspense>
  );
}
