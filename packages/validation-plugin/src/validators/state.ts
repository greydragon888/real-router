// packages/validation-plugin/src/validators/state.ts

import { isString, isParams, getTypeDescription } from "../type-guards";

export function validateMakeStateArgs(
  name: unknown,
  params: unknown,
  path: unknown,
): void {
  if (!isString(name)) {
    throw new TypeError(
      `[router.makeState] Invalid name: ${getTypeDescription(name)}. Expected string.`,
    );
  }

  if (params !== undefined && !isParams(params)) {
    throw new TypeError(
      `[router.makeState] Invalid params: ${getTypeDescription(params)}. Expected plain object.`,
    );
  }

  if (path !== undefined && !isString(path)) {
    throw new TypeError(
      `[router.makeState] Invalid path: ${getTypeDescription(path)}. Expected string.`,
    );
  }
}

/**
 * The mode gate's opt-in diagnostic (#1575).
 *
 * Core DROPS a query key the active `queryParamsMode` will not print — always-on
 * and silent, so `state.search` can never carry what `state.path` does not show.
 * The drop is correct but invisible, and the two ways to hit it look nothing
 * alike from the outside:
 *
 * - a caller passing a key the route never declared with `?name`;
 * - a `defaultSearch` entry for such a key, which is simply DEAD CONFIG under
 *   `default` / `strict` — nothing the caller wrote is wrong, the route config
 *   just cannot take effect.
 *
 * One message covers both: core cannot tell them apart at the drop, and a guess
 * would be worse than the plain fact. Warn rather than throw — the mode is a
 * serialization option, not an error policy, and turning it into one would give
 * three behaviours for a single rule (RFC §4.7).
 *
 * De-duplicated per `route + key`: the gate runs on every navigation and every
 * `matchPath`, so an un-deduped warning would flood a dev console the moment a
 * route is revisited.
 */
const reported = new Set<string>();

export function reportDroppedQueryKey(routeName: string, key: string): void {
  const seen = `${routeName} ${key}`;

  if (reported.has(seen)) {
    return;
  }

  reported.add(seen);

  console.warn(
    `[router] Query key "${key}" is not declared on route "${routeName}" (\`?${key}\`), so the ` +
      `current \`queryParamsMode\` will not print it — it was dropped from \`state.search\` rather ` +
      `than published beside a \`state.path\` that cannot show it. Declare it on the route path, ` +
      `or use \`queryParamsMode: "loose"\` to keep undeclared keys. A \`defaultSearch\` entry for ` +
      `"${key}" is dead config in this mode for the same reason.`,
  );
}

/** Test seam: the de-dup cache is module-level and outlives a router. */
export function resetDroppedQueryKeyReports(): void {
  reported.clear();
}
