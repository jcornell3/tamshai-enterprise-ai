import { useAuth } from 'react-oidc-context';
import { useMemo } from 'react';

/**
 * Customer user profile with organization information
 */
export interface CustomerProfile {
  userId: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  organizationName: string;
  roles: string[];
  isLeadContact: boolean;
}

/**
 * Custom hook for customer authentication
 *
 * Extends react-oidc-context with customer-specific features:
 * - Organization ID and name from JWT claims
 * - Lead vs Basic contact role detection
 * - Customer-specific profile
 */
export function useCustomerAuth() {
  const auth = useAuth();

  const customerProfile = useMemo<CustomerProfile | null>(() => {
    if (!auth.user?.profile) {
      return null;
    }

    const profile = auth.user.profile;

    // Extract roles from realm_access
    const roles = (profile.realm_access as { roles?: string[] })?.roles || [];

    return {
      userId: profile.sub || '',
      email: profile.email || '',
      name: profile.name || '',
      firstName: profile.given_name || '',
      lastName: profile.family_name || '',
      // Custom claims from organization scope
      organizationId: (profile.organization_id as string) || '',
      organizationName: (profile.organization_name as string) || '',
      roles,
      isLeadContact: roles.includes('lead-customer'),
    };
  }, [auth.user?.profile]);

  const isLeadContact = customerProfile?.isLeadContact ?? false;
  const isBasicContact = customerProfile ? !customerProfile.isLeadContact : false;

  return {
    ...auth,
    customerProfile,
    isLeadContact,
    isBasicContact,
    // Convenience getters
    organizationId: customerProfile?.organizationId,
    organizationName: customerProfile?.organizationName,
    // Auth helpers
    accessToken: auth.user?.access_token,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    login: () => auth.signinRedirect(),
    logout: () => auth.signoutRedirect(),
  };
}
