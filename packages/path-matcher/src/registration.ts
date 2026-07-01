import { PARAM_NAME_PATTERN } from "./buildParamMeta";
import { encodeParam, ENCODING_METHODS } from "./encoding";
import {
  buildFullPath,
  createSegmentNode,
  normalizeTrailingSlash,
} from "./pathUtils";

import type {
  BuildParamSlot,
  CompiledRoute,
  ConstraintPattern,
  MatcherInputNode,
  ResolvedMatcherOptions,
  SegmentNode,
  URLParamsEncodingType,
} from "./types";

// =============================================================================
// Registration State
// =============================================================================

export interface RegistrationState {
  readonly root: SegmentNode;
  readonly options: ResolvedMatcherOptions;
  readonly routesByName: Map<string, CompiledRoute>;
  readonly segmentsByName: Map<string, readonly MatcherInputNode[]>;
  readonly metaByName: Map<
    string,
    Readonly<Record<string, Record<string, "url" | "query">>>
  >;
  readonly staticCache: Map<string, CompiledRoute>;
  readonly rootQueryParams: readonly string[];
}

// =============================================================================
// Constants
// =============================================================================

// eslint-disable-next-line sonarjs/super-linear-regex -- Constraint pattern regex - bounded input from route definitions, not user input
const CONSTRAINT_PATTERN_RGX = /<[^>]*>/g;

// =============================================================================
// Registration Functions
// =============================================================================

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
  const pathPattern = node.paramMeta.pathPattern;
  const strippedPattern =
    isAbsolute && pathPattern.startsWith("~")
      ? pathPattern.slice(1)
      : pathPattern;
  const rawNodePath = isAbsolute ? strippedPattern : pathPattern;

  // Strip constraint patterns (e.g., <\d+>, <[^/]+>) from path before trie insertion.
  // Constraints like <[^/]+> contain "/" which breaks segment splitting in indexOf("/", start).
  const nodePath = rawNodePath.replaceAll(CONSTRAINT_PATTERN_RGX, "");

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

// =============================================================================
// Compile & Register
// =============================================================================

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

  const compiled: CompiledRoute = {
    name: node.fullName,
    parent: parentRoute,
    depth: segments.length - 1,
    matchSegments: frozenSegments,
    meta: frozenMeta,
    declaredQueryParams,
    declaredQueryParamsSet: new Set(declaredQueryParams),
    hasTrailingSlash: matchPath.length > 1 && matchPath.endsWith("/"),
    constraintPatterns,
    hasConstraints: constraintPatterns.size > 0,
    buildStaticParts,
    buildParamSlots,
    buildParamNamesSet: new Set(buildParamSlots.map((slot) => slot.paramName)),
  };

  // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: equivalent — cachedResult is a pure match() optimization; #buildResult recomputes the same value on a miss (proven: disabling the whole static cache keeps the unit+property suite green)
  if (node.paramMeta.urlParams.length === 0) {
    compiled.cachedResult = Object.freeze({
      segments: compiled.matchSegments,
      params: Object.freeze({}),
      meta: compiled.meta,
    });
  }

  state.routesByName.set(node.fullName, compiled);
  state.segmentsByName.set(node.fullName, frozenSegments);
  state.metaByName.set(node.fullName, frozenMeta);

  if (slashChild) {
    registerSlashChild(state, compiled, parentPath);
  } else {
    registerStandardRoute(state, compiled, matchPath, normalizedPath, node);
  }

  return compiled;
}

// =============================================================================
// Meta
// =============================================================================

function buildMeta(
  segments: readonly MatcherInputNode[],
): Readonly<Record<string, Record<string, "url" | "query">>> {
  const meta: Record<string, Record<string, "url" | "query">> = {};

  for (const segment of segments) {
    meta[segment.fullName] = segment.paramTypeMap;
  }

  return Object.freeze(meta);
}

// =============================================================================
// Slash Child & Standard Route Registration
// =============================================================================

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

// =============================================================================
// Param-Name Conflict Detection
// =============================================================================

/**
 * Guards against param-name aliasing in the segment trie (issue #736).
 *
 * A parametric (`:name`) or splat (`*name`) position in the trie is keyed by
 * **position**, not by name — but the captured value is written under the name
 * recorded on that position. When two *different* routes share a position under
 * *different* names (e.g. `/user/:id` and `/user/:slug/profile`),
 * first-registration wins the name, so the second route silently captures its
 * value under the wrong key. Through `rewritePathOnMatch` that silent key-swap
 * becomes a hard `start()` crash on a legitimate config — so we reject the
 * ambiguity loudly at registration instead of corrupting matches.
 *
 * The conflict is strictly **cross-route**. A single route may legitimately land
 * two differently-named params on the same trie position via the optional-omit
 * branch — e.g. `/a/:b?/:c?/d` or `/a/:b?/:c/d`, where omitting `:b?` lets the
 * next param occupy `:b?`'s slot. That intra-route aliasing is the established,
 * tested semantics (first optional wins the slot), not a bug. We tell the two
 * apart with `ownNodes`: the set of nodes whose param/splat child was *created
 * during the current route's insertion*. A differing name on a node in that set
 * is the same route revisiting its own slot (keep-first); on any other node it
 * is a prior route's slot (throw).
 */
function throwParamNameConflict(
  existingName: string,
  newName: string,
  marker: ":" | "*",
): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Parameter name conflict at the same path ` +
      `position: '${marker}${existingName}' and '${marker}${newName}'. A ` +
      `parametric URL segment binds to a single name across every route that ` +
      `shares that position — the value cannot be captured under two names. ` +
      `Rename one so both routes agree (e.g. use '${marker}${existingName}' in both).`,
  );
}

/**
 * A bare marker (`:` or `*` with no name) compiles to a phantom empty-named
 * slot: match captures the value under `""`, buildPath emits the literal marker,
 * and buildParamMeta reports no param at all — a three-way match/build/meta
 * desync of the same class as #736/#738 (#858). Reject it at registration,
 * symmetrically for both markers, instead of corrupting the trie.
 */
function throwEmptyParamName(marker: ":" | "*"): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Empty parameter name: a bare '${marker}' ` +
      `marker must be followed by a name (e.g. '${marker}id'). A name-less ` +
      `marker would capture under an empty key at match but emit a literal ` +
      `'${marker}' at build — the two disagree, so it is rejected.`,
  );
}

/**
 * Rejects a `:`/`*` marker fused to a static prefix within a segment (`a:b`,
 * `x:id`, `a*b`): the build/meta param regexes are unanchored and extract it as
 * a param, but this trie honors a marker only at segment start and compiles the
 * segment as a static literal — so `buildPath` emits an unmatchable URL while
 * `match` rejects it (#1050). The sibling of {@link throwEmptyParamName} (#858):
 * an ambiguous marker placement the three parsers cannot agree on. route-tree's
 * validation gate catches this first with a route-contextual error; this is the
 * standalone registration backstop.
 */
function throwFusedMarker(segment: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Fused parameter marker in segment "${segment}": ` +
      `a ':'/'*' marker must begin a segment (e.g. 'a/:b', not 'a:b'). build extracts ` +
      `it as a param while the trie treats the segment as a literal — the two disagree.`,
  );
}

/**
 * The param name is the run of grammar chars right after the marker, up to a
 * `<…>` constraint or a trailing optional `?`. `PARAM_NAME_PATTERN` (`[^/?<]+`)
 * already excludes `/`, `?`, and `<`, so one positive match captures the name.
 */
const PARAM_NAME_RGX = new RegExp(`^[:*](${PARAM_NAME_PATTERN})`);

/**
 * A `:`/`*` marker followed by a name. Detects a fused marker in a static-led
 * segment (#1050 backstop): reuses `PARAM_NAME_PATTERN` so it matches exactly
 * what the build/meta regexes would extract — a marker with NO name is left to
 * the name-less path ({@link throwEmptyParamName}, #858).
 */
const FUSED_MARKER_RGX = new RegExp(`[:*]${PARAM_NAME_PATTERN}`);

/**
 * Extracts the param name from a `:name` / `:name?` / `:name<…>` segment,
 * rejecting a name-less `:` (#858). Single source for the param branch in
 * `processSegment` and the optional fork in `insertIntoTrieFrom`, so the two
 * can't diverge.
 *
 * Matches the name **positively** against the grammar rather than stripping the
 * `<…>` constraint with a global replace: the strip form leaves a dangling `<`
 * on a malformed/unterminated constraint (`:id<…` with no `>`) — which CodeQL
 * flags as incomplete multi-character sanitization — whereas the positive match
 * stops at the first `<`/`?` and never lets constraint text leak into the name.
 */
function extractParamName(segment: string): string {
  const paramName = PARAM_NAME_RGX.exec(segment)?.[1] ?? "";

  if (paramName === "") {
    throwEmptyParamName(":");
  }

  return paramName;
}

/**
 * Returns the param child of `node`, creating it on first use. A pre-existing
 * child with a *different* name is a #736 conflict unless `node` is in
 * `ownNodes` (the current route created this slot — the optional-omit branch).
 */
function ensureParamChild(
  node: SegmentNode,
  paramName: string,
  ownNodes: Set<SegmentNode>,
): SegmentNode {
  if (!node.paramChild) {
    node.paramChild = { node: createSegmentNode(), name: paramName };
    ownNodes.add(node);
  } else if (node.paramChild.name !== paramName && !ownNodes.has(node)) {
    throwParamNameConflict(node.paramChild.name, paramName, ":");
  }

  return node.paramChild.node;
}

/** Splat counterpart of {@link ensureParamChild}. */
function ensureSplatChild(
  node: SegmentNode,
  splatName: string,
  ownNodes: Set<SegmentNode>,
): SegmentNode {
  if (!node.splatChild) {
    node.splatChild = { node: createSegmentNode(), name: splatName };
    ownNodes.add(node);
  } else if (node.splatChild.name !== splatName && !ownNodes.has(node)) {
    throwParamNameConflict(node.splatChild.name, splatName, "*");
  }

  return node.splatChild.node;
}

// =============================================================================
// Trie Insertion
// =============================================================================

function insertIntoTrie(
  state: RegistrationState,
  compiled: CompiledRoute,
  fullPath: string,
): void {
  const normalized = normalizeTrailingSlash(fullPath);

  if (normalized === "/") {
    state.root.route = compiled;

    return;
  }

  // Nodes whose param/splat child is created during THIS route's insertion.
  // Lets the conflict guard distinguish a route revisiting its own slot (the
  // optional-omit branch) from a genuine cross-route collision (#736).
  const ownNodes = new Set<SegmentNode>();

  // Visited (node, start) pairs for THIS insertion — collapses the take/skip
  // fan-out of consecutive optional params from O(2^N) to polynomial (#849).
  const visited = new Map<SegmentNode, Set<number>>();

  insertIntoTrieFrom(
    state,
    state.root,
    normalized,
    1,
    compiled,
    ownNodes,
    visited,
  );
}

function insertIntoTrieFrom(
  state: RegistrationState,
  node: SegmentNode,
  path: string,
  start: number,
  compiled: CompiledRoute,
  ownNodes: Set<SegmentNode>,
  visited: Map<SegmentNode, Set<number>>,
): void {
  // #849: each optional param forks this function into a "take" and a "skip"
  // branch, and those branches converge on the same (node, start) pairs across
  // consecutive optionals — without memoization that is O(2^N) work for N
  // optionals (the trie stays small; only the work explodes). Inserting from a
  // given (node, start) is deterministic for a fixed (path, compiled), and the
  // only side effects (ensureParamChild returning an existing child,
  // `node.route ??=`/`=` with the same compiled) are idempotent, so a revisit is
  // pure redundancy — record the entry and skip repeats. This collapses the
  // fan-out to O(distinct (node, start) pairs).
  let seenStarts = visited.get(node);

  if (seenStarts === undefined) {
    seenStarts = new Set<number>();
    visited.set(node, seenStarts);
  } else if (seenStarts.has(start)) {
    return;
  }

  seenStarts.add(start);

  const length = path.length;

  while (start <= length) {
    const end = path.indexOf("/", start);
    const segmentEnd = end === -1 ? length : end;
    const segment = path.slice(start, segmentEnd);

    if (segment.endsWith("?")) {
      const paramName = extractParamName(segment);
      const paramChildNode = ensureParamChild(node, paramName, ownNodes);

      // Path with param: continue recursively from paramChild
      insertIntoTrieFrom(
        state,
        paramChildNode,
        path,
        segmentEnd + 1,
        compiled,
        ownNodes,
        visited,
      );

      // Path without param: skip this segment and continue from node
      if (segmentEnd >= length) {
        node.route ??= compiled;
      } else {
        insertIntoTrieFrom(
          state,
          node,
          path,
          segmentEnd + 1,
          compiled,
          ownNodes,
          visited,
        );
      }

      return;
    }

    node = processSegment(state, node, segment, ownNodes);
    start = segmentEnd + 1;
  }

  node.route = compiled;
}

function insertSlashChildIntoTrie(
  state: RegistrationState,
  compiled: CompiledRoute,
  parentPath: string,
): void {
  const node = walkTrie(state, parentPath);

  node.slashChildRoute = compiled;
}

// =============================================================================
// Trie Walking
// =============================================================================

function walkTrie(state: RegistrationState, fullPath: string): SegmentNode {
  return walkTrieFrom(state, state.root, fullPath);
}

function walkTrieFrom(
  state: RegistrationState,
  startNode: SegmentNode,
  path: string,
): SegmentNode {
  const normalized = normalizeTrailingSlash(path);

  /* v8 ignore start -- defensive: slash-child always passes valid path */
  if (normalized === "/" || normalized === "") {
    return startNode;
  }
  /* v8 ignore stop */

  let node = startNode;
  let start = 1;
  const length = normalized.length;

  // Slash-child re-walks an already-inserted path of the same route family —
  // names always match, so the conflict guard never fires; a throwaway set
  // keeps the shared `processSegment` signature satisfied.
  const ownNodes = new Set<SegmentNode>();

  while (start <= length) {
    const end = normalized.indexOf("/", start);
    const segmentEnd = end === -1 ? length : end;

    /* v8 ignore start -- defensive: indexOf always returns valid index for non-empty segments */
    if (segmentEnd <= start) {
      break;
    }
    /* v8 ignore stop */

    const segment = normalized.slice(start, segmentEnd);

    node = processSegment(state, node, segment, ownNodes);
    start = segmentEnd + 1;
  }

  return node;
}

// =============================================================================
// Segment Processing
// =============================================================================

function processSegment(
  state: RegistrationState,
  node: SegmentNode,
  segment: string,
  ownNodes: Set<SegmentNode>,
): SegmentNode {
  if (segment.startsWith("*")) {
    const splatName = segment.slice(1);

    if (splatName === "") {
      throwEmptyParamName("*");
    }

    const child = ensureSplatChild(node, splatName, ownNodes);

    // Stryker disable next-line BooleanLiteral: equivalent — sets hasChildren on the node ACQUIRING a splat child; only a splat NODE's own hasChildren is read (in #matchSplat), and splat-of-splat is unreachable (splat is terminal-greedy). Proven by injection.
    node.hasChildren = true;

    return child;
  }

  if (segment.startsWith(":")) {
    const paramName = extractParamName(segment);
    const child = ensureParamChild(node, paramName, ownNodes);

    node.hasChildren = true;

    return child;
  }

  // The segment does not START with a marker, so it is compiled as a static
  // literal below. A `:`/`*` (with a name) still lurking inside it is a marker
  // fused to a static prefix (`a:b`, `x:id`, `a*b`): build/meta extract it as a
  // param while this literal compilation ignores it, so the two drift (#1050).
  // Reject it — the backstop for route-tree's route-contextual gate.
  if (FUSED_MARKER_RGX.test(segment)) {
    throwFusedMarker(segment);
  }

  const key = state.options.caseSensitive ? segment : segment.toLowerCase();

  if (!(key in node.staticChildren)) {
    node.staticChildren[key] = createSegmentNode();
    node.hasChildren = true;
  }

  return node.staticChildren[key];
}

// =============================================================================
// Build Parts Compilation
// =============================================================================

function compileBuildParts(
  normalizedPath: string,
  segments: readonly MatcherInputNode[],
  encoding: URLParamsEncodingType,
): {
  buildStaticParts: readonly string[];
  buildParamSlots: readonly BuildParamSlot[];
} {
  const allUrlParams = new Set<string>();
  const allSplatParams = new Set<string>();

  for (const segment of segments) {
    for (const param of segment.paramMeta.urlParams) {
      allUrlParams.add(param);
    }

    for (const param of segment.paramMeta.spatParams) {
      allSplatParams.add(param);
    }
  }

  // Stryker disable next-line BlockStatement: equivalent — fast path; the param-compile loop below yields [normalizedPath]/[] when allUrlParams is empty — identical output. Proven by injection.
  if (allUrlParams.size === 0) {
    return { buildStaticParts: [normalizedPath], buildParamSlots: [] };
  }

  const parts: string[] = [];
  const slots: BuildParamSlot[] = [];

  // Name class derives from the single source of truth in buildParamMeta so the
  // build-path grammar matches the match-path grammar exactly (#738) — e.g.
  // `:my-param` builds under the same name it matched under.
  const paramRgx = new RegExp(
    String.raw`[:*](${PARAM_NAME_PATTERN})(?:<[^>]*>)?(\?)?`,
    "gu",
  );
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = paramRgx.exec(normalizedPath)) !== null) {
    const paramName = match[1];
    const isOptional = match[2] === "?";

    parts.push(normalizedPath.slice(lastIndex, match.index));

    const isSplat = allSplatParams.has(paramName);
    // Splat segments are encoded individually (preserving "/") by the single
    // `encodeParam` implementation — the same one the encoding unit/property
    // suites assert, so prod and the oracle can't drift (#860).
    const encoder = isSplat
      ? (value: string): string => encodeParam(value, encoding, true)
      : ENCODING_METHODS[encoding];

    slots.push({ paramName, isOptional, encoder });

    lastIndex = match.index + match[0].length;
  }

  parts.push(normalizedPath.slice(lastIndex));

  return { buildStaticParts: parts, buildParamSlots: slots };
}

// =============================================================================
// Query Params & Constraints Collection
// =============================================================================

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

  return queryParams;
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

  return patterns;
}
