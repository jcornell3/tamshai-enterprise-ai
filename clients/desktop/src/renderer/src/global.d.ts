/**
 * TypeScript declarations for Electron API in renderer process
 */

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface IpcResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  token?: string;
  tokens?: Tokens;
}

interface ElectronAPI {
  // Authentication
  login: () => Promise<IpcResponse>;
  logout: () => Promise<IpcResponse>;
  getAccessToken: () => Promise<IpcResponse<string>>;

  // Token Storage
  storeTokens: (tokens: Tokens) => Promise<IpcResponse>;
  getTokens: () => Promise<IpcResponse<Tokens | null>>;
  clearTokens: () => Promise<IpcResponse>;

  // Notifications
  showNotification: (title: string, body: string) => Promise<IpcResponse>;

  // Event Listeners
  onAuthSuccess: (callback: (tokens: Tokens) => void) => void;
  onAuthError: (callback: (error: string) => void) => void;
  removeAuthSuccessListener: () => void;
  removeAuthErrorListener: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
