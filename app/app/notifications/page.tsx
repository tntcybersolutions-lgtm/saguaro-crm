'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { CurrencyDollar, CheckCircle, ArrowsClockwise, Warning, Question, NotePencil, Trophy, Handshake, Buildings, FileText, WarningOctagon, Clock, Bell, X, ArrowRight } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, PremiumEmpty, StatStrip, goldOutlineButtonStyle, ghostButtonStyle } from '@/components/ui/premium';

const GOLD = 'var(--brand-primary)';
const DARK = 'var(--bg-base)';
const RAISED = 'var(--bg-surface)';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = '#CBD5E1';
const TEXT = '#FFFFFF';
const GREEN = '#1a8a4a';
const RED = '#c03030';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  message?: string;
  link: string;
  action_url?: string;
  read: boolean;
  created_at: string;
  project_id?: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ComponentType<any>; label: string; color: string; actions?: string[] }> = {
  pay_app_submitted:   { icon: CurrencyDollar, label: 'Pay App', color: 'var(--brand-primary)', actions: ['Review Pay App'] },
  pay_app_approved:    { icon: CheckCircle, label: 'Pay App', color: GREEN, actions: ['View Lien Waivers'] },
  pay_app_certified:   { icon: CheckCircle, label: 'Pay App', color: GREEN },
  change_order_approved:{ icon: ArrowsClockwise, label: 'Change Order', color: GREEN },
  insurance_expiring:  { icon: Warning, label: 'Insurance', color: 'var(--warning)', actions: ['Request Renewal'] },
  rfi_submitted:       { icon: Question, label: 'RFI', color: '#8b5cf6', actions: ['Answer RFI'] },
  rfi_answered:        { icon: CheckCircle, label: 'RFI', color: GREEN },
  bid_submitted:       { icon: NotePencil, label: 'Bid', color: 'var(--brand-primary)', actions: ['Review Bid'] },
  bid_awarded:         { icon: Trophy, label: 'Bid', color: GOLD },
  sub_added:           { icon: Handshake, label: 'Team', color: '#8b5cf6' },
  project_created:     { icon: Buildings, label: 'Project', color: GOLD },
  document_generated:  { icon: FileText, label: 'Document', color: 'var(--brand-primary)', actions: ['Download'] },
  Budget_Exceeded:     { icon: WarningOctagon, label: 'Alert', color: RED },
  Budget_At_Risk:      { icon: Warning, label: 'Alert', color: 'var(--warning)' },
  Overdue_RFI:         { icon: Clock, label: 'Alert', color: RED },
  Stale_Change_Order:  { icon: Bell, label: 'Alert', color: 'var(--warning)' },
};
const DEFAULT_CONFIG = { icon: Bell, label: 'Update', color: DIM };

function getConfig(type: string) {
  return TYPE_CONFIG[type] || TYPE_CONFIG[type?.replace(/\s/g,'_')] || DEFAULT_CONFIG;
}

const TYPE_GROUPS = ['All', 'Pay App', 'RFI', 'Change Order', 'Bid', 'Alert', 'Insurance', 'Team', 'Document', 'Project'];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [readFilter, setReadFilter] = useState<'all' | 'unread'>('all');
  const [typeFilter, setTypeFilter] = useState('All');
  const [markingAll, setMarkingAll] = useState(false);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/notifications?limit=100');
      if (!r.ok) throw new Error('fetch failed');
      const d = await r.json();
      const items = d.notifications || d.items || [];
      setNotifications(items);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function markRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch { /* non-fatal */ }
  }

  async function markAllRead() {
    setMarkingAll(true);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } catch { /* non-fatal */ }
    setMarkingAll(false);
  }

  async function dismiss(id: string) {
    setDismissingId(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    try {
      await fetch('/api/notifications/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch { /* non-fatal */ }
    setDismissingId(null);
  }

  // Filter
  const displayed = notifications.filter(n => {
    if (readFilter === 'unread' && n.read) return false;
    if (typeFilter !== 'All') {
      const cfg = getConfig(n.type);
      if (cfg.label !== typeFilter) return false;
    }
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  // Count per type group
  const typeCounts = TYPE_GROUPS.reduce((acc, g) => {
    acc[g] = g === 'All' ? notifications.length : notifications.filter(n => getConfig(n.type).label === g).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <PremiumSurface maxWidth={900}>
      {/* Header */}
      <ModuleHero
        eyebrow="Activity Feed"
        eyebrowIcon={<Bell size={13} weight="fill" color={GOLD} />}
        title="Notification"
        accent="Center"
        subtitle={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
        actions={
          <button
            onClick={markAllRead}
            disabled={markingAll || unreadCount === 0}
            className="pmBtn"
            style={{ ...(unreadCount > 0 ? goldOutlineButtonStyle : ghostButtonStyle), cursor: unreadCount > 0 ? 'pointer' : 'not-allowed', opacity: unreadCount > 0 ? 1 : 0.5 }}
          >
            <CheckCircle size={15} weight="fill" /> {markingAll ? 'Marking…' : 'Mark All Read'}
          </button>
        }
      />

      {/* Activity intelligence strip — what the feed holds right now */}
      {!loading && notifications.length > 0 && (
        <StatStrip items={[
          {href: '/app/notifications', label: 'Unread', value: String(unreadCount), accent: unreadCount > 0 ? GOLD : undefined, sub: unreadCount > 0 ? 'Waiting on you' : 'All caught up' },
          {href: '/app/notifications', label: 'In the Feed', value: String(notifications.length), sub: 'Most recent 100 events' },
          {href: '/app/notifications', label: 'Money Events', value: String((typeCounts['Pay App'] || 0) + (typeCounts['Change Order'] || 0)), sub: 'Pay apps + change orders' },
          {href: '/app/notifications', label: 'Alerts', value: String(typeCounts['Alert'] || 0), accent: (typeCounts['Alert'] || 0) > 0 ? RED : undefined, sub: (typeCounts['Alert'] || 0) > 0 ? 'Budget / overdue flags' : 'Nothing flagged' },
          {href: '/app/notifications',  label: 'Latest', value: notifications[0] ? timeAgo(notifications[0].created_at) : '—', sub: notifications[0] ? getConfig(notifications[0].type).label : undefined },
        ]} />
      )}

      {/* Read filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['all', 'unread'] as const).map(f => (
          <button key={f} onClick={() => setReadFilter(f)}
            style={{ padding: '6px 16px', borderRadius: 'var(--radius-sm)', border: `1px solid ${readFilter === f ? 'var(--brand-primary-25)' : 'var(--border-default)'}`, background: readFilter === f ? 'var(--brand-primary-12)' : 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))', color: readFilter === f ? GOLD : DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
            {f === 'all' ? `All (${notifications.length})` : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      {/* Type filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {TYPE_GROUPS.filter(g => g === 'All' || typeCounts[g] > 0).map(g => (
          <button key={g} onClick={() => setTypeFilter(g)}
            style={{ padding: '4px 12px', borderRadius: 'var(--radius-pill)', border: `1px solid ${typeFilter === g ? 'var(--brand-primary-25)' : 'var(--border-default)'}`, background: typeFilter === g ? 'var(--brand-primary-12)' : 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))', color: typeFilter === g ? GOLD : DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {g}{typeCounts[g] > 0 && g !== 'All' ? ` (${typeCounts[g]})` : ''}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <SectionCard flush>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: DIM, fontSize: 13 }}>Loading notifications…</div>
        ) : displayed.length === 0 ? (
          <PremiumEmpty
            icon={<Bell size={30} weight="duotone" color={GOLD} />}
            title={readFilter === 'unread' ? 'No unread notifications' : typeFilter !== 'All' ? `No ${typeFilter} notifications` : 'No notifications yet'}
            description={readFilter === 'unread' && notifications.length > 0
              ? 'Everything in the feed has been read. New activity lands here the moment it happens.'
              : typeFilter !== 'All' && notifications.length > 0
                ? `Nothing filed under ${typeFilter} yet — switch back to All to see the full feed.`
                : 'This feed fills itself as the job moves: pay apps submitted and approved, RFIs asked and answered, bids received, change orders signed, insurance expiring, and budget or overdue alerts — each with a one-click jump to the record.'}
            action={(readFilter === 'unread' || typeFilter !== 'All') && notifications.length > 0 ? (
              <button onClick={() => { setReadFilter('all'); setTypeFilter('All'); }} style={ghostButtonStyle} className="pmBtn">Show All Notifications</button>
            ) : undefined}
          />
        ) : (
          displayed.map((n, i) => {
            const cfg = getConfig(n.type);
            const body = n.body || n.message || '';
            return (
              <div
                key={n.id}
                onClick={() => !n.read && markRead(n.id)}
                style={{
                  padding: '14px 20px',
                  borderBottom: i < displayed.length - 1 ? `1px solid ${BORDER}` : 'none',
                  cursor: n.read ? 'default' : 'pointer',
                  background: n.read ? 'transparent' : 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
                  transition: 'background .15s',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                }}
              >
                {/* Icon */}
                <div style={{ width: 36, height: 36, borderRadius: 8, background: `color-mix(in srgb, ${cfg.color} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${cfg.color} 19%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  <cfg.icon size={18} weight="fill" color={cfg.color} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 2 }}>
                    <div style={{ fontSize: 14, fontWeight: n.read ? 500 : 700, color: n.read ? DIM : TEXT, lineHeight: 1.3 }}>{n.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: DIM, whiteSpace: 'nowrap' }}>{timeAgo(n.created_at)}</div>
                      <button
                        onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                        disabled={dismissingId === n.id}
                        title="Dismiss"
                        style={{ background: 'none', border: 'none', color: '#8094B0', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
                      ><X size={16} weight="bold" color="#8094B0" /></button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: body ? 4 : 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: `color-mix(in srgb, ${cfg.color} 9%, transparent)`, color: cfg.color, letterSpacing: .3 }}>{cfg.label}</span>
                  </div>

                  {body && <div style={{ fontSize: 13, color: DIM, lineHeight: 1.5, marginBottom: 6 }}>{body}</div>}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(n.link || n.action_url) && (
                      <Link
                        href={n.link || n.action_url || '#'}
                        onClick={e => { e.stopPropagation(); markRead(n.id); }}
                        style={{ fontSize: 12, color: GOLD, textDecoration: 'none', fontWeight: 600, padding: '3px 10px', background: 'var(--brand-primary-12)', border: '1px solid var(--brand-primary-25)', borderRadius: 5 }}
                      >
                        View <ArrowRight size={12} weight="bold" color={GOLD} style={{ verticalAlign: 'middle' }} />
                      </Link>
                    )}
                    {n.project_id && n.type === 'pay_app_approved' && (
                      <Link href={`/app/projects/${n.project_id}/lien-waivers`} onClick={e => { e.stopPropagation(); markRead(n.id); }}
                        style={{ fontSize: 12, color: 'var(--brand-primary)', textDecoration: 'none', fontWeight: 600, padding: '3px 10px', background: 'var(--brand-primary-12)', border: '1px solid var(--brand-primary-25)', borderRadius: 5 }}>
                        Lien Waivers <ArrowRight size={12} weight="bold" color="var(--brand-primary)" style={{ verticalAlign: 'middle' }} />
                      </Link>
                    )}
                    {n.project_id && (n.type === 'rfi_submitted') && (
                      <Link href={`/app/projects/${n.project_id}/rfis`} onClick={e => { e.stopPropagation(); markRead(n.id); }}
                        style={{ fontSize: 12, color: '#8b5cf6', textDecoration: 'none', fontWeight: 600, padding: '3px 10px', background: 'rgba(139,92,246,.1)', border: '1px solid rgba(139,92,246,.25)', borderRadius: 5 }}>
                        Answer RFI <ArrowRight size={12} weight="bold" color="#8b5cf6" style={{ verticalAlign: 'middle' }} />
                      </Link>
                    )}
                    {n.project_id && n.type === 'bid_submitted' && (
                      <Link href={`/app/projects/${n.project_id}/bid-packages`} onClick={e => { e.stopPropagation(); markRead(n.id); }}
                        style={{ fontSize: 12, color: GOLD, textDecoration: 'none', fontWeight: 600, padding: '3px 10px', background: 'var(--brand-primary-12)', border: '1px solid var(--brand-primary-25)', borderRadius: 5 }}>
                        Review Bid <ArrowRight size={12} weight="bold" color={GOLD} style={{ verticalAlign: 'middle' }} />
                      </Link>
                    )}
                  </div>
                </div>

                {!n.read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD, flexShrink: 0, marginTop: 6 }} />}
              </div>
            );
          })
        )}
      </SectionCard>
    </PremiumSurface>
  );
}
