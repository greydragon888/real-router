import { getPluginApi } from "../api/getPluginApi";

import type { RouteTree } from "../engine";
import type { DefaultDependencies, Router } from "../types";

export type StaticPathEntries = Record<
  string,
  () => Promise<Record<string, string>[]>
>;

function collectLeafRouteNames(node: RouteTree, result: string[]): void {
  for (const child of node.children.values()) {
    if (child.children.size === 0) {
      result.push(child.fullName);
    } else {
      // Accumulate into the shared array rather than
      // `result.push(...getLeafRouteNames(child))`: the spread passes one
      // argument per leaf, and V8 caps spread/apply arguments (~124k on Node 24),
      // so a section with that many static leaf routes threw
      // `RangeError: Maximum call stack size exceeded`. Accumulating also drops
      // the per-subtree intermediate-array allocation.
      collectLeafRouteNames(child, result);
    }
  }
}

function getLeafRouteNames(node: RouteTree): string[] {
  const result: string[] = [];

  collectLeafRouteNames(node, result);

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
