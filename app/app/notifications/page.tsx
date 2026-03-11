'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const GOLD = '#D4A017';
const DARK = '#0d1117';
const RAISED = '#1f2c3e';
const BORDER = '#263347';
const DIM = '#8fa3c0';
const TEXT = '#e8edf8';
const RED = '#c03030';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  pay_app: '💰',
  insurance: '📋',
  lien_waiver: '📄',
  rfi: '❓',
  sub: '🤝',
  bid: '📝',
  change_order: '🔄',
  document: '📁',
  alert: '⚠️',
  default: '🔔',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const DEMO_NOTIFICATIONS: NotificationItem[] = [
  { id: '1', type: 'pay_app', title: 'Pay App #2 Approved', body: 'Riverdale Medical — $257,400 approved by owner', read: false, created_at: new Date(Date.now() - 3600000).toISOString(), link: '/app/projects/demo-project-00000000-0000-0000-0000-000000000001/pay-apps' },
  { id: '2', type: 'rfi', title: 'RFI-002 Overdue', body: 'Structural beam depth at roof level — no response from engineer', read: false, created_at: new Date(Date.now() - 7200000).toISOString(), link: '/app/projects/demo-project-00000000-0000-0000-0000-000000000001/rfis' },
  { id: '3', type: 'change_order', title: 'Change Order CO-001 Approved', body: 'Electrical panel 200A upgrade — $45,000 approved', read: true, created_at: new Date(Date.now() - 86400000).toISOString(), link: '/app/projects/demo-project-00000000-0000-0000-0000-000000000001/change-orders' },
  { id: '4', type: 'insurance', title: 'COI Expiring Soon', body: 'Southwest Roofing — GL certificate expires in 12 days', read: true, created_at: new Date(Date.now() - 172800000).toISOString(), link: '/app/projects/demo-project-00000000-0000-0000-0000-000000000001/insurance' },
  { id: '5', type: 'bid', title: 'New Bid Received', body: 'Desert Electrical submitted bid: $385,000 for Electrical package', read: true, created_at: new Date(Date.now() - 259200000).toISOString(), link: '/app/bids' },
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/notifications?limit=50');
      if (!r.ok) throw new Error('fetch failed');
      const d = await r.json();
      const items = d.notifications || d.items || [];
      setNotifications(items.length > 0 ? items : DEMO_NOTIFICATIONS);
    } catch {
      setNotifications(DEMO_NOTIFICATIONS);
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

  const displayed = filter === 'unread' ? notifications.filter(n => !n.read) : notifications;
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 800, margin: '0 auto' }}>
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

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['all', 'unread'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{ padding: '6px 16px', borderRadius: 6, border: `1px solid ${filter === f ? GOLD : BORDER}`, background: filter === f ? 'rgba(212,160,23,.12)' : 'transparent', color: filter === f ? GOLD : DIM, fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}
          >
            {f === 'all' ? `All (${notifications.length})` : `Unread (${unreadCount})`}
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
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </div>
            <div style={{ fontSize: 13 }}>Activity from your projects will appear here.</div>
          </div>
        ) : (
          displayed.map((n, i) => (
            <div
              key={n.id}
              onClick={() => markRead(n.id)}
              style={{
                padding: '16px 20px',
                borderBottom: i < displayed.length - 1 ? `1px solid ${BORDER}` : 'none',
                cursor: 'pointer',
                background: n.read ? 'transparent' : 'rgba(212,160,23,.04)',
                transition: 'background .15s',
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = n.read ? 'rgba(255,255,255,.02)' : 'rgba(212,160,23,.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(212,160,23,.04)')}
            >
              <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{TYPE_ICONS[n.type] || TYPE_ICONS.default}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: n.read ? 500 : 700, color: n.read ? DIM : TEXT, lineHeight: 1.3 }}>{n.title}</div>
                  <div style={{ fontSize: 11, color: DIM, whiteSpace: 'nowrap', flexShrink: 0 }}>{timeAgo(n.created_at)}</div>
                </div>
                <div style={{ fontSize: 13, color: DIM, lineHeight: 1.5 }}>{n.body}</div>
                {n.link && (
                  <Link
                    href={n.link}
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize: 12, color: GOLD, textDecoration: 'none', marginTop: 6, display: 'inline-block', fontWeight: 600 }}
                  >
                    View →
                  </Link>
                )}
              </div>
              {!n.read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD, flexShrink: 0, marginTop: 6 }} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
