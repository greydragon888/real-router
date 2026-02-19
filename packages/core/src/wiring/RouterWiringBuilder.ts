// packages/core/src/wiring/RouterWiringBuilder.ts

import { events } from "../constants";
import { routerEvents, routerStates } from "../fsm";

import type { MiddlewareDependencies } from "../namespaces/MiddlewareNamespace";
import type {
  NavigationDependencies,
  TransitionDependencies,
} from "../namespaces/NavigationNamespace";
import type { PluginsDependencies } from "../namespaces/PluginsNamespace";
import type { RouteLifecycleDependencies } from "../namespaces/RouteLifecycleNamespace";
import type { RouterLifecycleDependencies } from "../namespaces/RouterLifecycleNamespace";
import type { RoutesDependencies } from "../namespaces/RoutesNamespace";
import type { RouterEventMap } from "../types";
import type { WiringOptions } from "./types";
import type {
  DefaultDependencies,
  NavigationOptions,
  RouterError,
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
  private readonly routerFSM: WiringOptions<Dependencies>["routerFSM"];
  private readonly emitter: WiringOptions<Dependencies>["emitter"];
  private readonly getCurrentToState: WiringOptions<Dependencies>["getCurrentToState"];
  private readonly setCurrentToState: WiringOptions<Dependencies>["setCurrentToState"];

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
    this.routerFSM = wiringOptions.routerFSM;
    this.emitter = wiringOptions.emitter;
    this.getCurrentToState = wiringOptions.getCurrentToState;
    this.setCurrentToState = wiringOptions.setCurrentToState;
  }

  wireLimits(): void {
    this.dependencies.setLimits(this.limits);
    this.plugins.setLimits(this.limits);
    this.middleware.setLimits(this.limits);
    this.emitter.setLimits({
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
        this.emitter.on(
          eventName,
          cb as (...args: RouterEventMap[typeof eventName]) => void,
        ),
      canNavigate: () => this.routerFSM.canSend(routerEvents.NAVIGATE),
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
        this.setCurrentToState(toState);
        this.routerFSM.send(routerEvents.NAVIGATE, {
          toState,
          fromState,
        });
      },
      cancelNavigation: () => {
        this.routerFSM.send(routerEvents.CANCEL, {
          toState: this.getCurrentToState()!, // eslint-disable-line @typescript-eslint/no-non-null-assertion -- guaranteed set before TRANSITIONING
          fromState: this.state.get(),
        });
        this.setCurrentToState(undefined);
      },
      sendTransitionDone: (state, fromState, opts) => {
        this.routerFSM.send(routerEvents.COMPLETE, {
          state,
          fromState,
          opts,
        });
        this.setCurrentToState(undefined);
      },
      sendTransitionBlocked: (toState, fromState, error) => {
        this.routerFSM.send(routerEvents.FAIL, {
          toState,
          fromState,
          error,
        });
        this.setCurrentToState(undefined);
      },
      sendTransitionError: (toState, fromState, error) => {
        this.routerFSM.send(routerEvents.FAIL, {
          toState,
          fromState,
          error,
        });
        this.setCurrentToState(undefined);
      },
      emitTransitionError: (toState, fromState, error) => {
        if (this.routerFSM.getState() === routerStates.READY) {
          this.routerFSM.send(routerEvents.FAIL, {
            toState,
            fromState,
            error,
          });
        } else {
          // TRANSITIONING: concurrent navigation with invalid args.
          // Direct emit to avoid disturbing the ongoing transition.
          this.emitter.emit(
            events.TRANSITION_ERROR,
            toState,
            fromState,
            error as RouterError,
          );
        }
      },
    };

    this.navigation.setDependencies(navigationDeps);

    const transitionDeps: TransitionDependencies = {
      getLifecycleFunctions: () => this.routeLifecycle.getFunctions(),
      getMiddlewareFunctions: () => this.middleware.getFunctions(),
      isActive: () => this.router.isActive(),
      isTransitioning: () =>
        this.routerFSM.getState() === routerStates.TRANSITIONING,
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
        this.routerFSM.send(routerEvents.STARTED);
      },
      emitTransitionError: (toState, fromState, error) => {
        this.routerFSM.send(routerEvents.FAIL, {
          toState,
          fromState,
          error,
        });
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

  wireCyclicDeps(): void {
    this.navigation.canNavigate = () =>
      this.routerFSM.canSend(routerEvents.NAVIGATE);

    this.lifecycle.navigateToState = (
      toState: State,
      fromState: State | undefined,
      opts: NavigationOptions,
    ) => this.navigation.navigateToState(toState, fromState, opts);
  }
}
