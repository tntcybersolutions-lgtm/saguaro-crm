'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { useFinancials } from '@/lib/hooks/useFranchise';
import { C, font, fmtMoney, fmtMoneyShort, useFranchiseGate, GateLoading } from '@/components/franchise/kit';
import { PremiumSurface, ModuleHero, StatStrip, PremiumEmpty } from '@/components/ui/premium';
import { CheckCircle, FileText, Bank } from '@phosphor-icons/react';

export default function FinancialsPage() {
  const { ready, loading: gateLoading } = useFranchiseGate();
  const { financials, loading } = useFinancials();

  const totals = useMemo(() => {
    const f = financials as any[];
    // DB numerics can round-trip as strings — everything goes through Number().
    return {
      retainage: f.reduce((s, x) => s + (Number(x.retainageHeld) || 0), 0),
      lienCollected: f.reduce((s, x) => s + (Number(x.lienCollected) || 0), 0),
      lienTotal: f.reduce((s, x) => s + (Number(x.lienTotal) || 0), 0),
      wip: f.reduce((s, x) => s + (Number(x.actual) || 0), 0),
      tiReady: f.filter((x) => x.tiReady).length,
      sites: f.length,
    };
  }, [financials]);

  if (gateLoading) return <GateLoading />;
  if (!ready) return null;

  return (
    <PremiumSurface maxWidth={1100} pad="28px 24px 60px">
      <div style={{ fontFamily: font, color: C.text }}>
      <ModuleHero
        eyebrow="Portfolio Money"
        eyebrowIcon={<Bank size={13} weight="fill" color={C.gold} />}
        title="Financial"
        accent="Controls"
        subtitle="Retainage, lien releases, and TI readiness per location."
      />

      {/* Money pulse — dense strip from the live financial rollup */}
      <StatStrip items={[
        {href: '/app/command-center/financials',  label: 'Retainage Held', value: fmtMoneyShort(totals.retainage), accent: C.gold, sub: 'released at closeout' },
        {href: '/app/command-center/financials',  label: 'Work in Place', value: fmtMoneyShort(totals.wip), sub: `across ${totals.sites} site${totals.sites === 1 ? '' : 's'}` },
        {href: '/app/command-center/financials',  label: 'Lien Waivers', value: `${totals.lienCollected}/${totals.lienTotal}`, accent: totals.lienTotal > 0 && totals.lienCollected < totals.lienTotal ? C.yellow : undefined, sub: totals.lienTotal > 0 && totals.lienCollected < totals.lienTotal ? `${totals.lienTotal - totals.lienCollected} still outstanding` : 'all releases on file' },
        {href: '/app/command-center/financials',  label: 'Sites TI-Ready', value: String(totals.tiReady), accent: totals.tiReady ? C.green : undefined, sub: 'reimbursement package complete' },
      ]} />

      {loading ? <div style={{ color: C.dim, padding: 40, textAlign: 'center' }}>Loading…</div>
      : (financials as any[]).length === 0 ? (
        <PremiumEmpty
          icon={<FileText size={34} weight="duotone" color={C.gold} />}
          title="No financial data yet"
          description="This screen fills itself: bill work through pay applications and retainage accrues here automatically; lien waivers count up as subs sign; TI readiness flips green when the closeout package is complete. Nothing to type — just run the jobs."
        />
      )
      : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {(financials as any[]).map((f) => (
            <div key={f.project_id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
              <Link href={`/app/projects/${f.project_id}`} style={{ fontSize: 15, fontWeight: 800, color: C.text, textDecoration: 'none' }}>{f.project_name}</Link>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                <Metric label="Retainage Held" value={fmtMoney(f.retainageHeld)} color={C.gold} />
                <Metric label="Work in Place" value={fmtMoneyShort(f.actual)} />
                <Metric label="Lien Releases" value={`${f.lienCollected}/${f.lienTotal}`} color={f.lienTotal && f.lienCollected < f.lienTotal ? C.yellow : C.text} />
                <Metric label="TI Reimbursement" value={f.tiTotal ? `${f.tiPct}%` : '—'} color={f.tiReady ? C.green : f.tiPct > 0 ? C.yellow : C.dim} />
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Closeout / TI package readiness</div>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${f.tiPct}%`, background: f.tiReady ? C.green : C.gold }} />
                </div>
              </div>
              {f.tiReady && <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: C.green }}><span style={{ display: 'inline-flex', verticalAlign: 'middle' }}><CheckCircle size={13} weight="fill" color={C.green} /></span> TI reimbursement package ready</div>}
            </div>
          ))}
        </div>
      )}
      </div>
    </PremiumSurface>
  );
}

function Metric({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return <div>
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: C.faint }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 800, color: color || C.text, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>;
}
