/**
 * Operations Module Type Definitions.
 *
 * Types for path matching and building operations.
 *
 * @module operations/types
 */

import type { RouteTree } from "../builder";

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
// Match Result Types
// =============================================================================

/**
 * Result of matching a path against the route tree — detailed matching info
 * (matched segments, extracted params, per-segment meta).
 */
export interface MatchResult<P extends RouteParams = RouteParams> {
  /** Matched route segments (with slashChild) — for createRouteState() */
  readonly segments: readonly RouteTree[];

  /**
   * Extracted PATH parameters. During the M2 rollout query params are still
   * folded in here for back-compat (removed once the split lands, RFC-4 M2 /
   * #1548); the query channel is {@link MatchResult.search}.
   */
  readonly params: P;

  /**
   * Extracted QUERY parameters — the query channel, parsed into its own object
   * (RFC-4 M2 / #1548). Empty (frozen `{}`) when the URL has no query string.
   */
  readonly search: Readonly<Record<string, unknown>>;

  /** Pre-computed route meta (segment fullName → paramTypeMap) */
  readonly meta: Readonly<RouteTreeStateMeta>;
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

  /** Extracted PATH parameters (query is {@link RouteTreeState.search}). */
  params: P;

  /**
   * Extracted QUERY parameters — the query channel (RFC-4 M2 / #1548).
   * Optional only during the M2 rollout; populated by `createRouteState`.
   */
  search?: Readonly<Record<string, unknown>>;

  /** Parameter metadata by segment */
  meta: RouteTreeStateMeta;
}

/** Route parameters map. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cross-package boundary type
export type RouteParams = Record<string, any>;

export { type URLParamsEncodingType } from "../path-matcher";
