// packages/core/src/namespaces/RoutesNamespace/RoutesNamespace.ts

import { DEFAULT_ROUTE_NAME } from "./constants";
import {
  matchSourceTrailingSlash,
  paramsMatch,
  paramsMatchExcluding,
  stripQueryDefaults,
} from "./helpers";
import {
  createRoutesStore,
  rebuildTreeInPlace,
  resetStore,
} from "./routesStore";
import { constants, DEFAULT_TRANSITION, EMPTY_SEARCH } from "../../constants";
import { splitParamsBySearch } from "../../helpers";
import { getTransitionPath } from "../../transitionPath";

import type { RoutesStore } from "./routesStore";
import type { RoutesDependencies } from "./types";
import type {
  CreateMatcherOptions,
  RouteParams,
  RouteTree,
  RouteTreeState,
} from "../../engine";
import type { RouteMetaLookup } from "../../transitionPath";
import type {
  DefaultDependencies,
  ForwardToCallback,
  Options,
  Params,
  RouterLogger,
  SearchParams,
  State,
  Route,
} from "../../types";
import type { RouteLifecycleNamespace } from "../RouteLifecycleNamespace";

function collectUrlParamsArray(segments: readonly RouteTree[]): string[] {
  const params: string[] = [];

  for (const segment of segments) {
    for (const param of segment.paramMeta.urlParams) {
      params.push(param);
    }
  }

  return params;
}

function collectQueryParamsArray(segments: readonly RouteTree[]): string[] {
  const params: string[] = [];

  for (const segment of segments) {
    for (const param of segment.paramMeta.queryParams) {
      params.push(param);
    }
  }

  return params;
}

/**
 * Overwrites each declared query name in `buildParams` with its search-channel
 * value when one exists (#1549): the rebuilt URL resolves declared names
 * search-first, so a query-typed default riding in the path bag cannot shadow
 * the URL's own query value. Mutates `buildParams` in place.
 */
function applySearchWinsForDeclaredQuery(
  buildParams: Record<string, unknown>,
  queryNames: readonly string[],
  search: SearchParams,
): void {
  for (const queryName of queryNames) {
    if (Object.hasOwn(search, queryName)) {
      buildParams[queryName] = search[queryName];
    }
  }
}

function createRouteState<P extends RouteParams = RouteParams>(
  matchResult: {
    readonly segments: readonly { fullName: string }[];
    readonly params: Readonly<Record<string, unknown>>;
    readonly search: Readonly<Record<string, unknown>>;
    readonly meta: Readonly<Record<string, Record<string, "url" | "query">>>;
  },
  name?: string,
): RouteTreeState<P> {
  // The matcher yields ≥1 segment for every successful match, each carrying the
  // cumulative route name as `fullName`, so the last element is always present.
  // (Formerly `buildNameFromSegments` with a `?? ""` fallback — that branch was
  // unreachable defensive cruft propped up by a white-box test; inlined here.)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- matcher invariant: a successful match is never empty
  const resolvedName = name ?? matchResult.segments.at(-1)!.fullName;

  return {
    name: resolvedName,
    params: matchResult.params as P,
    search: matchResult.search,
    meta: matchResult.meta,
  };
}

interface CachedBuildPathOpts {
  readonly trailingSlash?: "always" | "never" | undefined;
  readonly queryParamsMode?: "default" | "strict" | "loose" | undefined;
}

/**
 * Independent namespace for managing routes.
 *
 * Static methods handle validation (called by facade).
 * Instance methods handle storage and business logic.
 */
export class RoutesNamespace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly #store: RoutesStore<Dependencies>;
  #cachedBuildPathOpts: CachedBuildPathOpts | undefined;
  // Source `options` reference captured on the first #getBuildPathOptions call;
  // used only by the dev-build immutability assertion below (#957).
  #cachedOptionsSource: Options | undefined;

  get #deps(): RoutesDependencies<Dependencies> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.#store.depsStore!;
  }

  constructor(
    // No `= []` default: the sole caller (Router's ctor) always passes its own
    // already-defaulted `routes` — a namespace-level default would be dead code
    // and a default-before-required-params smell (S1788).
    routes: Route<Dependencies>[],
    matcherOptions: CreateMatcherOptions | undefined,
    logger: RouterLogger,
  ) {
    this.#store = createRoutesStore(routes, matcherOptions, logger);
  }

  /**
   * Creates a predicate function to check if a route node should be updated.
   * Note: Argument validation is done by facade (Router.ts) via validateShouldUpdateNodeArgs.
   */
  static shouldUpdateNode(
    nodeName: string,
    getMeta: RouteMetaLookup,
  ): (toState: State, fromState?: State) => boolean {
    return (toState: State, fromState?: State): boolean => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!(toState && typeof toState === "object" && "name" in toState)) {
        throw new TypeError(
          "[router.shouldUpdateNode] toState must be valid State object",
        );
      }

      if (toState.transition.reload) {
        return true;
      }

      // Root node (DEFAULT_ROUTE_NAME === "") has no route-level identity — it
      // represents "any route". It must update on every transition so that
      // consumers subscribed via useRouteNode("") (including RouteView at
      // the top of the tree) see every change. This matches the documented
      // contract in adapter docs: `useRouteNode("")` — Root — ALL route
      // changes. See #519 for the missed transitions it was suffering from
      // (users → users.user had intersection="users", leaving the root node
      // un-updated under a flat <Match segment="users.user" exact> pattern).
      if (nodeName === DEFAULT_ROUTE_NAME) {
        return true;
      }

      const { intersection, toActivate, toDeactivate } = getTransitionPath(
        toState,
        fromState,
        getMeta,
      );

      if (nodeName === intersection) {
        return true;
      }

      if (toActivate.includes(nodeName)) {
        return true;
      }

      return toDeactivate.includes(nodeName);
    };
  }

  // =========================================================================
  // Dependency injection
  // =========================================================================

  /**
   * Sets dependencies. Pure assignment — no side effects (#1331).
   *
   * The pending canActivate/canDeactivate factories from initial routes are
   * flushed separately by {@link flushPendingGuards}, called once wiring is
   * complete, so the order of the wire-* calls is unconstrained.
   */
  setDependencies(deps: RoutesDependencies<Dependencies>): void {
    this.#store.depsStore = deps;
  }

  /**
   * Registers the pending guard factories collected from initial route
   * definitions. Deferred out of {@link setDependencies} (#1331) so it runs on
   * a fully-built, fully-bound router: a guard factory that calls any
   * `router.*` method sees a ready instance instead of a half-assembled one.
   *
   * Invoked as the last step of the Router constructor. Idempotent after the
   * first call (the pending maps are cleared). Runtime `add()`/`replace()`
   * compile guards in their own PREPARE phase and never populate these maps.
   */
  flushPendingGuards(): void {
    const deps = this.#deps;

    for (const [routeName, handler] of this.#store.pendingCanActivate) {
      deps.addActivateGuard(routeName, handler);
    }

    this.#store.pendingCanActivate.clear();

    for (const [routeName, handler] of this.#store.pendingCanDeactivate) {
      deps.addDeactivateGuard(routeName, handler);
    }

    this.#store.pendingCanDeactivate.clear();
  }

  /**
   * Sets the lifecycle namespace reference.
   */
  setLifecycleNamespace(
    namespace: RouteLifecycleNamespace<Dependencies> | undefined,
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.#store.lifecycleNamespace = namespace!;
  }

  // =========================================================================
  // Route tree operations
  // =========================================================================

  setRootPath(newRootPath: string): void {
    this.#store.rootPath = newRootPath;
    rebuildTreeInPlace(this.#store);
  }

  hasRoute(name: string): boolean {
    return this.#store.matcher.hasRoute(name);
  }

  clearRoutes(): void {
    resetStore(this.#store);
  }

  // =========================================================================
  // Path operations
  // =========================================================================

  /**
   * Builds a URL path for a route.
   * Note: Argument validation is done by facade (Router.ts) via validateBuildPathArgs.
   *
   * @param route - Route name
   * @param params - Route parameters
   * @param search - Query-channel params (RFC-4 M2 / #1548)
   * @param options - Router options
   */
  buildPath(
    route: string,
    params?: Params,
    search?: SearchParams,
    options?: Options,
  ): string {
    if (route === constants.UNKNOWN_ROUTE) {
      return typeof params?.path === "string" ? params.path : "";
    }

    const paramsWithDefault = Object.hasOwn(
      this.#store.config.defaultParams,
      route,
    )
      ? { ...this.#store.config.defaultParams[route], ...params }
      : /* v8 ignore next -- @preserve: V8 can't track ?? branch in ternary; covered by buildPath tests without params */ (params ??
        {});

    // #1549: with an explicit `search` bag the matcher builds the query string
    // from it alone, so a query-typed default (declared `?page` +
    // `defaultParams.page`) must join the search channel or it silently drops
    // out of the URL. An explicitly-passed search value wins over the default.
    // A v1 call (`search === undefined`) keeps the single-bag fallback, where
    // the matcher extracts query-typed defaults from `paramsWithDefault`.
    const searchWithDefault =
      search === undefined ? search : this.#mergeQueryDefaults(route, search);

    // `search` (RFC-4 M2 / #1548) is the explicit query channel. The route codec
    // (if any) now sees BOTH channels — `encodeParams({ params, search })` returns
    // `{ params, search }` (§4) — so an encoder can shape the query as well as the
    // path. The matcher then builds the path slots from the returned `params` and
    // the query string from the returned `search`. With no encoder the channels
    // pass straight through, allocating no wrapper object on the hot path.
    if (typeof this.#store.config.encoders[route] === "function") {
      const encoded = this.#store.config.encoders[route]({
        // Spread so a mutating encoder can't reach the caller's original params
        // object (the `params ?? {}` branch above aliases it) — a copy, as the
        // v1 single-bag call (`encoders[route]({ ...paramsWithDefault })`) did.
        params: { ...paramsWithDefault },
        search: searchWithDefault ?? {},
      });

      return this.#store.matcher.buildPath(
        route,
        encoded.params,
        encoded.search,
        this.#getBuildPathOptions(options),
      );
    }

    return this.#store.matcher.buildPath(
      route,
      paramsWithDefault,
      searchWithDefault,
      this.#getBuildPathOptions(options),
    );
  }

  /**
   * Matches a URL path to a route in the tree.
   * Note: Argument validation is done by facade (Router.ts) via validateMatchPathArgs.
   */
  matchPath<P extends Params = Params>(
    path: string,
    options?: Options,
  ): State<P> | undefined {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Router.ts always passes options
    const opts = options!;

    const matchResult = this.#store.matcher.match(path);

    if (!matchResult) {
      return undefined;
    }

    const routeState = createRouteState(matchResult);
    const { name, params } = routeState;
    // The matcher always carries a search bag (a frozen `{}` when empty) but types
    // its values as `unknown`; narrow it to the query channel once here so the
    // codec / forwardState / rebuild uses it without per-site casts.
    const search = routeState.search as SearchParams;

    // Two-channel decode (RFC-4 M2 / #1548, §4): the route codec sees BOTH the
    // path params AND the parsed query — `decodeParams({ params, search })` →
    // `{ params, search }` — restoring v1's reach (v1 ran the whole path+query bag
    // through the decoder). Runs here, inside match, BEFORE any search-schema
    // plugin validation (the v1 order: engine codec → plugin). With no decoder the
    // channels pass through untouched.
    const decoded =
      typeof this.#store.config.decoders[name] === "function"
        ? this.#store.config.decoders[name]({ params, search })
        : { params, search };

    // Thread the decoded channels through forwardState (RFC-4 M2 / #1548): a
    // search-schema interceptor validates the query on the URL→State path here
    // (the `routeSearch` argument is defined, marking this as a re-parse, not a
    // navigate). `forwardedSearch` is what the (possibly validating) interceptor
    // chain returns — use it for the committed `state.search`.
    const {
      name: routeName,
      params: routeParams,
      search: forwardedSearch,
    } = this.#deps.forwardState<P>(name, decoded.params as P, decoded.search);

    let builtPath = path;

    if (opts.rewritePathOnMatch) {
      // Two-channel encode for the URL rebuild (RFC-4 M2 / #1548, §4): the codec
      // sees `{ params: routeParams, search }` and returns `{ params, search }`,
      // so it can shape either channel of the rebuilt URL.
      const encoded =
        typeof this.#store.config.encoders[routeName] === "function"
          ? this.#store.config.encoders[routeName]({
              params: routeParams,
              search,
            })
          : { params: routeParams, search };

      // Reunite the (encoded) query with the path bag so the rebuilt URL keeps
      // its query string. PATH params win over a same-named query param
      // (`/items/:id?id`): the path bag is spread LAST so query never
      // overwrites the path value in the rebuild — the killed #843 precedence.
      const buildParams: Record<string, unknown> = {
        ...encoded.search,
        ...encoded.params,
      };

      // #1549: for a DECLARED query name the search channel wins the rebuild —
      // the path bag may carry a query-typed default (forwardState merges all
      // defaults into params), and without this the default would shadow the
      // URL's own query value in the rebuilt `state.path`. `getQueryParams`
      // excludes colliding names (`/items/:id?id` — path-owned), so path slots
      // stay protected by the spread order above.
      applySearchWinsForDeclaredQuery(
        buildParams,
        this.getQueryParams(routeName),
        encoded.search,
      );

      const ts = opts.trailingSlash;

      try {
        // `search` omitted (v1 single-bag rebuild): the matched query is folded
        // into `buildParams` above (declared names resolved search-first), so
        // the matcher extracts the query half from it — undeclared loose-mode
        // keys in either channel keep reaching the URL, and query-typed
        // defaultParams still reach it too. The write path (navigate /
        // buildPath) passes an explicit `search` (RFC-4 M2 / #1548).
        builtPath = this.#store.matcher.buildPath(
          routeName,
          buildParams,
          undefined,
          {
            trailingSlash: ts === "never" || ts === "always" ? ts : undefined,
            queryParamsMode: opts.queryParamsMode,
          },
        );

        if (ts === "preserve") {
          builtPath = matchSourceTrailingSlash(path, builtPath);
        }
      } catch {
        // The match already succeeded (route found, params decoded); only the
        // post-match path rewrite threw — e.g. a custom encoder handed buildPath
        // a query value its codec cannot serialise. Keep the source path
        // un-rewritten rather than discard a valid match (#1157). Opposite of the
        // parse side (#737): there a throw means "URL not understood" → unmatched;
        // here the URL WAS matched and only re-canonicalisation failed.
        builtPath = path;
      }
    }

    // `state.search` carries the matched query as returned by forwardState (a
    // search-schema interceptor may have validated/stripped it); `state.params`
    // keeps the resolved path bag. A query-declared `defaultParam` (and a
    // decoder-injected query key) still rides in `routeParams` here —
    // `makeState` routes declared query names into `state.search` (#1549), so
    // the committed channels are canonical regardless of the producer.
    return this.#deps.makeState<P>(
      routeName,
      routeParams,
      forwardedSearch,
      builtPath,
    );
  }

  /**
   * Applies forwardTo and returns resolved state with merged defaultParams.
   *
   * Merges params in order:
   * 1. Source route defaultParams
   * 2. Provided params
   * 3. Target route defaultParams (after resolving forwardTo)
   */
  forwardState<
    P extends Params = Params,
    S extends SearchParams = SearchParams,
  >(
    name: string,
    params: P,
    search?: S,
  ): { name: string; params: P; search: S } {
    // The query channel passes through forwardState untouched (RFC-4 M2 / #1548):
    // forwardTo resolution and defaultParams merging operate on the path bag,
    // while `search` carries the already-parsed query (from matchPath's re-parse
    // or the navigate split) so a search-schema interceptor can validate it on
    // the URL→State path. Frozen empty singleton when absent.
    const resolvedSearch = (search ?? EMPTY_SEARCH) as S;

    if (Object.hasOwn(this.#store.config.forwardFnMap, name)) {
      const paramsWithSourceDefaults = this.#mergeDefaultParams(name, params);
      const dynamicForward = this.#store.config.forwardFnMap[name];
      const resolved = this.#resolveDynamicForward(
        name,
        dynamicForward,
        params,
      );

      return {
        name: resolved,
        params: this.#mergeDefaultParams(resolved, paramsWithSourceDefaults),
        search: resolvedSearch,
      };
    }

    const staticForward = this.#store.resolvedForwardMap[name] ?? name;

    if (
      staticForward !== name &&
      Object.hasOwn(this.#store.config.forwardFnMap, staticForward)
    ) {
      const paramsWithSourceDefaults = this.#mergeDefaultParams(name, params);
      const targetDynamicForward =
        this.#store.config.forwardFnMap[staticForward];
      const resolved = this.#resolveDynamicForward(
        staticForward,
        targetDynamicForward,
        params,
      );

      return {
        name: resolved,
        params: this.#mergeDefaultParams(resolved, paramsWithSourceDefaults),
        search: resolvedSearch,
      };
    }

    if (staticForward !== name) {
      const paramsWithSourceDefaults = this.#mergeDefaultParams(name, params);

      return {
        name: staticForward,
        params: this.#mergeDefaultParams(
          staticForward,
          paramsWithSourceDefaults,
        ),
        search: resolvedSearch,
      };
    }

    return {
      name,
      params: this.#mergeDefaultParams(name, params),
      search: resolvedSearch,
    };
  }

  /**
   * Builds a RouteTreeState from already-resolved route name and params.
   * Called by Router.buildState after forwardState is applied at facade level.
   * This allows plugins to intercept forwardState.
   */
  buildStateResolved(
    resolvedName: string,
    resolvedParams: Params,
  ): RouteTreeState | undefined {
    const segments = this.#store.matcher.getSegmentsByName(resolvedName);

    if (!segments) {
      return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const meta = this.#store.matcher.getMetaByName(resolvedName)!;

    return createRouteState(
      // Resolved (non-match) path: query is still folded into `params` during
      // the A2 back-compat window, so `search` is empty here (RFC-4 M2 / #1548).
      { segments, params: resolvedParams, search: {}, meta },
      resolvedName,
    );
  }

  // =========================================================================
  // Query operations
  // =========================================================================

  /**
   * Checks if a route is currently active.
   */
  isActiveRoute(
    name: string,
    params: Params = {},
    searchArg: SearchParams = {},
    strictEquality = false,
    ignoreQueryParams = true,
  ): boolean {
    // Note: empty string check is handled by Router.ts facade
    const activeState = this.#deps.getState();

    if (!activeState) {
      return false;
    }

    const activeName = activeState.name;

    // Fast path: check if routes are related before expensive operations
    if (
      activeName !== name &&
      !activeName.startsWith(`${name}.`) &&
      !name.startsWith(`${activeName}.`)
    ) {
      return false;
    }

    const defaultParams = this.#store.config.defaultParams[name] as
      Params | undefined;

    // Exact match case
    if (strictEquality || activeName === name) {
      const effectiveParams = defaultParams
        ? { ...defaultParams, ...params }
        : params;

      // Split the target bag into path and query channels so `areStatesEqual`
      // compares each against the active state's own channels (RFC-4 M2 /
      // #1548) — `activeState.params` is now path-only, query is in
      // `activeState.search`. `params` may still carry query keys (a v1
      // single-bag call that omits `searchArg`); the explicit `searchArg` (the
      // slot-shifted query channel) then wins over any split/default query
      // value. Non-query default keys are pinned to the params channel (#1549)
      // so the target splits the same way the committed state was built.
      const { params: pathParams, search: splitSearch } = splitParamsBySearch(
        effectiveParams,
        this.getUrlParams(name),
        this.getNonQueryDefaultKeys(name),
      );

      const targetState: State = {
        name,
        params: pathParams,
        search: { ...splitSearch, ...searchArg },
        path: "",
        transition: DEFAULT_TRANSITION,
        context: {},
      };

      return this.#deps.areStatesEqual(
        targetState,
        activeState,
        ignoreQueryParams,
      );
    }

    // The fast path above lets through three relations: exact (handled in
    // the previous block), `activeName` descendant of `name`, and `name`
    // descendant of `activeName`. Only the first two count as "active" —
    // a link pointing DEEPER than the current state is a navigation option,
    // not an active state. Reject the descendant-of-active case explicitly.
    if (!activeName.startsWith(`${name}.`)) {
      return false;
    }

    // Hierarchical check: activeState is a descendant of target (name).
    // This comparison was written against v1's single merged bag; reconstruct
    // it from the two channels (path params + query) so the existing
    // paramsMatch / stripQueryDefaults / paramsMatchExcluding logic keeps its
    // exact semantics after the M2 split (RFC-4 M2 / #1548).
    const activeParams = {
      ...activeState.params,
      ...activeState.search,
    } as Params;

    // Recombine the target's two channels for the single-bag comparison logic
    // below: the explicit query `searchArg` wins over any query key still riding
    // in `params` (a v1 single-bag call) — RFC-4 M2 / #1548.
    const combinedTarget = { ...params, ...searchArg } as Params;

    if (!paramsMatch(combinedTarget, activeParams)) {
      return false;
    }

    if (!defaultParams) {
      return true;
    }

    // Honor `ignoreQueryParams` symmetrically with the exact-match branch
    // above: query-only param differences (e.g. parent has
    // `defaultParams: { sort: "asc" }` while the active descendant is
    // `products.detail` with `params: { id: "6" }` and no sort) must not
    // disqualify an ancestor link from being active. Strip query-typed
    // keys of `name` from the defaults before comparison; URL-typed keys
    // (`:id`, `:role`, etc.) are still enforced.
    // `name` reaches this point only after the fast-path established a valid
    // hierarchical relation AND `defaultParams` is non-null — both imply the
    // matcher has registered the route. Since the #1414 skip-empty meta, a
    // fully-static route resolves to the shared EMPTY_ROUTE_META with no own
    // entry, so `getMetaByName(name)?.[name]` is undefined there — exactly the
    // "nothing to strip" signal stripQueryDefaults short-circuits on (a static
    // route cannot declare query params, hence cannot carry query defaults).
    const defaultsToCheck = ignoreQueryParams
      ? stripQueryDefaults(
          defaultParams,
          this.#store.matcher.getMetaByName(name)?.[name],
        )
      : defaultParams;

    return paramsMatchExcluding(defaultsToCheck, activeParams, combinedTarget);
  }

  getMetaForState(
    name: string,
  ): Record<string, Record<string, "url" | "query">> | undefined {
    return this.#store.matcher.hasRoute(name)
      ? this.#store.matcher.getMetaByName(name)
      : undefined;
  }

  getUrlParams(name: string): string[] {
    const cached = this.#store.urlParamsCache.get(name);

    // Stryker disable next-line BlockStatement: equivalent — cache short-circuit; emptying the early-return recomputes the identical value (getUrlParams is deterministic per route name) and re-caches it. (ConditionalExpression stays live: `→true` returns undefined on a cache miss = killed.)
    if (cached !== undefined) {
      return cached;
    }

    const segments = this.#store.matcher.getSegmentsByName(name);
    const result = segments
      ? collectUrlParamsArray(segments as readonly RouteTree[])
      : [];

    this.#store.urlParamsCache.set(name, result);

    return result;
  }

  /**
   * Declared query param names of a route (`?a&b` across its segments,
   * ancestors included) that are NOT also path params — the query-channel twin
   * of {@link getUrlParams}, powering the defaultParams channel routing
   * (#1549). A colliding name (`/items/:id?id` — legal under M2, the channels
   * coexist) is path-owned for routing purposes: excluding it here keeps the
   * path slot's value in `state.params` and the rebuild's #843 precedence
   * intact. Same cache lifecycle: cleared on every matcher rebuild.
   */
  getQueryParams(name: string): string[] {
    const cached = this.#store.queryParamsCache.get(name);

    // Stryker disable next-line BlockStatement: equivalent — cache short-circuit; emptying the early-return recomputes the identical value (getQueryParams is deterministic per route name) and re-caches it. (ConditionalExpression stays live: `→true` returns undefined on a cache miss = killed.)
    if (cached !== undefined) {
      return cached;
    }

    const segments = this.#store.matcher.getSegmentsByName(name);
    let result: string[] = [];

    if (segments) {
      const urlParams = this.getUrlParams(name);

      result = collectQueryParamsArray(segments as readonly RouteTree[]).filter(
        (param) => !urlParams.includes(param),
      );
    }

    this.#store.queryParamsCache.set(name, result);

    return result;
  }

  /**
   * Keys of a route's `defaultParams` that are NOT declared query params — the
   * path and "arbitrary" defaults that keep their v1 home in `state.params`
   * (#1549). The v1 single-bag split (`splitParamsBySearch`) excludes them from
   * its non-path → search routing so a default-originated arbitrary key never
   * lands in the query channel (path keys are already kept by `pathNames`, so
   * their inclusion here is harmless). `undefined` when the route has no such
   * keys (the common case — zero allocation).
   *
   * Not cached: `defaultParams` is mutable via `update()` without a tree
   * rebuild, so a cache here would go stale where `urlParamsCache` cannot.
   */
  getNonQueryDefaultKeys(name: string): readonly string[] | undefined {
    if (!Object.hasOwn(this.#store.config.defaultParams, name)) {
      return undefined;
    }

    const defaults = this.#store.config.defaultParams[name];
    const queryParams = this.getQueryParams(name);
    let keys: string[] | undefined;

    for (const key in defaults) {
      if (!Object.hasOwn(defaults, key) || queryParams.includes(key)) {
        continue;
      }

      keys ??= [];
      keys.push(key);
    }

    return keys;
  }

  getStore(): RoutesStore<Dependencies> {
    return this.#store;
  }

  #mergeDefaultParams<P extends Params = Params>(
    routeName: string,
    params: P,
  ): P {
    if (Object.hasOwn(this.#store.config.defaultParams, routeName)) {
      return {
        ...this.#store.config.defaultParams[routeName],
        ...params,
      };
    }

    return params;
  }

  /**
   * Merges a route's query-typed defaults (declared query names present in its
   * `defaultParams`) into an explicit search bag — the search-channel twin of
   * {@link #mergeDefaultParams} (#1549). An explicitly-passed search value wins
   * over the default. Returns the original bag untouched (no allocation) when
   * the route has no query-typed defaults to add.
   */
  #mergeQueryDefaults<S extends SearchParams = SearchParams>(
    routeName: string,
    search: S,
  ): S {
    if (!Object.hasOwn(this.#store.config.defaultParams, routeName)) {
      return search;
    }

    const defaults = this.#store.config.defaultParams[routeName];
    let queryDefaults: Record<string, unknown> | undefined;

    for (const queryName of this.getQueryParams(routeName)) {
      if (
        !Object.hasOwn(defaults, queryName) ||
        Object.hasOwn(search, queryName)
      ) {
        continue;
      }

      queryDefaults ??= {};
      queryDefaults[queryName] = defaults[queryName];
    }

    return queryDefaults === undefined
      ? search
      : { ...queryDefaults, ...search };
  }

  #getBuildPathOptions(options?: Options): CachedBuildPathOpts {
    // Stryker disable next-line BlockStatement: equivalent — cache short-circuit; emptying the early-return rebuilds the identical buildPath options (deterministic) and re-caches them. (ConditionalExpression stays live: `→false` always rebuilds but a real consumer test pins the cached identity.)
    if (this.#cachedBuildPathOpts) {
      /* v8 ignore next 5 -- @preserve: dev assertion guarding a future caller that passes per-call varying options; the sole caller (Router.buildPath, always via this.#options.get()) passes the same immutable, deep-frozen per-instance options, so this branch is unreachable through the public API by construction (#957) */
      if (options !== this.#cachedOptionsSource) {
        this.#deps.logger.warn(
          "router.buildPath",
          "`options` differs from the cached source reference; router options are immutable per router instance, so the first-cached buildPath options are reused (#957).",
        );
      }

      return this.#cachedBuildPathOpts;
    }

    this.#cachedOptionsSource = options;

    const ts = options?.trailingSlash;

    this.#cachedBuildPathOpts = Object.freeze({
      trailingSlash: ts === "never" || ts === "always" ? ts : undefined,
      queryParamsMode: options?.queryParamsMode,
    });

    return this.#cachedBuildPathOpts;
  }

  #resolveDynamicForward(
    startName: string,
    startFn: ForwardToCallback<Dependencies>,
    params: Params,
  ): string {
    const visited = new Set<string>([startName]);

    let current = startFn(this.#deps.getDependency, params);
    let depth = 0;
    const MAX_DEPTH = 100;

    if (typeof current !== "string") {
      throw new TypeError(
        `forwardTo callback must return a string, got ${typeof current}`,
      );
    }

    while (depth < MAX_DEPTH) {
      if (this.#store.matcher.getSegmentsByName(current) === undefined) {
        throw new Error(`Route "${current}" does not exist`);
      }

      if (visited.has(current)) {
        const chain = [...visited, current].join(" → ");

        throw new Error(`Circular forwardTo: ${chain}`);
      }

      visited.add(current);

      if (Object.hasOwn(this.#store.config.forwardFnMap, current)) {
        const fn = this.#store.config.forwardFnMap[
          current
        ] as ForwardToCallback<Dependencies>;

        current = fn(this.#deps.getDependency, params);

        depth++;
        continue;
      }

      const staticForward = this.#store.config.forwardMap[current];

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (staticForward !== undefined) {
        current = staticForward;
        depth++;
        continue;
      }

      return current;
    }

    throw new Error(`forwardTo exceeds maximum depth of ${MAX_DEPTH}`);
  }
}
