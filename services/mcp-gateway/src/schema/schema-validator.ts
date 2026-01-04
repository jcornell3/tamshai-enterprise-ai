/**
 * Schema Validator for Issue #76
 *
 * Validates database schemas against specification documents.
 * Supports PostgreSQL and MongoDB schema validation.
 *
 * @see .specify/specs/004-mcp-suite/spec.md
 * @see https://github.com/jcornell3/tamshai-enterprise-ai/issues/76
 */

import { Client as PgClient } from 'pg';
import { MongoClient, Db } from 'mongodb';
import {
  SchemaValidatorConfig,
  PostgreSQLSchemaInfo,
  MongoDBSchemaInfo,
  Column,
  SpecTables,
  SpecCollections,
  CollectionMapping,
  RLSPolicyResult,
  DocumentSchemaResult,
  SchemaViolation,
  JSONSchema,
  SpecRLSPolicies,
} from './types';
import {
  SchemaReport,
  SchemaDiscrepancy,
  Recommendation,
  FutureFeature,
  ReportInput,
} from './report';

/**
 * SchemaValidator class for validating database schemas against specifications
 */
export class SchemaValidator {
  private config: SchemaValidatorConfig;
  private pgClients: Map<string, PgClient> = new Map();
  private mongoClient: MongoClient | null = null;

  constructor(config: SchemaValidatorConfig) {
    this.config = config;
  }

  /**
   * Validate PostgreSQL schema against specification
   */
  async validatePostgreSQLSchema(
    database: string,
    specTables: SpecTables
  ): Promise<PostgreSQLSchemaInfo> {
    const result: PostgreSQLSchemaInfo = {
      database,
      validationComplete: false,
      missingTables: [],
      missingColumns: {},
      extraColumns: {},
      typeMismatches: [],
      missingForeignKeys: [],
      columnMismatches: {},
    };

    try {
      // Ensure connection is established (client stored in Map for reuse)
      await this.getPostgresClient(database);

      // Get actual tables from database
      const actualTables = await this.getPostgreSQLTables(database);

      // Check for missing tables
      for (const specTable of Object.keys(specTables)) {
        if (!actualTables.includes(specTable)) {
          result.missingTables.push(specTable);
        }
      }

      // For each existing table, validate columns
      for (const [tableName, tableSpec] of Object.entries(specTables)) {
        if (actualTables.includes(tableName)) {
          const actualColumns = await this.getTableColumns(database, tableName);
          const actualColumnNames = actualColumns.map(c => c.name);
          const specColumnNames = tableSpec.columns.map(c => c.name);

          // Missing columns (in spec but not in actual)
          const missingCols = specColumnNames.filter(c => !actualColumnNames.includes(c));
          if (missingCols.length > 0) {
            result.missingColumns[tableName] = missingCols;
          }

          // Extra columns (in actual but not in spec)
          const extraCols = actualColumnNames.filter(c => !specColumnNames.includes(c));
          if (extraCols.length > 0) {
            result.extraColumns[tableName] = extraCols;
          }

          // Type mismatches
          for (const specCol of tableSpec.columns) {
            const actualCol = actualColumns.find(c => c.name === specCol.name);
            if (actualCol && !this.typesMatch(specCol.type, actualCol.type)) {
              result.typeMismatches.push({
                table: tableName,
                column: specCol.name,
                specType: specCol.type,
                actualType: actualCol.type,
              });
            }
          }

          // Check foreign keys
          if (tableSpec.foreignKeys) {
            const actualFks = await this.getTableForeignKeys(database, tableName);
            for (const specFk of tableSpec.foreignKeys) {
              const fkExists = actualFks.some(
                fk => fk.column === specFk.column && fk.references === specFk.references
              );
              if (!fkExists) {
                result.missingForeignKeys.push({
                  table: tableName,
                  column: specFk.column,
                  expectedReference: specFk.references,
                });
              }
            }
          }
        }
      }

      result.validationComplete = true;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      result.connectionFailed = true;
    }

    return result;
  }

  /**
   * Validate MongoDB schema against specification
   */
  async validateMongoDBSchema(
    database: string,
    specCollections: SpecCollections
  ): Promise<MongoDBSchemaInfo> {
    const result: MongoDBSchemaInfo = {
      database,
      validationComplete: false,
      missingCollections: [],
      extraCollections: [],
      fieldNameMismatches: [],
      collectionMappings: [],
      enumMismatches: [],
    };

    try {
      const actualCollections = await this.getMongoDBCollections(database);
      const specCollectionNames = Object.keys(specCollections);

      // Check for missing collections
      for (const specCollection of specCollectionNames) {
        if (!actualCollections.includes(specCollection)) {
          result.missingCollections.push(specCollection);

          // Try to find a similar collection for mapping suggestion
          const mapping = this.findSimilarCollection(specCollection, actualCollections);
          if (mapping) {
            result.collectionMappings.push(mapping);
          }
        }
      }

      // Check for extra collections (in actual but not in spec)
      for (const actualCollection of actualCollections) {
        if (!specCollectionNames.includes(actualCollection)) {
          result.extraCollections.push(actualCollection);
        }
      }

      // For each existing collection, validate fields and enums
      for (const [collectionName, collectionSpec] of Object.entries(specCollections)) {
        // Check if this collection exists or has a mapping
        const actualName = actualCollections.includes(collectionName)
          ? collectionName
          : result.collectionMappings.find(m => m.specName === collectionName)?.actualName;

        if (actualName) {
          // Check enum mismatches
          for (const field of collectionSpec.fields) {
            if (field.enumValues && field.enumValues.length > 0) {
              const actualValues = await this.getEnumValues(database, actualName, field.name);

              if (actualValues.length > 0) {
                const specLower = field.enumValues.map(v => v.toLowerCase());
                const actualLower = actualValues.map(v => v.toLowerCase());

                const hasAllValues = specLower.every(v => actualLower.includes(v));
                const caseMismatch = !hasAllValues && specLower.some(v => actualLower.includes(v));

                if (!hasAllValues || caseMismatch) {
                  result.enumMismatches.push({
                    collection: collectionName,
                    field: field.name,
                    specValues: field.enumValues,
                    actualValues,
                    caseMismatch,
                  });
                }
              }
            }
          }

          // Check field name mismatches
          const actualFields = await this.getCollectionFields(database, actualName);
          const specFieldNames = collectionSpec.fields.map(f => f.name);

          for (const specField of specFieldNames) {
            if (!actualFields.includes(specField)) {
              // Try to find a similar field
              const similarField = this.findSimilarField(specField, actualFields);
              if (similarField) {
                result.fieldNameMismatches.push({
                  collection: collectionName,
                  specFieldName: specField,
                  actualFieldName: similarField,
                  confidence: this.calculateSimilarity(specField, similarField),
                });
              }
            }
          }
        }
      }

      result.validationComplete = true;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      result.connectionFailed = true;
    }

    return result;
  }

  /**
   * Generate a markdown report from validation results
   */
  async generateSchemaReport(input: ReportInput): Promise<SchemaReport> {
    const discrepancies: SchemaDiscrepancy[] = [];
    const recommendations: Recommendation[] = [];
    const futureFeatures: FutureFeature[] = [];

    // Process PostgreSQL results
    for (const pgResult of input.postgres) {
      // Missing tables
      for (const table of pgResult.missingTables) {
        const isFutureFeature = input.markFutureFeatures &&
          input.futureVersionMarkers &&
          input.futureVersionMarkers[table];

        if (isFutureFeature) {
          futureFeatures.push({
            feature: `Table ${table}`,
            plannedVersion: input.futureVersionMarkers![table],
            entity: table,
            description: `Table ${table} is planned for ${input.futureVersionMarkers![table]}`,
          });
        } else {
          discrepancies.push({
            type: 'missing_table',
            severity: 'critical',
            database: pgResult.database,
            entity: table,
            message: `Table ${table} is documented in spec but does not exist in database`,
            suggestedFix: `CREATE TABLE ${table} (...) or update spec to remove table`,
          });
        }
      }

      // Missing columns
      for (const [table, columns] of Object.entries(pgResult.missingColumns)) {
        for (const column of columns) {
          discrepancies.push({
            type: 'missing_column',
            severity: 'warning',
            database: pgResult.database,
            entity: table,
            field: column,
            message: `Column ${column} is documented in spec for ${table} but does not exist`,
            suggestedFix: `ALTER TABLE ${table} ADD COLUMN ${column} ... or update spec`,
          });
        }
      }

      // Extra columns
      for (const [table, columns] of Object.entries(pgResult.extraColumns)) {
        for (const column of columns) {
          discrepancies.push({
            type: 'extra_column',
            severity: 'info',
            database: pgResult.database,
            entity: table,
            field: column,
            message: `Column ${column} exists in ${table} but is not documented in spec`,
            suggestedFix: `Update spec to document column ${column}`,
          });
        }
      }

      // Type mismatches
      for (const mismatch of pgResult.typeMismatches) {
        discrepancies.push({
          type: 'type_mismatch',
          severity: 'warning',
          database: pgResult.database,
          entity: mismatch.table,
          field: mismatch.column,
          specValue: mismatch.specType,
          actualValue: mismatch.actualType,
          message: `Column ${mismatch.column} in ${mismatch.table}: spec says ${mismatch.specType}, actual is ${mismatch.actualType}`,
        });
      }

      // Missing foreign keys
      for (const fk of pgResult.missingForeignKeys) {
        discrepancies.push({
          type: 'missing_foreign_key',
          severity: 'warning',
          database: pgResult.database,
          entity: fk.table,
          field: fk.column,
          specValue: fk.expectedReference,
          message: `Foreign key ${fk.column} -> ${fk.expectedReference} is documented but does not exist`,
        });
      }
    }

    // Process MongoDB results
    for (const mongoResult of input.mongodb) {
      // Missing collections
      for (const collection of mongoResult.missingCollections) {
        discrepancies.push({
          type: 'missing_collection',
          severity: 'critical',
          database: mongoResult.database,
          entity: collection,
          message: `Collection ${collection} is documented in spec but does not exist`,
        });

        // Add recommendation for collection name mismatch
        const mapping = mongoResult.collectionMappings.find(m => m.specName === collection);
        if (mapping) {
          recommendations.push({
            type: 'spec_update',
            priority: 'high',
            title: `Update collection name: ${collection} -> ${mapping.actualName}`,
            description: `Spec documents '${collection}' but actual collection is '${mapping.actualName}'`,
            affectedEntities: [collection, mapping.actualName],
            suggestedAction: `Update spec.md to use '${mapping.actualName}' instead of '${collection}'`,
          });
        }
      }

      // Extra collections
      for (const collection of mongoResult.extraCollections) {
        discrepancies.push({
          type: 'extra_collection',
          severity: 'info',
          database: mongoResult.database,
          entity: collection,
          message: `Collection ${collection} exists but is not documented in spec`,
        });
      }

      // Enum mismatches
      for (const enumMismatch of mongoResult.enumMismatches) {
        discrepancies.push({
          type: 'enum_mismatch',
          severity: 'warning',
          database: mongoResult.database,
          entity: enumMismatch.collection,
          field: enumMismatch.field,
          specValue: enumMismatch.specValues.join(', '),
          actualValue: enumMismatch.actualValues.join(', '),
          message: `Enum values for ${enumMismatch.field} differ. Case mismatch: ${enumMismatch.caseMismatch}`,
        });
      }
    }

    // Check for future features in approval workflow columns
    if (input.markFutureFeatures && input.futureVersionMarkers) {
      for (const [feature, version] of Object.entries(input.futureVersionMarkers)) {
        if (feature === 'approval_workflow_columns') {
          futureFeatures.push({
            feature: 'Approval Workflow Columns',
            plannedVersion: version,
            entity: 'finance.department_budgets',
            description: 'Approval workflow columns (approved_by, approved_at, etc.) planned for future release',
          });
        }
      }
    }

    // Generate markdown
    const markdown = this.generateMarkdown(discrepancies, recommendations, futureFeatures, input);

    // Calculate summary
    const summary = {
      totalDiscrepancies: discrepancies.length,
      criticalCount: discrepancies.filter(d => d.severity === 'critical').length,
      warningCount: discrepancies.filter(d => d.severity === 'warning').length,
      infoCount: discrepancies.filter(d => d.severity === 'info').length,
      postgresIssues: discrepancies.filter(d =>
        input.postgres.some(p => p.database === d.database)
      ).length,
      mongodbIssues: discrepancies.filter(d =>
        input.mongodb.some(m => m.database === d.database)
      ).length,
      tablesValidated: Object.keys(input.postgres.reduce((acc, p) => {
        Object.keys(p.missingColumns).forEach(t => acc[t] = true);
        Object.keys(p.extraColumns).forEach(t => acc[t] = true);
        return acc;
      }, {} as Record<string, boolean>)).length,
      collectionsValidated: Object.keys(input.mongodb.reduce((acc, m) => {
        m.missingCollections.forEach(c => acc[c] = true);
        m.extraCollections.forEach(c => acc[c] = true);
        return acc;
      }, {} as Record<string, boolean>)).length,
    };

    return {
      markdown,
      discrepancyCount: discrepancies.length,
      discrepancies,
      recommendations,
      futureFeatures,
      generatedAt: new Date().toISOString(),
      summary,
    };
  }

  /**
   * Get list of PostgreSQL tables in a database
   */
  async getPostgreSQLTables(database: string): Promise<string[]> {
    try {
      const client = await this.getPostgresClient(database);
      const result = await client.query(`
        SELECT schemaname || '.' || tablename AS full_name
        FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY full_name
      `);
      return result.rows.map(row => row.full_name);
    } catch (error) {
      throw new Error(`Failed to get PostgreSQL tables: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Get column information for a table
   */
  async getTableColumns(database: string, table: string): Promise<Column[]> {
    try {
      const client = await this.getPostgresClient(database);
      const [schema, tableName] = table.includes('.')
        ? table.split('.')
        : ['public', table];

      const result = await client.query(`
        SELECT
          column_name as name,
          data_type || CASE
            WHEN character_maximum_length IS NOT NULL
            THEN '(' || character_maximum_length || ')'
            WHEN numeric_precision IS NOT NULL AND numeric_scale IS NOT NULL
            THEN '(' || numeric_precision || ',' || numeric_scale || ')'
            ELSE ''
          END as type,
          is_nullable = 'YES' as nullable
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [schema, tableName]);

      return result.rows.map(row => ({
        name: row.name,
        type: row.type,
        nullable: row.nullable,
      }));
    } catch (error) {
      throw new Error(`Failed to get table columns: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Get foreign key information for a table
   */
  private async getTableForeignKeys(
    database: string,
    table: string
  ): Promise<{ column: string; references: string }[]> {
    try {
      const client = await this.getPostgresClient(database);
      const [schema, tableName] = table.includes('.')
        ? table.split('.')
        : ['public', table];

      const result = await client.query(`
        SELECT
          kcu.column_name as column,
          ccu.table_schema || '.' || ccu.table_name || '(' || ccu.column_name || ')' as references
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2
      `, [schema, tableName]);

      return result.rows;
    } catch {
      return [];
    }
  }

  /**
   * Get list of MongoDB collections in a database
   */
  async getMongoDBCollections(database: string): Promise<string[]> {
    try {
      const db = await this.getMongoDb(database);
      const collections = await db.listCollections().toArray();
      return collections.map((c: { name: string }) => c.name);
    } catch (error) {
      throw new Error(`Failed to get MongoDB collections: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Get field names from a MongoDB collection (sampled from documents)
   */
  async getCollectionFields(database: string, collection: string): Promise<string[]> {
    try {
      const db = await this.getMongoDb(database);
      const coll = db.collection(collection);

      // Sample documents to get field names
      const docs = await coll.find().limit(100).toArray();
      const fields = new Set<string>();

      for (const doc of docs) {
        this.extractFieldNames(doc, '', fields);
      }

      return Array.from(fields);
    } catch (error) {
      throw new Error(`Failed to get collection fields: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Get distinct enum values for a field in a MongoDB collection
   */
  async getEnumValues(database: string, collection: string, field: string): Promise<string[]> {
    try {
      const db = await this.getMongoDb(database);
      const coll = db.collection(collection);

      const values = await coll.distinct(field);
      return values.filter((v: unknown) => typeof v === 'string') as string[];
    } catch {
      return [];
    }
  }

  /**
   * Validate RLS policies against specification
   */
  async validateRLSPolicies(
    database: string,
    specPolicies: SpecRLSPolicies
  ): Promise<RLSPolicyResult> {
    const result: RLSPolicyResult = {
      database,
      validationComplete: false,
      missingPolicies: {},
      extraPolicies: {},
    };

    try {
      const client = await this.getPostgresClient(database);

      for (const [table, expectedPolicies] of Object.entries(specPolicies)) {
        const [schema, tableName] = table.includes('.')
          ? table.split('.')
          : ['public', table];

        // Get actual policies
        const actualResult = await client.query(`
          SELECT polname
          FROM pg_policies
          WHERE schemaname = $1 AND tablename = $2
        `, [schema, tableName]);

        const actualPolicies = actualResult.rows.map(r => r.polname);

        // Missing policies (in spec but not in actual)
        const missing = expectedPolicies.filter(p => !actualPolicies.includes(p));
        if (missing.length > 0) {
          result.missingPolicies[table] = missing;
        }

        // Extra policies (in actual but not in spec)
        const extra = actualPolicies.filter(p => !expectedPolicies.includes(p));
        if (extra.length > 0) {
          result.extraPolicies[table] = extra;
        }
      }

      result.validationComplete = true;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      result.connectionFailed = true;
    }

    return result;
  }

  /**
   * Validate MongoDB documents against a JSON schema
   */
  async validateDocumentSchema(
    database: string,
    collection: string,
    schema: JSONSchema
  ): Promise<DocumentSchemaResult> {
    const result: DocumentSchemaResult = {
      collection,
      validDocuments: 0,
      invalidDocuments: 0,
      schemaViolations: [],
    };

    try {
      const db = await this.getMongoDb(database);
      const coll = db.collection(collection);

      const docs = await coll.find().limit(1000).toArray();

      for (const doc of docs) {
        const violations = this.validateDocument(doc, schema);

        if (violations.length === 0) {
          result.validDocuments++;
        } else {
          result.invalidDocuments++;
          result.schemaViolations.push(...violations.map(v => ({
            ...v,
            documentId: doc._id?.toString() || 'unknown',
          })));
        }
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      result.connectionFailed = true;
    }

    return result;
  }

  /**
   * Generate SQL migration statements for PostgreSQL discrepancies
   */
  async generateSQLMigration(result: PostgreSQLSchemaInfo): Promise<string> {
    const statements: string[] = [];

    statements.push(`-- Migration generated on ${new Date().toISOString()}`);
    statements.push(`-- Database: ${result.database}`);
    statements.push('');

    // Create missing tables
    for (const table of result.missingTables) {
      statements.push(`-- TODO: Define columns for ${table}`);
      statements.push(`CREATE TABLE IF NOT EXISTS ${table} (`);
      statements.push('  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),');
      statements.push('  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),');
      statements.push('  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
      statements.push(');');
      statements.push('');
    }

    // Add missing columns
    for (const [table, columns] of Object.entries(result.missingColumns)) {
      for (const column of columns) {
        statements.push(`-- TODO: Specify correct data type for ${column}`);
        statements.push(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} TEXT;`);
      }
    }
    statements.push('');

    // Add missing foreign keys
    for (const fk of result.missingForeignKeys) {
      const constraintName = `fk_${fk.table.replace('.', '_')}_${fk.column}`;
      statements.push(`-- TODO: Verify foreign key reference`);
      statements.push(`ALTER TABLE ${fk.table} ADD CONSTRAINT ${constraintName}`);
      statements.push(`  FOREIGN KEY (${fk.column}) REFERENCES ${fk.expectedReference};`);
    }

    return statements.join('\n');
  }

  /**
   * Generate a spec update diff for documentation
   */
  async generateSpecDiff(result: MongoDBSchemaInfo): Promise<string> {
    const lines: string[] = [];

    lines.push('--- a/.specify/specs/004-mcp-suite/spec.md');
    lines.push('+++ b/.specify/specs/004-mcp-suite/spec.md');
    lines.push('@@ -1,1 +1,1 @@');
    lines.push('');

    // Collection name changes
    for (const mapping of result.collectionMappings) {
      lines.push(`-Collection: ${mapping.specName}`);
      lines.push(`+Collection: ${mapping.actualName}`);
      lines.push('');
    }

    // Extra collections to document
    for (const collection of result.extraCollections) {
      lines.push(`+## ${collection} Collection`);
      lines.push('+');
      lines.push(`+Add documentation for ${collection} collection.`);
      lines.push('');
    }

    // Enum value updates
    for (const mismatch of result.enumMismatches) {
      lines.push(`-${mismatch.field}: [${mismatch.specValues.join(', ')}]`);
      lines.push(`+${mismatch.field}: [${mismatch.actualValues.join(', ')}]`);
      lines.push('');
    }

    return lines.join('\n');
  }

  // Private helper methods

  private async getPostgresClient(database: string): Promise<PgClient> {
    if (this.pgClients.has(database)) {
      return this.pgClients.get(database)!;
    }

    const client = new PgClient({
      host: this.config.postgres.host,
      port: this.config.postgres.port,
      database,
      user: this.config.postgres.user || 'tamshai',
      password: this.config.postgres.password || 'changeme',
    });

    await client.connect();
    this.pgClients.set(database, client);
    return client;
  }

  private async getMongoDb(database: string): Promise<Db> {
    if (!this.mongoClient) {
      const uri = `mongodb://${this.config.mongodb.host}:${this.config.mongodb.port}`;
      this.mongoClient = new MongoClient(uri, {
        auth: this.config.mongodb.user ? {
          username: this.config.mongodb.user,
          password: this.config.mongodb.password,
        } : undefined,
      });
      await this.mongoClient.connect();
    }

    return this.mongoClient.db(database);
  }

  private typesMatch(specType: string, actualType: string): boolean {
    // Normalize types for comparison
    const normalize = (t: string) => t.toLowerCase()
      .replace(/character varying/, 'varchar')
      .replace(/\s+/g, '')
      .trim();

    const spec = normalize(specType);
    const actual = normalize(actualType);

    // Exact match
    if (spec === actual) return true;

    // Partial match (e.g., varchar vs varchar(100))
    if (spec.startsWith(actual.split('(')[0]) || actual.startsWith(spec.split('(')[0])) {
      return true;
    }

    return false;
  }

  private findSimilarCollection(
    specName: string,
    actualCollections: string[]
  ): CollectionMapping | null {
    // Common synonyms
    const synonyms: Record<string, string[]> = {
      'opportunities': ['deals', 'sales_opportunities', 'pipeline'],
      'customers': ['clients', 'accounts'],
      'tickets': ['issues', 'support_tickets', 'cases'],
    };

    const specSynonyms = synonyms[specName] || [];

    for (const actual of actualCollections) {
      // Check synonyms
      if (specSynonyms.includes(actual)) {
        return {
          specName,
          actualName: actual,
          confidence: 0.9,
        };
      }

      // Check string similarity
      const similarity = this.calculateSimilarity(specName, actual);
      if (similarity > 0.6) {
        return {
          specName,
          actualName: actual,
          confidence: similarity,
        };
      }
    }

    return null;
  }

  private findSimilarField(specField: string, actualFields: string[]): string | null {
    for (const actual of actualFields) {
      const similarity = this.calculateSimilarity(specField, actual);
      if (similarity > 0.7) {
        return actual;
      }
    }
    return null;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Simple Levenshtein-based similarity
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  private extractFieldNames(obj: Record<string, unknown>, _prefix: string, fields: Set<string>): void {
    for (const key of Object.keys(obj)) {
      fields.add(key); // Add just the field name, not full path

      const value = obj[key];
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // Don't recurse into nested objects for simple field comparison
        // But we do add nested field names
      }
    }
  }

  private validateDocument(
    doc: Record<string, unknown>,
    schema: JSONSchema
  ): Omit<SchemaViolation, 'documentId'>[] {
    const violations: Omit<SchemaViolation, 'documentId'>[] = [];

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in doc)) {
          violations.push({
            field,
            expectedType: schema.properties?.[field]?.type || 'any',
            actualType: 'undefined',
            message: `Required field '${field}' is missing`,
          });
        }
      }
    }

    // Check field types
    if (schema.properties) {
      for (const [field, fieldSchema] of Object.entries(schema.properties)) {
        if (field in doc) {
          const actualType = this.getJsType(doc[field]);
          if (fieldSchema.type !== actualType) {
            violations.push({
              field,
              expectedType: fieldSchema.type,
              actualType,
              message: `Field '${field}' has type '${actualType}', expected '${fieldSchema.type}'`,
            });
          }
        }
      }
    }

    return violations;
  }

  private getJsType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  private generateMarkdown(
    discrepancies: SchemaDiscrepancy[],
    recommendations: Recommendation[],
    futureFeatures: FutureFeature[],
    input: ReportInput
  ): string {
    const lines: string[] = [];

    lines.push('# Schema Validation Report');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push(`- Total Discrepancies: ${discrepancies.length}`);
    lines.push(`- Critical: ${discrepancies.filter(d => d.severity === 'critical').length}`);
    lines.push(`- Warning: ${discrepancies.filter(d => d.severity === 'warning').length}`);
    lines.push(`- Info: ${discrepancies.filter(d => d.severity === 'info').length}`);
    lines.push('');

    // PostgreSQL Discrepancies
    lines.push('## PostgreSQL Discrepancies');
    lines.push('');
    const pgDiscrepancies = discrepancies.filter(d =>
      input.postgres.some(p => p.database === d.database)
    );
    if (pgDiscrepancies.length === 0) {
      lines.push('No PostgreSQL discrepancies found.');
    } else {
      for (const d of pgDiscrepancies) {
        lines.push(`### ${d.severity.toUpperCase()}: ${d.type}`);
        lines.push(`- Database: ${d.database}`);
        lines.push(`- Entity: ${d.entity}`);
        if (d.field) lines.push(`- Field: ${d.field}`);
        lines.push(`- Message: ${d.message}`);
        if (d.suggestedFix) lines.push(`- Suggested Fix: ${d.suggestedFix}`);
        lines.push('');
      }
    }
    lines.push('');

    // MongoDB Discrepancies
    lines.push('## MongoDB Discrepancies');
    lines.push('');
    const mongoDiscrepancies = discrepancies.filter(d =>
      input.mongodb.some(m => m.database === d.database)
    );
    if (mongoDiscrepancies.length === 0) {
      lines.push('No MongoDB discrepancies found.');
    } else {
      for (const d of mongoDiscrepancies) {
        lines.push(`### ${d.severity.toUpperCase()}: ${d.type}`);
        lines.push(`- Database: ${d.database}`);
        lines.push(`- Entity: ${d.entity}`);
        if (d.field) lines.push(`- Field: ${d.field}`);
        lines.push(`- Message: ${d.message}`);
        lines.push('');
      }
    }
    lines.push('');

    // Future Features
    if (futureFeatures.length > 0) {
      lines.push('## Planned for Future Versions');
      lines.push('');
      for (const f of futureFeatures) {
        lines.push(`### ${f.feature} (${f.plannedVersion})`);
        lines.push(`- Entity: ${f.entity}`);
        lines.push(`- Description: ${f.description}`);
        lines.push('');
      }
    }

    // Recommendations
    if (recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (const r of recommendations) {
        lines.push(`### [${r.priority.toUpperCase()}] ${r.title}`);
        lines.push(`- Type: ${r.type}`);
        lines.push(`- Description: ${r.description}`);
        lines.push(`- Suggested Action: ${r.suggestedAction}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Close all database connections
   */
  async close(): Promise<void> {
    for (const client of this.pgClients.values()) {
      await client.end();
    }
    this.pgClients.clear();

    if (this.mongoClient) {
      await this.mongoClient.close();
      this.mongoClient = null;
    }
  }
}
