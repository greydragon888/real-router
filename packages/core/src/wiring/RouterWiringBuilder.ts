// packages/core/src/wiring/RouterWiringBuilder.ts

import { getInternals } from "../internals";
import { resolveOption } from "../namespaces/OptionsNamespace";
import { validateStateBuilderArgs } from "../namespaces/RoutesNamespace/validators";

import type { EventBusNamespace } from "../namespaces";
import type { WiringOptions } from "./types";
import type { NavigationDependencies } from "../namespaces/NavigationNamespace";
import type { PluginsDependencies } from "../namespaces/PluginsNamespace";
import type { RouteLifecycleDependencies } from "../namespaces/RouteLifecycleNamespace";
import type { RouterLifecycleDependencies } from "../namespaces/RouterLifecycleNamespace";
import type { RoutesDependencies } from "../namespaces/RoutesNamespace";
import type { RouterError } from "../RouterError";
import type { DefaultDependencies, Params } from "@real-router/types";

export class RouterWiringBuilder<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  private readonly router: WiringOptions<Dependencies>["router"];
  private readonly options: WiringOptions<Dependencies>["options"];
  private readonly limits: WiringOptions<Dependencies>["limits"];
  private readonly dependenciesStore: WiringOptions<Dependencies>["dependenciesStore"];
  private readonly state: WiringOptions<Dependencies>["state"];
  private readonly routes: WiringOptions<Dependencies>["routes"];
  private readonly routeLifecycle: WiringOptions<Dependencies>["routeLifecycle"];
  private readonly plugins: WiringOptions<Dependencies>["plugins"];
  private readonly navigation: WiringOptions<Dependencies>["navigation"];
  private readonly lifecycle: WiringOptions<Dependencies>["lifecycle"];
  private readonly eventBus: EventBusNamespace;

  constructor(wiringOptions: WiringOptions<Dependencies>) {
    this.router = wiringOptions.router;
    this.options = wiringOptions.options;
    this.limits = wiringOptions.limits;
    this.dependenciesStore = wiringOptions.dependenciesStore;
    this.state = wiringOptions.state;
    this.routes = wiringOptions.routes;
    this.routeLifecycle = wiringOptions.routeLifecycle;
    this.plugins = wiringOptions.plugins;
    this.navigation = wiringOptions.navigation;
    this.lifecycle = wiringOptions.lifecycle;
    this.eventBus = wiringOptions.eventBus;
  }

  wireLimits(): void {
    this.dependenciesStore.limits = this.limits;
    this.plugins.setLimits(this.limits);
    this.eventBus.setLimits({
      maxListeners: this.limits.maxListeners,
      warnListeners: this.limits.warnListeners,
      maxEventDepth: this.limits.maxEventDepth,
    });
    this.routeLifecycle.setLimits(this.limits);
  }

  wireRouteLifecycleDeps(): void {
    const routeLifecycleDeps: RouteLifecycleDependencies<Dependencies> = {
      compileFactory: (factory) =>
        factory(
          this.router,
          <K extends keyof Dependencies>(name: K) =>
            this.dependenciesStore.dependencies[name] as Dependencies[K],
        ),
    };

    this.routeLifecycle.setDependencies(routeLifecycleDeps);
  }

  wireRoutesDeps(): void {
    const routesDeps: RoutesDependencies<Dependencies> = {
      addActivateGuard: (name, handler) => {
        this.routeLifecycle.addCanActivate(name, handler, true, true);
      },
      addDeactivateGuard: (name, handler) => {
        this.routeLifecycle.addCanDeactivate(name, handler, true, true);
      },
      makeState: (name, params, path, meta) =>
        this.state.makeState(name, params, path, meta),
      getState: () => this.state.get(),
      areStatesEqual: (state1, state2, ignoreQueryParams) =>
        this.state.areStatesEqual(state1, state2, ignoreQueryParams),
      getDependency: (name) =>
        this.dependenciesStore.dependencies[name] as Dependencies[typeof name],
      forwardState: <P extends Params = Params>(name: string, params: P) => {
        const ctx = getInternals(this.router);

        if (!ctx.noValidate) {
          validateStateBuilderArgs(name, params, "forwardState");
        }

        return ctx.forwardState(name, params);
      },
    };

    this.routes.setDependencies(routesDeps);
    this.routes.setLifecycleNamespace(this.routeLifecycle);
  }

  wirePluginsDeps(): void {
    const pluginsDeps: PluginsDependencies<Dependencies> = {
      addEventListener: (eventName, cb) =>
        this.eventBus.addEventListener(eventName, cb),
      canNavigate: () => this.eventBus.canBeginTransition(),
      compileFactory: (factory) =>
        factory(
          this.router,
          <K extends keyof Dependencies>(name: K) =>
            this.dependenciesStore.dependencies[name] as Dependencies[K],
        ),
    };

    this.plugins.setDependencies(pluginsDeps);
  }

  wireNavigationDeps(): void {
    const navigationDeps: NavigationDependencies = {
      getOptions: () => this.options.get(),
      hasRoute: (name) => this.routes.hasRoute(name),
      getState: () => this.state.get(),
      setState: (state) => {
        this.state.set(state);
      },
      buildStateWithSegments: <P extends Params = Params>(
        routeName: string,
        routeParams: P,
      ) => {
        const ctx = getInternals(this.router);

        if (!ctx.noValidate) {
          validateStateBuilderArgs(routeName, routeParams, "navigate");
        }

        const { name, params } = ctx.forwardState(routeName, routeParams);

        return this.routes.buildStateWithSegmentsResolved(name, params);
      },
      makeState: (name, params, path, meta) =>
        this.state.makeState(name, params, path, meta),
      buildPath: (route, params) => {
        const ctx = getInternals(this.router);

        return ctx.buildPath(route, params);
      },
      areStatesEqual: (state1, state2, ignoreQueryParams) =>
        this.state.areStatesEqual(state1, state2, ignoreQueryParams),
      resolveDefaultRoute: () => {
        const options = this.options.get();

        return resolveOption(
          options.defaultRoute,
          (name: string) =>
            this.dependenciesStore.dependencies[name as keyof Dependencies],
        );
      },
      resolveDefaultParams: () => {
        const options = this.options.get();

        return resolveOption(
          options.defaultParams,
          /* v8 ignore next -- @preserve: identical to resolveDefaultRoute callback above; unreachable unless defaultParams is a callback that calls getDependency */
          (name: string) =>
            this.dependenciesStore.dependencies[name as keyof Dependencies],
        );
      },
      startTransition: (toState, fromState) => {
        this.eventBus.sendNavigate(toState, fromState);
      },
      cancelNavigation: () => {
        this.eventBus.sendCancel(
          this.eventBus.getCurrentToState()!, // eslint-disable-line @typescript-eslint/no-non-null-assertion -- guaranteed set before TRANSITIONING
          this.state.get(),
        );
      },
      sendTransitionDone: (state, fromState, opts) => {
        this.eventBus.sendComplete(state, fromState, opts);
      },
      sendTransitionFail: (toState, fromState, error) => {
        this.eventBus.sendFail(toState, fromState, error);
      },
      emitTransitionError: (toState, fromState, error) => {
        if (this.eventBus.isReady()) {
          this.eventBus.sendFail(toState, fromState, error);
        } else {
          this.eventBus.emitTransitionError(
            toState,
            fromState,
            error as RouterError,
          );
        }
      },
      emitTransitionSuccess: (toState, fromState, opts) => {
        this.eventBus.emitTransitionSuccess(toState, fromState, opts);
      },
      canNavigate: () => this.eventBus.canBeginTransition(),
      getLifecycleFunctions: () => this.routeLifecycle.getFunctions(),
      isActive: () => this.router.isActive(),
      isTransitioning: () => this.eventBus.isTransitioning(),
      clearCanDeactivate: (name: string) => {
        this.routeLifecycle.clearCanDeactivate(name);
      },
    };

    this.navigation.setDependencies(navigationDeps);
  }

  wireLifecycleDeps(): void {
    const lifecycleDeps: RouterLifecycleDependencies = {
      getOptions: () => this.options.get(),
      navigate: (name, params, opts) =>
        this.navigation.navigate(name, params, opts),
      navigateToNotFound: (path) => this.navigation.navigateToNotFound(path),
      clearState: () => {
        this.state.set(undefined);
      },
      matchPath: (path) => this.routes.matchPath(path, this.options.get()),
      completeStart: () => {
        this.eventBus.sendStarted();
      },
      emitTransitionError: (toState, fromState, error) => {
        this.eventBus.sendFail(toState, fromState, error);
      },
    };

    this.lifecycle.setDependencies(lifecycleDeps);
  }

  wireStateDeps(): void {
    this.state.setDependencies({
      getDefaultParams: () => this.routes.getStore().config.defaultParams,
      buildPath: (name, params) => {
        const ctx = getInternals(this.router);

        return ctx.buildPath(name, params);
      },
      getUrlParams: (name) => this.routes.getUrlParams(name),
    });
  }
}
