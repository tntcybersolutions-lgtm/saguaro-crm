'use client';
/**
 * Billing & Subscription — Pass 4, on the kit (PageShell + StatRow + Cards).
 *
 * Anatomy: title + one primary action (Manage Payment & Invoices → the Stripe
 * billing portal; Update Payment Method when past due) → StatRow (plan /
 * status / price / AI pages / renewal — real account totals) → Current Plan →
 * Plans (monthly / annual tabs) → Plan & Add-ons → the app → FAQ. Every number
 * is Number()-coerced because price / usage columns can round-trip as strings.
 * No fake toggles: every add-on action hits the real request route and the
 * copy says exactly what happens.
 *
 * Every read / write is the one this screen already used:
 *   GET  /api/billing/subscription   (nested envelope, flattened below)
 *   GET  /api/entitlements
 *   POST /api/billing/addon-request  { featureKey, action }
 *   POST /api/billing/checkout       { planId, interval, successUrl, cancelUrl }
 *   POST /api/billing/portal         { returnUrl }
 *   POST /api/billing/cancel
 */
import React, { useState, useEffect, useCallback } from 'react';
import { safeJsonParse } from '@/lib/safe-json';
import { CheckCircle, Warning, CreditCard, DeviceMobile, ArrowSquareOut } from '@phosphor-icons/react';
import {
  PageShell, Card, StatRow, Badge, Button, Tabs, EmptyState, FormModal, Toast, useToast,
  type BadgeTone, type StatItem,
} from '@/components/ui/kit';
import { ADDONS, type AddonDef } from '@/lib/addons';

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

/** One status → one badge. Trial amber (a decision is coming), Active green,
 *  Past Due red, Canceled / Paused grey — from lib/status-colors. */
function statusBadge(status: string): { label: string; tone: BadgeTone } {
  const map: Record<string, { label: string; tone: BadgeTone }> = {
    trialing:  { label: 'Free Trial',  tone: 'under_contract' },
    active:    { label: 'Active',      tone: 'ongoing' },
    past_due:  { label: 'Past Due',    tone: 'overdue' },
    canceled:  { label: 'Canceled',    tone: 'closed' },
    paused:    { label: 'Paused',      tone: 'closed' },
  };
  return map[status] ?? map.active;
}

const CSS = `
.blWs > .k-page { max-width: none; }
.blStack { display: flex; flex-direction: column; gap: 16px; }
.blSuccess { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid rgba(46,229,157,.35); background: rgba(46,229,157,.08); color: var(--text-primary); font-size: var(--fs-sm); }
.blSuccess > svg { color: var(--status-ongoing); flex-shrink: 0; }
.blSuccess b { display: block; color: var(--status-ongoing); }
.blPlanHead { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.blPlanName { font-size: var(--fs-xl); font-weight: 800; color: var(--text-primary); }
.blNote { font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.6; margin-top: 6px; }
.blNote[data-tone="bad"] { color: var(--status-overdue); font-weight: 600; }
.blNote[data-tone="warn"] { color: var(--status-under-contract); font-weight: 600; }
.blTrack { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.08); overflow: hidden; margin-top: 16px; }
.blFill { height: 100%; border-radius: 3px; background: var(--status-under-contract); }
.blTrackLabel { display: flex; justify-content: space-between; margin-top: 6px; font-size: var(--fs-xs); color: var(--text-tertiary); }
.blPlans { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.blPlan { position: relative; display: flex; flex-direction: column; border-radius: var(--radius-md); border: 1px solid var(--border-default); background: var(--bg-surface-2); overflow: hidden; }
.blPlan[data-popular="true"] { border-color: var(--brand-primary-35); }
.blPlan[data-current="true"] { border-color: rgba(46,229,157,.5); }
.blPlanRibbon { text-align: center; padding: 5px 0; font-size: var(--fs-xs); font-weight: 800; background: var(--brand-primary); color: var(--on-brand); }
.blPlanRibbon[data-current="true"] { background: rgba(46,229,157,.15); color: var(--status-ongoing); border-bottom: 1px solid rgba(46,229,157,.25); }
.blPlanBody { padding: 22px; display: flex; flex-direction: column; gap: 14px; flex: 1; }
.blPlanTitle { font-size: var(--fs-md); font-weight: 800; color: var(--text-primary); }
.blPlanTag { font-size: var(--fs-xs); color: var(--text-tertiary); margin-top: 2px; }
.blPrice { display: flex; align-items: flex-end; gap: 3px; }
.blPrice > b { font-size: 36px; font-weight: 900; color: var(--text-primary); line-height: 1; font-variant-numeric: tabular-nums; }
.blPrice > span { font-size: var(--fs-sm); color: var(--text-tertiary); padding-bottom: 5px; }
.blSave { font-size: var(--fs-xs); color: var(--status-ongoing); margin-top: 4px; }
.blContact { font-size: var(--fs-lg); font-weight: 900; color: var(--text-primary); }
.blFeatures { display: flex; flex-direction: column; gap: 7px; }
.blFeature { display: flex; gap: 8px; align-items: flex-start; font-size: var(--fs-xs); color: var(--text-secondary); }
.blFeature > svg { color: var(--status-ongoing); flex-shrink: 0; margin-top: 1px; }
.blPlan .k-btn { width: 100%; justify-content: center; }
.blSummary { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 16px 18px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--bg-surface-2); margin-bottom: 16px; }
.blSummary > div:first-child { flex: 1; min-width: 220px; }
.blLabel { font-size: var(--fs-xs); font-weight: 700; color: var(--text-tertiary); margin-bottom: 4px; }
.blAddons { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 14px; }
.blAddon { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--bg-surface-2); }
.blAddon[data-on="true"] { border-color: rgba(46,229,157,.35); }
.blAddonHead { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.blAddonName { font-size: var(--fs-md); font-weight: 800; color: var(--text-primary); line-height: 1.3; }
.blAddonMeta { display: flex; align-items: center; gap: 8px; font-size: var(--fs-sm); font-weight: 700; color: var(--text-primary); }
.blAddonMeta > small { font-size: var(--fs-xs); font-weight: 700; color: var(--text-tertiary); text-transform: capitalize; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--border-subtle); background: var(--bg-surface); }
.blAddonDesc { font-size: var(--fs-xs); color: var(--text-tertiary); line-height: 1.55; flex: 1; }
.blAddonState { font-size: var(--fs-xs); color: var(--text-secondary); font-weight: 600; line-height: 1.5; }
.blSkel { height: 14px; border-radius: 4px; background: var(--border-subtle); }
.blInlineErr { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: var(--fs-sm); color: var(--status-overdue); margin-top: 12px; }
.blDowngrade { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 16px; padding: 14px 18px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--bg-surface-2); }
.blDowngrade > div:first-child { flex: 1; min-width: 240px; }
.blDowngrade b { display: block; font-size: var(--fs-sm); color: var(--text-primary); margin-bottom: 3px; }
.blFaq { display: flex; flex-direction: column; }
.blFaqItem { padding: 16px 0; border-bottom: 1px solid var(--border-subtle); }
.blFaqItem:last-child { border-bottom: 0; }
.blFaqQ { font-size: var(--fs-md); font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
.blFaqA { font-size: var(--fs-sm); color: var(--text-tertiary); line-height: 1.65; }
.blOffer { padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid var(--brand-primary-18); background: var(--brand-primary-08); font-size: var(--fs-sm); color: var(--text-primary); }
.blProse { font-size: var(--fs-sm); color: var(--text-secondary); line-height: 1.65; }
@media (max-width: 640px) {
  .blWs .k-btn, .blWs .k-stat { min-height: 44px; }
}
`;

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
  const { toast, show } = useToast(8000);
  const setActionError = (msg: string | null) => { if (msg) show(msg, 'bad'); };
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    try { setSuccess(new URLSearchParams(window.location.search).get('success') === '1'); } catch { /* ignore */ }
  }, []);

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
        show(action === 'enable' ? `${addon.name} requested — we enable it within 1 business day.` : `${addon.name} disable requested.`);
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
  const fmtC = (cents: number) => '$' + ((Number(cents) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const canPortal = !!sub && (sub.status === 'active' || sub.status === 'past_due');

  const stats: StatItem[] = loading
    ? [
        { label: 'Plan', value: '—', sub: 'Loading…' },
        { label: 'Status', value: '—', sub: 'Loading…' },
        { label: 'Price', value: '—', sub: 'Loading…' },
        { label: 'AI Takeoff Pages', value: '—', sub: 'Loading…' },
        { label: 'Renews In', value: '—', sub: 'Loading…' },
      ]
    : sub
      ? [
          { label: 'Plan', value: sub.plan_name || 'Subscription', sub: sub.billing_interval === 'annual' ? 'Annual billing' : 'Monthly billing' },
          { label: 'Status', value: sub.status === 'trialing' ? `${trialDays ?? 0} trial days left` : statusBadge(sub.status).label, tone: sub.status === 'past_due' ? 'bad' : sub.status === 'active' ? 'good' : 'warn', sub: sub.cancel_at ? `Cancels ${fmtDate(sub.cancel_at)}` : sub.status === 'trialing' ? 'Full access during trial' : 'Subscription' },
          { label: 'Price', value: priceCents > 0 ? fmtC(priceCents) : '—', sub: priceCents > 0 ? `Billed ${sub.billing_interval === 'annual' ? 'annually' : 'monthly'}` : 'No charge on file' },
          { label: 'AI Takeoff Pages', value: unlimitedAi ? 'Unlimited' : aiLimit != null ? `${aiUsed} / ${aiLimit}` : String(aiUsed), tone: !unlimitedAi && aiLimit != null && aiUsed >= aiLimit ? 'bad' : 'default', sub: unlimitedAi ? `${aiUsed} used this period` : aiLimit != null ? `${Math.max(0, aiLimit - aiUsed)} left this period` : 'This billing period' },
          { label: 'Renews In', value: renewDays != null ? `${renewDays} days` : '—', sub: sub.current_period_end ? fmtDate(sub.current_period_end) : 'No period on file' },
        ]
      : [];

  return (
    <div className="blWs">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <PageShell
        crumbs={[{ label: 'Home', href: '/app' }, { label: 'Billing' }]}
        title="Billing & Subscription"
        subtitle="Your plan, payment method, and invoices. Plan changes run in the secure Stripe billing portal."
        actions={canPortal ? (
          sub!.status === 'past_due'
            ? <Button variant="danger" icon={<CreditCard size={15} />} onClick={handlePortal} disabled={portalLoading}>{portalLoading ? 'Opening…' : 'Update Payment Method'}</Button>
            : <Button variant="primary" icon={<ArrowSquareOut size={15} />} onClick={handlePortal} disabled={portalLoading}>{portalLoading ? 'Opening…' : 'Manage Payment & Invoices'}</Button>
        ) : undefined}
      >
        {stats.length > 0 && <StatRow items={stats} />}

        {success && (
          <div className="blSuccess" role="status">
            <CheckCircle size={22} weight="fill" />
            <div><b>Payment successful — you are all set.</b>Your subscription is now active. All features are unlocked.</div>
          </div>
        )}

        <div className="blStack">
          {/* Current Plan */}
          {loading ? (
            <Card title="Current Plan">
              <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="blSkel" style={{ width: 180, height: 26 }} />
                <div className="blSkel" style={{ width: 220 }} />
                <div className="blSkel" style={{ width: '100%', height: 6 }} />
              </div>
            </Card>
          ) : error ? (
            <Card flush>
              <EmptyState
                icon={<Warning size={22} />}
                title="Couldn't load your subscription"
                text="We hit a problem fetching your current plan. Your subscription is safe — please try again."
                action={<Button onClick={loadSubscription}>Retry</Button>}
              />
            </Card>
          ) : sub ? (
            <Card
              title="Current Plan"
              actions={sub.status === 'active' && !sub.cancel_at ? <Button variant="danger" size="sm" onClick={() => setShowCancel(true)}>Cancel Plan</Button> : undefined}
            >
              <div className="blPlanHead">
                <span className="blPlanName">{sub.plan_name ?? 'Free Trial'}</span>
                <Badge tone={statusBadge(sub.status).tone} dot>{statusBadge(sub.status).label}</Badge>
              </div>
              {sub.status === 'trialing' && trialDays !== null && (
                <div className="blNote" data-tone={trialDays <= 5 ? 'bad' : 'warn'}>{trialDays > 0 ? `${trialDays} days left in your free trial.` : 'Trial expired — upgrade to continue.'}</div>
              )}
              {sub.status === 'active' && periodDays !== null && (
                <div className="blNote">Renews in {periodDays} days · {sub.billing_interval === 'annual' ? 'Annual' : 'Monthly'} billing.</div>
              )}
              {sub.status === 'past_due' && (
                <div className="blNote" data-tone="bad">Payment failed — please update your payment method.</div>
              )}
              {sub.cancel_at && (
                <div className="blNote" data-tone="bad">Cancels on {fmtDate(sub.cancel_at)}.</div>
              )}
              {sub.status === 'trialing' && trialDays !== null && (
                <>
                  <div className="blTrack"><div className="blFill" style={{ width: `${Math.max(0, Math.min(100, ((30 - trialDays) / 30) * 100))}%` }} /></div>
                  <div className="blTrackLabel"><span>Trial started</span><span>{trialDays} days remaining</span></div>
                </>
              )}
            </Card>
          ) : (
            <Card flush>
              <EmptyState icon={<CreditCard size={22} />} title="No active subscription" text="Choose a plan below to get started." />
            </Card>
          )}

          {/* Plan Selection */}
          <Card
            title={sub?.status === 'trialing' ? 'Upgrade Your Plan' : 'Change Plan'}
            subtitle={annual ? 'Annual billing — about 17% less than monthly.' : 'Monthly billing. Switch to annual to save about 17%.'}
            actions={
              <Tabs value={annual ? 'annual' : 'monthly'} onChange={k => setAnnual(k === 'annual')} tabs={[{ key: 'monthly', label: 'Monthly' }, { key: 'annual', label: 'Annual' }]} />
            }
          >
            <div className="blPlans">
              {PLANS.map(plan => {
                const isCurrent = currentPlanName.includes(plan.id) && sub?.status === 'active';
                const isUpgrade = plan.id === 'professional' && currentPlanName.includes('starter');
                return (
                  <div key={plan.id} className="blPlan" data-popular={plan.popular ? 'true' : undefined} data-current={isCurrent ? 'true' : undefined}>
                    {plan.popular && !isCurrent && <div className="blPlanRibbon">Most Popular</div>}
                    {isCurrent && <div className="blPlanRibbon" data-current="true">Current Plan</div>}
                    <div className="blPlanBody">
                      <div>
                        <div className="blPlanTitle">{plan.name}</div>
                        <div className="blPlanTag">{plan.tagline}</div>
                      </div>
                      {plan.price_mo > 0 ? (
                        <div>
                          <div className="blPrice"><b>${annual ? (plan.price_yr ?? 0) : (plan.price_mo ?? 0)}</b><span>/mo</span></div>
                          {annual && <div className="blSave">Save ${((plan.price_mo ?? 0) - (plan.price_yr ?? 0)) * 12}/yr</div>}
                        </div>
                      ) : (
                        <div className="blContact">Contact Sales</div>
                      )}
                      <Button
                        variant={isCurrent ? 'secondary' : plan.popular ? 'primary' : 'secondary'}
                        onClick={() => !isCurrent && handleUpgrade(plan.id)}
                        disabled={isCurrent || upgrading === plan.id}
                      >
                        {isCurrent ? 'Current Plan' : upgrading === plan.id ? 'Opening checkout…' : plan.id === 'enterprise' ? 'Contact Sales' : isUpgrade ? 'Upgrade Now' : 'Select Plan'}
                      </Button>
                      <div className="blFeatures">
                        {plan.features.map(f => (
                          <div key={f} className="blFeature"><CheckCircle size={14} weight="fill" /><span>{f}</span></div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Plan & Add-ons — tenant self-service. No fake toggles: every action
              hits the real request route, and copy says exactly what happens. */}
          <Card title="Plan & Add-ons" subtitle="Company-wide add-ons. Nothing is billed without confirmation.">
            <div className="blSummary">
              <div>
                <div className="blLabel">Current Plan</div>
                {sub ? (
                  <div className="blPlanHead">
                    <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 900, color: 'var(--text-primary)' }}>{sub.plan_name}</span>
                    <Badge tone={statusBadge(sub.status).tone}>{statusBadge(sub.status).label}</Badge>
                    <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 800, color: 'var(--text-primary)' }}>{priceCents > 0 ? `${fmtC(priceCents)} / ${sub.billing_interval === 'annual' ? 'yr' : 'mo'}` : 'No charge on file'}</span>
                  </div>
                ) : (
                  <div className="blProse">{loading ? 'Loading your plan…' : 'No active subscription — choose a plan above.'}</div>
                )}
                <div className="blNote">{canPortal ? 'Plan up/downgrades run in the secure Stripe billing portal — changes take effect via Stripe.' : 'Once you subscribe, plan changes run in the secure Stripe billing portal.'}</div>
              </div>
              {canPortal && <Button icon={<ArrowSquareOut size={15} />} onClick={handlePortal} disabled={portalLoading}>{portalLoading ? 'Opening…' : 'Change Plan'}</Button>}
            </div>

            {ents === null && !entError ? (
              <div className="blAddons" aria-busy="true">
                {ADDONS.map(a => (
                  <div key={a.key} className="blAddon">
                    <div className="blSkel" style={{ width: 150 }} />
                    <div className="blSkel" style={{ width: 90 }} />
                    <div className="blSkel" style={{ width: '100%' }} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="blAddons">
                {ADDONS.map(addon => {
                  const { state, expiresAt } = addonState(addon.key);
                  const trialLeft = state === 'trial' && expiresAt ? daysLeft(expiresAt) : null;
                  const pendingDisable = state === 'active' && !!disableReqs[addon.key];
                  const busy = requesting === addon.key;
                  const chip: { label: string; tone: BadgeTone } =
                    state === 'active' ? { label: pendingDisable ? 'Active · Disable Requested' : 'Active', tone: 'ongoing' } :
                    state === 'trial' ? { label: trialLeft != null ? `Trial · ${trialLeft}d Left` : 'Trial', tone: 'under_contract' } :
                    state === 'requested' ? { label: 'Requested', tone: 'under_contract' } :
                    { label: 'Not Enabled', tone: 'neutral' };
                  return (
                    <div key={addon.key} className="blAddon" data-on={state === 'active' || state === 'trial' ? 'true' : undefined}>
                      <div className="blAddonHead">
                        <div className="blAddonName">{addon.name}</div>
                        <Badge tone={chip.tone}>{chip.label}</Badge>
                      </div>
                      <div className="blAddonMeta"><span>{addon.price}</span><small>{addon.kind}</small></div>
                      <div className="blAddonDesc">{addon.desc}</div>
                      {state === 'requested' ? (
                        <div className="blAddonState">Requested — we enable it within 1 business day.</div>
                      ) : pendingDisable ? (
                        <div className="blAddonState">Disable requested — stays on until our team processes it (within 1 business day).</div>
                      ) : state === 'active' || state === 'trial' ? (
                        <div><Button variant="danger" size="sm" onClick={() => requestAddon(addon, 'disable')} disabled={busy}>{busy ? 'Submitting…' : 'Request Disable'}</Button></div>
                      ) : (
                        <div><Button size="sm" onClick={() => requestAddon(addon, 'enable')} disabled={busy}>{busy ? 'Submitting…' : 'Enable'}</Button></div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {entError && (
              <div className="blInlineErr" role="alert">
                <Warning size={16} weight="fill" />
                <span>Couldn&apos;t load add-on status — cards may show &ldquo;Not Enabled&rdquo; for add-ons you already have.</span>
                <Button size="sm" variant="ghost" onClick={loadEntitlements}>Retry</Button>
              </div>
            )}
            <div className="blNote" style={{ marginTop: 14 }}>
              Requesting an add-on never charges your card. Our team confirms pricing with you first, then enables it within 1 business day — every account admin is notified either way.
            </div>
            <div className="blDowngrade">
              <div>
                <b>Thinking about downgrading?</b>
                <div className="blProse">Downgrades run through the Stripe billing portal and take effect at your next billing cycle — your projects, documents, and history are never deleted.</div>
              </div>
              {canPortal && <Button onClick={handlePortal} disabled={portalLoading}>{portalLoading ? 'Opening…' : 'Open Billing Portal'}</Button>}
            </div>
          </Card>

          {/* Install App */}
          <Card
            title="Get the App for iPhone & iPad"
            subtitle="Saguaro Control Systems App"
            actions={<Button icon={<DeviceMobile size={15} />} href="/get-the-app">Get Install Instructions</Button>}
          >
            <div className="blProse" style={{ maxWidth: 560 }}>
              Native iOS app, free on Apple TestFlight for every team member on your plan (App Store &amp; Android coming soon). The full platform also runs in any browser.
            </div>
          </Card>

          {/* FAQ */}
          <Card title="Billing FAQ">
            <div className="blFaq">
              {[
                { q: 'When does my free trial end?', a: 'Your 30-day free trial gives you full access to all Professional features. No credit card is required until you decide to subscribe.' },
                { q: 'Can I switch plans anytime?', a: 'Yes. Upgrades take effect immediately with prorated billing. Downgrades take effect at the next billing cycle.' },
                { q: 'How do I update my payment method?', a: 'Click "Manage Payment & Invoices" above. You\'ll be taken to the Stripe customer portal where you can update your card, download invoices, and manage your subscription.' },
                { q: 'What happens if my payment fails?', a: 'We\'ll retry your card 3 times over 7 days and email you each time. If payment still fails, your account is paused but your data is preserved for 30 days.' },
                { q: 'Do you offer refunds?', a: 'We offer a full refund within 7 days of your first payment. After that, we don\'t offer refunds but you can cancel anytime and retain access until your period ends.' },
              ].map((faq, i) => (
                <div key={i} className="blFaqItem">
                  <div className="blFaqQ">{faq.q}</div>
                  <div className="blFaqA">{faq.a}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </PageShell>

      {/* Cancel confirmation */}
      <FormModal
        open={showCancel}
        onClose={() => { if (!canceling) setShowCancel(false); }}
        title="Cancel Your Subscription?"
        size="sm"
        busy={canceling}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCancel(false)} disabled={canceling}>Keep My Plan</Button>
            <Button variant="danger" onClick={handleCancel} disabled={canceling}>{canceling ? 'Canceling…' : 'Yes, Cancel'}</Button>
          </>
        }
      >
        <div className="blProse" style={{ marginBottom: 16 }}>
          You&apos;ll retain access until the end of your current billing period. Your data will be preserved for 30 days after that. You can reactivate anytime.
        </div>
        <div className="blOffer">
          Before you go — email us at <strong>support@saguarocontrol.net</strong> and we&apos;ll give you 20% off your next 3 months.
        </div>
      </FormModal>

      <Toast message={toast?.message ?? null} tone={toast?.tone} />
    </div>
  );
}
