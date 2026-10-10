'use client';

/**
 * BidPackageDetails — what the jacket's written dividers are made of, and the
 * form that edits them.
 *
 * Instructions to bidders, scope, work included / excluded, the due date,
 * insurance and bonding: every one of these is a page or a figure in the bid
 * jacket, and until this form existed only the creation wizard could set any of
 * them — and it had no field for instructions at all. A package created without
 * them stayed without them, and the jacket's "add instructions on the package"
 * pointed at nothing. The jacket's empty dividers now link here
 * (?edit=details#package-details) and open the form.
 *
 * Saves only what changed, through PATCH /api/bid-packages/[id].
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PencilSimple, Note, FloppyDisk, X } from '@phosphor-icons/react';
import { SectionCard, ghostButtonStyle, goldButtonStyle } from '@/components/ui/premium';
import { Field, Input, Textarea } from '@/components/ui/kit';
import { coverageText, coverageValue, parseInsuranceText, INSURANCE_AMOUNT_DEFAULT } from '@/lib/jacket-insurance';

const TEXT = 'var(--text-primary)';
const DIM = 'var(--text-secondary)';
const AMBER = 'var(--warning)';
const HAIR = 'rgba(255,255,255,0.08)';

type Pkg = Record<string, any>;

/** The scope column the jacket reads first, so an edit shows where it is read. */
function scopeColumn(p: Pkg): 'scope_narrative' | 'scope_of_work' | 'scope_summary' {
  if (String(p.scope_narrative || '').trim()) return 'scope_narrative';
  if (String(p.scope_of_work || '').trim()) return 'scope_of_work';
  if (String(p.scope_summary || '').trim()) return 'scope_summary';
  return 'scope_narrative';
}

type Form = {
  instructions: string; scope: string; included: string; excluded: string; due: string;
  insurance: string; gl: string; auto: string; wc: string; minimum: string; bond: boolean; pw: boolean;
};

function initial(p: Pkg): Form {
  const parsed = parseInsuranceText(p.insurance_requirements);
  const gl = coverageValue(p.general_liability) ?? parsed.gl;
  const auto = coverageValue(p.auto_liability) ?? parsed.auto;
  const wc = coverageValue(p.workers_compensation) ?? parsed.wc;
  const amount = typeof p.insurance_required_amount === 'number' ? p.insurance_required_amount : Number(p.insurance_required_amount) || null;
  const otherTerms = !!parsed.text || gl != null || auto != null || wc != null;
  return {
    instructions: p.bid_instructions || '',
    scope: p[scopeColumn(p)] || '',
    included: Array.isArray(p.work_included) ? p.work_included.join('\n') : '',
    excluded: Array.isArray(p.work_excluded) ? p.work_excluded.join('\n') : '',
    due: String(p.due_date || p.bid_due_date || '').slice(0, 10),
    insurance: parsed.text || '',
    gl: coverageText(gl) || '',
    auto: coverageText(auto) || '',
    wc: coverageText(wc) || '',
    /* The column defaults to $1,000,000; on its own that is not a requirement
       anyone set, so it is not pre-filled as if it were. */
    minimum: amount != null && (otherTerms || amount !== INSURANCE_AMOUNT_DEFAULT) ? coverageText(amount) || '' : '',
    bond: !!p.requires_bond,
    pw: !!p.requires_prevailing_wage,
  };
}

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export default function BidPackageDetails({ pkg, packageId, onSaved, onToast }: {
  pkg: Pkg;
  packageId: string;
  /** Called with the saved row so the page updates without a reload. */
  onSaved: (row: Pkg) => void;
  onToast?: (msg: string, color?: string) => void;
}) {
  const start = useMemo(() => initial(pkg), [pkg]);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<Form>(start);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!editing) setF(start); }, [start, editing]);

  /* Arriving from a jacket's empty divider opens the form where it is. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('edit') === 'details' || window.location.hash === '#package-details') {
      setEditing(true);
      requestAnimationFrame(() => card.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((prev) => ({ ...prev, [k]: v }));

  async function save() {
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {};
    if (f.instructions !== start.instructions) body.bid_instructions = f.instructions;
    if (f.scope !== start.scope) body[scopeColumn(pkg)] = f.scope;
    if (f.included !== start.included) body.work_included = lines(f.included);
    if (f.excluded !== start.excluded) body.work_excluded = lines(f.excluded);
    if (f.due !== start.due) {
      body.due_date = f.due || null;
      /* bid_due_date wins where both are set; the date typed here is the one
         the GC means, so the older timestamp must not shadow it. */
      if (pkg.bid_due_date) body.bid_due_date = null;
    }
    if (f.insurance !== start.insurance) body.insurance_requirements = f.insurance;
    if (f.gl !== start.gl) body.general_liability = f.gl || null;
    if (f.auto !== start.auto) body.auto_liability = f.auto || null;
    if (f.wc !== start.wc) body.workers_compensation = f.wc || null;
    if (f.minimum !== start.minimum) body.insurance_required_amount = f.minimum ? f.minimum : null;
    if (f.bond !== start.bond) body.requires_bond = f.bond;
    if (f.pw !== start.pw) body.requires_prevailing_wage = f.pw;

    if (Object.keys(body).length === 0) { setEditing(false); setSaving(false); return; }
    try {
      const r = await fetch(`/api/bid-packages/${packageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.bidPackage) throw new Error(d.error || 'Could not save the package details.');
      onSaved(d.bidPackage);
      setEditing(false);
      onToast?.('Package details saved — the jacket shows them now.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the package details.');
    } finally {
      setSaving(false);
    }
  }

  const insuranceSummary = [
    start.gl && `GL ${start.gl}`, start.auto && `Auto ${start.auto}`, start.wc && `WC ${start.wc}`, start.minimum && `Minimum ${start.minimum}`,
  ].filter(Boolean).join(' · ');

  return (
    <div id="package-details" ref={card} style={{ marginBottom: 20, scrollMarginTop: 80 }}>
      <style>{`
        @media (max-width: 760px) { .bpd-btn { min-height: 44px; } .bpd-check { min-height: 44px; } }
        .bpd-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 12px; }
        .bpd-row { display: grid; grid-template-columns: minmax(120px, 180px) minmax(0, 1fr); gap: 4px 14px; padding: 10px 0; border-bottom: 1px solid ${HAIR}; }
        @media (max-width: 560px) { .bpd-row { grid-template-columns: minmax(0, 1fr); } }
      `}</style>
      <SectionCard
        flat
        title="Package Details"
        subtitle="Instructions, scope, due date, insurance and bonding — what the jacket's written pages say."
        icon={<Note size={17} weight="duotone" color="var(--brand-primary)" />}
        action={!editing ? (
          <button className="bpd-btn pmBtn" onClick={() => setEditing(true)} style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <PencilSimple size={14} weight="bold" /> Edit
          </button>
        ) : undefined}
      >
        {!editing ? (
          <div>
            <Row label="Instructions to Bidders" value={start.instructions} missing="Not written yet — bidders see an empty first page." />
            <Row label="Scope" value={start.scope} missing="Not written yet." />
            {start.included && <Row label="Work Included" value={lines(start.included).map((l) => `• ${l}`).join('\n')} />}
            {start.excluded && <Row label="Work Excluded" value={lines(start.excluded).map((l) => `• ${l}`).join('\n')} />}
            <Row label="Bids Due" value={start.due} missing="Not set." />
            <Row label="Insurance" value={[start.insurance, insuranceSummary].filter(Boolean).join('\n')} missing="No insurance terms set." />
            <Row label="Bond / Prevailing Wage" value={`${start.bond ? 'Bond required' : 'No bond'} · ${start.pw ? 'Prevailing wage' : 'No prevailing wage'}`} />
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            <Field label="Instructions to Bidders" hint="How to bid, what to include, where questions go — the jacket's first page.">
              <Textarea value={f.instructions} onChange={(e) => set('instructions', e.target.value)} rows={4} placeholder="Bid on the attached form. Price alternates separately. Questions through the portal by…" />
            </Field>
            <Field label="Scope of Work">
              <Textarea value={f.scope} onChange={(e) => set('scope', e.target.value)} rows={5} placeholder="Furnish and install…" />
            </Field>
            <div className="bpd-grid">
              <Field label="Work Included" hint="One item per line — shown as a list.">
                <Textarea value={f.included} onChange={(e) => set('included', e.target.value)} rows={4} />
              </Field>
              <Field label="Work Excluded" hint="One item per line.">
                <Textarea value={f.excluded} onChange={(e) => set('excluded', e.target.value)} rows={4} />
              </Field>
            </div>
            <div className="bpd-grid">
              <Field label="Bids Due">
                <Input type="date" value={f.due} onChange={(e) => set('due', e.target.value)} aria-label="Bids due" />
              </Field>
              <Field label="Minimum Coverage (Umbrella)" hint="Leave blank if there is none.">
                <Input value={f.minimum} onChange={(e) => set('minimum', e.target.value)} inputMode="decimal" placeholder="$5,000,000" />
              </Field>
            </div>
            <div className="bpd-grid">
              <Field label="General Liability"><Input value={f.gl} onChange={(e) => set('gl', e.target.value)} placeholder="$2,000,000" /></Field>
              <Field label="Auto Liability"><Input value={f.auto} onChange={(e) => set('auto', e.target.value)} placeholder="$1,000,000" /></Field>
              <Field label="Workers' Comp"><Input value={f.wc} onChange={(e) => set('wc', e.target.value)} placeholder="Statutory" /></Field>
            </div>
            <Field label="Insurance Requirements (as written for bidders)">
              <Textarea value={f.insurance} onChange={(e) => set('insurance', e.target.value)} rows={3} placeholder="Additional insured, waiver of subrogation, primary and non-contributory…" />
            </Field>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
              <label className="bpd-check" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, color: TEXT, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={f.bond} onChange={(e) => set('bond', e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--brand-primary)' }} />
                Payment &amp; performance bond required
              </label>
              <label className="bpd-check" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, color: TEXT, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={f.pw} onChange={(e) => set('pw', e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--brand-primary)' }} />
                Prevailing wage
              </label>
            </div>
            {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13.5, fontWeight: 600 }}>{error}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <button className="bpd-btn pmBtn" onClick={save} disabled={saving} style={{ ...goldButtonStyle, opacity: saving ? 0.6 : 1 }}>
                <FloppyDisk size={15} weight="bold" /> {saving ? 'Saving…' : 'Save Details'}
              </button>
              <button className="bpd-btn pmBtn" onClick={() => { setEditing(false); setF(start); setError(null); }} disabled={saving} style={ghostButtonStyle}>
                <X size={15} weight="bold" /> Cancel
              </button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function Row({ label, value, missing }: { label: string; value: string; missing?: string }) {
  const empty = !String(value || '').trim();
  return (
    <div className="bpd-row">
      <div style={{ fontSize: 11, fontWeight: 800, color: DIM }}>{label}</div>
      <div style={{ fontSize: 13.5, color: empty ? AMBER : TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', minWidth: 0 }}>
        {empty ? missing || '—' : value}
      </div>
    </div>
  );
}
