/**
 * Tamshai AI Desktop - Main Process
 *
 * Architecture v1.4 compliant Electron main process with:
 * - Security hardening (CSP, context isolation, sandbox)
 * - Deep linking for OAuth callbacks (tamshai-ai://)
 * - OIDC PKCE authentication
 * - Secure token storage via safeStorage API
 */

import { app, BrowserWindow, shell, session, ipcMain, protocol } from 'electron';
import { join, resolve } from 'path';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { AuthService } from './auth';
import { StorageService } from './storage';

// =============================================================================
// STARTUP DEBUGGING - File-based logging for protocol handler debugging
// This logs to a file because console.log may not be visible when the second
// instance crashes before communicating with the first instance.
// =============================================================================
const DEBUG_LOG_DIR = join(app.getPath('userData'), 'debug');
const DEBUG_LOG_FILE = join(DEBUG_LOG_DIR, 'startup.log');

function debugLog(msg: string): void {
  try {
    if (!existsSync(DEBUG_LOG_DIR)) {
      mkdirSync(DEBUG_LOG_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString();
    const pid = process.pid;
    appendFileSync(DEBUG_LOG_FILE, `[${timestamp}] [PID:${pid}] ${msg}\n`);
  } catch {
    // Ignore logging errors
  }
}

// Log startup information immediately
debugLog('=== ELECTRON STARTUP ===');
debugLog(`process.argv: ${JSON.stringify(process.argv)}`);
debugLog(`process.cwd(): ${process.cwd()}`);
debugLog(`__dirname: ${__dirname}`);
debugLog(`app.isPackaged: ${app.isPackaged}`);

// Catch uncaught exceptions to debug crashes
process.on('uncaughtException', (err) => {
  debugLog(`UNCAUGHT EXCEPTION: ${err.message}`);
  debugLog(`Stack: ${err.stack}`);
});

process.on('unhandledRejection', (reason) => {
  debugLog(`UNHANDLED REJECTION: ${reason}`);
});

// Fix working directory in development mode
// When Windows launches via protocol handler, CWD may be System32
if (!app.isPackaged) {
  const projectRoot = resolve(__dirname, '../../');
  debugLog(`Changing CWD from ${process.cwd()} to ${projectRoot}`);
  try {
    process.chdir(projectRoot);
    debugLog(`CWD is now: ${process.cwd()}`);
  } catch (err) {
    debugLog(`Failed to change CWD: ${err}`);
  }
}

// =============================================================================

// Singleton services
let authService: AuthService;
let storageService: StorageService;
let mainWindow: BrowserWindow | null = null;

// Development mode detection
const isDev = process.env.NODE_ENV === 'development';

/**
 * Create main application window with security hardening
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Tamshai AI Assistant',
    webPreferences: {
      // Security: Disable Node.js integration in renderer
      nodeIntegration: false,

      // Security: Enable context isolation (preload script runs in separate context)
      contextIsolation: true,

      // Security: Enable sandbox mode
      sandbox: true,

      // Security: Disable web security in dev only (for localhost CORS)
      webSecurity: !isDev,

      // Preload script for IPC bridge
      preload: join(__dirname, '../preload/index.js'),
    },

    // Show window only when ready to prevent white flash
    show: false,
  });

  // Apply Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Development CSP: Allow inline scripts for Vite HMR
    const devCSP =
      "default-src 'self'; " +
      "connect-src 'self' http://localhost:* ws://localhost:* http://localhost:3100 http://localhost:8180 http://localhost:8100; " +
      "style-src 'self' 'unsafe-inline'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +  // Required for Vite dev server
      "img-src 'self' data:; " +
      "font-src 'self' data:;";

    // Production CSP: Strict security
    const prodCSP =
      "default-src 'self'; " +
      "connect-src 'self' http://localhost:3100 http://localhost:8180 http://localhost:8100; " +
      "style-src 'self' 'unsafe-inline'; " +
      "script-src 'self'; " +
      "img-src 'self' data:; " +
      "font-src 'self' data:;";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [isDev ? devCSP : prodCSP]
      }
    });
  });

  // Load renderer
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173'); // Vite dev server
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Security: Prevent new window creation (open in default browser instead)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow OAuth redirects to open in system browser
    if (url.startsWith('http://localhost:8180') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Security: Prevent navigation to external sites
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigins = [
      'http://localhost:5173', // Vite dev server
      'http://localhost:3100', // MCP Gateway
      'http://localhost:8180', // Keycloak
    ];

    const isAllowed = allowedOrigins.some(origin => url.startsWith(origin));
    if (!isAllowed) {
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Initialize application services
 */
async function initializeServices(): Promise<void> {
  authService = new AuthService();
  storageService = new StorageService();

  await authService.initialize();
}

/**
 * Register IPC handlers for renderer communication
 */
function registerIpcHandlers(): void {
  // Authentication handlers
  ipcMain.handle('auth:login', async () => {
    try {
      await authService.login();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      await authService.logout();
      await storageService.clearTokens();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('auth:getToken', async () => {
    try {
      const token = await authService.getAccessToken();
      return { success: true, token };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Storage handlers
  ipcMain.handle('storage:storeTokens', async (_, tokens) => {
    try {
      await storageService.storeTokens(tokens);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('storage:getTokens', async () => {
    try {
      const tokens = await storageService.getTokens();
      return { success: true, tokens };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('storage:clearTokens', async () => {
    try {
      await storageService.clearTokens();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // Notification handler
  ipcMain.handle('notification:show', async (_, title: string, body: string) => {
    // Use Electron Notification API (future enhancement)
    console.log(`[Notification] ${title}: ${body}`);
    return { success: true };
  });
}

/**
 * Register custom protocol scheme (must be called BEFORE app.ready)
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'tamshai-ai',
    privileges: {
      standard: true,
      secure: true,
      corsEnabled: false,
      supportFetchAPI: false
    }
  }
]);

/**
 * Single instance lock (must be checked BEFORE app.ready)
 * Ensures only one instance runs and passes deep links to existing instance
 */
debugLog('Requesting single instance lock...');
const gotTheLock = app.requestSingleInstanceLock();
debugLog(`gotTheLock: ${gotTheLock}`);

if (!gotTheLock) {
  // Another instance is already running - quit immediately
  // The command line args will be passed to the first instance via second-instance event
  debugLog('Another instance is running - quitting to pass args to it');
  console.log('[App] Another instance is running, passing args and quitting...');
  console.log('[App] process.argv:', process.argv);
  app.quit();
} else {
  debugLog('Got the lock - this is the primary instance');
  // We have the lock - setup second-instance handler
  app.on('second-instance', (_event, commandLine, workingDirectory) => {
    debugLog('=== SECOND INSTANCE EVENT RECEIVED ===');
    debugLog(`commandLine: ${JSON.stringify(commandLine)}`);
    debugLog(`workingDirectory: ${workingDirectory}`);

    console.log('[App] Second instance detected!');
    console.log('[App] commandLine:', commandLine);
    console.log('[App] workingDirectory:', workingDirectory);
    console.log('[App] process.argv:', process.argv);

    // Focus existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Handle deep link from command line (look in both commandLine and process.argv)
    const url = commandLine.find(arg => arg.startsWith('tamshai-ai://')) ||
                process.argv.find(arg => arg.startsWith('tamshai-ai://'));
    if (url) {
      debugLog(`Deep link found: ${url}`);
      console.log('[App] Deep link found in command line:', url);
      handleDeepLink(url);
    } else {
      debugLog('No deep link found in command line');
      console.log('[App] No deep link found in command line');
      console.log('[App] All args:', commandLine);
    }
  });
}

/**
 * Register app as default protocol client
 */
function registerCustomProtocol(): void {
  // Set app as default protocol client (called AFTER app.ready)
  if (!app.isDefaultProtocolClient('tamshai-ai')) {
    const registered = app.setAsDefaultProtocolClient('tamshai-ai');
    console.log('[Protocol] Registered tamshai-ai:// protocol handler:', registered);
  } else {
    console.log('[Protocol] Already registered as default protocol client');
  }
}

/**
 * Handle OAuth callback deep link
 */
function handleDeepLink(url: string): void {
  console.log('[Deep Link] Received:', url);

  if (url.startsWith('tamshai-ai://oauth/callback')) {
    authService.handleCallback(url)
      .then(async (tokens) => {
        await storageService.storeTokens(tokens);

        // Notify renderer of successful authentication
        if (mainWindow) {
          mainWindow.webContents.send('auth:success', tokens);
        }
      })
      .catch((error) => {
        console.error('[Auth] Callback error:', error);

        if (mainWindow) {
          mainWindow.webContents.send('auth:error', error.message);
        }
      });
  }
}

/**
 * App lifecycle: Ready
 */
app.whenReady().then(async () => {
  registerCustomProtocol();
  await initializeServices();
  registerIpcHandlers();
  createWindow();

  // macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * App lifecycle: All windows closed
 */
app.on('window-all-closed', () => {
  // macOS: Keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Deep linking handlers
 */

// macOS: open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

/**
 * Security: Prevent eval and other dangerous APIs
 */
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    // Block navigation to file:// protocol
    if (parsedUrl.protocol === 'file:') {
      event.preventDefault();
    }
  });
});
