'use client';
/**
 * ProposalEditor — create or edit a proposal's terms: title, line items
 * (description · qty · unit · unit price → amount), the total, scope, payment
 * terms, exclusions and the valid-until date. Saves through
 * POST /api/leads/[id]/proposals (new) or PATCH /api/proposals/[id] (edit).
 * The total is computed with lib/proposal-esign-core, the same math the server
 * and the signing page use. Lines stack on a phone; inputs are 16px there.
 */
import React, { useEffect, useState } from 'react';
import { Plus, Trash } from '@phosphor-icons/react';
import { Button, DateInput, Field, FormGrid, FormModal, Input, Textarea } from '@/components/ui/kit';
import { humanError } from '@/lib/errors';
import { lineAmount, money, normalizeLineItems, proposalTotal, type ProposalLineItem } from '@/lib/proposal-esign-core';

export type EditableProposal = {
  id?: string;
  title: string;
  line_items: ProposalLineItem[];
  introduction: string | null;
  description: string | null;
  payment_terms: string | null;
  exclusions: string | null;
  valid_until: string | null;
};

type Line = { description: string; quantity: string; unit: string; unit_price: string };
const blankLine = (): Line => ({ description: '', quantity: '1', unit: '', unit_price: '' });
const toLines = (items: ProposalLineItem[]): Line[] =>
  items.length ? items.map((l) => ({ description: l.description, quantity: String(l.quantity), unit: l.unit, unit_price: String(l.unit_price) })) : [blankLine()];

export default function ProposalEditor({ open, onClose, leadId, initial, defaultTitle, onSaved }: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  /** The proposal to edit; omit to create a new one on the deal. */
  initial?: EditableProposal | null;
  defaultTitle: string;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [intro, setIntro] = useState('');
  const [scope, setScope] = useState('');
  const [terms, setTerms] = useState('');
  const [excl, setExcl] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title || defaultTitle);
    setLines(toLines(initial?.line_items || []));
    setIntro(initial?.introduction || '');
    setScope(initial?.description || '');
    setTerms(initial?.payment_terms || '');
    setExcl(initial?.exclusions || '');
    setValidUntil(initial?.valid_until ? initial.valid_until.slice(0, 10) : '');
    setError(null);
  }, [open, initial, defaultTitle]);

  const items = normalizeLineItems(lines);
  const total = proposalTotal(items, 0);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = async () => {
    if (!title.trim()) { setError('Give the proposal a title.'); return; }
    if (!items.length || total <= 0) { setError('Add at least one line item with a price.'); return; }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(), line_items: items, introduction: intro, scope, payment_terms: terms, exclusions: excl,
        valid_until: validUntil || null,
      };
      const r = initial?.id
        ? await fetch(`/api/proposals/${initial.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch(`/api/leads/${leadId}/proposals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not save the proposal.');
      onSaved();
      onClose();
    } catch (e) {
      setError(humanError(e, 'Could not save the proposal.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title={initial?.id ? 'Edit Proposal' : 'New Proposal'}
      subtitle={initial?.id ? 'A link already sent keeps the version it went out with. Resend to send this one.' : 'Line items, total and terms — what the customer reads and signs.'}
      onSubmit={save}
      submitLabel={busy ? 'Saving…' : 'Save Proposal'}
      busy={busy}
      error={error}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <FormGrid cols={2}>
        <Field label="Title" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Valid Until">
          <DateInput value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </Field>
      </FormGrid>

      <div className="pe-lines" role="group" aria-label="Line items">
        <div className="pe-lines-head"><span className="k-label">Line Items</span><span className="pe-total">Total {money(total)}</span></div>
        {lines.map((l, i) => {
          const amt = lineAmount({ description: l.description, quantity: Number(l.quantity) || 0, unit: l.unit, unit_price: Number(String(l.unit_price).replace(/[$,]/g, '')) || 0 });
          return (
            <div className="pe-line" key={i}>
              <Input className="pe-desc" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Description" aria-label={`Line ${i + 1} description`} />
              <Input className="pe-qty" inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} aria-label={`Line ${i + 1} quantity`} placeholder="Qty" />
              <Input className="pe-unit" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} aria-label={`Line ${i + 1} unit`} placeholder="Unit" />
              <Input className="pe-price" inputMode="decimal" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} aria-label={`Line ${i + 1} unit price`} placeholder="Unit price" />
              <span className="pe-amt">{money(amt)}</span>
              <Button variant="ghost" icon={<Trash size={15} />} aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [blankLine()]))} />
            </div>
          );
        })}
        <div><Button icon={<Plus size={15} />} onClick={() => setLines((ls) => [...ls, blankLine()])}>Add Line</Button></div>
      </div>

      <FormGrid cols={1}>
        <Field label="Introduction"><Textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={2} /></Field>
        <Field label="Scope of Work"><Textarea value={scope} onChange={(e) => setScope(e.target.value)} rows={4} /></Field>
        <Field label="Payment Terms"><Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} placeholder="e.g. 30% deposit, progress billing monthly" /></Field>
        <Field label="Exclusions"><Textarea value={excl} onChange={(e) => setExcl(e.target.value)} rows={2} /></Field>
      </FormGrid>
    </FormModal>
  );
}

const CSS = `
.pe-lines{display:flex;flex-direction:column;gap:8px;margin:16px 0}
.pe-lines-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.pe-total{font-size:16px;font-weight:700;color:var(--text-primary);font-variant-numeric:tabular-nums}
.pe-line{display:grid;grid-template-columns:minmax(0,1fr) 80px 80px 120px 110px 44px;gap:8px;align-items:center;padding-bottom:8px;border-bottom:1px solid var(--border-subtle)}
.pe-amt{text-align:right;font-weight:650;color:var(--text-primary);font-variant-numeric:tabular-nums}
.pe-line .k-btn{min-height:44px;min-width:44px}
@media (max-width:720px){
  .pe-line{grid-template-columns:repeat(3,minmax(0,1fr)) 44px}
  .pe-desc{grid-column:1 / -1}
  .pe-amt{grid-column:1 / 4;text-align:left}
  .pe-line .k-btn{grid-column:4;grid-row:3}
}
`;
