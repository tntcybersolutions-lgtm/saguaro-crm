'use client';
/**
 * Bid Packages — solicit, level and award sub bids, on the kit.
 *
 * Anatomy: title + one primary action (Create Bid Package) → StatRow (each
 * status tile filters the register) → Toolbar (search + status) → workspace
 * split: the package register (kit DataTable with leveling columns) on the
 * left, the procurement snapshot rail on the right. The four-step wizard opens
 * in a FormModal with its own footer.
 *
 * Every read / write is the one this screen already used:
 *   list      GET  /api/bid-packages/list?projectId=   (leveling rides on the payload)
 *   create    POST /api/bid-packages/create → POST /api/bid-packages/[id]/invite-subs
 *   suggest   GET  /api/bid-packages/suggest-subs?trade=&projectId=
 *   context   useProjectContext (budget, roster, award history)
 *
 * Awards stay W-9 / COI gated server-side; nothing here auto-awards.
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { retryText, apiErrorFrom } from '@/lib/api-refusal';
import { IfAllowed } from '@/lib/hooks/usePermissions';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import { useParams, useRouter } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { toCents, toDollars, sumCents, extend } from '@/lib/calc';
import { X, Plus, ArrowLeft, ArrowRight, Package, FileText, Trophy, Tray, ArrowSquareOut, Scales, PaperPlaneTilt, HourglassMedium, EnvelopeOpen } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, DataTable, EmptyState, Toolbar,
  FormModal, Field, Input, Textarea, Select, FormGrid, DetailList,
  type Column, type Action, type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { SUB_TRADES, SUB_TRADES_BY_DIVISION } from '@/lib/construction-intelligence';
import NudgeRing from '@/components/intelligence/NudgeRing';
import { ANCHOR_BID_DECISION } from '@/lib/suggestions';
import { openPdf } from '@/components/PdfViewer';
import { buildJacketPdf } from '@/lib/jacket-pdf-client';
import { layout } from '@/lib/design-tokens';
import { isBiddingStatus } from '@/lib/bid-deadline';
import { JacketGatePrompt, JacketSendResult, type SendPayload } from '@/components/JacketSendPanels';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt = (n: number) => money.format(Number(n) || 0);

// ─── Types ───────────────────────────────────────────────────────────────────

interface BidPackageRow {
  id: string;
  trade: string;
  name: string;
  bid_due_date: string | null;
  /* 'sent' = issued (lib/bid-issue): open for bids, same as 'open'. */
  status: 'draft' | 'open' | 'sent' | 'closed' | 'awarded';
  jacket_pdf_url?: string | null;
  bid_package_invites?: { count: number }[];
  bid_submissions?: { count: number }[];
}
type Leveling = { invited: number; responded: number; low: number | null; lowWho: string | null; spread: number | null };

/** One status → one badge. Draft neutral, Open blue (with the subs), Closed amber (waiting on you), Awarded green.
 *  'sent' is what issuing the jacket writes — it is open for bids. It fell to the
 *  default and an issued package read "Draft". */
function statusBadge(s: string): { label: string; tone: BadgeTone } {
  if (s === 'open' || s === 'sent') return { label: 'Open', tone: 'lead' };
  if (s === 'closed') return { label: 'Award pending', tone: 'lead' };
  if (s === 'awarded') return { label: 'Awarded', tone: 'ongoing' };
  return { label: 'Draft', tone: 'neutral' };
}
const STATUS_RANK: Record<string, number> = { closed: 0, open: 1, sent: 1, draft: 2, awarded: 3 };
type StatusFilter = 'all' | 'open' | 'closed' | 'awarded' | 'draft';
const matchesStatus = (s: string, f: StatusFilter) =>
  f === 'all' ? true : f === 'open' ? (s === 'open' || s === 'sent') : f === 'draft' ? !['open', 'sent', 'closed', 'awarded'].includes(s) : s === f;

// ─── Wizard Types ─────────────────────────────────────────────────────────────

interface LineItem {
  id: string;
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
}

interface SuggestedSub {
  id: string;
  name: string;
  email: string;
  trade: string;
  recommended: boolean;
  checked: boolean;
}

interface WizardState {
  // Step 1
  trade: string;
  scope: string;
  /** Instructions to bidders — the jacket's first page. */
  instructions: string;
  dueDate: string;
  requiresBond: boolean;
  // Step 2
  lineItems: LineItem[];
  // Step 3
  suggestedSubs: SuggestedSub[];
  addEmail: string;
  addName: string;
  extraInvites: { name: string; email: string }[];
  // Step 4
  submitting: boolean;
  error: string;
}

function defaultDue(): string {
  const d = new Date(Date.now() + 14 * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function newLineItem(): LineItem {
  return { id: String(Date.now() + Math.random()), description: '', qty: '1', unit: 'LS', unitPrice: '0' };
}

const DATE_INPUT_STYLE: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', fontSize: 14,
  background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
};

const CSS = `
.bpWs > .k-page { max-width: none; }
.bpCq { container: bpws / inline-size; min-width: 0; }
.bpSplit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; min-width: 0; }
.bpSplit > * { min-width: 0; }
@container bpws (min-width: 1080px) { .bpSplit[data-rail="true"] { grid-template-columns: minmax(340px, 1fr) clamp(${layout.detailRailMin}px, 30%, ${layout.detailRailMax}px); } }
.bpRail { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 16px; }
.bpList .k-table th:first-child, .bpList .k-table td:first-child { position: sticky; left: 0; z-index: 1; background: var(--bg-solid); }
.bpList .k-table th:first-child { background: var(--bg-solid-2); z-index: 3; }
.bpList .k-table tbody tr:hover td:first-child { background: linear-gradient(rgba(255,255,255,0.03), rgba(255,255,255,0.03)), var(--bg-solid); }
.bpPkg { display: flex; flex-direction: column; gap: 2px; max-width: 300px; min-width: 0; }
.bpPkg > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bpPkg > span:first-child { font-size: var(--fs-xs); font-weight: 800; color: var(--text-secondary); }
.bpPkg > span + span { color: var(--text-primary); font-weight: 700; }
.bpMuted { color: var(--text-tertiary); }
.bpMoney { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--text-primary); font-weight: 600; }
.bpSub { font-size: var(--fs-xs); color: var(--text-tertiary); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; }
.bpDue[data-tone="late"] { color: var(--status-overdue); font-weight: 700; }
.bpDue[data-tone="soon"] { color: var(--status-under-contract); font-weight: 700; }
.bpVs[data-tone="under"] { color: var(--status-ongoing); font-weight: 700; }
.bpVs[data-tone="over"] { color: var(--status-overdue); font-weight: 700; }
.bpJacket { all: unset; color: var(--link); font-weight: 700; font-size: var(--fs-xs); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.bpJacket:focus-visible { outline: 2px solid var(--focus-ring); }
.bpSteps { display: flex; gap: 6px; margin: -4px 0 16px; }
.bpStep { flex: 1; text-align: center; font-size: var(--fs-xs); color: var(--text-tertiary); }
.bpStep i { display: block; height: 3px; border-radius: 2px; background: var(--border-default); margin-bottom: 4px; }
.bpStep[data-done="true"] i { background: var(--success); }
.bpStep[data-on="true"] { color: var(--brand-primary); font-weight: 700; }
.bpStack { display: flex; flex-direction: column; gap: 14px; }
.bpHint { font-size: var(--fs-xs); color: var(--text-tertiary); line-height: 1.45; }
.bpHint b { color: var(--text-primary); }
.bpCheck { display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: var(--fs-sm); color: var(--text-primary); min-height: 32px; }
.bpCheck input { width: 16px; height: 16px; accent-color: var(--brand-primary); }
.bpLines { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.bpLines th { text-align: left; font-size: var(--fs-xs); font-weight: 700; color: var(--text-tertiary); padding: 6px 6px; border-bottom: 1px solid var(--border-subtle); }
.bpLines td { padding: 6px 6px; vertical-align: middle; border-bottom: 1px solid var(--border-subtle); }
.bpLines .k-input { min-height: 36px; }
.bpLinesFoot { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; gap: 10px; flex-wrap: wrap; }
.bpTotal { font-size: var(--fs-md); color: var(--text-primary); font-weight: 800; font-variant-numeric: tabular-nums; }
.bpSubRow { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: var(--bg-surface-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); cursor: pointer; min-height: 44px; }
.bpSubRow[data-on="true"] { border-color: var(--brand-primary-35); background: var(--brand-primary-08); }
.bpSubRow input { width: 16px; height: 16px; accent-color: var(--brand-primary); flex-shrink: 0; }
.bpSubName { font-size: var(--fs-sm); font-weight: 700; color: var(--text-primary); }
.bpSubMail { font-size: var(--fs-xs); color: var(--text-tertiary); }
.bpAddRow { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
.bpAddRow > :first-child { flex: 1 1 140px; }
.bpAddRow > :nth-child(2) { flex: 2 1 200px; }
.bpExtra { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--bg-surface-2); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); margin-top: 6px; font-size: var(--fs-sm); color: var(--text-primary); }
.bpExtra > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bpSection { font-size: var(--fs-xs); font-weight: 700; color: var(--text-tertiary); margin: 16px 0 10px; padding-top: 16px; border-top: 1px solid var(--border-subtle); }
.bpScope { font-size: var(--fs-sm); color: var(--text-primary); line-height: 1.6; white-space: pre-wrap; }
.bpErr { font-size: var(--fs-sm); color: var(--status-overdue); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid rgba(248,113,113,.35); background: rgba(248,113,113,.08); }
.bpFoot { display: flex; justify-content: space-between; align-items: center; gap: 10px; width: 100%; }
.bpSkel { height: 56px; border-bottom: 1px solid var(--border-subtle); background: rgba(255,255,255,0.03); }
@media (max-width: 640px) {
  .bpWs .k-btn, .bpWs .k-stat, .bpWs select.k-select, .bpWs .k-input { min-height: 44px; }
  .bpWs .k-table td { height: 48px; }
  .bpPkg { max-width: 200px; }
}
`;

// ─── Wizard ─────────────────────────────────────────────────────────────────

function WizardModal({ projectId, ctx, open, onClose, onCreated }: { projectId: string; ctx?: any; open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [step, setStep] = useState(1);
  const [subsLoading, setSubsLoading] = useState(false);
  const [w, setW] = useState<WizardState>({
    trade: '', scope: '', instructions: '', dueDate: defaultDue(), requiresBond: false,
    lineItems: [newLineItem()],
    suggestedSubs: [], addEmail: '', addName: '', extraInvites: [],
    submitting: false, error: '',
  });

  function setField(k: keyof WizardState, v: any) {
    setW(prev => ({ ...prev, [k]: v }));
  }

  function updateLineItem(id: string, field: keyof LineItem, val: string) {
    setW(prev => ({ ...prev, lineItems: prev.lineItems.map(li => li.id === id ? { ...li, [field]: val } : li) }));
  }

  function addLineItem() {
    setW(prev => ({ ...prev, lineItems: [...prev.lineItems, newLineItem()] }));
  }

  function removeLineItem(id: string) {
    setW(prev => ({ ...prev, lineItems: prev.lineItems.filter(li => li.id !== id) }));
  }

  async function loadSuggestedSubs() {
    setSubsLoading(true);
    try {
      const r = await fetch(`/api/bid-packages/suggest-subs?trade=${encodeURIComponent(w.trade)}&projectId=${projectId}`);
      const d = await r.json() as any;
      const subs: SuggestedSub[] = (d.subs || d.suggestions || []).map((s: any, i: number) => ({
        id: s.id || String(i),
        name: s.name || s.company_name || s,
        email: s.email || '',
        trade: s.trade || w.trade,
        recommended: s.recommended ?? i < 3,
        checked: s.recommended ?? i < 3,
      }));
      setField('suggestedSubs', subs);
    } catch {
      setField('suggestedSubs', []);
    } finally {
      setSubsLoading(false);
    }
  }

  async function goStep3() {
    setStep(3);
    await loadSuggestedSubs();
  }

  function addExtra() {
    const email = w.addEmail.trim();
    if (!email) return;
    if (!EMAIL_RE.test(email)) { setField('error', 'Enter a valid email address to invite.'); return; }
    setW(prev => ({
      ...prev,
      extraInvites: [...prev.extraInvites, { name: prev.addName.trim(), email }],
      addName: '', addEmail: '', error: '',
    }));
  }

  /* Next / Create used to skip over what the user left half-done: Step 1's
     Next sat disabled without a trade, and an email typed in "Add by Email"
     but never Added was silently dropped on the way to Review. Each step now
     says what it needs, beside the button, and keeps the typed invite. */
  function next() {
    if (step === 1) {
      if (!w.trade) {
        setField('error', 'Pick the trade this package goes out to.');
        window.setTimeout(() => document.getElementById('bp-trade')?.focus(), 0);
        return;
      }
      setField('error', '');
      setStep(2);
    } else if (step === 2) {
      setField('error', '');
      void goStep3();
    } else if (step === 3) {
      const email = w.addEmail.trim();
      if (email) {
        if (!EMAIL_RE.test(email)) {
          setField('error', 'That email doesn’t look right — fix it or clear the field.');
          window.setTimeout(() => document.getElementById('bp-add-email')?.focus(), 0);
          return;
        }
        addExtra();
      }
      setField('error', '');
      setStep(4);
    } else {
      void handleSubmit();
    }
  }

  /* The send step. invite-subs issues the jacket as it sends (lib/bid-issue),
     so it can answer 409 with the sections that are empty — then nothing has
     gone out and the GC decides: send anyway, or save the package and fill
     the jacket first. Whatever is sent, the wizard shows exactly who was
     emailed and who was not before it closes. The package itself is created
     once: a retry only re-sends. */
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [sendGate, setSendGate] = useState<{ missing: string[] } | null>(null);
  const [sendOutcome, setSendOutcome] = useState<SendPayload | null>(null);

  const inviteList = () => [
    ...w.suggestedSubs.filter(s => s.checked).map(s => ({ name: s.name, email: s.email, subId: /^[0-9a-f-]{36}$/i.test(s.id) ? s.id : undefined })),
    ...w.extraInvites,
  ];

  async function sendToSubs(pkgId: string, force: boolean) {
    setField('submitting', true);
    setField('error', '');
    try {
      const ir = await fetch(`/api/bid-packages/${pkgId}/invite-subs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subs: inviteList(), force }),
      });
      const d = await ir.json().catch(() => ({})) as any;
      if (ir.status === 409 && Array.isArray(d.missing) && d.missing.length) {
        setSendGate({ missing: d.missing });
        return;
      }
      if (!ir.ok) throw new Error(d.error || 'The invitations were not sent.');
      setSendGate(null);
      setSendOutcome(d as SendPayload);
    } catch (err: any) {
      console.error('invite-subs failed', err);
      setField('error', `The package is saved, but the invitations did not go out: ${humanError(err, 'please try again.')}`);
    } finally {
      setField('submitting', false);
    }
  }

  async function handleSubmit() {
    if (createdId) { await sendToSubs(createdId, false); return; }
    setField('submitting', true);
    setField('error', '');
    try {
      // A row left blank (the wizard starts with one) is not a line item.
      const lineItems = w.lineItems
        .filter(li => li.description.trim() || Number(li.unitPrice) > 0)
        .map(li => ({
          description: li.description.trim() || 'Line item',
          quantity: Number(li.qty) || 0,
          unit: li.unit,
          unitPrice: Number(li.unitPrice) || 0,
          totalAmount: toDollars(extend(Number(li.qty) || 0, toCents(li.unitPrice))),
        }));
      const cr = await fetch('/api/bid-packages/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          trade: w.trade,
          name: `${w.trade} Package`,
          scopeSummary: w.scope,
          bidInstructions: w.instructions,
          dueDate: w.dueDate,
          requiresBond: w.requiresBond,
          lineItems,
        }),
      });
      const cd = await cr.json() as any;
      if (!cr.ok) throw new Error(cd.error || 'Failed to create package');
      const pkgId = cd.bidPackage?.id || cd.bidPackageId || cd.id;
      if (!pkgId) throw new Error('The package was not created.');
      setCreatedId(pkgId);

      /* Invite checked subs + extras — which issues the jacket. The wizard
         stays open to show the gate or who was emailed. */
      if (inviteList().length > 0) {
        await sendToSubs(pkgId, false);
        return;
      }

      onCreated(pkgId);
    } catch (err: any) {
      console.error(err); setField('error', humanError(err, 'Submission failed. Please try again.'));
      setField('submitting', false);
    }
  }

  const STEPS = ['Trade & Scope', 'Line Items', 'Invite Subs', 'Review'];
  const lineTotal = toDollars(sumCents(w.lineItems.map(li => extend(Number(li.qty), toCents(li.unitPrice)))));
  const inviteCount = w.suggestedSubs.filter(s => s.checked).length + w.extraInvites.length;

  const tradeHint = (() => {
    if (!w.trade) return 'Pick the trade this package goes out to.';
    const tl = w.trade.toLowerCase();
    const twins = (ctx?.bidPackages || []).filter((b: any) => String(b.trade || '').toLowerCase() === tl);
    const est = twins.reduce((s: number, b: any) => s + (Number(b.budgetEstimate) || 0), 0);
    const roster = (ctx?.subs || []).filter((sub: any) => {
      const st = String(sub.trade || '').toLowerCase();
      return st.length > 0 && (st.includes(tl) || tl.includes(st));
    }).length;
    const live = twins.some((b: any) => ['open', 'sent', 'bidding', 'closed', 'awarded'].includes(String(b.status || '').toLowerCase()));
    return (
      <>
        {est > 0 && <>Budget carries <b>{fmt(est)}</b> for this trade — incoming bids will level against it. </>}
        {roster > 0
          ? <><b style={{ color: 'var(--status-ongoing)' }}>{roster} roster sub{roster === 1 ? '' : 's'}</b> match this trade and will be suggested in Step 3.</>
          : <>No roster subs match this trade yet — add invites by email in Step 3.</>}
        {live && <> A {w.trade} package already exists on this project — this one will run alongside it.</>}
      </>
    );
  })();

  /* After the package exists, the footer is about the send, not the steps. */
  const sendFooter = createdId && (sendGate || sendOutcome || w.error) ? (
    <div className="bpFoot" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {!sendOutcome && w.error && (
        <Button variant="ghost" disabled={w.submitting} onClick={() => void sendToSubs(createdId, false)}>Try Sending Again</Button>
      )}
      <Button variant={sendOutcome ? 'primary' : 'ghost'} disabled={w.submitting} onClick={() => onCreated(createdId)}>
        {sendOutcome ? 'Open Package' : 'Save Without Sending'}
      </Button>
    </div>
  ) : null;

  const footer = sendFooter ?? (
    <div className="bpFoot" style={{ flexWrap: 'wrap' }}>
      {w.error && step < 4 && <div className="bpErr" role="alert" style={{ width: '100%' }}>{w.error}</div>}
      <Button variant="ghost" icon={step > 1 ? <ArrowLeft size={14} weight="bold" /> : undefined} onClick={() => step > 1 ? setStep(s => s - 1) : onClose()} disabled={w.submitting}>{step === 1 ? 'Cancel' : 'Back'}</Button>
      <Button
        variant="primary"
        icon={step < 4 ? <ArrowRight size={14} weight="bold" /> : undefined}
        disabled={w.submitting}
        onClick={next}
      >
        {step < 4 ? 'Next' : w.submitting ? 'Creating…' : 'Create Bid Package'}
      </Button>
    </div>
  );

  return (
    <FormModal open={open} onClose={onClose} title="Create Bid Package" subtitle={`Step ${step} of 4 — ${STEPS[step - 1]}`} busy={w.submitting} footer={footer}>
      <div className="bpSteps" aria-hidden>
        {STEPS.map((label, i) => <div key={label} className="bpStep" data-done={i + 1 <= step ? 'true' : 'false'} data-on={i + 1 === step ? 'true' : 'false'}><i />{label}</div>)}
      </div>

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <div className="bpStack">
          <Field label="Trade" required hint={tradeHint}>
            {/* Native select — the trade list is grouped by CSI division, which the kit Select does not render. */}
            <select id="bp-trade" className="k-select" aria-label="Trade" aria-required="true" aria-invalid={step === 1 && !!w.error && !w.trade ? true : undefined} value={w.trade} onChange={e => { const v = e.target.value; setW(prev => ({ ...prev, trade: v, error: '' })); }}>
              <option value="">— Select Trade —</option>
              {w.trade && !SUB_TRADES.includes(w.trade) && <option value={w.trade}>{w.trade}</option>}
              {SUB_TRADES_BY_DIVISION.map(g => (
                <optgroup key={g.division} label={g.division + ' — ' + g.name}>
                  {g.trades.map(t => <option key={t} value={t}>{t}</option>)}
                </optgroup>
              ))}
              <optgroup label="Other / Specialty">
                {SUB_TRADES.filter(t => !SUB_TRADES_BY_DIVISION.some(g => g.trades.includes(t))).map(t => <option key={t} value={t}>{t}</option>)}
              </optgroup>
            </select>
          </Field>
          <Field label="Scope Summary" hint="What the sub is pricing — subs see this on the portal.">
            <Textarea value={w.scope} onChange={e => setField('scope', e.target.value)} placeholder="Describe the work scope…" rows={4} />
          </Field>
          <Field label="Instructions to Bidders" hint="How to bid, what to include, where questions go — the first page of the jacket every sub opens.">
            <Textarea value={w.instructions} onChange={e => setField('instructions', e.target.value)} placeholder="Bid on the attached form. Price alternates separately. Send questions through the portal by…" rows={3} />
          </Field>
          <Field label="Bid Due Date" hint={w.dueDate === defaultDue() ? 'Defaulted two weeks out.' : undefined}>
            <SaguaroDatePicker value={w.dueDate} onChange={v => setField('dueDate', v)} style={DATE_INPUT_STYLE} />
          </Field>
          <label className="bpCheck">
            <input type="checkbox" checked={w.requiresBond} onChange={e => setField('requiresBond', e.target.checked)} />
            <span>Requires Performance &amp; Payment Bond</span>
          </label>
        </div>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <div>
          <div style={{ overflowX: 'auto' }}>
            <table className="bpLines k-table-skin">
              <thead><tr><th style={{ width: '45%' }}>Description</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th aria-label="Remove" /></tr></thead>
              <tbody>
                {w.lineItems.map(li => (
                  <tr key={li.id}>
                    <td><Input value={li.description} onChange={e => updateLineItem(li.id, 'description', e.target.value)} placeholder="Description" aria-label="Description" /></td>
                    <td><Input type="number" value={li.qty} onChange={e => updateLineItem(li.id, 'qty', e.target.value)} style={{ width: 72, textAlign: 'right' }} aria-label="Quantity" /></td>
                    <td><Input value={li.unit} onChange={e => updateLineItem(li.id, 'unit', e.target.value)} placeholder="LS" style={{ width: 64 }} aria-label="Unit" /></td>
                    <td><Input type="number" value={li.unitPrice} onChange={e => updateLineItem(li.id, 'unitPrice', e.target.value)} style={{ width: 100, textAlign: 'right' }} aria-label="Unit price" /></td>
                    <td><Button variant="ghost" size="sm" icon={<X size={14} />} aria-label="Remove line" onClick={() => removeLineItem(li.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bpLinesFoot">
            <Button size="sm" icon={<Plus size={12} weight="bold" />} onClick={addLineItem}>Add Row</Button>
            <div className="bpTotal">Total: {fmt(lineTotal)}</div>
          </div>
        </div>
      )}

      {/* ── STEP 3 ── */}
      {step === 3 && (
        <div>
          {w.suggestedSubs.length === 0 && (
            <div className="bpHint" style={{ padding: '16px 0', textAlign: 'center' }}>{subsLoading ? 'Matching your roster to this trade…' : 'No roster subs matched this trade — subs you add by email below get the same portal link and pricing form.'}</div>
          )}
          <div className="bpStack" style={{ gap: 8 }}>
            {w.suggestedSubs.map(sub => (
              <label key={sub.id} className="bpSubRow" data-on={sub.checked ? 'true' : 'false'}>
                <input type="checkbox" checked={sub.checked} onChange={e => setW(prev => ({ ...prev, suggestedSubs: prev.suggestedSubs.map(s => s.id === sub.id ? { ...s, checked: e.target.checked } : s) }))} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="bpSubName">{sub.name}</div>
                  {sub.email && <div className="bpSubMail">{sub.email}</div>}
                </div>
                {sub.recommended && <Badge tone="gold">Recommended</Badge>}
              </label>
            ))}
          </div>
          <div className="bpSection">Add by Email</div>
          <div className="bpAddRow">
            <Field label="Name"><Input value={w.addName} onChange={e => setField('addName', e.target.value)} placeholder="Name" /></Field>
            <Field label="Email"><Input id="bp-add-email" type="email" inputMode="email" value={w.addEmail} onChange={e => { const v = e.target.value; setW(prev => ({ ...prev, addEmail: v, error: '' })); }} placeholder="email@company.com" /></Field>
            <Button icon={<Plus size={14} weight="bold" />} onClick={addExtra} disabled={!w.addEmail}>Add</Button>
          </div>
          {w.extraInvites.map((ei, i) => (
            <div key={i} className="bpExtra">
              <span>{ei.name ? `${ei.name} — ` : ''}{ei.email}</span>
              <Button variant="ghost" size="sm" icon={<X size={13} />} aria-label={`Remove ${ei.email}`} onClick={() => setW(prev => ({ ...prev, extraInvites: prev.extraInvites.filter((_, j) => j !== i) }))} />
            </div>
          ))}
        </div>
      )}

      {/* ── STEP 4 ── */}
      {step === 4 && (
        <div className="bpStack">
          <DetailList items={[
            ['Trade', w.trade],
            ['Due', w.dueDate || 'TBD'],
            ['Bond Required', w.requiresBond ? 'Yes' : 'No'],
            ['Line Items', String(w.lineItems.length)],
            ['Total Value', <span key="t" className="bpTotal">{fmt(lineTotal)}</span>],
            ['Subs to Invite', String(inviteCount)],
          ]} />
          {w.scope && (
            <div>
              <div className="bpSection" style={{ marginTop: 4 }}>Scope</div>
              <div className="bpScope">{w.scope}</div>
            </div>
          )}
          {w.instructions.trim() && (
            <div>
              <div className="bpSection" style={{ marginTop: 4 }}>Instructions to Bidders</div>
              <div className="bpScope">{w.instructions}</div>
            </div>
          )}
          {!createdId && inviteCount > 0 && (
            <div className="bpHint">
              Creating sends the bid jacket to {inviteCount} sub{inviteCount === 1 ? '' : 's'} — once it has been checked for empty sections. Each gets their own bid link.
            </div>
          )}
          {sendGate && createdId && (
            <JacketGatePrompt
              missing={sendGate.missing}
              busy={w.submitting}
              onSendAnyway={() => void sendToSubs(createdId, true)}
              jacketHref={`/app/projects/${projectId}/bid-packages/${createdId}/jacket`}
            />
          )}
          {sendOutcome && <JacketSendResult result={sendOutcome} />}
          {w.error && <div className="bpErr" role="alert">{w.error}</div>}
        </div>
      )}
    </FormModal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BidPackagesPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params['projectId'] as string;

  const [packages, setPackages] = useState<BidPackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const listRef = useRef<HTMLDivElement>(null);

  // The screen walks in knowing the project: budget, roster, award history —
  // one /api/project-context snapshot (fetched once) powers the row + rail.
  const { ctx } = useProjectContext(projectId);
  // Per-package leveling detail (invited / responded / low bid / spread),
  // derived from the real invites + submissions tables. Number()-coerced.
  const [detail, setDetail] = useState<Record<string, Leveling>>({});

  useEffect(() => { loadPackages(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep link from /app/bids "New Bid Package" (and the overview): ?new=1 opens
  // the wizard. The param is dropped so a reload does not reopen it.
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get('new') !== '1') return;
      setWizardKey(k => k + 1);
      setShowWizard(true);
      router.replace(`/app/projects/${projectId}/bid-packages`);
    } catch { /* no window (prerender) — nothing to open */ }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPackages() {
    setLoading(true);
    setLoadError('');
    try {
      const r = await fetch(`/api/bid-packages/list?projectId=${projectId}`);
      if (!r.ok) throw await apiErrorFrom(r, 'load failed');
      const d = await r.json() as any;
      const rows: BidPackageRow[] = d.bidPackages || [];
      setPackages(rows);
      // Leveling aggregates ride on the list payload — one grouped query server-side.
      const next: Record<string, Leveling> = {};
      for (const row of rows as any[]) if (row.leveling) next[row.id] = row.leveling;
      setDetail(next);
    } catch {
      setPackages([]);
      setLoadError('Failed to load bid packages.');
    } finally {
      setLoading(false);
    }
  }

  const totalAwarded = packages.filter(p => p.status === 'awarded').length;
  const openCount = packages.filter(p => isBiddingStatus(p.status)).length;
  const closedCount = packages.filter(p => p.status === 'closed').length;

  const totalInvited = packages.reduce((s, p) => {
    const cnt = detail[p.id]?.invited ?? p.bid_package_invites?.[0]?.count ?? 0;
    return s + (Number(cnt) || 0);
  }, 0);

  const totalSubmissions = packages.reduce((s, p) => {
    const cnt = detail[p.id]?.responded ?? p.bid_submissions?.[0]?.count ?? 0;
    return s + (Number(cnt) || 0);
  }, 0);

  // Award + budget intelligence from project-context (Number-coerced — several
  // DB money columns round-trip as strings).
  const ctxPkgById: Record<string, any> = {};
  for (const cbp of (ctx?.bidPackages || [])) ctxPkgById[cbp.id] = cbp;
  const awardedTotal = (ctx?.bidPackages || []).reduce((s: number, cbp: any) => s + (Number(cbp.awardedAmount) || 0), 0);
  const budgetRevised = Number(ctx?.budget?.revised ?? ctx?.budget?.original) || 0;
  const budgetCommitted = Number(ctx?.budget?.committed) || 0;
  const rosterCount = (ctx?.subs || []).length;
  const spreadTone = (s: number): BadgeTone => s <= 10 ? 'ongoing' : s <= 25 ? 'under_contract' : 'overdue';
  const daysUntil = (d?: string | null) => {
    if (!d) return null;
    const t = new Date(String(d).slice(0, 10) + 'T12:00:00').getTime();
    return isNaN(t) ? null : Math.ceil((t - Date.now()) / 86400000);
  };
  const fmtDue = (d?: string | null) => {
    if (!d) return '';
    const dt = new Date(String(d).slice(0, 10) + 'T12:00:00');
    if (isNaN(dt.getTime())) return '';
    const sameYear = dt.getFullYear() === new Date().getFullYear();
    return dt.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Row model — the leveling figures each column reads.
  const rowOf = (pkg: BidPackageRow) => {
    const det = detail[pkg.id];
    const invited = Number(det?.invited ?? pkg.bid_package_invites?.[0]?.count) || 0;
    const responded = Number(det?.responded ?? pkg.bid_submissions?.[0]?.count) || 0;
    const low = det?.low != null ? Number(det.low) || 0 : null;
    const spread = det?.spread != null && Number.isFinite(Number(det.spread)) ? Number(det.spread) : null;
    const cp = ctxPkgById[pkg.id];
    const budgetEst = Number(cp?.budgetEstimate ?? (pkg as any).budget_estimate) || 0;
    const awardedAmt = Number(cp?.awardedAmount ?? (pkg as any).awarded_amount) || 0;
    const awardedTo = cp?.awardedTo || (pkg as any).awarded_to || null;
    const dueRaw = pkg.bid_due_date || (pkg as any).due_date;
    const due = daysUntil(dueRaw);
    const isAwarded = pkg.status === 'awarded';
    return { det, invited, responded, low, spread, budgetEst, awardedAmt, awardedTo, dueRaw, due, isAwarded };
  };

  const pickStatus = (f: StatusFilter) => setStatusFilter(prev => (prev === f ? 'all' : f));
  const stats: StatItem[] = loading
    ? []
    : [
        { label: 'Packages', value: packages.length, sub: `${packages.filter(p => matchesStatus(p.status, 'draft')).length} draft`, icon: <Package size={15} />, onClick: () => setStatusFilter('all'), active: statusFilter === 'all' },
        { label: 'Open for Bids', value: openCount, sub: 'Out with the subs', icon: <PaperPlaneTilt size={15} />, onClick: () => pickStatus('open'), active: statusFilter === 'open' },
        { label: 'Award Pending', value: closedCount, tone: closedCount > 0 ? 'warn' : 'default', sub: closedCount > 0 ? 'Bidding closed — your call' : 'None waiting', icon: <HourglassMedium size={15} />, onClick: () => pickStatus('closed'), active: statusFilter === 'closed' },
        { label: 'Awarded', value: fmt(awardedTotal), tone: totalAwarded > 0 ? 'good' : 'default', sub: `${totalAwarded} package${totalAwarded === 1 ? '' : 's'} placed`, icon: <Trophy size={15} />, onClick: () => pickStatus('awarded'), active: statusFilter === 'awarded' },
        { label: 'Bids In', value: `${totalSubmissions} / ${totalInvited}`, tone: totalSubmissions > 0 ? 'good' : 'default', sub: 'Bids received of invites out', icon: <EnvelopeOpen size={15} /> },
      ];

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packages.filter(p => {
      if (!matchesStatus(p.status, statusFilter)) return false;
      if (!q) return true;
      return [p.trade, p.name].some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [packages, search, statusFilter]);

  const columns: Column<BidPackageRow>[] = [
    { key: 'name', header: 'Package', primary: true, phone: 'show', accessor: p => (p.trade || '').toLowerCase(), render: p => <div className="bpPkg"><span>{p.trade || 'General'}</span><span title={p.name}>{p.name || 'Untitled Package'}</span></div> },
    { key: 'status', phone: 'show', header: 'Status', accessor: p => STATUS_RANK[p.status] ?? 9, render: p => { const b = statusBadge(p.status); return <Badge tone={b.tone} dot>{b.label}</Badge>; } },
    { key: 'due', phone: 'show', header: 'Bids Due', accessor: p => p.bid_due_date || (p as any).due_date || '', render: p => { const r = rowOf(p); return <span className="bpDue" data-tone={r.due != null && !r.isAwarded ? (r.due < 0 ? 'late' : r.due <= 3 ? 'soon' : undefined) : undefined}>{fmtDue(r.dueRaw)}{r.due != null && !r.isAwarded ? ` · ${r.due < 0 ? `${Math.abs(r.due)}d overdue` : r.due === 0 ? 'due today' : `${r.due}d left`}` : ''}</span>; } },
    { key: 'responses', phone: 'hide', header: 'Invited / Responded', accessor: p => rowOf(p).responded, align: 'right', render: p => { const r = rowOf(p); return <span className="bpMoney">{r.invited} / <span style={{ color: r.responded > 0 ? 'var(--status-ongoing)' : 'var(--text-tertiary)' }}>{r.responded}</span></span>; } },
    { key: 'low', phone: 'show', header: 'Low Bid / Award', accessor: p => { const r = rowOf(p); return r.isAwarded ? r.awardedAmt : (r.low ?? 0); }, align: 'right', total: 'sum', format: fmt, render: p => { const r = rowOf(p); const who = r.isAwarded ? r.awardedTo : r.det?.lowWho; return <div style={{ textAlign: 'right' }}><span className="bpMoney" style={{ color: r.isAwarded ? 'var(--status-ongoing)' : undefined }}>{r.isAwarded && r.awardedAmt > 0 ? fmt(r.awardedAmt) : r.low != null ? fmt(r.low) : ''}</span>{who && <span className="bpSub" style={{ marginLeft: 'auto' }}>{who}</span>}</div>; } },
    { key: 'spread', phone: 'hide', header: 'Spread', accessor: p => rowOf(p).spread ?? -1, render: p => { const r = rowOf(p); return r.spread != null ? <span title={r.spread <= 10 ? 'Tight — market agrees' : r.spread <= 25 ? 'Level scope before award' : 'Wide — check scope gaps'}><Badge tone={spreadTone(r.spread)}>{Math.round(r.spread)}%</Badge></span> : <span className="bpMuted">{r.responded === 1 ? 'Needs 2 bids' : ''}</span>; } },
    { key: 'vsBudget', phone: 'hide', header: 'vs Budget', accessor: p => { const r = rowOf(p); return r.budgetEst > 0 && r.low != null ? r.low - r.budgetEst : 0; }, align: 'right', render: p => { const r = rowOf(p); if (r.budgetEst > 0 && r.low != null) { const d = r.low - r.budgetEst; return d === 0 ? <span className="bpMuted">On budget</span> : <span className="bpVs bpMoney" data-tone={d < 0 ? 'under' : 'over'}>{d < 0 ? '−' : '+'}{fmt(Math.abs(d))}</span>; } if (r.budgetEst > 0) return <span className="bpMuted" title="Budget estimate">Budget {fmt(r.budgetEst)}</span>; return null; } },
  ];
  const rowActions = (p: BidPackageRow): Action[] => {
    const r = rowOf(p);
    return [
      { label: r.isAwarded ? 'View Award' : r.responded >= 2 ? 'Level Bids' : 'Open Package', icon: r.isAwarded ? <Trophy size={15} /> : r.responded >= 2 ? <Scales size={15} /> : <ArrowSquareOut size={15} />, href: `/app/projects/${projectId}/bid-packages/${p.id}` },
      /* Built from the live jacket on every press. This opened jacket_pdf_url
         as stored (an expired signed link, or a private-bucket address the
         reader cannot fetch) and was hidden on packages that had none. The
         status box reports a failure in the server's words; it is also logged. */
      {
        label: 'Bid Jacket (PDF)', icon: <FileText size={15} />,
        onClick: () => {
          buildJacketPdf(p.id)
            .then((pdf) => openPdf({ url: pdf.openUrl, title: `${p.name || p.trade || 'Bid package'} — Bid Jacket` }))
            .catch((e) => console.error('[bid-packages] jacket PDF', p.id, e));
        },
      },
    ];
  };

  let listBody: React.ReactNode;
  if (!loading && loadError) {
    listBody = <EmptyState icon={<Tray size={22} />} title="Couldn't load bid packages" text={retryText(loadError)} action={<Button onClick={loadPackages}>Retry</Button>} />;
  } else if (!loading && packages.length === 0) {
    listBody = (
      <EmptyState
        icon={<Package size={22} />}
        title="No bid packages yet"
        text={rosterCount > 0 ? `Send one trade's scope to your ${rosterCount}-sub roster and level the bids here.` : "Send one trade's scope to your subs and level the bids here."}
        action={<IfAllowed perm={['Projects', 'Edit']}><Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={() => { setWizardKey(k => k + 1); setShowWizard(true); }}>Create Bid Package</Button></IfAllowed>}
      />
    );
  } else {
    listBody = (
      <DataTable
        tableId="project-bid-packages"
        exportName="bid-packages"
        columns={columns}
        rows={shown}
        rowKey={p => p.id}
        loading={loading}
        defaultSort={{ key: 'status', dir: 'asc' }}
        onRowClick={p => router.push(`/app/projects/${projectId}/bid-packages/${p.id}`)}
        rowActions={rowActions}
        empty={<EmptyState title="Nothing matches" text="Change the search or the status filter." action={<Button onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear filters</Button>} />}
      />
    );
  }

  return (
    <div className="bpWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[
          { label: 'Projects', href: '/app/projects' },
          { label: ctx?.project?.name || 'Project', href: `/app/projects/${projectId}/overview` },
          { label: 'Bid Packages' },
        ]}
        title="Bid Packages"
        actions={<IfAllowed perm={['Projects', 'Edit']}><Button variant="primary" icon={<Plus size={15} weight="bold" />} onClick={() => { setWizardKey(k => k + 1); setShowWizard(true); }}>Create Bid Package</Button></IfAllowed>}
      >
        {!loadError && stats.length > 0 && <StatRow items={stats} />}

        {!loading && !loadError && packages.length > 0 && (
          <Toolbar
            search={search}
            onSearch={setSearch}
            placeholder="Search by trade or package…"
            filters={
              <Select
                aria-label="Status"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                style={{ width: 'auto', minWidth: 170 }}
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'draft', label: 'Draft' },
                  { value: 'open', label: 'Open for bids' },
                  { value: 'closed', label: 'Award pending' },
                  { value: 'awarded', label: 'Awarded' },
                ]}
              />
            }
          />
        )}

        <div className="bpCq">
          <div className="bpSplit" data-rail={ctx ? 'true' : 'false'}>
            {/* NudgeRing pulses the register when the suggestion engine flags a
                closed package on THIS project still awaiting an award decision. */}
            <NudgeRing anchorId={ANCHOR_BID_DECISION} projectId={projectId} radius={16} style={{ minWidth: 0 }}>
              <div className="bpList" ref={listRef}><Card flush>{listBody}</Card></div>
            </NudgeRing>

            {ctx && (
              <aside className="bpRail" aria-label="Procurement snapshot">
                <Card title="Procurement Snapshot">
                  <DetailList items={[
                    ['Project budget', <a key="b" className="k-link" href={`/app/projects/${projectId}/budget`}>{fmt(budgetRevised)}</a>],
                    ['Committed to date', budgetRevised > 0 ? `${fmt(budgetCommitted)} · ${Math.round((budgetCommitted / budgetRevised) * 100)}%` : fmt(budgetCommitted)],
                    ['Awarded via bids', fmt(awardedTotal)],
                    ['Bids received', String(totalSubmissions)],
                    ['Subs on roster', <a key="r" className="k-link" href={`/app/projects/${projectId}/subs`}>{rosterCount}</a>],
                  ]} />
                </Card>
              </aside>
            )}
          </div>
        </div>
      </PageShell>

      <WizardModal
        key={wizardKey}
        projectId={projectId}
        ctx={ctx}
        open={showWizard}
        /* Reloaded on close: a package created before the GC chose not to send
           still belongs in the list. */
        onClose={() => { setShowWizard(false); void loadPackages(); }}
        onCreated={(id) => {
          setShowWizard(false);
          router.push(`/app/projects/${projectId}/bid-packages/${id}`);
        }}
      />
    </div>
  );
}
