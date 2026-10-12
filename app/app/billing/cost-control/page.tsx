'use client';
/**
 * Cost Control — the CM cost report, real front-to-back.
 *   Budget    ← budget_lines (per cost code)
 *   Committed ← Σ purchase_orders.total     (bid-award writes draft subcontract POs here)
 *   Actual    ← Σ approved/paid invoices
 * all served live by GET /api/cost-control. Committed/Actual auto-fill from the
 * money already in the system; an optional per-line override persists into the
 * saved cost report. The shared lib/finance engine forecasts final cost + variance
 * (same numbers as iOS). Snapshots are saved/loaded via /api/cost-control/reports.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { CheckCircle, FloppyDisk, ClockCounterClockwise, ArrowClockwise, ArrowUUpLeft, X, Sparkle, ChartLineUp, Wallet, Handshake, Receipt, TrendUp, Scales, Table, Plus } from '@phosphor-icons/react';
import { costControl, usd, type CostLine } from '@/lib/finance';
import { humanError } from '@/lib/errors';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';

const BG = 'var(--bg-base)', PANEL = 'var(--bg-surface-2)', LINE = 'rgba(255,255,255,0.09)', GOLD = 'var(--brand-primary)', TEXT = 'var(--text-secondary)', DIM = 'var(--text-tertiary)', GREEN = 'var(--success)', RED = 'var(--danger)';
const uid = () => Math.random().toString(36).slice(2, 9);
const c = (s: string) => Math.round((parseFloat(s) || 0) * 100);   // dollars string → cents
const d = (cents: number) => (cents / 100).toFixed(2);             // cents → dollars string

type Row = {
  id: string; costCode: string; description: string;
  _b: string; _ch: string;                 // budget / approved-changes (dollars, editable)
  comAuto: number; actAuto: number;         // auto committed / actual (cents, from POs / invoices)
  comOv: string | null; actOv: string | null; // optional overrides (dollars string, null = use auto)
  manual: boolean;                          // added by hand / from a takeoff — lives only on saved reports
};
type Report = { id: string; report_date: string; title: string | null; lines: any[]; totals: any; created_at: string };

const effCom = (r: Row) => (r.comOv !== null ? c(r.comOv) : r.comAuto);
const effAct = (r: Row) => (r.actOv !== null ? c(r.actOv) : r.actAuto);

export default function CostControlPage() {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [takeoffs, setTakeoffs] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null); // non-null = viewing a saved snapshot
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sources, setSources] = useState<{ budget?: string; committed?: string; actual?: string }>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const { projects: liveProjects } = useProjects();
  /* The chosen job rides the URL (?project=…). It used to reset to the first
     job on every load, so a report saved on any other job looked lost after a
     reload — the screen had quietly switched projects. */
  const urlProject = useRef<string | null>(null);
  useEffect(() => { try { urlProject.current = new URLSearchParams(window.location.search).get('project'); } catch { /* no URL */ } }, []);
  useEffect(() => {
    const ps = liveProjects; setProjects(ps);
    if (!ps[0]) return;
    setProjectId((prev) => prev || (urlProject.current && ps.some((p) => p.id === urlProject.current) ? urlProject.current : ps[0].id));
  }, [liveProjects]);
  useEffect(() => {
    if (!projectId) return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('project', projectId);
      window.history.replaceState(null, '', `${u.pathname}${u.search}${u.hash}`);
    } catch { /* URL sync is cosmetic */ }
  }, [projectId]);
  useEffect(() => { if (projectId) fetch('/api/takeoff?limit=30').then((r) => r.json()).then((x) => setTakeoffs((x.takeoffs || x.data || []).filter((t: any) => !t.project_id || t.project_id === projectId))).catch(() => setTakeoffs([])); }, [projectId]);

  const loadLive = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true); setErr(''); setMsg(''); setViewingId(null);
    try {
      const x = await fetch(`/api/cost-control?project_id=${pid}`).then((r) => r.json());
      if (x.error) throw new Error(x.error);
      const ov = x.overrides || {};
      setRows((x.lines || []).map((l: any) => ({
        id: uid(), costCode: l.costCode, description: l.description,
        _b: d(l.originalBudgetCents || 0), _ch: d(l.approvedChangesCents || 0),
        comAuto: l.committedCents || 0, actAuto: l.actualCents || 0,
        comOv: ov[l.costCode]?.committedCents != null ? d(ov[l.costCode].committedCents) : null,
        actOv: ov[l.costCode]?.actualCents != null ? d(ov[l.costCode].actualCents) : null,
        manual: !!l.manual,
      })));
      setSources(x.sources || {});
    } catch (e) { console.error(e); setErr(humanError(e, "Couldn't load the cost report. Please try again.")); setRows([]); }
    finally { setLoading(false); }
  }, []);

  const loadReports = useCallback(async (pid: string) => {
    if (!pid) return;
    try { const x = await fetch(`/api/cost-control/reports?project_id=${pid}`).then((r) => r.json()); setReports(x.reports || []); }
    catch { setReports([]); }
  }, []);

  useEffect(() => { if (projectId) { loadLive(projectId); loadReports(projectId); } }, [projectId, loadLive, loadReports]);

  // Optional: merge a takeoff's derived budget into the Budget column (by cost code).
  const seedFromTakeoff = async (tid: string) => {
    if (!tid) return; setMsg('Loading takeoff…'); setErr('');
    try {
      const t = await fetch(`/api/takeoff/${tid}`).then((r) => r.json());
      const tk = t.takeoff || t; const items = tk.line_items || tk.takeoff_line_items || [];
      const byCode = new Map<string, number>();
      for (const it of items) { const code = (it.csi_code || it.category || 'Other'); const tot = Math.round(((Number(it.quantity) || 0) * ((Number(it.unit_material_cost) || 0) + (Number(it.unit_labor_cost) || 0))) * 100); byCode.set(code, (byCode.get(code) || 0) + tot); }
      setRows((prev) => {
        const next = [...prev];
        for (const [code, cents] of byCode) {
          const i = next.findIndex((r) => r.costCode === code);
          if (i >= 0) next[i] = { ...next[i], _b: d(cents) };
          else next.push({ id: uid(), costCode: code, description: code, _b: d(cents), _ch: '0', comAuto: 0, actAuto: 0, comOv: null, actOv: null, manual: true });
        }
        return next;
      });
      setViewingId(null);
      setMsg(`Merged ${byCode.size} budget lines from takeoff.`);
    } catch (e) { console.error(e); setErr(humanError(e, "Something went wrong. Please try again.")); }
  };

  const addRow = () => setRows((x) => [...x, { id: uid(), costCode: '', description: '', _b: '0', _ch: '0', comAuto: 0, actAuto: 0, comOv: null, actOv: null, manual: true }]);
  const upd = (id: string, patch: Partial<Row>) => setRows((x) => x.map((l) => l.id === id ? { ...l, ...patch } : l));
  const removeRow = (id: string) => setRows((x) => x.filter((l) => l.id !== id));

  const lines: CostLine[] = rows.map((l) => ({ id: l.id, costCode: l.costCode, description: l.description || l.costCode, originalBudgetCents: c(l._b), approvedChangesCents: c(l._ch), committedCents: effCom(l), actualCents: effAct(l) }));
  const r = useMemo(() => costControl(lines), [rows]);

  const saveReport = async () => {
    if (!projectId || saving) return;
    setSaving(true); setErr(''); setMsg('');
    try {
      const payloadLines = rows.map((l) => {
        const rr = r.rows.find((x) => x.id === l.id)!;
        return {
          /* A hand-added line has no code of its own — the text typed in its
             box is its code, so it keeps one identity from save to reload. */
          costCode: l.costCode || l.description.trim(), description: l.description || l.costCode,
          manual: l.manual,
          originalBudgetCents: c(l._b), approvedChangesCents: c(l._ch),
          committedCents: effCom(l), actualCents: effAct(l),
          committedOverrideCents: l.comOv !== null ? c(l.comOv) : null,
          actualOverrideCents: l.actOv !== null ? c(l.actOv) : null,
          projectedFinalCents: rr.projectedFinalCents, varianceCents: rr.varianceCents,
        };
      });
      const totals = { revisedBudgetCents: r.revisedBudgetCents, committedCents: r.committedCents, actualCents: r.actualCents, projectedFinalCents: r.projectedFinalCents, varianceCents: r.varianceCents };
      const res = await fetch('/api/cost-control/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, report_date: reportDate, lines: payloadLines, totals }) }).then((x) => x.json());
      if (res.error) throw new Error(res.error);
      setMsg('Cost report saved.');
      loadReports(projectId);
    } catch (e) { console.error(e); setErr(humanError(e, "Something went wrong. Please try again.")); }
    finally { setSaving(false); }
  };

  const viewReport = (rep: Report) => {
    setRows((rep.lines || []).map((l: any) => ({
      id: uid(), costCode: l.costCode, description: l.description || l.costCode,
      _b: d(l.originalBudgetCents || 0), _ch: d(l.approvedChangesCents || 0),
      comAuto: l.committedCents || 0, actAuto: l.actualCents || 0, comOv: null, actOv: null,
      manual: l.manual === true || !l.costCode,
    })));
    setViewingId(rep.id); setShowHistory(false); setMsg(''); setErr('');
  };

  const inp: React.CSSProperties = { background: BG, border: `1px solid ${LINE}`, borderRadius: 6, color: TEXT, padding: '6px 8px', fontSize: 13, width: '100%', textAlign: 'right' };
  const cell = (v: number, over = false) => <span style={{ textAlign: 'right', fontSize: 13, color: over && v < 0 ? RED : TEXT, fontWeight: over ? 700 : 400 }}>{usd(v)}</span>;
  const toolBtn: React.CSSProperties = { ...ghostButtonStyle, gap: 6, padding: '9px 14px', fontSize: 13, borderRadius: 10 };
  const toolGold: React.CSSProperties = { ...goldButtonStyle, gap: 6, padding: '9px 16px', fontSize: 13, borderRadius: 10 };
  const GRID = '1.5fr 0.9fr 0.8fr 1.05fr 1.05fr 1fr 1fr 26px';

  return (
    <PremiumSurface>
      {/* Header */}
      <ModuleHero
        eyebrow="Cost Control · Budget vs. Committed vs. Actual"
        eyebrowIcon={<ChartLineUp size={13} weight="fill" color="var(--text-secondary)" />}
        title="Cost"
        accent="Control"
        subtitle="Committed, actual, and projected final cost per code."
      />

      {/* controls */}
      <SectionCard style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ ...inp, textAlign: 'left', width: 'auto' }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button onClick={() => loadLive(projectId)} style={{ ...toolBtn, opacity: loading ? 0.6 : 1 }} className="pmBtn" disabled={loading}><ArrowClockwise size={14} weight="bold" />{loading ? 'Loading…' : viewingId ? 'Back to Live' : 'Refresh'}</button>
          <select onChange={(e) => { seedFromTakeoff(e.target.value); e.currentTarget.selectedIndex = 0; }} defaultValue="" style={{ ...inp, textAlign: 'left', width: 'auto' }}><option value="">Merge budget from takeoff…</option>{takeoffs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <div style={{ flex: 1 }} />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: DIM }}>Report Date
            <SaguaroDatePicker value={reportDate} onChange={(v) => setReportDate(v)} style={{ ...inp, width: 'auto', textAlign: 'left' }} />
          </label>
          <button onClick={saveReport} style={{ ...toolGold, opacity: (saving || !rows.length) ? 0.55 : 1 }} className="pmBtn" disabled={saving || !rows.length}><FloppyDisk size={14} weight="fill" />{saving ? 'Saving…' : 'Save Cost Report'}</button>
          <button onClick={() => setShowHistory((s) => !s)} style={toolBtn} className="pmBtn"><ClockCounterClockwise size={14} weight="bold" />History{reports.length ? ` (${reports.length})` : ''}</button>
        </div>
      </SectionCard>

      {(msg || err) && (
        <div style={{ marginBottom: 12, fontSize: 13, color: err ? RED : GREEN, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {err ? <X size={14} weight="bold" /> : <CheckCircle size={14} weight="fill" />}{err || msg}
        </div>
      )}
      {viewingId && <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><ClockCounterClockwise size={14} weight="bold" />Viewing a saved snapshot — read-only figures. Press &ldquo;Back to Live&rdquo; to edit.</div>}

      {/* history panel */}
      {showHistory && (
        <SectionCard title="Saved Cost Reports" icon={<ClockCounterClockwise size={17} weight="duotone" color="var(--text-secondary)" />} flush style={{ marginBottom: 16 }}>
          {reports.length === 0 ? (
            <PremiumEmpty compact icon={<ClockCounterClockwise size={30} weight="duotone" color="var(--text-secondary)" />} title="No saved reports yet" description="Save a cost report to start building history." />
          ) : (
            reports.map((rep) => (
              <div key={rep.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderTop: `1px solid ${LINE}`, cursor: 'pointer' }} onClick={() => viewReport(rep)}>
                <ClockCounterClockwise size={16} color="var(--text-secondary)" />
                <span style={{ fontWeight: 600, fontSize: 13, color: TEXT }}>{rep.report_date}</span>
                <span style={{ color: DIM, fontSize: 12 }}>{rep.title || `${(rep.lines || []).length} lines`}</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 13, color: DIM }}>Budget {usd(rep.totals?.revisedBudgetCents || 0)}</span>
                <span style={{ fontSize: 13, color: (rep.totals?.varianceCents ?? 0) < 0 ? RED : GREEN, fontWeight: 700 }}>Var {usd(rep.totals?.varianceCents || 0)}</span>
              </div>
            ))
          )}
        </SectionCard>
      )}

      {/* summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard icon={<Wallet size={19} weight="duotone" color="var(--text-secondary)" />} label="Revised Budget" value={usd(r.revisedBudgetCents)} delay={0.02}  href="/app/billing/cost-control"/>
        <StatCard icon={<Handshake size={19} weight="duotone" color="var(--text-secondary)" />} label="Committed" value={usd(r.committedCents)} delay={0.06}  href="/app/billing/cost-control"/>
        <StatCard icon={<Receipt size={19} weight="duotone" color="var(--text-secondary)" />} label="Spent to Date" value={usd(r.actualCents)} delay={0.10}  href="/app/billing/cost-control"/>
        <StatCard icon={<TrendUp size={19} weight="duotone" color="var(--text-secondary)" />} label="Projected Final" value={usd(r.projectedFinalCents)} delay={0.14}  href="/app/billing/cost-control"/>
        <StatCard
          icon={<Scales size={19} weight="duotone" color={r.varianceCents < 0 ? RED : GREEN} />}
          label="Variance"
          value={usd(r.varianceCents)}
          accent={r.varianceCents < 0 ? RED : GREEN}
          sub={<span style={{ color: r.varianceCents < 0 ? RED : GREEN, fontWeight: 700 }}>{r.varianceCents < 0 ? 'Over budget' : 'Under budget'}</span>}
          delay={0.18}
         href="/app/billing/cost-control"/>
      </div>

      {/* table */}
      <SectionCard title="Cost Breakdown" subtitle="Budget vs. committed vs. actual — per cost code" icon={<Table size={17} weight="duotone" color="var(--text-secondary)" />} flush>
        <div style={{ overflow: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: GRID, background: PANEL, padding: '10px 16px', fontSize: 12, color: DIM, fontWeight: 700, minWidth: 980, gap: 6 }}>
            <span>Cost Code / Description</span><span style={{ textAlign: 'right' }}>Budget</span><span style={{ textAlign: 'right' }}>Changes</span><span style={{ textAlign: 'right' }}>Committed</span><span style={{ textAlign: 'right' }}>Actual</span><span style={{ textAlign: 'right' }}>Projected</span><span style={{ textAlign: 'right' }}>Variance</span><span />
          </div>
          {rows.length === 0 && !loading && (
            <PremiumEmpty compact icon={<Table size={30} weight="duotone" color="var(--text-secondary)" />} title="No cost lines yet" description="This project has no budget lines, purchase orders, or invoices — or pick another project." />
          )}
          {rows.map((l) => {
            const rr = r.rows.find((x) => x.id === l.id)!;
            const ro = !!viewingId; // read-only when viewing a snapshot
            return (
              <div key={l.id} style={{ display: 'grid', gridTemplateColumns: GRID, padding: '7px 16px', borderTop: `1px solid ${LINE}`, gap: 6, alignItems: 'center', minWidth: 980 }}>
                <input value={l.description} onChange={(e) => upd(l.id, { description: e.target.value })} placeholder="Cost code" disabled={ro} style={{ ...inp, textAlign: 'left' }} />
                <input value={l._b} onChange={(e) => upd(l.id, { _b: e.target.value })} disabled={ro} style={inp} />
                <input value={l._ch} onChange={(e) => upd(l.id, { _ch: e.target.value })} disabled={ro} style={inp} />
                {/* Committed — auto from POs, optional override */}
                <div>
                  <input value={l.comOv !== null ? l.comOv : d(l.comAuto)} onChange={(e) => upd(l.id, { comOv: e.target.value })} disabled={ro}
                    style={{ ...inp, borderColor: l.comOv !== null ? GOLD : LINE }} />
                  {!ro && (l.comOv !== null
                    ? <button onClick={() => upd(l.id, { comOv: null })} title="Reset to auto" style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 0' }}><ArrowUUpLeft size={11} weight="bold" />Override · auto {usd(l.comAuto)}</button>
                    : <span style={{ fontSize: 12, color: DIM }}>{l.manual ? 'Manual line' : 'Auto · POs'}</span>)}
                </div>
                {/* Actual — auto from invoices, optional override */}
                <div>
                  <input value={l.actOv !== null ? l.actOv : d(l.actAuto)} onChange={(e) => upd(l.id, { actOv: e.target.value })} disabled={ro}
                    style={{ ...inp, borderColor: l.actOv !== null ? GOLD : LINE }} />
                  {!ro && (l.actOv !== null
                    ? <button onClick={() => upd(l.id, { actOv: null })} title="Reset to auto" style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 0' }}><ArrowUUpLeft size={11} weight="bold" />Override · auto {usd(l.actAuto)}</button>
                    : <span style={{ fontSize: 12, color: DIM }}>{l.manual ? 'Manual line' : 'Auto · invoices'}</span>)}
                </div>
                {cell(rr.projectedFinalCents)}{cell(rr.varianceCents, true)}
                {ro ? <span /> : <button onClick={() => removeRow(l.id)} title="Remove line" style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', display: 'inline-flex', justifyContent: 'center' }}><X size={13} weight="bold" /></button>}
              </div>
            );
          })}
          {!viewingId && <div style={{ padding: '10px 16px' }}><button onClick={addRow} style={toolBtn} className="pmBtn"><Plus size={13} weight="bold" />Add Cost Code</button></div>}
        </div>
      </SectionCard>

      {/* sources footnote */}
      {(sources.committed || sources.actual) && !viewingId && (
        <div style={{ marginTop: 12, fontSize: 12, color: DIM, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Sparkle size={12} color="var(--text-secondary)" weight="fill" />
          <span>Committed: {sources.committed}. Actual: {sources.actual}. Budget: {sources.budget}.</span>
        </div>
      )}
    </PremiumSurface>
  );
}
