import React from 'react';
import { AuthProvider as OidcAuthProvider } from 'react-oidc-context';
import { oidcConfig } from './config';

/**
 * Authentication Provider
 *
 * Wraps react-oidc-context with Tamshai-specific configuration
 *
 * SECURITY COMPLIANCE (Article V):
 * - OIDC with PKCE flow (no implicit flow)
 * - Access tokens stored in memory only
 * - Automatic silent refresh enabled
 * - Session monitoring enabled
 */
interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  return (
    <OidcAuthProvider
      {...oidcConfig}
      onSigninCallback={() => {
        // Remove query params after successful login
        window.history.replaceState({}, document.title, window.location.pathname);
      }}
    >
      {children}
    </OidcAuthProvider>
  );
}
