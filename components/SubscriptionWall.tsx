'use client';
/**
 * SubscriptionWall
 *
 * Renders a blocking upgrade screen when a tenant's trial has expired
 * or their subscription is past_due / canceled.
 *
 * Sits inside the app layout — fetches /api/billing/subscription on mount
 * and replaces page content with an upgrade prompt if access is denied.
 *
 * /app/billing is always allowed through so users can upgrade.
 */
import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const GOLD  = '#F59E0B';
const DARK  = '#0d1117';
const RAISED = '#0F172A';
const BORDER = '#1E3A5F';
const DIM   = '#CBD5E1';
const TEXT  = '#F8FAFC';
const GREEN = '#22c55e';
const RED   = '#ef4444';

interface SubStatus {
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused' | null;
  trial_ends_at: string | null;
  daysUntilRenewal: number | null;
  plan_name: string | null;
}

function daysLeft(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function SubscriptionWall({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sub, setSub] = useState<SubStatus | null>(null);
  const [checked, setChecked] = useState(false);

  // Always allow billing page through so users can upgrade
  const isBillingPage = pathname === '/app/billing';

  useEffect(() => {
    fetch('/api/billing/subscription')
      .then(r => r.ok ? r.json() : null)
      .then(d => { setSub(d); setChecked(true); })
      .catch(() => setChecked(true));
  }, [pathname]);

  // Still loading — render children (avoids flash)
  if (!checked) return <>{children}</>;

  // No subscription data (demo mode / Supabase not set up) — let through
  if (!sub) return <>{children}</>;

  // Active subscription — let through
  if (sub.status === 'active') return <>{children}</>;

  // Trial still valid — let through
  if (sub.status === 'trialing' && sub.trial_ends_at && daysLeft(sub.trial_ends_at) > 0) {
    return <>{children}</>;
  }

  // Billing page always accessible
  if (isBillingPage) return <>{children}</>;

  // ── WALL ────────────────────────────────────────────────────────────────────
  const isExpiredTrial = sub.status === 'trialing' || (!sub.status && sub.trial_ends_at && daysLeft(sub.trial_ends_at) <= 0);
  const isPastDue = sub.status === 'past_due';
  const isCanceled = sub.status === 'canceled';

  return (
    <div style={{
      minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '24px',
      fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    }}>
      <div style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>

        {/* Icon */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%', margin: '0 auto 28px',
          background: isPastDue ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
          border: `1px solid ${isPastDue ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
        }}>
          {isPastDue ? '⚠️' : isCanceled ? '🔒' : '⏰'}
        </div>

        {/* Heading */}
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 12px', letterSpacing: -0.5, color: TEXT }}>
          {isPastDue && 'Payment Failed'}
          {isCanceled && 'Subscription Canceled'}
          {isExpiredTrial && 'Your Free Trial Has Ended'}
        </h1>

        <p style={{ fontSize: 16, color: DIM, margin: '0 0 32px', lineHeight: 1.65 }}>
          {isPastDue && 'We couldn\'t process your last payment. Update your payment method to restore access for your entire team.'}
          {isCanceled && 'Your subscription has been canceled. Reactivate to restore access for you and your team.'}
          {isExpiredTrial && 'Your 30-day free trial is over. Choose a plan to keep your data and restore access for your whole team.'}
        </p>

        {/* Plan Cards (quick) */}
        {!isPastDue && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
            {[
              { id: 'starter', name: 'Starter', price: '$299', sub: '/mo · up to 10 projects' },
              { id: 'professional', name: 'Professional', price: '$599', sub: '/mo · unlimited everything', popular: true },
            ].map(plan => (
              <div key={plan.id} style={{
                background: plan.popular ? 'linear-gradient(180deg,#111827,#0F172A)' : RAISED,
                border: `1.5px solid ${plan.popular ? GOLD : BORDER}`,
                borderRadius: 12, padding: '20px 16px',
              }}>
                {plan.popular && (
                  <div style={{ fontSize: 9, fontWeight: 800, color: GOLD, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>Most Popular</div>
                )}
                <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{plan.name}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: plan.popular ? GOLD : TEXT, marginBottom: 4 }}>{plan.price}<span style={{ fontSize: 12, fontWeight: 400, color: DIM }}>/mo</span></div>
                <div style={{ fontSize: 11, color: DIM, marginBottom: 16 }}>{plan.sub}</div>
                <a href={`/app/billing?plan=${plan.id}`} style={{
                  display: 'block', padding: '10px 0', borderRadius: 7,
                  background: plan.popular ? `linear-gradient(135deg,${GOLD},#D97706)` : 'rgba(255,255,255,0.06)',
                  border: plan.popular ? 'none' : `1px solid ${BORDER}`,
                  color: plan.popular ? '#000' : TEXT, fontWeight: 800, fontSize: 13,
                  textDecoration: 'none',
                }}>
                  Select Plan
                </a>
              </div>
            ))}
          </div>
        )}

        {/* CTA Buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/app/billing" style={{
            padding: '14px 32px',
            background: isPastDue ? `linear-gradient(135deg,${RED},#dc2626)` : `linear-gradient(135deg,${GOLD},#D97706)`,
            borderRadius: 9, color: isPastDue ? '#fff' : '#000',
            fontWeight: 800, fontSize: 15, textDecoration: 'none',
            boxShadow: `0 4px 20px rgba(245,158,11,0.3)`,
          }}>
            {isPastDue ? 'Update Payment Method' : 'Upgrade Now →'}
          </a>
          <a href="mailto:support@saguarocontrol.net" style={{
            padding: '14px 24px', background: 'transparent',
            border: `1px solid ${BORDER}`, borderRadius: 9,
            color: DIM, fontWeight: 600, fontSize: 14, textDecoration: 'none',
          }}>
            Contact Support
          </a>
        </div>

        {/* Trust line */}
        <div style={{ marginTop: 28, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['Your data is safe', 'Cancel anytime', 'No per-seat fees'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: DIM }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="8" fill="rgba(34,197,94,0.15)" />
                <path d="M4.5 8l2.5 2.5 4-5" stroke={GREEN} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t}
            </div>
          ))}
        </div>

        {/* Data preservation note */}
        <div style={{ marginTop: 24, padding: '14px 20px', background: 'rgba(245,158,11,0.05)', border: `1px solid rgba(245,158,11,0.15)`, borderRadius: 8, fontSize: 13, color: DIM }}>
          Your projects, documents, and data are preserved for <strong style={{ color: TEXT }}>30 days</strong>. Reactivate anytime to pick up right where you left off.
        </div>

      </div>
    </div>
  );
}
