// packages/route-utils/src/types.ts

import type { State } from "@real-router/types";

/**
 * Minimal interface for route tree nodes used by RouteUtils.
 * Structurally compatible with `RouteTree` from `route-tree` package.
 * Defined locally to avoid a runtime dependency on the internal `route-tree` package.
 */
export interface RouteTreeNode {
  /** Pre-computed full name (e.g. `"users.profile"`, `""` for root) */
  readonly fullName: string;

  /** Child route nodes */
  readonly children: ReadonlyMap<string, RouteTreeNode>;

  /** Children without absolute paths */
  readonly nonAbsoluteChildren: readonly RouteTreeNode[];
}

/**
 * Type definition for segment test functions.
 * These functions can be called directly with a segment, or curried for later use.
 */
export interface SegmentTestFunction {
  (route: State | string): (segment: string) => boolean;
  (route: State | string, segment: string): boolean;
  (route: State | string, segment: null): false;
  (
    route: State | string,
    segment?: string | null,
  ): boolean | ((segment: string) => boolean);
}
