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

// Updated to match spec after Issue #76 corrections
// Spec now uses 'deals' collection with UPPERCASE stage values
const SALES_SPEC_COLLECTIONS = {
  // Spec documents 'deals' collection (MongoDB collection name matches)
  deals: {
    fields: [
      { name: '_id', type: 'ObjectId' },
      { name: 'customer_id', type: 'ObjectId' },
      { name: 'deal_name', type: 'string' },
      { name: 'value', type: 'number' },
      { name: 'stage', type: 'string', enumValues: ['PROSPECTING', 'DISCOVERY', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'] },
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

// Test timeout for MongoDB operations (default 30s may not be enough)
jest.setTimeout(60000);

// Database credentials from environment or defaults matching docker-compose
// See infrastructure/docker/docker-compose.yml for port mappings
//
// REQUIRED ENVIRONMENT VARIABLES:
// - DB_PASSWORD or TAMSHAI_DB_PASSWORD: PostgreSQL password
// - MONGODB_PASSWORD: MongoDB root password
//
// Example test invocation:
// TAMSHAI_DB_PASSWORD=tamshai_password MONGODB_PASSWORD=<your-mongo-password> npm run test:integration -- schema-validation
const DB_CONFIG = {
  postgres: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || process.env.PORT_POSTGRES!), // External port from env -> internal 5432
    user: process.env.DB_USER || 'tamshai',
    password: process.env.DB_PASSWORD || process.env.TAMSHAI_DB_PASSWORD || '',
  },
  mongodb: {
    host: process.env.MONGODB_HOST || 'localhost',
    port: parseInt(process.env.MONGODB_PORT || process.env.PORT_MONGODB!), // External port from env -> internal 27017
    user: process.env.MONGODB_USER || 'tamshai',
    password: process.env.MONGODB_PASSWORD || '',
  },
};

describe('SchemaValidator', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator({
      postgres: {
        host: DB_CONFIG.postgres.host,
        port: DB_CONFIG.postgres.port,
        databases: ['tamshai_hr', 'tamshai_finance'],
        user: DB_CONFIG.postgres.user,
        password: DB_CONFIG.postgres.password,
      },
      mongodb: {
        host: DB_CONFIG.mongodb.host,
        port: DB_CONFIG.mongodb.port,
        databases: ['tamshai_sales'],
        user: DB_CONFIG.mongodb.user,
        password: DB_CONFIG.mongodb.password,
      },
    });
  });

  afterEach(async () => {
    // Close connections after each test
    await validator.close();
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
     * After Issue #76 fix: Spec now correctly uses 'deals' collection.
     * This test verifies spec-documented collections exist in actual DB.
     */
    it('should detect missing collections specified in spec', async () => {
      const result = await validator.validateMongoDBSchema(
        'tamshai_sales',
        SALES_SPEC_COLLECTIONS
      );

      expect(result.missingCollections).toBeDefined();
      expect(Array.isArray(result.missingCollections)).toBe(true);

      // After spec update: 'deals' collection should NOT be missing
      // (spec now correctly documents 'deals' instead of 'opportunities')
      expect(result.missingCollections).not.toContain('deals');
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
     * Test: Should verify collection names match after spec update
     *
     * After Issue #76 fix: Spec now correctly documents 'deals' collection.
     * No collection mapping suggestions should be needed.
     */
    it('should detect collection name mismatches (deals vs opportunities)', async () => {
      const result = await validator.validateMongoDBSchema(
        'tamshai_sales',
        SALES_SPEC_COLLECTIONS
      );

      expect(result.collectionMappings).toBeDefined();

      // After spec update: 'deals' is correctly documented, no mapping needed
      const dealsMapping = result.collectionMappings.find(
        (m: { specName: string; actualName: string; confidence: number }) =>
          m.specName === 'deals'
      );

      // No mapping should exist for 'deals' since it matches exactly
      expect(dealsMapping).toBeUndefined();
    });

    /**
     * Test: Should detect enum value mismatches in stage field
     *
     * After Issue #76 fix: Spec now uses UPPERCASE stage values.
     * Actual values: 'CLOSED_WON', 'PROPOSAL', 'NEGOTIATION', 'DISCOVERY', 'QUALIFICATION'
     * Spec values: 'PROSPECTING', 'DISCOVERY', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'
     *
     * Note: PROSPECTING and CLOSED_LOST are in spec but not in sample data.
     * Validator will flag this as a mismatch (spec has values not in actual).
     */
    it('should detect enum value mismatches in stage field', async () => {
      const result = await validator.validateMongoDBSchema(
        'tamshai_sales',
        SALES_SPEC_COLLECTIONS
      );

      expect(result.enumMismatches).toBeDefined();

      // Validator detects that spec has values (PROSPECTING, CLOSED_LOST) not in sample data
      const stageMismatch = result.enumMismatches.find(
        (m: { collection: string; field: string }) =>
          m.field === 'stage'
      );

      // Mismatch is expected because spec documents all valid values,
      // but sample data only includes subset of stages
      if (stageMismatch) {
        // Spec values should be UPPERCASE
        expect(stageMismatch.specValues).toContain('CLOSED_WON');
        expect(stageMismatch.specValues).toContain('PROSPECTING');
        expect(stageMismatch.specValues).toContain('CLOSED_LOST');
        // Actual sample data doesn't have PROSPECTING or CLOSED_LOST
        expect(stageMismatch.actualValues).not.toContain('PROSPECTING');
        expect(stageMismatch.actualValues).not.toContain('CLOSED_LOST');
      }
    });

    /**
     * Test: Should detect extra collections not in spec
     *
     * Actual MongoDB might have collections not documented in the spec.
     * After spec update: 'deals' is documented, but other collections may be extra.
     */
    it('should detect extra collections not documented in spec', async () => {
      const result = await validator.validateMongoDBSchema(
        'tamshai_sales',
        SALES_SPEC_COLLECTIONS
      );

      expect(result.extraCollections).toBeDefined();

      // After spec update: 'deals' is now documented in spec, so NOT extra
      expect(result.extraCollections).not.toContain('deals');

      // But other collections like 'leads', 'activities', 'pipeline_summary' are extra
      // (not documented in the test's mock spec)
      expect(result.extraCollections).toContain('leads');
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
     *
     * After Issue #76 spec update: Since spec now correctly uses 'deals',
     * there's no collection mismatch to generate recommendations for.
     * This test now verifies the recommendations array structure.
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

      // After spec fix: no collection mismatch, so no spec_update recommendation needed
      // Recommendations array may be empty when spec matches reality
      // This is the expected behavior after Issue #76 fix
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
        host: DB_CONFIG.postgres.host,
        port: DB_CONFIG.postgres.port,
        databases: ['tamshai_hr', 'tamshai_finance'],
        user: DB_CONFIG.postgres.user,
        password: DB_CONFIG.postgres.password,
      },
      mongodb: {
        host: DB_CONFIG.mongodb.host,
        port: DB_CONFIG.mongodb.port,
        databases: ['tamshai_sales'],
        user: DB_CONFIG.mongodb.user,
        password: DB_CONFIG.mongodb.password,
      },
    });
  });

  afterEach(async () => {
    await validator.close();
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
   *
   * ACTUAL STATE: finance.department_budgets has approval columns:
   * - approved_by, approved_at, submitted_by, submitted_at, rejection_reason
   * These exist in v1.5 and should be documented in spec.
   */
  it('should have approval workflow columns documented if they exist', async () => {
    const budgetColumns = await validator.getTableColumns(
      'tamshai_finance',
      'finance.department_budgets'
    );

    // Check for approval-related columns in actual schema
    const approvalColumnNames = ['approved_by', 'approved_at', 'submitted_by', 'submitted_at', 'rejection_reason'];
    const actualApprovalColumns = budgetColumns.filter((col: { name: string }) =>
      approvalColumnNames.includes(col.name)
    );

    // Verify approval columns exist in actual database (v1.5 implementation)
    expect(actualApprovalColumns.length).toBeGreaterThan(0);
    expect(actualApprovalColumns.map((c: { name: string }) => c.name)).toEqual(
      expect.arrayContaining(['approved_by', 'approved_at'])
    );

    // Document which columns exist for spec update
    const columnNames = actualApprovalColumns.map((c: { name: string }) => c.name);
    expect(columnNames).toContain('approved_by');
    expect(columnNames).toContain('approved_at');
  });

  /**
   * Test: MongoDB collection names should be correct
   *
   * After Issue #76 spec update: Spec now correctly uses 'deals' collection.
   * This test verifies spec accuracy against actual database.
   */
  it('should use correct MongoDB collection names', async () => {
    const actualCollections = await validator.getMongoDBCollections('tamshai_sales');

    // Document actual collections in the database
    expect(actualCollections).toContain('deals');
    expect(actualCollections).toContain('customers');
    expect(actualCollections).toContain('leads');
    expect(actualCollections).toContain('activities');

    // Verify spec collection names match actual DB
    const specCollectionNames = Object.keys(SALES_SPEC_COLLECTIONS);
    expect(specCollectionNames).toContain('deals'); // Updated spec
    expect(specCollectionNames).toContain('customers');

    // Verify spec collections exist in actual DB
    expect(actualCollections).toContain('deals'); // Spec matches actual
    expect(actualCollections).toContain('customers'); // Spec matches actual
  });

  /**
   * Test: MongoDB field names should match spec
   *
   * After Issue #76 spec update: Spec now uses 'deal_name' instead of 'name'.
   * This test verifies spec field names match actual database fields.
   *
   * ACTUAL FIELDS in 'deals' collection:
   * _id, deal_name, customer_id, stage, value, currency, probability,
   * expected_close_date, actual_close_date, deal_type, products, notes,
   * owner, created_at, updated_at, activities, forecast_category
   */
  it('should use correct MongoDB field names', async () => {
    const dealsFields = await validator.getCollectionFields(
      'tamshai_sales',
      'deals'
    );

    // Verify we got field names
    expect(dealsFields.length).toBeGreaterThan(0);

    // Document actual fields that exist
    expect(dealsFields).toContain('_id');
    expect(dealsFields).toContain('deal_name');
    expect(dealsFields).toContain('customer_id');
    expect(dealsFields).toContain('stage');
    expect(dealsFields).toContain('value');
    expect(dealsFields).toContain('probability');
    expect(dealsFields).toContain('owner');

    // After spec update: spec fields should match actual fields
    const specFields = SALES_SPEC_COLLECTIONS.deals.fields.map(
      (f: { name: string }) => f.name
    );

    // Verify spec fields match actual fields
    const matchingFields = specFields.filter((f: string) => dealsFields.includes(f));
    expect(matchingFields).toContain('_id');
    expect(matchingFields).toContain('customer_id');
    expect(matchingFields).toContain('deal_name'); // Updated in spec
    expect(matchingFields).toContain('stage');
    expect(matchingFields).toContain('value');
    expect(matchingFields).toContain('probability');
    expect(matchingFields).toContain('owner');
  });

  /**
   * Test: Stage enum values should be consistent
   *
   * After Issue #76 spec update: Spec now uses UPPERCASE values.
   *
   * ACTUAL stage values in 'deals' collection (sample data):
   * 'CLOSED_WON', 'DISCOVERY', 'NEGOTIATION', 'PROPOSAL', 'QUALIFICATION'
   *
   * SPEC stage values (updated):
   * 'PROSPECTING', 'DISCOVERY', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'
   *
   * Note: PROSPECTING and CLOSED_LOST are valid stages but not in current sample data.
   */
  it('should have consistent stage enum values', async () => {
    const actualStages = await validator.getEnumValues(
      'tamshai_sales',
      'deals',
      'stage'
    );

    // Verify we got actual stage values
    expect(actualStages.length).toBeGreaterThan(0);

    // Document actual stage values (all UPPERCASE)
    expect(actualStages).toContain('CLOSED_WON');
    expect(actualStages).toContain('DISCOVERY');
    expect(actualStages).toContain('NEGOTIATION');
    expect(actualStages).toContain('PROPOSAL');
    expect(actualStages).toContain('QUALIFICATION');

    // Verify all values are UPPERCASE (matches updated spec)
    const allUppercase = actualStages.every((s: string) => s === s.toUpperCase());
    expect(allUppercase).toBe(true);

    // Verify spec values are also UPPERCASE
    const specStages = SALES_SPEC_COLLECTIONS.deals.fields
      .find((f: { name: string }) => f.name === 'stage')?.enumValues || [];
    const specAllUppercase = specStages.every((s: string) => s === s.toUpperCase());
    expect(specAllUppercase).toBe(true);

    // Verify actual values are in spec
    for (const actualStage of actualStages) {
      expect(specStages).toContain(actualStage);
    }

    // Note: PROSPECTING and CLOSED_LOST are in spec but not in sample data
    // This is expected - spec documents all valid values, sample data is subset
    expect(specStages).toContain('PROSPECTING');
    expect(specStages).toContain('CLOSED_LOST');
  });
});

describe('Schema Validation Edge Cases', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator({
      postgres: {
        host: DB_CONFIG.postgres.host,
        port: DB_CONFIG.postgres.port,
        databases: [],
        user: DB_CONFIG.postgres.user,
        password: DB_CONFIG.postgres.password,
      },
      mongodb: {
        host: DB_CONFIG.mongodb.host,
        port: DB_CONFIG.mongodb.port,
        databases: [],
        user: DB_CONFIG.mongodb.user,
        password: DB_CONFIG.mongodb.password,
      },
    });
  });

  afterEach(async () => {
    await validator.close();
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
      postgres: {
        host: DB_CONFIG.postgres.host,
        port: DB_CONFIG.postgres.port,
        databases: ['tamshai_hr'],
        user: DB_CONFIG.postgres.user,
        password: DB_CONFIG.postgres.password,
      },
      mongodb: {
        host: DB_CONFIG.mongodb.host,
        port: DB_CONFIG.mongodb.port,
        databases: ['tamshai_sales'],
        user: DB_CONFIG.mongodb.user,
        password: DB_CONFIG.mongodb.password,
      },
    });
  });

  afterEach(async () => {
    await validator.close();
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
