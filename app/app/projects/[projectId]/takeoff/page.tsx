'use client';

import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { useParams } from 'next/navigation';
import { applyMarkupStack } from '@/lib/takeoff/engine';
import { laborAllocation, lineDirectCost, lineLabor, type LaborAllocation } from '@/lib/takeoff-line-cost';
import { QTY_CHECK_TAG } from '@/lib/takeoff-quantity-sanity';
import { parsePastedLines, looksLikeGrid } from '@/lib/estimating/paste';
import { humanError } from '@/lib/errors';
import { useToast } from '../../../../../components/Toast';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { Blueprint, Copy, Table, ArrowRight, DownloadSimple, FileXls, Package, CurrencyDollar, Lightning, CheckCircle, Ruler, Robot, CircleNotch, Circle, Plus, Sparkle, ShieldCheck, Timer, Buildings, TrendUp, Stack, Target, MagicWand, FileText, Scroll, FolderSimple, SealCheck, Warning, Calculator, NotePencil, Trash, X } from '@phosphor-icons/react';
import { SectionCard } from '@/components/ui/SectionCard';
import { UiFx } from '@/components/ui/fx';
import Suggest from '@/components/ui/Suggest';

interface TakeoffItem {
  /** takeoff_materials.id — present once loaded/hydrated from the DB. Editing requires it. */
  id?: string;
  csiCode: string;
  csiDivision: string;
  csiName: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  laborHours: number;
  notes: string;
}

interface TakeoffResult {
  takeoffId: string;
  projectName: string;
  buildingType: string;
  estimatedSF: number;
  /** Storeys the AI read off the drawings — not a number derived from price. */
  floorCount?: number;
  confidence: number;
  summary: string;
  items: TakeoffItem[];
  totalMaterialCost: number;
  totalLaborCost: number;
  totalProjectCost: number;
  contingency: number;
  recommendations: string[];
  itemCount: number;
  // honesty payload (present once analysis completes)
  pagesTotal?: number;
  pagesAnalyzed?: number;
  sheetsTotal?: number;
  sheetsAnalyzed?: number;
  sheetsSkipped?: number;
  disciplines?: string[];
  truncated?: boolean;
  truncationNote?: string;
  elapsedSec?: number;
  multiSheet?: boolean;
}


interface ProgressState {
  step: number;
  message: string;
  pct: number;
}

// Construct each formatter ONCE at module scope — previously these built a new
// Intl.NumberFormat on every call (~5×/row × hundreds of rows × 60fps slider drags
// = thousands of allocations per render, a major cause of the main-thread freeze).
const CURRENCY_FMT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const NUMBER_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fmt$ = (n: number) => CURRENCY_FMT.format(Number.isFinite(n) ? n : 0);
const fmtN = (n: number) => NUMBER_FMT.format(Number.isFinite(n) ? n : 0);
// Safe numeric coercion for SSE done-payload fields (which arrive as unknown JSON).
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** Human file size — a 3 KB drawing used to read "0.0 MB". KB under 1 MB, MB above. */
const fmtFileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// The compliance chain endpoint (task 2). SSE — SAME contract as sage-auto-docs:
//   progress { step, pct, message } · error { message } · done { ...counts }
// The "Yes, build it all" flow runs sage-auto-docs THEN this, streaming both.
const complianceEndpoint = (takeoffId: string) => `/api/takeoff/${takeoffId}/sage-compliance`;

interface AutoBuildSummary {
  packages: number;
  jackets: number;
  sov: boolean;
  /** Project is still bidding — the pay app / SOV wait for the award (not a failure). */
  sovDeferred?: boolean;
  lienWaivers: number;
  w9s: number;
  filed: number;
}

// Hard cap on synchronously-rendered rows so a huge AI extraction can't freeze the
// page building thousands of DOM nodes at once. Beyond this, we show a "load more".
/* Every row carries four editable cells and four buttons, so the cap is really
   a cap on ~8x that many interactive nodes. At 300 that is ~2,400 in one
   synchronous commit, and a 168-row takeoff was already enough to lock the
   renderer solid — the page stopped answering at all. 60 rows is ~480 nodes,
   which paints instantly, and "show all" is one click away. */
const ROW_RENDER_CAP = 60;

const CSI_DIVISION_NAMES: Record<string, string> = {
  '01': 'General Requirements',
  '02': 'Existing Conditions',
  '03': 'Concrete',
  '04': 'Masonry',
  '05': 'Metals',
  '06': 'Wood, Plastics, Composites',
  '07': 'Thermal and Moisture Protection',
  '08': 'Openings',
  '09': 'Finishes',
  '10': 'Specialties',
  '11': 'Equipment',
  '12': 'Furnishings',
  '21': 'Fire Suppression',
  '22': 'Plumbing',
  '23': 'HVAC',
  '26': 'Electrical',
  '27': 'Communications',
  '28': 'Electronic Safety',
  '31': 'Earthwork',
  '32': 'Exterior Improvements',
  '33': 'Utilities',
};

const GOLD = 'var(--brand-primary)';
const GOLD_HI = 'var(--brand-primary-strong)';
const AMBER = 'var(--brand-primary-hover)';
const GREEN = '#2CFF7A';
const SURFACE = 'rgba(255,255,255,0.02)';
const BORDER = 'rgba(255,255,255,0.05)';

const ROW_GRID = '100px 1fr 80px 56px 80px 110px 110px 64px';

// ── Inline line-item editing (GC-owned lines) ─────────────────────────────────
interface LinePatch { description?: string; quantity?: number; unit?: string; unitCost?: number; notes?: string }
interface LineDraft { description: string; quantity: number; unit: string; unitCost: number; notes: string }

const UNIT_OPTIONS = ['EA', 'SF', 'LF', 'SY', 'CY', 'LB', 'TON', 'HR', 'LS', 'GAL'];

/** A row is editable once it carries a real DB id (tmp- rows are still syncing). */
const isSavedRow = (item: TakeoffItem) => !!item.id && !item.id.startsWith('tmp-');

/** DB materials → view items. Shared by the mount loader and post-analysis id hydration. */
function mapMaterials(mats: Array<Record<string, unknown>>): TakeoffItem[] {
  return mats
    .filter((m) => Number(m.quantity) > 0 && Number(m.unit_cost) > 0)
    .map((m) => ({
      id:          m.id != null ? String(m.id) : undefined,
      csiCode:     String(m.csi_code   || ''),
      csiDivision: String(m.csi_code   || '').slice(0, 2),
      csiName:     String(m.csi_name   || ''),
      description: String(m.description || ''),
      quantity:    Number(m.quantity)  || 0,
      unit:        String(m.unit       || ''),
      unitCost:    Number(m.unit_cost) || 0,
      totalCost:   Number(m.total_cost) || (Number(m.quantity) * Number(m.unit_cost)),
      laborHours:  Number(m.labor_hours) || 0,
      notes:       String(m.notes      || ''),
    }));
}

/** Client PREVIEW of the server totals math (Σ line costs, labor = hours × $65,
 *  contingency on top) — the identical formula /api/takeoff/materials/[id] persists,
 *  so the optimistic ribbon matches the server-confirmed numbers to the dollar. */
function recomputeResult(prev: TakeoffResult, items: TakeoffItem[]): TakeoffResult {
  const mat  = items.reduce((s, i) => s + (Number(i.totalCost) || 0), 0);
  const lab  = items.reduce((s, i) => s + (Number(i.laborHours) || 0) * 65, 0);
  const cont = Number(prev.contingency) || 0;
  return {
    ...prev, items,
    totalMaterialCost: mat,
    totalLaborCost:    lab,
    totalProjectCost:  Math.round((mat + lab) * (1 + cont / 100)),
    itemCount:         items.length,
  };
}

// ── Shared cinematic FX (keyframes + interaction classes) ──────────────────────
// Rendered once per state via <style>. Every animation is disabled under
// prefers-reduced-motion by the trailing media query.
const FX_KEYFRAMES = `
@keyframes tkRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes tkPop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
@keyframes tkFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes tkScanV{0%{transform:translateY(0);opacity:0}8%{opacity:1}92%{opacity:1}100%{transform:translateY(var(--tkScanH,420px));opacity:0}}
@keyframes tkGlow{0%,100%{box-shadow:0 0 0 1px color-mix(in srgb, var(--brand-primary) 30%, transparent),0 22px 60px -18px color-mix(in srgb, var(--brand-primary) 20%, transparent),inset 0 0 60px color-mix(in srgb, var(--brand-primary) 4.5%, transparent)}50%{box-shadow:0 0 0 1px color-mix(in srgb, var(--brand-primary) 55%, transparent),0 26px 90px -14px color-mix(in srgb, var(--brand-primary) 34%, transparent),inset 0 0 90px var(--brand-primary-08)}}
@keyframes tkRing{0%{transform:scale(.85);opacity:.75}70%{opacity:0}100%{transform:scale(1.75);opacity:0}}
@keyframes tkAur1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(7%,5%) scale(1.14)}}
@keyframes tkAur2{0%,100%{transform:translate(0,0) scale(1.06)}50%{transform:translate(-8%,6%) scale(1)}}
@keyframes tkAur3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(5%,-7%) scale(1.16)}}
@keyframes tkGridPan{from{background-position:0 0}to{background-position:34px 34px}}
@keyframes tkShimmer{from{background-position:180% 0}to{background-position:-180% 0}}
@keyframes tkSpin{to{transform:rotate(360deg)}}
@keyframes tkSweep{0%{top:-8%}100%{top:108%}}
@keyframes tkPulseA{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb, var(--brand-primary) 34%, transparent)}50%{box-shadow:0 0 0 22px transparent}}
@keyframes tkBarShine{0%{transform:translateX(-140%)}55%,100%{transform:translateX(360%)}}
.tkHover{transition:transform .2s cubic-bezier(.2,.7,.3,1),box-shadow .2s ease,border-color .2s ease,background .2s ease}
.tkHover:hover{transform:translateY(-5px);border-color:color-mix(in srgb, var(--brand-primary) 45%, transparent)}
.tkHover:hover .tkIcon{box-shadow:0 0 22px color-mix(in srgb, var(--brand-primary) 34%, transparent)}
.tkBtn{transition:transform .16s ease,box-shadow .16s ease,filter .16s ease}
.tkBtn:hover{transform:translateY(-2px);filter:brightness(1.06)}
.tkShine{background-size:200% 100%;animation:tkShimmer 3.4s linear infinite}
/* Beat the global h1/h2 !important size caps (globals.css) with higher specificity */
h1.tkH1{font-size:clamp(34px,5.6vw,62px)!important;font-weight:900!important;line-height:1.03!important;letter-spacing:-0.03em!important}
h2.tkH2{font-size:clamp(22px,3vw,30px)!important;font-weight:800!important;line-height:1.15!important;letter-spacing:-0.02em!important}
/* Tactile markup sliders — white knob with a colored glow (color set inline per slider) */
.tkRange{-webkit-appearance:none;appearance:none;height:8px;border-radius:999px;outline:none}
.tkRange::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:2px solid currentColor;box-shadow:0 0 10px currentColor,0 2px 6px rgba(0,0,0,.55);cursor:pointer;transition:transform .12s ease}
.tkRange::-webkit-slider-thumb:hover{transform:scale(1.18)}
.tkRange::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#fff;border:2px solid currentColor;box-shadow:0 0 10px currentColor,0 2px 6px rgba(0,0,0,.55);cursor:pointer}
/* Inline line-item editing */
.tkEditable{border-radius:6px;padding:2px 6px;margin:-2px -6px;cursor:text;transition:background .15s ease,box-shadow .15s ease}
.tkEditable:hover{background:color-mix(in srgb, var(--brand-primary) 10%, transparent);box-shadow:inset 0 0 0 1px var(--brand-primary-35)}
/* The selected cell has to be obvious — keyboard navigation is useless if
   you cannot see where you are. Solid ring, not the hover tint. */
.tkEditable:focus{outline:none;background:color-mix(in srgb, var(--brand-primary) 14%, transparent);box-shadow:inset 0 0 0 2px color-mix(in srgb, var(--brand-primary) 90%, transparent)}
.tkEditable:focus-visible{outline:none;background:color-mix(in srgb, var(--brand-primary) 14%, transparent);box-shadow:inset 0 0 0 2px color-mix(in srgb, var(--brand-primary) 90%, transparent)}
.tkCellInput{width:100%;background:var(--brand-primary-08);border:1px solid color-mix(in srgb, var(--brand-primary) 50%, transparent);border-radius:6px;color:#fff;font-size:13px;padding:4px 7px;outline:none;font-family:inherit}
.tkCellInput:focus{box-shadow:0 0 0 2px var(--brand-primary-25)}
.tkCellInput::placeholder{color:rgba(255,255,255,0.35)}
.tkIconBtn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;border:1px solid rgba(255,255,255,0.10);background:rgba(255,255,255,0.04);cursor:pointer;transition:border-color .15s ease,background .15s ease}
.tkIconBtn:hover{border-color:color-mix(in srgb, var(--brand-primary) 50%, transparent);background:var(--brand-primary-12)}
.tkIconBtn:disabled{opacity:.35;cursor:default}
@keyframes tkUndoIn{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}
@media (prefers-reduced-motion: reduce){
  .tkRoot, .tkRoot *{animation:none!important;transition:none!important}
  .tkHover:hover,.tkBtn:hover{transform:none!important}
}
`;

// Scoped animated backdrop — aurora gold blobs + drifting blueprint grid + vignette.
// position:absolute so it fills only the page's content column (never bleeds under the
// project sidebar). Purely decorative; pointer-events:none keeps the dropzone clickable.
/* `still` drops every infinite animation. The results page is tall (a 55-line table,
   cards, charts) and this backdrop is absolutely positioned over ALL of it: three
   600px blobs under 30-42px blur, transform-animated forever, plus a masked grid
   whose background-position pans every frame — background-position is not a
   compositor property, so that layer was repainted (mask + gradients) on the main
   thread 60 times a second across the full page height. That is the renderer stall
   seen after results render. The hero screens keep the motion; the work screen
   does not need it. */
function Aurora({ soft = false, still = false }: { soft?: boolean; still?: boolean }) {
  const grid =
    'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),' +
    'linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)';
  const gridMask = 'radial-gradient(120% 78% at 50% 14%, #000 24%, transparent 76%)';
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 50% -8%, rgba(255,255,255,0.04), transparent 55%)' }} />
      {/* Warm aurora blobs removed — jet black + glass (docs/COPY-STYLE.md §6). */}
      <div style={{ position: 'absolute', inset: -24, backgroundImage: grid, backgroundSize: '34px 34px', animation: still ? 'none' : 'tkGridPan 9s linear infinite', maskImage: gridMask, WebkitMaskImage: gridMask, opacity: soft ? 0.35 : 0.65 }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(130% 100% at 50% -6%, transparent 50%, rgba(2,4,8,0.62))' }} />
    </div>
  );
}

/** Click-to-edit cell: renders the formatted value; a click swaps in an input.
 *  Enter/blur commits (parent validates + PATCHes), Escape cancels. Purely local
 *  state — keystrokes never touch the parent, so typing stays instant. */
function EditableCell({ rawValue, display, align, numeric, disabled, cellStyle, onCommit }: {
  rawValue: string;
  display: React.ReactNode;
  align: 'left' | 'right';
  numeric?: boolean;
  disabled?: boolean;
  cellStyle: React.CSSProperties;
  onCommit: (raw: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const box = useRef<HTMLDivElement>(null);

  /* An estimator works this grid the way they work a spreadsheet: tab across,
     enter to drop a row, type straight over a value. Click-to-edit alone means
     reaching for the mouse on every cell of a 54-line takeoff.
     Cells carry tabIndex so Tab and Shift-Tab come free from the browser in DOM
     order; Enter and the arrows move by whole rows, which needs the column
     count — four editable columns per line (description, qty, unit, $/unit). */
  const step = (dir: 'up' | 'down' | 'left' | 'right') => {
    const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-tkcell]'));
    const here = box.current ? cells.indexOf(box.current) : -1;
    if (here < 0) return;
    const COLS = 4;
    const delta = dir === 'right' ? 1 : dir === 'left' ? -1 : dir === 'down' ? COLS : -COLS;
    cells[here + delta]?.focus();
  };

  if (editing) {
    return (
      <input
        className="tkCellInput"
        type={numeric ? 'number' : 'text'}
        step={numeric ? 'any' : undefined}
        value={draft}
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); onCommit(draft); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            setEditing(false); onCommit(draft);
            // Excel convention: Enter commits and drops to the row below.
            requestAnimationFrame(() => step('down'));
          }
          if (e.key === 'Escape') { e.preventDefault(); setEditing(false); box.current?.focus(); }
          if (e.key === 'Tab') { setEditing(false); onCommit(draft); } // browser moves focus
        }}
        style={{ textAlign: align }}
      />
    );
  }
  return (
    <div
      ref={box}
      data-tkcell
      role="gridcell"
      tabIndex={disabled ? -1 : 0}
      className={disabled ? undefined : 'tkEditable'}
      title={disabled ? 'Syncing with server…' : 'Click, or press Enter, to edit'}
      onClick={() => { if (!disabled) { setDraft(rawValue); setEditing(true); } }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); setDraft(rawValue); setEditing(true); return; }
        if (e.key === 'ArrowDown')  { e.preventDefault(); step('down');  return; }
        if (e.key === 'ArrowUp')    { e.preventDefault(); step('up');    return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); step('right'); return; }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); step('left');  return; }
        // Typing over a cell replaces it, as it would in a spreadsheet.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault(); setDraft(e.key); setEditing(true);
        }
      }}
      style={{ textAlign: align, minWidth: 0, ...cellStyle }}
    >
      {display}
    </div>
  );
}

/** One editable takeoff line: inline edit on description / qty / unit / $/unit,
 *  a note editor (indicator dot when a note exists), and delete-with-undo. */
const EditableRow = memo(function EditableRow({ item, idx, sellMult, laborAlloc, onPatch, onDuplicate, onInsertBelow, onDelete }: {
  item: TakeoffItem;
  idx: number;
  /** Bid price ÷ direct cost — applied to the line's DIRECT cost (material + labor). */
  sellMult: number;
  laborAlloc: LaborAllocation;
  onPatch: (item: TakeoffItem, patch: LinePatch) => void;
  onDuplicate: (item: TakeoffItem) => void;
  onInsertBelow: (item: TakeoffItem) => void;
  onDelete: (item: TakeoffItem) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const editable = isSavedRow(item);
  const hasNote = !!item.notes && item.notes.trim().length > 0;
  /* The analyzer's quantity sanity check (lib/takeoff-quantity-sanity) writes a
     QTY_CHECK_TAG note when it corrected or doubts a line. Surfaced on the row
     itself — a note hidden behind the note button is not a warning. */
  const qtyCheck = hasNote && item.notes.includes(QTY_CHECK_TAG);
  const labor = lineLabor(item, laborAlloc);
  const direct = item.totalCost + labor;

  const commitNum = (field: 'quantity' | 'unitCost') => (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n === item[field]) return; // invalid / unchanged → keep old
    onPatch(item, { [field]: n });
  };
  const commitText = (field: 'description' | 'unit') => (raw: string) => {
    const v = raw.trim();
    if (!v || v === item[field]) return;
    onPatch(item, { [field]: v });
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: ROW_GRID, padding: '8px 16px', borderBottom: `1px solid rgba(255,255,255,0.04)`, fontSize: 13, alignItems: 'center', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
        <div style={{ color: GOLD, fontFamily: 'monospace', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          {item.csiCode}
          {qtyCheck && (
            <span title={item.notes} aria-label="Quantity flagged for review" style={{ display: 'inline-flex', cursor: 'help' }}>
              <Warning size={14} weight="fill" color="#FF3B30" />
            </span>
          )}
        </div>
        <EditableCell rawValue={item.description} display={item.description} align="left" disabled={!editable}
          cellStyle={{ color: 'rgba(255,255,255,0.85)', marginRight: 8 }} onCommit={commitText('description')} />
        <EditableCell rawValue={String(item.quantity)} display={fmtN(item.quantity)} align="right" numeric disabled={!editable}
          cellStyle={{ color: 'rgba(255,255,255,0.7)' }} onCommit={commitNum('quantity')} />
        <EditableCell rawValue={item.unit} display={item.unit} align="right" disabled={!editable}
          cellStyle={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }} onCommit={commitText('unit')} />
        <EditableCell rawValue={String(item.unitCost)} display={`$${item.unitCost.toFixed(2)}`} align="right" numeric disabled={!editable}
          cellStyle={{ color: 'rgba(255,255,255,0.6)' }} onCommit={commitNum('unitCost')} />
        <div style={{ textAlign: 'right', color: GOLD, fontWeight: 600 }}
          title={`Material ${fmt$(item.totalCost)} + labor ${fmt$(labor)}${item.laborHours ? ` (${fmtN(item.laborHours)} hrs)` : ''}`}>
          {fmt$(direct)}
        </div>
        <div style={{ textAlign: 'right', color: '#2CFF7A', fontWeight: 600 }}>{fmt$(direct * sellMult)}</div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button className="tkIconBtn" disabled={!editable} title={hasNote ? 'Edit note' : 'Add note'}
            onClick={() => { setNoteDraft(item.notes || ''); setNoteOpen((o) => !o); }}>
            <NotePencil size={14} weight="duotone" color={hasNote ? GOLD_HI : 'rgba(255,255,255,0.55)'} />
            {hasNote && <span aria-hidden style={{ position: 'absolute', top: 2, right: 2, width: 6, height: 6, borderRadius: '50%', background: GOLD, boxShadow: '0 0 6px color-mix(in srgb, var(--brand-primary) 90%, transparent)' }} />}
          </button>
          <button className="tkIconBtn" disabled={!editable} title="Duplicate this line below"
            onClick={() => onDuplicate(item)}>
            <Copy size={14} weight="duotone" color="rgba(255,255,255,0.55)" />
          </button>
          <button className="tkIconBtn" disabled={!editable} title="Insert an empty line below"
            onClick={() => onInsertBelow(item)}>
            <Plus size={14} weight="bold" color="rgba(255,255,255,0.55)" />
          </button>
          <button className="tkIconBtn" disabled={!editable} title="Delete line (6s undo)" onClick={() => onDelete(item)}>
            <Trash size={14} weight="duotone" color="rgba(255,59,48,0.85)" />
          </button>
        </div>
      </div>
      {noteOpen && (
        <div style={{ padding: '8px 16px 12px', borderBottom: `1px solid rgba(255,255,255,0.04)`, background: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <NotePencil size={15} weight="duotone" color={GOLD_HI} style={{ marginTop: 8, flexShrink: 0 }} />
          <textarea
            className="tkCellInput"
            rows={2}
            autoFocus
            placeholder="Note for this line item — saved to the takeoff, rides on exports"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            style={{ resize: 'vertical', minHeight: 36, lineHeight: 1.45, textAlign: 'left' }}
          />
          <button className="tkIconBtn" title="Save note"
            onClick={() => { setNoteOpen(false); if (noteDraft.trim() !== (item.notes || '').trim()) onPatch(item, { notes: noteDraft.trim() }); }}>
            <CheckCircle size={15} weight="fill" color={GREEN} />
          </button>
          <button className="tkIconBtn" title="Cancel" onClick={() => setNoteOpen(false)}>
            <X size={14} weight="bold" color="rgba(255,255,255,0.6)" />
          </button>
        </div>
      )}
    </>
  );
});

/** Inline add-line composer for one CSI division — a SectionCard in the flow of the
 *  table (never a modal). Validates locally; the server recomputes the line total
 *  and the takeoff totals on save. */
function DivisionComposer({ div, divName, onAdd, onClose }: {
  div: string;
  divName: string;
  onAdd: (div: string, draft: LineDraft) => Promise<boolean>;
  onClose: () => void;
}) {
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('EA');
  const [unitCost, setUnitCost] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const q = Number(qty);
  const uc = Number(unitCost);
  const valid = description.trim().length > 0 && Number.isFinite(q) && q > 0 && Number.isFinite(uc) && uc > 0;
  const preview = valid ? q * uc : 0;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const added = await onAdd(div, { description: description.trim(), quantity: q, unit: unit.trim() || 'EA', unitCost: uc, notes: notes.trim() });
    setBusy(false);
    if (added) onClose();
  };

  return (
    <div style={{ padding: '10px 16px 14px', borderBottom: `1px solid ${BORDER}` }}>
      <SectionCard
        title={`Add Line — Division ${div}`}
        subtitle={`${divName} · the server recomputes qty × $/unit and reconfirms the takeoff totals on save`}
        icon={<Plus size={18} weight="bold" />}
        accentBar
        padding={14}
        actions={<button className="tkIconBtn" title="Close" onClick={onClose}><X size={14} weight="bold" color="rgba(255,255,255,0.6)" /></button>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) 90px 90px 110px', gap: 8 }}>
          <input className="tkCellInput" placeholder="Description (e.g. 4in slab on grade)" value={description}
            onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} style={{ textAlign: 'left' }} />
          <input className="tkCellInput" placeholder="Qty" type="number" step="any" min={0} value={qty}
            onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} style={{ textAlign: 'right' }} />
          <Suggest className="tkCellInput" placeholder="Unit" options={UNIT_OPTIONS} value={unit}
            onChange={(e) => setUnit(e.target.value)} style={{ textAlign: 'right' }} />
          <input className="tkCellInput" placeholder="$/Unit" type="number" step="any" min={0} value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} style={{ textAlign: 'right' }} />
        </div>
        <input className="tkCellInput" placeholder="Note (optional)" value={notes}
          onChange={(e) => setNotes(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} style={{ marginTop: 8, textAlign: 'left' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={submit} disabled={!valid || busy} className="tkBtn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none', background: valid ? `linear-gradient(135deg, ${GOLD}, ${AMBER})` : 'rgba(255,255,255,0.06)', color: valid ? '#0A0A00' : 'rgba(255,255,255,0.35)', fontWeight: 800, fontSize: 12.5, cursor: valid && !busy ? 'pointer' : 'not-allowed' }}>
            {busy ? <CircleNotch size={14} weight="bold" style={{ animation: 'tkSpin .9s linear infinite' }} /> : <Plus size={14} weight="bold" />} Add Line
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, color: valid ? GOLD : 'rgba(255,255,255,0.35)' }}>
            {valid ? `= ${fmt$(preview)} cost` : 'Description, qty > 0 and $/unit > 0 required'}
          </span>
        </div>
      </SectionCard>
    </div>
  );
}

/**
 * Memoized line-item table. Because `groupedItems` is memoized on the takeoff in the
 * parent, this component's props are reference-stable across markup-slider drags, so
 * React.memo skips re-rendering the (potentially thousands-of-rows) table entirely —
 * killing the freeze. Rows are also capped to ROW_RENDER_CAP with a "show all" toggle
 * so a huge AI extraction can't build thousands of DOM nodes in one synchronous commit.
 * Every row is inline-editable (qty / unit / $/unit / description / notes / delete),
 * and each division header carries an add-line composer.
 */
const LineItemTable = memo(function LineItemTable({ groupedItems, sellMult, laborAlloc, onPatch, onAdd, onPaste, onDuplicate, onInsertBelow, onDelete }: {
  groupedItems: Record<string, TakeoffItem[]>;
  sellMult: number;
  laborAlloc: LaborAllocation;
  onPatch: (item: TakeoffItem, patch: LinePatch) => void;
  onAdd: (div: string, draft: LineDraft) => Promise<boolean>;
  onPaste: (div: string, text: string) => Promise<number>;
  onDuplicate: (item: TakeoffItem) => void;
  onInsertBelow: (item: TakeoffItem) => void;
  onDelete: (item: TakeoffItem) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [composerDiv, setComposerDiv] = useState<string | null>(null);
  const entries = useMemo(
    () => Object.entries(groupedItems).sort(([a], [b]) => a.localeCompare(b)),
    [groupedItems],
  );
  const totalRows = useMemo(() => entries.reduce((s, [, items]) => s + items.length, 0), [entries]);
  const capped = !showAll && totalRows > ROW_RENDER_CAP;

  let budget = capped ? ROW_RENDER_CAP : Infinity;
  return (
    <>
      {entries.map(([div, items]) => {
        if (budget <= 0) return null;
        const shown = budget === Infinity ? items : items.slice(0, budget);
        budget -= shown.length;
        const divTotal = items.reduce((s, i) => s + lineDirectCost(i, laborAlloc), 0);
        const divName = CSI_DIVISION_NAMES[div] || `Division ${div}`;
        return (
          <div
            key={div}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text/plain');
              // A single value pasted into a cell being edited must still behave
              // normally — only claim the event when it is actually a grid.
              if (!looksLikeGrid(text)) return;
              e.preventDefault();
              void onPaste(div, text);
            }}
          >
            <div style={{ padding: '8px 16px', background: 'color-mix(in srgb, var(--brand-primary) 6%, transparent)', borderBottom: `1px solid ${BORDER}`, borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontWeight: 700, color: GOLD }}>
              <span>Division {div} — {divName}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={() => setComposerDiv((d) => (d === div ? null : div))}
                  title={`Add a line to Division ${div}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 7, border: '1px solid var(--brand-primary-35)', background: composerDiv === div ? 'color-mix(in srgb, var(--brand-primary) 16%, transparent)' : 'color-mix(in srgb, var(--brand-primary) 6%, transparent)', color: GOLD_HI, fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
                  <Plus size={11} weight="bold" color={GOLD_HI} /> Add Line
                </button>
                {/* Estimators arrive with a block of cells already copied. Reading
                    it here is the difference between this grid being usable and
                    being retyping work. Ctrl+V anywhere in the division does the
                    same thing — this button is for anyone who looks for one. */}
                <button
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text.trim()) await onPaste(div, text);
                    } catch {
                      // Clipboard read is permission-gated in some browsers; the
                      // onPaste handler below still catches a real Ctrl+V.
                    }
                  }}
                  title={`Paste rows from a spreadsheet into Division ${div} — description, quantity, unit, unit cost`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', color: 'rgba(255,255,255,0.62)', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
                  Paste Rows
                </button>
                <span>{fmt$(divTotal)}</span>
              </span>
            </div>
            {composerDiv === div && (
              <DivisionComposer div={div} divName={divName} onAdd={onAdd} onClose={() => setComposerDiv(null)} />
            )}
            {shown.map((item, idx) => (
              <EditableRow key={item.id ?? `${div}-${idx}`} item={item} idx={idx} sellMult={sellMult} laborAlloc={laborAlloc} onPatch={onPatch} onDuplicate={onDuplicate} onInsertBelow={onInsertBelow} onDelete={onDelete} />
            ))}
          </div>
        );
      })}
      {capped && (
        <button
          onClick={() => setShowAll(true)}
          style={{ width: '100%', padding: '12px', background: 'var(--brand-primary-08)', border: 'none', borderTop: `1px solid ${BORDER}`, color: GOLD, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          Showing the first {fmtN(ROW_RENDER_CAP)} of {fmtN(totalRows)} lines — show all
        </button>
      )}
    </>
  );
});

export default function TakeoffPage() {
  const { projectId } = useParams() as { projectId: string };
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<'upload' | 'analyzing' | 'results'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Which analysis lane the server put us in (fast = single sheet / small set,
  // the only path we promise "under 2 min" for). Null until the server reports.
  const [lane, setLane] = useState<{ fast: boolean; pages: number; image: boolean } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [takeoffId, setTakeoffId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>({ step: 0, message: '', pct: 0 });

  /* Unsaved-work protection. The line items save themselves row by row, so the
     work at risk here is not a form — it is a blueprint that has been picked
     but not analyzed, and an analysis already running. Leaving mid-run loses
     the pass and the money it cost, with nothing on screen to say so. No
     draftKey: a File cannot be serialized into localStorage, so this is the
     prompt-only layer of the guard. */
  const analysisInFlight = state === 'analyzing';
  const guard = useUnsavedGuard({
    dirty: analysisInFlight || (state === 'upload' && !!selectedFile),
  });
  const [result, setResult] = useState<TakeoffResult | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [overheadPct, setOverheadPct] = useState(10);
  const [profitPct, setProfitPct] = useState(10);
  const [contingencyPct, setContingencyPct] = useState(10);
  /* applyMarkupStack has always computed the full AGC stack — tax on material,
     burden on labor, GC on direct, then OH, contingency, fee and bond. This
     screen only ever fed it three of the seven, so the other four silently
     computed as zero and the sell price was low by exactly the amount a real
     bid carries. They are inputs now. Defaults are the ones the unreachable
     estimate builder shipped with, which are sane starting points for AZ. */
  const [salesTaxPct, setSalesTaxPct] = useState(0);
  const [laborBurdenPct, setLaborBurdenPct] = useState(0);
  const [generalConditionsPct, setGeneralConditionsPct] = useState(0);
  const [bondPct, setBondPct] = useState(0);
  // Autonomous "Yes, build it all" flow: summary after the full chain, and the
  // manual-picker toggle ("Let me pick" reveals the individual document actions).
  const [autoSummary, setAutoSummary] = useState<AutoBuildSummary | null>(null);
  const [pickMode, setPickMode] = useState(false);
  // Honest hand-off: the newest takeoff on this project is a MEASURED one (Takeoff
  // Studio owns its condition-based detail) — link there instead of blanking to upload.
  const [measuredHandoff, setMeasuredHandoff] = useState<{ id: string; name: string; total: number } | null>(null);
  /* True until the mount lookup below finishes. Without it the upload hero
     ("Drop a plan") showed for several seconds on a job that already had a
     finished takeoff, then snapped to the results. */
  const [checkingExisting, setCheckingExisting] = useState(true);

  // Load latest completed takeoff on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Step 1: get list of takeoffs for this project
      const listRes = await fetch(`/api/takeoff?projectId=${projectId}&limit=5`);
      if (cancelled || !listRes.ok) return;
      const { data: list } = await listRes.json();
      if (cancelled || !Array.isArray(list) || list.length === 0) return;

      // Newest-first completed takeoffs. The newest may be a MEASURED takeoff
      // (Takeoff Studio writes px_per_ft/scale_confidence onto the header and its
      // lines live in takeoff_line_items) — its home is the Studio, so this AI
      // viewer walks back to the newest takeoff that HAS renderable materials
      // instead of blanking to the upload screen when the first pick comes up empty.
      const completed: Array<Record<string, unknown>> = list.filter((t: { status: string }) => t.status === 'complete');
      if (completed.length === 0) return;
      const isMeasured = (t: Record<string, unknown>) => t.px_per_ft != null || t.scale_confidence != null;

      let data: Record<string, any> | null = null;
      let items: TakeoffItem[] = [];
      for (const t of completed) {
        if (isMeasured(t)) continue; // measured → hand-off card below, not this viewer
        // Step 2: load full detail (includes materials)
        const detailRes = await fetch(`/api/takeoff/${t.id}`);
        if (cancelled) return;
        if (!detailRes.ok) continue;
        const { data: d } = await detailRes.json();
        if (cancelled) return;
        if (!d || d.status !== 'complete') continue;
        const mats: Array<Record<string, unknown>> = d.materials || [];
        if (mats.length === 0) continue;
        const mapped = mapMaterials(mats);
        if (mapped.length === 0) continue;
        data = d; items = mapped;
        break;
      }
      if (!data) {
        // Nothing renderable here — if the newest completed takeoff is a measured
        // one, hand off honestly to Takeoff Studio instead of showing upload.
        const newest = completed[0];
        if (isMeasured(newest)) {
          setMeasuredHandoff({
            id: String(newest.id),
            name: String(newest.name || newest.project_name_detected || 'Measured takeoff'),
            total: Number(newest.sell_price ?? newest.grand_total) || 0,
          });
        }
        return;
      }
      // (mapMaterials is module-level — shared with post-analysis id hydration,
      //  and it now carries each row's DB id so every line is inline-editable)

      const materialTotal  = items.reduce((s, i) => s + i.totalCost, 0);
      // Compute labor from hours × $65 if labor_cost not stored
      const laborFromHrs   = items.reduce((s, i) => s + i.laborHours * 65, 0);
      const laborTotal     = Number(data.labor_cost) > 0 ? Number(data.labor_cost) : laborFromHrs;
      const contingencyPct = Number(data.contingency_pct) || 10;
      const subtotal       = materialTotal + laborTotal;
      const computedTotal  = Math.round(subtotal * (1 + contingencyPct / 100));

      setResult({
        takeoffId:         String(data.id),
        projectName:       String(data.project_name_detected || data.project_name || ''),
        buildingType:      String(data.building_type || ''),
        estimatedSF:       Number(data.building_area) || 0,
        floorCount:        Number(data.floor_count) || 0,
        confidence:        Number(data.confidence)    || 0,
        summary:           String(data.summary        || ''),
        items,
        totalMaterialCost: materialTotal,
        totalLaborCost:    laborTotal,
        totalProjectCost:  Number(data.total_cost) > 0 ? Number(data.total_cost) : computedTotal,
        contingency:       contingencyPct,
        recommendations:   Array.isArray(data.recommendations) ? data.recommendations : [],
        itemCount:         items.length,
      });
      /* The analyzer picked a contingency for this job and folded it into
         takeoffs.total_cost. The slider is now the ONE place contingency is
         applied, so it starts at the analyzer's number instead of a flat 10%
         stacked on top of a total that already carried it. */
      setContingencyPct(Math.min(25, Math.max(0, Math.round(contingencyPct))));
      if (cancelled) return;
      setTakeoffId(String(data.id));
      setState('results');
    };
    load()
      .catch((e) => console.error('[takeoff] could not load the existing takeoff', e))
      .finally(() => { if (!cancelled) setCheckingExisting(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  // ── Inline line-item editing: optimistic patch / add / delete-with-undo, every
  //    mutation confirmed by the server's own totals recompute. ─────────────────
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'confirmed' | 'error'>('idle');
  const [undoDelete, setUndoDelete] = useState<{ item: TakeoffItem; index: number } | null>(null);
  const pendingSavesRef = useRef(0);
  const saveFadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoRef = useRef<{ item: TakeoffItem; index: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const resultRef = useRef<TakeoffResult | null>(null);
  useEffect(() => { resultRef.current = result; }, [result]);

  const beginSave = useCallback(() => {
    pendingSavesRef.current += 1;
    if (saveFadeRef.current) { clearTimeout(saveFadeRef.current); saveFadeRef.current = null; }
    setSaveState('saving');
  }, []);
  const endSave = useCallback((okDone: boolean) => {
    pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
    if (pendingSavesRef.current > 0) return;
    setSaveState(okDone ? 'confirmed' : 'error');
    if (saveFadeRef.current) clearTimeout(saveFadeRef.current);
    saveFadeRef.current = setTimeout(() => setSaveState('idle'), 2600);
  }, []);

  // The server's recompute (Σ costs, hours × $65, contingency) is the source of
  // truth — overwrite the optimistic preview with whatever it actually persisted.
  const applyServerTotals = useCallback((totals: Record<string, unknown> | undefined) => {
    if (!totals) return;
    setResult((prev) => prev ? {
      ...prev,
      totalMaterialCost: Number(totals.materialCost) || 0,
      totalLaborCost:    Number(totals.laborCost)    || 0,
      totalProjectCost:  Number(totals.totalCost)    || 0,
    } : prev);
  }, []);

  const patchLine = useCallback(async (item: TakeoffItem, patch: LinePatch) => {
    if (!item.id) return;
    // Optimistic: apply the patch + preview totals with the same math the server runs
    setResult((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((it) => {
        if (it.id !== item.id) return it;
        const qty  = patch.quantity != null ? Number(patch.quantity) : it.quantity;
        const cost = patch.unitCost != null ? Number(patch.unitCost) : it.unitCost;
        return {
          ...it,
          description: patch.description != null ? patch.description : it.description,
          unit:        patch.unit        != null ? patch.unit        : it.unit,
          notes:       patch.notes       != null ? patch.notes       : it.notes,
          quantity:    qty,
          unitCost:    cost,
          totalCost:   qty * cost,
        };
      });
      return recomputeResult(prev, items);
    });
    beginSave();
    try {
      const res = await fetch(`/api/takeoff/materials/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Failed to save the edit');
      applyServerTotals((body as { data?: { totals?: Record<string, unknown> } }).data?.totals);
      endSave(true);
    } catch (err: unknown) {
      // Roll back JUST this row to its pre-patch object (concurrent edits survive)
      setResult((prev) => prev ? recomputeResult(prev, prev.items.map((it) => (it.id === item.id ? item : it))) : prev);
      endSave(false);
      console.error(err);
      showToast(humanError(err, 'Could not save the edit — the line was restored.'), 'error');
    }
  }, [beginSave, endSave, applyServerTotals, showToast]);

  /* afterId places the new row directly beneath an existing one. Omitted, the
     line appends — which is what Add line and a spreadsheet paste both want. */
  const addLine = useCallback(async (div: string, draft: LineDraft, afterId?: string): Promise<boolean> => {
    const tid = resultRef.current?.takeoffId || takeoffId;
    if (!tid) { showToast('Takeoff still syncing — try again in a moment.', 'error'); return false; }
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const csiCode = `${div} 00 00`;
    const csiName = CSI_DIVISION_NAMES[div] || `Division ${div}`;
    const optimistic: TakeoffItem = {
      id: tempId, csiCode, csiDivision: div, csiName,
      description: draft.description, quantity: draft.quantity, unit: draft.unit,
      unitCost: draft.unitCost, totalCost: draft.quantity * draft.unitCost,
      laborHours: 0, notes: draft.notes,
    };
    setResult((prev) => {
      if (!prev) return prev;
      // Land the optimistic row where the server will put it, so the line does
      // not appear at the bottom and then jump on the next load.
      const at = afterId ? prev.items.findIndex((it) => it.id === afterId) : -1;
      const items = at >= 0
        ? [...prev.items.slice(0, at + 1), optimistic, ...prev.items.slice(at + 1)]
        : [...prev.items, optimistic];
      return recomputeResult(prev, items);
    });
    beginSave();
    try {
      const res = await fetch(`/api/takeoff/materials/${tid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csiCode, csiName, description: draft.description, quantity: draft.quantity, unit: draft.unit, unitCost: draft.unitCost, notes: draft.notes, afterId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Failed to add the line');
      const data = (body as { data?: { material?: Record<string, unknown>; totals?: Record<string, unknown> } }).data;
      setResult((prev) => {
        if (!prev) return prev;
        const items = prev.items.map((it) => it.id === tempId
          ? { ...it, id: data?.material?.id != null ? String(data.material.id) : undefined, totalCost: Number(data?.material?.total_cost) || it.totalCost }
          : it);
        return recomputeResult(prev, items);
      });
      applyServerTotals(data?.totals);
      endSave(true);
      showToast('Line added', 'success');
      return true;
    } catch (err: unknown) {
      setResult((prev) => prev ? recomputeResult(prev, prev.items.filter((it) => it.id !== tempId)) : prev);
      endSave(false);
      console.error(err);
      showToast(humanError(err, 'Could not add the line. Please try again.'), 'error');
      return false;
    }
  }, [takeoffId, beginSave, endSave, applyServerTotals, showToast]);

  /* Paste a block of spreadsheet cells into a division.
     Parsing lives in lib/takeoff/paste.ts; this walks the result through the
     same addLine path a typed line takes, so the optimistic row, the save
     badge and the server round-trip are identical either way. Sequential on
     purpose — the server assigns ids and recomputes totals per line, and firing
     forty at once races that. */
  /* Duplicate a line, landing it directly beneath its original.
     Repetitive scope is most of a takeoff — six door types, four wall
     assemblies — and retyping the row to change one number is the slowest
     thing in the sheet. afterId puts it beside its neighbour rather than at
     the bottom, which is the whole point. */
  const duplicateLine = useCallback(async (item: TakeoffItem) => {
    const div = item.csiCode?.slice(0, 2) || 'XX';
    await addLine(div, {
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitCost: item.unitCost,
      notes: item.notes || '',
    }, item.id);
  }, [addLine]);

  /* An empty line directly beneath this one, ready to type into. */
  const insertLineBelow = useCallback(async (item: TakeoffItem) => {
    const div = item.csiCode?.slice(0, 2) || 'XX';
    await addLine(div, {
      description: 'New line',
      quantity: 1,
      unit: item.unit || 'EA',
      unitCost: 0.01,
      notes: '',
    }, item.id);
  }, [addLine]);

  const pasteLines = useCallback(async (div: string, text: string): Promise<number> => {
    const parsed = parsePastedLines(text);
    if (!parsed.length) {
      showToast('Nothing to paste — copy rows from your spreadsheet first.', 'error');
      return 0;
    }
    let added = 0;
    for (const line of parsed) {
      const ok = await addLine(div, { ...line, notes: '' });
      if (ok) added++;
    }
    if (added) {
      showToast(
        added === parsed.length
          ? `Added ${added} line${added === 1 ? '' : 's'} to Division ${div}.`
          : `Added ${added} of ${parsed.length} lines — the rest could not be saved.`,
        added === parsed.length ? 'success' : 'error',
      );
    }
    return added;
  }, [addLine, showToast]);

  const commitDelete = useCallback(async (item: TakeoffItem, index: number) => {
    beginSave();
    try {
      const res = await fetch(`/api/takeoff/materials/${item.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Delete failed');
      applyServerTotals((body as { data?: { totals?: Record<string, unknown> } }).data?.totals);
      endSave(true);
    } catch (err: unknown) {
      // Restore the row where it was
      setResult((prev) => {
        if (!prev) return prev;
        const items = [...prev.items];
        items.splice(Math.min(index, items.length), 0, item);
        return recomputeResult(prev, items);
      });
      endSave(false);
      console.error(err);
      showToast(humanError(err, 'Could not delete the line — it was restored.'), 'error');
    }
  }, [beginSave, endSave, applyServerTotals, showToast]);

  // Soft delete: the row leaves the table (and the preview totals) immediately, but
  // the server DELETE only fires after a 6s undo window. One pending undo at a time —
  // a second delete commits the first immediately.
  const deleteLine = useCallback((item: TakeoffItem) => {
    if (!item.id) return;
    const cur = resultRef.current;
    if (!cur) return;
    const index = cur.items.findIndex((it) => it.id === item.id);
    if (index < 0) return;
    const prevPending = undoRef.current;
    if (prevPending) {
      clearTimeout(prevPending.timer);
      undoRef.current = null;
      void commitDelete(prevPending.item, prevPending.index);
    }
    setResult((prev) => prev ? recomputeResult(prev, prev.items.filter((it) => it.id !== item.id)) : prev);
    const timer = setTimeout(() => {
      if (undoRef.current?.item.id !== item.id) return;
      undoRef.current = null;
      setUndoDelete(null);
      void commitDelete(item, index);
    }, 6000);
    undoRef.current = { item, index, timer };
    setUndoDelete({ item, index });
  }, [commitDelete]);

  const undoPendingDelete = useCallback(() => {
    const pending = undoRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    undoRef.current = null;
    setUndoDelete(null);
    setResult((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items.splice(Math.min(pending.index, items.length), 0, pending.item);
      return recomputeResult(prev, items);
    });
  }, []);

  // Leaving the page with a delete still in its undo window commits it on the way
  // out (keepalive survives the navigation; no state updates on an unmounted tree).
  useEffect(() => () => {
    if (saveFadeRef.current) clearTimeout(saveFadeRef.current);
    const pending = undoRef.current;
    if (pending) {
      clearTimeout(pending.timer);
      fetch(`/api/takeoff/materials/${pending.item.id}`, { method: 'DELETE', keepalive: true }).catch(() => {});
    }
  }, []);

  // After a fresh SSE analysis the streamed items carry no DB ids. Pull the
  // persisted rows once (same order + filter as the mount loader) so every line
  // becomes editable — totals stay as analyzed until the first edit.
  const hydrateIds = useCallback(async (tid: string) => {
    try {
      const res = await fetch(`/api/takeoff/${tid}`);
      if (!res.ok) return;
      const { data } = await res.json();
      const mapped = mapMaterials(Array.isArray(data?.materials) ? data.materials : []);
      if (mapped.length === 0) return;
      setResult((prev) => (prev && prev.takeoffId === tid ? { ...prev, items: mapped } : prev));
    } catch { /* non-fatal — rows stay read-only until reload */ }
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    const valid = ['application/pdf', 'image/png', 'image/jpeg', 'image/tiff', 'image/webp'];
    if (!valid.includes(file.type)) {
      showToast('Invalid file type. Please use PDF, PNG, JPG, or TIFF.', 'error');
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      showToast('File too large. Maximum 200MB.', 'error');
      return;
    }
    setSelectedFile(file);
  }, [showToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  /* Add another discipline file to the takeoff that is already open. The
     server merges it into the same blueprint and re-reads the whole set. */
  const addSheetsRef = useRef<HTMLInputElement>(null);
  const addSheets = async (file: File) => {
    if (!file || !takeoffId) return;
    if (file.size > 200 * 1024 * 1024) { showToast('File too large. Maximum 200MB.', 'error'); return; }
    try {
      showToast(`Adding ${file.name}…`);
      const urlRes = await fetch(`/api/takeoff/${takeoffId}/upload-url`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name }),
      });
      const urlData = await urlRes.json().catch(() => ({}));
      if (!urlRes.ok) throw new Error(urlData.error || 'Could not start the upload.');

      const put = await fetch(urlData.signedUrl, {
        method: 'PUT',
        headers: { 'x-upsert': 'true', ...(file.type ? { 'Content-Type': file.type } : {}) },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status}).`);

      const doneRes = await fetch(`/api/takeoff/${takeoffId}/upload-complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: urlData.path, fileName: file.name, fileType: file.type || 'application/pdf', fileSize: file.size }),
      });
      const doneData = await doneRes.json().catch(() => ({}));
      if (!doneRes.ok) throw new Error(doneData.error || 'Upload failed');

      showToast(
        doneData.merged
          ? `Added — ${doneData.sourceCount} files, ${doneData.pageCount ?? '?'} sheets. Re-reading the set…`
          : 'Replaced the blueprint. Re-reading…',
      );
      /* Re-run the read so the new sheets are actually priced. */
      setAutoSummary(null);
      setState('analyzing');
      handleAnalyze(takeoffId);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not add the file.', 'error');
    }
  };

  const handleAnalyze = async (existingTakeoffId?: string) => {
    if (!existingTakeoffId && !selectedFile) return;
    setState('analyzing');
    setLane(null);
    setProgress({ step: 1, message: 'Creating takeoff record…', pct: 5 });

    try {
      /* Re-reading a takeoff that already has its sheets skips straight to the
         stream — there is nothing to create and nothing to upload. */
      let analysisId = existingTakeoffId ?? '';
      if (!analysisId) {
      const file = selectedFile!;
      // 1. Create takeoff record
      const createRes = await fetch('/api/takeoff/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!createRes.ok) {
        const e = await createRes.json();
        throw new Error(e.error || 'Failed to create takeoff');
      }
      const { data: newTakeoff } = await createRes.json();
      analysisId = newTakeoff.id;
      setTakeoffId(analysisId);

      /* 2. Upload the bytes STRAIGHT TO STORAGE.
         A serverless function will not take a request body over 4.5 MB, and a
         real 25-sheet set is 20–100 MB. Posting the file to /upload meant the
         platform rejected it at the edge with a non-JSON 413, which this code
         could only report as "Upload failed" — the exact thing the GC hit.
         A signed URL has no such ceiling, and the PUT still reports progress. */
      setProgress({ step: 2, message: 'Uploading blueprint…', pct: 10 });
      setUploadPct(0);

      const urlRes = await fetch(`/api/takeoff/${analysisId}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name }),
      });
      const urlData = await urlRes.json().catch(() => ({}));
      if (!urlRes.ok) throw new Error(urlData.error || 'Could not start the upload.');

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', urlData.signedUrl);
        xhr.setRequestHeader('x-upsert', 'true');
        if (file.type) xhr.setRequestHeader('Content-Type', file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadPct(pct);
            setProgress({ step: 2, message: `Uploading blueprint… ${pct}%`, pct: 10 + Math.round(pct * 0.05) });
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status}). Please try again.`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });

      // Count the sheets, build the thumbnail, mark it ready to analyze.
      const doneRes = await fetch(`/api/takeoff/${analysisId}/upload-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: urlData.path,
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          fileSize: file.size,
        }),
      });
      const doneData = await doneRes.json().catch(() => ({}));
      if (!doneRes.ok) throw new Error(doneData.error || 'Upload failed');

      /* Say what landed. A set arriving as three discipline PDFs used to keep
         only the last one, silently — so the count is worth stating out loud. */
      if (doneData.merged) {
        showToast(`Added to the set — ${doneData.sourceCount} files, ${doneData.pageCount ?? '?'} sheets.`);
      } else if (doneData.replacedPrevious) {
        showToast('Replaced the previous blueprint (images cannot be added to a PDF set).');
      }

      }

      // 3. Connect SSE analysis stream
      setProgress({ step: 3, message: 'Connecting to AI…', pct: 15 });
      const eventSource = new EventSource(`/api/takeoff/${analysisId}/analyze`);
      let analysisResolved = false;

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);

          if (data.event === 'progress') {
            setProgress({ step: data.step, message: data.message, pct: data.pct });
          }

          if (data.event === 'lane') {
            setLane({ fast: !!data.fast, pages: Number(data.pages) || 1, image: !!data.image });
          }

          if (data.event === 'result') {
            analysisResolved = true;
            eventSource.close();
            setResult(data as TakeoffResult);
            if (Number.isFinite(Number(data.contingency))) {
              setContingencyPct(Math.min(25, Math.max(0, Math.round(Number(data.contingency)))));
            }
            setState('results');
            // hydrate DB row ids in the background so every line is editable
            void hydrateIds(String(analysisId));
            const sheetsMsg = data.sheetsAnalyzed
              ? ` from ${data.sheetsAnalyzed}${data.sheetsTotal && data.sheetsTotal !== data.sheetsAnalyzed ? ` of ${data.sheetsTotal}` : ''} sheet${data.sheetsAnalyzed === 1 ? '' : 's'}`
              : '';
            const timeMsg = data.elapsedSec ? ` in ${data.elapsedSec}s` : '';
            showToast(`Analysis complete — ${data.itemCount} line items${sheetsMsg}${timeMsg}.`, 'success');
            if (data.truncated && data.truncationNote) {
              setTimeout(() => showToast(data.truncationNote, 'error'), 400);
            }
          }

          if (data.event === 'error') {
            analysisResolved = true;
            eventSource.close();
            console.error('takeoff analysis error', data.message);
            showToast(humanError(data.message, 'Analysis failed. Please try again.'), 'error');
            setState('upload');
            setProgress({ step: 0, message: '', pct: 0 });
          }

          if (data.event === 'done') {
            analysisResolved = true;
            eventSource.close();
          }
        } catch { /* ignore parse errors on malformed chunks */ }
      };

      eventSource.onerror = () => {
        eventSource.close();
        // Guard: natural SSE stream close also fires onerror — only act if we never got a result
        if (!analysisResolved) {
          showToast('Connection lost during analysis. Please try again.', 'error');
          setState('upload');
          setProgress({ step: 0, message: '', pct: 0 });
        }
      };

    } catch (err: unknown) {
      console.error(err);
      showToast(humanError(err, 'Analysis failed. Please try again.'), 'error');
      setState('upload');
      setProgress({ step: 0, message: '', pct: 0 });
    }
  };

  const handleGenerateBidPackages = async () => {
    /* No analyzed takeoff in hand means this button is on screen doing
       nothing. Say so rather than swallowing the press. */
    if (!result) { showToast('Run the blueprint analysis first — there is nothing to build bid packages from.', 'error'); return; }
    setGenerating('bid-packages');
    try {
      // Divisions 27 (Communications) + 28 (Electronic Safety) are ONE trade on a
      // jobsite — the low-volt sub pulls the cable AND hangs the cameras. Bidding
      // them as two "Division NN" packages doubles the paperwork and confuses subs.
      const canon = (c?: string) => { const d = c?.slice(0, 2); return d === '28' ? '27' : d; };
      const divisions = [...new Set(result.items.map(i => canon(i.csiCode)))].filter((d): d is string => !!d);
      let created = 0;

      for (const div of divisions) {
        const divItems = result.items.filter(i => canon(i.csiCode) === div);
        const divTotal = divItems.reduce((sum, i) => sum + i.totalCost, 0);
        const divName  = div === '27' ? 'Low Voltage & Networking' : (CSI_DIVISION_NAMES[div] || `Division ${div}`);

        const res = await fetch('/api/bid-packages/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            name:         div === '27' ? 'Low Voltage & Networking' : `Division ${div} — ${divName}`,
            trade:        divName,
            csiCodes:     [...new Set(divItems.map(i => i.csiCode))],
            scopeSummary: divItems.map(i => `${i.description}: ${fmtN(i.quantity)} ${i.unit}`).join('\n'),
            dueDate:      new Date(Date.now() + (divTotal > 250_000 ? 21 : 14) * 86_400_000).toISOString().split('T')[0],
            requiresBond: divTotal > 100_000,
            lineItems: divItems.map(i => ({
              description: i.description,
              quantity:    i.quantity,
              unit:        i.unit,
              unitPrice:   i.unitCost,
              totalAmount: i.totalCost,
              csiCode:     i.csiCode,
            })),
          }),
        });
        if (res.ok) created++;
      }

      showToast(`${created} bid package${created !== 1 ? 's' : ''} created.`, 'success');
    } catch (err: unknown) {
      console.error(err); showToast(humanError(err, 'Failed to create bid packages. Please try again.'), 'error');
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateSOV = async () => {
    /* No analyzed takeoff in hand means this button is on screen doing
       nothing. Say so rather than swallowing the press. */
    if (!result) { showToast('Run the blueprint analysis first — there is nothing to build a schedule of values from.', 'error'); return; }
    setGenerating('sov');
    try {
      const res = await fetch('/api/pay-apps/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          periodFrom:    new Date().toISOString().split('T')[0],
          periodTo:      new Date().toISOString().split('T')[0],
          contractSum:   bidPrice,
          // lineItems is what the API reads — each item maps to a schedule_of_values row
          lineItems: result.items.map(i => ({
            description:    `${i.csiCode} — ${i.description}`,
            // Each line's share of the bid, so the G703 column foots to contractSum.
            scheduledValue: Math.round(lineDirectCost(i, laborAlloc) * bidRatio * 100) / 100,
            csiCode:        i.csiCode,
            balanceToFinish: Math.round(lineDirectCost(i, laborAlloc) * bidRatio * 100) / 100,
          })),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || 'Failed to create SOV');
      }
      showToast(`Schedule of Values created — ${result.items.length} line items`, 'success');
    } catch (err: unknown) {
      console.error(err); showToast(humanError(err, 'Failed to generate SOV. Please try again.'), 'error');
    } finally {
      setGenerating(null);
    }
  };


  // Generic SSE runner — resolves with the `done` payload, rejects on `error` or a
  // dropped connection. Reused by the autonomous chain so both phases stream progress.
  const runSSE = useCallback(
    (url: string, onProgress: (p: { step?: number; pct?: number; message?: string }) => void) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const es = new EventSource(url);
        let resolved = false;
        es.onmessage = (e) => {
          try {
            const evt = JSON.parse(e.data);
            if (evt.event === 'progress') onProgress(evt);
            else if (evt.event === 'error') { es.close(); reject(new Error(evt.message || 'Generation failed')); }
            else if (evt.event === 'done') { resolved = true; es.close(); resolve(evt); }
          } catch { /* ignore malformed chunks */ }
        };
        es.onerror = () => { es.close(); if (!resolved) reject(new Error('Connection lost. Please try again.')); };
      }),
    [],
  );

  // ── AUTONOMOUS: "Yes, build it all" ──────────────────────────────────────────
  // Runs the existing sage-auto-docs chain (bid packages + jackets + SOV) THEN the
  // new compliance chain (task 2 — lien waivers + W-9 requests, filed to Documents/
  // Compliance) in one shot, streaming a single combined progress bar (phase 1 = 0-50%,
  // phase 2 = 50-100%), then surfaces a summary card.
  const handleBuildItAll = async () => {
    if (!result) return;

    /* On a page that was reloaded rather than analyzed in this session,
       takeoffId could be null — and this used to `return` on that, so the
       button did precisely nothing: no request, no error, no toast. Pressing
       it looked identical to it being broken, which it was. Resolve the id
       from the project, and if that genuinely fails, say so. */
    let buildId = takeoffId;
    if (!buildId) {
      try {
        const res = await fetch(`/api/takeoff?projectId=${projectId}&limit=5`);
        const body = await res.json().catch(() => ({}));
        const rows: Array<{ id?: string; status?: string }> = body.data ?? body.takeoffs ?? [];
        buildId = rows.find((t) => t.status === 'complete')?.id ?? null;
        if (buildId) setTakeoffId(buildId);
      } catch { /* handled just below */ }
    }
    if (!buildId) {
      showToast('Could not tell which takeoff to build from. Reload the page and try again.', 'error');
      return;
    }

    setPickMode(false);
    setAutoSummary(null);
    setGenerating('auto');
    setProgress({ step: 1, message: 'Creating project budget…', pct: 2 });
    try {
      /* The budget was the one thing the old "Generate All Documents" path did
         that this one did not — the sole reason three buttons existed. Folded
         in here so there is one action and it is the complete one. */
      const budgetOk = await handleCreateBudget(true); // nested: keep generating === 'auto'

      setProgress({ step: 1, message: 'Sage is reading your takeoff…', pct: 5 });
      // Single stream — sage-auto-docs now builds bid packages + jackets + SOV AND
      // files the compliance package (lien waivers + W-9 + COI requests) inline, so
      // one SSE run covers the whole thing (its internal progress already maps 0-100%).
      const docs = await runSSE(
        `/api/takeoff/${buildId}/sage-auto-docs`,
        (p) => setProgress({
          step: p.step ?? 1,
          message: p.message ?? 'Building bid jackets + compliance…',
          pct: Math.max(3, Math.round(p.pct ?? 0)),
        }),
      );

      // Consume the done payload defensively (field-name variants tolerated).
      const summary: AutoBuildSummary = {
        packages:    num(docs.packagesCreated),
        jackets:     num(docs.jacketsGenerated),
        sov:         !!docs.sovCreated,
        sovDeferred: !!docs.sovDeferred,
        lienWaivers: num(docs.lienWaiversFiled ?? docs.lienWaiversCreated ?? docs.waiversCreated ?? docs.lienWaivers),
        w9s:         num(docs.w9RequestsFiled ?? docs.w9RequestsCreated ?? docs.w9sCreated ?? docs.w9Requests ?? docs.w9s),
        filed:       num(docs.coiRequestsFiled ?? docs.filedCount ?? docs.documentsFiled ?? docs.filed),
      };
      setProgress({ step: 0, message: '', pct: 100 });
      setAutoSummary(summary);

      const built: string[] = [];
      const failed: string[] = [];
      (budgetOk ? built : failed).push('budget');
      if (summary.packages) built.push(`${summary.packages} bid packages`); else failed.push('bid packages');
      if (summary.jackets) built.push(`${summary.jackets} jacket PDFs`); else failed.push('jacket PDFs');
      if (summary.sov) built.push('schedule of values');
      else if (!summary.sovDeferred) failed.push('schedule of values');
      if (summary.lienWaivers) built.push(`${summary.lienWaivers} lien waivers`);
      if (summary.w9s) built.push(`${summary.w9s} W-9 requests`);

      showToast(
        failed.length
          ? `Built ${built.join(', ')}. Did not build: ${failed.join(', ')}.`
          : `Sage built it all — ${built.join(', ')}.`,
        failed.length ? 'error' : 'success',
      );
    } catch (err: unknown) {
      console.error(err);
      showToast(humanError(err, 'Build failed. Please try again.'), 'error');
    } finally {
      setGenerating(null);
      setProgress({ step: 0, message: '', pct: 0 });
    }
  };

  const exportXLS = async () => {
    if (!result || !takeoffId) return;
    setGenerating('xls');
    try {
      const res = await fetch(`/api/takeoff/${takeoffId}/export-xls`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `takeoff-${projectId}-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err: unknown) {
      console.error(err); showToast(humanError(err, 'Export failed. Please try again.'), 'error');
    } finally {
      setGenerating(null);
    }
  };

  // ── Generate Budget from Takeoff ──
  /**
   * Create the budget from the takeoff.
   *
   * `nested` is set when "Build the bid + compliance package" calls this as its
   * first step, and it means "the caller owns the generating flag, do not
   * touch it".
   *
   * Without it this was the reason that button looked dead. handleBuildItAll
   * sets generating to 'auto', which is the ONLY thing that renders the
   * streaming progress panel — and then called this, which set generating to
   * 'budget' and, in its finally, back to null. So about five seconds in, the
   * budget toast appeared and the flag went null, and the remaining eighty-odd
   * seconds of writing bid packages, generating fifteen jacket PDFs and filing
   * compliance ran with no panel on screen and the original CTA still sitting
   * there unpressed-looking. The work was happening the whole time; the page
   * just had no way to say so, because the state that says so had been cleared
   * by a sub-step.
   */
  const handleCreateBudget = async (nested = false): Promise<boolean> => {
    if (!result) return false;
    if (!nested) setGenerating('budget');
    try {
      /* The budget's header total is the SAME bid price the screen shows (engine
         markup stack), and each line carries its FULL direct cost — material plus
         its share of labor. It used to send material only, so a budget built from
         a $1.8M takeoff showed $1.17M and every dollar of labor was missing. */
      const total = Math.round(bidPrice);

      const res = await fetch('/api/budgets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          name: `${result.projectName || 'Project'} — Takeoff Budget`,
          originalTotal: total,
          revisedTotal: total,
          overheadPct,
          profitPct,
          contingencyPct,
          lineItems: result.items.map(i => ({
            costCode: i.csiCode,
            csiDivision: i.csiDivision,
            description: i.description,
            category: 'material_labor',
            unit: i.unit,
            quantity: i.quantity,
            unitCost: i.unitCost,
            originalAmount: Math.round(lineDirectCost(i, laborAlloc) * 100) / 100,
            revisedAmount: Math.round(lineDirectCost(i, laborAlloc) * 100) / 100,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || 'Failed to create budget');
      }
      showToast(`Budget created — ${result.items.length} line items, total ${fmt$(total)}`, 'success');
      return true;
    } catch (err: unknown) {
      console.error(err); showToast(humanError(err, 'Failed to create budget. Please try again.'), 'error');
      return false;
    } finally {
      /* Only if we own it. When nested inside the full build, clearing this
         here is what blanked the progress panel for the rest of the run. */
      if (!nested) setGenerating(null);
    }
  };

  // ── Generate Lien Waiver Templates ──
  const handleGenerateLienWaivers = async () => {
    /* No analyzed takeoff in hand means this button is on screen doing
       nothing. Say so rather than swallowing the press. */
    if (!result) { showToast('Run the blueprint analysis first — there is nothing to build lien waivers from.', 'error'); return; }
    setGenerating('lien-waivers');
    try {
      const divisions = [...new Set(result.items.map(i => i.csiCode?.slice(0, 2)))].filter(Boolean);
      let created = 0;

      for (const div of divisions) {
        const divItems = result.items.filter(i => i.csiCode?.startsWith(div));
        const divTotal = divItems.reduce((sum, i) => sum + i.totalCost, 0);
        const divName = CSI_DIVISION_NAMES[div] || `Division ${div}`;

        const res = await fetch('/api/lien-waivers/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            claimantName: divName,
            waiverType: 'conditional_partial',
            amount: divTotal,
            throughDate: new Date().toISOString().split('T')[0],
            state: 'AZ',
          }),
        });
        if (res.ok) created++;
      }

      showToast(`${created} lien waiver template${created !== 1 ? 's' : ''} created`, 'success');
    } catch (err: unknown) {
      console.error(err); showToast(humanError(err, 'Failed to generate lien waivers. Please try again.'), 'error');
    } finally {
      setGenerating(null);
    }
  };

  // ── Generate All Documents (Budget + Bid Packages + SOV + Lien Waivers) ──

  // Computed cost values with adjustable markups. Memoized so it only recomputes
  // when the takeoff or a markup actually changes (not on every unrelated render).
  // The ONE markup multiplier (sell / direct) from the SAME engine stack the measured takeoff
  // and Excel export use — replaces the old flat ×1.15 and the additive markup so this page can
  // never show a different sell number than the rest of the app. Depends only on the sliders.
  const sellMult = useMemo(() => {
    const mk = applyMarkupStack({ materialCents: 1_000_000, laborCents: 0 }, { overheadPct, profitPct, contingencyPct, salesTaxPct, laborBurdenPct, generalConditionsPct, bondPct });
    return mk.sellCents / mk.directCents;
  }, [overheadPct, profitPct, contingencyPct, salesTaxPct, laborBurdenPct, generalConditionsPct, bondPct]);

  const computedCosts = useMemo(() => {
    if (!result) return null;
    const matCost = result.totalMaterialCost;
    const labCost = result.totalLaborCost;
    const mk = applyMarkupStack(
      { materialCents: Math.round(matCost * 100), laborCents: Math.round(labCost * 100) },
      { overheadPct, profitPct, contingencyPct, salesTaxPct, laborBurdenPct, generalConditionsPct, bondPct },
    );
    const subtotal = mk.directCents / 100;          // direct cost of work
    const materialTax = mk.materialTaxCents / 100;
    const laborBurden = (mk.burdenedLaborCents / 100) - labCost;
    const generalConditions = mk.generalConditionsCents / 100;
    const bond = mk.bondCents / 100;
    const overhead = mk.overheadCents / 100;
    const profit = mk.profitCents / 100;
    const contingency = mk.contingencyCents / 100;
    const totalJobCost = mk.sellCents / 100;        // THE bid price (engine stack)
    /* Direct cost = material + labor = Σ line costs (each line carries its share
       of labor, lib/takeoff-line-cost). This is the base every markup rides on —
       NOT result.totalProjectCost, which the analyzer stores with the AI's own
       contingency already baked in. Showing that number as "Total Project Cost"
       and then adding the contingency slider on top is how the screen ended up
       with four totals that did not reconcile. */
    const directCost = matCost + labCost;
    const costPerSF = result.estimatedSF > 0 ? totalJobCost / result.estimatedSF : 0;
    return { matCost, labCost, directCost, subtotal, materialTax, laborBurden, generalConditions, overhead, profit, contingency, bond, totalJobCost, costPerSF };
  }, [result, ...[overheadPct, profitPct, contingencyPct, salesTaxPct, laborBurdenPct, generalConditionsPct, bondPct]]);

  /** How the takeoff's labor total is spread over its lines (by hours). */
  const laborAlloc = useMemo<LaborAllocation>(
    () => laborAllocation(result?.items ?? [], result?.totalLaborCost ?? 0),
    [result],
  );
  /** The bid price, everywhere: header, package button, chart, table footer, Cost/SF. */
  const bidPrice = computedCosts?.totalJobCost ?? 0;
  /** Bid ÷ direct cost — a line's (or division's) share of the bid is its direct
   *  cost × this ratio, so the Sell column sums EXACTLY to the bid price even when
   *  tax/burden ride only one bucket. Falls back to the slider-only multiplier. */
  const bidRatio = computedCosts && computedCosts.directCost > 0 ? bidPrice / computedCosts.directCost : sellMult;

  // Group items by CSI division. Memoized on `result` ONLY — moving a markup slider
  // no longer rebuilds this map, so the giant line-item table is never re-derived on drag.
  const groupedItems = useMemo<Record<string, TakeoffItem[]>>(() => {
    if (!result) return {};
    return result.items.reduce<Record<string, TakeoffItem[]>>((acc, item) => {
      const div = item.csiCode?.slice(0, 2) || 'XX';
      if (!acc[div]) acc[div] = [];
      acc[div].push(item);
      return acc;
    }, {});
  }, [result]);

  // Copy values for the autonomous Sage card ("$X sell across N divisions, M items").
  const divCount = Object.keys(groupedItems).length;
  const sellTotal = bidPrice;

  // ── STATE A0: MEASURED HAND-OFF ──────────────────────────────────────────────
  // The newest takeoff was measured by hand in Takeoff Studio. Its conditions,
  // scale and markup stack live there — say so honestly and link across, instead of
  // pretending this project has no takeoff and showing the upload hero.
  if (state === 'upload' && measuredHandoff) {
    return (
      <div className="tkRoot" style={{ position: 'relative', overflow: 'hidden', minHeight: 'calc(100vh - 56px)' }}>
        <style>{FX_KEYFRAMES}</style>
        <Aurora />
        <div style={{ position: 'relative', zIndex: 1, padding: '64px 24px', maxWidth: 680, margin: '0 auto' }}>
          <div style={{ animation: 'tkRise .5s ease both', textAlign: 'center', marginBottom: 24 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 16px', borderRadius: 999, background: 'linear-gradient(90deg, var(--brand-primary-18), color-mix(in srgb, var(--brand-primary) 6%, transparent))', border: '1px solid color-mix(in srgb, var(--brand-primary) 45%, transparent)', color: GOLD_HI, fontSize: 11, fontWeight: 800 }}>
              <Ruler size={13} weight="bold" /> Measured Takeoff
            </div>
          </div>
          <div style={{ animation: 'tkRise .55s ease .05s both', borderRadius: 20, border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)', background: SURFACE, padding: '36px 28px', textAlign: 'center' }}>
            <h1 style={{ color: '#fff', fontSize: 26, fontWeight: 800, margin: 0, lineHeight: 1.25 }}>{measuredHandoff.name}</h1>
            <p style={{ color: 'rgba(255,255,255,0.62)', fontSize: 14.5, lineHeight: 1.6, margin: '14px auto 0', maxWidth: 460 }}>
              The latest takeoff on this project was traced and priced in Takeoff Studio.
              Its conditions, plan scale and markup stack live there — open it to review or keep measuring.
            </p>
            {measuredHandoff.total > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 700 }}>Sell Price</div>
                <div style={{ color: GREEN, fontSize: 32, fontWeight: 800, marginTop: 4 }}>{fmt$(measuredHandoff.total)}</div>
              </div>
            )}
            <div style={{ marginTop: 26, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href="/app/takeoff/measured" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 12, background: `linear-gradient(135deg, ${GOLD}, ${AMBER})`, color: '#0A0A00', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
                Open in Takeoff Studio <ArrowRight size={16} weight="bold" />
              </a>
              <button onClick={() => setMeasuredHandoff(null)} style={{ padding: '12px 22px', borderRadius: 12, background: 'transparent', border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.72)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                Start an AI Blueprint Takeoff Instead
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── STATE A-: STILL LOOKING FOR AN EXISTING TAKEOFF ─────────────────────────
  if (state === 'upload' && checkingExisting && !selectedFile) {
    return (
      <div className="tkRoot" style={{ position: 'relative', minHeight: 'calc(100vh - 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div role="status" aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,0.62)', fontSize: 14, fontWeight: 600 }}>
          <span aria-hidden style={{ width: 16, height: 16, borderRadius: 999, border: '2px solid rgba(255,255,255,0.18)', borderTopColor: GOLD, animation: 'tkSpin .8s linear infinite' }} />
          Loading this job's takeoff…
          <style>{'@keyframes tkSpin{to{transform:rotate(360deg)}}'}</style>
        </div>
      </div>
    );
  }

  // ── STATE A: UPLOAD ──────────────────────────────────────────────────────────
  if (state === 'upload') {
    return (
      <div className="tkRoot" style={{ position: 'relative', overflow: 'hidden', minHeight: 'calc(100vh - 56px)' }}>
        <style>{FX_KEYFRAMES}</style>
        <Aurora />
        <div style={{ position: 'relative', zIndex: 1, padding: '46px 24px 64px', maxWidth: 960, margin: '0 auto' }}>

          {/* Cinematic hero */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ animation: 'tkRise .5s ease both', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 16px', borderRadius: 999, background: 'linear-gradient(90deg, var(--brand-primary-18), color-mix(in srgb, var(--brand-primary) 6%, transparent))', border: '1px solid color-mix(in srgb, var(--brand-primary) 45%, transparent)', color: GOLD_HI, fontSize: 11, fontWeight: 800, boxShadow: '0 0 34px -8px color-mix(in srgb, var(--brand-primary) 55%, transparent)' }}>
              <Sparkle size={13} weight="fill" /> AI Blueprint Takeoff
            </div>
            <h1 className="tkH1" style={{ animation: 'tkRise .55s ease .05s both', color: '#fff', margin: '18px 0 0' }}>
              Drop a plan.<br />
              <span className="tkShine" style={{ background: `linear-gradient(100deg, ${GOLD} 8%, ${GOLD_HI} 40%, var(--brand-primary-hover) 58%, ${GOLD} 90%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>
                Get a priced bid in minutes.
              </span>
            </h1>
            <p style={{ animation: 'tkRise .6s ease .1s both', color: 'rgba(255,255,255,0.62)', fontSize: 16, marginTop: 16, maxWidth: 610, marginInline: 'auto', lineHeight: 1.58 }}>
              Claude reads every wall, footing, fixture and column — measures the quantities, and prices them by trade. No scale wheel. No manual counting.
            </p>
            {/* The estimate workspace door must exist in EVERY page state — the
                results-only placement left it unreachable for any project that
                hadn't finished an analysis (review finding). */}
            <p style={{ marginTop: 14 }}>
              <a href={`/app/projects/${projectId}/takeoff/estimate`} style={{ color: 'color-mix(in srgb, var(--brand-primary) 90%, transparent)', fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}>
                Prefer to build it by hand? Open the estimate workspace →
              </a>
            </p>
          </div>

          {/* Drop Zone — glowing gradient border, breathing, blueprint interior + scan beam */}
          <div
            data-tour="takeoff-dropzone"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            style={{
              position: 'relative', overflow: 'hidden',
              borderRadius: 24,
              padding: 2,
              marginBottom: 24,
              cursor: 'pointer',
              animation: selectedFile ? 'none' : 'tkGlow 3.8s ease-in-out infinite',
              transform: isDragging ? 'scale(1.012)' : 'none',
              transition: 'transform .2s ease',
              background: isDragging
                ? `linear-gradient(135deg, ${GOLD}, ${GOLD_HI})`
                : selectedFile
                  ? 'linear-gradient(135deg, rgba(44,255,122,0.6), rgba(44,255,122,0.14))'
                  : 'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 50%, transparent), var(--brand-primary-12))',
            }}
          >
            <div style={{
              position: 'relative', overflow: 'hidden',
              borderRadius: 22,
              padding: '60px 32px',
              textAlign: 'center',
              background: isDragging
                ? 'radial-gradient(circle at 50% 32%, color-mix(in srgb, var(--brand-primary) 22%, transparent), rgba(0,0,0,0.97))'
                : 'radial-gradient(circle at 50% 26%, var(--brand-primary-08), rgba(0,0,0,0.97))',
            }}>
              {/* Blueprint grid interior */}
              <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(color-mix(in srgb, var(--brand-primary) 10%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--brand-primary) 10%, transparent) 1px, transparent 1px)', backgroundSize: '26px 26px', maskImage: 'radial-gradient(80% 72% at 50% 42%, #000, transparent 78%)', WebkitMaskImage: 'radial-gradient(80% 72% at 50% 42%, #000, transparent 78%)', opacity: isDragging ? 0.95 : 0.5 }} />
              {/* CAD corner brackets */}
              <div aria-hidden style={{ position: 'absolute', left: 14, top: 14, width: 22, height: 22, borderLeft: `2px solid ${GOLD}`, borderTop: `2px solid ${GOLD}`, borderRadius: 3, opacity: 0.7 }} />
              <div aria-hidden style={{ position: 'absolute', right: 14, top: 14, width: 22, height: 22, borderRight: `2px solid ${GOLD}`, borderTop: `2px solid ${GOLD}`, borderRadius: 3, opacity: 0.7 }} />
              <div aria-hidden style={{ position: 'absolute', left: 14, bottom: 14, width: 22, height: 22, borderLeft: `2px solid ${GOLD}`, borderBottom: `2px solid ${GOLD}`, borderRadius: 3, opacity: 0.7 }} />
              <div aria-hidden style={{ position: 'absolute', right: 14, bottom: 14, width: 22, height: 22, borderRight: `2px solid ${GOLD}`, borderBottom: `2px solid ${GOLD}`, borderRadius: 3, opacity: 0.7 }} />
              {/* Scan beam — soft glow band that sweeps the plan (never a hard line) */}
              {!selectedFile && (
                <div aria-hidden style={{ position: 'absolute', left: 20, right: 20, top: -40, height: 90, background: 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--brand-primary) 16%, transparent) 45%, color-mix(in srgb, var(--brand-primary) 28%, transparent) 50%, color-mix(in srgb, var(--brand-primary) 16%, transparent) 55%, transparent)', filter: 'blur(1px)', animation: 'tkScanV 4s ease-in-out infinite', zIndex: 0 }} />
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />

              {selectedFile ? (
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'inline-flex', width: 88, height: 88, borderRadius: '50%', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(44,255,122,0.28), rgba(44,255,122,0.05))', border: '1px solid rgba(44,255,122,0.5)', marginBottom: 16, boxShadow: '0 0 44px -8px rgba(44,255,122,0.7)' }}>
                    <CheckCircle size={46} weight="fill" color={GREEN} />
                  </div>
                  <div style={{ color: GREEN, fontWeight: 800, fontSize: 18, wordBreak: 'break-word' }}>{selectedFile.name}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 6 }}>
                    {fmtFileSize(selectedFile.size)} · ready to analyze — click to change
                  </div>
                </div>
              ) : (
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ position: 'relative', display: 'inline-flex', width: 104, height: 104, borderRadius: '50%', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, color-mix(in srgb, var(--brand-primary) 24%, transparent), color-mix(in srgb, var(--brand-primary) 4%, transparent))', border: '1px solid color-mix(in srgb, var(--brand-primary) 42%, transparent)', marginBottom: 20, animation: 'tkFloat 5s ease-in-out infinite' }}>
                    <div aria-hidden style={{ position: 'absolute', inset: -1, borderRadius: '50%', border: `1px solid ${GOLD}`, animation: 'tkRing 3s ease-out infinite' }} />
                    <Blueprint size={46} weight="duotone" color={GOLD_HI} />
                  </div>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: 24, marginBottom: 8, letterSpacing: '-0.02em' }}>
                    {isDragging ? 'Release to Upload' : 'Drop Your Blueprint Here'}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5 }}>
                    or <span style={{ color: GOLD_HI, fontWeight: 800 }}>click to browse</span>
                  </div>
                  <div style={{ display: 'inline-flex', gap: 7, flexWrap: 'wrap', justifyContent: 'center', marginTop: 18 }}>
                    {['PDF', 'PNG', 'JPG', 'TIFF', 'WEBP'].map((x) => (
                      <span key={x} style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.72)', padding: '4px 11px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid color-mix(in srgb, var(--brand-primary) 22%, transparent)' }}>{x}</span>
                    ))}
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', padding: '4px 6px' }}>Up to 200 MB</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Trust stat strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 26 }}>
            {[
              // Honest by default; once a real run is measured this session, show the
              // actual elapsed instead of a marketing promise.
              result?.elapsedSec
                ? { icon: <Timer size={18} weight="duotone" color={GOLD_HI} />, big: `${result.elapsedSec < 90 ? `${Math.round(result.elapsedSec)}s` : `${(result.elapsedSec / 60).toFixed(1)} min`}`, small: 'Your last run, measured' }
                : { icon: <Timer size={18} weight="duotone" color={GOLD_HI} />, big: 'Minutes, Not Hours', small: 'Full plan set → priced bid' },
              { icon: <Stack size={18} weight="duotone" color={GOLD_HI} />, big: '16 Divisions', small: 'CSI, ground to finish' },
              { icon: <ShieldCheck size={18} weight="duotone" color={GOLD_HI} />, big: '100% Traceable', small: 'Every qty to the sheet' },
            ].map((s, i) => (
              <div key={s.big} className="tkHover" style={{ animation: `tkRise .5s ease ${(0.12 + i * 0.07).toFixed(2)}s both`, display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015))', border: '1px solid var(--brand-primary-18)', borderRadius: 14, padding: '14px 16px' }}>
                <div className="tkIcon" style={{ flex: '0 0 auto', display: 'inline-flex', width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', background: 'var(--brand-primary-12)', border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)', transition: 'box-shadow .2s' }}>{s.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>{s.big}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 1 }}>{s.small}</div>
                </div>
              </div>
            ))}
          </div>

          {/* What AI extracts — premium cards */}
          <div style={{ marginBottom: 30 }}>
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 11, marginBottom: 16, fontWeight: 800 }}>
              What the AI Extracts
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(248px,1fr))', gap: 12 }}>
              {[
                { icon: <Blueprint size={20} weight="duotone" color={GOLD_HI} />, t: 'Every Material by CSI Division', s: '16 divisions, ground to finish' },
                { icon: <Ruler size={20} weight="duotone" color={GOLD_HI} />, t: 'Quantities with Real Units', s: 'SF · LF · CY · EA, measured' },
                { icon: <CurrencyDollar size={20} weight="duotone" color={GOLD_HI} />, t: 'Priced by Trade', s: 'Your rates override the book' },
                { icon: <Lightning size={20} weight="duotone" color={GOLD_HI} />, t: 'Labor Hours + Burden', s: 'Crew productivity built in' },
                { icon: <Buildings size={20} weight="duotone" color={GOLD_HI} />, t: 'Building Area & Floors', s: 'Auto scale + $/SF' },
                { icon: <Package size={20} weight="duotone" color={GOLD_HI} />, t: 'Bid-Package Ready', s: 'One tap to a priced jacket' },
              ].map((c, i) => (
                <div key={c.t} className="tkHover" style={{ animation: `tkRise .5s ease ${(0.18 + i * 0.06).toFixed(2)}s both`, position: 'relative', overflow: 'hidden', display: 'flex', gap: 13, alignItems: 'flex-start', background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))', border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px' }}>
                  <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${GOLD}, transparent)` }} />
                  <div className="tkIcon" style={{ flex: '0 0 auto', display: 'inline-flex', width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(150deg, var(--brand-primary-18), color-mix(in srgb, var(--brand-primary) 5%, transparent))', border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)', transition: 'box-shadow .2s' }}>{c.icon}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{c.t}</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12.5, marginTop: 3 }}>{c.s}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Analyze button */}
          <button data-tour="run-takeoff"
            onClick={() => handleAnalyze()}
            disabled={!selectedFile}
            className={selectedFile ? 'tkBtn' : undefined}
            style={{
              position: 'relative', overflow: 'hidden',
              width: '100%',
              padding: '17px',
              background: selectedFile ? `linear-gradient(135deg, ${GOLD}, ${AMBER})` : 'rgba(255,255,255,0.05)',
              border: selectedFile ? 'none' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14,
              color: selectedFile ? '#0A0A00' : 'rgba(255,255,255,0.35)',
              fontSize: 16,
              fontWeight: 800,
              cursor: selectedFile ? 'pointer' : 'not-allowed',
              letterSpacing: '0.02em',
              boxShadow: selectedFile ? '0 18px 46px -14px color-mix(in srgb, var(--brand-primary) 70%, transparent)' : 'none',
            }}
          >
            {selectedFile && <span aria-hidden className="tkShine" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%)' }} />}
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
              {selectedFile ? <><MagicWand size={19} weight="fill" color="#0A0A00" /> Start AI Analysis <ArrowRight size={18} weight="bold" color="#0A0A00" /></> : 'Select a Blueprint to Continue'}
            </span>
          </button>
        </div>
      </div>
    );
  }

  // ── STATE B: ANALYZING ───────────────────────────────────────────────────────
  if (state === 'analyzing') {
    const steps = [
      'Creating takeoff record',
      `Uploading blueprint${uploadPct > 0 && uploadPct < 100 ? ` (${uploadPct}%)` : ''}`,
      'Preparing for AI',
      'AI reading blueprint',
      'Identifying materials',
      'Calculating quantities',
      'Applying pricing',
      'Saving results',
    ];

    return (
      <div className="tkRoot" style={{ position: 'relative', overflow: 'hidden', minHeight: 'calc(100vh - 56px)' }}>
        <style>{FX_KEYFRAMES}</style>
        <Aurora soft />
        <div style={{ position: 'relative', zIndex: 1, padding: '60px 24px', maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>

          {/* Blueprint scan motif */}
          <div style={{ position: 'relative', margin: '0 auto 30px', width: '100%', maxWidth: 440, borderRadius: 22, padding: 2, background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 50%, transparent), var(--brand-primary-12))', animation: 'tkGlow 3.6s ease-in-out infinite' }}>
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 20, height: 190, background: 'radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--brand-primary) 10%, transparent), rgba(0,0,0,0.98))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(color-mix(in srgb, var(--brand-primary) 10%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--brand-primary) 10%, transparent) 1px, transparent 1px)', backgroundSize: '24px 24px', maskImage: 'radial-gradient(78% 78% at 50% 50%, #000, transparent 82%)', WebkitMaskImage: 'radial-gradient(78% 78% at 50% 50%, #000, transparent 82%)' }} />
              {/* CAD corner brackets */}
              <div aria-hidden style={{ position: 'absolute', left: 12, top: 12, width: 18, height: 18, borderLeft: `2px solid ${GOLD}`, borderTop: `2px solid ${GOLD}`, opacity: 0.65 }} />
              <div aria-hidden style={{ position: 'absolute', right: 12, top: 12, width: 18, height: 18, borderRight: `2px solid ${GOLD}`, borderTop: `2px solid ${GOLD}`, opacity: 0.65 }} />
              <div aria-hidden style={{ position: 'absolute', left: 12, bottom: 12, width: 18, height: 18, borderLeft: `2px solid ${GOLD}`, borderBottom: `2px solid ${GOLD}`, opacity: 0.65 }} />
              <div aria-hidden style={{ position: 'absolute', right: 12, bottom: 12, width: 18, height: 18, borderRight: `2px solid ${GOLD}`, borderBottom: `2px solid ${GOLD}`, opacity: 0.65 }} />
              {/* Horizontal scanning sweep */}
              <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 64, background: 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--brand-primary) 24%, transparent) 50%, transparent)', animation: 'tkSweep 1.9s linear infinite' }} />
              {/* Pulsing robot */}
              <div style={{ position: 'relative', display: 'inline-flex', width: 94, height: 94, borderRadius: '50%', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, color-mix(in srgb, var(--brand-primary) 24%, transparent), color-mix(in srgb, var(--brand-primary) 4%, transparent))', border: '1px solid color-mix(in srgb, var(--brand-primary) 42%, transparent)', animation: 'tkPulseA 1.9s ease-out infinite' }}>
                <Robot size={46} weight="duotone" color={GOLD_HI} />
              </div>
            </div>
          </div>

          <h2 className="tkH2" style={{ color: '#fff', marginBottom: 8 }}>
            Reading your blueprint…
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, marginBottom: lane ? 16 : 30 }}>
            {progress.message || 'Starting analysis…'}
          </p>

          {/* Lane badge — the fast lane is the ONLY path we promise "under 2 min" for */}
          {lane && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 9, marginBottom: 28,
              padding: '8px 16px', borderRadius: 999,
              background: lane.fast ? 'rgba(44,255,122,0.12)' : 'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
              border: `1px solid ${lane.fast ? 'rgba(44,255,122,0.42)' : 'color-mix(in srgb, var(--brand-primary) 28%, transparent)'}`,
            }}>
              {lane.fast
                ? <MagicWand size={16} weight="fill" color={GREEN} />
                : <Stack size={16} weight="duotone" color={GOLD_HI} />}
              <span style={{ fontSize: 13, fontWeight: 700, color: lane.fast ? GREEN : GOLD_HI }}>
                {lane.fast
                  ? `Fast lane${lane.image ? ' · single sheet' : lane.pages > 1 ? ` · ${lane.pages} sheets` : ''} · typically under 2 minutes`
                  : `Full read · ${lane.pages} sheets · discipline by discipline · a few minutes`}
              </span>
            </div>
          )}

          {/* Progress bar */}
          <div style={{
            position: 'relative',
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid color-mix(in srgb, var(--brand-primary) 15%, transparent)',
            borderRadius: 999, height: 10, marginBottom: 10, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${progress.pct}%`,
              background: `linear-gradient(90deg, ${AMBER}, ${GOLD}, ${GOLD_HI})`,
              borderRadius: 999,
              transition: 'width 0.5s ease',
              boxShadow: '0 0 16px color-mix(in srgb, var(--brand-primary) 60%, transparent)',
            }} />
          </div>
          <div style={{ color: GOLD_HI, fontWeight: 800, fontSize: 22, marginBottom: 30, letterSpacing: '-0.02em' }}>
            {progress.pct}%
          </div>

          {/* Step checklist */}
          <div style={{ textAlign: 'left', background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '18px 22px' }}>
            {steps.map((step, i) => {
              const done = i < progress.step;
              const active = i === progress.step;
              return (
                <div key={step} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '8px 0',
                  color: done ? 'rgba(255,255,255,0.9)' : active ? GOLD_HI : 'rgba(255,255,255,0.32)',
                  fontSize: 13.5,
                  borderBottom: i < steps.length - 1 ? `1px solid ${BORDER}` : 'none',
                }}>
                  <span style={{ width: 22, height: 22, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', borderRadius: '50%', background: active ? 'color-mix(in srgb, var(--brand-primary) 14%, transparent)' : 'transparent', boxShadow: active ? '0 0 0 1px color-mix(in srgb, var(--brand-primary) 40%, transparent)' : 'none' }}>
                    {done ? <CheckCircle size={16} weight="fill" color={GREEN} /> : active ? <CircleNotch size={16} weight="bold" style={{ animation: 'tkSpin 0.9s linear infinite' }} /> : <Circle size={13} weight="regular" />}
                  </span>
                  <span style={{ fontWeight: active ? 700 : 500 }}>{step}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── STATE C: RESULTS ─────────────────────────────────────────────────────────
  return (
    <div className="tkRoot" style={{ position: 'relative', overflow: 'hidden', minHeight: 'calc(100vh - 56px)' }}>
      <style>{FX_KEYFRAMES}</style>
      <UiFx />
      <Aurora soft still />
      <div style={{ position: 'relative', zIndex: 1, padding: '24px', maxWidth: 1180, margin: '0 auto' }}>

      {/* Summary header — hero sell number */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 14%, transparent), color-mix(in srgb, var(--brand-primary) 4%, transparent))',
        border: `1px solid color-mix(in srgb, var(--brand-primary) 28%, transparent)`,
        borderRadius: 18, padding: '24px 28px', marginBottom: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 20,
        boxShadow: '0 20px 60px -24px var(--brand-primary-35)',
        animation: 'tkPop .5s ease both',
      }}>
        <div aria-hidden style={{ position: 'absolute', width: 260, height: 260, right: '18%', top: '-70%', borderRadius: '50%', background: 'radial-gradient(circle, color-mix(in srgb, var(--brand-primary) 22%, transparent), transparent 62%)', filter: 'blur(24px)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', minWidth: 200 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: GOLD_HI, fontSize: 11, fontWeight: 800 }}>
            <CheckCircle size={13} weight="fill" color={GREEN} /> Takeoff Complete
          </div>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 22, marginTop: 6, letterSpacing: '-0.02em' }}>
            {result?.projectName || 'Material Takeoff'}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginTop: 3 }}>
            {result?.buildingType || 'Building'} · {fmtN(result?.estimatedSF || 0)} SF
          </div>
          {result?.summary && (
            <div style={{ color: 'rgba(255,255,255,0.48)', fontSize: 12.5, marginTop: 8, maxWidth: 460, lineHeight: 1.5 }}>
              {result.summary}
            </div>
          )}
          {/* Honesty strip — exactly what was read, and how long it took */}
          {(result?.sheetsAnalyzed || result?.elapsedSec) && (
            <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {result?.sheetsAnalyzed != null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,0.72)', background: 'rgba(255,255,255,0.06)', border: '1px solid color-mix(in srgb, var(--brand-primary) 24%, transparent)', borderRadius: 8, padding: '4px 10px' }}>
                  <Stack size={13} weight="duotone" color={GOLD_HI} />
                  {result.sheetsAnalyzed}{result.sheetsTotal && result.sheetsTotal !== result.sheetsAnalyzed ? ` of ${result.sheetsTotal}` : ''} sheet{result.sheetsAnalyzed === 1 ? '' : 's'} analyzed
                </span>
              )}
              {result?.elapsedSec != null && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,0.72)', background: 'rgba(255,255,255,0.06)', border: '1px solid color-mix(in srgb, var(--brand-primary) 24%, transparent)', borderRadius: 8, padding: '4px 10px' }}>
                  <Timer size={13} weight="duotone" color={GOLD_HI} />
                  {result.elapsedSec < 90 ? `${Math.round(result.elapsedSec)}s` : `${(result.elapsedSec / 60).toFixed(1)} min`}
                </span>
              )}
              {result?.disciplines && result.disciplines.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,0.72)', background: 'rgba(255,255,255,0.06)', border: '1px solid color-mix(in srgb, var(--brand-primary) 24%, transparent)', borderRadius: 8, padding: '4px 10px' }}>
                  {result.disciplines.join(' · ')}
                </span>
              )}
            </div>
          )}
          {/* The next step, at the top where the GC lands. It used to exist only
              on a card BELOW the whole line-item table — 168 rows down — so
              "where is Yes, build it all" was a fair question with no good
              answer. Same handler, just reachable. */}
          {result && !autoSummary && generating !== 'auto' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 16 }}>
              <button
                onClick={handleBuildItAll}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44,
                  padding: '0 22px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-primary-hover))',
                  color: '#0A0A00', fontSize: 14, fontWeight: 800,
                }}
              >
                <MagicWand size={16} weight="fill" color="#0A0A00" />
                Build the Bid + Compliance Package
              </button>
              <button
                onClick={() => { setAutoSummary(null); setPickMode(true); }}
                style={{
                  minHeight: 44, padding: '0 18px', borderRadius: 10, cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.18)',
                  color: 'rgba(255,255,255,0.72)', fontSize: 13.5, fontWeight: 700,
                }}
              >
                Let Me Pick
              </button>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 1.5 }}>
                {divCount} divisions · {result.itemCount} lines · {fmt$(sellTotal)} bid price
                <br />
                Bid packages, jacket PDFs, schedule of values, lien waivers and W-9 requests
              </span>
            </div>
          )}

          {result?.truncated && result?.truncationNote && (
            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 12, maxWidth: 500, background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)', border: '1px solid var(--brand-primary-35)', borderRadius: 10, padding: '10px 12px' }}>
              <Warning size={16} weight="fill" color={GOLD_HI} style={{ flex: '0 0 auto', marginTop: 1 }} />
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 1.5 }}>{result.truncationNote}</div>
            </div>
          )}
        </div>
        <div style={{ position: 'relative', textAlign: 'right', flex: '1 1 auto', minWidth: 220 }}>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700 }}>Bid Price</div>
          <div style={{ fontWeight: 900, fontSize: 'clamp(38px,5vw,56px)', lineHeight: 1.02, letterSpacing: '-0.03em', background: `linear-gradient(100deg, ${GOLD}, ${GOLD_HI} 55%, var(--brand-primary-hover))`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent', textShadow: '0 0 50px color-mix(in srgb, var(--brand-primary) 30%, transparent)', animation: 'tkPop .6s ease .1s both' }}>
            {fmt$(bidPrice)}
          </div>
          {computedCosts && (
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11.5, marginTop: 4 }}>
              {fmt$(computedCosts.directCost)} direct cost + markups below
            </div>
          )}
          <div style={{ display: 'inline-flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
            <div style={{ background: 'rgba(44,255,122,0.12)', border: '1px solid rgba(44,255,122,0.35)', borderRadius: 9, padding: '6px 12px', textAlign: 'center' }}>
              <div style={{ color: GREEN, fontWeight: 800, fontSize: 16 }}>{result?.confidence ?? 0}%</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9.5 }}>Confidence</div>
            </div>
            <div style={{ background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-primary) 28%, transparent)', borderRadius: 9, padding: '6px 12px', textAlign: 'center' }}>
              <div style={{ color: GOLD_HI, fontWeight: 800, fontSize: 16 }}>{result?.itemCount ?? 0}</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 9.5 }}>Line Items</div>
            </div>
          </div>
        </div>
      </div>

      {/* Cost breakdown + adjustable markups */}
      {computedCosts && (
        <div style={{ marginBottom: 20 }}>
          {/* Cost cards row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 12 }}>
            {[
              { label: 'Material Cost', value: computedCosts.matCost, color: GOLD, icon: <Package size={15} weight="duotone" color={GOLD} /> },
              { label: 'Labor Cost', value: computedCosts.labCost, color: 'var(--brand-primary-strong)', icon: <Lightning size={15} weight="duotone" color="var(--brand-primary-strong)" /> },
              /* Direct cost = material + labor = the Cost column's footer. Tax and
                 burden (when set) are markups below, not part of this number. */
              { label: 'Direct Cost', value: computedCosts.directCost, color: '#fff', icon: <Table size={15} weight="duotone" color="rgba(255,255,255,0.8)" /> },
              { label: 'Bid Price', value: computedCosts.totalJobCost, color: '#2CFF7A', icon: <TrendUp size={15} weight="duotone" color={GREEN} /> },
            ].map((card, ci) => (
              <div key={card.label} className="tkHover" style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.014))', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '15px 16px', animation: `tkPop .45s ease ${(0.05 * ci).toFixed(2)}s both` }}>
                <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${card.color}, transparent)` }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.5)', fontSize: 10.5, marginBottom: 8 }}>{card.icon}{card.label}</div>
                <div style={{ color: card.color, fontWeight: 800, fontSize: 22, letterSpacing: '-0.01em' }}>{fmt$(card.value)}</div>
              </div>
            ))}
          </div>
          {/* Markup sliders */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            {[
              /* Shown in the order the engine applies them, so the sheet reads
                 the way the arithmetic actually runs: tax rides material,
                 burden rides labor, GC on direct, OH on cost-of-work,
                 contingency on that, fee pre-bond, bond on contract value. */
              { label: 'Sales Tax', pct: salesTaxPct, setPct: setSalesTaxPct, value: computedCosts.materialTax, color: '#FF8A00', max: 15 },
              { label: 'Labor Burden', pct: laborBurdenPct, setPct: setLaborBurdenPct, value: computedCosts.laborBurden, color: '#FF8A00', max: 60 },
              { label: 'General Conditions', pct: generalConditionsPct, setPct: setGeneralConditionsPct, value: computedCosts.generalConditions, color: '#FF8A00', max: 25 },
              { label: 'Overhead', pct: overheadPct, setPct: setOverheadPct, value: computedCosts.overhead, color: '#FF8A00', max: 25 },
              { label: 'Contingency', pct: contingencyPct, setPct: setContingencyPct, value: computedCosts.contingency, color: '#FF8A00', max: 25 },
              { label: 'Profit', pct: profitPct, setPct: setProfitPct, value: computedCosts.profit, color: '#2CFF7A', max: 25 },
              { label: 'Bond', pct: bondPct, setPct: setBondPct, value: computedCosts.bond, color: 'var(--brand-primary-strong)', max: 5 },
            ].map((ctrl) => (
              <div key={ctrl.label} style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.014))', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600 }}>{ctrl.label}</span>
                  <span style={{ color: ctrl.color, fontWeight: 800, fontSize: 17 }}>{ctrl.pct}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={ctrl.max}
                  value={ctrl.pct}
                  onChange={(e) => ctrl.setPct(Number(e.target.value))}
                  className="tkRange"
                  style={{ width: '100%', color: ctrl.color, cursor: 'pointer', background: `linear-gradient(90deg, ${ctrl.color} ${(ctrl.pct / ctrl.max) * 100}%, rgba(255,255,255,0.12) ${(ctrl.pct / ctrl.max) * 100}%)` }}
                />
                <div style={{ color: ctrl.color, fontWeight: 700, fontSize: 14.5, marginTop: 8, textAlign: 'right' }}>{fmt$(ctrl.value)}</div>
              </div>
            ))}
          </div>
          {/* Cost per SF */}
          {computedCosts.costPerSF > 0 && (
            <div style={{ marginTop: 8, textAlign: 'right', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
              Bid Price/SF: <span style={{ color: GOLD, fontWeight: 600 }}>${computedCosts.costPerSF.toFixed(2)}</span> · {fmtN(result?.estimatedSF || 0)} SF
            </div>
          )}
        </div>
      )}

      {/* Building visualization */}
      {/* Building profile — the storeys the AI read off the drawings.
          This used to be `Math.ceil(totalProjectCost / 1_000_000)`: the number of
          floors was the PRICE divided by a million. A test set that extracted
          0 SF drew eight floors because it happened to price at $7M, and the
          card sat under a heading saying BUILDING PROFILE next to real
          extracted data, so a GC would reasonably read it as their building.

          The analyzer has always extracted the real floor count and written it
          to takeoffs.floor_count — it simply was not sent to the client. Now it
          is, and when the drawings did not say, nothing is drawn rather than
          something invented. */}
      {result && (result.floorCount ?? 0) > 0 && (() => {
        const realFloors = Math.max(1, Math.round(result.floorCount || 1));
        const displayFloors = Math.min(realFloors, 12);
        const bldgW   = 180;
        const floorH  = 28;
        const bldgH   = displayFloors * floorH;
        const padX    = 20;
        const padY    = 20;
        const svgH    = bldgH + padY * 2 + 40;
        const totalSell = bidPrice;

        // Compute division breakdown for bar chart
        const divTotals = Object.entries(groupedItems)
          .map(([div, items]) => ({
            div,
            name: CSI_DIVISION_NAMES[div] || `Div ${div}`,
            total: items.reduce((s, i) => s + lineDirectCost(i, laborAlloc), 0),
          }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 8);
        const maxDiv = divTotals[0]?.total || 1;

        return (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
            gap: 16, marginBottom: 20,
          }}>
            {/* Building diagram */}
            <div style={{
              background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))', border: `1px solid ${BORDER}`,
              borderRadius: 14, padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 8, fontWeight: 700 }}>
                Building Profile
              </div>
              <svg width={bldgW + padX * 2} height={svgH} viewBox={`0 0 ${bldgW + padX * 2} ${svgH}`}>
                {/* Ground line */}
                <line x1={padX - 10} y1={padY + bldgH + 2} x2={padX + bldgW + 10} y2={padY + bldgH + 2}
                  stroke="rgba(255,255,255,0.15)" strokeWidth={2} />
                {/* Building floors */}
                {Array.from({ length: displayFloors }).map((_, fi) => {
                  const y = padY + fi * floorH;
                  const isGround = fi === displayFloors - 1;
                  return (
                    <g key={fi}>
                      <rect x={padX} y={y} width={bldgW} height={floorH}
                        style={{ fill: isGround ? 'var(--brand-primary-12)' : `color-mix(in srgb, var(--brand-primary) ${Math.round((0.04 + (displayFloors - fi) * 0.01) * 100)}%, transparent)`, stroke: 'var(--brand-primary-25)' }} strokeWidth={1} />
                      {/* Windows */}
                      {[0.2, 0.45, 0.7].map((wx, wi) => (
                        <rect key={wi}
                          x={padX + bldgW * wx - 8} y={y + 6}
                          width={16} height={floorH - 12}
                          fill="rgba(255,138,0,0.2)" stroke="rgba(255,138,0,0.4)" strokeWidth={0.5} />
                      ))}
                      {/* Floor label */}
                      <text x={padX + bldgW + 6} y={y + floorH / 2 + 4}
                        fill="rgba(255,255,255,0.3)" fontSize={9}>
                        {`L${displayFloors - fi}`}
                      </text>
                    </g>
                  );
                })}
                {/* Roof triangle */}
                <polygon
                  points={`${padX},${padY} ${padX + bldgW / 2},${padY - 24} ${padX + bldgW},${padY}`}
                  style={{ fill: 'var(--brand-primary-18)', stroke: 'color-mix(in srgb, var(--brand-primary) 40%, transparent)' }} strokeWidth={1.5} />
                {/* SF label */}
                <text x={padX + bldgW / 2} y={svgH - 6}
                  fill="rgba(255,255,255,0.3)" fontSize={10} textAnchor="middle">
                  {result.estimatedSF > 0 ? `${fmtN(result.estimatedSF)} SF · ` : ''}
                  {realFloors} {realFloors === 1 ? 'Story' : 'Stories'}
                  {realFloors > displayFloors ? ' (top 12 shown)' : ''}
                </text>
              </svg>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 4 }}>
                {result.buildingType || 'Commercial'} · {result.confidence}% confidence
              </div>
            </div>

            {/* Division cost bar chart */}
            <div style={{
              background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))', border: `1px solid ${BORDER}`,
              borderRadius: 14, padding: '16px 20px',
            }}>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 14, fontWeight: 700 }}>
                Cost by CSI Division
              </div>
              {divTotals.map(({ div, name, total }, bi) => {
                const pct = total / maxDiv;
                const sellAmt = total * bidRatio;
                return (
                  <div key={div} style={{ marginBottom: 11 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                        <span style={{ color: GOLD_HI, fontFamily: 'monospace', marginRight: 6, fontWeight: 700 }}>{div}</span>
                        {name}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
                        {fmt$(total)}
                        <span style={{ color: GREEN, marginLeft: 8, fontWeight: 600 }}>{fmt$(sellAmt)}</span>
                      </span>
                    </div>
                    <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ position: 'relative', overflow: 'hidden', height: '100%', width: `${pct * 100}%`, background: `linear-gradient(90deg, ${GOLD}, ${GREEN})`, borderRadius: 999, transition: 'width 0.6s ease', boxShadow: '0 0 12px color-mix(in srgb, var(--brand-primary) 40%, transparent)' }}>
                        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.5) 50%, transparent 60%)', backgroundSize: '200% 100%', animation: `tkBarShine 2.8s ease-in-out ${(bi * 0.15).toFixed(2)}s infinite` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>Cost → Sell breakdown across {Object.keys(groupedItems).length} divisions</span>
                <span style={{ color: '#2CFF7A', fontWeight: 600 }}>Bid Price: {fmt$(totalSell)}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Editable-takeoff ribbon — live client preview, server-confirmed after save */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '0 0 10px', padding: '10px 14px', borderRadius: 12, border: `1px solid ${BORDER}`, background: 'linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.012))' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.6)', fontSize: 12.5 }}>
          <NotePencil size={15} weight="duotone" color={GOLD_HI} />
          Click any description, qty, unit or $/unit to edit. Every line takes a note; deletes hold 6s for undo.
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: saveState === 'saving' ? GOLD_HI : saveState === 'confirmed' ? GREEN : saveState === 'error' ? '#FF3B30' : 'rgba(255,255,255,0.45)' }}>
          {saveState === 'saving' ? (<><CircleNotch size={14} weight="bold" style={{ animation: 'tkSpin .9s linear infinite' }} /> Saving…</>)
            : saveState === 'confirmed' ? (<><CheckCircle size={14} weight="fill" color={GREEN} /> Saved — totals server-confirmed</>)
            : saveState === 'error' ? (<><Warning size={14} weight="fill" color="#FF3B30" /> Save failed — change rolled back</>)
            : (<><CheckCircle size={14} weight="regular" /> {fmtN(result?.itemCount || 0)} lines · in sync</>)}
        </div>
      </div>

      {/* Results table */}
      <div style={{
        background: 'linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))', border: `1px solid ${BORDER}`,
        borderRadius: 14, overflow: 'hidden', marginBottom: 20,
      }}>
       <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 744 }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: ROW_GRID,
          padding: '11px 16px',
          background: 'rgba(0,0,0,0.34)',
          borderBottom: '2px solid color-mix(in srgb, var(--brand-primary) 20%, transparent)',
          fontSize: 10.5, fontWeight: 700,
          color: 'var(--text-tertiary)',
        }}>
          <div>CSI Code</div>
          <div>Description</div>
          <div style={{ textAlign: 'right' }}>Qty</div>
          <div style={{ textAlign: 'right' }}>Unit</div>
          <div style={{ textAlign: 'right' }}>$/Unit</div>
          <div style={{ textAlign: 'right' }} title="Material + labor">Cost (M+L)</div>
          <div style={{ textAlign: 'right', color: '#2CFF7A' }} title="This line's share of the bid price">Bid</div>
          <div aria-hidden />
        </div>

        {/* Grouped rows — memoized + row-capped so slider drags and huge extractions don't freeze */}
        <LineItemTable groupedItems={groupedItems} sellMult={bidRatio} laborAlloc={laborAlloc} onPatch={patchLine} onAdd={addLine} onPaste={pasteLines} onDuplicate={duplicateLine} onInsertBelow={insertLineBelow} onDelete={deleteLine} />

        {/* Grand total row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: ROW_GRID,
          padding: '12px 16px',
          background: 'var(--brand-primary-08)',
          borderTop: `2px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)`,
          fontSize: 14, fontWeight: 700,
        }}>
          <div style={{ gridColumn: '1 / 6', color: GOLD }}>
            Total — {result?.itemCount ?? 0} Line Items
          </div>
          <div style={{ textAlign: 'right', color: GOLD, fontSize: 16 }} title="Direct cost — material + labor">
            {fmt$(computedCosts?.directCost ?? 0)}
          </div>
          <div style={{ textAlign: 'right', color: '#2CFF7A', fontSize: 16 }} title="Bid price — direct cost with every markup above">
            {fmt$(bidPrice)}
          </div>
          <div aria-hidden />
        </div>
        </div>
       </div>
      </div>

      {/* Delete undo bar — the DELETE only fires after this 6s window passes */}
      {undoDelete && (
        <div style={{ position: 'fixed', left: '50%', bottom: 26, transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderRadius: 14, background: 'rgba(0,0,0,0.94)', border: '1px solid color-mix(in srgb, var(--brand-primary) 45%, transparent)', boxShadow: '0 18px 50px -12px var(--brand-primary-35)', animation: 'tkUndoIn .25s ease both', maxWidth: 'min(92vw, 560px)' }}>
          <Trash size={16} weight="duotone" color="#FF3B30" style={{ flexShrink: 0 }} />
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Deleted “{undoDelete.item.description}” — {fmt$(Number(undoDelete.item.totalCost) || 0)}
          </span>
          <button onClick={undoPendingDelete} className="tkBtn" style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg, ${GOLD}, ${AMBER})`, color: '#0A0A00', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
            Undo
          </button>
        </div>
      )}

      {/* AI Recommendations */}
      {(result?.recommendations?.length ?? 0) > 0 && (
        <div style={{
          borderLeft: `3px solid ${GOLD}`,
          background: 'color-mix(in srgb, var(--brand-primary) 5%, transparent)',
          borderRadius: '0 12px 12px 0',
          padding: '16px 20px',
          marginBottom: 20,
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: GOLD, fontWeight: 800, fontSize: 11, marginBottom: 10 }}>
            <Sparkle size={13} weight="fill" color={GOLD} /> Estimator Recommendations
          </div>
          {result!.recommendations.map((rec, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.55, marginBottom: 6 }}>
              <CheckCircle size={14} weight="fill" color={GOLD} style={{ flexShrink: 0, marginTop: 2 }} /> {rec}
            </div>
          ))}
        </div>
      )}

      {/* ── Autonomous Sage CTA · streaming · summary · manual picker ──────────── */}
      {autoSummary ? (
        /* ── SUMMARY: what Sage built ── */
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, padding: '26px 28px', background: 'linear-gradient(135deg, rgba(44,255,122,0.14), rgba(44,255,122,0.03))', border: '1px solid rgba(44,255,122,0.32)', boxShadow: '0 22px 64px -26px rgba(44,255,122,0.4)', animation: 'tkPop .5s ease both' }}>
          <div aria-hidden style={{ position: 'absolute', width: 280, height: 280, right: '10%', top: '-74%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(44,255,122,0.2), transparent 62%)', filter: 'blur(26px)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <div style={{ flex: '0 0 auto', width: 54, height: 54, borderRadius: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(44,255,122,0.28), rgba(44,255,122,0.05))', border: '1px solid rgba(44,255,122,0.5)', boxShadow: '0 0 34px -8px rgba(44,255,122,0.7)' }}>
              <SealCheck size={30} weight="fill" color={GREEN} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: GREEN, fontSize: 11, fontWeight: 800 }}>Package Complete</div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 20, letterSpacing: '-0.01em', marginTop: 2 }}>Sage Built Your Full Bid + Compliance Package</div>
            </div>
          </div>
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            {/* A ZERO HERE IS USUALLY AN ANSWER, NOT A FAILURE.
                This card sat four numbers side by side, and on the common case
                — a GC who has not added subcontractors yet — it read
                15 · 15 · 0 · 15. Nothing on it said why one of the four was
                zero, so the only available reading was that a quarter of the
                build had failed. It had not: a W-9 is a request TO a
                subcontractor, and there are none to ask.
                Each tile now carries the reason when its count is zero, so the
                number stops being an accusation. */}
            {[
              { icon: <Package size={16} weight="duotone" color={GOLD_HI} />, big: autoSummary.jackets || autoSummary.packages, label: 'Bid Jackets',
                zeroNote: 'No packages to jacket yet.' },
              { icon: <Scroll size={16} weight="duotone" color={GOLD_HI} />, big: autoSummary.lienWaivers, label: 'Lien Waivers',
                zeroNote: 'Filed once a package is awarded.' },
              { icon: <FileText size={16} weight="duotone" color={GOLD_HI} />, big: autoSummary.w9s, label: 'W-9 Requests',
                zeroNote: 'None to send — add subcontractors first.' },
              { icon: <FolderSimple size={16} weight="duotone" color={GOLD_HI} />, big: autoSummary.filed, label: 'Filed to Compliance',
                zeroNote: 'Nothing needed filing.' },
            ].map((s) => (
              <div key={s.label} style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.014))', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'rgba(255,255,255,0.55)', fontSize: 10.5, marginBottom: 8, fontWeight: 700 }}>{s.icon}{s.label}</div>
                <div style={{ color: s.big ? '#fff' : 'rgba(255,255,255,0.45)', fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em' }}>{fmtN(s.big)}</div>
                {!s.big && (
                  <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: 11, lineHeight: 1.35, marginTop: 4 }}>{s.zeroNote}</div>
                )}
              </div>
            ))}
          </div>
          <div style={{ position: 'relative', color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle size={15} weight="fill" color={GREEN} />
            {autoSummary.packages} bid package{autoSummary.packages !== 1 ? 's' : ''} written{autoSummary.sov ? ', Schedule of Values built' : autoSummary.sovDeferred ? ' (pay application waits until the job is won)' : ''} — everything filed to Documents / Compliance.
          </div>
          <div style={{ position: 'relative', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
            <a href={`/app/projects/${projectId}/bid-packages`} className="tkBtn" style={{ textDecoration: 'none', padding: '11px 20px', background: `linear-gradient(135deg, ${GOLD}, ${AMBER})`, borderRadius: 10, color: '#0A0A00', fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 7, boxShadow: '0 12px 30px -12px color-mix(in srgb, var(--brand-primary) 60%, transparent)' }}>
              <Package size={15} weight="duotone" color="#0A0A00" /> View Bid Packages
            </a>
            <a href={`/app/projects/${projectId}/compliance`} style={{ textDecoration: 'none', padding: '11px 18px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <ShieldCheck size={15} weight="duotone" color="#fff" /> View Compliance
            </a>
            <button onClick={() => { setAutoSummary(null); setPickMode(true); }} style={{ padding: '11px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Add More Manually
            </button>
            <button onClick={() => addSheetsRef.current?.click()} style={{ padding: '11px 18px', background: 'transparent', border: '1px solid color-mix(in srgb, var(--brand-primary) 50%, transparent)', borderRadius: 10, color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              + Add Sheets to This Set
            </button>
            <input
              ref={addSheetsRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/tiff,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addSheets(f); }}
            />
            <button onClick={async () => { if ((await confirmDialog({ title: 'Please confirm', message: 'Start a new takeoff? Previous results are saved.', danger: false }))) { setAutoSummary(null); setState('upload'); setSelectedFile(null); setResult(null); setTakeoffId(null); } }} style={{ padding: '11px 18px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontWeight: 500, fontSize: 13, cursor: 'pointer', marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={13} weight="bold" color="rgba(255,255,255,0.4)" /> New Analysis
            </button>
          </div>
        </div>
      ) : generating === 'auto' ? (
        /* ── STREAMING: cinematic combined progress (phase 1 = 0-50%, phase 2 = 50-100%) ── */
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, padding: 2, background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 55%, transparent), color-mix(in srgb, var(--brand-primary) 14%, transparent))', animation: 'tkGlow 3.4s ease-in-out infinite' }}>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 16, padding: '24px 26px', background: 'radial-gradient(120% 130% at 50% -10%, var(--brand-primary-12), rgba(0,0,0,0.97))' }}>
            <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(color-mix(in srgb, var(--brand-primary) 6%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--brand-primary) 6%, transparent) 1px, transparent 1px)', backgroundSize: '26px 26px', maskImage: 'radial-gradient(80% 80% at 50% 30%, #000, transparent 78%)', WebkitMaskImage: 'radial-gradient(80% 80% at 50% 30%, #000, transparent 78%)' }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <div style={{ flex: '0 0 auto', width: 56, height: 56, borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, color-mix(in srgb, var(--brand-primary) 24%, transparent), color-mix(in srgb, var(--brand-primary) 4%, transparent))', border: '1px solid color-mix(in srgb, var(--brand-primary) 42%, transparent)', animation: 'tkPulseA 1.9s ease-out infinite' }}>
                <Robot size={30} weight="duotone" color={GOLD_HI} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 17, letterSpacing: '-0.01em' }}>Sage is building your full package…</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13.5, marginTop: 3 }}>{progress.message || 'Working…'}</div>
              </div>
              <div style={{ color: GOLD_HI, fontWeight: 900, fontSize: 26, letterSpacing: '-0.02em' }}>{progress.pct}%</div>
            </div>
            <div style={{ position: 'relative', height: 10, background: 'rgba(255,255,255,0.07)', border: '1px solid color-mix(in srgb, var(--brand-primary) 15%, transparent)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ position: 'relative', height: '100%', width: `${progress.pct}%`, background: `linear-gradient(90deg, ${AMBER}, ${GOLD}, ${GOLD_HI})`, borderRadius: 999, transition: 'width .5s ease', boxShadow: '0 0 16px color-mix(in srgb, var(--brand-primary) 60%, transparent)' }}>
                <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.5) 50%, transparent 60%)', backgroundSize: '200% 100%', animation: 'tkBarShine 2.4s ease-in-out infinite' }} />
              </div>
            </div>
            <div style={{ position: 'relative', display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              {[{ label: 'Bid Jackets + SOV', phase: 0 }, { label: 'Compliance Package', phase: 1 }].map(({ label, phase }) => {
                const done = progress.pct >= (phase === 0 ? 50 : 100);
                const active = phase === 0 ? progress.pct < 50 : (progress.pct >= 50 && progress.pct < 100);
                return (
                  <div key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, color: done ? GREEN : active ? GOLD_HI : 'rgba(255,255,255,0.4)', background: active ? 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? 'color-mix(in srgb, var(--brand-primary) 30%, transparent)' : BORDER}` }}>
                    {done ? <CheckCircle size={15} weight="fill" color={GREEN} /> : active ? <CircleNotch size={15} weight="bold" style={{ animation: 'tkSpin .9s linear infinite' }} /> : <Circle size={12} weight="regular" />}
                    {label}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : pickMode ? (
        /* ── MANUAL PICKER: the individual document actions ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={() => setPickMode(false)} style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: GOLD_HI, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>
            <ArrowRight size={14} weight="bold" color={GOLD_HI} style={{ transform: 'rotate(180deg)' }} /> Back to Sage
          </button>



          {/* Action buttons — two rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Primary actions */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* "Generate All Documents" and "Sage AI Documents" lived here. The
              second called the identical endpoint as "Build it all" with less
              UI, and the first differed only by creating the budget — which
              "Build it all" now does too. Three near-identical gold buttons is
              how a GC ends up guessing. The individual actions below remain for
              anyone who genuinely wants one piece. */}
          <button onClick={exportXLS} disabled={!!generating}
            style={{ padding: '11px 22px', background: 'rgba(44,255,122,0.12)', border: '1px solid rgba(44,255,122,0.3)', borderRadius: 8, color: '#2CFF7A', fontWeight: 600, fontSize: 13, cursor: generating ? 'wait' : 'pointer', opacity: (generating && generating !== 'xls') ? 0.5 : 1 }}>
            {generating === 'xls' ? 'Generating…' : <><FileXls size={16} weight="duotone" color="#2CFF7A" style={{marginRight:4, verticalAlign:'middle'}} /> Export Excel</>}
          </button>
          {/* The sheet-by-sheet estimate workspace shipped UNREACHABLE — no link
              anywhere in the app pointed at it (takeoff/estimate). This is its door. */}
          <a href={generating ? undefined : `/app/projects/${projectId}/takeoff/estimate`}
            aria-disabled={!!generating}
            onClick={(e) => { if (generating) e.preventDefault(); }}
            style={{ padding: '11px 22px', background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-primary) 32%, transparent)', borderRadius: 8, color: GOLD, fontWeight: 600, fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', opacity: generating ? 0.5 : 1, cursor: generating ? 'wait' : 'pointer' }}>
            <Calculator size={16} weight="duotone" color={GOLD} style={{marginRight:4, verticalAlign:'middle'}} /> Estimate Workspace
          </a>
        </div>
        {/* Secondary actions */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={handleGenerateBidPackages} disabled={!!generating}
            style={{ padding: '9px 18px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 12, cursor: generating ? 'wait' : 'pointer', opacity: (generating && generating !== 'bid-packages') ? 0.5 : 1 }}>
            {generating === 'bid-packages' ? 'Creating…' : <><Package size={16} weight="duotone" color="#fff" style={{marginRight:4, verticalAlign:'middle'}} /> Bid Packages</>}
          </button>
          <button onClick={handleGenerateSOV} disabled={!!generating}
            style={{ padding: '9px 18px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 12, cursor: generating ? 'wait' : 'pointer', opacity: (generating && generating !== 'sov') ? 0.5 : 1 }}>
            {generating === 'sov' ? 'Creating…' : <><Table size={16} weight="duotone" color="#fff" style={{marginRight:4, verticalAlign:'middle'}} /> SOV</>}
          </button>
          {/* Wrapped, not passed by reference: React hands an onClick handler the
              MouseEvent as its first argument, which would arrive as `nested`
              and be truthy — silently turning the standalone Budget button into
              one that never shows its own progress. */}
          <button onClick={() => handleCreateBudget()} disabled={!!generating}
            style={{ padding: '9px 18px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 12, cursor: generating ? 'wait' : 'pointer', opacity: (generating && generating !== 'budget') ? 0.5 : 1 }}>
            {generating === 'budget' ? 'Creating…' : <><CurrencyDollar size={16} weight="duotone" color="#fff" style={{marginRight:4, verticalAlign:'middle'}} /> Budget</>}
          </button>
          <button onClick={handleGenerateLienWaivers} disabled={!!generating}
            style={{ padding: '9px 18px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontWeight: 600, fontSize: 12, cursor: generating ? 'wait' : 'pointer', opacity: (generating && generating !== 'lien-waivers') ? 0.5 : 1 }}>
            {generating === 'lien-waivers' ? 'Creating…' : <><Blueprint size={16} weight="duotone" color="#fff" style={{marginRight:4, verticalAlign:'middle'}} /> Lien Waivers</>}
          </button>
          <button
            onClick={async () => {
              if ((await confirmDialog({ title: 'Please confirm', message: 'Start a new takeoff? Previous results are saved.', danger: false }))) {
                setState('upload'); setSelectedFile(null); setResult(null); setTakeoffId(null);
              }
            }}
            style={{ padding: '9px 18px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontWeight: 500, fontSize: 12, cursor: 'pointer', marginLeft: 'auto' }}>
            <Plus size={13} weight="bold" color="rgba(255,255,255,0.4)" style={{ marginRight: 4, verticalAlign: 'middle' }} /> New Analysis
          </button>
        </div>
          </div>
        </div>
      ) : (
        /* The autonomous CTA lives in the results header now — 168 rows up,
           where a GC lands. It used to be repeated down here as well, which
           read as two different offers for one action. */
        null
      ) }
      </div>
      <UnsavedGuardModal guard={guard} />
    </div>
  );
}
