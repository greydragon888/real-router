// packages/route-node/tests/__mocks__/route-tree-mock.ts

/**
 * Mock factories for RouteTree interface.
 *
 * These mocks satisfy the RouteTree interface for testing purposes
 * without depending on the actual createRouteTree implementation.
 */

import type { RouteTree } from "route-tree";

/**
 * Minimal PathParser interface for mocking.
 */
interface PathParser {
  readonly path: string;
  readonly urlParams: string[];
  readonly queryParams: string[];
  readonly spatParams: string[];
  readonly hasUrlParams: boolean;
  readonly hasSpatParam: boolean;
  readonly hasMatrixParams: boolean;
  readonly hasQueryParams: boolean;
  build: (
    params?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => string;
  test: (
    path: string,
    options?: Record<string, unknown>,
  ) => Record<string, unknown> | null;
  partialTest: (
    path: string,
    options?: Record<string, unknown>,
  ) => Record<string, unknown> | null;
}

/**
 * Route definition for building mock trees.
 */
export interface MockRouteDefinition {
  name: string;
  path: string;
  children?: MockRouteDefinition[];
}

/**
 * Creates a minimal mock parser.
 */
function createMockParser(
  path: string,
  hasUrlParams = false,
): PathParser | null {
  if (path === "") {
    return null;
  }

  return {
    path,
    urlParams: hasUrlParams ? ["id"] : [],
    queryParams: [],
    spatParams: [],
    hasUrlParams,
    hasSpatParam: false,
    hasMatrixParams: false,
    hasQueryParams: false,
    build: () => path,
    test: () => null,
    partialTest: () => null,
  };
}

/**
 * Internal mutable node for building before freezing.
 */
interface MutableRouteTree {
  name: string;
  path: string;
  absolute: boolean;
  parser: PathParser | null;
  children: MutableRouteTree[];
  parent: MutableRouteTree | null;
  nonAbsoluteChildren: MutableRouteTree[];
  absoluteDescendants: MutableRouteTree[];
  childrenByName: Map<string, MutableRouteTree>;
  parentSegments: MutableRouteTree[];
  fullName: string;
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

  const root: MutableRouteTree = {
    name,
    path,
    absolute: path.startsWith("~"),
    parser: createMockParser(path, hasUrlParams),
    children: [],
    parent: null,
    nonAbsoluteChildren: [],
    absoluteDescendants: [],
    childrenByName: new Map(),
    parentSegments: [],
    fullName: name,
  };

  // Build children recursively
  function buildTree(
    parent: MutableRouteTree,
    defs: MockRouteDefinition[],
    parentFullName: string,
    parentSegments: MutableRouteTree[],
  ): void {
    for (const def of defs) {
      const fullName = parentFullName
        ? `${parentFullName}.${def.name}`
        : def.name;
      const childHasUrlParams = def.path.includes(":");
      const isAbsolute = def.path.startsWith("~");

      const child: MutableRouteTree = {
        name: def.name,
        path: def.path,
        absolute: isAbsolute,
        parser: createMockParser(def.path, childHasUrlParams),
        children: [],
        parent,
        nonAbsoluteChildren: [],
        absoluteDescendants: [],
        childrenByName: new Map(),
        parentSegments: [...parentSegments],
        fullName,
      };

      parent.children.push(child);
      parent.childrenByName.set(def.name, child);

      if (isAbsolute) {
        // Collect absolute descendants up to root
        let current: MutableRouteTree | null = parent;

        while (current) {
          current.absoluteDescendants.push(child);
          current = current.parent;
        }
      } else {
        parent.nonAbsoluteChildren.push(child);
      }

      // Recursively build nested children
      if (def.children) {
        buildTree(child, def.children, fullName, [...parentSegments, child]);
      }
    }
  }

  buildTree(root, childDefs, name, name ? [root] : []);

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
