/**
 * Schema Report Types for Issue #76
 *
 * Types for generating schema validation reports.
 *
 * @see .specify/specs/004-mcp-suite/spec.md
 * @see https://github.com/jcornell3/tamshai-enterprise-ai/issues/76
 */

/**
 * Schema discrepancy type enumeration
 */
export type DiscrepancyType =
  | 'missing_table'
  | 'missing_column'
  | 'extra_column'
  | 'type_mismatch'
  | 'missing_foreign_key'
  | 'missing_collection'
  | 'extra_collection'
  | 'field_name_mismatch'
  | 'enum_mismatch'
  | 'missing_policy'
  | 'extra_policy'
  | 'collection_name_mismatch';

/**
 * Severity level for discrepancies
 */
export type Severity = 'critical' | 'warning' | 'info';

/**
 * Schema discrepancy details
 */
export interface SchemaDiscrepancy {
  type: DiscrepancyType;
  severity: Severity;
  database: string;
  entity: string; // Table or collection name
  field?: string;
  specValue?: string;
  actualValue?: string;
  message: string;
  suggestedFix?: string;
}

/**
 * Recommendation type for schema fixes
 */
export type RecommendationType = 'spec_update' | 'schema_migration' | 'data_migration' | 'manual_review';

/**
 * Recommendation for fixing schema discrepancies
 */
export interface Recommendation {
  type: RecommendationType;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  affectedEntities: string[];
  suggestedAction: string;
}

/**
 * Future feature marker
 */
export interface FutureFeature {
  feature: string;
  plannedVersion: string;
  entity: string;
  description: string;
}

/**
 * Schema report generation options
 */
export interface SchemaReportOptions {
  markFutureFeatures?: boolean;
  futureVersionMarkers?: Record<string, string>;
}

/**
 * Complete schema validation report
 */
export interface SchemaReport {
  markdown: string;
  discrepancyCount: number;
  discrepancies: SchemaDiscrepancy[];
  recommendations: Recommendation[];
  futureFeatures: FutureFeature[];
  generatedAt: string;
  summary: ReportSummary;
}

/**
 * Report summary statistics
 */
export interface ReportSummary {
  totalDiscrepancies: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  postgresIssues: number;
  mongodbIssues: number;
  tablesValidated: number;
  collectionsValidated: number;
}

/**
 * Input for report generation
 */
export interface ReportInput {
  postgres: import('./types').PostgreSQLSchemaInfo[];
  mongodb: import('./types').MongoDBSchemaInfo[];
  markFutureFeatures?: boolean;
  futureVersionMarkers?: Record<string, string>;
}
