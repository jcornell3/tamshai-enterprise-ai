import React from 'react';
import { AuthProvider as OidcAuthProvider } from 'react-oidc-context';
import { customerOidcConfig } from './config';

/**
 * Customer Authentication Provider
 *
 * Wraps react-oidc-context with customer realm configuration:
 * - Uses tamshai-customers realm
 * - OIDC with PKCE flow
 * - Includes organization scope for org_id claims
 */
interface CustomerAuthProviderProps {
  children: React.ReactNode;
}

export function CustomerAuthProvider({ children }: CustomerAuthProviderProps) {
  return (
    <OidcAuthProvider
      {...customerOidcConfig}
      onSigninCallback={() => {
        // Remove query params after successful login
        window.history.replaceState({}, document.title, window.location.pathname);
      }}
    >
      {children}
    </OidcAuthProvider>
  );
}
