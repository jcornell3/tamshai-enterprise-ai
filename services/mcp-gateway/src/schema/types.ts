/**
 * Schema Validation Types for Issue #76
 *
 * These types support schema validation between specifications
 * and actual database schemas (PostgreSQL and MongoDB).
 *
 * @see .specify/specs/004-mcp-suite/spec.md
 * @see https://github.com/jcornell3/tamshai-enterprise-ai/issues/76
 */

/**
 * Column definition for PostgreSQL tables
 */
export interface Column {
  name: string;
  type: string;
  nullable: boolean;
}

/**
 * Foreign key definition for PostgreSQL tables
 */
export interface ForeignKey {
  column: string;
  references: string;
}

/**
 * Table definition for PostgreSQL schemas
 */
export interface Table {
  columns: Column[];
  foreignKeys: ForeignKey[];
}

/**
 * Field definition for MongoDB collections
 */
export interface Field {
  name: string;
  type: string;
  enumValues?: string[];
}

/**
 * Collection definition for MongoDB schemas
 */
export interface Collection {
  fields: Field[];
  indexes?: string[];
}

/**
 * PostgreSQL connection configuration
 */
export interface PostgreSQLConfig {
  host: string;
  port: number;
  databases: string[];
  user?: string;
  password?: string;
}

/**
 * MongoDB connection configuration
 */
export interface MongoDBConfig {
  host: string;
  port: number;
  databases: string[];
  user?: string;
  password?: string;
}

/**
 * Schema validator configuration
 */
export interface SchemaValidatorConfig {
  postgres: PostgreSQLConfig;
  mongodb: MongoDBConfig;
}

/**
 * Type mismatch between spec and actual schema
 */
export interface TypeMismatch {
  table: string;
  column: string;
  specType: string;
  actualType: string;
}

/**
 * Missing foreign key definition
 */
export interface MissingForeignKey {
  table: string;
  column: string;
  expectedReference: string;
}

/**
 * PostgreSQL schema validation result
 */
export interface PostgreSQLSchemaInfo {
  database: string;
  validationComplete: boolean;
  missingTables: string[];
  missingColumns: Record<string, string[]>;
  extraColumns: Record<string, string[]>;
  typeMismatches: TypeMismatch[];
  missingForeignKeys: MissingForeignKey[];
  columnMismatches: Record<string, { spec: string; actual: string }[]>;
  error?: string;
  connectionFailed?: boolean;
}

/**
 * Collection mapping suggestion
 */
export interface CollectionMapping {
  specName: string;
  actualName: string;
  confidence: number;
}

/**
 * Enum mismatch between spec and actual values
 */
export interface EnumMismatch {
  collection: string;
  field: string;
  specValues: string[];
  actualValues: string[];
  caseMismatch: boolean;
}

/**
 * Field name mismatch between spec and actual
 */
export interface FieldNameMismatch {
  collection: string;
  specFieldName: string;
  actualFieldName: string;
  confidence: number;
}

/**
 * MongoDB schema validation result
 */
export interface MongoDBSchemaInfo {
  database: string;
  validationComplete: boolean;
  missingCollections: string[];
  extraCollections: string[];
  fieldNameMismatches: FieldNameMismatch[];
  collectionMappings: CollectionMapping[];
  enumMismatches: EnumMismatch[];
  error?: string;
  connectionFailed?: boolean;
}

/**
 * RLS policy validation result
 */
export interface RLSPolicyResult {
  database: string;
  validationComplete: boolean;
  missingPolicies: Record<string, string[]>;
  extraPolicies: Record<string, string[]>;
  error?: string;
  connectionFailed?: boolean;
}

/**
 * Document schema validation result
 */
export interface DocumentSchemaResult {
  collection: string;
  validDocuments: number;
  invalidDocuments: number;
  schemaViolations: SchemaViolation[];
  error?: string;
  connectionFailed?: boolean;
}

/**
 * Schema violation detail
 */
export interface SchemaViolation {
  documentId: string;
  field: string;
  expectedType: string;
  actualType: string;
  message: string;
}

/**
 * Specification tables definition
 */
export type SpecTables = Record<string, Table>;

/**
 * Specification collections definition
 */
export type SpecCollections = Record<string, Collection>;

/**
 * JSON Schema for MongoDB document validation
 */
export interface JSONSchema {
  type: string;
  required?: string[];
  properties?: Record<string, { type: string }>;
}

/**
 * RLS policies specification
 */
export type SpecRLSPolicies = Record<string, string[]>;
