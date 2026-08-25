/**
 * Route Parameter Metadata Extraction.
 *
 * Extracts parameter metadata from route path patterns without requiring
 * a full path-parser instance. Replaces parser.urlParams/queryParams/spatParams.
 *
 * @module buildParamMeta
 */

import { parseSegment, splitPathSegments } from "./parseSegment";
import { emptyRecord, publishRecord } from "../../utils/ingest";

import type { ParamMeta } from "./types";

/**
 * A query-param NAME may not contain `<`/`>` (#1242 §5.1) — a constraint
 * delimiter leaked into the query via a reverse-order modifier typo (`/a/:b?<c>`
 * parses the `?` as the query start, making `<c>` the query name). Consumed by
 * the route-tree gate and the `registerTree` backstop; relocated here from the
 * deleted `constraint-grammar.ts` when M1 removed constraints (query-param name
 * validation is a query concern, and this module owns query extraction).
 */
export const INVALID_QUERY_NAME_RGX = /[<>]/u;

const QUESTION = 0x3f; // ?
const SLASH = 0x2f; // /
const LT = 0x3c; // <

/**
 * Locates the query separator `?` in a route path — the FIRST `?` whose tail is
 * non-empty and does not begin with `/`, `?`, or `<` (M1 §3.3). The 3-token
 * grammar leaves `?` a single role (there is no optional modifier and no
 * constraint body to hide one), so no length-preserving mask is needed. The three
 * excluded tails keep a REMOVED form in the path part, where `parseSegment`
 * rejects it with a recipe instead of mis-reading it as a query declaration:
 * - end-of-string (`/:id?`) and `/` (`/:id?/edit`) → a bare `:x?` optional;
 * - `?` (`/:id??tab`) → the leading `?` is the optional, the later `?` the query;
 * - `<` (`/a/:b?<x>`) → a reverse-order `:b?<x>` (optional then a former constraint).
 *
 * @param path - a route path
 * @returns the index of the query separator, or -1 if there is none
 */
function findQuerySeparator(path: string): number {
  for (let i = 0; i < path.length; i += 1) {
    if (path.codePointAt(i) !== QUESTION) {
      continue;
    }

    // `next` is the code point after the `?`, or the `-1` sentinel at end-of-string.
    // The `-1` sentinel is the SOLE end-of-string guard — the former separate
    // `next !== undefined` conjunct was dead (the ternary bounds the index, so
    // `codePointAt` never returns `undefined`; the `!` is a type assertion, not a
    // runtime branch, so it keeps the scan at 100% coverage). Mirrors `#scanPath`.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- ternary-bounded in-range index; codePointAt is defined
    const next = i + 1 < path.length ? path.codePointAt(i + 1)! : -1;

    if (next !== -1 && next !== SLASH && next !== QUESTION && next !== LT) {
      return i;
    }
  }

  return -1;
}

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
 * // → { urlParams: ["id"], queryParams: [], spatParams: [], paramTypeMap: { id: "url" } }
 *
 * buildParamMeta("/search?q&page")
 * // → { urlParams: [], queryParams: ["q", "page"], spatParams: [],
 * //     paramTypeMap: { q: "query", page: "query" } }
 *
 * buildParamMeta("/files/*path")
 * // → { urlParams: ["path"], queryParams: [], spatParams: ["path"],
 * //     paramTypeMap: { path: "url" } }
 * ```
 */
// Shared frozen sentinels for the common no-params case — avoid a fresh empty
// array/object per route (#1009). ParamMeta fields are Readonly*; match/build
// only read them, and computeCaches' Object.freeze on the arrays/object is a
// no-op on an already-frozen shared instance.
const EMPTY_PARAM_NAMES: readonly string[] = Object.freeze([]);
const EMPTY_PARAM_TYPE_MAP: Readonly<Record<string, "url" | "query">> =
  Object.freeze({});

// Whole-meta shared sentinel for the fully-static case: every collection is a
// #1009 sentinel AND pathPattern degenerates to the input path itself (no query
// to strip), so the wrapper carries zero per-route information. The RETAINING
// caller (route-tree's computeCaches) swaps a matching fresh result for this
// instance — buildParamMeta itself keeps returning fresh objects so the
// validation gate can read the real pathPattern of arbitrary input paths.
// `pathPattern` is "" here; the one stored-meta reader (`registerNode`) falls
// back to `node.path` on identity match.
export const EMPTY_PARAM_META: ParamMeta = Object.freeze({
  urlParams: EMPTY_PARAM_NAMES,
  queryParams: EMPTY_PARAM_NAMES,
  spatParams: EMPTY_PARAM_NAMES,
  paramTypeMap: EMPTY_PARAM_TYPE_MAP,
  pathPattern: "",
});

/**
 * Extracts URL/splat params from a path's segments into the given accumulators
 * via the canonical `parseSegment` tokenizer. Split out of `buildParamMeta` so
 * the builder stays under the cognitive-complexity budget. A malformed segment
 * (token errors) or a `static` segment contributes nothing — a malformed route is
 * rejected downstream before it compiles, so its meta is moot.
 */
function collectUrlParams(
  path: string,
  urlParams: string[],
  spatParams: string[],
  paramTypeMap: Record<string, "url" | "query">,
): void {
  for (const segment of splitPathSegments(path)) {
    if (segment.length === 0) {
      continue;
    }

    const token = parseSegment(segment);

    if ("error" in token || token.kind === "static") {
      continue;
    }

    urlParams.push(token.name);
    paramTypeMap[token.name] = "url";

    if (token.kind === "splat") {
      spatParams.push(token.name);
    }
  }
}

export function buildParamMeta(path: string): ParamMeta {
  const urlParams: string[] = [];
  const queryParams: string[] = [];
  const spatParams: string[] = [];
  const paramTypeMap = emptyRecord<"url" | "query">();

  // Locate the real query separator (M1 §3.3: first `?` whose tail is not a
  // former optional/reverse form).
  const separator = findQuerySeparator(path);

  if (separator !== -1) {
    const queryString = path.slice(separator + 1);
    const params = queryString.split("&");

    for (const param of params) {
      const paramName = param.trim();

      if (paramName.length > 0) {
        queryParams.push(paramName);
        paramTypeMap[paramName] = "query";
      }
    }

    path = path.slice(0, separator);
  }

  collectUrlParams(path, urlParams, spatParams, paramTypeMap);

  return shareEmptyCollections(
    urlParams,
    queryParams,
    spatParams,
    publishRecord(paramTypeMap),
    path,
  );
}

// #1009: swap each freshly-built empty collection for a shared frozen sentinel
// — factored out of buildParamMeta so the hot builder stays under the cognitive-
// complexity budget. match/build only read these (Readonly*), and computeCaches'
// Object.freeze is a no-op on an already-frozen shared instance.
function shareEmptyCollections(
  urlParams: string[],
  queryParams: string[],
  spatParams: string[],
  paramTypeMap: Record<string, "url" | "query">,
  pathPattern: string,
): ParamMeta {
  return {
    urlParams: urlParams.length === 0 ? EMPTY_PARAM_NAMES : urlParams,
    queryParams: queryParams.length === 0 ? EMPTY_PARAM_NAMES : queryParams,
    spatParams: spatParams.length === 0 ? EMPTY_PARAM_NAMES : spatParams,
    paramTypeMap:
      urlParams.length === 0 && queryParams.length === 0
        ? EMPTY_PARAM_TYPE_MAP
        : paramTypeMap,
    pathPattern,
  };
}
