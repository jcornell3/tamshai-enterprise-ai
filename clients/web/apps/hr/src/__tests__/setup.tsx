import '@testing-library/jest-dom';
import React from 'react';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock @tamshai/auth module
vi.mock('@tamshai/auth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    userContext: {
      userId: 'test-user-001',
      username: 'test.user',
      email: 'test.user@tamshai.com',
      firstName: 'Test',
      lastName: 'User',
      roles: ['hr-read', 'hr-write'],
    },
    getAccessToken: () => 'mock-token',
    signIn: vi.fn(),
    signOut: vi.fn(),
    error: null,
  }),
  PrivateRoute: ({ children }: { children: React.ReactNode }) => children,
  getUserDisplayName: (ctx: any) => `${ctx?.firstName || ''} ${ctx?.lastName || ''}`.trim() || 'Unknown User',
  getRoleBadges: () => ['hr-read', 'hr-write'],
  canModifyHR: () => true,
  apiConfig: {
    mcpGatewayUrl: 'http://localhost:3100',
  },
}));

// Mock @tamshai/ui module - import actual Wizard and types
vi.mock('@tamshai/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tamshai/ui')>();
  return {
    ...actual,
    TruncationWarning: ({ message }: { message: string }) => (
      <div data-testid="truncation-warning">{message}</div>
    ),
    ApprovalCard: ({ message, onComplete }: { message: string; onComplete: (success: boolean) => void }) => (
      <div data-testid="approval-card">
        <p>{message}</p>
        <button onClick={() => onComplete(true)}>Approve</button>
        <button onClick={() => onComplete(false)}>Reject</button>
      </div>
    ),
  };
});

// Mock window.matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});
