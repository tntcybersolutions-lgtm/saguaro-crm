'use client';
/**
 * Takeoff Studio — AI blueprint takeoff, Pass 4 on the kit.
 *
 * Anatomy: title + one primary action (Upload Blueprint) → the studio's doors
 * (measured takeoff / assemblies / rates) → StatRow → workspace split: the
 * New Analysis card and Recent Analyses on the left, the opened estimate (or
 * the empty hero) on the right. The estimate is labeled as an AI estimate
 * everywhere its figures appear; nothing here invents a number — every cell
 * is what the analysis wrote.
 *
 * Every read / write is the one this screen already used:
 *   list      GET  /api/takeoff?limit=30&include=latestDetail
 *   detail    GET  /api/takeoff/[id]
 *   create    POST /api/takeoff/create · /api/projects/create (inline project)
 *   upload    POST /api/takeoff/[id]/upload-url → PUT signed URL → POST /api/takeoff/[id]/upload-complete
 *   analyze   SSE  /api/takeoff/[id]/analyze
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import Link from 'next/link';
import {
  Target, CurrencyDollar, Ruler, Stack, Check, Lightbulb,
  Sparkle, CheckCircle, UploadSimple, DownloadSimple, ListChecks, CaretRight, Warning,
} from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, DataTable, EmptyState, Tabs, Select, Input, Field,
  type Column, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { divColor, divName } from '@/lib/takeoff/divisions';
import { humanError } from '@/lib/errors';
import { layout } from '@/lib/design-tokens';

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
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n: number) => money.format(Number(n) || 0);

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
const RING_CSS = { green: 'var(--status-ongoing)', amber: 'var(--status-under-contract)', red: 'var(--status-overdue)' } as const;

/** Takeoff status → badge: complete green, analyzing blue, uploaded amber, failed red, pending grey. */
function statusBadge(s: string): { label: string; tone: BadgeTone } {
  if (s === 'complete') return { label: 'Complete', tone: 'ongoing' };
  if (s === 'analyzing') return { label: 'Analyzing', tone: 'lead' };
  if (s === 'uploaded') return { label: 'Uploaded', tone: 'under_contract' };
  if (s === 'failed') return { label: 'Failed', tone: 'overdue' };
  return { label: 'Pending', tone: 'closed' };
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

// SVG confidence donut — mirrors the mobile HealthRing (color by confidenceColor()).
function ConfidenceRing({ value, size = 96, stroke = 9 }: { value: number; size?: number; stroke?: number }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - v / 100);
  const col = RING_CSS[confidenceColor(v)];
  return (
    <div className="tkRing" style={{ width: size, height: size }} title={`${v}% confidence — the AI's own score for this analysis`}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="tkRingLabel"><span style={{ fontSize: size * 0.24, color: col }}>{v}%</span><span>Confidence</span></div>
    </div>
  );
}

const CSS = `
.tkWs > .k-page { max-width: none; }
.tkDoors { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; }
.tkDoor { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--brand-primary-35); background: var(--brand-primary-08); text-decoration: none; min-height: 52px; }
.tkDoor:hover { background: var(--brand-primary-12); }
.tkDoor:focus-visible { outline: 2px solid var(--brand-primary); }
.tkDoor > svg:first-child { color: var(--brand-primary); flex-shrink: 0; }
.tkDoor > svg:last-child { color: var(--brand-primary); margin-left: auto; flex-shrink: 0; }
.tkDoorText { display: flex; flex-direction: column; min-width: 0; }
.tkDoorText b { color: var(--text-primary); font-weight: 700; font-size: var(--fs-sm); }
.tkDoorText span { color: var(--text-tertiary); font-size: var(--fs-xs); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tkCq { container: tkws / inline-size; min-width: 0; }
.tkSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.tkSplit > * { min-width: 0; }
@container tkws (min-width: 960px) { .tkSplit { grid-template-columns: clamp(${layout.detailRailMin}px, 28%, 360px) minmax(0, 1fr); } }
.tkLeft { display: flex; flex-direction: column; gap: 16px; }
.tkDrop { border: 2px dashed var(--border-strong); border-radius: var(--radius-sm); padding: 28px 16px; text-align: center; cursor: pointer; background: var(--bg-surface-2); transition: border-color .15s, background .15s; }
.tkDrop[data-over="true"] { border-color: var(--brand-primary); background: var(--brand-primary-08); }
.tkDrop:focus-visible { outline: 2px solid var(--brand-primary); }
.tkDrop > svg { color: var(--text-tertiary); margin-bottom: 8px; }
.tkDropTitle { color: var(--text-primary); font-weight: 600; font-size: var(--fs-md); margin-bottom: 4px; }
.tkDropSub { color: var(--text-tertiary); font-size: var(--fs-xs); }
.tkStack { display: flex; flex-direction: column; gap: 12px; }
.tkMuted { color: var(--text-tertiary); font-size: var(--fs-xs); }
.tkFileName { color: var(--text-primary); font-weight: 600; word-break: break-all; }
.tkLink { all: unset; color: var(--text-tertiary); font-size: var(--fs-xs); text-decoration: underline; cursor: pointer; align-self: flex-start; min-height: 32px; display: inline-flex; align-items: center; }
.tkLink:focus-visible { outline: 2px solid var(--brand-primary); }
.tkRow { display: flex; gap: 8px; }
.tkRow > .k-btn { flex: 1; justify-content: center; }
.tkBar { height: 8px; border-radius: 4px; background: rgba(255,255,255,.08); overflow: hidden; }
.tkBar > div { height: 100%; border-radius: 4px; background: var(--brand-primary); transition: width .3s ease; }
.tkScan { position: relative; height: 110px; border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--border-subtle); background: var(--bg-solid); background-image: linear-gradient(var(--brand-primary-08) 1px, transparent 1px), linear-gradient(90deg, var(--brand-primary-08) 1px, transparent 1px); background-size: 20px 20px; display: grid; place-items: center; color: var(--brand-primary-35); }
.tkScanline { position: absolute; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, var(--brand-primary), transparent); animation: tkscan 2s ease-in-out infinite; }
@keyframes tkscan { 0% { top: 0 } 50% { top: calc(100% - 2px) } 100% { top: 0 } }
.tkSteps { display: flex; flex-direction: column; gap: 6px; }
.tkStep { display: flex; align-items: center; gap: 8px; font-size: var(--fs-xs); color: var(--text-tertiary); }
.tkStep i { width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; font-style: normal; font-size: 10px; font-weight: 700; border: 1px solid var(--border-default); }
.tkStep[data-state="done"] { color: var(--status-ongoing); } .tkStep[data-state="done"] i { border-color: rgba(44,255,122,.35); background: rgba(44,255,122,.12); color: var(--status-ongoing); }
.tkStep[data-state="active"] { color: var(--text-primary); } .tkStep[data-state="active"] i { border-color: var(--brand-primary-35); background: var(--brand-primary-12); color: var(--brand-primary); }
.tkDone { display: flex; flex-direction: column; gap: 12px; align-items: center; text-align: center; }
.tkDoneIcon { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: rgba(44,255,122,.12); border: 2px solid rgba(44,255,122,.3); color: var(--status-ongoing); }
.tkErr { display: flex; gap: 10px; align-items: flex-start; font-size: var(--fs-sm); color: var(--text-primary); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid rgba(255,77,94,.35); background: rgba(255,77,94,.08); }
.tkErr > svg { color: var(--status-overdue); flex-shrink: 0; margin-top: 2px; }
.tkRecent { max-height: 460px; overflow-y: auto; }
.tkRecentRow { all: unset; box-sizing: border-box; display: block; width: 100%; padding: 12px 16px; cursor: pointer; border-bottom: 1px solid var(--border-subtle); }
.tkRecentRow:hover { background: rgba(255,255,255,0.03); }
.tkRecentRow:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: -2px; }
.tkRecentRow[aria-current="true"] { background: var(--brand-primary-08); box-shadow: inset 3px 0 0 var(--brand-primary); }
.tkRecentHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.tkRecentName { font-size: var(--fs-sm); font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tkRecentSub { font-size: var(--fs-xs); color: var(--text-tertiary); margin-top: 2px; }
.tkConf { margin-top: 8px; }
.tkConf .tkBar { height: 3px; } .tkConf .tkBar > div { background: var(--status-ongoing); }
.tkSkelRow { height: 64px; border-bottom: 1px solid var(--border-subtle); background: rgba(255,255,255,0.03); }
.tkHero { display: flex; gap: 26px; align-items: center; flex-wrap: wrap; }
.tkHeroCopy { flex: 1 1 300px; min-width: 260px; }
.tkHeroEyebrow { font-size: var(--fs-xs); font-weight: 800; color: var(--brand-primary); margin-bottom: 10px; }
.tkHeroTitle { font-size: clamp(22px, 3vw, 32px); font-weight: 900; line-height: 1.08; margin: 0 0 12px; color: var(--text-primary); letter-spacing: -0.5px; }
.tkHeroText { color: var(--text-secondary); font-size: var(--fs-md); line-height: 1.55; margin: 0 0 16px; max-width: ${layout.readingMaxWidth}; }
.tkHeroList { display: grid; grid-template-columns: 1fr 1fr; gap: 9px 18px; margin: 0 0 20px; max-width: 480px; }
.tkHeroList > div { display: flex; align-items: center; gap: 8px; font-size: var(--fs-xs); color: var(--text-secondary); }
.tkHeroList svg { color: var(--brand-primary); flex-shrink: 0; }
.tkHeroImg { flex: 1 1 360px; min-width: 280px; border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border-default); position: relative; background: var(--bg-solid); }
.tkHeroImg img { display: block; width: 100%; height: auto; }
.tkHeroTag { position: absolute; bottom: 10px; left: 10px; background: rgba(13,17,23,.85); color: var(--text-primary); font-size: var(--fs-xs); font-weight: 700; padding: 5px 10px; border-radius: 7px; }
.tkFallback { display: none; flex-direction: column; gap: 10px; padding: 22px; min-height: 220px; }
.tkResult { display: flex; flex-direction: column; gap: 16px; }
.tkActionRow { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.tkActionRow > div { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tkTotalCard { display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; }
.tkTotalName { margin: 0 0 10px; font-size: clamp(18px, 2.4vw, 26px); font-weight: 900; letter-spacing: -0.4px; color: var(--text-primary); line-height: 1.1; }
.tkTotal { font-size: clamp(30px, 4.2vw, 44px); font-weight: 900; letter-spacing: -0.03em; color: var(--brand-primary); line-height: 1; font-variant-numeric: tabular-nums; }
.tkVerdict { margin: 16px 0 0; font-size: var(--fs-sm); line-height: 1.5; color: var(--text-secondary); }
.tkRing { position: relative; flex-shrink: 0; }
.tkRingLabel { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.tkRingLabel span:first-child { font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.tkRingLabel span:last-child { font-size: 9px; font-weight: 700; color: var(--text-tertiary); margin-top: 2px; }
.tkTrade { display: flex; height: 14px; border-radius: 7px; overflow: hidden; gap: 1px; }
.tkLegend { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 12px; }
.tkLegend > span { display: flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--text-tertiary); }
.tkLegend i { width: 11px; height: 11px; border-radius: 3px; display: inline-block; flex-shrink: 0; }
.tkLegend b { color: var(--text-primary); font-weight: 600; }
.tkLegend em { font-style: normal; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.tkDiv { padding: 10px 16px; border-bottom: 1px solid var(--border-subtle); border-left: 3px solid var(--div); display: flex; justify-content: space-between; align-items: center; gap: 12px; background: var(--bg-solid-2); }
.tkDiv + .k-table-wrap, .tkDiv + div { border-bottom: 1px solid var(--border-subtle); }
.tkDivCode { font-family: ui-monospace, monospace; font-size: var(--fs-xs); font-weight: 800; letter-spacing: .03em; color: var(--div); background: color-mix(in srgb, var(--div) 16%, var(--bg-solid)); border: 1px solid color-mix(in srgb, var(--div) 40%, transparent); border-radius: 6px; padding: 2px 7px; flex-shrink: 0; }
.tkDivName { font-size: var(--fs-sm); font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tkDivTotals { display: flex; gap: 16px; flex-shrink: 0; font-size: var(--fs-xs); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.tkDivTotals b { color: var(--text-primary); }
.tkMono { font-family: ui-monospace, monospace; font-size: var(--fs-xs); color: var(--text-tertiary); }
.tkMoney { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--text-primary); font-weight: 600; }
.tkDesc { display: inline-block; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.tkPct { display: flex; align-items: center; gap: 6px; min-width: 90px; }
.tkPct .tkBar { flex: 1; height: 4px; }
.tkShowAll { all: unset; box-sizing: border-box; display: block; width: 100%; padding: 12px; text-align: center; color: var(--brand-primary); font-weight: 700; font-size: var(--fs-sm); cursor: pointer; background: var(--bg-surface-2); }
.tkShowAll:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: -2px; }
.tkRecs { display: flex; flex-direction: column; gap: 10px; }
.tkRec { display: flex; gap: 10px; align-items: flex-start; font-size: var(--fs-sm); color: var(--text-secondary); line-height: 1.6; }
.tkRec i { flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 11px; font-weight: 700; background: var(--brand-primary-12); border: 1px solid var(--brand-primary-35); color: var(--brand-primary); }
.tkProse { margin: 0; color: var(--text-secondary); font-size: var(--fs-sm); line-height: 1.7; max-width: ${layout.readingMaxWidth}; }
.tkSkelCard { border-radius: var(--radius-md); background: var(--bg-surface); border: 1px solid var(--glass-border); padding: 24px; }
.tkSkelCard div { border-radius: 6px; background: rgba(255,255,255,0.06); }
@media (max-width: 640px) {
  .tkWs .k-btn, .tkWs .k-stat, .tkWs select.k-select, .tkWs .k-input, .tkWs .k-tab { min-height: 44px; }
  .tkWs .k-table td { height: 48px; }
  .tkDesc { max-width: 180px; }
  .tkHeroList { grid-template-columns: 1fr; }
}
`;

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
     with it. Only a name is required to create a project, so it is asked for
     here and the file carries straight through to analysis. */
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
  const resultRef = useRef<HTMLDivElement>(null);
  const [showAllRows, setShowAllRows] = useState(false);

  // Group the AI-extracted materials ONCE per takeoff and cap the rows we
  // synchronously render so a huge extraction can't freeze the page.
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

  // Trade-breakdown segments — divisions by cost desc, with % of grand total.
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
      // ?include=latestDetail rides the newest takeoff's materials along with the
      // list — list + detail paint from ONE round trip instead of a dependent pair.
      const res = await fetch('/api/takeoff?limit=30&include=latestDetail');
      const json = await res.json();
      // Guard the shape: an error envelope ({error}) must never become list state.
      const list: Takeoff[] = Array.isArray(json.data) ? json.data : [];
      setTakeoffs(list);
      // Deliberately NOT auto-selecting the newest takeoff — you came here to
      // start one; the newest still opens instantly from Recent Analyses.
    } finally {
      setLoadingList(false);
    }
  }, []);

  const { projects: liveProjects } = useProjects();
  useEffect(() => { setProjects(liveProjects as any); }, [liveProjects]);

  useEffect(() => {
    loadTakeoffs();
  }, [loadTakeoffs]);

  // Tear down any live analysis stream if the user navigates away mid-analysis.
  useEffect(() => () => { evtSourceRef.current?.close(); evtSourceRef.current = null; }, []);

  // Bring the opened estimate into view once it is in the DOM (stacked layouts).
  useEffect(() => {
    if (!selectedTakeoff) return;
    const el = resultRef.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedTakeoff?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Close the open result — leaving it mounted made this button look dead.
    setSelectedTakeoff(null);
    // "New Analysis" from deep in a result must visibly land ON the upload card.
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
  /* A bid value is what you BID, not what the work costs you. analyze-full
     writes grand_total from the sell price; total_cost stays the fallback for
     older rows that predate it. Shown in full — money is never truncated. */
  const totalBidValue = completed.reduce(
    (s, t) => s + (Number(t.grand_total) || Number(t.sell_price) || Number(t.total_cost) || 0),
    0,
  );

  // Real average processing time = analyzed_at − created_at across completed takeoffs
  // that carry both timestamps; guard missing/negative spans and > 1h outliers.
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

  const stats: StatItem[] = loadingList
    ? ['This Month', 'Avg Confidence', 'Total Bid Value', 'Avg Processing'].map(label => ({ label, value: '—', sub: 'Loading…' }))
    : [
        { label: 'This Month', value: thisMonthComplete.length, sub: `Completed takeoffs · ${completed.length} of ${takeoffs.length} complete overall` },
        { label: 'Avg Confidence', value: completed.length ? `${avgConfidence}%` : '—', tone: completed.length ? (avgConfidence >= 75 ? 'good' : avgConfidence >= 50 ? 'warn' : 'bad') : 'default', sub: "The AI's own score, averaged across analyses" },
        { label: 'Total Bid Value', value: completed.length ? fmt(totalBidValue) : '—', sub: 'Sum of complete takeoffs' },
        { label: 'Avg Processing', value: processingSecs.length ? `~${fmtSecs(avgProcessingSecs)}` : '—', sub: 'Per blueprint analysis' },
      ];

  // ── Line-item columns (per division) ──
  const itemColumns = (div: CsiDivision): Column<TakeoffMaterial>[] => [
    { key: 'csi_code', header: 'CSI Code', accessor: m => m.csi_code || '', render: m => <span className="tkMono">{m.csi_code}</span> },
    { key: 'description', header: 'Description', accessor: m => (m.description || '').toLowerCase(), render: m => <span className="tkDesc" title={m.description}>{m.description}</span> },
    { key: 'quantity', header: 'Qty', accessor: m => Number(m.quantity) || 0, align: 'right', render: m => <span className="tkMoney">{(m.quantity || 0).toLocaleString()}</span> },
    { key: 'unit', header: 'Unit', accessor: m => m.unit || '', render: m => <span className="tkMono">{m.unit}</span> },
    { key: 'unit_cost', header: '$ / Unit', accessor: m => Number(m.unit_cost) || 0, align: 'right', render: m => <span className="tkMoney" style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>{fmt(m.unit_cost)}</span> },
    { key: 'total_cost', header: 'Total', accessor: m => Number(m.total_cost) || 0, align: 'right', render: m => <span className="tkMoney">{fmt(m.total_cost)}</span> },
    { key: 'pct', header: '% of Div', accessor: m => div.totalCost > 0 ? (m.total_cost / div.totalCost) : 0, render: m => { const pct = div.totalCost > 0 ? Math.round((m.total_cost / div.totalCost) * 100) : 0; return <div className="tkPct"><div className="tkBar"><div style={{ width: `${pct}%` }} /></div><span className="tkMuted">{pct}%</span></div>; } },
  ];

  // ── Upload card body by phase ──
  const uploadBody = (() => {
    if (phase === 'idle') return (
      <>
        <div
          data-tour="takeoff-dropzone"
          role="button"
          tabIndex={0}
          className="tkDrop"
          data-over={dragOver ? 'true' : undefined}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <Ruler size={30} />
          <div className="tkDropTitle">Drop blueprints here</div>
          <div className="tkDropSub">or click to browse files</div>
          <div className="tkDropSub" style={{ marginTop: 12 }}>PDF, PNG, JPG, TIFF, WebP · max 200MB</div>
        </div>
      </>
    );
    if (phase === 'project-select') return (
      <div className="tkStack">
        <div className="tkMuted">File: <span className="tkFileName">{pendingFile?.name}</span></div>
        {creatingProject || projects.length === 0 ? (
          <div className="tkStack" style={{ gap: 8 }}>
            <Field label="New Project Name" required error={createErr || undefined} hint="Address, budget and contract can be filled in later — the blueprint analyses either way.">
              <Input autoFocus value={newProjectName} onChange={e => { setNewProjectName(e.target.value); setCreateErr(''); }} onKeyDown={e => { if (e.key === 'Enter' && newProjectName.trim() && !createBusy) void createProjectAndAnalyze(); }} placeholder="Mesa Library Expansion" />
            </Field>
            {projects.length > 0 && <button type="button" className="tkLink" onClick={() => { setCreatingProject(false); setCreateErr(''); }}>Pick an existing project instead</button>}
          </div>
        ) : (
          <Field label="Project" required hint="The estimate attaches to this job.">
            <Select
              aria-label="Project"
              value={selectedProjectId}
              onChange={e => {
                if (e.target.value === '__new__') { setCreatingProject(true); setSelectedProjectId(''); return; }
                setSelectedProjectId(e.target.value);
              }}
              placeholder="Select project…"
              options={[...projects.map(p => ({ value: p.id, label: p.name })), { value: '__new__', label: '+ New Project…' }]}
            />
          </Field>
        )}
        <div className="tkRow">
          <Button variant="ghost" onClick={resetUpload}>Cancel</Button>
          {creatingProject || projects.length === 0 ? (
            <Button variant="primary" disabled={!newProjectName.trim() || !pendingFile || createBusy} onClick={() => void createProjectAndAnalyze()}>{createBusy ? 'Creating…' : 'Create Project & Analyze'}</Button>
          ) : (
            <Button variant="primary" data-tour="run-takeoff" disabled={!selectedProjectId || !pendingFile} onClick={() => pendingFile && selectedProjectId && startUpload(pendingFile, selectedProjectId)}>Start Analysis</Button>
          )}
        </div>
      </div>
    );
    if (phase === 'uploading') return (
      <div className="tkStack" role="status" aria-live="polite">
        <div className="tkMuted">{progress.message}</div>
        <div className="tkBar"><div style={{ width: `${progress.pct}%` }} /></div>
        <div className="tkMuted">{progress.pct}% complete</div>
      </div>
    );
    if (phase === 'analyzing') return (
      <div className="tkStack" role="status" aria-live="polite">
        {/* Blueprint scan-line hero — gold sweep over a plan silhouette reads as "measuring". */}
        <div className="tkScan" aria-hidden><Ruler size={30} /><div className="tkScanline" /></div>
        <div style={{ color: 'var(--text-primary)', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{progress.message}</div>
        <div className="tkBar"><div style={{ width: `${progress.pct}%` }} /></div>
        <div className="tkSteps">
          {STEPS.map((step, i) => {
            const stepNum = i + 1;
            const state = progress.step > stepNum ? 'done' : progress.step === stepNum ? 'active' : 'todo';
            return <div key={i} className="tkStep" data-state={state}><i>{state === 'done' ? <Check size={11} weight="bold" /> : stepNum}</i>{step}</div>;
          })}
        </div>
      </div>
    );
    if (phase === 'done') return (
      <div className="tkDone">
        <div className="tkDoneIcon"><Check size={24} weight="bold" /></div>
        <div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>Analysis Complete</div>
          {selectedTakeoff && <div className="tkMuted">{selectedTakeoff.materials?.length || 0} line items extracted</div>}
        </div>
        <Button onClick={resetUpload} style={{ width: '100%' }}>New Analysis</Button>
      </div>
    );
    return (
      <div className="tkStack">
        <div className="tkErr" role="alert"><Warning size={16} weight="fill" /> {errorMsg || 'An error occurred. Please try again.'}</div>
        <Button onClick={resetUpload}>Try Again</Button>
      </div>
    );
  })();

  // ── Right panel ──
  let rightPanel: React.ReactNode;
  if ((loadingDetail || loadingList) && !selectedTakeoff) {
    rightPanel = (
      <div className="tkSkelCard" aria-busy="true" aria-label="Loading estimate">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 22, background: 'none' }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%' }} />
          <div style={{ flex: 1, background: 'none' }}><div style={{ width: '45%', height: 18, marginBottom: 10 }} /><div style={{ width: '65%', height: 12 }} /></div>
        </div>
        {[0, 1, 2].map(i => <div key={i} style={{ height: 44, marginBottom: 8 }} />)}
      </div>
    );
  } else if (!selectedTakeoff) {
    rightPanel = (
      <Card>
        <div
          className="tkHero"
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <div className="tkHeroCopy">
            <div className="tkHeroEyebrow">AI Blueprint Takeoff</div>
            <h2 className="tkHeroTitle">Turn a blueprint into a priced estimate.</h2>
            <p className="tkHeroText">Drop a drawing and get quantities read straight off the plan, CSI-coded line items with a material and labor split, cost per square foot, confidence scoring, and a client-ready estimate — in minutes. Every figure is the AI's reading of your plan; check it before it goes in a bid.</p>
            <div className="tkHeroList">
              {['Quantities from the drawing', 'CSI-coded line items', 'Material + labor split', 'Cost per square foot', 'Confidence scoring', 'Client-ready export'].map(f => (
                <div key={f}><CheckCircle size={15} weight="fill" /> {f}</div>
              ))}
            </div>
            <Button variant="primary" icon={<UploadSimple size={15} weight="bold" />} onClick={() => { if (phase !== 'idle') resetUpload(); fileInputRef.current?.click(); }}>Upload Blueprint</Button>
            <div className="tkMuted" style={{ marginTop: 12 }}>Drag &amp; drop a PDF, PNG or JPG anywhere here.</div>
          </div>
          <div className="tkHeroImg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/takeoff-hero.png" alt="Example priced estimate — CSI-coded line items with material and labor costs" onError={e => { const el = e.currentTarget; el.style.display = 'none'; const sib = el.nextElementSibling as HTMLElement | null; if (sib) sib.style.display = 'flex'; }} />
            {/* Fallback deliverable preview when no screenshot is shipped — reads as the output. */}
            <div className="tkFallback">
              <div className="tkHeroEyebrow" style={{ marginBottom: 0 }}>AI Blueprint Estimate — example</div>
              <div className="tkTotal" style={{ fontSize: 34 }}>$1,284,500.00</div>
              <div className="tkTrade" style={{ height: 12 }}>
                {['26', '23', '22', '09', '03', '08'].map((d, i) => <div key={d} style={{ flex: [3, 2.4, 1.8, 1.5, 1.2, 1][i], background: divColor(d) }} />)}
              </div>
              <div className="tkLegend">
                {['26', '23', '22', '09'].map(d => <span key={d}><i style={{ background: divColor(d) }} /> Div {d} {divName(d)}</span>)}
              </div>
            </div>
            <div className="tkHeroTag">Example output — your plan renders like this</div>
          </div>
        </div>
      </Card>
    );
  } else {
    const t = selectedTakeoff;
    const sf = t.building_area || 0;
    const costPerSf = sf > 0 ? (t.total_cost || 0) / sf : 0;
    const divCount = divisions.length;
    const itemCount = t.materials?.length || 0;
    const verdictBits = [
      divCount ? `${divCount} division${divCount === 1 ? '' : 's'}` : null,
      itemCount ? `${itemCount.toLocaleString()} line item${itemCount === 1 ? '' : 's'}` : null,
      costPerSf ? `${fmt(costPerSf)}/SF` : null,
      t.building_type ? `${t.building_type}` : null,
    ].filter(Boolean).join(' · ');
    const sb = statusBadge(t.status);
    const metricStats: StatItem[] = [
      { label: 'Building Area', value: sf > 0 ? `${sf.toLocaleString()} SF` : '—', sub: t.floor_count > 0 ? `${t.floor_count} floor${t.floor_count !== 1 ? 's' : ''}` : 'Floors not detected' },
      { label: 'Material Cost', value: fmt(t.material_cost), sub: 'Direct materials' },
      { label: 'Labor Cost', value: fmt(t.labor_cost), sub: 'All trades' },
      { label: 'Cost / SF', value: costPerSf > 0 ? fmt(costPerSf) : '—', sub: 'Cost subtotal ÷ area' },
      { label: 'Confidence', value: t.confidence > 0 ? `${t.confidence}%` : '—', tone: t.confidence > 0 ? (confidenceColor(t.confidence) === 'green' ? 'good' : confidenceColor(t.confidence) === 'amber' ? 'warn' : 'bad') : 'default', sub: "The AI's own score" },
    ];
    rightPanel = (
      <div className="tkResult" ref={resultRef}>
        {/* action row */}
        <div className="tkActionRow">
          <div>
            <Badge tone={sb.tone} dot>{sb.label}</Badge>
            <Badge tone="gold">AI estimate</Badge>
            {t.building_type && <Badge tone="neutral">{t.building_type}</Badge>}
            <span className="tkMuted">#{t.id.slice(0, 8)}</span>
            {t.analyzed_at && <span className="tkMuted">Analyzed {fmtDate(t.analyzed_at)}</span>}
          </div>
          <div>
            {t.status === 'complete' && t.project_id && <Button variant="primary" href={`/app/projects/${t.project_id}/takeoff`} icon={<CaretRight size={14} weight="bold" />}>Build Bid + Compliance</Button>}
            <Button icon={<DownloadSimple size={14} weight="bold" />} onClick={() => exportCSV(t)} disabled={!t.materials?.length}>Export CSV</Button>
            <Button onClick={resetUpload}>New Analysis</Button>
          </div>
        </div>

        {/* hero total */}
        <Card>
          <div className="tkTotalCard">
            <div style={{ minWidth: 240, flex: '1 1 auto' }}>
              <div className="tkHeroEyebrow">AI Blueprint Estimate · cost subtotal</div>
              <h2 className="tkTotalName">{t.project_name || t.project_name_detected || 'Untitled Project'}</h2>
              <div className="tkTotal">{fmt(t.total_cost)}</div>
              {(Number(t.grand_total) || Number(t.sell_price)) ? <div className="tkMuted" style={{ marginTop: 8 }}>Bid (sell price): <b style={{ color: 'var(--text-primary)' }}>{fmt(Number(t.grand_total) || Number(t.sell_price))}</b></div> : null}
            </div>
            {t.confidence > 0 && <ConfidenceRing value={t.confidence} />}
          </div>
          {verdictBits && <p className="tkVerdict">Complete estimate across {verdictBits}.</p>}
        </Card>

        <StatRow items={metricStats} />

        {/* trade breakdown */}
        {tradeSegments.length > 0 && (
          <Card title="Cost by Trade" subtitle="Where the money is — CSI divisions by share of the cost subtotal.">
            <div className="tkTrade">
              {tradeSegments.map(s => <div key={s.divCode} title={`Div ${s.divCode} ${s.divName} — ${fmt(s.totalCost)} (${s.pct.toFixed(0)}%)`} style={{ width: `${s.pct}%`, background: s.color, minWidth: s.pct > 0 ? 2 : 0 }} />)}
            </div>
            <div className="tkLegend">
              {tradeSegments.map(s => <span key={s.divCode}><i style={{ background: s.color }} /><b>Div {s.divCode}</b><span>{s.divName}</span><em>{fmt(s.totalCost)}</em><span>{s.pct.toFixed(0)}%</span></span>)}
            </div>
          </Card>
        )}

        <Card flush>
          <div style={{ padding: '0 16px' }}>
            <Tabs value={activeTab} onChange={(k) => setActiveTab(k as typeof activeTab)} tabs={[
              { key: 'items', label: 'Line Items', count: itemCount },
              { key: 'summary', label: 'Cost Summary' },
              { key: 'recs', label: 'Recommendations', count: t.recommendations?.length || 0 },
            ]} />
          </div>

          {activeTab === 'items' && (
            t.materials?.length ? (
              <div>
                {cappedDivisions.map(div => (
                  <div key={div.divCode} style={{ ['--div' as any]: divColor(div.divCode) }}>
                    <div className="tkDiv">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                        <span className="tkDivCode">DIV {div.divCode}</span>
                        <span className="tkDivName">{div.divName || divName(div.divCode)}</span>
                      </span>
                      <div className="tkDivTotals"><span>{div.totalLaborHours.toFixed(0)} hrs</span><b>{fmt(div.totalCost)}</b></div>
                    </div>
                    <DataTable columns={itemColumns(div)} rows={div.items} rowKey={m => m.id} />
                  </div>
                ))}
                {rowsCapped && <button type="button" className="tkShowAll" onClick={() => setShowAllRows(true)}>Showing first {CSI_ROW_CAP.toLocaleString()} of {totalMatRows.toLocaleString()} line items — show all</button>}
              </div>
            ) : (
              <EmptyState icon={<ListChecks size={22} />} title={t.status === 'analyzing' ? 'Analysis in progress…' : 'No line items yet'} text={t.status === 'analyzing' ? 'The AI is reading your blueprint and extracting quantities.' : 'No line items are available for this estimate.'} />
            )
          )}

          {activeTab === 'summary' && (
            <div style={{ padding: 16 }}>
              <StatRow items={[
                { label: 'Material Cost', value: fmt(t.material_cost), sub: 'Direct materials' },
                { label: 'Labor Cost', value: fmt(t.labor_cost), sub: 'All trades' },
                { label: 'Contingency', value: `${t.contingency_pct || 10}%`, sub: fmt((t.total_cost || 0) * ((t.contingency_pct || 10) / 100)) },
                { label: 'Building Area', value: t.building_area > 0 ? `${t.building_area.toLocaleString()} SF` : '—', sub: t.floor_count > 0 ? `${t.floor_count} floor${t.floor_count !== 1 ? 's' : ''}` : undefined },
              ]} />
              {t.summary && (
                <div style={{ marginTop: 16 }}>
                  <div className="tkHeroEyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Sparkle size={13} weight="fill" /> AI Summary</div>
                  <p className="tkProse">{t.summary}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'recs' && (
            <div style={{ padding: 16 }}>
              {t.recommendations?.length > 0 ? (
                <>
                  <div className="tkHeroEyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Lightbulb size={13} weight="fill" /> AI Estimator Recommendations</div>
                  <div className="tkRecs">{t.recommendations.map((rec, i) => <div key={i} className="tkRec"><i>{i + 1}</i><span>{rec}</span></div>)}</div>
                </>
              ) : (
                <EmptyState icon={<Lightbulb size={22} />} title="No recommendations" text="The analysis returned no estimator recommendations for this estimate." />
              )}
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="tkWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.webp" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ''; }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Takeoff Studio' }]}
        title="Takeoff Studio"
        subtitle="AI blueprint analysis, measured takeoff, assemblies, and rates — no spreadsheet."
        actions={
          <>
            {!loadingList && <Badge tone="neutral">{takeoffs.length} total</Badge>}
            {!loadingList && <Badge tone="ongoing">{completed.length} complete</Badge>}
            <Button variant="primary" icon={<UploadSimple size={15} weight="bold" />} onClick={() => { if (phase !== 'idle') resetUpload(); fileInputRef.current?.click(); }}>Upload Blueprint</Button>
          </>
        }
      >
        {/* The Studio's doors — measured takeoff / assemblies / rates. One row, every tool. */}
        <div className="tkDoors">
          {[
            { href: '/app/takeoff/measured', title: 'Measured Takeoff', sub: 'Trace & price the drawing live', icon: <Ruler size={16} weight="duotone" /> },
            { href: '/app/takeoff/assemblies', title: 'Assembly Library', sub: 'Templates that explode into bills', icon: <Stack size={16} weight="duotone" /> },
            { href: '/app/takeoff/rates', title: 'Cost Rates', sub: 'Your material & labor rates', icon: <CurrencyDollar size={16} weight="duotone" /> },
          ].map(d => (
            <Link key={d.href} href={d.href} className="tkDoor">
              {d.icon}
              <span className="tkDoorText"><b>{d.title}</b><span>{d.sub}</span></span>
              <CaretRight size={14} weight="bold" />
            </Link>
          ))}
        </div>

        <StatRow items={stats} />

        <div className="tkCq">
          <div className="tkSplit">
            {/* LEFT PANEL */}
            <div className="tkLeft">
              <Card title="New Analysis" subtitle={phase === 'idle' ? 'One blueprint at a time — the estimate attaches to a project.' : undefined}>
                {uploadBody}
              </Card>

              <Card title="Recent Analyses" subtitle={!loadingList && takeoffs.length > 0 ? `${takeoffs.length} on file — tap one to open it.` : undefined} flush>
                <div className="tkRecent">
                  {loadingList && [0, 1, 2].map(i => <div key={i} className="tkSkelRow" style={{ opacity: 0.8 - i * 0.2 }} />)}
                  {!loadingList && takeoffs.length === 0 && <EmptyState icon={<Target size={22} />} title="No takeoffs yet" text="Your first analysis lands here." />}
                  {takeoffs.map(t => {
                    const isSelected = selectedTakeoff?.id === t.id;
                    const b = statusBadge(t.status);
                    return (
                      <button key={t.id} type="button" className="tkRecentRow" aria-current={isSelected ? 'true' : undefined} onClick={() => loadDetail(t.id)}>
                        <div className="tkRecentHead">
                          <div style={{ minWidth: 0 }}>
                            <div className="tkRecentName">{t.project_name || t.name || 'Untitled'}</div>
                            <div className="tkRecentSub">{fmtDate(t.created_at)} · #{t.id.slice(0, 8)}</div>
                          </div>
                          <Badge tone={b.tone}>{b.label}</Badge>
                        </div>
                        {t.status === 'complete' && t.confidence > 0 && (
                          <div className="tkConf"><div className="tkBar"><div style={{ width: `${t.confidence}%` }} /></div><div className="tkRecentSub" style={{ marginTop: 3 }}>{t.confidence}% confidence</div></div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* RIGHT DETAIL PANEL */}
            <div>{rightPanel}</div>
          </div>
        </div>
      </PageShell>
    </div>
  );
}
