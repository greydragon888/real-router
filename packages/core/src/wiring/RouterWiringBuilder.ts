// packages/core/src/wiring/RouterWiringBuilder.ts

import type { EventBusNamespace } from "../namespaces";
import type { WiringOptions } from "./types";
import type { MiddlewareDependencies } from "../namespaces/MiddlewareNamespace";
import type {
  NavigationDependencies,
  TransitionDependencies,
} from "../namespaces/NavigationNamespace";
import type { PluginsDependencies } from "../namespaces/PluginsNamespace";
import type { RouteLifecycleDependencies } from "../namespaces/RouteLifecycleNamespace";
import type { RouterLifecycleDependencies } from "../namespaces/RouterLifecycleNamespace";
import type { RoutesDependencies } from "../namespaces/RoutesNamespace";
import type {
  DefaultDependencies,
  NavigationOptions,
  State,
} from "@real-router/types";

export class RouterWiringBuilder<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  private readonly router: WiringOptions<Dependencies>["router"];
  private readonly options: WiringOptions<Dependencies>["options"];
  private readonly limits: WiringOptions<Dependencies>["limits"];
  private readonly dependencies: WiringOptions<Dependencies>["dependencies"];
  private readonly state: WiringOptions<Dependencies>["state"];
  private readonly routes: WiringOptions<Dependencies>["routes"];
  private readonly routeLifecycle: WiringOptions<Dependencies>["routeLifecycle"];
  private readonly middleware: WiringOptions<Dependencies>["middleware"];
  private readonly plugins: WiringOptions<Dependencies>["plugins"];
  private readonly navigation: WiringOptions<Dependencies>["navigation"];
  private readonly lifecycle: WiringOptions<Dependencies>["lifecycle"];
  private readonly clone: WiringOptions<Dependencies>["clone"];
  private readonly eventBus: EventBusNamespace;

  constructor(wiringOptions: WiringOptions<Dependencies>) {
    this.router = wiringOptions.router;
    this.options = wiringOptions.options;
    this.limits = wiringOptions.limits;
    this.dependencies = wiringOptions.dependencies;
    this.state = wiringOptions.state;
    this.routes = wiringOptions.routes;
    this.routeLifecycle = wiringOptions.routeLifecycle;
    this.middleware = wiringOptions.middleware;
    this.plugins = wiringOptions.plugins;
    this.navigation = wiringOptions.navigation;
    this.lifecycle = wiringOptions.lifecycle;
    this.clone = wiringOptions.clone;
    this.eventBus = wiringOptions.eventBus;
  }

  wireLimits(): void {
    this.dependencies.setLimits(this.limits);
    this.plugins.setLimits(this.limits);
    this.middleware.setLimits(this.limits);
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
        this.dependencies.get(dependencyName),
    };

    this.routeLifecycle.setDependencies(routeLifecycleDeps);
  }

  wireRoutesDeps(): void {
    const routesDeps: RoutesDependencies<Dependencies> = {
      addActivateGuard: (name, handler) => {
        this.router.addActivateGuard(name, handler);
      },
      addDeactivateGuard: (name, handler) => {
        this.router.addDeactivateGuard(name, handler);
      },
      makeState: (name, params, path, meta) =>
        this.state.makeState(name, params, path, meta),
      getState: () => this.state.get(),
      areStatesEqual: (state1, state2, ignoreQueryParams) =>
        this.state.areStatesEqual(state1, state2, ignoreQueryParams),
      getDependency: (name) => this.dependencies.get(name),
      forwardState: (name, params) => this.router.forwardState(name, params),
    };

    this.routes.setDependencies(routesDeps);
    this.routes.setLifecycleNamespace(this.routeLifecycle);
  }

  wireMiddlewareDeps(): void {
    this.middleware.setRouter(this.router);

    const middlewareDeps: MiddlewareDependencies<Dependencies> = {
      getDependency: <K extends keyof Dependencies>(dependencyName: K) =>
        this.dependencies.get(dependencyName),
    };

    this.middleware.setDependencies(middlewareDeps);
  }

  wirePluginsDeps(): void {
    this.plugins.setRouter(this.router);

    const pluginsDeps: PluginsDependencies<Dependencies> = {
      addEventListener: (eventName, cb) =>
        this.eventBus.addEventListener(eventName, cb),
      canNavigate: () => this.eventBus.canBeginTransition(),
      getDependency: <K extends keyof Dependencies>(dependencyName: K) =>
        this.dependencies.get(dependencyName),
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
        const { name, params } = this.router.forwardState(
          routeName,
          routeParams,
        );

        return this.routes.buildStateWithSegmentsResolved(name, params);
      },
      makeState: (name, params, path, meta) =>
        this.state.makeState(name, params, path, meta),
      buildPath: (route, params) =>
        this.routes.buildPath(route, params, this.options.get()),
      areStatesEqual: (state1, state2, ignoreQueryParams) =>
        this.state.areStatesEqual(state1, state2, ignoreQueryParams),
      getDependency: (name: string) =>
        this.dependencies.get(name as keyof Dependencies),
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
      getMiddlewareFunctions: () => this.middleware.getFunctions(),
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
      matchPath: (path, source?: string) =>
        this.routes.matchPath(path, source, this.options.get()),
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
      getDefaultParams: () => this.routes.getConfig().defaultParams,
      buildPath: (name, params) =>
        this.routes.buildPath(name, params, this.options.get()),
      getUrlParams: (name) => this.routes.getUrlParams(name),
    });
  }

  wireCloneCallbacks(): void {
    this.clone.setGetCloneData(() => {
      const [canDeactivateFactories, canActivateFactories] =
        this.routeLifecycle.getFactories();

      return {
        routes: this.routes.cloneRoutes(),
        options: { ...this.options.get() },
        dependencies: this.dependencies.getAll(),
        canDeactivateFactories,
        canActivateFactories,
        middlewareFactories: this.middleware.getFactories(),
        pluginFactories: this.plugins.getAll(),
        routeConfig: this.routes.getConfig(),
        resolvedForwardMap: this.routes.getResolvedForwardMap(),
      };
    });
  }

  wireCyclicDeps(): void {
    this.navigation.canNavigate = () => this.eventBus.canBeginTransition();

    this.lifecycle.navigateToState = (
      toState: State,
      fromState: State | undefined,
      opts: NavigationOptions,
    ) => this.navigation.navigateToState(toState, fromState, opts);
  }
}
