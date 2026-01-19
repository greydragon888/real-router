// packages/route-node/modules/operations/match.ts

/**
 * Path Matching Operations.
 *
 * Pure functions for matching URL paths against route trees.
 *
 * @module operations/match
 */

import { omit, parseInto } from "search-params";

import type {
  MatchOptions,
  MatchResult,
  PathParser,
  RouteParams,
  RouteTree,
} from "../types";
import type { MatchConfig, MatchResponse } from "./types";

// =============================================================================
// Pre-compiled Patterns & Cached Objects
// =============================================================================

const SLASH_CHILD_PATTERN = /^\/(\?|$)/;
const TRAILING_SLASH = /\/$/;
const LEADING_SLASH_QUERY = /^\/\?/;

/**
 * Extracts the first segment from a runtime URL path.
 *
 * @example
 * extractFirstPathSegment("/users/123") → "users"
 * extractFirstPathSegment("users/123") → "users"
 * extractFirstPathSegment("/users?tab=1") → "users"
 * extractFirstPathSegment("/") → ""
 *
 * @param path - Runtime path (e.g., "/users/123")
 * @returns First segment (without leading slash, query string stripped)
 */
function extractFirstPathSegment(path: string): string {
  // Runtime paths always start with "/" (see calculateRemainingPath)
  // Find end of segment: next "/" or "?" (whichever comes first)
  let end = path.indexOf("/", 1);
  const queryPos = path.indexOf("?", 1);

  if (queryPos !== -1 && (end === -1 || queryPos < end)) {
    end = queryPos;
  }

  const segment = end === -1 ? path.slice(1) : path.slice(1, end);

  // Normalize to lowercase for case-insensitive index lookup
  return segment.toLowerCase();
}

/**
 * Checks if a route path has a dynamic first segment (starts with : or *).
 * Used to skip static routes during fallback matching.
 */
function hasDynamicFirstSegment(path: string): boolean {
  const start = path.startsWith("/") ? 1 : 0;
  const firstChar = path.charAt(start);

  return (
    firstChar === ":" ||
    firstChar === "*" ||
    firstChar === "" ||
    path.charAt(start) === "("
  );
}

// Pre-computed default options objects (avoid allocation on every match)
const DEFAULT_FULL_TEST_OPTIONS = {
  caseSensitive: false,
  strictTrailingSlash: false,
};
const DEFAULT_FULL_TEST_OPTIONS_STRICT = {
  caseSensitive: false,
  strictTrailingSlash: true,
};
const DEFAULT_FULL_TEST_OPTIONS_CASE_SENSITIVE = {
  caseSensitive: true,
  strictTrailingSlash: false,
};
const DEFAULT_FULL_TEST_OPTIONS_CASE_SENSITIVE_STRICT = {
  caseSensitive: true,
  strictTrailingSlash: true,
};
const DEFAULT_PARTIAL_TEST_OPTIONS = { caseSensitive: false, delimited: true };
const DEFAULT_PARTIAL_TEST_OPTIONS_CASE_SENSITIVE = {
  caseSensitive: true,
  delimited: true,
};
const DEFAULT_PARTIAL_TEST_OPTIONS_WEAK = {
  caseSensitive: false,
  delimited: false,
};
const DEFAULT_PARTIAL_TEST_OPTIONS_CASE_SENSITIVE_WEAK = {
  caseSensitive: true,
  delimited: false,
};
const DEFAULT_BUILD_OPTIONS = { ignoreSearch: true };

// Cached default config (used when no options provided)
const DEFAULT_CONFIG: MatchConfig = {
  queryParamsMode: "default",
  strictTrailingSlash: false,
  strongMatching: true,
  caseSensitive: false,
  queryParams: undefined,
  urlParamsEncoding: undefined,
  fullTestOptions: DEFAULT_FULL_TEST_OPTIONS,
  partialTestOptions: DEFAULT_PARTIAL_TEST_OPTIONS,
  buildOptions: DEFAULT_BUILD_OPTIONS,
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Matches a URL path and returns raw segments.
 *
 * Returns raw segments and params without building the state name.
 * Use this when you need to build the state yourself (e.g., in real-router).
 *
 * @param tree - Route tree to match against
 * @param path - URL path to match
 * @param options - Matching options
 * @returns Match result with segments and params, or null if no match
 */
export function matchSegments(
  tree: RouteTree,
  path: string,
  options: MatchOptions = {},
): MatchResult | null {
  let normalizedPath = path;

  if (normalizedPath === "" && !options.strictTrailingSlash) {
    normalizedPath = "/";
  }

  const match = getSegmentsMatchingPath(tree, normalizedPath, options);

  if (!match) {
    return null;
  }

  const matchedSegments = match.segments;

  if (matchedSegments[0]?.absolute) {
    const firstSegmentParents = matchedSegments[0].parentSegments;

    // Use for-loop instead of spread (faster for small arrays)

    for (let i = firstSegmentParents.length - 1; i >= 0; i--) {
      matchedSegments.unshift(firstSegmentParents[i]);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const lastSegment = matchedSegments.at(-1)!;
  const lastSegmentSlashChild = findSlashChild(lastSegment);

  if (lastSegmentSlashChild) {
    matchedSegments.push(lastSegmentSlashChild);
  }

  return {
    segments: matchedSegments,
    params: match.params,
  };
}

// =============================================================================
// Internal: Tree Traversal
// =============================================================================

/**
 * Finds a slash child node (route that matches "/").
 */
function findSlashChild(node: RouteTree): RouteTree | undefined {
  return node.nonAbsoluteChildren.find(
    (child) => child.parser && SLASH_CHILD_PATTERN.test(child.parser.path),
  );
}

/**
 * Gets a cached or creates a match config for the given options.
 * Uses DEFAULT_CONFIG for empty options, otherwise creates new config.
 *
 * Note: Benchmarks show config creation overhead is <1.5% for deep paths,
 * so we prioritize code simplicity over complex caching logic.
 */
function getMatchConfig(options: MatchOptions): MatchConfig {
  // Fast path: no options - use default config
  if (
    options.queryParamsMode === undefined &&
    options.strictTrailingSlash === undefined &&
    options.strongMatching === undefined &&
    options.caseSensitive === undefined &&
    options.queryParams === undefined &&
    options.urlParamsEncoding === undefined &&
    options.trailingSlashMode === undefined
  ) {
    return DEFAULT_CONFIG;
  }

  // trailingSlashMode doesn't affect matching, only buildPath
  // If it's the only option set, we can use DEFAULT_CONFIG
  if (
    options.trailingSlashMode !== undefined &&
    options.queryParamsMode === undefined &&
    options.strictTrailingSlash === undefined &&
    options.strongMatching === undefined &&
    options.caseSensitive === undefined &&
    options.queryParams === undefined &&
    options.urlParamsEncoding === undefined
  ) {
    return DEFAULT_CONFIG;
  }

  return createMatchConfig(options);
}

/**
 * Gets segments matching the given path.
 */
function getSegmentsMatchingPath(
  tree: RouteTree,
  path: string,
  options: MatchOptions,
): MatchResponse | null {
  // Determine starting nodes (optimized: avoid spread for single node)
  const startingNodes: RouteTree[] = [];

  /* eslint-disable @typescript-eslint/prefer-for-of */
  if (tree.parser) {
    // Tree has a parser - use it directly
    startingNodes.push(tree);

    // Use for-loop instead of spread (1.36x faster)
    for (let i = 0; i < tree.absoluteDescendants.length; i++) {
      startingNodes.push(tree.absoluteDescendants[i]);
    }
  } else {
    // Use children as starting nodes
    for (const topNode of tree.children) {
      startingNodes.push(topNode);

      // Use for-loop instead of spread (1.36x faster)
      for (let i = 0; i < topNode.absoluteDescendants.length; i++) {
        startingNodes.push(topNode.absoluteDescendants[i]);
      }
    }
  }
  /* eslint-enable @typescript-eslint/prefer-for-of */

  const currentMatch: MatchResponse = {
    segments: [],
    params: {},
  };

  // Use cached config when possible (most common case)
  const config = getMatchConfig(options);

  // matchChildren only processes route children, never returns root-only matches
  return matchChildren(startingNodes, path, currentMatch, config);
}

// =============================================================================
// Internal: Path Matching
// =============================================================================

/**
 * Recursively matches a path segment against route tree nodes.
 * Used for top-level matching where no static index is available.
 */
function matchChildren(
  nodes: readonly RouteTree[],
  pathSegment: string,
  currentMatch: MatchResponse,
  config: MatchConfig,
  consumedBefore?: string,
): MatchResponse | null {
  const isRoot = nodes.length === 1 && nodes[0].name === "";

  for (const child of nodes) {
    const result = tryMatchChild(
      child,
      pathSegment,
      currentMatch,
      config,
      isRoot,
      consumedBefore,
    );

    if (result !== undefined) {
      return result;
    }
  }

  return null;
}

/**
 * Tries to match any child from the list against the path segment.
 *
 * @returns First successful match or null if no match found
 */
function tryMatchAnyChild(
  children: readonly RouteTree[],
  pathSegment: string,
  currentMatch: MatchResponse,
  config: MatchConfig,
  consumedBefore: string | undefined,
  skipStatic: boolean,
): MatchResponse | null {
  for (const child of children) {
    if (skipStatic && !hasDynamicFirstSegment(child.path)) {
      continue;
    }

    const result = tryMatchChild(
      child,
      pathSegment,
      currentMatch,
      config,
      false, // isRoot = false for indexed matching
      consumedBefore,
    );

    if (result !== undefined) {
      return result;
    }
  }

  return null;
}

/**
 * Matches path segment against a parent's children using static index.
 *
 * Uses O(1) lookup for routes with static first segments,
 * then falls back to linear search for dynamic-only routes.
 *
 * @param parent - Parent node whose children to match against
 * @param pathSegment - Remaining path to match
 * @param currentMatch - Accumulated match result
 * @param config - Match configuration
 * @param consumedBefore - Previously consumed path (for "/" handling)
 * @returns Match result or null
 */
function matchChildrenIndexed(
  parent: RouteTree,
  pathSegment: string,
  currentMatch: MatchResponse,
  config: MatchConfig,
  consumedBefore?: string,
): MatchResponse | null {
  const staticIndex = parent.staticChildrenByFirstSegment;
  const children = parent.nonAbsoluteChildren;

  // Fast path: no static index, use linear search
  if (staticIndex.size === 0) {
    return tryMatchAnyChild(
      children,
      pathSegment,
      currentMatch,
      config,
      consumedBefore,
      false,
    );
  }

  // 1. Try static index first (O(1) lookup)
  const firstSegment = extractFirstPathSegment(pathSegment);
  const candidates = staticIndex.get(firstSegment);

  if (candidates) {
    const result = tryMatchAnyChild(
      candidates,
      pathSegment,
      currentMatch,
      config,
      consumedBefore,
      false,
    );

    if (result !== null) {
      return result;
    }
  }

  // 2. Fall back to dynamic routes only (routes not in static index)
  return tryMatchAnyChild(
    children,
    pathSegment,
    currentMatch,
    config,
    consumedBefore,
    true, // skipStatic = true
  );
}

/**
 * Attempts to match a single child node against the path segment.
 *
 * @returns Match result, null for no match, or undefined to continue iteration
 */
function tryMatchChild(
  child: RouteTree,
  pathSegment: string,
  currentMatch: MatchResponse,
  config: MatchConfig,
  isRoot: boolean,
  consumedBefore?: string,
): MatchResponse | null | undefined {
  // All route children have parsers by design (only empty root lacks parser)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const parser = child.parser!;

  // Handle duplicate "/" case
  const segment = resolveSegment(pathSegment, child.path, consumedBefore);

  // Try to match
  const match = tryMatchNode(child, parser, segment, config);

  if (!match) {
    return undefined;
  }

  // Process successful match
  const isLeafNode = child.children.length === 0;
  const consumedPath = buildConsumedPath(parser, match, config, isLeafNode);
  const remainingPath = calculateRemainingPath(
    segment,
    consumedPath,
    config,
    isLeafNode,
    isRoot,
    parser,
  );

  // Update accumulated match
  currentMatch.segments.push(child);
  Object.assign(currentMatch.params, match as RouteParams);

  return resolveMatchResult(
    child,
    currentMatch,
    remainingPath,
    config,
    isRoot,
    consumedPath,
  );
}

/**
 * Resolves the segment to match, handling duplicate "/" case.
 */
function resolveSegment(
  pathSegment: string,
  childPath: string,
  consumedBefore?: string,
): string {
  return consumedBefore === "/" && childPath === "/"
    ? `/${pathSegment}`
    : pathSegment;
}

/**
 * Resolves the final match result after a successful node match.
 */
function resolveMatchResult(
  child: RouteTree,
  currentMatch: MatchResponse,
  remainingPath: string,
  config: MatchConfig,
  isRoot: boolean,
  consumedPath: string,
): MatchResponse | null {
  // Check if fully matched
  if (!isRoot && remainingPath.length === 0) {
    return currentMatch;
  }

  // Check for unmatched query params in non-strict mode
  if (hasOnlyQueryParamsRemaining(remainingPath, config, isRoot)) {
    return handleRemainingQueryParams(currentMatch, remainingPath);
  }

  // Continue matching on children using static index
  if (child.nonAbsoluteChildren.length === 0) {
    return null;
  }

  return matchChildrenIndexed(
    child,
    remainingPath,
    currentMatch,
    config,
    consumedPath,
  );
}

/**
 * Checks if only query params remain in the path.
 */
function hasOnlyQueryParamsRemaining(
  remainingPath: string,
  config: MatchConfig,
  isRoot: boolean,
): boolean {
  return (
    !isRoot &&
    config.queryParamsMode !== "strict" &&
    remainingPath.startsWith("?")
  );
}

/**
 * Creates match config from options with defaults.
 * Optimized to reuse pre-computed option objects when possible.
 */
function createMatchConfig(options: MatchOptions): MatchConfig {
  const queryParamsMode = options.queryParamsMode ?? "default";
  const strictTrailingSlash = options.strictTrailingSlash ?? false;
  const strongMatching = options.strongMatching ?? true;
  const caseSensitive = options.caseSensitive ?? false;
  const { queryParams, urlParamsEncoding } = options;

  // Determine if we can use pre-computed options (no custom queryParams or urlParamsEncoding)
  const canUseCachedOptions =
    queryParams === undefined && urlParamsEncoding === undefined;

  // Get fullTestOptions - use cached or create new
  const fullTestOptions = canUseCachedOptions
    ? getFullTestOptions(caseSensitive, strictTrailingSlash)
    : { caseSensitive, strictTrailingSlash, queryParams, urlParamsEncoding };

  // Get partialTestOptions - use cached or create new
  const partialTestOptions = canUseCachedOptions
    ? getPartialTestOptions(caseSensitive, strongMatching)
    : {
        caseSensitive,
        delimited: strongMatching,
        queryParams,
        urlParamsEncoding,
      };

  // Direct assignment eliminates conditional mutants
  // Parser handles undefined urlParamsEncoding the same as missing key
  const buildOptions: Record<string, unknown> = {
    ignoreSearch: true,
    urlParamsEncoding,
  };

  return {
    queryParamsMode,
    strictTrailingSlash,
    strongMatching,
    caseSensitive,
    queryParams,
    urlParamsEncoding,
    fullTestOptions,
    partialTestOptions,
    buildOptions,
  };
}

/**
 * Returns pre-computed fullTestOptions for given flags.
 */
function getFullTestOptions(
  caseSensitive: boolean,
  strictTrailingSlash: boolean,
): Record<string, unknown> {
  if (caseSensitive) {
    return strictTrailingSlash
      ? DEFAULT_FULL_TEST_OPTIONS_CASE_SENSITIVE_STRICT
      : DEFAULT_FULL_TEST_OPTIONS_CASE_SENSITIVE;
  }

  return strictTrailingSlash
    ? DEFAULT_FULL_TEST_OPTIONS_STRICT
    : DEFAULT_FULL_TEST_OPTIONS;
}

/**
 * Returns pre-computed partialTestOptions for given flags.
 */
function getPartialTestOptions(
  caseSensitive: boolean,
  strongMatching: boolean,
): Record<string, unknown> {
  if (caseSensitive) {
    return strongMatching
      ? DEFAULT_PARTIAL_TEST_OPTIONS_CASE_SENSITIVE
      : DEFAULT_PARTIAL_TEST_OPTIONS_CASE_SENSITIVE_WEAK;
  }

  return strongMatching
    ? DEFAULT_PARTIAL_TEST_OPTIONS
    : DEFAULT_PARTIAL_TEST_OPTIONS_WEAK;
}

/**
 * Attempts to match a node against a path segment.
 */
function tryMatchNode(
  node: RouteTree,
  parser: PathParser,
  segment: string,
  config: MatchConfig,
): Record<string, unknown> | null {
  // Try full match for leaf nodes
  if (node.children.length === 0) {
    const fullMatch = parser.test(segment, config.fullTestOptions);

    if (fullMatch) {
      return fullMatch;
    }
  }

  // Try partial match
  return parser.partialTest(segment, config.partialTestOptions);
}

/**
 * Calculates the path consumed by a match.
 */
function buildConsumedPath(
  parser: PathParser,
  match: Record<string, unknown>,
  config: MatchConfig,
  isLeafNode: boolean,
): string {
  let consumedPath = parser.build(match, config.buildOptions);

  if (!config.strictTrailingSlash && isLeafNode) {
    consumedPath = consumedPath.replace(TRAILING_SLASH, "");
  }

  return consumedPath;
}

/**
 * Calculates remaining path after consuming matched portion.
 */
function calculateRemainingPath(
  segment: string,
  consumedPath: string,
  config: MatchConfig,
  isLeafNode: boolean,
  isRoot: boolean,
  parser: PathParser,
): string {
  // After successful match, consumedPath is always a prefix of segment (case-insensitive)
  // because consumedPath is built from the same params extracted from segment
  let remainingPath = segment.slice(consumedPath.length);

  if (!config.strictTrailingSlash && isLeafNode) {
    remainingPath = remainingPath.replace(LEADING_SLASH_QUERY, "?");
  }

  const { querystring } = omit(
    getSearch(segment.slice(consumedPath.length)),
    parser.queryParams,
    config.queryParams,
  );

  remainingPath =
    getPath(remainingPath) + (querystring ? `?${querystring}` : "");

  if (
    !config.strictTrailingSlash &&
    !isRoot &&
    remainingPath === "/" &&
    !consumedPath.endsWith("/")
  ) {
    remainingPath = "";
  }

  return remainingPath;
}

/**
 * Handles remaining query params in non-strict mode.
 * Optimized with fast path for empty query strings and direct assignment.
 */
function handleRemainingQueryParams(
  currentMatch: MatchResponse,
  remainingPath: string,
): MatchResponse {
  // Direct assignment: parse directly into params object
  // Avoids intermediate object creation and Object.assign overhead
  // Note: remainingPath always has format "?key=value" (length > 1)
  // because calculateRemainingPath only adds "?" when querystring is non-empty
  parseInto(remainingPath.slice(1), currentMatch.params);

  return currentMatch;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extracts the path portion before query string.
 * Uses indexOf instead of split for better performance.
 */
function getPath(path: string): string {
  const idx = path.indexOf("?");

  return idx === -1 ? path : path.slice(0, idx);
}

/**
 * Extracts the query string portion from path.
 * Uses indexOf instead of split for better performance.
 */
function getSearch(path: string): string {
  const idx = path.indexOf("?");

  return idx === -1 ? "" : path.slice(idx + 1);
}
