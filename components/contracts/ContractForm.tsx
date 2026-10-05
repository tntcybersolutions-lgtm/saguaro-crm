'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ContractField, ContractKind } from '@/lib/document-templates/contract-fields';

/**
 * ContractForm — the blanks, filled in as far as the system can.
 *
 * One shell for all four contracts. The field list, the option sets and the
 * prefilled values all arrive from /api/contracts/prefill, so adding a contract
 * type is a change to lib/document-templates/contract-fields.ts and nothing
 * here.
 *
 * Two rules the whole thing is built around:
 *
 *   1. Autofilled is a starting point, never a lock. Every seeded value is
 *      marked AUTO and stays editable; touching it clears the mark, because a
 *      GC who cannot tell what the system guessed will not trust any of it.
 *   2. Nothing is generated until it has been looked at. The GC edits, presses
 *      Preview, reads the PDF, and only then generates. The old path went
 *      straight from a button to a finished document with no stop in between.
 */

const GOLD = 'var(--brand-primary)';
const TEXT = 'var(--text-primary)';
const DIM = 'var(--text-tertiary)';
const BORDER = 'var(--surface-raised)';
const CARD = 'var(--bg-surface)';
const RAISED = 'rgba(255,255,255,0.04)';

type Values = Record<string, unknown>;

export interface ContractFormProps {
  kind: ContractKind;
  projectId: string;
  subId?: string;
  bidPackageId?: string;
  /** Called with the edited values when the GC generates. */
  onGenerate: (values: Values) => Promise<void>;
  onCancel?: () => void;
}

interface Prefill {
  title: string;
  blurb: string;
  fields: ContractField[];
  values: Values;
  auto: string[];
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: RAISED, border: `1px solid ${BORDER}`, color: TEXT,
  fontSize: 16, // 16 keeps iOS from zooming the page on focus
  outline: 'none', minHeight: 44,
};

export default function ContractForm({
  kind, projectId, subId, bidPackageId, onGenerate, onCancel,
}: ContractFormProps) {
  const [data, setData] = useState<Prefill | null>(null);
  const [values, setValues] = useState<Values>({});
  const [auto, setAuto] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError('');
      try {
        const qs = new URLSearchParams({ kind, projectId });
        if (subId) qs.set('subId', subId);
        if (bidPackageId) qs.set('bidPackageId', bidPackageId);
        const res = await fetch(`/api/contracts/prefill?${qs}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Could not load the contract details.');
        if (cancelled) return;
        setData(body);
        setValues(body.values || {});
        setAuto(new Set<string>(body.auto || []));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the contract details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [kind, projectId, subId, bidPackageId]);

  /* Editing a seeded field clears its AUTO mark — the value is the GC's now. */
  const set = useCallback((key: string, v: unknown) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setAuto((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev); next.delete(key); return next;
    });
  }, []);

  const sections = useMemo(() => {
    if (!data) return [];
    const out: Array<{ section: string; fields: ContractField[] }> = [];
    for (const f of data.fields) {
      let g = out.find((x) => x.section === f.section);
      if (!g) { g = { section: f.section, fields: [] }; out.push(g); }
      g.fields.push(f);
    }
    return out;
  }, [data]);

  const missing = useMemo(() => {
    if (!data) return [];
    return data.fields
      .filter((f) => f.required)
      .filter((f) => {
        const v = values[f.key];
        return v === undefined || v === null || String(v).trim() === '';
      })
      .map((f) => f.label);
  }, [data, values]);

  const submit = async () => {
    if (missing.length) return;
    setBusy(true); setError('');
    try {
      await onGenerate(values);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate the contract.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p style={{ color: DIM, fontSize: 14 }}>Loading what we already know…</p>;
  if (error && !data) return <p style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</p>;
  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h2 style={{ margin: '0 0 4px', color: TEXT, fontSize: 20, fontWeight: 800 }}>{data.title}</h2>
        <p style={{ margin: 0, color: DIM, fontSize: 13.5 }}>{data.blurb}</p>
        {auto.size > 0 && (
          <p style={{ margin: '10px 0 0', color: DIM, fontSize: 12.5 }}>
            <span style={autoChip}>AUTO</span>{' '}
            {auto.size} field{auto.size === 1 ? '' : 's'} filled in from this project. Change anything —
            it is a starting point, not a lock.
          </p>
        )}
      </div>

      {sections.map((sec) => (
        <div key={sec.section} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ color: GOLD, fontSize: 11, fontWeight: 800, marginBottom: 14 }}>
            {sec.section}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {sec.fields.map((f) => (
              <div key={f.key} style={{ flex: f.half ? '1 1 44%' : '1 1 100%', minWidth: 220 }}>
                <label style={labelStyle}>
                  {f.label}
                  {f.required && <span style={{ color: GOLD, marginLeft: 4 }}>*</span>}
                  {auto.has(f.key) && <span style={autoChip}>AUTO</span>}
                </label>
                <FieldControl field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
                {f.hint && <div style={hintStyle}>{f.hint}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {error && <p style={{ color: 'var(--danger)', fontSize: 13.5, margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={submit}
          disabled={busy || missing.length > 0}
          style={{
            minHeight: 44, padding: '0 26px', borderRadius: 9, border: 'none',
            background: missing.length ? 'var(--brand-primary-25)' : GOLD,
            color: 'var(--on-brand)', fontWeight: 800, fontSize: 14,
            cursor: busy || missing.length ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Generating…' : 'Preview & Generate'}
        </button>
        {onCancel && (
          <button onClick={onCancel} style={{ minHeight: 44, padding: '0 20px', borderRadius: 9, background: 'transparent', border: `1px solid ${BORDER}`, color: DIM, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
        )}
        {missing.length > 0 && (
          <span style={{ color: DIM, fontSize: 12.5 }}>
            Still needed: {missing.join(', ')}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── one control per field kind ─────────────────────────────────────────── */

function FieldControl({ field, value, onChange }: {
  field: ContractField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const v = value ?? '';

  switch (field.kind) {
    case 'textarea':
      return (
        <textarea
          value={String(v)}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5, fontSize: 14 }}
        />
      );

    case 'select':
      return (
        <select value={String(v)} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="">Select…</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );

    case 'date':
      return <input type="date" value={String(v).slice(0, 10)} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;

    case 'money':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: DIM, fontSize: 15 }}>$</span>
          <input
            type="number" step="0.01" inputMode="decimal"
            value={String(v)}
            onChange={(e) => onChange(e.target.value)}
            style={inputStyle}
          />
        </div>
      );

    case 'percent':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="number" step="0.1" value={String(v)} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
          <span style={{ color: DIM, fontSize: 15 }}>%</span>
        </div>
      );

    case 'checklist': {
      /* Exclusions. Ticked means "this sub is NOT doing it" — the wording on
         the label says so, because a checklist that reads the other way round
         produces exactly the dispute it was meant to prevent. */
      const picked = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (opt: string) =>
        onChange(picked.includes(opt) ? picked.filter((x) => x !== opt) : [...picked, opt]);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 8, background: RAISED }}>
          {(field.options ?? []).map((opt) => {
            const on = picked.includes(opt);
            return (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '0 6px', cursor: 'pointer', color: on ? TEXT : DIM, fontSize: 13.5 }}>
                <input type="checkbox" checked={on} onChange={() => toggle(opt)} style={{ width: 17, height: 17, accentColor: GOLD, cursor: 'pointer', flex: '0 0 auto' }} />
                {opt}
              </label>
            );
          })}
        </div>
      );
    }

    default:
      return <input type="text" value={String(v)} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
  }
}

const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 11, fontWeight: 700, color: DIM,
  marginBottom: 6,
};

const autoChip: React.CSSProperties = {
  fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
  color: GOLD, background: 'var(--brand-primary-12)',
  border: '1px solid var(--brand-primary-35)',
  borderRadius: 4, padding: '1px 5px',
};

const hintStyle: React.CSSProperties = {
  marginTop: 6, fontSize: 11.5, lineHeight: 1.45, color: 'rgba(139,170,200,0.75)',
};
