import '@testing-library/jest-dom';
import { vi } from 'vitest';

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
      roles: ['finance-read', 'finance-write'],
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
    error: null,
  }),
  PrivateRoute: ({ children }: { children: React.ReactNode }) => children,
  getUserDisplayName: (ctx: any) => `${ctx?.firstName || ''} ${ctx?.lastName || ''}`.trim() || 'Unknown User',
  getRoleBadges: () => ['finance-read', 'finance-write'],
}));

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

// Mock IntersectionObserver for lazy loading components
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock ResizeObserver for chart components
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

// Mock EventSource for SSE streaming tests
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  readyState = 0;
  url: string;

  constructor(url: string) {
    this.url = url;
    this.readyState = 1; // OPEN
  }

  close = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  dispatchEvent = vi.fn();
}
Object.defineProperty(window, 'EventSource', {
  writable: true,
  value: MockEventSource,
});
