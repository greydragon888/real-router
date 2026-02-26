// packages/core/src/namespaces/RoutesNamespace/routesStore.ts

import { nodeToDefinition } from "route-tree";

import { createEmptyConfig, sanitizeRoute } from "./helpers";
import {
  cacheForwardMap,
  commitTreeChanges,
  rebuildTree,
  rebuildTreeInPlace,
  refreshForwardMap,
  registerAllRouteHandlers,
  validateAndCacheForwardMap,
} from "./routeTreeOps";
import { validateRoutes } from "./validators";

import type { RouteConfig, RoutesDependencies } from "./types";
import type { GuardFnFactory, Route } from "../../types";
import type { RouteLifecycleNamespace } from "../RouteLifecycleNamespace";
import type { DefaultDependencies } from "@real-router/types";
import type {
  CreateMatcherOptions,
  Matcher,
  RouteDefinition,
  RouteTree,
} from "route-tree";

export interface RoutesStoreOps<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly commitTreeChanges: (
    store: RoutesStore<Dependencies>,
    noValidate: boolean,
  ) => void;
  readonly rebuildTreeInPlace: (store: RoutesStore<Dependencies>) => void;
  readonly refreshForwardMap: (
    config: RouteConfig,
    noValidate: boolean,
  ) => Record<string, string>;
  readonly registerAllRouteHandlers: (
    routes: readonly Route<Dependencies>[],
    config: RouteConfig,
    routeCustomFields: Record<string, Record<string, unknown>>,
    pendingCanActivate: Map<string, GuardFnFactory<Dependencies>>,
    pendingCanDeactivate: Map<string, GuardFnFactory<Dependencies>>,
    depsStore: RoutesDependencies<Dependencies> | undefined,
    parentName: string,
  ) => void;
  readonly nodeToDefinition: (node: RouteTree) => RouteDefinition;
  readonly validateRoutes: (
    routes: Route<Dependencies>[],
    tree?: RouteTree,
    forwardMap?: Record<string, string>,
    parentName?: string,
  ) => void;
}

export interface RoutesStore<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly definitions: RouteDefinition[];
  readonly config: RouteConfig;
  tree: RouteTree;
  matcher: Matcher;
  resolvedForwardMap: Record<string, string>;
  routeCustomFields: Record<string, Record<string, unknown>>;
  rootPath: string;
  readonly matcherOptions: CreateMatcherOptions | undefined;
  depsStore: RoutesDependencies<Dependencies> | undefined;
  lifecycleNamespace: RouteLifecycleNamespace<Dependencies> | undefined;
  readonly pendingCanActivate: Map<string, GuardFnFactory<Dependencies>>;
  readonly pendingCanDeactivate: Map<string, GuardFnFactory<Dependencies>>;
  readonly ops: RoutesStoreOps<Dependencies>;
}

export function createRoutesStore<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  routes: Route<Dependencies>[],
  noValidate: boolean,
  matcherOptions?: CreateMatcherOptions,
): RoutesStore<Dependencies> {
  const definitions: RouteDefinition[] = [];
  const config: RouteConfig = createEmptyConfig();
  const routeCustomFields: Record<
    string,
    Record<string, unknown>
  > = Object.create(null) as Record<string, Record<string, unknown>>;
  const pendingCanActivate = new Map<string, GuardFnFactory<Dependencies>>();
  const pendingCanDeactivate = new Map<string, GuardFnFactory<Dependencies>>();

  for (const route of routes) {
    definitions.push(sanitizeRoute(route));
  }

  const { tree, matcher } = rebuildTree(definitions, "", matcherOptions);

  registerAllRouteHandlers(
    routes,
    config,
    routeCustomFields,
    pendingCanActivate,
    pendingCanDeactivate,
    undefined,
    "",
  );

  const resolvedForwardMap: Record<string, string> = noValidate
    ? cacheForwardMap(config)
    : validateAndCacheForwardMap(config);

  return {
    definitions,
    config,
    tree,
    matcher,
    resolvedForwardMap,
    routeCustomFields,
    rootPath: "",
    matcherOptions,
    depsStore: undefined,
    lifecycleNamespace: undefined,
    pendingCanActivate,
    pendingCanDeactivate,
    ops: {
      commitTreeChanges,
      rebuildTreeInPlace,
      refreshForwardMap,
      registerAllRouteHandlers,
      nodeToDefinition,
      validateRoutes,
    },
  };
}
