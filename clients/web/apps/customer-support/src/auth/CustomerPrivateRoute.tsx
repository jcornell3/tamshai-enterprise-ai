import React, { useEffect, useRef } from 'react';
import { useCustomerAuth } from './useCustomerAuth';

interface CustomerPrivateRouteProps {
  children: React.ReactNode;
  requireLead?: boolean;
}

/**
 * Protected route component for customer portal
 *
 * - Requires customer authentication (tamshai-customers realm)
 * - Optionally requires Lead Contact role
 * - Auto-redirects unauthenticated users to Keycloak
 */
export function CustomerPrivateRoute({ children, requireLead = false }: CustomerPrivateRouteProps) {
  const { isLoading, isAuthenticated, isLeadContact, login, customerProfile } = useCustomerAuth();
  const redirecting = useRef(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !redirecting.current) {
      redirecting.current = true;
      login();
    }
  }, [isLoading, isAuthenticated, login]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  if (!customerProfile?.organizationId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
          <h1 className="text-xl font-bold text-red-600 mb-4">Account Configuration Error</h1>
          <p className="text-gray-600 mb-6">
            Your account is not properly configured with an organization. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  if (requireLead && !isLeadContact) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
          <h1 className="text-xl font-bold text-amber-600 mb-4">Access Restricted</h1>
          <p className="text-gray-600 mb-6">
            This page is only accessible to Lead Contacts. Please contact your organization's Lead
            Contact if you need access.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
