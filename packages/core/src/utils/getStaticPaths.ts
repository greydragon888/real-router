import { getPluginApi } from "../api/getPluginApi";

import type { DefaultDependencies, Router } from "@real-router/types";
import type { RouteTree } from "route-tree";

export type StaticPathEntries = Record<
  string,
  () => Promise<Record<string, string>[]>
>;

function getLeafRouteNames(node: RouteTree): string[] {
  const result: string[] = [];

  for (const child of node.children.values()) {
    if (child.children.size === 0) {
      result.push(child.fullName);
    } else {
      result.push(...getLeafRouteNames(child));
    }
  }

  return result;
}

export async function getStaticPaths<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  router: Router<Dependencies>,
  entries?: StaticPathEntries,
): Promise<string[]> {
  const tree = getPluginApi(router).getTree();
  const leafRoutes = getLeafRouteNames(tree);
  const paths: string[] = [];

  for (const routeName of leafRoutes) {
    const entryFn = entries?.[routeName];

    if (entryFn) {
      const paramSets = await entryFn();

      for (const params of paramSets) {
        paths.push(router.buildPath(routeName, params));
      }
    } else {
      paths.push(router.buildPath(routeName, {}));
    }
  }

  return paths;
}
