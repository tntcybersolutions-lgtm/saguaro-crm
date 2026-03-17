/**
 * lib/native.ts — Saguaro Field Native Abstraction Layer
 *
 * Every function works in both environments:
 *   Native (iOS/Android via Capacitor) → uses Capacitor plugin
 *   Web / PWA                          → falls back to Web APIs
 *
 * All Capacitor imports are DYNAMIC so the module is safe for SSR
 * and gracefully degrades when packages aren't available.
 */

// ─── Platform Detection ───────────────────────────────────────────────────────

export function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

export function getPlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).Capacitor?.getPlatform?.() ?? 'web';
}

export function isIOS(): boolean {
  return getPlatform() === 'ios';
}

export function isAndroid(): boolean {
  return getPlatform() === 'android';
}

// ─── Camera ───────────────────────────────────────────────────────────────────

export interface CaptureResult {
  dataUrl: string;
  file: File;
}

/** Shows native camera / photo library picker. Falls back to <input> on web. */
export async function takePhoto(opts?: {
  quality?: number;
  allowEditing?: boolean;
  source?: 'camera' | 'photos' | 'prompt';
}): Promise<CaptureResult | null> {
  if (isNative()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const sourceMap = {
        camera: CameraSource.Camera,
        photos: CameraSource.Photos,
        prompt: CameraSource.Prompt,
      };
      const photo = await Camera.getPhoto({
        quality: opts?.quality ?? 90,
        allowEditing: opts?.allowEditing ?? false,
        resultType: CameraResultType.DataUrl,
        source: sourceMap[opts?.source ?? 'camera'],
        saveToGallery: false,
        correctOrientation: true,
      });
      if (!photo.dataUrl) return null;
      const file = dataUrlToFile(photo.dataUrl, `photo_${Date.now()}.jpg`);
      return { dataUrl: photo.dataUrl, file };
    } catch {
      return null;
    }
  }

  // Web fallback — native file input with camera capture
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        resolve({ dataUrl, file });
      };
      reader.readAsDataURL(file);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Open photo library only (no camera prompt). */
export async function pickFromGallery(): Promise<CaptureResult | null> {
  if (isNative()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
      });
      if (!photo.dataUrl) return null;
      const file = dataUrlToFile(photo.dataUrl, `photo_${Date.now()}.jpg`);
      return { dataUrl: photo.dataUrl, file };
    } catch {
      return null;
    }
  }
  // Web: file input without capture= attribute
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        resolve({ dataUrl, file });
      };
      reader.readAsDataURL(file);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const bstr = atob(arr[1]);
  const u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
  return new File([u8arr], filename, { type: mime });
}

// ─── Haptics ─────────────────────────────────────────────────────────────────

async function nativeHaptic(action: () => Promise<void>, webVibrate: number | number[]) {
  if (isNative()) {
    try { await action(); } catch { /* ok */ }
    return;
  }
  if (typeof navigator !== 'undefined') navigator.vibrate?.(webVibrate);
}

export async function hapticLight(): Promise<void> {
  await nativeHaptic(async () => {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  }, 8);
}

export async function hapticMedium(): Promise<void> {
  await nativeHaptic(async () => {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Medium });
  }, 15);
}

export async function hapticHeavy(): Promise<void> {
  await nativeHaptic(async () => {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Heavy });
  }, 25);
}

export async function hapticSuccess(): Promise<void> {
  await nativeHaptic(async () => {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Success });
  }, [10, 40, 10]);
}

export async function hapticWarning(): Promise<void> {
  await nativeHaptic(async () => {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Warning });
  }, [20, 60, 20]);
}

export async function hapticError(): Promise<void> {
  await nativeHaptic(async () => {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Error });
  }, [30, 50, 30, 50, 30]);
}

export async function hapticSelection(): Promise<void> {
  await nativeHaptic(async () => {
    const { Haptics } = await import('@capacitor/haptics');
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
    await Haptics.selectionEnd();
  }, 5);
}

// ─── Geolocation ─────────────────────────────────────────────────────────────

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number;
  altitudeAccuracy?: number;
}

export async function getCurrentPosition(
  timeout = 10000,
): Promise<GeoPosition | null> {
  if (isNative()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      // Request permissions first (no-op if already granted)
      await Geolocation.requestPermissions().catch(() => {});
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout,
      });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude ?? undefined,
        altitudeAccuracy: pos.coords.altitudeAccuracy ?? undefined,
      };
    } catch {
      return null;
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude ?? undefined,
          altitudeAccuracy: pos.coords.altitudeAccuracy ?? undefined,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout },
    );
  });
}

// ─── Network Status ───────────────────────────────────────────────────────────

export async function getNetworkStatus(): Promise<{ connected: boolean; type: string }> {
  if (isNative()) {
    try {
      const { Network } = await import('@capacitor/network');
      const status = await Network.getStatus();
      return { connected: status.connected, type: status.connectionType };
    } catch { /* fall through */ }
  }
  return {
    connected: typeof navigator !== 'undefined' ? navigator.onLine : true,
    type: 'unknown',
  };
}

/** Returns cleanup function */
export function onNetworkChange(handler: (connected: boolean) => void): () => void {
  if (isNative()) {
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    import('@capacitor/network').then(({ Network }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Network.addListener('networkStatusChange', (status: any) => handler(status.connected)).then(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (h: any) => { listenerHandle = h; },
      );
    });
    return () => { listenerHandle?.remove().catch(() => {}); };
  }

  const onOnline = () => handler(true);
  const onOffline = () => handler(false);
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
  }
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

export async function setStatusBarDark(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    if (isAndroid()) await StatusBar.setBackgroundColor({ color: '#060C15' });
  } catch { /* ok */ }
}

export async function setStatusBarLight(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light });
  } catch { /* ok */ }
}

export async function showStatusBar(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar } = await import('@capacitor/status-bar');
    await StatusBar.show();
  } catch { /* ok */ }
}

// ─── Splash Screen ───────────────────────────────────────────────────────────

export async function hideSplash(): Promise<void> {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 400 });
  } catch { /* ok */ }
}

// ─── Push Notifications ───────────────────────────────────────────────────────

export async function registerForPush(): Promise<string | null> {
  if (isNative()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') return null;
      await PushNotifications.register();
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 10000);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        PushNotifications.addListener('registration', (token: any) => {
          clearTimeout(timeout);
          // Save token to server
          savePushToken(token.value).catch(() => {});
          resolve(token.value);
        });
        PushNotifications.addListener('registrationError', () => {
          clearTimeout(timeout);
          resolve(null);
        });
      });
    } catch {
      return null;
    }
  }

  // Web: service worker push
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return null;
    return null; // web push token managed separately via VAPID
  } catch {
    return null;
  }
}

async function savePushToken(token: string): Promise<void> {
  await fetch('/api/notifications/push-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: getPlatform() }),
  });
}

/** Call once to wire up push notification foreground/tap handlers */
export function setupPushListeners(opts?: {
  onMessage?: (title: string, body: string, data?: Record<string, unknown>) => void;
  onTap?: (data?: Record<string, unknown>) => void;
}): () => void {
  if (!isNative()) return () => {};
  const handles: Array<{ remove: () => Promise<void> }> = [];
  import('@capacitor/push-notifications').then(({ PushNotifications }) => {
    // Foreground notification
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    PushNotifications.addListener('pushNotificationReceived', (notification: any) => {
      opts?.onMessage?.(
        notification.title ?? '',
        notification.body ?? '',
        notification.data as Record<string, unknown>,
      );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).then((h: any) => handles.push(h));

    // Tap on notification
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
      opts?.onTap?.(action.notification.data as Record<string, unknown>);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).then((h: any) => handles.push(h));
  });
  return () => { handles.forEach((h) => h.remove().catch(() => {})); };
}

// ─── Local Notifications ─────────────────────────────────────────────────────

export async function scheduleNotification(opts: {
  id: number;
  title: string;
  body: string;
  at: Date;
  data?: Record<string, unknown>;
}): Promise<void> {
  if (isNative()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;
      await LocalNotifications.schedule({
        notifications: [
          {
            id: opts.id,
            title: opts.title,
            body: opts.body,
            schedule: { at: opts.at },
            extra: opts.data ?? null,
            smallIcon: 'ic_stat_saguaro',
            iconColor: '#D4A017',
          },
        ],
      });
    } catch { /* ok */ }
    return;
  }
  // Web: Notification API (fires at the scheduled time)
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const delay = Math.max(0, opts.at.getTime() - Date.now());
  setTimeout(() => new Notification(opts.title, { body: opts.body }), delay);
}

export async function cancelNotification(id: number): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch { /* ok */ }
}

// ─── Native Share ─────────────────────────────────────────────────────────────

export async function shareContent(opts: {
  title: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}): Promise<void> {
  if (isNative()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share(opts);
    } catch { /* cancelled */ }
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
    } catch { /* cancelled */ }
    return;
  }
  // Fallback: copy URL to clipboard
  if (opts.url && navigator.clipboard) {
    await navigator.clipboard.writeText(opts.url).catch(() => {});
  }
}

// ─── Native Toast ─────────────────────────────────────────────────────────────

export async function showToast(
  text: string,
  duration: 'short' | 'long' = 'short',
  position: 'top' | 'center' | 'bottom' = 'bottom',
): Promise<void> {
  if (isNative()) {
    try {
      const { Toast } = await import('@capacitor/toast');
      await Toast.show({ text, duration, position });
    } catch { /* ok */ }
  }
  // Web: no built-in toast; handled by app-level UI
}

// ─── Android Back Button ─────────────────────────────────────────────────────

/** Returns cleanup function */
export function onAndroidBack(handler: () => void): () => void {
  if (!isNative() || !isAndroid()) return () => {};
  let listenerHandle: { remove: () => Promise<void> } | null = null;
  import('@capacitor/app').then(({ App }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    App.addListener('backButton', handler).then((h: any) => { listenerHandle = h; });
  });
  return () => { listenerHandle?.remove().catch(() => {}); };
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────

/** Fires when app comes to foreground. Returns cleanup. */
export function onAppResume(handler: () => void): () => void {
  if (!isNative()) return () => {};
  let h: { remove: () => Promise<void> } | null = null;
  import('@capacitor/app').then(({ App }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    App.addListener('resume', handler).then((lh: any) => { h = lh; });
  });
  return () => { h?.remove().catch(() => {}); };
}

// ─── Biometric Auth ───────────────────────────────────────────────────────────

export async function biometricAuth(reason = 'Verify your identity'): Promise<boolean> {
  if (!isNative()) return true; // Web: skip, handled by session cookie
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
    // Check if biometrics are available
    const { isAvailable } = await BiometricAuth.checkBiometry();
    if (!isAvailable) return true; // Not enrolled — skip gracefully
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Cancel',
      iosFallbackTitle: 'Use Passcode',
      androidTitle: 'Saguaro Field',
      androidSubtitle: reason,
    });
    return true;
  } catch {
    return false;
  }
}

// ─── QR / Barcode Scanner ────────────────────────────────────────────────────

export async function scanBarcode(): Promise<string | null> {
  if (isNative()) {
    try {
      const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');
      const perm = await BarcodeScanner.requestPermissions();
      if (perm.camera !== 'granted') return null;
      const { barcodes } = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode, BarcodeFormat.Code128, BarcodeFormat.Code39],
      });
      return barcodes[0]?.rawValue ?? null;
    } catch {
      return null;
    }
  }
  return null; // Web: no native scanner; use dedicated QR page with jsQR
}

// ─── Device Info ─────────────────────────────────────────────────────────────

export async function getDeviceInfo(): Promise<{
  platform: string;
  model: string;
  osVersion: string;
} | null> {
  if (!isNative()) return null;
  try {
    const { Device } = await import('@capacitor/device');
    const info = await Device.getInfo();
    return {
      platform: info.platform,
      model: info.model,
      osVersion: info.osVersion,
    };
  } catch {
    return null;
  }
}

// ─── Preferences (replaces localStorage in native) ────────────────────────────

export async function setPreference(key: string, value: string): Promise<void> {
  if (isNative()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key, value });
      return;
    } catch { /* fall through */ }
  }
  try { localStorage.setItem(key, value); } catch { /* ok */ }
}

export async function getPreference(key: string): Promise<string | null> {
  if (isNative()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key });
      return value;
    } catch { /* fall through */ }
  }
  try { return localStorage.getItem(key); } catch { return null; }
}

export async function removePreference(key: string): Promise<void> {
  if (isNative()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key });
      return;
    } catch { /* fall through */ }
  }
  try { localStorage.removeItem(key); } catch { /* ok */ }
}
