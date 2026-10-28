// packages/search-schema-plugin/src/helpers.ts

import { putField } from "@real-router/core/utils";

import type { StandardSchemaV1Issue } from "./types";
import type { Params, RouteTree } from "@real-router/core";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectEntries = Object.entries;
const hasOwn = Object.hasOwn;

/** Shared empty set — a route with no path params is the common case. */
const NO_PATH_PARAMS: ReadonlySet<string> = new Set();

type Path = NonNullable<StandardSchemaV1Issue["path"]>;

type PathSegment = Path[number];

/** A path segment's key: Standard Schema allows the key itself or a `{ key }` segment. */
export function segmentKey(segment: PathSegment): PropertyKey {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- a `null` or keyless segment is outside the spec, and read as itself rather than thrown on
  return typeof segment === "object" && segment !== null && "key" in segment
    ? segment.key
    : segment;
}

/**
 * The top-level key an issue names, or `undefined` for an issue without a path —
 * one about the whole object, which no key can be stripped for.
 */
export function issueKey(issue: StandardSchemaV1Issue): string | undefined {
  return issue.path && issue.path.length > 0
    ? String(segmentKey(issue.path[0]))
    : undefined;
}

/** An issue that names a key, so its path is not empty. */
export type KeyedIssue = StandardSchemaV1Issue & { readonly path: Path };

/**
 * Whether `issue` names one of `keys`. `key !== undefined` is there for the
 * type: no set of keys holds `undefined`, the key of an issue without a path.
 */
export function namesOneOf(
  issue: StandardSchemaV1Issue,
  keys: ReadonlySet<string>,
): issue is KeyedIssue {
  const key = issueKey(issue);

  return key !== undefined && keys.has(key);
}

/** Extract the top-level keys that validation issues name. */
export function getInvalidKeys(
  issues: readonly StandardSchemaV1Issue[],
): Set<string> {
  const keys = new Set<string>();

  for (const issue of issues) {
    const key = issueKey(issue);

    if (key !== undefined) {
      keys.add(key);
    }
  }

  return keys;
}

/** The two types the router decodes from text, and that print back as it. */
export function isNumberOrBoolean(value: unknown): value is number | boolean {
  return typeof value === "number" || typeof value === "boolean";
}

/**
 * The number or boolean `path` points at in `params` — a key's own value, or an
 * element of the array the key holds — and its text. `undefined` for any other
 * path or value.
 */
function textAt(
  params: Params,
  path: Path | undefined,
):
  | { readonly key: string; readonly index?: number; readonly text: string }
  | undefined {
  if (path?.length !== 1 && path?.length !== 2) {
    return undefined;
  }

  const key = String(segmentKey(path[0]));
  const value: unknown = hasOwn(params, key) ? params[key] : undefined;

  if (path.length === 1) {
    return isNumberOrBoolean(value) ? { key, text: String(value) } : undefined;
  }

  const index = segmentKey(path[1]);

  if (!Array.isArray(value) || typeof index !== "number") {
    return undefined;
  }

  // Read without an own-index check: the copy `readAsText` maps reads an index
  // only `Array.prototype` defines all the same.
  const element: unknown = value[index];

  return isNumberOrBoolean(element)
    ? { key, index, text: String(element) }
    : undefined;
}

/** The values turned into text: per key, `undefined` for its own value and the index of each element. */
export type TextPlaces = Map<string, Set<number | undefined>>;

/**
 * `params` with each number or boolean an issue names — a key's own value, or
 * an element of the array a key holds — replaced by its text, `String(value)`.
 * A value is replaced only where `decoded` holds a number or a boolean too,
 * and once: one already in `done` is skipped, and each value replaced is added
 * to it. `undefined` when no issue names a value to replace.
 */
export function readAsText(
  decoded: Params,
  params: Params,
  issues: readonly StandardSchemaV1Issue[],
  done: TextPlaces,
): Params | undefined {
  // Per key, the text of its own value, at `undefined`, or of each element.
  const texts = new Map<string, Map<number | undefined, string>>();

  for (const issue of issues) {
    const at = textAt(params, issue.path);

    if (
      at === undefined ||
      done.get(at.key)?.has(at.index) === true ||
      textAt(decoded, issue.path) === undefined
    ) {
      continue;
    }

    texts.set(
      at.key,
      (texts.get(at.key) ?? new Map<number | undefined, string>()).set(
        at.index,
        at.text,
      ),
    );
  }

  if (texts.size === 0) {
    return undefined;
  }

  const input: Params = { ...params };

  for (const [key, text] of texts) {
    const places = done.get(key) ?? new Set<number | undefined>();

    for (const place of text.keys()) {
      places.add(place);
    }

    done.set(key, places);
    putField(
      input,
      key,
      (text.has(undefined)
        ? text.get(undefined)
        : (params[key] as readonly unknown[]).map(
            (element, index) => text.get(index) ?? element,
          )) as Params[string],
    );
  }

  return input;
}

/** Create a shallow copy of params without the specified keys. */
export function omitKeys(params: Params, keys: ReadonlySet<string>): Params {
  const result: Params = {};

  for (const [key, value] of objectEntries(params)) {
    if (!keys.has(key)) {
      // Keys are the caller's (#1852); this is the first site a non-path key
      // reaches, so it is where the whole class surfaced for this plugin.
      putField(result, key, value);
    }
  }

  return result;
}

/** Create a shallow copy of params with only the specified keys. */
export function pickKeys(params: Params, keys: ReadonlySet<string>): Params {
  const result: Params = {};

  for (const [key, value] of objectEntries(params)) {
    if (keys.has(key)) {
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
