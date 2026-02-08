// packages/route-tree/src/services/buildParamMeta.ts

/**
 * Route Parameter Metadata Extraction.
 *
 * Extracts parameter metadata from route path patterns without requiring
 * a full path-parser instance. Replaces parser.urlParams/queryParams/spatParams.
 *
 * @module services/buildParamMeta
 */

/**
 * Constraint pattern for a URL parameter.
 */
export interface ConstraintPattern {
  /**
   * Compiled RegExp for validating the parameter value.
   *
   * @example /^(\d+)$/ for constraint "<\\d+>"
   */
  readonly pattern: RegExp;

  /**
   * Raw constraint string from the route pattern.
   *
   * @example "<\\d+>"
   */
  readonly constraint: string;
}

/**
 * Parameter metadata extracted from a route path pattern.
 */
export interface ParamMeta {
  /**
   * URL parameter names extracted from the path pattern.
   *
   * @example [":id", ":postId"] from "/users/:id/posts/:postId"
   */
  readonly urlParams: readonly string[];

  /**
   * Query parameter names extracted from the path pattern.
   *
   * @example ["q", "page"] from "/search?q&page"
   */
  readonly queryParams: readonly string[];

  /**
   * Splat parameter names extracted from the path pattern.
   *
   * @example ["path"] from "/files/*path"
   */
  readonly spatParams: readonly string[];

  /**
   * Map of parameter names to their type (url or query).
   *
   * @example { id: "url", q: "query" }
   */
  readonly paramTypeMap: Readonly<Record<string, "url" | "query">>;

  /**
   * Map of parameter names to their constraint patterns.
   *
   * Only includes parameters with explicit constraints (e.g., `:id<\\d+>`).
   * Parameters without constraints are not included in this map.
   *
   * @example
   * ```typescript
   * buildParamMeta("/users/:id<\\d+>").constraintPatterns.get("id")
   * // → { pattern: /^(\d+)$/, constraint: "<\\d+>" }
   *
   * buildParamMeta("/users/:id").constraintPatterns.size
   * // → 0 (no constraints)
   * ```
   */
  readonly constraintPatterns: ReadonlyMap<string, ConstraintPattern>;

  /**
   * Path pattern without query string, pre-computed for buildPath.
   *
   * @example "/users/:id" from "/users/:id?q&page"
   */
  readonly pathPattern: string;
}

/**
 * Extracts the regex pattern from a constraint string.
 *
 * @param constraint - Constraint string (e.g., "<\\d+>")
 * @returns Regex capture group pattern (e.g., "(\\d+)")
 */
function extractConstraintPattern(constraint: string): string {
  // Strip leading "<" and trailing ">" from constraint
  const pattern = constraint.replaceAll(/(^<|>$)/g, "");

  return `(${pattern})`;
}

/**
 * Regex for matching URL parameters in path patterns.
 *
 * Matches:
 * - `:paramName` - named URL parameter
 * - `:paramName<constraint>` - constrained parameter
 * - `:paramName?` - optional parameter
 * - `*paramName` - splat parameter
 * - `*` - unnamed splat
 *
 * Groups:
 * - [1]: marker (`:` or `*`)
 * - [2]: parameter name
 * - [3]: constraint (e.g., `<\\d+>`) or undefined
 * - [4]: optional marker (`?`) or undefined
 *
 * @example
 * ```
 * "/users/:id" → matches ":id"
 * "/users/:id<\\d+>" → matches ":id<\\d+>"
 * "/users/:id?" → matches ":id?"
 * "/files/*path" → matches "*path"
 * ```
 */

const URL_PARAM_RGX = /([:*])([^/?<]+)(<[^>]+>)?(\?)?/g;

/**
 * Regex for matching query parameters in path patterns.
 *
 * Matches query string portion after "?" in path.
 *
 * @example
 * ```
 * "/search?q&page" → matches "q&page"
 * ```
 */
// eslint-disable-next-line sonarjs/slow-regex
const QUERY_PARAM_RGX = /\?(.+)$/;

/**
 * Builds parameter metadata from a route path pattern.
 *
 * Extracts URL parameters, query parameters, and splat parameters
 * from the path pattern string.
 *
 * @param path - Route path pattern (e.g., "/users/:id/posts/:postId?q")
 * @returns Parameter metadata object
 *
 * @example
 * ```typescript
 * buildParamMeta("/users/:id")
 * // → {
 * //     urlParams: ["id"],
 * //     queryParams: [],
 * //     spatParams: [],
 * //     paramTypeMap: { id: "url" }
 * //   }
 *
 * buildParamMeta("/search?q&page")
 * // → {
 * //     urlParams: [],
 * //     queryParams: ["q", "page"],
 * //     spatParams: [],
 * //     paramTypeMap: { q: "query", page: "query" }
 * //   }
 *
 * buildParamMeta("/files/*path")
 * // → {
 * //     urlParams: ["path"],
 * //     queryParams: [],
 * //     spatParams: ["path"],
 * //     paramTypeMap: { path: "url" }
 * //   }
 *
 * buildParamMeta("/users/:id/posts/:postId?q&page")
 * // → {
 * //     urlParams: ["id", "postId"],
 * //     queryParams: ["q", "page"],
 * //     spatParams: [],
 * //     paramTypeMap: { id: "url", postId: "url", q: "query", page: "query" }
 * //   }
 * ```
 */
export function buildParamMeta(path: string): ParamMeta {
  const urlParams: string[] = [];
  const queryParams: string[] = [];
  const spatParams: string[] = [];
  const paramTypeMap: Record<string, "url" | "query"> = {};
  const constraintPatterns = new Map<string, ConstraintPattern>();

  const queryMatch = QUERY_PARAM_RGX.exec(path);

  if (queryMatch !== null) {
    const queryString = queryMatch[1];
    const params = queryString.split("&");

    for (const param of params) {
      const paramName = param.trim();

      if (paramName.length > 0) {
        queryParams.push(paramName);
        paramTypeMap[paramName] = "query";
      }
    }

    path = path.slice(0, queryMatch.index);
  }

  let match: RegExpExecArray | null;

  while ((match = URL_PARAM_RGX.exec(path)) !== null) {
    const marker = match[1];
    const paramName = match[2];
    const constraintStr = match[3];

    if (marker === "*") {
      spatParams.push(paramName);
      urlParams.push(paramName);
      paramTypeMap[paramName] = "url";
    } else {
      urlParams.push(paramName);
      paramTypeMap[paramName] = "url";

      if (constraintStr) {
        const regexPattern = `^${extractConstraintPattern(constraintStr)}$`;

        constraintPatterns.set(paramName, {
          pattern: new RegExp(regexPattern),
          constraint: constraintStr,
        });
      }
    }
  }

  return {
    urlParams,
    queryParams,
    spatParams,
    paramTypeMap,
    constraintPatterns,
    pathPattern: path,
  };
}
