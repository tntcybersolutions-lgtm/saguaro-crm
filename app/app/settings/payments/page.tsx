'use client';
/**
 * Settings → Get Paid Online. A company connects its own Stripe account once;
 * then every owner invoice can be paid by card or bank from the client portal
 * and from the emailed invoice link. Money lands in the company's bank; Stripe
 * takes its fee from each payment; Saguaro holds nothing and takes no cut.
 *
 *   GET  /api/payments/status   configured / connected / ready / due
 *   POST /api/payments/connect  → Stripe's onboarding page (admins only)
 */
import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Bank, CheckCircle, ArrowSquareOut, WarningCircle } from '@phosphor-icons/react';
import { PageShell, Card, Badge, Button } from '@/components/ui/kit';
import { humanError } from '@/lib/errors';

type Status = { configured: boolean; connected: boolean; ready: boolean; due: string[] };

export default function PaymentsSettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState('');
  const [opening, setOpening] = useState(false);
  const [actionError, setActionError] = useState('');

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
    : status.ready ? <Badge tone="ongoing" dot>On — taking payments</Badge>
    : status.connected ? <Badge tone="under_contract" dot>Setup not finished</Badge>
    : <Badge tone="neutral">Off</Badge>;

  return (
    <PageShell
      crumbs={[{ label: 'Settings', href: '/app/settings' }, { label: 'Get Paid Online' }]}
      title="Get Paid Online"
      subtitle="Owners pay your invoices by card or bank from their portal and the invoice email."
      actions={badge}
    >
      <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
        {loadError && (
          <Card title="Couldn't check online payments" subtitle={loadError} actions={<Button onClick={() => void load()}>Try again</Button>}>
            <span />
          </Card>
        )}

        {!status && !loadError && (
          <Card title="Checking your payment setup…"><div className="pmSkeleton" style={{ height: 48, borderRadius: 10 }} /></Card>
        )}

        {status && !status.configured && (
          <Card title="Online payments aren't switched on yet" subtitle="Saguaro's payment connection isn't set up on this site yet. Invoices still go out by email and can be marked paid by hand.">
            <span />
          </Card>
        )}

        {status && status.configured && (
          <Card
            title={status.ready ? 'Your Stripe account is connected' : status.connected ? 'Finish your Stripe setup' : 'Connect your Stripe account'}
            subtitle={status.ready
              ? 'Every open owner invoice now shows a Pay button in the client portal and in the invoice email.'
              : status.connected
                ? 'Stripe still needs a few details before it can send money to your bank.'
                : 'Takes about 5 minutes. Have your bank account and EIN (or SSN) ready.'}
            actions={
              <Button variant={status.ready ? 'secondary' : 'primary'} icon={<ArrowSquareOut size={15} />} onClick={connect} disabled={opening}>
                {opening ? 'Opening Stripe…' : status.ready ? 'Open Stripe Settings' : status.connected ? 'Continue Setup' : 'Connect Stripe'}
              </Button>
            }
          >
            {actionError && (
              <p role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--danger)', fontWeight: 700, margin: '0 0 12px' }}>
                <WarningCircle size={18} weight="fill" /> {actionError}
              </p>
            )}
            {status.connected && !status.ready && status.due.length > 0 && (
              <p style={{ color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                Stripe is waiting on {status.due.length === 1 ? '1 item' : `${status.due.length} items`} — tap Continue Setup to finish.
              </p>
            )}
            <ul style={{ display: 'grid', gap: 12, listStyle: 'none', margin: 0, padding: 0 }}>
              <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <CreditCard size={22} weight="bold" color="var(--brand-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
                <span><b>Card</b> — Stripe&apos;s fee is 2.9% + 30¢, taken from that payment.</span>
              </li>
              <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <Bank size={22} weight="bold" color="var(--brand-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
                <span><b>Bank (ACH)</b> — 0.8%, capped at $5. Best for large draws; clears in a few business days.</span>
              </li>
              <li style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <CheckCircle size={22} weight="bold" color="var(--brand-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>Payments land in your own bank. A paid invoice marks itself paid in Saguaro.</span>
              </li>
            </ul>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
