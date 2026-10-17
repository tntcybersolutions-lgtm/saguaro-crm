'use client';
/**
 * "New invoice" on the sub portal's Invoices tab. The sub picks the period,
 * types what they billed this period per line (carried over from their last
 * invoice), sees the totals, and sends it to the GC. A compliance hold (COI or
 * W-9 not current) comes back from the server and is said in plain words with
 * a way to fix it. What is left to bill on the subcontract shows beside the
 * totals, and an invoice past it is stopped here with that amount — the server
 * refuses it too (lib/sub-billing-cap).
 */
import React, { useMemo, useState } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import { localDay } from '@/lib/calendar-day';
import { blankLine, draftTotals, invoiceBody, linesFromLast, type DraftLine } from '@/lib/sub-invoice-draft';
import { checkBillingCap, remainingSentence, type BillingRoom } from '@/lib/sub-billing-cap';

const box: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 16, display: 'grid', gap: 14, minWidth: 0 };
const input: React.CSSProperties = { width: '100%', background: 'var(--bg-base)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 16, minHeight: 44, boxSizing: 'border-box' };
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 };
const btn = (go?: boolean): React.CSSProperties => ({ minHeight: 44, padding: '0 18px', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer', border: go ? 'none' : '1px solid rgba(255,255,255,0.16)', background: go ? 'var(--brand-primary)' : 'transparent', color: go ? 'var(--on-brand)' : 'var(--text-primary)' });
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function SubInvoiceForm({ token, billing, lastLines, onFiled, onFixCompliance }: {
  token: string;
  /** Room left on the subcontract; null when there is none to measure against. */
  billing?: BillingRoom | null;
  lastLines?: ReadonlyArray<Record<string, unknown>> | null;
  onFiled: () => void;
  onFixCompliance: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  // The sub's own day (it was the UTC day — tomorrow, every evening in the US).
  const [to, setTo] = useState(localDay());
  const [ret, setRet] = useState('10');
  const [lines, setLines] = useState<DraftLine[]>(() => linesFromLast(lastLines));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [hold, setHold] = useState<string[] | null>(null);
  const totals = useMemo(() => draftTotals(lines, ret), [lines, ret]);
  const cap = useMemo(() => checkBillingCap(billing ?? null, totals.requested), [billing, totals.requested]);
  // A fully billed contract says so as soon as the form opens — nothing to type first.
  const capMsg = !cap.ok ? cap.message : billing && billing.remaining <= 0 ? remainingSentence(billing) : '';
  // Any edit clears the last message — it was about the numbers before this change.
  const set = (k: string, p: Partial<DraftLine>) => { setErr(''); setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...p } : l))); };

  const submit = async () => {
    setErr(''); setHold(null);
    if (!to) { setErr('Pick the date this invoice runs through.'); return; }
    if (from && from > to) { setErr('The period starts after it ends.'); return; }
    if (totals.problems.length) { setErr(totals.problems[0]); return; }
    if (capMsg) { setErr(capMsg); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/portal/sub/pay-apps?token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-portal-token': token },
        body: JSON.stringify(invoiceBody(lines, from, to, ret)),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409 && j.complianceBlock) { setHold(Array.isArray(j.missing) ? j.missing : []); return; }
      // Over the contract: the server says how much is left, in the same words.
      if (!r.ok) { setErr(j.error || "Couldn't send the invoice. Please try again."); return; }
      setOpen(false); setLines(linesFromLast(lastLines)); onFiled();
    } catch {
      setErr('No connection — the invoice was not sent. Try again when you have signal.');
    } finally { setSaving(false); }
  };

  if (!open) return <button type="button" style={{ ...btn(true), justifySelf: 'start' }} onClick={() => setOpen(true)}>+ New invoice</button>;
  return (
    <section style={box} aria-label="New invoice">
      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>New invoice</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div><span style={label}>Period from</span><SaguaroDatePicker value={from} onChange={setFrom} style={input} /></div>
        <div><span style={label}>Through *</span><SaguaroDatePicker value={to} onChange={setTo} style={input} /></div>
        <div><label style={label} htmlFor="inv-ret">Retainage %</label><input id="inv-ret" inputMode="decimal" value={ret} onChange={(e) => { setErr(''); setRet(e.target.value); }} style={input} /></div>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {lines.map((l, i) => (
          <div key={l.key} style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
              <div style={{ flex: 1, minWidth: 0 }}><label style={label} htmlFor={`d-${l.key}`}>Line {i + 1} — description</label><input id={`d-${l.key}`} value={l.description} onChange={(e) => set(l.key, { description: e.target.value })} placeholder="e.g. Drywall L2" style={input} /></div>
              {lines.length > 1 && <button type="button" aria-label={`Remove line ${i + 1}`} style={{ ...btn(), padding: '0 12px' }} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>✕</button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, alignItems: 'end' }}>
              <div><label style={label} htmlFor={`s-${l.key}`}>Scheduled</label><input id={`s-${l.key}`} inputMode="decimal" value={l.scheduled} onChange={(e) => set(l.key, { scheduled: e.target.value })} placeholder="0" style={input} /></div>
              <div><label style={label} htmlFor={`p-${l.key}`}>Billed before</label><input id={`p-${l.key}`} inputMode="decimal" value={l.previous} onChange={(e) => set(l.key, { previous: e.target.value })} style={input} /></div>
              <div><label style={label} htmlFor={`t-${l.key}`}>This period</label><input id={`t-${l.key}`} inputMode="decimal" value={l.thisPeriod} onChange={(e) => set(l.key, { thisPeriod: e.target.value })} placeholder="0" style={input} /></div>
            </div>
          </div>
        ))}
        <button type="button" style={{ ...btn(), justifySelf: 'start' }} onClick={() => setLines((ls) => [...ls, blankLine()])}>+ Add line</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        {([['This period', totals.requested], ['Retainage to date', totals.retainage], ['Net due', totals.net]] as [string, number][])
          .concat(billing ? ([['Left to bill', billing.remaining]] as [string, number][]) : []).map(([k, v]) => (
          <div key={k as string} style={{ background: 'var(--bg-base)', borderRadius: 8, padding: '8px 10px', minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)' }}>{k as string}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: k === 'Left to bill' && capMsg ? 'var(--danger)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>{usd(v as number)}</div>
          </div>
        ))}
      </div>
      {hold && (
        <div role="alert" style={{ border: '1px solid color-mix(in srgb, var(--warning) 45%, transparent)', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
          <b style={{ color: 'var(--warning)' }}>On hold until your paperwork is current</b>
          <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>Your GC releases invoices once these are on file and not expired: {hold.map((m) => (m === 'w9' ? 'W-9' : m === 'insurance' ? 'insurance certificate (COI)' : m)).join(' and ') || 'your compliance documents'}.</span>
          <button type="button" style={{ ...btn(true), justifySelf: 'start' }} onClick={onFixCompliance}>Upload them now</button>
        </div>
      )}
      {(err || capMsg) && <div role="alert" style={{ color: 'var(--danger)', fontSize: 14, fontWeight: 700 }}>{err || capMsg}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={btn(true)} disabled={saving || !!capMsg} onClick={() => void submit()}>{saving ? 'Sending…' : `Send invoice for ${usd(totals.net)}`}</button>
        <button type="button" style={btn()} disabled={saving} onClick={() => { setOpen(false); setErr(''); setHold(null); }}>Cancel</button>
      </div>
    </section>
  );
}
