// Saguaro Field — Electron Desktop Wrapper
//
// Wraps the hosted Next.js field app in a Chromium BrowserWindow so
// Windows users can install a real .exe (NSIS installer) and macOS
// users get a .dmg. Same codebase as the web app — this shell just
// provides a native window, system integration, and the install
// experience users expect from a "real app".
//
// Dev:      set ELECTRON_START_URL=http://localhost:3000/field
// Prod:     defaults to the canonical Vercel URL below
//
// Build:    npm run electron:build:win    (creates .exe installer)
//           npm run electron:build:mac    (creates .dmg)
//           npm run electron:build        (creates for host platform)

const { app, BrowserWindow, shell, Menu, nativeImage } = require('electron');
const path = require('path');

const PROD_URL = 'https://saguaro-crm-git-main-salty-vault.vercel.app/field';
const START_URL = process.env.ELECTRON_START_URL || PROD_URL;
const IS_DEV = !!process.env.ELECTRON_START_URL;

// Single-instance lock so a second launch focuses the existing window
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 360,
    minHeight: 600,
    backgroundColor: '#0d1117',
    title: 'Saguaro Field',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'public', 'icons', 'icon-512x512.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Allow camera/mic/geolocation prompts from the hosted app
      webSecurity: true,
    },
  });

  // External links open in the user's default browser, not a new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://saguaro-crm') || url.startsWith('https://saguarocontrol.net')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Auto-grant camera/mic/geolocation/notifications so the field app just works
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'geolocation', 'notifications', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });

  // Minimal menu (hide default Electron clutter on Windows/Linux; keep edit shortcuts)
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  mainWindow.loadURL(START_URL);

  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // macOS: keep app running until explicitly quit (dock behavior)
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  // macOS: recreate window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
