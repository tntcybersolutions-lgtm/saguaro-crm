'use client';
/**
 * Settings → Get Paid Online. A company connects its own Stripe account once;
 * then every owner invoice can be paid by card or bank from the client portal
 * and from the emailed invoice link. Money lands in the company's bank; Stripe
 * takes its fee from each payment; Saguaro holds nothing and takes no cut.
 *
 *   GET  /api/payments/status   configured / connected / ready / due
 *   POST /api/payments/connect  → Stripe's onboarding page (admins only — the
 *                                 setup action is shown to admins only too)
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Bank, CheckCircle, ArrowSquareOut, WarningCircle, Receipt, Info } from '@phosphor-icons/react';
import { PageShell, Card, Badge, Button } from '@/components/ui/kit';
import { humanError } from '@/lib/errors';
import { usePermissions } from '@/lib/hooks/usePermissions';

type Status = { configured: boolean; connected: boolean; ready: boolean; due: string[] };

/** The three real steps of Stripe setup, in order, with where this company is. */
function steps(status: Status) {
  const done1 = status.connected;
  const done2 = status.ready;
  return [
    { title: 'Connect your Stripe account', text: 'Your bank account and EIN (or SSN). About 5 minutes.', done: done1 },
    { title: 'Stripe verifies your business', text: status.connected && !status.ready && status.due.length > 0 ? `Stripe is waiting on ${status.due.length === 1 ? '1 item' : `${status.due.length} items`}.` : 'Usually right away; sometimes a business day.', done: done2 },
    { title: 'Start getting paid', text: 'Owners pay from their portal and the invoice email. Paid invoices mark themselves paid.', done: done2 },
  ];
}

export default function PaymentsSettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState('');
  const [opening, setOpening] = useState(false);
  const [actionError, setActionError] = useState('');
  const perms = usePermissions();
  // Setup decides which bank the company's money goes to — admins only, the
  // same rule /api/payments/connect enforces. Hidden until permissions load.
  const canSetUp = perms.resolved && perms.can('Admin', 'Full');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await fetch('/api/payments/status', { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setLoadError(d.error || "Couldn't check online payments."); return; }
      setStatus(d as Status);
    } catch (e) {
      setLoadError(humanError(e, "Couldn't check online payments. Check your connection."));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const connect = async () => {
    setOpening(true); setActionError('');
    try {
      const res = await fetch('/api/payments/connect', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.url) { window.location.href = d.url; return; }
      setActionError(d.error || "Couldn't open Stripe setup.");
    } catch (e) {
      setActionError(humanError(e, "Couldn't open Stripe setup. Check your connection."));
    }
    setOpening(false);
  };

  const badge = !status ? null
    : status.ready ? <Badge tone="ongoing" dot>On</Badge>
    : !status.configured ? <Badge tone="neutral">Not available yet</Badge>
    : <Badge tone="lead" dot>Setup required</Badge>;

  // The one status card: what is true now, and the next thing to do.
  const head = !status ? null
    : !status.configured ? {
      tone: 'neutral' as const,
      title: "Online payments aren't available yet",
      text: "Saguaro's payment connection isn't switched on for this site. Invoices still go out by email and can be marked paid by hand.",
    }
    : status.ready ? {
      tone: 'good' as const,
      title: "You're taking payments online",
      text: 'Every open owner invoice shows a Pay button in the client portal and in the invoice email.',
    }
    : status.connected ? {
      tone: 'warn' as const,
      title: 'Finish your Stripe setup',
      text: 'Stripe still needs a few details before it can send money to your bank.',
    }
    : {
      tone: 'warn' as const,
      title: 'Online payments are not enabled',
      text: canSetUp ? 'Connect your Stripe account to get started.' : 'An admin on your account can switch them on here.',
    };

  const toneColor = head?.tone === 'good' ? 'var(--success)' : head?.tone === 'warn' ? 'var(--warning)' : 'var(--text-tertiary)';
  const setupLabel = opening ? 'Opening Stripe…' : status?.ready ? 'Open Stripe Settings' : status?.connected ? 'Continue Setup' : 'Set Up Payments';

  return (
    <PageShell
      crumbs={[{ label: 'Settings', href: '/app/settings' }, { label: 'Get Paid Online' }]}
      title="Get Paid Online"
      subtitle="Let owners pay invoices securely from their portal and the invoice email."
      actions={badge}
    >
      <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
        {loadError && (
          <Card title="Couldn't check online payments" subtitle={loadError} actions={<Button onClick={() => void load()}>Try again</Button>}>
            <span />
          </Card>
        )}

        {!status && !loadError && (
          <Card><div className="pmSkeleton" style={{ height: 96, borderRadius: 10 }} aria-label="Checking your payment setup" /></Card>
        )}

        {status && head && (
          <Card>
            <div style={{ display: 'grid', gap: 14, padding: 0 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span aria-hidden style={{ width: 40, height: 40, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)' }}>
                  {head.tone === 'good' ? <CheckCircle size={22} weight="fill" color={toneColor} /> : head.tone === 'warn' ? <WarningCircle size={22} weight="fill" color={toneColor} /> : <Info size={22} weight="bold" color={toneColor} />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35 }}>{head.title}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.5 }}>{head.text}</div>
                </div>
              </div>
              {actionError && (
                <p role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--danger)', fontWeight: 600, margin: 0 }}>
                  <WarningCircle size={18} weight="fill" /> {actionError}
                </p>
              )}
              <div style={{ display: 'grid', gap: 10 }}>
                {status.configured && canSetUp && (
                  <Button variant={status.ready ? 'secondary' : 'primary'} icon={status.ready ? <ArrowSquareOut size={16} /> : <CreditCard size={16} weight="bold" />} onClick={connect} disabled={opening}>
                    {setupLabel}
                  </Button>
                )}
                <Button variant="secondary" icon={<Receipt size={16} />} href="/app/invoicing">View Invoices</Button>
              </div>
            </div>
          </Card>
        )}

        {status && status.configured && (
          <Card title="Setup">
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 14 }}>
              {steps(status).map((s, i) => {
                const current = !s.done && steps(status).slice(0, i).every((p) => p.done);
                return (
                  <li key={s.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span aria-hidden style={{
                      width: 26, height: 26, flexShrink: 0, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700,
                      background: s.done ? 'var(--success)' : current ? 'var(--brand-primary)' : 'var(--bg-surface-2)',
                      color: s.done || current ? 'var(--on-brand)' : 'var(--text-secondary)',
                      border: s.done || current ? 'none' : '1px solid var(--border-default)',
                    }}>{s.done ? <CheckCircle size={16} weight="bold" /> : i + 1}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{s.title}{s.done && <span className="sr-only"> — done</span>}</span>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.45 }}>{s.text}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}

        {status && status.configured && (
          <Card title="What it costs" subtitle="Stripe's fee comes out of each payment. Saguaro takes no cut.">
            <ul style={{ display: 'grid', gap: 12, listStyle: 'none', margin: 0, padding: 0 }}>
              <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <CreditCard size={20} weight="bold" color="var(--text-secondary)" style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}><b style={{ color: 'var(--text-primary)' }}>Card</b> — 2.9% + 30¢.</span>
              </li>
              <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <Bank size={20} weight="bold" color="var(--text-secondary)" style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}><b style={{ color: 'var(--text-primary)' }}>Bank (ACH)</b> — 0.8%, capped at $5. Best for large draws; clears in a few business days.</span>
              </li>
            </ul>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
