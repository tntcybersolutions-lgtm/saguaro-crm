'use client';
/**
 * Saguaro Field — Notification Center
 * View, filter, and manage project notifications and activity feed.
 */
import React, { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const GOLD   = '#C8960F';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const BLUE   = '#3B82F6';

type NotificationType =
  | 'rfi_response'
  | 'co_approved'
  | 'co_rejected'
  | 'inspection_result'
  | 'punch_assigned'
  | 'daily_log_reminder'
  | 'safety_alert'
  | 'meeting_action'
  | 'document_update';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  route?: string;
  item_id?: string;
  mention?: boolean;
  action_required?: boolean;
}

interface ActivityItem {
  id: string;
  user: string;
  action: string;
  target: string;
  created_at: string;
}

type FilterTab = 'all' | 'unread' | 'mentions' | 'action_required';

const NOTIFICATION_META: Record<NotificationType, { label: string; color: string; iconType: string }> = {
  rfi_response:      { label: 'RFI Response',       color: BLUE,  iconType: 'rfi' },
  co_approved:       { label: 'CO Approved',         color: GREEN, iconType: 'check' },
  co_rejected:       { label: 'CO Rejected',         color: RED,   iconType: 'x' },
  inspection_result: { label: 'Inspection Result',   color: AMBER, iconType: 'inspect' },
  punch_assigned:    { label: 'Punch Item Assigned', color: GOLD,  iconType: 'punch' },
  daily_log_reminder:{ label: 'Daily Log Reminder',  color: DIM,   iconType: 'calendar' },
  safety_alert:      { label: 'Safety Alert',        color: RED,   iconType: 'safety' },
  meeting_action:    { label: 'Meeting Action Item', color: BLUE,  iconType: 'meeting' },
  document_update:   { label: 'Document Update',     color: DIM,   iconType: 'doc' },
};

function NotifIcon({ type, size = 16 }: { type: string; size?: number }) {
  const color = 'currentColor';
  const props = { viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, width: size, height: size };
  switch (type) {
    case 'rfi': return <svg {...props}><circle cx={12} cy={12} r={10}/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1={12} y1={17} x2={12.01} y2={17}/></svg>;
    case 'check': return <svg {...props}><polyline points="20 6 9 17 4 12"/></svg>;
    case 'x': return <svg {...props}><circle cx={12} cy={12} r={10}/><line x1={15} y1={9} x2={9} y2={15}/><line x1={9} y1={9} x2={15} y2={15}/></svg>;
    case 'inspect': return <svg {...props}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
    case 'punch': return <svg {...props}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
    case 'calendar': return <svg {...props}><rect x={3} y={4} width={18} height={18} rx={2}/><line x1={16} y1={2} x2={16} y2={6}/><line x1={8} y1={2} x2={8} y2={6}/><line x1={3} y1={10} x2={21} y2={10}/></svg>;
    case 'safety': return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    case 'meeting': return <svg {...props}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx={9} cy={7} r={4}/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case 'doc': return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
    default: return <svg {...props}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
  }
}

function relativeTime(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDateGroup(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 6 * 86400000);
  const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (itemDate.getTime() >= today.getTime()) return 'Today';
  if (itemDate.getTime() >= yesterday.getTime()) return 'Yesterday';
  if (itemDate.getTime() >= weekAgo.getTime()) return 'This Week';
  return 'Earlier';
}

function groupNotifications(notifications: Notification[]): { group: string; items: Notification[] }[] {
  const order = ['Today', 'Yesterday', 'This Week', 'Earlier'];
  const map = new Map<string, Notification[]>();
  order.forEach((g) => map.set(g, []));

  notifications.forEach((n) => {
    const g = getDateGroup(n.created_at);
    const arr = map.get(g);
    if (arr) arr.push(n);
  });

  return order
    .filter((g) => (map.get(g)?.length || 0) > 0)
    .map((g) => ({ group: g, items: map.get(g)! }));
}

function NotificationCenter() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const touchStartX = useRef<Map<string, number>>(new Map());
  const [swipeOffsets, setSwipeOffsets] = useState<Map<string, number>>(new Map());

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/notifications`);
      if (!res.ok) throw new Error('Fetch failed');
      const data = await res.json();
      setNotifications(data.notifications || []);
      setActivity(data.activity || []);
    } catch {
      /* silently handle */
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Poll for new notifications every 30 seconds
  useEffect(() => {
    if (!projectId) return;
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [projectId, fetchNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    try {
      await fetch(`/api/projects/${projectId}/notifications`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id], action: 'read' }),
      });
    } catch { /* ok */ }
  }, [projectId]);

  const markAllAsRead = useCallback(async () => {
    setMarkingAllRead(true);
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch(`/api/projects/${projectId}/notifications`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unreadIds, action: 'read' }),
      });
    } catch { /* ok */ }
    setMarkingAllRead(false);
  }, [notifications, projectId]);

  const dismissNotification = useCallback(async (id: string) => {
    setDismissing((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setDismissing((prev) => { const next = new Set(prev); next.delete(id); return next; });
      setSwipeOffsets((prev) => { const next = new Map(prev); next.delete(id); return next; });
    }, 300);
    try {
      await fetch(`/api/projects/${projectId}/notifications`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id], action: 'dismiss' }),
      });
    } catch { /* ok */ }
  }, [projectId]);

  const handleNotificationTap = useCallback((notification: Notification) => {
    if (!notification.read) markAsRead(notification.id);
    if (notification.route) {
      const sep = notification.route.includes('?') ? '&' : '?';
      router.push(`${notification.route}${sep}projectId=${projectId}${notification.item_id ? `&id=${notification.item_id}` : ''}`);
    }
  }, [markAsRead, router, projectId]);

  // Touch handlers for swipe-to-dismiss
  const handleTouchStart = useCallback((id: string, e: React.TouchEvent) => {
    touchStartX.current.set(id, e.touches[0].clientX);
  }, []);

  const handleTouchMove = useCallback((id: string, e: React.TouchEvent) => {
    const startX = touchStartX.current.get(id);
    if (startX === undefined) return;
    const diff = startX - e.touches[0].clientX;
    if (diff > 0) {
      setSwipeOffsets((prev) => new Map(prev).set(id, Math.min(diff, 100)));
    }
  }, []);

  const handleTouchEnd = useCallback((id: string) => {
    const offset = swipeOffsets.get(id) || 0;
    if (offset > 60) {
      dismissNotification(id);
    } else {
      setSwipeOffsets((prev) => { const next = new Map(prev); next.delete(id); return next; });
    }
    touchStartX.current.delete(id);
  }, [swipeOffsets, dismissNotification]);

  // Filter notifications
  const filtered = notifications.filter((n) => {
    if (filterTab === 'unread') return !n.read;
    if (filterTab === 'mentions') return n.mention === true;
    if (filterTab === 'action_required') return n.action_required === true;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;
  const grouped = groupNotifications(filtered);

  const TABS: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'mentions', label: 'Mentions' },
    { id: 'action_required', label: 'Action Required' },
  ];

  return (
    <div style={{ padding: '18px 16px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.back()} style={backBtnStyle}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
              <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={24} height={24}>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unreadCount > 0 && (
                <div style={{
                  position: 'absolute', top: -4, right: -6, minWidth: 18, height: 18,
                  borderRadius: 9, background: RED, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 800, color: '#fff', padding: '0 4px',
                  border: '2px solid #0A1628',
                }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: TEXT }}>Notifications</h1>
              <p style={{ margin: 0, fontSize: 12, color: DIM }}>
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </p>
            </div>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            disabled={markingAllRead}
            style={{
              background: 'rgba(212,160,23,.1)', border: `1px solid rgba(212,160,23,.3)`,
              borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700,
              color: GOLD, cursor: markingAllRead ? 'wait' : 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 14,
        background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 10,
        overflow: 'hidden',
      }}>
        {TABS.map((tab) => {
          const active = filterTab === tab.id;
          const tabUnread = tab.id === 'unread' ? unreadCount : 0;
          return (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              style={{
                flex: 1, padding: '10px 6px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', border: 'none', transition: 'all .15s',
                background: active ? 'rgba(212,160,23,.12)' : 'transparent',
                color: active ? GOLD : DIM,
                borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent',
              }}
            >
              {tab.label}
              {tab.id === 'unread' && tabUnread > 0 && (
                <span style={{
                  marginLeft: 4, fontSize: 10, fontWeight: 800, padding: '1px 5px',
                  borderRadius: 8, background: 'rgba(239,68,68,.15)', color: RED,
                }}>
                  {tabUnread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{
            width: 32, height: 32, border: `3px solid ${BORDER}`, borderTopColor: GOLD,
            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            margin: '0 auto 12px',
          }} />
          <p style={{ margin: 0, fontSize: 14, color: DIM }}>Loading notifications...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && filtered.length === 0 && (
        <div style={{
          background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
          padding: '40px 20px', textAlign: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={48} height={48} style={{ marginBottom: 12, opacity: 0.4 }}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: TEXT }}>
            {filterTab === 'all' ? 'No notifications yet' : `No ${filterTab.replace('_', ' ')} notifications`}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: DIM }}>
            {filterTab === 'all'
              ? 'You\'ll see project updates and alerts here'
              : 'Try switching to "All" to see all notifications'}
          </p>
        </div>
      )}

      {/* Grouped Notifications */}
      {grouped.map((section) => (
        <div key={section.group} style={{ marginBottom: 16 }}>
          <p style={{
            margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: DIM,
            textTransform: 'uppercase', letterSpacing: 0.8, paddingLeft: 2,
          }}>
            {section.group}
          </p>

          <div style={{
            background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
            overflow: 'hidden',
          }}>
            {section.items.map((notif, idx) => {
              const meta = NOTIFICATION_META[notif.type] || { label: 'Notification', color: DIM, iconType: 'bell' };
              const isDismissing = dismissing.has(notif.id);
              const swipeOffset = swipeOffsets.get(notif.id) || 0;

              return (
                <div
                  key={notif.id}
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderTop: idx > 0 ? `1px solid rgba(30,58,95,.5)` : 'none',
                    opacity: isDismissing ? 0 : 1,
                    maxHeight: isDismissing ? 0 : 200,
                    transition: 'opacity .3s, max-height .3s',
                  }}
                >
                  {/* Swipe background */}
                  {swipeOffset > 0 && (
                    <div style={{
                      position: 'absolute', top: 0, right: 0, bottom: 0, width: swipeOffset,
                      background: 'rgba(239,68,68,.2)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', zIndex: 0,
                    }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </div>
                  )}

                  <div
                    onTouchStart={(e) => handleTouchStart(notif.id, e)}
                    onTouchMove={(e) => handleTouchMove(notif.id, e)}
                    onTouchEnd={() => handleTouchEnd(notif.id)}
                    onClick={() => handleNotificationTap(notif)}
                    style={{
                      display: 'flex', gap: 12, padding: '12px 14px', cursor: 'pointer',
                      background: notif.read ? 'transparent' : 'rgba(212,160,23,.03)',
                      position: 'relative', zIndex: 1,
                      transform: swipeOffset > 0 ? `translateX(-${swipeOffset}px)` : 'none',
                      transition: swipeOffset === 0 ? 'transform .2s' : 'none',
                    }}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `${meta.color}15`, border: `1px solid ${meta.color}30`,
                      color: meta.color,
                    }}>
                      <NotifIcon type={meta.iconType} size={16} />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: meta.color,
                          textTransform: 'uppercase', letterSpacing: 0.4,
                        }}>
                          {meta.label}
                        </span>
                        {notif.action_required && (
                          <span style={{
                            fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 6,
                            background: 'rgba(239,68,68,.12)', color: RED,
                            border: '1px solid rgba(239,68,68,.25)',
                          }}>
                            ACTION
                          </span>
                        )}
                        {notif.mention && (
                          <span style={{
                            fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 6,
                            background: 'rgba(59,130,246,.12)', color: BLUE,
                            border: '1px solid rgba(59,130,246,.25)',
                          }}>
                            @MENTION
                          </span>
                        )}
                      </div>

                      <p style={{
                        margin: '0 0 2px', fontSize: 14,
                        fontWeight: notif.read ? 500 : 700, color: TEXT,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {notif.title}
                      </p>

                      <p style={{
                        margin: '0 0 3px', fontSize: 12, color: DIM, lineHeight: 1.4,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {notif.body}
                      </p>

                      <span style={{ fontSize: 11, color: DIM, opacity: 0.7 }}>
                        {relativeTime(notif.created_at)}
                      </span>
                    </div>

                    {/* Unread dot + dismiss */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0, paddingTop: 2 }}>
                      {!notif.read && (
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%', background: GOLD,
                          boxShadow: `0 0 6px ${GOLD}60`,
                        }} />
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); dismissNotification(notif.id); }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                          color: DIM, display: 'flex', opacity: 0.5,
                        }}
                        title="Dismiss"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
                          <line x1={18} y1={6} x2={6} y2={18}/><line x1={6} y1={6} x2={18} y2={18}/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Activity Feed */}
      {activity.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <p style={{
            margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM,
            textTransform: 'uppercase', letterSpacing: 0.8, paddingLeft: 2,
          }}>
            Recent Activity
          </p>

          <div style={{
            background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14,
            padding: '4px 0', overflow: 'hidden',
          }}>
            {activity.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  padding: '10px 14px',
                  borderTop: idx > 0 ? `1px solid rgba(30,58,95,.5)` : 'none',
                }}
              >
                {/* Timeline dot */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4, flexShrink: 0 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: idx === 0 ? GOLD : BORDER, border: `1px solid ${idx === 0 ? GOLD : DIM}`,
                  }} />
                  {idx < activity.length - 1 && (
                    <div style={{ width: 1, height: 24, background: BORDER, marginTop: 4 }} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 2px', fontSize: 13, color: TEXT, lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 700 }}>{item.user}</span>
                    {' '}{item.action}{' '}
                    <span style={{ color: GOLD }}>{item.target}</span>
                  </p>
                  <span style={{ fontSize: 11, color: DIM, opacity: 0.7 }}>
                    {relativeTime(item.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function FieldNotificationCenterPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}>
      <NotificationCenter />
    </Suspense>
  );
}

const backBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: DIM, cursor: 'pointer',
  padding: 8, marginLeft: -8, display: 'flex', alignItems: 'center',
};
