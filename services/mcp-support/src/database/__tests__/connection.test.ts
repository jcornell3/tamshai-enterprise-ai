/**
 * Tests for MongoDB Connection Module
 *
 * Tests database connection management and role-based filtering logic
 */

import { buildRoleFilter } from '../connection';
import { UserContext } from '../types';

describe('MongoDB Connection Module', () => {
  describe('buildRoleFilter', () => {
    it('should return empty filter for executive role (sees all data)', () => {
      const userContext: UserContext = {
        userId: 'user-123',
        username: 'eve.thompson',
        roles: ['executive'],
      };

      const filter = buildRoleFilter(userContext);

      expect(filter).toEqual({});
    });

    it('should return empty filter for support-read role (sees all data)', () => {
      const userContext: UserContext = {
        userId: 'user-456',
        username: 'dan.williams',
        roles: ['support-read'],
      };

      const filter = buildRoleFilter(userContext);

      expect(filter).toEqual({});
    });

    it('should return empty filter for support-write role (sees all data)', () => {
      const userContext: UserContext = {
        userId: 'user-789',
        username: 'dan.williams',
        roles: ['support-write'],
      };

      const filter = buildRoleFilter(userContext);

      expect(filter).toEqual({});
    });

    it('should return empty filter for user with multiple privileged roles', () => {
      const userContext: UserContext = {
        userId: 'user-123',
        username: 'eve.thompson',
        roles: ['executive', 'support-read', 'support-write'],
      };

      const filter = buildRoleFilter(userContext);

      expect(filter).toEqual({});
    });

    it('should return team filter for manager role (assigned_to OR created_by)', () => {
      const userContext: UserContext = {
        userId: 'user-999',
        username: 'nina.patel',
        roles: ['manager'],
      };

      const filter = buildRoleFilter(userContext);

      expect(filter).toEqual({
        $or: [{ assigned_to: 'nina.patel' }, { created_by: 'nina.patel' }],
      });
    });

    it('should return own records filter for user role (created_by only)', () => {
      const userContext: UserContext = {
        userId: 'user-111',
        username: 'marcus.johnson',
        roles: ['user'],
      };

      const filter = buildRoleFilter(userContext);

      expect(filter).toEqual({ created_by: 'marcus.johnson' });
    });

    it('should return own records filter for user with no recognized roles', () => {
      const userContext: UserContext = {
        userId: 'user-222',
        username: 'frank.davis',
        roles: ['intern', 'some-other-role'],
      };

      const filter = buildRoleFilter(userContext);

      expect(filter).toEqual({ created_by: 'frank.davis' });
    });

    it('should return own records filter for user with empty roles array', () => {
      const userContext: UserContext = {
        userId: 'user-333',
        username: 'unknown.user',
        roles: [],
      };

      const filter = buildRoleFilter(userContext);

      expect(filter).toEqual({ created_by: 'unknown.user' });
    });

    it('should prioritize executive role over manager role', () => {
      const userContext: UserContext = {
        userId: 'user-444',
        username: 'eve.thompson',
        roles: ['manager', 'executive'], // Has both roles
      };

      const filter = buildRoleFilter(userContext);

      // Executive takes precedence, returns empty filter
      expect(filter).toEqual({});
    });

    it('should prioritize support roles over manager role', () => {
      const userContext: UserContext = {
        userId: 'user-555',
        username: 'dan.williams',
        roles: ['manager', 'support-read'], // Has both roles
      };

      const filter = buildRoleFilter(userContext);

      // Support role takes precedence, returns empty filter
      expect(filter).toEqual({});
    });

    it('should prioritize manager role over user role', () => {
      const userContext: UserContext = {
        userId: 'user-666',
        username: 'nina.patel',
        roles: ['user', 'manager'], // Has both roles
      };

      const filter = buildRoleFilter(userContext);

      // Manager role takes precedence, returns team filter
      expect(filter).toEqual({
        $or: [{ assigned_to: 'nina.patel' }, { created_by: 'nina.patel' }],
      });
    });
  });
});
