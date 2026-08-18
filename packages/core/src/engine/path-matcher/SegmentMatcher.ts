import { DECODING_METHODS, ENCODING_METHODS } from "./encoding";
import { createSegmentNode, normalizeTrailingSlash } from "./pathUtils";
import { validatePercentEncoding } from "./percentEncoding";
import { registerNode } from "./registration";

import type {
  BuildPathOptions,
  CompiledRoute,
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

/** Shared frozen empty query object reused for every query-less match. */
const EMPTY_SEARCH: Readonly<Record<string, unknown>> = Object.freeze({});

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
    const requestedEncoding = options.urlParamsEncoding ?? "default";

    // `Object.hasOwn` on the table, and a FALLBACK rather than a throw (#1811).
    //
    // Both encoder maps are plain object literals indexed by a string the
    // consumer supplies, so an unrecognised value used to be installed verbatim
    // as the live encoder: an `Object.prototype` member made one — `"toString"`
    // built `/x/[object Object]` in both directions and `"constructor"` passed
    // the value through, printing a raw space — while an ordinary typo produced
    // `undefined` and deferred a `TypeError: slot.encoder is not a function`
    // from inside `buildPath`, naming nothing.
    //
    // ⚑ Bare core DEGRADES, it does not throw, because that is what its two
    // sibling enums already do: an unrecognised `trailingSlash` or
    // `queryParamsMode` falls back to the default and the router keeps working
    // (measured). This option was the odd one out — its `does NOT throw` test
    // passed only because the crash arrived later, from a different call.
    // Rejecting an invalid enum by name is `@real-router/validation-plugin`'s
    // job, and it already owns this exact list; throwing here would shadow its
    // better-worded message.
    //
    // ⚑ ONE check covers all three index sites: the decoder below, `encodeParam`
    // and `makeBuildParamSlot` all read `#options.urlParamsEncoding`, which this
    // line fixes once and `registerTree` hands down to registration.
    const urlParamsEncoding = Object.hasOwn(ENCODING_METHODS, requestedEncoding)
      ? requestedEncoding
      : "default";

    this.#options = {
      caseSensitive: options.caseSensitive ?? true,
      strictTrailingSlash: options.strictTrailingSlash ?? false,
      strictQueryParams: options.strictQueryParams ?? false,
      urlParamsEncoding,
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
        rootUrlParams: node.paramMeta.urlParams,
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

    // Decode the captured params. `match()` must never throw — a malformed
    // percent sequence (#737) makes this return false → the URL is unmatched.
    if (!this.#decodeParams(params)) {
      return undefined;
    }

    return this.#buildResult(route, params, queryString);
  }

  buildPath(
    name: string,
    params?: Record<string, unknown>,
    search?: Record<string, unknown>,
    options?: BuildPathOptions,
  ): string {
    const route = this.#routesByName.get(name);

    if (!route) {
      throw new Error(`[SegmentMatcher.buildPath] '${name}' is not defined`);
    }

    const path = this.#buildUrlPath(route, params);
    const finalPath = this.#applyTrailingSlash(path, options?.trailingSlash);
    // Search-aware (RFC-4 M2 / #1548): when an explicit `search` bag is passed,
    // the query string is built from it; the path comes from `params`. So a
    // colliding name (`/items/:id?id` with `buildPath("items", {id:5}, {id:7})`)
    // emits `/items/5?id=7` — path wins its slot, query wins its own (the killed
    // #843 precedence). A v1 caller passes no `search`, so `search ?? params`
    // falls back to extracting the query half from the single bag, unchanged.
    const queryString = this.#buildQueryStringForBuild(
      route,
      search ?? params,
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

  /**
   * The route's declared query-param names — the SAME registry the query-string
   * build reads (`#buildQueryStringForBuild`), so a consumer classifying keys
   * into channels cannot drift from what this matcher actually prints (#1556).
   *
   * Unlike a walk over {@link getSegmentsByName}, this includes the ROOT node's
   * `?`-declarations (`setRootPath("?a&b")` — how persistent-params declares its
   * keys): the root is captured in `#rootQueryParams` at `registerTree` and is
   * deliberately NOT part of `matchSegments`, so a segment walk silently misses
   * it. Path-slot collisions (`/items/:id?id`) are NOT filtered here — the
   * caller owns that policy (core subtracts its `urlParams`, #843 / #1549).
   */
  getDeclaredQueryParams(name: string): readonly string[] | undefined {
    return this.#routesByName.get(name)?.declaredQueryParams;
  }

  hasRoute(name: string): boolean {
    return this.#routesByName.has(name);
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
      // `Object.hasOwn` before the read, not a bare `params[name]`: the slot name
      // comes from the ROUTE, so a route declaring `/:toString` (or any other
      // `Object.prototype` member) reads the inherited METHOD off an EMPTY bag,
      // the `undefined`/`null` test below never fires, and the required-param
      // guard is bypassed while the serialized function is printed into the path
      // (#1798). Same spelling as the `loose` arm in
      // `#buildQueryStringForBuild` and as `channels/`.
      //
      // ⚠ The nullish test covers `null` as well as `undefined`, and that is not
      // decoration: the expression it replaced was `params?.[slot.paramName]`,
      // and optional chaining is nullish-safe while `Object.hasOwn` does
      // `ToObject` first and THROWS on `null`. Dropping `null` here turned a
      // named `Missing required param` into a bare
      // `TypeError: Cannot convert undefined or null to object`. The bag reaches
      // this line unnormalised only from a route's own `encodeParams`, whose
      // return value `RoutesNamespace` forwards verbatim — the facade's
      // `normalizeParams` never yields `null`. The sibling read in
      // `#buildQueryStringForBuild` guards the same way (`if (!params)`).
      const value =
        params !== undefined &&
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the STATIC type is narrower than the runtime: `RoutesNamespace` forwards a route's `encodeParams` return VERBATIM (its `encoded.params` is unvalidated user output), so `null` really arrives here. Same shape as `Router.ts`'s runtime guard for `navigate(null)`.
        params !== null &&
        Object.hasOwn(params, slot.paramName)
          ? params[slot.paramName]
          : undefined;

      // 3-token grammar (M1): every param slot is required — no optional-omit
      // branch. A missing param is an error.
      if (value === undefined || value === null) {
        throw new Error(
          `[SegmentMatcher.buildPath] Missing required param '${slot.paramName}'`,
        );
      }

      // #740 item 3: an empty value collapses the segment, silently producing a
      // path that matches the parent route (`buildPath("u.p", {id:""})` →
      // `/users/` → matches `u`). Reject it like a missing param.
      if (value === "") {
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
      // `Object.hasOwn`, not `name in params`: the name comes from the ROUTE, so
      // `in` walks the PROTOTYPE and a route declaring `?toString` reads as "the
      // caller already filled this slot" on an EMPTY bag — printing the
      // serialized native method into the href while the committed `state.search`
      // stays empty, a state contradicting its own path (#1798). The `loose` arm
      // below already asks the identical question this way.
      // Stryker disable next-line BlockStatement: equivalent — buildQueryString strips undefined, so adding absent declared keys instead of continue changes nothing
      if (!Object.hasOwn(params, name)) {
        continue;
      }

      queryObj[name] = params[name];
      hasKeys = true;
    }

    if (queryParamsMode === "loose") {
      for (const paramKey in params) {
        if (
          !Object.hasOwn(params, paramKey) ||
          route.declaredQueryParamsSet.has(paramKey) ||
          route.buildParamNamesSet.has(paramKey)
        ) {
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
    let search: Readonly<Record<string, unknown>> = EMPTY_SEARCH;

    if (queryString !== undefined) {
      const parsed = this.#parseSearch(route, queryString);

      if (parsed === undefined) {
        return undefined;
      }

      // Query goes ONLY into its own channel now (RFC-4 M2 / #1548). `params`
      // stays path-only — the A2 back-compat fold into `params`, and with it
      // the query-overwrites-path precedence (#843), are gone.
      search = parsed;
    }

    return {
      segments: route.matchSegments,
      params,
      search,
      meta: route.meta,
    };
  }

  // Parses the query string into its OWN object — the query channel (RFC-4 M2 /
  // #1548). Returns undefined (→ match yields undefined) when the URL is
  // unmatchable: the injected parser threw, or strict mode saw an undeclared
  // key. The injected parser (searchParams.ts) already hardens `__proto__` as an
  // own key (#855/#1293), so the parsed object is returned directly — no per-key
  // re-hardening (that folding, and `assignQueryParam`, live on only for the A3
  // back-compat merge into `params`).
  #parseSearch(
    route: CompiledRoute,
    queryString: string,
  ): Record<string, unknown> | undefined {
    let search: Record<string, unknown>;

    try {
      search = this.#options.parseQueryString(queryString);
    } catch (error) {
      // The injected query parser decodes percent-encoding too, so the same
      // valid-hex/invalid-UTF-8 sequence that breaks path params (e.g.
      // `?x=%E0%41`) makes it throw a URIError. `match()` must never throw on
      // INPUT — treat the whole URL as unmatched so the router resolves to
      // UNKNOWN_ROUTE instead of crashing on start() (#737).
      if (error instanceof URIError) {
        return undefined;
      }

      // A CONFIG error is not that class, and swallowing it is what let #1318's
      // own reported symptom survive its fix: `requireStrategy` throws a
      // TypeError naming the offending `queryParams` field, and this catch turned
      // it into "every URL with a query resolves to UNKNOWN_ROUTE" — a routing
      // symptom pointing away from the config that caused it (#1796).
      //
      // Narrowing is safe because this parser is core's own: `createMatcher`
      // supplies `parseQuery`, and `CreateMatcherOptions` exposes formats, not a
      // custom parser — so the only throwers reachable from here are
      // `decodeURIComponent` (URIError, above) and `requireStrategy` (TypeError).
      // The sibling `search-params/utils.ts` narrows on the same predicate for
      // the mirror reason on the build direction.
      throw error;
    }

    if (this.#options.strictQueryParams) {
      const declared = route.declaredQueryParamsSet;

      for (const key in search) {
        if (!declared.has(key)) {
          return undefined;
        }
      }
    }

    return search;
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

  // The core match hot loop. The #1288 param+splat junction is inlined here
  // rather than extracted into a helper, because a per-param helper call
  // regresses the common single-param path ~5% (spike-measured).
  // eslint-disable-next-line sonarjs/cognitive-complexity -- inlined #1288 junction (see above): the static/param/splat dispatch is deliberately one function for the hot path
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

        // #1288: validated sub-traverse on a param+splat junction. The param
        // branch is tried on a scratch object and commits ONLY if it structurally
        // completes ("param wins if its branch can complete", INVARIANTS Matching #8);
        // otherwise the splat sibling captures. Junction-free param hops (no splat
        // sibling) never enter this block — the common single-param path below is
        // untouched.
        if (node.splatChild !== undefined) {
          const childParams: Record<string, string> = { [pc.name]: segment };

          const taken = this.#traverseFrom(
            pc.node,
            path,
            segmentEnd + 1,
            childParams,
          );

          if (taken !== undefined) {
            Object.assign(params, childParams);

            return taken;
          }

          return this.#matchSplat(node.splatChild, path, start, params);
        }

        next = pc.node;
        params[pc.name] = segment;
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

    // #1288: a structurally-complete specific child wins over the wildcard
    // capture; otherwise the splat captures the rest of the path.
    if (specific) {
      Object.assign(params, childParams);

      return specific;
    }

    params[splatChild.name] = path.slice(start);

    return sn.route;
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
}

export { createSegmentNode } from "./pathUtils";
