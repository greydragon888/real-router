// packages/core/src/namespaces/RoutesNamespace/routesStore.ts

import { createEmptyConfig, sanitizeRoute } from "./helpers";
import {
  cacheForwardMap,
  rebuildTree,
  registerAllRouteHandlers,
  validateAndCacheForwardMap,
} from "./routeTreeOps";

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
  };
}
