/**
 * Stub type declarations for Capacitor packages.
 *
 * These allow `tsc --noEmit` to pass before `npm install` is run.
 * Once packages are installed, the real types from node_modules take precedence
 * and these wildcard stubs are ignored for those specific imports.
 *
 * Remove this file after running `npm install` if you prefer full type safety.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor/core' { const x: any; export = x; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor/camera' { const x: any; export = x; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor/geolocation' { const x: any; export = x; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor/haptics' { const x: any; export = x; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor/push-notifications' { const x: any; export = x; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor/local-notifications' { const x: any; export = x; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor/network' { const x: any; export = x; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor/status-bar' { const x: any; export = x; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor/splash-screen' { const x: any; export = x; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor/app' { const x: any; export = x; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor/share' { const x: any; export = x; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor/toast' { const x: any; export = x; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor/device' { const x: any; export = x; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor/filesystem' { const x: any; export = x; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor/preferences' { const x: any; export = x; }
// @capacitor/cli exports CapacitorConfig as a named type
declare module '@capacitor/cli' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type CapacitorConfig = Record<string, any>;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@aparajita/capacitor-biometric-auth' { const x: any; export = x; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module '@capacitor-mlkit/barcode-scanning' { const x: any; export = x; }
