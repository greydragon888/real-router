// packages/core/src/namespaces/RoutesNamespace/RoutesNamespace.ts

import { isString, validateRouteName } from "type-guards";

import { DEFAULT_ROUTE_NAME, validatedRouteNames } from "./constants";
import { paramsMatch, paramsMatchExcluding } from "./helpers";
import {
  createRoutesStore,
  rebuildTreeInPlace,
  resetStore,
} from "./routesStore";
import { constants } from "../../constants";
import { getTransitionPath } from "../../transitionPath";

import type { RoutesStore } from "./routesStore";
import type { RoutesDependencies } from "./types";
import type { BuildStateResultWithSegments, Route } from "../../types";
import type { RouteLifecycleNamespace } from "../RouteLifecycleNamespace";
import type {
  DefaultDependencies,
  ForwardToCallback,
  Options,
  Params,
  State,
} from "@real-router/types";
import type {
  CreateMatcherOptions,
  RouteParams,
  RouteTree,
  RouteTreeState,
} from "route-tree";

function collectUrlParamsArray(segments: readonly RouteTree[]): string[] {
  const params: string[] = [];

  for (const segment of segments) {
    for (const param of segment.paramMeta.urlParams) {
      params.push(param);
    }
  }

  return params;
}

export function buildNameFromSegments(
  segments: readonly { fullName: string }[],
): string {
  return segments.at(-1)?.fullName ?? "";
}

export function createRouteState<P extends RouteParams = RouteParams>(
  matchResult: {
    readonly segments: readonly { fullName: string }[];
    readonly params: Readonly<Record<string, unknown>>;
    readonly meta: Readonly<Record<string, Record<string, "url" | "query">>>;
  },
  name?: string,
): RouteTreeState<P> {
  const resolvedName = name ?? buildNameFromSegments(matchResult.segments);

  return {
    name: resolvedName,
    params: matchResult.params as P,
    meta: matchResult.meta as Record<string, Record<string, "url" | "query">>,
  };
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

  get #deps(): RoutesDependencies<Dependencies> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.#store.depsStore!;
  }

  constructor(
    routes: Route<Dependencies>[] = [],
    noValidate = false,
    matcherOptions?: CreateMatcherOptions,
  ) {
    this.#store = createRoutesStore(routes, noValidate, matcherOptions);
  }

  /**
   * Creates a predicate function to check if a route node should be updated.
   * Note: Argument validation is done by facade (Router.ts) via validateShouldUpdateNodeArgs.
   */
  static shouldUpdateNode(
    nodeName: string,
  ): (toState: State, fromState?: State) => boolean {
    return (toState: State, fromState?: State): boolean => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!(toState && typeof toState === "object" && "name" in toState)) {
        throw new TypeError(
          "[router.shouldUpdateNode] toState must be valid State object",
        );
      }

      if (toState.transition?.reload) {
        return true;
      }

      if (nodeName === DEFAULT_ROUTE_NAME && !fromState) {
        return true;
      }

      const { intersection, toActivate, toDeactivate } = getTransitionPath(
        toState,
        fromState,
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
   * Sets dependencies and registers pending canActivate handlers.
   * canActivate handlers from initial routes are deferred until deps are set.
   */
  setDependencies(deps: RoutesDependencies<Dependencies>): void {
    this.#store.depsStore = deps;

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
    this.#store.rootPath = newRootPath;
    rebuildTreeInPlace(this.#store);
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
   * @param options - Router options
   */
  buildPath(route: string, params?: Params, options?: Options): string {
    if (route === constants.UNKNOWN_ROUTE) {
      return isString(params?.path) ? params.path : "";
    }

    const paramsWithDefault = Object.hasOwn(
      this.#store.config.defaultParams,
      route,
    )
      ? { ...this.#store.config.defaultParams[route], ...params }
      : (params ?? {});

    const encodedParams =
      typeof this.#store.config.encoders[route] === "function"
        ? this.#store.config.encoders[route]({ ...paramsWithDefault })
        : paramsWithDefault;

    const ts = options?.trailingSlash;
    const trailingSlash = ts === "never" || ts === "always" ? ts : undefined;

    return this.#store.matcher.buildPath(route, encodedParams, {
      trailingSlash,
      queryParamsMode: options?.queryParamsMode,
    });
  }

  /**
   * Matches a URL path to a route in the tree.
   * Note: Argument validation is done by facade (Router.ts) via validateMatchPathArgs.
   */
  matchPath<P extends Params = Params, MP extends Params = Params>(
    path: string,
    options?: Options,
  ): State<P, MP> | undefined {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Router.ts always passes options
    const opts = options!;

    const matchResult = this.#store.matcher.match(path);

    if (!matchResult) {
      return undefined;
    }

    const routeState = createRouteState(matchResult);
    const { name, params, meta } = routeState;

    const decodedParams =
      typeof this.#store.config.decoders[name] === "function"
        ? this.#store.config.decoders[name](params as Params)
        : params;

    const { name: routeName, params: routeParams } = this.#deps.forwardState<P>(
      name,
      decodedParams as P,
    );

    let builtPath = path;

    if (opts.rewritePathOnMatch) {
      const buildParams =
        typeof this.#store.config.encoders[routeName] === "function"
          ? this.#store.config.encoders[routeName]({
              ...(routeParams as Params),
            })
          : (routeParams as Record<string, unknown>);

      const ts = opts.trailingSlash;

      builtPath = this.#store.matcher.buildPath(routeName, buildParams, {
        trailingSlash: ts === "never" || ts === "always" ? ts : undefined,
        queryParamsMode: opts.queryParamsMode,
      });
    }

    return this.#deps.makeState<P, MP>(routeName, routeParams, builtPath, {
      params: meta as MP,
    });
  }

  /**
   * Applies forwardTo and returns resolved state with merged defaultParams.
   *
   * Merges params in order:
   * 1. Source route defaultParams
   * 2. Provided params
   * 3. Target route defaultParams (after resolving forwardTo)
   */
  forwardState<P extends Params = Params>(
    name: string,
    params: P,
  ): { name: string; params: P } {
    if (Object.hasOwn(this.#store.config.forwardFnMap, name)) {
      const paramsWithSourceDefaults = this.#mergeDefaultParams(name, params);
      const dynamicForward = this.#store.config.forwardFnMap[name];
      const resolved = this.#resolveDynamicForward(
        name,
        dynamicForward,
        params,
      );

      return {
        name: resolved,
        params: this.#mergeDefaultParams(resolved, paramsWithSourceDefaults),
      };
    }

    const staticForward = this.#store.resolvedForwardMap[name] ?? name;

    if (
      staticForward !== name &&
      Object.hasOwn(this.#store.config.forwardFnMap, staticForward)
    ) {
      const paramsWithSourceDefaults = this.#mergeDefaultParams(name, params);
      const targetDynamicForward =
        this.#store.config.forwardFnMap[staticForward];
      const resolved = this.#resolveDynamicForward(
        staticForward,
        targetDynamicForward,
        params,
      );

      return {
        name: resolved,
        params: this.#mergeDefaultParams(resolved, paramsWithSourceDefaults),
      };
    }

    if (staticForward !== name) {
      const paramsWithSourceDefaults = this.#mergeDefaultParams(name, params);

      return {
        name: staticForward,
        params: this.#mergeDefaultParams(
          staticForward,
          paramsWithSourceDefaults,
        ),
      };
    }

    return { name, params: this.#mergeDefaultParams(name, params) };
  }

  /**
   * Builds a RouteTreeState from already-resolved route name and params.
   * Called by Router.buildState after forwardState is applied at facade level.
   * This allows plugins to intercept forwardState.
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
      { segments, params: resolvedParams, meta },
      resolvedName,
    );
  }

  buildStateWithSegmentsResolved<P extends Params = Params>(
    resolvedName: string,
    resolvedParams: P,
  ): BuildStateResultWithSegments<P> | undefined {
    const segments = this.#store.matcher.getSegmentsByName(resolvedName);

    if (!segments) {
      return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const meta = this.#store.matcher.getMetaByName(resolvedName)!;
    const state = createRouteState<P>(
      {
        segments: segments as readonly RouteTree[],
        params: resolvedParams,
        meta,
      },
      resolvedName,
    );

    return { state, segments: segments as readonly RouteTree[] };
  }

  // =========================================================================
  // Query operations
  // =========================================================================

  /**
   * Checks if a route is currently active.
   */
  isActiveRoute(
    name: string,
    params: Params = {},
    strictEquality = false,
    ignoreQueryParams = true,
  ): boolean {
    // Fast path: skip regex validation for already-validated route names
    if (!validatedRouteNames.has(name)) {
      validateRouteName(name, "isActiveRoute");
      validatedRouteNames.add(name);
    }

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

    const defaultParams = this.#store.config.defaultParams[name] as
      | Params
      | undefined;

    // Exact match case
    if (strictEquality || activeName === name) {
      const effectiveParams = defaultParams
        ? { ...defaultParams, ...params }
        : params;

      const targetState: State = {
        name,
        params: effectiveParams,
        path: "",
      };

      return this.#deps.areStatesEqual(
        targetState,
        activeState,
        ignoreQueryParams,
      );
    }

    // Hierarchical check: activeState is a descendant of target (name)
    const activeParams = activeState.params;

    if (!paramsMatch(params, activeParams)) {
      return false;
    }

    // Check defaultParams (skip keys already in params)
    return (
      !defaultParams ||
      paramsMatchExcluding(defaultParams, activeParams, params)
    );
  }

  getUrlParams(name: string): string[] {
    const segments = this.#store.matcher.getSegmentsByName(name);

    if (!segments) {
      return [];
    }

    return collectUrlParamsArray(segments as readonly RouteTree[]);
  }

  getStore(): RoutesStore<Dependencies> {
    return this.#store;
  }

  #mergeDefaultParams<P extends Params = Params>(
    routeName: string,
    params: P,
  ): P {
    if (Object.hasOwn(this.#store.config.defaultParams, routeName)) {
      return {
        ...this.#store.config.defaultParams[routeName],
        ...params,
      } as P;
    }

    return params;
  }

  #resolveDynamicForward(
    startName: string,
    startFn: ForwardToCallback<Dependencies>,
    params: Params,
  ): string {
    const visited = new Set<string>([startName]);

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
        const chain = [...visited, current].join(" → ");

        throw new Error(`Circular forwardTo detected: ${chain}`);
      }

      visited.add(current);

      if (Object.hasOwn(this.#store.config.forwardFnMap, current)) {
        const fn = this.#store.config.forwardFnMap[
          current
        ] as ForwardToCallback<Dependencies>;

        current = fn(this.#deps.getDependency, params);

        depth++;
        continue;
      }

      const staticForward = this.#store.config.forwardMap[current];

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (staticForward !== undefined) {
        current = staticForward;
        depth++;
        continue;
      }

      return current;
    }

    throw new Error(`forwardTo exceeds maximum depth of ${MAX_DEPTH}`);
  }
}
