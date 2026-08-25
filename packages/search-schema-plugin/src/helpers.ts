// packages/search-schema-plugin/src/helpers.ts

import { putField } from "@real-router/core/utils";

import type { StandardSchemaV1Issue } from "./types";
import type { Params, RouteTree } from "@real-router/core";

/** Shared empty set — a route with no path params is the common case. */
const NO_PATH_PARAMS: ReadonlySet<string> = new Set();

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
export function omitKeys(params: Params, keys: ReadonlySet<string>): Params {
  const result: Params = {};

  for (const [key, value] of Object.entries(params)) {
    if (!keys.has(key)) {
      // Keys are the caller's (#1852); this is the first site a non-path key
      // reaches, so it is where the whole class surfaced for this plugin.
      putField(result, key, value);
    }
  }

  return result;
}

/**
 * The names a route binds to PATH slots — its own plus every ancestor's, read
 * off the engine's own `paramMeta` (`urlParams` covers params AND splats).
 *
 * This is the complement the schema needs (#1564): a query schema governs
 * everything in the intent bag EXCEPT the path slots, and the plugin must not
 * re-derive that classification from the path string. An **absolute** node
 * (`~/…`) restarts the URL, so its ancestors' slots are not part of its path.
 *
 * Returns the shared empty set for an unknown route name — the plugin then
 * behaves as it did before this classification existed, rather than guessing.
 */
export function collectPathParams(
  root: RouteTree,
  routeName: string,
): ReadonlySet<string> {
  let keys: Set<string> | undefined;
  let node = root;

  const collect = (from: RouteTree): void => {
    for (const name of from.paramMeta.urlParams) {
      keys ??= new Set();
      keys.add(name);
    }
  };

  // The root carries `setRootPath("/:tenant")`-style slots shared by every route.
  collect(root);

  for (const segment of routeName.split(".")) {
    const child = node.children.get(segment);

    /* v8 ignore next 3 -- @preserve: defensive — the name reached here from `getRouteConfig`, so the tree always holds it (mirrors the `getTree()` guard in the plugin) */
    if (!child) {
      return NO_PATH_PARAMS;
    }

    if (child.absolute) {
      keys = undefined;
    }

    collect(child);
    node = child;
  }

  return keys ?? NO_PATH_PARAMS;
}
