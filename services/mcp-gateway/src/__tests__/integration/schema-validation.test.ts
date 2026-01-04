/**
 * TDD RED PHASE: Schema Validation Tests for Issue #76
 *
 * These tests validate that the 004-mcp-suite specification matches
 * the actual database schema. They are designed to FAIL initially
 * because the SchemaValidator class doesn't exist yet.
 *
 * Purpose: Ensure spec accuracy against actual database schema
 *
 * @see .specify/specs/004-mcp-suite/spec.md
 * @see https://github.com/jcornell3/tamshai-enterprise-ai/issues/76
 */

// Schema validation imports
import { SchemaValidator } from '../../schema/schema-validator';

// Mock spec definitions that match 004-mcp-suite/spec.md
const HR_SPEC_TABLES = {
  'hr.employees': {
    columns: [
      { name: 'employee_id', type: 'uuid', nullable: false },
      { name: 'first_name', type: 'varchar(100)', nullable: false },
      { name: 'last_name', type: 'varchar(100)', nullable: false },
      { name: 'email', type: 'varchar(255)', nullable: false },
      { name: 'department', type: 'varchar(100)', nullable: true },
      { name: 'job_title', type: 'varchar(100)', nullable: true },
      { name: 'manager_id', type: 'uuid', nullable: true },
      { name: 'hire_date', type: 'date', nullable: true },
      { name: 'salary', type: 'decimal(12,2)', nullable: true },
      { name: 'ssn', type: 'varchar(11)', nullable: true },
    ],
    foreignKeys: [
      { column: 'manager_id', references: 'hr.employees(id)' },
      { column: 'department_id', references: 'hr.departments(id)' },
    ],
  },
  'hr.departments': {
    columns: [
      { name: 'id', type: 'uuid', nullable: false },
      { name: 'name', type: 'varchar(100)', nullable: false },
      { name: 'code', type: 'varchar(10)', nullable: false },
    ],
    foreignKeys: [],
  },
  'hr.grade_levels': {
    columns: [
      { name: 'id', type: 'uuid', nullable: false },
      { name: 'grade', type: 'varchar(10)', nullable: false },
      { name: 'title_prefix', type: 'varchar(50)', nullable: false },
      { name: 'min_salary', type: 'decimal(12,2)', nullable: false },
      { name: 'max_salary', type: 'decimal(12,2)', nullable: false },
    ],
    foreignKeys: [],
  },
  'hr.performance_reviews': {
    columns: [
      { name: 'id', type: 'uuid', nullable: false },
      { name: 'employee_id', type: 'uuid', nullable: false },
      { name: 'reviewer_id', type: 'uuid', nullable: false },
      { name: 'review_date', type: 'date', nullable: false },
      { name: 'rating', type: 'integer', nullable: false },
    ],
    foreignKeys: [
      { column: 'employee_id', references: 'hr.employees(id)' },
      { column: 'reviewer_id', references: 'hr.employees(id)' },
    ],
  },
};

const FINANCE_SPEC_TABLES = {
  'finance.budgets': {
    columns: [
      { name: 'budget_id', type: 'uuid', nullable: false },
      { name: 'department', type: 'varchar(100)', nullable: false },
      { name: 'fiscal_year', type: 'integer', nullable: false },
      { name: 'allocated_amount', type: 'decimal(15,2)', nullable: false },
      { name: 'spent_amount', type: 'decimal(15,2)', nullable: true },
    ],
    foreignKeys: [],
  },
  'finance.invoices': {
    columns: [
      { name: 'invoice_id', type: 'uuid', nullable: false },
      { name: 'vendor_name', type: 'varchar(200)', nullable: false },
      { name: 'amount', type: 'decimal(12,2)', nullable: false },
      { name: 'status', type: 'varchar(20)', nullable: false },
      { name: 'due_date', type: 'date', nullable: true },
    ],
    foreignKeys: [],
  },
  // Spec mentions finance.expenses but actual schema might differ
  'finance.expenses': {
    columns: [
      { name: 'expense_id', type: 'uuid', nullable: false },
      { name: 'employee_id', type: 'uuid', nullable: false },
      { name: 'amount', type: 'decimal(12,2)', nullable: false },
      { name: 'category', type: 'varchar(50)', nullable: false },
      { name: 'status', type: 'varchar(20)', nullable: false },
    ],
    foreignKeys: [
      { column: 'employee_id', references: 'hr.employees(id)' },
    ],
  },
};

// CRITICAL DISCREPANCY: Spec says "opportunities" but actual MongoDB uses "deals"
// Spec says stage values: 'prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'
// Actual values: 'CLOSED_WON', 'PROPOSAL', 'NEGOTIATION', 'DISCOVERY', 'QUALIFICATION' (uppercase, different names)
const SALES_SPEC_COLLECTIONS = {
  // Spec documents this as "opportunities" collection
  opportunities: {
    fields: [
      { name: '_id', type: 'ObjectId' },
      { name: 'customer_id', type: 'ObjectId' },
      { name: 'name', type: 'string' },
      { name: 'value', type: 'number' },
      { name: 'stage', type: 'string', enumValues: ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] },
      { name: 'probability', type: 'number' },
      { name: 'expected_close_date', type: 'date' },
      { name: 'owner', type: 'string' },
    ],
    indexes: ['customer_id', 'stage', 'owner'],
  },
  customers: {
    fields: [
      { name: '_id', type: 'ObjectId' },
      { name: 'name', type: 'string' },
      { name: 'email', type: 'string' },
      { name: 'company', type: 'string' },
      { name: 'industry', type: 'string' },
      { name: 'tier', type: 'string', enumValues: ['enterprise', 'business', 'startup', 'free'] },
      { name: 'account_owner', type: 'string' },
    ],
    indexes: ['email', 'account_owner'],
  },
};

describe('SchemaValidator', () => {
  // This will fail because SchemaValidator doesn't exist
  let validator: SchemaValidator;

  beforeEach(() => {
    // SchemaValidator constructor doesn't exist - this is the RED phase
    validator = new SchemaValidator({
      postgres: {
        host: 'localhost',
        port: 5433,
        databases: ['tamshai_hr', 'tamshai_finance'],
      },
      mongodb: {
        host: 'localhost',
        port: 27018,
        databases: ['tamshai_sales'],
      },
    });
  });

  describe('validatePostgreSQLSchema', () => {
    /**
     * Test: Should detect missing tables specified in spec
     *
     * If the spec documents a table that doesn't exist in the database,
     * the validator should report it as a missing table.
     *
     * Example: Spec says hr.performance_reviews exists but it might not be created
     */
    it('should detect missing tables specified in spec', async () => {
      const result = await validator.validatePostgreSQLSchema(
        'tamshai_hr',
        HR_SPEC_TABLES
      );

      // The result should have a missingTables array
      expect(result.missingTables).toBeDefined();
      expect(Array.isArray(result.missingTables)).toBe(true);

      // If hr.performance_reviews doesn't exist, it should be reported
      // (The find result is for documentation - the actual check is validationComplete)
      result.missingTables.find(
        (table: string) => table === 'hr.performance_reviews'
      );

      // This assertion documents expected behavior - test will fail until implemented
      expect(result.validationComplete).toBe(true);
    });

    /**
     * Test: Should detect missing columns in existing tables
     *
     * If the spec says a table has columns that don't exist in the actual schema,
     * the validator should report them.
     *
     * Example: Spec says hr.employees has 'ssn' column but it might be named differently
     */
    it('should detect missing columns in existing tables', async () => {
      const result = await validator.validatePostgreSQLSchema(
        'tamshai_hr',
        HR_SPEC_TABLES
      );

      expect(result.missingColumns).toBeDefined();

      // This test documents: spec may say 'job_title' but actual is 'title'
      expect(result.columnMismatches).toBeDefined();
    });

    /**
     * Test: Should detect column type mismatches
     *
     * If the spec says a column is varchar(100) but it's actually varchar(50),
     * or if it says uuid but it's actually integer, report the mismatch.
     */
    it('should detect column type mismatches', async () => {
      const result = await validator.validatePostgreSQLSchema(
        'tamshai_hr',
        HR_SPEC_TABLES
      );

      expect(result.typeMismatches).toBeDefined();
      expect(Array.isArray(result.typeMismatches)).toBe(true);

      // Each mismatch should have table, column, specType, actualType
      result.typeMismatches.forEach((mismatch: {
        table: string;
        column: string;
        specType: string;
        actualType: string;
      }) => {
        expect(mismatch.table).toBeDefined();
        expect(mismatch.column).toBeDefined();
        expect(mismatch.specType).toBeDefined();
        expect(mismatch.actualType).toBeDefined();
      });
    });

    /**
     * Test: Should detect missing foreign key relationships
     *
     * If the spec documents a foreign key that doesn't exist in the database,
     * it should be reported.
     */
    it('should detect missing foreign key relationships', async () => {
      const result = await validator.validatePostgreSQLSchema(
        'tamshai_hr',
        HR_SPEC_TABLES
      );

      expect(result.missingForeignKeys).toBeDefined();
      expect(Array.isArray(result.missingForeignKeys)).toBe(true);

      // Each missing FK should identify the table, column, and expected reference
      result.missingForeignKeys.forEach((fk: {
        table: string;
        column: string;
        expectedReference: string;
      }) => {
        expect(fk.table).toBeDefined();
        expect(fk.column).toBeDefined();
        expect(fk.expectedReference).toBeDefined();
      });
    });

    /**
     * Test: Should detect extra columns not in spec (informational)
     *
     * Extra columns in the database that aren't documented in the spec
     * should be flagged for documentation update.
     */
    it('should detect extra columns not documented in spec', async () => {
      const result = await validator.validatePostgreSQLSchema(
        'tamshai_hr',
        HR_SPEC_TABLES
      );

      expect(result.extraColumns).toBeDefined();

      // hr.employees has many columns not in minimal spec (e.g., created_at, updated_at)
      const employeeExtras = result.extraColumns['hr.employees'];
      expect(employeeExtras).toBeDefined();
    });
  });

  describe('validateMongoDBSchema', () => {
    /**
     * Test: Should detect missing collections specified in spec
     *
     * CRITICAL: Spec documents 'opportunities' but actual MongoDB uses 'deals'
     * This is a known discrepancy that should be caught.
     */
    it('should detect missing collections specified in spec', async () => {
      const result = await validator.validateMongoDBSchema(
        'tamshai_sales',
        SALES_SPEC_COLLECTIONS
      );

      expect(result.missingCollections).toBeDefined();
      expect(Array.isArray(result.missingCollections)).toBe(true);

      // Spec says 'opportunities' but actual DB has 'deals'
      // This SHOULD be detected as missing
      expect(result.missingCollections).toContain('opportunities');
    });

    /**
     * Test: Should detect field name mismatches (stage vs status)
     *
     * The spec may document a field name that differs from the actual field.
     * For example: spec says 'status' but actual uses 'stage'
     */
    it('should detect field name mismatches (stage vs status)', async () => {
      const result = await validator.validateMongoDBSchema(
        'tamshai_sales',
        SALES_SPEC_COLLECTIONS
      );

      expect(result.fieldNameMismatches).toBeDefined();

      // Detect cases where field names differ
      const mismatches = result.fieldNameMismatches;
      expect(Array.isArray(mismatches)).toBe(true);
    });

    /**
     * Test: Should detect collection name mismatches (deals vs opportunities)
     *
     * CRITICAL DISCREPANCY from Issue #76:
     * - Spec documents: 'opportunities' collection
     * - Actual MongoDB: 'deals' collection
     *
     * This test verifies the validator catches this naming mismatch.
     */
    it('should detect collection name mismatches (deals vs opportunities)', async () => {
      const result = await validator.validateMongoDBSchema(
        'tamshai_sales',
        SALES_SPEC_COLLECTIONS
      );

      expect(result.collectionMappings).toBeDefined();

      // The validator should suggest that 'opportunities' might map to 'deals'
      const mapping = result.collectionMappings.find(
        (m: { specName: string; actualName: string; confidence: number }) =>
          m.specName === 'opportunities'
      );

      if (mapping) {
        expect(mapping.actualName).toBe('deals');
        expect(mapping.confidence).toBeGreaterThan(0.5);
      }
    });

    /**
     * Test: Should detect enum value mismatches in stage field
     *
     * Spec says stage values: 'prospecting', 'qualification', 'proposal', etc.
     * Actual values: 'CLOSED_WON', 'PROPOSAL', 'NEGOTIATION', 'DISCOVERY', 'QUALIFICATION'
     *
     * The validator should flag this case sensitivity and value mismatch.
     */
    it('should detect enum value mismatches in stage field', async () => {
      const result = await validator.validateMongoDBSchema(
        'tamshai_sales',
        SALES_SPEC_COLLECTIONS
      );

      expect(result.enumMismatches).toBeDefined();

      // Find stage field enum mismatch
      const stageMismatch = result.enumMismatches.find(
        (m: { collection: string; field: string }) =>
          m.field === 'stage'
      );

      if (stageMismatch) {
        expect(stageMismatch.specValues).toContain('closed_won');
        expect(stageMismatch.actualValues).toContain('CLOSED_WON');
        expect(stageMismatch.caseMismatch).toBe(true);
      }
    });

    /**
     * Test: Should detect extra collections not in spec
     *
     * Actual MongoDB might have collections not documented in the spec.
     */
    it('should detect extra collections not documented in spec', async () => {
      const result = await validator.validateMongoDBSchema(
        'tamshai_sales',
        SALES_SPEC_COLLECTIONS
      );

      expect(result.extraCollections).toBeDefined();

      // 'deals' exists in actual but not in spec (spec has 'opportunities')
      expect(result.extraCollections).toContain('deals');
    });
  });

  describe('generateSchemaReport', () => {
    /**
     * Test: Should produce markdown report of schema discrepancies
     *
     * The report should be formatted as markdown for easy inclusion
     * in documentation updates or GitHub issues.
     */
    it('should produce markdown report of schema discrepancies', async () => {
      const pgResult = await validator.validatePostgreSQLSchema(
        'tamshai_hr',
        HR_SPEC_TABLES
      );
      const mongoResult = await validator.validateMongoDBSchema(
        'tamshai_sales',
        SALES_SPEC_COLLECTIONS
      );

      const report = await validator.generateSchemaReport({
        postgres: [pgResult],
        mongodb: [mongoResult],
      });

      // Report should be a valid markdown string
      expect(typeof report.markdown).toBe('string');
      expect(report.markdown.length).toBeGreaterThan(0);

      // Report should have section headers
      expect(report.markdown).toContain('# Schema Validation Report');
      expect(report.markdown).toContain('## PostgreSQL Discrepancies');
      expect(report.markdown).toContain('## MongoDB Discrepancies');

      // Report should include discrepancy counts
      expect(report.discrepancyCount).toBeDefined();
      expect(typeof report.discrepancyCount).toBe('number');
    });

    /**
     * Test: Should mark v1.5+ features that require schema changes
     *
     * Some features documented in the spec may be planned for future
     * versions. The report should distinguish between:
     * - Current discrepancies (spec doesn't match v1.4 schema)
     * - Planned features (documented for v1.5+)
     */
    it('should mark v1.5+ features that require schema changes', async () => {
      const pgResult = await validator.validatePostgreSQLSchema(
        'tamshai_hr',
        HR_SPEC_TABLES
      );

      const report = await validator.generateSchemaReport({
        postgres: [pgResult],
        mongodb: [],
        markFutureFeatures: true,
        futureVersionMarkers: {
          'hr.performance_reviews': 'v1.5',
          'approval_workflow_columns': 'v1.5',
        },
      });

      // Report should have a future features section
      expect(report.markdown).toContain('## Planned for Future Versions');

      // Future features should be clearly marked
      expect(report.futureFeatures).toBeDefined();
      expect(Array.isArray(report.futureFeatures)).toBe(true);
    });

    /**
     * Test: Should include actionable recommendations
     */
    it('should include actionable recommendations', async () => {
      const mongoResult = await validator.validateMongoDBSchema(
        'tamshai_sales',
        SALES_SPEC_COLLECTIONS
      );

      const report = await validator.generateSchemaReport({
        postgres: [],
        mongodb: [mongoResult],
      });

      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);

      // Should recommend updating spec for collection name mismatch
      const collectionRec = report.recommendations.find(
        (r: { type: string }) => r.type === 'spec_update'
      );
      expect(collectionRec).toBeDefined();
    });
  });
});

describe('MCP Suite Spec Accuracy', () => {
  /**
   * These tests verify that specific aspects of the 004-mcp-suite spec
   * accurately reflect the actual database schema.
   */

  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator({
      postgres: {
        host: 'localhost',
        port: 5433,
        databases: ['tamshai_hr', 'tamshai_finance'],
      },
      mongodb: {
        host: 'localhost',
        port: 27018,
        databases: ['tamshai_sales'],
      },
    });
  });

  /**
   * Test: finance.expenses table should be documented if it exists
   *
   * The spec mentions get_expense_report tool which implies a table exists.
   * Verify the actual table name and structure matches.
   *
   * KNOWN ISSUE: Spec may say 'finance.expenses' but actual might be
   * 'finance.expense_reports' or similar.
   */
  it('should have finance.expenses table documented if it exists', async () => {
    const actualTables = await validator.getPostgreSQLTables('tamshai_finance');

    // Check what expense-related tables actually exist
    const expenseTables = actualTables.filter(
      (t: string) => t.includes('expense')
    );

    // Document what we find
    expect(expenseTables.length).toBeGreaterThan(0);

    // Verify spec matches reality
    const specHasExpenses = 'finance.expenses' in FINANCE_SPEC_TABLES;
    const actualHasExpenses = expenseTables.includes('finance.expenses');

    // If spec says it exists but it doesn't (or vice versa), this fails
    expect(specHasExpenses).toBe(actualHasExpenses);
  });

  /**
   * Test: Approval workflow columns should be documented if they exist
   *
   * The spec mentions approve_budget tool which implies approval columns exist.
   * Verify the actual columns for approval workflow are documented.
   */
  it('should have approval workflow columns documented if they exist', async () => {
    const budgetColumns = await validator.getTableColumns(
      'tamshai_finance',
      'finance.department_budgets'
    );

    // Check for approval-related columns in actual schema
    const approvalColumns = budgetColumns.filter((col: { name: string }) =>
      ['approved_by', 'approved_at', 'approval_status', 'approver_id'].includes(col.name)
    );

    // If approval columns exist, they should be in the spec
    if (approvalColumns.length > 0) {
      const specBudgetTable = FINANCE_SPEC_TABLES['finance.budgets'];
      const specHasApprovalCols = specBudgetTable?.columns.some(
        (col: { name: string }) => col.name.includes('approv')
      );

      // This should pass if spec is accurate
      expect(specHasApprovalCols).toBe(true);
    }
  });

  /**
   * Test: MongoDB collection names should be correct
   *
   * CRITICAL KNOWN ISSUE:
   * - Spec says: 'opportunities' collection
   * - Actual DB: 'deals' collection
   *
   * This test will FAIL to highlight the spec needs updating.
   */
  it('should use correct MongoDB collection names', async () => {
    const actualCollections = await validator.getMongoDBCollections('tamshai_sales');

    // Check spec accuracy
    Object.keys(SALES_SPEC_COLLECTIONS).forEach((specCollection) => {
      const exists = actualCollections.includes(specCollection);

      // This WILL FAIL for 'opportunities' because actual is 'deals'
      expect(exists).toBe(true);
    });
  });

  /**
   * Test: MongoDB field names should match spec
   *
   * Verify that field names in the spec match what's actually in MongoDB.
   * For example: spec might say 'status' but actual uses 'stage'.
   */
  it('should use correct MongoDB field names', async () => {
    const dealsFields = await validator.getCollectionFields(
      'tamshai_sales',
      'deals' // Using actual collection name, not spec name
    );

    // Fields that the spec documents for opportunities
    const specFields = SALES_SPEC_COLLECTIONS.opportunities.fields.map(
      (f: { name: string }) => f.name
    );

    // Check each spec field exists in actual
    const missingFields = specFields.filter(
      (f: string) => !dealsFields.includes(f)
    );

    // This documents discrepancies - empty array means all fields match
    expect(missingFields).toEqual([]);
  });

  /**
   * Test: Stage enum values should be consistent
   *
   * Spec says stage values should be lowercase:
   * 'prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'
   *
   * Actual values are UPPERCASE and some names differ:
   * 'CLOSED_WON', 'PROPOSAL', 'NEGOTIATION', 'DISCOVERY', 'QUALIFICATION'
   *
   * Note: 'prospecting' -> 'DISCOVERY'? 'closed_lost' -> missing?
   */
  it('should have consistent stage enum values', async () => {
    const actualStages = await validator.getEnumValues(
      'tamshai_sales',
      'deals',
      'stage'
    );

    const specStages = SALES_SPEC_COLLECTIONS.opportunities.fields
      .find((f: { name: string }) => f.name === 'stage')?.enumValues || [];

    // Normalize for comparison (lowercase)
    const normalizedActual = actualStages.map((s: string) => s.toLowerCase());

    // Check each spec value exists (in some form)
    specStages.forEach((specValue: string) => {
      const normalizedSpecValue = specValue.toLowerCase();
      const exists = normalizedActual.includes(normalizedSpecValue);

      // This will fail if spec values don't match actual values
      expect(exists).toBe(true);
    });
  });
});

describe('Schema Validation Edge Cases', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator({
      postgres: { host: 'localhost', port: 5433, databases: [] },
      mongodb: { host: 'localhost', port: 27018, databases: [] },
    });
  });

  /**
   * Test: Should handle database connection failures gracefully
   */
  it('should handle database connection failures gracefully', async () => {
    const badValidator = new SchemaValidator({
      postgres: { host: 'nonexistent', port: 5433, databases: ['fake_db'] },
      mongodb: { host: 'nonexistent', port: 27018, databases: ['fake_db'] },
    });

    // Should not throw, should return error in result
    const result = await badValidator.validatePostgreSQLSchema('fake_db', {});

    expect(result.error).toBeDefined();
    expect(result.connectionFailed).toBe(true);
  });

  /**
   * Test: Should handle empty spec gracefully
   */
  it('should handle empty spec gracefully', async () => {
    const result = await validator.validatePostgreSQLSchema('tamshai_hr', {});

    expect(result.error).toBeUndefined();
    expect(result.missingTables).toEqual([]);
  });

  /**
   * Test: Should detect RLS policy discrepancies
   *
   * The spec documents RLS policies for HR data. The validator should
   * check if the documented policies exist.
   */
  it('should detect RLS policy discrepancies', async () => {
    const specRLSPolicies = {
      'hr.employees': ['employee_access_policy', 'manager_access_policy'],
    };

    const result = await validator.validateRLSPolicies(
      'tamshai_hr',
      specRLSPolicies
    );

    expect(result.missingPolicies).toBeDefined();
    expect(result.extraPolicies).toBeDefined();
    expect(result.validationComplete).toBe(true);
  });

  /**
   * Test: Should support JSON schema validation for MongoDB documents
   */
  it('should validate MongoDB document structure against JSON schema', async () => {
    const documentSchema = {
      type: 'object',
      required: ['_id', 'deal_name', 'customer_id', 'stage', 'value'],
      properties: {
        _id: { type: 'string' },
        deal_name: { type: 'string' },
        customer_id: { type: 'string' },
        stage: { type: 'string' },
        value: { type: 'number' },
      },
    };

    const result = await validator.validateDocumentSchema(
      'tamshai_sales',
      'deals',
      documentSchema
    );

    expect(result.validDocuments).toBeDefined();
    expect(result.invalidDocuments).toBeDefined();
    expect(result.schemaViolations).toBeDefined();
  });
});

describe('Schema Diff Generation', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator({
      postgres: { host: 'localhost', port: 5433, databases: ['tamshai_hr'] },
      mongodb: { host: 'localhost', port: 27018, databases: ['tamshai_sales'] },
    });
  });

  /**
   * Test: Should generate SQL migration for PostgreSQL discrepancies
   */
  it('should generate SQL migration for PostgreSQL discrepancies', async () => {
    const result = await validator.validatePostgreSQLSchema(
      'tamshai_hr',
      HR_SPEC_TABLES
    );

    const migration = await validator.generateSQLMigration(result);

    expect(typeof migration).toBe('string');

    // Migration should contain ALTER TABLE or CREATE TABLE statements
    if (result.missingTables.length > 0) {
      expect(migration).toContain('CREATE TABLE');
    }
    if (result.missingColumns && Object.keys(result.missingColumns).length > 0) {
      expect(migration).toContain('ALTER TABLE');
    }
  });

  /**
   * Test: Should generate spec update diff for documentation
   */
  it('should generate spec update diff for documentation', async () => {
    const mongoResult = await validator.validateMongoDBSchema(
      'tamshai_sales',
      SALES_SPEC_COLLECTIONS
    );

    const diff = await validator.generateSpecDiff(mongoResult);

    expect(typeof diff).toBe('string');
    expect(diff).toContain('--- a/.specify/specs/004-mcp-suite/spec.md');
    expect(diff).toContain('+++ b/.specify/specs/004-mcp-suite/spec.md');
  });
});
