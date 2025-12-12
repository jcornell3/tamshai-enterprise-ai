import React from 'react';
import { useAuth } from './useAuth';
import { Role } from './types';
import { hasAnyRole } from './utils';

/**
 * Private Route Component
 *
 * Protects routes requiring authentication and optional role-based access
 *
 * Features:
 * - Redirects to login if not authenticated
 * - Optional role-based access control
 * - Loading state during authentication check
 * - Unauthorized message for insufficient permissions
 */
interface PrivateRouteProps {
  children: React.ReactNode;
  requiredRoles?: Role[];
  fallback?: React.ReactNode;
}

export function PrivateRoute({
  children,
  requiredRoles = [],
  fallback,
}: PrivateRouteProps) {
  const { isAuthenticated, isLoading, userContext, signIn } = useAuth();

  // Show loading spinner during auth check
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50">
        <div className="text-center">
          <div className="spinner mb-4"></div>
          <p className="text-secondary-600">Authenticating...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    // Trigger OIDC redirect
    signIn();
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50">
        <div className="text-center">
          <div className="spinner mb-4"></div>
          <p className="text-secondary-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Check role-based access
  if (requiredRoles.length > 0 && !hasAnyRole(userContext, requiredRoles)) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary-50">
        <div className="max-w-md w-full">
          <div className="card text-center">
            <div className="text-danger-500 text-6xl mb-4">
              <svg
                className="w-16 h-16 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-secondary-900 mb-2">
              Access Denied
            </h2>
            <p className="text-secondary-600 mb-6">
              You do not have permission to access this page.
            </p>
            <p className="text-sm text-secondary-500">
              Required roles: {requiredRoles.join(', ')}
            </p>
            <p className="text-sm text-secondary-500 mt-2">
              Your roles: {userContext?.roles.join(', ') || 'None'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Render protected content
  return <>{children}</>;
}
