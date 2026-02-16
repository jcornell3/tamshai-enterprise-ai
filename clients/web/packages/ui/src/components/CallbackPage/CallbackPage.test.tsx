/**
 * CallbackPage Component Tests
 *
 * Tests both simple and error-dialog variants of the shared OIDC callback handler.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { CallbackPage } from './CallbackPage';

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock @tamshai/auth
const mockAuth = {
  isAuthenticated: false,
  isLoading: true,
  error: null as Error | null,
};
jest.mock('@tamshai/auth', () => ({
  useAuth: () => mockAuth,
}));

describe('CallbackPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.isAuthenticated = false;
    mockAuth.isLoading = true;
    mockAuth.error = null;
  });

  describe('loading state', () => {
    it('shows default loading message while authenticating', () => {
      render(<CallbackPage />);
      expect(screen.getByText('Completing sign in...')).toBeTruthy();
    });

    it('shows custom loading message', () => {
      render(<CallbackPage loadingMessage="Completing authentication..." />);
      expect(screen.getByText('Completing authentication...')).toBeTruthy();
    });

    it('does not navigate while loading', () => {
      render(<CallbackPage />);
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('successful authentication', () => {
    beforeEach(() => {
      mockAuth.isLoading = false;
      mockAuth.isAuthenticated = true;
    });

    it('navigates to default path on success', () => {
      render(<CallbackPage />);
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: false });
    });

    it('navigates to custom redirect path', () => {
      render(<CallbackPage redirectPath="/dashboard" />);
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: false });
    });

    it('uses replace navigation when configured', () => {
      render(<CallbackPage replaceNavigation />);
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  describe('error handling - simple mode (default)', () => {
    beforeEach(() => {
      mockAuth.isLoading = false;
      mockAuth.isAuthenticated = false;
      mockAuth.error = new Error('Auth failed');
    });

    it('logs error to console', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      render(<CallbackPage />);
      expect(consoleSpy).toHaveBeenCalledWith('Authentication error:', mockAuth.error);
      consoleSpy.mockRestore();
    });

    it('does not show error dialog', () => {
      render(<CallbackPage />);
      expect(screen.queryByText('Authentication Failed')).toBeNull();
    });

    it('still shows loading spinner', () => {
      render(<CallbackPage />);
      expect(screen.getByText('Completing sign in...')).toBeTruthy();
    });
  });

  describe('error handling - error dialog mode', () => {
    beforeEach(() => {
      mockAuth.isLoading = false;
      mockAuth.isAuthenticated = false;
      mockAuth.error = new Error('Auth failed');
    });

    it('shows error dialog when showErrorDialog is true', () => {
      render(<CallbackPage showErrorDialog />);
      expect(screen.getByText('Authentication Failed')).toBeTruthy();
      expect(screen.getByText('Auth failed')).toBeTruthy();
    });

    it('shows default error message when error has no message', () => {
      mockAuth.error = { message: '' } as Error;
      render(<CallbackPage showErrorDialog />);
      expect(screen.getByText('An error occurred during sign in.')).toBeTruthy();
    });

    it('shows Try Again button that navigates to retry path', () => {
      // Mock window.location
      const originalHref = window.location.href;
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { href: originalHref },
      });

      render(<CallbackPage showErrorDialog retryPath="/hr" />);
      const button = screen.getByText('Try Again');
      fireEvent.click(button);
      expect(window.location.href).toBe('/hr');

      // Restore
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { href: originalHref },
      });
    });

    it('defaults retry path to /', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { href: '' },
      });

      render(<CallbackPage showErrorDialog />);
      const button = screen.getByText('Try Again');
      fireEvent.click(button);
      expect(window.location.href).toBe('/');
    });
  });
});
