/**
 * GCP Authentication Utility Tests
 *
 * Tests for Cloud Run service-to-service authentication.
 */

// Mock fetch globally - must be before import
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GCP Auth Utility', () => {
  // Store module functions after dynamic import
  let getIdentityToken: typeof import('./gcp-auth').getIdentityToken;
  let getCloudRunHeaders: typeof import('./gcp-auth').getCloudRunHeaders;
  let isRunningOnGCP: typeof import('./gcp-auth').isRunningOnGCP;

  // Helper to set up GoogleAuth mock and reimport the module
  async function setupModuleWithGoogleAuth(mockGetIdTokenClient?: jest.Mock) {
    // Reset modules to get fresh module state
    jest.resetModules();

    // Set up GoogleAuth mock before importing
    jest.doMock('google-auth-library', () => ({
      GoogleAuth: jest.fn().mockImplementation(() => ({
        getIdTokenClient: mockGetIdTokenClient || jest.fn(),
      })),
    }));

    // Now import the module
    const gcpAuth = await import('./gcp-auth');
    getIdentityToken = gcpAuth.getIdentityToken;
    getCloudRunHeaders = gcpAuth.getCloudRunHeaders;
    isRunningOnGCP = gcpAuth.isRunningOnGCP;

    return gcpAuth;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('checkGCPEnvironment (internal)', () => {
    it('should return false when metadata server is not reachable', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await setupModuleWithGoogleAuth();

      const result = await isRunningOnGCP();
      expect(result).toBe(false);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://metadata.google.internal/computeMetadata/v1/project/project-id',
        expect.objectContaining({
          headers: { 'Metadata-Flavor': 'Google' },
        })
      );
    });

    it('should return true when metadata server responds with ok', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await setupModuleWithGoogleAuth();

      const result = await isRunningOnGCP();
      expect(result).toBe(true);
    });

    it('should return false when metadata server responds with non-ok status', async () => {
      mockFetch.mockResolvedValue({ ok: false });

      await setupModuleWithGoogleAuth();

      const result = await isRunningOnGCP();
      expect(result).toBe(false);
    });

    it('should cache the environment check result', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await setupModuleWithGoogleAuth();

      // First call should hit the metadata server
      await isRunningOnGCP();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cached value
      await isRunningOnGCP();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('getIdentityToken', () => {
    it('should return null when not on GCP', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await setupModuleWithGoogleAuth();

      const token = await getIdentityToken('https://my-service.run.app/api');
      expect(token).toBeNull();
    });

    it('should return token when on GCP', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const mockGetRequestHeaders = jest.fn().mockResolvedValue({
        Authorization: 'Bearer my-gcp-token-123',
      });
      const mockIdTokenClient = { getRequestHeaders: mockGetRequestHeaders };
      const mockGetIdTokenClient = jest.fn().mockResolvedValue(mockIdTokenClient);

      await setupModuleWithGoogleAuth(mockGetIdTokenClient);

      const token = await getIdentityToken('https://my-service.run.app/api/endpoint');
      expect(token).toBe('my-gcp-token-123');
      expect(mockGetIdTokenClient).toHaveBeenCalledWith('https://my-service.run.app');
    });

    it('should use lowercase authorization header if uppercase not present', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const mockGetRequestHeaders = jest.fn().mockResolvedValue({
        authorization: 'Bearer lowercase-token-456',
      });
      const mockIdTokenClient = { getRequestHeaders: mockGetRequestHeaders };
      const mockGetIdTokenClient = jest.fn().mockResolvedValue(mockIdTokenClient);

      await setupModuleWithGoogleAuth(mockGetIdTokenClient);

      const token = await getIdentityToken('https://my-service.run.app/api');
      expect(token).toBe('lowercase-token-456');
    });

    it('should return null when authorization header is missing', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const mockGetRequestHeaders = jest.fn().mockResolvedValue({});
      const mockIdTokenClient = { getRequestHeaders: mockGetRequestHeaders };
      const mockGetIdTokenClient = jest.fn().mockResolvedValue(mockIdTokenClient);

      await setupModuleWithGoogleAuth(mockGetIdTokenClient);

      const token = await getIdentityToken('https://my-service.run.app/api');
      expect(token).toBeNull();
    });

    it('should return null when authorization header does not start with Bearer', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const mockGetRequestHeaders = jest.fn().mockResolvedValue({
        Authorization: 'Basic some-basic-auth',
      });
      const mockIdTokenClient = { getRequestHeaders: mockGetRequestHeaders };
      const mockGetIdTokenClient = jest.fn().mockResolvedValue(mockIdTokenClient);

      await setupModuleWithGoogleAuth(mockGetIdTokenClient);

      const token = await getIdentityToken('https://my-service.run.app/api');
      expect(token).toBeNull();
    });

    it('should cache the ID token client per audience', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const mockGetRequestHeaders = jest.fn().mockResolvedValue({
        Authorization: 'Bearer cached-token',
      });
      const mockIdTokenClient = { getRequestHeaders: mockGetRequestHeaders };
      const mockGetIdTokenClient = jest.fn().mockResolvedValue(mockIdTokenClient);

      await setupModuleWithGoogleAuth(mockGetIdTokenClient);

      // First call creates the client
      await getIdentityToken('https://service-a.run.app/api');
      expect(mockGetIdTokenClient).toHaveBeenCalledTimes(1);

      // Second call to same audience uses cached client
      await getIdentityToken('https://service-a.run.app/other');
      expect(mockGetIdTokenClient).toHaveBeenCalledTimes(1);

      // Call to different audience creates new client
      await getIdentityToken('https://service-b.run.app/api');
      expect(mockGetIdTokenClient).toHaveBeenCalledTimes(2);
    });

    it('should return null and log error when token fetch fails', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const mockGetIdTokenClient = jest.fn().mockRejectedValue(new Error('Auth failed'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await setupModuleWithGoogleAuth(mockGetIdTokenClient);

      const token = await getIdentityToken('https://my-service.run.app/api');
      expect(token).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to get GCP identity token:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should reuse authInstance after first creation', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const mockGetRequestHeaders = jest.fn().mockResolvedValue({
        Authorization: 'Bearer token',
      });
      const mockIdTokenClient = { getRequestHeaders: mockGetRequestHeaders };
      const mockGetIdTokenClient = jest.fn().mockResolvedValue(mockIdTokenClient);

      // Reset and set up fresh mock
      jest.resetModules();
      const GoogleAuthMock = jest.fn().mockImplementation(() => ({
        getIdTokenClient: mockGetIdTokenClient,
      }));
      jest.doMock('google-auth-library', () => ({
        GoogleAuth: GoogleAuthMock,
      }));

      const gcpAuth = await import('./gcp-auth');
      getIdentityToken = gcpAuth.getIdentityToken;

      // First call - creates GoogleAuth
      await getIdentityToken('https://service-a.run.app/api');
      expect(GoogleAuthMock).toHaveBeenCalledTimes(1);

      // Second call to new audience - should reuse GoogleAuth instance
      await getIdentityToken('https://service-b.run.app/api');
      expect(GoogleAuthMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCloudRunHeaders', () => {
    it('should return only additional headers when not on GCP', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await setupModuleWithGoogleAuth();

      const headers = await getCloudRunHeaders('https://my-service.run.app', {
        'Content-Type': 'application/json',
      });

      expect(headers).toEqual({
        'Content-Type': 'application/json',
      });
      expect(headers['Authorization']).toBeUndefined();
    });

    it('should include Authorization header when on GCP', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const mockGetRequestHeaders = jest.fn().mockResolvedValue({
        Authorization: 'Bearer gcp-token',
      });
      const mockIdTokenClient = { getRequestHeaders: mockGetRequestHeaders };
      const mockGetIdTokenClient = jest.fn().mockResolvedValue(mockIdTokenClient);

      await setupModuleWithGoogleAuth(mockGetIdTokenClient);

      const headers = await getCloudRunHeaders('https://my-service.run.app', {
        'Content-Type': 'application/json',
      });

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer gcp-token',
      });
    });

    it('should work with empty additional headers', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await setupModuleWithGoogleAuth();

      const headers = await getCloudRunHeaders('https://my-service.run.app');
      expect(headers).toEqual({});
    });

    it('should not include Authorization when token is null (GCP but no token)', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const mockGetRequestHeaders = jest.fn().mockResolvedValue({});
      const mockIdTokenClient = { getRequestHeaders: mockGetRequestHeaders };
      const mockGetIdTokenClient = jest.fn().mockResolvedValue(mockIdTokenClient);

      await setupModuleWithGoogleAuth(mockGetIdTokenClient);

      const headers = await getCloudRunHeaders('https://my-service.run.app', {
        'X-Custom': 'value',
      });

      expect(headers).toEqual({
        'X-Custom': 'value',
      });
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('isRunningOnGCP', () => {
    it('should return true when on GCP', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await setupModuleWithGoogleAuth();

      const result = await isRunningOnGCP();
      expect(result).toBe(true);
    });

    it('should return false when not on GCP', async () => {
      mockFetch.mockRejectedValue(new Error('Not on GCP'));

      await setupModuleWithGoogleAuth();

      const result = await isRunningOnGCP();
      expect(result).toBe(false);
    });
  });
});
