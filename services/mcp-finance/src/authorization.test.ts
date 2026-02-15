/**
 * Tiered Authorization Tests (v1.5 - Role-Based Access Control Enhancement)
 *
 * Tests for the three authorization tiers using shared utilities:
 * - TIER 1: Expenses - All employees (self-access via RLS)
 * - TIER 2: Budgets - All employees (filtered via RLS)
 * - TIER 3: Dashboard/ARR/Invoices - Finance personnel only
 * - Write: finance-write or executive only
 */

import { hasFinanceTierAccess, hasDomainWriteAccess } from '@tamshai/shared';

describe('Tiered Authorization', () => {
  describe('hasFinanceTierAccess(roles, "expenses") (TIER 1 - All Employees)', () => {
    it('allows employee role', () => {
      expect(hasFinanceTierAccess(['employee'], 'expenses')).toBe(true);
    });

    it('allows manager role', () => {
      expect(hasFinanceTierAccess(['manager'], 'expenses')).toBe(true);
    });

    it('allows finance-read role', () => {
      expect(hasFinanceTierAccess(['finance-read'], 'expenses')).toBe(true);
    });

    it('allows finance-write role', () => {
      expect(hasFinanceTierAccess(['finance-write'], 'expenses')).toBe(true);
    });

    it('allows executive role', () => {
      expect(hasFinanceTierAccess(['executive'], 'expenses')).toBe(true);
    });

    it('allows multiple valid roles', () => {
      expect(hasFinanceTierAccess(['employee', 'manager'], 'expenses')).toBe(true);
    });

    it('denies empty roles array', () => {
      expect(hasFinanceTierAccess([], 'expenses')).toBe(false);
    });

    it('denies unknown roles', () => {
      expect(hasFinanceTierAccess(['intern', 'guest'], 'expenses')).toBe(false);
    });

    it('denies roles from other departments', () => {
      expect(hasFinanceTierAccess(['hr-read', 'sales-write'], 'expenses')).toBe(false);
    });
  });

  describe('hasFinanceTierAccess(roles, "budgets") (TIER 2 - All Employees)', () => {
    it('allows employee role', () => {
      expect(hasFinanceTierAccess(['employee'], 'budgets')).toBe(true);
    });

    it('allows manager role', () => {
      expect(hasFinanceTierAccess(['manager'], 'budgets')).toBe(true);
    });

    it('allows finance-read role', () => {
      expect(hasFinanceTierAccess(['finance-read'], 'budgets')).toBe(true);
    });

    it('allows finance-write role', () => {
      expect(hasFinanceTierAccess(['finance-write'], 'budgets')).toBe(true);
    });

    it('allows executive role', () => {
      expect(hasFinanceTierAccess(['executive'], 'budgets')).toBe(true);
    });

    it('allows employee+manager combination', () => {
      expect(hasFinanceTierAccess(['employee', 'manager'], 'budgets')).toBe(true);
    });

    it('denies empty roles array', () => {
      expect(hasFinanceTierAccess([], 'budgets')).toBe(false);
    });

    it('denies unknown roles', () => {
      expect(hasFinanceTierAccess(['intern', 'guest'], 'budgets')).toBe(false);
    });

    it('denies roles from other departments without employee/manager', () => {
      expect(hasFinanceTierAccess(['hr-read', 'sales-write'], 'budgets')).toBe(false);
    });
  });

  describe('hasFinanceTierAccess(roles, "dashboard") (TIER 3 - Finance Personnel Only)', () => {
    it('denies employee role', () => {
      expect(hasFinanceTierAccess(['employee'], 'dashboard')).toBe(false);
    });

    it('denies manager role', () => {
      expect(hasFinanceTierAccess(['manager'], 'dashboard')).toBe(false);
    });

    it('allows finance-read role', () => {
      expect(hasFinanceTierAccess(['finance-read'], 'dashboard')).toBe(true);
    });

    it('allows finance-write role', () => {
      expect(hasFinanceTierAccess(['finance-write'], 'dashboard')).toBe(true);
    });

    it('allows executive role', () => {
      expect(hasFinanceTierAccess(['executive'], 'dashboard')).toBe(true);
    });

    it('allows finance+manager combination', () => {
      expect(hasFinanceTierAccess(['manager', 'finance-read'], 'dashboard')).toBe(true);
    });

    it('denies empty roles array', () => {
      expect(hasFinanceTierAccess([], 'dashboard')).toBe(false);
    });

    it('denies unknown roles', () => {
      expect(hasFinanceTierAccess(['intern', 'guest'], 'dashboard')).toBe(false);
    });

    it('denies employee+manager without finance role', () => {
      expect(hasFinanceTierAccess(['employee', 'manager'], 'dashboard')).toBe(false);
    });

    it('denies roles from other departments', () => {
      expect(hasFinanceTierAccess(['hr-read', 'hr-write', 'sales-read'], 'dashboard')).toBe(false);
    });
  });

  describe('hasDomainWriteAccess(roles, "finance") (Write Operations)', () => {
    it('denies employee role', () => {
      expect(hasDomainWriteAccess(['employee'], 'finance')).toBe(false);
    });

    it('denies finance-read role', () => {
      expect(hasDomainWriteAccess(['finance-read'], 'finance')).toBe(false);
    });

    it('allows finance-write role', () => {
      expect(hasDomainWriteAccess(['finance-write'], 'finance')).toBe(true);
    });

    it('allows executive role', () => {
      expect(hasDomainWriteAccess(['executive'], 'finance')).toBe(true);
    });
  });

  describe('Access Hierarchy', () => {
    it('TIER 3 roles can access all tiers', () => {
      const financeRoles = ['finance-read'];
      expect(hasFinanceTierAccess(financeRoles, 'expenses')).toBe(true);
      expect(hasFinanceTierAccess(financeRoles, 'budgets')).toBe(true);
      expect(hasFinanceTierAccess(financeRoles, 'dashboard')).toBe(true);
    });

    it('executive can access all tiers', () => {
      const execRoles = ['executive'];
      expect(hasFinanceTierAccess(execRoles, 'expenses')).toBe(true);
      expect(hasFinanceTierAccess(execRoles, 'budgets')).toBe(true);
      expect(hasFinanceTierAccess(execRoles, 'dashboard')).toBe(true);
    });

    it('TIER 2 (manager) can access expenses and budgets but not dashboard', () => {
      const managerRoles = ['manager'];
      expect(hasFinanceTierAccess(managerRoles, 'expenses')).toBe(true);
      expect(hasFinanceTierAccess(managerRoles, 'budgets')).toBe(true);
      expect(hasFinanceTierAccess(managerRoles, 'dashboard')).toBe(false);
    });

    it('TIER 1 (employee) can access expenses and budgets but not dashboard', () => {
      const employeeRoles = ['employee'];
      expect(hasFinanceTierAccess(employeeRoles, 'expenses')).toBe(true);
      expect(hasFinanceTierAccess(employeeRoles, 'budgets')).toBe(true);
      expect(hasFinanceTierAccess(employeeRoles, 'dashboard')).toBe(false);
    });
  });

  describe('Real-World User Scenarios', () => {
    it('alice.chen (HR user with employee role) can access expenses and budgets only', () => {
      const aliceRoles = ['employee', 'hr-read', 'hr-write'];
      expect(hasFinanceTierAccess(aliceRoles, 'expenses')).toBe(true);
      expect(hasFinanceTierAccess(aliceRoles, 'budgets')).toBe(true);
      expect(hasFinanceTierAccess(aliceRoles, 'dashboard')).toBe(false);
    });

    it('bob.martinez (Finance user) can access everything', () => {
      const bobRoles = ['employee', 'finance-read', 'finance-write'];
      expect(hasFinanceTierAccess(bobRoles, 'expenses')).toBe(true);
      expect(hasFinanceTierAccess(bobRoles, 'budgets')).toBe(true);
      expect(hasFinanceTierAccess(bobRoles, 'dashboard')).toBe(true);
    });

    it('nina.patel (Manager) can access expenses and budgets', () => {
      const ninaRoles = ['employee', 'manager'];
      expect(hasFinanceTierAccess(ninaRoles, 'expenses')).toBe(true);
      expect(hasFinanceTierAccess(ninaRoles, 'budgets')).toBe(true);
      expect(hasFinanceTierAccess(ninaRoles, 'dashboard')).toBe(false);
    });

    it('eve.thompson (Executive) can access everything', () => {
      const eveRoles = ['executive'];
      expect(hasFinanceTierAccess(eveRoles, 'expenses')).toBe(true);
      expect(hasFinanceTierAccess(eveRoles, 'budgets')).toBe(true);
      expect(hasFinanceTierAccess(eveRoles, 'dashboard')).toBe(true);
    });

    it('marcus.johnson (Regular employee) can access expenses and budgets only', () => {
      const marcusRoles = ['employee', 'user'];
      expect(hasFinanceTierAccess(marcusRoles, 'expenses')).toBe(true);
      expect(hasFinanceTierAccess(marcusRoles, 'budgets')).toBe(true);
      expect(hasFinanceTierAccess(marcusRoles, 'dashboard')).toBe(false);
    });
  });
});
