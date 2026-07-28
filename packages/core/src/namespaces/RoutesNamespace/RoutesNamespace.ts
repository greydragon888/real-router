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
import { canonicalize, materialize } from "../../pipeline";
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

    // Stage ③ (route defaults under the caller's value, split by the channel the
    // route declares — #1549) plus the mode gate (#1575), one pass through the
    // pipeline (nav-pipeline Phase 2, step 2-1). The LITERAL form: `buildPath`
    // does not follow `forwardTo` (A.5 — `buildPath("src")` stays `/src`, a
    // deliberate asymmetry with `navigate`), so stage ① is skipped and the seam
    // is never entered.
    // ⚠ Skipping the seam also skips its channel separation, and THAT is what
    // retires the v1 single-bag form here: a caller who rode a query key in the
    // `params` bag no longer has it moved to the query channel, and the query
    // string is printed from `canonical.query` alone. Before this step the
    // matcher's `search ?? params` fallback printed it out of the path bag, so
    // `buildPath` disagreed with `navigate` on the same intent — an undeclared
    // key in `loose` (`/t?foo=1` vs `/t`), the `/coll/:id?id` collision
    // (`/items/V?id=V` vs `/items/V`), and a route's arbitrary `defaultParams`
    // (`/s?theme=d` vs `/s`). All three now agree.
    const canonical = canonicalize(this.#deps.port, route, params, search, {
      resolveForward: false,
    });

    // Stage ⑤a stays LOCAL to this method rather than going through `buildURL`,
    // and this is structural, not a preference: `buildURL` prints via
    // `port.buildPath`, which IS the interceptable `ctx.buildPath` wrapping this
    // very method (`Router.ts:322-325`) — routing through it would recurse. The
    // interceptor zone therefore stays exactly where it is (#1231:
    // `persistent-params` injects here), one layer above.
    // The route codec sees BOTH channels — `encodeParams({ params, search })` →
    // `{ params, search }` (§4) — so an encoder can shape the query as well as
    // the path.
    if (typeof this.#store.config.encoders[route] === "function") {
      const encoded = this.#store.config.encoders[route]({
        // Spread so a mutating encoder cannot reach the frozen canonical bag.
        params: { ...canonical.path },
        search: canonical.query,
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
      canonical.path,
      canonical.query,
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

    // Stages ① + ③ + the mode gate, one pass through the pipeline (nav-pipeline
    // Phase 2, step 2-2). `canonicalize` reaches the SAME `forwardState` seam
    // this method used to call directly — `port.resolveForward` is
    // `ctx.forwardState` — so a search-schema interceptor still validates the
    // query on the URL→State path here (the `routeSearch` argument is defined,
    // marking this as a re-parse, not a navigate), and the seam's channel
    // separation still canonicalises the bags. What the pipeline replaces is the
    // hand-rolled composition that followed: the route's own default split
    // (#1549), the default merge, and the mode gate (#1575) now happen once,
    // inside `canonicalize`, from the same read-model `navigate` uses.
    // ⚠ Stage ② does NOT leave this path here, and cannot: `separateChannels`
    // lives in the seam (`Router.ts:281-292`), which the port calls. Measured —
    // a `forwardState` interceptor injecting a declared query key into
    // `result.params` lands in `state.search` both before and after this change,
    // identically to `navigate`, which has been on the pipeline since milestone 1.
    // The channel guard's P2 position therefore stays dormant until Phase 4
    // removes the seam's wrapper; RFC step 2-2's "② leaves the path here" was
    // written before that was measured.
    const canonical = canonicalize(
      this.#deps.port,
      name,
      decoded.params,
      decoded.search,
    );
    const routeName = canonical.name;

    // The canonical channels, ready for BOTH halves of the state: `canonical.path`
    // is path-only (the seam moved any declared `?key` a plugin injection or a
    // decoder left in the params bag over to the query channel, and stage ③
    // layered the route's own defaults under it, split by the channel the route
    // declares — #1549), `canonical.query` is the full canonical query with the
    // mode gate already applied (#1575). Both are read from ONE object, so the
    // rebuilt `state.path` and the committed `state.search` cannot derive from
    // differently-merged bags (INVARIANTS makeState #6).
    const routeParams = canonical.path;
    const forwardedSearch = canonical.query;

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

    // Stage ⑤b. `materialize` over `makeState` because the intent is ALREADY
    // canonical: `makeState` would re-run the default merge (idempotent, but a
    // wasted pass) and would rebuild the path when none is handed to it, which is
    // exactly the work ⑤a above just did. The generic rides through
    // (`matchPath<P>` → `materialize<P>` → `State<P>`), so a consumer's typed
    // params survive the migration.
    return materialize<P>(canonical, { path: builtPath });
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
   *
   * Two arms, `literal || destination` (#1573). The literal arm is the whole
   * predicate below, unchanged. The destination arm repeats THAT SAME predicate
   * on the full output of stage ① — the resolved terminal name together with
   * the forwarding chain's defaults layered into the TARGET's channels — so a
   * `<Link to="alias">` reads active on the page it actually navigates to.
   *
   * It is a FALLBACK, never a pre-resolution: resolving before comparing would
   * send a section link (`users` forwarding to `users.list`) to the leaf and
   * darken it while a sibling descendant (`users.profile`) is active.
   *
   * It repeats the predicate on ①'s OUTPUT rather than substituting the name,
   * because the chain's `defaultParams` live on the forwarding SOURCE and are
   * layered by `forwardState` (#1566/#1570) — never by the forward map — and a
   * dynamic `forwardTo` is not in that map at all. Name substitution therefore
   * fixes neither, and it also carries no `search`, which is where ① routes a
   * hop default whose key the target declares with `?`.
   */
  isActiveRoute(
    name: string,
    params: Params = {},
    searchArg: SearchParams = {},
    strictEquality = false,
    ignoreQueryParams = true,
  ): boolean {
    if (
      this.#matchesActiveState(
        name,
        params,
        searchArg,
        strictEquality,
        ignoreQueryParams,
      )
    ) {
      return true;
    }

    // O(1) gate: only a route that actually forwards can have a second arm.
    // Every `<Link>` in six adapters runs this predicate on every render, so a
    // non-forwarding route must not pay for the arm at all.
    if (
      !Object.hasOwn(this.#store.config.forwardMap, name) &&
      !Object.hasOwn(this.#store.config.forwardFnMap, name)
    ) {
      return false;
    }

    let forwarded;

    try {
      // The NAMESPACE primitive, not the interceptable seam: a predicate on the
      // render path must not run the plugin interceptor chain once per `<Link>`.
      forwarded = this.forwardState(name, params, searchArg);
    } catch (error) {
      // A dynamic `forwardTo` is user code and may throw. A predicate answers,
      // it never throws from inside a render — same policy as `canNavigateTo`
      // on a throwing guard (#959): honest `false` plus an operational log.
      this.#deps.logger.warn(
        "router.isActiveRoute",
        `Dynamic forwardTo of route "${name}" threw while resolving the active-link destination; treating the link as inactive.`,
        error,
      );

      return false;
    }

    // No `forwarded.name === name` guard: the O(1) gate above already proved the
    // route forwards, and a self-returning dynamic callback throws on the cycle
    // check before `forwardState` can hand one back — so the terminal name is
    // always a different route (measured; the branch was unreachable).
    return this.#matchesActiveState(
      forwarded.name,
      forwarded.params,
      forwarded.search,
      strictEquality,
      ignoreQueryParams,
    );
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
   * The literal arm of {@link isActiveRoute} — unchanged by #1573.
   *
   * Safe boundary (#1577): both branches below READ the caller's bags — the
   * exact branch splits them (`separateChannels`), the descendant branch spreads
   * them into one — so an accessor-backed key, a `Proxy` or a framework's
   * reactive object throws HERE, on the render path. The predicate's stated
   * policy is that it answers and never throws from inside a render (see the
   * `forwardState` wrap below), and #1573 implemented that for the destination
   * arm only. One boundary around the whole walk rather than a `try` per read —
   * the same shape `isParams` took for the same class of hostile input (#1052).
   */
  #matchesActiveState(
    name: string,
    params: Params,
    searchArg: SearchParams,
    strictEquality: boolean,
    ignoreQueryParams: boolean,
  ): boolean {
    try {
      return this.#matchesActiveStateUnsafe(
        name,
        params,
        searchArg,
        strictEquality,
        ignoreQueryParams,
      );
    } catch (error) {
      this.#deps.logger.warn(
        "router.isActiveRoute",
        `Reading the arguments for route "${name}" threw while resolving the active-link state; treating the link as inactive.`,
        error,
      );

      return false;
    }
  }

  #matchesActiveStateUnsafe(
    name: string,
    params: Params,
    searchArg: SearchParams,
    strictEquality: boolean,
    ignoreQueryParams: boolean,
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
    let hopSearchDefaults: SearchParams | undefined;

    for (const routeName of chain) {
      // `undefined` is absence on both sides (#1550 / #1551): a source default
      // carrying `undefined` must not ride out of `forwardState` as an own key.
      hopDefaults = mergeDefined(
        this.#store.config.defaultParams[routeName] as Params | undefined,
        hopDefaults,
      );
      // A hop's `defaultSearch` was read by NOBODY until #1549: this fold only
      // took `defaultParams`, so the slot was silently inert on a forwarding
      // node while working on a terminal — the mirror of the terminal's own
      // defect, where `defaultParams` worked on a hop and broke on the route
      // itself. Each slot has to mean the same thing in both positions.
      hopSearchDefaults = mergeDefined(
        this.#store.config.defaultSearch[routeName] as SearchParams | undefined,
        hopSearchDefaults,
      );
    }

    // Split the DEFAULTS ALONE by the target's channels — the caller's bags are
    // never routed here (that is stage ②, which this design removes: channel
    // correctness is the producer's contract, §4.3). Each half is then layered
    // UNDER the caller in its OWN channel, below.
    const split = separateChannels(
      hopDefaults,
      this.getQueryParams(target),
      // Spread last, so a hop's explicit `defaultSearch` outranks the query half
      // of its `defaultParams` — the same precedence the terminal's own defaults
      // get. `EMPTY_SEARCH` keeps the `search` half defined when no hop spelled
      // one, which the withholding loop below relies on.
      hopSearchDefaults ?? EMPTY_SEARCH,
    );

    // A default is never applied to a key the caller already named — in EITHER
    // bag (#1570). Without this the caller's params-twin and the query half of
    // the defaults sit in DIFFERENT channels, where no merge ranks them, and the
    // seam's `separateChannels` (which spreads `search` last) hands the win to
    // the DEFAULT: `navigate("src", { lang: "de" })` on a chain default
    // `{ lang: "fr" }` committed `?lang=fr` and lost the caller's value — the
    // §1.1 priority inversion this whole channel split exists to remove.
    // Nothing is moved between channels: the caller's key stays where the caller
    // put it, we merely decline to default a slot they already filled.
    // `separateChannels` was handed a defined `search` (the frozen empty
    // singleton), so its `search` half is defined too — no guard needed here.
    let chainQuery: SearchParams | undefined = split.search;

    {
      let kept: Record<string, unknown> | undefined;
      let dropped = false;

      for (const [key, value] of Object.entries(chainQuery)) {
        // `undefined` is absence (#1550 / #1551), so a caller's removal marker
        // does NOT count as "already named" — the default keeps the slot.
        if (params[key] !== undefined) {
          dropped = true;
          continue;
        }

        kept ??= {};
        kept[key] = value;
      }

      if (dropped) {
        chainQuery = kept as SearchParams | undefined;
      }
    }

    return {
      name: target,
      // The caller's params stay ABOVE the path half, and their `undefined`
      // keys are stripped exactly as before — this merge runs whether or not
      // the chain contributed anything.
      params: mergeDefined(split.params as P | undefined, params),
      // `mergeDefined`, not a spread: an explicit `undefined` from the caller is
      // ABSENCE (#1550 / #1551), so it must not delete the hop default. A spread
      // copied the `undefined` key over and killed it — asymmetric with a
      // route-level `defaultSearch`, where the rule already held.
      search: mergeDefined(chainQuery, search) as S,
    };
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
