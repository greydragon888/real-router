// packages/core/src/wiring/wireNamespaces.ts

import { normalizeParams, splitParamsBySearch } from "../helpers";
import { getInternals } from "../internals";
import { resolveOption } from "../namespaces/OptionsNamespace";

import type { NamespaceBag } from "./types";
import type { NavigationDependencies } from "../namespaces/NavigationNamespace";
import type { PluginsDependencies } from "../namespaces/PluginsNamespace";
import type { RouteLifecycleDependencies } from "../namespaces/RouteLifecycleNamespace";
import type { RouterLifecycleDependencies } from "../namespaces/RouterLifecycleNamespace";
import type { RoutesDependencies } from "../namespaces/RoutesNamespace";
import type { Router } from "../Router";
import type { DefaultDependencies, Params, SearchParams } from "../types";
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

  // Shared by RouteLifecycle and Plugins — one allocation. Internals are
  // registered before wiring (#1331), so this never throws; returns null until
  // validation-plugin installs the validator.
  const getValidator = (): RouterValidator | null =>
    getInternals(ns.router).validator;

  wireLimits(ns);
  wireEventBus(ns, getValidator);
  wireRouteLifecycle(ns, compileFactory, getValidator);
  wireRoutes(ns);
  wirePlugins(ns, compileFactory, getValidator);
  wireNavigation(ns);
  wireRouterLifecycle(ns);
  wireState(ns);
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
): void {
  const deps: RoutesDependencies<Dependencies> = {
    logger: getInternals(ns.router).logger,
    addActivateGuard: (name, handler, precompiledFn) => {
      ns.routeLifecycle.addCanActivate(name, handler, true, precompiledFn);
    },
    addDeactivateGuard: (name, handler, precompiledFn) => {
      ns.routeLifecycle.addCanDeactivate(name, handler, true, precompiledFn);
    },
    compileGuard: (handler, methodName) =>
      ns.routeLifecycle.compileGuardFactory(handler, methodName),
    makeState: (name, params, search, path) =>
      ns.state.makeState(name, params, search, path),
    getState: () => ns.state.get(),
    areStatesEqual: (state1, state2, ignoreQueryParams) =>
      ns.state.areStatesEqual(state1, state2, ignoreQueryParams),
    getDependency: (name) =>
      ns.dependenciesStore.dependencies[name] as Dependencies[typeof name],
    forwardState: <
      P extends Params = Params,
      S extends SearchParams = SearchParams,
    >(
      name: string,
      params: P,
      search?: S,
    ) => {
      const ctx = getInternals(ns.router);

      ctx.validator?.routes.validateStateBuilderArgs(
        name,
        params,
        "forwardState",
      );

      return ctx.forwardState(name, params, search);
    },
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

function wireNavigation<Dependencies extends DefaultDependencies>(
  ns: NamespaceBag<Dependencies>,
): void {
  const deps: NavigationDependencies = {
    logger: getInternals(ns.router).logger,
    getOptions: () => ns.options.get(),
    hasRoute: (name) => ns.routes.hasRoute(name),
    getMetaForState: (name) => ns.routes.getMetaForState(name),
    getState: () => ns.state.get(),
    setState: (state) => {
      ns.state.set(state);
    },
    buildNavigateState: (routeName, routeParams, routeSearch) => {
      const ctx = getInternals(ns.router);

      ctx.validator?.routes.validateStateBuilderArgs(
        routeName,
        routeParams,
        "navigate",
      );

      const forwarded = ctx.forwardState(routeName, routeParams);
      const name = forwarded.name;
      const fullParams = normalizeParams(forwarded.params);
      const meta = ns.routes.getMetaForState(name);

      if (meta === undefined) {
        return;
      }

      // Explicit query channel (RFC-4 M2 / #1548): the descriptor
      // `navigate(target)` and positional `navigate(name, params, search)` forms
      // supply `search` directly. Path comes from the path bag, query from
      // `routeSearch` — buildPath is search-aware, so a colliding name
      // (`/items/:id?id`) keeps the path value in its slot and the query value
      // in its own (the killed #843 precedence).
      if (routeSearch !== undefined) {
        const explicitPath = ctx.buildPath(name, fullParams, routeSearch);

        return ns.state.makeState(
          name,
          fullParams,
          routeSearch,
          explicitPath,
          true,
        );
      }

      // v1 single-bag path: split the forwarded bag into path and query channels
      // by declaration (keys that are not path params). `buildPath` still takes
      // the FULL bag, so the URL keeps its query string; `state.params` gets the
      // path-only bag and `state.search` the query. Non-query default keys are
      // pinned to the params channel (#1549): the forwarded bag has defaults
      // merged in, and an arbitrary default must keep its v1 home in
      // `state.params` instead of being routed like an explicit undeclared key.
      const { params, search } = splitParamsBySearch(
        fullParams,
        ns.routes.getUrlParams(name),
        ns.routes.getNonQueryDefaultKeys(name),
      );
      const path = ctx.buildPath(name, fullParams);

      return ns.state.makeState(name, params, search, path, true);
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

      if (typeof options.defaultRoute === "function") {
        ctx.validator?.options.validateResolvedDefaultRoute(
          route,
          ctx.routeGetStore(),
        );
      }

      return { route, params };
    },
    startTransition: (toState, fromState) => {
      ns.eventBus.sendNavigate(toState, fromState);
    },
    cancelNavigation: (reason) => {
      ns.eventBus.sendCancelIfPossible(ns.state.get(), reason);
    },
    sendTransitionDone: (state, fromState, opts) => {
      ns.eventBus.sendComplete(state, fromState, opts);
    },
    sendTransitionFail: (toState, fromState, error) => {
      ns.eventBus.sendFail(toState, fromState, error);
    },
    emitTransitionError: (toState, fromState, error) => {
      ns.eventBus.sendFailSafe(toState, fromState, error);
    },
    emitTransitionSuccess: (toState, fromState, opts) => {
      ns.eventBus.emitTransitionSuccess(toState, fromState, opts);
    },
    sendLeaveApprove: (toState, fromState) => {
      ns.eventBus.sendLeaveApprove(toState, fromState);
    },
    canNavigate: () => ns.eventBus.canBeginTransition(),
    getLifecycleFunctions: () => ns.routeLifecycle.getFunctions(),
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
    navigateToNotFound: (path) => ns.navigation.navigateToNotFound(path),
    clearState: () => {
      ns.state.set(undefined);
    },
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
): void {
  ns.state.setDependencies({
    getDefaultParams: () => ns.routes.getStore().config.defaultParams,
    buildPath: (name, params, search) => {
      const ctx = getInternals(ns.router);

      return ctx.buildPath(name, params, search);
    },
    getUrlParams: (name) => ns.routes.getUrlParams(name),
    getQueryParams: (name) => ns.routes.getQueryParams(name),
  });
}
