'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { CurrencyDollar, CheckCircle, ArrowsClockwise, Warning, Question, NotePencil, Trophy, Handshake, Buildings, FileText, WarningOctagon, Clock, Bell, X, ArrowRight } from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, PremiumEmpty, StatStrip, goldOutlineButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import PushAlertsCard from '@/components/notifications/PushAlertsCard';

const GOLD = 'var(--brand-primary)';
const DARK = 'var(--bg-base)';
const RAISED = 'var(--bg-surface)';
const BORDER = 'rgba(255,255,255,0.12)';
const DIM = 'var(--text-secondary)';
const TEXT = 'var(--text-primary)';
const GREEN = 'var(--success)';
const RED = 'var(--danger)';

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
  pay_app_submitted:   { icon: CurrencyDollar, label: 'Pay App', color: 'var(--text-primary)', actions: ['Review Pay App'] },
  pay_app_approved:    { icon: CheckCircle, label: 'Pay App', color: GREEN, actions: ['View Lien Waivers'] },
  pay_app_certified:   { icon: CheckCircle, label: 'Pay App', color: GREEN },
  change_order_approved:{ icon: ArrowsClockwise, label: 'Change Order', color: GREEN },
  insurance_expiring:  { icon: Warning, label: 'Insurance', color: 'var(--warning)', actions: ['Request Renewal'] },
  rfi_submitted:       { icon: Question, label: 'RFI', color: 'var(--warning)', actions: ['Answer RFI'] },
  rfi_answered:        { icon: CheckCircle, label: 'RFI', color: GREEN },
  bid_submitted:       { icon: NotePencil, label: 'Bid', color: 'var(--text-primary)', actions: ['Review Bid'] },
  bid_awarded:         { icon: Trophy, label: 'Bid', color: 'var(--text-primary)' },
  sub_added:           { icon: Handshake, label: 'Team', color: 'var(--warning)' },
  project_created:     { icon: Buildings, label: 'Project', color: 'var(--text-primary)' },
  document_generated:  { icon: FileText, label: 'Document', color: 'var(--text-primary)', actions: ['Download'] },
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
/** The "Money Events" tile's filter: pay apps and change orders together. */
const MONEY = 'Money';
const MONEY_GROUPS = ['Pay App', 'Change Order'];

/* Filter buttons are 44px tap targets on a phone. */
const NT_CSS = `
.ntFilter{min-height:40px;padding:0 14px;border-radius:var(--radius-md);border:1px solid var(--border-default);background:transparent;color:var(--text-secondary);font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.ntFilter:hover{color:var(--text-primary);border-color:var(--border-strong)}
.ntFilter[aria-pressed=true]{background:var(--brand-primary);border-color:var(--brand-primary);color:var(--on-brand)}
.ntSep{width:1px;align-self:stretch;background:var(--border-default);margin:0 4px}
.ntList{border-top:1px solid var(--border-default)}
.ntRow{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--border-default)}
.ntRow[data-unread=true]{cursor:pointer}
.ntAct{display:inline-flex;align-items:center;gap:4px;min-height:40px;font-size:13px;font-weight:600;color:var(--link);text-decoration:none}
.ntX{display:grid;place-items:center;width:40px;height:40px;margin:-10px -8px -10px 0;background:none;border:0;border-radius:8px;cursor:pointer}
.ntX:hover{background:var(--bg-row-hover)}
@media (max-width: 767px) { .ntFilter, .ntAct { min-height: 44px; } .ntX { width: 44px; height: 44px; } }
`;

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
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const r = await fetch('/api/notifications?limit=100');
      if (!r.ok) throw new Error('fetch failed');
      const d = await r.json();
      const items = d.notifications || d.items || [];
      setNotifications(items);
    } catch {
      setNotifications([]);
      setLoadError(true);
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
    if (typeFilter === MONEY) {
      if (!MONEY_GROUPS.includes(getConfig(n.type).label)) return false;
    } else if (typeFilter !== 'All') {
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
  const moneyCount = (typeCounts['Pay App'] || 0) + (typeCounts['Change Order'] || 0);
  const alertCount = typeCounts['Alert'] || 0;

  /* The tiles used to link to this same page: a tap reloaded the whole feed
     and changed nothing (and the strip vanished while it reloaded). Each one
     now filters the list below — tap again to clear — or is a plain figure. */
  const filtersActive = readFilter !== 'all' || typeFilter !== 'All';
  const showAll = () => { setReadFilter('all'); setTypeFilter('All'); };
  const toggleType = (t: string) => setTypeFilter(prev => (prev === t ? 'All' : t));

  return (
    <PremiumSurface>
      <style dangerouslySetInnerHTML={{ __html: NT_CSS }} />
      {/* Header */}
      <ModuleHero
        eyebrow="Activity Feed"
        eyebrowIcon={<Bell size={13} weight="fill" color="var(--text-secondary)" />}
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

      {/* Phone / computer alerts for this device */}
      <PushAlertsCard />

      {/* Activity intelligence strip — what the feed holds right now */}
      {!loading && notifications.length > 0 && (
        <StatStrip items={[
          { label: 'Unread', value: String(unreadCount), onClick: unreadCount > 0 || readFilter === 'unread' ? () => setReadFilter(f => (f === 'unread' ? 'all' : 'unread')) : undefined, active: readFilter === 'unread', sub: readFilter === 'unread' ? 'Showing unread — tap to clear' : unreadCount > 0 ? 'Waiting on you' : 'All caught up' },
          { label: 'Money Events', value: String(moneyCount), onClick: moneyCount > 0 || typeFilter === MONEY ? () => toggleType(MONEY) : undefined, active: typeFilter === MONEY, sub: typeFilter === MONEY ? 'Showing money — tap to clear' : 'Pay apps + change orders' },
          { label: 'Alerts', value: String(alertCount), accent: alertCount > 0 ? RED : undefined, onClick: alertCount > 0 || typeFilter === 'Alert' ? () => toggleType('Alert') : undefined, active: typeFilter === 'Alert', sub: typeFilter === 'Alert' ? 'Showing alerts — tap to clear' : alertCount > 0 ? 'Budget / overdue flags' : 'Nothing flagged' },
          { label: 'Latest', value: notifications[0] ? timeAgo(notifications[0].created_at) : '', sub: notifications[0] ? getConfig(notifications[0].type).label : undefined },
        ]} />
      )}

      {/* Filters — one row: read state, then type */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'unread'] as const).map(f => (
          <button key={f} type="button" className="ntFilter" aria-pressed={readFilter === f} onClick={() => setReadFilter(f)}>
            {f === 'all' ? `All (${notifications.length})` : `Unread (${unreadCount})`}
          </button>
        ))}
        {TYPE_GROUPS.some(g => g !== 'All' && typeCounts[g] > 0) && <span className="ntSep" aria-hidden />}
        {TYPE_GROUPS.filter(g => g !== 'All' && typeCounts[g] > 0).map(g => (
          <button key={g} type="button" className="ntFilter" aria-pressed={typeFilter === g} onClick={() => toggleType(g)}>
            {g} ({typeCounts[g]})
          </button>
        ))}
        {typeFilter === MONEY && (
          <button type="button" className="ntFilter" aria-pressed onClick={() => setTypeFilter('All')} aria-label="Clear the money events filter"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Money ({moneyCount}) <X size={12} weight="bold" />
          </button>
        )}
      </div>

      {/* Notification list */}
      <div className="ntList">
        {loadError ? (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '14px 0', fontSize: 14, color: TEXT }}>
            <Warning size={18} weight="fill" color={RED} /> Couldn’t load your notifications.
            <button type="button" onClick={load} className="ntAct" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>Try again</button>
          </div>
        ) : loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: DIM, fontSize: 13 }}>Loading notifications…</div>
        ) : displayed.length === 0 ? (
          <PremiumEmpty
            icon={<Bell size={30} weight="duotone" color="var(--text-secondary)" />}
            title={readFilter === 'unread' ? 'No unread notifications' : typeFilter === MONEY ? 'No money events' : typeFilter !== 'All' ? `No ${typeFilter} notifications` : 'No notifications yet'}
            description={readFilter === 'unread' && notifications.length > 0
              ? 'Everything in the feed has been read.'
              : typeFilter !== 'All' && notifications.length > 0
                ? `Nothing under ${typeFilter === MONEY ? 'pay apps or change orders' : typeFilter} yet.`
                : 'Pay apps, RFIs, bids, change orders and alerts land here as they happen.'}
            action={(readFilter === 'unread' || typeFilter !== 'All') && notifications.length > 0 ? (
              <button type="button" onClick={showAll} style={ghostButtonStyle} className="pmBtn">Show All Notifications</button>
            ) : undefined}
          />
        ) : (
          displayed.map((n, i) => {
            const cfg = getConfig(n.type);
            const body = n.body || n.message || '';
            return (
              <div
                key={n.id}
                className="ntRow"
                data-unread={!n.read}
                onClick={() => !n.read && markRead(n.id)}
              >
                <span style={{ display: 'flex', paddingTop: 1, flexShrink: 0 }} aria-hidden>
                  <cfg.icon size={20} weight="fill" color={cfg.color} />
                </span>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 2 }}>
                    <div style={{ fontSize: 14, fontWeight: n.read ? 500 : 700, color: n.read ? DIM : TEXT, lineHeight: 1.3 }}>{n.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <div style={{ fontSize: 12, color: DIM, whiteSpace: 'nowrap' }}>{timeAgo(n.created_at)}</div>
                      <button
                        type="button"
                        className="ntX"
                        onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                        disabled={dismissingId === n.id}
                        title="Dismiss"
                        aria-label={`Dismiss: ${n.title}`}
                      ><X size={16} weight="bold" color="var(--text-tertiary)" /></button>
                    </div>
                  </div>

                  <div style={{ fontSize: 13, color: DIM, lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 700, color: TEXT }}>{cfg.label}</span>{body ? ` · ${body}` : ''}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                    {(n.link || n.action_url) && (
                      <Link
                        href={n.link || n.action_url || '#'}
                        onClick={e => { e.stopPropagation(); markRead(n.id); }}
                        className="ntAct"
                      >
                        View <ArrowRight size={12} weight="bold" />
                      </Link>
                    )}
                    {n.project_id && n.type === 'pay_app_approved' && (
                      <Link href={`/app/projects/${n.project_id}/lien-waivers`} onClick={e => { e.stopPropagation(); markRead(n.id); }}
                        className="ntAct">
                        Lien Waivers <ArrowRight size={12} weight="bold" />
                      </Link>
                    )}
                    {n.project_id && (n.type === 'rfi_submitted') && (
                      <Link href={`/app/projects/${n.project_id}/rfis`} onClick={e => { e.stopPropagation(); markRead(n.id); }}
                        className="ntAct">
                        Answer RFI <ArrowRight size={12} weight="bold" />
                      </Link>
                    )}
                    {n.project_id && n.type === 'bid_submitted' && (
                      <Link href={`/app/projects/${n.project_id}/bid-packages`} onClick={e => { e.stopPropagation(); markRead(n.id); }}
                        className="ntAct">
                        Review Bid <ArrowRight size={12} weight="bold" />
                      </Link>
                    )}
                  </div>
                </div>

                {!n.read && <div aria-label="Unread" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-primary)', flexShrink: 0, marginTop: 6 }} />}
              </div>
            );
          })
        )}
      </div>
    </PremiumSurface>
  );
}
