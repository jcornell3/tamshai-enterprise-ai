/**
 * createAppRoutes Tests - @tamshai/ui
 *
 * RED Phase: Tests for the shared route configuration factory.
 * This will consolidate duplicate route structures across apps.
 *
 * Issue 2.2: App Route Structures
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useRoutes } from 'react-router-dom';
import { createAppRoutes, AppRouteConfig } from '../createAppRoutes';

// Mock the auth context
jest.mock('@tamshai/auth', () => ({
  useAuth: jest.fn(),
  PrivateRoute: ({ children, requiredRoles }: { children: React.ReactNode; requiredRoles?: string[] }) => (
    <div data-testid="private-route" data-roles={requiredRoles?.join(',')}>
      {children}
    </div>
  ),
  CallbackPage: () => <div data-testid="callback-page">Callback</div>,
}));

// Helper component to render routes
function TestRouter({ routes }: { routes: ReturnType<typeof createAppRoutes> }) {
  const element = useRoutes(routes);
  return element;
}

describe('createAppRoutes', () => {
  describe('route creation', () => {
    it('should create routes with PrivateRoute wrapper', () => {
      const routes = createAppRoutes({
        requiredRoles: ['hr-read'],
        routes: [
          { path: '/', element: <div>Dashboard</div> },
        ],
      });

      expect(routes).toBeDefined();
      expect(Array.isArray(routes)).toBe(true);
    });

    it('should wrap routes in PrivateRoute with correct roles', () => {
      const routes = createAppRoutes({
        requiredRoles: ['finance-read', 'finance-write'],
        routes: [
          { path: '/dashboard', element: <div>Finance Dashboard</div> },
        ],
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <TestRouter routes={routes} />
        </MemoryRouter>
      );

      const privateRoute = screen.getByTestId('private-route');
      expect(privateRoute).toHaveAttribute('data-roles', 'finance-read,finance-write');
    });

    it('should include callback route automatically', () => {
      const routes = createAppRoutes({
        requiredRoles: ['hr-read'],
        routes: [
          { path: '/', element: <div>Home</div> },
        ],
      });

      render(
        <MemoryRouter initialEntries={['/callback']}>
          <TestRouter routes={routes} />
        </MemoryRouter>
      );

      expect(screen.getByTestId('callback-page')).toBeInTheDocument();
    });

    it('should not wrap callback route in PrivateRoute', () => {
      const routes = createAppRoutes({
        requiredRoles: ['hr-read'],
        routes: [],
      });

      render(
        <MemoryRouter initialEntries={['/callback']}>
          <TestRouter routes={routes} />
        </MemoryRouter>
      );

      // Callback should be rendered without PrivateRoute wrapper
      expect(screen.getByTestId('callback-page')).toBeInTheDocument();
      expect(screen.queryByTestId('private-route')).not.toBeInTheDocument();
    });
  });

  describe('nested routes', () => {
    it('should support nested route configurations', () => {
      const routes = createAppRoutes({
        requiredRoles: ['hr-read'],
        routes: [
          {
            path: '/employees',
            element: <div>Employees Layout</div>,
            children: [
              { path: '', element: <div>Employees List</div> },
              { path: ':id', element: <div>Employee Detail</div> },
            ],
          },
        ],
      });

      expect(routes).toBeDefined();
      // Find the employees route
      const employeesRoute = routes.find((r: any) => {
        // Check if it's inside PrivateRoute or direct route
        return r.path === '/employees' || (r.children && r.children.some((c: any) => c.path === '/employees'));
      });
      expect(employeesRoute).toBeDefined();
    });

    it('should handle index routes', () => {
      const routes = createAppRoutes({
        requiredRoles: ['support-read'],
        routes: [
          {
            path: '/',
            element: <div>Layout</div>,
            children: [
              { index: true, element: <div>Index Content</div> },
              { path: 'tickets', element: <div>Tickets</div> },
            ],
          },
        ],
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <TestRouter routes={routes} />
        </MemoryRouter>
      );

      expect(screen.getByText('Index Content')).toBeInTheDocument();
    });
  });

  describe('configuration options', () => {
    it('should accept custom callback redirect path', () => {
      const routes = createAppRoutes({
        requiredRoles: ['sales-read'],
        routes: [],
        callbackRedirectTo: '/dashboard',
      });

      expect(routes).toBeDefined();
    });

    it('should accept empty requiredRoles array', () => {
      const routes = createAppRoutes({
        requiredRoles: [],
        routes: [
          { path: '/', element: <div>Public Home</div> },
        ],
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <TestRouter routes={routes} />
        </MemoryRouter>
      );

      const privateRoute = screen.getByTestId('private-route');
      expect(privateRoute).toHaveAttribute('data-roles', '');
    });
  });

  describe('type safety', () => {
    it('should enforce AppRouteConfig interface', () => {
      // This test validates TypeScript types at compile time
      const config: AppRouteConfig = {
        requiredRoles: ['hr-read'],
        routes: [
          { path: '/', element: <div>Home</div> },
        ],
      };

      const routes = createAppRoutes(config);
      expect(routes).toBeDefined();
    });
  });
});
