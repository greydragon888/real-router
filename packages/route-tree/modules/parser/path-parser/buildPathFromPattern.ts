// packages/route-tree/modules/parser/path-parser/buildPathFromPattern.ts

/**
 * Standalone Path Building from Pattern.
 *
 * Pre-compiles route patterns for fast path building without regex at runtime.
 * R4 optimization used by Path.buildBasePath().
 *
 * NOTE: This module is designed for rou3 migration.
 * buildFromPattern() can be used as standalone buildPath without Path class.
 *
 * @example
 * ```typescript
 * // Compile once at initialization
 * const compiled = compilePathPattern("/users/:id/posts/:postId");
 *
 * // Build many times (fast, no regex)
 * buildFromPattern(compiled, { id: "123", postId: "456" });
 * // → "/users/123/posts/456"
 * ```
 *
 * @module parser/path-parser/buildPathFromPattern
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Pre-compiled path pattern for fast building.
 * Created once per route, reused for every buildPath call.
 */
export interface CompiledPathPattern {
  /** Static parts interleaved with params: [static0, static1, ..., staticN] */
  readonly staticParts: readonly string[];
  /** Parameter names in order: [param0, param1, ..., paramN-1] */
  readonly paramNames: readonly string[];
  /** Original pattern string (for debugging) */
  readonly pattern: string;
}

// =============================================================================
// Pattern Parsing
// =============================================================================

/**
 * Pre-compiles a route pattern for fast path building.
 *
 * Supports:
 * - URL parameters: `/users/:id`
 * - Optional parameters: `/users/:id?`
 * - Wildcards: `/files/*` or `/files/*path`
 * - Matrix parameters: `/users;id=123`
 *
 * @param pattern - Route pattern string (e.g., "/users/:id/posts/:postId")
 * @returns Compiled pattern ready for buildFromPattern()
 *
 * @example
 * ```typescript
 * compilePathPattern("/users/:id")
 * // → { staticParts: ["/users/", ""], paramNames: ["id"], pattern: "/users/:id" }
 *
 * compilePathPattern("/api/:version/:resource/:id")
 * // → { staticParts: ["/api/", "/", "/", ""], paramNames: ["version", "resource", "id"], ... }
 * ```
 */
export function compilePathPattern(pattern: string): CompiledPathPattern {
  const staticParts: string[] = [];
  const paramNames: string[] = [];

  let lastIndex = 0;
  let currentStatic = "";

  // Combined regex for params and matrix
  // Group 1: URL param/wildcard (:param or *wildcard)
  // Group 2: Matrix param (;param=)
  const combinedRegex = /[*:](\w*)\??|;(\w+)=?/g;
  let match: RegExpExecArray | null;

  while ((match = combinedRegex.exec(pattern)) !== null) {
    // Add static content before this match
    currentStatic += pattern.slice(lastIndex, match.index);

    // Check which group matched
    const urlParamName = match[1];
    const matrixParamName = match[2];

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- regex alternation: only one group matches
    if (matrixParamName === undefined) {
      // URL parameter or wildcard (:param or *wildcard)
      // urlParamName is defined here (may be empty string for bare *)
      const paramName = urlParamName || "splat";

      staticParts.push(currentStatic);
      currentStatic = "";
      paramNames.push(paramName);
    } else {
      // Matrix parameter (;param=)
      currentStatic += `;${matrixParamName}=`;
      staticParts.push(currentStatic);
      currentStatic = "";
      paramNames.push(matrixParamName);
    }

    lastIndex = combinedRegex.lastIndex;
  }

  // Add remaining static content
  currentStatic += pattern.slice(lastIndex);
  staticParts.push(currentStatic);

  return {
    staticParts,
    paramNames,
    pattern,
  };
}

// =============================================================================
// Path Building
// =============================================================================

/**
 * Builds a URL path from a pre-compiled pattern and parameters.
 *
 * This is the hot path - optimized for speed:
 * - No regex at runtime
 * - O(n) string concatenation where n = number of params
 * - No object allocation
 *
 * @param compiled - Pre-compiled pattern from compilePathPattern()
 * @param params - Parameter values to inject (converted to string via String())
 * @returns Built URL path
 *
 * @example
 * ```typescript
 * const compiled = compilePathPattern("/users/:id/posts/:postId");
 *
 * buildFromPattern(compiled, { id: "123", postId: "456" });
 * // → "/users/123/posts/456"
 *
 * buildFromPattern(compiled, { id: "abc", postId: "def" });
 * // → "/users/abc/posts/def"
 * ```
 */
export function buildFromPattern(
  compiled: CompiledPathPattern,
  params: Readonly<Record<string, unknown>>,
): string {
  const { staticParts, paramNames } = compiled;

  // Fast path: no parameters
  if (paramNames.length === 0) {
    return staticParts[0];
  }

  // Build path using interleaved parts
  let path = staticParts[0];

  for (const [i, paramName] of paramNames.entries()) {
    path += String(params[paramName]) + staticParts[i + 1];
  }

  return path;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * One-shot path building (compiles and builds in one call).
 *
 * Use this only when pattern is used once.
 * For repeated builds, use compilePathPattern() + buildFromPattern().
 *
 * @param pattern - Route pattern string
 * @param params - Parameter values to inject
 * @returns Built URL path
 *
 * @example
 * ```typescript
 * buildPath("/users/:id", { id: "123" });
 * // → "/users/123"
 * ```
 */
export function buildPathOnce(
  pattern: string,
  params: Readonly<Record<string, unknown>>,
): string {
  return buildFromPattern(compilePathPattern(pattern), params);
}
