'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const GOLD = '#D4A017';
const DARK = '#0d1117';
const RAISED = '#1f2c3e';
const BORDER = '#263347';
const DIM = '#8fa3c0';
const TEXT = '#e8edf8';
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

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string; actions?: string[] }> = {
  pay_app_submitted:   { icon: '💰', label: 'Pay App',      color: '#3b82f6', actions: ['Review Pay App'] },
  pay_app_approved:    { icon: '✅', label: 'Pay App',      color: GREEN,     actions: ['View Lien Waivers'] },
  pay_app_certified:   { icon: '✅', label: 'Pay App',      color: GREEN },
  change_order_approved:{ icon: '🔄', label: 'Change Order', color: GREEN },
  insurance_expiring:  { icon: '⚠️', label: 'Insurance',    color: '#d97706', actions: ['Request Renewal'] },
  rfi_submitted:       { icon: '❓', label: 'RFI',          color: '#8b5cf6', actions: ['Answer RFI'] },
  rfi_answered:        { icon: '✅', label: 'RFI',          color: GREEN },
  bid_submitted:       { icon: '📝', label: 'Bid',          color: '#3b82f6', actions: ['Review Bid'] },
  bid_awarded:         { icon: '🏆', label: 'Bid',          color: GOLD },
  sub_added:           { icon: '🤝', label: 'Team',         color: '#8b5cf6' },
  project_created:     { icon: '🏗️', label: 'Project',     color: GOLD },
  document_generated:  { icon: '📄', label: 'Document',     color: '#3b82f6', actions: ['Download'] },
  Budget_Exceeded:     { icon: '🚨', label: 'Alert',        color: RED },
  Budget_At_Risk:      { icon: '⚠️', label: 'Alert',        color: '#d97706' },
  Overdue_RFI:         { icon: '⏰', label: 'Alert',        color: RED },
  Stale_Change_Order:  { icon: '🔔', label: 'Alert',        color: '#d97706' },
};
const DEFAULT_CONFIG = { icon: '🔔', label: 'Update', color: DIM };

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
    <div style={{ padding: '24px 28px', maxWidth: 880, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: DIM }}>Activity Feed</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: TEXT, margin: '4px 0' }}>Notifications</h1>
          <div style={{ fontSize: 13, color: DIM }}>{unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up'}</div>
        </div>
        <button
          onClick={markAllRead}
          disabled={markingAll || unreadCount === 0}
          style={{ padding: '8px 16px', background: 'none', border: `1px solid ${BORDER}`, borderRadius: 7, color: unreadCount > 0 ? DIM : '#4a5f7a', fontSize: 12, fontWeight: 600, cursor: unreadCount > 0 ? 'pointer' : 'not-allowed', opacity: unreadCount > 0 ? 1 : 0.5 }}
        >
          {markingAll ? 'Marking...' : 'Mark all read'}
        </button>
      </div>

      {/* Read filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['all', 'unread'] as const).map(f => (
          <button key={f} onClick={() => setReadFilter(f)}
            style={{ padding: '6px 16px', borderRadius: 6, border: `1px solid ${readFilter === f ? GOLD : BORDER}`, background: readFilter === f ? 'rgba(212,160,23,.12)' : 'transparent', color: readFilter === f ? GOLD : DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
            {f === 'all' ? `All (${notifications.length})` : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      {/* Type filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {TYPE_GROUPS.filter(g => g === 'All' || typeCounts[g] > 0).map(g => (
          <button key={g} onClick={() => setTypeFilter(g)}
            style={{ padding: '4px 12px', borderRadius: 20, border: `1px solid ${typeFilter === g ? GOLD : BORDER}`, background: typeFilter === g ? 'rgba(212,160,23,.12)' : 'transparent', color: typeFilter === g ? GOLD : DIM, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {g}{typeCounts[g] > 0 && g !== 'All' ? ` (${typeCounts[g]})` : ''}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: DIM, fontSize: 13 }}>Loading notifications...</div>
        ) : displayed.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: DIM }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔔</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
              {readFilter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </div>
            <div style={{ fontSize: 13 }}>Activity from your projects will appear here.</div>
          </div>
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
                  background: n.read ? 'transparent' : 'rgba(212,160,23,.04)',
                  transition: 'background .15s',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                }}
              >
                {/* Icon */}
                <div style={{ width: 36, height: 36, borderRadius: 8, background: `${cfg.color}18`, border: `1px solid ${cfg.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {cfg.icon}
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
                        style={{ background: 'none', border: 'none', color: '#3a4f6a', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
                      >×</button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: body ? 4 : 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: `${cfg.color}18`, color: cfg.color, textTransform: 'uppercase', letterSpacing: .3 }}>{cfg.label}</span>
                  </div>

                  {body && <div style={{ fontSize: 13, color: DIM, lineHeight: 1.5, marginBottom: 6 }}>{body}</div>}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(n.link || n.action_url) && (
                      <Link
                        href={n.link || n.action_url || '#'}
                        onClick={e => { e.stopPropagation(); markRead(n.id); }}
                        style={{ fontSize: 12, color: GOLD, textDecoration: 'none', fontWeight: 600, padding: '3px 10px', background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.25)', borderRadius: 5 }}
                      >
                        View →
                      </Link>
                    )}
                    {n.project_id && n.type === 'pay_app_approved' && (
                      <Link href={`/app/projects/${n.project_id}/lien-waivers`} onClick={e => { e.stopPropagation(); markRead(n.id); }}
                        style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none', fontWeight: 600, padding: '3px 10px', background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.25)', borderRadius: 5 }}>
                        Lien Waivers →
                      </Link>
                    )}
                    {n.project_id && (n.type === 'rfi_submitted') && (
                      <Link href={`/app/projects/${n.project_id}/rfis`} onClick={e => { e.stopPropagation(); markRead(n.id); }}
                        style={{ fontSize: 12, color: '#8b5cf6', textDecoration: 'none', fontWeight: 600, padding: '3px 10px', background: 'rgba(139,92,246,.1)', border: '1px solid rgba(139,92,246,.25)', borderRadius: 5 }}>
                        Answer RFI →
                      </Link>
                    )}
                    {n.project_id && n.type === 'bid_submitted' && (
                      <Link href={`/app/projects/${n.project_id}/bid-packages`} onClick={e => { e.stopPropagation(); markRead(n.id); }}
                        style={{ fontSize: 12, color: GOLD, textDecoration: 'none', fontWeight: 600, padding: '3px 10px', background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.25)', borderRadius: 5 }}>
                        Review Bid →
                      </Link>
                    )}
                  </div>
                </div>

                {!n.read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD, flexShrink: 0, marginTop: 6 }} />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
