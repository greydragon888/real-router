/**
 * Route Tree Type Definitions.
 *
 * Central re-export hub for all module-specific types.
 * Import from this file for convenience, or directly from
 * module-specific files for more explicit dependencies.
 *
 * @module types
 */

// =============================================================================
// Search Params Types
// =============================================================================

export type {
  ArrayFormat,
  BooleanFormat,
  NullFormat,
  Options as QueryParamsOptions,
  FinalOptions,
  QueryParamPrimitive,
  QueryParamValue,
  SearchParams,
  DecodeResult,
} from "./search-params";

// =============================================================================
// Builder Types
// =============================================================================

export type { RouteDefinition, RouteTree } from "./builder/types";

// =============================================================================
// Operations Types
// =============================================================================

export type {
  URLParamsEncodingType,
  ParamSource,
  ParamTypeMap,
  RouteTreeStateMeta,
  RouteParams,
  MatchResult,
  RouteTreeState,
} from "./operations/types";
