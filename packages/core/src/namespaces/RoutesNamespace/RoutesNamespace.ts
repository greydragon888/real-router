// packages/core/src/namespaces/RoutesNamespace/RoutesNamespace.ts

import { DEFAULT_ROUTE_NAME } from "./constants";
import {
  matchSourceTrailingSlash,
  paramsMatch,
  paramsMatchExcluding,
} from "./helpers";
import {
  createRoutesStore,
  rebuildTreeInPlace,
  resetStore,
} from "./routesStore";
import { constants, EMPTY_SEARCH } from "../../constants";
import { mergeDefined, separateChannels } from "../../helpers";
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
    params: Params,
    search?: SearchParams,
    options?: Options,
  ): string {
    if (route === constants.UNKNOWN_ROUTE) {
      return typeof params.path === "string" ? params.path : "";
    }

    // `undefined` is absence on both sides (#1550 / #1551) — neither an
    // explicitly-undefined caller value nor an undefined-valued default reaches
    // the codec or the matcher as an own key.
    const paramsWithDefault = mergeDefined(
      this.#store.config.defaultParams[route] as Params | undefined,
      params,
    );

    // #1549 (RFC-4 M2): the route's query defaults (`defaultSearch`) join the
    // search channel so they reach the URL query string — including when the
    // caller omits `search` (the navigate path), which keeps `state.path` in
    // step with makeState's `state.search`. An explicitly-passed search value
    // wins over the default. When the route has no `defaultSearch`, an omitted
    // `search` stays `undefined` (single-bag fallback: the matcher extracts any
    // query the caller rode in `paramsWithDefault`).
    const searchWithDefault = this.#mergeDefaultSearch(route, search);

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
    // navigate).
    const forwarded = this.#deps.forwardState<P>(
      name,
      decoded.params as P,
      decoded.search,
    );
    const routeName = forwarded.name;

    // forwardState canonicalizes the channels at ITS boundary (#1548/#1549): the
    // result is already path-only params + the user query — a declared `?key`
    // that a plugin's forwardState injection (persistent-params on `start()`) or
    // a decoder left in the params bag has already moved to the query channel.
    // forwardState does NOT fold in the TARGET route's defaults (that would
    // outrank a user params-twin at separation, #1549), so apply them below the
    // user channel HERE — but only `defaultSearch`. The asymmetry is real, not
    // the forwardState one: query defaults are URL-DEFINING (absent from a
    // minimally-matched URL, they must be printed into the rebuilt query string),
    // whereas path/arbitrary `defaultParams` never need merging for the URL — a
    // path default either arrived in the matched URL or, being arbitrary, is
    // dropped by the matcher — and `state.params` receives them from makeState
    // downstream regardless (verified: merging defaultParams here is an
    // equivalent no-op). `state.path` and `state.search` still can't diverge:
    // makeState re-applies the same `defaultSearch` idempotently.
    const routeParams = forwarded.params;
    const forwardedSearch = this.#mergeDefaultSearch(
      routeName,
      forwarded.search,
    );

    let builtPath = path;

    if (opts.rewritePathOnMatch) {
      // Two-channel encode for the URL rebuild (RFC-4 M2 / #1548, §4): path slots
      // from `routeParams` (canonical, path-only), the query string from
      // `forwardedSearch` (the full canonical query) — never the raw matched
      // query — so the rebuilt `state.path` stays in step with `state.search`.
      const encoded =
        typeof this.#store.config.encoders[routeName] === "function"
          ? this.#store.config.encoders[routeName]({
              params: routeParams,
              search: forwardedSearch,
            })
          : { params: routeParams, search: forwardedSearch };

      const ts = opts.trailingSlash;

      try {
        // Explicit two-channel build (RFC-4 M2 / #1548): path slots from
        // `encoded.params`, the query string from `encoded.search`. The channels
        // stay separate, so a `/coll/:id?id` collision keeps its path slot and
        // query twin independent — no single-bag reunification, no
        // search-wins-for-declared-query fixup.
        builtPath = this.#store.matcher.buildPath(
          routeName,
          encoded.params,
          encoded.search,
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

    // `routeParams` / `forwardedSearch` are already canonical (forwardState
    // boundary), so `state.path` (the rebuild) and `state.search` (makeState)
    // derive from the SAME separated bags by construction. makeState only merges
    // route defaults idempotently — it no longer re-splits.
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
    // TARGET-route defaults are NOT applied here for EITHER channel — they are
    // merged strictly BELOW the user channels at the terminal points only
    // (`makeState` for state, `matchPath` / `buildPath` for the URL). Folding a
    // target default into this result would ride ABOVE a user params-twin at the
    // channel-separation boundary (the interceptable's outer `separateChannels`
    // merges the params-twin UNDER `result.search`), inverting the priority — a
    // `navigate(x, { page: 2 })` on a `?page` route with `defaultSearch{page:1}`
    // would wrongly commit `page=1`. So both channels pass through as the user
    // gave them: `search` stays `resolvedSearch`, `params` stays the raw bag.
    //
    // The ONE default forwardState still merges is the forwardTo CHAIN's own
    // defaults (`#layerChainDefaults` in the forward branches): when `a` forwards
    // to `b`, `a`'s `defaultParams` fill in before the redirect and flow to `b`.
    // This canNOT move to a terminal point — `makeState`/`buildPath` see only the
    // RESOLVED target `b` and cannot reconstruct source `a`'s defaults. A hop can
    // only SPELL such a default in `defaultParams` (its single slot), but the
    // CHANNEL is the target's: a key the target declares with `?` is layered
    // under `search`, everything else under `params` (#1570). Frozen empty search
    // singleton when absent.
    const resolvedSearch = (search ?? EMPTY_SEARCH) as S;

    if (Object.hasOwn(this.#store.config.forwardFnMap, name)) {
      const dynamicForward = this.#store.config.forwardFnMap[name];
      const { target, chain } = this.#resolveDynamicForward(
        name,
        dynamicForward,
        params,
      );

      return this.#layerChainDefaults(target, chain, params, resolvedSearch);
    }

    const staticForward = this.#store.resolvedForwardMap[name] ?? name;

    if (
      staticForward !== name &&
      Object.hasOwn(this.#store.config.forwardFnMap, staticForward)
    ) {
      const targetDynamicForward =
        this.#store.config.forwardFnMap[staticForward];
      const { target, chain } = this.#resolveDynamicForward(
        staticForward,
        targetDynamicForward,
        params,
      );

      // The static prefix stops AT `staticForward` (it has no static forward of
      // its own), and the dynamic walk starts THERE — so the two halves
      // concatenate without repeating a hop.
      return this.#layerChainDefaults(
        target,
        [...this.#collectStaticChain(name), ...chain],
        params,
        resolvedSearch,
      );
    }

    if (staticForward !== name) {
      return this.#layerChainDefaults(
        staticForward,
        this.#collectStaticChain(name),
        params,
        resolvedSearch,
      );
    }

    return {
      name,
      params,
      search: resolvedSearch,
    };
  }

  /**
   * Builds a RouteTreeState from already-resolved route name and params.
   * Called by getPluginApi().buildNavigationState after the interceptable
   * forwardState resolved the target — so plugins can intercept forwardState.
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
      // forwardState already separated the channels upstream (#1548/#1549), so
      // `resolvedParams` is path-only; this RouteTreeState carries the path
      // channel only — the query is threaded separately by the caller (makeState).
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
      // Build the canonical target the same way navigate / canNavigateTo do:
      // separate the caller bag into channels by this route's `?`-declaration
      // (a declared query key handed in `params` moves to search, explicit
      // `searchArg` winning the collision), then hand the CLEAN channels to
      // makeState — which merges defaults but no longer re-splits (#1548/#1549).
      // So the comparison target can never drift from how the committed state was
      // built. Path "" skips the URL build (areStatesEqual compares channels).
      const { params: targetParams, search: targetSearch } = separateChannels(
        params,
        this.getQueryParams(name),
        searchArg,
      );
      const targetState = this.#deps.makeState(
        name,
        targetParams,
        targetSearch,
        "",
      );

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
    // Recombine each state's two channels into a single bag for the subset
    // match: the explicit query `searchArg` wins over any query key still riding
    // in `params` (a v1 single-bag call) — RFC-4 M2 / #1548.
    const activeParams = {
      ...activeState.params,
      ...activeState.search,
    } as Params;

    const combinedTarget = { ...params, ...searchArg } as Params;

    if (!paramsMatch(combinedTarget, activeParams)) {
      return false;
    }

    // Enforce the route's defaults against the active descendant, excluding any
    // key the caller supplied explicitly. Path defaults (`defaultParams`) always
    // count; query defaults (`defaultSearch`) count only when `ignoreQueryParams`
    // is false — a query-only default must not disqualify an ancestor link when
    // query is ignored (RFC-4 M2 / #1548).
    if (
      defaultParams &&
      !paramsMatchExcluding(defaultParams, activeParams, combinedTarget)
    ) {
      return false;
    }

    if (!ignoreQueryParams) {
      const defaultSearch = this.#store.config.defaultSearch[name] as
        Params | undefined;

      if (
        defaultSearch &&
        !paramsMatchExcluding(defaultSearch, activeParams, combinedTarget)
      ) {
        return false;
      }
    }

    return true;
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
   *
   * Reads the matcher's `declaredQueryParams` — the SAME registry the
   * query-string build uses — rather than walking `matchSegments` (#1556). The
   * segment walk missed the ROOT node's `?`-declarations (`setRootPath("?a&b")`,
   * how persistent-params declares its keys), because the root is captured
   * separately at `registerTree` and never appears in `matchSegments`. That
   * made a root-declared key print as query but classify as a path param: it
   * landed in `state.params`, vanished from `state.path` on the intent side,
   * and no `isActiveRoute` spelling matched a link to the active page. One
   * registry classifies and prints, so the two cannot drift again.
   */
  getQueryParams(name: string): string[] {
    const cached = this.#store.queryParamsCache.get(name);

    // Stryker disable next-line BlockStatement: equivalent — cache short-circuit; emptying the early-return recomputes the identical value (getQueryParams is deterministic per route name) and re-caches it. (ConditionalExpression stays live: `→true` returns undefined on a cache miss = killed.)
    if (cached !== undefined) {
      return cached;
    }

    const declared = this.#store.matcher.getDeclaredQueryParams(name);
    let result: string[] = [];

    if (declared) {
      const urlParams = this.getUrlParams(name);

      result = declared.filter((param) => !urlParams.includes(param));
    }

    this.#store.queryParamsCache.set(name, result);

    return result;
  }

  getStore(): RoutesStore<Dependencies> {
    return this.#store;
  }

  /**
   * Every node on a `forwardTo` chain that FORWARDS, in walk order — the
   * terminal is excluded (its own defaults belong to the state builder, #1549).
   * `forwardMap` is proven acyclic at registration (`refreshForwardMap` runs
   * `resolveForwardChain`, which throws on a cycle), so the walk terminates.
   */
  #collectStaticChain(name: string): string[] {
    const chain: string[] = [];
    let current = name;

    while (Object.hasOwn(this.#store.config.forwardMap, current)) {
      chain.push(current);
      current = this.#store.config.forwardMap[current];
    }

    return chain;
  }

  /**
   * Layers the defaults of every forwarding hop UNDER the caller's channels.
   * Folding in walk order makes an EARLIER hop win over a later one (each merge
   * puts the next hop's defaults below what is already accumulated), and the
   * caller wins over all of them. Only the entered route was consulted before,
   * so a default declared on an intermediate hop never reached the target and
   * a required slot was left empty (#1566).
   *
   * The hops are folded ALONE, then split by the TARGET's declaration (#1570).
   * A hop can only write `defaultParams` — that is the single slot it has — but
   * the CHANNEL belongs to the resolved target: when the target declares the key
   * with `?`, the value is a query value that happened to be spelled in a path
   * slot upstream. Splitting here rather than downstream keeps stage ① itself
   * channel-correct, so the producer contract holds for core's own output and
   * not merely for plugins (RFC nav-pipeline §4.2, decision A-3).
   *
   * The split reuses `separateChannels` over `getQueryParams` — the same
   * classifier and the same printing registry the URL build uses (#1556) — so
   * no second derivation of "which channel is this key" can drift from it.
   */
  #layerChainDefaults<
    P extends Params = Params,
    S extends SearchParams = SearchParams,
  >(
    target: string,
    chain: readonly string[],
    params: P,
    search: S,
  ): { name: string; params: P; search: S } {
    let hopDefaults: Params | undefined;

    for (const routeName of chain) {
      // `undefined` is absence on both sides (#1550 / #1551): a source default
      // carrying `undefined` must not ride out of `forwardState` as an own key.
      hopDefaults = mergeDefined(
        this.#store.config.defaultParams[routeName] as Params | undefined,
        hopDefaults,
      );
    }

    // The caller's `search` is spread last inside `separateChannels`, so an
    // explicit query value still beats the hop default it collides with.
    const split = separateChannels(
      hopDefaults,
      this.getQueryParams(target),
      search,
    );

    return {
      name: target,
      // The caller's params stay ABOVE the path half, and their `undefined`
      // keys are stripped exactly as before — this merge runs whether or not
      // the chain contributed anything.
      params: mergeDefined(split.params as P | undefined, params),
      search: split.search as S,
    };
  }

  /**
   * Merges a route's query-channel defaults (`defaultSearch`) into a search bag
   * — the search-channel twin of {@link #mergeChainDefaults} (RFC-4 M2 / #1548).
   * An explicitly-passed search value wins over the default (spread order).
   * Returns the input untouched (no allocation, including `undefined`) when the
   * route declares no `defaultSearch`, so a route without query defaults keeps
   * the caller's `undefined` and the matcher's single-bag fallback.
   */
  #mergeDefaultSearch<S extends SearchParams = SearchParams>(
    routeName: string,
    search: S,
  ): S;
  #mergeDefaultSearch<S extends SearchParams = SearchParams>(
    routeName: string,
    search: S | undefined,
  ): S | undefined;
  #mergeDefaultSearch<S extends SearchParams = SearchParams>(
    routeName: string,
    search: S | undefined,
  ): S | undefined {
    // `undefined` is absence on both sides (#1550 / #1551), and `undefined` in ⇒
    // `undefined` out with no default, which keeps the matcher's single-bag
    // fallback (`search ?? params`) reachable for a v1 caller.
    return mergeDefined(
      this.#store.config.defaultSearch[routeName] as S | undefined,
      search,
    );
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
  ): { target: string; chain: string[] } {
    const visited = new Set<string>([startName]);
    // Every node that forwards, in walk order — `startName` does by definition.
    // The terminal is never pushed, so the caller can layer hop defaults without
    // pulling in the target's (#1566/#1549).
    const chain: string[] = [startName];

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
        const cycle = [...visited, current].join(" → ");

        throw new Error(`Circular forwardTo: ${cycle}`);
      }

      visited.add(current);

      if (Object.hasOwn(this.#store.config.forwardFnMap, current)) {
        const fn = this.#store.config.forwardFnMap[
          current
        ] as ForwardToCallback<Dependencies>;

        chain.push(current);
        current = fn(this.#deps.getDependency, params);

        depth++;
        continue;
      }

      const staticForward = this.#store.config.forwardMap[current];

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (staticForward !== undefined) {
        chain.push(current);
        current = staticForward;
        depth++;
        continue;
      }

      return { target: current, chain };
    }

    throw new Error(`forwardTo exceeds maximum depth of ${MAX_DEPTH}`);
  }
}
