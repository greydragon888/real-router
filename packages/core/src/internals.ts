import type { RoutesStore } from "./namespaces/RoutesNamespace";
import type { Router } from "./Router";
import type { EventMethodMap, GuardFnFactory, PluginFactory } from "./types";
import type {
  DefaultDependencies,
  EventName,
  NavigationOptions,
  Options,
  Params,
  Plugin,
  RouteTreeState,
  SimpleState,
  State,
  StateMetaInput,
  Unsubscribe,
} from "@real-router/types";
import type { RouteTree } from "route-tree";

export interface RouterInternals<
  D extends DefaultDependencies = DefaultDependencies,
> {
  readonly makeState: <P extends Params = Params, MP extends Params = Params>(
    name: string,
    params?: P,
    path?: string,
    meta?: StateMetaInput<MP>,
    forceId?: number,
  ) => State<P, MP>;

  // MUTABLE — persistent-params-plugin swaps this for interception
  forwardState: <P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ) => SimpleState<P>;

  readonly buildStateResolved: (
    resolvedName: string,
    resolvedParams: Params,
  ) => RouteTreeState | undefined;

  readonly matchPath: <P extends Params = Params, MP extends Params = Params>(
    path: string,
    options?: Options,
  ) => State<P, MP> | undefined;

  readonly getOptions: () => Options;

  readonly navigateToState: (
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
  ) => Promise<State>;

  readonly addEventListener: <E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ) => Unsubscribe;

  readonly buildPath: (route: string, params?: Params) => string;

  readonly setRootPath: (rootPath: string) => void;
  readonly getRootPath: () => string;

  readonly getTree: () => RouteTree;

  readonly isDisposed: () => boolean;

  readonly noValidate: boolean;

  // Dependencies (issue #172)
  readonly dependencyGet: (key: string) => unknown;
  readonly dependencyGetAll: () => Record<string, unknown>;
  readonly dependencySet: (name: string, value: unknown) => boolean;
  readonly dependencySetMultiple: (deps: Record<string, unknown>) => void;
  readonly dependencyCount: () => number;
  readonly dependencyRemove: (name: string) => void;
  readonly dependencyHas: (name: string) => boolean;
  readonly dependencyReset: () => void;
  readonly maxDependencies: number;

  // Clone support (issue #173)
  readonly cloneOptions: () => Options;
  readonly cloneDependencies: () => Record<string, unknown>;
  readonly getLifecycleFactories: () => [
    Record<string, GuardFnFactory<D>>,
    Record<string, GuardFnFactory<D>>,
  ];
  readonly getPluginFactories: () => PluginFactory<D>[];

  // Consolidated route data store (issue #174 Phase 2)
  readonly routeGetStore: () => RoutesStore<D>;

  // Cross-namespace state (issue #174)
  readonly getStateName: () => string | undefined;
  readonly isTransitioning: () => boolean;
  readonly clearState: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- existential type: stores RouterInternals for all Dependencies types
const internals = new WeakMap<object, RouterInternals<any>>();

export function getInternals<D extends DefaultDependencies>(
  router: Router<D>,
): RouterInternals<D> {
  const ctx = internals.get(router);

  if (!ctx) {
    throw new TypeError(
      "[real-router] Invalid router instance — not found in internals registry",
    );
  }

  return ctx as RouterInternals<D>;
}

export function registerInternals<D extends DefaultDependencies>(
  router: Router<D>,
  ctx: RouterInternals<D>,
): void {
  internals.set(router, ctx);
}
