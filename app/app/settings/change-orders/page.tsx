'use client';
/**
 * Settings → Change Order Approvals. Who can approve a change order, by its
 * size: each tier is a dollar limit, the level an approver needs, and how many
 * of them. The ladder at the top is the rule at a glance; the rows under it
 * edit it. The server enforces the same tiers on every approve path
 * (lib/change-order-status), so this screen is the rule, not a suggestion.
 *
 *   GET /api/settings/co-approval-tiers → { tiers, isSet, suggested, canEdit }
 *   PUT /api/settings/co-approval-tiers { tiers }   (Admin: Full)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash, Minus } from '@phosphor-icons/react';
import { PageShell, Button, Input, Toast, useToast, EmptyState } from '@/components/ui/kit';
import { humanError } from '@/lib/errors';
import { validateTiers, tierRange, TIER_LEVELS, type CoTier, type TierLevel } from '@/lib/change-order-tiers';

const WHO: Record<TierLevel, string> = { Edit: 'Edit', Full: 'Full', Admin: 'Admin' };
const WHO_LONG: Record<TierLevel, string> = { Edit: 'Change Orders: Edit', Full: 'Change Orders: Full', Admin: 'Company admin' };
const short = (n: number) => n >= 1000000 ? `$${+(n / 1000000).toFixed(1)}M` : n >= 1000 ? `$${+(n / 1000).toFixed(1)}k` : `$${n}`;

type Draft = { upTo: string; level: TierLevel; approvers: number };
const toDraft = (t: CoTier[]): Draft[] => t.map((x) => ({ upTo: x.upTo === null ? '' : String(x.upTo), level: x.level, approvers: x.approvers }));
const fromDraft = (d: Draft[]): unknown[] => d.map((x, i) => ({ upTo: i === d.length - 1 ? null : x.upTo === '' ? 0 : Number(x.upTo), level: x.level, approvers: x.approvers }));

export default function CoApprovalTiersPage() {
  const { toast, show } = useToast(3500);
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [suggested, setSuggested] = useState<CoTier[]>([]);
  const [isSet, setIsSet] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    try {
      const r = await fetch('/api/settings/co-approval-tiers', { credentials: 'include', cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || "Couldn't load your approval tiers."); return; }
      const draft = toDraft(d.tiers as CoTier[]);
      setRows(draft); setSaved(JSON.stringify(draft));
      setSuggested(d.suggested || []); setIsSet(!!d.isSet); setCanEdit(!!d.canEdit);
    } catch (e) {
      setErr(humanError(e, "Couldn't load your approval tiers. Check your connection."));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const check = useMemo(() => (rows ? validateTiers(fromDraft(rows)) : null), [rows]);
  const preview: CoTier[] = check && check.ok ? check.tiers : [];
  const dirty = rows ? JSON.stringify(rows) !== saved : false;

  const set = (i: number, patch: Partial<Draft>) => setRows((r) => (r ? r.map((x, k) => (k === i ? { ...x, ...patch } : x)) : r));
  const add = () => setRows((r) => {
    if (!r) return r;
    const capped = r.slice(0, -1);
    const last = capped.length ? Number(capped[capped.length - 1].upTo) || 0 : 0;
    return [...capped, { upTo: String(last ? last * 2 : 10000), level: 'Full', approvers: 1 }, r[r.length - 1]];
  });
  const remove = (i: number) => setRows((r) => (r && r.length > 1 ? r.filter((_, k) => k !== i) : r));

  const save = async () => {
    if (!rows || !check) return;
    if (!check.ok) { show(check.error, 'bad'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/settings/co-approval-tiers', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tiers: check.tiers }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { show(d.error || "Couldn't save your approval tiers.", 'bad'); return; }
      const draft = toDraft(d.tiers as CoTier[]);
      setRows(draft); setSaved(JSON.stringify(draft)); setIsSet(true);
      show('Saved. Every approval follows these tiers now.');
    } catch (e) {
      show(humanError(e, "Couldn't save your approval tiers."), 'bad');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell
      width="form"
      title="Change Order Approvals"
      subtitle="Who can approve a change order, by its size."
      crumbs={[{ label: 'Settings', href: '/app/settings' }, { label: 'Change Order Approvals' }]}
      actions={canEdit ? <Button variant="primary" onClick={() => void save()} disabled={saving || !dirty || !check?.ok}>{saving ? 'Saving…' : 'Save Tiers'}</Button> : undefined}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Toast message={toast?.message ?? null} tone={toast?.tone} />
      {err && <EmptyState title={err} action={<Button onClick={() => void load()}>Try again</Button>} />}
      {!err && !rows && <div className="cat-loading" aria-busy="true">Loading…</div>}
      {rows && (
        <>
          {/* The rule at a glance: one band per tier, darker as it climbs. */}
          <ol className="cat-ladder" aria-label="Approval ladder">
            {(preview.length ? preview : []).map((t, i) => (
              <li key={i} style={{ ['--tier' as string]: `${30 + Math.round((70 * (i + 1)) / Math.max(1, preview.length))}%` } as React.CSSProperties}>
                <span className="cat-band" aria-hidden />
                <span className="cat-amt">{t.upTo === null ? (i === 0 ? 'Any amount' : `${short(preview[i - 1].upTo as number)}+`) : `≤ ${short(t.upTo)}`}</span>
                <span className="cat-who">{t.approvers} × {WHO_LONG[t.level]}</span>
              </li>
            ))}
          </ol>
          {!isSet && <p className="cat-note">Not set up yet — today one person with Change Orders: Full approves any amount.</p>}

          <ul className="cat-rows">
            {rows.map((r, i) => {
              const last = i === rows.length - 1;
              return (
                <li key={i} className="cat-row">
                  <div className="cat-limit">
                    {last ? (
                      <span className="cat-open">{preview.length ? tierRange(preview, preview.length - 1) : 'Above'}</span>
                    ) : (
                      <label>
                        <span className="cat-lbl">Up to</span>
                        <Input type="number" inputMode="decimal" min={1} step="1" value={r.upTo} disabled={!canEdit} onChange={(e) => set(i, { upTo: e.target.value })} aria-label={`Tier ${i + 1} limit in dollars`} />
                      </label>
                    )}
                  </div>
                  <div className="k-tabs cat-level" role="radiogroup" aria-label={`Tier ${i + 1}: who approves`}>
                    {TIER_LEVELS.map((lv) => (
                      <button key={lv} type="button" role="radio" className="k-tab" aria-checked={r.level === lv} aria-selected={r.level === lv} disabled={!canEdit} onClick={() => set(i, { level: lv })}>{WHO[lv]}</button>
                    ))}
                  </div>
                  <div className="cat-count" aria-label={`Tier ${i + 1}: approvers`}>
                    <button type="button" className="cat-step" disabled={!canEdit || r.approvers <= 1} onClick={() => set(i, { approvers: r.approvers - 1 })} aria-label="One fewer approver"><Minus size={16} weight="bold" /></button>
                    <span className="cat-n">{r.approvers}</span>
                    <button type="button" className="cat-step" disabled={!canEdit || r.approvers >= 5} onClick={() => set(i, { approvers: r.approvers + 1 })} aria-label="One more approver"><Plus size={16} weight="bold" /></button>
                  </div>
                  {canEdit && !last ? (
                    <button type="button" className="cat-step cat-del" onClick={() => remove(i)} aria-label={`Remove tier ${i + 1}`}><Trash size={16} /></button>
                  ) : <span className="cat-del" aria-hidden />}
                </li>
              );
            })}
          </ul>
          {check && !check.ok && <p className="cat-err" role="alert">{check.error}</p>}
          {canEdit && (
            <div className="cat-more">
              <Button variant="ghost" icon={<Plus size={15} />} onClick={add} disabled={rows.length >= 8}>Add a tier</Button>
              {suggested.length > 0 && <Button variant="ghost" onClick={() => setRows(toDraft(suggested))}>Use $10k / $50k ladder</Button>}
            </div>
          )}
          {!canEdit && <p className="cat-note">Only a company admin can change these.</p>}
        </>
      )}
    </PageShell>
  );
}

const CSS = `
.cat-loading{color:var(--text-secondary);font-size:14px;padding:16px 0}
.cat-ladder{list-style:none;margin:0 0 8px;padding:0;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:4px}
.cat-ladder li{display:flex;flex-direction:column;gap:6px;min-width:0}
.cat-band{display:block;height:12px;border-radius:4px;background:color-mix(in srgb, var(--chart-1) var(--tier), transparent)}
.cat-amt{font-size:22px;font-weight:800;color:var(--text-primary);font-variant-numeric:tabular-nums}
.cat-who{font-size:13px;color:var(--text-secondary);overflow-wrap:anywhere}
.cat-note{font-size:13px;color:var(--text-secondary);margin:4px 0 0}
.cat-rows{list-style:none;margin:16px 0 0;padding:0;border-top:1px solid var(--border-default)}
.cat-row{display:grid;grid-template-columns:minmax(140px,1fr) auto auto 44px;align-items:center;gap:12px 16px;padding:12px 0;border-bottom:1px solid var(--border-default)}
.cat-limit label{display:flex;align-items:center;gap:8px}
.cat-lbl{font-size:13px;font-weight:600;color:var(--text-tertiary);white-space:nowrap}
.cat-limit .k-input{max-width:160px}
.cat-open{font-size:15px;font-weight:700;color:var(--text-primary)}
.cat-count{display:inline-flex;align-items:center;gap:8px}
.cat-n{min-width:20px;text-align:center;font-size:18px;font-weight:800;color:var(--text-primary);font-variant-numeric:tabular-nums}
.cat-step{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:10px;border:1px solid var(--border-default);background:transparent;color:var(--text-primary);cursor:pointer}
.cat-step:hover:not(:disabled){background:var(--action-secondary-hover)}
.cat-step:disabled{color:var(--text-tertiary);cursor:default}
.cat-step:focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}
.cat-del{width:44px;height:44px}
.cat-err{color:var(--danger);font-size:14px;margin:12px 0 0}
.cat-more{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
@media (max-width:640px){
  .cat-ladder{grid-auto-flow:row;grid-auto-columns:auto}
  .cat-row{grid-template-columns:minmax(0,1fr) 44px}
  .cat-level,.cat-count{grid-column:1/2}
  .cat-limit .k-input{max-width:none}
}
`;
