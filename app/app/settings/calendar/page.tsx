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
import { GoogleLogo, MicrosoftOutlookLogo, AppleLogo, Copy, ArrowClockwise, LockSimple, Info, LinkSimple } from '@phosphor-icons/react';
import { PageShell, Card, Button } from '@/components/ui/kit';
import { confirmDialog } from '@/lib/ui/async-dialog';
import { humanError } from '@/lib/errors';

type Links = { url: string; webcal: string; google: string; outlook: string };

/** One calendar app: its mark, what it does, and the one button that subscribes. */
function ProviderRow({ icon, name, text, href, primary, last }: { icon: React.ReactNode; name: string; text: string; href: string; primary?: boolean; last?: boolean }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: last ? 'none' : '1px solid var(--border-subtle)' }}>
      <span aria-hidden style={{ width: 40, height: 40, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{name}</span>
        <span style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{text}</span>
      </span>
      <Button variant={primary ? 'primary' : 'secondary'} href={href} aria-label={`Add to ${name}`}>Add</Button>
    </li>
  );
}

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
    catch { setErr('Copy failed — press and hold the link to copy it.'); }
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
      subtitle="Keep your schedule tasks, inspections and meetings in the calendar you already use."
    >
      <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
        {err && <Card title="Something went wrong" subtitle={err} actions={<Button onClick={() => void load()}>Try again</Button>}><span /></Card>}
        {!links && !err && <Card><div className="pmSkeleton" style={{ height: 120, borderRadius: 10 }} aria-label="Getting your calendar link" /></Card>}
        {links && (
          <>
            <Card title="Add to your calendar" subtitle="One tap. Your calendar app checks for changes about every hour.">
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                <ProviderRow primary icon={<GoogleLogo size={22} weight="bold" color="var(--text-primary)" />} name="Google Calendar" text="Tasks, inspections and meetings in Google." href={links.google} />
                <ProviderRow icon={<MicrosoftOutlookLogo size={22} weight="fill" color="var(--link)" />} name="Outlook" text="Your work schedule in Outlook on the web." href={links.outlook} />
                <ProviderRow icon={<AppleLogo size={22} weight="fill" color="var(--text-primary)" />} name="Apple Calendar" text="iPhone, iPad or Mac Calendar." href={links.webcal} last />
              </ul>
            </Card>
            <Card>
              <div style={{ display: 'grid', gap: 12, padding: 0 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span aria-hidden style={{ width: 40, height: 40, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'var(--bg-surface-2)', border: '1px solid var(--border-default)' }}>
                    <LockSimple size={20} weight="bold" color="var(--text-secondary)" />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Your private calendar link</span>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>Anyone with this link can see your schedule — don&apos;t share it. Make a new one if it gets out.</span>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minWidth: 0 }}>
                  <span title={links.url} style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 12px', borderRadius: 10, background: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 14 }}>
                    <LinkSimple size={16} color="var(--text-tertiary)" style={{ flexShrink: 0 }} aria-hidden />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{links.url}</span>
                  </span>
                  <Button icon={<Copy size={16} />} onClick={copy}>{copied ? 'Copied' : 'Copy Link'}</Button>
                </div>
                <Button icon={<ArrowClockwise size={16} />} onClick={reset} disabled={resetting}>{resetting ? 'Making…' : 'Make New Link'}</Button>
                <p style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0, fontSize: 13, color: 'var(--text-tertiary)' }}>
                  <Info size={15} aria-hidden /> Updates about once an hour.
                </p>
              </div>
            </Card>
          </>
        )}
      </div>
    </PageShell>
  );
}
