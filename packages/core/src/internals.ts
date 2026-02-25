import type { RouteConfig } from "./namespaces/RoutesNamespace";
import type { Router } from "./Router";
import type {
  EventMethodMap,
  GuardFnFactory,
  PluginFactory,
  Route,
} from "./types";
import type {
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
import type {
  CreateMatcherOptions,
  Matcher,
  RouteDefinition,
  RouteTree,
} from "route-tree";

export interface RouterInternals {
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
  readonly cloneRoutes: () => Route[];
  readonly cloneOptions: () => Options;
  readonly cloneDependencies: () => Record<string, unknown>;
  readonly getLifecycleFactories: () => [
    Record<string, GuardFnFactory>,
    Record<string, GuardFnFactory>,
  ];
  readonly getPluginFactories: () => PluginFactory[];
  readonly getRouteConfig: () => RouteConfig;
  readonly getResolvedForwardMap: () => Record<string, string>;
  readonly getRouteCustomFields: () => Record<string, Record<string, unknown>>;
  readonly applyClonedConfig: (
    config: RouteConfig,
    resolvedForwardMap: Record<string, string>,
    routeCustomFields: Record<string, Record<string, unknown>>,
  ) => void;

  // Route tree access (issue #174)
  readonly routeGetTree: () => RouteTree;
  readonly routeGetForwardRecord: () => Record<string, string>;

  // Route mutation (issue #174)
  readonly routeClearRoutes: () => void;

  // Route read (issue #174)
  readonly routeHasRoute: (name: string) => boolean;

  // Raw route data (issue #174 Phase 2 — tree-shaking)
  readonly routeDefinitions: RouteDefinition[];
  readonly routeConfig: RouteConfig;
  readonly routeMatcherOptions: CreateMatcherOptions | undefined;
  readonly routeSetCustomFields: (
    fields: Record<string, Record<string, unknown>>,
  ) => void;
  readonly routeGetMatcher: () => Matcher;
  readonly routeSetTreeAndMatcher: (tree: RouteTree, matcher: Matcher) => void;
  readonly routeReplaceResolvedForwardMap: (
    map: Record<string, string>,
  ) => void;
  readonly routeGetDepsStore: () => unknown;
  readonly routeGetPendingCanActivate: () => Map<string, unknown>;
  readonly routeGetPendingCanDeactivate: () => Map<string, unknown>;
  readonly routeGetLifecycleNamespace: () => unknown;

  // Cross-namespace state (issue #174)
  readonly getStateName: () => string | undefined;
  readonly isTransitioning: () => boolean;
  readonly clearState: () => void;
  readonly lifecycleClearAll: () => void;

  // Lifecycle guard management (issue #174)
  readonly lifecycleAddCanActivate: (
    name: string,
    handler: GuardFnFactory | boolean,
    skipValidation: boolean,
  ) => void;
  readonly lifecycleAddCanDeactivate: (
    name: string,
    handler: GuardFnFactory | boolean,
    skipValidation: boolean,
  ) => void;
  readonly lifecycleClearCanActivate: (name: string) => void;
  readonly lifecycleClearCanDeactivate: (name: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Router<any> needed to accept all generic instantiations
const internals = new WeakMap<Router<any>, RouterInternals>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Router<any> needed to accept all generic instantiations
export function getInternals(router: Router<any>): RouterInternals {
  const ctx = internals.get(router);

  if (!ctx) {
    throw new TypeError(
      "[real-router] Invalid router instance — not found in internals registry",
    );
  }

  return ctx;
}

export function registerInternals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Router<any> needed to accept all generic instantiations
  router: Router<any>,
  ctx: RouterInternals,
): void {
  internals.set(router, ctx);
}
