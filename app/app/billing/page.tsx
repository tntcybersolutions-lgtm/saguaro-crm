'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { safeJsonParse } from '@/lib/safe-json';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/Skeleton';
import { CheckCircle, Warning, CreditCard, DeviceMobile, Question, Lightning, PuzzlePiece } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, PremiumEmpty, StatStrip, goldButtonStyle, ghostButtonStyle, goldOutlineButtonStyle } from '@/components/ui/premium';
import { ADDONS, type AddonDef } from '@/lib/addons';

const GOLD   = 'var(--brand-primary)';
const RAISED = 'var(--bg-surface)';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM    = '#CBD5E1';
const TEXT   = '#FFFFFF';
const GREEN  = '#2CFF7A';
const RED    = '#FF3B30';

// Semantic (destructive) button presets — kit-shaped but intentionally red,
// so the Cancel / Update-Payment actions stay meaningful instead of gold.
const dangerGhostStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '11px 18px', borderRadius: 12, cursor: 'pointer',
  background: 'rgba(255,59,48,0.10)', color: RED, border: '1px solid rgba(255,59,48,0.32)',
  fontWeight: 700, fontSize: 13.5,
};
const dangerSolidStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '11px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
  background: `linear-gradient(135deg, ${RED}, #FF3B30)`, color: '#fff',
  fontWeight: 800, fontSize: 13.5, boxShadow: '0 10px 26px -10px rgba(255,59,48,0.6)',
};

interface Subscription {
  plan_id: string | null;
  plan_name: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused';
  billing_interval: 'monthly' | 'annual';
  price_cents: number;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
}

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price_mo: 499,
    price_yr: 449,
    tagline: 'Up to 15 projects · 150 AI pages/mo',
    features: ['Unlimited users', '15 active projects', 'AI Takeoff 150 pages/mo', 'G702/G703 Pay Apps', 'Lien Waivers all 50 states', 'Mobile iOS app', 'Free migration', 'Email support'],
  },
  {
    id: 'professional',
    name: 'Professional',
    price_mo: 750,
    price_yr: 650,
    tagline: 'Unlimited projects · Unlimited AI · Full compliance suite',
    popular: true,
    features: ['Unlimited projects', 'Unlimited AI Takeoff', 'All AIA Documents', 'Certified Payroll WH-347', 'ACORD 25 / COI Parser', 'Owner & Sub Portals', 'Bid Intelligence', 'Priority support'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price_mo: 0,
    price_yr: 0,
    tagline: 'Custom pricing · White label · Dedicated CSM',
    features: ['Everything in Professional', 'White Label', 'QuickBooks Sync', 'Custom API', 'SAML SSO', 'Dedicated account manager', '99.9% SLA'],
  },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    trialing:  { label: 'Free Trial',  bg: 'var(--brand-primary-12)', color: GOLD },
    active:    { label: 'Active',      bg: 'rgba(44,255,122,0.12)',  color: GREEN },
    past_due:  { label: 'Past Due',    bg: 'rgba(255,59,48,0.12)',  color: RED },
    canceled:  { label: 'Canceled',    bg: 'rgba(110,110,115,0.1)', color: DIM },
    paused:    { label: 'Paused',      bg: 'rgba(110,110,115,0.1)', color: DIM },
  };
  const s = map[status] ?? map.active;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

export default function BillingPage() {
  const [sub, setSub] = useState<Subscription | null>(null);
  // Raw envelope extras (plan limits + current-period usage + renewal countdown)
  // from GET /api/billing/subscription — surfaced in the account stat strip.
  const [envelope, setEnvelope] = useState<{ usage: any; plan: any; daysUntilRenewal: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [annual, setAnnual] = useState(false);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Plan & Add-ons ─────────────────────────────────────────────────────────
  // Entitlement rows for this tenant (GET /api/entitlements). A row with
  // status 'requested' is the persisted enable-request marker — the server
  // gate (hasEntitlement) fails closed on it, so it never turns anything on.
  const [ents, setEnts] = useState<{ feature_key: string; status: string; expires_at: string | null }[] | null>(null);
  const [entError, setEntError] = useState(false);
  const [requesting, setRequesting] = useState<string | null>(null);
  // Disable requests are notifications-only (the entitlement row deliberately
  // stays 'active' until support processes them), so the pending chip state
  // lives in localStorage — honest copy explains it below.
  const [disableReqs, setDisableReqs] = useState<Record<string, string>>({});

  const loadSubscription = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/billing/subscription');
      if (!res.ok) {
        setError(true);
        setSub(null);
        return;
      }
      const data = await res.json();
      // GET /api/billing/subscription returns a nested envelope:
      //   { hasSubscription, subscription, usage, isActive, ... }
      // The subscription row itself carries plan_id + a joined plans({ name, ... })
      // relation — NOT a top-level plan_name. Flatten it into the shape this page
      // renders so the plan card + Manage/Cancel/Update-Payment buttons show for
      // real subscribers instead of falling through to "No active subscription".
      if (!data?.hasSubscription || !data?.subscription) {
        setEnvelope(null);
        setSub(null);
        return;
      }
      const s = data.subscription;
      const planRel = Array.isArray(s.plans) ? s.plans[0] : s.plans;
      setEnvelope({
        usage: data.usage ?? null,
        plan: planRel ?? null,
        daysUntilRenewal: data.daysUntilRenewal != null ? Number(data.daysUntilRenewal) : null,
      });
      setSub({
        plan_id: s.plan_id ?? null,
        plan_name: planRel?.name ?? s.plan_id ?? 'Subscription',
        status: s.status,
        billing_interval: s.billing_interval ?? 'monthly',
        price_cents: s.price_cents ?? 0,
        trial_ends_at: s.trial_ends_at ?? null,
        current_period_end: s.current_period_end ?? null,
        cancel_at: s.cancel_at ?? null,
      });
    } catch {
      setError(true);
      setSub(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEntitlements = useCallback(async () => {
    setEntError(false);
    try {
      const res = await fetch('/api/entitlements');
      if (!res.ok) { setEntError(true); setEnts([]); return; }
      const data = await res.json().catch(() => ({}));
      setEnts(Array.isArray(data.entitlements) ? data.entitlements : []);
    } catch {
      setEntError(true);
      setEnts([]);
    }
  }, []);

  useEffect(() => {
    loadSubscription();
    loadEntitlements();
    try {
      setDisableReqs(safeJsonParse<Record<string, any>>(window.localStorage.getItem('saguaro_addon_disable_requests'), {}));
    } catch { /* unreadable localStorage — start clean */ }
  }, [loadSubscription, loadEntitlements]);

  // Mirror of the server gate (lib/entitlements.ts hasEntitlement) so chips
  // match what routes will actually allow.
  const addonState = (key: string): { state: 'active' | 'trial' | 'requested' | 'off'; expiresAt: string | null } => {
    const row = (ents || []).find(e => e.feature_key === key);
    if (!row) return { state: 'off', expiresAt: null };
    const future = row.expires_at ? new Date(row.expires_at).getTime() > Date.now() : null;
    if (row.status === 'active' && (future === null || future)) return { state: 'active', expiresAt: row.expires_at };
    if (row.status === 'trial' && future) return { state: 'trial', expiresAt: row.expires_at };
    if (row.status === 'requested') return { state: 'requested', expiresAt: null };
    return { state: 'off', expiresAt: null };
  };

  const requestAddon = async (addon: AddonDef, action: 'enable' | 'disable') => {
    setActionError(null);
    setRequesting(addon.key);
    try {
      const res = await fetch('/api/billing/addon-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureKey: addon.key, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        if (action === 'disable') {
          const next = { ...disableReqs, [addon.key]: new Date().toISOString() };
          setDisableReqs(next);
          try { window.localStorage.setItem('saguaro_addon_disable_requests', JSON.stringify(next)); } catch { /* non-fatal */ }
        }
        await loadEntitlements();
      } else {
        setActionError(data.error || `Could not submit the ${addon.name} request. Please try again or email support@saguarocontrol.net.`);
      }
    } catch {
      setActionError(`Could not submit the ${addon.name} request. Please check your connection and try again.`);
    }
    setRequesting(null);
  };

  const daysLeft = (dateStr: string | null) => {
    if (!dateStr) return null;
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
    return diff > 0 ? diff : 0;
  };

  const handleUpgrade = async (planId: string) => {
    if (planId === 'enterprise') {
      window.location.href = 'mailto:sales@saguarocontrol.net?subject=Enterprise Inquiry';
      return;
    }
    setActionError(null);
    setUpgrading(planId);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, interval: annual ? 'annual' : 'monthly', successUrl: `${window.location.origin}/app/billing?success=1`, cancelUrl: `${window.location.origin}/app/billing` }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return; // navigating away — keep the spinner until the page unloads
      }
      setActionError(data.error || 'Could not start checkout. Please try again or contact support.');
    } catch {
      setActionError('Could not start checkout. Please check your connection and try again.');
    }
    setUpgrading(null);
  };

  const handlePortal = async () => {
    setActionError(null);
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnUrl: `${window.location.origin}/app/billing` }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.portalUrl) {
        window.location.href = data.portalUrl;
        return; // navigating away — keep the spinner until the page unloads
      }
      setActionError(data.error || 'Could not open the billing portal. Please try again.');
    } catch {
      setActionError('Could not open the billing portal. Please check your connection and try again.');
    }
    setPortalLoading(false);
  };

  const handleCancel = async () => {
    setActionError(null);
    setCanceling(true);
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        window.location.reload();
        return; // reloading — leave the modal/spinner until the page unloads
      }
      setActionError(data.error || 'Could not cancel your subscription. Please try again or contact support.');
    } catch {
      setActionError('Could not cancel your subscription. Please check your connection and try again.');
    }
    setCanceling(false);
    setShowCancel(false);
  };

  const trialDays = sub?.trial_ends_at ? daysLeft(sub.trial_ends_at) : null;
  const periodDays = sub?.current_period_end ? daysLeft(sub.current_period_end) : null;
  // Match the DB plan id first (canonical: 'starter' | 'professional' | 'enterprise'),
  // falling back to the display name — so the "Current Plan" badge + upgrade CTA are correct.
  const currentPlanName = (sub?.plan_id ?? sub?.plan_name ?? '').toLowerCase();

  // Real account totals — Number-coerced because price/usage columns can
  // round-trip as strings from the DB.
  const planInfo = envelope?.plan;
  const usageRow = envelope?.usage;
  const priceCents = (Number(sub?.price_cents) || 0)
    || (sub?.billing_interval === 'annual' ? Number(planInfo?.annual_price_cents) || 0 : Number(planInfo?.monthly_price_cents) || 0);
  const unlimitedAi = !!planInfo?.feature_unlimited_ai;
  const aiLimit = unlimitedAi ? null : (Number(planInfo?.ai_takeoffs_per_month) || null);
  const aiUsed = Number(usageRow?.ai_takeoffs_used) || 0;
  const renewDays = envelope?.daysUntilRenewal ?? (sub?.current_period_end ? daysLeft(sub.current_period_end) : null);
  const fmtC = (cents: number) => '$' + ((Number(cents) || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });

  return (
    <>
      <PremiumSurface maxWidth={2200}>

        {/* Header */}
        <ModuleHero
          eyebrow="Account"
          eyebrowIcon={<CreditCard size={13} weight="fill" color={GOLD} />}
          title="Billing &"
          accent="Subscription"
          subtitle="Manage your plan, payment method, and invoices."
        />

        {/* Account intelligence strip — live plan, usage, and renewal totals */}
        {sub && (
          <StatStrip items={[
            {href: '/app/billing',  label: 'Plan', value: sub.plan_name || 'Subscription', sub: sub.billing_interval === 'annual' ? 'Annual billing' : 'Monthly billing' },
            {href: '/app/billing',  label: 'Status', value: sub.status === 'trialing' ? (trialDays ?? 0) + ' trial days left' : (sub.status || '').replace(/_/g, ' '), accent: sub.status === 'past_due' ? RED : sub.status === 'active' ? GREEN : GOLD, sub: sub.cancel_at ? 'Cancels ' + new Date(sub.cancel_at).toLocaleDateString() : sub.status === 'trialing' ? 'Full access during trial' : undefined },
            {href: '/app/billing',  label: 'Price', value: priceCents > 0 ? fmtC(priceCents) : '—', sub: priceCents > 0 ? 'Billed ' + (sub.billing_interval === 'annual' ? 'annually' : 'monthly') : 'No charge on file' },
            {href: '/app/billing',  label: 'AI Takeoff Pages', value: unlimitedAi ? 'Unlimited' : aiLimit != null ? aiUsed + ' / ' + aiLimit : String(aiUsed), accent: !unlimitedAi && aiLimit != null && aiUsed >= aiLimit ? RED : undefined, sub: unlimitedAi ? aiUsed + ' used this period' : aiLimit != null ? Math.max(0, aiLimit - aiUsed) + ' left this period' : 'This billing period' },
            {href: '/app/billing',  label: 'Renews In', value: renewDays != null ? renewDays + ' days' : '—', sub: sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : 'No period on file' },
          ]} />
        )}

        {/* URL success message */}
        {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('success') === '1' && (
          <div style={{ background: 'rgba(44,255,122,0.1)', border: `1px solid rgba(44,255,122,0.3)`, borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20, display: 'inline-flex', alignItems: 'center' }}><CheckCircle size={22} weight="fill" color={GREEN} /></span>
            <div>
              <div style={{ fontWeight: 700, color: GREEN, marginBottom: 2 }}>Payment successful — you're all set!</div>
              <div style={{ fontSize: 13, color: DIM }}>Your subscription is now active. All features are unlocked.</div>
            </div>
          </div>
        )}

        {/* Current Plan Card */}
        {loading ? (
          <SectionCard flat style={{ marginBottom: 28 }}>
            <Skeleton width={110} height={11} style={{ marginBottom: 12 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <Skeleton width={180} height={26} />
              <Skeleton width={80} height={22} borderRadius={6} />
            </div>
            <Skeleton width={220} height={14} style={{ marginBottom: 20 }} />
            <Skeleton width="100%" height={6} borderRadius={3} />
          </SectionCard>
        ) : error ? (
          <SectionCard style={{ marginBottom: 28 }}>
            <PremiumEmpty
              tone="error"
              icon={<Warning size={30} weight="fill" color={RED} />}
              title="Couldn't load your subscription"
              description="We hit a problem fetching your current plan. Your subscription is safe — please try again."
              action={<button onClick={loadSubscription} style={goldOutlineButtonStyle} className="pmBtn">Retry</button>}
              compact
            />
          </SectionCard>
        ) : sub ? (
          <SectionCard flat
            icon={<CreditCard size={17} weight="duotone" color={GOLD} />}
            title="Current Plan"
            accent={sub.status === 'past_due' ? RED : GOLD}
            style={{ marginBottom: 28 }}
            action={(sub.status === 'active' || sub.status === 'past_due') ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {sub.status === 'active' && (
                  <button onClick={handlePortal} disabled={portalLoading} style={ghostButtonStyle} className="pmBtn">
                    {portalLoading ? 'Loading…' : 'Manage Payment & Invoices'}
                  </button>
                )}
                {sub.status === 'active' && !sub.cancel_at && (
                  <button onClick={() => setShowCancel(true)} style={dangerGhostStyle} className="pmBtn">
                    Cancel Plan
                  </button>
                )}
                {sub.status === 'past_due' && (
                  <button onClick={handlePortal} style={dangerSolidStyle} className="pmBtn">
                    Update Payment Method
                  </button>
                )}
              </div>
            ) : undefined}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 24, fontWeight: 900, color: TEXT }}>{sub.plan_name ?? 'Free Trial'}</span>
              <StatusBadge status={sub.status} />
            </div>
            {sub.status === 'trialing' && trialDays !== null && (
              <div style={{ fontSize: 14, color: trialDays <= 5 ? RED : GOLD, fontWeight: 600 }}>
                {trialDays > 0 ? `${trialDays} days left in free trial` : 'Trial expired — upgrade to continue'}
              </div>
            )}
            {sub.status === 'active' && periodDays !== null && (
              <div style={{ fontSize: 13, color: DIM }}>Renews in {periodDays} days · {sub.billing_interval === 'annual' ? 'Annual' : 'Monthly'} billing</div>
            )}
            {sub.status === 'past_due' && (
              <div style={{ fontSize: 14, color: RED, fontWeight: 600 }}>Payment failed — please update your payment method.</div>
            )}
            {sub.cancel_at && (
              <div style={{ fontSize: 13, color: RED }}>Cancels on {new Date(sub.cancel_at).toLocaleDateString()}</div>
            )}

            {/* Trial progress bar */}
            {sub.status === 'trialing' && trialDays !== null && (
              <div style={{ marginTop: 20 }}>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, ((30 - trialDays) / 30) * 100))}%`, background: `linear-gradient(90deg, ${GOLD}, var(--brand-primary-strong))`, borderRadius: 3 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: DIM }}>
                  <span>Trial started</span>
                  <span>{trialDays} days remaining</span>
                </div>
              </div>
            )}
          </SectionCard>
        ) : (
          <SectionCard flat style={{ marginBottom: 28 }}>
            <PremiumEmpty
              icon={<CreditCard size={30} weight="duotone" color={GOLD} />}
              title="No active subscription"
              description="Choose a plan below to get started."
              compact
            />
          </SectionCard>
        )}

        {/* Plan Selection */}
        <SectionCard
          icon={<Lightning size={17} weight="duotone" color={GOLD} />}
          title={sub?.status === 'trialing' ? 'Upgrade Your Plan' : 'Change Plan'}
          style={{ marginBottom: 28 }}
          action={
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '3px', border: `1px solid ${BORDER}` }}>
              <button onClick={() => setAnnual(false)} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: !annual ? 'color-mix(in srgb, var(--brand-primary) 15%, transparent)' : 'transparent', color: !annual ? GOLD : DIM, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Monthly</button>
              <button onClick={() => setAnnual(true)} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: annual ? 'color-mix(in srgb, var(--brand-primary) 15%, transparent)' : 'transparent', color: annual ? GOLD : DIM, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                Annual
                <span style={{ fontSize: 10, fontWeight: 800, color: GREEN, background: 'rgba(44,255,122,0.12)', border: '1px solid rgba(44,255,122,0.25)', padding: '1px 6px', borderRadius: 8 }}>-17%</span>
              </button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {PLANS.map(plan => {
              const isCurrent = currentPlanName.includes(plan.id) && sub?.status === 'active';
              const isUpgrade = plan.id === 'professional' && currentPlanName.includes('starter');
              return (
                <div key={plan.id} style={{
                  background: RAISED,
                  border: `1.5px solid ${isCurrent ? GREEN : plan.popular ? GOLD : BORDER}`,
                  borderRadius: 14, overflow: 'hidden', position: 'relative',
                  boxShadow: 'none',
                }}>
                  {plan.popular && !isCurrent && (
                    <div style={{ background: `linear-gradient(90deg, ${GOLD}, var(--brand-primary-strong))`, textAlign: 'center', padding: '5px 0', fontSize: 10, fontWeight: 800, color: '#0A0A00' }}>Most Popular</div>
                  )}
                  {isCurrent && (
                    <div style={{ background: 'rgba(44,255,122,0.15)', borderBottom: `1px solid rgba(44,255,122,0.25)`, textAlign: 'center', padding: '5px 0', fontSize: 10, fontWeight: 800, color: GREEN }}>Current Plan</div>
                  )}
                  <div style={{ padding: '24px 22px' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: plan.popular ? GOLD : DIM, marginBottom: 4 }}>{plan.name}</div>
                    <div style={{ fontSize: 12, color: DIM, marginBottom: 16 }}>{plan.tagline}</div>

                    {plan.price_mo > 0 ? (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3 }}>
                          <span style={{ fontSize: 40, fontWeight: 900, color: TEXT, lineHeight: 1 }}>${annual ? (plan.price_yr ?? 0) : (plan.price_mo ?? 0)}</span>
                          <span style={{ fontSize: 13, color: DIM, paddingBottom: 6 }}>/mo</span>
                        </div>
                        {annual && <div style={{ fontSize: 11, color: GREEN, marginTop: 2 }}>Save ${((plan.price_mo ?? 0) - (plan.price_yr ?? 0)) * 12}/yr</div>}
                      </div>
                    ) : (
                      <div style={{ fontSize: 22, fontWeight: 900, color: TEXT, marginBottom: 20 }}>Contact Sales</div>
                    )}

                    <button
                      onClick={() => !isCurrent && handleUpgrade(plan.id)}
                      disabled={isCurrent || upgrading === plan.id}
                      style={{
                        width: '100%', padding: '11px 0', borderRadius: 8, border: isCurrent ? `1px solid rgba(44,255,122,0.3)` : plan.popular ? 'none' : `1px solid ${BORDER}`,
                        background: isCurrent ? 'rgba(44,255,122,0.08)' : plan.popular ? 'linear-gradient(180deg, var(--brand-primary-strong), var(--brand-primary) 60%, var(--brand-primary-hover))' : 'rgba(255,255,255,0.06)',
                        color: isCurrent ? GREEN : plan.popular ? '#0A0A00' : TEXT,
                        fontWeight: 800, fontSize: 13, cursor: isCurrent ? 'default' : 'pointer', marginBottom: 20,
                        boxShadow: plan.popular && !isCurrent ? '0 4px 14px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)' : 'none',
                      }}
                    >
                      {isCurrent ? 'Current Plan' : upgrading === plan.id ? 'Loading…' : plan.id === 'enterprise' ? 'Contact Sales' : isUpgrade ? 'Upgrade Now' : 'Select Plan'}
                    </button>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {plan.features.map(f => (
                        <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                            <circle cx="8" cy="8" r="8" fill="rgba(44,255,122,0.15)" />
                            <path d="M4.5 8l2.5 2.5 4-5" stroke={GREEN} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span style={{ fontSize: 12, color: DIM }}>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* Plan & Add-ons — tenant self-service. No fake toggles: every action
            hits the real request route, and copy says exactly what happens. */}
        <SectionCard
          icon={<PuzzlePiece size={17} weight="duotone" color={GOLD} />}
          title="Plan & Add-ons"
          subtitle="Company-wide add-ons. Nothing is billed without confirmation."
          style={{ marginBottom: 28 }}
        >
          {/* Current plan summary + Change plan via the Stripe billing portal */}
          <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: DIM, marginBottom: 4 }}>Current Plan</div>
              {sub ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: TEXT }}>{sub.plan_name}</span>
                  <StatusBadge status={sub.status} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: GOLD }}>
                    {priceCents > 0 ? `${fmtC(priceCents)} / ${sub.billing_interval === 'annual' ? 'yr' : 'mo'}` : 'No charge on file'}
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: 14, color: DIM }}>{loading ? 'Loading your plan…' : 'No active subscription — choose a plan above.'}</div>
              )}
              <div style={{ fontSize: 12, color: DIM, marginTop: 6 }}>
                {sub && (sub.status === 'active' || sub.status === 'past_due')
                  ? 'Plan up/downgrades run in the secure Stripe billing portal — changes take effect via Stripe.'
                  : 'Once you subscribe, plan changes run in the secure Stripe billing portal.'}
              </div>
            </div>
            {sub && (sub.status === 'active' || sub.status === 'past_due') && (
              <button onClick={handlePortal} disabled={portalLoading} style={goldOutlineButtonStyle} className="pmBtn">
                {portalLoading ? 'Loading…' : 'Change Plan'}
              </button>
            )}
          </div>

          {/* Add-ons grid — ONE typed list (lib/addons.ts), live status from GET /api/entitlements */}
          {ents === null && !entError ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
              {ADDONS.map(a => (
                <div key={a.key} style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18 }}>
                  <Skeleton width={150} height={14} style={{ marginBottom: 10 }} />
                  <Skeleton width={90} height={11} style={{ marginBottom: 12 }} />
                  <Skeleton width="100%" height={10} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
              {ADDONS.map(addon => {
                const { state, expiresAt } = addonState(addon.key);
                const trialLeft = state === 'trial' && expiresAt ? daysLeft(expiresAt) : null;
                const pendingDisable = state === 'active' && !!disableReqs[addon.key];
                const busy = requesting === addon.key;
                const chip =
                  state === 'active' ? { label: pendingDisable ? 'Active · Disable Requested' : 'Active', bg: 'rgba(44,255,122,0.12)', color: GREEN } :
                  state === 'trial' ? { label: trialLeft != null ? `Trial · ${trialLeft}d Left` : 'Trial', bg: 'var(--brand-primary-12)', color: GOLD } :
                  state === 'requested' ? { label: 'Requested', bg: 'var(--brand-primary-12)', color: GOLD } :
                  { label: 'Not Enabled', bg: 'rgba(255,255,255,0.06)', color: DIM };
                return (
                  <div key={addon.key} style={{ background: RAISED, border: `1px solid ${state === 'active' || state === 'trial' ? 'rgba(44,255,122,0.3)' : BORDER}`, borderRadius: 14, padding: '18px 18px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: TEXT, lineHeight: 1.3 }}>{addon.name}</div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: chip.bg, color: chip.color, whiteSpace: 'nowrap', flexShrink: 0 }}>{chip.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: GOLD }}>{addon.price}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: DIM, textTransform: 'capitalize', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, padding: '1px 7px', borderRadius: 6 }}>{addon.kind}</span>
                    </div>
                    <div style={{ fontSize: 12, color: DIM, lineHeight: 1.55, flex: 1 }}>{addon.desc}</div>
                    {state === 'requested' ? (
                      <div style={{ fontSize: 12, color: GOLD, fontWeight: 600, lineHeight: 1.5 }}>Requested — we enable it within 1 business day.</div>
                    ) : pendingDisable ? (
                      <div style={{ fontSize: 12, color: DIM, fontWeight: 600, lineHeight: 1.5 }}>Disable requested — stays on until our team processes it (within 1 business day).</div>
                    ) : state === 'active' || state === 'trial' ? (
                      <button onClick={() => requestAddon(addon, 'disable')} disabled={busy} style={{ ...dangerGhostStyle, padding: '8px 14px', fontSize: 12.5, alignSelf: 'flex-start' }} className="pmBtn">
                        {busy ? 'Submitting…' : 'Request Disable'}
                      </button>
                    ) : (
                      <button onClick={() => requestAddon(addon, 'enable')} disabled={busy} style={{ ...goldOutlineButtonStyle, padding: '8px 14px', fontSize: 12.5, alignSelf: 'flex-start' }} className="pmBtn">
                        {busy ? 'Submitting…' : 'Enable'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {entError && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: RED, flexWrap: 'wrap' }}>
              <Warning size={16} weight="fill" color={RED} />
              <span>Couldn't load add-on status — cards may show "Not Enabled" for add-ons you already have.</span>
              <button onClick={loadEntitlements} style={{ background: 'none', border: 'none', color: GOLD, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Retry</button>
            </div>
          )}
          <div style={{ marginTop: 14, fontSize: 12, color: DIM, lineHeight: 1.6 }}>
            Requesting an add-on never charges your card. Our team confirms pricing with you first, then enables it within 1 business day — every account admin is notified either way.
          </div>

          {/* Downgrade guidance */}
          <div style={{ marginTop: 16, background: 'color-mix(in srgb, var(--brand-primary) 6%, transparent)', border: '1px solid var(--brand-primary-18)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, marginBottom: 3 }}>Thinking about downgrading?</div>
              <div style={{ fontSize: 12.5, color: DIM, lineHeight: 1.6 }}>
                Downgrades run through the Stripe billing portal and take effect at your next billing cycle — your projects, documents, and history are never deleted.
              </div>
            </div>
            {sub && (sub.status === 'active' || sub.status === 'past_due') && (
              <button onClick={handlePortal} disabled={portalLoading} style={ghostButtonStyle} className="pmBtn">
                {portalLoading ? 'Loading…' : 'Open Billing Portal'}
              </button>
            )}
          </div>
        </SectionCard>

        {/* Install App Section */}
        <SectionCard flat
          icon={<DeviceMobile size={17} weight="duotone" color={GOLD} />}
          title="Get the App for iPhone & iPad"
          subtitle="Saguaro Control Systems App"
          style={{ marginBottom: 28 }}
          action={
            <Link href="/get-the-app" style={{ ...goldButtonStyle, whiteSpace: 'nowrap' }} className="pmBtn">
              Get Install Instructions
            </Link>
          }
        >
          <div style={{ fontSize: 13, color: DIM, maxWidth: 560, lineHeight: 1.6 }}>
            Native iOS app, free on Apple TestFlight for every team member on your plan (App Store &amp; Android coming soon). The full platform also runs in any browser.
          </div>
        </SectionCard>

        {/* FAQ */}
        <SectionCard flat
          icon={<Question size={17} weight="duotone" color={GOLD} />}
          title="Billing FAQ"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { q: 'When does my free trial end?', a: 'Your 30-day free trial gives you full access to all Professional features. No credit card is required until you decide to subscribe.' },
              { q: 'Can I switch plans anytime?', a: 'Yes. Upgrades take effect immediately with prorated billing. Downgrades take effect at the next billing cycle.' },
              { q: 'How do I update my payment method?', a: 'Click "Manage Payment & Invoices" above. You\'ll be taken to the Stripe customer portal where you can update your card, download invoices, and manage your subscription.' },
              { q: 'What happens if my payment fails?', a: 'We\'ll retry your card 3 times over 7 days and email you each time. If payment still fails, your account is paused but your data is preserved for 30 days.' },
              { q: 'Do you offer refunds?', a: 'We offer a full refund within 7 days of your first payment. After that, we don\'t offer refunds but you can cancel anytime and retain access until your period ends.' },
            ].map((faq, i, arr) => (
              <div key={i} style={{ padding: '18px 0', borderBottom: i < arr.length - 1 ? `1px solid rgba(255,255,255,0.08)` : 'none' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 6 }}>{faq.q}</div>
                <div style={{ fontSize: 13, color: DIM, lineHeight: 1.65 }}>{faq.a}</div>
              </div>
            ))}
          </div>
        </SectionCard>

      </PremiumSurface>

      {/* Action error banner — fixed + above the cancel modal (z 500) so failures are never invisible */}
      {actionError && (
        <div role="alert" style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 600, width: 'calc(100% - 48px)', maxWidth: 480, background: 'rgba(255,59,48,0.14)', border: `1px solid rgba(255,59,48,0.45)`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.45)' }}>
          <Warning size={20} weight="fill" color={RED} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: TEXT }}>{actionError}</span>
          <button onClick={() => setActionError(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 4px' }}>&times;</button>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--bg-surface)', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '36px 32px', maxWidth: 440, width: '100%', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, color: TEXT }}>Cancel Your Subscription?</div>
            <div style={{ fontSize: 14, color: DIM, lineHeight: 1.65, marginBottom: 28 }}>
              You'll retain access until the end of your current billing period. Your data will be preserved for 30 days after that. You can reactivate anytime.
            </div>
            <div style={{ background: 'var(--brand-primary-08)', border: `1px solid var(--brand-primary-18)`, borderRadius: 8, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: GOLD }}>
              Before you go — email us at <strong>support@saguarocontrol.net</strong> and we'll give you 20% off your next 3 months.
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowCancel(false)} style={{ flex: 1, padding: '12px 0', background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Keep My Plan</button>
              <button onClick={handleCancel} disabled={canceling} style={{ flex: 1, padding: '12px 0', background: 'rgba(255,59,48,0.1)', border: `1px solid rgba(255,59,48,0.3)`, borderRadius: 8, color: RED, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                {canceling ? 'Canceling…' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
