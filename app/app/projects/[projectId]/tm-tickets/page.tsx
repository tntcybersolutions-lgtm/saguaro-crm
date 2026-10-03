'use client';
/**
 * T&M Tickets — project-scoped module page (web mirror of the rich mobile screen).
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
 * the stored total agree to the cent.
 *
 * Known gap (intentional, no server change here): Submit / Approve do not yet
 * fan out createNotification() on the server — notify wiring is a follow-up.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import UnsavedGuardModal from '@/components/UnsavedGuardModal';
import { humanError } from '@/lib/errors';
import { SignatureCanvas, type SignatureCanvasHandle } from '@/components/SignaturePad';
import { TRADESPERSON_ROLES } from '@/lib/contractor-trades';
import { getSupabaseBrowser, ensureBrowserSession } from '@/lib/supabase-browser';
import {
  PremiumSurface, ModuleHero, StatCard, SectionCard, StatStrip, FlowSteps, FlowStrip,
  InsightRow, AutoChip, IconChip, goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle,
} from '@/components/ui/premium';
import { moduleAccent } from '@/lib/module-identity';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { Skeleton } from '@/components/ui/Skeleton';
import { SortableTh, usePersistedSort, useSortedRows } from '@/app/app/_shared/table-sort';
import {
  Receipt, Plus, X, CheckCircle, XCircle, PaperPlaneTilt, ArrowsClockwise, Lightning,
  FileCsv, FileXls, FilePdf, HardHat, Package, Wrench, Signature, CurrencyCircleDollar,
  Clock, NotePencil, Trash, CaretRight,
} from '@phosphor-icons/react';

const GOLD = 'var(--brand-primary)';
const GOLD_HI = 'var(--brand-primary-strong)';
const DARK = 'var(--bg-base)';
const RAISED = 'var(--bg-surface)';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#D4D4D8';
const TEXT = '#FFFFFF';
const GREEN = '#2CFF7A';
const RED = '#FF3B30';
const STEEL = '#FF8A00';

// T&M module accent — 'tm' in lib/module-identity (ledger green: money-adjacent,
// never gold). Used ONLY on icon chips / badges / eyebrows per the accent discipline.
const TM_ACCENT = moduleAccent('tm').hex;

const INP: React.CSSProperties = { padding: '8px 12px', background: 'var(--bg-surface-2)', border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
const LBL: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6 };
const HINT: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5, lineHeight: 1.45 };
const TH: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: DIM, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' };
const TD: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: TEXT, verticalAlign: 'top' };

// Legacy vocab: old rows carry 'disputed' — displayed as rejected everywhere.
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Draft',     color: DIM,     bg: 'rgba(203,213,225,0.12)' },
  submitted: { label: 'Submitted', color: GOLD_HI, bg: 'var(--brand-primary-12)' },
  approved:  { label: 'Approved',  color: GREEN,   bg: 'rgba(26,138,74,0.16)' },
  rejected:  { label: 'Rejected',  color: RED,     bg: 'rgba(192,48,48,0.16)' },
  billed:    { label: 'Billed',    color: STEEL,   bg: 'rgba(127,163,199,0.14)' },
};
const STATUS_ORDER = ['draft', 'submitted', 'approved', 'rejected', 'billed'] as const;
function displayStatus(s?: string | null): string {
  const k = String(s || 'draft').toLowerCase();
  if (k === 'disputed') return 'rejected';
  return STATUS_META[k] ? k : 'draft';
}

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
const fmtDate = (d?: string | null) => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const ticketLabel = (t: TmTicketRow) => {
  if (t.ticket_number == null || t.ticket_number === '') return 'TM';
  const n = Number(t.ticket_number);
  return Number.isFinite(n) ? `TM-${String(n).padStart(3, '0')}` : `TM-${t.ticket_number}`;
};

function StatusPill({ status }: { status?: string | null }) {
  const meta = STATUS_META[displayStatus(status)];
  return (
    <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 5, background: meta.bg, color: meta.color, whiteSpace: 'nowrap' }}>
      {meta.label}
    </span>
  );
}

// ─── Signature pad — the proven canvas dataURL pattern from app/field/tm-tickets ──
function SignaturePad({ label, value, onChange }: { label: string; value: string; onChange: (dataUrl: string) => void }) {
  // Thin wrapper over the shared SignatureCanvas — the same pad the field app
  // uses, so there is one signature implementation instead of three. The copy
  // that lived here inked in GOLD on a transparent canvas (unreadable on the
  // white ticket PDF), never re-sized its bitmap, and restored a stored
  // signature in a mount-only effect, so reopening a loaded ticket showed an
  // empty pad.
  const padRef = useRef<SignatureCanvasHandle>(null);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ ...LBL, marginBottom: 0 }}>{label}</label>
        <button
          type="button"
          onClick={() => padRef.current?.clear()}
          style={{ background: 'none', border: 'none', color: RED, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
        >
          Clear
        </button>
      </div>
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
        <SignatureCanvas ref={padRef} value={value} onChange={onChange} height={110} />
      </div>
      {value
        ? <p style={{ margin: '4px 0 0', fontSize: 11, color: GREEN, fontWeight: 600 }}>Signature captured</p>
        : <p style={{ margin: '4px 0 0', fontSize: 11, color: DIM }}>Sign above with a mouse, finger or stylus.</p>}
    </div>
  );
}

// ─── Line-item detail table (drawer) — shape-tolerant across surfaces ─────────
function LineTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ overflowX: 'auto', border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: DARK }}>
            {headers.map((h, i) => (
              <th key={h} style={{ ...TH, padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} style={{ borderBottom: ri === rows.length - 1 ? 'none' : `1px solid rgba(255,255,255,0.06)` }}>
              {r.map((c, ci) => (
                <td key={ci} style={{ ...TD, padding: '9px 12px', textAlign: ci === 0 ? 'left' : 'right', color: ci === r.length - 1 ? GOLD : ci === 0 ? TEXT : DIM, fontWeight: ci === r.length - 1 ? 700 : 500, fontVariantNumeric: 'tabular-nums', whiteSpace: ci === 0 ? 'normal' : 'nowrap' }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Totals ladder: subtotal -> +markup% -> +tax% -> total. Stored `total` is the
// server's source of truth; the intermediate lines are derived for display.
function TotalsLadder({ sub, markupPct, taxPct, total }: { sub: number; markupPct: number; taxPct: number; total: number }) {
  const markupAmt = (sub * markupPct) / 100;
  const taxAmt = ((sub + markupAmt) * taxPct) / 100;
  return (
    <div>
      <InsightRow label="Subtotal (Labor + Materials + Equipment)" value={fmtUSD(sub)} />
      <InsightRow label={`Markup (${markupPct}%)`} value={'+' + fmtUSD(markupAmt)} accent={markupPct > 0 ? GOLD_HI : undefined} />
      <InsightRow label={`Tax (${taxPct}%)`} value={'+' + fmtUSD(taxAmt)} accent={taxPct > 0 ? GOLD_HI : undefined} />
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
      <InsightRow label="Ticket Total" value={fmtUSD(total)} accent={GOLD} strong />
    </div>
  );
}

export default function TmTicketsPage() {
  const params = useParams();
  const projectId = params['projectId'] as string;
  const listKey = `/api/projects/${projectId}/tm-tickets`;

  const { data, isLoading, mutate: mutateTickets } = useSWR<{ tickets: TmTicketRow[] }>(listKey, fetcher, { revalidateOnFocus: true });
  const { data: me } = useSWR<{ id: string; email: string; name: string }>('/api/auth/me', fetcher, { revalidateOnFocus: false });
  const tickets = data?.tickets ?? [];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [escalatingId, setEscalatingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { const t = toast ? setTimeout(() => setToast(null), 4000) : null; return () => { if (t) clearTimeout(t); }; }, [toast]);

  // Dead-space kill: an empty log opens straight into the composer, one-shot
  // per visit so Cancel stays cancelled.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!isLoading && data && tickets.length === 0 && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setShowForm(true);
    }
  }, [isLoading, data, tickets.length]);

  // ── Composer state ──────────────────────────────────────────────────────
  const [fDate, setFDate] = useState(() => new Date().toISOString().slice(0, 10));
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
    setFDate(new Date().toISOString().slice(0, 10));
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

  /** Composer close paths (hero Cancel toggle / footer Cancel) run through the guard. */
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

  // Sortable columns (R11 sweep) — money columns sort on their Number()-coerced
  // values (several round-trip from the DB as TEXT), dates on the raw ISO date.
  const { sort, cycleSort } = usePersistedSort('project-tm-tickets', { key: 'date', dir: 'desc' });
  const sortedTickets = useSortedRows(filtered, sort, (t, key) => {
    switch (key) {
      case 'ticket':    return num(t.ticket_number);
      case 'date':      return String(t.work_date || t.created_at || '').slice(0, 10) || null;
      case 'desc':      return t.description || null;
      case 'labor':     return num(t.labor_total);
      case 'materials': return num(t.materials_total);
      case 'equipment': return num(t.equipment_total);
      case 'total':     return num(t.total);
      case 'status':    return displayStatus(t.status);
      default:          return (t as unknown as Record<string, unknown>)[key];
    }
  });

  const selected = selectedId ? tickets.find(t => t.id === selectedId) || null : null;

  // Drawer line rows — tolerate both surfaces' jsonb shapes; fall back to the
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

  const statusActionButtons = (t: TmTicketRow, compact: boolean) => {
    const s = displayStatus(t.status);
    const base: React.CSSProperties = compact
      ? { borderRadius: 6, fontSize: 11, padding: '4px 12px', fontWeight: 800, cursor: rowBusy(t.id) ? 'wait' : 'pointer', opacity: rowBusy(t.id) ? 0.6 : 1, border: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }
      : { borderRadius: 10, fontSize: 13, padding: '10px 16px', fontWeight: 800, cursor: rowBusy(t.id) ? 'wait' : 'pointer', opacity: rowBusy(t.id) ? 0.6 : 1, border: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 };
    const gold = { ...base, background: `linear-gradient(135deg,${GOLD},${GOLD_HI})`, color: '#0A0A00' };
    const green = { ...base, background: 'rgba(26,138,74,.16)', border: '1px solid rgba(44,255,122,.4)', color: GREEN };
    const red = { ...base, background: 'none', border: '1px solid rgba(192,48,48,.4)', color: RED };
    const steel = { ...base, background: 'rgba(127,163,199,.12)', border: '1px solid rgba(127,163,199,.4)', color: STEEL };
    const btns: React.ReactNode[] = [];
    if (s === 'draft') btns.push(
      <button key="submit" disabled={rowBusy(t.id)} onClick={ev => { ev.stopPropagation(); submitTicket(t); }} style={gold}>
        <PaperPlaneTilt size={compact ? 12 : 14} weight="bold" />{rowBusy(t.id) ? '…' : 'Submit'}
      </button>);
    if (s === 'submitted') btns.push(
      <button key="approve" disabled={rowBusy(t.id)} onClick={ev => { ev.stopPropagation(); approveTicket(t); }} style={green}>
        <CheckCircle size={compact ? 12 : 14} weight="bold" />{rowBusy(t.id) ? '…' : 'Approve'}
      </button>,
      <button key="reject" disabled={rowBusy(t.id)} onClick={ev => { ev.stopPropagation(); rejectTicket(t); }} style={red}>
        <XCircle size={compact ? 12 : 14} weight="bold" />Reject
      </button>);
    if (s === 'approved') btns.push(
      <button key="bill" disabled={rowBusy(t.id)} onClick={ev => { ev.stopPropagation(); billTicket(t); }} style={steel}>
        <Receipt size={compact ? 12 : 14} weight="bold" />{rowBusy(t.id) ? '…' : 'Mark Billed'}
      </button>);
    if (s === 'rejected') btns.push(
      <button key="resubmit" disabled={rowBusy(t.id)} onClick={ev => { ev.stopPropagation(); resubmitTicket(t); }} style={gold}>
        <ArrowsClockwise size={compact ? 12 : 14} weight="bold" />{rowBusy(t.id) ? '…' : 'Resubmit'}
      </button>);
    return btns;
  };

  // Composer line-grid helpers
  const setLabor = (id: string, field: keyof LaborLine, val: string) => setFLabor(p => p.map(l => l.id === id ? { ...l, [field]: val } : l));
  const setMaterial = (id: string, field: keyof MaterialLine, val: string) => setFMaterials(p => p.map(m => m.id === id ? { ...m, [field]: val } : m));
  const setEquipment = (id: string, field: keyof EquipmentLine, val: string) => setFEquipment(p => p.map(e => e.id === id ? { ...e, [field]: val } : e));
  const removeBtn = (onClick: () => void, disabled: boolean): React.ReactNode => (
    <button type="button" onClick={onClick} disabled={disabled} title="Remove line"
      style={{ background: 'none', border: 'none', color: disabled ? 'rgba(255,255,255,0.2)' : RED, cursor: disabled ? 'default' : 'pointer', padding: 4, display: 'inline-flex' }}>
      <Trash size={14} weight="regular" />
    </button>
  );
  const addLineBtn = (label: string, onClick: () => void): React.ReactNode => (
    <button type="button" onClick={onClick}
      style={{ background: 'var(--brand-primary-08)', border: `1px dashed var(--brand-primary-35)`, borderRadius: 8, padding: '7px 14px', color: GOLD_HI, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
      <Plus size={12} weight="bold" /> {label}
    </button>
  );
  const gridHead = (cols: string, labels: string[]): React.ReactNode => (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, marginBottom: 6 }}>
      {labels.map((h, i) => (
        <span key={i} style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.42)', textAlign: i >= labels.length - 2 && h !== '' ? 'right' : 'left' }}>{h}</span>
      ))}
    </div>
  );

  const exportBtn = (format: 'csv' | 'xlsx' | 'pdf', icon: React.ReactNode) => (
    <button
      onClick={() => exportTickets(format)}
      disabled={!!exporting || filtered.length === 0}
      title={`Export ${filtered.length} ticket${filtered.length === 1 ? '' : 's'} (current filter) as ${format.toUpperCase()}`}
      style={{ ...ghostButtonStyle, padding: '9px 13px', fontSize: 12, opacity: exporting || filtered.length === 0 ? 0.5 : 1, cursor: exporting ? 'wait' : 'pointer' }}
      className="pmBtn">
      {icon}{format.toUpperCase()}
    </button>
  );

  const loading = isLoading && !data;

  return (
    <>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 99999, padding: '12px 20px', borderRadius: 8, background: toast.type === 'success' ? 'rgba(44,255,122,0.9)' : 'rgba(255,59,48,0.9)', color: '#fff', fontWeight: 600, fontSize: 14, pointerEvents: 'none' }}>
          {toast.msg}
        </div>
      )}

      <PremiumSurface maxWidth={2200}>

        <ModuleHero
          eyebrow="Field Money"
          eyebrowIcon={<IconChip size={24} vivid={moduleAccent('tm').vivid ?? TM_ACCENT}><Receipt size={13} weight="fill" color="#F8FAFC" /></IconChip>}
          accentColor={TM_ACCENT}
          title="T&M"
          accent="Tickets"
          subtitle={loading ? 'Loading…' : `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''} — capture time & material extras with signatures, get them approved, then billed or escalated to a change event.`}
          actions={
            <button onClick={() => { if (showForm) closeComposer(); else setShowForm(true); }} style={goldButtonStyle} className="pmBtn">
              {showForm ? <><X size={15} weight="bold" /> Cancel</> : <><Plus size={15} weight="bold" /> New T&M Ticket</>}
            </button>
          }
        />

        {/* Money strip — every figure is Number()-coerced (money columns can be TEXT) */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} height={74} borderRadius={14} />)}
          </div>
        ) : (
          <StatStrip items={[
            {href: `/app/projects/${projectId}/tm-tickets`,  label: 'Total Value', value: fmtUSD(totalValue), accent: GOLD, sub: `${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}`, icon: <CurrencyCircleDollar size={12} weight="bold" color={TM_ACCENT} /> },
            {href: `/app/projects/${projectId}/tm-tickets`,  label: 'Approved', value: fmtUSD(approvedValue), accent: approvedValue > 0 ? GREEN : undefined, sub: `${statusCounts['approved'] || 0} approved`, icon: <CheckCircle size={12} weight="bold" color={GREEN} /> },
            {href: `/app/projects/${projectId}/tm-tickets`,  label: 'Awaiting Approval', value: fmtUSD(awaitingValue), accent: awaitingCount > 0 ? GOLD_HI : undefined, sub: awaitingCount > 0 ? `${awaitingCount} submitted` : 'None submitted', icon: <Clock size={12} weight="bold" color={GOLD_HI} /> },
            {href: `/app/projects/${projectId}/tm-tickets`,  label: 'Drafts', value: String(draftCount), sub: draftCount > 0 ? 'Not yet submitted' : 'All sent', icon: <NotePencil size={12} weight="bold" color={DIM} /> },
            {href: `/app/projects/${projectId}/tm-tickets`,  label: 'Billed', value: fmtUSD(billedValue), accent: billedValue > 0 ? STEEL : undefined, sub: `${statusCounts['billed'] || 0} on invoices`, icon: <Receipt size={12} weight="bold" color={STEEL} /> },
          ]} />
        )}

        {/* Inline composer — the create flow lives ON the page, never a dead Add zone */}
        {showForm && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 22, alignItems: 'start', marginBottom: 24 }}>
            <SectionCard title="New T&M Ticket" subtitle="The ticket number is assigned automatically on save." icon={<Plus size={17} weight="duotone" color={GOLD} />}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={LBL}>Work Date<AutoChip label="Today" /></label>
                  <SaguaroDatePicker value={fDate} onChange={setFDate} />
                </div>
                <div>
                  <label style={LBL}>Reference / PO</label>
                  <input value={fRef} onChange={e => setFRef(e.target.value)} placeholder="e.g. PO-1042, RFI-007" style={INP} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LBL}>Description of Work *</label>
                  <input value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="e.g. Rerouted conduit around unmarked plumbing stack, level 2" style={INP} />
                </div>
              </div>

              {/* Labor grid — trades come from lib/contractor-trades (never hardcoded) */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <HardHat size={15} weight="duotone" color={TM_ACCENT} />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: TEXT }}>Labor</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(previewLabor)}</span>
                </div>
                {gridHead('minmax(120px,1.4fr) minmax(130px,1.2fr) 70px 70px 90px 90px 28px', ['Worker', 'Trade', 'Reg Hrs', 'OT Hrs', 'Rate', 'Line Total', ''])}
                {fLabor.map(l => (
                  <div key={l.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,1.4fr) minmax(130px,1.2fr) 70px 70px 90px 90px 28px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input value={l.worker} onChange={e => setLabor(l.id, 'worker', e.target.value)} placeholder="Name" style={INP} />
                    <select value={l.trade} onChange={e => setLabor(l.id, 'trade', e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
                      {TRADESPERSON_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <input value={l.regHours} onChange={e => setLabor(l.id, 'regHours', e.target.value)} placeholder="0" inputMode="decimal" style={{ ...INP, textAlign: 'right' }} />
                    <input value={l.otHours} onChange={e => setLabor(l.id, 'otHours', e.target.value)} placeholder="0" inputMode="decimal" style={{ ...INP, textAlign: 'right' }} />
                    <input value={l.rate} onChange={e => setLabor(l.id, 'rate', e.target.value)} placeholder="$/hr" inputMode="decimal" style={{ ...INP, textAlign: 'right' }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: GOLD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtUSD(num(l.regHours) * num(l.rate) + num(l.otHours) * num(l.rate) * 1.5)}
                    </span>
                    {removeBtn(() => setFLabor(p => p.length > 1 ? p.filter(x => x.id !== l.id) : p), fLabor.length <= 1)}
                  </div>
                ))}
                {addLineBtn('Add Labor Line', () => setFLabor(p => [...p, { id: uid(), worker: '', trade: DEFAULT_TRADE, regHours: '', otHours: '', rate: '' }]))}
                <div style={HINT}>Overtime bills at 1.5x the worker&apos;s rate — same math the server stores.</div>
              </div>

              {/* Materials grid */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Package size={15} weight="duotone" color={TM_ACCENT} />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: TEXT }}>Materials</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(previewMaterials)}</span>
                </div>
                {gridHead('minmax(150px,1.8fr) 70px 80px 95px 90px 28px', ['Description', 'Qty', 'Unit', 'Unit Cost', 'Line Total', ''])}
                {fMaterials.map(m => (
                  <div key={m.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1.8fr) 70px 80px 95px 90px 28px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input value={m.description} onChange={e => setMaterial(m.id, 'description', e.target.value)} placeholder="Material" style={INP} />
                    <input value={m.qty} onChange={e => setMaterial(m.id, 'qty', e.target.value)} placeholder="0" inputMode="decimal" style={{ ...INP, textAlign: 'right' }} />
                    <select value={m.unit} onChange={e => setMaterial(m.id, 'unit', e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <input value={m.unitCost} onChange={e => setMaterial(m.id, 'unitCost', e.target.value)} placeholder="$" inputMode="decimal" style={{ ...INP, textAlign: 'right' }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: GOLD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtUSD(num(m.qty) * num(m.unitCost))}
                    </span>
                    {removeBtn(() => setFMaterials(p => p.length > 1 ? p.filter(x => x.id !== m.id) : p), fMaterials.length <= 1)}
                  </div>
                ))}
                {addLineBtn('Add Material Line', () => setFMaterials(p => [...p, { id: uid(), description: '', qty: '', unit: 'EA', unitCost: '' }]))}
              </div>

              {/* Equipment grid */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Wrench size={15} weight="duotone" color={TM_ACCENT} />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: TEXT }}>Equipment</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(previewEquipment)}</span>
                </div>
                {gridHead('minmax(150px,1.8fr) 80px 95px 90px 28px', ['Description', 'Hours', 'Rate', 'Line Total', ''])}
                {fEquipment.map(eq => (
                  <div key={eq.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1.8fr) 80px 95px 90px 28px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input value={eq.description} onChange={e => setEquipment(eq.id, 'description', e.target.value)} placeholder="e.g. Mini excavator" style={INP} />
                    <input value={eq.hours} onChange={e => setEquipment(eq.id, 'hours', e.target.value)} placeholder="0" inputMode="decimal" style={{ ...INP, textAlign: 'right' }} />
                    <input value={eq.rate} onChange={e => setEquipment(eq.id, 'rate', e.target.value)} placeholder="$/hr" inputMode="decimal" style={{ ...INP, textAlign: 'right' }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: GOLD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtUSD(num(eq.hours) * num(eq.rate))}
                    </span>
                    {removeBtn(() => setFEquipment(p => p.length > 1 ? p.filter(x => x.id !== eq.id) : p), fEquipment.length <= 1)}
                  </div>
                ))}
                {addLineBtn('Add Equipment Line', () => setFEquipment(p => [...p, { id: uid(), description: '', hours: '', rate: '' }]))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={LBL}>Markup %<AutoChip label="15% Standard" /></label>
                  <input value={fMarkup} onChange={e => setFMarkup(e.target.value)} inputMode="decimal" style={INP} />
                  <div style={HINT}>Applied to the full subtotal. Adds {fmtUSD(previewMarkupAmt)}.</div>
                </div>
                <div>
                  <label style={LBL}>Tax %</label>
                  <input value={fTax} onChange={e => setFTax(e.target.value)} inputMode="decimal" style={INP} />
                  <div style={HINT}>Applied after markup. Adds {fmtUSD(previewTaxAmt)}.</div>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={LBL}>Notes</label>
                  <textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} placeholder="Conditions, directives, who authorized the work…" style={{ ...INP, resize: 'vertical' as const }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                <SignaturePad label="Contractor Signature" value={contractorSig} onChange={setContractorSig} />
                <SignaturePad label="Owner / GC Signature" value={ownerSig} onChange={setOwnerSig} />
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => createTicket('submitted')} disabled={saving || !fDesc.trim()}
                  style={{ ...goldButtonStyle, cursor: saving ? 'wait' : 'pointer', opacity: (saving || !fDesc.trim()) ? 0.6 : 1 }} className="pmBtn">
                  <PaperPlaneTilt size={15} weight="bold" />{saving ? 'Saving…' : 'Create & Submit'}
                </button>
                <button onClick={() => createTicket('draft')} disabled={saving || !fDesc.trim()}
                  style={{ ...goldOutlineButtonStyle, cursor: saving ? 'wait' : 'pointer', opacity: (saving || !fDesc.trim()) ? 0.6 : 1 }} className="pmBtn">
                  Save as Draft
                </button>
                <button onClick={closeComposer} style={ghostButtonStyle} className="pmBtn">Cancel</button>
              </div>
            </SectionCard>

            {/* Context rail — live ticket math + what happens after submit */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SectionCard flat title="Ticket Math" subtitle="Live — matches the saved total to the cent." icon={<CurrencyCircleDollar size={17} weight="duotone" color={GOLD} />}>
                <InsightRow label="Labor (OT at 1.5x)" value={fmtUSD(previewLabor)} />
                <InsightRow label="Materials" value={fmtUSD(previewMaterials)} />
                <InsightRow label="Equipment" value={fmtUSD(previewEquipment)} />
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
                <InsightRow label="Subtotal" value={fmtUSD(previewSub)} />
                <InsightRow label={`Markup (${num(fMarkup)}%)`} value={'+' + fmtUSD(previewMarkupAmt)} accent={num(fMarkup) > 0 ? GOLD_HI : undefined} />
                <InsightRow label={`Tax (${num(fTax)}%)`} value={'+' + fmtUSD(previewTaxAmt)} accent={num(fTax) > 0 ? GOLD_HI : undefined} />
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
                <InsightRow label="Ticket Total" value={fmtUSD(previewTotal)} accent={GOLD} strong />
              </SectionCard>
              <SectionCard flat title="Signatures" icon={<Signature size={17} weight="duotone" color={GOLD} />}>
                <InsightRow label="Contractor" value={contractorSig ? 'Captured' : 'Not Signed'} accent={contractorSig ? GREEN : undefined} />
                <InsightRow label="Owner / GC" value={ownerSig ? 'Captured' : 'Not Signed'} accent={ownerSig ? GREEN : undefined} />
                <div style={HINT}>A signed ticket is the strongest backup when the extra hits the pay app. Both pads are optional on drafts.</div>
              </SectionCard>
              <SectionCard flat title="After You Submit" icon={<CheckCircle size={17} weight="duotone" color={GOLD} />}>
                <FlowSteps title="" steps={[
                  { title: 'Ticket Numbered + Logged', desc: 'Auto-numbered and queued for approval with the total locked server-side.' },
                  { title: 'Approve or Reject Inline', desc: 'The approver is stamped on the ticket with a timestamp.' },
                  { title: 'Bill It or Escalate It', desc: 'Mark billed for invoicing, or escalate into a change event with the ticket attached.' },
                ]} />
              </SectionCard>
            </div>
          </div>
        )}

        {/* Toolbar: search + export (current filter) */}
        {!loading && tickets.length > 0 && (
          <>
            <ListToolbar
              module="tm-tickets"
              search={search}
              onSearch={setSearch}
              searchPlaceholder="Search tickets, descriptions, approvers…"
              count={{ shown: filtered.length, total: tickets.length }}
              extra={<div style={{ display: 'flex', gap: 8 }}>
                {exportBtn('csv', <FileCsv size={14} weight="regular" />)}
                {exportBtn('xlsx', <FileXls size={14} weight="regular" />)}
                {exportBtn('pdf', <FilePdf size={14} weight="regular" />)}
              </div>}
              style={{ marginBottom: 12 }}
            />

            {/* Status chips with live counts */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {(['all', ...STATUS_ORDER] as string[]).map(s => {
                const active = statusFilter === s;
                const count = s === 'all' ? tickets.length : (statusCounts[s] || 0);
                const meta = s === 'all' ? null : STATUS_META[s];
                return (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 999,
                      background: active ? 'linear-gradient(180deg, var(--brand-primary-18), var(--brand-primary-08))' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${active ? 'color-mix(in srgb, var(--brand-primary) 50%, transparent)' : 'rgba(255,255,255,0.1)'}`,
                      color: active ? GOLD_HI : DIM, fontSize: 12, fontWeight: active ? 800 : 600, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                    {meta && <span style={{ width: 7, height: 7, borderRadius: 999, background: meta.color, display: 'inline-block' }} />}
                    {s === 'all' ? 'All' : meta!.label}
                    <span style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: active ? 'var(--brand-primary-18)' : 'rgba(255,255,255,0.08)', color: active ? GOLD_HI : 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Loading — skeleton shaped like the table it becomes */}
        {loading && (
          <SectionCard flat flush>
            <div style={{ padding: 20 }}>
              <Skeleton height={16} width="40%" style={{ marginBottom: 18 }} />
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 110px 1fr 110px 110px 110px 120px 110px', gap: 14, marginBottom: 16, alignItems: 'center' }}>
                  <Skeleton height={13} /><Skeleton height={13} /><Skeleton height={13} width="80%" /><Skeleton height={13} /><Skeleton height={13} /><Skeleton height={13} /><Skeleton height={13} /><Skeleton height={20} borderRadius={999} />
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Empty — the composer above IS the zero state; the strip teaches the flow */}
        {!loading && tickets.length === 0 && (
          <SectionCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>
                <Receipt size={16} weight="duotone" color={GOLD} style={{ marginRight: 7, verticalAlign: 'text-bottom' }} />
                No T&M tickets yet
                <span style={{ fontWeight: 400, color: DIM }}>{showForm ? ' — the composer above is ready; describe the extra work and add lines.' : ' — capture out-of-scope work before it becomes a dispute.'}</span>
              </div>
              {!showForm && (
                <button onClick={() => setShowForm(true)} style={goldButtonStyle} className="pmBtn">
                  <Plus size={15} weight="bold" /> New T&M Ticket
                </button>
              )}
            </div>
            <FlowStrip steps={[
              { title: 'Capture the Extra', desc: 'Labor, materials, equipment' },
              { title: 'Get It Signed', desc: 'Contractor + owner pads' },
              { title: 'Approve', desc: 'Stamped with who and when' },
              { title: 'Bill or Escalate', desc: 'Invoice it or make it a change event' },
            ]} />
          </SectionCard>
        )}

        {/* Ticket table */}
        {!loading && tickets.length > 0 && (
          <SectionCard title="Tickets" icon={<Receipt size={17} weight="duotone" color={TM_ACCENT} />} flush>
            {filtered.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: DIM, fontSize: 13 }}>
                No tickets match the current search or filter.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <SortableTh label="Ticket" sortKey="ticket" sort={sort} onSort={cycleSort} />
                      <SortableTh label="Work Date" sortKey="date" sort={sort} onSort={cycleSort} />
                      <SortableTh label="Description" sortKey="desc" sort={sort} onSort={cycleSort} />
                      <SortableTh label="Labor" sortKey="labor" sort={sort} onSort={cycleSort} align="right" />
                      <SortableTh label="Materials" sortKey="materials" sort={sort} onSort={cycleSort} align="right" />
                      <SortableTh label="Equipment" sortKey="equipment" sort={sort} onSort={cycleSort} align="right" />
                      <SortableTh label="Total" sortKey="total" sort={sort} onSort={cycleSort} align="right" />
                      <SortableTh label="Status" sortKey="status" sort={sort} onSort={cycleSort} />
                      <SortableTh label="Actions" sort={sort} onSort={cycleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTickets.map(t => (
                      <tr key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        style={{ borderBottom: `1px solid rgba(255,255,255,0.07)`, cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ ...TD, color: GOLD, fontWeight: 800, whiteSpace: 'nowrap' }}>{ticketLabel(t)}</td>
                        <td style={{ ...TD, color: DIM, whiteSpace: 'nowrap' }}>{fmtDate(t.work_date || t.created_at)}</td>
                        <td style={{ ...TD, maxWidth: 300 }}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 290 }}>{t.description || '—'}</div>
                          {(t.contractor_signature || t.owner_signature) && (
                            <div style={{ fontSize: 11, color: DIM, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Signature size={11} weight="regular" color={GREEN} />
                              {t.contractor_signature && t.owner_signature ? 'Both signatures' : t.contractor_signature ? 'Contractor signed' : 'Owner signed'}
                            </div>
                          )}
                        </td>
                        <td style={{ ...TD, textAlign: 'right', color: DIM, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtUSD(t.labor_total)}</td>
                        <td style={{ ...TD, textAlign: 'right', color: DIM, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtUSD(t.materials_total)}</td>
                        <td style={{ ...TD, textAlign: 'right', color: DIM, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtUSD(t.equipment_total)}</td>
                        <td style={{ ...TD, textAlign: 'right', color: GOLD, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtUSD(t.total)}</td>
                        <td style={TD}>
                          <StatusPill status={t.status} />
                          {displayStatus(t.status) !== 'draft' && t.approved_by && (
                            <div style={{ fontSize: 10.5, color: DIM, marginTop: 4, whiteSpace: 'nowrap' }}>
                              by {t.approved_by}{t.approved_at ? ` · ${fmtDate(t.approved_at)}` : ''}
                            </div>
                          )}
                        </td>
                        <td style={TD}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            {statusActionButtons(t, true)}
                            <span style={{ color: 'rgba(255,255,255,0.35)', display: 'inline-flex' }}><CaretRight size={14} weight="regular" /></span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}
      </PremiumSurface>

      {/* ── Detail drawer ─────────────────────────────────────────────────── */}
      {selected && (
        <>
          <div onClick={() => setSelectedId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,12,0.72)', zIndex: 300, backdropFilter: 'blur(2px)' }} />
          <aside style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 640, maxWidth: '96vw',
            background: 'var(--bg-surface)', borderLeft: `1px solid ${BORDER}`, zIndex: 301,
            overflowY: 'auto', boxShadow: '-24px 0 60px rgba(8,8,12,0.6)',
          }}>
            <div style={{ position: 'sticky', top: 0, background: 'var(--bg-surface)', borderBottom: `1px solid ${BORDER}`, padding: '16px 22px', zIndex: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: GOLD, background: 'var(--brand-primary-12)', padding: '3px 10px', borderRadius: 6 }}>{ticketLabel(selected)}</span>
              <StatusPill status={selected.status} />
              <span style={{ fontSize: 12, color: DIM }}>{fmtDate(selected.work_date || selected.created_at)}</span>
              <button onClick={() => setSelectedId(null)} aria-label="Close ticket detail" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: DIM, cursor: 'pointer', display: 'inline-flex', padding: 4 }}>
                <X size={20} weight="regular" />
              </button>
            </div>

            <div style={{ padding: '20px 22px 40px' }}>
              <h2 style={{ margin: '0 0 4px', fontSize: 19, fontWeight: 800, color: TEXT, lineHeight: 1.3 }}>{selected.description || 'T&M Ticket'}</h2>
              <div style={{ fontSize: 26, fontWeight: 800, color: GOLD, marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(selected.total)}</div>
              {selStatus !== 'draft' && selected.approved_by && (
                <div style={{ fontSize: 12, color: DIM, marginBottom: 4 }}>
                  {selStatus === 'rejected' ? 'Rejected' : 'Approved'} by {selected.approved_by}{selected.approved_at ? ` on ${fmtDate(selected.approved_at)}` : ''}
                </div>
              )}

              {/* Status actions with server stamping */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 20px' }}>
                {statusActionButtons(selected, false)}
                <button onClick={() => escalateTicket(selected)} disabled={escalatingId === selected.id}
                  style={{ ...goldOutlineButtonStyle, padding: '10px 16px', fontSize: 13, cursor: escalatingId === selected.id ? 'wait' : 'pointer', opacity: escalatingId === selected.id ? 0.6 : 1 }} className="pmBtn">
                  <Lightning size={14} weight="bold" />{escalatingId === selected.id ? 'Escalating…' : 'Escalate to Change Event'}
                </button>
                <button onClick={() => exportTickets('pdf', [selected.id])} disabled={!!exporting}
                  style={{ ...ghostButtonStyle, padding: '10px 14px', fontSize: 13, cursor: exporting ? 'wait' : 'pointer', opacity: exporting ? 0.6 : 1 }} className="pmBtn">
                  <FilePdf size={14} weight="regular" />PDF
                </button>
              </div>

              {laborRows.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                    <HardHat size={14} weight="duotone" color={TM_ACCENT} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: TEXT }}>Labor</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(selected.labor_total)}</span>
                  </div>
                  <LineTable headers={['Worker', 'Reg', 'OT', 'Rate', 'Total']} rows={laborRows} />
                </div>
              )}
              {materialRows.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                    <Package size={14} weight="duotone" color={TM_ACCENT} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: TEXT }}>Materials</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(selected.materials_total)}</span>
                  </div>
                  <LineTable headers={['Description', 'Qty', 'Unit', 'Cost', 'Total']} rows={materialRows} />
                </div>
              )}
              {equipmentRows.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                    <Wrench size={14} weight="duotone" color={TM_ACCENT} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: TEXT }}>Equipment</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(selected.equipment_total)}</span>
                  </div>
                  <LineTable headers={['Description', 'Hours', 'Rate', 'Total']} rows={equipmentRows} />
                </div>
              )}

              <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', marginBottom: 18 }}>
                <TotalsLadder sub={selSub} markupPct={num(selected.markup_pct)} taxPct={num(selected.tax_pct)} total={num(selected.total)} />
              </div>

              {selected.notes && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ ...LBL, marginBottom: 8 }}>Notes</div>
                  <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selected.notes}</div>
                </div>
              )}

              {(selected.contractor_signature || selected.owner_signature) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {selected.contractor_signature && (
                    <div>
                      <div style={{ ...LBL, marginBottom: 6 }}>Contractor Signature</div>
                      {/* Signatures are canvas dataURLs stored as TEXT — render directly. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selected.contractor_signature} alt="Contractor signature" style={{ width: '100%', background: 'var(--bg-surface-2)', border: `1px solid ${BORDER}`, borderRadius: 10 }} />
                    </div>
                  )}
                  {selected.owner_signature && (
                    <div>
                      <div style={{ ...LBL, marginBottom: 6 }}>Owner Signature</div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selected.owner_signature} alt="Owner signature" style={{ width: '100%', background: 'var(--bg-surface-2)', border: `1px solid ${BORDER}`, borderRadius: 10 }} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      <UnsavedGuardModal guard={guard} />
    </>
  );
}
