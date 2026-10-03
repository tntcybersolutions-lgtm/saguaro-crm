'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useProjectContext } from '@/lib/hooks/useProjectContext';
import { humanError } from '@/lib/errors';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import SaguaroDatePicker from '../../../../../components/SaguaroDatePicker';
import { toCents, toDollars, sumCents, extend } from '@/lib/calc';
import { X, Plus, ArrowLeft, ArrowRight, Package, FileText, Trophy, UsersThree, Tray, CalendarBlank, CurrencyDollar, ShieldCheck } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, StatCard, SectionCard, PremiumEmpty, StatStrip, FlowSteps, InsightRow, AutoChip, goldButtonStyle } from '@/components/ui/premium';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { SUB_TRADES, SUB_TRADES_BY_DIVISION } from '@/lib/construction-intelligence';
import NudgeRing from '@/components/intelligence/NudgeRing';
import { ANCHOR_BID_DECISION } from '@/lib/suggestions';
import { StatusPill } from '@/components/ui/Status';
import { openPdf } from '@/components/PdfViewer';

const GOLD='var(--brand-primary)',DARK='var(--bg-base)',RAISED='var(--bg-surface)',BORDER='rgba(255,255,255,0.12)',DIM='#CBD5E1',TEXT='#FFFFFF',GREEN='#2CFF7A',RED='#FF3B30',ORANGE='#FF8A00';
const fmt = (n:number) => '$'+((n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));

// ─── Types ───────────────────────────────────────────────────────────────────

interface BidPackageRow {
  id: string;
  trade: string;
  name: string;
  bid_due_date: string | null;
  status: 'draft' | 'open' | 'closed' | 'awarded';
  jacket_pdf_url?: string | null;
  bid_package_invites?: { count: number }[];
  bid_submissions?: { count: number }[];
}

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

// ─── Badge ───────────────────────────────────────────────────────────────────

/**
 * Defers to the platform status treatment.
 *
 * This had its own four-color table, in which "open" was gold — the color
 * that means "waiting on you" everywhere else, when a package that is out for
 * bid is waiting on subs. A color that means one thing here and another on
 * the next screen carries no information at all.
 */
function StatusBadge({ status }: { status: string }) {
  return <StatusPill module="bid_packages" status={status} size="sm" />;
}

// ─── Wizard Modal ─────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px',
  background: DARK, border: `1px solid ${BORDER}`, borderRadius: 7,
  color: TEXT, fontSize: 13, outline: 'none',
};

function defaultDue(): string {
  const d = new Date(Date.now() + 14 * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function newLineItem(): LineItem {
  return { id: String(Date.now() + Math.random()), description: '', qty: '1', unit: 'LS', unitPrice: '0' };
}

function WizardModal({ projectId, ctx, onClose, onCreated }: { projectId: string; ctx?: any; onClose: () => void; onCreated: (id: string) => void }) {
  const [step, setStep] = useState(1);
  const [subsLoading, setSubsLoading] = useState(false);
  const [w, setW] = useState<WizardState>({
    trade: '', scope: '', dueDate: defaultDue(), requiresBond: false,
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
    if (!w.addEmail) return;
    setW(prev => ({
      ...prev,
      extraInvites: [...prev.extraInvites, { name: prev.addName, email: prev.addEmail }],
      addName: '', addEmail: '',
    }));
  }

  async function handleSubmit() {
    setField('submitting', true);
    setField('error', '');
    try {
      const lineItems = w.lineItems.map(li => ({
        description: li.description,
        quantity: Number(li.qty),
        unit: li.unit,
        unitPrice: Number(li.unitPrice),
        totalAmount: toDollars(extend(Number(li.qty), toCents(li.unitPrice))),
      }));
      const cr = await fetch('/api/bid-packages/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          trade: w.trade,
          name: `${w.trade} Package`,
          scopeSummary: w.scope,
          dueDate: w.dueDate,
          requiresBond: w.requiresBond,
          lineItems,
        }),
      });
      const cd = await cr.json() as any;
      if (!cr.ok) throw new Error(cd.error || 'Failed to create package');
      const pkgId = cd.bidPackage?.id || cd.bidPackageId || cd.id;

      // Invite checked subs + extras
      const toInvite = [
        ...w.suggestedSubs.filter(s => s.checked).map(s => ({ name: s.name, email: s.email })),
        ...w.extraInvites,
      ];
      if (toInvite.length > 0 && pkgId) {
        await fetch(`/api/bid-packages/${pkgId}/invite-subs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subs: toInvite }),
        }).catch(() => null);
      }

      onCreated(pkgId || 'new');
    } catch (err: any) {
      console.error(err); setField('error', humanError(err, 'Submission failed. Please try again.'));
      setField('submitting', false);
    }
  }

  const STEPS = ['Trade & Scope', 'Line Items', 'Invite Subs', 'Review'];
  const lineTotal = toDollars(sumCents(w.lineItems.map(li => extend(Number(li.qty), toCents(li.unitPrice)))));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,.7)' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>Create Bid Package</div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Step {step} of 4 — {STEPS[step-1]}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}><X size={20} weight="regular" color={DIM} /></button>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', padding: '12px 24px', gap: 6, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          {STEPS.map((label, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: 3, borderRadius: 2, background: i + 1 <= step ? GOLD : 'rgba(0,0,0,.08)', marginBottom: 4 }} />
              <div style={{ fontSize: 10, color: i + 1 === step ? GOLD : DIM, fontWeight: i + 1 === step ? 700 : 400 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 5 }}>Trade Name *</label>
                <select value={w.trade} onChange={e => setField('trade', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
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
                {(() => {
                  if (!w.trade) return null;
                  const tl = w.trade.toLowerCase();
                  const twins = (ctx?.bidPackages || []).filter((b: any) => String(b.trade || '').toLowerCase() === tl);
                  const est = twins.reduce((s: number, b: any) => s + (Number(b.budgetEstimate) || 0), 0);
                  const roster = (ctx?.subs || []).filter((sub: any) => {
                    const st = String(sub.trade || '').toLowerCase();
                    return st.length > 0 && (st.includes(tl) || tl.includes(st));
                  }).length;
                  const live = twins.some((b: any) => ['open', 'bidding', 'closed', 'awarded'].includes(String(b.status || '').toLowerCase()));
                  return (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5, lineHeight: 1.45 }}>
                      {est > 0 && <>Budget carries <b style={{ color: TEXT }}>{fmt(est)}</b> for this trade — incoming bids will level against it. </>}
                      {roster > 0
                        ? <><b style={{ color: '#2CFF7A' }}>{roster} roster sub{roster === 1 ? '' : 's'}</b> match this trade and will be suggested in Step 3.</>
                        : <>No roster subs match this trade yet — add invites by email in Step 3.</>}
                      {live && <> A {w.trade} package already exists on this project — this one will run alongside it.</>}
                    </div>
                  );
                })()}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 5 }}>Scope Summary</label>
                <textarea value={w.scope} onChange={e => setField('scope', e.target.value)} placeholder="Describe the work scope…" rows={4} style={{ ...inp, resize: 'vertical' as const }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 5 }}>Bid Due Date{w.dueDate === defaultDue() && <AutoChip />}</label>
                <SaguaroDatePicker value={w.dueDate} onChange={v => setField('dueDate', v)} style={inp} />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 5, lineHeight: 1.45 }}>Defaulted two weeks out — subs typically need 10–15 business days to price a scope. Adjust freely.</div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={w.requiresBond} onChange={e => setField('requiresBond', e.target.checked)} style={{ width: 16, height: 16, accentColor: GOLD }} />
                <span style={{ fontSize: 13, color: TEXT }}>Requires Performance &amp; Payment Bond</span>
              </label>
            </div>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div>
              <div style={{ fontSize: 13, color: DIM, marginBottom: 14 }}>Add line items for this bid package. Subs will price against these when submitting.</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: DARK }}>
                    {['Description', 'Qty', 'Unit', 'Unit Price', ''].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: DIM, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {w.lineItems.map(li => (
                    <tr key={li.id} style={{ borderBottom: `1px solid rgba(229,229,234,.4)` }}>
                      <td style={{ padding: '6px 6px 6px 10px', width: '45%' }}>
                        <input value={li.description} onChange={e => updateLineItem(li.id, 'description', e.target.value)} placeholder="Description" style={{ ...inp, fontSize: 12 }} />
                      </td>
                      <td style={{ padding: '6px', width: 70 }}>
                        <input type="number" value={li.qty} onChange={e => updateLineItem(li.id, 'qty', e.target.value)} style={{ ...inp, fontSize: 12, textAlign: 'right', width: 60 }} />
                      </td>
                      <td style={{ padding: '6px', width: 70 }}>
                        <input value={li.unit} onChange={e => updateLineItem(li.id, 'unit', e.target.value)} placeholder="LS" style={{ ...inp, fontSize: 12, width: 60 }} />
                      </td>
                      <td style={{ padding: '6px', width: 100 }}>
                        <input type="number" value={li.unitPrice} onChange={e => updateLineItem(li.id, 'unitPrice', e.target.value)} style={{ ...inp, fontSize: 12, textAlign: 'right', width: 88 }} />
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <button onClick={() => removeLineItem(li.id)} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 14 }}><X size={14} weight="regular" color={RED} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <button onClick={addLineItem} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: GOLD, fontSize: 12, fontWeight: 700, padding: '6px 14px', cursor: 'pointer' }}><Plus size={12} weight="regular" color={GOLD} style={{ verticalAlign: 'middle' }} /> Add Row</button>
                <div style={{ fontSize: 13, color: GOLD, fontWeight: 800 }}>Total: {fmt(lineTotal)}</div>
              </div>
            </div>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <div>
              <div style={{ fontSize: 13, color: DIM, marginBottom: 16 }}>AI-suggested subs for <strong style={{ color: TEXT }}>{w.trade}</strong>. Pre-checked = recommended.</div>
              {w.suggestedSubs.length === 0 && (
                <div style={{ padding: '20px 0', textAlign: 'center', color: DIM, fontSize: 13 }}>{subsLoading ? 'Matching your roster to this trade…' : 'No roster subs matched this trade — subs you add by email below get the same portal link and pricing form.'}</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {w.suggestedSubs.map(sub => (
                  <label key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: sub.checked ? 'color-mix(in srgb, var(--brand-primary) 5%, transparent)' : 'rgba(0,0,0,.02)', border: `1px solid ${sub.checked ? 'color-mix(in srgb, var(--brand-primary) 30%, transparent)' : BORDER}`, borderRadius: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={sub.checked} onChange={e => setW(prev => ({ ...prev, suggestedSubs: prev.suggestedSubs.map(s => s.id === sub.id ? { ...s, checked: e.target.checked } : s) }))} style={{ accentColor: GOLD, width: 16, height: 16 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{sub.name}</div>
                      {sub.email && <div style={{ fontSize: 11, color: DIM }}>{sub.email}</div>}
                    </div>
                    {sub.recommended && <span style={{ fontSize: 10, background: 'var(--brand-primary-12)', color: GOLD, padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>Recommended</span>}
                  </label>
                ))}
              </div>

              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: DIM, marginBottom: 10 }}>Add by Email</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input value={w.addName} onChange={e => setField('addName', e.target.value)} placeholder="Name" style={{ ...inp, flex: 1 }} />
                  <input value={w.addEmail} onChange={e => setField('addEmail', e.target.value)} placeholder="email@company.com" style={{ ...inp, flex: 2 }} />
                  <button onClick={addExtra} style={{ padding: '8px 14px', background: 'var(--brand-primary-08)', border: `1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)`, borderRadius: 7, color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
                </div>
                {w.extraInvites.map((ei, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(0,0,0,.02)', borderRadius: 6, marginBottom: 4, fontSize: 12, color: TEXT }}>
                    <span style={{ flex: 1 }}>{ei.name} — {ei.email}</span>
                    <button onClick={() => setW(prev => ({ ...prev, extraInvites: prev.extraInvites.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 13 }}><X size={13} weight="regular" color={RED} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 4 ── */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 10 }}>Package Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                  <div><span style={{ color: DIM }}>Trade: </span><span style={{ color: TEXT, fontWeight: 600 }}>{w.trade}</span></div>
                  <div><span style={{ color: DIM }}>Due: </span><span style={{ color: TEXT, fontWeight: 600 }}>{w.dueDate || 'TBD'}</span></div>
                  <div><span style={{ color: DIM }}>Bond Required: </span><span style={{ color: TEXT, fontWeight: 600 }}>{w.requiresBond ? 'Yes' : 'No'}</span></div>
                  <div><span style={{ color: DIM }}>Line Items: </span><span style={{ color: TEXT, fontWeight: 600 }}>{w.lineItems.length}</span></div>
                  <div><span style={{ color: DIM }}>Total Value: </span><span style={{ color: GOLD, fontWeight: 800 }}>{fmt(lineTotal)}</span></div>
                  <div><span style={{ color: DIM }}>Subs to Invite: </span><span style={{ color: TEXT, fontWeight: 600 }}>{w.suggestedSubs.filter(s => s.checked).length + w.extraInvites.length}</span></div>
                </div>
              </div>
              {w.scope && (
                <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 18px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: DIM, marginBottom: 6 }}>Scope</div>
                  <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6 }}>{w.scope}</div>
                </div>
              )}
              {w.error && (
                <div style={{ background: 'rgba(192,48,48,.1)', border: '1px solid rgba(192,48,48,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#FF3B30' }}>{w.error}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            style={{ padding: '9px 20px', background: 'rgba(0,0,0,.05)', border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {step === 1 ? 'Cancel' : <><ArrowLeft size={13} weight="regular" color={DIM} style={{ verticalAlign: 'middle' }} /> Back</>}
          </button>
          <button
            onClick={() => {
              if (step === 1) { if (!w.trade) return; setStep(2); }
              else if (step === 2) goStep3();
              else if (step === 3) setStep(4);
              else handleSubmit();
            }}
            disabled={w.submitting}
            style={{ padding: '9px 24px', background: `linear-gradient(135deg,${GOLD},var(--brand-primary-strong))`, border: 'none', borderRadius: 8, color: '#0A0A00', fontSize: 14, fontWeight: 800, cursor: w.submitting ? 'wait' : 'pointer', opacity: w.submitting ? 0.7 : 1 }}>
            {step < 4 ? <>Next <ArrowRight size={14} weight="regular" color="#0A0A00" style={{ verticalAlign: 'middle' }} /></> : w.submitting ? 'Creating…' : 'Create Bid Package'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BidPackagesPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params['projectId'] as string;

  const [packages, setPackages] = useState<BidPackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  // The screen walks in knowing the project: budget, roster, award history —
  // one /api/project-context snapshot (fetched once) powers the strip + rail.
  const { ctx } = useProjectContext(projectId);
  // Per-package leveling detail (invited / responded / low bid / spread),
  // derived from the real invites + submissions tables. Number()-coerced.
  const [detail, setDetail] = useState<Record<string, { invited: number; responded: number; low: number | null; lowWho: string | null; spread: number | null }>>({});

  useEffect(() => { loadPackages(); }, [projectId]);

  async function loadPackages() {
    setLoading(true);
    try {
      const r = await fetch(`/api/bid-packages/list?projectId=${projectId}`);
      const d = await r.json() as any;
      const rows: BidPackageRow[] = d.bidPackages || [];
      setPackages(rows);
      // Leveling aggregates (invited / responded / low / spread) now ride on the
      // list payload — one grouped query server-side, zero per-package fetches.
      const next: Record<string, { invited: number; responded: number; low: number | null; lowWho: string | null; spread: number | null }> = {};
      for (const row of rows as any[]) if (row.leveling) next[row.id] = row.leveling;
      setDetail(next);
    } catch {
      setPackages([]);
    } finally {
      setLoading(false);
    }
  }

  const totalAwarded = packages
    .filter(p => p.status === 'awarded')
    .length;

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
  const budgetOriginal = Number(ctx?.budget?.original) || 0;
  const budgetCommitted = Number(ctx?.budget?.committed) || 0;
  const rosterCount = (ctx?.subs || []).length;
  const spreadColor = (s: number) => s <= 10 ? '#2CFF7A' : s <= 25 ? GOLD : '#FF3B30';
  const daysUntil = (d?: string | null) => {
    if (!d) return null;
    const t = new Date(String(d).slice(0, 10) + 'T00:00:00').getTime();
    return isNaN(t) ? null : Math.ceil((t - Date.now()) / 86400000);
  };
  const fmtDue = (d?: string | null) => {
    if (!d) return '—';
    const dt = new Date(String(d).slice(0, 10) + 'T00:00:00');
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <PremiumSurface maxWidth={2200}>
      {/* Header */}
      <ModuleHero
        eyebrow={ctx?.project?.name || 'Procurement'}
        eyebrowIcon={<Package size={13} weight="fill" color={GOLD} />}
        title="Bid"
        accent="Packages"
        subtitle="Solicit, level, and award sub bids. Awards are W-9 and COI gated."
        note="Same scope, same page"
        actions={
          <button onClick={() => setShowWizard(true)} style={goldButtonStyle} className="pmBtn">
            <Plus size={15} weight="bold" /> Create Bid Package
          </button>
        }
      />

      {/* Project money context — what the system already knows */}
      {ctx && (
        <StatStrip items={[
          {href: `/app/projects/${projectId}/budget`,  label: 'Budget', value: fmt(budgetOriginal), sub: `${Number(ctx?.budget?.lineCount) || 0} budget lines` },
          {href: `/app/projects/${projectId}/bid-packages`,  label: 'Committed', value: fmt(budgetCommitted), sub: budgetOriginal > 0 ? `${Math.round((budgetCommitted / budgetOriginal) * 100)}% of budget` : 'POs + subcontracts' },
          {href: `/app/projects/${projectId}/bid-packages`,  label: 'Awarded via Bids', value: fmt(awardedTotal), accent: awardedTotal > 0 ? GOLD : undefined, sub: `${totalAwarded} package${totalAwarded === 1 ? '' : 's'} placed` },
          {href: `/app/projects/${projectId}/subs`,  label: 'Sub Roster', value: String(rosterCount), sub: rosterCount > 0 ? 'Ready to invite' : 'Invite by email works too' },
          {href: `/app/projects/${projectId}/bid-packages`,  label: 'Responses', value: `${totalSubmissions} / ${totalInvited}`, accent: totalSubmissions > 0 ? '#2CFF7A' : undefined, sub: 'Bids in vs invites out' },
        ]} />
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard
          icon={<Package size={19} weight="duotone" color={GOLD} />}
          label="Total Packages" value={String(packages.length)} accent={GOLD}
          sub="All statuses" delay={0.02}
         href={`/app/projects/${projectId}/bid-packages`}/>
        <StatCard
          icon={<Trophy size={19} weight="duotone" color="#2CFF7A" />}
          label="Awarded" value={String(totalAwarded)} accent="#2CFF7A"
          sub="Contracts placed" delay={0.06}
         href={`/app/projects/${projectId}/bid-packages`}/>
        <StatCard
          icon={<UsersThree size={19} weight="duotone" color={GOLD} />}
          label="Subs Invited" value={String(totalInvited)} accent={GOLD}
          sub="Across packages" delay={0.10}
         href={`/app/projects/${projectId}/bid-packages`}/>
        <StatCard
          icon={<Tray size={19} weight="duotone" color="#F0A63C" />}
          label="Bids Received" value={String(totalSubmissions)} accent={totalSubmissions > 0 ? '#F0A63C' : undefined}
          sub="Submitted" delay={0.14}
         href={`/app/projects/${projectId}/bid-packages`}/>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 22, alignItems: 'start' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Skeleton width={90} height={10} style={{ marginBottom: 7 }} />
                    <Skeleton width="70%" height={15} />
                  </div>
                  <Skeleton width={58} height={18} borderRadius={4} />
                </div>
                <Skeleton width="55%" height={12} style={{ marginBottom: 12 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                  {[0, 1, 2, 3].map(j => (
                    <div key={j} style={{ background: 'var(--bg-base)', padding: '9px 12px' }}>
                      <Skeleton width="80%" height={9} style={{ marginBottom: 6 }} />
                      <Skeleton width="50%" height={14} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <SkeletonCard height={300} />
        </div>
      ) : packages.length === 0 ? (
        <SectionCard flush>
          <PremiumEmpty
            icon={<Package size={30} weight="duotone" color={GOLD} />}
            title="No Bid Packages Yet"
            description={`A bid package sends one trade's scope to ${rosterCount > 0 ? `your ${rosterCount}-sub roster` : 'your subs'} with a portal link. Bids come back priced against your line items, leveling flags the spread, and the award is compliance-gated (W-9 + COI) before it books committed cost as a draft subcontract PO.`}
            action={
              <button onClick={() => setShowWizard(true)} style={goldButtonStyle} className="pmBtn">
                <Plus size={15} weight="bold" /> Create Bid Package
              </button>
            }
          />
        </SectionCard>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 22, alignItems: 'start' }}>
          {/* NudgeRing pulses the package list when the suggestion engine flags
              a closed package on THIS project still awaiting an award decision
              (ticker deep links land on this anchor). */}
          <NudgeRing anchorId={ANCHOR_BID_DECISION} projectId={projectId} radius={16} style={{ minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
            {packages.map(pkg => {
              const det = detail[pkg.id];
              const invited = Number(det?.invited ?? pkg.bid_package_invites?.[0]?.count) || 0;
              const responded = Number(det?.responded ?? pkg.bid_submissions?.[0]?.count) || 0;
              const low = det?.low != null ? Number(det.low) || 0 : null;
              const spread = det?.spread != null && Number.isFinite(Number(det.spread)) ? Number(det.spread) : null;
              const cp = ctxPkgById[pkg.id];
              const budgetEst = Number(cp?.budgetEstimate ?? (pkg as any).budget_estimate) || 0;
              const awardedAmt = Number(cp?.awardedAmount ?? (pkg as any).awarded_amount) || 0;
              const due = daysUntil(pkg.bid_due_date || (pkg as any).due_date);
              const isAwarded = pkg.status === 'awarded';
              return (
                <Link key={pkg.id} href={`/app/projects/${projectId}/bid-packages/${pkg.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                <div className="pmHover" style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '16px 18px', boxShadow: '0 10px 30px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: GOLD }}>{pkg.trade || 'General'}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pkg.name || 'Untitled Package'}</div>
                    </div>
                    <StatusBadge status={pkg.status} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: DIM, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><CalendarBlank size={13} weight="regular" color={DIM} />{fmtDue(pkg.bid_due_date || (pkg as any).due_date)}</span>
                    {due != null && !isAwarded && <span style={{ fontWeight: 700, color: due < 0 ? '#FF3B30' : due <= 3 ? GOLD : DIM }}>{due < 0 ? `${Math.abs(due)}d overdue` : due === 0 ? 'Due today' : `${due}d left`}</span>}
                    {pkg.jacket_pdf_url && <button type="button" onClick={e => { e.stopPropagation(); e.preventDefault(); openPdf({ url: pkg.jacket_pdf_url! }); }} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', color: GOLD, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><FileText size={12} weight="regular" color={GOLD} />Jacket</button>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ background: 'var(--bg-base)', padding: '9px 12px' }}>
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(255,255,255,0.42)', marginBottom: 3 }}>Invited / Responded</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{invited} / <span style={{ color: responded > 0 ? '#2CFF7A' : DIM }}>{responded}</span></div>
                    </div>
                    <div style={{ background: 'var(--bg-base)', padding: '9px 12px' }}>
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(255,255,255,0.42)', marginBottom: 3 }}>{isAwarded ? 'Awarded' : 'Low Bid'}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: isAwarded ? '#2CFF7A' : low != null ? TEXT : DIM, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isAwarded && awardedAmt > 0 ? fmt(awardedAmt) : low != null ? fmt(low) : '—'}</div>
                      {(isAwarded ? (cp?.awardedTo || (pkg as any).awarded_to) : det?.lowWho) && <div style={{ fontSize: 10.5, color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isAwarded ? (cp?.awardedTo || (pkg as any).awarded_to) : det?.lowWho}</div>}
                    </div>
                    <div style={{ background: 'var(--bg-base)', padding: '9px 12px' }}>
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(255,255,255,0.42)', marginBottom: 3 }}>Spread</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: spread != null ? spreadColor(spread) : DIM }}>{spread != null ? `${Math.round(spread)}%` : responded === 1 ? 'Needs 2 bids' : '—'}</div>
                      {spread != null && <div style={{ fontSize: 10.5, color: DIM }}>{spread <= 10 ? 'Tight — market agrees' : spread <= 25 ? 'Level scope before award' : 'Wide — check scope gaps'}</div>}
                    </div>
                    <div style={{ background: 'var(--bg-base)', padding: '9px 12px' }}>
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: 'rgba(255,255,255,0.42)', marginBottom: 3 }}>vs Budget</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: budgetEst > 0 && low != null ? (low <= budgetEst ? '#2CFF7A' : '#FF3B30') : DIM, fontVariantNumeric: 'tabular-nums' }}>{budgetEst > 0 && low != null ? `${low <= budgetEst ? '' : '+'}${fmt(low - budgetEst)}` : budgetEst > 0 ? fmt(budgetEst) : '—'}</div>
                      {budgetEst > 0 && <div style={{ fontSize: 10.5, color: DIM }}>{low != null ? (low <= budgetEst ? 'Low bid under budget' : 'Low bid over budget') : 'Budget estimate'}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                    <button onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(`/app/projects/${projectId}/bid-packages/${pkg.id}`); }} style={{ padding: '5px 14px', background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: GOLD, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>{isAwarded ? 'View Award' : responded >= 2 ? 'Level Bids' : 'Open Package'} <ArrowRight size={12} weight="bold" color={GOLD} /></button>
                  </div>
                </div>
                </Link>
              );
            })}
          </div>
          </NudgeRing>

          {/* Context rail — the pipeline this module actually enforces */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SectionCard flat title="Award Pipeline" icon={<ShieldCheck size={17} weight="duotone" color={GOLD} />}>
              <FlowSteps title="" steps={[
                { title: 'Package Out to Subs', desc: rosterCount > 0 ? `Invites go to your roster (${rosterCount} subs) or any email — each gets a portal link.` : 'Invites go out by email — each sub gets a portal link.', done: totalInvited > 0 || packages.length > 0 },
                { title: 'Bids Come Back Priced', desc: 'Subs price your line items in the portal; responses land here in real time.', done: totalSubmissions > 0 },
                { title: 'Level the Spread', desc: 'Side-by-side leveling flags scope gaps — a wide spread usually means someone missed scope.', done: Object.values(detail).some(d => d.spread != null) },
                { title: 'Compliance Gate at Award', desc: 'Award is blocked if the winning sub has no W-9 on file or an expired COI — proceeding anyway requires an explicit override.', done: totalAwarded > 0 },
                { title: 'Award Writes Committed Cost', desc: 'The winning amount books as a draft subcontract PO automatically — no re-keying into the budget.', done: totalAwarded > 0 },
              ]} />
            </SectionCard>
            {ctx && (
              <SectionCard flat title="Procurement Snapshot" icon={<CurrencyDollar size={17} weight="duotone" color={GOLD} />}>
                <InsightRow label="Project Budget" value={fmt(budgetOriginal)} />
                <InsightRow label="Committed to Date" value={fmt(budgetCommitted)} />
                <InsightRow label="Awarded via Bids" value={fmt(awardedTotal)} accent={awardedTotal > 0 ? GOLD : undefined} strong />
                <InsightRow label="Open Packages" value={String(packages.filter(p => p.status === 'open').length)} />
                <InsightRow label="Bids Received" value={String(totalSubmissions)} accent={totalSubmissions > 0 ? '#2CFF7A' : undefined} />
                {rosterCount > 0 && <InsightRow label="Subs on Roster" value={String(rosterCount)} />}
              </SectionCard>
            )}
          </div>
        </div>
      )}

      {showWizard && (
        <WizardModal
          projectId={projectId}
          ctx={ctx}
          onClose={() => setShowWizard(false)}
          onCreated={(id) => {
            setShowWizard(false);
            router.push(`/app/projects/${projectId}/bid-packages/${id}`);
          }}
        />
      )}
    </PremiumSurface>
  );
}
