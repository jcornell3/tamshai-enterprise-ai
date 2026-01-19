/**
 * Test Utilities for MCP-Sales Service
 *
 * Provides mock factories and test data for unit testing.
 * Follows MCP-Finance/MCP-HR reference implementation pattern.
 */

import { ObjectId } from 'mongodb';

/**
 * User context for authorization testing
 */
export interface UserContext {
  userId: string;
  username: string;
  email: string;
  roles: string[];
}

/**
 * Create a mock user context for testing
 */
export function createMockUserContext(overrides: Partial<UserContext> = {}): UserContext {
  return {
    userId: 'test-user-id',
    username: 'test.user',
    email: 'test@tamshai.com',
    roles: ['sales-read'],
    ...overrides,
  };
}

/**
 * Create a mock MongoDB collection
 */
export function createMockCollection() {
  return {
    find: jest.fn().mockReturnThis(),
    findOne: jest.fn(),
    aggregate: jest.fn().mockReturnThis(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
    insertOne: jest.fn(),
    countDocuments: jest.fn(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    toArray: jest.fn(),
  };
}

/**
 * Create mock database result for MongoDB
 */
export function createMockDbResult<T>(docs: T[]): T[] {
  return docs;
}

/**
 * Create a mock ObjectId
 */
export function createMockObjectId(id?: string): ObjectId {
  return new ObjectId(id || '507f1f77bcf86cd799439011');
}

/**
 * Test data: Sample opportunities (deals)
 */
export const TEST_OPPORTUNITIES = [
  {
    _id: createMockObjectId('507f1f77bcf86cd799439011'),
    deal_name: 'Enterprise Software License',
    customer_id: createMockObjectId('507f1f77bcf86cd799439021'),
    stage: 'NEGOTIATION',
    value: 150000,
    currency: 'USD',
    probability: 60,
    expected_close_date: '2024-03-15',
    actual_close_date: null,
    deal_type: 'New Business',
    products: ['Enterprise Suite'],
    notes: 'Large enterprise deal',
    owner: 'carol.johnson',
    created_at: new Date('2024-02-01'),
    updated_at: new Date('2024-02-10'),
    activities: [],
  },
  {
    _id: createMockObjectId('507f1f77bcf86cd799439012'),
    deal_name: 'Annual Support Contract',
    customer_id: createMockObjectId('507f1f77bcf86cd799439022'),
    stage: 'CLOSED_WON',
    value: 50000,
    currency: 'USD',
    probability: 100,
    expected_close_date: '2024-02-28',
    actual_close_date: '2024-02-25',
    deal_type: 'Renewal',
    products: ['Support Package'],
    notes: 'Annual renewal',
    owner: 'carol.johnson',
    created_at: new Date('2024-01-15'),
    updated_at: new Date('2024-02-25'),
    activities: [],
  },
  {
    _id: createMockObjectId('507f1f77bcf86cd799439013'),
    deal_name: 'Pilot Program',
    customer_id: createMockObjectId('507f1f77bcf86cd799439023'),
    stage: 'DISCOVERY',
    value: 25000,
    currency: 'USD',
    probability: 20,
    expected_close_date: '2024-04-30',
    actual_close_date: null,
    deal_type: 'New Business',
    products: ['Starter Package'],
    notes: 'Pilot for SMB market',
    owner: 'alice.smith',
    created_at: new Date('2024-02-05'),
    updated_at: new Date('2024-02-05'),
    activities: [],
  },
];

/**
 * Test data: Sample customers
 */
export const TEST_CUSTOMERS = [
  {
    _id: createMockObjectId('507f1f77bcf86cd799439021'),
    company_name: 'Acme Corporation',
    industry: 'Technology',
    status: 'ACTIVE',
    annual_revenue: 5000000,
    employee_count: 200,
    website: 'https://acme.example.com',
    contacts: [
      {
        _id: createMockObjectId('507f1f77bcf86cd799439031'),
        name: 'John Smith',
        email: 'john.smith@acme.example.com',
        phone: '+1-555-0100',
        role: 'CTO',
        isPrimary: true,
      },
    ],
    address: {
      street: '123 Tech Lane',
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
      postalCode: '94105',
    },
    created_at: new Date('2023-06-01'),
    updated_at: new Date('2024-01-15'),
  },
  {
    _id: createMockObjectId('507f1f77bcf86cd799439022'),
    company_name: 'Global Retail Inc',
    industry: 'Retail',
    status: 'ACTIVE',
    annual_revenue: 25000000,
    employee_count: 1500,
    website: 'https://globalretail.example.com',
    contacts: [
      {
        _id: createMockObjectId('507f1f77bcf86cd799439032'),
        name: 'Sarah Jones',
        email: 'sarah.jones@globalretail.example.com',
        phone: '+1-555-0200',
        role: 'VP of IT',
        isPrimary: true,
      },
    ],
    address: {
      street: '456 Commerce Blvd',
      city: 'Chicago',
      state: 'IL',
      country: 'USA',
      postalCode: '60601',
    },
    created_at: new Date('2023-03-15'),
    updated_at: new Date('2024-02-01'),
  },
  {
    _id: createMockObjectId('507f1f77bcf86cd799439023'),
    company_name: 'Startup Labs',
    industry: 'Technology',
    status: 'PROSPECT',
    annual_revenue: 500000,
    employee_count: 25,
    website: 'https://startuplabs.example.com',
    contacts: [],
    address: {
      street: '789 Innovation Way',
      city: 'Austin',
      state: 'TX',
      country: 'USA',
      postalCode: '78701',
    },
    created_at: new Date('2024-01-20'),
    updated_at: new Date('2024-01-20'),
  },
];

/**
 * Create mock opportunity with customer name lookup result
 */
export function createMockOpportunityWithCustomer(
  opportunity: typeof TEST_OPPORTUNITIES[0],
  customerName: string
) {
  return {
    ...opportunity,
    customer_name: customerName,
  };
}

/**
 * Create mock logger for testing
 */
export function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}
