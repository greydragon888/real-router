import { ENCODING_METHODS } from "./encoding";

import type {
  BuildParamSlot,
  CompiledRoute,
  ConstraintPattern,
  MatcherInputNode,
  MatchResult,
  ResolvedMatcherOptions,
  SegmentMatcherOptions,
  SegmentNode,
} from "./types";

// =============================================================================
// Default DI Functions
// =============================================================================

export function defaultParseQueryString(
  queryString: string,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  if (queryString.length === 0) {
    return params;
  }

  const pairs = queryString.split("&");

  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");

    if (eqIdx === -1) {
      params[pair] = "";
    } else {
      params[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
    }
  }

  return params;
}

export function defaultBuildQueryString(
  params: Record<string, unknown>,
): string {
  const parts: string[] = [];

  for (const key of Object.keys(params)) {
    const value = params[key];

    parts.push(value === "" ? key : `${key}=${String(value)}`);
  }

  return parts.join("&");
}

// =============================================================================
// Constants
// =============================================================================

const RAW_UNICODE_PATTERN = /[\u0080-\uFFFF]/;

// =============================================================================
// SegmentNode Factory
// =============================================================================

export function createSegmentNode(): SegmentNode {
  return {
    staticChildren: Object.create(null) as Record<string, SegmentNode>,
    paramChild: undefined,
    paramName: undefined,
    splatChild: undefined,
    splatName: undefined,
    route: undefined,
    slashChildRoute: undefined,
  };
}

// =============================================================================
// SegmentMatcher Class
// =============================================================================

export class SegmentMatcher {
  get options(): ResolvedMatcherOptions {
    return this.#options;
  }

  readonly #options: ResolvedMatcherOptions;

  readonly #root: SegmentNode = createSegmentNode();
  readonly #routesByName = new Map<string, CompiledRoute>();
  readonly #segmentsByName = new Map<string, readonly MatcherInputNode[]>();
  readonly #metaByName = new Map<
    string,
    Readonly<Record<string, Record<string, "url" | "query">>>
  >();
  readonly #staticCache = new Map<string, CompiledRoute>();

  #rootPath = "";

  constructor(options?: SegmentMatcherOptions) {
    this.#options = {
      caseSensitive: options?.caseSensitive ?? true,
      strictTrailingSlash: options?.strictTrailingSlash ?? false,
      strictQueryParams: options?.strictQueryParams ?? false,
      urlParamsEncoding: options?.urlParamsEncoding ?? "default",
      parseQueryString: options?.parseQueryString ?? defaultParseQueryString,
      buildQueryString: options?.buildQueryString ?? defaultBuildQueryString,
    };
  }

  registerTree(node: MatcherInputNode): void {
    this.#registerNode(node, "", [], null);
  }

  match(path: string): MatchResult | undefined {
    if (path === "") {
      path = "/";
    }
    if (!path.startsWith("/")) {
      return undefined;
    }

    const hashIdx = path.indexOf("#");

    if (hashIdx !== -1) {
      path = path.slice(0, hashIdx);
    }

    if (RAW_UNICODE_PATTERN.test(path)) {
      return undefined;
    }

    const qIdx = path.indexOf("?");
    const pathPart = qIdx === -1 ? path : path.slice(0, qIdx);

    const cleanPath = pathPart.includes("//")
      ? pathPart.replaceAll(/\/{2,}/g, "/")
      : pathPart;

    const normalized =
      !this.#options.strictTrailingSlash &&
      cleanPath.length > 1 &&
      cleanPath.endsWith("/")
        ? cleanPath.slice(0, -1)
        : cleanPath;

    const cacheKey = this.#options.caseSensitive
      ? normalized
      : normalized.toLowerCase();
    const cached = this.#staticCache.get(cacheKey);

    if (cached) {
      return {
        segments: cached.matchSegments,
        buildSegments: cached.buildSegments,
        params: {},
        meta: cached.meta,
      };
    }

    const params: Record<string, string> = {};
    const route = this.#traverse(normalized, params);

    if (!route) {
      return undefined;
    }

    if (!this.#decodeParams(params)) {
      return undefined;
    }

    return {
      segments: route.matchSegments,
      buildSegments: route.buildSegments,
      params,
      meta: route.meta,
    };
  }

  buildPath(name: string, params?: Record<string, unknown>): string {
    const route = this.#routesByName.get(name);

    if (!route) {
      throw new Error(`Route not found: ${name}`);
    }

    const parts = route.buildStaticParts;
    const slots = route.buildParamSlots;

    if (slots.length === 0) {
      return this.#rootPath + parts[0];
    }

    let result = this.#rootPath + parts[0];

    for (const [i, slot] of slots.entries()) {
      const value = params?.[slot.paramName];

      if (value === undefined || value === null) {
        if (!slot.isOptional) {
          throw new Error(`Missing required param: ${slot.paramName}`);
        }

        // Strip trailing separator before appending next static part
        if (result.length > 1 && result.endsWith("/")) {
          result = result.slice(0, -1);
        }

        result += parts[i + 1];

        continue;
      }

      const stringValue = String(value as string | number | boolean);
      const encoded = slot.encoder
        ? slot.encoder(stringValue)
        : /* v8 ignore next */ encodeURIComponent(stringValue);

      result += encoded + parts[i + 1];
    }

    return result;
  }

  getSegmentsByName(name: string): readonly MatcherInputNode[] | undefined {
    return this.#segmentsByName.get(name);
  }

  getMetaByName(
    name: string,
  ): Readonly<Record<string, Record<string, "url" | "query">>> | undefined {
    return this.#metaByName.get(name);
  }

  hasRoute(name: string): boolean {
    return this.#routesByName.has(name);
  }

  setRootPath(rootPath: string): void {
    this.#rootPath = rootPath;
  }

  #registerNode(
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
    const nodePath = isAbsolute
      ? node.paramMeta.pathPattern.slice(1)
      : node.paramMeta.pathPattern;

    const matchPath = isAbsolute
      ? nodePath
      : this.#buildFullPath(parentPath, nodePath);

    let currentRoute: CompiledRoute | null = parentRoute;

    if (!isRoot) {
      currentRoute = this.#compileAndRegisterRoute(
        node,
        matchPath,
        isAbsolute ? "" : parentPath,
        segments,
        parentRoute,
      );
    }

    for (const child of node.children.values()) {
      this.#registerNode(child, matchPath, segments, currentRoute);
    }

    if (!isRoot) {
      segments.pop();
    }
  }

  #compileAndRegisterRoute(
    node: MatcherInputNode,
    matchPath: string,
    parentPath: string,
    segments: MatcherInputNode[],
    parentRoute: CompiledRoute | null,
  ): CompiledRoute {
    const isSlashChild = this.#isSlashChild(matchPath, parentPath);

    const frozenSegments = Object.freeze([...segments]);

    // Slash-child: buildSegments excludes the slash-child node itself
    const buildSegments = isSlashChild
      ? Object.freeze(segments.slice(0, -1))
      : frozenSegments;

    const frozenMeta = this.#buildMeta(frozenSegments);

    const normalizedPath = this.#normalizeTrailingSlash(matchPath);

    const declaredQueryParams = this.#collectDeclaredQueryParams(segments);
    const constraintPatterns = this.#collectConstraintPatterns(segments);

    // Slash-child: use parent path for buildParts (not slash-child's path)
    const buildPath = isSlashChild
      ? this.#normalizeTrailingSlash(parentPath)
      : normalizedPath;

    const { buildStaticParts, buildParamSlots } = this.#compileBuildParts(
      buildPath,
      isSlashChild ? segments.slice(0, -1) : segments,
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

    this.#routesByName.set(node.fullName, compiled);
    this.#segmentsByName.set(node.fullName, frozenSegments);
    this.#metaByName.set(node.fullName, frozenMeta);

    if (isSlashChild) {
      this.#registerSlashChild(compiled, parentPath);
    } else {
      this.#registerStandardRoute(compiled, matchPath, normalizedPath, node);
    }

    return compiled;
  }

  #buildMeta(
    segments: readonly MatcherInputNode[],
  ): Readonly<Record<string, Record<string, "url" | "query">>> {
    const meta: Record<string, Record<string, "url" | "query">> = {};

    for (const segment of segments) {
      meta[segment.fullName] = segment.paramTypeMap;
    }

    return Object.freeze(meta);
  }

  #registerSlashChild(compiled: CompiledRoute, parentPath: string): void {
    this.#insertSlashChildIntoTrie(compiled, parentPath);

    const parentNormalized = this.#normalizeTrailingSlash(parentPath);
    const cacheKey = this.#options.caseSensitive
      ? parentNormalized
      : parentNormalized.toLowerCase();

    if (this.#staticCache.has(cacheKey)) {
      this.#staticCache.set(cacheKey, compiled);
    }
  }

  #registerStandardRoute(
    compiled: CompiledRoute,
    matchPath: string,
    normalizedPath: string,
    node: MatcherInputNode,
  ): void {
    this.#insertIntoTrie(compiled, matchPath);

    if (node.paramMeta.urlParams.length === 0) {
      const cacheKey = this.#options.caseSensitive
        ? normalizedPath
        : normalizedPath.toLowerCase();

      this.#staticCache.set(cacheKey, compiled);
    }
  }

  #isSlashChild(matchPath: string, parentPath: string): boolean {
    const normalizedMatch = this.#normalizeTrailingSlash(matchPath);
    const normalizedParent = this.#normalizeTrailingSlash(parentPath);

    return normalizedMatch === normalizedParent;
  }

  #insertIntoTrie(compiled: CompiledRoute, fullPath: string): void {
    const normalized = this.#normalizeTrailingSlash(fullPath);

    if (normalized === "/") {
      this.#root.route = compiled;

      return;
    }

    this.#insertIntoTrieFrom(this.#root, normalized, 1, compiled);
  }

  #insertIntoTrieFrom(
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
          // eslint-disable-next-line sonarjs/slow-regex -- Constraint pattern regex - bounded input from route definitions, not user input
          .replaceAll(/<[^>]*>/g, "")
          .replace(/\?$/, "");

        if (!node.paramChild) {
          node.paramChild = createSegmentNode();
          node.paramChild.paramName = paramName;
        }

        // Path with param: continue recursively from paramChild
        this.#insertIntoTrieFrom(
          node.paramChild,
          path,
          segmentEnd + 1,
          compiled,
        );

        // Path without param: skip this segment and continue from node
        if (segmentEnd >= len) {
          node.route ??= compiled;
        } else {
          this.#insertIntoTrieFrom(node, path, segmentEnd + 1, compiled);
        }

        return;
      }

      node = this.#processSegment(node, segment);
      start = segmentEnd + 1;
    }

    node.route = compiled;
  }

  #insertSlashChildIntoTrie(compiled: CompiledRoute, parentPath: string): void {
    const node = this.#walkTrie(parentPath);

    node.slashChildRoute = compiled;
  }

  #walkTrie(fullPath: string): SegmentNode {
    return this.#walkTrieFrom(this.#root, fullPath);
  }

  #walkTrieFrom(startNode: SegmentNode, path: string): SegmentNode {
    const normalized = this.#normalizeTrailingSlash(path);

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

      node = this.#processSegment(node, segment);
      start = segmentEnd + 1;
    }

    return node;
  }

  #processSegment(node: SegmentNode, segment: string): SegmentNode {
    if (segment.startsWith("*")) {
      const splatName = segment.slice(1);

      if (!node.splatChild) {
        node.splatChild = createSegmentNode();
        node.splatName = splatName;
      }

      return node.splatChild;
    }

    if (segment.startsWith(":")) {
      const paramName = segment
        .slice(1)
        // eslint-disable-next-line sonarjs/slow-regex -- constraint pattern is user-controlled and bounded by segment length
        .replaceAll(/<[^>]*>/g, "")
        .replace(/\?$/, "");

      if (!node.paramChild) {
        node.paramChild = createSegmentNode();
        node.paramChild.paramName = paramName;
      }

      return node.paramChild;
    }

    const key = this.#options.caseSensitive ? segment : segment.toLowerCase();

    if (!(key in node.staticChildren)) {
      node.staticChildren[key] = createSegmentNode();
    }

    return node.staticChildren[key];
  }

  #buildFullPath(parentPath: string, nodePath: string): string {
    if (parentPath === "") {
      return nodePath;
    }

    if (nodePath === "") {
      return parentPath;
    }

    return parentPath + nodePath;
  }

  #normalizeTrailingSlash(path: string): string {
    if (path.length > 1 && path.endsWith("/")) {
      return path.slice(0, -1);
    }

    return path;
  }

  #compileBuildParts(
    normalizedPath: string,
    segments: readonly MatcherInputNode[],
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
      const encoding = this.#options.urlParamsEncoding;
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

  #traverse(
    path: string,
    params: Record<string, string>,
  ): CompiledRoute | undefined {
    /* v8 ignore start -- root "/" is always in #staticCache */
    if (path.length === 1) {
      return this.#root.slashChildRoute ?? this.#root.route;
    }
    /* v8 ignore stop */

    return this.#traverseFrom(this.#root, path, 1, params);
  }

  #traverseFrom(
    startNode: SegmentNode,
    path: string,
    start: number,
    params: Record<string, string>,
  ): CompiledRoute | undefined {
    let node = startNode;
    const len = path.length;

    while (start <= len) {
      const end = path.indexOf("/", start);
      const segmentEnd = end === -1 ? len : end;
      const segment = path.slice(start, segmentEnd);

      const lookupKey = this.#options.caseSensitive
        ? segment
        : segment.toLowerCase();
      const staticChild = node.staticChildren[lookupKey];
      let next: SegmentNode;

      if (lookupKey in node.staticChildren) {
        next = staticChild;
      } else if (node.paramChild) {
        next = node.paramChild;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- paramName is always set when paramChild is created
        params[next.paramName!] = segment;
      } else if (node.splatChild) {
        // Try specific child routes of splatChild before wildcard capture (static > param > splat)
        const childParams: Record<string, string> = {};
        const specific = this.#traverseFrom(
          node.splatChild,
          path,
          start,
          childParams,
        );

        if (specific) {
          Object.assign(params, childParams);

          return specific;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- splatName is always set when splatChild is created
        params[node.splatName!] = path.slice(start);

        return node.splatChild.route;
      } else {
        return undefined;
      }

      node = next;
      start = segmentEnd + 1;
    }

    return node.slashChildRoute ?? node.route;
  }

  #decodeParams(params: Record<string, string>): boolean {
    if (this.#options.urlParamsEncoding === "none") {
      return true;
    }

    for (const key in params) {
      const v = params[key];

      if (!v.includes("%")) {
        continue;
      }

      if (!this.#validatePercentEncoding(v)) {
        return false;
      }

      params[key] = decodeURIComponent(v);
    }

    return true;
  }

  #validatePercentEncoding(value: string): boolean {
    let i = 0;

    while (i < value.length) {
      if (value[i] === "%") {
        if (i + 2 >= value.length) {
          return false;
        }

        /* v8 ignore start -- codePointAt cannot return undefined due to bounds check above */
        const hex1 = value.codePointAt(i + 1) ?? 0;
        const hex2 = value.codePointAt(i + 2) ?? 0;
        /* v8 ignore stop */

        if (!this.#isHexChar(hex1) || !this.#isHexChar(hex2)) {
          return false;
        }

        i += 3;
      } else {
        i++;
      }
    }

    return true;
  }

  #isHexChar(code: number): boolean {
    return (
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 70) ||
      (code >= 97 && code <= 102)
    );
  }

  #collectDeclaredQueryParams(
    segments: readonly MatcherInputNode[],
  ): readonly string[] {
    const queryParams: string[] = [];

    for (const segment of segments) {
      if (segment.paramMeta.queryParams.length > 0) {
        queryParams.push(...segment.paramMeta.queryParams);
      }
    }

    return queryParams;
  }

  #collectConstraintPatterns(
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
}
