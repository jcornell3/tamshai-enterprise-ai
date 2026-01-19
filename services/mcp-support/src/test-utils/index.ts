/**
 * Test Utilities for MCP-Support Service
 *
 * Provides mock factories and test data for unit testing.
 * Follows MCP-HR reference implementation pattern.
 */

import { UserContext, ISupportBackend, SearchResult } from '../database/types';

/**
 * Create a mock user context for testing
 */
export function createMockUserContext(overrides: Partial<UserContext> = {}): UserContext {
  return {
    userId: 'test-user-id',
    username: 'test-user',
    email: 'test@tamshai.com',
    roles: ['support-read'],
    ...overrides,
  };
}

/**
 * Create a mock support backend
 */
export function createMockBackend(): jest.Mocked<ISupportBackend> {
  return {
    checkConnection: jest.fn().mockResolvedValue(true),
    searchTickets: jest.fn().mockResolvedValue({ data: [], hasMore: false }),
    getTicket: jest.fn(),
    searchKnowledgeBase: jest.fn().mockResolvedValue({ data: [], hasMore: false }),
    getArticle: jest.fn(),
    closeTicket: jest.fn(),
    createTicket: jest.fn(),
    updateTicket: jest.fn(),
  } as unknown as jest.Mocked<ISupportBackend>;
}

/**
 * Create a mock logger
 */
export function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

/**
 * Test data: Sample tickets
 */
export const TEST_TICKETS = [
  {
    id: 'ticket-001',
    subject: 'Cannot login to portal',
    description: 'Getting 401 error when trying to login',
    status: 'open',
    priority: 'high',
    assignee: 'alice.chen',
    customer_email: 'user@example.com',
    created_at: '2024-02-15T10:00:00Z',
    updated_at: '2024-02-15T10:00:00Z',
  },
  {
    id: 'ticket-002',
    subject: 'Feature request: Dark mode',
    description: 'Would like dark mode option in the UI',
    status: 'open',
    priority: 'low',
    assignee: null,
    customer_email: 'another@example.com',
    created_at: '2024-02-14T09:00:00Z',
    updated_at: '2024-02-14T09:00:00Z',
  },
];

/**
 * Test data: Sample knowledge base articles
 */
export const TEST_ARTICLES = [
  {
    id: 'kb-001',
    title: 'How to reset your password',
    content: 'Step 1: Go to login page. Step 2: Click "Forgot password"...',
    category: 'Authentication',
    tags: ['password', 'login', 'security'],
    views: 1500,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-02-01T00:00:00Z',
  },
  {
    id: 'kb-002',
    title: 'Getting started with the API',
    content: 'The API uses REST conventions. Base URL is...',
    category: 'API',
    tags: ['api', 'developer', 'integration'],
    views: 850,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-20T00:00:00Z',
  },
];

/**
 * Create mock search result
 */
export function createMockSearchResult<T>(
  data: T[],
  hasMore: boolean = false,
  nextCursor?: string
): SearchResult<T> {
  return {
    data,
    hasMore,
    nextCursor,
    totalCount: hasMore ? `${data.length}+` : data.length.toString(),
  };
}
