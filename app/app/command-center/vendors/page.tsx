'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { useLongLead } from '@/lib/hooks/useFranchise';
import { computeLongLead, num, type Severity } from '@/lib/franchise';
import { C, font, fmtDate, fmtMoneyShort, useFranchiseGate, GateLoading, SevBadge } from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, SectionCard, PremiumEmpty } from '@/components/ui/premium';
import { Truck, Wrench, Package } from '@phosphor-icons/react';

const todayMs = () => Date.parse(new Date().toISOString().slice(0, 10));
const bestDate = (it: any) => it.expected_delivery_date || it.delivery_appointment || it.needed_by_date || null;
const daysOut = (d: any) => { if (!d) return null; const t = Date.parse(String(d)); return isNaN(t) ? null : Math.round((t - todayMs()) / 86400000); };
const isInstall = (desc: string) => /full-?swing|simulat|launch monitor|projector|\bav\b|screen|turf|signage|hvac|rtu|switchgear|elevator/i.test(String(desc || ''));

const BUCKETS = [
  { key: 'delivered', label: 'Delivered', color: C.green },
  { key: 'soon', label: 'Next 30 Days', color: 'var(--warning)' },
  { key: 'mid', label: '30–90 Days', color: C.blue },
  { key: 'later', label: 'Beyond 90 Days', color: C.dim },
];

export default function VendorsPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { items, loading } = useLongLead();

  const rows = useMemo(() => (items as any[]).map((it) => {
    const h = computeLongLead(it);
    const bd = bestDate(it);
    const d = daysOut(bd);
    let bucket: string;
    if (h.state === 'delivered') bucket = 'delivered';
    else if (d != null && d <= 30) bucket = 'soon';
    else if (d != null && d <= 90) bucket = 'mid';
    else bucket = 'later';
    return { it, h, bd, d, bucket };
  }).sort((a, b) => (a.d ?? 99999) - (b.d ?? 99999)), [items]);

  const summary = useMemo(() => {
    const upcoming = rows.filter((r) => r.bucket === 'soon' && r.h.state !== 'delivered').length;
    const atRisk = rows.filter((r) => r.h.severity !== 'green').length;
    const delivered = rows.filter((r) => r.h.state === 'delivered').length;
    const value = rows.reduce((s, r) => s + (num(r.it.unit_cost) ?? 0) * (num(r.it.quantity) ?? 1), 0);
    return { total: rows.length, upcoming, atRisk, delivered, value };
  }, [rows]);

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  return (
    <PremiumSurface maxWidth={2200} pad="28px 24px 60px">
      <div style={{ fontFamily: font, color: C.text }}>
        <ModuleHero
          eyebrow="Command Center"
          eyebrowIcon={<Truck size={13} weight="fill" />}
          title="Vendor & Install"
          accent="Schedule"
          subtitle="Every delivery and install across all sites, on one timeline."
        />

        {!loading && rows.length > 0 && (
          <StatStrip items={[
            {href: '/app/command-center/vendors',  label: 'Scheduled Items', value: String(summary.total), icon: <Truck size={11} weight="bold" /> },
            {href: '/app/command-center/vendors',  label: 'Next 30 Days', value: String(summary.upcoming), accent: summary.upcoming > 0 ? C.yellow : undefined },
            {href: '/app/command-center/risks',  label: 'At Risk', value: String(summary.atRisk), accent: summary.atRisk ? C.red : C.green },
            {href: '/app/command-center/vendors',  label: 'Delivered', value: String(summary.delivered), accent: C.green },
            {href: '/app/command-center/budget',  label: 'Committed Value', value: fmtMoneyShort(summary.value), accent: C.gold },
          ]} />
        )}

        {loading ? (
          <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <SectionCard flat>
            <PremiumEmpty
              icon={<Truck size={32} weight="duotone" color={C.gold} />}
              title="No vendor deliveries scheduled"
              description="Long-lead procurement and equipment installs (Full-Swing, AV, switchgear) appear here as a coordinated cross-site timeline."
            />
          </SectionCard>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {BUCKETS.map((b) => {
              const list = rows.filter((r) => r.bucket === b.key);
              if (!list.length) return null;
              return (
                <SectionCard
                  key={b.key}
                  accent={b.color}
                  title={
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />
                      {b.label}
                    </span>
                  }
                  subtitle={`${list.length} item${list.length === 1 ? '' : 's'}`}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
                    {list.map(({ it, h, bd }) => (
                      <div key={it.id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.07)`, borderLeft: `4px solid ${h.severity === 'red' ? C.red : h.severity === 'yellow' ? C.yellow : C.green}`, borderRadius: 12, padding: '13px 15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 800 }}>{isInstall(it.item_description) ? <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><Wrench size={16} weight="regular" color={C.text} /></span> : <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><Package size={16} weight="regular" color={C.text} /></span>}{it.item_description}</div>
                            <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                              {it.project_id ? <Link href={`/app/projects/${it.project_id}`} style={{ color: C.blue, textDecoration: 'none' }}>{it.project_name || 'Site'}</Link> : 'Site'}
                              {it.po_number ? ` · PO ${it.po_number}` : ''}
                            </div>
                          </div>
                          <SevBadge sev={h.severity as Severity} label={h.state === 'delivered' ? 'Delivered' : h.label} />
                        </div>
                        <div style={{ display: 'flex', gap: 14, marginTop: 11, fontSize: 12, color: C.dim, flexWrap: 'wrap' }}>
                          <span><b style={{ color: C.text }}>Target:</b> {fmtDate(bd)}</span>
                          <span>Need: {fmtDate(it.needed_by_date)}</span>
                          {it.lead_time_days != null && <span>Lead {it.lead_time_days}d</span>}
                          {it.quantity != null && <span>{num(it.quantity)}{it.unit ? ` ${it.unit}` : ''}</span>}
                          <span style={{ textTransform: 'capitalize' }}>{it.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              );
            })}
          </div>
        )}
      </div>
    </PremiumSurface>
  );
}
