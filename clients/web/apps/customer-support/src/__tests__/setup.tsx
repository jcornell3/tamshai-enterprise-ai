import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

// Mock react-oidc-context
vi.mock('react-oidc-context', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: {
      access_token: 'mock-token',
      profile: {
        sub: 'user-123',
        preferred_username: 'jane.smith@acme.com',
        email: 'jane.smith@acme.com',
        name: 'Jane Smith',
        given_name: 'Jane',
        family_name: 'Smith',
        organization_id: 'org-acme-001',
        organization_name: 'Acme Corporation',
        realm_access: {
          roles: ['lead-customer'],
        },
      },
    },
    signinRedirect: vi.fn(),
    signoutRedirect: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock @tanstack/react-query
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn().mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    }),
    useMutation: vi.fn().mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    }),
  };
});

// Mock fetch
global.fetch = vi.fn();

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    hostname: 'localhost',
    origin: 'http://localhost:4006',
    pathname: '/',
    href: 'http://localhost:4006/',
  },
  writable: true,
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });
