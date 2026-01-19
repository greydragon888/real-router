// packages/route-node/modules/parser/path-parser/types.ts

/**
 * Path Parser Type Definitions.
 *
 * Consolidated interfaces and type aliases for the path-parser module.
 *
 * @module parser/path-parser/types
 */

import type { Options } from "search-params";

// =============================================================================
// Encoding Types
// =============================================================================

/**
 * URL parameter encoding strategy.
 *
 * @remarks
 * - `default` - encodeURIComponent preserving sub-delimiters (+, :, ', !, ,, ;, *)
 * - `uri` - encodeURI/decodeURI
 * - `uriComponent` - encodeURIComponent/decodeURIComponent
 * - `none` - no encoding/decoding
 * - `legacy` - version 5.x compatibility (not recommended)
 */
export type URLParamsEncodingType =
  | "default"
  | "uri"
  | "uriComponent"
  | "none"
  | "legacy";

// =============================================================================
// Token Types
// =============================================================================

/**
 * Token type names used in path parsing.
 */
export type TokenType =
  | "url-parameter"
  | "url-parameter-splat"
  | "url-parameter-matrix"
  | "query-parameter"
  | "delimiter"
  | "sub-delimiter"
  | "fragment";

/**
 * Parsed token from a path pattern.
 */
export interface Token {
  /** The token type identifier */
  type: string;
  /** The matched string from the pattern */
  match: string;
  /** Primary captured values (parameter names) */
  val: string[];
  /** Additional captured values (constraints) */
  otherVal: string[];
  /** Compiled regex for matching this token */
  regex: RegExp | undefined;
}

// =============================================================================
// Rule Types
// =============================================================================

/**
 * Factory function that creates a RegExp from a match result.
 */
export type RegExpFactory = (match: RegExpMatchArray) => RegExp;

/**
 * Tokenization rule definition.
 */
export interface Rule {
  /** The name of the rule (becomes token type) */
  name: string;
  /** The regex pattern to find a token in a path definition */
  pattern: RegExp;
  /** The derived regex to match a path segment */
  regex?: RegExp | RegExpFactory;
}

// =============================================================================
// Path Options Types
// =============================================================================

/**
 * Base options for Path operations.
 */
export interface PathOptions {
  /**
   * Query parameters building and matching options.
   *
   * @see https://github.com/troch/search-params#options
   */
  queryParams?: Options;
  /**
   * URL parameter encoding strategy.
   *
   * @default "default"
   */
  urlParamsEncoding?: URLParamsEncodingType;
}

/**
 * Internal options with required urlParamsEncoding.
 */
export interface InternalPathOptions {
  queryParams?: Options;
  urlParamsEncoding: URLParamsEncodingType;
}

/**
 * Options for Path.test() method.
 */
export interface PathTestOptions extends PathOptions {
  /** Whether matching should be case-sensitive. @default false */
  caseSensitive?: boolean;
  /** Whether trailing slash must match exactly. @default false */
  strictTrailingSlash?: boolean;
}

/**
 * Options for Path.partialTest() method.
 */
export interface PathPartialTestOptions extends PathOptions {
  /** Whether matching should be case-sensitive. @default false */
  caseSensitive?: boolean;
  /** Whether to require delimiter after match. @default true */
  delimited?: boolean;
}

/**
 * Options for Path.build() method.
 */
export interface PathBuildOptions extends PathOptions {
  /** Whether to skip parameter constraint validation. @default false */
  ignoreConstraints?: boolean;
  /** Whether to omit query string from output. @default false */
  ignoreSearch?: boolean;
}

// =============================================================================
// Result Types
// =============================================================================

/**
 * Result of a path match operation.
 * Returns extracted parameters or null if no match.
 */
export type TestMatch<
  T extends Record<string, unknown> = Record<string, unknown>,
> = T | null;

/**
 * Primitive value types that can exist as URL parameters.
 */
export type ParamValue = string | number | boolean;
