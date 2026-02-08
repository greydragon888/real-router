// packages/path-matcher/src/buildParamMeta.ts

/**
 * Route Parameter Metadata Extraction.
 *
 * Extracts parameter metadata from route path patterns without requiring
 * a full path-parser instance. Replaces parser.urlParams/queryParams/spatParams.
 *
 * @module buildParamMeta
 */

import type { ConstraintPattern, ParamMeta } from "./types";

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

// eslint-disable-next-line sonarjs/slow-regex -- Optional param marker regex - bounded input from route definitions, not user input
const OPTIONAL_PARAM_MARKER_RGX = /([:*][^/?<]+(?:<[^>]+>)?)\?(?=\/|$)/g;

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

  // Strip optional `?` markers (`:param?` where `?` is followed by `/` or end)
  // before query detection to avoid `:param?/rest` being parsed as query `?/rest`
  const strippedForQuery = path.replaceAll(OPTIONAL_PARAM_MARKER_RGX, "$1");

  const queryMatch = QUERY_PARAM_RGX.exec(strippedForQuery);

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
