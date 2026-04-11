import type { DependenciesStore } from "./namespaces/DependenciesNamespace";
import type { RoutesStore } from "./namespaces/RoutesNamespace";
import type { Router as RouterClass } from "./Router";
import type { EventMethodMap, GuardFnFactory, PluginFactory } from "./types";
import type { RouterValidator } from "./types/RouterValidator";
import type {
  DefaultDependencies,
  EventName,
  Options,
  Params,
  Plugin,
  Router as RouterInterface,
  RouteTreeState,
  SimpleState,
  State,
  Unsubscribe,
} from "@real-router/types";
import type { RouteTree } from "route-tree";

export interface RouterInternals<
  D extends DefaultDependencies = DefaultDependencies,
> {
  readonly makeState: <P extends Params = Params>(
    name: string,
    params?: P,
    path?: string,
    meta?: Record<string, Record<string, "url" | "query">>,
  ) => State<P>;

  readonly forwardState: <P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ) => SimpleState<P>;

  readonly buildStateResolved: (
    resolvedName: string,
    resolvedParams: Params,
  ) => RouteTreeState | undefined;

  readonly matchPath: <P extends Params = Params>(
    path: string,
    options?: Options,
  ) => State<P> | undefined;

  readonly getOptions: () => Options;

  readonly addEventListener: <E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ) => Unsubscribe;

  readonly buildPath: (route: string, params?: Params) => string;

  readonly start: (path: string) => Promise<State>;

  /* eslint-disable @typescript-eslint/no-explicit-any -- heterogeneous map: stores different InterceptorFn<M> types under different keys */
  readonly interceptors: Map<
    string,
    ((next: (...args: any[]) => any, ...args: any[]) => any)[]
  >;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  readonly setRootPath: (rootPath: string) => void;
  readonly getRootPath: () => string;

  readonly getTree: () => RouteTree;

  readonly isDisposed: () => boolean;

  validator: RouterValidator | null;

  // Dependencies (issue #172)
  readonly dependenciesGetStore: () => DependenciesStore<D>;

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
  readonly setState: (state: State) => void;
  readonly routerExtensions: { keys: string[] }[];
  readonly contextClaimRecords: Set<string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- existential type: stores RouterInternals for all Dependencies types
const internals = new WeakMap<object, RouterInternals<any>>();

export function getInternals<D extends DefaultDependencies>(
  router: RouterInterface<D>,
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
  router: RouterClass<D>,
  ctx: RouterInternals<D>,
): void {
  internals.set(router, ctx);
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- internal chain execution: type safety enforced at public API boundary (PluginApi.addInterceptor) */
function executeInterceptorChain<T>(
  interceptors: ((next: (...args: any[]) => any, ...args: any[]) => any)[],
  original: (...args: any[]) => T,
  args: any[],
): T {
  let chain = original as (...args: any[]) => any;

  for (const interceptor of interceptors) {
    const prev = chain;

    chain = (...chainArgs: any[]) => interceptor(prev, ...chainArgs);
  }

  return chain(...args) as T;
}

export function createInterceptable<T extends (...args: any[]) => any>(
  name: string,
  original: T,
  interceptors: Map<
    string,
    ((next: (...args: any[]) => any, ...args: any[]) => any)[]
  >,
): T {
  return ((...args: any[]) => {
    const chain = interceptors.get(name);

    if (!chain || chain.length === 0) {
      return original(...args);
    }

    return executeInterceptorChain(chain, original, args);
  }) as T;
}

export function createInterceptable2<A, B, R>(
  name: string,
  original: (a: A, b: B) => R,
  interceptors: Map<
    string,
    ((next: (...args: any[]) => any, ...args: any[]) => any)[]
  >,
): (a: A, b: B) => R {
  return (arg1: A, arg2: B) => {
    const chain = interceptors.get(name);

    if (!chain || chain.length === 0) {
      return original(arg1, arg2);
    }

    return executeInterceptorChain(chain, original, [arg1, arg2]);
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
