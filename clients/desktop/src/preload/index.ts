/**
 * Tamshai AI Desktop - Preload Script
 *
 * IPC Bridge: Exposes secure APIs from main process to renderer process
 * via contextBridge. This maintains context isolation for security.
 *
 * Security Model:
 * - Renderer process (untrusted): Cannot access Node.js/Electron APIs
 * - Preload script (trusted): Runs in isolated context, exposes whitelisted APIs
 * - Main process (trusted): Handles all sensitive operations
 */

import { contextBridge, ipcRenderer } from 'electron';

/**
 * Token types
 */
export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * IPC Response wrapper
 */
interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  token?: string;
  tokens?: Tokens;
}

/**
 * Electron API exposed to renderer
 *
 * Usage in renderer:
 * ```typescript
 * const result = await window.electronAPI.login();
 * if (result.success) {
 *   console.log('Logged in!');
 * }
 * ```
 */
const electronAPI = {
  // ==================== Authentication ====================

  /**
   * Initiate OAuth login flow
   * Opens system browser with Keycloak login page
   *
   * @returns Promise with success status
   */
  login: (): Promise<IpcResponse> => {
    return ipcRenderer.invoke('auth:login');
  },

  /**
   * Logout user and clear tokens
   *
   * @returns Promise with success status
   */
  logout: (): Promise<IpcResponse> => {
    return ipcRenderer.invoke('auth:logout');
  },

  /**
   * Get current valid access token
   * Automatically refreshes if expired
   *
   * @returns Promise with token string
   */
  getAccessToken: (): Promise<IpcResponse<string>> => {
    return ipcRenderer.invoke('auth:getToken');
  },

  // ==================== Token Storage ====================

  /**
   * Store tokens securely using OS keychain
   *
   * @param tokens - Access and refresh tokens
   * @returns Promise with success status
   */
  storeTokens: (tokens: Tokens): Promise<IpcResponse> => {
    return ipcRenderer.invoke('storage:storeTokens', tokens);
  },

  /**
   * Retrieve stored tokens from OS keychain
   *
   * @returns Promise with tokens or null
   */
  getTokens: (): Promise<IpcResponse<Tokens | null>> => {
    return ipcRenderer.invoke('storage:getTokens');
  },

  /**
   * Clear stored tokens from OS keychain
   *
   * @returns Promise with success status
   */
  clearTokens: (): Promise<IpcResponse> => {
    return ipcRenderer.invoke('storage:clearTokens');
  },

  // ==================== Notifications ====================

  /**
   * Show native OS notification
   *
   * @param title - Notification title
   * @param body - Notification body text
   * @returns Promise with success status
   */
  showNotification: (title: string, body: string): Promise<IpcResponse> => {
    return ipcRenderer.invoke('notification:show', title, body);
  },

  // ==================== Event Listeners ====================

  /**
   * Listen for authentication success event
   *
   * @param callback - Function called when auth succeeds
   */
  onAuthSuccess: (callback: (tokens: Tokens) => void): void => {
    ipcRenderer.on('auth:success', (_, tokens) => callback(tokens));
  },

  /**
   * Listen for authentication error event
   *
   * @param callback - Function called when auth fails
   */
  onAuthError: (callback: (error: string) => void): void => {
    ipcRenderer.on('auth:error', (_, error) => callback(error));
  },

  /**
   * Remove auth success listener
   */
  removeAuthSuccessListener: (): void => {
    ipcRenderer.removeAllListeners('auth:success');
  },

  /**
   * Remove auth error listener
   */
  removeAuthErrorListener: (): void => {
    ipcRenderer.removeAllListeners('auth:error');
  },
};

/**
 * Expose API to renderer process
 *
 * This creates a global `window.electronAPI` object in the renderer
 * that provides secure access to main process functionality.
 */
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

/**
 * TypeScript declaration for renderer process
 *
 * Add this to a .d.ts file in renderer:
 *
 * ```typescript
 * export interface Tokens {
 *   accessToken: string;
 *   refreshToken: string;
 *   expiresAt: number;
 * }
 *
 * interface IpcResponse<T = any> {
 *   success: boolean;
 *   data?: T;
 *   error?: string;
 *   token?: string;
 *   tokens?: Tokens;
 * }
 *
 * interface ElectronAPI {
 *   login: () => Promise<IpcResponse>;
 *   logout: () => Promise<IpcResponse>;
 *   getAccessToken: () => Promise<IpcResponse<string>>;
 *   storeTokens: (tokens: Tokens) => Promise<IpcResponse>;
 *   getTokens: () => Promise<IpcResponse<Tokens | null>>;
 *   clearTokens: () => Promise<IpcResponse>;
 *   showNotification: (title: string, body: string) => Promise<IpcResponse>;
 *   onAuthSuccess: (callback: (tokens: Tokens) => void) => void;
 *   onAuthError: (callback: (error: string) => void) => void;
 *   removeAuthSuccessListener: () => void;
 *   removeAuthErrorListener: () => void;
 * }
 *
 * declare global {
 *   interface Window {
 *     electronAPI: ElectronAPI;
 *   }
 * }
 * ```
 */
