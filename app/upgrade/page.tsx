'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import { PLAN_PRICING, type PlanSlug } from '@/lib/plan-pricing';

const GOLD = '#d4a017';
const BG = '#0d1117';
const CARD = '#161b22';
const TEXT = '#e6edf3';
const DIM = '#8b949e';
const BORDER = '#30363d';
const RED = '#EF4444';
const GREEN = '#2ea043';
const BLUE = '#388bfd';

const PLAN_ORDER: PlanSlug[] = ['silver', 'gold', 'platinum'];
const PLAN_COLORS: Record<PlanSlug, string> = { silver: '#94A3B8', gold: GOLD, platinum: '#E2E8F0' };

function UpgradeContent() {
  const params = useSearchParams();
  const reason = params.get('reason');
  const isExpired = reason === 'trial_expired';
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [workSummary, setWorkSummary] = useState<{
    project_count: number; takeoff_count: number; takeoff_value: number
    bid_package_count: number; jacket_count: number; rfi_count: number
    daily_log_count: number; change_order_count: number; approved_co_value: number
    has_meaningful_work: boolean
    tenant: { name: string; days_remaining: number | null; trial_expired: boolean }
  } | null>(null);

  useEffect(() => {
    fetch('/api/tenant/summary')
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data) setWorkSummary(json.data) })
      .catch(console.error)
  }, []);

  async function handleSelectPlan(planId: string) {
    setLoading(planId);
    setError('');
    try {
      const meRes = await fetch('/api/auth/me');
      const me = meRes.ok ? await meRes.json() : null;
      const tenantId = me?.tenantId || me?.user?.id || '';
      const email = me?.email || me?.user?.email || '';

      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, interval: billing, tenantId, email }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        setError(data.error || 'Unable to start checkout. Please try again.');
        setLoading(null);
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setError('Network error. Please check your connection and try again.');
      setLoading(null);
    }
  }

  const isAnnual = billing === 'annual';

  return (
    <div style={{
      minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '40px 20px', fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 900, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: isExpired ? 'rgba(239,68,68,0.15)' : 'rgba(212,160,23,0.15)',
            border: `2px solid ${isExpired ? RED : GOLD}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 28px', fontSize: 32,
          }}>
            {isExpired ? '🔒' : '⭐'}
          </div>

          <h1 style={{ color: TEXT, fontSize: 32, fontWeight: 800, marginBottom: 12, lineHeight: 1.2 }}>
            {isExpired ? 'Your 30-Day Trial Has Ended' : 'Choose Your Plan'}
          </h1>
          <p style={{ color: DIM, fontSize: 15, marginBottom: 8, lineHeight: 1.6 }}>
            {isExpired
              ? 'Your free trial is over. Your data is safe — choose a plan to restore access instantly.'
              : 'Flat pricing for your whole team. No per-seat fees. Cancel anytime.'}
          </p>
        </div>

        {/* Warning bar */}
        {isExpired && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, padding: '12px 16px', marginBottom: 28, textAlign: 'center',
            color: '#FCA5A5', fontSize: 13, fontWeight: 600, maxWidth: 620, margin: '0 auto 28px',
          }}>
            Access to your CRM, Field App, and all files is blocked until you subscribe.
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 20,
            color: RED, fontSize: 13, textAlign: 'center', maxWidth: 620, margin: '0 auto 20px',
          }}>
            {error}
          </div>
        )}

        {/* Billing toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', gap: 0, background: CARD, borderRadius: 8, padding: 4, border: `1px solid ${BORDER}` }}>
            {(['monthly', 'annual'] as const).map(b => (
              <button key={b} onClick={() => setBilling(b)} style={{
                padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: billing === b ? GOLD : 'transparent',
                color: billing === b ? '#000' : DIM,
                fontWeight: 700, fontSize: 13, transition: 'all .15s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {b === 'monthly' ? 'Monthly' : (
                  <>Annual <span style={{ fontSize: 10, fontWeight: 800, color: billing === 'annual' ? '#000' : GREEN, background: billing === 'annual' ? 'rgba(0,0,0,0.15)' : 'rgba(46,160,67,0.15)', padding: '1px 6px', borderRadius: 8 }}>Save up to ${PLAN_PRICING.gold.annualSavings.toLocaleString()}</span></>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Saved Work Card — loss aversion */}
        {workSummary?.has_meaningful_work && (
          <div style={{
            background: '#0d1b2a', border: `1px solid ${BLUE}`, borderRadius: 12,
            padding: 24, marginBottom: 32, maxWidth: 800, marginLeft: 'auto', marginRight: 'auto',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: BLUE, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>&#x1f512;</span> Your work is safe — upgrade now to keep access
            </div>
            <p style={{ color: DIM, fontSize: 14, marginBottom: 16 }}>Everything you built during your trial is saved and waiting:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {workSummary.project_count > 0 && (
                <div style={{ color: TEXT, fontSize: 14 }}>
                  <strong>{workSummary.project_count}</strong> Project{workSummary.project_count !== 1 ? 's' : ''}
                </div>
              )}
              {workSummary.takeoff_count > 0 && (
                <div style={{ color: TEXT, fontSize: 14 }}>
                  <strong>{workSummary.takeoff_count}</strong> AI Takeoff{workSummary.takeoff_count !== 1 ? 's' : ''}
                  {workSummary.takeoff_value > 0 && (
                    <span style={{ color: DIM }}> — Sage extracted ${workSummary.takeoff_value.toLocaleString()} in quantities</span>
                  )}
                </div>
              )}
              {workSummary.bid_package_count > 0 && (
                <div style={{ color: TEXT, fontSize: 14 }}>
                  <strong>{workSummary.bid_package_count}</strong> Bid Package{workSummary.bid_package_count !== 1 ? 's' : ''}
                  {workSummary.jacket_count > 0 && (
                    <span style={{ color: DIM }}> — {workSummary.jacket_count} professional bid jacket PDF{workSummary.jacket_count !== 1 ? 's' : ''} generated</span>
                  )}
                </div>
              )}
              {workSummary.rfi_count > 0 && (
                <div style={{ color: TEXT, fontSize: 14 }}><strong>{workSummary.rfi_count}</strong> RFI{workSummary.rfi_count !== 1 ? 's' : ''}</div>
              )}
              {workSummary.daily_log_count > 0 && (
                <div style={{ color: TEXT, fontSize: 14 }}><strong>{workSummary.daily_log_count}</strong> Daily Log{workSummary.daily_log_count !== 1 ? 's' : ''}</div>
              )}
              {workSummary.change_order_count > 0 && (
                <div style={{ color: TEXT, fontSize: 14 }}>
                  <strong>{workSummary.change_order_count}</strong> Change Order{workSummary.change_order_count !== 1 ? 's' : ''}
                  {workSummary.approved_co_value > 0 && (
                    <span style={{ color: DIM }}> — ${workSummary.approved_co_value.toLocaleString()} approved</span>
                  )}
                </div>
              )}
            </div>
            {workSummary.tenant.days_remaining !== null && workSummary.tenant.days_remaining > 0 && (
              <p style={{
                color: workSummary.tenant.days_remaining < 7 ? RED : workSummary.tenant.days_remaining <= 14 ? GOLD : DIM,
                fontSize: 13, marginTop: 16, fontWeight: 600,
              }}>
                Access expires in {workSummary.tenant.days_remaining} day{workSummary.tenant.days_remaining !== 1 ? 's' : ''}.
              </p>
            )}
            {workSummary.tenant.trial_expired && (
              <p style={{ color: RED, fontSize: 13, marginTop: 16, fontWeight: 600 }}>
                Your trial has expired. Upgrade to restore access.
              </p>
            )}
          </div>
        )}

        {!workSummary?.has_meaningful_work && workSummary && !isExpired && (
          <div style={{
            background: '#0d1b2a', border: `1px solid #30363d`, borderRadius: 12,
            padding: 24, marginBottom: 32, maxWidth: 600, marginLeft: 'auto', marginRight: 'auto',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
              Upgrade now and start building with Saguaro CRM.
            </div>
            <p style={{ color: DIM, fontSize: 13 }}>
              Your first project takes under 2 minutes to create.
            </p>
          </div>
        )}

        {/* Plan Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 32 }}>
          {PLAN_ORDER.map((slug) => {
            const plan = PLAN_PRICING[slug];
            const color = PLAN_COLORS[slug];
            const isGold = slug === 'gold';
            const price = isAnnual ? plan.annualMonthly : plan.monthly;

            return (
              <div key={slug} style={{
                background: CARD,
                border: `${isGold ? '2px' : '1px'} solid ${isGold ? GOLD : BORDER}`,
                borderRadius: 14, padding: 0, position: 'relative', overflow: 'hidden',
                transform: isGold ? 'scale(1.03)' : 'none',
                boxShadow: isGold ? `0 0 40px rgba(212,160,23,0.12)` : 'none',
              }}>
                {isGold && (
                  <div style={{
                    background: `linear-gradient(90deg, ${GOLD}, #FCD34D)`, textAlign: 'center',
                    padding: '6px 0', fontSize: 10, fontWeight: 800, color: '#000',
                    letterSpacing: 2, textTransform: 'uppercase',
                  }}>Most Popular</div>
                )}

                <div style={{ padding: '28px 24px' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: color, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
                    {plan.name}
                  </div>
                  <div style={{ fontSize: 12, color: DIM, marginBottom: 20 }}>
                    {plan.description}
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3 }}>
                      <span style={{ fontSize: 44, fontWeight: 900, color: TEXT, lineHeight: 1 }}>
                        ${isAnnual ? Math.round(plan.annualMonthly) : plan.monthly}
                      </span>
                      <span style={{ fontSize: 14, color: DIM, paddingBottom: 6 }}>/mo</span>
                    </div>
                    {isAnnual && (
                      <div style={{ fontSize: 11, color: GREEN, marginTop: 4, fontWeight: 600 }}>
                        ${plan.annual.toLocaleString()}/yr &middot; Save ${plan.annualSavings.toLocaleString()}
                      </div>
                    )}
                    {!isAnnual && (
                      <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>
                        or ${Math.round(plan.annualMonthly)}/mo billed annually
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleSelectPlan(slug)}
                    disabled={loading === slug}
                    style={{
                      width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
                      cursor: loading === slug ? 'not-allowed' : 'pointer',
                      background: loading === slug ? 'rgba(56,139,253,0.4)' : (isGold ? `linear-gradient(135deg, ${GOLD}, #D4781A)` : BLUE),
                      color: isGold ? '#000' : '#fff',
                      fontWeight: 800, fontSize: 14, marginBottom: 24,
                      boxShadow: isGold ? `0 4px 16px rgba(212,160,23,0.3)` : 'none',
                    }}
                  >
                    {loading === slug ? 'Loading...' : `Start with ${plan.name}`}
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {plan.features.map(f => (
                      <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                          <circle cx="8" cy="8" r="8" fill="rgba(46,160,67,0.15)" />
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

        <p style={{ color: DIM, fontSize: 12, textAlign: 'center' }}>
          No credit card required to start. Cancel anytime.
          {' · '}
          <a href="mailto:support@saguarocontrol.net" style={{ color: GOLD }}>Need help?</a>
        </p>

        {/* Social Proof */}
        <div style={{ maxWidth: 800, margin: '60px auto 0' }}>
          <h3 style={{ textAlign: 'center', color: DIM, marginBottom: 32, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Why GCs choose Saguaro over Procore
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
              <p style={{ color: TEXT, fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>
                &ldquo;Sage AI wrote our entire electrical scope in 45 seconds. Used to take our PM three hours.&rdquo;
              </p>
              <span style={{ color: DIM, fontSize: 13 }}>— GC Company, Phoenix AZ</span>
            </div>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
              <p style={{ color: TEXT, fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>
                &ldquo;$399 for the first month. Procore wanted $7,200 per year before I could even test it.&rdquo;
              </p>
              <span style={{ color: DIM, fontSize: 13 }}>— Independent GC, Tucson AZ</span>
            </div>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 20 }}>
              <p style={{ color: TEXT, fontSize: 15, lineHeight: 1.6, marginBottom: 16 }}>
                &ldquo;Generated our first bid jacket on day one. The sub called it the most professional package he&apos;d ever received.&rdquo;
              </p>
              <span style={{ color: DIM, fontSize: 13 }}>— GC Company, Mesa AZ</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0d1117' }} />}>
      <UpgradeContent />
    </Suspense>
  );
}
