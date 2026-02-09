import { ENCODING_METHODS } from "./encoding";
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

// eslint-disable-next-line sonarjs/slow-regex -- Constraint pattern regex - bounded input from route definitions, not user input
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

  let currentRoute: CompiledRoute | null = parentRoute;

  if (!isRoot) {
    currentRoute = compileAndRegisterRoute(
      state,
      node,
      matchPath,
      isAbsolute ? "" : parentPath,
      segments,
      parentRoute,
    );
  }

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

  // Slash-child: buildSegments excludes the slash-child node itself
  const buildSegments = slashChild
    ? Object.freeze(segments.slice(0, -1))
    : frozenSegments;

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
    slashChild ? segments.slice(0, -1) : segments,
    state.options.urlParamsEncoding,
  );

  const compiled: CompiledRoute = {
    name: node.fullName,
    parent: parentRoute,
    depth: segments.length - 1,
    matchSegments: frozenSegments,
    buildSegments,
    meta: frozenMeta,
    declaredQueryParams,
    declaredQueryParamsSet: new Set(declaredQueryParams),
    hasTrailingSlash: matchPath.length > 1 && matchPath.endsWith("/"),
    constraintPatterns,
    hasConstraints: constraintPatterns.size > 0,
    buildStaticParts,
    buildParamSlots,
  };

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

  if (node.paramMeta.urlParams.length === 0) {
    const cacheKey = state.options.caseSensitive
      ? normalizedPath
      : normalizedPath.toLowerCase();

    state.staticCache.set(cacheKey, compiled);
  }
}

function isSlashChild(matchPath: string, parentPath: string): boolean {
  const normalizedMatch = normalizeTrailingSlash(matchPath);
  const normalizedParent = normalizeTrailingSlash(parentPath);

  return normalizedMatch === normalizedParent;
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

  insertIntoTrieFrom(state, state.root, normalized, 1, compiled);
}

function insertIntoTrieFrom(
  state: RegistrationState,
  node: SegmentNode,
  path: string,
  start: number,
  compiled: CompiledRoute,
): void {
  const len = path.length;

  while (start <= len) {
    const end = path.indexOf("/", start);
    const segmentEnd = end === -1 ? len : end;
    const segment = path.slice(start, segmentEnd);

    if (segment.endsWith("?")) {
      const paramName = segment
        .slice(1)
        .replaceAll(CONSTRAINT_PATTERN_RGX, "")
        .replace(/\?$/, "");

      node.paramChild ??= { node: createSegmentNode(), name: paramName };

      // Path with param: continue recursively from paramChild
      insertIntoTrieFrom(
        state,
        node.paramChild.node,
        path,
        segmentEnd + 1,
        compiled,
      );

      // Path without param: skip this segment and continue from node
      if (segmentEnd >= len) {
        node.route ??= compiled;
      } else {
        insertIntoTrieFrom(state, node, path, segmentEnd + 1, compiled);
      }

      return;
    }

    node = processSegment(state, node, segment);
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
  const len = normalized.length;

  while (start <= len) {
    const end = normalized.indexOf("/", start);
    const segmentEnd = end === -1 ? len : end;

    /* v8 ignore start -- defensive: indexOf always returns valid index for non-empty segments */
    if (segmentEnd <= start) {
      break;
    }
    /* v8 ignore stop */

    const segment = normalized.slice(start, segmentEnd);

    node = processSegment(state, node, segment);
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
): SegmentNode {
  if (segment.startsWith("*")) {
    const splatName = segment.slice(1);

    node.splatChild ??= { node: createSegmentNode(), name: splatName };

    return node.splatChild.node;
  }

  if (segment.startsWith(":")) {
    const paramName = segment
      .slice(1)
      .replaceAll(CONSTRAINT_PATTERN_RGX, "")
      .replace(/\?$/, "");

    node.paramChild ??= { node: createSegmentNode(), name: paramName };

    return node.paramChild.node;
  }

  const key = state.options.caseSensitive ? segment : segment.toLowerCase();

  if (!(key in node.staticChildren)) {
    node.staticChildren[key] = createSegmentNode();
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
    for (const p of segment.paramMeta.urlParams) {
      allUrlParams.add(p);
    }

    for (const p of segment.paramMeta.spatParams) {
      allSplatParams.add(p);
    }
  }

  if (allUrlParams.size === 0) {
    return { buildStaticParts: [normalizedPath], buildParamSlots: [] };
  }

  const parts: string[] = [];
  const slots: BuildParamSlot[] = [];

  // eslint-disable-next-line sonarjs/single-char-in-character-classes -- character class is more readable than alternation
  const paramRgx = /[:*]([\w]+)(?:<[^>]*>)?(\?)?/gu;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = paramRgx.exec(normalizedPath)) !== null) {
    const paramName = match[1];
    const isOptional = match[2] === "?";

    parts.push(normalizedPath.slice(lastIndex, match.index));

    const isSplat = allSplatParams.has(paramName);
    const encoder = isSplat
      ? (value: string): string => {
          const enc = ENCODING_METHODS[encoding];
          const segs = value.split("/");
          let result = enc(segs[0]);

          for (let i = 1; i < segs.length; i++) {
            result += `/${enc(segs[i])}`;
          }

          return result;
        }
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
  const queryParams: string[] = [];

  // Include query params declared on the root node (e.g., from setRootPath("?mode"))
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
