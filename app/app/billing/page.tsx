'use client';
import React, { useState, useEffect } from 'react';

const GOLD   = '#F59E0B';
const DARK   = '#0d1117';
const RAISED = '#0F172A';
const BORDER = '#1E3A5F';
const DIM    = '#CBD5E1';
const TEXT   = '#F8FAFC';
const GREEN  = '#22c55e';
const RED    = '#ef4444';

interface Subscription {
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
    price_mo: 299,
    price_yr: 249,
    tagline: 'Up to 10 projects · 100 AI pages/mo',
    features: ['10 active projects', 'AI Takeoff 100 pages/mo', 'G702/G703 Pay Apps', 'Lien Waivers all 50 states', 'Mobile Field App', 'Free migration', 'Email support'],
  },
  {
    id: 'professional',
    name: 'Professional',
    price_mo: 599,
    price_yr: 499,
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
    trialing:  { label: 'Free Trial',  bg: 'rgba(245,158,11,0.12)', color: GOLD },
    active:    { label: 'Active',      bg: 'rgba(34,197,94,0.12)',  color: GREEN },
    past_due:  { label: 'Past Due',    bg: 'rgba(239,68,68,0.12)',  color: RED },
    canceled:  { label: 'Canceled',    bg: 'rgba(203,213,225,0.1)', color: DIM },
    paused:    { label: 'Paused',      bg: 'rgba(203,213,225,0.1)', color: DIM },
  };
  const s = map[status] ?? map.active;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: s.bg, color: s.color, letterSpacing: 0.5 }}>
      {s.label}
    </span>
  );
}

export default function BillingPage() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [annual, setAnnual] = useState(false);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    fetch('/api/billing/subscription')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setSub(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

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
        body: JSON.stringify({ plan_id: planId, interval: annual ? 'annual' : 'monthly', success_url: `${window.location.origin}/app/billing?success=1`, cancel_url: `${window.location.origin}/app/billing` }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { /* noop */ }
    setUpgrading(null);
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ return_url: `${window.location.origin}/app/billing` }) });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { /* noop */ }
    setPortalLoading(false);
  };

  const handleCancel = async () => {
    setCanceling(true);
    try {
      await fetch('/api/billing/cancel', { method: 'POST' });
      window.location.reload();
    } catch { /* noop */ }
    setCanceling(false);
    setShowCancel(false);
  };

  const trialDays = sub?.trial_ends_at ? daysLeft(sub.trial_ends_at) : null;
  const periodDays = sub?.current_period_end ? daysLeft(sub.current_period_end) : null;
  const currentPlanName = sub?.plan_name?.toLowerCase() ?? '';

  return (
    <div style={{ minHeight: '100vh', background: DARK, color: TEXT, fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", padding: '32px 24px', maxWidth: 960, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 4px', letterSpacing: -0.5 }}>Billing & Subscription</h1>
        <p style={{ fontSize: 14, color: DIM, margin: 0 }}>Manage your plan, payment method, and invoices.</p>
      </div>

      {/* URL success message */}
      {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('success') === '1' && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 10, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>🎉</span>
          <div>
            <div style={{ fontWeight: 700, color: GREEN, marginBottom: 2 }}>Payment successful — you're all set!</div>
            <div style={{ fontSize: 13, color: DIM }}>Your subscription is now active. All features are unlocked.</div>
          </div>
        </div>
      )}

      {/* Current Plan Card */}
      {loading ? (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 32, marginBottom: 28, textAlign: 'center', color: DIM }}>Loading subscription...</div>
      ) : sub ? (
        <div style={{ background: RAISED, border: `1px solid ${sub.status === 'past_due' ? RED : BORDER}`, borderRadius: 14, padding: '28px 32px', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: DIM, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Current Plan</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
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
                <div style={{ fontSize: 14, color: RED, fontWeight: 600 }}>Payment failed — please update your payment method</div>
              )}
              {sub.cancel_at && (
                <div style={{ fontSize: 13, color: RED }}>Cancels on {new Date(sub.cancel_at).toLocaleDateString()}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {sub.status === 'active' && (
                <button onClick={handlePortal} disabled={portalLoading} style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {portalLoading ? 'Loading...' : 'Manage Payment & Invoices'}
                </button>
              )}
              {sub.status === 'active' && !sub.cancel_at && (
                <button onClick={() => setShowCancel(true)} style={{ padding: '10px 20px', background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 8, color: RED, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel Plan
                </button>
              )}
              {sub.status === 'past_due' && (
                <button onClick={handlePortal} style={{ padding: '10px 20px', background: `linear-gradient(135deg, ${RED}, #dc2626)`, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Update Payment Method
                </button>
              )}
            </div>
          </div>

          {/* Trial progress bar */}
          {sub.status === 'trialing' && trialDays !== null && (
            <div style={{ marginTop: 20 }}>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, ((30 - trialDays) / 30) * 100))}%`, background: `linear-gradient(90deg, ${GOLD}, #FCD34D)`, borderRadius: 3 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: DIM }}>
                <span>Trial started</span>
                <span>{trialDays} days remaining</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '28px 32px', marginBottom: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>No active subscription</div>
          <div style={{ fontSize: 14, color: DIM }}>Choose a plan below to get started.</div>
        </div>
      )}

      {/* Plan Selection */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
            {sub?.status === 'trialing' ? 'Upgrade Your Plan' : 'Change Plan'}
          </h2>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '3px', border: `1px solid ${BORDER}` }}>
            <button onClick={() => setAnnual(false)} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: !annual ? 'rgba(245,158,11,0.15)' : 'transparent', color: !annual ? GOLD : DIM, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Monthly</button>
            <button onClick={() => setAnnual(true)} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: annual ? 'rgba(245,158,11,0.15)' : 'transparent', color: annual ? GOLD : DIM, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              Annual
              <span style={{ fontSize: 10, fontWeight: 800, color: GREEN, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', padding: '1px 6px', borderRadius: 8 }}>-17%</span>
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {PLANS.map(plan => {
            const isCurrent = currentPlanName.includes(plan.id) && sub?.status === 'active';
            const isUpgrade = plan.id === 'professional' && currentPlanName.includes('starter');
            return (
              <div key={plan.id} style={{
                background: plan.popular ? 'linear-gradient(180deg, #111827, #0F172A)' : RAISED,
                border: `1.5px solid ${isCurrent ? GREEN : plan.popular ? GOLD : BORDER}`,
                borderRadius: 14, overflow: 'hidden', position: 'relative',
                boxShadow: plan.popular ? `0 0 40px rgba(245,158,11,0.08)` : 'none',
              }}>
                {plan.popular && !isCurrent && (
                  <div style={{ background: `linear-gradient(90deg, ${GOLD}, #FCD34D)`, textAlign: 'center', padding: '5px 0', fontSize: 10, fontWeight: 800, color: '#0d1117', letterSpacing: 2, textTransform: 'uppercase' }}>Most Popular</div>
                )}
                {isCurrent && (
                  <div style={{ background: 'rgba(34,197,94,0.15)', borderBottom: `1px solid rgba(34,197,94,0.25)`, textAlign: 'center', padding: '5px 0', fontSize: 10, fontWeight: 800, color: GREEN, letterSpacing: 2, textTransform: 'uppercase' }}>Current Plan</div>
                )}
                <div style={{ padding: '24px 22px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: plan.popular ? GOLD : DIM, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>{plan.name}</div>
                  <div style={{ fontSize: 12, color: DIM, marginBottom: 16 }}>{plan.tagline}</div>

                  {plan.price_mo > 0 ? (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3 }}>
                        <span style={{ fontSize: 40, fontWeight: 900, color: TEXT, lineHeight: 1 }}>${annual ? plan.price_yr : plan.price_mo}</span>
                        <span style={{ fontSize: 13, color: DIM, paddingBottom: 6 }}>/mo</span>
                      </div>
                      {annual && <div style={{ fontSize: 11, color: GREEN, marginTop: 2 }}>Save ${(plan.price_mo - plan.price_yr) * 12}/yr</div>}
                    </div>
                  ) : (
                    <div style={{ fontSize: 22, fontWeight: 900, color: TEXT, marginBottom: 20 }}>Contact Sales</div>
                  )}

                  <button
                    onClick={() => !isCurrent && handleUpgrade(plan.id)}
                    disabled={isCurrent || upgrading === plan.id}
                    style={{
                      width: '100%', padding: '11px 0', borderRadius: 8, border: isCurrent ? `1px solid rgba(34,197,94,0.3)` : plan.popular ? 'none' : `1px solid ${BORDER}`,
                      background: isCurrent ? 'rgba(34,197,94,0.08)' : plan.popular ? `linear-gradient(135deg, ${GOLD}, #D97706)` : 'rgba(255,255,255,0.05)',
                      color: isCurrent ? GREEN : plan.popular ? '#000' : TEXT,
                      fontWeight: 800, fontSize: 13, cursor: isCurrent ? 'default' : 'pointer', marginBottom: 20,
                      boxShadow: plan.popular && !isCurrent ? `0 4px 16px rgba(245,158,11,0.3)` : 'none',
                    }}
                  >
                    {isCurrent ? 'Current Plan' : upgrading === plan.id ? 'Loading...' : plan.id === 'enterprise' ? 'Contact Sales' : isUpgrade ? 'Upgrade Now' : 'Select Plan'}
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {plan.features.map(f => (
                      <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                          <circle cx="8" cy="8" r="8" fill="rgba(34,197,94,0.15)" />
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
      </div>

      {/* Install App Section */}
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '28px 32px', marginTop: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: DIM, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Saguaro Field App</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 6 }}>Install on your phone or tablet</div>
            <div style={{ fontSize: 13, color: DIM, maxWidth: 480 }}>No app store required. Install directly from your browser on iPhone, Android, iPad, or desktop. Free for every team member on your plan.</div>
          </div>
          <a href="/get-the-app" style={{ padding: '12px 24px', background: `linear-gradient(135deg, ${GOLD}, #D97706)`, borderRadius: 9, color: '#000', fontWeight: 800, fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: `0 4px 16px rgba(245,158,11,0.3)` }}>
            Get Install Instructions
          </a>
        </div>
      </div>

      {/* FAQ */}
      <div style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Billing FAQ</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            { q: 'When does my free trial end?', a: 'Your 30-day free trial gives you full access to all Professional features. No credit card is required until you decide to subscribe.' },
            { q: 'Can I switch plans anytime?', a: 'Yes. Upgrades take effect immediately with prorated billing. Downgrades take effect at the next billing cycle.' },
            { q: 'How do I update my payment method?', a: 'Click "Manage Payment & Invoices" above. You\'ll be taken to the Stripe customer portal where you can update your card, download invoices, and manage your subscription.' },
            { q: 'What happens if my payment fails?', a: 'We\'ll retry your card 3 times over 7 days and email you each time. If payment still fails, your account is paused but your data is preserved for 30 days.' },
            { q: 'Do you offer refunds?', a: 'We offer a full refund within 7 days of your first payment. After that, we don\'t offer refunds but you can cancel anytime and retain access until your period ends.' },
          ].map((faq, i, arr) => (
            <div key={i} style={{ padding: '18px 0', borderBottom: i < arr.length - 1 ? `1px solid rgba(30,58,95,0.6)` : 'none' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 6 }}>{faq.q}</div>
              <div style={{ fontSize: 13, color: DIM, lineHeight: 1.65 }}>{faq.a}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#111827', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '36px 32px', maxWidth: 440, width: '100%' }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, color: TEXT }}>Cancel your subscription?</div>
            <div style={{ fontSize: 14, color: DIM, lineHeight: 1.65, marginBottom: 28 }}>
              You'll retain access until the end of your current billing period. Your data will be preserved for 30 days after that. You can reactivate anytime.
            </div>
            <div style={{ background: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.2)`, borderRadius: 8, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: GOLD }}>
              Before you go — email us at <strong>support@saguarocontrol.net</strong> and we'll give you 20% off your next 3 months.
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowCancel(false)} style={{ flex: 1, padding: '12px 0', background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Keep My Plan</button>
              <button onClick={handleCancel} disabled={canceling} style={{ flex: 1, padding: '12px 0', background: 'rgba(239,68,68,0.1)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 8, color: RED, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                {canceling ? 'Canceling...' : 'Yes, Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
