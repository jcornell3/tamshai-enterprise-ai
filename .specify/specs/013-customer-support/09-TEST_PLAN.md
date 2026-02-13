# Customer Support Portal - Test Plan

## 1. Overview

This test plan follows TDD (Test-Driven Development) methodology with RED-GREEN-REFACTOR cycle. Tests are written BEFORE implementation.

## 2. Test Categories

| Category | Location | Framework |
|----------|----------|-----------|
| MCP Unit Tests | `services/mcp-support/src/__tests__/` | Jest |
| Web App Unit Tests | `clients/web/apps/customer-support/src/__tests__/` | Vitest |
| Integration Tests | `tests/integration/customer-portal/` | Jest |
| E2E Tests | `tests/e2e/specs/customer-portal/` | Playwright |

## 3. MCP Support Unit Tests

### 3.1 Customer Authorization Tests

**File**: `services/mcp-support/src/__tests__/customer-authorization.test.ts`

```typescript
describe('Customer Authorization', () => {
  describe('isCustomerUser', () => {
    it('should return true for lead-customer role', () => {
      const roles = ['lead-customer'];
      expect(isCustomerUser(roles)).toBe(true);
    });

    it('should return true for basic-customer role', () => {
      const roles = ['basic-customer'];
      expect(isCustomerUser(roles)).toBe(true);
    });

    it('should return false for internal roles', () => {
      const roles = ['support-read', 'support-write'];
      expect(isCustomerUser(roles)).toBe(false);
    });
  });

  describe('isLeadCustomer', () => {
    it('should return true only for lead-customer role', () => {
      expect(isLeadCustomer(['lead-customer'])).toBe(true);
      expect(isLeadCustomer(['basic-customer'])).toBe(false);
    });
  });

  describe('canAccessTicket', () => {
    const orgTicket = {
      organization_id: 'org-001',
      contact_id: 'contact-002',
      visibility: 'organization'
    };

    const privateTicket = {
      organization_id: 'org-001',
      contact_id: 'contact-001',
      visibility: 'private'
    };

    it('lead customer should access org tickets', () => {
      const userContext = {
        realm: 'customer',
        roles: ['lead-customer'],
        organizationId: 'org-001',
        userId: 'contact-001'
      };
      expect(canAccessTicket(orgTicket, userContext)).toBe(true);
    });

    it('lead customer should NOT access private tickets of others', () => {
      const userContext = {
        realm: 'customer',
        roles: ['lead-customer'],
        organizationId: 'org-001',
        userId: 'contact-001'
      };
      expect(canAccessTicket(privateTicket, userContext)).toBe(false);
    });

    it('basic customer should only access own tickets', () => {
      const userContext = {
        realm: 'customer',
        roles: ['basic-customer'],
        organizationId: 'org-001',
        userId: 'contact-002'
      };
      expect(canAccessTicket(orgTicket, userContext)).toBe(true);
    });

    it('basic customer should NOT access others tickets', () => {
      const userContext = {
        realm: 'customer',
        roles: ['basic-customer'],
        organizationId: 'org-001',
        userId: 'contact-003'
      };
      expect(canAccessTicket(orgTicket, userContext)).toBe(false);
    });

    it('customer should NOT access other org tickets', () => {
      const userContext = {
        realm: 'customer',
        roles: ['lead-customer'],
        organizationId: 'org-002',
        userId: 'contact-other'
      };
      expect(canAccessTicket(orgTicket, userContext)).toBe(false);
    });
  });
});
```

### 3.2 Customer Ticket Tools Tests

**File**: `services/mcp-support/src/__tests__/customer-tickets.test.ts`

```typescript
describe('customer_list_tickets', () => {
  const mockDb = createMockDb();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return only own tickets for basic customer', async () => {
    const userContext = {
      realm: 'customer',
      roles: ['basic-customer'],
      organizationId: 'org-001',
      userId: 'contact-001'
    };

    mockDb.tickets.find.mockReturnValue({
      project: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      toArray: jest.fn().mockResolvedValue([
        { ticket_id: 'TKT-001', contact_id: 'contact-001' }
      ])
    });

    const result = await customerListTickets({}, userContext);

    expect(result.status).toBe('success');
    expect(mockDb.tickets.find).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-001',
        contact_id: 'contact-001'
      })
    );
  });

  it('should return org tickets for lead customer', async () => {
    const userContext = {
      realm: 'customer',
      roles: ['lead-customer'],
      organizationId: 'org-001',
      userId: 'contact-001'
    };

    const result = await customerListTickets({}, userContext);

    expect(result.status).toBe('success');
    expect(mockDb.tickets.find).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-001',
        $or: expect.arrayContaining([
          { visibility: 'organization' },
          { contact_id: 'contact-001' }
        ])
      })
    );
  });

  it('should NEVER return internal_notes in projection', async () => {
    const userContext = {
      realm: 'customer',
      roles: ['lead-customer'],
      organizationId: 'org-001',
      userId: 'contact-001'
    };

    await customerListTickets({}, userContext);

    expect(mockDb.tickets.find().project).toHaveBeenCalledWith(
      expect.objectContaining({ internal_notes: 0 })
    );
  });

  it('should reject non-customer users', async () => {
    const userContext = {
      realm: 'internal',
      roles: ['support-read'],
      userId: 'emp-001'
    };

    const result = await customerListTickets({}, userContext);

    expect(result.status).toBe('error');
    expect(result.code).toBe('INVALID_REALM');
  });
});

describe('customer_submit_ticket', () => {
  it('should create ticket with organization_id from JWT', async () => {
    const userContext = {
      realm: 'customer',
      roles: ['basic-customer'],
      organizationId: 'org-001',
      userId: 'contact-001'
    };

    const input = {
      subject: 'Test ticket',
      description: 'Test description for the ticket',
      priority: 'medium'
    };

    const result = await customerSubmitTicket(input, userContext);

    expect(result.status).toBe('success');
    expect(mockDb.tickets.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-001',
        contact_id: expect.any(String),
        source: 'customer_portal'
      })
    );
  });

  it('should enforce monthly ticket limit', async () => {
    mockDb.organizations.findOne.mockResolvedValue({
      settings: { max_tickets_per_month: 10 }
    });
    mockDb.tickets.countDocuments.mockResolvedValue(10);

    const result = await customerSubmitTicket({
      subject: 'Test',
      description: 'Test description'
    }, userContext);

    expect(result.status).toBe('error');
    expect(result.code).toBe('TICKET_LIMIT_REACHED');
  });

  it('should ignore visibility for basic customer', async () => {
    const userContext = {
      realm: 'customer',
      roles: ['basic-customer'],
      organizationId: 'org-001',
      userId: 'contact-001'
    };

    const input = {
      subject: 'Test',
      description: 'Test description',
      visibility: 'private'  // Basic customer trying to set private
    };

    const result = await customerSubmitTicket(input, userContext);

    expect(result.status).toBe('success');
    expect(mockDb.tickets.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: 'organization'  // Should be overridden
      })
    );
  });
});
```

### 3.3 Lead Transfer Tests

**File**: `services/mcp-support/src/__tests__/lead-transfer.test.ts`

```typescript
describe('customer_transfer_lead', () => {
  it('should return pending_confirmation with correct message', async () => {
    const userContext = {
      realm: 'customer',
      roles: ['lead-customer'],
      organizationId: 'org-001',
      userId: 'contact-001'
    };

    const input = {
      new_lead_contact_id: 'contact-002',
      reason: 'Changing primary contact'
    };

    const result = await customerTransferLead(input, userContext);

    expect(result.status).toBe('pending_confirmation');
    expect(result.confirmationId).toBeDefined();
    expect(result.message).toContain('Transfer Lead Customer role');
    expect(result.confirmationData.action).toBe('transfer_lead');
  });

  it('should reject non-lead customers', async () => {
    const userContext = {
      realm: 'customer',
      roles: ['basic-customer'],
      organizationId: 'org-001',
      userId: 'contact-001'
    };

    const result = await customerTransferLead({
      new_lead_contact_id: 'contact-002'
    }, userContext);

    expect(result.status).toBe('error');
    expect(result.code).toBe('LEAD_REQUIRED');
  });

  it('should reject transfer to contact in different org', async () => {
    mockDb.contacts.findOne
      .mockResolvedValueOnce({ organization_id: 'org-001' })  // from contact
      .mockResolvedValueOnce({ organization_id: 'org-002' }); // to contact

    const result = await customerTransferLead({
      new_lead_contact_id: 'contact-other'
    }, userContext);

    expect(result.status).toBe('error');
    expect(result.code).toBe('INVALID_CONTACT');
  });

  it('should reject transfer to inactive contact', async () => {
    mockDb.contacts.findOne.mockResolvedValue({
      organization_id: 'org-001',
      status: 'disabled'
    });

    const result = await customerTransferLead({
      new_lead_contact_id: 'contact-002'
    }, userContext);

    expect(result.status).toBe('error');
    expect(result.code).toBe('CONTACT_NOT_ACTIVE');
  });
});

describe('executeLeadTransfer', () => {
  it('should update both contacts and Keycloak', async () => {
    const pendingTransfer = {
      action: 'transfer_lead',
      from_contact_id: 'contact-001',
      to_contact_id: 'contact-002',
      organization_id: 'org-001'
    };

    await executeLeadTransfer(pendingTransfer);

    // Verify old lead updated
    expect(mockDb.contacts.updateOne).toHaveBeenCalledWith(
      { _id: 'contact-001' },
      expect.objectContaining({
        $set: expect.objectContaining({
          role: 'basic',
          is_lead_contact: false
        })
      })
    );

    // Verify new lead updated
    expect(mockDb.contacts.updateOne).toHaveBeenCalledWith(
      { _id: 'contact-002' },
      expect.objectContaining({
        $set: expect.objectContaining({
          role: 'lead',
          is_lead_contact: true
        })
      })
    );

    // Verify audit log
    expect(mockDb.audit_log.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'lead_transfer',
        status: 'success'
      })
    );
  });
});
```

### 3.4 Dual-Realm Validator Tests

**File**: `services/mcp-support/src/__tests__/dual-realm-validator.test.ts`

```typescript
describe('DualRealmValidator', () => {
  describe('validateToken', () => {
    it('should validate internal realm token', async () => {
      const internalToken = createMockToken({
        iss: 'http://keycloak:8080/realms/tamshai',
        sub: 'emp-001',
        realm_access: { roles: ['support-read'] }
      });

      const result = await validateToken(internalToken);

      expect(result.realm).toBe('internal');
      expect(result.roles).toContain('support-read');
    });

    it('should validate customer realm token', async () => {
      const customerToken = createMockToken({
        iss: 'http://keycloak:8080/realms/tamshai-customers',
        sub: 'cust-001',
        organization_id: 'org-001',
        realm_access: { roles: ['lead-customer'] }
      });

      const result = await validateToken(customerToken);

      expect(result.realm).toBe('customer');
      expect(result.organizationId).toBe('org-001');
      expect(result.roles).toContain('lead-customer');
    });

    it('should try internal realm first, then customer', async () => {
      const mockVerifyInternal = jest.fn().mockRejectedValue(new Error('Invalid'));
      const mockVerifyCustomer = jest.fn().mockResolvedValue(customerPayload);

      const result = await validateToken(token);

      expect(mockVerifyInternal).toHaveBeenCalledBefore(mockVerifyCustomer);
    });

    it('should reject token from unknown realm', async () => {
      const unknownToken = createMockToken({
        iss: 'http://unknown-realm/auth'
      });

      await expect(validateToken(unknownToken)).rejects.toThrow(
        'Invalid token: not valid for any realm'
      );
    });
  });
});
```

## 4. Web App Unit Tests

### 4.1 Dashboard Page Tests

**File**: `clients/web/apps/customer-support/src/__tests__/DashboardPage.test.tsx`

```typescript
describe('DashboardPage', () => {
  describe('Lead Customer View', () => {
    it('should display organization-wide metrics', async () => {
      mockUseAuth.mockReturnValue({
        userContext: {
          roles: ['lead-customer'],
          organizationId: 'org-001'
        }
      });

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Organization')).toBeInTheDocument();
        expect(screen.getByText('Open Tickets')).toBeInTheDocument();
      });
    });

    it('should show recent org tickets', async () => {
      mockUseAuth.mockReturnValue({
        userContext: { roles: ['lead-customer'] }
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tickets: [
            { ticket_id: 'TKT-001', created_by: { name: 'Jane' } },
            { ticket_id: 'TKT-002', created_by: { name: 'Bob' } }
          ]
        })
      });

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('TKT-001')).toBeInTheDocument();
        expect(screen.getByText('TKT-002')).toBeInTheDocument();
      });
    });
  });

  describe('Basic Customer View', () => {
    it('should only show personal metrics', async () => {
      mockUseAuth.mockReturnValue({
        userContext: {
          roles: ['basic-customer'],
          organizationId: 'org-001'
        }
      });

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Your Tickets')).toBeInTheDocument();
        expect(screen.queryByText('Organization')).not.toBeInTheDocument();
      });
    });
  });
});
```

### 4.2 Tickets Page Tests

**File**: `clients/web/apps/customer-support/src/__tests__/TicketsPage.test.tsx`

```typescript
describe('TicketsPage', () => {
  it('should render ticket list', async () => {
    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByText('Support Tickets')).toBeInTheDocument();
    });
  });

  it('should filter tickets by status', async () => {
    render(<TicketsPage />);

    fireEvent.click(screen.getByRole('tab', { name: 'Open' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=open'),
        expect.any(Object)
      );
    });
  });

  it('should show New Ticket button', () => {
    render(<TicketsPage />);
    expect(screen.getByRole('button', { name: /New Ticket/i })).toBeInTheDocument();
  });
});
```

### 4.3 Contacts Page Tests (Lead Only)

**File**: `clients/web/apps/customer-support/src/__tests__/ContactsPage.test.tsx`

```typescript
describe('ContactsPage', () => {
  it('should only be accessible to lead customers', async () => {
    mockUseAuth.mockReturnValue({
      userContext: { roles: ['basic-customer'] }
    });

    render(<ContactsPage />);

    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
  });

  it('should render contact list for lead customer', async () => {
    mockUseAuth.mockReturnValue({
      userContext: { roles: ['lead-customer'] }
    });

    render(<ContactsPage />);

    await waitFor(() => {
      expect(screen.getByText('Organization Contacts')).toBeInTheDocument();
    });
  });

  it('should show transfer lead button', async () => {
    mockUseAuth.mockReturnValue({
      userContext: { roles: ['lead-customer'] }
    });

    render(<ContactsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /transfer lead/i })).toBeInTheDocument();
    });
  });
});
```

## 5. Integration Tests

### 5.1 Customer Portal Auth Tests

**File**: `tests/integration/customer-portal/auth.test.ts`

```typescript
describe('Customer Portal Authentication', () => {
  it('should authenticate with customer realm', async () => {
    const token = await getCustomerToken('jane.smith@acme.com', 'password');

    expect(token).toBeDefined();

    const decoded = decodeJwt(token);
    expect(decoded.iss).toContain('tamshai-customers');
    expect(decoded.organization_id).toBe('org-acme-001');
  });

  it('should include organization_id in JWT claims', async () => {
    const token = await getCustomerToken('jane.smith@acme.com', 'password');
    const decoded = decodeJwt(token);

    expect(decoded.organization_id).toBeDefined();
    expect(decoded.organization_name).toBe('Acme Corporation');
  });

  it('should reject internal realm token for customer endpoints', async () => {
    const internalToken = await getInternalToken('alice.chen', 'password');

    const response = await fetch(`${API_URL}/customer/tickets`, {
      headers: { Authorization: `Bearer ${internalToken}` }
    });

    expect(response.status).toBe(403);
  });
});
```

### 5.2 Lead Transfer E2E Tests

**File**: `tests/integration/customer-portal/lead-transfer.test.ts`

```typescript
describe('Lead Transfer Workflow', () => {
  let leadToken: string;
  let basicToken: string;

  beforeAll(async () => {
    leadToken = await getCustomerToken('jane.smith@acme.com', 'password');
    basicToken = await getCustomerToken('bob.developer@acme.com', 'password');
  });

  it('should return pending_confirmation on transfer initiation', async () => {
    const response = await fetch(`${API_URL}/customer/contacts/transfer-lead`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${leadToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        new_lead_contact_id: 'contact-bob-001'
      })
    });

    const result = await response.json();

    expect(response.status).toBe(202);
    expect(result.status).toBe('pending_confirmation');
    expect(result.confirmationId).toBeDefined();
  });

  it('should execute transfer on confirmation', async () => {
    // Initiate transfer
    const initiateResponse = await fetch(`${API_URL}/customer/contacts/transfer-lead`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${leadToken}` },
      body: JSON.stringify({ new_lead_contact_id: 'contact-bob-001' })
    });

    const { confirmationId } = await initiateResponse.json();

    // Confirm transfer
    const confirmResponse = await fetch(`${API_URL}/confirm/${confirmationId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${leadToken}` },
      body: JSON.stringify({ approved: true })
    });

    expect(confirmResponse.status).toBe(200);

    // Verify roles changed
    const janeToken = await getCustomerToken('jane.smith@acme.com', 'password');
    const janeDecoded = decodeJwt(janeToken);
    expect(janeDecoded.realm_access.roles).toContain('basic-customer');
    expect(janeDecoded.realm_access.roles).not.toContain('lead-customer');
  });

  it('should expire confirmation after 5 minutes', async () => {
    // Initiate transfer
    const { confirmationId } = await initiateTransfer(leadToken);

    // Wait 5+ minutes
    await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000 + 1000));

    // Try to confirm
    const response = await fetch(`${API_URL}/confirm/${confirmationId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${leadToken}` },
      body: JSON.stringify({ approved: true })
    });

    expect(response.status).toBe(404);
  }, 6 * 60 * 1000);
});
```

## 6. E2E Tests (Playwright)

### 6.1 Customer Login Journey

**File**: `tests/e2e/specs/customer-portal/login.spec.ts`

```typescript
test.describe('Customer Portal Login', () => {
  test('should complete login flow with customer credentials', async ({ page }) => {
    await page.goto('http://localhost:4006');

    // Should redirect to Keycloak
    await expect(page).toHaveURL(/.*keycloak.*tamshai-customers.*/);

    // Enter credentials
    await page.fill('#username', 'jane.smith@acme.com');
    await page.fill('#password', 'AcmeLead123!');
    await page.click('#kc-login');

    // Should redirect back to portal
    await expect(page).toHaveURL('http://localhost:4006/dashboard');
    await expect(page.locator('text=Welcome, Jane')).toBeVisible();
  });

  test('should show organization name in header', async ({ page }) => {
    await loginAsCustomer(page, 'jane.smith@acme.com');

    await expect(page.locator('text=Acme Corporation')).toBeVisible();
  });
});
```

### 6.2 Ticket Submission Journey

**File**: `tests/e2e/specs/customer-portal/tickets.spec.ts`

```typescript
test.describe('Ticket Submission', () => {
  test('should complete new ticket wizard', async ({ page }) => {
    await loginAsCustomer(page, 'jane.smith@acme.com');

    // Start new ticket
    await page.click('text=New Ticket');

    // Step 1: Category
    await page.click('text=Technical Issues');
    await page.click('text=Next Step');

    // Step 2: Details
    await page.fill('[name="subject"]', 'Test ticket from E2E');
    await page.fill('[name="description"]', 'This is a test ticket description');
    await page.click('text=High');
    await page.click('text=Next Step');

    // Step 3: Review
    await expect(page.locator('text=Test ticket from E2E')).toBeVisible();
    await page.click('text=Submit Ticket');

    // Success
    await expect(page.locator('text=Ticket created successfully')).toBeVisible();
    await expect(page.locator('text=TKT-')).toBeVisible();
  });
});
```

## 7. Coverage Requirements

| Category | Target | Blocking |
|----------|--------|----------|
| New code (diff coverage) | 90% | Yes |
| MCP customer tools | 85% | Yes |
| Web app pages | 80% | Yes |
| Integration tests | Core flows | Yes |
| E2E tests | Happy path | No |

## 8. Test Data Requirements

See `infrastructure/database/sample-data/support-customers.js` for:

- 3 Organizations (Acme, Globex, Initech)
- 6 Contacts (2 per org)
- 15+ Tickets with various states
- KB articles (public)
