// packages/core/src/wiring/RouterWiringBuilder.ts

import { getInternals } from "../internals";
import { validateStateBuilderArgs } from "../namespaces/RoutesNamespace/validators";

import type { EventBusNamespace } from "../namespaces";
import type { WiringOptions } from "./types";
import type {
  NavigationDependencies,
  TransitionDependencies,
} from "../namespaces/NavigationNamespace";
import type { PluginsDependencies } from "../namespaces/PluginsNamespace";
import type { RouteLifecycleDependencies } from "../namespaces/RouteLifecycleNamespace";
import type { RouterLifecycleDependencies } from "../namespaces/RouterLifecycleNamespace";
import type { RoutesDependencies } from "../namespaces/RoutesNamespace";
import type { DefaultDependencies } from "@real-router/types";

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
    this.routeLifecycle.setRouter(this.router);

    const routeLifecycleDeps: RouteLifecycleDependencies<Dependencies> = {
      getDependency: <K extends keyof Dependencies>(dependencyName: K) =>
        this.dependenciesStore.dependencies[dependencyName] as Dependencies[K],
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
      forwardState: (name, params) => {
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
    this.plugins.setRouter(this.router);

    const pluginsDeps: PluginsDependencies<Dependencies> = {
      addEventListener: (eventName, cb) =>
        this.eventBus.addEventListener(eventName, cb),
      canNavigate: () => this.eventBus.canBeginTransition(),
      getDependency: <K extends keyof Dependencies>(dependencyName: K) =>
        this.dependenciesStore.dependencies[dependencyName] as Dependencies[K],
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
      buildStateWithSegments: (routeName, routeParams) => {
        const ctx = getInternals(this.router);

        if (!ctx.noValidate) {
          validateStateBuilderArgs(routeName, routeParams, "navigate");
        }

        const { name, params } = ctx.forwardState(routeName, routeParams);

        return this.routes.buildStateWithSegmentsResolved(name, params);
      },
      makeState: (name, params, path, meta) =>
        this.state.makeState(name, params, path, meta),
      buildPath: (route, params) =>
        this.routes.buildPath(route, params, this.options.get()),
      areStatesEqual: (state1, state2, ignoreQueryParams) =>
        this.state.areStatesEqual(state1, state2, ignoreQueryParams),
      getDependency: (name: string) =>
        this.dependenciesStore.dependencies[name as keyof Dependencies],
      startTransition: (toState, fromState) => {
        this.eventBus.beginTransition(toState, fromState);
      },
      cancelNavigation: () => {
        this.eventBus.cancelTransition(
          this.eventBus.getCurrentToState()!, // eslint-disable-line @typescript-eslint/no-non-null-assertion -- guaranteed set before TRANSITIONING
          this.state.get(),
        );
      },
      sendTransitionDone: (state, fromState, opts) => {
        this.eventBus.completeTransition(state, fromState, opts);
      },
      sendTransitionBlocked: (toState, fromState, error) => {
        this.eventBus.failTransition(toState, fromState, error);
      },
      sendTransitionError: (toState, fromState, error) => {
        this.eventBus.failTransition(toState, fromState, error);
      },
      emitTransitionError: (toState, fromState, error) => {
        this.eventBus.emitOrFailTransitionError(toState, fromState, error);
      },
    };

    this.navigation.setDependencies(navigationDeps);

    const transitionDeps: TransitionDependencies = {
      getLifecycleFunctions: () => this.routeLifecycle.getFunctions(),
      isActive: () => this.router.isActive(),
      isTransitioning: () => this.eventBus.isTransitioning(),
      clearCanDeactivate: (name) => {
        this.routeLifecycle.clearCanDeactivate(name);
      },
    };

    this.navigation.setTransitionDependencies(transitionDeps);
  }

  wireLifecycleDeps(): void {
    const lifecycleDeps: RouterLifecycleDependencies = {
      getOptions: () => this.options.get(),
      makeNotFoundState: (path, options) =>
        this.state.makeNotFoundState(path, options),
      setState: (state) => {
        this.state.set(state);
      },
      matchPath: (path) => this.routes.matchPath(path, this.options.get()),
      completeStart: () => {
        this.eventBus.completeStart();
      },
      emitTransitionError: (toState, fromState, error) => {
        this.eventBus.failTransition(toState, fromState, error);
      },
    };

    this.lifecycle.setDependencies(lifecycleDeps);
  }

  wireStateDeps(): void {
    this.state.setDependencies({
      getDefaultParams: () => this.routes.getStore().config.defaultParams,
      buildPath: (name, params) =>
        this.routes.buildPath(name, params, this.options.get()),
      getUrlParams: (name) => this.routes.getUrlParams(name),
    });
  }

  wireCyclicDeps(): void {
    this.navigation.setCanNavigate(() => this.eventBus.canBeginTransition());

    this.lifecycle.setNavigateToState((toState, fromState, opts) =>
      this.navigation.navigateToState(toState, fromState, opts),
    );
  }
}
