/**
 * MCP Resources Index - Sprint 3
 *
 * Exports all MCP Resource implementations.
 *
 * @see docs/plans/MCP_JOURNEY_TDD_PLAN.md
 */

export { FailuresResource } from './failures.js';
export { DecisionsResource } from './decisions.js';
export { EvolutionResource } from './evolution.js';
export { LessonsResource } from './lessons.js';
export { PhoenixResource } from './phoenix.js';

export type {
  ResourceContent,
  ReadResult,
  FailuresReadParams
} from './failures.js';

export type {
  ResourceListItem,
  ListResult,
  DecisionsReadParams
} from './decisions.js';

export type {
  EvolutionReadParams
} from './evolution.js';

export type {
  PhoenixReadParams
} from './phoenix.js';
