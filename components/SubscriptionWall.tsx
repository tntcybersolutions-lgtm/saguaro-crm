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
 *
 * IMPORTANT — response contract (see getSubscriptionHandler in stripe-billing.ts):
 *   { hasSubscription: boolean,
 *     subscription?: { status, trial_ends_at, current_period_end, plans?: { name } },
 *     isActive, isTrialing, isPastDue, isCanceled, daysUntilRenewal }
 * The actual row is NESTED under `subscription` and the server precomputes
 * `isActive` (= trialing|active). Reading `status` at the top level (as an
 * earlier version did) always saw `undefined` and walled every tenant.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useInApp } from '@/lib/use-in-app';

// ── Apple LIGHT tokens (match the mobile app + dashboard) ──────────────────────
const GOLD   = 'var(--brand-primary)';
const PAGE   = 'var(--bg-base)';
const CARD   = 'var(--bg-surface)';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM    = 'var(--text-secondary)';
const TEXT   = 'var(--text-primary)';
const GREEN  = 'var(--success)';
const RED    = 'var(--danger)';
const AMBER  = 'var(--warning)';

interface SubRow {
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused' | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  plans?: { name: string | null } | null;
}

interface SubResponse {
  hasSubscription: boolean;
  subscription?: SubRow | null;
  isActive?: boolean;
  isTrialing?: boolean;
  isPastDue?: boolean;
  isCanceled?: boolean;
  daysUntilRenewal?: number | null;
}

function daysLeft(dateStr: string | null | undefined): number {
  if (!dateStr) return 999;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function SubscriptionWall({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // In the iPhone app the wall shows no way to buy a plan (App Store 3.1.1 /
  // 3.1.3; see lib/use-in-app.ts) — the account owner restores access.
  const inApp = useInApp();
  const [sub, setSub] = useState<SubResponse | null>(null);
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

  // Fetch failed / non-OK — fail open, never wall on a network blip
  if (!sub) return <>{children}</>;

  // No subscription row (demo mode / Supabase not provisioned) — let through
  if (!sub.hasSubscription) return <>{children}</>;

  const row = sub.subscription ?? null;
  const status = row?.status ?? null;

  // Active or in a valid trial — let through. Trust the server's isActive
  // (= trialing|active) and double-check the trial window client-side.
  if (sub.isActive || status === 'active') return <>{children}</>;
  if (status === 'trialing' && daysLeft(row?.trial_ends_at) > 0) return <>{children}</>;

  // Billing page always accessible so the user can fix it
  if (isBillingPage) return <>{children}</>;

  // ── WALL ────────────────────────────────────────────────────────────────────
  const isPastDue     = status === 'past_due' || sub.isPastDue === true;
  const isCanceled    = status === 'canceled' || sub.isCanceled === true;
  const isExpiredTrial = status === 'trialing' || (!status && daysLeft(row?.trial_ends_at) <= 0);

  const accent = isPastDue ? RED : AMBER;

  return (
    <div style={{
      minHeight: '100vh', background: PAGE, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '24px',
      fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    }}>
      <div style={{
        maxWidth: 560, width: '100%', textAlign: 'center',
        background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20,
        padding: '40px 32px', boxShadow: '0 16px 44px rgba(0,0,0,.10)',
      }}>

        {/* Icon */}
        <div style={{
          width: 72, height: 72, borderRadius: 20, margin: '0 auto 28px',
          background: isPastDue ? 'rgba(255,59,48,0.10)' : 'rgba(255,149,0,0.10)',
          border: `1px solid ${isPastDue ? 'rgba(255,59,48,0.22)' : 'rgba(255,149,0,0.22)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {isPastDue ? (
              <>
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </>
            ) : isCanceled ? (
              <>
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 14" />
              </>
            )}
          </svg>
        </div>

        {/* Heading */}
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 12px', letterSpacing: -0.5, color: TEXT }}>
          {isPastDue && 'Payment Failed'}
          {isCanceled && 'Subscription Canceled'}
          {isExpiredTrial && 'Your Free Trial Has Ended'}
        </h1>

        <p style={{ fontSize: 16, color: DIM, margin: '0 0 32px', lineHeight: 1.65 }}>
          {inApp && 'Access for your company is paused. Your company\'s account owner can restore it — your data is safe in the meantime.'}
          {!inApp && isPastDue && 'We couldn\'t process your last payment. Update your payment method to restore access for your entire team.'}
          {!inApp && isCanceled && 'Your subscription has been canceled. Reactivate to restore access for you and your team.'}
          {!inApp && isExpiredTrial && 'Your 30-day free trial is over. Choose a plan to keep your data and restore access for your whole team.'}
        </p>

        {/* Plan Cards (quick) */}
        {!isPastDue && !inApp && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
            {[
              { id: 'starter', name: 'Starter', price: '$499', sub: '/mo · up to 10 projects' },
              { id: 'professional', name: 'Professional', price: '$750', sub: '/mo · unlimited everything', popular: true },
            ].map(plan => (
              <div key={plan.id} style={{
                background: CARD,
                border: `1.5px solid ${plan.popular ? GOLD : BORDER}`,
                borderRadius: 16, padding: '20px 16px',
                boxShadow: plan.popular ? '0 4px 14px var(--brand-primary-12)' : 'none',
              }}>
                {plan.popular && (
                  <div style={{ fontSize: 9, fontWeight: 800, color: GOLD, marginBottom: 8 }}>Most Popular</div>
                )}
                <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{plan.name}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: plan.popular ? GOLD : TEXT, marginBottom: 4 }}>{plan.price}<span style={{ fontSize: 12, fontWeight: 400, color: DIM }}>/mo</span></div>
                <div style={{ fontSize: 11, color: DIM, marginBottom: 16 }}>{plan.sub}</div>
                <Link href={`/app/billing?plan=${plan.id}`} style={{
                  display: 'block', padding: '10px 0', borderRadius: 10,
                  background: plan.popular ? GOLD : PAGE,
                  border: plan.popular ? 'none' : `1px solid ${BORDER}`,
                  color: plan.popular ? 'var(--text-primary)' : TEXT, fontWeight: 700, fontSize: 13,
                  textDecoration: 'none',
                }}>
                  Select Plan
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* CTA Buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {!inApp && <Link href="/app/billing" style={{
            padding: '14px 32px',
            background: isPastDue ? RED : GOLD,
            borderRadius: 12, color: 'var(--text-primary)',
            fontWeight: 700, fontSize: 15, textDecoration: 'none',
            boxShadow: isPastDue ? '0 4px 16px rgba(255,59,48,0.25)' : '0 4px 16px var(--brand-primary-25)',
          }}>
            {isPastDue ? 'Update Payment Method' : 'Upgrade Now →'}
          </Link>}
          <a href="mailto:support@saguarocontrol.net" style={{
            padding: '14px 24px', background: CARD,
            border: `1px solid ${BORDER}`, borderRadius: 12,
            color: TEXT, fontWeight: 600, fontSize: 14, textDecoration: 'none',
          }}>
            Contact Support
          </a>
        </div>

        {/* Trust line */}
        <div style={{ marginTop: 28, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['Your data is safe', 'Cancel anytime', 'No per-seat fees'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: DIM }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="8" fill="rgba(44,255,122,0.15)" />
                <path d="M4.5 8l2.5 2.5 4-5" stroke={GREEN} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t}
            </div>
          ))}
        </div>

        {/* Data preservation note */}
        <div style={{ marginTop: 24, padding: '14px 20px', background: 'var(--brand-primary-08)', border: `1px solid var(--brand-primary-12)`, borderRadius: 12, fontSize: 13, color: DIM }}>
          Your projects, documents, and data are preserved for <strong style={{ color: TEXT }}>30 days</strong>. Reactivate anytime to pick up right where you left off.
        </div>

      </div>
    </div>
  );
}
