// packages/route-node/tests/__mocks__/route-tree-mock.ts

/**
 * Mock factories for RouteTree interface.
 *
 * These mocks satisfy the RouteTree interface for testing purposes
 * without depending on the actual createRouteTree implementation.
 */

import type { RouteTree } from "route-tree";

/**
 * Route definition for building mock trees.
 */
export interface MockRouteDefinition {
  name: string;
  path: string;
  children?: MockRouteDefinition[];
}

/**
 * Internal mutable node for building before freezing.
 */
interface MutableRouteTree {
  name: string;
  path: string;
  absolute: boolean;
  children: Map<string, MutableRouteTree>;
  parent: MutableRouteTree | null;
  nonAbsoluteChildren: MutableRouteTree[];
  fullName: string;
  paramMeta: {
    urlParams: string[];
    queryParams: string[];
    spatParams: string[];
  };
  paramTypeMap: Record<string, "url" | "query">;
}

/**
 * Creates a mock RouteTree for testing.
 *
 * @param name - Route name (empty string for root)
 * @param path - Route path
 * @param childDefs - Optional child route definitions
 * @returns Mock RouteTree instance
 *
 * @example
 * ```typescript
 * // Create a simple parent node
 * const parentNode = createMockRouteTree("parent", "/parent");
 *
 * // Create a root with children
 * const rootNode = createMockRouteTree("", "", [
 *   { name: "users", path: "/users" },
 *   { name: "admin", path: "/admin", children: [
 *     { name: "settings", path: "/settings" }
 *   ]}
 * ]);
 * ```
 */
export function createMockRouteTree(
  name: string,
  path: string,
  childDefs: MockRouteDefinition[] = [],
): RouteTree {
  const hasUrlParams = path.includes(":");
  const hasQueryParams = path.includes("?");

  // Build paramMeta and paramTypeMap
  const paramMeta = {
    urlParams: hasUrlParams ? ["id"] : [],
    queryParams: hasQueryParams ? ["q"] : [],
    spatParams: [],
  };

  const paramTypeMap: Record<string, "url" | "query"> = {};

  for (const param of paramMeta.urlParams) {
    paramTypeMap[param] = "url";
  }
  for (const param of paramMeta.queryParams) {
    paramTypeMap[param] = "query";
  }

  const root: MutableRouteTree = {
    name,
    path,
    absolute: path.startsWith("~"),
    children: new Map(),
    parent: null,
    nonAbsoluteChildren: [],
    fullName: name,
    paramMeta,
    paramTypeMap,
  };

  // Build children recursively
  function buildTree(
    parent: MutableRouteTree,
    defs: MockRouteDefinition[],
    parentFullName: string,
  ): void {
    for (const def of defs) {
      const fullName = parentFullName
        ? `${parentFullName}.${def.name}`
        : def.name;
      const childHasUrlParams = def.path.includes(":");
      const childHasQueryParams = def.path.includes("?");
      const isAbsolute = def.path.startsWith("~");

      const childParamMeta = {
        urlParams: childHasUrlParams ? ["id"] : [],
        queryParams: childHasQueryParams ? ["q"] : [],
        spatParams: [],
      };

      const childParamTypeMap: Record<string, "url" | "query"> = {};

      for (const param of childParamMeta.urlParams) {
        childParamTypeMap[param] = "url";
      }
      for (const param of childParamMeta.queryParams) {
        childParamTypeMap[param] = "query";
      }

      const child: MutableRouteTree = {
        name: def.name,
        path: def.path,
        absolute: isAbsolute,
        children: new Map(),
        parent,
        nonAbsoluteChildren: [],
        fullName,
        paramMeta: childParamMeta,
        paramTypeMap: childParamTypeMap,
      };

      parent.children.set(def.name, child);

      if (!isAbsolute) {
        parent.nonAbsoluteChildren.push(child);
      }

      // Recursively build nested children
      if (def.children) {
        buildTree(child, def.children, fullName);
      }
    }
  }

  buildTree(root, childDefs, name);

  return root as unknown as RouteTree;
}

/**
 * Creates a mock RouteTree with parameterized path.
 * Shorthand for testing absolute path validation under parameterized parents.
 *
 * @param name - Route name
 * @param path - Route path (should contain :param)
 * @returns Mock RouteTree with urlParams populated
 *
 * @example
 * ```typescript
 * const parentWithParams = createMockParameterizedTreeData("parent", "/users/:userId");
 * validateRoutePath("~/absolute", routeName, methodName, parentWithParams);
 * // → throws "Absolute path cannot be used under parent route with URL parameters"
 * ```
 */
export function createMockParameterizedTreeData(
  name: string,
  path: string,
): RouteTree {
  return createMockRouteTree(name, path);
}

// Backwards compatibility aliases
export const createMockRouteNode = createMockRouteTree;

export const createMockParameterizedNode = createMockParameterizedTreeData;
