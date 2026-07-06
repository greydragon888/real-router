import { PARAM_NAME_PATTERN } from "./buildParamMeta";
import {
  CONSTRAINT_BODY_PATTERN,
  hasConstraintInStaticSegment,
  hasFusedConstraintSuffix,
  INVALID_QUERY_NAME_RGX,
  isConstraintBalanced,
} from "./constraint-grammar";
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

// Shared frozen sentinels for the no-params/-constraints common case — avoid a
// fresh empty Set/Map/array per route (#1009). All are ReadonlySet/Map/[] and
// read-only on the match/build hot paths.
const EMPTY_STRINGS: readonly string[] = Object.freeze([]);
// #1240 §5: freeze the Set/Map shells too, so the "Shared frozen sentinels" claim
// above holds for ALL of them and the #1009 sentinels are consistent with route-tree's
// frozen `EMPTY_CHILDREN_MAP`. `Object.freeze` locks only the shell (not `.add`/`.set`
// — see route-tree INVARIANTS CC1), but these are `Readonly`-typed and never mutated.
const EMPTY_STRING_SET: ReadonlySet<string> = Object.freeze(new Set<string>());
const EMPTY_CONSTRAINTS: ReadonlyMap<string, ConstraintPattern> = Object.freeze(
  new Map<string, ConstraintPattern>(),
);
const EMPTY_PARAM_SLOTS: readonly BuildParamSlot[] = Object.freeze([]);
const EMPTY_PARAMS: Readonly<Record<string, unknown>> = Object.freeze({});

// =============================================================================
// Registration State
// =============================================================================

export interface RegistrationState {
  readonly root: SegmentNode;
  readonly options: ResolvedMatcherOptions;
  readonly routesByName: Map<string, CompiledRoute>;
  readonly staticCache: Map<string, CompiledRoute>;
  readonly rootQueryParams: readonly string[];
}

// =============================================================================
// Constants
// =============================================================================

// Constraint delimiter grammar derives from the single `CONSTRAINT_BODY_PATTERN`
// atom (#804) so the strip side cannot desync from match/build.

const CONSTRAINT_PATTERN_RGX = new RegExp(`<${CONSTRAINT_BODY_PATTERN}>`, "g");

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

  // Bare-core backstop for constraint-delimiter grammar (#804): reject an
  // unbalanced `<`/`>` or a semantically-empty `<>` before trie insertion — the
  // same producing-layer defense name-less (#858) and fused (#1050) markers get.
  // Without it, `createRouter([{ path: "/x/:id<\\d+" }])` built silently and
  // buildPath then emitted a garbage URL. Uses the single balance predicate.
  if (!isConstraintBalanced(rawNodePath)) {
    throwUnbalancedConstraint(rawNodePath);
  }

  if (rawNodePath.includes("<>")) {
    throwEmptyConstraint(rawNodePath);
  }

  // Static text fused to a constraint's closing '>' (`/:year<\d+>-archive`, #1150):
  // meta ends the name at '<' but the build side strips '<…>' then re-extracts the
  // name greedily, fusing the suffix — build name ≠ meta name ⇒ a silent dead route
  // (buildPath throws, match keys the constraint on a phantom name). The mirror of
  // #1050 on the OTHER side of the param. route-tree's gate catches it first.
  if (hasFusedConstraintSuffix(rawNodePath)) {
    throwFusedConstraintSuffix(rawNodePath);
  }

  // A `<...>` constraint in a STATIC segment (no ':'/'*' marker) — `/foo<bar>`,
  // `/a<b>` — is silently stripped by CONSTRAINT_PATTERN_RGX below (`/foo<bar>` →
  // `/foo`), reshaping the route with no signal. #1150 catches only a constraint
  // fused with TRAILING text; one cleanly ending a static segment slips through.
  // Reject it, the sibling of #1050/#1150 on the static-segment axis (#1311).
  if (hasConstraintInStaticSegment(rawNodePath)) {
    throwConstraintInStaticSegment(rawNodePath);
  }

  // Strip constraint patterns (e.g., <\d+>, <[^/]+>) from path before trie insertion.
  // Constraints like <[^/]+> contain "/" which breaks segment splitting in indexOf("/", start).
  const nodePath = rawNodePath.replaceAll(CONSTRAINT_PATTERN_RGX, "");

  // #1287: two optional params directly before a splat can't be represented by a
  // single trie-slot fork — the outer optional's mark overwrites the inner's, silently
  // reshaping the omit-outer/take-inner form into the splat (`/:a<c1>?/:b<c2>?/*rest`).
  // Reject. Scanned on the CONSTRAINT-STRIPPED path so a plain segment split is safe (a
  // constraint body can contain '/'). Both must be constrained, else #1264 B already
  // rejects the inner unconstrained optional→splat.
  if (hasMultipleOptionalsBeforeSplat(nodePath)) {
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
function throwEmptyParamName(): never {
  // Marker-agnostic: this fires for a bare ':'/'*' (`/x/:`, `/x/*`), a marker
  // carrying only a modifier/constraint (`/x/:?`, `/x/:<\d+>`), AND a static
  // segment with a trailing '?' (`/faq?`) — which the optional fork routes here
  // via `extractParamName`. So the message must NOT claim a specific ':' marker
  // (there isn't one for `/faq?`, #1241).
  throw new Error(
    `[SegmentMatcher.registerTree] Empty parameter name: a parameter marker ` +
      `(':' or '*') or an optional '?' must be followed by a name (e.g. ':id', ` +
      `'*rest', ':id?'). A name-less marker or modifier would capture under an ` +
      `empty key at match but emit a literal at build — the two disagree, so it ` +
      `is rejected.`,
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
 * #1154: whether a STATIC segment carries a code point outside ASCII (≥ U+0080).
 * A raw non-ASCII static (`café`) registers but never matches — match rejects
 * non-ASCII input and compares static keys raw. A per-code-point scan (`for…of`
 * iterates by code point, so surrogate pairs are handled).
 */
function hasNonAsciiSegment(segment: string): boolean {
  // #1285: charCodeAt (code UNIT) index loop, not for-of code points. For a
  // "has non-ASCII" predicate the result is identical — any surrogate (≥ 0xD800) is
  // itself ≥ 0x80, so an astral char is still flagged — without the iterator +
  // code-point decoding cost per static segment of every registered route.
  for (let i = 0; i < segment.length; i++) {
    // eslint-disable-next-line unicorn/prefer-code-point -- charCodeAt (code unit) is intentional: a "has non-ASCII" test needs only units (a surrogate is itself >= 0x80), and it skips the code-point decoding that codePointAt does per index (#1285)
    if (segment.charCodeAt(i) >= 0x80) {
      return true;
    }
  }

  return false;
}

// #1287: ≥2 optional params directly before a splat. Runs on the CONSTRAINT-STRIPPED
// path, so a plain `/` split is safe (a constraint body can contain '/').
function hasMultipleOptionalsBeforeSplat(strippedPath: string): boolean {
  const segments = strippedPath.split("/");

  for (let i = 2; i < segments.length; i++) {
    if (
      segments[i].startsWith("*") &&
      isOptionalParamSegment(segments[i - 1]) &&
      isOptionalParamSegment(segments[i - 2])
    ) {
      return true;
    }
  }

  return false;
}

function isOptionalParamSegment(segment: string): boolean {
  return segment.startsWith(":") && segment.endsWith("?");
}

function throwMultipleOptionalsBeforeSplat(path: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Two optional params directly before a splat in ` +
      `"${path}": a single trie slot carries only one optional→splat fork, so the ` +
      `outer optional would overwrite the inner and the omit-outer/take-inner form ` +
      `would silently reshape into the splat. Split into separate routes, or drop the ` +
      `'?' on one.`,
  );
}

function throwNonAsciiStatic(segment: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Non-ASCII static segment "${segment}": match ` +
      `rejects non-ASCII input and compares static keys raw, so this route would ` +
      `never match. Percent-encode it (e.g. "/caf%C3%A9") or use a param.`,
  );
}

/**
 * Rejects an optional splat (`*name?`): `buildParamMeta`/`compileBuildParts`
 * classify it as a splat (multi-segment, splat encoder preserves "/"), but the
 * optional fork would compile a plain param node that eats a single segment — a
 * three-way match/build/meta desync (`buildPath` emits multi-segment URLs `match`
 * rejects). The shape only "worked" for 0–1 segments, so rejecting loses nothing
 * real. The sibling of {@link throwEmptyParamName} (#858) / {@link throwFusedMarker}
 * (#1050). route-tree's validation gate catches this first with a route-contextual
 * error; this is the standalone registration backstop. (#1149)
 */
function throwOptionalSplat(segment: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Optional splat "${segment}" is not supported: ` +
      `a splat cannot be optional — build emits multi-segment URLs the matcher ` +
      `rejects. Use a required splat "*name".`,
  );
}

/**
 * Rejects an UNCONSTRAINED optional param directly before a splat (`/:v?/*rest`,
 * #1264, product decision). Without a constraint there is no validity signal to
 * disambiguate "take the optional" from "let the splat capture", so every
 * multi-segment value has two readings and `match` would silently reshape half the
 * input space — a wrong-name in new clothing, worse than the loud UNMATCH it had.
 * A CONSTRAINED optional→splat (`:v<c>?/*rest`) IS supported (A1). Sibling of the
 * optional-splat (#1149) / fused (#1050) rejections; route-tree's gate catches it
 * first with a route-contextual error.
 */
function throwUnconstrainedOptionalSplat(paramName: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Optional param ":${paramName}?" before a splat ` +
      `must be constrained: an unconstrained optional before a splat is ambiguous ` +
      `(every multi-segment value has two readings). Add a constraint, e.g. ` +
      `":${paramName}<[a-z]+>?", or model it as two routes.`,
  );
}

/**
 * An unbalanced `<`/`>` desyncs match vs build: the name is truncated at the
 * stray `<`, the unclosed constraint survives as a literal in the trie path, and
 * `buildPath` emits a URL its own `match` rejects (#804 — the residual gap #749
 * only closed on the plugin path; this is the bare-core backstop). Sibling of
 * {@link throwEmptyParamName} (#858) / {@link throwFusedMarker} (#1050).
 */
function throwUnbalancedConstraint(path: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Unbalanced constraint delimiter ('<' or '>') ` +
      `in path "${path}": every '<' must be closed by a '>'. A stray delimiter ` +
      `desyncs match vs build (buildPath would emit a URL match rejects).`,
  );
}

/**
 * An empty constraint `<>` compiles to `^()$`, which matches only the empty
 * string — a never-matching required param. Rejected loudly instead of silently
 * producing a dead route (#804 §3.3). Sibling of the name-less rejection (#858).
 */
function throwEmptyConstraint(path: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Empty constraint '<>' in path "${path}": ` +
      `a constraint body must be non-empty (e.g. '<[0-9]+>'). An empty '<>' ` +
      `compiles to a never-matching pattern.`,
  );
}

function throwFusedConstraintSuffix(path: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Text fused to a constraint '>' in path "${path}": ` +
      `a '<...>' constraint must end its segment or be followed by '/' or an ` +
      `optional '?' — use "/:id<...>/rest", not "/:id<...>rest".`,
  );
}

function throwConstraintInStaticSegment(path: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Constraint '<...>' in a static segment in path "${path}": ` +
      `a '<...>' constraint must follow a parameter marker (':' or '*') — a static ` +
      `segment carrying '<...>' is silently stripped. Attach it to a param ` +
      `(e.g. "/:id<...>") or drop it.`,
  );
}

function throwDuplicateParamName(
  routeName: string,
  names: readonly string[],
): never {
  const seen = new Set<string>();
  let duplicate = "";

  for (const name of names) {
    if (seen.has(name)) {
      duplicate = name;

      break;
    }

    seen.add(name);
  }

  throw new Error(
    `[SegmentMatcher.registerTree] Duplicate parameter name ':${duplicate}' in ` +
      `route "${routeName}": a param name must be unique within a route — two ` +
      `positions cannot both bind ':${duplicate}' (the second silently overwrites ` +
      `the first). Rename one.`,
  );
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

function throwInvalidQueryParamName(routeName: string, name: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Invalid query-param declaration "${name}" in ` +
      `route "${routeName}": a query-param name cannot contain '<' or '>'. This is a ` +
      `reverse-order modifier typo that leaked a constraint into the query — put the ` +
      `optional '?' AFTER the constraint (':id<...>?', not ':id?<...>'). It would ` +
      `never round-trip.`,
  );
}

function throwPathQueryNameCollision(routeName: string, name: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Name collision in route "${routeName}": "${name}" ` +
      `is declared as BOTH a path param (':${name}') and a query param ('?${name}'). ` +
      `buildPath would emit its value twice (once in the path, once in the query). ` +
      `Rename one.`,
  );
}

/**
 * #1153: writes a STRONG (full-insertion) terminal route, rejecting a second strong
 * write by a DIFFERENT route — two routes compiling to the same effective path
 * (flat vs nested `/a/b`, or `/x` vs `/x/`), where the later would silently shadow
 * the earlier (its deep link would resolve to the other route). A revisit by the
 * SAME route (the optional-omit fan-out) is idempotent, and a WEAK (omit `??=`)
 * owner is legitimately displaced by a strong write — neither throws.
 */
function writeStrongRoute(node: SegmentNode, compiled: CompiledRoute): void {
  if (
    node.route !== undefined &&
    node.route !== compiled &&
    node.routeIsStrong === true
  ) {
    throwDuplicateRoutePath(node.route.name, compiled.name);
  }

  node.route = compiled;
  node.routeIsStrong = true;
}

function throwDuplicateRoutePath(existingName: string, newName: string): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Duplicate route path: routes "${existingName}" ` +
      `and "${newName}" resolve to the same URL. The later registration would ` +
      `silently shadow the earlier (its deep link would resolve to the other ` +
      `route). Give them distinct paths.`,
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
    throwEmptyParamName();
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
    // `fork` initialized here (not added conditionally by the optional-fork
    // marker below) so every paramChild shares one hidden class — the fork check
    // in `#traverseFrom` stays monomorphic (~0 hot-path tax, spike Stage 1).
    node.paramChild = {
      node: createSegmentNode(),
      name: paramName,
      fork: undefined,
    };
    ownNodes.add(node);
  } else if (node.paramChild.name !== paramName && !ownNodes.has(node)) {
    throwParamNameConflict(node.paramChild.name, paramName, ":");
  }

  return node.paramChild.node;
}

/**
 * #1263/#1264: marks a `paramChild` created by the optional fork so `match` can
 * disambiguate the omit form. Called ONLY from the optional fork, so a
 * non-optional param+splat sibling (#1266) is untouched.
 *
 * - **A1 opt→splat** (`/:v<c>?/*rest`): a constraint + a splat sibling → mark the
 *   constraint (try-take-if-valid). An unconstrained optional→splat is rejected
 *   at registration (reject-with-hint), so a splat fork always carries one.
 * - **A2 opt→required-param** (`/:a?/:b`): the successor is a required param →
 *   mark its name (`skipName`), bound on the omit form. Constraints are stripped
 *   from `path` before trie insertion, so the successor segment is `:b` and its
 *   own constraint (if any) is validated post-traverse via `constraintPatterns`.
 */
function markOptionalFork(
  node: SegmentNode,
  compiled: CompiledRoute,
  paramName: string,
  path: string,
  segmentEnd: number,
  length: number,
): void {
  const constraintPattern = compiled.constraintPatterns.get(paramName)?.pattern;

  if (node.paramChild && node.splatChild) {
    // opt→splat. Reject-with-hint if UNCONSTRAINED (#1264, product decision): an
    // unconstrained optional before a splat has no validity signal — every
    // multi-segment value has two readings, so `match` would silently reshape
    // half the input space (wrong-name in new clothing). A constraint gives the
    // signal `try-take-if-valid` needs (A1).
    if (constraintPattern === undefined) {
      throwUnconstrainedOptionalSplat(paramName);
    }

    node.paramChild.fork = { constraint: constraintPattern };

    return;
  }

  const nextStart = segmentEnd + 1;

  if (nextStart <= length) {
    const nextEnd = path.indexOf("/", nextStart);
    const nextSegment = path.slice(
      nextStart,
      nextEnd === -1 ? length : nextEnd,
    );

    // A required param (`:b`, not `:b?` — an optional successor is the opt+opt
    // case, present-first, out of this fix's scope).
    if (
      node.paramChild &&
      nextSegment.startsWith(":") &&
      !nextSegment.endsWith("?")
    ) {
      node.paramChild.fork = { skipName: extractParamName(nextSegment) };
    }
  }
}

/**
 * #1266: mark a CONSTRAINED required param sharing its trie level with a splat sibling
 * (cross-route: `/*rest` + `/:v<c>/*rest`) as a try-take-if-valid fork — the same
 * mechanism `markOptionalFork`'s A1 gives the constrained-optional→splat case, but for
 * a REQUIRED param (no `optional` anywhere). Without it the param greedily commits
 * (INVARIANTS #8), its constraint is validated only after the full traverse (#857, no
 * backtrack), and the match returns `undefined` instead of falling to the splat
 * sibling — leaving the catch-all unreachable and its `buildPath` a dead deep-link.
 *
 * Marked UNCONDITIONALLY for every constrained required param — `match` acts on the
 * fork only when a splat sibling is ALSO present at the node (`node.splatChild`), so a
 * constrained param without a splat sibling is unaffected. Unconditional marking is
 * what makes it registration-order independent: the splat sibling may be registered by
 * another route before or after this param, and need not exist at the node yet here.
 * `??=` preserves an optional fork already marked at this position (#1264 wins).
 */
function markConstrainedParamFork(
  node: SegmentNode,
  compiled: CompiledRoute,
  segment: string,
): void {
  // #1285: short-circuit the whole helper for the common UNCONSTRAINED route (first,
  // cheapest check) before the `extractParamName` regex — the constraint lookup would
  // always miss anyway, and registerTree is ~58% of the SSR clone tax.
  if (
    !compiled.hasConstraints ||
    !segment.startsWith(":") ||
    node.paramChild === undefined
  ) {
    return;
  }

  const constraintPattern = compiled.constraintPatterns.get(
    extractParamName(segment),
  )?.pattern;

  if (constraintPattern === undefined) {
    return;
  }

  const pc = node.paramChild;

  // #1284: one trie slot legally serves several routes with DIFFERENT constraints
  // under the same param name. The fork's validity signal must be the DISJUNCTION —
  // `match` skips to the splat sibling only when EVERY route's constraint fails, else
  // a value matching a LATER route wrongly falls to the splat (killing that route,
  // order-dependent). Composite of the anchored sources → one `.test` at match;
  // post-traverse per-route validation still filters the correct winner. `fork` is
  // re-created (not mutated) since `ForkMeta.constraint` is readonly.
  if (pc.fork?.constraint === undefined) {
    pc.fork = { ...pc.fork, constraint: constraintPattern };
  } else if (pc.fork.constraint.source !== constraintPattern.source) {
    pc.fork = {
      ...pc.fork,
      constraint: new RegExp(
        `(?:${pc.fork.constraint.source})|(?:${constraintPattern.source})`,
        pc.fork.constraint.flags,
      ),
    };
  }
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
    writeStrongRoute(state.root, compiled);

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
      if (segment.startsWith("*")) {
        // Optional splat `*name?`: build uses the splat encoder (multi-segment)
        // but this fork would compile a plain single-segment param — a
        // match/build desync. Rejected (product decision, #1149).
        throwOptionalSplat(segment);
      }

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

      // #1263/#1264: mark this optional's paramChild as a fork so `match` can
      // disambiguate the omit form (opt→splat via constraint, opt→param via the
      // successor's name).
      markOptionalFork(node, compiled, paramName, path, segmentEnd, length);

      return;
    }

    const parent = node;

    node = processSegment(state, node, segment, ownNodes);
    // #1266: mark a CONSTRAINED required param as a try-take-if-valid fork so `match`
    // can fall to a splat sibling when the constraint fails, instead of greedily
    // committing and dying post-traverse.
    markConstrainedParamFork(parent, compiled, segment);
    start = segmentEnd + 1;
  }

  writeStrongRoute(node, compiled);
}

function insertSlashChildIntoTrie(
  state: RegistrationState,
  compiled: CompiledRoute,
  parentPath: string,
): void {
  // #1242 §5.4 + #1294: an index route (path "/") under a parent whose path carries an
  // OPTIONAL param in ANY position, or ends in a SPLAT, is unreachable/inconsistent.
  // Under an optional the index binds only the take form (`/a/:b?/c` + idx: `/a/x/c/` →
  // index, `/a/c/` → parent) — `walkTrie` lands `slashChildRoute` on the full-take
  // terminal only and does not fan out omit forms; under a splat `slashChildRoute` sits
  // on the splat node, which `#matchSplat`'s fast path never reads, so the index is
  // unreachable entirely. #1242 checked only the LAST segment, missing mid-path
  // optionals (#1294). A REQUIRED-param parent (`/users/:id`, `/a/:b/c`) has a single
  // form and its slash-child is coherent (existing behaviour) — allowed. parentPath is
  // constraint-stripped (walkTrie requires it), so "/" is a clean segment separator.
  const lastSegment = parentPath.slice(parentPath.lastIndexOf("/") + 1);
  const optionalParamParent = parentPath
    .split("/")
    .some((segment) => segment.startsWith(":") && segment.endsWith("?"));
  const splatParent = lastSegment.startsWith("*");

  if (optionalParamParent || splatParent) {
    throwSlashChildUnderDynamicParent(compiled.name, parentPath);
  }

  const node = walkTrie(state, parentPath);

  node.slashChildRoute = compiled;
}

function throwSlashChildUnderDynamicParent(
  routeName: string,
  parentPath: string,
): never {
  throw new Error(
    `[SegmentMatcher.registerTree] Index route "${routeName}" (path "/") under the ` +
      `dynamic parent "${parentPath}" is not supported: the index cannot reliably ` +
      `replace the parent on every form of its path — under an optional param it ` +
      `binds only the present form, under a splat it is unreachable. Give the index ` +
      `a distinct path, or make the parent static.`,
  );
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
      throwEmptyParamName();
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

  // #1154: a raw non-ASCII code point in a STATIC segment (`/café`, `/меню`).
  // match rejects any input byte ≥ 0x80 (`#scanPath`) AND compares static trie
  // keys raw (never percent-decoded), so such a route registers but is
  // unmatchable — `buildPath` emits `/café`, which its own `match` rejects (a dead
  // route). Reject at registration with the percent-encode workaround. A non-ASCII
  // PARAM name or constraint is unaffected (only static text is compared raw).
  if (hasNonAsciiSegment(segment)) {
    throwNonAsciiStatic(segment);
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
    return {
      buildStaticParts: [normalizedPath],
      buildParamSlots: EMPTY_PARAM_SLOTS,
    };
  }

  const parts: string[] = [];
  const slots: BuildParamSlot[] = [];

  // Name class derives from the single source of truth in buildParamMeta so the
  // build-path grammar matches the match-path grammar exactly (#738) — e.g.
  // `:my-param` builds under the same name it matched under.
  const paramRgx = new RegExp(
    String.raw`[:*](${PARAM_NAME_PATTERN})(?:<${CONSTRAINT_BODY_PATTERN}>)?(\?)?`,
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
