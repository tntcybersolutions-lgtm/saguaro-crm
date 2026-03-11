'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const GOLD='#D4A017',DARK='#0d1117',RAISED='#1f2c3e',BORDER='#263347',DIM='#8fa3c0',TEXT='#e8edf8',RED='#c03030';

interface Notification {
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

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Fetch count on mount + every 60s
  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  async function fetchCount() {
    try {
      const r = await fetch('/api/notifications/count');
      if (!r.ok) return;
      const d = await r.json() as any;
      setCount(d.count ?? d.unread ?? 0);
    } catch { /* non-fatal */ }
  }

  async function fetchNotifications() {
    setLoadingList(true);
    try {
      const r = await fetch('/api/notifications?limit=10');
      if (!r.ok) throw new Error('fetch failed');
      const d = await r.json() as any;
      setNotifications(d.notifications || d.items || []);
    } catch {
      setNotifications([]);
    } finally {
      setLoadingList(false);
    }
  }

  function handleOpen() {
    const next = !open;
    setOpen(next);
    if (next) fetchNotifications();
  }

  async function markRead(id: string, link?: string) {
    // Optimistic UI
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setCount(prev => Math.max(0, prev - 1));
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch { /* non-fatal */ }
    if (link) {
      setOpen(false);
      router.push(link);
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setCount(0);
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } catch { /* non-fatal */ }
    setMarkingAll(false);
  }

  const displayCount = count > 0 ? count : notifications.filter(n => !n.read).length;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={handleOpen}
        aria-label={`Notifications${displayCount > 0 ? ` (${displayCount} unread)` : ''}`}
        style={{ position: 'relative', background: 'rgba(255,255,255,.04)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 18 }}>🔔</span>
        {displayCount > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, background: RED, borderRadius: 9, fontSize: 10, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: `2px solid ${DARK}` }}>
            {displayCount > 99 ? '99+' : displayCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 'min(380px, calc(100vw - 24px))', background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.6)', zIndex: 1000, overflow: 'hidden' }}>

          {/* Dropdown Header */}
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,.2)' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>Notifications</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {displayCount > 0 && (
                <span style={{ fontSize: 11, background: 'rgba(192,48,48,.15)', color: '#ff7070', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>{displayCount} new</span>
              )}
              <button
                onClick={markAllRead}
                disabled={markingAll || displayCount === 0}
                style={{ background: 'none', border: 'none', color: DIM, fontSize: 11, cursor: 'pointer', opacity: displayCount === 0 ? 0.4 : 1 }}>
                {markingAll ? 'Marking...' : 'Mark all read'}
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {loadingList ? (
              <div style={{ padding: 32, textAlign: 'center', color: DIM, fontSize: 13 }}>Loading...</div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: DIM, fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
                No notifications
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id, n.link)}
                  style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', background: n.read ? 'transparent' : 'rgba(212,160,23,.04)', transition: 'background .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = n.read ? 'rgba(255,255,255,.02)' : 'rgba(212,160,23,.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(212,160,23,.04)')}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{TYPE_ICONS[n.type] || TYPE_ICONS.default}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: n.read ? 500 : 700, color: n.read ? DIM : TEXT, lineHeight: 1.3 }}>{n.title}</div>
                        <div style={{ fontSize: 10, color: DIM, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 1 }}>{timeAgo(n.created_at)}</div>
                      </div>
                      <div style={{ fontSize: 12, color: DIM, marginTop: 3, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{n.body}</div>
                    </div>
                    {!n.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: GOLD, flexShrink: 0, marginTop: 4 }} />}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '10px 16px', borderTop: `1px solid ${BORDER}`, textAlign: 'center' }}>
            <a
              href="/app/notifications"
              onClick={() => setOpen(false)}
              style={{ fontSize: 12, color: DIM, textDecoration: 'none', fontWeight: 600 }}>
              View all notifications →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
