import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Saguaro Field — Capacitor Native App Config
 *
 * The app runs in "server mode" — the native WebView loads the hosted
 * Next.js app. No static export needed. All API routes work normally.
 *
 * Build modes:
 *   Dev:   CAPACITOR_SERVER_URL=http://localhost:3000  (live reload)
 *   Prod:  uses PRODUCTION_URL constant below (update after each deploy)
 *
 * After changing this file run: npx cap sync
 */

// Override with env var for dev / CI; falls back to production URL
const PRODUCTION_URL = 'https://saguaro-crm-rho.vercel.app';
const serverUrl = process.env.CAPACITOR_SERVER_URL ?? PRODUCTION_URL;

const config: CapacitorConfig = {
  appId: 'com.saguaro.field',
  appName: 'Saguaro Field',

  // webDir holds initial web assets; in server mode the live URL takes over
  webDir: 'out',

  // Server mode — loads hosted Next.js app inside the native WebView
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
    androidScheme: 'https',
  },

  plugins: {
    // ── Splash Screen ──────────────────────────────────────────────
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: false,
      backgroundColor: '#07101C',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      iosSpinnerStyle: 'small',
      spinnerColor: '#D4A017',
    },

    // ── Status Bar ────────────────────────────────────────────────
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#060C15',
      overlaysWebView: false,
    },

    // ── Push Notifications ────────────────────────────────────────
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },

    // ── Local Notifications ───────────────────────────────────────
    LocalNotifications: {
      smallIcon: 'ic_stat_saguaro',
      iconColor: '#D4A017',
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
    // Allow WKWebView to reach the same-origin server
    contentInset: 'automatic',
    limitsNavigationsToAppBoundDomains: false,
    // Scroll elastic behaviour matches native feel
    scrollEnabled: true,
    backgroundColor: '#07101C',
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
    backgroundColor: '#07101C',
    // Edge-to-edge with safe area insets
    initialFocus: false,
  },
};

export default config;
