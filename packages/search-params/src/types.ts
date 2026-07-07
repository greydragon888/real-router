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
 * - `auto` - auto-detect "true"/"false" strings as boolean values
 * - `empty-true` - true values have no value: `?flag` instead of `?flag=true`
 *
 * @remarks
 * Under `empty-true` the bare-key wire form (`?flag`) is reserved for `true`, so
 * a `null` value with `nullFormat: "default"` (which also encodes to a bare key)
 * is **not representable**: it round-trips back as `true`, not `null`. Both null
 * and true collapse to the same token and only `true` decodes back. Pair
 * `empty-true` with `nullFormat: "hidden"`, or avoid null query values.
 */
export type BooleanFormat = "none" | "auto" | "empty-true";

/**
 * Null parameter encoding format.
 *
 * @remarks
 * - `default` - key only: `?key` (collides with `booleanFormat: "empty-true"`,
 *   which reserves the bare-key form for `true` — null then decodes as `true`)
 * - `hidden` - omit from query string
 */
export type NullFormat = "default" | "hidden";

/**
 * Number parameter encoding format.
 *
 * @remarks
 * - `none` - no special handling
 * - `auto` - decode canonical decimal numbers (`/^-?(0|[1-9]\d*)(\.\d+)?$/`) to
 *   `Number()`. Recognizes negatives so the parsed type matches what
 *   `build`/`navigate` produce; rejects leading zeros (`"007"`), exponent
 *   notation, unsafe integers, and negative zero (`"-0"` — the grammar matches
 *   it, but an `Object.is` guard rejects it since `build(-0)` emits `"0"`, #898)
 *   — those keep their exact text as strings.
 */
export type NumberFormat = "none" | "auto";

// =============================================================================
// Options Types
// =============================================================================

/**
 * Options for search-params parsing and building.
 */
export interface Options {
  /** Array parameter encoding format. @default "none" */
  arrayFormat?: ArrayFormat;
  /** Boolean parameter encoding format. @default "auto" */
  booleanFormat?: BooleanFormat;
  /** Null parameter encoding format. @default "default" */
  nullFormat?: NullFormat;
  /** Number parameter encoding format. @default "auto" */
  numberFormat?: NumberFormat;
}

/**
 * Internal options with all required fields.
 */
export interface FinalOptions {
  arrayFormat: ArrayFormat;
  booleanFormat: BooleanFormat;
  nullFormat: NullFormat;
  numberFormat: NumberFormat;
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
// Internal Types
// =============================================================================

/**
 * Result of decoding a parameter value.
 */
export type DecodeResult = boolean | string | number | null;
