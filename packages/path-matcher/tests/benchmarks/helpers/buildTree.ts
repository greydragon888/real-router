/**
 * Lightweight tree builder for path-matcher benchmarks.
 *
 * Constructs MatcherInputNode objects from simple route definitions
 * using path-matcher's own buildParamMeta. Avoids circular dependency
 * on route-tree (which depends on path-matcher at runtime).
 */

import { buildParamMeta, SegmentMatcher } from "../../../src";

import type { MatcherInputNode, SegmentMatcherOptions } from "../../../src";

export interface SimpleRoute {
  name: string;
  path: string;
  children?: SimpleRoute[];
}

function buildNode(
  route: SimpleRoute,
  parentFullName: string,
): MatcherInputNode {
  const fullName = parentFullName
    ? `${parentFullName}.${route.name}`
    : route.name;
  const path = route.path;
  const absolute = path.startsWith("~");
  const normalizedPath = absolute ? path.slice(1) : path;
  const paramMeta = buildParamMeta(normalizedPath);

  const childNodes: MatcherInputNode[] = [];
  const nonAbsoluteChildren: MatcherInputNode[] = [];

  if (route.children) {
    for (const child of route.children) {
      const childNode = buildNode(child, fullName);

      childNodes.push(childNode);

      if (!childNode.absolute) {
        nonAbsoluteChildren.push(childNode);
      }
    }
  }

  const childrenMap = new Map<string, MatcherInputNode>();

  for (const child of childNodes) {
    childrenMap.set(child.name, child);
  }

  return {
    name: route.name,
    path: normalizedPath,
    fullName,
    absolute,
    children: childrenMap,
    nonAbsoluteChildren,
    paramMeta,
    paramTypeMap: paramMeta.paramTypeMap,
    staticPath: null,
  };
}

export function buildTree(routes: SimpleRoute[]): MatcherInputNode {
  const root: MatcherInputNode = {
    name: "",
    path: "",
    fullName: "",
    absolute: false,
    children: new Map(),
    nonAbsoluteChildren: [],
    paramMeta: buildParamMeta(""),
    paramTypeMap: {},
    staticPath: null,
  };

  const childNodes: MatcherInputNode[] = [];
  const nonAbsoluteChildren: MatcherInputNode[] = [];

  for (const route of routes) {
    const node = buildNode(route, "");

    childNodes.push(node);

    if (!node.absolute) {
      nonAbsoluteChildren.push(node);
    }
  }

  const childrenMap = new Map<string, MatcherInputNode>();

  for (const child of childNodes) {
    childrenMap.set(child.name, child);
  }

  return {
    ...root,
    children: childrenMap,
    nonAbsoluteChildren,
  };
}

export function createMatcher(
  routes: SimpleRoute[],
  options?: SegmentMatcherOptions,
): SegmentMatcher {
  const tree = buildTree(routes);
  const matcher = new SegmentMatcher(options);

  matcher.registerTree(tree);

  return matcher;
}
