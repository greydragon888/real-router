/**
 * Route Node Type Definitions — Minimal Public API.
 *
 * This module exports ONLY the essential types used by real-router:
 * - QueryParamsMode, QueryParamsOptions
 * - RouteParams, RouteTreeState
 *
 * ⚑ The query-format unions are IMPORTED, not copied. `search-params` is inside
 * core (#1510), so the import resolves and the set has ONE owner — a copy here
 * would be an unbound restatement (#2091).
 *
 * @module route-node-types
 */

import type {
  ArrayFormat,
  BooleanFormat,
  NullFormat,
  NumberFormat,
} from "../engine/search-params/types";

/**
 * Options for query parameter parsing and building.
 */
export interface QueryParamsOptions {
  arrayFormat?: ArrayFormat;
  booleanFormat?: BooleanFormat;
  nullFormat?: NullFormat;
  numberFormat?: NumberFormat;
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

export interface RouteParams {
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
