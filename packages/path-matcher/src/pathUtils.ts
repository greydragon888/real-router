import type { SegmentNode } from "./types";

export function createSegmentNode(): SegmentNode {
  return {
    staticChildren: Object.create(null) as Record<string, SegmentNode>,
    // Stryker disable next-line BooleanLiteral: equivalent — for a leaf splat node the `!hasChildren` fast path and the `#traverseFrom` fallback both set `params[name] = slice` and return `sn.route`; nodes that gain children overwrite this flag during registration. Proven: forcing `true` keeps the full suite green (it only un-covers the now-unreachable fast path).
    hasChildren: false,
    paramChild: undefined,
    splatChild: undefined,
    route: undefined,
    // #1153: initialized so static and param nodes share one hidden class (#1009).
    routeIsStrong: false,
    slashChildRoute: undefined,
  };
}

export function normalizeTrailingSlash(path: string): string {
  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }

  return path;
}

export function buildFullPath(parentPath: string, nodePath: string): string {
  // Stryker disable next-line StringLiteral,BlockStatement: equivalent — empty-operand fast path; `parentPath + nodePath` already yields the identical string when `parentPath === ""`, so emptying the block or never triggering it (sentinel comparand) changes no result. ConditionalExpression stays live (killable `->true` sibling).
  if (parentPath === "") {
    return nodePath;
  }

  // Stryker disable next-line StringLiteral,BlockStatement: equivalent — symmetric empty-operand fast path; `parentPath + nodePath` already equals `parentPath` when `nodePath === ""`. ConditionalExpression stays live (killable `->true` sibling).
  if (nodePath === "") {
    return parentPath;
  }

  return parentPath + nodePath;
}
