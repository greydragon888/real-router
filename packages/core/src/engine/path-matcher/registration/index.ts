// Registration entry + orchestration: `registerNode` (the one public entry, re-exported
// for `SegmentMatcher`) runs the per-node grammar pre-pass (Реш.2-A), compile, and trie
// insertion, plus the route-meta / query-and-constraint collection helpers.
// Concerns split into ./context ./errors ./trieNodes ./trie ./buildParts.

import { EMPTY_PARAM_META, INVALID_QUERY_NAME_RGX } from "../buildParamMeta";
import { parseSegment, splitPathSegments } from "../parseSegment";
import { buildFullPath, normalizeTrailingSlash } from "../pathUtils";
import { compileBuildParts } from "./buildParts";
import {
  EMPTY_PARAMS,
  EMPTY_SEARCH,
  EMPTY_ROUTE_META,
  EMPTY_STRINGS,
  EMPTY_STRING_SET,
  type RegistrationState,
} from "./context";
import {
  throwDuplicateParamName,
  throwInvalidQueryParamName,
  throwDoubleSlashInPath,
  throwSegmentGrammarError,
} from "./errors";
import { insertIntoTrie, insertSlashChildIntoTrie } from "./trie";
import {
  concealUnsafeKey,
  emptyRecord,
  publishRecord,
} from "../../../utils/ingest";

import type { CompiledRoute, MatcherInputNode } from "../types";

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2073). */
const freeze = Object.freeze;

export type { RegistrationState } from "./context";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const hasOwn = Object.hasOwn;

/**
 * The double-slash rule (#2010), over the path as DECLARED.
 *
 * ⚠ Not over `paramMeta.pathPattern`, which the grammar pass below uses: that
 * one is query-stripped, so a `//` inside a query declaration slipped past the
 * backstop while the route-tree gate — which scans the declared string —
 * refused it. Same input, two verdicts, which is the asymmetry #2010 is about.
 */
function assertNoDoubleSlash(declaredPath: string): void {
  const segments = splitPathSegments(declaredPath);

  for (const [index, segment] of segments.entries()) {
    // An EMPTY segment is `//` — but only between two others: the leading `/`
    // and a trailing one each produce one legitimately.
    if (segment === "" && index > 0 && index < segments.length - 1) {
      throwDoubleSlashInPath(declaredPath);
    }
  }
}

/**
 * Per-segment grammar backstop: every code `parseSegment` reports, over the
 * query-stripped pattern the tokenizer is written for.
 */
function assertSegmentGrammar(rawNodePath: string): void {
  for (const segment of splitPathSegments(rawNodePath)) {
    const token = parseSegment(segment);

    if ("error" in token) {
      throwSegmentGrammarError(token.error, segment);
    }
  }
}

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

  // Per-segment grammar backstop: the trie's own grammar verdict reads the SAME
  // `parseSegment` tokenizer the route-tree gate reads (`findSegmentGrammarError`),
  // so backstop and gate cannot drift on a per-segment form. One pass over the RAW
  // path rejects every rejection form: name-less (#858), fused marker (#1050),
  // trailing marker (#1324), and the removed forms `optional-removed` /
  // `constraint-removed` (M1). So `processSegment` downstream sees only
  // grammatically valid `static | :param | *splat` segments — it asks the same
  // tokenizer for the kind rather than re-testing the leading character (#1998).
  assertNoDoubleSlash(node.path);
  assertSegmentGrammar(rawNodePath);

  // 3-token grammar (M1): no `<...>` constraint to strip before trie insertion.
  const nodePath = rawNodePath;

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

  const frozenSegments = freeze([...segments]);
  const frozenMeta = buildMeta(frozenSegments);

  const normalizedPath = normalizeTrailingSlash(matchPath);

  const declaredQueryParams = collectDeclaredQueryParams(
    state.rootQueryParams,
    segments,
  );

  // Slash-child: use parent path for buildParts (not slash-child's path)
  const buildPath = slashChild
    ? normalizeTrailingSlash(parentPath)
    : normalizedPath;

  const { buildStaticParts, buildParamSlots } = compileBuildParts(
    buildPath,
    // Stryker disable next-line MethodExpression: equivalent — slash-child buildParts: dropping the last segment vs keeping it yields identical buildStaticParts here (no own params on the slash-child). Proven by injection (full suite green).
    slashChild ? segments.slice(0, -1) : segments,
    state.options.urlParamsEncoding,
    state.rootUrlParams,
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
  // never round-trips (`<`/`>` in the name). A name shared with a path param
  // (`/a/:tab?tab`) is legal under M2 — separate params/search channels (#1548).
  validateQueryParamDeclarations(node.fullName, declaredQueryParams);

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
    buildStaticParts,
    buildParamSlots,
    buildParamNamesSet,
    // Initialized here (not added conditionally below) so static and param
    // routes share one hidden class — avoids a megamorphic CompiledRoute (#1009).
    cachedResult: undefined,
  };

  // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: equivalent — cachedResult is a pure match() optimization; #buildResult recomputes the same value on a miss (proven: disabling the whole static cache keeps the unit+property suite green)
  if (node.paramMeta.urlParams.length === 0) {
    compiled.cachedResult = freeze({
      segments: compiled.matchSegments,
      params: EMPTY_PARAMS,
      search: EMPTY_SEARCH,
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

    meta ??= emptyRecord<Record<string, "url" | "query">>();
    meta[segment.fullName] = segment.paramTypeMap;
  }

  // ⚑ `concealUnsafeKey` between the publish and the freeze (#1957). The keys
  // here are ROUTE NAMES and core accepts one spelled `__proto__` (#1801), so
  // `publishRecord`'s spread — which restores `Object.prototype` on purpose —
  // hands out a record whose own `"__proto__"` swaps the prototype of anything
  // that merges it. The value is a `paramTypeMap`, an object, so this one is a
  // genuine swap primitive rather than the entry-loss near-miss `buildParamMeta`
  // carries.
  //
  // ⚠ Withheld from ENUMERATION, not deleted, and the difference is measured:
  // this record is core's own working table (`segmentParamsEqual` reads
  // `meta[segmentName]` per navigation), so a delete sends that read to the
  // INHERITED accessor, which answers `Object.prototype` — an object with no
  // keys, i.e. "params unchanged". A `:id` change then stops re-activating the
  // segment.
  return meta === undefined
    ? EMPTY_ROUTE_META
    : freeze(concealUnsafeKey(publishRecord(meta)));
}

// Allocation-free emptiness probe for a segment's paramTypeMap (Object.keys
// would allocate a fresh array per segment during registration).
function hasAnyParam(
  paramTypeMap: Readonly<Record<string, "url" | "query">>,
): boolean {
  for (const key in paramTypeMap) {
    if (hasOwn(paramTypeMap, key)) {
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

function validateQueryParamDeclarations(
  routeName: string,
  queryParams: readonly string[],
): void {
  // A path/query name collision (`/a/:tab?tab`) is legal under M2 — `tab` lives
  // in `state.params` AND `state.search` as separate channels (RFC-4 M2 /
  // #1548); the former "declared as both" rejection is gone. Only a query name
  // that can never round-trip (contains `<`/`>`) is still rejected.
  for (const name of queryParams) {
    if (INVALID_QUERY_NAME_RGX.test(name)) {
      throwInvalidQueryParamName(routeName, name);
    }
  }
}
