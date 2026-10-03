'use client';
import { useMemo, useState } from 'react';
import SaguaroDatePicker from '@/components/SaguaroDatePicker';
import Link from 'next/link';
import { Package, ArrowRight, Plus } from '@phosphor-icons/react';
import { useProjects } from '@/lib/hooks/useProjects';
import { useLongLead, createLongLead, advanceLongLead } from '@/lib/hooks/useFranchise';
import { computeLongLead, lifecycleStage, LONGLEAD_LIFECYCLE, SEVERITY_ORDER, num, type Severity } from '@/lib/franchise';
import {
  C, font, fmtDate, fmtMoney, fmtDays, useFranchiseGate, GateLoading,
  SevDot, SevBadge, Chip, SearchInput, AttentionBanner, Metric, LiftCard,
} from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard, PremiumEmpty, GoldButton, GhostButton, Pill } from '@/components/ui/premium';

const SEV_LABEL: Record<Severity, string> = { red: 'Critical', yellow: 'At Risk', green: 'On Track' };

export default function LongLeadPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { items: raw, loading } = useLongLead();
  const { projects } = useProjects();
  const [filter, setFilter] = useState<'all' | Severity>('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  async function advance(it: any) {
    if (busy[it.id]) return;
    setBusy((b) => ({ ...b, [it.id]: true }));
    try { await advanceLongLead(it.id); } catch { /* noop */ } finally { setBusy((b) => ({ ...b, [it.id]: false })); }
  }

  const rows = useMemo(() => {
    const list = ((raw as any[]) || []).map((it) => ({ it, h: computeLongLead(it) }));
    // Worst-first, then by the tightest order-by date.
    list.sort((a, b) =>
      SEVERITY_ORDER[a.h.severity] - SEVERITY_ORDER[b.h.severity] ||
      (a.h.daysToOrderBy ?? 9999) - (b.h.daysToOrderBy ?? 9999));
    return list;
  }, [raw]);

  const summary = useMemo(() => {
    const s = { green: 0, yellow: 0, red: 0, value: 0, total: rows.length };
    rows.forEach(({ it, h }) => {
      s[h.severity]++;
      const cost = (num(it.unit_cost) ?? 0) * (num(it.quantity) ?? 1);
      s.value += cost;
    });
    return s;
  }, [rows]);

  const filtered = rows.filter(({ it, h }) =>
    (filter === 'all' || h.severity === filter) &&
    (!q || `${it.item_description || ''} ${it.project_name || ''} ${it.po_number || ''}`.toLowerCase().includes(q.toLowerCase())));

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  return (
    <PremiumSurface maxWidth={1280} pad="28px 24px 60px">
      <div style={{ fontFamily: font, color: C.text }}>
      <ModuleHero
        eyebrow="Command Center"
        eyebrowIcon={<Package size={13} weight="fill" color={C.gold} />}
        title="Long-Lead"
        accent="Tracker"
        subtitle="Long-lead items across all sites, by drop-dead order date."
        actions={adding
          ? <GhostButton onClick={() => setAdding(false)}>Close</GhostButton>
          : <GoldButton icon={<Plus size={15} weight="bold" />} onClick={() => setAdding(true)}>Add Item</GoldButton>}
      />

      {adding && <AddItemForm projects={projects} onDone={() => setAdding(false)} />}

      {/* Procurement pulse — severity mix plus committed dollars, all Number()-coerced via num() */}
      {!loading && (
        <StatStrip items={[
          {href: '/app/command-center/long-lead',  label: 'Long-Lead Items', value: String(summary.total), sub: 'Across all sites' },
          {href: '/app/command-center/long-lead',  label: 'On Track', value: String(summary.green), accent: C.green, sub: 'Order date protected' },
          {href: '/app/command-center/risks',  label: 'At Risk', value: String(summary.yellow), accent: summary.yellow > 0 ? C.yellow : undefined, sub: 'Order window closing' },
          {href: '/app/command-center/long-lead',  label: 'Critical', value: String(summary.red), accent: summary.red > 0 ? C.red : undefined, sub: 'Order now' },
          {href: '/app/command-center/budget',  label: 'Committed Value', value: fmtMoney(Number(summary.value) || 0), accent: C.gold, sub: 'Qty times unit cost' },
        ]} />
      )}

      <AttentionBanner red={summary.red} yellow={summary.yellow} noun="item" />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {(['all', 'red', 'yellow', 'green'] as const).map((f) => (
          <Chip key={f} active={filter === f} color={f === 'all' ? C.text : ({ red: C.red, yellow: C.yellow, green: C.green } as any)[f]}
            onClick={() => setFilter(f)} count={f === 'all' ? summary.total : (summary as any)[f]}>
            {f !== 'all' && <SevDot sev={f as Severity} size={8} />}
            {f === 'all' ? 'All' : SEV_LABEL[f as Severity]}
          </Chip>
        ))}
        <SearchInput value={q} onChange={setQ} placeholder="Search item, site, PO…" />
      </div>

      {loading ? (
        <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>Loading procurement…</div>
      ) : filtered.length === 0 ? (
        rows.length === 0 ? (
          <SectionCard>
            <PremiumEmpty icon={<Package size={32} weight="duotone" color={C.gold} />} title="No long-lead items yet"
              description="Track switchgear, rooftop units, elevators, simulator bays — anything with a long lead time. The tracker computes each item's drop-dead order date and flags what to order now."
              action={<GoldButton icon={<Plus size={15} weight="bold" />} onClick={() => setAdding(true)}>Add Your First Item</GoldButton>} />
          </SectionCard>
        ) : (
          <SectionCard flat>
            <PremiumEmpty compact icon={<Package size={26} weight="duotone" color={C.gold} />} title="Nothing matches this filter"
              description="No item matches the current severity or search. Clear the filters to see the full tracker." />
          </SectionCard>
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {filtered.map(({ it, h }) => (
            <LiftCard key={it.id} sev={h.severity}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.item_description || 'Untitled Item'}</div>
                  <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                    {it.project_id ? (
                      <Link href={`/app/projects/${it.project_id}`} style={{ color: C.blue, textDecoration: 'none' }}>{it.project_name || 'Project'}</Link>
                    ) : 'Unassigned'}
                    {it.project_city ? ` · ${it.project_city}, ${it.project_state}` : ''}
                  </div>
                </div>
                <SevBadge sev={h.severity} label={h.label} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 13 }}>
                <Metric label="Order By" value={fmtDate(h.orderByDate)} color={h.daysToOrderBy != null && h.daysToOrderBy <= 0 ? C.red : h.daysToOrderBy != null && h.daysToOrderBy <= 14 ? C.yellow : C.text} />
                <Metric label="Need on Site" value={fmtDate(it.needed_by_date)} />
                <Metric label="Lead Time" value={it.lead_time_days != null ? `${it.lead_time_days}d` : '—'} />
                <Metric label="ETA" value={fmtDate(h.eta)} />
                <Metric label="Qty" value={it.quantity != null ? `${num(it.quantity)}${it.unit ? ' ' + it.unit : ''}` : '—'} />
                <Metric label="Status" value={it.status || '—'} />
              </div>

              {/* 6-stage procurement lifecycle: Ordered → Released → Manufactured → Shipped → Delivered → Installed */}
              {(() => {
                const lc = lifecycleStage(it.status);
                const isLast = lc.index >= LONGLEAD_LIFECYCLE.length - 1;
                const fill = lc.index >= 5 ? C.green : C.gold;
                return (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.dim }}>{lc.label} · Stage {lc.index + 1}/6</span>
                      {!isLast && (
                        <button onClick={() => advance(it)} disabled={busy[it.id]} style={{ fontSize: 11, fontWeight: 700, color: busy[it.id] ? C.dim : C.blue, background: 'none', border: 'none', cursor: busy[it.id] ? 'default' : 'pointer' }}>Advance <ArrowRight size={12} weight="regular" color={busy[it.id] ? C.dim : C.blue} style={{ verticalAlign: 'middle' }} /></button>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {LONGLEAD_LIFECYCLE.map((s, i) => (
                        <div key={i} title={s} style={{ flex: 1, height: 5, borderRadius: 3, background: i <= lc.index ? fill : 'var(--bg-surface-2)' }} />
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12, alignItems: 'center' }}>
                {it.po_number && <Pill tone="neutral">PO {it.po_number}</Pill>}
                {it.unit_cost != null && <Pill tone="gold">{fmtMoney((num(it.unit_cost) ?? 0) * (num(it.quantity) ?? 1))}</Pill>}
                {h.daysToOrderBy != null && h.severity !== 'green' && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.dim, marginLeft: 'auto' }}>Order {fmtDays(h.daysToOrderBy)}</span>
                )}
              </div>
            </LiftCard>
          ))}
        </div>
      )}
      </div>
    </PremiumSurface>
  );
}

function AddItemForm({ projects, onDone }: { projects: any[]; onDone: () => void }) {
  const [f, setF] = useState<Record<string, any>>({ status: 'pending', is_long_lead: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', background: 'var(--bg-surface-2)', width: '100%' };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.dim, marginBottom: 4, display: 'block' };

  async function submit() {
    if (!f.project_id || !f.item_description) { setErr('Site and item description are required.'); return; }
    setBusy(true); setErr('');
    try { await createLongLead(f); onDone(); }
    catch (e: any) { setErr(e?.message || "Couldn't save the item. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <SectionCard title="Add Long-Lead Item" subtitle="The tracker computes the drop-dead order date from need-by minus lead time." icon={<Package size={16} weight="duotone" color={C.gold} />} style={{ marginBottom: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={lbl}>Item Description *</label>
          <input style={inp} placeholder="e.g. 2000A switchgear, Trackman sim bays" value={f.item_description || ''} onChange={(e) => set('item_description', e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Site *</label>
          <select style={inp} value={f.project_id || ''} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">Select site…</option>
            {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Vendor / PO #</label><input style={inp} value={f.po_number || ''} onChange={(e) => set('po_number', e.target.value)} /></div>
        <div><label style={lbl}>Needed on Site</label><SaguaroDatePicker style={inp} value={f.needed_by_date || ''} onChange={(v) => set('needed_by_date', v)} /></div>
        <div><label style={lbl}>Lead Time (Days)</label><input type="number" style={inp} value={f.lead_time_days || ''} onChange={(e) => set('lead_time_days', e.target.value)} /></div>
        <div><label style={lbl}>Expected Delivery</label><SaguaroDatePicker style={inp} value={f.expected_delivery_date || ''} onChange={(v) => set('expected_delivery_date', v)} /></div>
        <div><label style={lbl}>Qty</label><input type="number" style={inp} value={f.quantity || ''} onChange={(e) => set('quantity', e.target.value)} /></div>
        <div><label style={lbl}>Unit</label><input style={inp} placeholder="ea / lot" value={f.unit || ''} onChange={(e) => set('unit', e.target.value)} /></div>
        <div><label style={lbl}>Unit Cost</label><input type="number" style={inp} value={f.unit_cost || ''} onChange={(e) => set('unit_cost', e.target.value)} /></div>
        <div>
          <label style={lbl}>Status</label>
          <select style={inp} value={f.status || 'pending'} onChange={(e) => set('status', e.target.value)}>
            {['pending', 'quoted', 'ordered', 'in production', 'shipped', 'delivered'].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>
      {err && <div style={{ color: C.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <GoldButton size="md" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save Item'}</GoldButton>
        <GhostButton size="md" onClick={onDone}>Cancel</GhostButton>
      </div>
    </SectionCard>
  );
}
