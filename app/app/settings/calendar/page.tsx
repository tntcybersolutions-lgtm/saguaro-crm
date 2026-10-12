'use client';
/**
 * Settings → Calendar Sync. Your schedule tasks, inspections and meetings in
 * Google Calendar, Outlook or your iPhone's Calendar — subscribed by a private
 * link, refreshed by the calendar app (about hourly). Read-only: change the
 * date in Saguaro and the calendar follows. Free; no Google / Microsoft login.
 *
 *   GET  /api/calendar/link            → { url, webcal, google, outlook }
 *   POST /api/calendar/link {reset}    → a new link; the old one stops working
 */
import React, { useCallback, useEffect, useState } from 'react';
import { GoogleLogo, MicrosoftOutlookLogo, AppleLogo, Copy, ArrowClockwise } from '@phosphor-icons/react';
import { PageShell, Card, Button } from '@/components/ui/kit';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { humanError } from '@/lib/errors';

type Links = { url: string; webcal: string; google: string; outlook: string };

export default function CalendarSyncPage() {
  const [links, setLinks] = useState<Links | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async (reset = false) => {
    setErr('');
    try {
      const res = await fetch('/api/calendar/link', reset
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true }) }
        : { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || "Couldn't load your calendar link."); return; }
      setLinks(d as Links);
    } catch (e) {
      setErr(humanError(e, "Couldn't load your calendar link. Check your connection."));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const copy = async () => {
    if (!links) return;
    try { await navigator.clipboard.writeText(links.url); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setErr('Copy failed — press and hold the link below to copy it.'); }
  };

  const reset = async () => {
    const ok = await confirmDialog({
      title: 'Make a new calendar link?',
      message: 'The old link stops working — any calendar subscribed to it stops updating until you add the new one.',
      confirmLabel: 'Make New Link',
    });
    if (!ok) return;
    setResetting(true); await load(true); setResetting(false);
  };

  return (
    <PageShell
      crumbs={[{ label: 'Settings', href: '/app/settings' }, { label: 'Calendar Sync' }]}
      title="Calendar Sync"
      subtitle="Your schedule tasks, inspections and meetings in Google, Outlook or iPhone Calendar."
    >
      <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
        {err && <Card title="Something went wrong" subtitle={err} actions={<Button onClick={() => void load()}>Try again</Button>}><span /></Card>}
        {!links && !err && <Card title="Getting your calendar link…"><div className="pmSkeleton" style={{ height: 48, borderRadius: 10 }} /></Card>}
        {links && (
          <>
            <Card title="Add to your calendar" subtitle="One tap. Your calendar app checks for changes about every hour.">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 210px), 1fr))', gap: 10 }}>
                <Button variant="primary" icon={<GoogleLogo size={18} weight="bold" />} href={links.google}>Google Calendar</Button>
                <Button variant="primary" icon={<MicrosoftOutlookLogo size={18} weight="bold" />} href={links.outlook}>Outlook</Button>
                <Button variant="primary" icon={<AppleLogo size={18} weight="bold" />} href={links.webcal}>iPhone / Mac</Button>
              </div>
            </Card>
            <Card
              title="Your private link"
              subtitle="Anyone with this link can see your schedule — don't share it. Make a new one if it gets out."
              actions={<Button icon={<ArrowClockwise size={15} />} onClick={reset} disabled={resetting}>{resetting ? 'Making…' : 'Make New Link'}</Button>}
            >
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <code style={{ flex: '1 1 260px', minWidth: 0, overflowWrap: 'anywhere', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13 }}>{links.url}</code>
                <Button icon={<Copy size={15} />} onClick={copy}>{copied ? 'Copied' : 'Copy Link'}</Button>
              </div>
            </Card>
          </>
        )}
      </div>
    </PageShell>
  );
}
