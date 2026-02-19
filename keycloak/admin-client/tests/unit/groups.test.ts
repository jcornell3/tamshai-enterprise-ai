import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroupSync } from '../../src/sync/groups.js';

describe('GroupSync', () => {
  const mockKc = {
    groups: {
      find: vi.fn(),
      create: vi.fn(),
      addRealmRoleMappings: vi.fn(),
    },
    roles: {
      findOneByName: vi.fn(),
    },
    users: {
      find: vi.fn(),
      addToGroup: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('assignCriticalUsers', () => {
    it('assigns test-user.journey to All-Employees but NOT C-Suite (E2 security fix)', async () => {
      // Setup mocks - groups must exist for assignment to work
      const mockGroups = [
        { id: 'csuite-id', name: 'C-Suite' },
        { id: 'all-emp-id', name: 'All-Employees' },
        { id: 'hr-id', name: 'HR-Team' },
        { id: 'finance-id', name: 'Finance-Team' },
        { id: 'sales-id', name: 'Sales-Team' },
        { id: 'support-id', name: 'Support-Team' },
        { id: 'payroll-id', name: 'Payroll-Team' },
      ];

      mockKc.groups.find.mockImplementation(({ search }) => {
        const found = mockGroups.filter((g) => g.name.includes(search || ''));
        return Promise.resolve(found.length > 0 ? found : []);
      });
      mockKc.groups.create.mockResolvedValue({ id: 'new-group-id' });
      mockKc.roles.findOneByName.mockResolvedValue({ id: 'role-id', name: 'user' });
      mockKc.users.find.mockImplementation(({ username }) => {
        if (username === 'test-user.journey') {
          return Promise.resolve([{ id: 'test-user-id', username: 'test-user.journey' }]);
        }
        return Promise.resolve([]);
      });
      mockKc.users.addToGroup.mockResolvedValue(undefined);

      const sync = new GroupSync(mockKc as any, 'dev');
      await sync.syncAll();

      // Check that test-user.journey was assigned to All-Employees
      expect(mockKc.users.addToGroup).toHaveBeenCalledWith({
        id: 'test-user-id',
        groupId: 'all-emp-id',
      });

      // Get all addToGroup calls
      const addToGroupCalls = mockKc.users.addToGroup.mock.calls;

      // Verify test-user.journey was NOT assigned to C-Suite
      // This is the E2 security fix - test user should not have executive privileges
      const testUserCSuiteCalls = addToGroupCalls.filter(
        (call: any[]) => call[0].id === 'test-user-id' && call[0].groupId === 'csuite-id'
      );

      // test-user.journey should NOT be in C-Suite
      expect(testUserCSuiteCalls.length).toBe(0);
    });
  });

  describe('syncGroup', () => {
    it('creates group if it does not exist', async () => {
      mockKc.groups.find.mockResolvedValue([]);
      mockKc.groups.create.mockResolvedValue({ id: 'new-group-id' });
      mockKc.roles.findOneByName.mockResolvedValue({ id: 'role-id', name: 'executive' });
      mockKc.users.find.mockResolvedValue([]);

      const sync = new GroupSync(mockKc as any, 'dev');
      await sync.syncAll();

      expect(mockKc.groups.create).toHaveBeenCalledWith({ name: 'C-Suite' });
      expect(mockKc.groups.create).toHaveBeenCalledWith({ name: 'All-Employees' });
    });

    it('does not create group if it already exists', async () => {
      mockKc.groups.find.mockImplementation(({ search }) => {
        if (search === 'C-Suite') {
          return Promise.resolve([{ id: 'existing-id', name: 'C-Suite' }]);
        }
        return Promise.resolve([]);
      });
      mockKc.groups.create.mockResolvedValue({ id: 'new-group-id' });
      mockKc.roles.findOneByName.mockResolvedValue({ id: 'role-id', name: 'executive' });
      mockKc.users.find.mockResolvedValue([]);

      const sync = new GroupSync(mockKc as any, 'dev');
      await sync.syncAll();

      // C-Suite should not be created (already exists)
      expect(mockKc.groups.create).not.toHaveBeenCalledWith({ name: 'C-Suite' });
    });
  });
});
