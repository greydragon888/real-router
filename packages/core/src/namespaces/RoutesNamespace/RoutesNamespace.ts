// packages/core/src/namespaces/RoutesNamespace/RoutesNamespace.ts

import { DEFAULT_ROUTE_NAME } from "./constants";
import {
  matchSourceTrailingSlash,
  paramsMatch,
  queryParamsOf,
  urlParamsOf,
} from "./helpers";
import { createRoutesStore, applyRootPath, resetStore } from "./routesStore";
import {
  assertChannelCorrect,
  assertShippedChannelCorrect,
} from "../../channels";
import { constants, EMPTY_PARAMS, EMPTY_SEARCH } from "../../constants";
import { mergeDefined, withoutUnsafeKey } from "../../helpers";
import { buildURL, canonicalize, materialize } from "../../pipeline";
import { getTransitionPath } from "../../transitionPath";

import type { RoutesStore } from "./routesStore";
import type { RoutesDependencies } from "./types";
import type {
  CreateMatcherOptions,
  RouteParams,
  RouteTreeState,
} from "../../engine";
import type { RouteResolver } from "../../pipeline";
import type { RouteMetaLookup } from "../../transitionPath";
import type {
  DefaultDependencies,
  ForwardToCallback,
  AnyOptions,
  Params,
  RouterLogger,
  SearchParams,
  State,
  Route,
} from "../../types";
import type { RouteLifecycleNamespace } from "../RouteLifecycleNamespace";

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
  #cachedOptionsSource: AnyOptions | undefined;

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
    applyRootPath(this.#store, newRootPath);
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
    options?: AnyOptions,
  ): string {
    if (route === constants.UNKNOWN_ROUTE) {
      return typeof params.path === "string" ? params.path : "";
    }

    const query = search ?? EMPTY_SEARCH;

    // The route codec sees BOTH channels — `encodeParams({ params, search })` →
    // `{ params, search }` (§4) — so an encoder can shape the query as well as
    // the path.
    // ⚑ BOUND ONCE, and the two lines are the whole of #1889. `route` is the
    // caller's own argument, used here as a PROPERTY KEY, so `typeof …[route]`
    // and `…[route](…)` were two `ToPropertyKey` calls into application code
    // with a gap between them. Three failure modes, all measured on bare core:
    //
    //   • the route's `encodeParams` RAN before a refusal that was already
    //     guaranteed — the caller's own function, invoked for work whose result
    //     nobody can observe (5 coercions where a string caller has 0);
    //   • a DRIFTING name type-checked one route's encoder and invoked
    //     another's — reads `C,C,C,A` tested C and ran A;
    //   • a drift landing on a route with NO encoder threw the raw
    //     `this[#store].config.encoders[route] is not a function`, leaking a
    //     mangled private-field expression to the caller. The single bind closes
    //     that one too, without a line of its own.
    //
    // ⚠ One divergence of two survives and this does NOT claim otherwise: a
    // drift can still split the ENCODER read from the MATCHER read below, so
    // `C,C,C,A` runs C's encoder and builds for A. Closing that is the terminal
    // question #1883 owns.
    const encoder = this.#store.config.encoders[route];

    if (typeof encoder === "function") {
      const encoded = encoder({
        // BOTH channels spread, and the symmetry is the point: the channels
        // arrive frozen from the merge, so handing one through verbatim turns a
        // codec that edits its argument in place — legal before this entry point
        // joined the pipeline, and still legal for `params` — into a silent no-op
        // (sloppy mode) or a `TypeError` (ESM). Copying `params` alone left the
        // two halves of one documented hook behaving differently.
        params: { ...params },
        search: { ...query },
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
      params,
      query,
      this.#getBuildPathOptions(options),
    );
  }

  /**
   * The INTENT form of ⑤a: canonicalise, then print.
   *
   * ⚠ The merge lives HERE and no longer inside `buildPath` above, and that is
   * what closes #1847. `buildPath` is wired behind `ctx.buildPath`, which the
   * port documents as the "stage ⑤a executor — builds the URL from
   * ALREADY-MERGED channels". Two callers reach it: this one, and `buildURL` on
   * the navigate path, which hands it a `Canonical`. The executor merged again
   * regardless, so a navigation ran `canonicalize` TWICE and each pass read the
   * route's own `defaultSearch` / `defaultParams` independently — the object is
   * held by reference and read on every navigation by design, so an
   * accessor-backed one could answer differently between the two.
   *
   * Both faces of #1847 followed from that, and neither is within a pass:
   *
   * - `state.search` contradicting its own `state.path` — pass 1 built the
   *   channel, pass 2 printed the URL, and a default that turned defined
   *   between them printed a key the state does not carry;
   * - `buildPath` disagreeing with `navigate` on one intent — the INVARIANTS
   *   row "href equals destination" (#1578) — because the two doors shipped
   *   different reads of the same default.
   *
   * One merge per call is therefore the fix, not a smaller read count: a
   * per-pass snapshot leaves both faces standing (measured), and snapshotting at
   * registration is refused by the config contract, which states that nested
   * config aliases the live store and is read on every navigation.
   *
   * The LITERAL form: `buildPath` does not follow `forwardTo` (A.5 —
   * `buildPath("src")` stays `/src`, a deliberate asymmetry with `navigate`), so
   * stage ① is skipped and the seam is never entered.
   *
   * ⚑ Interceptors still run, and still exactly once — `buildURL` prints through
   * `port.buildPath`, which IS `ctx.buildPath` (#1231: `persistent-params`
   * injects there). What changed is what they SEE on a standalone
   * `router.buildPath`: canonical channels rather than the caller's raw bags,
   * i.e. the same thing the navigate path has always handed them.
   *
   * ⚑ It is a TRADE, and the halves point opposite ways. Measured against
   * `origin/master`, alternating processes, medians of 9 rounds × 150k ops, with
   * both floors taken (A/A ≤ 2 %, B/B up to 10 % — so the first row is at the
   * floor and its magnitude is not established, only its direction, which held
   * in both runs of each side):
   *
   *     buildPath, no defaults              156 vs 146 ns    +7 %
   *     buildPath, with defaultSearch       620 vs 567 ns    +9 %
   *     buildNavigationState, no defaults   397 vs 514 ns   −23 %
   *     buildNavigationState, defaultSearch 687 vs 1088 ns  −37 %
   *
   * This door pays one extra hop (through `buildURL` → `port.buildPath` → the
   * interceptable wrapper) plus the copy `withholdFilledSlots` now always
   * returns; the state-producing doors stop running `canonicalize` a second
   * time. Both are the same edit seen from two sides, and the side that got
   * cheaper is the one every navigation takes.
   */
  buildPathFromIntent(
    route: string,
    rawParams?: Params,
    search?: SearchParams,
  ): string {
    // Same defaulting the interceptable wrapper applies, kept here because this
    // door is now the one that reaches the executor.
    const params = rawParams ?? EMPTY_PARAMS;

    if (route === constants.UNKNOWN_ROUTE) {
      // Nothing to canonicalise — the URL is the payload, not an intent. The
      // executor owns that branch; going through the port keeps the interceptor
      // zone identical for it.
      return this.#deps.port.buildPath(route, params, search ?? EMPTY_SEARCH);
    }

    return buildURL(
      canonicalize(this.#deps.port, route, params, search, {
        resolveForward: false,
      }),
      this.#deps.port,
    );
  }

  /**
   * Matches a URL path to a route in the tree.
   * Note: Argument validation is done by facade (Router.ts) via validateMatchPathArgs.
   */
  matchPath<P extends Params = Params>(
    path: string,
    options?: AnyOptions,
  ): State<P> | undefined {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Router.ts always passes options
    const opts = options!;

    const matchResult = this.#store.matcher.match(path);

    if (!matchResult) {
      return undefined;
    }

    const routeState = createRouteState(matchResult);
    const { name } = routeState;

    // ⚑ `withoutUnsafeKey` BEFORE the decoder, not after it, and on BOTH
    // channels (#1904). Everything below this line — the route's own
    // `decodeParams`, and the `forwardState` seam `canonicalize` reaches — is
    // application code, while these bags are ones core BUILT by parsing the URL.
    // The published channels drop the key anyway, much further down; the door is
    // here, where core stops owning the container.
    //
    // ⚠ `params` is NOT redundant beside `search`, and the first revision of this
    // fix omitted it on exactly that assumption. A route may declare a path SLOT
    // named `__proto__` (`/q/:__proto__` — registration accepts it), and measured
    // there, the decoder received `params` with own keys `["__proto__"]` while
    // the committed state had `[]`. The probe that "showed params clean" used a
    // fixture with no such slot, so it never built the shape it claimed to clear.
    const params = withoutUnsafeKey(routeState.params);
    // The matcher always carries a search bag (a frozen `{}` when empty) but types
    // its values as `unknown`; narrow it to the query channel once here so the
    // codec / forwardState / rebuild uses it without per-site casts.
    const search = withoutUnsafeKey(routeState.search as SearchParams);

    // Two-channel decode (RFC-4 M2 / #1548, §4): the route codec sees BOTH the
    // path params AND the parsed query — `decodeParams({ params, search })` →
    // `{ params, search }` — restoring v1's reach (v1 ran the whole path+query bag
    // through the decoder). Runs here, inside match, BEFORE any search-schema
    // plugin validation (the v1 order: engine codec → plugin). With no decoder the
    // channels pass through untouched.
    const decoder = this.#store.config.decoders[name];
    let decoded: { params: Params; search: SearchParams };

    if (typeof decoder === "function") {
      decoded = decoder({ params, search });

      // The ONE boundary on this path where a value core is about to build a
      // state from came out of USER code (#1582). The matcher's own output above
      // needs no check — it is router-produced and plain by construction — but a
      // decoder may hand back anything: an array becomes `params {"0":"a"}`, a
      // string becomes `{"0":"o","1":"o",…}`, a `Map` or a prototyped object
      // becomes `{}`, and every one of those commits silently. Opt-in, like every
      // DX check: `null` in bare core, where the behaviour is unchanged either
      // way. Labelled for THIS entry point — the pre-pipeline call sat inside a
      // `forwardState` dep wrapper and blamed that method for a `matchPath` fault.
      this.#deps
        .getValidator()
        ?.routes.validateStateBuilderArgs(name, decoded.params, "matchPath");

      // The channel half of the same boundary — always on, unlike the shape
      // check above. A decoder that moves a declared `?key` into the params bag
      // used to be repaired by the seam and shipped as if it had been written
      // correctly; now it is refused. Checked HERE as well as at the seam so the
      // message names the decoder rather than the chain it later flows through —
      // same single assertion, applied where the fault was actually authored.
      assertChannelCorrect(
        "matchPath",
        name,
        decoded.params,
        this.getQueryParams(name),
        "the `params` returned by this route's `decodeParams`",
      );
    } else {
      decoded = { params, search };
    }

    // Stages ① + ③ + the mode gate, one pass through the pipeline (nav-pipeline
    // Phase 2, step 2-2). `canonicalize` reaches the SAME `forwardState` seam
    // this method used to call directly — `port.resolveForward` is
    // `ctx.forwardState` — so a search-schema interceptor still validates the
    // query on the URL→State path here (the `routeSearch` argument is defined,
    // marking this as a re-parse, not a navigate), and the seam still checks the
    // channels on the way through. What the pipeline replaces is the
    // hand-rolled composition that followed: the route's own default split
    // (#1549), the default merge, and the mode gate (#1575) now happen once,
    // inside `canonicalize`, from the same read-model `navigate` uses.
    // ⚠ Stage ② is GONE from this path, as it is from every other: the seam no
    // longer repairs a mis-channelled bag, it refuses one. A `forwardState`
    // interceptor injecting a declared query key into `result.params` used to
    // land in `state.search` here exactly as on `navigate`; both now throw.
    const canonical = canonicalize(
      this.#deps.port,
      name,
      decoded.params,
      decoded.search,
    );
    const routeName = canonical.name;

    // The canonical channels, ready for BOTH halves of the state: `canonical.path`
    // is path-only (the seam REFUSED any declared `?key` a plugin injection or a
    // decoder left in the params bag, and stage ③ layered the route's own
    // defaults under it, each slot in its own channel — #1549),
    // `canonical.query` is the full canonical query with the mode gate already
    // applied (#1575). Both are read from ONE object, so the
    // rebuilt `state.path` and the committed `state.search` cannot derive from
    // differently-merged bags (INVARIANTS makeState #6).
    assertShippedChannelCorrect(
      "matchPath",
      canonical.name,
      canonical.path,
      this.getQueryParams(canonical.name),
    );

    const routeParams = canonical.path;
    const forwardedSearch = canonical.query;

    let builtPath = path;

    if (opts.rewritePathOnMatch) {
      // Two-channel encode for the URL rebuild (RFC-4 M2 / #1548, §4): path slots
      // from `routeParams` (canonical, path-only), the query string from
      // `forwardedSearch` (the full canonical query) — never the raw matched
      // query — so the rebuilt `state.path` stays in step with `state.search`.
      // ⚑ The TWIN of the bind above (#1889). `routeName` is `canonical.name`,
      // which a plugin's `forwardState` interceptor may hand back as a
      // non-string, and every use of it coerces again — the local holds the
      // OBJECT, not a name.
      //
      // ⚠ What this bind closes here is the `typeof`/invoke pair, and NOT the
      // divergence that matters most at this site. Measured by sweeping the read
      // index (flip the answer after read N, N = 0…7): before the bind, flips 4
      // and 5 published a State named for one route and BUILT WITH ANOTHER
      // ROUTE'S ENCODER; after it, flips 3 and 4 still do. The window moved by
      // one read and did not close, because the surviving split is between the
      // ENCODER read and the read that produces the published `state.name` —
      // a different pair, and the criterion's "an object whose own fields
      // disagree" rather than a refusal on the way out.
      //
      // That residue is the terminal question #1883 owns, at a second door: this
      // one publishes a State whose `name` IS the interceptor's object. Recorded
      // here so the next reader does not take the bind for a closure it is not.
      const encoder = this.#store.config.encoders[routeName];
      const encoded =
        typeof encoder === "function"
          ? encoder({
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
   * Applies `forwardTo` and returns the resolved name with the CHAIN's defaults
   * layered under the caller's channels.
   *
   * Order, per channel: every forwarding HOP's defaults (the earliest hop wins),
   * then the caller's value on top. The TARGET route's own defaults are
   * deliberately NOT part of it — the body says why they cannot be, and the
   * summary used to list them as step 3 while the very next comment denied it.
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
    // merged strictly BELOW the user channels at the pipeline's single terminal
    // (`canonicalize`, reached alike by `makeState`, `matchPath` and
    // `buildPath`). Folding a
    // target default into this result would ride ABOVE a user params-twin at the
    // terminal merge, inverting the priority — a
    // `navigate(x, { page: 2 })` on a `?page` route with `defaultSearch{page:1}`
    // would wrongly commit `page=1`. So both channels pass through as the user
    // gave them: `search` stays `resolvedSearch`, `params` stays the raw bag.
    //
    // The ONE default forwardState still merges is the forwardTo CHAIN's own
    // defaults (`#layerChainDefaults` in the forward branches): when `a` forwards
    // to `b`, `a`'s `defaultParams` fill in before the redirect and flow to `b`.
    // This canNOT move to the terminal — `canonicalize` sees only the RESOLVED
    // target `b` and cannot reconstruct source `a`'s defaults. Each of a hop's
    // slots keeps its own channel (`defaultParams` the path, `defaultSearch` the
    // query) whatever the target declares; `ba0f6b18b` retired #1570's routing by
    // the target's declaration, and a hop default naming a key the TARGET
    // declares with `?` is refused at the seam instead. Frozen empty search
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
   * Builds a RouteTreeState from an already-resolved route name and params.
   *
   * ⚠ Its ONE caller — `getPluginApi().buildNavigationState` — uses it as an
   * EXISTENCE probe and discards the object (`if (!ctx.buildStateResolved(…))
   * return;`). Since Phase 2 that entry point materialises its state from the
   * `Canonical`, so what this returns is built and dropped; what the caller
   * needs is the `undefined` arm, placed BEFORE `buildURL` because the matcher
   * throws on an unknown route while that entry point must answer `undefined`.
   * Whether this should therefore collapse into a `hasRoute`-shaped predicate is
   * an open question, not a settled design — the same dead-surface shape
   * coverage surfaced for `skipFreeze` in Phase 4.
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
      // `resolvedParams` is path-only by the PRODUCER's contract, not by a repair
      // upstream: the seam refuses a declared `?key` in the params bag rather
      // than moving one out (stage ② is gone — `ba0f6b18b`). The `search: {}`
      // placeholder threads nowhere; the caller discards this object.
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
   * the forwarding chain's defaults, each hop's slot in its own channel — so a
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
   * fixes neither, and it also carries no `search`, which is the channel a hop's
   * own `defaultSearch` lands in.
   */
  isActiveRoute(
    name: string,
    // Singletons, not fresh literals (#1589). `= {}` minted TWO throwaway objects
    // on every call — i.e. on every `<Link>` on every re-render across six
    // adapters — and the `search` one was worse than an allocation: being a fresh
    // `{}` it is neither `undefined` nor `EMPTY_SEARCH`, so it defeated
    // `canonicalize`'s own empty-query fast path and this predicate ran the full
    // merge + mode-gate tail every time. Measured: the flame graph showed
    // `withholdFilledSlots` and the drop-sink getter live under a route with
    // nothing to withhold and nothing to drop.
    params: Params = EMPTY_PARAMS,
    searchArg: SearchParams = EMPTY_SEARCH,
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
    //
    // TREE-WIDE first, per-route second (#1595). The two maps below are
    // `Object.create(null)` dictionaries — V8 keeps those in dictionary mode
    // whatever their size, empty ones included — and the pair of lookups measured
    // ~14 ns, i.e. 1.75x this predicate's pre-pipeline cost on the shape that
    // reaches here: an INACTIVE link, which is most links on a page. The cost is
    // not the `Object.hasOwn` form (replacing it with a plain property read
    // measured identical) but touching the dictionaries at all, so the fix is to
    // not touch them when no route in the tree forwards. `hasAnyForward` is
    // maintained beside `resolvedForwardMap`, never separately.
    if (
      !this.#store.hasAnyForward ||
      (!Object.hasOwn(this.#store.config.forwardMap, name) &&
        !Object.hasOwn(this.#store.config.forwardFnMap, name))
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
    return urlParamsOf(this.#store, name);
  }

  /**
   * Declared query param names of a route (`?a&b` across its segments,
   * ancestors included) that are NOT also path params — the query-channel twin
   * of {@link getUrlParams}. THE registry (#1556): the always-on channel guard,
   * the literal form's default withholding and the mode gate all classify
   * through it, and the URL build prints from it. (It powered the `defaultParams`
   * channel ROUTING too, until `ba0f6b18b` retired that — the slot is the channel
   * now, so nothing is routed anywhere.) A colliding name (`/items/:id?id` —
   * legal under M2, the channels
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
    return queryParamsOf(this.#store, name);
  }

  getStore(): RoutesStore<Dependencies> {
    return this.#store;
  }

  /**
   * The pipeline's read-model, for entry points that live on the FACADE rather
   * than in a namespace (`canNavigateTo`). The port is created during wiring,
   * after `registerInternals` has already run, so the facade cannot hold it —
   * it reaches it through the namespace that does, exactly as the resolver
   * itself reaches the store through {@link getStore}.
   */
  getPort(): RouteResolver {
    return this.#deps.port;
  }

  /**
   * The literal arm of {@link isActiveRoute} — unchanged by #1573.
   *
   * Safe boundary (#1577): both branches below READ the caller's bags — since
   * nav-pipeline Phase 2 step 2-5 through `canonicalize` in its literal form,
   * which walks `params` key by key, and then again in the descendant branch's
   * channel-by-channel `paramsMatch` — so an accessor-backed key, a `Proxy` or a
   * framework's reactive object throws HERE, on the render path. (It used to be
   * the exact branch's own channel split and the descendant branch's spread into
   * one bag; step 2-5 removed both, the exposure is unchanged.) The predicate's
   * stated policy is that it answers and never throws from inside a render (see
   * the `forwardState` wrap below), and #1573 implemented that for the
   * destination arm only. One boundary around the whole walk rather than a
   * `try` per read —
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

    // The comparison target, built by the SAME pipeline every producer uses
    // (nav-pipeline Phase 2, step 2-5) — in the LITERAL form: this predicate asks
    // about the route it was NAMED. `forwardTo` is resolved by the caller's
    // second arm (`isActiveRoute`), through the NON-interceptable namespace
    // primitive, and `{ resolveForward: false }` is what keeps it that way here:
    // the literal form never touches the port, so a plugin's interceptor chain
    // does not run once per `<Link>` per render.
    //
    // ⚠ Stage ② is gone from this point, and by now from everywhere: step 2-5
    // dropped this method's OWN channel split, and the seam that the other
    // points reach through the port stopped repairing bags too. The observable
    // change here is unchanged by that: a declared query key handed in the
    // `params` bag is no longer moved to the query channel before comparison,
    // so a v1 single-bag call stops matching. Channel-correctness is the
    // caller's contract, exactly as for `navigate` (which throws on that shape)
    // and `buildPath` (which prints without it).
    const canonical = canonicalize(this.#deps.port, name, params, searchArg, {
      resolveForward: false,
    });

    // Exact match case. Path "" skips the URL build — `areStatesEqual` compares
    // channels and never reads the URL, which is also why `materialize` needs no
    // port argument here (the fork milestone 1 left open, settled in step 2-3).
    if (strictEquality || activeName === name) {
      // `skipFreeze` (#1589): the state exists for the length of one comparison.
      // `areStatesEqual` reads `.name` / `.params` / `.search` and nothing else,
      // so freezing it — and attaching the `transition` the freeze implies —
      // buys a guarantee no one can observe. The CHANNELS are still frozen;
      // that happens in `canonicalize`, and it is the part that matters
      // (canonicalize invariant #4). Measured at 926 µs, ~5 % of this benchmark.
      return this.#deps.areStatesEqual(
        materialize(canonical, { path: "", skipFreeze: true }),
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

    // Hierarchical check: activeState is a descendant of target (name). Compared
    // CHANNEL BY CHANNEL (step 2-5) instead of over one recombined bag: the
    // canonical target already carries the route's defaults, each merged under
    // the caller's value in the channel its own SLOT names (#1549), so the
    // separate `paramsMatchExcluding` passes over `defaultParams` /
    // `defaultSearch` are no longer needed — a default that survived into
    // `canonical` is exactly a default the caller did not override.
    if (!paramsMatch(canonical.path, activeState.params)) {
      return false;
    }

    // The query channel obeys `ignoreQueryParams`, the same flag the exact arm
    // hands to `areStatesEqual`. The recombined-bag form could not: it folded
    // query into the path bag before matching, so an ancestor link compared its
    // query even when the caller asked to ignore it — the two arms disagreed
    // about the flag.
    if (
      !ignoreQueryParams &&
      !paramsMatch(canonical.query as Params, activeState.search as Params)
    ) {
      return false;
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
   * Each slot IS its channel: a hop's `defaultParams` is the path channel and
   * its `defaultSearch` the query channel, whatever the resolved target
   * declares. A hop's `defaultParams` naming a key the TARGET declares with `?`
   * is refused at the `forwardState` seam, where the target is finally known.
   *
   * (#1570 routed this fold by the target's declaration for one release;
   * `ba0f6b18b` retired that with the rest of stage ②. The body below records
   * why — it is not repeated here, and the retired rule is not restated in the
   * present tense above it.)
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

    // Each slot IS its channel — no split, here or anywhere else. A hop's
    // `defaultParams` is the path channel and its `defaultSearch` the query
    // channel, whatever the resolved target declares.
    //
    // This used to route the fold by the TARGET's declaration, on the argument
    // that a hop "can only spell a default in `defaultParams`". That argument
    // was already false — the fold reads `defaultSearch` two lines above — and
    // the routing was doing real damage: a hop author could not tell which
    // channel their own config would end up in without reading a target that a
    // `forwardTo` CALLBACK may not even determine until navigation time. Now
    // they can: the slot they wrote is the channel they get.
    //
    // A hop whose `defaultParams` names a key the TARGET declares with `?` is
    // still caught — not here, but at the `forwardState` seam, where the target
    // is finally known and the check can name both routes. Registration cannot
    // see it (a dynamic `forwardTo` has no target yet), which is exactly why
    // that check lives at resolution rather than being guessed here.
    // No cross-channel withholding any more, and its removal is the point.
    // #1570 needed it because the split put a caller's params-twin and the
    // query half of the same default in DIFFERENT bags, where no merge ranks
    // them — so the default had to be withheld by hand or it won. Nothing is
    // split now: a key in the caller's `params` and a key in the chain's
    // `search` are different channels holding different names, because a caller
    // who puts a declared query name in `params` is refused outright. Each
    // channel merges against its own default and nothing has to look sideways.

    return {
      name: target,
      // The caller's params stay ABOVE the path half, and their `undefined`
      // keys are stripped exactly as before — this merge runs whether or not
      // the chain contributed anything.
      params: mergeDefined(hopDefaults as P | undefined, params),
      // `mergeDefined`, not a spread: an explicit `undefined` from the caller is
      // ABSENCE (#1550 / #1551), so it must not delete the hop default. A spread
      // copied the `undefined` key over and killed it — asymmetric with a
      // route-level `defaultSearch`, where the rule already held.
      search: mergeDefined(hopSearchDefaults, search) as S,
    };
  }

  #getBuildPathOptions(options?: AnyOptions): CachedBuildPathOpts {
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
