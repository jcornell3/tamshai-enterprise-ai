/**
 * Unit tests for JWT Validator Service
 *
 * Target: 95%+ coverage
 */

import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { JWTValidator, JWTValidatorConfig } from './jwt-validator';
import { createMockLogger } from '../test-utils/mock-logger';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('jwks-rsa');

describe('JWTValidator', () => {
  let validator: JWTValidator;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let mockJwksClient: jest.Mocked<jwksRsa.JwksClient>;
  let config: JWTValidatorConfig;

  beforeEach(() => {
    mockLogger = createMockLogger();

    // Mock JWKS client
    mockJwksClient = {
      getSigningKey: jest.fn(),
    } as unknown as jest.Mocked<jwksRsa.JwksClient>;

    (jwksRsa as unknown as jest.Mock).mockReturnValue(mockJwksClient);

    config = {
      jwksUri: 'http://localhost:8180/realms/tamshai/protocol/openid-connect/certs',
      issuer: 'http://localhost:8180/realms/tamshai',
      clientId: 'mcp-gateway',
    };

    validator = new JWTValidator(config, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default RS256 algorithm', () => {
      expect(jwksRsa).toHaveBeenCalledWith({
        jwksUri: config.jwksUri,
        cache: true,
        rateLimit: true,
      });
    });

    it('should allow custom algorithms', () => {
      const customConfig = {
        ...config,
        algorithms: ['RS384' as jwt.Algorithm],
      };
      new JWTValidator(customConfig, mockLogger);

      expect(jwksRsa).toHaveBeenCalledWith({
        jwksUri: config.jwksUri,
        cache: true,
        rateLimit: true,
      });
    });
  });

  describe('validateToken', () => {
    const mockToken = 'valid.jwt.token';
    const mockPublicKey = '-----BEGIN PUBLIC KEY-----\nMOCK_KEY\n-----END PUBLIC KEY-----';

    it('should successfully validate token with all claims', async () => {
      // Mock JWKS response
      mockJwksClient.getSigningKey.mockImplementation((kid, callback) => {
        callback(null, {
          getPublicKey: () => mockPublicKey,
        } as jwksRsa.SigningKey);
      });

      // Mock JWT verification
      const mockPayload: jwt.JwtPayload = {
        sub: 'user-123',
        preferred_username: 'alice.chen',
        email: 'alice@tamshai.com',
        name: 'Alice Chen',
        given_name: 'Alice',
        family_name: 'Chen',
        azp: 'mcp-gateway',
        realm_access: {
          roles: ['hr-read', 'hr-write'],
        },
        groups: ['/tamshai/hr'],
      };

      (jwt.verify as jest.Mock).mockImplementation((token, getKey, options, callback) => {
        callback(null, mockPayload);
      });

      const result = await validator.validateToken(mockToken);

      expect(result).toEqual({
        userId: 'user-123',
        username: 'alice.chen',
        email: 'alice@tamshai.com',
        roles: ['hr-read', 'hr-write'],
        groups: ['/tamshai/hr'],
      });

      expect(mockLogger.debug).toHaveBeenCalledWith('JWT claims:', expect.objectContaining({
        sub: 'user-123',
        preferred_username: 'alice.chen',
        email: 'alice@tamshai.com',
      }));
    });

    it('should handle missing preferred_username with name fallback', async () => {
      mockJwksClient.getSigningKey.mockImplementation((kid, callback) => {
        callback(null, {
          getPublicKey: () => mockPublicKey,
        } as jwksRsa.SigningKey);
      });

      const mockPayload: jwt.JwtPayload = {
        sub: 'user-456',
        name: 'Bob Martinez',
        email: 'bob@tamshai.com',
        realm_access: { roles: ['finance-read'] },
        groups: [],
      };

      (jwt.verify as jest.Mock).mockImplementation((token, getKey, options, callback) => {
        callback(null, mockPayload);
      });

      const result = await validator.validateToken(mockToken);

      expect(result.username).toBe('Bob Martinez');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'JWT missing preferred_username claim - Keycloak protocol mapper may be misconfigured',
        expect.objectContaining({
          hasSub: true,
          hasName: true,
          usedFallback: 'Bob Martinez',
        })
      );
    });

    it('should handle missing preferred_username with given_name fallback', async () => {
      mockJwksClient.getSigningKey.mockImplementation((kid, callback) => {
        callback(null, {
          getPublicKey: () => mockPublicKey,
        } as jwksRsa.SigningKey);
      });

      const mockPayload: jwt.JwtPayload = {
        sub: 'user-789',
        given_name: 'Carol',
        email: 'carol@tamshai.com',
        realm_access: { roles: ['sales-read'] },
        groups: [],
      };

      (jwt.verify as jest.Mock).mockImplementation((token, getKey, options, callback) => {
        callback(null, mockPayload);
      });

      const result = await validator.validateToken(mockToken);

      expect(result.username).toBe('Carol');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'JWT missing preferred_username claim - Keycloak protocol mapper may be misconfigured',
        expect.anything()
      );
    });

    it('should handle missing preferred_username with sub fallback', async () => {
      mockJwksClient.getSigningKey.mockImplementation((kid, callback) => {
        callback(null, {
          getPublicKey: () => mockPublicKey,
        } as jwksRsa.SigningKey);
      });

      const mockPayload: jwt.JwtPayload = {
        sub: '12345678-1234-1234-1234-123456789012',
        email: 'user@tamshai.com',
        realm_access: { roles: ['user'] },
        groups: [],
      };

      (jwt.verify as jest.Mock).mockImplementation((token, getKey, options, callback) => {
        callback(null, mockPayload);
      });

      const result = await validator.validateToken(mockToken);

      expect(result.username).toBe('user-12345678');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle missing email claim', async () => {
      mockJwksClient.getSigningKey.mockImplementation((kid, callback) => {
        callback(null, {
          getPublicKey: () => mockPublicKey,
        } as jwksRsa.SigningKey);
      });

      const mockPayload: jwt.JwtPayload = {
        sub: 'user-999',
        preferred_username: 'testuser',
        realm_access: { roles: ['intern'] },
        groups: [],
      };

      (jwt.verify as jest.Mock).mockImplementation((token, getKey, options, callback) => {
        callback(null, mockPayload);
      });

      const result = await validator.validateToken(mockToken);

      expect(result.email).toBe('');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'JWT missing email claim - user identity queries may fail',
        expect.objectContaining({
          userId: 'user-999',
          username: 'testuser',
        })
      );
    });

    it('should extract empty roles when realm_access is missing', async () => {
      mockJwksClient.getSigningKey.mockImplementation((kid, callback) => {
        callback(null, {
          getPublicKey: () => mockPublicKey,
        } as jwksRsa.SigningKey);
      });

      const mockPayload: jwt.JwtPayload = {
        sub: 'user-000',
        preferred_username: 'newuser',
        email: 'new@tamshai.com',
        groups: [],
      };

      (jwt.verify as jest.Mock).mockImplementation((token, getKey, options, callback) => {
        callback(null, mockPayload);
      });

      const result = await validator.validateToken(mockToken);

      expect(result.roles).toEqual([]);
    });

    it('should reject token with invalid signature', async () => {
      mockJwksClient.getSigningKey.mockImplementation((kid, callback) => {
        callback(null, {
          getPublicKey: () => mockPublicKey,
        } as jwksRsa.SigningKey);
      });

      const mockError = new Error('invalid signature');
      (jwt.verify as jest.Mock).mockImplementation((token, getKey, options, callback) => {
        callback(mockError);
      });

      await expect(validator.validateToken(mockToken)).rejects.toThrow('invalid signature');
    });

    it('should reject token when JWKS key not found', async () => {
      mockJwksClient.getSigningKey.mockImplementation((kid, callback) => {
        callback(new Error('Unable to find a signing key'), null as unknown as jwksRsa.SigningKey);
      });

      (jwt.verify as jest.Mock).mockImplementation((token, getKey, options, callback) => {
        // Trigger getSigningKey call
        const mockHeader: jwt.JwtHeader = { kid: 'unknown-key', alg: 'RS256' };
        (getKey as (header: jwt.JwtHeader, cb: jwt.SigningKeyCallback) => void)(
          mockHeader,
          (err) => {
            if (err) {
              callback(err);
            }
          }
        );
      });

      await expect(validator.validateToken(mockToken)).rejects.toThrow('Unable to find a signing key');
    });

    it('should reject token when signing key is undefined', async () => {
      mockJwksClient.getSigningKey.mockImplementation((kid, callback) => {
        callback(null, {
          getPublicKey: () => undefined as unknown as string,
        } as jwksRsa.SigningKey);
      });

      (jwt.verify as jest.Mock).mockImplementation((token, getKey, options, callback) => {
        const mockHeader: jwt.JwtHeader = { kid: 'test-key', alg: 'RS256' };
        (getKey as (header: jwt.JwtHeader, cb: jwt.SigningKeyCallback) => void)(
          mockHeader,
          (err) => {
            if (err) {
              callback(err);
            }
          }
        );
      });

      await expect(validator.validateToken(mockToken)).rejects.toThrow('No signing key found');
    });

    it('should use configured algorithms for verification', async () => {
      const customConfig = {
        ...config,
        algorithms: ['RS384' as jwt.Algorithm],
      };
      validator = new JWTValidator(customConfig, mockLogger);

      mockJwksClient.getSigningKey.mockImplementation((kid, callback) => {
        callback(null, {
          getPublicKey: () => mockPublicKey,
        } as jwksRsa.SigningKey);
      });

      const mockPayload: jwt.JwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        email: 'test@example.com',
        realm_access: { roles: [] },
        groups: [],
      };

      (jwt.verify as jest.Mock).mockImplementation((token, getKey, options, callback) => {
        expect(options.algorithms).toEqual(['RS384']);
        callback(null, mockPayload);
      });

      await validator.validateToken(mockToken);
    });

    it('should verify token with correct issuer and audience', async () => {
      mockJwksClient.getSigningKey.mockImplementation((kid, callback) => {
        callback(null, {
          getPublicKey: () => mockPublicKey,
        } as jwksRsa.SigningKey);
      });

      const mockPayload: jwt.JwtPayload = {
        sub: 'user-123',
        preferred_username: 'testuser',
        email: 'test@example.com',
        realm_access: { roles: [] },
        groups: [],
      };

      (jwt.verify as jest.Mock).mockImplementation((token, getKey, options, callback) => {
        expect(options.issuer).toBe('http://localhost:8180/realms/tamshai');
        expect(options.audience).toEqual(['mcp-gateway', 'account']);
        callback(null, mockPayload);
      });

      await validator.validateToken(mockToken);
    });
  });
});
