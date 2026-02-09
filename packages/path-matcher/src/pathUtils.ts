import type { SegmentNode } from "./types";

export function createSegmentNode(): SegmentNode {
  return {
    staticChildren: Object.create(null) as Record<string, SegmentNode>,
    paramChild: undefined,
    splatChild: undefined,
    route: undefined,
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
  if (parentPath === "") {
    return nodePath;
  }

  if (nodePath === "") {
    return parentPath;
  }

  return parentPath + nodePath;
}
