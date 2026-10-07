/**
 * Turning alerts on for this device, in the browser or the iPhone app.
 *
 *  • Browser: register /push-sw.js, subscribe with the server's VAPID key,
 *    save the subscription (POST /api/notifications/push-subscribe).
 *  • iPhone app (Capacitor): ask iOS for permission, register with APNs, save
 *    the device token (lib/native.ts → POST /api/notifications/push-token).
 *  • iPhone Safari outside the app can only get web push once Saguaro is on
 *    the Home Screen — so we say that instead of offering a button that fails.
 */
import { isNative, registerForPush } from '@/lib/native';

export type PushState = 'on' | 'off' | 'blocked' | 'needs-home-screen' | 'unsupported';

export interface PushConfig {
  webPublicKey: string | null;
  iosReady: boolean;
  devices: { web: number; ios: number; total: number };
}

const SW_URL = '/push-sw.js';
const NATIVE_KEY = 'saguaro-native-push';

export async function loadPushConfig(): Promise<PushConfig> {
  const r = await fetch('/api/notifications/push-config', { cache: 'no-store' });
  if (!r.ok) throw new Error(`push-config ${r.status}`);
  return r.json();
}

function isIosBrowser(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

function webPushAvailable(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function keyBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Where this device stands right now. */
export async function pushState(cfg: PushConfig): Promise<PushState> {
  if (isNative()) {
    if (!cfg.iosReady) return 'unsupported';
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const p = await PushNotifications.checkPermissions();
      if (p.receive === 'denied') return 'blocked';
      return p.receive === 'granted' && localStorage.getItem(NATIVE_KEY) === '1' ? 'on' : 'off';
    } catch {
      return 'unsupported';
    }
  }
  if (!webPushAvailable()) return isIosBrowser() && !isStandalone() ? 'needs-home-screen' : 'unsupported';
  if (!cfg.webPublicKey) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Ask for permission and sign this device up. Returns the new state. */
export async function turnOnPush(cfg: PushConfig): Promise<PushState> {
  if (isNative()) {
    const token = await registerForPush();
    if (!token) return pushState(cfg);
    try { localStorage.setItem(NATIVE_KEY, '1'); } catch { /* private mode: state just reads 'off' next time */ }
    return 'on';
  }
  if (!cfg.webPublicKey || !webPushAvailable()) return pushState(cfg);
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'blocked' : 'off';
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.webPublicKey) as BufferSource });
  const r = await fetch('/api/notifications/push-subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!r.ok) throw new Error(`push-subscribe ${r.status}`);
  return 'on';
}

/** Stop alerts on this device (and forget it on the server). */
export async function turnOffPush(): Promise<void> {
  if (isNative()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await PushNotifications.unregister();
    } finally {
      try { localStorage.removeItem(NATIVE_KEY); } catch { /* nothing stored */ }
    }
    return;
  }
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await fetch('/api/notifications/push-token', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: endpoint }),
  });
}

export interface PushTestResult { devices: number; sent: number; failed: number; skipped: number; removed: number }

export async function sendTestPush(): Promise<PushTestResult> {
  const r = await fetch('/api/notifications/push-test', { method: 'POST' });
  if (!r.ok) throw new Error(`push-test ${r.status}`);
  return r.json();
}
