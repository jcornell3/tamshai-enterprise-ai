/**
 * createAppRoutes - @tamshai/ui
 *
 * Shared route configuration factory for Tamshai web applications.
 * Consolidates duplicate route structures across apps by providing
 * a consistent way to create protected routes with role requirements.
 *
 * Issue 2.2: App Route Structures
 */

import React from 'react';
import type { RouteObject } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { PrivateRoute, CallbackPage } from '@tamshai/auth';

/**
 * Route configuration for a single route
 */
export interface AppRoute {
  /**
   * Path pattern for the route
   */
  path?: string;
  /**
   * Whether this is an index route
   */
  index?: boolean;
  /**
   * React element to render for this route
   */
  element: React.ReactNode;
  /**
   * Nested child routes
   */
  children?: AppRoute[];
}

/**
 * Configuration for creating app routes
 */
export interface AppRouteConfig {
  /**
   * Roles required to access the routes
   */
  requiredRoles: string[];
  /**
   * Route definitions to wrap with PrivateRoute
   */
  routes: AppRoute[];
  /**
   * Custom redirect path after OAuth callback (default: '/')
   */
  callbackRedirectTo?: string;
}

/**
 * Creates a route configuration with authentication protection.
 *
 * This factory function:
 * - Wraps all provided routes in a PrivateRoute with the specified roles
 * - Automatically adds a /callback route for OAuth flow
 * - Supports nested routes and index routes
 *
 * @example
 * // Basic usage
 * const routes = createAppRoutes({
 *   requiredRoles: ['hr-read'],
 *   routes: [
 *     { path: '/', element: <Dashboard /> },
 *     { path: '/employees', element: <Employees /> },
 *   ],
 * });
 *
 * @example
 * // With nested routes
 * const routes = createAppRoutes({
 *   requiredRoles: ['finance-read'],
 *   routes: [
 *     {
 *       path: '/',
 *       element: <Layout />,
 *       children: [
 *         { index: true, element: <Home /> },
 *         { path: 'invoices', element: <Invoices /> },
 *       ],
 *     },
 *   ],
 * });
 *
 * @param config - The route configuration
 * @returns Array of RouteObject for react-router-dom
 */
export function createAppRoutes(config: AppRouteConfig): RouteObject[] {
  const { requiredRoles, routes, callbackRedirectTo = '/' } = config;

  /**
   * Wrapper component that renders the user element along with an Outlet
   * for nested route children to render into.
   */
  const RouteElementWithOutlet: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <>
      {children}
      <Outlet />
    </>
  );

  // Convert AppRoute to RouteObject with proper Outlet handling for nested routes
  const convertRoutes = (appRoutes: AppRoute[], wrapInPrivateRoute: boolean): RouteObject[] => {
    return appRoutes.map((route) => {
      const hasChildren = route.children && route.children.length > 0;

      // For routes with children, wrap element with Outlet for nested rendering
      let element = route.element;
      if (hasChildren) {
        element = <RouteElementWithOutlet>{route.element}</RouteElementWithOutlet>;
      }

      // Wrap in PrivateRoute only at the top level
      if (wrapInPrivateRoute) {
        element = (
          <PrivateRoute requiredRoles={requiredRoles}>
            {element}
          </PrivateRoute>
        );
      }

      const routeObj: RouteObject = {
        element,
      };

      if (route.path !== undefined) {
        routeObj.path = route.path;
      }

      if (route.index) {
        routeObj.index = route.index;
      }

      if (hasChildren) {
        // Children don't need to be wrapped in PrivateRoute (parent already is)
        routeObj.children = convertRoutes(route.children!, false);
      }

      return routeObj;
    });
  };

  // Create the callback route (unprotected)
  const callbackRoute: RouteObject = {
    path: '/callback',
    element: <CallbackPage redirectTo={callbackRedirectTo} />,
  };

  // If no routes provided, just return the callback route
  if (routes.length === 0) {
    return [callbackRoute];
  }

  // Convert routes with PrivateRoute wrapping at top level
  const protectedRoutes = convertRoutes(routes, true);

  // Return callback route + protected routes
  return [callbackRoute, ...protectedRoutes];
}

export default createAppRoutes;
