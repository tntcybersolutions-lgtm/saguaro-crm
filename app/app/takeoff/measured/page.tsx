'use client';
/**
 * Measured Takeoff (web) — the deterministic, measurement-driven estimator.
 * Add conditions; the shared lib/takeoff engine explodes each into a full priced
 * bill and rolls up LIVE — same engine + byte-identical numbers as iOS.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useProjects } from '@/lib/hooks/useProjects';
import { explodeTakeoff, rollupTakeoff, ASSEMBLIES, type Condition, type MeasureKind, type Pt, type RateOverrides } from '@/lib/takeoff';
import { buildEstimateReportHtml } from '@/lib/takeoff/estimate-report';
import { BUILDING_TEMPLATES, conditionsForTemplate, templateById } from '@/lib/takeoff/templates';
import { estimateConfidence } from '@/lib/takeoff/confidence';
import { calibrationSanity } from '@/lib/takeoff/measure';
import { scopedFieldIcon } from '@/lib/field-icons';
import { Buildings, Warehouse, Storefront, ForkKnife, Tooth, HouseLine, Hammer, FileDashed, Question, Ruler, FilePdf, Receipt, CheckCircle, ArrowRight, ArrowLeft, Stack, PencilSimpleLine, FileCsv, Cube, Table, WarningCircle, MagicWand, Polygon, FileArrowUp, ClipboardText, ArrowSquareOut, XCircle, SealCheck, Sparkle, GitDiff, Note, Package, Path, Lightning, CircleNotch, TrendUp, TrendDown, Printer, X as IconX, type Icon } from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import type { TracerCondition, PersistedSheet } from './PlanTracer';
import { diffTakeoffs, type RevisionDiff, type RevisionLine } from '@/lib/takeoff/revision-diff';
import { importCsv, rowsToImport, type ImportedItem } from '@/lib/takeoff/import-quantities';
import { parseDxf, dxfLinearFeet, insUnitsToFeet } from '@/lib/takeoff/dxf';
import { humanError } from '@/lib/errors';
import { PremiumSurface, ModuleHero, SectionCard, ghostButtonStyle } from '@/components/ui/premium';

// W-16: the 1,160-line PlanTracer workspace (canvas tracer) loads only when the user opens
// the tracer — out of this route's first-paint chunk (same lazy pattern as pdfjs at PlanTracer.tsx:430).
// Targeted-measure contract with the tracer: while `targetConditionId` is set, finishing a draft
// SETS that condition's value via `onSetConditionValue` instead of appending a new condition.
// Declared as an intersection here so the page and the tracer-side implementation land independently.
type TracerTargetingProps = {
  targetConditionId?: string;
  onSetConditionValue?: (conditionId: string, value: number, meta?: unknown) => void;
};
const PlanTracer = dynamic<React.ComponentProps<(typeof import('./PlanTracer'))['default']> & TracerTargetingProps>(() => import('./PlanTracer'), { ssr: false });

const BG = '#0a0a0a', PANEL = '#161b22', LINE = 'rgba(255,255,255,0.09)', GOLD = '#F59E0B';
const TEXT = '#e6edf3', DIM = '#8b949e', GREEN = '#34D399', RED = '#f87171';
const uid = () => Math.random().toString(36).slice(2, 9);
// Bespoke "Crafted Two-Tone" icon (steel + gold) — the approved family, never emoji glyphs.
function Ic({ name, s = 20, k = '' }: { name: string; s?: number; k?: string }) {
  const svg = scopedFieldIcon(name, `tk_${name}_${k}`).replace('width="30" height="30"', `width="${s}" height="${s}"`);
  return <span style={{ display: 'inline-flex', width: s, height: s, flexShrink: 0, verticalAlign: 'middle' }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
// Building-type template → phosphor icon (professional line-art, never emoji).
const TPL_ICON: Record<string, Icon> = { office_ti: Buildings, warehouse: Warehouse, retail_shell: Storefront, restaurant_ti: ForkKnife, medical_dental: Tooth, multifamily_unit: HouseLine, tenant_demo: Hammer };
const WIZ_STEPS = ['Start', 'Plans', 'Scale', 'Estimate'];

// Gold estimate-confidence ring (deterministic score 0-100, green→gold→red by band).
function ConfidenceRing({ score, size = 68 }: { score: number; size?: number }) {
  const stroke = 7, rad = (size - stroke) / 2, circ = 2 * Math.PI * rad;
  const s = Math.max(0, Math.min(100, score));
  const off = circ * (1 - s / 100);
  const col = s >= 75 ? GREEN : s >= 45 ? GOLD : RED;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke={col} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .45s ease, stroke .45s ease' }} />
      <text x={size / 2} y={size / 2} dominantBaseline="central" textAnchor="middle" fill={TEXT} fontSize={18} fontWeight={800} style={{ fontVariantNumeric: 'tabular-nums' }}>{s}</text>
    </svg>
  );
}

const KINDS: { k: MeasureKind; label: string; unit: string }[] = [{ k: 'area', label: 'Area', unit: 'SF' }, { k: 'linear', label: 'Linear', unit: 'LF' }, { k: 'count', label: 'Count', unit: 'EA' }];
const usd = (c: number) => '$' + Math.round(c / 100).toLocaleString();
const escapeHtml = (s: string) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] as string));
const asmList = (kind: MeasureKind) => Object.values(ASSEMBLIES).filter((a) => a.appliesTo === kind);
// Assembly (symbol) library — the full priced catalog, browsable like PlanSwift/STACK. Each
// entry carries its measure kind, unit, dominant trade and CSI division for search + grouping.
const LIB_UNIT = { area: 'SF', linear: 'LF', count: 'EA' } as const;
const LIBRARY = Object.values(ASSEMBLIES).map((a) => {
  const counts: Record<string, number> = {};
  for (const c of a.components) counts[c.trade] = (counts[c.trade] || 0) + 1;
  const trade = Object.entries(counts).sort((x, y) => y[1] - x[1])[0]?.[0] || 'General';
  return { id: a.id, name: a.name, kind: a.appliesTo, unit: LIB_UNIT[a.appliesTo], trade, div: (a.components[0]?.csi || '').slice(0, 2), parts: a.components.length };
});
const LIBRARY_TRADES = Array.from(new Set(LIBRARY.map((l) => l.trade))).sort();
/** Fallback confidence when the AI response carries none: a mapped assembly + a plausible qty reads higher. */
const proxyConfidence = (hasAsm: boolean, count: number): number => {
  let s = 50;
  if (hasAsm) s += 25;                                   // matched a real assembly → we can price it
  if (count >= 1 && count <= 500) s += 15;               // plausible sheet count
  else if (count > 500) s -= 10;                         // suspiciously large → flag for review
  if (!(count > 0)) s -= 40;                             // zero/negative qty → almost certainly bad
  return Math.max(5, Math.min(95, Math.round(s)));
};
const confColor = (c: number) => (c >= 70 ? GREEN : c >= 45 ? GOLD : RED);
type RevChange = { type: string; trade: string; description: string; location: string; costImpact: string; confidence: number | null };
const impactColor = (i: string) => i === 'increase' ? '#f87171' : i === 'decrease' ? '#34D399' : '#8b949e';

// ── document-type importers (CSV/Excel + DXF) ──
/** exact SF of a closed DXF polyline: shoelace on its pts × (ft/unit)². */
const dxfPolySF = (pts: { x: number; y: number }[], ftPerUnit: number): number => {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let k = 0; k < pts.length; k++) { const q = pts[(k + 1) % pts.length]; a += pts[k].x * q.y - q.x * pts[k].y; }
  return Math.round(Math.abs(a / 2) * ftPerUnit * ftPerUnit * 100) / 100;
};
const DXF_UNIT_LABEL: Record<number, string> = { 0: 'unitless (assumed feet)', 1: 'inches', 2: 'feet', 4: 'millimeters', 5: 'centimeters', 6: 'meters' };
type QtyRow = ImportedItem & { assemblyId: string };  // '' = unmatched, won't import until mapped
type QtyReview = { fileName: string; rows: QtyRow[]; warnings: string[] };
type DxfReview = { fileName: string; insUnits: number | null; ftPerUnit: number; areas: number[]; totalAreaSF: number; linearLF: number; circleCount: number; arcCount: number; entityCount: number; warnings: string[] };
// ── spec-aware cross-check (counts vs the project's scheduled quantities) ──
type SpecSource = { n: number; source: string; sourceType: string; recordId?: string; route?: string };
type SpecRow = { label: string; counted: number; scheduled: number | null; status: 'match' | 'mismatch' | 'not_found'; note?: string; source: SpecSource | null };
// ── AI-proposes / you-confirm review queue (count-symbols output routed through here) ──
type AiCount = { symbol?: string; count?: number; assembly?: string | null; csi?: string; confidence?: number | null };
type ReviewItem = { id: string; label: string; count: number; assemblyId: string; csi: string; confidence: number; aiConf: boolean; accept: boolean };

function MeasuredTakeoffInner() {
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get('projectId') || '';
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState('Measured takeoff');
  const [conditions, setConditions] = useState<TracerCondition[]>([]);
  const [oh, setOh] = useState('10'); const [pr, setPr] = useState('8'); const [cont, setCont] = useState('5'); const [bsf, setBsf] = useState('');
  // full markup stack + regional index (all optional; default 0 → prior behavior)
  const [taxP, setTaxP] = useState(''); const [burdenP, setBurdenP] = useState(''); const [gcP, setGcP] = useState(''); const [bondP, setBondP] = useState('');
  const [regMult, setRegMult] = useState(''); const [regLabel, setRegLabel] = useState('');
  const [aaceClass, setAaceClass] = useState<1 | 2 | 3 | 4 | 5>(3);
  // editable proposal fine print
  const [allowancesTxt, setAllowancesTxt] = useState(''); const [exclusionsTxt, setExclusionsTxt] = useState(''); const [clarifTxt, setClarifTxt] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [msg, setMsg] = useState(''); const [saving, setSaving] = useState(false);

  // assembly (symbol) library
  const [libOpen, setLibOpen] = useState(false);
  const [libQ, setLibQ] = useState('');
  const [libKind, setLibKind] = useState<'all' | MeasureKind>('all');
  const addFromLibrary = (id: string) => {
    const a = ASSEMBLIES[id]; if (!a) return;
    setConditions((cs) => [...cs, { id: uid(), name: a.name, kind: a.appliesTo, value: 0, assemblyId: a.id }]);
    setMsg(`+ ${a.name} — enter a quantity or trace it on the plan`);
  };
  // add form
  const [cName, setCName] = useState(''); const [cKind, setCKind] = useState<MeasureKind>('area');
  const [cVal, setCVal] = useState(''); const [cH, setCH] = useState(''); const [cT, setCT] = useState('');
  const [cAsm, setCAsm] = useState(asmList('area')[0]?.id || '');
  // advanced (optional) — typical instances, location breakdown, note/assumption, add/deduct alternate
  const [advOpen, setAdvOpen] = useState(false);
  const [cInst, setCInst] = useState(''); const [cBldg, setCBldg] = useState(''); const [cLevel, setCLevel] = useState(''); const [cZone, setCZone] = useState('');
  const [cNote, setCNote] = useState(''); const [cAlt, setCAlt] = useState(''); const [cAltType, setCAltType] = useState<'add' | 'deduct'>('add');
  const [cPts, setCPts] = useState<Pt[] | null>(null);
  // tracer (full workspace lives in <PlanTracer/>)
  const [tracing, setTracing] = useState(false);
  // targeted measure: while set, finishing a draft in the tracer SETS this condition's value (no append)
  const [targetConditionId, setTargetConditionId] = useState('');
  // per-row qty edit buffers so "12." keeps its dot mid-keystroke; a buffer clears on blur
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const setCondQty = (id: string, raw: string) => {
    setQtyDraft((m) => ({ ...m, [id]: raw }));
    const n = Number(raw.replace(/,/g, '').trim());
    if (!Number.isFinite(n) || n < 0) return;
    setConditions((cs) => cs.map((c) => (c.id === id ? { ...c, value: n, ...(n > 0 ? { measured: 'manual' as const } : {}) } : c)));
  };
  const commitQtyDraft = (id: string) => setQtyDraft((m) => { const { [id]: _drop, ...rest } = m; return rest; });
  const traceCondition = (id: string) => { setTargetConditionId(id); setTracing(true); };
  const onSetConditionValue = (conditionId: string, value: number, meta?: unknown) => {
    const m = (meta && typeof meta === 'object' ? meta : {}) as { points?: Pt[] };
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) return;
    setConditions((cs) => cs.map((c) => (c.id === conditionId
      ? { ...c, value: v, measured: 'traced' as const, ...(Array.isArray(m.points) && m.points.length ? { points: m.points } : {}) }
      : c)));
    const nm = conditions.find((c) => c.id === conditionId)?.name || 'Condition';
    setTargetConditionId('');
    setMsg(`✓ ${nm} measured on the plan — quantity set to ${v}.`);
  };
  const [planUrl, setPlanUrl] = useState('');
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [ppf, setPpf] = useState(0);

  const [rates, setRates] = useState<RateOverrides>({});
  const [tenantRateCount, setTenantRateCount] = useState(0);
  // first-takeoff wizard + template picker
  const [activeTemplate, setActiveTemplate] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizStep, setWizStep] = useState(0);
  const blueprintInputRef = useRef<HTMLInputElement>(null);
  const { projects: liveProjects } = useProjects();
  // Deep-link: ?projectId= wins over "first project" whenever it exists in the list.
  useEffect(() => { const ps = liveProjects; setProjects(ps); if (ps[0]) setProjectId((prev) => prev || ((urlProjectId && ps.some((p) => p.id === urlProjectId)) ? urlProjectId : ps[0].id)); }, [liveProjects, urlProjectId]);
  useEffect(() => { fetch('/api/takeoff/cost-rates').then((r) => r.json()).then((d) => { if (d.rates) { setRates(d.rates); setTenantRateCount(Object.keys(d.rates).length); } }).catch(() => {}); }, []);
  // first visit → auto-open the guided wizard (re-openable from the "?" button any time)
  useEffect(() => { try { if (!localStorage.getItem('saguaro_takeoff_wizard_v1')) { setWizStep(0); setWizardOpen(true); } } catch { /* SSR / privacy mode */ } }, []);
  const closeWizard = () => { setWizardOpen(false); try { localStorage.setItem('saguaro_takeoff_wizard_v1', '1'); } catch { /* */ } };
  const openWizard = () => { setWizStep(0); setWizardOpen(true); };

  // ── Drawings → Takeoff promotion handoff (B2) ──
  // The drawings viewer writes {projectId, source:'drawings', conditions:[…]} to this
  // sessionStorage key and routes here. Read + CLEAR on mount (single-use payload; the
  // read-then-remove also makes StrictMode's double-invoke a no-op), re-id every condition
  // so promoted rows never collide with existing ids, and land the user on the
  // conditions/pricing card so Unassigned rows are visibly awaiting an assembly.
  const promotedCardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem('saguaro_promote_takeoff_v1'); if (raw != null) sessionStorage.removeItem('saguaro_promote_takeoff_v1'); } catch { return; }
    if (!raw) return;
    try {
      const p = JSON.parse(raw) as { projectId?: string; source?: string; conditions?: TracerCondition[] };
      const incoming = Array.isArray(p.conditions)
        ? p.conditions.filter((c) => c && typeof c === 'object' && (c.kind === 'area' || c.kind === 'linear' || c.kind === 'count') && Number.isFinite(Number(c.value)) && Number(c.value) >= 0)
        : [];
      if (!incoming.length) return;
      // Project handshake: a hard mismatch with a URL-pinned project is ignored; otherwise
      // adopt the payload's project when the page hasn't settled on one yet.
      const pid = typeof p.projectId === 'string' ? p.projectId : '';
      if (pid && urlProjectId && pid !== urlProjectId) return;
      if (pid) setProjectId((prev) => prev || pid);
      setConditions((cs) => [...cs, ...incoming.map((c) => ({ ...c, id: uid() }))]);
      setWizardOpen(false);   // never cover freshly promoted rows with the first-visit wizard
      setMsg(`${incoming.length} measurement${incoming.length === 1 ? '' : 's'} promoted from Drawings`);
      setTimeout(() => promotedCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    } catch { /* malformed payload — already cleared, ignore */ }
    // mount-only by design: the key is single-use and cleared on first read
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Multi-sheet register persistence (gap 3): PlanTracer lifts its sheet metadata here on
  // every change so closing/reopening the tracer within the page session keeps the register.
  const [tracerSheets, setTracerSheets] = useState<PersistedSheet[]>([]);

  // Fixed bottom estimate bar: position:sticky dies inside PremiumSurface's overflow:hidden, so the
  // bar is position:fixed, aligned to the content column (sidebar-aware) by measuring the page div.
  const pageRef = useRef<HTMLDivElement>(null);
  const [barRect, setBarRect] = useState({ left: 0, width: 0 });
  useEffect(() => {
    const el = pageRef.current; if (!el) return;
    const upd = () => {
      const b = el.getBoundingClientRect();
      setBarRect((p) => (Math.abs(p.left - b.left) < 0.5 && Math.abs(p.width - b.width) < 0.5 ? p : { left: b.left, width: b.width }));
    };
    upd();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(upd) : null;
    ro?.observe(el);
    const main = el.closest('.main-content-area');   // sidebar collapse/expand changes this width
    if (main) ro?.observe(main);
    window.addEventListener('resize', upd);
    return () => { ro?.disconnect(); window.removeEventListener('resize', upd); };
  }, []);

  const opts = useMemo(() => ({
    overheadPct: +oh || 0, profitPct: +pr || 0, contingencyPct: +cont || 0, buildingSf: +bsf || undefined,
    salesTaxPct: +taxP || 0, laborBurdenPct: +burdenP || 0, generalConditionsPct: +gcP || 0, bondPct: +bondP || 0,
    regionMultiplier: +regMult > 0 ? +regMult : undefined, regionLabel: regLabel.trim() || undefined, rates,
  }), [oh, pr, cont, bsf, taxP, burdenP, gcP, bondP, regMult, regLabel, rates]);
  // PERF — split the engine so a markup keystroke doesn't re-explode geometry. STAGE 1 (expensive
  // explode) memoizes on the rate inputs only [conditions, rates, regMult]; STAGE 2 (cheap markup
  // rollup) reruns on any opts change. Byte-identical to computeTakeoff (proven). Typing OH/profit/
  // tax now updates the sell price instantly instead of re-pricing every condition per keystroke.
  const exploded = useMemo(
    () => explodeTakeoff(conditions, { rates, regionMultiplier: +regMult > 0 ? +regMult : undefined }),
    [conditions, rates, regMult],
  );
  const r = useMemo(() => rollupTakeoff(exploded, opts), [exploded, opts]);

  // live estimate-confidence ring — deterministic, no AI (lib/takeoff/confidence)
  const confidence = useMemo(() => {
    const hasScale = ppf > 0;
    const scaleSane = hasScale && (dims.w > 0 ? calibrationSanity(ppf, dims.w, dims.h).ok : true);
    return estimateConfidence({ hasScale, scaleSane, conditions, tenantRateCount, sanityFlags: r.sanity });
  }, [ppf, dims.w, dims.h, conditions, tenantRateCount, r.sanity]);

  // ── building-type templates: drop a curated condition set (value 0 → "needs measurement") ──
  const dropTemplate = (id: string) => {
    const tc = conditionsForTemplate(id);
    if (!tc.length) return;
    const drop: TracerCondition[] = tc.map((c) => ({ id: uid(), name: c.name, kind: c.kind, value: 0, assemblyId: c.assemblyId, ...(c.heightFt ? { heightFt: c.heightFt } : {}), ...(c.thicknessIn ? { thicknessIn: c.thicknessIn } : {}) }));
    setConditions((cs) => [...cs, ...drop]);
    setActiveTemplate(id);
    const t = templateById(id);
    if (t && name === 'Measured takeoff') setName(t.name);
    setMsg(`+ ${t?.name}: ${drop.length} conditions added — trace each on the plan to price it.`);
  };
  const chooseBlank = () => {
    if (conditions.length && !confirm('Clear all current conditions and start blank?')) return;
    setConditions([]); setActiveTemplate('blank'); setMsg('Blank takeoff — add conditions or open the Plan Tracer.');
  };

  const addCond = () => {
    const v = parseFloat(cVal); if (!cAsm || !(v > 0)) return;
    const asm = ASSEMBLIES[cAsm];
    setConditions((cs) => [...cs, {
      id: uid(), name: cName.trim() || asm.name, kind: cKind, value: v, assemblyId: cAsm,
      ...(+cH > 0 ? { heightFt: +cH } : {}), ...(+cT > 0 ? { thicknessIn: +cT } : {}), ...(cPts && cPts.length ? { points: cPts } : {}),
      ...(+cInst > 1 ? { instanceCount: Math.floor(+cInst) } : {}),
      ...(cBldg.trim() ? { building: cBldg.trim() } : {}), ...(cLevel.trim() ? { level: cLevel.trim() } : {}), ...(cZone.trim() ? { zone: cZone.trim() } : {}),
      ...(cNote.trim() ? { note: cNote.trim() } : {}),
      ...(cAlt.trim() ? { alternate: cAlt.trim(), alternateType: cAltType } : {}),
    }]);
    setCName(''); setCVal(''); setCH(''); setCT(''); setCPts(null);
    setCInst(''); setCNote(''); setCAlt('');   // keep location + altType sticky for rapid entry of the same area
  };

  // ── on-plan tracer (the full workspace is <PlanTracer/>; it shares the conditions state) ──
  const openTracer = () => setTracing(true);
  const setPlan = (url: string, w: number, h: number) => { setPlanUrl(url); setDims({ w, h }); };

  // ── plan-reading AI: count symbols + read scale + auto-calibrate ──
  // AI PROPOSES → the estimator CONFIRMS. Counts never auto-land; they open the review queue below.
  const [counting, setCounting] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<null | { source: string; items: ReviewItem[] }>(null);
  const countSymbols = async (f: File | undefined) => {
    if (!f) { setMsg('Pick a plan image'); return; }
    setCounting(true); setMsg('Counting symbols…');
    try {
      const { b64, w, h } = await new Promise<{ b64: string; w: number; h: number }>((res, rej) => {
        const rd = new FileReader();
        rd.onload = () => { const du = rd.result as string; const img = new Image(); img.onload = () => res({ b64: du, w: img.naturalWidth, h: img.naturalHeight }); img.onerror = rej; img.src = du; };
        rd.onerror = rej; rd.readAsDataURL(f);
      });
      const r2 = await fetch('/api/takeoff/count-symbols', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: b64, imgW: w, imgH: h }) });
      const d = await r2.json();
      if (d.error) { console.error('count-symbols error', d.error); setMsg(humanError(d.error, "The AI couldn't read that plan. Try a clearer image or a flattened PDF.")); setCounting(false); return; }
      if (d.pxPerFt > 0) { setPpf(d.pxPerFt); setPlanUrl(b64); setDims({ w, h }); }  // pre-calibrate the tracer with the read scale + this plan
      const counts: AiCount[] = d.counts || [];
      if (!counts.length) { setMsg('AI found no countable symbols on that sheet.'); setCounting(false); return; }
      // Build the review queue — every proposal (mapped + unmapped) surfaces with a confidence read; nothing is added yet.
      const items: ReviewItem[] = counts.map((c) => {
        const hasAsm = !!(c.assembly && ASSEMBLIES[c.assembly]);
        const aiConf = typeof c.confidence === 'number' ? Math.max(0, Math.min(100, Math.round(c.confidence))) : null;
        const count = Math.round(+(c.count || 0)) || 0;
        const confidence = aiConf != null ? aiConf : proxyConfidence(hasAsm, count);
        return { id: uid(), label: String(c.symbol || 'Item'), count, assemblyId: hasAsm ? (c.assembly as string) : '', csi: c.csi || '', confidence, aiConf: aiConf != null, accept: hasAsm && confidence >= 70 && count > 0 };
      });
      const scaleTxt = d.scale?.text ? ` · scale ${d.scale.text}` : '';
      const calibTxt = d.pxPerFt ? ` · auto-scale ${d.pxPerFt} px/ft` : '';
      setReviewQueue({ source: f.name || 'sheet', items });
      setMsg(`AI proposed ${items.length} count${items.length === 1 ? '' : 's'} — review & confirm before they're added${scaleTxt}${calibTxt}`);
    } catch (e) { console.error(e); setMsg(humanError(e)); }
    setCounting(false);
  };
  // Commit only the ACCEPTED, assembly-mapped items from the review queue into conditions.
  const reviewAddable = reviewQueue ? reviewQueue.items.filter((it) => it.accept && it.assemblyId && ASSEMBLIES[it.assemblyId]).length : 0;
  const commitReview = () => {
    if (!reviewQueue) return;
    const add = reviewQueue.items.filter((it) => it.accept && it.assemblyId && ASSEMBLIES[it.assemblyId]);
    if (!add.length) { setMsg('Accept at least one item and map it to an assembly first.'); return; }
    setConditions((cs) => [...cs, ...add.map((it) => ({ id: uid(), name: it.label, kind: 'count' as MeasureKind, value: it.count, assemblyId: it.assemblyId }))]);
    setActiveTemplate('');
    setMsg(`✓ Added ${add.length} confirmed count condition${add.length === 1 ? '' : 's'} from ${reviewQueue.source} — priced live below.`);
    setReviewQueue(null);
  };
  const patchReview = (id: string, patch: Partial<ReviewItem>) => setReviewQueue((q) => q ? { ...q, items: q.items.map((it) => it.id === id ? { ...it, ...patch } : it) } : q);

  // ── revision compare (old rev vs new rev) ──
  const [comparing, setComparing] = useState(false);
  const [revA, setRevA] = useState(''); const [revB, setRevB] = useState('');
  const [revBusy, setRevBusy] = useState(false);
  const [revResult, setRevResult] = useState<null | { summary: string; netScope: string; changes: RevChange[] }>(null);
  const pickRev = (which: 'A' | 'B', f?: File) => {
    if (!f) return; const rd = new FileReader(); rd.onload = () => { const du = rd.result as string; if (which === 'A') setRevA(du); else setRevB(du); }; rd.readAsDataURL(f);
  };
  const runCompare = async () => {
    if (!revA || !revB) { setMsg('Upload both revisions'); return; }
    setRevBusy(true); setRevResult(null);
    try {
      const r2 = await fetch('/api/takeoff/compare-revisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageA: revA, imageB: revB }) });
      const d = await r2.json();
      if (d.error) { console.error('compare-revisions error', d.error); setMsg(humanError(d.error, "The AI couldn't compare those revisions. Try clearer images.")); setRevBusy(false); return; }
      setRevResult({ summary: d.summary, netScope: d.netScope, changes: d.changes || [] });
    } catch (e) { console.error(e); setMsg(humanError(e)); }
    setRevBusy(false);
  };

  // ── PRICED revision compare (prior saved takeoff vs the current one, priced client-side by the engine) ──
  type PriorTakeoff = { id: string; name: string; created_at: string; conditions: Condition[]; sell_price?: number };
  const [priorList, setPriorList] = useState<PriorTakeoff[]>([]);
  const [priorId, setPriorId] = useState('');
  const [priorConditions, setPriorConditions] = useState<Condition[] | null>(null);
  // pull the project's prior saved takeoffs so they can be picked as a baseline (each row carries its stored conditions)
  useEffect(() => {
    setPriorList([]); setPriorId(''); setPriorConditions(null);
    if (!projectId) return;
    fetch(`/api/takeoff?projectId=${projectId}&limit=50`).then((r) => r.json()).then((d) => {
      const rows: PriorTakeoff[] = (d.data || []).filter((t: PriorTakeoff) => Array.isArray(t.conditions) && t.conditions.length);
      setPriorList(rows);
    }).catch(() => setPriorList([]));
  }, [projectId]);
  const pickPrior = (id: string) => {
    setPriorId(id);
    const t = priorList.find((x) => x.id === id);
    setPriorConditions(t && Array.isArray(t.conditions) ? t.conditions : null);
    setCoResult(null); setCoMsg('');
  };
  // the diff is PURE + client-side — same engine, same markups as the live estimate
  const revDiff = useMemo<RevisionDiff | null>(() => {
    if (!priorConditions || !priorConditions.length) return null;
    try { return diffTakeoffs(priorConditions, conditions as Condition[], opts); } catch { return null; }
  }, [priorConditions, conditions, opts]);
  const unitFromAsm = (asmId: string) => { const k = ASSEMBLIES[asmId]?.appliesTo; return k === 'count' ? 'EA' : k === 'area' ? 'SF' : k === 'linear' ? 'LF' : ''; };
  const netStr = (cents: number) => (cents >= 0 ? '+' : '−') + '$' + Math.abs(Math.round(cents / 100)).toLocaleString();
  const deltaColor = (cents: number) => (cents > 0 ? GREEN : cents < 0 ? RED : DIM);

  // ── DRAFT CHANGE ORDER from the priced diff → POSTs to the real /api/change-orders/create; Print CO = printable fallback ──
  const [coBusy, setCoBusy] = useState(false);
  const [coMsg, setCoMsg] = useState('');
  const [coResult, setCoResult] = useState<null | { coNumber: number | null; id: string | null }>(null);
  const coScopeLines = (changed: RevisionLine[]) => changed.map((l) => {
    const verb = l.status === 'added' ? 'Add' : l.status === 'removed' ? 'Remove' : 'Revise';
    const u = unitFromAsm(l.assemblyId);
    const qty = l.status === 'changed' ? `${l.oldValue} → ${l.newValue} ${u}` : l.status === 'added' ? `${l.newValue} ${u}` : `${l.oldValue} ${u}`;
    return { verb, name: l.name, qty: qty.trim(), delta: netStr(l.deltaCents) };
  });
  const draftChangeOrder = async () => {
    if (!revDiff) return;
    if (!projectId) { setCoMsg('Open from a project to file a change order.'); return; }
    const changed = revDiff.lines.filter((l) => l.status !== 'unchanged');
    if (!changed.length) { setCoMsg('No scope changes to file.'); return; }
    const priorName = priorList.find((p) => p.id === priorId)?.name || 'prior revision';
    const scope = coScopeLines(changed);
    const description = `Change order drafted from measured-takeoff revision compare (baseline: ${priorName}).\n\n`
      + scope.map((s) => `${s.verb}: ${s.name} (${s.qty}) ${s.delta}`).join('\n')
      + `\n\nNet change: ${netStr(revDiff.netDeltaCents)}  (was ${usd(revDiff.oldSellCents)} → now ${usd(revDiff.newSellCents)}).`;
    setCoBusy(true); setCoMsg(''); setCoResult(null);
    try {
      const res = await fetch('/api/change-orders/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, title: `Scope revision — ${name || 'Measured takeoff'}`, description, reason: 'Plan revision', costImpact: Math.round(revDiff.netDeltaCents) / 100 }),
      });
      const d = await res.json();
      if (d.error || !d.success) { console.error('file CO failed', res.status, d.error); setCoMsg(humanError(d.error, "Couldn't file the change order. Please try again.")); setCoBusy(false); return; }
      const co = (d.changeOrder || {}) as { co_number?: number; id?: string };
      setCoResult({ coNumber: co.co_number ?? null, id: co.id ?? null });
    } catch (e) { console.error(e); setCoMsg(humanError(e, "Couldn't file the change order. Please try again.")); }
    setCoBusy(false);
  };
  const printChangeOrder = () => {
    if (!revDiff) return;
    const changed = revDiff.lines.filter((l) => l.status !== 'unchanged');
    if (!changed.length) { setCoMsg('No scope changes to print.'); return; }
    const proj = projects.find((p) => p.id === projectId);
    const priorName = priorList.find((p) => p.id === priorId)?.name || 'prior revision';
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const rows = coScopeLines(changed).map((s) => `<tr><td class="v">${s.verb}</td><td>${escapeHtml(s.name)}</td><td class="q">${escapeHtml(s.qty)}</td><td class="d" style="color:${s.delta.startsWith('+') ? '#0a7d3c' : '#b42318'}">${s.delta}</td></tr>`).join('');
    const net = revDiff.netDeltaCents;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Change Order</title>
<style>*{box-sizing:border-box}body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:0;padding:40px}
h1{font-size:26px;margin:0 0 2px;letter-spacing:-.02em}.sub{color:#666;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700}
.brand{color:#B8860B;font-weight:800}.meta{margin:22px 0;border:1px solid #e5e5e5;border-radius:10px;padding:14px 16px;display:grid;grid-template-columns:1fr 1fr;gap:8px 22px;font-size:13px}
.meta b{color:#444;font-weight:600}table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
th{text-align:left;padding:8px 10px;background:#f6f6f4;border-bottom:2px solid #e5e5e5;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#666}
td{padding:8px 10px;border-bottom:1px solid #eee}td.v{font-weight:700;color:#444;white-space:nowrap}td.q{color:#555;white-space:nowrap}td.d{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.net{margin-top:18px;display:flex;justify-content:space-between;align-items:center;border:2px solid #111;border-radius:12px;padding:16px 18px}
.net .lbl{font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#666;font-weight:700}
.net .amt{font-size:30px;font-weight:800;font-variant-numeric:tabular-nums;color:${net >= 0 ? '#0a7d3c' : '#b42318'}}
.net .was{font-size:12px;color:#666;text-align:right;margin-top:2px}.foot{margin-top:26px;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:12px}</style></head>
<body><div class="sub"><span class="brand">Saguaro Control Systems</span> · Control Every Project. Deliver Every Promise.</div>
<h1>Change Order</h1>
<div class="meta"><div><b>Project:</b> ${escapeHtml(name || proj?.name || 'Measured Takeoff')}</div><div><b>Date:</b> ${today}</div>
<div><b>Baseline revision:</b> ${escapeHtml(priorName)}</div><div><b>Line changes:</b> ${changed.length}</div></div>
<table><thead><tr><th>Action</th><th>Scope item</th><th>Quantity</th><th>Cost impact</th></tr></thead><tbody>${rows}</tbody></table>
<div class="net"><div><div class="lbl">Net change to contract</div></div><div><div class="amt">${netStr(net)}</div><div class="was">was ${usd(revDiff.oldSellCents)} → now ${usd(revDiff.newSellCents)}</div></div></div>
<div class="foot">Priced deterministically by the Saguaro takeoff engine — added scope, revised quantities, and credits reconciled against the baseline revision. This document is a draft for review and is not a contract amendment until executed by both parties.</div></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { setCoMsg('Allow pop-ups to print the change order.'); return; }
    w.document.write(html); w.document.close();
    setTimeout(() => { try { w.print(); } catch { /* */ } }, 400);
  };

  // ── ONE-TAP CHAIN: saved takeoff → Sage auto-docs (bid packages + jackets + SOV/pay app) via the existing SSE route ──
  const [savedTakeoffId, setSavedTakeoffId] = useState('');
  const [chainBusy, setChainBusy] = useState(false);
  const [chainPct, setChainPct] = useState(0);
  const [chainMsg, setChainMsg] = useState('');
  const [chainResult, setChainResult] = useState<null | { packagesCreated: number; jacketsGenerated: number; sovCreated: boolean; projectId: string }>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareExp, setShareExp] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  // any edit/import/AI change to conditions OR the markup stack (OH/profit/tax/region/rates…) invalidates
  // a prior save — share/bid-package/revision buttons must never operate on a stale saved takeoff
  useEffect(() => { setSavedTakeoffId(''); setShareUrl(''); setShareExp(''); setShareCopied(false); }, [conditions, opts]);

  // Mint (or reuse) a read-only, token-gated estimate URL a GC can send a client. Saves first if needed.
  const shareEstimate = async () => {
    if (!conditions.length) { setMsg('Add a condition first'); return; }
    setShareBusy(true); setMsg('');
    let id: string | null = savedTakeoffId;
    if (!id) { id = await save(); if (!id) { setShareBusy(false); return; } }
    try {
      const res = await fetch(`/api/takeoff/share?id=${id}`);
      const d = await res.json();
      if (d.error) { setMsg(`Share: ${d.error}`); }
      else {
        setShareUrl(d.url || ''); setShareExp(d.expiresAt || '');
        try { await navigator.clipboard.writeText(d.url); setShareCopied(true); setMsg('Read-only estimate link copied — valid 30 days, revocable'); }
        catch { setShareCopied(false); setMsg('Read-only estimate link ready'); }
      }
    } catch (e) { console.error(e); setMsg(humanError(e)); }
    setShareBusy(false);
  };
  const revokeShare = async () => {
    const id = savedTakeoffId; if (!id) { setShareUrl(''); return; }
    setShareBusy(true);
    try { await fetch(`/api/takeoff/share?id=${id}`, { method: 'DELETE' }); setShareUrl(''); setShareExp(''); setShareCopied(false); setMsg('Share link revoked — the previous URL no longer works'); }
    catch (e) { console.error(e); setMsg(humanError(e, "Couldn't revoke the share link. Please try again.")); }
    setShareBusy(false);
  };
  const runChain = async () => {
    let id: string | null = savedTakeoffId;
    if (!id) {
      if (!conditions.length) { setMsg('Add a condition first'); return; }
      setChainMsg('Saving takeoff first…'); setChainBusy(true);
      id = await save();
      if (!id) { setChainMsg(''); setChainBusy(false); return; }
    }
    setChainBusy(true); setChainResult(null); setChainPct(2); setChainMsg('Sage is starting…');
    try {
      const res = await fetch(`/api/takeoff/${id}/sage-auto-docs`);
      if (!res.ok || !res.body) { console.error('chain start failed', res.status); setChainMsg("Couldn't start that step. Please try again."); setChainBusy(false); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop() || '';
        for (const chunk of chunks) {
          const dataLine = chunk.split('\n').find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          let ev: { event?: string; pct?: number; message?: string; packagesCreated?: number; jacketsGenerated?: number; sovCreated?: boolean; projectId?: string };
          try { ev = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
          if (ev.event === 'progress') { setChainPct(Math.max(2, Math.min(99, ev.pct || 0))); setChainMsg(ev.message || 'Working…'); }
          else if (ev.event === 'error') { setChainMsg(`Sage: ${ev.message || 'generation failed'}`); }
          else if (ev.event === 'done' && typeof ev.packagesCreated === 'number') {
            setChainResult({ packagesCreated: ev.packagesCreated || 0, jacketsGenerated: ev.jacketsGenerated || 0, sovCreated: !!ev.sovCreated, projectId: ev.projectId || projectId });
            setChainPct(100); setChainMsg('');
          }
        }
      }
    } catch (e) { console.error(e); setChainMsg(humanError(e)); }
    setChainBusy(false);
  };

  // ── full-blueprint AI read (all sheets) ──
  // TODO(review-queue): route analyze-full's `conditionsList` through the same AI-proposes/you-confirm
  // review step as countSymbols (open a queue instead of setConditions()). conditionsList already
  // carries area/linear/count kinds, so the queue needs a kind-aware assembly picker + a per-condition
  // confidence proxy (the analyze-full response has no per-item confidence today). Left direct-apply for now.
  const [reading, setReading] = useState(false);
  const readBlueprint = async (f: File | undefined) => {
    if (!f || !projectId) { setMsg('Pick a project first'); return; }
    if (conditions.length && !confirm(`Replaces your ${conditions.length} current condition${conditions.length === 1 ? '' : 's'} — continue?`)) return;
    setReading(true); setMsg('Reading every sheet…');
    try {
      const b64: string = await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res((rd.result as string).split(',')[1]); rd.onerror = rej; rd.readAsDataURL(f); });
      const r2 = await fetch('/api/takeoff/analyze-full', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pdf: b64, projectId }) });
      const d = await r2.json();
      if (d.error) { setMsg(`AI: ${d.error}`); setReading(false); return; }
      setConditions((d.conditionsList || []).map((c: Condition) => ({ ...c, id: uid() })));
      if (d.project) setName(String(d.project));
      setMsg(`✓ Read ${d.sheetCount} sheets → ${d.conditions} conditions + ${d.directLines} direct items. Review & save.`);
    } catch (e) { console.error(e); setMsg(humanError(e)); }
    setReading(false);
  };

  // ── SPEC-AWARE CROSS-CHECK: counted quantities vs the project's scheduled quantities (/api/takeoff/spec-check) ──
  // Items = every COUNT condition + any area/linear the user gave a real (non-default) label. The route pulls
  // submittals/RFIs/specs/etc., asks Claude for the scheduled qty of each, and flags mismatches with a citation.
  const specItems = useMemo(() => {
    const unitFor = (k: MeasureKind) => (k === 'count' ? 'EA' : k === 'area' ? 'SF' : 'LF');
    return conditions
      .filter((c) => c.value > 0 && (c.name || '').trim())
      .filter((c) => c.kind === 'count' || (c.name || '').trim().toLowerCase() !== (ASSEMBLIES[c.assemblyId]?.name || '').toLowerCase())
      .map((c) => ({ label: (c.name || '').trim(), count: c.value, unit: unitFor(c.kind) }));
  }, [conditions]);
  const [specBusy, setSpecBusy] = useState(false);
  const [specResult, setSpecResult] = useState<null | { results: SpecRow[]; note?: string; searched: number }>(null);
  const runSpecCheck = async () => {
    if (!projectId) { setMsg('Open from a project to cross-check'); return; }
    if (!specItems.length) { setMsg('Add a counted (or clearly-labeled) condition to cross-check against schedules.'); return; }
    setSpecBusy(true); setSpecResult(null); setMsg('');
    try {
      const res = await fetch('/api/takeoff/spec-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, items: specItems }) });
      const d = await res.json();
      if (d.error) { setMsg(`Spec check: ${d.error}`); setSpecBusy(false); return; }
      setSpecResult({ results: (d.results || []) as SpecRow[], note: d.note, searched: d.searched ?? 0 });
    } catch (e) { console.error(e); setMsg(humanError(e)); }
    setSpecBusy(false);
  };

  // ── document-type importers: CSV/Excel quantities + DXF CAD (the migration wedge) ──
  const catalog = useMemo(() => Object.entries(ASSEMBLIES).map(([id, a]) => ({ id, name: a.name })), []);
  const [importing, setImporting] = useState('');
  const [qtyReview, setQtyReview] = useState<QtyReview | null>(null);
  const [dxfReview, setDxfReview] = useState<DxfReview | null>(null);
  const [dxfAreaAsm, setDxfAreaAsm] = useState(asmList('area')[0]?.id || '');
  const [dxfLinearAsm, setDxfLinearAsm] = useState(asmList('linear')[0]?.id || '');
  const [dxfCountAsm, setDxfCountAsm] = useState(asmList('count')[0]?.id || '');
  const [dxfInc, setDxfInc] = useState({ area: true, linear: true, count: false });

  // CSV/TSV → text → importCsv; XLSX/XLS → arrayBuffer → sheet_to_json(header:1) → rowsToImport
  const importQuantities = async (f: File | undefined) => {
    if (!f) return;
    const ext = (f.name.toLowerCase().split('.').pop() || '');
    setImporting(`Reading ${f.name}…`); setMsg('');
    try {
      let res;
      if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
        res = importCsv(await f.text(), catalog);
      } else if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') {
        // W-16: ~400KB parser loads on first spreadsheet import, never in the route's initial chunk
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as (string | number)[][];
        res = rowsToImport(rows, catalog);
      } else { setMsg(`Unsupported file "${f.name}" — pick a .csv, .tsv, .xlsx, or .xls.`); setImporting(''); return; }
      if (!res.items.length) { setMsg(res.error || 'No importable rows found in that file.'); setImporting(''); return; }
      setQtyReview({ fileName: f.name, rows: res.items.map((it) => ({ ...it, assemblyId: it.assemblyId || '' })), warnings: res.warnings });
    } catch (e) { console.error(e); setMsg(`Couldn't read ${f.name}. Re-export a flattened PDF or a PNG and try again.`); }
    setImporting('');
  };

  // DXF → parseDxf → closed polylines become Area buckets, lines+polylines a Linear bucket, circles/arcs an optional Count bucket
  const importDxf = async (f: File | undefined) => {
    if (!f) return;
    setImporting(`Parsing ${f.name}…`); setMsg('');
    try {
      const dxf = parseDxf(await f.text());
      if (!dxf.ok) { setMsg(dxf.error || 'No usable CAD geometry in that DXF.'); setImporting(''); return; }
      const ftPerUnit = insUnitsToFeet(dxf.insUnits);
      const areas = dxf.polylines.filter((p) => p.closed && p.pts.length >= 3).map((p) => dxfPolySF(p.pts, ftPerUnit)).filter((sf) => sf > 0);
      const totalAreaSF = Math.round(areas.reduce((s, x) => s + x, 0) * 100) / 100;
      const linearLF = dxfLinearFeet(dxf);
      const warnings: string[] = [];
      if (dxf.insUnits == null) warnings.push('No $INSUNITS in the DXF — assuming the drawing is already in feet. Verify the totals look right before importing.');
      if (!areas.length && linearLF <= 0) warnings.push('No closed areas or line work detected — only point symbols (circles/arcs) were found.');
      setDxfAreaAsm((p) => p || asmList('area')[0]?.id || '');
      setDxfLinearAsm((p) => p || asmList('linear')[0]?.id || '');
      setDxfCountAsm((p) => p || asmList('count')[0]?.id || '');
      setDxfInc({ area: areas.length > 0, linear: linearLF > 0, count: false });
      setDxfReview({ fileName: f.name, insUnits: dxf.insUnits, ftPerUnit, areas, totalAreaSF, linearLF, circleCount: dxf.circles.length, arcCount: dxf.arcs.length, entityCount: dxf.lines.length + dxf.polylines.length + dxf.circles.length + dxf.arcs.length, warnings });
    } catch (e) { console.error(e); setMsg(`Couldn't parse ${f.name}. Check the file format and try again.`); }
    setImporting('');
  };

  const qtyAddable = qtyReview ? qtyReview.rows.filter((r) => r.assemblyId && ASSEMBLIES[r.assemblyId]).length : 0;
  const addQtyConditions = () => {
    if (!qtyReview) return;
    const rows = qtyReview.rows.filter((r) => r.assemblyId && ASSEMBLIES[r.assemblyId]);
    if (!rows.length) { setMsg('Map at least one row to an assembly first.'); return; }
    const conds: TracerCondition[] = rows.map((r) => {
      const asm = ASSEMBLIES[r.assemblyId];
      const noteParts: string[] = [];
      if (r.csi) noteParts.push(`CSI ${r.csi}`);
      if (r.unitCostCents) noteParts.push(`imported $${(r.unitCostCents / 100).toFixed(2)}/${r.unit}`);
      // value = imported qty; kind derives from the picked assembly → prices live through computeTakeoff
      return { id: uid(), name: r.description, kind: asm.appliesTo, value: r.qty, assemblyId: r.assemblyId, note: noteParts.join(' · ') || undefined };
    });
    setConditions((cs) => [...cs, ...conds]);
    setActiveTemplate('');
    setMsg(`✓ Imported ${conds.length} condition${conds.length === 1 ? '' : 's'} from ${qtyReview.fileName} — priced live below.`);
    setQtyReview(null);
  };

  const addDxfConditions = () => {
    if (!dxfReview) return;
    const conds: TracerCondition[] = [];
    if (dxfInc.area && dxfAreaAsm) dxfReview.areas.forEach((sf, i) => conds.push({ id: uid(), name: `CAD area ${i + 1}`, kind: 'area', value: sf, assemblyId: dxfAreaAsm, note: 'DXF closed polyline · exact' }));
    if (dxfInc.linear && dxfLinearAsm && dxfReview.linearLF > 0) conds.push({ id: uid(), name: 'CAD linear run', kind: 'linear', value: dxfReview.linearLF, assemblyId: dxfLinearAsm, note: 'DXF lines + polylines · exact' });
    const cnt = dxfReview.circleCount + dxfReview.arcCount;
    if (dxfInc.count && dxfCountAsm && cnt > 0) conds.push({ id: uid(), name: 'CAD symbols (circles + arcs)', kind: 'count', value: cnt, assemblyId: dxfCountAsm, note: 'DXF circles + arcs' });
    if (!conds.length) { setMsg('Enable at least one bucket with an assembly to import.'); return; }
    setConditions((cs) => [...cs, ...conds]);
    setActiveTemplate('');
    setMsg(`✓ Imported ${conds.length} condition${conds.length === 1 ? '' : 's'} from ${dxfReview.fileName} — exact CAD quantities, no tracing.`);
    setDxfReview(null);
  };

  const save = async (): Promise<string | null> => {
    if (!projectId) { setMsg('Pick a project'); return null; }
    if (!conditions.length) { setMsg('Add a condition'); return null; }
    setSaving(true); setMsg('');
    let savedId: string | null = null;
    try {
      // Gap 2: per-sheet scales ride along so the server verifies each condition against ITS
      // sheet's calibration (route.ts already resolves condition.ppf ?? sheetScales[sheetId]).
      const sheetScales: Record<string, number> = {};
      for (const c of conditions) if (c.sheetId && typeof c.ppf === 'number' && c.ppf > 0) sheetScales[c.sheetId] = c.ppf;
      const res = await fetch('/api/takeoff/measured', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, name, conditions, opts, pxPerFt: ppf || undefined, imgW: dims.w || undefined, imgH: dims.h || undefined, ...(Object.keys(sheetScales).length ? { sheetScales } : {}) }) });
      const d = await res.json();
      if (d.error) setMsg(`Error: ${d.error}`);
      else {
        savedId = d.id || null;
        if (savedId) setSavedTakeoffId(savedId);   // retain the id so the downstream chain runs one-tap; conditions kept on screen
        const warn = Array.isArray(d.calibrationWarnings) && d.calibrationWarnings.length ? ` · ⚠ ${d.calibrationWarnings.length} scale check${d.calibrationWarnings.length === 1 ? '' : 's'} (confidence ${d.scaleConfidence}%)` : '';
        setMsg(`Saved — ${d.lines} line items · ${d.sell ? '$' + Math.round(d.sell).toLocaleString() : ''}${warn}`);
      }
    } catch (e) { console.error(e); setMsg(humanError(e)); }
    setSaving(false);
    return savedId;
  };

  // Clone the current (saved) takeoff as a new revision in the version chain (#7).
  const createRevision = async (isAddendum = false) => {
    let id: string | null = savedTakeoffId;
    if (!id) { id = await save(); if (!id) return; }
    setMsg(isAddendum ? 'Creating addendum…' : 'Creating revision…');
    try {
      const res = await fetch(`/api/takeoff/${id}/versions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isAddendum }) });
      const d = await res.json();
      if (d.error) setMsg(`Revision: ${d.error}`);
      else { setSavedTakeoffId(d.id); setMsg(`${d.revLabel} created — $${Math.round(d.sell).toLocaleString()}. Edit and save to continue the chain.`); }
    } catch (e) { console.error(e); setMsg(humanError(e)); }
  };

  // ── Client-ready Estimate PDF: deterministic, print→PDF (same mechanism as the heatmap report) ──
  const exportEstimate = () => {
    if (!conditions.length) { setMsg('Add a condition first'); return; }
    const proj = projects.find((p) => p.id === projectId);
    const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
    const html = buildEstimateReportHtml({
      project: { name: name || proj?.name || 'Measured Takeoff', buildingSf: +bsf || undefined },
      conditions,
      result: r,
      opts,
      company: { name: 'Saguaro Control Systems', tagline: 'Control Every Project. Deliver Every Promise.' },
      accuracyClass: aaceClass,
      ...(allowancesTxt.trim() ? { allowances: lines(allowancesTxt) } : {}),
      ...(exclusionsTxt.trim() ? { exclusions: lines(exclusionsTxt) } : {}),
      ...(clarifTxt.trim() ? { clarifications: lines(clarifTxt) } : {}),
    });
    const w = window.open('', '_blank');
    if (!w) { setMsg('Allow pop-ups to export the estimate PDF'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch { /* */ } }, 500);
  };

  const exportExcel = async () => {
    if (!conditions.length) { setMsg('Add a condition first'); return; }
    const proj = projects.find((p) => p.id === projectId);
    // W-16: excel-export statically pulls xlsx — import on demand so the workbook builder stays out of the initial chunk
    const { buildTakeoffWorkbook, workbookToBase64 } = await import('@/lib/takeoff/excel-export');
    const wb = buildTakeoffWorkbook({ projectName: name || proj?.name || 'Measured Takeoff', conditions, result: r });
    const b64 = workbookToBase64(wb);
    const a = document.createElement('a');
    a.href = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + b64;
    a.download = `${(name || proj?.name || 'takeoff').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-takeoff.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setMsg('Excel workbook downloaded — the Line Items sheet re-imports here after you edit it');
  };

  const inp: React.CSSProperties = { background: '#0a0a0a', border: `1px solid ${LINE}`, borderRadius: 8, color: TEXT, padding: '9px 11px', fontSize: 14, width: '100%' };
  const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(135deg,#F59E0B,#FBBF24)', color: '#1A1206', fontWeight: 800, border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontSize: 14 };
  const pillBtn: React.CSSProperties = { background: 'transparent', color: TEXT, border: `1px solid ${LINE}`, borderRadius: 20, padding: '5px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 12 };
  const wizRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%', border: `1px solid ${LINE}`, background: BG, borderRadius: 12, padding: '13px 14px', cursor: 'pointer' };
  const wizRowT: React.CSSProperties = { fontWeight: 800, fontSize: 14, color: TEXT };
  const wizRowD: React.CSSProperties = { fontSize: 12, color: DIM, marginTop: 2, lineHeight: 1.4 };

  return (
    <>
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
      <PremiumSurface maxWidth={1000}>
      <div ref={pageRef} style={{ color: TEXT, fontFamily: 'system-ui,Segoe UI,sans-serif', paddingBottom: conditions.length ? 72 : 0 }}>
        <ModuleHero
          eyebrow="Measurement-driven · deterministic"
          eyebrowIcon={<Ruler size={13} weight="fill" color={GOLD} />}
          title="Measured"
          accent="Takeoff"
          subtitle="Add conditions; each explodes into a priced bill and rolls up live."
          actions={<>
            <button onClick={openWizard} title="First-takeoff guide" style={ghostButtonStyle} className="pmBtn"><Question size={16} weight="bold" color={GOLD} />Guide</button>
            <a href="/app/takeoff/rates" style={{ ...ghostButtonStyle, color: tenantRateCount ? GREEN : 'rgba(255,255,255,0.82)' }} className="pmBtn"><Ic name="costBook" s={18} k="hdr" />Cost catalog{tenantRateCount ? ` · ${tenantRateCount} your rates` : ''}</a>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ ...inp, width: 'auto' }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </>}
        />

        {/* ALWAYS-mounted status banner — "Pick a project first" / AI / file errors are never silent.
            (The old msg span rendered only inside the Conditions card, which mounts only once conditions exist.) */}
        {msg && (() => {
          const ok = /^(✓|\+ |Saved|Blank takeoff|Read-only|AI proposed)/.test(msg) || /copied|downloaded|revoked|link ready|created —/.test(msg);
          const busy = !ok && /…$/.test(msg);
          const tone = ok ? GREEN : busy ? GOLD : RED;
          return (
            <div role="status" style={{ marginTop: 14, display: 'flex', alignItems: 'flex-start', gap: 10, border: `1px solid ${tone}55`, background: `${tone}14`, borderRadius: 12, padding: '11px 14px' }}>
              {busy
                ? <span style={{ width: 15, height: 15, borderRadius: 8, border: `2px solid ${GOLD}`, borderTopColor: 'transparent', display: 'inline-block', flexShrink: 0, marginTop: 1, animation: 'spin 0.7s linear infinite' }} />
                : ok
                  ? <CheckCircle size={17} weight="fill" color={GREEN} style={{ flexShrink: 0, marginTop: 1 }} />
                  : <WarningCircle size={17} weight="fill" color={RED} style={{ flexShrink: 0, marginTop: 1 }} />}
              <div style={{ flex: 1, fontSize: 13, color: TEXT, lineHeight: 1.45 }}>{msg}</div>
              <button onClick={() => setMsg('')} title="Dismiss" style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', display: 'inline-flex', padding: 0 }}><IconX size={15} /></button>
            </div>
          );
        })()}

        {/* building-type templates — the 60-second cold start */}
        <SectionCard title="Start from a building type" subtitle="Drops a curated condition set — trace each to price it live" icon={<Stack size={17} weight="duotone" color={GOLD} />} style={{ marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(188px,1fr))', gap: 10 }}>
            {BUILDING_TEMPLATES.map((t) => {
              const IconC = TPL_ICON[t.id] || Buildings;
              const active = activeTemplate === t.id;
              return (
                <button key={t.id} onClick={() => dropTemplate(t.id)} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6, border: `1px solid ${active ? GOLD : LINE}`, background: active ? 'rgba(245,158,11,0.10)' : PANEL, borderRadius: 14, padding: '13px 14px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,158,11,0.12)', flexShrink: 0 }}><IconC size={21} weight="duotone" color={GOLD} /></span>
                    <div style={{ fontWeight: 800, fontSize: 14.5, color: TEXT }}>{t.name}</div>
                  </div>
                  <div style={{ fontSize: 12, color: DIM, lineHeight: 1.4 }}>{t.blurb}</div>
                  <div style={{ marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: active ? GOLD : DIM }}><Stack size={13} weight="bold" />{t.conditions.length} conditions{active ? ' · added' : ''}</div>
                </button>
              );
            })}
            <button onClick={chooseBlank} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6, border: `1px dashed ${activeTemplate === 'blank' ? GOLD : LINE}`, background: 'transparent', borderRadius: 14, padding: '13px 14px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 34, height: 34, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }}><FileDashed size={21} weight="duotone" color={DIM} /></span>
                <div style={{ fontWeight: 800, fontSize: 14.5, color: TEXT }}>Blank</div>
              </div>
              <div style={{ fontSize: 12, color: DIM, lineHeight: 1.4 }}>Start empty — add conditions yourself or trace on the plan.</div>
            </button>
          </div>
        </SectionCard>

        {/* AI plan-reading — two crisp entry points */}
        <SectionCard title="AI plan reading" subtitle="Extract conditions, count symbols, or compare revisions." icon={<Sparkle size={17} weight="duotone" color={GOLD} />} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 12 }}>
          <label style={{ display: 'flex', gap: 13, alignItems: 'flex-start', border: `1.5px solid rgba(245,158,11,0.55)`, background: 'linear-gradient(180deg,rgba(245,158,11,0.10),rgba(245,158,11,0.03))', borderRadius: 14, padding: '15px 16px', cursor: reading ? 'wait' : 'pointer' }}>
            <Ic name="drawings" s={34} k="hero1" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: TEXT }}>{reading ? 'Reading every sheet…' : 'Read full blueprint'}</div>
              <div style={{ fontSize: 12.5, color: DIM, marginTop: 3, lineHeight: 1.4 }}>Upload the whole plan-set PDF — AI reads every sheet, extracts all conditions, the engine prices them.</div>
            </div>
            <input ref={blueprintInputRef} type="file" accept="application/pdf,.pdf" disabled={reading} style={{ display: 'none' }} onChange={(e) => { readBlueprint(e.target.files?.[0]); (e.target as HTMLInputElement).value = ''; }} />
          </label>
          <label style={{ display: 'flex', gap: 13, alignItems: 'flex-start', border: `1.5px solid rgba(56,189,248,0.5)`, background: 'linear-gradient(180deg,rgba(56,189,248,0.10),rgba(56,189,248,0.03))', borderRadius: 14, padding: '15px 16px', cursor: counting ? 'wait' : 'pointer' }}>
            <Ic name="aiCount" s={34} k="hero2" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: TEXT }}>{counting ? 'Counting symbols…' : 'Count symbols + auto-scale'}</div>
              <div style={{ fontSize: 12.5, color: DIM, marginTop: 3, lineHeight: 1.4 }}>Upload one sheet — AI counts doors, fixtures &amp; receptacles, reads the scale, and auto-calibrates the tracer.</div>
            </div>
            <input type="file" accept="image/*" disabled={counting} style={{ display: 'none' }} onChange={(e) => { countSymbols(e.target.files?.[0]); (e.target as HTMLInputElement).value = ''; }} />
          </label>
          <button onClick={() => { setRevResult(null); setComparing(true); }} style={{ display: 'flex', gap: 13, alignItems: 'flex-start', textAlign: 'left', border: `1.5px solid rgba(167,139,250,0.5)`, background: 'linear-gradient(180deg,rgba(167,139,250,0.10),rgba(167,139,250,0.03))', borderRadius: 14, padding: '15px 16px', cursor: 'pointer' }}>
            <Ic name="compareRevs" s={34} k="hero3" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: TEXT }}>Compare revisions</div>
              <div style={{ fontSize: 12.5, color: DIM, marginTop: 3, lineHeight: 1.4 }}>Upload old + new sheet — AI reports exactly what changed and the cost direction, so nothing slips through.</div>
            </div>
          </button>
          </div>
        </SectionCard>

        {/* Import an existing takeoff — CSV/Excel quantities + DXF CAD (the migration wedge) */}
        <SectionCard title="Bring an existing takeoff" subtitle="CSV/Excel quantities or AutoCAD DXF — mapped to assemblies & priced live" icon={<FileArrowUp size={17} weight="duotone" color={GOLD} />} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 12 }}>
            <label style={{ display: 'flex', gap: 13, alignItems: 'flex-start', border: `1.5px solid rgba(52,211,153,0.5)`, background: 'linear-gradient(180deg,rgba(52,211,153,0.10),rgba(52,211,153,0.03))', borderRadius: 14, padding: '15px 16px', cursor: importing ? 'wait' : 'pointer' }}>
              <FileCsv size={34} weight="duotone" color={GREEN} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: TEXT }}>Import CSV / Excel</div>
                <div style={{ fontSize: 12.5, color: DIM, marginTop: 3, lineHeight: 1.4 }}>Bring a PlanSwift / STACK / Excel quantity takeoff — each row auto-maps to an assembly and prices through the same engine. Review before it lands.</div>
              </div>
              <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm" disabled={!!importing} style={{ display: 'none' }} onChange={(e) => { importQuantities(e.target.files?.[0]); (e.target as HTMLInputElement).value = ''; }} />
            </label>
            <label style={{ display: 'flex', gap: 13, alignItems: 'flex-start', border: `1.5px solid rgba(245,158,11,0.5)`, background: 'linear-gradient(180deg,rgba(245,158,11,0.10),rgba(245,158,11,0.03))', borderRadius: 14, padding: '15px 16px', cursor: importing ? 'wait' : 'pointer' }}>
              <Cube size={34} weight="duotone" color={GOLD} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: TEXT }}>Import CAD (DXF)</div>
                <div style={{ fontSize: 12.5, color: DIM, marginTop: 3, lineHeight: 1.4 }}>Drop an AutoCAD DXF — closed shapes become areas, line work becomes linear runs. Exact quantities, zero tracing.</div>
              </div>
              <input type="file" accept=".dxf" disabled={!!importing} style={{ display: 'none' }} onChange={(e) => { importDxf(e.target.files?.[0]); (e.target as HTMLInputElement).value = ''; }} />
            </label>
          </div>
          {importing && <div style={{ marginTop: 8, fontSize: 13, color: GOLD, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 13, height: 13, borderRadius: 7, border: `2px solid ${GOLD}`, borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />{importing}</div>}
        </SectionCard>

        {/* live estimate — the fixed bottom bar keeps sell + Save in view; position:sticky here was
            dead (killed by PremiumSurface's overflow:hidden ancestor) */}
        <div style={{ background: 'rgba(245,158,11,0.06)', border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 14, padding: 20, marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: DIM, fontWeight: 700 }}>Estimate — computed live</div>
              <div style={{ fontSize: 44, fontWeight: 800, color: GOLD, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{usd(r.sellCents)}</div>
              {(() => { const band = ({ 1: [-3, 8], 2: [-5, 12], 3: [-10, 15], 4: [-20, 30], 5: [-30, 50] } as Record<number, number[]>)[aaceClass]; const lo = Math.round(r.sellCents * (1 + band[0] / 100)); const hi = Math.round(r.sellCents * (1 + band[1] / 100)); return (
                <div style={{ fontSize: 12, color: GOLD, fontWeight: 600, marginTop: 2 }}>Range {usd(lo)} – {usd(hi)} · AACE Class {aaceClass}</div>
              ); })()}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <ConfidenceRing score={confidence.score} />
              <div style={{ maxWidth: 168 }}>
                <div style={{ fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: DIM, fontWeight: 700 }}>Estimate confidence</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>{confidence.score}%</div>
                <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.35, marginTop: 2 }}>{confidence.reasons[0]}</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, marginTop: 10 }}>
            {[['Material', usd(r.materialCents)], ['Labor', `${usd(r.laborCents)} · ${r.laborHrs}h`], ['Line items', `${r.lines.length}`], ...(r.costPerSf ? [['$/SF', `$${r.costPerSf}`]] : [])].map(([k, v]) => (
              <div key={k}><div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase', fontWeight: 700 }}>{k}</div><div style={{ fontSize: 16, fontWeight: 800 }}>{v}</div></div>
            ))}
          </div>
          <div style={{ color: DIM, fontSize: 12.5, marginTop: 10 }}>{conditions.length} conditions → {r.lines.length} priced components · no AI round-trip</div>

          {/* Price build-up waterfall (v2) — the full defensible stack, live */}
          {r.lines.length > 0 && (
            <div style={{ marginTop: 12, border: `1px solid ${LINE}`, borderRadius: 10, overflow: 'hidden' }}>
              {(() => {
                const bare = r.burdenedLaborCents - r.laborCents;
                const rows: [string, number, boolean][] = [
                  ['Material', r.materialCents, false],
                  ...(r.materialTaxCents ? [['Sales tax on material', r.materialTaxCents, false] as [string, number, boolean]] : []),
                  ['Labor (per-trade)', r.laborCents, false],
                  ...(bare ? [['Labor burden', bare, false] as [string, number, boolean]] : []),
                  ...(r.equipmentCents ? [['Equipment', r.equipmentCents, false] as [string, number, boolean]] : []),
                  ...(r.subCents ? [['Subcontractors', r.subCents, false] as [string, number, boolean]] : []),
                  ['Direct cost', r.subtotalCents, true],
                  ...(r.generalConditionsCents ? [['General conditions', r.generalConditionsCents, false] as [string, number, boolean]] : []),
                  ['Overhead', r.overheadCents, false],
                  ['Contingency', r.contingencyCents, false],
                  ['Fee / Profit', r.profitCents, false],
                  ...(r.bondCents ? [['P&P bond', r.bondCents, false] as [string, number, boolean]] : []),
                ];
                return rows.map(([lbl, val, strong]) => (
                  <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: 12.5, background: strong ? 'rgba(255,255,255,0.04)' : 'transparent', fontWeight: strong ? 800 : 500, color: strong ? TEXT : DIM, borderTop: strong ? `1px solid ${LINE}` : 'none' }}>
                    <span>{lbl}</span><span style={{ fontVariantNumeric: 'tabular-nums', color: strong ? TEXT : 'inherit' }}>{usd(val)}</span>
                  </div>
                ));
              })()}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', fontSize: 14, fontWeight: 800, color: '#0a0a0a', background: 'linear-gradient(135deg,#F7C948,#D4A017)' }}>
                <span>Sell price</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{usd(r.sellCents)}</span>
              </div>
            </div>
          )}

          {/* Location breakdown (#11) + alternates (#4) — surfaced from the engine rollups */}
          {r.byLocation.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: DIM, fontWeight: 700, marginBottom: 5 }}>Cost by location</div>
              {r.byLocation.map((l) => (
                <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0', color: TEXT }}>
                  <span style={{ color: DIM }}>{[l.building && `Bldg ${l.building}`, l.level && `Lvl ${l.level}`, l.zone && `Zone ${l.zone}`].filter(Boolean).join(' · ') || 'Unassigned'}</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{usd(l.totalCents)}</span>
                </div>
              ))}
            </div>
          )}
          {r.alternates.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: DIM, fontWeight: 700, marginBottom: 5 }}>Alternates</div>
              {r.alternates.map((a) => (
                <div key={a.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}>
                  <span style={{ color: DIM }}>{a.label}</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: a.type === 'deduct' ? '#f87171' : '#34D399' }}>{a.type === 'deduct' ? '−' : '+'}{usd(Math.abs(a.deltaCents))}</span>
                </div>
              ))}
            </div>
          )}

          <button onClick={exportEstimate} disabled={!conditions.length} title="Cover, executive summary, division rollup, full line items, transparent markup stack & basis of estimate"
            style={{ marginTop: 14, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, border: 'none', borderRadius: 10, padding: '13px', cursor: conditions.length ? 'pointer' : 'not-allowed', opacity: conditions.length ? 1 : 0.5, fontWeight: 800, fontSize: 15, color: '#0a0a0a', background: 'linear-gradient(135deg,#F7C948,#D4A017)', boxShadow: '0 6px 18px rgba(212,160,23,0.35)' }}>
            <Ic name="documents" s={20} k="estpdf" />Client Estimate PDF
            <span style={{ fontWeight: 600, fontSize: 12, color: 'rgba(13,17,23,0.7)' }}>· one-tap proposal</span>
          </button>

          <button onClick={exportExcel} disabled={!conditions.length} title="4-sheet workbook — Line Items (re-importable), Conditions, By Division, Summary. Edit in Excel and bring it back."
            style={{ marginTop: 9, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 10, padding: '11px', cursor: conditions.length ? 'pointer' : 'not-allowed', opacity: conditions.length ? 1 : 0.5, fontWeight: 700, fontSize: 14, color: TEXT, background: 'transparent', border: `1px solid ${LINE}` }}>
            <Table size={18} weight="bold" color={TEXT} />Export to Excel
            <span style={{ fontWeight: 600, fontSize: 11.5, color: DIM }}>· round-trip editable</span>
          </button>

          <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
            <button onClick={() => createRevision(false)} disabled={!conditions.length} title="Clone this takeoff as a new revision (version chain) — re-prices with the same markups"
              style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 10, padding: '10px', cursor: conditions.length ? 'pointer' : 'not-allowed', opacity: conditions.length ? 1 : 0.5, fontWeight: 700, fontSize: 13, color: TEXT, background: 'transparent', border: `1px solid ${LINE}` }}>
              <GitDiff size={16} weight="bold" color="#A78BFA" />New revision
            </button>
            <button onClick={() => createRevision(true)} disabled={!conditions.length} title="Clone as an addendum in the version chain"
              style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 10, padding: '10px', cursor: conditions.length ? 'pointer' : 'not-allowed', opacity: conditions.length ? 1 : 0.5, fontWeight: 700, fontSize: 13, color: TEXT, background: 'transparent', border: `1px solid ${LINE}` }}>
              <Note size={16} weight="bold" color="#A78BFA" />Addendum
            </button>
          </div>

          {/* One-tap downstream chain — takeoff → bid packages + pay app (SOV), same estimate, zero re-keying */}
          <div style={{ marginTop: 12, borderTop: '1px solid rgba(245,158,11,0.22)', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
              <Path size={16} weight="duotone" color={GOLD} />
              <span style={{ fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: DIM, fontWeight: 700 }}>Estimate → bid packages → pay app · one tap</span>
              {savedTakeoffId ? <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: GREEN }}><CheckCircle size={13} weight="fill" />saved</span> : null}
            </div>
            <button onClick={runChain} disabled={chainBusy || (!conditions.length && !savedTakeoffId)}
              title="Sage writes a bid package per CSI division (scope, insurance, due dates) + a Schedule of Values tied to a new pay application"
              style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, border: '1px solid rgba(245,158,11,0.5)', borderRadius: 10, padding: '12px', cursor: (chainBusy || (!conditions.length && !savedTakeoffId)) ? 'not-allowed' : 'pointer', opacity: (chainBusy || (!conditions.length && !savedTakeoffId)) ? 0.55 : 1, fontWeight: 800, fontSize: 14.5, color: TEXT, background: 'linear-gradient(135deg,#1b2230,#232c3d)' }}>
              {chainBusy
                ? <><CircleNotch size={18} weight="bold" color={GOLD} style={{ animation: 'spin 0.7s linear infinite' }} />Generating bid + billing docs…</>
                : <><Package size={19} weight="duotone" color={GOLD} />Generate bid packages + pay app<Lightning size={15} weight="fill" color={GOLD} /></>}
            </button>
            {chainBusy && (
              <div style={{ marginTop: 9 }}>
                <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${chainPct}%`, background: 'linear-gradient(90deg,#F7C948,#D4A017)', transition: 'width .3s ease' }} /></div>
                {chainMsg && <div style={{ fontSize: 12, color: DIM, marginTop: 5 }}>{chainMsg}</div>}
              </div>
            )}
            {!chainBusy && chainMsg && <div style={{ marginTop: 8, fontSize: 12.5, color: (chainMsg.startsWith('Sage:') || chainMsg.startsWith("Couldn't")) ? RED : DIM }}>{chainMsg}</div>}
            {chainResult && (
              <div style={{ marginTop: 10, border: '1px solid rgba(52,211,153,0.4)', background: 'rgba(52,211,153,0.06)', borderRadius: 10, padding: '12px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, color: TEXT }}><CheckCircle size={18} weight="fill" color={GREEN} />Documents generated</div>
                <div style={{ fontSize: 12.5, color: DIM, marginTop: 3 }}>{chainResult.packagesCreated} bid package{chainResult.packagesCreated === 1 ? '' : 's'} · {chainResult.jacketsGenerated} jacket PDF{chainResult.jacketsGenerated === 1 ? '' : 's'}{chainResult.sovCreated ? ' · Schedule of Values + pay application' : ''}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <a href={`/app/projects/${chainResult.projectId}/bid-packages`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#0a0a0a', background: GOLD, borderRadius: 8, padding: '8px 12px', textDecoration: 'none' }}><Package size={15} weight="bold" />View bid packages<ArrowRight size={14} weight="bold" /></a>
                  {chainResult.sovCreated && <a href={`/app/projects/${chainResult.projectId}/pay-apps`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: TEXT, border: `1px solid ${LINE}`, borderRadius: 8, padding: '8px 12px', textDecoration: 'none' }}><Receipt size={15} weight="bold" color={GOLD} />View pay app (SOV)<ArrowRight size={14} weight="bold" /></a>}
                </div>
              </div>
            )}
          </div>

          {/* Read-only estimate share link — send a client a live, token-gated, revocable estimate URL */}
          <div style={{ marginTop: 12, borderTop: '1px solid rgba(245,158,11,0.22)', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
              <ArrowSquareOut size={16} weight="duotone" color={GOLD} />
              <span style={{ fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: DIM, fontWeight: 700 }}>Send the client a read-only estimate link</span>
            </div>
            <button onClick={shareEstimate} disabled={shareBusy || !conditions.length}
              title="Mint a token-gated, read-only URL of this estimate deliverable — no login for the client, expires in 30 days, revocable any time"
              style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, border: `1px solid ${LINE}`, borderRadius: 10, padding: '12px', cursor: (shareBusy || !conditions.length) ? 'not-allowed' : 'pointer', opacity: (shareBusy || !conditions.length) ? 0.55 : 1, fontWeight: 800, fontSize: 14.5, color: TEXT, background: 'transparent' }}>
              {shareBusy
                ? <><CircleNotch size={18} weight="bold" color={GOLD} style={{ animation: 'spin 0.7s linear infinite' }} />Preparing link…</>
                : <><ArrowSquareOut size={18} weight="duotone" color={GOLD} />{shareUrl ? 'Copy estimate link again' : 'Create shareable estimate link'}</>}
            </button>
            {shareUrl && (
              <div style={{ marginTop: 10, border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.06)', borderRadius: 10, padding: '11px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input readOnly value={shareUrl} onFocus={(ev) => ev.currentTarget.select()}
                    style={{ flex: 1, minWidth: 180, background: '#0a0a0a', border: `1px solid ${LINE}`, borderRadius: 8, color: TEXT, padding: '8px 10px', fontSize: 12, fontFamily: 'ui-monospace,monospace' }} />
                  <a href={shareUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#0a0a0a', background: GOLD, borderRadius: 8, padding: '8px 12px', textDecoration: 'none' }}><ArrowSquareOut size={14} weight="bold" />Preview</a>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: GREEN, fontWeight: 700 }}>{shareCopied ? <><CheckCircle size={13} weight="fill" />Copied</> : <>Link ready</>}</span>
                  {shareExp && <span style={{ fontSize: 11.5, color: DIM }}>· valid to {new Date(shareExp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                  <button onClick={revokeShare} disabled={shareBusy} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: RED, background: 'transparent', border: `1px solid ${RED}55`, borderRadius: 8, padding: '6px 11px', cursor: shareBusy ? 'not-allowed' : 'pointer' }}><XCircle size={13} weight="bold" />Revoke</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── ASSEMBLY (SYMBOL) LIBRARY — browse the full priced catalog and one-click add a condition ── */}
        <SectionCard style={{ marginTop: 14 }} bodyStyle={{ padding: 18 }}>
          <button onClick={() => setLibOpen((o) => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(245,158,11,0.14)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Stack size={22} weight="duotone" color={GOLD} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 800, fontSize: 15.5, color: TEXT }}>Assembly library</span>
              <span style={{ display: 'block', fontSize: 12.5, color: DIM, marginTop: 2 }}>{LIBRARY.length} priced assemblies across {LIBRARY_TRADES.length} trades — browse & drop, each explodes into real line items</span>
            </span>
            {libOpen ? <ArrowLeft size={18} weight="bold" color={DIM} style={{ transform: 'rotate(90deg)' }} /> : <ArrowRight size={18} weight="bold" color={DIM} style={{ transform: 'rotate(90deg)' }} />}
          </button>

          {libOpen && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={libQ} onChange={(e) => setLibQ(e.target.value)} placeholder="Search by name, trade or CSI…" style={{ ...inp, flex: 1, minWidth: 180 }} />
                <div style={{ display: 'inline-flex', gap: 6 }}>
                  {(['all', 'area', 'linear', 'count'] as const).map((k) => {
                    const on = libKind === k;
                    return <button key={k} onClick={() => setLibKind(k)} style={{ ...pillBtn, background: on ? GOLD : 'transparent', color: on ? '#0a0a0a' : TEXT, border: on ? 'none' : `1px solid ${LINE}`, textTransform: 'capitalize' }}>{k === 'all' ? 'All' : k === 'area' ? 'Area (SF)' : k === 'linear' ? 'Linear (LF)' : 'Count (EA)'}</button>;
                  })}
                </div>
              </div>

              {(() => {
                const q = libQ.trim().toLowerCase();
                const rows = LIBRARY.filter((l) => (libKind === 'all' || l.kind === libKind) && (!q || (`${l.name} ${l.trade} ${l.div}`).toLowerCase().includes(q)));
                const byTrade = LIBRARY_TRADES.map((t) => ({ trade: t, items: rows.filter((l) => l.trade === t) })).filter((g) => g.items.length);
                if (!rows.length) return <div style={{ marginTop: 12, fontSize: 12.5, color: DIM }}>No assemblies match “{libQ}”.</div>;
                return (
                  <div style={{ marginTop: 12, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
                    {byTrade.map((g) => (
                      <div key={g.trade} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: DIM, fontWeight: 700, marginBottom: 7 }}>{g.trade} · {g.items.length}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 8 }}>
                          {g.items.map((l) => (
                            <button key={l.id} onClick={() => addFromLibrary(l.id)} title={`Add ${l.name} — ${l.parts} priced components`}
                              style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', border: `1px solid ${LINE}`, borderRadius: 10, padding: '9px 11px', cursor: 'pointer', background: '#0a0a0a', color: TEXT }}>
                              <span style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,158,11,0.12)', color: GOLD, fontWeight: 800, fontSize: 11 }}>{l.unit}</span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
                                <span style={{ display: 'block', fontSize: 11, color: DIM }}>{l.parts} components{l.div ? ` · CSI ${l.div}` : ''}</span>
                              </span>
                              <span style={{ flexShrink: 0, color: GOLD, fontWeight: 900, fontSize: 17, lineHeight: 1 }}>+</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </SectionCard>

        {/* ── PRICED REVISION COMPARE — pick a prior saved takeoff, diff it against the current one, price the delta ── */}
        <SectionCard icon={<GitDiff size={20} weight="duotone" color="#A78BFA" />} title="Compare to a prior revision" subtitle="Price only what changed against a saved baseline." accent="#A78BFA" style={{ marginTop: 14 }}>

          {!projectId ? (
            <div style={{ marginTop: 12, fontSize: 12.5, color: DIM }}>Open from a project to compare against its prior takeoffs.</div>
          ) : !priorList.length ? (
            <div style={{ marginTop: 12, fontSize: 12.5, color: DIM }}>No prior saved takeoffs for this project yet — save this one, revise it, then compare.</div>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
              <Stack size={16} weight="duotone" color="#A78BFA" style={{ flexShrink: 0 }} />
              <select value={priorId} onChange={(e) => pickPrior(e.target.value)} style={{ ...inp, flex: 1, minWidth: 240 }}>
                <option value="">— select a prior saved takeoff as the baseline —</option>
                {priorList.map((t) => <option key={t.id} value={t.id}>{t.name} · {new Date(t.created_at).toLocaleDateString()}{t.sell_price ? ` · $${Math.round(t.sell_price).toLocaleString()}` : ''}</option>)}
              </select>
            </div>
          )}

          {priorId && !conditions.length && <div style={{ marginTop: 10, fontSize: 12.5, color: GOLD, display: 'inline-flex', alignItems: 'center', gap: 6 }}><WarningCircle size={15} weight="bold" />Add or load the current revision&apos;s conditions to see the priced delta.</div>}

          {revDiff && (() => {
            const groups = [
              { key: 'added', label: 'Added scope', rows: revDiff.lines.filter((l) => l.status === 'added'), tone: GREEN },
              { key: 'changed', label: 'Changed', rows: revDiff.lines.filter((l) => l.status === 'changed'), tone: GOLD },
              { key: 'removed', label: 'Removed · credit', rows: revDiff.lines.filter((l) => l.status === 'removed'), tone: RED },
            ];
            const changedCount = groups.reduce((s, g) => s + g.rows.length, 0);
            if (!changedCount) return <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: GREEN }}><CheckCircle size={17} weight="fill" />No priced change between these two revisions.</div>;
            return (
              <div style={{ marginTop: 14 }}>
                {groups.filter((g) => g.rows.length).map((g) => (
                  <div key={g.key} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: g.tone }} />
                      <span style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 800, color: g.tone }}>{g.label}</span>
                      <span style={{ fontSize: 11.5, color: DIM }}>{g.rows.length} item{g.rows.length === 1 ? '' : 's'}</span>
                    </div>
                    {g.rows.map((l) => {
                      const u = unitFromAsm(l.assemblyId);
                      return (
                        <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 9, border: `1px solid ${LINE}`, borderLeft: `3px solid ${g.tone}`, background: BG, marginBottom: 6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13.5, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                            <div style={{ fontSize: 12, color: DIM, marginTop: 1, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              {l.status === 'changed' ? <>{l.oldValue} <ArrowRight size={11} weight="bold" /> {l.newValue} {u}</> : l.status === 'added' ? <>{l.newValue} {u} new</> : <>{l.oldValue} {u} removed</>}
                            </div>
                          </div>
                          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 14, color: deltaColor(l.deltaCents), whiteSpace: 'nowrap' }}>{netStr(l.deltaCents)}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* NET CHANGE */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', border: `1px solid ${LINE}`, borderRadius: 12, padding: '14px 16px', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {revDiff.netDeltaCents >= 0 ? <TrendUp size={22} weight="duotone" color={GREEN} /> : <TrendDown size={22} weight="duotone" color={RED} />}
                    <div>
                      <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: DIM, fontWeight: 700 }}>Net change</div>
                      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: deltaColor(revDiff.netDeltaCents) }}>{netStr(revDiff.netDeltaCents)}</div>
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 12.5, color: DIM }}>
                    <div>was <b style={{ color: TEXT }}>{usd(revDiff.oldSellCents)}</b></div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2 }}>now <ArrowRight size={12} weight="bold" /> <b style={{ color: GOLD }}>{usd(revDiff.newSellCents)}</b></div>
                  </div>
                </div>

                {/* Draft change order (real route) + printable fallback */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                  <button onClick={draftChangeOrder} disabled={coBusy || !projectId}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 9, padding: '11px 16px', cursor: (coBusy || !projectId) ? 'not-allowed' : 'pointer', opacity: (coBusy || !projectId) ? 0.55 : 1, fontWeight: 800, fontSize: 13.5, color: '#0a0a0a', background: 'linear-gradient(135deg,#C4B5FD,#A78BFA)' }}>
                    {coBusy ? <><CircleNotch size={16} weight="bold" color="#0a0a0a" style={{ animation: 'spin 0.7s linear infinite' }} />Filing…</> : <><Note size={17} weight="bold" color="#0a0a0a" />Draft change order</>}
                  </button>
                  <button onClick={printChangeOrder} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', color: TEXT, border: `1px solid ${LINE}`, borderRadius: 9, padding: '11px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}><Printer size={16} weight="duotone" color="#A78BFA" />Print CO</button>
                  {coResult && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: GREEN }}><CheckCircle size={16} weight="fill" />CO{coResult.coNumber != null ? ` #${coResult.coNumber}` : ''} filed{projectId ? <a href={`/app/projects/${projectId}/change-orders`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#A78BFA', textDecoration: 'none', marginLeft: 2 }}>· view<ArrowRight size={13} weight="bold" /></a> : null}</span>}
                  {coMsg && <span style={{ fontSize: 12.5, color: coMsg.startsWith('Couldn') ? RED : DIM }}>{coMsg}</span>}
                </div>
              </div>
            );
          })()}
        </SectionCard>

        {/* SPEC-AWARE CROSS-CHECK — your counted quantities vs the scheduled quantities on file (the edge nobody has) */}
        <SectionCard icon={<ClipboardText size={20} weight="duotone" color="#FBBF24" />} title="Check against schedules" subtitle="Cross-check counted quantities against the schedules on file." accent="#FBBF24" style={{ marginTop: 14 }} action={
          <button onClick={runSpecCheck} disabled={specBusy || !projectId || !specItems.length} title={!projectId ? 'Open from a project to cross-check' : !specItems.length ? 'Add a counted condition first' : ''}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 9, padding: '10px 16px', cursor: (specBusy || !projectId || !specItems.length) ? 'not-allowed' : 'pointer', opacity: (specBusy || !projectId || !specItems.length) ? 0.5 : 1, fontWeight: 800, fontSize: 13.5, color: '#0a0a0a', background: 'linear-gradient(135deg,#7DD3FC,#FBBF24)', flexShrink: 0 }}>
              {specBusy ? <><span style={{ width: 13, height: 13, borderRadius: 7, border: '2px solid #0a0a0a', borderTopColor: 'transparent', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />Checking…</> : <><SealCheck size={17} weight="bold" color="#0a0a0a" />Cross-check{specItems.length ? ` ${specItems.length} item${specItems.length === 1 ? '' : 's'}` : ''}</>}
            </button>
        }>
          {!projectId && <div style={{ marginTop: 10, fontSize: 12.5, color: DIM }}>Open from a project to cross-check.</div>}

          {specResult && (
            <div style={{ marginTop: 14 }}>
              {specResult.note ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: DIM, background: BG, border: `1px solid ${LINE}`, borderRadius: 10, padding: '11px 13px', lineHeight: 1.45 }}>
                  <WarningCircle size={17} weight="duotone" color={GOLD} style={{ flexShrink: 0, marginTop: 1 }} />{specResult.note}
                </div>
              ) : (
                <>
                  {(() => {
                    const rs = specResult.results;
                    const m = rs.filter((x) => x.status === 'match').length;
                    const mm = rs.filter((x) => x.status === 'mismatch').length;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: TEXT }}>{m} of {rs.length} item{rs.length === 1 ? '' : 's'} match your schedules</span>
                        {mm > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, color: RED, background: 'rgba(248,113,113,0.12)', border: `1px solid rgba(248,113,113,0.4)`, borderRadius: 20, padding: '3px 10px' }}><WarningCircle size={13} weight="bold" />{mm} mismatch{mm === 1 ? '' : 'es'} to reconcile</span>}
                      </div>
                    );
                  })()}
                  {specResult.results.map((row, i) => {
                    const ok = row.status === 'match';
                    const bad = row.status === 'mismatch';
                    const col = ok ? GREEN : bad ? RED : DIM;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '10px 12px', borderRadius: 10, border: `1px solid ${bad ? 'rgba(248,113,113,0.4)' : LINE}`, background: ok ? 'rgba(52,211,153,0.06)' : bad ? 'rgba(248,113,113,0.08)' : 'transparent', marginBottom: 8 }}>
                        {ok ? <CheckCircle size={20} weight="fill" color={GREEN} style={{ flexShrink: 0, marginTop: 1 }} /> : bad ? <WarningCircle size={20} weight="fill" color={RED} style={{ flexShrink: 0, marginTop: 1 }} /> : <XCircle size={20} weight="duotone" color={DIM} style={{ flexShrink: 0, marginTop: 1 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{row.label}</div>
                          <div style={{ fontSize: 12.5, color: DIM, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {ok && <span>Counted <b style={{ color: TEXT }}>{row.counted}</b> · matches schedule</span>}
                            {bad && <span style={{ color: RED, fontWeight: 700 }}>Counted {row.counted} vs scheduled {row.scheduled ?? '—'}</span>}
                            {row.status === 'not_found' && <span>Counted {row.counted} · not on any schedule found</span>}
                            {row.note && <span style={{ color: DIM }}>· {row.note}</span>}
                          </div>
                          {row.source?.route && (
                            <a href={row.source.route} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12, fontWeight: 700, color: '#FBBF24', textDecoration: 'none' }}>
                              <ArrowSquareOut size={13} weight="bold" />{row.source.source || 'View source'}
                            </a>
                          )}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: col, flexShrink: 0 }}>{ok ? 'Match' : bad ? 'Mismatch' : 'Not found'}</span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </SectionCard>

        {/* markup — full defensible stack */}
        <SectionCard title="Markup & basis of estimate" subtitle="Overhead, profit, contingency, tax, burden, bond, and region index." icon={<Receipt size={17} weight="duotone" color={GOLD} />} style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[['OH %', oh, setOh], ['Profit %', pr, setPr], ['Cont %', cont, setCont], ['Tax %', taxP, setTaxP], ['Burden %', burdenP, setBurdenP], ['Gen Cond %', gcP, setGcP], ['Bond %', bondP, setBondP], ['Bldg SF', bsf, setBsf]].map(([lbl, val, set]: any) => (
            <label key={lbl} style={{ flex: 1, minWidth: 84 }}><span style={{ fontSize: 12, color: DIM }}>{lbl}</span><input value={val} onChange={(e) => set(e.target.value)} style={{ ...inp, marginTop: 4 }} /></label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ flex: 1, minWidth: 110 }}><span style={{ fontSize: 12, color: DIM }}>Region index (CCI)</span><input placeholder="1.00" value={regMult} onChange={(e) => setRegMult(e.target.value)} title="City cost index — scales the national catalog + default crew wages; your own rates stay untouched" style={{ ...inp, marginTop: 4 }} /></label>
          <label style={{ flex: 2, minWidth: 150 }}><span style={{ fontSize: 12, color: DIM }}>Region label</span><input placeholder="Phoenix, AZ · CCI 0.96" value={regLabel} onChange={(e) => setRegLabel(e.target.value)} style={{ ...inp, marginTop: 4 }} /></label>
          <label style={{ flex: 1, minWidth: 120 }}><span style={{ fontSize: 12, color: DIM }}>AACE class</span>
            <select value={aaceClass} onChange={(e) => setAaceClass(+e.target.value as 1 | 2 | 3 | 4 | 5)} style={{ ...inp, marginTop: 4 }}>
              {[[5, 'Class 5 · Concept'], [4, 'Class 4 · Schematic'], [3, 'Class 3 · Budget/DD'], [2, 'Class 2 · Control'], [1, 'Class 1 · Bid/GMP']].map(([v, l]) => <option key={v as number} value={v as number}>{l}</option>)}
            </select>
          </label>
        </div>

        {/* editable proposal fine print (one item per line) — the GC submits THEIR qualifications */}
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, color: DIM, fontWeight: 700 }}>Proposal fine print — allowances · clarifications · exclusions</summary>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            {[['Allowances', allowancesTxt, setAllowancesTxt, '$25,000 owner-selected fixtures'], ['Clarifications', clarifTxt, setClarifTxt, 'Normal hours, unrestricted access'], ['Exclusions', exclusionsTxt, setExclusionsTxt, 'Permits & impact fees']].map(([lbl, val, set, ph]: any) => (
              <label key={lbl} style={{ flex: 1, minWidth: 180 }}><span style={{ fontSize: 11.5, color: DIM, fontWeight: 700 }}>{lbl} (one per line)</span>
                <textarea value={val} onChange={(e) => set(e.target.value)} placeholder={ph} rows={3} style={{ ...inp, marginTop: 4, resize: 'vertical', fontFamily: 'inherit' }} /></label>
            ))}
          </div>
        </details>
        </SectionCard>

        {/* sanity */}
        {r.sanity.map((f, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 8, padding: '9px 12px', borderRadius: 8, border: `1px solid ${f.level === 'warn' ? 'rgba(245,158,11,0.4)' : LINE}`, background: PANEL, fontSize: 13, color: f.level === 'warn' ? GOLD : DIM }}>{f.level === 'warn' ? <Ic name="warnTri" s={17} k={`sn${i}`} /> : <span style={{ width: 7, height: 7, borderRadius: 4, background: DIM, flexShrink: 0 }} />}{f.message}</div>)}

        {/* divisions */}
        {r.byDivision.length > 0 && (
          <SectionCard flat title="By Division" icon={<Stack size={17} weight="duotone" color={GOLD} />} style={{ marginTop: 14 }}>
            {r.byDivision.map((d) => <div key={d.trade} style={{ display: 'flex', padding: '6px 0', borderBottom: `1px solid ${LINE}` }}><span style={{ flex: 1 }}>{d.trade}</span><span style={{ color: DIM, marginRight: 14, fontSize: 13 }}>{d.lines} lines</span><span style={{ fontWeight: 700 }}>{usd(d.totalCents)}</span></div>)}
          </SectionCard>
        )}

        {/* add condition */}
        <SectionCard title="Add Condition" icon={<Ruler size={17} weight="duotone" color={GOLD} />} style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {KINDS.map((k) => <button key={k.k} onClick={() => { setCKind(k.k); setCAsm(asmList(k.k)[0]?.id || ''); setCPts(null); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 8, border: `1px solid ${cKind === k.k ? GOLD : LINE}`, background: cKind === k.k ? 'rgba(245,158,11,0.14)' : 'transparent', color: cKind === k.k ? GOLD : TEXT, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}><Ic name={k.k === 'area' ? 'areaPoly' : k.k === 'linear' ? 'ruler' : 'aiCount'} s={17} k={`kind${k.k}`} />{k.label} · {k.unit}</button>)}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input placeholder="Name (optional)" value={cName} onChange={(e) => setCName(e.target.value)} style={{ ...inp, flex: 2, minWidth: 160 }} />
            <input placeholder={`Measured ${KINDS.find((k) => k.k === cKind)?.unit}`} value={cVal} onChange={(e) => setCVal(e.target.value)} style={{ ...inp, flex: 1, minWidth: 100 }} />
            {cKind !== 'count' && <input placeholder="Height ft" value={cH} onChange={(e) => setCH(e.target.value)} style={{ ...inp, flex: 1, minWidth: 80 }} />}
            {cKind === 'area' && <input placeholder="Thick in" value={cT} onChange={(e) => setCT(e.target.value)} style={{ ...inp, flex: 1, minWidth: 80 }} />}
          </div>
          <select value={cAsm} onChange={(e) => setCAsm(e.target.value)} style={{ ...inp, marginTop: 8 }}>
            {asmList(cKind).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.components.length} components)</option>)}
          </select>

          {/* Advanced (optional): typical instances · location · note/assumption · add/deduct alternate */}
          <button onClick={() => setAdvOpen((o) => !o)} style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: DIM, cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
            {advOpen ? <ArrowLeft size={13} weight="bold" style={{ transform: 'rotate(90deg)' }} /> : <ArrowRight size={13} weight="bold" style={{ transform: 'rotate(90deg)' }} />}
            Advanced — typical count, location, note, alternate
          </button>
          {advOpen && (
            <div style={{ marginTop: 8, border: `1px dashed ${LINE}`, borderRadius: 10, padding: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: DIM, fontWeight: 700, minWidth: 66 }}>Typical ×</span>
                <input placeholder="1" value={cInst} onChange={(e) => setCInst(e.target.value)} title="Measure one, apply to N identical — multiplies qty + labor" style={{ ...inp, width: 70 }} />
                <span style={{ fontSize: 11.5, color: DIM }}>identical instances</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input placeholder="Building" value={cBldg} onChange={(e) => setCBldg(e.target.value)} style={{ ...inp, flex: 1, minWidth: 80 }} />
                <input placeholder="Level" value={cLevel} onChange={(e) => setCLevel(e.target.value)} style={{ ...inp, flex: 1, minWidth: 70 }} />
                <input placeholder="Zone" value={cZone} onChange={(e) => setCZone(e.target.value)} style={{ ...inp, flex: 1, minWidth: 70 }} />
              </div>
              <input placeholder="Note / assumption (surfaces in the proposal + open-questions)" value={cNote} onChange={(e) => setCNote(e.target.value)} style={{ ...inp }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input placeholder="Alternate label (e.g. ALT-1 upgrade flooring)" value={cAlt} onChange={(e) => setCAlt(e.target.value)} style={{ ...inp, flex: 1, minWidth: 160 }} />
                {cAlt.trim() && (['add', 'deduct'] as const).map((t) => (
                  <button key={t} onClick={() => setCAltType(t)} style={{ ...pillBtn, textTransform: 'capitalize', background: cAltType === t ? (t === 'add' ? '#2f6bff' : '#c0392b') : 'transparent', color: cAltType === t ? '#fff' : TEXT, border: cAltType === t ? 'none' : `1px solid ${LINE}` }}>{t}</button>
                ))}
              </div>
            </div>
          )}

          <button onClick={openTracer} style={{ marginTop: 8, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: `1px solid rgba(245,158,11,0.35)`, background: 'rgba(245,158,11,0.08)', color: GOLD, borderRadius: 8, padding: '10px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}><Ic name="penTrace" s={18} k="tracebtn" />Open Plan Tracer → zoom, snap, measure &amp; price on the drawing</button>
          {cPts && cPts.length ? <div style={{ color: DIM, fontSize: 12, marginTop: 4 }}>✓ Traced from plan ({cPts.length} points) — value + geometry saved</div> : null}
          <button onClick={addCond} style={{ ...btn, marginTop: 10 }}>+ Add condition manually</button>
        </SectionCard>

        {/* conditions list */}
        {conditions.length > 0 && (
          <div ref={promotedCardRef}>
          <SectionCard title="Conditions" icon={<Stack size={17} weight="duotone" color={GOLD} />} style={{ marginTop: 18 }}>
            {conditions.map((c) => {
              const lines = r.lines.filter((l) => l.conditionId === c.id);
              const tot = lines.reduce((x, l) => x + l.totalCents, 0);
              const unit = KINDS.find((k) => k.k === c.kind)?.unit;
              return (
                <div key={c.id} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                    <div style={{ flex: 1 }}><b>{c.name}</b>
                      {c.instanceCount && c.instanceCount > 1 ? <span style={{ marginLeft: 7, fontSize: 10.5, fontWeight: 800, color: '#16794a', background: '#eef7ee', borderRadius: 5, padding: '1px 6px' }}>×{c.instanceCount}</span> : null}
                      {(c.building || c.level || c.zone) ? <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: DIM, border: `1px solid ${LINE}`, borderRadius: 5, padding: '1px 6px' }}>{[c.building, c.level && `L${c.level}`, c.zone].filter(Boolean).join('·')}</span> : null}
                      {c.alternate ? <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: c.alternateType === 'deduct' ? '#c0392b' : '#2f6bff', background: c.alternateType === 'deduct' ? 'rgba(192,57,43,0.12)' : 'rgba(47,107,255,0.12)', borderRadius: 5, padding: '1px 6px' }}>ALT {c.alternateType === 'deduct' ? '−' : '+'}</span> : null}
                      {c.note ? <span title={c.note} style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: GOLD, border: `1px solid rgba(245,158,11,0.35)`, borderRadius: 5, padding: '1px 6px' }}>note</span> : null}
                      <div style={{ color: DIM, fontSize: 13, marginTop: 2, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>{c.value > 0
                      ? <span>{c.value} {unit}{c.heightFt ? ` · ${c.heightFt}′` : ''}{c.thicknessIn ? ` · ${c.thicknessIn}″` : ''} → {lines.length} items</span>
                      : <><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: GOLD, background: 'rgba(245,158,11,0.12)', border: `1px solid rgba(245,158,11,0.35)`, borderRadius: 20, padding: '2px 8px' }}><Ruler size={12} weight="bold" />needs measurement</span><span>{ASSEMBLIES[c.assemblyId]?.name}</span></>}</div></div>
                    {/* inline qty editor + targeted Trace — a template/library condition is never a dead end */}
                    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 12, flexShrink: 0 }}>
                      {/* Unassigned row (e.g. promoted from Drawings without an assembly) — pick one to
                          price it; the row is never silently $0 without this gold picker in view */}
                      {!ASSEMBLIES[c.assemblyId] && (
                        <select value="" title="No assembly yet — pick one to price this measurement"
                          onChange={(e) => { const v = e.target.value; if (!v) return; setConditions((cs) => cs.map((x) => (x.id === c.id ? { ...x, assemblyId: v } : x))); }}
                          style={{ ...inp, width: 168, padding: '7px 9px', fontSize: 12, fontWeight: 700, color: GOLD, border: '1px solid rgba(245,158,11,0.5)' }}>
                          <option value="">Assembly…</option>
                          {asmList(c.kind).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      )}
                      <input inputMode="decimal" placeholder="qty" value={qtyDraft[c.id] ?? (c.value > 0 ? String(c.value) : '')} onChange={(e) => setCondQty(c.id, e.target.value)} onBlur={() => commitQtyDraft(c.id)}
                        title={`Quantity in ${unit} — type it, or hit Trace to measure it on the plan`}
                        style={{ ...inp, width: 84, padding: '7px 9px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
                      <span style={{ fontSize: 11, color: DIM, fontWeight: 700, minWidth: 18 }}>{unit}</span>
                      <button onClick={() => traceCondition(c.id)} title="Open the tracer targeted at this condition — the next finished trace sets its quantity"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)', color: GOLD, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                        <Ic name="penTrace" s={14} k={`tr_${c.id}`} />Trace
                      </button>
                    </div>
                    <b style={{ color: GOLD, marginRight: 14 }}>{usd(tot)}</b>
                    <button onClick={(e) => { e.stopPropagation(); setConditions((cs) => cs.filter((x) => x.id !== c.id)); }} style={{ background: 'none', border: 'none', color: RED, fontSize: 20, cursor: 'pointer' }}>×</button>
                  </div>
                  {expanded === c.id && <div style={{ marginTop: 10, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>{lines.map((l, i) => <div key={i} style={{ display: 'flex', padding: '4px 0', fontSize: 13 }}><span style={{ flex: 1 }}>{l.name}</span><span style={{ color: DIM, marginRight: 12 }}>{l.qty} {l.unit}</span><span style={{ fontWeight: 600 }}>{usd(l.totalCents)}</span></div>)}</div>}
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inp, flex: 1, minWidth: 180 }} />
              <button onClick={save} disabled={saving} style={{ ...btn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save measured takeoff'}</button>
            </div>
          </SectionCard>
          </div>
        )}
      </div>
      </PremiumSurface>

      {wizardOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(3,5,8,0.82)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 720, maxHeight: '92vh', overflowY: 'auto', background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, boxShadow: '0 24px 70px rgba(0,0,0,0.6)' }}>
            {/* step rail */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${LINE}`, position: 'sticky', top: 0, background: PANEL, borderTopLeftRadius: 18, borderTopRightRadius: 18 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD, fontWeight: 800 }}>First takeoff · 60-second start</div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                {WIZ_STEPS.map((s, i) => <span key={s} title={s} style={{ width: i === wizStep ? 22 : 8, height: 8, borderRadius: 4, background: i === wizStep ? GOLD : i < wizStep ? GREEN : 'rgba(255,255,255,0.15)', transition: 'all .2s' }} />)}
              </div>
              <button onClick={closeWizard} title="Close" style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', display: 'inline-flex' }}><IconX size={20} /></button>
            </div>

            <div style={{ padding: 20 }}>
              {wizStep === 0 && (
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>Pick a starting point</div>
                  <div style={{ fontSize: 13.5, color: DIM, marginTop: 4, lineHeight: 1.5 }}>Choose the building type — we drop the conditions that type almost always needs (value 0, ready to measure). Or start blank.</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 9, marginTop: 14 }}>
                    {BUILDING_TEMPLATES.map((t) => { const IconC = TPL_ICON[t.id] || Buildings; const active = activeTemplate === t.id; return (
                      <button key={t.id} onClick={() => { dropTemplate(t.id); setWizStep(1); }} style={{ textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center', border: `1px solid ${active ? GOLD : LINE}`, background: active ? 'rgba(245,158,11,0.10)' : BG, borderRadius: 12, padding: '11px 12px', cursor: 'pointer' }}>
                        <IconC size={22} weight="duotone" color={GOLD} />
                        <div style={{ minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 13.5, color: TEXT }}>{t.name}</div><div style={{ fontSize: 11, color: DIM }}>{t.conditions.length} conditions</div></div>
                      </button>
                    ); })}
                    <button onClick={() => { chooseBlank(); setWizStep(1); }} style={{ textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center', border: `1px dashed ${LINE}`, background: 'transparent', borderRadius: 12, padding: '11px 12px', cursor: 'pointer' }}>
                      <FileDashed size={22} weight="duotone" color={DIM} />
                      <div><div style={{ fontWeight: 800, fontSize: 13.5, color: TEXT }}>Blank</div><div style={{ fontSize: 11, color: DIM }}>Start empty</div></div>
                    </button>
                  </div>
                </div>
              )}

              {wizStep === 1 && (
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>Bring your plans</div>
                  <div style={{ fontSize: 13.5, color: DIM, marginTop: 4, lineHeight: 1.5 }}>Get the drawing in three ways — or skip and key quantities in by hand.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                    <button onClick={() => blueprintInputRef.current?.click()} style={wizRow}>
                      <FilePdf size={26} weight="duotone" color={GOLD} />
                      <div style={{ flex: 1 }}><div style={wizRowT}>Read the full blueprint (AI)</div><div style={wizRowD}>Upload the whole plan-set PDF — every sheet read, all conditions extracted &amp; priced.</div></div>
                      <ArrowRight size={16} color={DIM} />
                    </button>
                    <button onClick={() => { closeWizard(); openTracer(); }} style={wizRow}>
                      <PencilSimpleLine size={26} weight="duotone" color={GOLD} />
                      <div style={{ flex: 1 }}><div style={wizRowT}>Open the Plan Tracer</div><div style={wizRowD}>Drop a PDF or image and measure right on the drawing — zoom, snap, auto-count &amp; fill.</div></div>
                      <ArrowRight size={16} color={DIM} />
                    </button>
                    <button onClick={() => setWizStep(3)} style={wizRow}>
                      <Stack size={26} weight="duotone" color={GOLD} />
                      <div style={{ flex: 1 }}><div style={wizRowT}>Enter quantities manually</div><div style={wizRowD}>Already have your numbers? Skip ahead and type them into the add-condition form.</div></div>
                      <ArrowRight size={16} color={DIM} />
                    </button>
                  </div>
                </div>
              )}

              {wizStep === 2 && (
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>Set the scale</div>
                  <div style={{ fontSize: 13.5, color: DIM, marginTop: 4, lineHeight: 1.5 }}>Two clicks a known distance apart calibrate the drawing so every trace prices in real feet.</div>
                  {ppf > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 14, padding: 14, borderRadius: 12, border: `1px solid rgba(52,211,153,0.4)`, background: 'rgba(52,211,153,0.06)' }}>
                      <CheckCircle size={24} weight="fill" color={GREEN} />
                      <div><div style={{ fontWeight: 800, color: TEXT }}>Scale is set — {ppf.toFixed(2)} px/ft</div><div style={{ fontSize: 12.5, color: DIM }}>You&apos;re calibrated. Trace conditions and they price live.</div></div>
                    </div>
                  ) : (
                    <button onClick={() => { closeWizard(); openTracer(); }} style={{ ...wizRow, marginTop: 14 }}>
                      <Ruler size={26} weight="duotone" color={GOLD} />
                      <div style={{ flex: 1 }}><div style={wizRowT}>Open the Plan Tracer on the Scale tool</div><div style={wizRowD}>Click two points a known distance apart, type the feet — a sanity check catches a fat-fingered scale.</div></div>
                      <ArrowRight size={16} color={DIM} />
                    </button>
                  )}
                </div>
              )}

              {wizStep === 3 && (
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>Your live estimate</div>
                  <div style={{ fontSize: 13.5, color: DIM, marginTop: 4, lineHeight: 1.5 }}>Every measured condition rolls up here instantly. Hand a client-ready proposal PDF in one tap.</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, padding: 16, borderRadius: 12, border: `1px solid rgba(245,158,11,0.3)`, background: 'rgba(245,158,11,0.06)' }}>
                    <ConfidenceRing score={confidence.score} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 30, fontWeight: 800, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{usd(r.sellCents)}</div>
                      <div style={{ fontSize: 12.5, color: DIM }}>{conditions.length} conditions · {r.lines.length} priced components · confidence {confidence.score}%</div>
                      <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{confidence.reasons[0]}</div>
                    </div>
                  </div>
                  <button onClick={exportEstimate} disabled={!conditions.length} style={{ marginTop: 12, width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, border: 'none', borderRadius: 10, padding: '13px', cursor: conditions.length ? 'pointer' : 'not-allowed', opacity: conditions.length ? 1 : 0.5, fontWeight: 800, fontSize: 15, color: '#0a0a0a', background: 'linear-gradient(135deg,#F7C948,#D4A017)' }}>
                    <Receipt size={19} weight="bold" color="#0a0a0a" />Client Estimate PDF
                  </button>
                </div>
              )}
            </div>

            {/* footer nav */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderTop: `1px solid ${LINE}`, position: 'sticky', bottom: 0, background: PANEL, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 }}>
              <button onClick={() => (wizStep === 0 ? closeWizard() : setWizStep((s) => s - 1))} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', color: TEXT, border: `1px solid ${LINE}`, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{wizStep === 0 ? 'Skip' : <><ArrowLeft size={15} weight="bold" />Back</>}</button>
              <span style={{ marginLeft: 'auto', fontSize: 12.5, color: DIM }}>Step {wizStep + 1} of {WIZ_STEPS.length} · {WIZ_STEPS[wizStep]}</span>
              {wizStep < 3
                ? <button onClick={() => setWizStep((s) => s + 1)} style={{ ...btn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>Next<ArrowRight size={15} weight="bold" color="#0a0a0a" /></button>
                : <button onClick={closeWizard} style={{ ...btn, display: 'inline-flex', alignItems: 'center', gap: 6 }}><CheckCircle size={16} weight="bold" color="#0a0a0a" />Start estimating</button>}
            </div>
          </div>
        </div>
      )}

      {comparing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 50, display: 'flex', flexDirection: 'column', padding: 16, overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <button onClick={() => setComparing(false)} style={{ ...btn, background: 'transparent', color: TEXT, border: `1px solid ${LINE}` }}>Close</button>
            <b style={{ fontSize: 17 }}>Compare plan revisions</b>
            <button onClick={runCompare} disabled={!revA || !revB || revBusy} style={{ ...btn, marginLeft: 'auto', opacity: (!revA || !revB || revBusy) ? 0.5 : 1 }}>{revBusy ? 'Comparing…' : 'Compare'}</button>
          </div>
          <div style={{ maxWidth: 920, margin: '0 auto', width: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {(['A', 'B'] as const).map((w) => {
                const url = w === 'A' ? revA : revB;
                return (
                  <label key={w} style={{ border: `1.5px dashed ${url ? GOLD : LINE}`, borderRadius: 12, minHeight: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', background: PANEL, padding: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: url ? GOLD : DIM, textTransform: 'uppercase', marginBottom: 6 }}>{w === 'A' ? 'Old revision' : 'New revision'}</div>
                    {url ? <img src={url} alt={w} style={{ maxWidth: '100%', maxHeight: 230, display: 'block', borderRadius: 6 }} /> : <span style={{ color: DIM, fontSize: 13 }}>Click to upload a sheet image</span>}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { pickRev(w, e.target.files?.[0]); (e.target as HTMLInputElement).value = ''; }} />
                  </label>
                );
              })}
            </div>
            {revResult && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', padding: '4px 10px', borderRadius: 20, background: revResult.netScope === 'increase' ? 'rgba(248,113,113,0.15)' : revResult.netScope === 'decrease' ? 'rgba(52,211,153,0.15)' : 'rgba(139,148,158,0.15)', color: revResult.netScope === 'increase' ? RED : revResult.netScope === 'decrease' ? GREEN : DIM }}>Net scope: {revResult.netScope}</span>
                  <span style={{ color: DIM, fontSize: 13 }}>{revResult.changes.length} changes found</span>
                </div>
                <div style={{ color: TEXT, fontSize: 14, marginBottom: 12, lineHeight: 1.5 }}>{revResult.summary}</div>
                {revResult.changes.map((c, i) => (
                  <div key={i} style={{ background: PANEL, border: `1px solid ${LINE}`, borderLeft: `3px solid ${impactColor(c.costImpact)}`, borderRadius: 8, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: c.type === 'added' ? GREEN : c.type === 'removed' ? RED : GOLD }}>{c.type}</span>
                      {c.trade ? <span style={{ color: DIM, fontSize: 12 }}>{c.trade}</span> : null}
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: impactColor(c.costImpact) }}>{c.costImpact === 'increase' ? 'adds cost' : c.costImpact === 'decrease' ? 'saves cost' : 'neutral'}{c.confidence != null ? ` · ${c.confidence}%` : ''}</span>
                    </div>
                    <div style={{ color: TEXT, fontSize: 13.5, marginTop: 4 }}>{c.description}</div>
                    {c.location ? <div style={{ color: DIM, fontSize: 12, marginTop: 2 }}>{c.location}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CSV/Excel import review — editable per-row assembly mapping ── */}
      {qtyReview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(3,5,8,0.86)', zIndex: 78, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 900, maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${LINE}` }}>
              <Table size={22} weight="duotone" color={GREEN} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Review import · {qtyReview.fileName}</div>
                <div style={{ fontSize: 12.5, color: DIM }}>{qtyReview.rows.length} rows parsed · {qtyAddable} mapped to an assembly · edit any mapping below</div>
              </div>
              <button onClick={() => setQtyReview(null)} title="Close" style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', display: 'inline-flex' }}><IconX size={20} /></button>
            </div>
            {qtyReview.warnings.length > 0 && (
              <div style={{ padding: '10px 20px', borderBottom: `1px solid ${LINE}`, background: 'rgba(245,158,11,0.06)', maxHeight: 96, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {qtyReview.warnings.map((w, i) => <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, color: GOLD, lineHeight: 1.4 }}><WarningCircle size={15} weight="bold" style={{ flexShrink: 0, marginTop: 1 }} />{w}</div>)}
              </div>
            )}
            <div style={{ overflow: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Description', 'Qty', 'Unit', 'CSI', 'Assembly (prices live)'].map((h) => <th key={h} style={{ position: 'sticky', top: 0, background: PANEL, textAlign: 'left', padding: '9px 12px', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: DIM, fontWeight: 700, borderBottom: `1px solid ${LINE}`, zIndex: 1 }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {qtyReview.rows.map((row, i) => {
                    const unmatched = !row.assemblyId;
                    return (
                      <tr key={i} style={{ background: unmatched ? 'rgba(248,113,113,0.07)' : 'transparent', borderBottom: `1px solid ${LINE}` }}>
                        <td style={{ padding: '7px 12px', color: TEXT, maxWidth: 280 }}>{row.description}{row.unitCostCents ? <span style={{ color: DIM, fontSize: 11 }}> · ${(row.unitCostCents / 100).toFixed(2)}/{row.unit}</span> : null}</td>
                        <td style={{ padding: '7px 12px', fontVariantNumeric: 'tabular-nums', fontWeight: 600, whiteSpace: 'nowrap' }}>{row.qty.toLocaleString()}</td>
                        <td style={{ padding: '7px 12px', color: DIM }}>{row.unit}</td>
                        <td style={{ padding: '7px 12px', color: DIM, whiteSpace: 'nowrap' }}>{row.csi || '—'}</td>
                        <td style={{ padding: '7px 12px', minWidth: 220 }}>
                          <select value={row.assemblyId} onChange={(e) => setQtyReview((r) => r ? { ...r, rows: r.rows.map((x, j) => j === i ? { ...x, assemblyId: e.target.value } : x) } : r)} style={{ ...inp, padding: '6px 8px', border: `1px solid ${unmatched ? 'rgba(248,113,113,0.5)' : LINE}` }}>
                            <option value="">— unmapped (won&apos;t import) —</option>
                            {catalog.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderTop: `1px solid ${LINE}`, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12.5, color: DIM }}>Unmatched rows are highlighted — pick an assembly to include them.</div>
              <button onClick={() => setQtyReview(null)} style={{ marginLeft: 'auto', background: 'transparent', color: TEXT, border: `1px solid ${LINE}`, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
              <button onClick={addQtyConditions} disabled={!qtyAddable} style={{ ...btn, opacity: qtyAddable ? 1 : 0.5, cursor: qtyAddable ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 7 }}><CheckCircle size={17} weight="bold" color="#0a0a0a" />Add {qtyAddable} condition{qtyAddable === 1 ? '' : 's'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DXF import review — pick assembly per area / linear / count bucket ── */}
      {dxfReview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(3,5,8,0.86)', zIndex: 78, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${LINE}`, position: 'sticky', top: 0, background: PANEL, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
              <Cube size={22} weight="duotone" color={GOLD} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Import CAD · {dxfReview.fileName}</div>
                <div style={{ fontSize: 12.5, color: DIM }}>Units: <b style={{ color: TEXT }}>{DXF_UNIT_LABEL[dxfReview.insUnits ?? 0] || 'unitless (assumed feet)'}</b> · {dxfReview.entityCount} entities · exact quantities, no tracing</div>
              </div>
              <button onClick={() => setDxfReview(null)} title="Close" style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', display: 'inline-flex' }}><IconX size={20} /></button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {dxfReview.warnings.map((w, i) => <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12.5, color: GOLD, background: 'rgba(245,158,11,0.06)', border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 8, padding: '8px 10px', lineHeight: 1.4 }}><WarningCircle size={16} weight="bold" style={{ flexShrink: 0, marginTop: 1 }} />{w}</div>)}

              {/* Areas bucket */}
              <div style={{ border: `1px solid ${dxfInc.area && dxfReview.areas.length ? GOLD : LINE}`, borderRadius: 12, padding: 14, background: dxfInc.area && dxfReview.areas.length ? 'rgba(245,158,11,0.06)' : 'transparent', opacity: dxfReview.areas.length ? 1 : 0.5 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: dxfReview.areas.length ? 'pointer' : 'not-allowed' }}>
                  <input type="checkbox" checked={dxfInc.area && dxfReview.areas.length > 0} disabled={!dxfReview.areas.length} onChange={(e) => setDxfInc((s) => ({ ...s, area: e.target.checked }))} style={{ accentColor: GOLD, width: 16, height: 16, flexShrink: 0 }} />
                  <Polygon size={20} weight="duotone" color={GOLD} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Areas · {dxfReview.areas.length} closed shape{dxfReview.areas.length === 1 ? '' : 's'}</div>
                    <div style={{ fontSize: 12, color: DIM }}>{dxfReview.totalAreaSF.toLocaleString()} SF total → one Area condition per shape</div>
                  </div>
                </label>
                {dxfInc.area && dxfReview.areas.length > 0 && (
                  <select value={dxfAreaAsm} onChange={(e) => setDxfAreaAsm(e.target.value)} style={{ ...inp, marginTop: 10 }}>
                    {asmList('area').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
              </div>

              {/* Linear bucket */}
              <div style={{ border: `1px solid ${dxfInc.linear && dxfReview.linearLF > 0 ? GOLD : LINE}`, borderRadius: 12, padding: 14, background: dxfInc.linear && dxfReview.linearLF > 0 ? 'rgba(245,158,11,0.06)' : 'transparent', opacity: dxfReview.linearLF > 0 ? 1 : 0.5 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: dxfReview.linearLF > 0 ? 'pointer' : 'not-allowed' }}>
                  <input type="checkbox" checked={dxfInc.linear && dxfReview.linearLF > 0} disabled={dxfReview.linearLF <= 0} onChange={(e) => setDxfInc((s) => ({ ...s, linear: e.target.checked }))} style={{ accentColor: GOLD, width: 16, height: 16, flexShrink: 0 }} />
                  <Ruler size={20} weight="duotone" color={GOLD} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Linear · {dxfReview.linearLF.toLocaleString()} LF</div>
                    <div style={{ fontSize: 12, color: DIM }}>All lines + polyline edges → one Linear condition</div>
                  </div>
                </label>
                {dxfInc.linear && dxfReview.linearLF > 0 && (
                  <select value={dxfLinearAsm} onChange={(e) => setDxfLinearAsm(e.target.value)} style={{ ...inp, marginTop: 10 }}>
                    {asmList('linear').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
              </div>

              {/* Count bucket (optional) */}
              {(dxfReview.circleCount + dxfReview.arcCount) > 0 && (
                <div style={{ border: `1px solid ${dxfInc.count ? GOLD : LINE}`, borderRadius: 12, padding: 14, background: dxfInc.count ? 'rgba(245,158,11,0.06)' : 'transparent' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={dxfInc.count} onChange={(e) => setDxfInc((s) => ({ ...s, count: e.target.checked }))} style={{ accentColor: GOLD, width: 16, height: 16, flexShrink: 0 }} />
                    <Stack size={20} weight="duotone" color={GOLD} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Symbols · {dxfReview.circleCount} circles + {dxfReview.arcCount} arcs</div>
                      <div style={{ fontSize: 12, color: DIM }}>Optional — one Count condition of {dxfReview.circleCount + dxfReview.arcCount} EA</div>
                    </div>
                  </label>
                  {dxfInc.count && (
                    <select value={dxfCountAsm} onChange={(e) => setDxfCountAsm(e.target.value)} style={{ ...inp, marginTop: 10 }}>
                      {asmList('count').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderTop: `1px solid ${LINE}`, position: 'sticky', bottom: 0, background: PANEL, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: DIM, display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 320 }}><MagicWand size={15} weight="duotone" color={GOLD} />DXF gives exact quantities — no scale or tracing needed.</div>
              <button onClick={() => setDxfReview(null)} style={{ marginLeft: 'auto', background: 'transparent', color: TEXT, border: `1px solid ${LINE}`, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
              <button onClick={addDxfConditions} style={{ ...btn, display: 'inline-flex', alignItems: 'center', gap: 7 }}><CheckCircle size={17} weight="bold" color="#0a0a0a" />Add conditions</button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI REVIEW QUEUE — AI proposes, YOU confirm: count-symbols output lands here first, never straight into conditions ── */}
      {reviewQueue && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(3,5,8,0.86)', zIndex: 79, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 820, maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${LINE}` }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(56,189,248,0.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sparkle size={21} weight="duotone" color="#FBBF24" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Review AI counts · {reviewQueue.source}</div>
                <div style={{ fontSize: 12.5, color: DIM }}>AI proposed {reviewQueue.items.length} count{reviewQueue.items.length === 1 ? '' : 's'} — confirm, remap, or reject. Only accepted, mapped rows are added.</div>
              </div>
              <button onClick={() => setReviewQueue(null)} title="Close" style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', display: 'inline-flex' }}><IconX size={20} /></button>
            </div>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${LINE}`, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => setReviewQueue((q) => q ? { ...q, items: q.items.map((it) => ({ ...it, accept: !!(it.assemblyId && ASSEMBLIES[it.assemblyId] && it.count > 0) })) } : q)} style={pillBtn}>Accept all mappable</button>
              <button onClick={() => setReviewQueue((q) => q ? { ...q, items: q.items.map((it) => ({ ...it, accept: false })) } : q)} style={pillBtn}>Reject all</button>
              <span style={{ marginLeft: 'auto', fontSize: 11.5, color: DIM }}>Confidence: AI-reported where available, else estimated from assembly match + qty.</span>
            </div>
            <div style={{ overflow: 'auto', flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reviewQueue.items.map((it) => {
                const mapped = !!(it.assemblyId && ASSEMBLIES[it.assemblyId]);
                return (
                  <div key={it.id} style={{ border: `1px solid ${it.accept ? 'rgba(52,211,153,0.4)' : LINE}`, background: it.accept ? 'rgba(52,211,153,0.05)' : BG, borderRadius: 12, padding: '11px 13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <button onClick={() => patchReview(it.id, { accept: !it.accept })} title={it.accept ? 'Accepted — click to reject' : 'Rejected — click to accept'}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${it.accept ? GREEN : LINE}`, background: it.accept ? 'rgba(52,211,153,0.14)' : 'transparent', color: it.accept ? GREEN : DIM, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 800, fontSize: 12.5, flexShrink: 0 }}>
                        {it.accept ? <CheckCircle size={15} weight="fill" color={GREEN} /> : <XCircle size={15} weight="bold" />}{it.accept ? 'Accept' : 'Reject'}
                      </button>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{it.label}</div>
                        <div style={{ fontSize: 12, color: DIM }}>{it.count} EA{it.csi ? ` · CSI ${it.csi}` : ''}</div>
                      </div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color: confColor(it.confidence), background: 'rgba(255,255,255,0.04)', border: `1px solid ${confColor(it.confidence)}55`, borderRadius: 20, padding: '3px 9px', flexShrink: 0 }}>
                        {it.confidence < 45 && <WarningCircle size={12} weight="bold" />}{it.aiConf ? 'AI' : 'est.'} {it.confidence}%
                      </span>
                    </div>
                    <select value={it.assemblyId} onChange={(e) => patchReview(it.id, { assemblyId: e.target.value })} style={{ ...inp, marginTop: 9, padding: '7px 9px', border: `1px solid ${mapped ? LINE : 'rgba(248,113,113,0.5)'}` }}>
                      <option value="">— pick an assembly (required to add) —</option>
                      {asmList('count').map((a) => <option key={a.id} value={a.id}>{a.name} ({a.components.length} components)</option>)}
                    </select>
                    {it.accept && !mapped && <div style={{ marginTop: 6, fontSize: 11.5, color: RED, display: 'inline-flex', alignItems: 'center', gap: 5 }}><WarningCircle size={13} weight="bold" />Accepted but unmapped — pick an assembly or it won&apos;t be added.</div>}
                    {!it.accept && mapped && it.confidence < 70 && <div style={{ marginTop: 6, fontSize: 11.5, color: GOLD, display: 'inline-flex', alignItems: 'center', gap: 5 }}><WarningCircle size={13} weight="bold" />Low confidence — verify the count on the sheet before accepting.</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderTop: `1px solid ${LINE}`, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12.5, color: DIM }}>{reviewAddable} of {reviewQueue.items.length} ready to add.</div>
              <button onClick={() => setReviewQueue(null)} style={{ marginLeft: 'auto', background: 'transparent', color: TEXT, border: `1px solid ${LINE}`, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
              <button onClick={commitReview} disabled={!reviewAddable} style={{ ...btn, opacity: reviewAddable ? 1 : 0.5, cursor: reviewAddable ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 7 }}><CheckCircle size={17} weight="bold" color="#0a0a0a" />Add {reviewAddable} accepted</button>
            </div>
          </div>
        </div>
      )}

      {/* fixed bottom estimate bar — sell + Save stay in view once conditions exist (replaces the dead sticky) */}
      {conditions.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: barRect.left, ...(barRect.width ? { width: barRect.width } : { right: 0 }), zIndex: 40, background: 'rgba(13,17,23,0.94)', backdropFilter: 'blur(8px)', borderTop: '1px solid rgba(245,158,11,0.4)', boxShadow: '0 -10px 30px rgba(0,0,0,0.45)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: DIM, fontWeight: 700 }}>Sell price · live</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: GOLD, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{usd(r.sellCents)}</div>
          </div>
          <div style={{ fontSize: 11.5, color: DIM }}>{conditions.length} condition{conditions.length === 1 ? '' : 's'} · {r.lines.length} items</div>
          {savedTakeoffId ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: GREEN }}><CheckCircle size={13} weight="fill" />saved</span> : null}
          <button onClick={save} disabled={saving} style={{ ...btn, marginLeft: 'auto', padding: '10px 16px', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save takeoff'}</button>
        </div>
      )}

      {tracing && (
        <PlanTracer
          planUrl={planUrl}
          dims={dims}
          ppf={ppf}
          setPpf={setPpf}
          setPlan={setPlan}
          conditions={conditions}
          setConditions={setConditions}
          result={r}
          opts={opts}
          targetConditionId={targetConditionId || undefined}
          onSetConditionValue={onSetConditionValue}
          initialSheets={tracerSheets.length ? tracerSheets : undefined}
          onSheetsChange={setTracerSheets}
          onClose={() => { setTracing(false); setTargetConditionId(''); }}
        />
      )}
    </>
  );
}

// useSearchParams requires a Suspense boundary (Next.js CSR bailout) — same pattern as /app/bids.
export default function MeasuredTakeoffPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0a' }} />}>
      <MeasuredTakeoffInner />
    </Suspense>
  );
}
