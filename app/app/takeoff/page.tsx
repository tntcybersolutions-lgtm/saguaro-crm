'use client';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import Link from 'next/link';
import {
  Badge, Btn, Table, ProgressBar, T,
} from '@/components/ui/shell';
import {
  PremiumSurface, ModuleHero, SectionCard, StatCard, StatStrip, PremiumEmpty,
} from '@/components/ui/premium';
import {
  Clipboard, Target, CurrencyDollar, Lightning, Buildings, Ruler, Stack,
  Check, Folder, Wall, HardHat, ChartBar, Lightbulb,
  Sparkle, CheckCircle, UploadSimple, DownloadSimple, ListChecks,
} from '@phosphor-icons/react';
import { Skeleton, SkeletonKPI, SkeletonRow } from '@/components/ui/Skeleton';
import { divColor, divName } from '@/lib/takeoff/divisions';
import { humanError } from '@/lib/errors';
import { StatusPill } from '@/components/ui/Status';

// ─── Heatmap shipping palette (single source of truth — identical to app/field/heatmap) ─
const GOLD = 'var(--brand-primary)', DARK = 'var(--bg-base)', RAISED = 'var(--bg-surface)', BORDER = 'rgba(255,255,255,0.1)';
const TEXT = '#fff', DIM = '#CBD5E1', MUTED = 'rgba(255,255,255,0.5)';
const GOLD_DIM = 'var(--brand-primary-12)';   // chip/tab active fill
const GOLD_LINE = 'var(--brand-primary-35)';  // active tab inset ring

// ─── Types ────────────────────────────────────────────────────────────────────
interface Project { id: string; name: string; }
interface TakeoffMaterial {
  id: string; csi_code: string; csi_name: string; description: string;
  quantity: number; unit: string; unit_cost: number; total_cost: number;
  labor_hours: number; notes: string; sort_order: number;
}
interface Takeoff {
  id: string; name: string; project_id: string;
  project_name?: string;
  status: 'pending' | 'uploaded' | 'analyzing' | 'complete' | 'failed';
  total_cost: number; material_cost: number; labor_cost: number;
  /* The number you BID, as distinct from total_cost, which is the cost
     subtotal. /api/takeoff/analyze-full writes both: total_cost from the cost
     subtotal and grand_total from the sell price. */
  grand_total?: number; sell_price?: number;
  building_area: number; floor_count: number; confidence: number;
  building_type: string; summary: string; project_name_detected: string;
  contingency_pct: number; recommendations: string[];
  file_name: string; created_at: string; analyzed_at: string;
  materials?: TakeoffMaterial[];
}

type UploadPhase = 'idle' | 'project-select' | 'uploading' | 'analyzing' | 'done' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(s: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtSecs(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

function confidenceColor(c: number): 'green' | 'amber' | 'red' {
  if (c >= 75) return 'green';
  if (c >= 50) return 'amber';
  return 'red';
}

function statusColor(s: string): 'green' | 'amber' | 'blue' | 'red' | 'muted' {
  if (s === 'complete') return 'green';
  if (s === 'analyzing') return 'blue';
  if (s === 'uploaded') return 'amber';
  if (s === 'failed') return 'red';
  return 'muted';
}

// Group materials by CSI division (first 2 chars of csi_code)
interface CsiDivision {
  divCode: string;
  divName: string;
  items: TakeoffMaterial[];
  totalCost: number;
  totalLaborHours: number;
}

function groupByDivision(materials: TakeoffMaterial[]): CsiDivision[] {
  const map = new Map<string, CsiDivision>();
  for (const m of materials) {
    const divCode = (m.csi_code || '00').slice(0, 2).replace(/\s/g, '');
    if (!map.has(divCode)) {
      map.set(divCode, {
        divCode,
        divName: m.csi_name || `Division ${divCode}`,
        items: [],
        totalCost: 0,
        totalLaborHours: 0,
      });
    }
    const div = map.get(divCode)!;
    div.items.push(m);
    div.totalCost += m.total_cost || 0;
    div.totalLaborHours += m.labor_hours || 0;
  }
  return Array.from(map.values()).sort((a, b) => a.divCode.localeCompare(b.divCode));
}

function exportCSV(takeoff: Takeoff) {
  if (!takeoff.materials?.length) return;
  const headers = ['CSI Code', 'CSI Name', 'Description', 'Quantity', 'Unit', 'Unit Cost', 'Total Cost', 'Labor Hours', 'Notes'];
  const rows = takeoff.materials.map(m => [
    m.csi_code, m.csi_name, m.description,
    m.quantity, m.unit,
    `$${(m.unit_cost || 0).toFixed(2)}`, `$${(m.total_cost || 0).toFixed(2)}`,
    m.labor_hours, m.notes,
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `takeoff-${takeoff.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Step list for analyzing phase ───────────────────────────────────────────
const STEPS = [
  'Creating record',
  'Uploading file',
  'Reading blueprint',
  'Analyzing dimensions',
  'Calculating quantities',
  'Processing results',
  'Saving line items',
  'Complete',
];

const RING_HEX = { green: '#2CFF7A', amber: 'var(--warning)', red: '#FF3B30' } as const;

// SVG confidence donut — mirrors the mobile HealthRing (color by confidenceColor()).
function ConfidenceRing({ value, size = 96, stroke = 9 }: { value: number; size?: number; stroke?: number }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - v / 100);
  const col = RING_HEX[confidenceColor(v)];
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: size * 0.24, fontWeight: 800, color: col, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{v}%</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: MUTED, marginTop: 2 }}>Confidence</span>
      </div>
    </div>
  );
}

// One metric tile in the 4-up strip (DARK bg, phosphor icon, tabular value).
function MetricCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="lift" style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ color: MUTED, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: accent || TEXT, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TakeoffPage() {
  const [takeoffs, setTakeoffs] = useState<Takeoff[]>([]);
  const [selectedTakeoff, setSelectedTakeoff] = useState<Takeoff | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  /* Inline project creation. Dropping a blueprint here used to dead-end at
     "Create a project first →", which navigated away and took the staged file
     with it — you came back and started over. A blueprint in hand is the whole
     reason you are on this screen; it must not be the thing you lose. Only a
     name is required to create a project, so it is asked for here and the file
     carries straight through to analysis. */
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState('');
  const [progress, setProgress] = useState({ pct: 0, message: '', step: 0 });
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'summary' | 'recs'>('items');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const evtSourceRef = useRef<EventSource | null>(null); // live SSE, torn down on unmount
  const [showAllRows, setShowAllRows] = useState(false);

  // Group the AI-extracted materials ONCE per takeoff (was recomputed inline on every
  // render, incl. every SSE progress tick), and cap the rows we synchronously render so
  // a huge extraction can't build thousands of SVG progress bars in one commit → freeze.
  const CSI_ROW_CAP = 300;
  const divisions = useMemo(
    () => (selectedTakeoff?.materials ? groupByDivision(selectedTakeoff.materials) : []),
    [selectedTakeoff],
  );
  const totalMatRows = useMemo(() => divisions.reduce((s, d) => s + d.items.length, 0), [divisions]);
  const rowsCapped = !showAllRows && totalMatRows > CSI_ROW_CAP;
  const cappedDivisions = useMemo(() => {
    if (!rowsCapped) return divisions;
    let budget = CSI_ROW_CAP;
    const out: typeof divisions = [];
    for (const d of divisions) {
      if (budget <= 0) break;
      const items = d.items.slice(0, budget);
      budget -= items.length;
      out.push({ ...d, items });
    }
    return out;
  }, [divisions, rowsCapped]);
  // Reset the "show all" toggle whenever a different takeoff is opened.
  useEffect(() => { setShowAllRows(false); }, [selectedTakeoff?.id]);

  // Trade-breakdown segments — divisions by cost desc, with % of grand total (for the hero bar + legend).
  const tradeGrandTotal = useMemo(() => divisions.reduce((s, d) => s + d.totalCost, 0), [divisions]);
  const tradeSegments = useMemo(
    () => divisions
      .filter(d => d.totalCost > 0)
      .map(d => ({ ...d, pct: tradeGrandTotal > 0 ? (d.totalCost / tradeGrandTotal) * 100 : 0, color: divColor(d.divCode) }))
      .sort((a, b) => b.totalCost - a.totalCost),
    [divisions, tradeGrandTotal],
  );

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/takeoff/${id}`);
      const json = await res.json();
      if (json.data) setSelectedTakeoff(json.data);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const loadTakeoffs = useCallback(async () => {
    setLoadingList(true);
    try {
      // W-18: ?include=latestDetail rides the newest takeoff's materials along with the
      // list — list + detail paint from ONE round trip instead of a dependent pair.
      const res = await fetch('/api/takeoff?limit=30&include=latestDetail');
      const json = await res.json();
      // Guard the shape: an error envelope ({error}) must never become list state.
      const list: Takeoff[] = Array.isArray(json.data) ? json.data : [];
      setTakeoffs(list);
      // Deliberately NOT auto-selecting the newest takeoff.
      //
      // It used to, and clicking "Takeoff Studio" dropped you into whatever
      // analysis happened to be most recent — someone else's job, a test
      // upload, a takeoff from three weeks ago — with its dollar figure filling
      // the screen. You came here to start one. The newest takeoff still rides
      // along in the payload, so clicking it in Recent Analyses is instant.
    } finally {
      setLoadingList(false);
    }
  }, [loadDetail]);

  const { projects: liveProjects } = useProjects();
  useEffect(() => { setProjects(liveProjects as any); }, [liveProjects]);

  useEffect(() => {
    loadTakeoffs();
  }, [loadTakeoffs]);

  // Tear down any live analysis stream if the user navigates away mid-analysis.
  useEffect(() => () => { evtSourceRef.current?.close(); evtSourceRef.current = null; }, []);

  // ── File handling ─────────────────────────────────────────────────────────
  function handleFile(file: File) {
    const valid = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff', 'image/webp'];
    if (!valid.includes(file.type)) {
      setErrorMsg('Invalid file type. Accepted: PDF, PNG, JPG, TIFF, WebP');
      setPhase('error');
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      setErrorMsg('File too large. Maximum 200MB.');
      setPhase('error');
      return;
    }
    setPendingFile(file);
    setPhase('project-select');
  }

  function resetUpload() {
    setPhase('idle');
    setPendingFile(null);
    setSelectedProjectId('');
    // Close the open result — leaving it mounted made this button look dead:
    // the state reset happened entirely offscreen behind the detail view.
    setSelectedTakeoff(null);
    // "New Analysis" from deep in a result must visibly land ON the upload card,
    // not silently reset state a full viewport above the fold.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    setProgress({ pct: 0, message: '', step: 0 });
    setErrorMsg('');
  }

  // ── Upload + analyze flow ─────────────────────────────────────────────────
  async function createProjectAndAnalyze() {
    const name = newProjectName.trim();
    if (!name || !pendingFile) return;
    setCreateBusy(true);
    setCreateErr('');
    try {
      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create the project.');
      const id = data.project?.id || data.projectId || data.id;
      if (!id) throw new Error('Project was created but returned no id.');
      setProjects(prev => [{ id, name } as any, ...prev]);
      setSelectedProjectId(id);
      setCreatingProject(false);
      setNewProjectName('');
      await startUpload(pendingFile, id);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Could not create the project.');
    } finally {
      setCreateBusy(false);
    }
  }

  async function startUpload(file: File, projectId: string) {
    setPhase('uploading');
    setProgress({ pct: 5, message: 'Creating takeoff record…', step: 1 });
    setErrorMsg('');

    try {
      // 1. Create takeoff record
      const createRes = await fetch('/api/takeoff/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const createJson = await createRes.json();
      if (!createRes.ok) throw new Error(createJson.error || 'Failed to create takeoff');
      const takeoffId: string = createJson.data.id;

      /* 2. Upload the bytes straight to storage — a serverless function will
            not take a body over 4.5 MB, and a real drawing set is far bigger.
            See /api/takeoff/[id]/upload-url. */
      setProgress({ pct: 20, message: 'Uploading blueprint…', step: 2 });

      const urlRes = await fetch(`/api/takeoff/${takeoffId}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name }),
      });
      const urlJson = await urlRes.json().catch(() => ({}));
      if (!urlRes.ok) throw new Error(urlJson.error || 'Could not start the upload.');

      const putRes = await fetch(urlJson.signedUrl, {
        method: 'PUT',
        headers: {
          'x-upsert': 'true',
          ...(file.type ? { 'Content-Type': file.type } : {}),
        },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status}). Please try again.`);

      const doneRes = await fetch(`/api/takeoff/${takeoffId}/upload-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: urlJson.path,
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          fileSize: file.size,
        }),
      });
      const uploadJson = await doneRes.json().catch(() => ({}));
      if (!doneRes.ok) throw new Error(uploadJson.error || 'Upload failed');

      // 3. Analyze via SSE
      setPhase('analyzing');
      setProgress({ pct: 25, message: 'AI is reading your blueprint…', step: 3 });

      await new Promise<void>((resolve, reject) => {
        const evtSource = new EventSource(`/api/takeoff/${takeoffId}/analyze`);
        evtSourceRef.current = evtSource;
        let sseResolved = false;

        // Watchdog: if the stream goes silent for 90s (server stall) tear it down and
        // fail cleanly instead of leaving the UI stuck on "analyzing" forever.
        let watchdog: ReturnType<typeof setTimeout>;
        const finish = (fn: () => void) => { sseResolved = true; clearTimeout(watchdog); evtSource.close(); evtSourceRef.current = null; fn(); };
        const armWatchdog = () => {
          clearTimeout(watchdog);
          watchdog = setTimeout(() => { if (!sseResolved) finish(() => reject(new Error('Analysis timed out. Please try again.'))); }, 90_000);
        };
        armWatchdog();

        evtSource.onmessage = (e) => {
          try {
            const evt = JSON.parse(e.data);
            if (evt.event === 'progress') {
              armWatchdog();
              setProgress({ pct: evt.pct, message: evt.message, step: evt.step });
            } else if (evt.event === 'result' || evt.event === 'done') {
              finish(resolve);
            } else if (evt.event === 'error') {
              finish(() => reject(new Error(evt.message)));
            }
          } catch {
            // ignore parse errors
          }
        };

        evtSource.onerror = () => {
          // Natural SSE stream close fires onerror — only reject if we never got a result.
          if (!sseResolved) finish(() => reject(new Error('Connection lost during analysis. Please try again.')));
          else finish(() => {});
        };
      });

      // 4. Reload list and select new takeoff
      setPhase('done');
      setProgress({ pct: 100, message: 'Complete', step: 8 });
      await loadTakeoffs();
      await loadDetail(takeoffId);

    } catch (err: unknown) {
      console.error(err);
      setErrorMsg(humanError(err, 'Analysis failed. Please try again.'));
      setPhase('error');
    }
  }

  // ── Stats (from list) ─────────────────────────────────────────────────────
  const now = new Date();
  const thisMonthComplete = takeoffs.filter(t => {
    if (t.status !== 'complete') return false;
    const d = new Date(t.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const completed = takeoffs.filter(t => t.status === 'complete');
  const avgConfidence = completed.length
    ? Math.round(completed.reduce((s, t) => s + (t.confidence || 0), 0) / completed.length)
    : 0;
  /* A bid value is what you BID, not what the work costs you. This summed
     total_cost — the cost subtotal — and labeled it "Total Bid Value", so the
     headline under-reported every takeoff by its whole margin. analyze-full
     writes grand_total from the sell price; total_cost stays the fallback for
     older rows that predate it. */
  const totalBidValue = completed.reduce(
    (s, t) => s + (Number(t.grand_total) || Number(t.sell_price) || Number(t.total_cost) || 0),
    0,
  );
  const totalBidStr = totalBidValue >= 1_000_000
    ? `$${(totalBidValue / 1_000_000).toFixed(1)}M`
    : totalBidValue >= 1000
    ? `$${Math.round(totalBidValue / 1000)}K`
    : fmt(totalBidValue);

  // Real average processing time = analyzed_at − created_at across completed takeoffs
  // that carry both timestamps. Guard against missing/negative spans and re-analysis
  // outliers (> 1h) so one bad row can't skew the headline. No timed rows ⇒ show "—".
  const processingSecs = completed
    .map(t => {
      if (!t.created_at || !t.analyzed_at) return null;
      const ms = new Date(t.analyzed_at).getTime() - new Date(t.created_at).getTime();
      return ms > 0 && ms < 3_600_000 ? ms / 1000 : null;
    })
    .filter((s): s is number => s !== null);
  const avgProcessingSecs = processingSecs.length
    ? Math.round(processingSecs.reduce((a, b) => a + b, 0) / processingSecs.length)
    : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .tk-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .tk-tabs { display: flex; gap: 4px; padding: 4px; background: ${DARK}; border: 1px solid ${BORDER}; border-radius: 10px; }
        .tk-tabbtn { flex: 1; background: transparent; border: none; color: ${DIM}; border-radius: 7px; padding: 8px 6px; font-size: 12px; font-weight: 700; letter-spacing: .2px; cursor: pointer; transition: background .12s, color .12s; }
        .tk-tabbtn:hover { background: rgba(255,255,255,0.05); color: ${TEXT}; }
        .tk-tabbtn[data-on="true"] { background: ${GOLD_DIM}; color: ${GOLD}; box-shadow: inset 0 0 0 1px ${GOLD_LINE}; }
        .tk-scanline { position: absolute; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, ${GOLD}, transparent); box-shadow: 0 0 12px 2px color-mix(in srgb, var(--brand-primary) 60%, transparent); animation: tk-scan 2s ease-in-out infinite; }
        @keyframes tk-scan { 0% { top: 0 } 50% { top: calc(100% - 2px) } 100% { top: 0 } }
        @media (max-width: 900px) { .tk-strip { grid-template-columns: repeat(2, 1fr); } }
      ` }} />
      <PremiumSurface maxWidth={2200}>
        {/* Header */}
        <ModuleHero
          eyebrow="Estimating"
          eyebrowIcon={<Ruler size={13} weight="fill" color={GOLD} />}
          title="Takeoff"
          accent="Studio"
          subtitle="Blueprint analysis, measured takeoff, assemblies, and rates."
          note="No spreadsheet"
          actions={
            <>
              <Badge label={`${takeoffs.length} Total`} color="muted" />
              <Badge label={`${completed.length} Complete`} color="green" />
            </>
          }
        />

        {/* ── The Studio's doors. Measured takeoff / assemblies / rates already
            shipped as siblings of this page but NOTHING linked to them — users
            could only find them by typing URLs. One row, every tool. ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginBottom: 22 }}>
          {[
            { href: '/app/takeoff/measured', title: 'Measured Takeoff', sub: 'Trace & price the drawing live', icon: <Ruler size={16} weight="duotone" color={GOLD} /> },
            { href: '/app/takeoff/assemblies', title: 'Assembly Library', sub: 'Templates that explode into bills', icon: <Stack size={16} weight="duotone" color={GOLD} /> },
            { href: '/app/takeoff/rates', title: 'Cost Rates', sub: 'Your material & labor rates', icon: <CurrencyDollar size={16} weight="duotone" color={GOLD} /> },
          ].map(d => (
            <Link key={d.href} href={d.href} className="lift" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--brand-primary) 22%, transparent)', background: 'color-mix(in srgb, var(--brand-primary) 5%, transparent)', textDecoration: 'none' }}>
              {d.icon}
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{d.title}</span>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.sub}</span>
              </span>
              <span aria-hidden style={{ marginLeft: 'auto', color: 'color-mix(in srgb, var(--brand-primary) 50%, transparent)', fontWeight: 900 }}>›</span>
            </Link>
          ))}
        </div>

        {/* KPIs — one tight row, not four fat cards (declutter) */}
        <div style={{ marginBottom: 28 }}>
          <StatStrip items={[
            { label: 'This Month', value: String(thisMonthComplete.length), sub: 'Completed takeoffs', icon: <Clipboard size={12} color={GOLD} /> },
            { label: 'Avg Confidence', value: completed.length ? `${avgConfidence}%` : '—', sub: 'Across all analyses', icon: <Target size={12} color={GOLD} /> },
            { label: 'Total Bid Value', value: completed.length ? totalBidStr : '—', sub: 'Sum of complete takeoffs', icon: <CurrencyDollar size={12} color={GOLD} /> },
            { label: 'Avg Processing', value: processingSecs.length ? `~${fmtSecs(avgProcessingSecs)}` : '—', sub: 'Per blueprint analysis', icon: <Lightning size={12} color={GOLD} /> },
          ]} />
        </div>

        {/* Main 2-col layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>

          {/* LEFT PANEL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Upload Card */}
            <SectionCard title="New Analysis" icon={<Buildings size={16} weight="duotone" color={GOLD} />}>
                {/* IDLE — drag drop zone */}
                {phase === 'idle' && (
                  <>
                    <div
                      data-tour="takeoff-dropzone"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={e => {
                        e.preventDefault();
                        setDragOver(false);
                        const f = e.dataTransfer.files[0];
                        if (f) handleFile(f);
                      }}
                      style={{
                        border: `2px dashed ${dragOver ? T.gold : T.border}`,
                        borderRadius: 10,
                        padding: '32px 16px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: dragOver ? T.goldDim : 'transparent',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ fontSize: 32, marginBottom: 10 }}><Ruler size={32} weight="regular" color={T.muted} /></div>
                      <div style={{ color: T.white, fontWeight: 600, marginBottom: 4, fontSize: 14 }}>
                        Drop blueprints here
                      </div>
                      <div style={{ color: T.muted, fontSize: 12, marginBottom: 14 }}>
                        or click to browse files
                      </div>
                      <div style={{ color: T.faint, fontSize: 11 }}>
                        PDF, PNG, JPG, TIFF, WebP · max 200MB
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.webp"
                      style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    />
                  </>
                )}

                {/* PROJECT-SELECT */}
                {phase === 'project-select' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ color: T.muted, fontSize: 12 }}>
                      File: <span style={{ color: T.white, fontWeight: 500 }}>{pendingFile?.name}</span>
                    </div>
                    {creatingProject || projects.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={{ color: T.muted, fontSize: 11, fontWeight: 700}}>
                          New Project Name
                        </label>
                        <input
                          autoFocus
                          value={newProjectName}
                          onChange={e => { setNewProjectName(e.target.value); setCreateErr(''); }}
                          onKeyDown={e => { if (e.key === 'Enter' && newProjectName.trim() && !createBusy) void createProjectAndAnalyze(); }}
                          placeholder="Mesa Library Expansion"
                          style={{
                            width: '100%', padding: '10px 12px', borderRadius: 8,
                            background: T.surface2, border: `1px solid ${createErr ? '#FF3B30' : T.border}`,
                            color: T.white, fontSize: 16, outline: 'none',
                          }}
                        />
                        {createErr && <div style={{ color: '#FF3B30', fontSize: 12 }}>{createErr}</div>}
                        <div style={{ color: T.muted, fontSize: 11.5 }}>
                          Address, budget and contract can be filled in later — the blueprint analyses either way.
                        </div>
                        {projects.length > 0 && (
                          <button
                            onClick={() => { setCreatingProject(false); setCreateErr(''); }}
                            style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: T.muted, fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0, minHeight: 44 }}
                          >
                            Pick an existing project instead
                          </button>
                        )}
                      </div>
                    ) : (
                      <select
                        value={selectedProjectId}
                        onChange={e => {
                          if (e.target.value === '__new__') { setCreatingProject(true); setSelectedProjectId(''); return; }
                          setSelectedProjectId(e.target.value);
                        }}
                        style={{
                          width: '100%', padding: '9px 12px', borderRadius: 8,
                          background: T.surface2, border: `1px solid ${T.border}`,
                          color: selectedProjectId ? T.white : T.muted,
                          fontSize: 13, outline: 'none', cursor: 'pointer',
                        }}
                      >
                        <option value="" disabled>Select project…</option>
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                        <option value="__new__">+ New Project…</option>
                      </select>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn variant="ghost" size="sm" onClick={resetUpload}>Cancel</Btn>
                      {creatingProject || projects.length === 0 ? (
                        <Btn
                          size="sm"
                          disabled={!newProjectName.trim() || !pendingFile || createBusy}
                          onClick={() => void createProjectAndAnalyze()}
                          style={{ flex: 1 }}
                        >
                          {createBusy ? 'Creating…' : 'Create Project & Analyze'}
                        </Btn>
                      ) : (
                        <Btn data-tour="run-takeoff"
                          size="sm"
                          disabled={!selectedProjectId || !pendingFile}
                          onClick={() => pendingFile && selectedProjectId && startUpload(pendingFile, selectedProjectId)}
                          style={{ flex: 1 }}
                        >
                          Start Analysis
                        </Btn>
                      )}
                    </div>
                  </div>
                )}

                {/* UPLOADING */}
                {phase === 'uploading' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ color: T.muted, fontSize: 12 }}>{progress.message}</div>
                    <ProgressBar pct={progress.pct} />
                    <div style={{ color: T.muted, fontSize: 11 }}>{progress.pct}% complete</div>
                  </div>
                )}

                {/* ANALYZING */}
                {phase === 'analyzing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Blueprint scan-line hero — gold sweep over a plan silhouette reads as "measuring". */}
                    <div style={{
                      position: 'relative', height: 120, borderRadius: 12, overflow: 'hidden',
                      border: `1px solid ${BORDER}`, background: DARK,
                      backgroundImage: 'linear-gradient(color-mix(in srgb, var(--brand-primary) 6%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--brand-primary) 6%, transparent) 1px, transparent 1px)',
                      backgroundSize: '20px 20px',
                    }}>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Ruler size={30} weight="regular" color="var(--brand-primary-35)" />
                      </div>
                      <div className="tk-scanline" />
                    </div>
                    <div style={{ color: T.white, fontSize: 13, fontWeight: 500 }}>{progress.message}</div>
                    <ProgressBar pct={progress.pct} color={progress.step >= 7 ? GOLD : T.blue} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                      {STEPS.map((step, i) => {
                        const stepNum = i + 1;
                        const done = progress.step > stepNum;
                        const active = progress.step === stepNum;
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700,
                              background: done ? T.greenDim : active ? T.blueDim : 'rgba(255,255,255,0.05)',
                              color: done ? T.green : active ? T.blue : T.faint,
                              border: `1px solid ${done ? 'rgba(44,255,122,0.3)' : active ? 'var(--brand-primary-25)' : T.border}`,
                            }}>
                              {done ? <Check size={12} weight="bold" color={T.green} /> : stepNum}
                            </span>
                            <span style={{
                              fontSize: 12,
                              color: done ? T.green : active ? T.white : T.faint,
                            }}>
                              {step}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* DONE */}
                {phase === 'done' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center' }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%',
                      background: T.greenDim, border: `2px solid rgba(44,255,122,0.3)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 22,
                    }}><Check size={24} weight="bold" color={T.green} /></div>
                    <div>
                      <div style={{ color: T.white, fontWeight: 600, marginBottom: 4 }}>Analysis Complete</div>
                      {selectedTakeoff && (
                        <div style={{ color: T.muted, fontSize: 12 }}>
                          {selectedTakeoff.materials?.length || 0} line items extracted
                        </div>
                      )}
                    </div>
                    <Btn variant="ghost" size="sm" onClick={resetUpload} style={{ width: '100%' }}>
                      New Analysis
                    </Btn>
                  </div>
                )}

                {/* ERROR */}
                {phase === 'error' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{
                      background: T.redDim, border: `1px solid rgba(255,59,48,0.25)`,
                      borderRadius: 8, padding: '12px 14px', color: T.red, fontSize: 13,
                    }}>
                      {errorMsg || 'An error occurred. Please try again.'}
                    </div>
                    <Btn variant="ghost" size="sm" onClick={resetUpload}>Try Again</Btn>
                  </div>
                )}
            </SectionCard>

            {/* Recent Takeoffs list */}
            <SectionCard title="Recent Analyses" icon={<Folder size={16} weight="duotone" color={GOLD} />} flush>
              <div style={{ maxHeight: 460, overflowY: 'auto' }}>
                {loadingList && (
                  /* Layout-true placeholder rows — same shape as the real analysis rows, no text gate */
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                )}
                {!loadingList && takeoffs.length === 0 && (
                  <div style={{ padding: '24px 20px', textAlign: 'center', color: T.muted, fontSize: 13 }}>
                    No takeoffs yet
                  </div>
                )}
                {takeoffs.map(t => {
                  const isSelected = selectedTakeoff?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => loadDetail(t.id)}
                      style={{
                        padding: '12px 16px',
                        cursor: 'pointer',
                        background: isSelected ? T.goldDim : 'transparent',
                        borderLeft: `3px solid ${isSelected ? T.gold : 'transparent'}`,
                        borderBottom: `1px solid ${T.border}`,
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.project_name || t.name || 'Untitled'}
                          </div>
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                            {fmtDate(t.created_at)} · #{t.id.slice(0, 8)}
                          </div>
                        </div>
                        <StatusPill module="takeoffs" status={t.status} size="sm" />
                      </div>
                      {t.status === 'complete' && t.confidence > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <ProgressBar pct={t.confidence} color={T.green} height={3} />
                          <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>{t.confidence}% confidence</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>

          {/* RIGHT DETAIL PANEL */}
          <div>
            {(loadingDetail || loadingList) && !selectedTakeoff && (
              /* Detail shell — shaped like the real panel (ring + metric strip + rows), no text gate */
              <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 20, padding: 26, boxShadow: 'var(--shadow-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 22 }}>
                  <Skeleton width={96} height={96} borderRadius="50%" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <Skeleton width="45%" height={18} style={{ marginBottom: 10 }} />
                    <Skeleton width="65%" height={12} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 22 }}>
                  {[0, 1, 2, 3].map(i => <SkeletonKPI key={i} />)}
                </div>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            )}

            {!loadingDetail && !loadingList && !selectedTakeoff && (
              /* ── Cinematic empty state — sell the payoff (mirrors the Heatmap hero) ── */
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                style={{
                  display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap',
                  background: dragOver ? 'color-mix(in srgb, var(--brand-primary) 6%, transparent)' : RAISED,
                  border: `1px solid ${dragOver ? GOLD : BORDER}`, borderRadius: 20, padding: 26,
                  boxShadow: 'var(--shadow-lg)',
                  transition: 'border-color .15s, background .15s',
                }}
              >
                <div style={{ flex: '1 1 300px', minWidth: 260 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: GOLD, marginBottom: 12 }}>AI Blueprint Takeoff</div>
                  <h2 style={{ fontSize: 'clamp(22px,3vw,34px)', fontWeight: 900, lineHeight: 1.08, margin: '0 0 12px', color: '#fff', letterSpacing: -0.5 }}>Turn a blueprint into a priced estimate.</h2>
                  <p style={{ color: DIM, fontSize: 14.5, lineHeight: 1.55, margin: '0 0 16px', maxWidth: 460 }}>Drop a drawing and get quantities read straight off the plan, CSI-coded line items with a material and labor split, cost per square foot, confidence scoring, and a client-ready estimate — in minutes.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 18px', margin: '0 0 20px', maxWidth: 480 }}>
                    {[
                      'Quantities from the drawing',
                      'CSI-coded line items',
                      'Material + labor split',
                      'Cost per square foot',
                      'Confidence scoring',
                      'Client-ready export',
                    ].map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: DIM }}>
                        <CheckCircle size={15} weight="fill" color={GOLD} style={{ flexShrink: 0 }} /> {f}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => { if (phase !== 'idle') resetUpload(); fileInputRef.current?.click(); }}
                    className="btn-gold"
                    style={{ fontSize: 14, padding: '11px 22px', cursor: 'pointer' }}
                  >
                    <UploadSimple size={16} weight="bold" /> Upload blueprint
                  </button>
                  <div style={{ fontSize: 11.5, color: MUTED, marginTop: 12 }}>Drag &amp; drop a PDF, PNG or JPG anywhere here.</div>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div style={{ flex: '1 1 360px', minWidth: 280, borderRadius: 14, overflow: 'hidden', border: `1px solid ${BORDER}`, boxShadow: '0 16px 50px rgba(0,0,0,0.45)', position: 'relative', background: DARK }}>
                  <img
                    src="/takeoff-hero.png"
                    alt="Example priced estimate — CSI-coded line items with material and labor costs"
                    style={{ display: 'block', width: '100%', height: 'auto' }}
                    onError={e => { const el = e.currentTarget; el.style.display = 'none'; const sib = el.nextElementSibling as HTMLElement | null; if (sib) sib.style.display = 'flex'; }}
                  />
                  {/* Fallback deliverable preview when no screenshot is shipped — reads as the output. */}
                  <div style={{ display: 'none', flexDirection: 'column', gap: 10, padding: 22, minHeight: 220 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: GOLD}}>AI Blueprint Estimate</div>
                    <div style={{ fontSize: 34, fontWeight: 900, color: GOLD, letterSpacing: '-0.03em', lineHeight: 1 }}>$1,284,500</div>
                    <div style={{ height: 12, borderRadius: 6, overflow: 'hidden', display: 'flex', gap: 1, marginTop: 4 }}>
                      {['26', '23', '22', '09', '03', '08'].map((d, i) => (
                        <div key={d} style={{ flex: [3, 2.4, 1.8, 1.5, 1.2, 1][i], background: divColor(d) }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 4 }}>
                      {['26', '23', '22', '09'].map(d => (
                        <span key={d} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: DIM }}>
                          <i style={{ width: 10, height: 10, borderRadius: 3, background: divColor(d), display: 'inline-block' }} /> Div {d} {divName(d)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(13,17,23,0.82)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 7 }}>Example output — your plan renders like this</div>
                </div>
              </div>
            )}

            {selectedTakeoff && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* ═══ A. HERO TOTAL BAND — the client-ready verdict ═══ */}
                {(() => {
                  const t = selectedTakeoff;
                  const sf = t.building_area || 0;
                  const costPerSf = sf > 0 ? Math.round((t.total_cost || 0) / sf) : 0;
                  const divCount = divisions.length;
                  const itemCount = t.materials?.length || 0;
                  const verdictBits = [
                    divCount ? `${divCount} division${divCount === 1 ? '' : 's'}` : null,
                    itemCount ? `${itemCount.toLocaleString()} line item${itemCount === 1 ? '' : 's'}` : null,
                    costPerSf ? `$${costPerSf}/SF` : null,
                    t.building_type ? `${t.building_type}` : null,
                  ].filter(Boolean).join(' · ');
                  return (
                    <>
                      {/* action row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <StatusPill module="takeoffs" status={t.status} size="sm" />
                          {t.building_type && <Badge label={t.building_type} color="blue" />}
                          <span style={{ color: MUTED, fontSize: 12 }}>#{t.id.slice(0, 8)}</span>
                          {t.analyzed_at && <span style={{ color: MUTED, fontSize: 12 }}>Analyzed {fmtDate(t.analyzed_at)}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {t.status === 'complete' && t.project_id && (
                            <a
                              href={`/app/projects/${t.project_id}/takeoff`}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '7px 14px', borderRadius: 8, textDecoration: 'none',
                                background: GOLD, color: '#0A0A00', fontSize: 13, fontWeight: 800,
                              }}
                            >
                              Build bid + compliance →
                            </a>
                          )}
                          <Btn variant="ghost" size="sm" onClick={() => exportCSV(t)} disabled={!t.materials?.length}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><DownloadSimple size={14} weight="bold" /> Export CSV</span>
                          </Btn>
                          <Btn variant="primary" size="sm" onClick={resetUpload}>New Analysis</Btn>
                        </div>
                      </div>

                      {/* hero card with gold accent bar + confidence ring */}
                      <div style={{ position: 'relative', background: RAISED, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${GOLD}`, borderRadius: 20, padding: 26, overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 240, flex: '1 1 auto' }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: GOLD, marginBottom: 8 }}>AI Blueprint Estimate</div>
                            <h2 style={{ margin: '0 0 10px', fontSize: 'clamp(20px,2.6vw,28px)', fontWeight: 900, letterSpacing: -0.5, color: '#fff', lineHeight: 1.1 }}>
                              {t.project_name || t.project_name_detected || 'Untitled Project'}
                            </h2>
                            <div style={{ fontSize: 'clamp(34px,5vw,52px)', fontWeight: 900, letterSpacing: '-0.03em', color: GOLD, lineHeight: 1 }}>
                              {fmt(t.total_cost)}
                            </div>
                          </div>
                          {t.confidence > 0 && <ConfidenceRing value={t.confidence} />}
                        </div>
                        {verdictBits && (
                          <p style={{ margin: '18px 0 0', fontSize: 14, lineHeight: 1.5, color: DIM }}>
                            Complete estimate across {verdictBits}
                            {sf > 0 ? '.' : ''}
                          </p>
                        )}
                      </div>

                      {/* ═══ B. METRIC STRIP ═══ */}
                      <div className="tk-strip">
                        <MetricCard icon={<Ruler size={16} color={MUTED} />} label="Building Area" value={sf > 0 ? `${sf.toLocaleString()} SF` : '—'} />
                        <MetricCard icon={<Buildings size={16} color={MUTED} />} label="Floors" value={t.floor_count > 0 ? String(t.floor_count) : '—'} />
                        <MetricCard icon={<ChartBar size={16} color={MUTED} />} label="Cost / SF" value={costPerSf > 0 ? `$${costPerSf}` : '—'} accent={GOLD} />
                        <MetricCard icon={<Target size={16} color={MUTED} />} label="Confidence" value={t.confidence > 0 ? `${t.confidence}%` : '—'} accent={t.confidence > 0 ? RING_HEX[confidenceColor(t.confidence)] : undefined} />
                      </div>

                      {/* ═══ C. TRADE BREAKDOWN BAR — "where's the money" ═══ */}
                      {tradeSegments.length > 0 && (
                        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16, boxShadow: 'var(--shadow-sm)' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 12 }}>Cost by Trade</div>
                          <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', gap: 1 }}>
                            {tradeSegments.map(s => (
                              <div key={s.divCode} title={`Div ${s.divCode} ${s.divName} — ${fmt(s.totalCost)} (${s.pct.toFixed(0)}%)`}
                                style={{ width: `${s.pct}%`, background: s.color, minWidth: s.pct > 0 ? 2 : 0 }} />
                            ))}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', marginTop: 12 }}>
                            {tradeSegments.map(s => (
                              <span key={s.divCode} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: DIM }}>
                                <i style={{ width: 11, height: 11, borderRadius: 3, background: s.color, display: 'inline-block', flexShrink: 0 }} />
                                <span style={{ color: TEXT, fontWeight: 600 }}>Div {s.divCode}</span>
                                <span style={{ color: MUTED }}>{s.divName}</span>
                                <span style={{ color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{fmt(s.totalCost)}</span>
                                <span style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{s.pct.toFixed(0)}%</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* ═══ D. SEGMENTED CONTROL (hm-tabs) ═══ */}
                <div className="tk-tabs" role="tablist">
                  {([
                    ['items', 'Line Items', <ListChecks key="i" size={14} weight="bold" />],
                    ['summary', 'Cost Summary', <ChartBar key="s" size={14} weight="bold" />],
                    ['recs', 'Recommendations', <Lightbulb key="r" size={14} weight="bold" />],
                  ] as const).map(([key, label, icon]) => (
                    <button key={key} type="button" role="tab" className="tk-tabbtn" data-on={activeTab === key} onClick={() => setActiveTab(key)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{icon}{label}</span>
                    </button>
                  ))}
                </div>

                {/* CSI Line Items Tab */}
                {activeTab === 'items' && (
                  <SectionCard flush>
                    {selectedTakeoff.materials?.length ? (
                      <div>
                        {cappedDivisions.map(div => (
                          <div key={div.divCode}>
                            {/* Division header — left accent + code chip tinted by divColor() */}
                            <div style={{
                              padding: '10px 16px',
                              background: RAISED,
                              borderBottom: `1px solid ${BORDER}`,
                              borderLeft: `3px solid ${divColor(div.divCode)}`,
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                            }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                                <span style={{
                                  fontFamily: 'monospace', fontSize: 11, fontWeight: 800, letterSpacing: '0.03em',
                                  color: divColor(div.divCode),
                                  background: `color-mix(in srgb, ${divColor(div.divCode)} 16%, ${DARK})`,
                                  border: `1px solid color-mix(in srgb, ${divColor(div.divCode)} 40%, transparent)`,
                                  borderRadius: 6, padding: '2px 7px', flexShrink: 0,
                                }}>DIV {div.divCode}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {div.divName || divName(div.divCode)}
                                </span>
                              </span>
                              <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
                                <span style={{ fontSize: 12, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                                  {div.totalLaborHours.toFixed(0)} hrs
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>
                                  {fmt(div.totalCost)}
                                </span>
                              </div>
                            </div>
                            {/* Items table */}
                            <Table
                              headers={['CSI Code', 'Description', 'Qty', 'Unit', '$/Unit', 'Total', '% of Div']}
                              rows={div.items.map(m => {
                                const pct = div.totalCost > 0 ? Math.round((m.total_cost / div.totalCost) * 100) : 0;
                                return [
                                  <span key="code" style={{ fontFamily: 'monospace', fontSize: 12, color: T.muted }}>{m.csi_code}</span>,
                                  <span key="desc" style={{ fontSize: 13 }}>{m.description}</span>,
                                  <span key="qty" style={{ color: T.white, fontWeight: 500 }}>{(m.quantity || 0).toLocaleString()}</span>,
                                  <span key="unit" style={{ color: T.muted, fontSize: 12 }}>{m.unit}</span>,
                                  <span key="uc" style={{ color: T.muted }}>{fmt(m.unit_cost)}</span>,
                                  <span key="tc" style={{ color: T.white, fontWeight: 600 }}>{fmt(m.total_cost)}</span>,
                                  <div key="pct" style={{ minWidth: 80, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <ProgressBar pct={pct} color={T.gold} height={4} />
                                    <span style={{ fontSize: 10, color: T.muted, flexShrink: 0 }}>{pct}%</span>
                                  </div>,
                                ];
                              })}
                            />
                          </div>
                        ))}
                        {rowsCapped && (
                          <button
                            onClick={() => setShowAllRows(true)}
                            style={{ width: '100%', padding: '12px', background: T.surface2, border: 'none', borderTop: `1px solid ${T.border}`, color: T.gold, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                          >
                            Showing first {CSI_ROW_CAP.toLocaleString()} of {totalMatRows.toLocaleString()} line items — show all
                          </button>
                        )}
                      </div>
                    ) : (
                      <PremiumEmpty
                        icon={<ListChecks size={30} weight="duotone" color={GOLD} />}
                        title={selectedTakeoff.status === 'analyzing' ? 'Analysis in progress…' : 'No line items yet'}
                        description={selectedTakeoff.status === 'analyzing' ? 'The AI is reading your blueprint and extracting quantities.' : 'No line items are available for this estimate.'}
                        compact
                      />
                    )}
                  </SectionCard>
                )}

                {/* Cost Summary Tab */}
                {activeTab === 'summary' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Cost breakdown */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                      <StatCard
                        icon={<Wall size={19} weight="duotone" color={GOLD} />}
                        label="Material Cost"
                        value={fmt(selectedTakeoff.material_cost)}
                        sub="Direct materials"
                       href="/app/takeoff"/>
                      <StatCard
                        icon={<HardHat size={19} weight="duotone" color={GOLD} />}
                        label="Labor Cost"
                        value={fmt(selectedTakeoff.labor_cost)}
                        sub="All trades"
                       href="/app/takeoff"/>
                      <StatCard
                        icon={<ChartBar size={19} weight="duotone" color={GOLD} />}
                        label="Contingency"
                        value={`${selectedTakeoff.contingency_pct || 10}%`}
                        sub={fmt((selectedTakeoff.total_cost || 0) * ((selectedTakeoff.contingency_pct || 10) / 100))}
                       href="/app/takeoff"/>
                      <StatCard
                        icon={<Ruler size={19} weight="duotone" color={GOLD} />}
                        label="Building Area"
                        value={selectedTakeoff.building_area > 0 ? `${selectedTakeoff.building_area.toLocaleString()} SF` : '—'}
                        sub={selectedTakeoff.floor_count > 0 ? `${selectedTakeoff.floor_count} floor${selectedTakeoff.floor_count !== 1 ? 's' : ''}` : undefined}
                       href="/app/takeoff"/>
                    </div>

                    {/* AI Summary */}
                    {selectedTakeoff.summary && (
                      <SectionCard flat title="AI Summary" icon={<Sparkle size={16} weight="fill" color={GOLD} />}>
                        <p style={{ margin: 0, color: T.muted, fontSize: 13, lineHeight: 1.7 }}>
                          {selectedTakeoff.summary}
                        </p>
                      </SectionCard>
                    )}
                  </div>
                )}

                {/* Recommendations Tab */}
                {activeTab === 'recs' && (
                  <SectionCard flat title="Estimator Recommendations" icon={<Lightbulb size={16} weight="duotone" color={GOLD} />}>
                      {selectedTakeoff.recommendations?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {selectedTakeoff.recommendations.map((rec, i) => (
                            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                              <span style={{
                                flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                                background: T.goldDim, border: `1px solid ${T.borderGold}`,
                                color: T.gold, fontSize: 11, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {i + 1}
                              </span>
                              <span style={{ color: T.muted, fontSize: 13, lineHeight: 1.6 }}>{rec}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <PremiumEmpty
                          icon={<Lightbulb size={30} weight="duotone" color={GOLD} />}
                          title="No recommendations"
                          description="No estimator recommendations for this estimate."
                          compact
                        />
                      )}
                  </SectionCard>
                )}
              </div>
            )}
          </div>
        </div>
      </PremiumSurface>
    </>
  );
}
