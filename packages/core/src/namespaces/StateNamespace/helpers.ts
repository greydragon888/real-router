// packages/core/src/namespaces/StateNamespace/helpers.ts

import type { RouteTreeStateMeta } from "route-tree";

/**
 * Extracts URL param names from RouteTreeStateMeta.
 * This is an O(segments × params) operation but avoids tree traversal.
 */
export function getUrlParamsFromMeta(meta: RouteTreeStateMeta): string[] {
  const urlParams: string[] = [];

  for (const segmentName in meta) {
    const paramMap = meta[segmentName];

    for (const param in paramMap) {
      if (paramMap[param] === "url") {
        urlParams.push(param);
      }
    }
  }

  return urlParams;
}

/**
 * Compares two parameter values for equality.
 * Supports deep equality for arrays (common in route params like tags, ids).
 */
export function areParamValuesEqual(val1: unknown, val2: unknown): boolean {
  if (val1 === val2) {
    return true;
  }

  if (Array.isArray(val1) && Array.isArray(val2)) {
    if (val1.length !== val2.length) {
      return false;
    }

    return val1.every((v, i) => areParamValuesEqual(v, val2[i]));
  }

  return false;
}
