// packages/core/src/wiring/wireNamespaces.ts

import { getInternals } from "../internals";
import { resolveOption } from "../namespaces/OptionsNamespace";
import { buildURL, canonicalize, materialize } from "../pipeline";

import type { RouterError } from "../RouterError";
import type { NamespaceBag } from "./types";
import type { NavigationDependencies } from "../namespaces/NavigationNamespace";
import type { PluginsDependencies } from "../namespaces/PluginsNamespace";
import type { RouteLifecycleDependencies } from "../namespaces/RouteLifecycleNamespace";
import type { RouterLifecycleDependencies } from "../namespaces/RouterLifecycleNamespace";
import type { RoutesDependencies } from "../namespaces/RoutesNamespace";
import type { RouteResolver } from "../pipeline";
import type { Router } from "../Router";
import type { DefaultDependencies } from "../types";
import type { RouterValidator } from "../types/RouterValidator";

/**
 * Compiles a guard/plugin factory against the router + a cached `getDependency`
 * accessor. One generic function serves both RouteLifecycle (`GuardFnFactory →
 * GuardFn`) and Plugins (`PluginFactory → Plugin`).
 */
type CompileFactory<Dependencies extends DefaultDependencies> = <T>(
  factory: (
    router: Router<Dependencies>,
    getDependency: <K extends keyof Dependencies>(name: K) => Dependencies[K],
  ) => T,
) => T;

/**
 * Wires the inter-namespace dependencies of a freshly-constructed router.
 *
 * Replaces the former `RouterWiringBuilder` class + `wireRouter` director
 * (#1334): a single call-site with a fixed sequence and nothing to build is a
 * pack of procedures over a shared bag, not a builder — plain functions over a
 * `NamespaceBag` drop the triple-repeated field list and the builder instance.
 *
 * Call order is arbitrary (#1331): no `wire*` function runs user code or
 * eagerly reads another namespace's deps. (`wireLimits` is the one eager
 * *write* — it hands the frozen limits object to dependenciesStore/eventBus;
 * the rest only store deps-closures.) Initial-route guard factories are
 * flushed afterwards, from the constructor's `flushPendingGuards()` call.
 */
export function wireNamespaces<Dependencies extends DefaultDependencies>(
  ns: NamespaceBag<Dependencies>,
): void {
  // One shared factory for both guard and plugin compilation (#1334); the
  // `getDependency` closure is allocated once here, not per compile call.
  const compileFactory = createCompileFactory(ns);

  // One port per router instance — allocated at wiring time, not per call.
  // Hoisted OUT of `wireNavigation` (Phase 2, step 2-2): `navigate` is no longer
  // its only consumer — the entry points migrating onto the pipeline live in
  // RoutesNamespace, which is wired first. Creation order is safe because the
  // resolver only captures `ns.router`'s internals (registered before wiring,
  // #1331) and the routes store (assigned in the namespace's constructor); every
  // member reads through `ns.*` at CALL time, so no wiring order is baked in.
  const port = createRouteResolver(ns);

  // Shared by RouteLifecycle and Plugins — one allocation. Internals are
  // registered before wiring (#1331), so this never throws; returns null until
  // validation-plugin installs the validator.
  const getValidator = (): RouterValidator | null =>
    getInternals(ns.router).validator;

  wireLimits(ns);
  wireEventBus(ns, getValidator);
  wireRouteLifecycle(ns, compileFactory, getValidator);
  wireRoutes(ns, port, getValidator);
  wirePlugins(ns, compileFactory, getValidator);
  wireNavigation(ns, port);
  wireRouterLifecycle(ns);
  wireState(ns, port);
}

function createCompileFactory<Dependencies extends DefaultDependencies>(
  ns: NamespaceBag<Dependencies>,
): CompileFactory<Dependencies> {
  const { router, dependenciesStore } = ns;

  const getDependency = <K extends keyof Dependencies>(
    name: K,
  ): Dependencies[K] => dependenciesStore.dependencies[name] as Dependencies[K];

  return <T>(
    factory: (
      router: Router<Dependencies>,
      getDependency: <K extends keyof Dependencies>(name: K) => Dependencies[K],
    ) => T,
  ): T => factory(router, getDependency);
}

function wireLimits<Dependencies extends DefaultDependencies>(
  ns: NamespaceBag<Dependencies>,
): void {
  ns.dependenciesStore.limits = ns.limits;
  ns.eventBus.setLimits({
    maxListeners: ns.limits.maxListeners,
    warnListeners: ns.limits.warnListeners,
  });
}

/**
 * Hands EventBusNamespace the shared lazy validator accessor so `subscribe` /
 * `addEventListener` can run the opt-in listener-count threshold (#1188) — the
 * emitter-side parallel to the plugins / lifecycle / dependencies counters.
 */
function wireEventBus<Dependencies extends DefaultDependencies>(
  ns: NamespaceBag<Dependencies>,
  getValidator: () => RouterValidator | null,
): void {
  ns.eventBus.setValidatorAccessor(getValidator);
}

function wireRouteLifecycle<Dependencies extends DefaultDependencies>(
  ns: NamespaceBag<Dependencies>,
  compileFactory: CompileFactory<Dependencies>,
  getValidator: () => RouterValidator | null,
): void {
  const deps: RouteLifecycleDependencies<Dependencies> = {
    logger: getInternals(ns.router).logger,
    compileFactory,
    getValidator,
  };

  ns.routeLifecycle.setDependencies(deps);
}

function wireRoutes<Dependencies extends DefaultDependencies>(
  ns: NamespaceBag<Dependencies>,
  port: RouteResolver,
  getValidator: () => RouterValidator | null,
): void {
  const deps: RoutesDependencies<Dependencies> = {
    logger: getInternals(ns.router).logger,
    getValidator,
    port,
    addActivateGuard: (name, handler, precompiledFn) => {
      ns.routeLifecycle.addCanActivate(name, handler, true, precompiledFn);
    },
    addDeactivateGuard: (name, handler, precompiledFn) => {
      ns.routeLifecycle.addCanDeactivate(name, handler, true, precompiledFn);
    },
    compileGuard: (handler, methodName) =>
      ns.routeLifecycle.compileGuardFactory(handler, methodName),
    getState: () => ns.state.get(),
    areStatesEqual: (state1, state2, ignoreQueryParams) =>
      ns.state.areStatesEqual(state1, state2, ignoreQueryParams),
    getDependency: (name) =>
      ns.dependenciesStore.dependencies[name] as Dependencies[typeof name],
  };

  ns.routes.setDependencies(deps);
  ns.routes.setLifecycleNamespace(ns.routeLifecycle);
}

function wirePlugins<Dependencies extends DefaultDependencies>(
  ns: NamespaceBag<Dependencies>,
  compileFactory: CompileFactory<Dependencies>,
  getValidator: () => RouterValidator | null,
): void {
  const deps: PluginsDependencies<Dependencies> = {
    logger: getInternals(ns.router).logger,
    addEventListener: (eventName, cb) =>
      ns.eventBus.addEventListener(eventName, cb),
    canNavigate: () => ns.eventBus.canBeginTransition(),
    compileFactory,
    getValidator,
  };

  ns.plugins.setDependencies(deps);
}

/**
 * The router's implementation of the pipeline's read-model (`RouteResolver`).
 *
 * ⚠ Both ends are wired to the INTERCEPTABLE primitives on purpose — see the
 * port's own docs. `resolveForward` is the `forwardState` seam (interceptors +
 * the centralized channel CHECK that replaced stage ②'s repair), so the seam
 * lives here, in the port implementation, and never inside the pipeline module.
 * `buildPath` is `ctx.buildPath`, because the navigate path prints its URL
 * through that interceptable — reaching for the engine's matcher instead would
 * silently drop `persistent-params`' `buildPath` interceptor from the navigate
 * path.
 */
function createRouteResolver<Dependencies extends DefaultDependencies>(
  ns: NamespaceBag<Dependencies>,
): RouteResolver {
  // Hoisted once per router, NOT per call: `navigate` is the hot path, and
  // `getInternals` is a WeakMap lookup. Safe because both references are stable
  // for the router's lifetime — internals are registered before wiring (#1331)
  // and the object is mutated in place, never swapped; `store` is `readonly` on
  // RoutesNamespace, assigned once in its constructor. ⚠ Only `store` itself is
  // stable: `add`/`replace`/`clear` DO swap `store.config`'s sub-maps wholesale
  // (`Object.assign(store.config, artifacts.config)`), so the accessors below
  // must keep re-reading `store.config.defaultParams` per call — hoisting the
  // sub-map would freeze the pre-mutation defaults. The interceptable methods
  // are stable closures that read the live interceptor map on every call, so
  // hoisting them keeps plugin registration fully dynamic.
  const ctx = getInternals(ns.router);
  const store = ns.routes.getStore();

  const reportUndeclaredParamKey = (routeName: string, key: string): void => {
    ctx.validator?.state.reportUndeclaredParamKey(routeName, key);
  };

  const reportDroppedQueryKey = (routeName: string, key: string): void => {
    ctx.validator?.state.reportDroppedQueryKey(routeName, key);
  };

  return {
    resolveForward: (name, params, search) =>
      ctx.forwardState(name, params, search),
    // `config.*` maps are null-prototype, so a missing entry reads as
    // `undefined` (never a proto value). O(1) lookup, no ancestor walk.
    defaultParams: (name) => store.config.defaultParams[name],
    defaultSearch: (name) => store.config.defaultSearch[name],
    buildPath: (name, params, search) => ctx.buildPath(name, params, search),
    queryNames: (name) => ns.routes.getQueryParams(name),
    // `undefined` for a route that does not exist (#1584) — `getUrlParams`
    // answers `[]` for that case and for a real route with no path slots alike,
    // and the diagnostic downstream cannot tell those apart. `hasRoute` is the
    // matcher's own predicate, so no second derivation of existence appears.
    pathNames: (name) =>
      ns.routes.hasRoute(name) ? ns.routes.getUrlParams(name) : undefined,
    // Read per call, not captured: `queryParamsMode` lives in the options
    // namespace, which `setOption` can rewrite after wiring.
    admitsUndeclaredQuery: () => ns.options.get().queryParamsMode === "loose",
    // A GETTER for the same reason as its sibling below — a plain closure is
    // always truthy, so the pipeline's `?.` never gated anything and bare core
    // paid #1584's `pathNames` existence lookup once per dropped key with no
    // sink behind it. Both sinks now report their absence honestly.
    get reportDroppedQueryKey() {
      return ctx.validator ? reportDroppedQueryKey : undefined;
    },
    // A GETTER, not a closure — the absence is the gate (#1579). The pipeline
    // reads `port.reportUndeclaredParamKey` and skips the whole caller-bag walk
    // when it is `undefined`; a plain closure is always truthy, so bare core
    // (`validator === null`, the repo default) walked the bag on every commit
    // anyway and the "opt-in sink" the design bought was never wired. The
    // validator is installed AFTER wiring, so this cannot be decided once at
    // construction — it has to be read per call, exactly like
    // `admitsUndeclaredQuery` above.
    get reportUndeclaredParamKey() {
      return ctx.validator ? reportUndeclaredParamKey : undefined;
    },
  };
}

function wireNavigation<Dependencies extends DefaultDependencies>(
  ns: NamespaceBag<Dependencies>,
  port: RouteResolver,
): void {
  const deps: NavigationDependencies = {
    logger: getInternals(ns.router).logger,
    getOptions: () => ns.options.get(),
    hasRoute: (name) => ns.routes.hasRoute(name),
    getQueryParams: (name) => ns.routes.getQueryParams(name),
    getMetaForState: (name) => ns.routes.getMetaForState(name),
    getState: () => ns.state.get(),
    buildNavigateState: (routeName, routeParams, routeSearch) => {
      const ctx = getInternals(ns.router);

      ctx.validator?.routes.validateStateBuilderArgs(
        routeName,
        routeParams,
        "navigate",
      );

      // The pipeline (RFC nav-pipeline, milestone 1): `canonicalize` is the sole
      // producer of the canonical intent (① forwardTo resolution through the
      // interceptor zone + ③ route defaults under the caller's value), and both
      // `buildURL` and `materialize` physically accept nothing else — so the URL
      // and the State can never derive from differently-merged channels.
      //
      // Channels stay correct at the seam (#1548/#1549): `routeSearch` (the
      // positional / descriptor form), a declared `?key` riding in the caller's
      // `params` bag, and persistent params injected by a plugin all land in the
      // query channel inside `port.resolveForward`, so one path serves both the
      // positional and the v1 single-bag forms. A colliding name
      // (`/items/:id?id`) keeps its path slot and query twin independent.
      const canonical = canonicalize(
        port,
        routeName,
        routeParams,
        routeSearch,
        {
          diagnoseUndeclared: true,
        },
      );
      const meta = ns.routes.getMetaForState(canonical.name);

      if (meta === undefined) {
        return;
      }

      // ⑤a then ⑤b: the URL is built from the merged channels (not the raw
      // args), so `state.path` stays in step with `state.search`. `skipFreeze`
      // defers the freeze of the state OBJECT for the transition pipeline; the
      // channels were already frozen at merge time.
      return materialize(canonical, {
        path: buildURL(canonical, port),
        skipFreeze: true,
      });
    },
    resolveDefault: () => {
      const options = ns.options.get();
      const ctx = getInternals(ns.router);

      const route = resolveOption(
        options.defaultRoute,
        (name: string) =>
          ns.dependenciesStore.dependencies[name as keyof Dependencies],
      );
      const params = resolveOption(
        options.defaultParams,
        /* v8 ignore next -- @preserve: unreachable unless defaultParams is a callback that calls getDependency */
        (name: string) =>
          ns.dependenciesStore.dependencies[name as keyof Dependencies],
      );
      const search = resolveOption(
        options.defaultSearch,
        /* v8 ignore next -- @preserve: unreachable unless defaultSearch is a callback that calls getDependency */
        (name: string) =>
          ns.dependenciesStore.dependencies[name as keyof Dependencies],
      );

      if (typeof options.defaultRoute === "function") {
        ctx.validator?.options.validateResolvedDefaultRoute(
          route,
          ctx.routeGetStore(),
        );
      }

      return { route, params, search };
    },
    startTransition: (toState, fromState) => {
      ns.eventBus.sendNavigate(toState, fromState);
    },
    getNavigationEpoch: () => ns.eventBus.getNavigationEpoch(),
    systemCommit: (toState, fromState, opts) => {
      ns.eventBus.systemCommit({ toState, fromState, opts });
    },
    cancelNavigation: (reason) => {
      ns.eventBus.sendCancelIfPossible(ns.state.get(), reason);
    },
    canCommitTransition: (payload) => ns.eventBus.canCommitTransition(payload),
    sendTransitionDone: (payload) => {
      ns.eventBus.sendComplete(payload);
    },
    sendTransitionFail: (toState, fromState, error, epoch) => {
      ns.eventBus.sendFail(toState, fromState, error, epoch);
    },
    // Channel (б): early refusals (ROUTE_NOT_FOUND, the P3 channel guard,
    // same-state) report to observers without moving the machine — there is no
    // transition of theirs to fail.
    emitTransitionError: (toState, fromState, error) => {
      ns.eventBus.emitTransitionError(toState, fromState, error as RouterError);
    },
    sendLeaveApprove: (toState, fromState) => {
      ns.eventBus.sendLeaveApprove(toState, fromState);
    },
    canNavigate: () => ns.eventBus.canBeginTransition(),
    isStarting: () => ns.eventBus.isStarting(),
    getLifecycleFunctions: () => ns.routeLifecycle.getFunctions(),
    // Deactivation half only — the 404 has no route to activate (#1643).
    canDeactivateCurrent: (deactivated, toState, fromState) =>
      ns.routeLifecycle.canNavigateTo(deactivated, [], toState, fromState),
    isActive: () => ns.router.isActive(),
    isTransitioning: () => ns.eventBus.isTransitioning(),
    // Post-leave auto-cleanup unregisters only the EXTERNAL (component-managed)
    // guard; a route-config (definition) guard survives for re-entry (#1171).
    clearCanDeactivate: (name: string) => {
      ns.routeLifecycle.clearCanDeactivate(name, "external");
    },
    hasLeaveListeners: () => ns.eventBus.hasLeaveListeners(),
    hasPreCommitListeners: () => ns.eventBus.hasPreCommitListeners(),
    awaitLeaveListeners: (toState, fromState, signal) =>
      ns.eventBus.awaitLeaveListeners(toState, fromState, signal),
  };

  ns.navigation.setDependencies(deps);
}

function wireRouterLifecycle<Dependencies extends DefaultDependencies>(
  ns: NamespaceBag<Dependencies>,
): void {
  const deps: RouterLifecycleDependencies = {
    getOptions: () => ns.options.get(),
    navigateToState: (state, opts) =>
      ns.navigation.navigateToState(state, opts),
    // No opts: `start()` commits before anything is committed, so the
    // deactivation consult (#1643) short-circuits on an absent `fromState`.
    navigateToNotFound: (path) => ns.navigation.navigateToNotFound(path),
    matchPath: (path) => ns.routes.matchPath(path, ns.options.get()),
    completeStart: () => {
      ns.eventBus.sendStarted();
    },
    isIdle: () => ns.eventBus.isIdle(),
    emitTransitionError: (toState, fromState, error) => {
      ns.eventBus.sendFail(toState, fromState, error);
    },
  };

  ns.lifecycle.setDependencies(deps);
}

function wireState<Dependencies extends DefaultDependencies>(
  ns: NamespaceBag<Dependencies>,
  port: RouteResolver,
): void {
  ns.state.setDependencies({
    // `makeState` is `canonicalize`'s literal form since Phase 4, so the port is
    // all it needs. The seven members that used to live here — both default
    // maps, `getQueryParams`, `hasRoute`, `admitsUndeclaredQuery`,
    // `getDropReporter`, `buildPath` — existed only to feed a second copy of
    // stage ③ and the mode gate, and left with it.
    port: () => port,
    getUrlParams: (name) => ns.routes.getUrlParams(name),
  });
}
