// packages/route-tree/modules/operations/types.ts

/**
 * Operations Module Type Definitions.
 *
 * Types for path matching and building operations.
 *
 * @module operations/types
 */

import type { RouteTree } from "../builder/types";
import type { Options as QueryParamsOptions } from "search-params";

// Re-export PathParser types from builder (used by operations internally)
export type {
  PathBuildOptions,
  PathTestOptions,
  PathParser,
} from "../builder/types";

// =============================================================================
// Mode Types
// =============================================================================

/**
 * Controls how query parameters are handled during matching.
 */
export type QueryParamsMode = "default" | "strict" | "loose";

/**
 * Controls how trailing slashes are handled in paths.
 */
export type TrailingSlashMode = "default" | "never" | "always";

/**
 * Controls URL parameter encoding strategy.
 */
export type URLParamsEncodingType =
  | "default"
  | "uri"
  | "uriComponent"
  | "none"
  | "legacy";

// =============================================================================
// Options Types
// =============================================================================

/**
 * Base options for path operations.
 */
export interface BasePathOptions {
  trailingSlashMode?: TrailingSlashMode;
  queryParamsMode?: QueryParamsMode;
  queryParams?: QueryParamsOptions;
  urlParamsEncoding?: URLParamsEncodingType;
}

/**
 * Options for building paths.
 */
export type BuildOptions = BasePathOptions;

/**
 * Options for matching paths.
 */
export interface MatchOptions extends BasePathOptions {
  caseSensitive?: boolean;
  strictTrailingSlash?: boolean;
  strongMatching?: boolean;
}

// =============================================================================
// Meta Types
// =============================================================================

/**
 * Indicates the source of a parameter (URL path or query string).
 */
export type ParamSource = "url" | "query";

/**
 * Maps parameter names to their sources.
 */
export type ParamTypeMap = Record<string, ParamSource>;

/**
 * Metadata for route state parameters.
 * Maps segment names to their parameter type maps.
 */
export type RouteTreeStateMeta = Record<string, ParamTypeMap>;

// =============================================================================
// Route Params Types
// =============================================================================

/**
 * Route parameters object.
 * Supports nested objects and arrays for complex parameter structures.
 */
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

// =============================================================================
// Match Result Types
// =============================================================================

/**
 * Result of matching a path against the route tree.
 *
 * This is used by matchSegments() to return detailed matching info.
 */
export interface MatchResult<P extends RouteParams = RouteParams> {
  /** Matched route segments from root to matched node */
  readonly segments: readonly RouteTree[];

  /** Extracted parameters (URL params + query params) */
  readonly params: P;
}

// =============================================================================
// State Types
// =============================================================================

/**
 * Complete state representation of a matched route.
 */
export interface RouteTreeState<P extends RouteParams = RouteParams> {
  /** Full route name (e.g., "users.profile") */
  name: string;

  /** Extracted parameters */
  params: P;

  /** Parameter metadata by segment */
  meta: RouteTreeStateMeta;
}

/**
 * Internal match response during tree traversal.
 */
export interface MatchResponse {
  segments: RouteTree[];
  params: RouteParams;
}

/**
 * Pre-built match configuration.
 * Created once per match() call and reused throughout recursion.
 */
export interface MatchConfig {
  readonly queryParamsMode: "default" | "strict" | "loose";
  readonly strictTrailingSlash: boolean;
  readonly strongMatching: boolean;
  readonly caseSensitive: boolean;
  readonly queryParams?: MatchOptions["queryParams"];
  readonly urlParamsEncoding?: MatchOptions["urlParamsEncoding"];
  readonly fullTestOptions: Record<string, unknown>;
  readonly partialTestOptions: Record<string, unknown>;
  readonly buildOptions: Record<string, unknown>;
}
