// Registration entry + orchestration: `registerNode` (the one public entry, re-exported
// for `SegmentMatcher`) runs the per-node grammar pre-pass (Реш.2-A), compile, and trie
// insertion, plus the route-meta / query-and-constraint collection helpers.
// Concerns split into ./context ./errors ./trieNodes ./trie ./buildParts.

import { EMPTY_PARAM_META } from "../buildParamMeta";
import {
  INVALID_QUERY_NAME_RGX,
  isConstraintBalanced,
} from "../constraint-grammar";
import {
  hasMultipleOptionalsBeforeSplat,
  parseSegment,
  splitPathSegments,
} from "../parseSegment";
import { buildFullPath, normalizeTrailingSlash } from "../pathUtils";
import { compileBuildParts } from "./buildParts";
import {
  CONSTRAINT_PATTERN_RGX,
  EMPTY_CONSTRAINTS,
  EMPTY_PARAMS,
  EMPTY_ROUTE_META,
  EMPTY_STRINGS,
  EMPTY_STRING_SET,
  type RegistrationState,
} from "./context";
import {
  throwDuplicateParamName,
  throwInvalidQueryParamName,
  throwMultipleOptionalsBeforeSplat,
  throwPathQueryNameCollision,
  throwSegmentGrammarError,
  throwUnbalancedConstraint,
} from "./errors";
import { insertIntoTrie, insertSlashChildIntoTrie } from "./trie";

import type {
  CompiledRoute,
  ConstraintPattern,
  MatcherInputNode,
} from "../types";

export type { RegistrationState } from "./context";

export function registerNode(
  state: RegistrationState,
  node: MatcherInputNode,
  parentPath: string,
  segments: MatcherInputNode[],
  parentRoute: CompiledRoute | null,
): void {
  const isRoot = node.fullName === "";

  if (!isRoot) {
    segments.push(node);
  }

  const isAbsolute = node.absolute;
  // The EMPTY_PARAM_META sentinel (fully-static node) carries pathPattern "";
  // its real pattern is the node's own path (sentinel is only installed when
  // the two were reference-equal).
  const pathPattern =
    node.paramMeta === EMPTY_PARAM_META
      ? node.path
      : node.paramMeta.pathPattern;
  const strippedPattern =
    isAbsolute && pathPattern.startsWith("~")
      ? pathPattern.slice(1)
      : pathPattern;
  const rawNodePath = isAbsolute ? strippedPattern : pathPattern;

  // Bare-core backstop for constraint-delimiter grammar (#804): reject a stray
  // unbalanced `<`/`>` before trie insertion. This is the ONE grammar check that
  // `parseSegment` cannot make per-segment — its name class `[^/?<]+` includes `>`,
  // so a `>` with no matching `<` is visible only by the balance COUNT over the
  // whole path. Runs first, so the per-segment pass below never sees an unbalanced
  // `<` (it would otherwise surface there as a spurious `unbalanced-constraint`).
  if (!isConstraintBalanced(rawNodePath)) {
    throwUnbalancedConstraint(rawNodePath);
  }

  // Per-segment grammar backstop (Реш.2): the trie's own grammar verdict now reads
  // the SAME `parseSegment` tokenizer the route-tree gate reads (`findSegmentGrammarError`),
  // so backstop and gate cannot drift on a per-segment form. One pass over the RAW
  // path (`splitPathSegments` is constraint-aware — a body can hold `/`) rejects
  // every such form: name-less (#858), fused marker (#1050), trailing marker
  // (#1324), optional splat (#1149), and the constraint forms empty / fused-suffix /
  // in-static (#804/#1150/#1311). Each code maps to the existing matcher-level
  // message (reject reason preserved per code; only the first-error ORDER on a
  // multi-error path follows the left-to-right scan). So `processSegment` /
  // `extractParamName` / `insertIntoTrieFrom` downstream see only grammatically
  // valid segments — their former per-segment throws are removed.
  for (const segment of splitPathSegments(rawNodePath)) {
    const token = parseSegment(segment);

    if ("error" in token) {
      throwSegmentGrammarError(token.error, segment, rawNodePath);
    }
  }

  // Strip constraint patterns (e.g., <\d+>, <[^/]+>) from path before trie insertion.
  // Constraints like <[^/]+> contain "/" which breaks segment splitting in indexOf("/", start).
  const nodePath = rawNodePath.replaceAll(CONSTRAINT_PATTERN_RGX, "");

  // #1287: two optional params directly before a splat can't be represented by a
  // single trie-slot fork — the outer optional's mark overwrites the inner's, silently
  // reshaping the omit-outer/take-inner form into the splat (`/:a<c1>?/:b<c2>?/*rest`).
  // Reject. The predicate is shared verbatim with route-tree's validation gate (it runs
  // on the RAW path — `splitPathSegments` is constraint-aware), so the two can't drift.
  if (hasMultipleOptionalsBeforeSplat(rawNodePath)) {
    throwMultipleOptionalsBeforeSplat(rawNodePath);
  }

  const matchPath = isAbsolute ? nodePath : buildFullPath(parentPath, nodePath);

  const compileParentPath = isAbsolute ? "" : parentPath;

  const currentRoute: CompiledRoute | null = isRoot
    ? parentRoute
    : compileAndRegisterRoute(
        state,
        node,
        matchPath,
        compileParentPath,
        segments,
        parentRoute,
      );

  for (const child of node.children.values()) {
    registerNode(state, child, matchPath, segments, currentRoute);
  }

  if (!isRoot) {
    segments.pop();
  }
}

function compileAndRegisterRoute(
  state: RegistrationState,
  node: MatcherInputNode,
  matchPath: string,
  parentPath: string,
  segments: MatcherInputNode[],
  parentRoute: CompiledRoute | null,
): CompiledRoute {
  const slashChild = isSlashChild(matchPath, parentPath);

  const frozenSegments = Object.freeze([...segments]);
  const frozenMeta = buildMeta(frozenSegments);

  const normalizedPath = normalizeTrailingSlash(matchPath);

  const declaredQueryParams = collectDeclaredQueryParams(
    state.rootQueryParams,
    segments,
  );
  const constraintPatterns = collectConstraintPatterns(segments);

  // Slash-child: use parent path for buildParts (not slash-child's path)
  const buildPath = slashChild
    ? normalizeTrailingSlash(parentPath)
    : normalizedPath;

  const { buildStaticParts, buildParamSlots } = compileBuildParts(
    buildPath,
    // Stryker disable next-line MethodExpression: equivalent — slash-child buildParts: dropping the last segment vs keeping it yields identical buildStaticParts here (no own params on the slash-child). Proven by injection (full suite green).
    slashChild ? segments.slice(0, -1) : segments,
    state.options.urlParamsEncoding,
  );

  // #1151: reject a duplicate param name within one route's full path (`/:id/:id`,
  // a param+splat clash `/:x/*x`, or a parent `/a/:x` + child `/:x`). buildParamSlots
  // keeps duplicates; the trie stores them at DIFFERENT positions under the SAME
  // name, so match's later capture silently overwrites the earlier and
  // rewritePathOnMatch then rewrites the user's URL from the single survivor. The
  // #736 conflict guard only fires on DIFFERENTLY-named params at ONE position, so
  // this same-name case slips through.
  const buildParamNames = buildParamSlots.map((slot) => slot.paramName);
  const buildParamNamesSet =
    buildParamNames.length === 0 ? EMPTY_STRING_SET : new Set(buildParamNames);

  if (buildParamNamesSet.size !== buildParamNames.length) {
    throwDuplicateParamName(node.fullName, buildParamNames);
  }

  // #1242 §5.1/§5.2/§5.3: validate query-param DECLARATIONS. A declared query name
  // must be a clean token — reject one carrying constraint/query metacharacters
  // (`:b?<\d+>` declares query `<\d+>`; `?tab=1` declares `tab=1`), and reject a name
  // shared with a path param (`/a/:tab?tab`), where buildPath would emit the value
  // twice (`/a/x?tab=x`). Both degraded silently before.
  validateQueryParamDeclarations(
    node.fullName,
    declaredQueryParams,
    buildParamNamesSet,
  );

  const compiled: CompiledRoute = {
    name: node.fullName,
    parent: parentRoute,
    matchSegments: frozenSegments,
    meta: frozenMeta,
    declaredQueryParams,
    declaredQueryParamsSet:
      declaredQueryParams.length === 0
        ? EMPTY_STRING_SET
        : new Set(declaredQueryParams),
    hasTrailingSlash: matchPath.length > 1 && matchPath.endsWith("/"),
    constraintPatterns,
    hasConstraints: constraintPatterns.size > 0,
    buildStaticParts,
    buildParamSlots,
    buildParamNamesSet,
    // Initialized here (not added conditionally below) so static and param
    // routes share one hidden class — avoids a megamorphic CompiledRoute (#1009).
    cachedResult: undefined,
  };

  // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: equivalent — cachedResult is a pure match() optimization; #buildResult recomputes the same value on a miss (proven: disabling the whole static cache keeps the unit+property suite green)
  if (node.paramMeta.urlParams.length === 0) {
    compiled.cachedResult = Object.freeze({
      segments: compiled.matchSegments,
      params: EMPTY_PARAMS,
      meta: compiled.meta,
    });
  }

  state.routesByName.set(node.fullName, compiled);

  if (slashChild) {
    registerSlashChild(state, compiled, parentPath);
  } else {
    registerStandardRoute(state, compiled, matchPath, normalizedPath, node);
  }

  return compiled;
}

function buildMeta(
  segments: readonly MatcherInputNode[],
): Readonly<Record<string, Record<string, "url" | "query">>> {
  let meta: Record<string, Record<string, "url" | "query">> | undefined;

  for (const segment of segments) {
    if (!hasAnyParam(segment.paramTypeMap)) {
      continue;
    }

    meta ??= {};
    meta[segment.fullName] = segment.paramTypeMap;
  }

  return meta === undefined ? EMPTY_ROUTE_META : Object.freeze(meta);
}

// Allocation-free emptiness probe for a segment's paramTypeMap (Object.keys
// would allocate a fresh array per segment during registration).
function hasAnyParam(
  paramTypeMap: Readonly<Record<string, "url" | "query">>,
): boolean {
  for (const key in paramTypeMap) {
    if (Object.hasOwn(paramTypeMap, key)) {
      return true;
    }
  }

  return false;
}

function registerSlashChild(
  state: RegistrationState,
  compiled: CompiledRoute,
  parentPath: string,
): void {
  insertSlashChildIntoTrie(state, compiled, parentPath);

  const parentNormalized = normalizeTrailingSlash(parentPath);
  const cacheKey = state.options.caseSensitive
    ? parentNormalized
    : parentNormalized.toLowerCase();

  if (state.staticCache.has(cacheKey)) {
    state.staticCache.set(cacheKey, compiled);
  }
}

function registerStandardRoute(
  state: RegistrationState,
  compiled: CompiledRoute,
  matchPath: string,
  normalizedPath: string,
  node: MatcherInputNode,
): void {
  insertIntoTrie(state, compiled, matchPath);

  // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: equivalent — staticCache is a pure match() optimization; #traverse resolves the same route on a miss (proven: disabling the whole static cache keeps the unit+property suite green)
  if (node.paramMeta.urlParams.length === 0) {
    const cacheKey = state.options.caseSensitive
      ? normalizedPath
      : // Stryker disable next-line MethodExpression: equivalent — the case-insensitive cache key only governs a hit; a miss falls through to #traverse, which is also case-insensitive
        normalizedPath.toLowerCase();

    state.staticCache.set(cacheKey, compiled);
  }
}

function isSlashChild(matchPath: string, parentPath: string): boolean {
  const normalizedMatch = normalizeTrailingSlash(matchPath);
  const normalizedParent = normalizeTrailingSlash(parentPath);

  return normalizedMatch === normalizedParent;
}

function collectDeclaredQueryParams(
  rootQueryParams: readonly string[],
  segments: readonly MatcherInputNode[],
): readonly string[] {
  // Stryker disable next-line ArrayDeclaration: equivalent — the array is populated then returned; a phantom seed element is never read back (declared-param loop skips absent keys, buildQueryString ignores it). Proven by injection.
  const queryParams: string[] = [];

  // Include query params declared on the root node (e.g., a root path like "?mode")
  if (rootQueryParams.length > 0) {
    queryParams.push(...rootQueryParams);
  }

  for (const segment of segments) {
    if (segment.paramMeta.queryParams.length > 0) {
      queryParams.push(...segment.paramMeta.queryParams);
    }
  }

  return queryParams.length === 0 ? EMPTY_STRINGS : queryParams;
}

function collectConstraintPatterns(
  segments: readonly MatcherInputNode[],
): ReadonlyMap<string, ConstraintPattern> {
  const patterns = new Map<string, ConstraintPattern>();

  for (const segment of segments) {
    for (const [paramName, pattern] of segment.paramMeta.constraintPatterns) {
      patterns.set(paramName, pattern);
    }
  }

  return patterns.size === 0 ? EMPTY_CONSTRAINTS : patterns;
}

function validateQueryParamDeclarations(
  routeName: string,
  queryParams: readonly string[],
  urlParamNames: ReadonlySet<string>,
): void {
  for (const name of queryParams) {
    if (INVALID_QUERY_NAME_RGX.test(name)) {
      throwInvalidQueryParamName(routeName, name);
    }

    if (urlParamNames.has(name)) {
      throwPathQueryNameCollision(routeName, name);
    }
  }
}
