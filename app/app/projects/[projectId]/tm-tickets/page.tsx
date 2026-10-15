'use client';
/**
 * T&M Tickets — Pass 4, on the RFIs reference layout (dense table + detail).
 *
 * Server contract (already shipped — consumed, not rebuilt):
 *   GET   /api/projects/[projectId]/tm-tickets            -> { tickets }
 *   POST  same URL                                        -> 201 { ticket } (server recomputes ALL money)
 *   PATCH /api/projects/[projectId]/tm-tickets/[id]       -> { ticket }   (whitelisted columns)
 *   POST  /api/projects/[projectId]/tm-tickets/export     -> csv/xlsx/pdf blob
 *
 * Money columns can be TEXT in the DB — Number() before any math, always.
 * The composer's live totals replicate the server math operation-for-operation
 * (OT at 1.5x, markup on subtotal, tax on subtotal+markup) so the preview and
 * the stored total agree to the cent. Amounts are never truncated.
 *
 * Anatomy: title + one primary action (New T&M Ticket) → StatRow (money, each
 * tile filters the log) → Toolbar (search, status, export) → workspace split:
 * DataTable log on the left, and when a row is selected, the ticket (line
 * items, totals ladder, notes, signatures) beside a 320–384px details + action
 * rail. Phone: stacked. The composer opens in a FormModal.
 *
 * Known gap (intentional, no server change here): Submit / Approve do not yet
 * fan out createNotification() on the server — notify wiring is a follow-up.
 */
import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { humanError } from '@/lib/errors';
import { SignatureCanvas, type SignatureCanvasHandle } from '@/components/SignaturePad';
import { TRADESPERSON_ROLES } from '@/lib/contractor-trades';
import { getSupabaseBrowser, ensureBrowserSession } from '@/lib/supabase-browser';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import {
  PageShell, Card, StatRow, Badge, Button, Toolbar, DataTable, EmptyState, RowActions, Menu,
  FormModal, Field, Input, Textarea, Select, FormGrid, DetailList, Toast, useToast,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import {
  Receipt, Plus, X, CheckCircle, XCircle, PaperPlaneTilt, ArrowsClockwise, Lightning,
  FileCsv, FileXls, FilePdf, HardHat, Package, Wrench, Signature, Trash, WarningCircle, ArrowClockwise,
  CurrencyDollar, HourglassMedium, NotePencil, DownloadSimple,
} from '@phosphor-icons/react';
import { layout } from '@/lib/design-tokens';
import { localDay } from '@/lib/calendar-day';

// Legacy vocab: old rows carry 'disputed' — displayed as rejected everywhere.
const STATUS_ORDER = ['draft', 'submitted', 'approved', 'rejected', 'billed'] as const;
const STATUS_LABEL: Record<string, string> = { draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', billed: 'Billed' };
function displayStatus(s?: string | null): string {
  const k = String(s || 'draft').toLowerCase();
  if (k === 'disputed') return 'rejected';
  return STATUS_LABEL[k] ? k : 'draft';
}
/** One status → one badge. Draft stays neutral; Submitted amber (waiting),
 *  Approved green, Rejected red, Billed orange — all from lib/status-colors. */
function statusBadge(s?: string | null): { label: string; tone: BadgeTone } {
  const k = displayStatus(s);
  if (k === 'submitted') return { label: 'Submitted', tone: 'under_contract' };
  if (k === 'approved') return { label: 'Approved', tone: 'ongoing' };
  if (k === 'rejected') return { label: 'Rejected', tone: 'overdue' };
  if (k === 'billed') return { label: 'Billed', tone: 'completed' };
  return { label: 'Draft', tone: 'neutral' };
}
const STATUS_RANK: Record<string, number> = { draft: 0, submitted: 1, approved: 2, rejected: 3, billed: 4 };

// Units are a measurement vocabulary, not a trade taxonomy (trades import from
// lib/contractor-trades — never hardcoded).
const UNITS = ['EA', 'LF', 'SF', 'CY', 'TON', 'GAL', 'LS', 'HR', 'BAG', 'ROLL', 'SHEET', 'BOX'];
const DEFAULT_TRADE = 'General Laborer';

interface LaborLine { id: string; worker: string; trade: string; regHours: string; otHours: string; rate: string }
interface MaterialLine { id: string; description: string; qty: string; unit: string; unitCost: string }
interface EquipmentLine { id: string; description: string; hours: string; rate: string }

// Server rows arrive with jsonb line items written by EITHER surface — the web
// shape ({qty, unitCost, regHours}) or the mobile shape ({quantity, unit_cost,
// hours}). Every reader below tolerates both.
interface TmTicketRow {
  id: string;
  ticket_number?: number | string | null;
  description?: string | null;
  work_date?: string | null;
  labor?: any[] | null;
  labor_hours?: number | string | null;
  labor_rate?: number | string | null;
  labor_total?: number | string | null;
  materials?: any[] | null;
  materials_total?: number | string | null;
  equipment?: any[] | null;
  equipment_total?: number | string | null;
  markup_pct?: number | string | null;
  tax_pct?: number | string | null;
  total?: number | string | null;
  status?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  contractor_signature?: string | null;
  owner_signature?: string | null;
  notes?: string | null;
  created_at?: string | null;
}

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  return r.json();
};

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const fmtUSD = (v: unknown) => '$' + num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Date-only values parse at local noon ('T12:00:00') so they never shift a day under UTC. */
const fmtDate = (d?: string | null) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const ticketLabel = (t: TmTicketRow) => {
  if (t.ticket_number == null || t.ticket_number === '') return 'TM';
  const n = Number(t.ticket_number);
  return Number.isFinite(n) ? `TM-${String(n).padStart(3, '0')}` : `TM-${t.ticket_number}`;
};

const CSS = `
.tmWs > .k-page { max-width: none; }
.tmCq { container: tmws / inline-size; min-width: 0; }
.tmSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.tmSplit > * { min-width: 0; }
@container tmws (min-width: 1080px) {
  .tmSplit[data-open="true"] { grid-template-columns: minmax(340px, 0.8fr) minmax(0, 1.6fr); }
}
.tmDetailCq { container: tmdetail / inline-size; min-width: 0; }
.tmDetail { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.tmDetail > * { min-width: 0; }
.tmRail { order: -1; }
@container tmdetail (min-width: 720px) {
  .tmDetail { grid-template-columns: minmax(0, 1fr) clamp(${layout.detailRailMin}px, 34%, ${layout.detailRailMax}px); }
  .tmRail { order: 0; position: sticky; top: 16px; }
}
.tmList .k-table th:first-child, .tmList .k-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.tmList .k-table th:first-child { background: var(--bg-solid-2); z-index: 3; }
.tmList .k-table tbody tr:hover td:first-child { background: linear-gradient(rgba(255,255,255,0.03), rgba(255,255,255,0.03)), var(--bg-solid); }
.tmList .k-table tbody tr:has([data-sel="true"]) td { background: var(--brand-primary-08); }
.tmList .k-table tbody tr:has([data-sel="true"]) td:first-child { background: linear-gradient(var(--brand-primary-08), var(--brand-primary-08)), var(--bg-solid); box-shadow: inset 3px 0 0 var(--brand-primary); }
.tmNum { color: var(--text-primary); font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tmDesc { display: flex; flex-direction: column; gap: 2px; max-width: 380px; min-width: 0; }
.tmDesc > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; color: var(--text-primary); font-weight: 600; }
.tmDesc > small { display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-xs); color: var(--text-tertiary); }
.tmMoney { font-variant-numeric: tabular-nums; white-space: nowrap; }
.tmTotal { font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 800; color: var(--text-primary); }
.tmMuted { color: var(--text-tertiary); }
.tmBadges { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tmSection { display: flex; flex-direction: column; gap: 8px; }
.tmSection + .tmSection { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-subtle); }
.tmSectionTitle { display: flex; align-items: center; gap: 8px; font-size: var(--fs-sm); font-weight: 700; color: var(--text-tertiary); }
.tmSectionTitle > b { margin-left: auto; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.tmProse { font-size: var(--fs-md); line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; max-width: ${layout.readingMaxWidth}; }
.tmBig { font-size: 28px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; line-height: 1.1; }
.tmLines { overflow-x: auto; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); }
.tmLines table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.tmLines th { text-align: left; padding: 8px 12px; font-size: var(--fs-xs); font-weight: 700; color: var(--text-tertiary); background: var(--bg-surface-2); border-bottom: 1px solid var(--border-subtle); white-space: nowrap; }
.tmLines td { padding: 8px 12px; color: var(--text-secondary); border-bottom: 1px solid var(--border-subtle); font-variant-numeric: tabular-nums; }
.tmLines tr:last-child td { border-bottom: 0; }
.tmLines th:not(:first-child), .tmLines td:not(:first-child) { text-align: right; white-space: nowrap; }
.tmLines td:first-child { color: var(--text-primary); }
.tmLines td:last-child { color: var(--text-primary); font-weight: 700; }
.tmLadder { border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 12px 14px; background: var(--bg-surface-2); }
.tmRule { height: 1px; background: var(--border-subtle); margin: 8px 0; }
.tmLadRow { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 5px 0; }
.tmLadRow > span:first-child { font-size: var(--fs-xs); color: var(--text-tertiary); white-space: nowrap; }
.tmLadRow > span:last-child { font-size: var(--fs-sm); font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; text-align: right; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.tmLadRow[data-strong="true"] > span:last-child { font-size: 15px; font-weight: 800; }
.tmSigs { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.tmSigs img { width: 100%; background: #fff; border: 1px solid var(--border-default); border-radius: var(--radius-sm); display: block; }
.tmActions { display: flex; flex-direction: column; gap: 8px; }
.tmActions .k-btn { width: 100%; justify-content: flex-start; }
.tmActionsRow { display: flex; gap: 8px; align-items: center; }
.tmActionsRow > .k-btn { flex: 1 1 auto; }
.tmNext { font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.5; }
.tmGrid { display: grid; gap: 8px; align-items: center; margin-bottom: 8px; min-width: 0; }
.tmGridHead { display: grid; gap: 8px; margin-bottom: 6px; font-size: var(--fs-xs); font-weight: 700; color: var(--text-tertiary); }
.tmGridHead > span[data-right="true"], .tmGrid > .tmLine { text-align: right; }
.tmLine { font-size: var(--fs-sm); font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tmGridWrap { overflow-x: auto; padding-bottom: 2px; }
.tmGridWrap > * { min-width: 640px; }
.tmGroup { padding: 14px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); margin-bottom: 14px; }
.tmGroupHead { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: var(--fs-sm); font-weight: 800; color: var(--text-primary); }
.tmGroupHead > b { margin-left: auto; font-variant-numeric: tabular-nums; }
.tmHint { font-size: var(--fs-xs); color: var(--text-tertiary); line-height: 1.5; margin-top: 6px; }
.tmPad { border: 1px solid var(--border-default); border-radius: var(--radius-sm); overflow: hidden; background: #fff; }
.tmPadHead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.tmPadNote { font-size: var(--fs-xs); color: var(--text-tertiary); margin-top: 4px; }
.tmPadNote[data-ok="true"] { color: var(--status-ongoing); }
.tmDateInput { width: 100%; }
@media (max-width: 640px) {
  .tmWs .k-btn, .tmWs .k-stat, .tmWs select.k-select, .tmWs .k-input { min-height: 44px; }
  .tmWs .k-table td { height: 48px; }
  .tmDesc { max-width: 200px; }
}
`;

const DATE_INPUT_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', fontSize: 14,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
};

// ─── Signature pad — the shared SignatureCanvas the field app uses, so there is
// one signature implementation instead of three. ──
function SignaturePad({ label, value, onChange }: { label: string; value: string; onChange: (dataUrl: string) => void }) {
  const padRef = useRef<SignatureCanvasHandle>(null);
  return (
    <div>
      <div className="tmPadHead">
        <span className="k-label">{label}</span>
        <Button variant="ghost" size="sm" onClick={() => padRef.current?.clear()}>Clear</Button>
      </div>
      <div className="tmPad">
        <SignatureCanvas ref={padRef} value={value} onChange={onChange} height={110} />
      </div>
      <p className="tmPadNote" data-ok={value ? 'true' : undefined}>{value ? 'Signature captured.' : 'Sign above with a mouse, finger or stylus.'}</p>
    </div>
  );
}

// ─── Line-item detail table — shape-tolerant across surfaces ─────────
function LineTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return null;
  return (
    <div className="tmLines">
      <table className="k-table">
        <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>{r.map((c, ci) => <td key={ci}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One label / figure line of a totals ladder. */
function LadderRow({ label, value, strong }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="tmLadRow" data-strong={strong ? 'true' : undefined}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// Totals ladder: subtotal -> +markup% -> +tax% -> total. Stored `total` is the
// server's source of truth; the intermediate lines are derived for display.
function TotalsLadder({ sub, markupPct, taxPct, total }: { sub: number; markupPct: number; taxPct: number; total: number }) {
  const markupAmt = (sub * markupPct) / 100;
  const taxAmt = ((sub + markupAmt) * taxPct) / 100;
  return (
    <div className="tmLadder">
      <LadderRow label="Subtotal (Labor + Materials + Equipment)" value={fmtUSD(sub)} />
      <LadderRow label={`Markup (${markupPct}%)`} value={'+' + fmtUSD(markupAmt)} />
      <LadderRow label={`Tax (${taxPct}%)`} value={'+' + fmtUSD(taxAmt)} />
      <div className="tmRule" />
      <LadderRow label="Ticket Total" value={fmtUSD(total)} strong />
    </div>
  );
}

export default function TmTicketsPage() {
  const params = useParams();
  const projectId = params['projectId'] as string;
  const listKey = `/api/projects/${projectId}/tm-tickets`;
  const { ctx } = useProjectContext(projectId);

  const { data, error: loadError, isLoading, mutate: mutateTickets } = useSWR<{ tickets: TmTicketRow[] }>(listKey, fetcher, { revalidateOnFocus: true });
  const { data: me } = useSWR<{ id: string; email: string; name: string }>('/api/auth/me', fetcher, { revalidateOnFocus: false });
  const tickets = data?.tickets ?? [];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [escalatingId, setEscalatingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const { toast, show } = useToast(4000);
  const setToast = (t: { msg: string; type: 'success' | 'error' }) => show(t.msg, t.type === 'success' ? 'good' : 'bad');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  // ── Composer state ──────────────────────────────────────────────────────
  const [fDate, setFDate] = useState(() => localDay());
  const [fDesc, setFDesc] = useState('');
  const [fRef, setFRef] = useState('');
  const [fNotes, setFNotes] = useState('');
  const [fLabor, setFLabor] = useState<LaborLine[]>([{ id: uid(), worker: '', trade: DEFAULT_TRADE, regHours: '', otHours: '', rate: '' }]);
  const [fMaterials, setFMaterials] = useState<MaterialLine[]>([{ id: uid(), description: '', qty: '', unit: 'EA', unitCost: '' }]);
  const [fEquipment, setFEquipment] = useState<EquipmentLine[]>([{ id: uid(), description: '', hours: '', rate: '' }]);
  const [fMarkup, setFMarkup] = useState('15');
  const [fTax, setFTax] = useState('0');
  const [contractorSig, setContractorSig] = useState('');
  const [ownerSig, setOwnerSig] = useState('');

  const resetForm = () => {
    setFDate(localDay());
    setFDesc(''); setFRef(''); setFNotes('');
    setFLabor([{ id: uid(), worker: '', trade: DEFAULT_TRADE, regHours: '', otHours: '', rate: '' }]);
    setFMaterials([{ id: uid(), description: '', qty: '', unit: 'EA', unitCost: '' }]);
    setFEquipment([{ id: uid(), description: '', hours: '', rate: '' }]);
    setFMarkup('15'); setFTax('0');
    setContractorSig(''); setOwnerSig('');
  };

  /* ── Unsaved-work protection (R14): dirty once any composer field differs
   *    from a fresh ticket (the defaulted work date never counts on its own);
   *    the draft covers every line grid plus both signature pads. ── */
  const composerDirty = showForm && (
    !!fDesc.trim() || !!fRef.trim() || !!fNotes.trim() ||
    fLabor.some(l => l.worker.trim() || l.regHours || l.otHours || l.rate) ||
    fMaterials.some(m => m.description.trim() || m.qty || m.unitCost) ||
    fEquipment.some(eq => eq.description.trim() || eq.hours || eq.rate) ||
    fMarkup !== '15' || fTax !== '0' || !!contractorSig || !!ownerSig
  );
  const guard = useUnsavedGuard({
    dirty: composerDirty,
    draftKey: `tm-ticket:${projectId}`,
    draftData: { fDate, fDesc, fRef, fNotes, fLabor, fMaterials, fEquipment, fMarkup, fTax, contractorSig, ownerSig },
    restoreDraft: (d) => {
      const dr = d as {
        fDate?: string; fDesc?: string; fRef?: string; fNotes?: string;
        fLabor?: LaborLine[]; fMaterials?: MaterialLine[]; fEquipment?: EquipmentLine[];
        fMarkup?: string; fTax?: string; contractorSig?: string; ownerSig?: string;
      };
      if (dr.fDate) setFDate(dr.fDate);
      if (dr.fDesc !== undefined) setFDesc(dr.fDesc);
      if (dr.fRef !== undefined) setFRef(dr.fRef);
      if (dr.fNotes !== undefined) setFNotes(dr.fNotes);
      if (Array.isArray(dr.fLabor) && dr.fLabor.length > 0) setFLabor(dr.fLabor);
      if (Array.isArray(dr.fMaterials) && dr.fMaterials.length > 0) setFMaterials(dr.fMaterials);
      if (Array.isArray(dr.fEquipment) && dr.fEquipment.length > 0) setFEquipment(dr.fEquipment);
      if (dr.fMarkup !== undefined) setFMarkup(dr.fMarkup);
      if (dr.fTax !== undefined) setFTax(dr.fTax);
      if (dr.contractorSig) setContractorSig(dr.contractorSig);
      if (dr.ownerSig) setOwnerSig(dr.ownerSig);
      setShowForm(true);
    },
    onSave: () => createTicket('draft'),
  });

  /** Composer close paths (X / Cancel / Esc / backdrop) run through the guard. */
  function closeComposer() {
    guard.requestClose(() => setShowForm(false));
  }

  // Composer preview — SAME operations as the server route so the preview and
  // the persisted total agree to the cent.
  const previewLabor = fLabor.reduce((s, l) => s + num(l.regHours) * num(l.rate) + num(l.otHours) * num(l.rate) * 1.5, 0);
  const previewMaterials = fMaterials.reduce((s, m) => s + num(m.qty) * num(m.unitCost), 0);
  const previewEquipment = fEquipment.reduce((s, e) => s + num(e.hours) * num(e.rate), 0);
  const previewSub = previewLabor + previewMaterials + previewEquipment;
  const previewMarkupAmt = (previewSub * num(fMarkup)) / 100;
  const previewTaxAmt = ((previewSub + previewMarkupAmt) * num(fTax)) / 100;
  const previewTotal = previewSub + previewMarkupAmt + previewTaxAmt;

  /** POST the ticket — shared by the composer buttons and the guard's
   *  "Save & leave" (which saves as a draft). Returns true on success. */
  async function createTicket(status: 'draft' | 'submitted'): Promise<boolean> {
    if (!fDesc.trim() || saving) return false;
    setSaving(true);
    try {
      const payload = {
        projectId,
        date: fDate,
        description: fDesc.trim(),
        reference: fRef.trim() || undefined,
        notes: fNotes.trim() || undefined,
        labor: fLabor.filter(l => l.worker.trim()).map(l => ({ id: l.id, worker: l.worker.trim(), trade: l.trade, regHours: num(l.regHours), otHours: num(l.otHours), rate: num(l.rate) })),
        materials: fMaterials.filter(m => m.description.trim()).map(m => ({ id: m.id, description: m.description.trim(), qty: num(m.qty), unit: m.unit, unitCost: num(m.unitCost) })),
        equipment: fEquipment.filter(e => e.description.trim()).map(e => ({ id: e.id, description: e.description.trim(), hours: num(e.hours), rate: num(e.rate) })),
        markup_pct: num(fMarkup),
        tax_pct: num(fTax),
        contractor_signature: contractorSig || undefined,
        owner_signature: ownerSig || undefined,
        status,
      };
      const res = await fetch(listKey, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ticket) throw new Error(d.error || 'Failed to create the ticket');
      // Seed the cache with the server row (server-assigned id + recomputed money).
      await mutateTickets(current => ({ tickets: [d.ticket as TmTicketRow, ...(current?.tickets ?? [])] }), { revalidate: false });
      resetForm();
      setShowForm(false);
      guard.clearDraft();
      setToast({ msg: status === 'submitted' ? 'T&M ticket submitted for approval.' : 'T&M ticket saved as draft.', type: 'success' });
      return true;
    } catch (e) {
      setToast({ msg: humanError(e, 'Failed to create the T&M ticket. Please try again.'), type: 'error' });
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Optimistic status transitions — the pill flips instantly, rolls back on error.
  async function patchTicket(id: string, patch: Record<string, unknown>, successMsg: string) {
    setBusyId(id);
    try {
      await mutateTickets(async current => {
        const res = await fetch(`${listKey}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'Update failed');
        const updated = (d.ticket ?? patch) as Partial<TmTicketRow>;
        return { tickets: (current?.tickets ?? []).map(t => t.id === id ? { ...t, ...updated } : t) };
      }, {
        optimisticData: current => ({ tickets: (current?.tickets ?? []).map(t => t.id === id ? { ...t, ...patch } : t) }),
        rollbackOnError: true,
        revalidate: false,
      });
      setToast({ msg: successMsg, type: 'success' });
    } catch (e) {
      setToast({ msg: humanError(e, 'Failed to update the ticket. Please try again.'), type: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  const submitTicket = (t: TmTicketRow) => patchTicket(t.id, { status: 'submitted' }, `${ticketLabel(t)} submitted for approval.`);
  // Approval stamps WHO and WHEN on the row itself — the audit trail lives in the ticket.
  const approveTicket = (t: TmTicketRow) => patchTicket(t.id, { status: 'approved', approved_by: me?.email ?? null, approved_at: new Date().toISOString() }, `${ticketLabel(t)} approved.`);
  const rejectTicket = (t: TmTicketRow) => patchTicket(t.id, { status: 'rejected' }, `${ticketLabel(t)} rejected.`);
  const billTicket = (t: TmTicketRow) => patchTicket(t.id, { status: 'billed' }, `${ticketLabel(t)} marked billed.`);
  const resubmitTicket = (t: TmTicketRow) => patchTicket(t.id, { status: 'submitted' }, `${ticketLabel(t)} resubmitted.`);

  // ── Escalate to Change Event — replicates the mobile contract exactly ────
  // Inserts a change_events row via the browser Supabase client (tenant_id is
  // owned by the DB trigger), idempotent on attachments containing this ticket.
  // cost_impact = pre-markup subtotal so event cost x (1 + markup%) reconciles
  // to the ticket total (no double markup).
  async function escalateTicket(t: TmTicketRow) {
    if (escalatingId) return;
    setEscalatingId(t.id);
    try {
      await ensureBrowserSession();
      const sb = getSupabaseBrowser() as any;
      const { data: existing } = await sb
        .from('change_events')
        .select('id')
        .eq('project_id', projectId)
        .contains('attachments', [{ type: 'tm_ticket', id: t.id }])
        .limit(1);
      if (existing && existing.length > 0) {
        setToast({ msg: 'Already escalated to a change event.', type: 'success' });
        return;
      }
      let nextNumber = 1;
      const { data: lastCe } = await sb
        .from('change_events')
        .select('event_number')
        .eq('project_id', projectId)
        .order('event_number', { ascending: false })
        .limit(1);
      nextNumber = (num(lastCe?.[0]?.event_number)) + 1;
      const subtotal = num(t.labor_total) + num(t.materials_total) + num(t.equipment_total);
      const title = `T&M Ticket${t.ticket_number != null && t.ticket_number !== '' ? ` #${t.ticket_number}` : ''}`;
      const { error } = await sb.from('change_events').insert({
        project_id: projectId,
        event_number: nextNumber,
        title,
        description: (t.description || '').trim() || title,
        // Cost is already quantified by the ticket, so it lands in pricing, not open.
        status: 'pricing',
        origin: 'field',
        cost_impact: Math.round(subtotal * 100) / 100,
        markup_pct: t.markup_pct != null ? num(t.markup_pct) : null,
        schedule_impact_days: null,
        attachments: [{ type: 'tm_ticket', id: t.id, ticket_number: t.ticket_number ?? null, total: num(t.total) }],
        created_by: me?.id ?? null,
      });
      if (error) throw new Error(error.message || 'Insert failed');
      setToast({ msg: `Escalated to Change Event CE-${String(nextNumber).padStart(3, '0')}.`, type: 'success' });
    } catch (e) {
      setToast({ msg: humanError(e, 'Could not escalate to a change event. Please try again.'), type: 'error' });
    } finally {
      setEscalatingId(null);
    }
  }

  // ── Export — server route builds the file; ids follow the current filter ──
  async function exportTickets(format: 'csv' | 'xlsx' | 'pdf', ids?: string[]) {
    if (exporting) return;
    setExporting(format + (ids ? ':one' : ''));
    try {
      const res = await fetch(`${listKey}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_ids: ids ?? filtered.map(t => t.id), format }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tm-tickets-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setToast({ msg: humanError(e, 'Export failed. Please try again.'), type: 'error' });
    } finally {
      setExporting(null);
    }
  }

  // ── Derived: stats + filtered view (Number() everything — TEXT money) ────
  const totalValue = tickets.reduce((s, t) => s + num(t.total), 0);
  const approvedValue = tickets.filter(t => displayStatus(t.status) === 'approved').reduce((s, t) => s + num(t.total), 0);
  const awaitingValue = tickets.filter(t => displayStatus(t.status) === 'submitted').reduce((s, t) => s + num(t.total), 0);
  const billedValue = tickets.filter(t => displayStatus(t.status) === 'billed').reduce((s, t) => s + num(t.total), 0);
  const statusCounts = tickets.reduce<Record<string, number>>((acc, t) => {
    const k = displayStatus(t.status);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const draftCount = statusCounts['draft'] || 0;
  const awaitingCount = statusCounts['submitted'] || 0;

  const q = search.trim().toLowerCase();
  const filtered = tickets.filter(t => {
    if (statusFilter !== 'all' && displayStatus(t.status) !== statusFilter) return false;
    if (!q) return true;
    return [t.description, t.notes, ticketLabel(t), t.approved_by].some(v => String(v || '').toLowerCase().includes(q));
  });

  const selected = selectedId ? tickets.find(t => t.id === selectedId) || null : null;
  const detailOpen = !!selected;

  // Stacked layouts: once the ticket is in the DOM, bring it into view instead of leaving it below the fold.
  useEffect(() => {
    if (!detailOpen) return;
    const el = detailRef.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [detailOpen, selectedId]);

  // Line rows — tolerate both surfaces' jsonb shapes; fall back to the
  // aggregate labor columns when the jsonb is absent (mobile writes aggregates).
  const laborRows: (string | number)[][] = selected
    ? (Array.isArray(selected.labor) && selected.labor.length > 0
      ? selected.labor.map((l: any) => {
          const reg = num(l.regHours ?? l.hours);
          const ot = num(l.otHours);
          const rate = num(l.rate);
          return [
            `${l.worker || 'Crew'}${l.trade ? ` · ${l.trade}` : ''}`,
            reg, ot, fmtUSD(rate), fmtUSD(reg * rate + ot * rate * 1.5),
          ];
        })
      : num(selected.labor_total) > 0
        ? [['Crew labor', num(selected.labor_hours), 0, fmtUSD(selected.labor_rate), fmtUSD(selected.labor_total)]]
        : [])
    : [];
  const materialRows: (string | number)[][] = selected
    ? (Array.isArray(selected.materials) ? selected.materials : []).map((m: any) => {
        const qty = num(m.qty ?? m.quantity);
        const cost = num(m.unitCost ?? m.unit_cost);
        return [m.description || '—', qty, m.unit || 'EA', fmtUSD(cost), fmtUSD(qty * cost)];
      })
    : [];
  const equipmentRows: (string | number)[][] = selected
    ? (Array.isArray(selected.equipment) ? selected.equipment : []).map((e: any) => {
        const hrs = num(e.hours);
        const rate = num(e.rate);
        return [e.description || '—', hrs, fmtUSD(rate), fmtUSD(hrs * rate)];
      })
    : [];
  const selSub = selected ? num(selected.labor_total) + num(selected.materials_total) + num(selected.equipment_total) : 0;
  const selStatus = selected ? displayStatus(selected.status) : 'draft';
  const rowBusy = (id: string) => busyId === id;

  /** The status verbs for a ticket — the first one is its next step. */
  function statusVerbs(t: TmTicketRow): Action[] {
    const s = displayStatus(t.status);
    const busy = rowBusy(t.id);
    const verbs: Action[] = [];
    if (s === 'draft') verbs.push({ label: 'Submit for Approval', icon: <PaperPlaneTilt size={15} />, onClick: () => submitTicket(t), disabled: busy });
    if (s === 'submitted') verbs.push(
      { label: 'Approve', icon: <CheckCircle size={15} />, onClick: () => approveTicket(t), disabled: busy },
      { label: 'Reject', icon: <XCircle size={15} />, onClick: () => rejectTicket(t), disabled: busy, tone: 'danger' },
    );
    if (s === 'approved') verbs.push({ label: 'Mark Billed', icon: <Receipt size={15} />, onClick: () => billTicket(t), disabled: busy });
    if (s === 'rejected') verbs.push({ label: 'Resubmit', icon: <ArrowsClockwise size={15} />, onClick: () => resubmitTicket(t), disabled: busy });
    return verbs;
  }
  function ticketActions(t: TmTicketRow): Action[] {
    return [
      { label: 'Open Ticket', icon: <Receipt size={15} />, onClick: () => setSelectedId(t.id) },
      ...statusVerbs(t),
      { label: 'Escalate to Change Event', icon: <Lightning size={15} />, onClick: () => escalateTicket(t), disabled: escalatingId === t.id },
      { label: 'Export PDF', icon: <FilePdf size={15} />, onClick: () => exportTickets('pdf', [t.id]), disabled: !!exporting },
    ];
  }

  // Composer line-grid helpers
  const setLabor = (id: string, field: keyof LaborLine, val: string) => setFLabor(p => p.map(l => l.id === id ? { ...l, [field]: val } : l));
  const setMaterial = (id: string, field: keyof MaterialLine, val: string) => setFMaterials(p => p.map(m => m.id === id ? { ...m, [field]: val } : m));
  const setEquipment = (id: string, field: keyof EquipmentLine, val: string) => setFEquipment(p => p.map(e => e.id === id ? { ...e, [field]: val } : e));
  const removeBtn = (onClick: () => void, disabled: boolean): React.ReactNode => (
    <Button variant="ghost" size="sm" icon={<Trash size={14} />} aria-label="Remove line" title="Remove line" onClick={onClick} disabled={disabled} />
  );
  const gridHead = (cols: string, labels: string[]): React.ReactNode => (
    <div className="tmGridHead" style={{ gridTemplateColumns: cols }}>
      {labels.map((h, i) => <span key={i} data-right={i >= 2 && h !== '' ? 'true' : undefined}>{h}</span>)}
    </div>
  );
  const LABOR_COLS = 'minmax(120px,1.4fr) minmax(130px,1.2fr) 72px 72px 92px 92px 36px';
  const MAT_COLS = 'minmax(150px,1.8fr) 72px 84px 96px 92px 36px';
  const EQ_COLS = 'minmax(150px,1.8fr) 84px 96px 92px 36px';

  // ── Stat tiles: each opens the log filtered to that slice ──
  const loading = isLoading && !data;
  const toggleStatus = (s: string) => setStatusFilter(prev => (prev === s ? 'all' : s));
  const stats: StatItem[] = loading
    ? [
        { label: 'Total Value', value: '—', sub: 'Loading…', icon: <CurrencyDollar size={15} /> },
        { label: 'Approved', value: '—', sub: 'Loading…', icon: <CheckCircle size={15} /> },
        { label: 'Awaiting Approval', value: '—', sub: 'Loading…', icon: <HourglassMedium size={15} /> },
        { label: 'Drafts', value: '—', sub: 'Loading…', icon: <NotePencil size={15} /> },
        { label: 'Billed', value: '—', sub: 'Loading…', icon: <Receipt size={15} /> },
      ]
    : [
        { label: 'Total Value', value: fmtUSD(totalValue), sub: `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}`, icon: <CurrencyDollar size={15} />, onClick: () => { setStatusFilter('all'); setSearch(''); }, active: statusFilter === 'all' && !search },
        { label: 'Approved', value: fmtUSD(approvedValue), tone: approvedValue > 0 ? 'good' : 'default', sub: `${statusCounts['approved'] || 0} approved`, icon: <CheckCircle size={15} />, onClick: () => toggleStatus('approved'), active: statusFilter === 'approved' },
        { label: 'Awaiting Approval', value: fmtUSD(awaitingValue), tone: awaitingCount > 0 ? 'warn' : 'default', sub: awaitingCount > 0 ? `${awaitingCount} submitted` : 'None submitted', icon: <HourglassMedium size={15} />, onClick: () => toggleStatus('submitted'), active: statusFilter === 'submitted' },
        { label: 'Drafts', value: draftCount, sub: draftCount > 0 ? 'Not yet submitted' : 'All sent', icon: <NotePencil size={15} />, onClick: () => toggleStatus('draft'), active: statusFilter === 'draft' },
        { label: 'Billed', value: fmtUSD(billedValue), sub: `${statusCounts['billed'] || 0} on invoices`, icon: <Receipt size={15} />, onClick: () => toggleStatus('billed'), active: statusFilter === 'billed' },
      ];

  // ── Log columns: full log, or a compact log beside the ticket ──
  const ticketCol: Column<TmTicketRow> = { key: 'ticket', header: 'Ticket', primary: true, phone: 'show', groupable: false, accessor: t => num(t.ticket_number), width: 92, render: t => <span className="tmNum" data-sel={t.id === selectedId ? 'true' : undefined}>{ticketLabel(t)}</span> };
  const dateCol: Column<TmTicketRow> = { key: 'date', header: 'Work Date', accessor: t => String(t.work_date || t.created_at || '').slice(0, 10), render: t => <span className="tmMuted">{fmtDate(t.work_date || t.created_at)}</span> };
  const descCol: Column<TmTicketRow> = { key: 'desc', phone: 'hide', header: 'Description', accessor: t => (t.description || '').toLowerCase(), render: t => (
    <div className="tmDesc">
      <span title={t.description || ''}>{t.description || '—'}</span>
      {(t.contractor_signature || t.owner_signature) && (
        <small><Signature size={11} /> {t.contractor_signature && t.owner_signature ? 'Both signatures' : t.contractor_signature ? 'Contractor signed' : 'Owner signed'}</small>
      )}
    </div>
  ) };
  const laborCol: Column<TmTicketRow> = { key: 'labor', phone: 'hide', header: 'Labor', accessor: t => num(t.labor_total), align: 'right', total: 'sum', format: fmtUSD, render: t => <span className="tmMoney tmMuted">{fmtUSD(t.labor_total)}</span> };
  const matCol: Column<TmTicketRow> = { key: 'materials', phone: 'hide', header: 'Materials', accessor: t => num(t.materials_total), align: 'right', total: 'sum', format: fmtUSD, render: t => <span className="tmMoney tmMuted">{fmtUSD(t.materials_total)}</span> };
  const eqCol: Column<TmTicketRow> = { key: 'equipment', phone: 'hide', header: 'Equipment', accessor: t => num(t.equipment_total), align: 'right', total: 'sum', format: fmtUSD, render: t => <span className="tmMoney tmMuted">{fmtUSD(t.equipment_total)}</span> };
  const totalCol: Column<TmTicketRow> = { key: 'total', phone: 'show', header: 'Total', accessor: t => num(t.total), align: 'right', total: 'sum', format: fmtUSD, render: t => <span className="tmTotal">{fmtUSD(t.total)}</span> };
  const statusCol: Column<TmTicketRow> = { key: 'status', phone: 'show', header: 'Status', accessor: t => STATUS_RANK[displayStatus(t.status)] ?? 9, render: t => {
    const b = statusBadge(t.status);
    return (
      <div className="tmDesc" style={{ maxWidth: 'none' }}>
        <span><Badge tone={b.tone}>{b.label}</Badge></span>
        {displayStatus(t.status) !== 'draft' && t.approved_by && <small>by {t.approved_by}{t.approved_at ? ` · ${fmtDate(t.approved_at)}` : ''}</small>}
      </div>
    );
  } };
  const columns: Column<TmTicketRow>[] = detailOpen
    ? [ticketCol, dateCol, totalCol, statusCol]
    : [ticketCol, dateCol, descCol, laborCol, matCol, eqCol, totalCol, statusCol];

  // ── Detail workspace ──
  const detailWorkspace = selected && (
    <div ref={detailRef} className="tmDetailCq">
      <div className="tmDetail">
        <Card
          title={selected.description || 'T&M Ticket'}
          subtitle={`${ticketLabel(selected)} · ${fmtDate(selected.work_date || selected.created_at)}`}
          actions={<Button variant="ghost" size="sm" icon={<X size={16} />} aria-label="Close ticket" title="Close ticket" onClick={() => setSelectedId(null)} />}
        >
          <div className="tmSection">
            <div className="tmBig">{fmtUSD(selected.total)}</div>
            {selStatus !== 'draft' && selected.approved_by && (
              <div className="tmMuted" style={{ fontSize: 'var(--fs-sm)' }}>
                {selStatus === 'rejected' ? 'Rejected' : 'Approved'} by {selected.approved_by}{selected.approved_at ? ` on ${fmtDate(selected.approved_at)}` : ''}
              </div>
            )}
          </div>

          {laborRows.length > 0 && (
            <div className="tmSection">
              <div className="tmSectionTitle"><HardHat size={14} /> Labor <b>{fmtUSD(selected.labor_total)}</b></div>
              <LineTable headers={['Worker', 'Reg', 'OT', 'Rate', 'Total']} rows={laborRows} />
            </div>
          )}
          {materialRows.length > 0 && (
            <div className="tmSection">
              <div className="tmSectionTitle"><Package size={14} /> Materials <b>{fmtUSD(selected.materials_total)}</b></div>
              <LineTable headers={['Description', 'Qty', 'Unit', 'Cost', 'Total']} rows={materialRows} />
            </div>
          )}
          {equipmentRows.length > 0 && (
            <div className="tmSection">
              <div className="tmSectionTitle"><Wrench size={14} /> Equipment <b>{fmtUSD(selected.equipment_total)}</b></div>
              <LineTable headers={['Description', 'Hours', 'Rate', 'Total']} rows={equipmentRows} />
            </div>
          )}
          {laborRows.length === 0 && materialRows.length === 0 && equipmentRows.length === 0 && (
            <div className="tmSection"><div className="tmMuted" style={{ fontSize: 'var(--fs-sm)' }}>No line items were recorded on this ticket.</div></div>
          )}

          <div className="tmSection">
            <div className="tmSectionTitle">Totals</div>
            <TotalsLadder sub={selSub} markupPct={num(selected.markup_pct)} taxPct={num(selected.tax_pct)} total={num(selected.total)} />
          </div>

          {selected.notes && (
            <div className="tmSection">
              <div className="tmSectionTitle">Notes</div>
              <div className="tmProse">{selected.notes}</div>
            </div>
          )}

          {(selected.contractor_signature || selected.owner_signature) && (
            <div className="tmSection">
              <div className="tmSectionTitle"><Signature size={14} /> Signatures</div>
              <div className="tmSigs">
                {selected.contractor_signature && (
                  <div>
                    <div className="k-label" style={{ marginBottom: 6 }}>Contractor</div>
                    {/* Signatures are canvas dataURLs stored as TEXT — render directly. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selected.contractor_signature} alt="Contractor signature" />
                  </div>
                )}
                {selected.owner_signature && (
                  <div>
                    <div className="k-label" style={{ marginBottom: 6 }}>Owner / GC</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selected.owner_signature} alt="Owner signature" />
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        <aside className="tmRail" aria-label="Ticket details and actions">
          <Card title="Details">
            <div className="tmSection">
              <div className="tmBadges">
                <Badge tone={statusBadge(selected.status).tone} dot>{statusBadge(selected.status).label}</Badge>
                {(selected.contractor_signature || selected.owner_signature) && <Badge tone="neutral"><Signature size={11} /> {selected.contractor_signature && selected.owner_signature ? 'Both Signed' : 'One Signature'}</Badge>}
              </div>
              <div className="tmNext">
                {selStatus === 'draft' && 'Next: submit for approval.'}
                {selStatus === 'submitted' && 'Next: approve or reject.'}
                {selStatus === 'approved' && 'Next: mark billed or escalate.'}
                {selStatus === 'rejected' && 'Next: resubmit or escalate.'}
                {selStatus === 'billed' && 'On an invoice.'}
              </div>
            </div>
            <div className="tmSection">
              <DetailList items={[
                ['Ticket', ticketLabel(selected)],
                ['Work Date', fmtDate(selected.work_date || selected.created_at)],
                ['Labor', <span key="l" className="tmMoney">{fmtUSD(selected.labor_total)}</span>],
                ['Materials', <span key="m" className="tmMoney">{fmtUSD(selected.materials_total)}</span>],
                ['Equipment', <span key="e" className="tmMoney">{fmtUSD(selected.equipment_total)}</span>],
                ['Markup', `${num(selected.markup_pct)}%`],
                ['Tax', `${num(selected.tax_pct)}%`],
                ['Total', <span key="t" className="tmTotal">{fmtUSD(selected.total)}</span>],
                ['Approved By', selected.approved_by || ''],
              ]} />
            </div>
            <div className="tmSection">
              <div className="tmActions">
                {statusVerbs(selected).map(v => (
                  <Button key={v.label} variant={v.tone === 'danger' ? 'danger' : 'secondary'} icon={v.icon} onClick={v.onClick} disabled={v.disabled}>
                    {rowBusy(selected.id) ? 'Working…' : v.label}
                  </Button>
                ))}
                <div className="tmActionsRow">
                  <Button icon={<Lightning size={16} />} onClick={() => escalateTicket(selected)} disabled={escalatingId === selected.id}>
                    {escalatingId === selected.id ? 'Escalating…' : 'Escalate to Change Event'}
                  </Button>
                  <RowActions actions={[
                    { label: 'Export PDF', icon: <FilePdf size={15} />, onClick: () => exportTickets('pdf', [selected.id]), disabled: !!exporting },
                  ]} />
                </div>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );

  // ── Log body: loading / error / empty / no-match / rows — each distinct ──
  let listBody: React.ReactNode;
  if (!loading && loadError) {
    listBody = (
      <EmptyState
        icon={<WarningCircle size={22} />}
        title="Couldn't load T&M tickets"
        text={`${humanError(loadError, 'Request failed.')} Nothing has been lost — try again.`}
        action={<Button icon={<ArrowClockwise size={15} />} onClick={() => mutateTickets()}>Retry</Button>}
      />
    );
  } else if (!loading && tickets.length === 0) {
    listBody = (
      <EmptyState
        icon={<Receipt size={22} />}
        title="No T&M tickets yet"
        text="Capture extra work with labor, materials, equipment and signatures."
        action={<Button icon={<Plus size={15} weight="bold" />} onClick={() => setShowForm(true)}>New T&M Ticket</Button>}
      />
    );
  } else {
    listBody = (
      <DataTable
        tableId="project-tm-tickets"
        exportName="tm-tickets"
        columns={columns}
        rows={filtered}
        rowKey={t => t.id}
        loading={loading}
        defaultSort={{ key: 'date', dir: 'desc' }}
        onRowClick={t => setSelectedId(t.id)}
        rowActions={ticketActions}
        empty={
          <EmptyState
            icon={<Receipt size={22} />}
            title="No tickets match these filters"
            text="Clear the search or status filter to see more."
            action={<Button onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear Filters</Button>}
          />
        }
      />
    );
  }

  // Server-built exports of the tickets the current filter shows.
  const exportOff = !!exporting || filtered.length === 0;
  const exportActions: Action[] = [
    { label: `CSV (${filtered.length})`, icon: <FileCsv size={15} />, onClick: () => exportTickets('csv'), disabled: exportOff },
    { label: `Excel (${filtered.length})`, icon: <FileXls size={15} />, onClick: () => exportTickets('xlsx'), disabled: exportOff },
    { label: `PDF (${filtered.length})`, icon: <FilePdf size={15} />, onClick: () => exportTickets('pdf'), disabled: exportOff },
  ];

  return (
    <div className="tmWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `/app/projects/${projectId}/overview` },
          { label: 'T&M Tickets' },
        ]}
        title="T&M Tickets"
        subtitle="Signed extras — approved, then billed or escalated."
        actions={
          <>
            {tickets.length > 0 && <Menu actions={exportActions} triggerLabel={exporting ? 'Exporting…' : 'Export'} triggerIcon={<DownloadSimple size={15} />} label="Export tickets" />}
            <Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={() => setShowForm(true)}>
              New T&M Ticket
            </Button>
          </>
        }
      >
        {!loadError && <StatRow items={stats} />}

        {!loading && !loadError && tickets.length > 0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search tickets, descriptions, approvers…"
            filters={
              <>
                <Select
                  aria-label="Status"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  style={{ width: 'auto', minWidth: 150 }}
                  options={[{ value: 'all', label: 'All Statuses' }, ...STATUS_ORDER.map(s => ({ value: s, label: `${STATUS_LABEL[s]}${statusCounts[s] ? ` (${statusCounts[s]})` : ''}` }))]}
                />
                {(search || statusFilter !== 'all') && <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear</Button>}
              </>
            }
            actions={<span className="tmMuted" style={{ fontSize: 'var(--fs-sm)' }}>{filtered.length} of {tickets.length}</span>}
          />
        )}

        <div className="tmCq">
          <div className="tmSplit" data-open={detailOpen ? 'true' : 'false'}>
            <div className="tmList">
              <Card flush>{listBody}</Card>
            </div>
            {detailWorkspace}
          </div>
        </div>
      </PageShell>

      {/* ── Composer ──────────────────────────────────────────────────────── */}
      <FormModal
        open={showForm}
        onClose={closeComposer}
        title="New T&M Ticket"
        subtitle={`${ctx?.project?.name ? `${ctx.project.name} · ` : ''}the ticket number is assigned automatically on save.`}
        busy={saving}
        footer={
          <>
            <span className="tmMuted" style={{ marginRight: 'auto', alignSelf: 'center', fontSize: 'var(--fs-sm)' }}>
              Ticket total <b className="tmTotal">{fmtUSD(previewTotal)}</b>
            </span>
            <Button variant="ghost" onClick={closeComposer} disabled={saving}>Cancel</Button>
            <Button onClick={() => createTicket('draft')} disabled={saving || !fDesc.trim()}>Save as Draft</Button>
            <Button variant="primary" icon={<PaperPlaneTilt size={15} weight="bold" />} onClick={() => createTicket('submitted')} disabled={saving || !fDesc.trim()}>
              {saving ? 'Saving…' : 'Create & Submit'}
            </Button>
          </>
        }
      >
        <FormGrid cols={2}>
          <Field label="Work Date">
            <div className="tmDateInput"><SaguaroDatePicker value={fDate} onChange={setFDate} style={DATE_INPUT_STYLE} /></div>
          </Field>
          <Field label="Reference / PO">
            <Input value={fRef} onChange={e => setFRef(e.target.value)} placeholder="e.g. PO-1042, RFI-007" />
          </Field>
          <Field label="Description of Work" required span>
            <Input value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="e.g. Rerouted conduit around unmarked plumbing stack, level 2" autoFocus />
          </Field>
        </FormGrid>

        {/* Labor grid — trades come from lib/contractor-trades (never hardcoded) */}
        <div className="tmGroup" style={{ marginTop: 16 }}>
          <div className="tmGroupHead"><HardHat size={15} /> Labor <b>{fmtUSD(previewLabor)}</b></div>
          <div className="tmGridWrap">
            <div>
              {gridHead(LABOR_COLS, ['Worker', 'Trade', 'Reg Hrs', 'OT Hrs', 'Rate', 'Line Total', ''])}
              {fLabor.map(l => (
                <div key={l.id} className="tmGrid" style={{ gridTemplateColumns: LABOR_COLS }}>
                  <Input value={l.worker} onChange={e => setLabor(l.id, 'worker', e.target.value)} placeholder="Name" aria-label="Worker" />
                  <Select value={l.trade} onChange={e => setLabor(l.id, 'trade', e.target.value)} options={TRADESPERSON_ROLES as unknown as string[]} aria-label="Trade" />
                  <Input value={l.regHours} onChange={e => setLabor(l.id, 'regHours', e.target.value)} placeholder="0" inputMode="decimal" style={{ textAlign: 'right' }} aria-label="Regular hours" />
                  <Input value={l.otHours} onChange={e => setLabor(l.id, 'otHours', e.target.value)} placeholder="0" inputMode="decimal" style={{ textAlign: 'right' }} aria-label="Overtime hours" />
                  <Input value={l.rate} onChange={e => setLabor(l.id, 'rate', e.target.value)} placeholder="$/hr" inputMode="decimal" style={{ textAlign: 'right' }} aria-label="Rate" />
                  <span className="tmLine">{fmtUSD(num(l.regHours) * num(l.rate) + num(l.otHours) * num(l.rate) * 1.5)}</span>
                  {removeBtn(() => setFLabor(p => p.length > 1 ? p.filter(x => x.id !== l.id) : p), fLabor.length <= 1)}
                </div>
              ))}
            </div>
          </div>
          <Button size="sm" icon={<Plus size={12} weight="bold" />} onClick={() => setFLabor(p => [...p, { id: uid(), worker: '', trade: DEFAULT_TRADE, regHours: '', otHours: '', rate: '' }])}>Add Labor Line</Button>
        </div>

        {/* Materials grid */}
        <div className="tmGroup">
          <div className="tmGroupHead"><Package size={15} /> Materials <b>{fmtUSD(previewMaterials)}</b></div>
          <div className="tmGridWrap">
            <div>
              {gridHead(MAT_COLS, ['Description', 'Qty', 'Unit', 'Unit Cost', 'Line Total', ''])}
              {fMaterials.map(m => (
                <div key={m.id} className="tmGrid" style={{ gridTemplateColumns: MAT_COLS }}>
                  <Input value={m.description} onChange={e => setMaterial(m.id, 'description', e.target.value)} placeholder="Material" aria-label="Material" />
                  <Input value={m.qty} onChange={e => setMaterial(m.id, 'qty', e.target.value)} placeholder="0" inputMode="decimal" style={{ textAlign: 'right' }} aria-label="Quantity" />
                  <Select value={m.unit} onChange={e => setMaterial(m.id, 'unit', e.target.value)} options={UNITS} aria-label="Unit" />
                  <Input value={m.unitCost} onChange={e => setMaterial(m.id, 'unitCost', e.target.value)} placeholder="$" inputMode="decimal" style={{ textAlign: 'right' }} aria-label="Unit cost" />
                  <span className="tmLine">{fmtUSD(num(m.qty) * num(m.unitCost))}</span>
                  {removeBtn(() => setFMaterials(p => p.length > 1 ? p.filter(x => x.id !== m.id) : p), fMaterials.length <= 1)}
                </div>
              ))}
            </div>
          </div>
          <Button size="sm" icon={<Plus size={12} weight="bold" />} onClick={() => setFMaterials(p => [...p, { id: uid(), description: '', qty: '', unit: 'EA', unitCost: '' }])}>Add Material Line</Button>
        </div>

        {/* Equipment grid */}
        <div className="tmGroup">
          <div className="tmGroupHead"><Wrench size={15} /> Equipment <b>{fmtUSD(previewEquipment)}</b></div>
          <div className="tmGridWrap">
            <div>
              {gridHead(EQ_COLS, ['Description', 'Hours', 'Rate', 'Line Total', ''])}
              {fEquipment.map(eq => (
                <div key={eq.id} className="tmGrid" style={{ gridTemplateColumns: EQ_COLS }}>
                  <Input value={eq.description} onChange={e => setEquipment(eq.id, 'description', e.target.value)} placeholder="e.g. Mini excavator" aria-label="Equipment" />
                  <Input value={eq.hours} onChange={e => setEquipment(eq.id, 'hours', e.target.value)} placeholder="0" inputMode="decimal" style={{ textAlign: 'right' }} aria-label="Hours" />
                  <Input value={eq.rate} onChange={e => setEquipment(eq.id, 'rate', e.target.value)} placeholder="$/hr" inputMode="decimal" style={{ textAlign: 'right' }} aria-label="Rate" />
                  <span className="tmLine">{fmtUSD(num(eq.hours) * num(eq.rate))}</span>
                  {removeBtn(() => setFEquipment(p => p.length > 1 ? p.filter(x => x.id !== eq.id) : p), fEquipment.length <= 1)}
                </div>
              ))}
            </div>
          </div>
          <Button size="sm" icon={<Plus size={12} weight="bold" />} onClick={() => setFEquipment(p => [...p, { id: uid(), description: '', hours: '', rate: '' }])}>Add Equipment Line</Button>
        </div>

        <FormGrid cols={2}>
          <Field label="Markup %" hint={`On the subtotal. Adds ${fmtUSD(previewMarkupAmt)}.`}>
            <Input value={fMarkup} onChange={e => setFMarkup(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Tax %" hint={`After markup. Adds ${fmtUSD(previewTaxAmt)}.`}>
            <Input value={fTax} onChange={e => setFTax(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Notes" span>
            <Textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} placeholder="Conditions, directives, who authorized the work…" />
          </Field>
        </FormGrid>

        <div className="tmGroup" style={{ marginTop: 16 }}>
          <div className="tmGroupHead"><Signature size={15} /> Signatures</div>
          <div className="tmSigs">
            <SignaturePad label="Contractor Signature" value={contractorSig} onChange={setContractorSig} />
            <SignaturePad label="Owner / GC Signature" value={ownerSig} onChange={setOwnerSig} />
          </div>
        </div>

        {/* Live ticket math — the SAME operations as the server route */}
        <div className="tmLadder">
          <LadderRow label="Labor (OT at 1.5x)" value={fmtUSD(previewLabor)} />
          <LadderRow label="Materials" value={fmtUSD(previewMaterials)} />
          <LadderRow label="Equipment" value={fmtUSD(previewEquipment)} />
          <div className="tmRule" />
          <LadderRow label="Subtotal" value={fmtUSD(previewSub)} />
          <LadderRow label={`Markup (${num(fMarkup)}%)`} value={'+' + fmtUSD(previewMarkupAmt)} />
          <LadderRow label={`Tax (${num(fTax)}%)`} value={'+' + fmtUSD(previewTaxAmt)} />
          <div className="tmRule" />
          <LadderRow label="Ticket Total" value={fmtUSD(previewTotal)} strong />
        </div>
      </FormModal>

      {/* Above the FormModal overlay so the unsaved-work prompt is never hidden behind it. */}
      <div style={{ position: 'relative', zIndex: 10001 }}>
        <UnsavedGuardModal guard={guard} />
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
