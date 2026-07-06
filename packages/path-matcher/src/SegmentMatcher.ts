import { DECODING_METHODS } from "./encoding";
import { createSegmentNode, normalizeTrailingSlash } from "./pathUtils";
import { validatePercentEncoding } from "./percentEncoding";
import { registerNode } from "./registration";

import type {
  BuildPathOptions,
  CompiledRoute,
  ForkMeta,
  MatcherInputNode,
  MatchResult,
  ResolvedMatcherOptions,
  SegmentMatcherOptions,
  SegmentNode,
} from "./types";

// =============================================================================
// Helpers
// =============================================================================

/** Coerces a route param value (typed `unknown`, contractually primitive) to
 *  the string the encoder receives. Objects are JSON-stringified. */
function stringifyParamValue(value: unknown): string {
  // Stryker disable next-line BlockStatement: equivalent — String(value) === value for a string, so removing the early return is identical
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- route params are typed `unknown` but contractually primitive
  return String(value);
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
  readonly #staticCache = new Map<string, CompiledRoute>();

  // H1: Reusable object eliminates tuple allocation per match() call
  readonly #prepared = {
    // Stryker disable next-line StringLiteral: equivalent — #prepared.cleanPath is overwritten by #preparePath before any read (dead initializer)
    cleanPath: "",
    // Stryker disable next-line StringLiteral: equivalent — #prepared.normalized is overwritten by #preparePath before any read (dead initializer)
    normalized: "",
    queryString: undefined as string | undefined,
  };

  // Stryker disable next-line ArrayDeclaration: equivalent — #rootQueryParams is overwritten by registerTree before any read (dead initializer)
  #rootQueryParams: readonly string[] = [];
  // Stryker disable next-line StringLiteral: equivalent — #scanTruncated is set by #scanPath before it is read (dead initializer)
  #scanTruncated = "";

  readonly #caseSensitive: boolean;
  readonly #decode: ((param: string) => string) | null;

  constructor(options: SegmentMatcherOptions) {
    this.#options = {
      caseSensitive: options.caseSensitive ?? true,
      strictTrailingSlash: options.strictTrailingSlash ?? false,
      strictQueryParams: options.strictQueryParams ?? false,
      urlParamsEncoding: options.urlParamsEncoding ?? "default",
      parseQueryString: options.parseQueryString,
      buildQueryString: options.buildQueryString,
    };

    this.#caseSensitive = this.#options.caseSensitive;
    this.#decode =
      this.#options.urlParamsEncoding === "none"
        ? null
        : DECODING_METHODS[this.#options.urlParamsEncoding];
  }

  registerTree(node: MatcherInputNode): void {
    this.#rootQueryParams = node.paramMeta.queryParams;
    registerNode(
      {
        root: this.#root,
        options: this.#options,
        routesByName: this.#routesByName,
        staticCache: this.#staticCache,
        rootQueryParams: this.#rootQueryParams,
      },
      node,
      "",
      [],
      null,
    );
  }

  match(path: string): MatchResult | undefined {
    if (!this.#preparePath(path)) {
      return undefined;
    }

    const { cleanPath, normalized, queryString } = this.#prepared;

    const cacheKey = this.#caseSensitive
      ? normalized
      : // Stryker disable next-line MethodExpression: equivalent — the case-insensitive cache key only governs a hit; a miss falls through to #traverse (also case-insensitive), same result (proven by injection)
        normalized.toLowerCase();
    const cached = this.#staticCache.get(cacheKey);

    // Stryker disable next-line BlockStatement: equivalent — emptying the cache-hit block routes through #traverse, which resolves the same route (cache is a pure optimization)
    if (cached) {
      if (
        this.#options.strictTrailingSlash &&
        !this.#checkTrailingSlash(cleanPath, cached)
      ) {
        return undefined;
      }

      // Stryker disable next-line BlockStatement: equivalent — #buildResult recomputes cached.cachedResult identically (cache short-circuit)
      if (queryString === undefined && cached.cachedResult) {
        return cached.cachedResult;
      }

      return this.#buildResult(cached, {}, queryString);
    }

    const params: Record<string, string> = {};
    const route = this.#traverse(normalized, params);

    if (!route) {
      return undefined;
    }

    if (
      this.#options.strictTrailingSlash &&
      !this.#checkTrailingSlash(cleanPath, route)
    ) {
      return undefined;
    }

    // Decode BEFORE validating constraints: a constraint describes the logical
    // (decoded) value, not the raw URL segment. Validating the raw segment let an
    // over-encoded valid value be rejected (`/%35` vs `<\d+>`) and a raw form that
    // satisfied the constraint but decoded to a value that did not slip through
    // (`/%41` vs `<.{3}>` → returned "A", violating Matching #9, and crashing
    // start() via rewritePathOnMatch → buildPath). (#857)
    if (!this.#decodeParams(params)) {
      return undefined;
    }

    if (route.hasConstraints && !this.#validateConstraints(params, route)) {
      return undefined;
    }

    return this.#buildResult(route, params, queryString);
  }

  buildPath(
    name: string,
    params?: Record<string, unknown>,
    options?: BuildPathOptions,
  ): string {
    const route = this.#routesByName.get(name);

    if (!route) {
      throw new Error(`[SegmentMatcher.buildPath] '${name}' is not defined`);
    }

    if (route.hasConstraints && params) {
      this.#validateBuildConstraints(route, name, params);
    }

    const path = this.#buildUrlPath(route, params);
    const finalPath = this.#applyTrailingSlash(path, options?.trailingSlash);
    const queryString = this.#buildQueryStringForBuild(
      route,
      params,
      options?.queryParamsMode,
    );

    return finalPath + (queryString ? `?${queryString}` : "");
  }

  getSegmentsByName(name: string): readonly MatcherInputNode[] | undefined {
    // Derived from #routesByName — `compiled.matchSegments` is the same frozen
    // array a dedicated #segmentsByName index would store, so the index was
    // pure duplication (#1010).
    return this.#routesByName.get(name)?.matchSegments;
  }

  getMetaByName(
    name: string,
  ): Readonly<Record<string, Record<string, "url" | "query">>> | undefined {
    return this.#routesByName.get(name)?.meta;
  }

  hasRoute(name: string): boolean {
    return this.#routesByName.has(name);
  }

  #validateBuildConstraints(
    route: CompiledRoute,
    name: string,
    params: Record<string, unknown>,
  ): void {
    for (const [paramName, constraint] of route.constraintPatterns) {
      const value = params[paramName];

      if (value !== undefined && value !== null) {
        const stringValue =
          // eslint-disable-next-line @typescript-eslint/no-base-to-string -- route params are typed `unknown` but contractually primitive
          typeof value === "object" ? JSON.stringify(value) : String(value);

        if (!constraint.pattern.test(stringValue)) {
          throw new Error(
            `[SegmentMatcher.buildPath] '${name}' — param '${paramName}' value '${stringValue}' does not match constraint '${constraint.constraint}'`,
          );
        }
      }
    }
  }

  #buildUrlPath(
    route: CompiledRoute,
    params: Record<string, unknown> | undefined,
  ): string {
    const parts = route.buildStaticParts;
    const slots = route.buildParamSlots;

    // Stryker disable next-line BlockStatement: equivalent — the general loop returns parts[0] when slots is empty, identical to this fast path
    if (slots.length === 0) {
      return parts[0];
    }

    let result = parts[0];

    for (const [i, slot] of slots.entries()) {
      const value = params?.[slot.paramName];

      if (value === undefined || value === null) {
        if (!slot.isOptional) {
          throw new Error(
            `[SegmentMatcher.buildPath] Missing required param '${slot.paramName}'`,
          );
        }

        // At an optional-omit point `result` always ends in "/" (the separator
        // before the omitted segment) — trim it so `parts[i + 1]` re-supplies
        // exactly one separator, not two.
        if (result.length > 1) {
          result = result.slice(0, -1);
        } else if (parts[i + 1].startsWith("/")) {
          // Leading optional omitted (`result === "/"`): a naive append yields
          // "//" — a URL the matcher itself rejects (double slash), which
          // `rewritePathOnMatch` then writes into `state.path`. Drop the lone
          // leading slash so `parts[i + 1]` re-supplies exactly one. (#1147)
          result = "";
        }

        result += parts[i + 1];

        continue;
      }

      // #740 item 3: an empty value for a REQUIRED param would collapse the
      // segment, silently producing a path that matches the parent route
      // (`buildPath("u.p", {id:""})` → `/users/` → matches `u`). Reject it like
      // a missing param. Optional params keep their existing behavior.
      if (value === "" && !slot.isOptional) {
        throw new Error(
          `[SegmentMatcher.buildPath] Missing required param '${slot.paramName}' (empty string)`,
        );
      }

      const encoded = slot.encoder(stringifyParamValue(value));

      result += encoded + parts[i + 1];
    }

    return result;
  }

  #applyTrailingSlash(
    path: string,
    mode: BuildPathOptions["trailingSlash"],
  ): string {
    if (mode === "always" && !path.endsWith("/")) {
      return `${path}/`;
    }

    /* v8 ignore next 3 -- @preserve: trailing slash may not appear in buildStaticParts; integration-tested via core */
    if (mode === "never" && path !== "/" && path.endsWith("/")) {
      return path.slice(0, -1);
    }

    return path;
  }

  #buildQueryStringForBuild(
    route: CompiledRoute,
    params: Record<string, unknown> | undefined,
    queryParamsMode: BuildPathOptions["queryParamsMode"],
  ): string {
    if (!params) {
      return "";
    }

    // Stryker disable next-line BlockStatement: equivalent — the downstream !hasKeys guard also returns '' for a route with no declared query params
    if (route.declaredQueryParams.length === 0 && queryParamsMode !== "loose") {
      return "";
    }

    const queryObj: Record<string, unknown> = {};
    // Stryker disable next-line BooleanLiteral: equivalent — buildQueryString({}) === '' so the hasKeys initial value is unobservable when no keys are added
    let hasKeys = false;

    for (const name of route.declaredQueryParams) {
      // Stryker disable next-line BlockStatement: equivalent — buildQueryString strips undefined, so adding absent declared keys instead of continue changes nothing
      if (!(name in params)) {
        continue;
      }

      queryObj[name] = params[name];
      hasKeys = true;
    }

    if (queryParamsMode === "loose") {
      for (const paramKey in params) {
        if (!(
          Object.hasOwn(params, paramKey) &&
          !route.declaredQueryParamsSet.has(paramKey) &&
          !route.buildParamNamesSet.has(paramKey)
        )) {
          continue;
        }

        queryObj[paramKey] = params[paramKey];
        hasKeys = true;
      }
    }

    // Stryker disable next-line BlockStatement: equivalent — buildQueryString({}) === '' so removing the !hasKeys early return yields the same ''
    if (!hasKeys) {
      return "";
    }

    return this.#options.buildQueryString(queryObj);
  }

  // H2: Single-pass scanner — replaces 4 separate scans (indexOf("#"), regex unicode, indexOf("?"), includes("//"))
  #preparePath(path: string): boolean {
    if (path === "") {
      path = "/";
    }

    if (path.codePointAt(0) !== 0x2f /* / */) {
      return false;
    }

    const qIdx = this.#scanPath(path);

    if (qIdx === -2) {
      return false;
    }

    if (qIdx === -3) {
      path = this.#scanTruncated;
    }

    const pathPart = qIdx >= 0 ? path.slice(0, qIdx) : path;
    let queryString = qIdx >= 0 ? path.slice(qIdx + 1) : undefined;

    // #842: a fragment (`#…`) AFTER the query separator is not seen by
    // #scanPath (it returns at the first `?`), so it would otherwise be folded
    // into the query string and parsed into a param value (e.g. `?a=1#frag` →
    // `a="1#frag"`). A fragment is everything after the first `#` in the whole
    // URL and must be stripped before query parsing — a native indexOf on the
    // (short) query substring, only when a query exists, is ~free (a `#` BEFORE
    // the `?` is already handled by #scanPath via the -3 truncation branch).
    if (queryString !== undefined) {
      const hashIdx = queryString.indexOf("#");

      if (hashIdx !== -1) {
        queryString = queryString.slice(0, hashIdx);
      }
    }

    const normalized = normalizeTrailingSlash(pathPart);

    this.#prepared.cleanPath = pathPart;
    this.#prepared.normalized = normalized;
    this.#prepared.queryString = queryString;

    return true;
  }

  // Returns: qIdx >= 0 (found ?), -1 (no ? or #), -2 (invalid), -3 (truncated at #, result in #scanTruncated)
  #scanPath(path: string): number {
    let prevSlash = false;

    for (let i = 0; i < path.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounds-checked by loop condition
      const ch = path.codePointAt(i)!;

      if (ch === 0x23 /* # */) {
        this.#scanTruncated = path.slice(0, i);

        return -3;
      }

      if (ch === 0x3f /* ? */) {
        return i;
      }

      if (ch >= 0x80) {
        return -2;
      }

      if (ch === 0x2f /* / */) {
        if (prevSlash) {
          return -2;
        }

        prevSlash = true;
      } else {
        prevSlash = false;
      }
    }

    return -1;
  }

  #buildResult(
    route: CompiledRoute,
    params: Record<string, unknown>,
    queryString: string | undefined,
  ): MatchResult | undefined {
    if (
      queryString !== undefined &&
      !this.#mergeQueryParams(route, params, queryString)
    ) {
      return undefined;
    }

    return {
      segments: route.matchSegments,
      params,
      meta: route.meta,
    };
  }

  // Parses the query string and folds it into `params`. Returns false (→ match
  // yields undefined) when the URL is unmatchable: the injected parser threw, or
  // strict mode saw an undeclared key.
  //
  // Precedence (#843, INVARIANTS Matching #25): query params are merged into the
  // SAME object that already holds the path params, so a query key equal to a
  // path-param name OVERWRITES the path value (`match("/u/5?id=9")` → `{id:"9"}`).
  // Intentional and documented: `buildPath` never emits a path param as a query
  // key, so the build→match roundtrip is unaffected; the collision only arises
  // for hand-crafted/adversarial URLs where a query shadows a path segment.
  #mergeQueryParams(
    route: CompiledRoute,
    params: Record<string, unknown>,
    queryString: string,
  ): boolean {
    let queryParams: Record<string, unknown>;

    try {
      queryParams = this.#options.parseQueryString(queryString);
    } catch {
      // The injected query parser decodes percent-encoding too, so the same
      // valid-hex/invalid-UTF-8 sequence that breaks path params (e.g.
      // `?x=%E0%41`) makes it throw a URIError. `match()` must never throw —
      // treat the whole URL as unmatched so the router resolves to
      // UNKNOWN_ROUTE instead of crashing on start() (#737).
      return false;
    }

    if (this.#options.strictQueryParams) {
      const declared = route.declaredQueryParamsSet;

      for (const key in queryParams) {
        if (!declared.has(key)) {
          return false;
        }

        params[key] = queryParams[key];
      }
    } else {
      for (const key in queryParams) {
        params[key] = queryParams[key];
      }
    }

    return true;
  }

  #checkTrailingSlash(cleanPath: string, route: CompiledRoute): boolean {
    const inputHasSlash = cleanPath.length > 1 && cleanPath.endsWith("/");

    return inputHasSlash === route.hasTrailingSlash;
  }

  #traverse(
    path: string,
    params: Record<string, string>,
  ): CompiledRoute | undefined {
    /* v8 ignore start -- @preserve: root "/" is always in #staticCache */
    if (path.length === 1) {
      return this.#root.slashChildRoute ?? this.#root.route;
    }
    /* v8 ignore stop */

    return this.#traverseFrom(this.#root, path, 1, params);
  }

  // The core match hot loop. The #1263/#1264 fork branches (A1 opt→splat, A2
  // opt→required-param) are inlined here rather than extracted into helpers,
  // because a per-param helper call regresses the common single-param path ~5%
  // (spike-measured); decode/constraint detail still lives in #tryTakeFork /
  // #forkTakesSplat.
  // eslint-disable-next-line sonarjs/cognitive-complexity -- inlined fork branches (see above)
  #traverseFrom(
    startNode: SegmentNode,
    path: string,
    start: number,
    params: Record<string, string>,
  ): CompiledRoute | undefined {
    let node = startNode;
    const length = path.length;
    const caseSensitive = this.#caseSensitive;

    while (start <= length) {
      const end = path.indexOf("/", start);
      const segmentEnd = end === -1 ? length : end;
      const segment = path.slice(start, segmentEnd);

      const lookupKey = caseSensitive ? segment : segment.toLowerCase();
      let next: SegmentNode;

      if (lookupKey in node.staticChildren) {
        next = node.staticChildren[lookupKey];
      } else if (node.paramChild) {
        const pc = node.paramChild;
        const fork = pc.fork;

        // #1264 A1 (opt→splat): an invalid take (constraint fails on the decoded
        // value) skips to the splat sibling. #1283: ALSO skip when a
        // constraint-SATISFYING take would dead-end on the LAST segment — the
        // take-node carries no terminal route (only a param/splat child needing more
        // segments), so committing strands the match while the splat sibling can
        // still terminate here. A take-node WITH a route (or slash-child) is a valid
        // terminal → present-first preserved.
        if (
          fork !== undefined &&
          node.splatChild !== undefined &&
          (this.#forkTakesSplat(fork, segment) ||
            (segmentEnd >= length &&
              pc.node.route === undefined &&
              pc.node.slashChildRoute === undefined))
        ) {
          return this.#matchSplat(node.splatChild, path, start, params);
        }

        next = pc.node;
        // #1263 A2 (opt→required-param): on the LAST segment the optional is
        // omitted → bind under the successor's name. The common non-fork param is
        // fast-pathed inline (no helper call — spike: extraction cost ~5% on
        // single-param).
        if (fork?.skipName !== undefined && segmentEnd >= length) {
          params[fork.skipName] = segment;
        } else {
          params[pc.name] = segment;
        }
      } else if (node.splatChild) {
        return this.#matchSplat(node.splatChild, path, start, params);
      } else {
        return undefined;
      }

      node = next;
      start = segmentEnd + 1;
    }

    return node.slashChildRoute ?? node.route;
  }

  #matchSplat(
    splatChild: { node: SegmentNode; name: string },
    path: string,
    start: number,
    params: Record<string, string>,
  ): CompiledRoute | undefined {
    const sn = splatChild.node;

    // Stryker disable next-line BlockStatement: equivalent — leaf-splat fast path; the #traverseFrom fallback returns the same route+params (proven via hasChildren injection)
    if (!sn.hasChildren) {
      params[splatChild.name] = path.slice(start);

      return sn.route;
    }

    const childParams: Record<string, string> = {};
    const specific = this.#traverseFrom(sn, path, start, childParams);

    if (specific) {
      Object.assign(params, childParams);

      return specific;
    }

    params[splatChild.name] = path.slice(start);

    return sn.route;
  }

  /**
   * #1263/#1264 try-take-if-valid: whether a `segment` at a constrained-optional
   * fork should be TAKEN as the optional (its DECODED value, #857, satisfies the
   * constraint) rather than skipped to the splat. Inline-decodes because the
   * decision happens during traverse, before `#decodeParams`; a malformed-percent
   * segment cannot be the decoded optional → not taken (→ skip, and the splat then
   * carries it into `#decodeParams`, which rejects it, #737).
   */
  #tryTakeFork(constraint: RegExp, segment: string): boolean {
    try {
      return constraint.test(this.#decode ? this.#decode(segment) : segment);
    } catch {
      return false;
    }
  }

  /**
   * #1264 A1: whether an opt→splat fork should SKIP to the splat — it carries a
   * constraint and the segment fails `#tryTakeFork` (its DECODED value doesn't
   * satisfy the constraint).
   */
  #forkTakesSplat(fork: ForkMeta, segment: string): boolean {
    return (
      fork.constraint !== undefined &&
      !this.#tryTakeFork(fork.constraint, segment)
    );
  }

  #decodeParams(params: Record<string, string>): boolean {
    const decode = this.#decode;

    if (!decode) {
      return true;
    }

    for (const key in params) {
      const value = params[key];

      // Stryker disable next-line StringLiteral,BlockStatement: equivalent — includes('%') is a skip-optimization; decoding a %-free value is a no-op, so always-proceeding is identical
      if (!value.includes("%")) {
        continue;
      }

      // Stryker disable next-line BlockStatement: equivalent — redundant with the try/catch below — decodeURIComponent throws on the same invalid-% input (proven by injection)
      if (!validatePercentEncoding(value)) {
        return false;
      }

      try {
        params[key] = decode(value);
      } catch {
        // `validatePercentEncoding` only checks `%XX` *syntax*. A sequence that
        // is syntactically valid but semantically invalid UTF-8 (e.g. `%E0%41`,
        // `%C0%80`, `%FF`) still makes `decodeURIComponent`/`decodeURI` throw a
        // URIError. `match()` must never throw — reject the path so the router
        // resolves to UNKNOWN_ROUTE instead of crashing on start() (#737).
        return false;
      }
    }

    return true;
  }

  #validateConstraints(
    params: Record<string, string>,
    route: CompiledRoute,
  ): boolean {
    for (const [paramName, constraint] of route.constraintPatterns) {
      // An omitted optional param is ABSENT from `params` — nothing to validate.
      // Testing the missing value would coerce `undefined` to the string
      // "undefined" and reject the omit form (`/search/:query<\d+>?` matching
      // "/search"). Presence check via `Object.hasOwn` (params is typed
      // `Record<string, string>`, so the runtime-absent key is a type-lie);
      // symmetric with the build side's absent-param skip. (#1148)
      if (
        Object.hasOwn(params, paramName) &&
        !constraint.pattern.test(params[paramName])
      ) {
        return false;
      }
    }

    return true;
  }
}

export { createSegmentNode } from "./pathUtils";
