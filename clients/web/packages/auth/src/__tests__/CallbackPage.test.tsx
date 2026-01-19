/**
 * RED Phase Tests: CallbackPage Component
 * These tests MUST FAIL initially - that's the point of TDD RED phase
 *
 * Run with: cd clients/web/packages/auth && npm test
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CallbackPage } from '../CallbackPage';
import { useAuth } from '../useAuth';

// Mock the auth hook
jest.mock('../useAuth', () => ({
  useAuth: jest.fn(),
}));

// Mock react-router-dom navigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('CallbackPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when loading', () => {
    it('should display loading spinner', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        error: null,
      });

      render(
        <MemoryRouter>
          <CallbackPage />
        </MemoryRouter>
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(/authenticating/i)).toBeInTheDocument();
    });

    it('should not navigate while loading', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        error: null,
      });

      render(
        <MemoryRouter>
          <CallbackPage />
        </MemoryRouter>
      );

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('when authenticated', () => {
    it('should navigate to default route (/)', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      render(
        <MemoryRouter>
          <CallbackPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('should navigate to custom redirectTo prop', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      render(
        <MemoryRouter>
          <CallbackPage redirectTo="/dashboard" />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
      });
    });
  });

  describe('when authentication fails', () => {
    it('should display error message', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        error: new Error('Authentication failed'),
      });

      render(
        <MemoryRouter>
          <CallbackPage />
        </MemoryRouter>
      );

      expect(screen.getByText(/authentication failed/i)).toBeInTheDocument();
    });

    it('should not navigate on error', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        error: new Error('Authentication failed'),
      });

      render(
        <MemoryRouter>
          <CallbackPage />
        </MemoryRouter>
      );

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should log error to console', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const testError = new Error('Auth error');

      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        error: testError,
      });

      render(
        <MemoryRouter>
          <CallbackPage />
        </MemoryRouter>
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        'Authentication error:',
        testError
      );
      consoleSpy.mockRestore();
    });
  });

  describe('accessibility', () => {
    it('should have accessible loading state', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        error: null,
      });

      render(
        <MemoryRouter>
          <CallbackPage />
        </MemoryRouter>
      );

      const spinner = screen.getByRole('status');
      expect(spinner).toHaveAttribute('aria-busy', 'true');
    });
  });
});
