'use client';
/**
 * Saguaro Field — Push Notification Subscription UI
 * Manage push notification preferences and category subscriptions.
 */
import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const GOLD   = '#C8960F';
const RAISED = '#0D1D2E';
const BORDER = '#1E3A5F';
const TEXT   = '#F0F4FF';
const DIM    = '#8BAAC8';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#C8960F';

const PREFS_KEY = 'saguaro_notification_prefs';

interface NotificationPrefs {
  enabled: boolean;
  categories: Record<string, boolean>;
}

const CATEGORIES = [
  { id: 'alerts', label: 'Alerts', desc: 'Critical project alerts and urgent notices', icon: 'bell' },
  { id: 'rfis', label: 'RFIs', desc: 'New RFIs and responses to your requests', icon: 'question' },
  { id: 'change_orders', label: 'Change Orders', desc: 'CO approvals, rejections, and updates', icon: 'doc' },
  { id: 'inspections', label: 'Inspections', desc: 'Inspection schedules and results', icon: 'check' },
  { id: 'daily_logs', label: 'Daily Logs', desc: 'Daily log reminders and submissions', icon: 'calendar' },
];

function getStoredPrefs(): NotificationPrefs {
  try {
    const s = localStorage.getItem(PREFS_KEY);
    if (s) return JSON.parse(s);
  } catch { /* ok */ }
  const categories: Record<string, boolean> = {};
  CATEGORIES.forEach((c) => { categories[c.id] = true; });
  return { enabled: false, categories };
}

function savePrefs(prefs: NotificationPrefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ok */ }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function NotificationsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';

  const [prefs, setPrefs] = useState<NotificationPrefs>(getStoredPrefs);
  const [pushSupported, setPushSupported] = useState(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission>('default');
  const [subscribing, setSubscribing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
    setPushSupported(supported);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionState(Notification.permission);
    }
  }, []);

  const updatePrefs = useCallback((patch: Partial<NotificationPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const toggleCategory = useCallback((catId: string) => {
    setPrefs((prev) => {
      const next = { ...prev, categories: { ...prev.categories, [catId]: !prev.categories[catId] } };
      savePrefs(next);
      return next;
    });
  }, []);

  const handleToggleNotifications = async () => {
    if (prefs.enabled) {
      updatePrefs({ enabled: false });
      setStatusMsg('Notifications disabled');
      setTimeout(() => setStatusMsg(''), 3000);
      return;
    }

    if (!pushSupported) {
      setStatusMsg('Push notifications are not supported in this browser');
      setTimeout(() => setStatusMsg(''), 4000);
      return;
    }

    setSubscribing(true);

    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission);

      if (permission !== 'granted') {
        setStatusMsg('Notification permission denied. Enable in browser settings.');
        setTimeout(() => setStatusMsg(''), 4000);
        setSubscribing(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setStatusMsg('Push configuration missing. Contact admin.');
        setTimeout(() => setStatusMsg(''), 4000);
        setSubscribing(false);
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      // Send subscription to backend
      const userId = localStorage.getItem('saguaro_user_id') || 'unknown';
      const res = await fetch('/api/notifications/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON(), userId }),
      });

      if (res.ok) {
        updatePrefs({ enabled: true });
        setStatusMsg('Push notifications enabled');
      } else {
        setStatusMsg('Failed to register push subscription');
      }
    } catch (err) {
      setStatusMsg('Failed to subscribe to push notifications');
    }

    setTimeout(() => setStatusMsg(''), 3500);
    setSubscribing(false);
  };

  return (
    <div style={{ padding: '18px 16px' }}>
      <button onClick={() => router.back()} style={backBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
          <line x1={19} y1={12} x2={5} y2={12}/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <h1 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: TEXT }}>Notifications</h1>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: DIM }}>Manage push notification preferences</p>

      {statusMsg && (
        <div style={{
          background: statusMsg.includes('enabled') ? 'rgba(34,197,94,.1)' : statusMsg.includes('denied') || statusMsg.includes('Failed') || statusMsg.includes('missing') ? 'rgba(239,68,68,.1)' : 'rgba(212,160,23,.1)',
          border: `1px solid ${statusMsg.includes('enabled') ? 'rgba(34,197,94,.3)' : statusMsg.includes('denied') || statusMsg.includes('Failed') || statusMsg.includes('missing') ? 'rgba(239,68,68,.3)' : 'rgba(212,160,23,.3)'}`,
          borderRadius: 10, padding: '12px 14px', marginBottom: 14,
          color: statusMsg.includes('enabled') ? GREEN : statusMsg.includes('denied') || statusMsg.includes('Failed') || statusMsg.includes('missing') ? RED : AMBER,
          fontSize: 14, fontWeight: 600,
        }}>
          {statusMsg}
        </div>
      )}

      {/* Support & Permission Status */}
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
        <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>System Status</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, color: TEXT }}>Push API</span>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: pushSupported ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
            color: pushSupported ? GREEN : RED,
            border: `1px solid ${pushSupported ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
          }}>
            {pushSupported ? 'Supported' : 'Not Supported'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, color: TEXT }}>Permission</span>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: permissionState === 'granted' ? 'rgba(34,197,94,.15)' : permissionState === 'denied' ? 'rgba(239,68,68,.15)' : 'rgba(212,160,23,.15)',
            color: permissionState === 'granted' ? GREEN : permissionState === 'denied' ? RED : AMBER,
            border: `1px solid ${permissionState === 'granted' ? 'rgba(34,197,94,.3)' : permissionState === 'denied' ? 'rgba(239,68,68,.3)' : 'rgba(212,160,23,.3)'}`,
          }}>
            {permissionState === 'granted' ? 'Granted' : permissionState === 'denied' ? 'Denied' : 'Default'}
          </span>
        </div>
      </div>

      {/* Master Toggle */}
      <div style={{ background: RAISED, border: `1px solid ${prefs.enabled ? 'rgba(34,197,94,.35)' : BORDER}`, borderRadius: 14, padding: '16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>Push Notifications</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: DIM }}>
              {prefs.enabled ? 'Receiving push notifications' : 'Enable to receive field updates'}
            </p>
          </div>
          <button
            onClick={handleToggleNotifications}
            disabled={subscribing}
            style={{
              width: 52, height: 30, borderRadius: 15, border: 'none', cursor: subscribing ? 'wait' : 'pointer',
              background: prefs.enabled ? GREEN : '#1E3A5F', position: 'relative', transition: 'background .3s',
              flexShrink: 0,
            }}
          >
            <div style={{
              width: 24, height: 24, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3,
              left: prefs.enabled ? 25 : 3, transition: 'left .3s', boxShadow: '0 1px 3px rgba(0,0,0,.3)',
            }} />
          </button>
        </div>
      </div>

      {/* Category Toggles */}
      <div style={{ background: RAISED, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '14px', marginBottom: 14 }}>
        <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: 0.8 }}>Notification Categories</p>
        {CATEGORIES.map((cat, i) => (
          <div key={cat.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 0', borderTop: i > 0 ? `1px solid ${BORDER}` : 'none',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(212,160,23,.1)', border: '1px solid rgba(212,160,23,.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: GOLD, flexShrink: 0,
                }}>
                  {cat.icon === 'bell' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>}
                  {cat.icon === 'question' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><circle cx={12} cy={12} r={10}/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1={12} y1={17} x2={12.01} y2={17}/></svg>}
                  {cat.icon === 'doc' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
                  {cat.icon === 'check' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}
                  {cat.icon === 'calendar' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><rect x={3} y={4} width={18} height={18} rx={2}/><line x1={16} y1={2} x2={16} y2={6}/><line x1={8} y1={2} x2={8} y2={6}/><line x1={3} y1={10} x2={21} y2={10}/></svg>}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT }}>{cat.label}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: DIM }}>{cat.desc}</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => toggleCategory(cat.id)}
              style={{
                width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                background: prefs.categories[cat.id] ? GOLD : '#1E3A5F', position: 'relative',
                transition: 'background .3s', flexShrink: 0, marginLeft: 10,
                opacity: prefs.enabled ? 1 : 0.4, pointerEvents: prefs.enabled ? 'auto' : 'none',
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3,
                left: prefs.categories[cat.id] ? 21 : 3, transition: 'left .3s',
                boxShadow: '0 1px 3px rgba(0,0,0,.3)',
              }} />
            </button>
          </div>
        ))}
      </div>

      {!pushSupported && (
        <div style={{
          background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 12,
          padding: '14px', fontSize: 13, color: DIM, lineHeight: 1.5,
        }}>
          Push notifications are not supported in this browser. For the best experience, use Chrome, Edge, or Firefox on Android, or add this app to your home screen on iOS 16.4+.
        </div>
      )}

      {permissionState === 'denied' && (
        <div style={{
          background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 12,
          padding: '14px', fontSize: 13, color: DIM, lineHeight: 1.5, marginTop: 10,
        }}>
          Notification permission was denied. To re-enable, go to your browser settings and allow notifications for this site, then return here and toggle on.
        </div>
      )}
    </div>
  );
}

export default function FieldNotificationsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: '#8BAAC8', textAlign: 'center' }}>Loading...</div>}>
      <NotificationsPage />
    </Suspense>
  );
}

const backBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: DIM, cursor: 'pointer',
  padding: '8px', marginLeft: -8, display: 'flex', alignItems: 'center', marginBottom: 4,
};
