/**
 * Unit tests for dual-realm-validator.ts
 * Tests JWT validation for both internal and customer realms
 *
 * Coverage targets: 90%+ on all metrics
 *
 * Note: Uses jest.isolateModules() to handle singleton JWKS client caching
 */

describe('dual-realm-validator', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('extractBearerToken', () => {
    it('should extract token from valid Authorization header', async () => {
      const { extractBearerToken } = await import('../dual-realm-validator');
      const token = extractBearerToken('Bearer abc123xyz');
      expect(token).toBe('abc123xyz');
    });

    it('should return null for missing header', async () => {
      const { extractBearerToken } = await import('../dual-realm-validator');
      expect(extractBearerToken(undefined)).toBeNull();
    });

    it('should return null for empty header', async () => {
      const { extractBearerToken } = await import('../dual-realm-validator');
      expect(extractBearerToken('')).toBeNull();
    });

    it('should return null for non-Bearer header', async () => {
      const { extractBearerToken } = await import('../dual-realm-validator');
      expect(extractBearerToken('Basic abc123')).toBeNull();
    });

    it('should return null for malformed Bearer header', async () => {
      const { extractBearerToken } = await import('../dual-realm-validator');
      expect(extractBearerToken('bearer abc123')).toBeNull(); // lowercase
    });

    it('should handle Bearer with no token', async () => {
      const { extractBearerToken } = await import('../dual-realm-validator');
      const token = extractBearerToken('Bearer ');
      expect(token).toBe('');
    });
  });

  describe('isCustomerRealm', () => {
    it('should return true for customer realm user', async () => {
      const { isCustomerRealm } = await import('../dual-realm-validator');
      const userContext = {
        userId: 'user-123',
        username: 'john.doe',
        roles: ['basic-customer'],
        realm: 'customer' as const,
        organizationId: 'org-123',
        organizationName: 'Acme Corp',
      };
      expect(isCustomerRealm(userContext)).toBe(true);
    });

    it('should return false for internal realm user', async () => {
      const { isCustomerRealm } = await import('../dual-realm-validator');
      const userContext = {
        userId: 'user-456',
        username: 'jane.smith',
        roles: ['support-read'],
        realm: 'internal' as const,
      };
      expect(isCustomerRealm(userContext)).toBe(false);
    });
  });

  describe('isInternalRealm', () => {
    it('should return true for internal realm user', async () => {
      const { isInternalRealm } = await import('../dual-realm-validator');
      const userContext = {
        userId: 'user-456',
        username: 'jane.smith',
        roles: ['support-read'],
        realm: 'internal' as const,
      };
      expect(isInternalRealm(userContext)).toBe(true);
    });

    it('should return false for customer realm user', async () => {
      const { isInternalRealm } = await import('../dual-realm-validator');
      const userContext = {
        userId: 'user-123',
        username: 'john.doe',
        roles: ['lead-customer'],
        realm: 'customer' as const,
        organizationId: 'org-123',
        organizationName: 'Acme Corp',
      };
      expect(isInternalRealm(userContext)).toBe(false);
    });
  });

  describe('validateDualRealmToken', () => {
    const mockInternalPayload = {
      sub: 'internal-user-id',
      preferred_username: 'alice.support',
      email: 'alice@tamshai.com',
      iss: `http://localhost:${process.env.DEV_KEYCLOAK}/realms/tamshai`,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      realm_access: {
        roles: ['support-read', 'support-write'],
      },
      resource_access: {
        'mcp-gateway': {
          roles: ['executive'],
        },
      },
    };

    const mockCustomerPayload = {
      sub: 'customer-user-id',
      preferred_username: 'bob.customer',
      email: 'bob@acme.com',
      iss: `http://localhost:${process.env.DEV_KEYCLOAK}/realms/tamshai-customers`,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      realm_access: {
        roles: ['lead-customer'],
      },
      organization_id: 'org-acme-123',
      organization_name: 'Acme Corporation',
    };

    // Helper to set up mocks and import the module
    const setupMocksAndImport = async (decodedResult: unknown) => {
      jest.doMock('jsonwebtoken', () => ({
        decode: jest.fn().mockReturnValue(decodedResult),
        verify: jest.fn().mockReturnValue(undefined),
      }));

      jest.doMock('jwks-rsa', () => {
        return jest.fn().mockImplementation(() => ({
          getSigningKey: jest.fn((kid: string, callback: (err: Error | null, key?: { getPublicKey: () => string }) => void) => {
            if (kid === 'valid-kid') {
              callback(null, { getPublicKey: () => 'mock-public-key' });
            } else if (kid === 'no-key') {
              callback(null, undefined);
            } else {
              callback(new Error('Key not found'));
            }
          }),
        }));
      });

      const validator = await import('../dual-realm-validator');
      return validator;
    };

    it('should validate internal realm token successfully', async () => {
      const { validateDualRealmToken } = await setupMocksAndImport({
        header: { kid: 'valid-kid' },
        payload: mockInternalPayload,
      });

      const result = await validateDualRealmToken('mock-internal-token');

      expect(result.userId).toBe('internal-user-id');
      expect(result.username).toBe('alice.support');
      expect(result.email).toBe('alice@tamshai.com');
      expect(result.realm).toBe('internal');
      expect(result.roles).toContain('support-read');
      expect(result.roles).toContain('support-write');
      expect(result.roles).toContain('executive');
      expect(result.organizationId).toBeUndefined();
    });

    it('should validate customer realm token successfully', async () => {
      const { validateDualRealmToken } = await setupMocksAndImport({
        header: { kid: 'valid-kid' },
        payload: mockCustomerPayload,
      });

      const result = await validateDualRealmToken('mock-customer-token');

      expect(result.userId).toBe('customer-user-id');
      expect(result.username).toBe('bob.customer');
      expect(result.email).toBe('bob@acme.com');
      expect(result.realm).toBe('customer');
      expect(result.roles).toContain('lead-customer');
      expect(result.organizationId).toBe('org-acme-123');
      expect(result.organizationName).toBe('Acme Corporation');
    });

    it('should throw error for invalid token format (null decode)', async () => {
      const { validateDualRealmToken } = await setupMocksAndImport(null);

      await expect(validateDualRealmToken('invalid-token')).rejects.toThrow(
        'Invalid token format: missing key ID'
      );
    });

    it('should throw error for string decode result', async () => {
      const { validateDualRealmToken } = await setupMocksAndImport('some-string');

      await expect(validateDualRealmToken('invalid-token')).rejects.toThrow(
        'Invalid token format: missing key ID'
      );
    });

    it('should throw error for token without kid', async () => {
      const { validateDualRealmToken } = await setupMocksAndImport({
        header: {},
        payload: mockInternalPayload,
      });

      await expect(validateDualRealmToken('no-kid-token')).rejects.toThrow(
        'Invalid token format: missing key ID'
      );
    });

    it('should throw error for token without issuer', async () => {
      const { validateDualRealmToken } = await setupMocksAndImport({
        header: { kid: 'valid-kid' },
        payload: { ...mockInternalPayload, iss: undefined },
      });

      await expect(validateDualRealmToken('no-issuer-token')).rejects.toThrow(
        'Invalid token: missing issuer claim'
      );
    });

    it('should throw error for unknown realm issuer', async () => {
      const { validateDualRealmToken } = await setupMocksAndImport({
        header: { kid: 'valid-kid' },
        payload: {
          ...mockInternalPayload,
          iss: `http://localhost:${process.env.DEV_KEYCLOAK}/realms/unknown-realm`,
        },
      });

      await expect(validateDualRealmToken('unknown-realm-token')).rejects.toThrow(
        'Invalid token: unknown issuer'
      );
    });

    it('should throw error when JWKS returns no key', async () => {
      const { validateDualRealmToken } = await setupMocksAndImport({
        header: { kid: 'no-key' },
        payload: mockInternalPayload,
      });

      await expect(validateDualRealmToken('no-signing-key-token')).rejects.toThrow(
        'No signing key found'
      );
    });

    it('should throw error when JWKS lookup fails', async () => {
      const { validateDualRealmToken } = await setupMocksAndImport({
        header: { kid: 'invalid-kid' },
        payload: mockInternalPayload,
      });

      await expect(validateDualRealmToken('invalid-kid-token')).rejects.toThrow(
        'Key not found'
      );
    });

    it('should handle token with no realm_access', async () => {
      const { validateDualRealmToken } = await setupMocksAndImport({
        header: { kid: 'valid-kid' },
        payload: { ...mockInternalPayload, realm_access: undefined },
      });

      const result = await validateDualRealmToken('no-realm-access-token');
      expect(result.roles).toContain('executive'); // From resource_access
    });

    it('should handle token with no resource_access', async () => {
      const { validateDualRealmToken } = await setupMocksAndImport({
        header: { kid: 'valid-kid' },
        payload: { ...mockInternalPayload, resource_access: undefined },
      });

      const result = await validateDualRealmToken('no-resource-access-token');
      expect(result.roles).toContain('support-read'); // From realm_access
      expect(result.roles).not.toContain('executive');
    });

    it('should not include resource_access roles for customer realm', async () => {
      const { validateDualRealmToken } = await setupMocksAndImport({
        header: { kid: 'valid-kid' },
        payload: {
          ...mockCustomerPayload,
          resource_access: { 'mcp-gateway': { roles: ['should-not-appear'] } },
        },
      });

      const result = await validateDualRealmToken('customer-with-resource-access');
      expect(result.roles).toContain('lead-customer');
      expect(result.roles).not.toContain('should-not-appear');
    });

    it('should handle customer token without organization claims', async () => {
      const { validateDualRealmToken } = await setupMocksAndImport({
        header: { kid: 'valid-kid' },
        payload: { ...mockCustomerPayload, organization_id: undefined, organization_name: undefined },
      });

      const result = await validateDualRealmToken('customer-no-org');
      expect(result.realm).toBe('customer');
      expect(result.organizationId).toBeUndefined();
      expect(result.organizationName).toBeUndefined();
    });

    it('should handle empty realm_access roles array', async () => {
      const { validateDualRealmToken } = await setupMocksAndImport({
        header: { kid: 'valid-kid' },
        payload: { ...mockInternalPayload, realm_access: { roles: [] }, resource_access: undefined },
      });

      const result = await validateDualRealmToken('empty-roles');
      expect(result.roles).toHaveLength(0);
    });
  });
});
