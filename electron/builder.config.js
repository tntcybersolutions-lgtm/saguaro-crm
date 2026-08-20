// electron-builder configuration for Saguaro Field Desktop
// Outputs NSIS installer on Windows (.exe) and DMG on macOS.
// Run: npm run electron:build:win  (or :mac / :linux)

module.exports = {
  appId: 'com.saguaro.field.desktop',
  productName: 'Saguaro Field',
  copyright: 'Copyright © 2026 Saguaro Control Systems',
  // Tight whitelist — the Electron shell is a thin wrapper around a
  // hosted URL, so the bundle only needs main.js, icons, and a
  // minimal package.json. Explicitly exclude everything else: the
  // Next.js repo is 2GB including node_modules + .next, which
  // exhausts 7za's memory budget during packaging.
  files: [
    '!**/*',
    'electron/main.js',
    'public/icons/icon-512x512.png',
    'public/icons/icon-192x192.png',
    'public/apple-touch-icon.png',
    'public/favicon-32x32.png',
    'public/favicon-16x16.png',
    'public/logo-full.png',
    // node_modules is required by electron-builder to find electron itself,
    // but we only need its minimal runtime. Include just what the main
    // process actually requires (currently none — main.js uses only
    // 'electron' which is provided by the runtime, not bundled).
  ],
  // Don't try to rebuild native deps, we have none in the shell
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,
  npmRebuild: false,
  asar: true,
  // Everything lives in the repo root — no separate electron/ subdir to point at
  directories: {
    output: 'dist-electron',
    buildResources: 'public',
  },
  // Tell electron-builder which file is the main entry point (we set this
  // in package.json "main" field too, but be explicit here for safety).
  extraMetadata: {
    main: 'electron/main.js',
  },
  // ── Windows: Portable .exe ────────────────────────────────────────
  // Using 'portable' target instead of 'nsis' because electron-builder
  // 25.x bundles NSIS 3.0.4.1 which has a memory-map compiler bug
  // (Internal compiler error #12345) when packaging Electron 32+ on
  // Windows. Portable produces a single double-clickable .exe that
  // runs without any install wizard — it IS the most frictionless
  // way to distribute a "real installable app" on Windows: download,
  // double-click, it runs. First run unpacks a cached copy to %LOCALAPPDATA%.
  win: {
    target: [{ target: 'portable', arch: ['x64'] }],
    icon: 'public/icons/icon-512x512.png',
    artifactName: 'SaguaroField-${version}.${ext}',
  },
  portable: {
    artifactName: 'SaguaroField-${version}.${ext}',
    unicode: true,
  },
  // ── macOS: DMG installer ──────────────────────────────────────────
  mac: {
    target: [{ target: 'dmg', arch: ['universal'] }],
    icon: 'public/icons/icon-512x512.png',
    category: 'public.app-category.business',
    artifactName: 'SaguaroField-${version}.${ext}',
    hardenedRuntime: true,
    gatekeeperAssess: false,
  },
  dmg: {
    title: 'Saguaro Field ${version}',
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },
  // ── Linux: AppImage ───────────────────────────────────────────────
  linux: {
    target: ['AppImage'],
    icon: 'public/icons/icon-512x512.png',
    category: 'Office',
    artifactName: 'SaguaroField-${version}.${ext}',
  },
};
