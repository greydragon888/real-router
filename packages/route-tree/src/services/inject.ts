// packages/route-tree/src/services/inject.ts

/**
 * Enhanced Path Parameter Injection.
 *
 * Lightweight implementation for injecting pre-encoded parameters into route
 * patterns. Replaces the path-parser's build() method for path construction.
 *
 * Handles:
 * - Named parameters (`:id`) - values used as-is (must be pre-encoded)
 * - Optional parameters (`:id?`)
 * - Splat parameters (`*path`)
 * - Unnamed splats (`*`) accessed as 'wild'
 *
 * @module services/inject
 */

/**
 * Regex pattern for matching route parameters.
 *
 * Matches:
 * - `:paramName` - named URL parameter
 * - `:paramName<constraint>` - parameter with constraint pattern
 * - `:paramName?` - optional parameter
 * - `:paramName<constraint>?` - optional parameter with constraint
 * - `*paramName` - splat parameter (matches rest of path)
 * - `*` - unnamed splat
 *
 * Captures:
 * 1. `lead` - leading character (/ or start of string)
 * 2. `key` - parameter marker and name (`:id`, `*path`, etc.) - excludes constraint
 * 3. `constraint` - optional constraint pattern (e.g., `<\d+>`)
 * 4. `optional` - optional marker (?)
 *
 * @example
 * ```
 * "/users/:id" → matches ":id"
 * "/users/:id<\\d+>" → matches ":id" with constraint "<\\d+>"
 * "/users/:id?" → matches ":id?"
 * "/users/:id<\\d+>?" → matches ":id" with constraint and optional
 * "/files/*path" → matches "*path"
 * "/files/*" → matches "*"
 * ```
 */
const RGX = /(\/|^)([:*][^/?<]*)(<[^>]+>)?(\?)?(?=[/.]|$)/g;

/**
 * Injects parameter values into a route pattern string.
 *
 * Values are expected to be pre-encoded. Use with encodeParam() for proper encoding.
 *
 * @param route - Route pattern string (e.g., "/users/:id/posts/:postId")
 * @param values - Object mapping parameter names to pre-encoded string values
 * @returns Path with parameters replaced by values
 *
 * @example
 * ```typescript
 * // Named parameters (pre-encoded)
 * inject("/users/:id", { id: "123" })
 * // → "/users/123"
 *
 * // Optional parameters
 * inject("/users/:id?", {})
 * // → "/users"
 *
 * inject("/users/:id?", { id: "123" })
 * // → "/users/123"
 *
 * // Splat parameters
 * inject("/files/*path", { path: "a/b/c" })
 * // → "/files/a/b/c"
 *
 * // Pre-encoded values
 * inject("/search/:q", { q: "hello%20world" })
 * // → "/search/hello%20world"
 *
 * // Complex routes
 * inject("/posts/:id/comments/*rest", { id: "42", rest: "123/456" })
 * // → "/posts/42/comments/123/456"
 *
 * // Unnamed splat
 * inject("/files/*", { wild: "docs/readme.md" })
 * // → "/files/docs/readme.md"
 * ```
 *
 * @remarks
 * - Values are used as-is (no encoding applied by inject)
 * - Caller must pre-encode values using encodeParam() or similar
 * - Optional parameters (`:param?`) are omitted if value is undefined/null
 * - Unnamed splats (`*`) are accessed via the 'wild' key
 * - Missing required parameters are replaced with the original placeholder
 */
export function inject(route: string, values: Record<string, string>): string {
  return route.replaceAll(
    RGX,
    (
      _match: string,
      lead: string,
      key: string,
      _constraint: string | undefined,
      optional?: string,
    ) => {
      const isSplat = key.startsWith("*");

      let paramName: string;

      if (isSplat) {
        paramName = key.length > 1 ? key.slice(1) : "wild";
      } else {
        paramName = key.slice(1);
      }

      const value = values[paramName];

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (value !== undefined) {
        return lead + value;
      }

      if (optional !== undefined || isSplat) {
        return "";
      }

      return lead + key;
    },
  );
}
