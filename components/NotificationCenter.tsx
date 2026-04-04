'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const GOLD = '#C8960F', DARK = '#F8F9FB', RAISED = '#ffffff', BORDER = '#E2E5EA', DIM = '#6B7280', TEXT = '#e8edf8';
const RED = '#c03030', AMBER = '#f59e0b';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  created_at: string;
  urgency?: 'high' | 'medium' | 'low';
  category?: string;
  project_name?: string;
  snoozed_until?: string | null;
}

const CATEGORIES = ['All', 'Financial', 'RFIs', 'Compliance', 'Schedule'] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_TYPES: Record<string, Category> = {
  pay_app: 'Financial',
  pay_app_submitted: 'Financial',
  pay_app_approved: 'Financial',
  pay_app_certified: 'Financial',
  change_order: 'Financial',
  change_order_approved: 'Financial',
  lien_waiver: 'Financial',
  lien_waiver_requested: 'Financial',
  lien_waiver_signed: 'Financial',
  rfi: 'RFIs',
  rfi_submitted: 'RFIs',
  rfi_answered: 'RFIs',
  insurance: 'Compliance',
  insurance_expiring: 'Compliance',
  insurance_expired: 'Compliance',
  w9_requested: 'Compliance',
  w9_submitted: 'Compliance',
  compliance: 'Compliance',
  schedule: 'Schedule',
  deadline: 'Schedule',
  milestone: 'Schedule',
};

const TYPE_ICONS: Record<string, string> = {
  pay_app: '\u{1F4B0}', pay_app_submitted: '\u{1F4B0}', pay_app_approved: '\u{2705}', pay_app_certified: '\u{1F3C6}',
  insurance: '\u{1F4CB}', insurance_expiring: '\u{26A0}\u{FE0F}', insurance_expired: '\u{1F6A8}',
  lien_waiver: '\u{1F4C4}', lien_waiver_requested: '\u{1F4C4}', lien_waiver_signed: '\u{2705}',
  rfi: '\u{2753}', rfi_submitted: '\u{2753}', rfi_answered: '\u{1F4AC}',
  change_order: '\u{1F504}', change_order_approved: '\u{2705}',
  bid: '\u{1F4DD}', bid_package_created: '\u{1F4E6}', bid_submitted: '\u{1F4DD}', bid_awarded: '\u{1F3C6}',
  document: '\u{1F4C1}', document_generated: '\u{1F4C1}',
  sub: '\u{1F91D}', sub_added: '\u{1F91D}',
  w9_requested: '\u{1F4CB}', w9_submitted: '\u{2705}',
  schedule: '\u{1F4C5}', deadline: '\u{23F0}', milestone: '\u{1F3AF}',
  alert: '\u{26A0}\u{FE0F}', autopilot_alert: '\u{1F916}',
  trial_expiring: '\u{23F3}', project_created: '\u{1F3D7}\u{FE0F}',
  default: '\u{1F514}',
};

const SNOOZE_OPTIONS = [
  { label: '1 hour', getTime: () => new Date(Date.now() + 60 * 60 * 1000).toISOString() },
  { label: 'Tomorrow', getTime: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString(); } },
  { label: 'Next week', getTime: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d.toISOString(); } },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function categorize(type: string): Category {
  return CATEGORY_TYPES[type] || 'All';
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category>('All');
  const [focusMode, setFocusMode] = useState(false);
  const [snoozeOpenId, setSnoozeOpenId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Load focus mode preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('saguaro_focus_mode');
      if (saved === 'true') setFocusMode(true);
    } catch { /* silent */ }
  }, []);

  // Fetch count
  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/count');
      if (res.ok) {
        const data = await res.json();
        setCount(data.count || 0);
      }
    } catch { /* silent */ }
  }, []);

  // Fetch full list
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  // Poll count every 30s
  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  // Fetch list when opened
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSnoozeOpenId(null);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Mark all read
  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setCount(0);
    } catch { /* silent */ }
    setMarkingAll(false);
  };

  // Dismiss
  const dismissNotification = async (id: string) => {
    try {
      await fetch('/api/notifications/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
      fetchCount();
    } catch { /* silent */ }
  };

  // Snooze
  const snoozeNotification = async (id: string, snoozeUntil: string) => {
    try {
      await fetch('/api/notifications/snooze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: id, snooze_until: snoozeUntil }),
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
      setSnoozeOpenId(null);
      fetchCount();
    } catch { /* silent */ }
  };

  // Toggle focus mode
  const toggleFocusMode = () => {
    const next = !focusMode;
    setFocusMode(next);
    try { localStorage.setItem('saguaro_focus_mode', String(next)); } catch { /* silent */ }
  };

  // Click notification
  const handleClick = async (n: Notification) => {
    if (!n.read) {
      try {
        await fetch('/api/notifications/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: n.id }),
        });
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
        setCount(prev => Math.max(0, prev - 1));
      } catch { /* silent */ }
    }
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  };

  // Filter
  const now = Date.now();
  const filtered = notifications.filter(n => {
    // Hide snoozed
    if (n.snoozed_until && new Date(n.snoozed_until).getTime() > now) return false;
    // Focus mode: only high urgency
    if (focusMode && n.urgency !== 'high') return false;
    // Category filter
    if (activeCategory !== 'All' && categorize(n.type) !== activeCategory) return false;
    return true;
  });

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          padding: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="Notifications"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: RED,
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            width: 400,
            maxHeight: 500,
            backgroundColor: DARK,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            zIndex: 999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            marginTop: 6,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: `1px solid ${BORDER}`,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>Notifications</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Focus Mode Toggle */}
              <button
                onClick={toggleFocusMode}
                title={focusMode ? 'Focus Mode ON - only high urgency' : 'Focus Mode OFF - showing all'}
                style={{
                  background: focusMode ? GOLD : 'transparent',
                  border: `1px solid ${focusMode ? GOLD : BORDER}`,
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  color: focusMode ? DARK : DIM,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                Focus
              </button>
              {/* Mark All Read */}
              <button
                onClick={markAllRead}
                disabled={markingAll}
                style={{
                  background: 'none',
                  border: 'none',
                  color: GOLD,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: markingAll ? 'default' : 'pointer',
                  opacity: markingAll ? 0.5 : 1,
                  padding: 0,
                }}
              >
                Mark All Read
              </button>
            </div>
          </div>

          {/* Category Tabs */}
          <div
            style={{
              display: 'flex',
              gap: 0,
              borderBottom: `1px solid ${BORDER}`,
              padding: '0 8px',
              overflowX: 'auto',
            }}
          >
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: activeCategory === cat ? `2px solid ${GOLD}` : '2px solid transparent',
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: activeCategory === cat ? 700 : 500,
                  color: activeCategory === cat ? GOLD : DIM,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Notification List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {loading && (
              <div style={{ padding: 24, textAlign: 'center', color: DIM, fontSize: 13 }}>Loading...</div>
            )}

            {!loading && filtered.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>{'\u2705'}</div>
                <div style={{ color: DIM, fontSize: 14, fontWeight: 600 }}>All caught up!</div>
                <div style={{ color: BORDER, fontSize: 12, marginTop: 4 }}>No notifications to show</div>
              </div>
            )}

            {!loading && filtered.map(n => (
              <div
                key={n.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '10px 16px',
                  borderBottom: `1px solid ${BORDER}`,
                  backgroundColor: n.read ? 'transparent' : 'rgba(212,160,23,0.04)',
                  cursor: n.link ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                  position: 'relative',
                }}
                onClick={() => handleClick(n)}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = RAISED; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = n.read ? 'transparent' : 'rgba(212,160,23,0.04)'; }}
              >
                {/* Urgency dot */}
                {n.urgency === 'high' && (
                  <div style={{
                    position: 'absolute', top: 12, left: 6,
                    width: 6, height: 6, borderRadius: '50%', backgroundColor: RED,
                  }} />
                )}
                {n.urgency === 'medium' && (
                  <div style={{
                    position: 'absolute', top: 12, left: 6,
                    width: 6, height: 6, borderRadius: '50%', backgroundColor: AMBER,
                  }} />
                )}

                {/* Icon */}
                <div style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>
                  {TYPE_ICONS[n.type] || TYPE_ICONS.default}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 13, fontWeight: n.read ? 500 : 700, color: TEXT,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                    }}>
                      {n.title}
                    </span>
                    <span style={{ fontSize: 11, color: DIM, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {timeAgo(n.created_at)}
                    </span>
                  </div>
                  {n.body && (
                    <div style={{
                      fontSize: 12, color: DIM, marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {n.body}
                    </div>
                  )}
                  {n.project_name && (
                    <div style={{ fontSize: 11, color: GOLD, marginTop: 3, opacity: 0.8 }}>
                      {n.project_name}
                    </div>
                  )}

                  {/* Actions */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => dismissNotification(n.id)}
                      style={{
                        background: 'none', border: 'none', color: DIM, fontSize: 11,
                        cursor: 'pointer', padding: '2px 0',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = RED; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = DIM; }}
                    >
                      Dismiss
                    </button>

                    {/* Snooze */}
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={() => setSnoozeOpenId(snoozeOpenId === n.id ? null : n.id)}
                        style={{
                          background: 'none', border: 'none', color: DIM, fontSize: 11,
                          cursor: 'pointer', padding: '2px 0',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = GOLD; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = DIM; }}
                      >
                        Snooze {'\u25BE'}
                      </button>

                      {snoozeOpenId === n.id && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            marginTop: 4,
                            backgroundColor: RAISED,
                            border: `1px solid ${BORDER}`,
                            borderRadius: 6,
                            zIndex: 10,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                            overflow: 'hidden',
                          }}
                        >
                          {SNOOZE_OPTIONS.map(opt => (
                            <button
                              key={opt.label}
                              onClick={() => snoozeNotification(n.id, opt.getTime())}
                              style={{
                                display: 'block',
                                width: '100%',
                                background: 'none',
                                border: 'none',
                                padding: '8px 16px',
                                fontSize: 12,
                                color: TEXT,
                                cursor: 'pointer',
                                textAlign: 'left',
                                whiteSpace: 'nowrap',
                              }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = BORDER; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
