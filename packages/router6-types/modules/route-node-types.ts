// packages/real-router-types/modules/route-node-types.ts

/**
 * Route Node Type Definitions — Minimal Public API.
 *
 * This module exports ONLY the essential types used by real-router:
 * - QueryParamsMode, QueryParamsOptions
 * - RouteTreeState
 *
 * These types are copied from route-node to avoid circular dependencies.
 *
 * @module route-node-types
 */

// =============================================================================
// Search Params Types
// =============================================================================

type ArrayFormat = "none" | "brackets" | "index" | "comma";
type BooleanFormat = "none" | "string" | "empty-true";
type NullFormat = "default" | "hidden";

/**
 * Options for query parameter parsing and building.
 */
export interface QueryParamsOptions {
  arrayFormat?: ArrayFormat;
  booleanFormat?: BooleanFormat;
  nullFormat?: NullFormat;
}

// =============================================================================
// Mode Types
// =============================================================================

/**
 * Controls how query parameters are handled during matching.
 */
export type QueryParamsMode = "default" | "strict" | "loose";

// =============================================================================
// Route State Types
// =============================================================================

type ParamSource = "url" | "query";
type ParamTypeMap = Record<string, ParamSource>;
type RouteTreeStateMeta = Record<string, ParamTypeMap>;

interface RouteParams {
  [key: string]:
    | string
    | string[]
    | number
    | number[]
    | boolean
    | boolean[]
    | RouteParams
    | RouteParams[]
    | Record<string, string | number | boolean>
    | null
    | undefined;
}

/**
 * Complete state representation of a matched route.
 */
export interface RouteTreeState<
  P extends Record<string, unknown> = RouteParams,
> {
  name: string;
  params: P;
  meta: RouteTreeStateMeta;
}
