// packages/search-schema-plugin/src/helpers.ts

import type { StandardSchemaV1Issue } from "./types";
import type { Params } from "@real-router/core";

/**
 * Extract top-level keys from validation issues.
 * Only processes issues with a non-empty path — issues without path
 * affect the whole object and can't be stripped by key.
 */
export function getInvalidKeys(
  issues: readonly StandardSchemaV1Issue[],
): Set<string> {
  const keys = new Set<string>();

  for (const issue of issues) {
    if (!(issue.path && issue.path.length > 0)) {
      continue;
    }

    const segment = issue.path[0];
    const key =
      typeof segment === "object" && "key" in segment ? segment.key : segment;

    keys.add(String(key));
  }

  return keys;
}

/** Create a shallow copy of params without the specified keys. */
export function omitKeys(params: Params, keys: Set<string>): Params {
  const result: Params = {};

  for (const [key, value] of Object.entries(params)) {
    if (!keys.has(key)) {
      result[key] = value;
    }
  }

  return result;
}
