'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',GREEN='#1a8a4a',RED='#c03030',ORANGE='#B85C2A';
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

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { c: string; bg: string }> = {
    draft:   { c: DIM,      bg: 'rgba(148,163,192,.15)' },
    open:    { c: '#3b82f6', bg: 'rgba(59,130,246,.12)' },
    closed:  { c: ORANGE,   bg: 'rgba(184,92,42,.12)' },
    awarded: { c: '#1db954', bg: 'rgba(26,138,74,.12)' },
  };
  const s = cfg[status] || cfg.draft;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: s.bg, color: s.c, textTransform: 'uppercase', letterSpacing: 0.3 }}>
      {status}
    </span>
  );
}

// ─── Wizard Modal ─────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px',
  background: DARK, border: `1px solid ${BORDER}`, borderRadius: 7,
  color: TEXT, fontSize: 13, outline: 'none',
};

function newLineItem(): LineItem {
  return { id: String(Date.now() + Math.random()), description: '', qty: '1', unit: 'LS', unitPrice: '0' };
}

function WizardModal({ projectId, onClose, onCreated }: { projectId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [step, setStep] = useState(1);
  const [w, setW] = useState<WizardState>({
    trade: '', scope: '', dueDate: '', requiresBond: false,
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
      const sovItems = w.lineItems.map(li => ({
        description: li.description,
        qty: Number(li.qty),
        unit: li.unit,
        unitCost: Number(li.unitPrice),
        total: Number(li.qty) * Number(li.unitPrice),
      }));
      const cr = await fetch('/api/bid-packages/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          trade: w.trade,
          name: `${w.trade} Package`,
          scope: w.scope,
          bidDueDate: w.dueDate,
          requiresBond: w.requiresBond,
          sovItems,
        }),
      });
      const cd = await cr.json() as any;
      if (!cr.ok) throw new Error(cd.error || 'Failed to create package');
      const pkgId = cd.bidPackageId || cd.id;

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
      setField('error', err.message || 'Submission failed');
      setField('submitting', false);
    }
  }

  const STEPS = ['Trade & Scope', 'Line Items', 'Invite Subs', 'Review'];
  const lineTotal = w.lineItems.reduce((s, li) => s + Number(li.qty) * Number(li.unitPrice), 0);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,.7)' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>Create Bid Package</div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Step {step} of 4 — {STEPS[step-1]}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: DIM, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', padding: '12px 24px', gap: 6, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          {STEPS.map((label, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: 3, borderRadius: 2, background: i + 1 <= step ? GOLD : 'rgba(255,255,255,.08)', marginBottom: 4 }} />
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
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Trade Name *</label>
                <input value={w.trade} onChange={e => setField('trade', e.target.value)} placeholder="e.g. Electrical, Plumbing, HVAC" style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Scope Summary</label>
                <textarea value={w.scope} onChange={e => setField('scope', e.target.value)} placeholder="Describe the work scope..." rows={4} style={{ ...inp, resize: 'vertical' as const }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Bid Due Date</label>
                <input type="date" value={w.dueDate} onChange={e => setField('dueDate', e.target.value)} style={inp} />
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
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {w.lineItems.map(li => (
                    <tr key={li.id} style={{ borderBottom: `1px solid rgba(38,51,71,.4)` }}>
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
                        <button onClick={() => removeLineItem(li.id)} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 14 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <button onClick={addLineItem} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: GOLD, fontSize: 12, fontWeight: 700, padding: '6px 14px', cursor: 'pointer' }}>+ Add Row</button>
                <div style={{ fontSize: 13, color: GOLD, fontWeight: 800 }}>Total: {fmt(lineTotal)}</div>
              </div>
            </div>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <div>
              <div style={{ fontSize: 13, color: DIM, marginBottom: 16 }}>AI-suggested subs for <strong style={{ color: TEXT }}>{w.trade}</strong>. Pre-checked = recommended.</div>
              {w.suggestedSubs.length === 0 && (
                <div style={{ padding: '20px 0', textAlign: 'center', color: DIM, fontSize: 13 }}>Loading suggestions... or no subs found for this trade.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {w.suggestedSubs.map(sub => (
                  <label key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: sub.checked ? 'rgba(212,160,23,.05)' : 'rgba(255,255,255,.02)', border: `1px solid ${sub.checked ? 'rgba(212,160,23,.3)' : BORDER}`, borderRadius: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={sub.checked} onChange={e => setW(prev => ({ ...prev, suggestedSubs: prev.suggestedSubs.map(s => s.id === sub.id ? { ...s, checked: e.target.checked } : s) }))} style={{ accentColor: GOLD, width: 16, height: 16 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{sub.name}</div>
                      {sub.email && <div style={{ fontSize: 11, color: DIM }}>{sub.email}</div>}
                    </div>
                    {sub.recommended && <span style={{ fontSize: 10, background: 'rgba(212,160,23,.12)', color: GOLD, padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>RECOMMENDED</span>}
                  </label>
                ))}
              </div>

              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>Add by Email</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input value={w.addName} onChange={e => setField('addName', e.target.value)} placeholder="Name" style={{ ...inp, flex: 1 }} />
                  <input value={w.addEmail} onChange={e => setField('addEmail', e.target.value)} placeholder="email@company.com" style={{ ...inp, flex: 2 }} />
                  <button onClick={addExtra} style={{ padding: '8px 14px', background: 'rgba(212,160,23,.1)', border: `1px solid rgba(212,160,23,.3)`, borderRadius: 7, color: GOLD, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
                </div>
                {w.extraInvites.map((ei, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,.02)', borderRadius: 6, marginBottom: 4, fontSize: 12, color: TEXT }}>
                    <span style={{ flex: 1 }}>{ei.name} — {ei.email}</span>
                    <button onClick={() => setW(prev => ({ ...prev, extraInvites: prev.extraInvites.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 13 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 4 ── */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: DARK, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>Package Summary</div>
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
                  <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Scope</div>
                  <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6 }}>{w.scope}</div>
                </div>
              )}
              {w.error && (
                <div style={{ background: 'rgba(192,48,48,.1)', border: '1px solid rgba(192,48,48,.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#ff7070' }}>{w.error}</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            style={{ padding: '9px 20px', background: 'rgba(255,255,255,.05)', border: `1px solid ${BORDER}`, borderRadius: 8, color: DIM, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          <button
            onClick={() => {
              if (step === 1) { if (!w.trade) return; setStep(2); }
              else if (step === 2) goStep3();
              else if (step === 3) setStep(4);
              else handleSubmit();
            }}
            disabled={w.submitting}
            style={{ padding: '9px 24px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 8, color: DARK, fontSize: 14, fontWeight: 800, cursor: w.submitting ? 'wait' : 'pointer', opacity: w.submitting ? 0.7 : 1 }}>
            {step < 4 ? 'Next →' : w.submitting ? 'Creating...' : 'Create Bid Package'}
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

  useEffect(() => { loadPackages(); }, [projectId]);

  async function loadPackages() {
    setLoading(true);
    try {
      const r = await fetch(`/api/bid-packages/list?projectId=${projectId}`);
      const d = await r.json() as any;
      setPackages(d.bidPackages || []);
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
    const cnt = p.bid_package_invites?.[0]?.count ?? 0;
    return s + cnt;
  }, 0);

  const totalSubmissions = packages.reduce((s, p) => {
    const cnt = p.bid_submissions?.[0]?.count ?? 0;
    return s + cnt;
  }, 0);

  return (
    <div style={{ background: DARK, minHeight: '100%' }}>
      {/* Header */}
      <div style={{ padding: '18px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DARK }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Bid Packages</h2>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>Manage subcontractor bid solicitations</div>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          style={{ padding: '9px 18px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 8, color: DARK, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          + Create Bid Package
        </button>
      </div>

      <div style={{ padding: 24 }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { l: 'Total Packages', v: String(packages.length) },
            { l: 'Awarded', v: String(totalAwarded) },
            { l: 'Subs Invited', v: String(totalInvited) },
            { l: 'Bids Received', v: String(totalSubmissions) },
          ].map(k => (
            <div key={k.l} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: DIM, marginBottom: 6 }}>{k.l}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: DIM }}>Loading bid packages...</div>
        ) : packages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: DIM }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 8 }}>No bid packages yet</div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>Create your first bid package to start soliciting subcontractors.</div>
            <button onClick={() => setShowWizard(true)} style={{ padding: '10px 22px', background: `linear-gradient(135deg,${GOLD},#F0C040)`, border: 'none', borderRadius: 8, color: DARK, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>Create Bid Package</button>
          </div>
        ) : (
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#0a1117' }}>
                  {['Trade', 'Package Name', 'Due Date', 'Status', '# Invited', '# Submitted', 'Bid Jacket', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: DIM, borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {packages.map(pkg => {
                  const invites = pkg.bid_package_invites?.[0]?.count ?? 0;
                  const subs = pkg.bid_submissions?.[0]?.count ?? 0;
                  return (
                    <tr key={pkg.id} style={{ borderBottom: `1px solid rgba(38,51,71,.5)` }}>
                      <td style={{ padding: '12px 14px', color: GOLD, fontWeight: 700 }}>{pkg.trade || '—'}</td>
                      <td style={{ padding: '12px 14px', color: TEXT, fontWeight: 600 }}>{pkg.name}</td>
                      <td style={{ padding: '12px 14px', color: DIM }}>{pkg.bid_due_date?.slice(0, 10) || '—'}</td>
                      <td style={{ padding: '12px 14px' }}><StatusBadge status={pkg.status} /></td>
                      <td style={{ padding: '12px 14px', color: DIM, textAlign: 'center' }}>{invites}</td>
                      <td style={{ padding: '12px 14px', color: subs > 0 ? '#1db954' : DIM, textAlign: 'center', fontWeight: subs > 0 ? 700 : 400 }}>{subs}</td>
                      <td style={{ padding: '12px 14px' }}>
                        {pkg.jacket_pdf_url ? (
                          <a href={pkg.jacket_pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: GOLD, fontWeight: 700, textDecoration: 'none' }}>📄 PDF</a>
                        ) : (
                          <span style={{ fontSize: 11, color: DIM }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <button
                          onClick={() => router.push(`/app/projects/${projectId}/bid-packages/${pkg.id}`)}
                          style={{ padding: '4px 12px', background: 'none', border: `1px solid ${BORDER}`, borderRadius: 5, color: GOLD, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showWizard && (
        <WizardModal
          projectId={projectId}
          onClose={() => setShowWizard(false)}
          onCreated={(id) => {
            setShowWizard(false);
            router.push(`/app/projects/${projectId}/bid-packages/${id}`);
          }}
        />
      )}
    </div>
  );
}
