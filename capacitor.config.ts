import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Saguaro Field — Capacitor Native App Config
 *
 * The app runs in "server mode" — the native WebView loads the hosted
 * Next.js app. No static export needed. All API routes work normally.
 *
 * Build modes:
 *   Dev:   CAPACITOR_SERVER_URL=http://localhost:3000  (live reload)
 *   Prod:  the canonical production domain below — the SAME origin desktop
 *          uses, so iOS and web are the identical site, deploy and auth
 *          domain. A custom domain auto-tracks the latest prod deploy, so
 *          this needs no per-deploy update; web changes reach iOS live.
 *
 * After changing this file run: npx cap sync (then rebuild/submit the iOS app
 * once — the server URL is baked into the native shell).
 */

// Override with env var for dev / CI; falls back to the production domain.
// Must match desktop exactly (saguarocontrol.net), NOT a *.vercel.app alias,
// or iOS logs in against a different origin than the web app expects.
// Starts at /app, not the marketing homepage: a signed-in device lands in the
// app and a signed-out one is sent to /login by middleware. Same origin, so
// auth and navigation are unchanged.
const PRODUCTION_URL = 'https://www.saguarocontrol.net/app';
const serverUrl = process.env.CAPACITOR_SERVER_URL ?? PRODUCTION_URL;

const config: CapacitorConfig = {
  // ONE app: this is the existing TestFlight app "Saguaro Field" (the same
  // bundle id the retired React Native build in D:/Saguaro-Field used), so
  // installs update in place to this shell, which loads the live site.
  // tools/check-ios-mirror.mjs fails CI if this or the URL above drifts.
  appId: 'net.saguarocontrol.field',
  appName: 'Saguaro Field',

  // webDir holds initial web assets; in server mode the live URL takes over
  webDir: 'out',

  // Server mode — loads hosted Next.js app inside the native WebView
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    // Keep every page of the site inside the app. Capacitor otherwise treats a
    // URL as "in app" only if it starts with server.url — with the /app start
    // path, the redirect to /login opened in Safari (seen on the simulator).
    // Intuit's sign-in must ALSO stay inside the app: QuickBooks Connect
    // navigates this webview to appcenter.intuit.com, then accounts.intuit.com,
    // then back to our callback. Opened in Safari instead, the callback would
    // land where the user is not signed in and the state cookie is not set, and
    // the connection would always fail.
    allowNavigation: ['www.saguarocontrol.net', 'saguarocontrol.net', 'appcenter.intuit.com', 'accounts.intuit.com', '*.intuit.com'],
    androidScheme: 'https',
  },

  plugins: {
    // ── Splash Screen ──────────────────────────────────────────────
    SplashScreen: {
      launchShowDuration: 2000,
      // Native hides it after launchShowDuration. It was false while nothing on
      // the web side ever called SplashScreen.hide(), so the app stayed on the
      // splash forever (seen on the iPhone simulator in CI).
      launchAutoHide: true,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      iosSpinnerStyle: 'small',
      spinnerColor: '#FFE600',
    },

    // ── Status Bar ────────────────────────────────────────────────
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#000000',
      overlaysWebView: false,
    },

    // ── Push Notifications ────────────────────────────────────────
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    // ── Local Notifications ───────────────────────────────────────
    LocalNotifications: {
      smallIcon: 'ic_stat_saguaro',
      iconColor: '#FFE600',
      sound: 'default',
    },

    // ── Camera ────────────────────────────────────────────────────
    // iOS: add NSCameraUsageDescription + NSPhotoLibraryUsageDescription to Info.plist
    // Android: CAMERA permission added automatically by the plugin

    // ── Geolocation ───────────────────────────────────────────────
    // iOS: add NSLocationWhenInUseUsageDescription to Info.plist
    // Android: ACCESS_FINE_LOCATION added automatically by the plugin
  },

  ios: {
    // Native plugins compiled into the iOS app. @capacitor-mlkit/barcode-scanning
    // is left out on purpose: it pins Google ML Kit 5.0.0, whose nanopb pod has
    // no privacy manifest, and App Store Connect invalidates the binary the
    // moment it is submitted for review (ITMS-91061; builds 1019 and 1027).
    // Nothing calls scanBarcode() (lib/native.ts), so no screen loses anything.
    // Add a plugin here when the app starts using it.
    includePlugins: [
      '@aparajita/capacitor-biometric-auth',
      '@capacitor/app',
      '@capacitor/camera',
      '@capacitor/device',
      '@capacitor/filesystem',
      '@capacitor/geolocation',
      '@capacitor/haptics',
      '@capacitor/local-notifications',
      '@capacitor/network',
      '@capacitor/preferences',
      '@capacitor/push-notifications',
      '@capacitor/share',
      '@capacitor/splash-screen',
      '@capacitor/status-bar',
      '@capacitor/toast',
    ],
    // Allow WKWebView to reach the same-origin server
    contentInset: 'automatic',
    // Service workers only run in WKWebView for App-Bound Domains (iOS 14+).
    // Offline mode (public/push-sw.js) needs them, so the app's own domains
    // are listed in Info.plist → WKAppBoundDomains and navigation is limited
    // to them; any other site opens in Safari. Intuit's sign-in domains are
    // app-bound too: allowNavigation keeps QuickBooks Connect in the webview,
    // and WebKit refuses an in-webview navigation to a domain that is not
    // app-bound, so without them Connect would fail on the iPhone.
    limitsNavigationsToAppBoundDomains: true,
    // Scroll elastic behaviour matches native feel
    scrollEnabled: true,
    backgroundColor: '#000000',
    // Required capability entries go in ios/App/App/Info.plist
    infoPlist: {
      NSCameraUsageDescription:
        'Saguaro Field uses the camera to capture site photos, inspection results, and punch list items.',
      NSPhotoLibraryUsageDescription:
        'Saguaro Field can upload photos from your library for site documentation.',
      NSPhotoLibraryAddUsageDescription:
        'Saguaro Field saves captured site photos to your library.',
      NSLocationWhenInUseUsageDescription:
        'Saguaro Field uses your location to GPS-stamp clock in/out and photos.',
      NSFaceIDUsageDescription:
        'Saguaro Field uses Face ID for quick and secure sign-in.',
    },
  },

  android: {
    allowMixedContent: false,
    // Debug only — set false before App Store submission
    webContentsDebuggingEnabled: process.env.NODE_ENV !== 'production',
    appendUserAgent: 'SaguaroField/1.0',
    backgroundColor: '#000000',
    // Edge-to-edge with safe area insets
    initialFocus: false,
  },
};

export default config;
