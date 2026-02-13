/**
 * Tiered Authorization Tests (v1.5 - Role-Based Access Control Enhancement)
 *
 * Tests for the three authorization tiers:
 * - TIER 1: Expenses - All employees (self-access via RLS)
 * - TIER 2: Budgets - Managers and above
 * - TIER 3: Dashboard/ARR/Invoices - Finance personnel only
 */

import { canAccessExpenses, canAccessBudgets, canAccessDashboard } from './index';

describe('Tiered Authorization', () => {
  describe('canAccessExpenses (TIER 1 - All Employees)', () => {
    it('allows employee role', () => {
      expect(canAccessExpenses(['employee'])).toBe(true);
    });

    it('allows manager role', () => {
      expect(canAccessExpenses(['manager'])).toBe(true);
    });

    it('allows finance-read role', () => {
      expect(canAccessExpenses(['finance-read'])).toBe(true);
    });

    it('allows finance-write role', () => {
      expect(canAccessExpenses(['finance-write'])).toBe(true);
    });

    it('allows executive role', () => {
      expect(canAccessExpenses(['executive'])).toBe(true);
    });

    it('allows multiple valid roles', () => {
      expect(canAccessExpenses(['employee', 'manager'])).toBe(true);
    });

    it('denies empty roles array', () => {
      expect(canAccessExpenses([])).toBe(false);
    });

    it('denies unknown roles', () => {
      expect(canAccessExpenses(['intern', 'guest'])).toBe(false);
    });

    it('denies roles from other departments', () => {
      expect(canAccessExpenses(['hr-read', 'sales-write'])).toBe(false);
    });
  });

  describe('canAccessBudgets (TIER 2 - Managers and Above)', () => {
    it('denies employee role (must be manager+)', () => {
      expect(canAccessBudgets(['employee'])).toBe(false);
    });

    it('allows manager role', () => {
      expect(canAccessBudgets(['manager'])).toBe(true);
    });

    it('allows finance-read role', () => {
      expect(canAccessBudgets(['finance-read'])).toBe(true);
    });

    it('allows finance-write role', () => {
      expect(canAccessBudgets(['finance-write'])).toBe(true);
    });

    it('allows executive role', () => {
      expect(canAccessBudgets(['executive'])).toBe(true);
    });

    it('allows employee+manager combination (manager grants access)', () => {
      expect(canAccessBudgets(['employee', 'manager'])).toBe(true);
    });

    it('denies empty roles array', () => {
      expect(canAccessBudgets([])).toBe(false);
    });

    it('denies unknown roles', () => {
      expect(canAccessBudgets(['intern', 'guest'])).toBe(false);
    });

    it('denies roles from other departments without manager', () => {
      expect(canAccessBudgets(['hr-read', 'sales-write'])).toBe(false);
    });
  });

  describe('canAccessDashboard (TIER 3 - Finance Personnel Only)', () => {
    it('denies employee role', () => {
      expect(canAccessDashboard(['employee'])).toBe(false);
    });

    it('denies manager role', () => {
      expect(canAccessDashboard(['manager'])).toBe(false);
    });

    it('allows finance-read role', () => {
      expect(canAccessDashboard(['finance-read'])).toBe(true);
    });

    it('allows finance-write role', () => {
      expect(canAccessDashboard(['finance-write'])).toBe(true);
    });

    it('allows executive role', () => {
      expect(canAccessDashboard(['executive'])).toBe(true);
    });

    it('allows finance+manager combination', () => {
      expect(canAccessDashboard(['manager', 'finance-read'])).toBe(true);
    });

    it('denies empty roles array', () => {
      expect(canAccessDashboard([])).toBe(false);
    });

    it('denies unknown roles', () => {
      expect(canAccessDashboard(['intern', 'guest'])).toBe(false);
    });

    it('denies employee+manager without finance role', () => {
      expect(canAccessDashboard(['employee', 'manager'])).toBe(false);
    });

    it('denies roles from other departments', () => {
      expect(canAccessDashboard(['hr-read', 'hr-write', 'sales-read'])).toBe(false);
    });
  });

  describe('Access Hierarchy', () => {
    // Verify the tiered access model works correctly

    it('TIER 3 roles can access all tiers', () => {
      const financeRoles = ['finance-read'];
      expect(canAccessExpenses(financeRoles)).toBe(true);
      expect(canAccessBudgets(financeRoles)).toBe(true);
      expect(canAccessDashboard(financeRoles)).toBe(true);
    });

    it('executive can access all tiers', () => {
      const execRoles = ['executive'];
      expect(canAccessExpenses(execRoles)).toBe(true);
      expect(canAccessBudgets(execRoles)).toBe(true);
      expect(canAccessDashboard(execRoles)).toBe(true);
    });

    it('TIER 2 (manager) can access expenses but not dashboard', () => {
      const managerRoles = ['manager'];
      expect(canAccessExpenses(managerRoles)).toBe(true);
      expect(canAccessBudgets(managerRoles)).toBe(true);
      expect(canAccessDashboard(managerRoles)).toBe(false);
    });

    it('TIER 1 (employee) can only access expenses', () => {
      const employeeRoles = ['employee'];
      expect(canAccessExpenses(employeeRoles)).toBe(true);
      expect(canAccessBudgets(employeeRoles)).toBe(false);
      expect(canAccessDashboard(employeeRoles)).toBe(false);
    });
  });

  describe('Real-World User Scenarios', () => {
    it('alice.chen (HR user with employee role) can access expenses only', () => {
      // Alice is HR, has employee role but not finance roles
      const aliceRoles = ['employee', 'hr-read', 'hr-write'];
      expect(canAccessExpenses(aliceRoles)).toBe(true);
      expect(canAccessBudgets(aliceRoles)).toBe(false);
      expect(canAccessDashboard(aliceRoles)).toBe(false);
    });

    it('bob.martinez (Finance user) can access everything', () => {
      const bobRoles = ['employee', 'finance-read', 'finance-write'];
      expect(canAccessExpenses(bobRoles)).toBe(true);
      expect(canAccessBudgets(bobRoles)).toBe(true);
      expect(canAccessDashboard(bobRoles)).toBe(true);
    });

    it('nina.patel (Manager) can access expenses and budgets', () => {
      const ninaRoles = ['employee', 'manager'];
      expect(canAccessExpenses(ninaRoles)).toBe(true);
      expect(canAccessBudgets(ninaRoles)).toBe(true);
      expect(canAccessDashboard(ninaRoles)).toBe(false);
    });

    it('eve.thompson (Executive) can access everything', () => {
      const eveRoles = ['executive'];
      expect(canAccessExpenses(eveRoles)).toBe(true);
      expect(canAccessBudgets(eveRoles)).toBe(true);
      expect(canAccessDashboard(eveRoles)).toBe(true);
    });

    it('marcus.johnson (Regular employee) can access expenses only', () => {
      const marcusRoles = ['employee', 'user'];
      expect(canAccessExpenses(marcusRoles)).toBe(true);
      expect(canAccessBudgets(marcusRoles)).toBe(false);
      expect(canAccessDashboard(marcusRoles)).toBe(false);
    });
  });
});
