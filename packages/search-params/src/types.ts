// packages/route-node/modules/search-params/types.ts

/**
 * Search Params Type Definitions.
 *
 * Consolidated interfaces and type aliases for the search-params module.
 *
 * @module search-params/types
 */

// =============================================================================
// Format Types
// =============================================================================

/**
 * Array parameter encoding format.
 *
 * @remarks
 * - `none` - repeated keys: `a=1&a=2`
 * - `brackets` - bracket notation: `a[]=1&a[]=2`
 * - `index` - indexed notation: `a[0]=1&a[1]=2`
 * - `comma` - comma-separated: `a=1,2`
 */
export type ArrayFormat = "none" | "brackets" | "index" | "comma";

/**
 * Boolean parameter encoding format.
 *
 * @remarks
 * - `none` - no special handling
 * - `string` - encode as "true"/"false" strings
 * - `empty-true` - true values have no value: `?flag` instead of `?flag=true`
 */
export type BooleanFormat = "none" | "string" | "empty-true";

/**
 * Null parameter encoding format.
 *
 * @remarks
 * - `default` - key only: `?key`
 * - `hidden` - omit from query string
 */
export type NullFormat = "default" | "hidden";

// =============================================================================
// Options Types
// =============================================================================

/**
 * Options for search-params parsing and building.
 */
export interface Options {
  /** Array parameter encoding format. @default "none" */
  arrayFormat?: ArrayFormat;
  /** Boolean parameter encoding format. @default "none" */
  booleanFormat?: BooleanFormat;
  /** Null parameter encoding format. @default "default" */
  nullFormat?: NullFormat;
}

/**
 * Internal options with all required fields.
 */
export interface FinalOptions {
  arrayFormat: ArrayFormat;
  booleanFormat: BooleanFormat;
  nullFormat: NullFormat;
}

// =============================================================================
// Parameter Types
// =============================================================================

/**
 * Primitive types allowed in query parameters.
 */
export type QueryParamPrimitive = string | number | boolean | null;

/**
 * A single query parameter value - either a primitive or an array.
 */
export type QueryParamValue = QueryParamPrimitive | QueryParamPrimitive[];

/**
 * Strict query params type with well-defined value types.
 *
 * Use this for type-safe query parameter handling.
 * Objects and nested structures are NOT allowed (would stringify to [object Object]).
 *
 * @example
 * ```typescript
 * const params: SearchParams = {
 *   page: 1,
 *   sort: "name",
 *   active: true,
 *   tags: ["a", "b"],
 * };
 * ```
 */
export type SearchParams = Record<string, QueryParamValue | undefined>;

// =============================================================================
// Response Types
// =============================================================================

/**
 * Result of omit() operation.
 */
export interface OmitResponse {
  /** Remaining query string after removal */
  querystring: string;
  /** Parsed object of removed parameters */
  removedParams: Record<string, unknown>;
}

/**
 * Result of keep() operation.
 */
export interface KeepResponse {
  /** Query string with only kept parameters */
  querystring: string;
  /** Parsed object of kept parameters */
  keptParams: Record<string, unknown>;
}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Result of decoding a parameter value.
 */
export type DecodeResult = boolean | string | null;
