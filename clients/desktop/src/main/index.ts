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
//
// IMPORTANT: We use a hardcoded path based on APPDATA because app.getPath()
// may not work before Electron is fully initialized (causes crashes when
// launched via protocol handler on Windows).
// =============================================================================
const DEBUG_LOG_DIR = process.platform === 'win32'
  ? join(process.env.APPDATA || '', 'tamshai-ai-desktop', 'debug')
  : process.platform === 'darwin'
    ? join(process.env.HOME || '', 'Library', 'Application Support', 'tamshai-ai-desktop', 'debug')
    : join(process.env.HOME || '', '.config', 'tamshai-ai-desktop', 'debug');
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

// Detect deep link URL in command line arguments early (before any async operations)
// This is used for both the race condition delay and cold start handling
const deepLinkUrlArg = process.argv.find(arg => arg.startsWith('tamshai-ai://'));
debugLog(`Deep link URL in args: ${deepLinkUrlArg || 'none'}`);

// Catch uncaught exceptions to debug crashes
process.on('uncaughtException', (err) => {
  debugLog(`UNCAUGHT EXCEPTION: ${err.message}`);
  debugLog(`Stack: ${err.stack}`);
});

process.on('unhandledRejection', (reason) => {
  debugLog(`UNHANDLED REJECTION: ${reason}`);
});

// Track process exit
process.on('exit', (code) => {
  debugLog(`*** PROCESS EXIT with code: ${code} ***`);
});

process.on('SIGINT', () => {
  debugLog('*** RECEIVED SIGINT ***');
});

process.on('SIGTERM', () => {
  debugLog('*** RECEIVED SIGTERM ***');
});

// Electron app lifecycle events
app.on('before-quit', () => {
  debugLog('*** APP BEFORE-QUIT EVENT ***');
});

app.on('will-quit', () => {
  debugLog('*** APP WILL-QUIT EVENT ***');
});

app.on('quit', () => {
  debugLog('*** APP QUIT EVENT ***');
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
  // Prevent creating multiple windows
  if (mainWindow && !mainWindow.isDestroyed()) {
    debugLog('Window already exists, focusing instead of creating new');
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }

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
    debugLog('*** WINDOW CLOSED EVENT ***');
    console.log('[Window] Window closed');
    mainWindow = null;
  });

  mainWindow.on('close', (event) => {
    debugLog('*** WINDOW CLOSE EVENT (before close) ***');
    console.log('[Window] Window about to close');
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
 * Single instance lock with race condition mitigation
 *
 * Uses Electron's additionalData API to pass the deep link URL from the
 * second instance to the first instance via IPC (not command line).
 *
 * The 600ms delay before requesting the lock mitigates a known Windows
 * race condition (Electron issue #35680) where both instances can
 * incorrectly get the lock simultaneously.
 */
interface SingleInstanceData {
  deepLinkUrl: string | null;
}

async function attemptSingleInstanceLock(): Promise<void> {
  // Prepare data to pass to primary instance (if we are secondary)
  const additionalData: SingleInstanceData = {
    deepLinkUrl: deepLinkUrlArg || null
  };

  // Race Condition Mitigation (Windows specific)
  // If we have a deep link URL, we are likely the second instance launched by
  // the protocol handler. Wait briefly to ensure the OS lock table is updated
  // so requestSingleInstanceLock doesn't return true falsely.
  // This addresses Electron issue #35680.
  if (deepLinkUrlArg && process.platform === 'win32') {
    debugLog('Deep link detected. Delaying lock request by 600ms to prevent race condition...');
    await new Promise(resolve => setTimeout(resolve, 600));
  }

  // Request lock with additionalData for URL passing
  debugLog('Requesting single instance lock...');
  const gotTheLock = app.requestSingleInstanceLock(additionalData);
  debugLog(`gotTheLock: ${gotTheLock}`);

  if (!gotTheLock) {
    // Another instance is already running - quit immediately
    // The additionalData (including deep link URL) will be passed to the first instance
    debugLog('Another instance is running - quitting to pass data to it');
    console.log('[App] Another instance is running, passing data and quitting...');
    console.log('[App] additionalData:', additionalData);
    app.quit();
    return;
  }

  // We have the lock - this is the primary instance
  debugLog('Got the lock - this is the primary instance');

  // Log periodically to confirm process is still alive and holding lock
  setInterval(() => {
    debugLog(`[HEARTBEAT] PID ${process.pid} still alive and holding lock`);
  }, 10000); // Every 10 seconds

  // Setup second-instance handler to receive data from subsequent instances
  app.on('second-instance', (_event, commandLine, workingDirectory, additionalData) => {
    debugLog('=== SECOND INSTANCE EVENT RECEIVED ===');
    debugLog(`commandLine: ${JSON.stringify(commandLine)}`);
    debugLog(`workingDirectory: ${workingDirectory}`);
    debugLog(`additionalData: ${JSON.stringify(additionalData)}`);

    console.log('[App] Second instance detected!');
    console.log('[App] additionalData:', additionalData);

    // Focus existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Extract URL from additionalData (preferred - clean IPC method)
    const data = additionalData as SingleInstanceData | undefined;
    let url: string | undefined;

    if (data?.deepLinkUrl) {
      debugLog(`Deep link received via additionalData: ${data.deepLinkUrl}`);
      url = data.deepLinkUrl;
    } else {
      // Fallback: Check commandLine arguments if additionalData wasn't provided
      debugLog('No URL in additionalData, checking commandLine args...');
      url = commandLine.find(arg => arg.startsWith('tamshai-ai://'));
      if (url) {
        debugLog(`Found fallback URL in commandLine: ${url}`);
      }
    }

    if (url) {
      console.log('[App] Deep link found:', url);
      handleDeepLink(url);
    } else {
      debugLog('No deep link found in second instance data');
      console.log('[App] No deep link found');
    }
  });

  // Initialize the app (only primary instance reaches here)
  initializeApp();
}

/**
 * Initialize the application (called only by primary instance)
 */
function initializeApp(): void {
  app.whenReady().then(async () => {
    registerCustomProtocol();
    await initializeServices();
    registerIpcHandlers();
    createWindow();

    // Handle "cold start" - app was launched directly with a deep link URL
    // This happens when the app wasn't running and was launched via protocol handler,
    // OR when the first instance's lock was not properly held (Windows race condition)
    if (deepLinkUrlArg) {
      debugLog(`Cold start with deep link URL: ${deepLinkUrlArg}`);
      console.log('[App] Cold start with deep link URL:', deepLinkUrlArg);

      // Check if this is an OAuth callback
      if (deepLinkUrlArg.includes('oauth/callback')) {
        // KNOWN LIMITATION: Windows Race Condition (Electron #35680)
        //
        // On Windows, a race condition in Electron's single-instance lock can cause
        // both the primary instance and callback instance to acquire the lock.
        // When this happens, the second-instance event doesn't fire, and the callback
        // URL is lost because this orphaned instance has no PKCE verifier.
        //
        // This is a fundamental Electron/Windows limitation. The workarounds attempted
        // (600ms delay, auto-close orphan, file-based IPC) were insufficient.
        //
        // DECISION: Pivot to React Native for Windows which uses native UWP protocol
        // handling and doesn't have this race condition. See:
        // - clients/desktop/ELECTRON_SINGLE_INSTANCE_LOCK_INVESTIGATION.md
        // - .specify/ARCHITECTURE_SPECS.md (Architecture Decision Record)
        //
        // For now, show error and auto-close the orphaned instance.
        debugLog('Cold start OAuth callback detected - orphaned instance (Electron race condition)');
        console.warn('[App] OAuth callback in cold start - Electron race condition triggered');
        console.warn('[App] This is a known limitation. See ELECTRON_SINGLE_INSTANCE_LOCK_INVESTIGATION.md');

        // Auto-close orphaned instance after brief delay
        setTimeout(() => {
          debugLog('Quitting orphaned callback instance');
          app.quit();
        }, 2000);

        return; // Stop further initialization
      } else {
        // Non-OAuth deep link - handle normally
        mainWindow?.webContents.on('did-finish-load', () => {
          debugLog('Window loaded, processing cold start deep link...');
          handleDeepLink(deepLinkUrlArg);
        });
      }
    }

    // macOS: Re-create window when dock icon is clicked
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

// Start the single instance lock process
attemptSingleInstanceLock();

/**
 * Register app as default protocol client
 *
 * In development mode, we need to pass additional arguments to ensure
 * the protocol handler invokes Electron with the correct entry point.
 * The default setAsDefaultProtocolClient only passes "%1" which causes
 * Electron to try to load the URL as a file path.
 */
function registerCustomProtocol(): void {
  if (app.isPackaged) {
    // Production: Use default registration (packaged app handles it correctly)
    if (!app.isDefaultProtocolClient('tamshai-ai')) {
      const registered = app.setAsDefaultProtocolClient('tamshai-ai');
      console.log('[Protocol] Registered tamshai-ai:// protocol handler:', registered);
    } else {
      console.log('[Protocol] Already registered as default protocol client');
    }
  } else {
    // Development: Skip auto-registration, rely on manual register-protocol-dev.ps1
    // This prevents overwriting the correct registry entry with a broken one.
    // The manual script registers with: electron.exe dist/main/index.js -- "%1"
    console.log('[Protocol] Development mode - skipping auto-registration');
    console.log('[Protocol] Use register-protocol-dev.ps1 to register the protocol handler');
  }
}

/**
 * Handle OAuth callback deep link
 */
function handleDeepLink(url: string): void {
  console.log('[Deep Link] Received:', url);
  debugLog(`handleDeepLink called with: ${url}`);

  if (url.startsWith('tamshai-ai://oauth/callback')) {
    debugLog('URL matches OAuth callback pattern, processing...');

    authService.handleCallback(url)
      .then(async (tokens) => {
        debugLog('Token exchange successful, storing tokens...');
        await storageService.storeTokens(tokens);
        debugLog('Tokens stored successfully');

        // Notify renderer of successful authentication
        if (mainWindow) {
          debugLog('Sending auth:success event to renderer');
          console.log('[Deep Link] Sending auth:success to renderer');
          mainWindow.webContents.send('auth:success', tokens);

          // Also focus the window to bring it to foreground
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
          debugLog('Window focused');
        } else {
          debugLog('ERROR: mainWindow is null, cannot send auth:success');
          console.error('[Deep Link] mainWindow is null!');
        }
      })
      .catch((error) => {
        debugLog(`Token exchange FAILED: ${error.message}`);
        console.error('[Auth] Callback error:', error);

        if (mainWindow) {
          mainWindow.webContents.send('auth:error', error.message);
        }
      });
  } else {
    debugLog(`URL does not match OAuth callback pattern`);
  }
}

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
